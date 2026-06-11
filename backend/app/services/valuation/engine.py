"""
Valuation engine – implements skill.md §6 exactly.
All monetary inputs in 万元; per-share values in 元/share.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from app.core.config import get_settings
from app.core.enums import DataSource, IndustryGroup, RedFlagLevel, RecommendationLabel
from app.core.industry import INDUSTRY_WEIGHTS, map_industry
from app.services.ttm import TTMResult


# ─────────────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ModelScore:
    model: str
    raw_value: float | None      # underlying metric (e.g. DCF safety margin)
    score: float | None          # 0-100 normalised
    weight: float                # industry weight
    contribution: float | None   # score * weight
    source: DataSource           # where did the key input come from?
    notes: str = ""


@dataclass
class RedFlag:
    code: str
    level: RedFlagLevel
    message: str
    value: float | None = None
    threshold: float | None = None


@dataclass
class ValuationResult:
    ts_code: str
    stock_name: str
    industry_group: IndustryGroup
    current_price: float | None

    # Model scores
    model_scores: list[ModelScore] = field(default_factory=list)
    composite_score: float | None = None
    recommendation: RecommendationLabel = RecommendationLabel.WATCH

    # DCF
    dcf_bear: float | None = None
    dcf_base: float | None = None
    dcf_bull: float | None = None
    margin_of_safety: float | None = None   # (base - price)/base

    # Market context
    erp: float | None = None
    erp_percentile: float | None = None
    market_bonus: float = 0.0  # ±10% from ERP thermometer

    # Red flags
    red_flags: list[RedFlag] = field(default_factory=list)
    hard_reject: bool = False

    # Source tracking
    sources: dict[str, DataSource] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    # Long-term expected return
    expected_annual_return: float | None = None
    expected_dividend_return: float | None = None
    expected_growth_return: float | None = None
    expected_reversion_return: float | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Score normalisation functions (skill.md §7.1)
# ─────────────────────────────────────────────────────────────────────────────

def _score_dcf_margin(margin: float) -> float:
    """DCF safety margin (-10%→20, 0%→50, 30%→80, 50%→100)."""
    points = [(-0.10, 20), (0.0, 50), (0.30, 80), (0.50, 100)]
    return _interp(margin, points)


def _score_pb_discount(discount: float) -> float:
    """ROE-PB discount (-20%→20, 0%→50, 20%→80)."""
    points = [(-0.20, 20), (0.0, 50), (0.20, 80)]
    return _interp(discount, points)


def _score_percentile(percentile: float) -> float:
    """Lower percentile = cheaper = higher score. score = 100 - pct*100"""
    return max(0.0, min(100.0, 100.0 - percentile * 100))


def _score_peg(peg: float) -> float:
    """PEG (2→20, 1→60, 0.5→90)."""
    points = [(2.0, 20), (1.0, 60), (0.5, 90), (0.1, 100)]
    return _interp(peg, points)


def _score_dividend_yield(yld: float, is_utility: bool = False) -> float:
    """Yield (1%→20, 3%→50, 5%→80, 7%→100). Utilities: shift +1%."""
    if is_utility:
        yld = max(0, yld - 0.01)
    points = [(0.01, 20), (0.03, 50), (0.05, 80), (0.07, 100)]
    return _interp(yld, points)


def _score_fcf_ev(fcf_ev: float) -> float:
    """FCF/EV (0%→0, 5%→70, 8%→100)."""
    points = [(0.0, 0), (0.05, 70), (0.08, 100)]
    return _interp(fcf_ev, points)


def _interp(x: float, points: list[tuple[float, float]]) -> float:
    """Piecewise linear interpolation, clamped to [0, 100]."""
    if x <= points[0][0]:
        return float(points[0][1])
    if x >= points[-1][0]:
        return float(points[-1][1])
    for i in range(len(points) - 1):
        x0, y0 = points[i]
        x1, y1 = points[i + 1]
        if x0 <= x <= x1:
            t = (x - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)
    return 50.0


# ─────────────────────────────────────────────────────────────────────────────
# Red Flag module (skill.md §4)
# ─────────────────────────────────────────────────────────────────────────────

def compute_red_flags(
    ttm: TTMResult,
    annual_history: list[dict],  # 3-year list
    is_financial: bool = False,
) -> list[RedFlag]:
    flags: list[RedFlag] = []

    if is_financial:
        return flags  # CFO/NI ratio meaningless for banks

    # 4.1 CFO / Net Profit (3-year average)
    cfo_ratios = []
    for yr in annual_history[-3:]:
        cfo = yr.get("c_fr_oper")
        ni = yr.get("n_income_attr_p")
        if cfo is not None and ni and ni != 0:
            cfo_ratios.append(cfo / ni)
    if cfo_ratios:
        avg = sum(cfo_ratios) / len(cfo_ratios)
        if avg < 0.5:
            flags.append(RedFlag(
                code="CFO_NI_LOW",
                level=RedFlagLevel.REJECT,
                message="现金流/净利润3年均值 < 0.5，严重现金流不足，疑似利润虚增",
                value=round(avg, 3), threshold=0.5,
            ))
        elif avg < 0.7:
            flags.append(RedFlag(
                code="CFO_NI_WEAK",
                level=RedFlagLevel.WARNING,
                message="现金流/净利润3年均值 0.5–0.7，现金转化偏弱，需检查应收与库存",
                value=round(avg, 3), threshold=0.7,
            ))
        elif avg < 1.0:
            flags.append(RedFlag(
                code="CFO_NI_CAUTION",
                level=RedFlagLevel.CAUTION,
                message="现金流/净利润3年均值 0.7–1.0，低于健康水平",
                value=round(avg, 3), threshold=1.0,
            ))

    # 4.2 Other receivables / equity
    if ttm.other_receiv is not None and ttm.total_hldr_eqy_exc_min_int:
        ratio = ttm.other_receiv / ttm.total_hldr_eqy_exc_min_int
        if ratio > 0.50:
            flags.append(RedFlag(
                code="OTHER_RECEIV_HIGH",
                level=RedFlagLevel.REJECT,
                message="其他应收款/归母净资产 > 50%，疑似大股东资金占用，拒绝",
                value=round(ratio, 3), threshold=0.50,
            ))
        elif ratio > 0.20:
            flags.append(RedFlag(
                code="OTHER_RECEIV_WARN",
                level=RedFlagLevel.WARNING,
                message="其他应收款/归母净资产 > 20%，存在资金占用嫌疑",
                value=round(ratio, 3), threshold=0.20,
            ))

    # 4.3 Goodwill / equity
    if ttm.goodwill is not None and ttm.total_hldr_eqy_exc_min_int:
        gw_ratio = ttm.goodwill / ttm.total_hldr_eqy_exc_min_int
        if gw_ratio > 0.50:
            flags.append(RedFlag(
                code="GOODWILL_HIGH",
                level=RedFlagLevel.REJECT,
                message="商誉/归母净资产 > 50%，极高商誉减值风险",
                value=round(gw_ratio, 3), threshold=0.50,
            ))
        elif gw_ratio > 0.30:
            flags.append(RedFlag(
                code="GOODWILL_WARN",
                level=RedFlagLevel.WARNING,
                message="商誉/归母净资产 > 30%，关注被收购方业绩",
                value=round(gw_ratio, 3), threshold=0.30,
            ))

    # 4.4 Receivable + inventory turnover days trend (3-year)
    if len(annual_history) >= 3:
        _check_turnover_trend(flags, annual_history[-3:])

    return flags


def _check_turnover_trend(flags: list[RedFlag], years: list[dict]) -> None:
    def _rec_days(yr):
        rev = yr.get("revenue")
        ar = yr.get("acct_receiv")
        nr = yr.get("notes_receiv") or 0
        if rev and rev > 0 and ar is not None:
            return (ar + nr) / rev * 365
        return None

    def _inv_days(yr):
        cogs = yr.get("total_cogs")
        inv = yr.get("inventories")
        if cogs and cogs > 0 and inv is not None:
            return inv / cogs * 365
        return None

    rec_series = [_rec_days(y) for y in years]
    inv_series = [_inv_days(y) for y in years]

    rec_vals = [v for v in rec_series if v is not None]
    inv_vals = [v for v in inv_series if v is not None]

    if len(rec_vals) >= 2 and rec_vals[0] > 0:
        rec_change = (rec_vals[-1] - rec_vals[0]) / rec_vals[0]
        if rec_change > 0.30:
            flags.append(RedFlag(
                code="RECV_DAYS_RISING",
                level=RedFlagLevel.WARNING,
                message=f"应收账款周转天数3年累计上升 {rec_change:.0%}，可能存在渠道压货或回款困难",
                value=round(rec_change, 3), threshold=0.30,
            ))

    if len(inv_vals) >= 2 and inv_vals[0] > 0:
        inv_change = (inv_vals[-1] - inv_vals[0]) / inv_vals[0]
        if inv_change > 0.30:
            flags.append(RedFlag(
                code="INV_DAYS_RISING",
                level=RedFlagLevel.WARNING,
                message=f"库存周转天数3年累计上升 {inv_change:.0%}，可能存在库存积压",
                value=round(inv_change, 3), threshold=0.30,
            ))


# ─────────────────────────────────────────────────────────────────────────────
# WACC (skill.md §6.1.4)
# ─────────────────────────────────────────────────────────────────────────────

def compute_wacc(
    beta: float | None,
    rf: float | None,
    erp: float | None,
    industry_group: IndustryGroup,
    is_soe: bool = False,
    manual_wacc: float | None = None,
    sources: dict | None = None,
) -> tuple[float, DataSource]:
    cfg = get_settings()

    if manual_wacc is not None:
        return manual_wacc, DataSource.MANUAL

    _rf = rf if rf is not None else cfg.default_risk_free_rate
    _erp = erp if erp is not None else cfg.default_erp
    _beta = beta if beta is not None else 1.0

    cost_equity = _rf + _beta * _erp
    cost_debt = 0.03 if is_soe else 0.04
    tax = 0.25
    debt_pct = 0.30
    equity_pct = 0.70

    wacc = equity_pct * cost_equity + debt_pct * cost_debt * (1 - tax)

    # Sanity bounds
    lo, hi = 0.07, 0.16
    wacc = max(lo, min(hi, wacc))

    src = DataSource.CALC if (rf is not None and erp is not None and beta is not None) else DataSource.DEFAULT
    return round(wacc, 4), src


# ─────────────────────────────────────────────────────────────────────────────
# DCF engine (skill.md §6.1)
# ─────────────────────────────────────────────────────────────────────────────

def _growth_phase1(revenue_cagr: float | None, industry_group: IndustryGroup) -> float:
    base = (revenue_cagr or 0.05) * 0.7
    cap = 0.10 if industry_group == IndustryGroup.UTILITIES_INFRA else 0.15
    return max(0.0, min(cap, base))


def dcf_valuation(
    ttm: TTMResult,
    annual_history: list[dict],
    total_shares: float,      # 万股
    wacc: float,
    industry_group: IndustryGroup,
) -> tuple[float | None, float | None, float | None, dict]:
    """
    Returns (bear_per_share, base_per_share, bull_per_share, debug_dict).
    """
    fcf = ttm.fcf
    if fcf is None or fcf <= 0:
        # Negative or zero FCF → DCF not applicable
        return None, None, None, {"error": "FCF non-positive, DCF not applicable"}

    # Revenue CAGR (3-year)
    rev_cagr = _revenue_cagr(annual_history)
    g1 = _growth_phase1(rev_cagr, industry_group)
    g_term = 0.03

    def _scenario(wacc_adj: float, g1_adj: float) -> float:
        # Phase 1: years 1-5
        pv = 0.0
        cf = fcf
        for yr in range(1, 6):
            cf = cf * (1 + g1_adj)
            pv += cf / (1 + wacc_adj) ** yr
        # Phase 2: years 6-10, linearly decline g to g_term
        for yr in range(6, 11):
            step = yr - 5
            g2 = g1_adj - (g1_adj - g_term) * step / 5
            cf = cf * (1 + g2)
            pv += cf / (1 + wacc_adj) ** yr
        # Terminal value (year 10 cf grows at g_term forever)
        tv = cf * (1 + g_term) / (wacc_adj - g_term)
        pv_tv = tv / (1 + wacc_adj) ** 10
        # Safety: terminal value should not exceed 70% of total EV
        total = pv + pv_tv
        if total > 0 and pv_tv / total > 0.70:
            tv = cf * (1 + g_term) / (max(wacc_adj + 0.01, wacc_adj - g_term + 0.01) - g_term)
            pv_tv = tv / (1 + wacc_adj) ** 10
            total = pv + pv_tv

        # Enterprise value → equity value
        net_debt = ttm.net_debt or 0
        equity_val = total - net_debt
        return equity_val

    base_ev = _scenario(wacc, g1)
    bear_ev = _scenario(wacc + 0.01, max(0, g1 - 0.01))
    bull_ev = _scenario(max(wacc - 0.01, 0.07), g1 + 0.01)

    def _per_share(ev: float) -> float | None:
        if total_shares <= 0:
            return None
        return round(ev / total_shares * 10000, 2)   # 万元/万股 * 10000 = 元

    debug = {"fcf_ttm": fcf, "wacc": wacc, "g1": g1, "rev_cagr": rev_cagr}
    return _per_share(base_ev), _per_share(bear_ev), _per_share(bull_ev), debug


def _revenue_cagr(annual_history: list[dict], years: int = 3) -> float | None:
    revs = [
        yr.get("revenue") for yr in annual_history[-years:]
        if yr.get("revenue") and yr.get("revenue") > 0
    ]
    if len(revs) < 2:
        return None
    try:
        return (revs[-1] / revs[0]) ** (1 / (len(revs) - 1)) - 1
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# ROE-PB (skill.md §6.2)
# ─────────────────────────────────────────────────────────────────────────────

def roe_pb_valuation(
    annual_history: list[dict],
    current_pb: float | None,
    cost_of_equity: float,
    g_term: float = 0.03,
) -> tuple[float | None, float | None, str]:
    """
    Returns (fair_pb, valuation_gap_pct, notes).
    valuation_gap_pct < 0 → undervalued.
    """
    # Sustainable ROE: min(5-year median deducted ROE, current TTM ROE)
    roe_series = []
    for yr in annual_history[-5:]:
        ni = yr.get("deducted_profit") or yr.get("n_income_attr_p")
        eq = yr.get("total_hldr_eqy_exc_min_int")
        if ni and eq and eq > 0:
            roe_series.append(ni / eq)
    if not roe_series:
        return None, None, "ROE数据不足"

    roe_median = sorted(roe_series)[len(roe_series) // 2]
    r = cost_of_equity

    if r <= g_term:
        return None, None, "折现率不能小于等于永续增长率"

    fair_pb = (roe_median - g_term) / (r - g_term)
    fair_pb = max(0.1, fair_pb)  # floor

    if current_pb is None:
        return fair_pb, None, f"可持续ROE={roe_median:.2%}, 公允PB={fair_pb:.2f}"

    gap = (current_pb / fair_pb - 1)
    notes = f"可持续ROE={roe_median:.2%}, 公允PB={fair_pb:.2f}, 当前PB={current_pb:.2f}, 偏差={gap:.1%}"
    return fair_pb, gap, notes


# ─────────────────────────────────────────────────────────────────────────────
# CAPE (skill.md §6.3)
# ─────────────────────────────────────────────────────────────────────────────

def cape_valuation(
    annual_history: list[dict],
    total_mv: float | None,    # 万元
    cpi_history: list[dict],   # [{period_date, value (yoy%)}]
    min_years: int = 7,
) -> tuple[float | None, float | None, str]:
    """
    Returns (cape_value, percentile_in_10yr_history, notes).
    """
    profits = []
    for yr in annual_history:
        ni = yr.get("n_income_attr_p")
        end = yr.get("end_date")
        if ni and end:
            profits.append({"date": end, "profit": ni})

    if len(profits) < min_years:
        return None, None, f"CAPE历史数据不足（需≥{min_years}年，现有{len(profits)}年）"

    # CPI adjustment: inflate past profits to today's RMB
    latest_cpi_idx = _build_cpi_index(cpi_history)
    adjusted_profits = []
    for p in profits[-10:]:
        d = p["date"]
        year = d.year if hasattr(d, "year") else int(str(d)[:4])
        cpi_adj = latest_cpi_idx.get(year, 1.0)
        adjusted_profits.append(p["profit"] * cpi_adj)

    avg_real_profit = sum(adjusted_profits) / len(adjusted_profits)
    if avg_real_profit <= 0 or total_mv is None or total_mv <= 0:
        return None, None, "平均实际利润或市值为零/负，CAPE不适用"

    cape = total_mv / avg_real_profit
    notes = f"10年平均实际归母利润={avg_real_profit:.0f}万元, CAPE={cape:.1f}"
    return cape, None, notes   # percentile computed externally from historical series


def _build_cpi_index(cpi_history: list[dict]) -> dict[int, float]:
    """
    Build a year→cumulative_CPI_adjustment_factor dict.
    Base year = latest year in series (factor=1.0).
    """
    if not cpi_history:
        return {}
    by_year: dict[int, list[float]] = {}
    for row in cpi_history:
        d = row.get("period_date")
        v = row.get("value")
        if d is None or v is None:
            continue
        year = d.year if hasattr(d, "year") else int(str(d)[:4])
        if year not in by_year:
            by_year[year] = []
        by_year[year].append(v)
    annual_cpi = {yr: sum(vals) / len(vals) for yr, vals in by_year.items()}
    if not annual_cpi:
        return {}
    latest = max(annual_cpi.keys())
    # Build cumulative factor: older years have lower purchasing power,
    # so older profits must be multiplied up to today's value.
    factor: dict[int, float] = {latest: 1.0}
    for yr in sorted(annual_cpi.keys(), reverse=True):
        if yr == latest:
            continue
        # CPI yoy ≈ year/prev_year - 1 (in %)
        yoy = annual_cpi.get(yr + 1, 2.0) / 100.0  # convert % to decimal
        factor[yr] = factor.get(yr + 1, 1.0) * (1 + yoy)
    return factor


# ─────────────────────────────────────────────────────────────────────────────
# PEG (skill.md §6.5)
# ─────────────────────────────────────────────────────────────────────────────

def peg_valuation(
    pe_ttm: float | None,
    annual_history: list[dict],
) -> tuple[float | None, str]:
    if pe_ttm is None or pe_ttm <= 0:
        return None, "PE为负或不可用"
    rev_cagr = _revenue_cagr(annual_history, years=3)
    if rev_cagr is None or rev_cagr <= 0:
        return None, "收入增速为零或不可计算"
    growth_est = min(rev_cagr * 0.5, 0.25)  # haircut 0.5, cap 25%
    if growth_est <= 0:
        return None, "保守增速估算不合理"
    peg = pe_ttm / (growth_est * 100)
    return round(peg, 3), f"PE={pe_ttm:.1f}, 保守增速估算={growth_est:.1%}, PEG={peg:.2f}"


# ─────────────────────────────────────────────────────────────────────────────
# Dividend yield (skill.md §6.6)
# ─────────────────────────────────────────────────────────────────────────────

def dividend_yield(
    div_per_share_3y_avg: float | None,
    current_price: float | None,
) -> float | None:
    if div_per_share_3y_avg is None or current_price is None or current_price <= 0:
        return None
    return div_per_share_3y_avg / current_price


# ─────────────────────────────────────────────────────────────────────────────
# FCF/EV yield (skill.md §6.7)
# ─────────────────────────────────────────────────────────────────────────────

def fcf_ev_yield(ttm: TTMResult, total_mv: float | None) -> float | None:
    if ttm.fcf is None or total_mv is None:
        return None
    ev = total_mv + (ttm.net_debt or 0)
    if ev <= 0:
        return None
    return ttm.fcf / ev


# ─────────────────────────────────────────────────────────────────────────────
# ERP / Market thermometer (skill.md §6.4)
# ─────────────────────────────────────────────────────────────────────────────

def compute_erp(csi300_pe_ttm: float | None, cn10y: float | None) -> float | None:
    if csi300_pe_ttm and csi300_pe_ttm > 0 and cn10y is not None:
        return (1 / csi300_pe_ttm) - cn10y
    return None


def erp_market_bonus(erp: float | None, erp_percentile: float | None) -> float:
    """Return +0.10 if ERP extreme high (market cheap), -0.10 if extreme low."""
    if erp_percentile is None:
        return 0.0
    if erp_percentile >= 0.90:
        return 0.10
    if erp_percentile <= 0.10:
        return -0.10
    return 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Beta calculation
# ─────────────────────────────────────────────────────────────────────────────

def compute_beta(
    stock_returns: list[float],
    index_returns: list[float],
) -> float | None:
    """Compute OLS beta of stock vs index returns."""
    import numpy as np
    if len(stock_returns) < 60 or len(index_returns) < 60:
        return None
    x = np.array(index_returns)
    y = np.array(stock_returns)
    n = min(len(x), len(y))
    x, y = x[-n:], y[-n:]
    cov = np.cov(x, y)
    var_x = cov[0, 0]
    if var_x == 0:
        return None
    return float(cov[0, 1] / var_x)


# ─────────────────────────────────────────────────────────────────────────────
# Composite scoring (skill.md §7)
# ─────────────────────────────────────────────────────────────────────────────

def aggregate_score(
    model_scores: list[ModelScore],
    red_flags: list[RedFlag],
    is_st: bool,
    years_listed: float,
    market_bonus: float = 0.0,
) -> tuple[float, RecommendationLabel, bool]:
    """
    Returns (composite_score, recommendation, hard_reject).
    """
    # Hard reject check
    hard_reject = any(f.level == RedFlagLevel.REJECT for f in red_flags)
    if hard_reject:
        return 0.0, RecommendationLabel.DO_NOT_INVEST, True

    total_weight = sum(ms.weight for ms in model_scores if ms.score is not None)
    if total_weight == 0:
        return 0.0, RecommendationLabel.WATCH, False

    raw = sum(
        ms.score * ms.weight
        for ms in model_scores
        if ms.score is not None
    ) / total_weight

    # Market bonus (±10, not percentage points of weight)
    raw = raw + market_bonus * 100
    raw = max(0.0, min(100.0, raw))

    # ST cap
    if is_st:
        raw = min(raw, 30.0)

    # IPO age penalty
    if years_listed < 1:
        raw *= 0.50
    elif years_listed < 3:
        raw *= 0.70
    elif years_listed < 5:
        raw *= 0.80

    raw = max(0.0, min(100.0, raw))

    # Recommendation label
    if raw >= 80:
        label = RecommendationLabel.VERY_ATTRACTIVE
    elif raw >= 65:
        label = RecommendationLabel.ATTRACTIVE
    elif raw >= 45:
        label = RecommendationLabel.FAIRLY_VALUED
    elif raw >= 25:
        label = RecommendationLabel.WATCH
    else:
        label = RecommendationLabel.DO_NOT_INVEST

    return round(raw, 1), label, False


# ─────────────────────────────────────────────────────────────────────────────
# Expected long-term return (skill.md §8)
# ─────────────────────────────────────────────────────────────────────────────

def expected_long_term_return(
    div_yield: float | None,
    revenue_cagr: float | None,
    pe_ttm: float | None,
    pe_historical_median: float | None,
    horizon_years: int = 5,
) -> dict[str, float | None]:
    """
    Expected annual total return = dividend + growth + valuation reversion.
    """
    div = div_yield or 0.0
    growth = min((revenue_cagr or 0.0) * 0.6, 0.15)
    reversion = 0.0
    if pe_ttm and pe_historical_median and pe_ttm > 0:
        reversion = (pe_historical_median / pe_ttm) ** (1 / horizon_years) - 1

    total = div + growth + reversion
    return {
        "dividend": round(div, 4),
        "growth": round(growth, 4),
        "reversion": round(reversion, 4),
        "total": round(total, 4),
    }
