"""
Tushare Pro data fetcher with rate-limiting, retry, and field validation.
All monetary values from Tushare are in 万元; we store them as-is.
"""
import asyncio
import time
from datetime import date, timedelta
from functools import wraps
from typing import Any, Optional

import pandas as pd
import tushare as ts
import structlog

from app.core.config import get_settings
from tenacity import retry, stop_after_attempt, wait_exponential

log = structlog.get_logger()

# Tushare Pro free tier: ~200 points/min; each call costs 1-5 points
_RATE_LIMIT_INTERVAL = 0.35  # seconds between calls (≈ 170/min)
_last_call_ts = 0.0
_api: Optional[Any] = None


def _get_api() -> Any:
    global _api
    if _api is None:
        token = get_settings().tushare_token
        if not token or token.startswith("your_"):
            raise ValueError(
                "TUSHARE_TOKEN not set. Please add your token to .env"
            )
        _api = ts.pro_api(token)
    return _api


def _rate_limit():
    global _last_call_ts
    now = time.monotonic()
    wait = _RATE_LIMIT_INTERVAL - (now - _last_call_ts)
    if wait > 0:
        time.sleep(wait)
    _last_call_ts = time.monotonic()


def _safe_float(val) -> float | None:
    try:
        if pd.isna(val):
            return None
        return float(val)
    except Exception:
        return None


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
def _call(func_name: str, **kwargs) -> pd.DataFrame:
    """Rate-limited, retried Tushare call."""
    _rate_limit()
    api = _get_api()
    fn = getattr(api, func_name)
    df = fn(**kwargs)
    return df if df is not None else pd.DataFrame()


# ── Stock Basic ────────────────────────────────────────────────────────────────

def fetch_stock_basic() -> list[dict]:
    """Fetch all A-share stocks (SSE + SZSE, listed only)."""
    results = []
    for exchange in ("SSE", "SZSE"):
        df = _call(
            "stock_basic",
            exchange=exchange,
            list_status="L",
            fields="ts_code,name,industry,list_date,market",
        )
        if not df.empty:
            results.append(df)
    if not results:
        return []
    full = pd.concat(results, ignore_index=True)
    out = []
    for _, row in full.iterrows():
        name = str(row.get("name", ""))
        out.append({
            "ts_code": row["ts_code"],
            "name": name,
            "industry": row.get("industry"),
            "list_date": _parse_date(row.get("list_date")),
            "market": row.get("market"),
            "is_st": "ST" in name.upper(),
        })
    return out


# ── Financial Statements ───────────────────────────────────────────────────────

def fetch_income(ts_code: str, start_date: str = "20140101") -> list[dict]:
    df = _call(
        "income",
        ts_code=ts_code,
        start_date=start_date,
        fields=(
            "ts_code,end_date,report_type,revenue,total_cogs,sell_exp,admin_exp,"
            "fin_exp,n_income_attr_p,minority_int,income_tax,deducted_profit"
        ),
    )
    return _parse_financial_df(df)


def fetch_balancesheet(ts_code: str, start_date: str = "20140101") -> list[dict]:
    df = _call(
        "balancesheet",
        ts_code=ts_code,
        start_date=start_date,
        fields=(
            "ts_code,end_date,report_type,total_assets,total_liab,"
            "total_hldr_eqy_exc_min_int,goodwill,intan_assets,other_receiv,"
            "inventories,acct_receiv,notes_receiv,acct_payable,money_cap,"
            "st_borrow,lt_borrow,fix_assets"
        ),
    )
    return _parse_financial_df(df, renames={"fix_assets": "fixed_assets"})


def fetch_cashflow(ts_code: str, start_date: str = "20140101") -> list[dict]:
    df = _call(
        "cashflow",
        ts_code=ts_code,
        start_date=start_date,
        fields=(
            "ts_code,end_date,report_type,n_cashflow_act,c_pay_acq_const_fiolta,depr_fa_coga_dpba"
        ),
    )
    return _parse_financial_df(
        df,
        renames={
            "n_cashflow_act": "c_fr_oper",
            "c_pay_acq_const_fiolta": "c_paid_for_assets",
            "depr_fa_coga_dpba": "dep_amor",
        },
    )


def _parse_financial_df(df: pd.DataFrame, renames: dict | None = None) -> list[dict]:
    if df.empty:
        return []
    if renames:
        df = df.rename(columns=renames)
    # Keep only the latest update per (ts_code, end_date)
    if "update_flag" in df.columns:
        df = df.sort_values("update_flag", ascending=False)
    if "end_date" in df.columns:
        df = df.drop_duplicates(subset=["ts_code", "end_date"], keep="first")
    records = []
    for _, row in df.iterrows():
        rec: dict[str, Any] = {}
        for col in df.columns:
            val = row.get(col)
            if col in ("ts_code", "report_type"):
                rec[col] = str(val) if val is not None else None
            elif col == "end_date":
                rec["end_date"] = _parse_date(val)
            else:
                rec[col] = _safe_float(val)
        records.append(rec)
    return records


# ── Daily Market Data ──────────────────────────────────────────────────────────

def fetch_daily(ts_code: str, start_date: str, end_date: str) -> list[dict]:
    df_price = _call(
        "daily",
        ts_code=ts_code,
        start_date=start_date,
        end_date=end_date,
        fields="ts_code,trade_date,close",
    )
    df_adj = _call(
        "adj_factor",
        ts_code=ts_code,
        start_date=start_date,
        end_date=end_date,
        fields="ts_code,trade_date,adj_factor",
    )
    df_basic = _call(
        "daily_basic",
        ts_code=ts_code,
        start_date=start_date,
        end_date=end_date,
        fields="ts_code,trade_date,pe,pe_ttm,pb,total_mv,circ_mv,turnover_rate_f",
    )

    if df_price.empty:
        return []

    # Merge on trade_date
    merged = df_price.copy()
    if not df_adj.empty:
        merged = merged.merge(df_adj[["trade_date", "adj_factor"]], on="trade_date", how="left")
    else:
        merged["adj_factor"] = 1.0
    if not df_basic.empty:
        merged = merged.merge(
            df_basic.drop(columns=["ts_code"], errors="ignore"),
            on="trade_date", how="left"
        )

    records = []
    for _, row in merged.iterrows():
        close = _safe_float(row.get("close"))
        adj_f = _safe_float(row.get("adj_factor")) or 1.0
        records.append({
            "ts_code": ts_code,
            "trade_date": _parse_date(str(row["trade_date"])),
            "close": close,
            "adj_factor": adj_f,
            "adj_close": round(close * adj_f, 4) if close else None,
            "total_mv": _safe_float(row.get("total_mv")),
            "circ_mv": _safe_float(row.get("circ_mv")),
            "pe": _safe_float(row.get("pe")),
            "pe_ttm": _safe_float(row.get("pe_ttm")),
            "pb": _safe_float(row.get("pb")),
            "turnover_rate_f": _safe_float(row.get("turnover_rate_f")),
        })
    return records


def fetch_latest_daily_basic(ts_code: str) -> dict | None:
    """Fetch the most recent daily_basic row."""
    today = date.today().strftime("%Y%m%d")
    # Try last 10 trading days to handle weekends/holidays
    start = (date.today() - timedelta(days=14)).strftime("%Y%m%d")
    df = _call(
        "daily_basic",
        ts_code=ts_code,
        start_date=start,
        end_date=today,
        fields="ts_code,trade_date,pe,pe_ttm,pb,total_mv,circ_mv,turnover_rate_f",
    )
    if df.empty:
        return None
    row = df.sort_values("trade_date", ascending=False).iloc[0]
    return {
        "trade_date": _parse_date(str(row["trade_date"])),
        "pe": _safe_float(row.get("pe")),
        "pe_ttm": _safe_float(row.get("pe_ttm")),
        "pb": _safe_float(row.get("pb")),
        "total_mv": _safe_float(row.get("total_mv")),
        "circ_mv": _safe_float(row.get("circ_mv")),
    }


# ── Index Data (CSI 300) ───────────────────────────────────────────────────────

def fetch_index_daily_basic(
    index_code: str = "000300.SH",
    start_date: str = "20150101",
    end_date: str | None = None,
) -> list[dict]:
    end = end_date or date.today().strftime("%Y%m%d")
    df = _call(
        "index_dailybasic",
        ts_code=index_code,
        start_date=start_date,
        end_date=end,
        fields="ts_code,trade_date,pe,pe_ttm,pb",
    )
    if df.empty:
        return []
    records = []
    for _, row in df.iterrows():
        records.append({
            "indicator": f"csi300_pe_ttm",
            "period_date": _parse_date(str(row["trade_date"])),
            "value": _safe_float(row.get("pe_ttm")),
        })
    return records


# ── Macro: 10Y CGB Yield & CPI ─────────────────────────────────────────────────

def fetch_cn10y_yield(start_date: str = "20150101") -> list[dict]:
    """10-year China Government Bond yield from Tushare yield_curve."""
    try:
        df = _call(
            "yield_curve",
            start_date=start_date,
            end_date=date.today().strftime("%Y%m%d"),
            curve_type="0",   # 0=国债, 1=地方
            curve_term="10",
        )
        if not df.empty and "yield" in df.columns:
            records = []
            for _, row in df.iterrows():
                records.append({
                    "indicator": "cn10y_yield",
                    "period_date": _parse_date(str(row.get("trade_date") or row.get("date"))),
                    "value": _safe_float(row.get("yield")) / 100.0
                    if _safe_float(row.get("yield")) and _safe_float(row.get("yield")) > 1
                    else _safe_float(row.get("yield")),
                    "source": "auto",
                })
            return records
    except Exception as e:
        log.warning("yield_curve fetch failed", error=str(e))
    return []


def fetch_cpi(start_date: str = "20140101") -> list[dict]:
    """Monthly CPI from Tushare cn_cpi."""
    try:
        df = _call("cn_cpi", start_date=start_date)
        if df.empty:
            return []
        records = []
        for _, row in df.iterrows():
            records.append({
                "indicator": "cpi_yoy",
                "period_date": _parse_date(str(row.get("month") or row.get("date"))),
                "value": _safe_float(row.get("nt_yoy") or row.get("cpi")),
                "source": "auto",
            })
        return records
    except Exception as e:
        log.warning("CPI fetch failed", error=str(e))
    return []


# ── Dividend Data ─────────────────────────────────────────────────────────────

def fetch_dividend(ts_code: str) -> list[dict]:
    """Annual dividend per share from Tushare dividend table."""
    try:
        df = _call(
            "dividend",
            ts_code=ts_code,
            fields="ts_code,end_date,cash_div_tax",
        )
        if df.empty:
            return []
        df["end_date"] = df["end_date"].apply(_parse_date)
        return df[["ts_code", "end_date", "cash_div_tax"]].rename(
            columns={"cash_div_tax": "div_per_share"}
        ).to_dict("records")
    except Exception as e:
        log.warning("Dividend fetch failed", ts_code=ts_code, error=str(e))
    return []


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_date(val) -> date | None:
    if val is None:
        return None
    s = str(val).strip()
    if len(s) == 8 and s.isdigit():
        try:
            return date(int(s[:4]), int(s[4:6]), int(s[6:8]))
        except ValueError:
            return None
    if len(s) == 10 and s[4] == "-":
        try:
            return date.fromisoformat(s)
        except ValueError:
            return None
    return None
