"""
Sync task: pulls fresh data from Tushare into the database.
Can be triggered via API or run as a scheduled Celery task.
"""
from __future__ import annotations

import asyncio
from datetime import date, timedelta
from typing import Callable

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.industry import map_industry
from app.db.session import get_session_factory
from app.models.orm import (
    DailyQuote, FinancialStatement, MacroIndicator, Stock
)
from app.services import tushare_fetcher as tf

log = structlog.get_logger()


async def sync_stock_basic():
    log.info("Syncing stock_basic")
    records = tf.fetch_stock_basic()
    if not records:
        log.warning("No records returned from stock_basic")
        return
    factory = get_session_factory()
    async with factory() as db:
        for rec in records:
            existing = await db.get(Stock, rec["ts_code"])
            ig = map_industry(rec.get("industry"))
            if existing:
                existing.name = rec["name"]
                existing.industry = rec.get("industry")
                existing.industry_group = ig.value
                existing.list_date = rec.get("list_date")
                existing.market = rec.get("market")
                existing.is_st = rec.get("is_st", False)
            else:
                db.add(Stock(
                    ts_code=rec["ts_code"],
                    name=rec["name"],
                    industry=rec.get("industry"),
                    industry_group=ig.value,
                    list_date=rec.get("list_date"),
                    market=rec.get("market"),
                    is_st=rec.get("is_st", False),
                ))
        await db.commit()
    log.info("stock_basic sync done", count=len(records))


async def sync_financials(ts_code: str, start_date: str = "20140101"):
    log.info("Syncing financials", ts_code=ts_code)
    income = tf.fetch_income(ts_code, start_date)
    balance = tf.fetch_balancesheet(ts_code, start_date)
    cashflow = tf.fetch_cashflow(ts_code, start_date)

    # Merge by (ts_code, end_date)
    merged: dict[date, dict] = {}
    for rec in income:
        key = rec.get("end_date")
        if key:
            merged.setdefault(key, {"ts_code": ts_code, "end_date": key}).update(rec)
    for rec in balance:
        key = rec.get("end_date")
        if key:
            merged.setdefault(key, {"ts_code": ts_code, "end_date": key}).update(rec)
    for rec in cashflow:
        key = rec.get("end_date")
        if key:
            merged.setdefault(key, {"ts_code": ts_code, "end_date": key}).update(rec)

    factory = get_session_factory()
    async with factory() as db:
        for key, rec in merged.items():
            stmt = select(FinancialStatement).where(
                FinancialStatement.ts_code == ts_code,
                FinancialStatement.end_date == key,
            )
            existing = (await db.execute(stmt)).scalar_one_or_none()
            report_type = str(rec.get("report_type") or "Q")
            if existing:
                _update_fs(existing, rec)
            else:
                fs = FinancialStatement(ts_code=ts_code, end_date=key, report_type=report_type)
                _update_fs(fs, rec)
                db.add(fs)
        await db.commit()
    log.info("Financials synced", ts_code=ts_code, periods=len(merged))


def _update_fs(fs: FinancialStatement, rec: dict):
    for field in [
        "revenue", "total_cogs", "sell_exp", "admin_exp", "fin_exp",
        "n_income_attr_p", "deducted_profit", "minority_int", "income_tax",
        "total_assets", "total_liab", "total_hldr_eqy_exc_min_int",
        "goodwill", "intan_assets", "other_receiv", "inventories",
        "acct_receiv", "notes_receiv", "acct_payable", "money_cap",
        "st_borrow", "lt_borrow", "fixed_assets",
        "c_fr_oper", "c_paid_for_assets", "dep_amor",
    ]:
        v = rec.get(field)
        if v is not None:
            setattr(fs, field, v)


async def sync_daily(ts_code: str, days_back: int = 365 * 3):
    start = (date.today() - timedelta(days=days_back)).strftime("%Y%m%d")
    end = date.today().strftime("%Y%m%d")
    records = tf.fetch_daily(ts_code, start, end)
    if not records:
        return
    factory = get_session_factory()
    async with factory() as db:
        for rec in records:
            stmt = select(DailyQuote).where(
                DailyQuote.ts_code == ts_code,
                DailyQuote.trade_date == rec["trade_date"],
            )
            existing = (await db.execute(stmt)).scalar_one_or_none()
            if existing:
                for f in ["close", "adj_factor", "adj_close", "total_mv", "circ_mv", "pe", "pe_ttm", "pb", "turnover_rate_f"]:
                    v = rec.get(f)
                    if v is not None:
                        setattr(existing, f, v)
            else:
                db.add(DailyQuote(**{k: v for k, v in rec.items() if v is not None}))
        await db.commit()
    log.info("Daily quotes synced", ts_code=ts_code, count=len(records))


async def sync_macro():
    log.info("Syncing macro data")
    factory = get_session_factory()
    # CN10Y yield
    cn10y = tf.fetch_cn10y_yield()
    async with factory() as db:
        for rec in cn10y:
            stmt = select(MacroIndicator).where(
                MacroIndicator.indicator == rec["indicator"],
                MacroIndicator.period_date == rec["period_date"],
            )
            existing = (await db.execute(stmt)).scalar_one_or_none()
            if not existing and rec["period_date"] and rec["value"] is not None:
                db.add(MacroIndicator(**rec))
        await db.commit()
    # CPI
    cpi = tf.fetch_cpi()
    async with factory() as db:
        for rec in cpi:
            stmt = select(MacroIndicator).where(
                MacroIndicator.indicator == rec["indicator"],
                MacroIndicator.period_date == rec["period_date"],
            )
            existing = (await db.execute(stmt)).scalar_one_or_none()
            if not existing and rec["period_date"] and rec["value"] is not None:
                db.add(MacroIndicator(**rec))
        await db.commit()
    # CSI 300 PE
    csi = tf.fetch_index_daily_basic()
    async with factory() as db:
        for rec in csi:
            stmt = select(MacroIndicator).where(
                MacroIndicator.indicator == rec["indicator"],
                MacroIndicator.period_date == rec["period_date"],
            )
            existing = (await db.execute(stmt)).scalar_one_or_none()
            if not existing and rec["period_date"] and rec.get("value") is not None:
                db.add(MacroIndicator(
                    indicator=rec["indicator"],
                    period_date=rec["period_date"],
                    value=rec["value"],
                    source="auto",
                ))
        await db.commit()
    log.info("Macro sync done")
