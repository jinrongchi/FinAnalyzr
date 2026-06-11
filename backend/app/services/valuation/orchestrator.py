"""
Orchestrator: given a ts_code and pre-fetched data, run the full valuation pipeline
and return a ValuationResult with data source labels throughout.
"""
from __future__ import annotations

from datetime import date

import structlog

from app.core.enums import DataSource, IndustryGroup
from app.core.industry import INDUSTRY_WEIGHTS, map_industry
from app.services.ttm import TTMResult, build_annual_history, build_ttm
from app.services.valuation.engine import (
    ModelScore,
    RedFlag,
    ValuationResult,
    aggregate_score,
    cape_valuation,
    compute_beta,
    compute_erp,
    compute_red_flags,
    compute_wacc,
    dcf_valuation,
    dividend_yield,
    erp_market_bonus,
    expected_long_term_return,
    fcf_ev_yield,
    peg_valuation,
    roe_pb_valuation,
    _score_dcf_margin,
    _score_dividend_yield,
    _score_fcf_ev,
    _score_pb_discount,
    _score_peg,
    _score_percentile,
)

log = structlog.get_logger()


def run_valuation(
    ts_code: str,
    stock_name: str,
    sw_industry: str | None,
    list_date: date | None,
    is_st: bool,
    market: str | None,
    statements: list[dict],
    daily_quotes: list[dict],
    csi300_quotes: list[dict],
    macro_cn10y: list[dict],
    cpi_history: list[dict],
    dividends: list[dict],
    current_price: float | None,
    current_pb: float | None,
    current_pe_ttm: float | None,
    current_total_mv: float | None,
    total_shares: float | None,  # 万股
    manual_overrides: dict | None = None,  # field_name → value
    erp_percentile: float | None = None,
    pe_historical_median: float | None = None,
) -> ValuationResult:
    manual = manual_overrides or {}
    sources: dict[str, DataSource] = {}

    # ── Industry & basic flags ─────────────────────────────────────────────
    industry_group = map_industry(sw_industry)
    is_financial = industry_group == IndustryGroup.FINANCIAL_REAL_ESTATE
    years_listed = (
        (date.today() - list_date).days / 365.25 if list_date else 999.0
    )
    circ_mv = current_total_mv  # 万元

    # ── Build TTM & annual history ─────────────────────────────────────────
    ttm = build_ttm(statements, ts_code)
    annual_history = build_annual_history(statements, ts_code, n_years=10)

    result = ValuationResult(
        ts_code=ts_code,
        stock_name=stock_name,
        industry_group=industry_group,
        current_price=current_price,
        sources=sources,
    )

    if ttm is None:
        result.warnings.append("财务数据完全缺失，无法估值")
        result.composite_score = 0.0
        return result

    result.warnings.extend(ttm.warnings)

    # ── Macro inputs ───────────────────────────────────────────────────────
    cn10y = _latest_macro_value(macro_cn10y, "cn10y_yield")
    if cn10y is None:
        cn10y = manual.get("cn10y_yield")
        sources["cn10y_yield"] = DataSource.MANUAL if cn10y is not None else DataSource.DEFAULT
        cn10y = cn10y or 0.025
    else:
        sources["cn10y_yield"] = DataSource.AUTO

    # ── ERP market thermometer ─────────────────────────────────────────────
    csi300_pe_ttm = _latest_csi300_pe(csi300_quotes)
    erp = compute_erp(csi300_pe_ttm, cn10y)
    result.erp = erp
    result.erp_percentile = erp_percentile
    result.market_bonus = erp_market_bonus(erp, erp_percentile)

    # ── Beta & WACC ────────────────────────────────────────────────────────
    beta = _compute_stock_beta(daily_quotes, csi300_quotes)
    if beta is None:
        beta = manual.get("beta")
        sources["beta"] = DataSource.MANUAL if beta is not None else DataSource.DEFAULT
    else:
        sources["beta"] = DataSource.CALC

    manual_wacc = manual.get("wacc")
    wacc, wacc_src = compute_wacc(
        beta=beta,
        rf=cn10y,
        erp=0.065,
        industry_group=industry_group,
        manual_wacc=manual_wacc,
    )
    sources["wacc"] = wacc_src
    cost_equity = cn10y + (beta or 1.0) * 0.065

    # ── Red flags ──────────────────────────────────────────────────────────
    red_flags = compute_red_flags(ttm, annual_history, is_financial=is_financial)
    if is_st:
        red_flags.append(RedFlag(
            code="ST_STOCK",
            level=__import__('app.core.enums', fromlist=['RedFlagLevel']).RedFlagLevel.WARNING,
            message="ST/\u002aST股票，投机性标记，评分上限30",
        ))
    result.red_flags = red_flags

    hard_reject = any(f.level.value == "reject" for f in red_flags)
    if hard_reject:
        result.hard_reject = True
        result.composite_score = 0.0
        result.recommendation = __import__('app.core.enums', fromlist=['RecommendationLabel']).RecommendationLabel.DO_NOT_INVEST
        return result

    # ── Dividend yield ─────────────────────────────────────────────────────
    div_3y = _avg_dividend(dividends, years=3)
    if div_3y is None:
        div_3y = manual.get("div_per_share")
        sources["div_per_share"] = DataSource.MANUAL if div_3y is not None else DataSource.UNAVAILABLE
    else:
        sources["div_per_share"] = DataSource.AUTO
    div_yld = dividend_yield(div_3y, current_price)

    # ── Per-model scores ───────────────────────────────────────────────────
    weights = INDUSTRY_WEIGHTS[industry_group]
    model_scores: list[ModelScore] = []

    # 1. DCF
    if "dcf" in weights and not is_financial:
        if total_shares and total_shares > 0 and ttm.fcf and ttm.fcf > 0:
            base, bear, bull, dbg = dcf_valuation(
                ttm, annual_history, total_shares, wacc, industry_group
            )
            result.dcf_base = base
            result.dcf_bear = bear
            result.dcf_bull = bull
            if base and current_price and base > 0:
                mos = (base - current_price) / base
                result.margin_of_safety = round(mos, 4)
                score = _score_dcf_margin(mos)
            else:
                score = None
            model_scores.append(ModelScore(
                model="dcf", raw_value=result.margin_of_safety,
                score=score, weight=weights["dcf"],
                contribution=score * weights["dcf"] if score else None,
                source=wacc_src,
            ))
        else:
            result.warnings.append("DCF: FCF非正或股本数据缺失，跳过DCF估值")

    # 2. ROE-PB
    if "roe_pb" in weights:
        fair_pb, gap, notes = roe_pb_valuation(annual_history, current_pb, cost_equity)
        if gap is not None:
            score = _score_pb_discount(-gap)  # negative gap = undervalued = positive discount
            model_scores.append(ModelScore(
                model="roe_pb", raw_value=gap,
                score=score, weight=weights["roe_pb"],
                contribution=score * weights["roe_pb"],
                source=DataSource.CALC, notes=notes,
            ))

    # 3. PE percentile
    if "pe_percentile" in weights:
        if pe_historical_median and current_pe_ttm and current_pe_ttm > 0:
            pct = _pe_percentile(current_pe_ttm, pe_historical_median)
            score = _score_percentile(pct)
            model_scores.append(ModelScore(
                model="pe_percentile", raw_value=pct,
                score=score, weight=weights["pe_percentile"],
                contribution=score * weights["pe_percentile"],
                source=DataSource.CALC,
            ))

    # 4. PB percentile
    if "pb_percentile" in weights:
        if current_pb and pe_historical_median:
            pct = _pe_percentile(current_pb, pe_historical_median)
            score = _score_percentile(pct)
            model_scores.append(ModelScore(
                model="pb_percentile", raw_value=pct,
                score=score, weight=weights["pb_percentile"],
                contribution=score * weights["pb_percentile"],
                source=DataSource.CALC,
            ))

    # 5. CAPE
    if "cape" in weights and len(annual_history) >= 7:
        cape_val, _, cape_notes = cape_valuation(annual_history, circ_mv, cpi_history)
        if cape_val and pe_historical_median:
            pct = cape_val / (pe_historical_median * 1.5) if pe_historical_median else 0.5
            pct = min(1.0, max(0.0, pct))
            score = _score_percentile(pct)
            model_scores.append(ModelScore(
                model="cape", raw_value=cape_val,
                score=score, weight=weights["cape"],
                contribution=score * weights["cape"],
                source=DataSource.CALC, notes=cape_notes,
            ))

    # 6. PEG (TMT / growth)
    if "peg" in weights:
        peg_val, peg_notes = peg_valuation(current_pe_ttm, annual_history)
        if peg_val is not None:
            score = _score_peg(peg_val)
            model_scores.append(ModelScore(
                model="peg", raw_value=peg_val,
                score=score, weight=weights["peg"],
                contribution=score * weights["peg"],
                source=DataSource.CALC, notes=peg_notes,
            ))

    # 7. Dividend yield
    if "dividend_yield" in weights:
        if div_yld is not None:
            is_utility = industry_group == IndustryGroup.UTILITIES_INFRA
            score = _score_dividend_yield(div_yld, is_utility=is_utility)
            model_scores.append(ModelScore(
                model="dividend_yield", raw_value=div_yld,
                score=score, weight=weights["dividend_yield"],
                contribution=score * weights["dividend_yield"],
                source=sources.get("div_per_share", DataSource.CALC),
            ))

    # 8. PCF percentile
    if "pcf_percentile" in weights and circ_mv and ttm.c_fr_oper:
        pcf = circ_mv / ttm.c_fr_oper if ttm.c_fr_oper > 0 else None
        if pcf and pe_historical_median:
            pct = min(1.0, max(0.0, pcf / (pe_historical_median * 2)))
            score = _score_percentile(pct)
            model_scores.append(ModelScore(
                model="pcf_percentile", raw_value=pcf,
                score=score, weight=weights["pcf_percentile"],
                contribution=score * weights["pcf_percentile"],
                source=DataSource.CALC,
            ))

    # 9. FCF/EV
    fcf_ev = fcf_ev_yield(ttm, circ_mv)
    if fcf_ev is not None:
        result.sources["fcf_ev"] = DataSource.CALC

    result.model_scores = model_scores

    # ── Composite score ────────────────────────────────────────────────────
    composite, recommendation, reject = aggregate_score(
        model_scores, red_flags, is_st, years_listed, result.market_bonus
    )
    result.composite_score = composite
    result.recommendation = recommendation
    result.hard_reject = reject

    # ── Expected return ────────────────────────────────────────────────────
    rev_cagr = None
    from app.services.valuation.engine import _revenue_cagr
    rev_cagr = _revenue_cagr(annual_history)
    ltr = expected_long_term_return(div_yld, rev_cagr, current_pe_ttm, pe_historical_median)
    result.expected_annual_return = ltr["total"]
    result.expected_dividend_return = ltr["dividend"]
    result.expected_growth_return = ltr["growth"]
    result.expected_reversion_return = ltr["reversion"]

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _latest_macro_value(series: list[dict], indicator: str) -> float | None:
    matching = [r for r in series if r.get("indicator") == indicator]
    if not matching:
        return None
    latest = sorted(matching, key=lambda r: r.get("period_date") or date.min, reverse=True)
    return latest[0].get("value")


def _latest_csi300_pe(quotes: list[dict]) -> float | None:
    if not quotes:
        return None
    latest = sorted(quotes, key=lambda r: r.get("period_date") or r.get("trade_date") or date.min, reverse=True)
    return latest[0].get("value") or latest[0].get("pe_ttm")


def _compute_stock_beta(
    stock_quotes: list[dict],
    index_quotes: list[dict],
) -> float | None:
    import pandas as pd
    if not stock_quotes or not index_quotes:
        return None
    sq = pd.DataFrame(stock_quotes).set_index("trade_date")["adj_close"].sort_index()
    iq = pd.DataFrame(index_quotes)
    # index_quotes from MacroIndicator has period_date; adapt
    if "period_date" in iq.columns:
        iq = iq.set_index("period_date")["value"]
    elif "trade_date" in iq.columns:
        iq = iq.set_index("trade_date")["adj_close"]
    else:
        return None
    iq = iq.sort_index()
    sq_ret = sq.pct_change().dropna()
    iq_ret = iq.pct_change().dropna()
    aligned = sq_ret.align(iq_ret, join="inner")
    s_vals = aligned[0].values.tolist()
    i_vals = aligned[1].values.tolist()
    return compute_beta(s_vals, i_vals)


def _avg_dividend(dividends: list[dict], years: int = 3) -> float | None:
    if not dividends:
        return None
    sorted_div = sorted(dividends, key=lambda d: d.get("end_date") or date.min, reverse=True)
    recent = sorted_div[:years]
    vals = [d.get("div_per_share") for d in recent if d.get("div_per_share")]
    if not vals:
        return None
    return sum(vals) / len(vals)


def _pe_percentile(current_val: float, historical_median: float) -> float:
    """Simple approximation: ratio of current to median gives a percentile proxy."""
    if historical_median <= 0:
        return 0.5
    ratio = current_val / historical_median
    # Map: ratio=0.5 → 10th pct, ratio=1.0 → 50th, ratio=2.0 → 90th
    pct = 0.1 + 0.4 * (ratio - 0.5) / 0.5
    return max(0.0, min(1.0, pct))
