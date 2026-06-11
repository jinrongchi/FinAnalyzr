"""
Valuation endpoint – runs full pipeline for a single stock.
Returns ValuationResult as JSON with source labels.
"""
import json
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.orm import (
    DailyQuote, FinancialStatement, MacroIndicator,
    ManualOverride, Stock, ValuationSnapshot,
)
from app.services.valuation.orchestrator import run_valuation

router = APIRouter()


@router.get("/{ts_code}")
async def get_valuation(
    ts_code: str,
    force_refresh: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    # Load stock metadata
    stock = await db.get(Stock, ts_code)
    if not stock:
        raise HTTPException(404, "Stock not found. Run /sync first.")

    # Check cache (today's snapshot)
    today = date.today()
    if not force_refresh:
        snap = await db.get(ValuationSnapshot, None)
        snap_stmt = select(ValuationSnapshot).where(
            ValuationSnapshot.ts_code == ts_code,
            ValuationSnapshot.snapshot_date == today,
        )
        snap_row = (await db.execute(snap_stmt)).scalar_one_or_none()
        if snap_row:
            return _snap_to_dict(snap_row, stock)

    # Load financial statements
    stmt_q = select(FinancialStatement).where(
        FinancialStatement.ts_code == ts_code
    ).order_by(desc(FinancialStatement.end_date))
    statements = (await db.execute(stmt_q)).scalars().all()
    statements_dicts = [_fs_to_dict(s) for s in statements]

    # Load daily quotes (2 years for Beta, 10 years for percentile)
    dq_q = select(DailyQuote).where(
        DailyQuote.ts_code == ts_code
    ).order_by(DailyQuote.trade_date)
    daily_quotes = (await db.execute(dq_q)).scalars().all()
    dq_dicts = [_dq_to_dict(q) for q in daily_quotes]

    # Latest quote for current price
    latest_quote = daily_quotes[-1] if daily_quotes else None

    # CSI300 data from MacroIndicator (stored as indicator=csi300_pe_ttm)
    csi_q = select(MacroIndicator).where(
        MacroIndicator.indicator == "csi300_pe_ttm"
    ).order_by(desc(MacroIndicator.period_date)).limit(1)
    csi_row = (await db.execute(csi_q)).scalar_one_or_none()
    csi_val = csi_row.value if csi_row else None

    # CN10Y yield
    cn10y_q = select(MacroIndicator).where(
        MacroIndicator.indicator == "cn10y_yield"
    ).order_by(desc(MacroIndicator.period_date)).limit(1)
    cn10y_row = (await db.execute(cn10y_q)).scalar_one_or_none()

    # CPI history
    cpi_q = select(MacroIndicator).where(
        MacroIndicator.indicator == "cpi_yoy"
    ).order_by(MacroIndicator.period_date)
    cpi_rows = (await db.execute(cpi_q)).scalars().all()
    cpi_history = [{"period_date": r.period_date, "value": r.value} for r in cpi_rows]

    # Macro list
    macro_cn10y = (
        [{"indicator": "cn10y_yield", "period_date": cn10y_row.period_date, "value": cn10y_row.value}]
        if cn10y_row else []
    )

    # Manual overrides
    mo_q = select(ManualOverride).where(ManualOverride.ts_code == ts_code)
    mo_rows = (await db.execute(mo_q)).scalars().all()
    overrides = {r.field_name: r.value for r in mo_rows}

    # Total shares (from total_mv / close, or from statements)
    total_shares = None
    if latest_quote and latest_quote.total_mv and latest_quote.close and latest_quote.close > 0:
        total_shares = latest_quote.total_mv / latest_quote.close * 10000  # 万股

    result = run_valuation(
        ts_code=ts_code,
        stock_name=stock.name,
        sw_industry=stock.industry,
        list_date=stock.list_date,
        is_st=stock.is_st,
        market=stock.market,
        statements=statements_dicts,
        daily_quotes=dq_dicts,
        csi300_quotes=[{"period_date": csi_row.period_date, "value": csi_row.value}] if csi_row else [],
        macro_cn10y=macro_cn10y,
        cpi_history=cpi_history,
        dividends=[],  # loaded separately in production
        current_price=latest_quote.close if latest_quote else None,
        current_pb=latest_quote.pb if latest_quote else None,
        current_pe_ttm=latest_quote.pe_ttm if latest_quote else None,
        current_total_mv=latest_quote.total_mv if latest_quote else None,
        total_shares=total_shares,
        manual_overrides=overrides,
    )

    # Persist snapshot
    snap = ValuationSnapshot(
        ts_code=ts_code,
        snapshot_date=today,
        composite_score=result.composite_score,
        recommendation=result.recommendation.value if result.recommendation else None,
        dcf_intrinsic_bear=result.dcf_bear,
        dcf_intrinsic_base=result.dcf_base,
        dcf_intrinsic_bull=result.dcf_bull,
        margin_of_safety=result.margin_of_safety,
        red_flags_json=json.dumps([
            {"code": f.code, "level": f.level.value, "message": f.message, "value": f.value}
            for f in result.red_flags
        ], ensure_ascii=False),
        scores_json=json.dumps([
            {"model": ms.model, "score": ms.score, "weight": ms.weight, "contribution": ms.contribution}
            for ms in result.model_scores
        ]),
        sources_json=json.dumps({k: v.value for k, v in result.sources.items()}),
    )
    # Upsert
    existing = (await db.execute(
        select(ValuationSnapshot).where(
            ValuationSnapshot.ts_code == ts_code,
            ValuationSnapshot.snapshot_date == today,
        )
    )).scalar_one_or_none()
    if existing:
        existing.composite_score = snap.composite_score
        existing.recommendation = snap.recommendation
        existing.dcf_intrinsic_bear = snap.dcf_intrinsic_bear
        existing.dcf_intrinsic_base = snap.dcf_intrinsic_base
        existing.dcf_intrinsic_bull = snap.dcf_intrinsic_bull
        existing.margin_of_safety = snap.margin_of_safety
        existing.red_flags_json = snap.red_flags_json
        existing.scores_json = snap.scores_json
        existing.sources_json = snap.sources_json
    else:
        db.add(snap)
    await db.commit()

    return _result_to_dict(result, stock)


def _result_to_dict(result, stock) -> dict:
    from dataclasses import asdict
    return {
        "ts_code": result.ts_code,
        "stock_name": result.stock_name,
        "industry_group": result.industry_group.value,
        "current_price": result.current_price,
        "composite_score": result.composite_score,
        "recommendation": result.recommendation.value if result.recommendation else None,
        "hard_reject": result.hard_reject,
        "dcf": {
            "bear": result.dcf_bear,
            "base": result.dcf_base,
            "bull": result.dcf_bull,
            "margin_of_safety": result.margin_of_safety,
        },
        "market_context": {
            "erp": result.erp,
            "erp_percentile": result.erp_percentile,
            "market_bonus": result.market_bonus,
        },
        "model_scores": [
            {
                "model": ms.model,
                "raw_value": ms.raw_value,
                "score": ms.score,
                "weight": ms.weight,
                "contribution": ms.contribution,
                "source": ms.source.value,
                "notes": ms.notes,
            }
            for ms in result.model_scores
        ],
        "red_flags": [
            {
                "code": f.code,
                "level": f.level.value,
                "message": f.message,
                "value": f.value,
                "threshold": f.threshold,
            }
            for f in result.red_flags
        ],
        "expected_return": {
            "dividend": result.expected_dividend_return,
            "growth": result.expected_growth_return,
            "reversion": result.expected_reversion_return,
            "total": result.expected_annual_return,
        },
        "sources": {k: v.value for k, v in result.sources.items()},
        "warnings": result.warnings,
    }


def _snap_to_dict(snap: ValuationSnapshot, stock: Stock) -> dict:
    return {
        "ts_code": snap.ts_code,
        "stock_name": stock.name,
        "composite_score": snap.composite_score,
        "recommendation": snap.recommendation,
        "cached": True,
        "snapshot_date": snap.snapshot_date.isoformat(),
        "dcf": {
            "bear": snap.dcf_intrinsic_bear,
            "base": snap.dcf_intrinsic_base,
            "bull": snap.dcf_intrinsic_bull,
            "margin_of_safety": snap.margin_of_safety,
        },
        "model_scores": json.loads(snap.scores_json or "[]"),
        "red_flags": json.loads(snap.red_flags_json or "[]"),
        "sources": json.loads(snap.sources_json or "{}"),
    }


def _fs_to_dict(s: FinancialStatement) -> dict:
    return {
        "ts_code": s.ts_code,
        "end_date": s.end_date,
        "report_type": s.report_type,
        "revenue": s.revenue, "total_cogs": s.total_cogs,
        "sell_exp": s.sell_exp, "admin_exp": s.admin_exp, "fin_exp": s.fin_exp,
        "n_income_attr_p": s.n_income_attr_p, "deducted_profit": s.deducted_profit,
        "minority_int": s.minority_int, "income_tax": s.income_tax,
        "total_assets": s.total_assets, "total_liab": s.total_liab,
        "total_hldr_eqy_exc_min_int": s.total_hldr_eqy_exc_min_int,
        "goodwill": s.goodwill, "intan_assets": s.intan_assets,
        "other_receiv": s.other_receiv, "inventories": s.inventories,
        "acct_receiv": s.acct_receiv, "notes_receiv": s.notes_receiv,
        "acct_payable": s.acct_payable, "money_cap": s.money_cap,
        "st_borrow": s.st_borrow, "lt_borrow": s.lt_borrow, "fixed_assets": s.fixed_assets,
        "c_fr_oper": s.c_fr_oper, "c_paid_for_assets": s.c_paid_for_assets,
        "dep_amor": s.dep_amor,
    }


def _dq_to_dict(q: DailyQuote) -> dict:
    return {
        "ts_code": q.ts_code, "trade_date": q.trade_date,
        "close": q.close, "adj_factor": q.adj_factor, "adj_close": q.adj_close,
        "total_mv": q.total_mv, "circ_mv": q.circ_mv,
        "pe": q.pe, "pe_ttm": q.pe_ttm, "pb": q.pb,
    }
