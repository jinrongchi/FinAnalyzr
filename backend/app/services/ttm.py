"""
TTM (Trailing Twelve Months) construction engine.
Rules:
- Strictly requires 4 quarters ending on the most recent available report date.
- If 4 complete quarters unavailable, flag as incomplete but still compute
  on available data – caller decides whether to use.
- All amounts in 万元.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

import pandas as pd


ADDITIVE_FIELDS = [
    "revenue", "total_cogs", "sell_exp", "admin_exp", "fin_exp",
    "n_income_attr_p", "deducted_profit", "minority_int", "income_tax",
    "c_fr_oper", "c_paid_for_assets", "dep_amor",
]

# Balance sheet fields – take latest quarter value (snapshot, not sum)
SNAPSHOT_FIELDS = [
    "total_assets", "total_liab", "total_hldr_eqy_exc_min_int",
    "goodwill", "intan_assets", "other_receiv", "inventories",
    "acct_receiv", "notes_receiv", "acct_payable", "money_cap",
    "st_borrow", "lt_borrow", "fixed_assets",
]


@dataclass
class TTMResult:
    ts_code: str
    as_of_date: date          # latest quarter end used
    periods_used: int         # how many quarters (ideally 4)
    is_complete: bool         # True if 4 full quarters available

    # Additive (income + cashflow TTM sums)
    revenue: float | None = None
    total_cogs: float | None = None
    sell_exp: float | None = None
    admin_exp: float | None = None
    fin_exp: float | None = None
    n_income_attr_p: float | None = None
    deducted_profit: float | None = None
    minority_int: float | None = None
    income_tax: float | None = None
    c_fr_oper: float | None = None
    c_paid_for_assets: float | None = None
    dep_amor: float | None = None

    # Snapshot (balance sheet latest)
    total_assets: float | None = None
    total_liab: float | None = None
    total_hldr_eqy_exc_min_int: float | None = None
    goodwill: float | None = None
    intan_assets: float | None = None
    other_receiv: float | None = None
    inventories: float | None = None
    acct_receiv: float | None = None
    notes_receiv: float | None = None
    acct_payable: float | None = None
    money_cap: float | None = None
    st_borrow: float | None = None
    lt_borrow: float | None = None
    fixed_assets: float | None = None

    # Derived
    ebit: float | None = None           # revenue - cogs - sell - admin + fin_exp
    nopat: float | None = None          # ebit * (1 - effective_tax)
    fcf: float | None = None            # nopat + dep - capex - delta_wc
    effective_tax_rate: float | None = None
    delta_wc: float | None = None       # working capital change
    net_debt: float | None = None       # st_borrow + lt_borrow - money_cap
    ev: float | None = None             # set externally from market data

    warnings: list[str] = field(default_factory=list)


def build_ttm(
    statements: list[dict[str, Any]],
    ts_code: str,
) -> TTMResult | None:
    """
    Build a TTM record from a list of financial statement dicts (quarterly).
    Returns None only if there is absolutely no usable data.
    """
    if not statements:
        return None

    df = pd.DataFrame(statements)
    df = df[df["ts_code"] == ts_code].copy()
    if df.empty:
        return None

    df["end_date"] = pd.to_datetime(df["end_date"])
    df = df.sort_values("end_date", ascending=False)

    # Keep at most 4 most recent quarters
    latest = df["end_date"].iloc[0].date()
    window = df.head(4)
    periods = len(window)
    is_complete = periods == 4

    result = TTMResult(
        ts_code=ts_code,
        as_of_date=latest,
        periods_used=periods,
        is_complete=is_complete,
    )

    if not is_complete:
        result.warnings.append(
            f"TTM incomplete: only {periods}/4 quarters available"
        )

    # Additive fields: sum across quarters
    for col in ADDITIVE_FIELDS:
        if col in window.columns:
            vals = window[col].dropna()
            setattr(result, col, float(vals.sum()) if not vals.empty else None)

    # Snapshot fields: latest non-null value
    latest_row = window.iloc[0]
    for col in SNAPSHOT_FIELDS:
        if col in window.columns:
            # Prefer latest but fall back to previous quarter if latest is null
            val = None
            for _, row in window.iterrows():
                v = row.get(col)
                if v is not None and not (isinstance(v, float) and pd.isna(v)):
                    val = float(v)
                    break
            setattr(result, col, val)

    _derive(result)
    return result


def _derive(r: TTMResult) -> None:
    """Compute derived indicators from base TTM fields."""
    # EBIT
    if all(v is not None for v in [r.revenue, r.total_cogs, r.sell_exp, r.admin_exp, r.fin_exp]):
        r.ebit = r.revenue - r.total_cogs - r.sell_exp - r.admin_exp + r.fin_exp  # type: ignore

    # Effective tax rate
    if r.n_income_attr_p and r.income_tax:
        pre_tax = r.n_income_attr_p + r.income_tax
        r.effective_tax_rate = r.income_tax / pre_tax if pre_tax != 0 else 0.25
    else:
        r.effective_tax_rate = None  # will use 0.25 default in WACC calc

    # NOPAT
    tax = r.effective_tax_rate if r.effective_tax_rate is not None else 0.25
    if r.ebit is not None:
        r.nopat = r.ebit * (1 - tax)

    # Delta working capital (simplified: Δ receivables + Δ inventory - Δ payables)
    # Cannot compute without prior-year balance sheet here; set to None, computed externally.

    # Net debt
    borrow = (r.st_borrow or 0) + (r.lt_borrow or 0)
    cash = r.money_cap or 0
    r.net_debt = borrow - cash

    # FCF = NOPAT + dep_amor - capex (delta_wc handled externally)
    if r.nopat is not None and r.c_paid_for_assets is not None:
        dep = r.dep_amor or 0
        r.fcf = r.nopat + dep - r.c_paid_for_assets


def build_annual_history(
    statements: list[dict[str, Any]],
    ts_code: str,
    n_years: int = 10,
) -> list[dict[str, Any]]:
    """
    Return list of annual snapshots (Q4 or ANNUAL report_type preferred)
    for up to n_years back, sorted ascending by end_date.
    """
    if not statements:
        return []

    df = pd.DataFrame(statements)
    required_cols = {"ts_code", "end_date", "report_type"}
    if not required_cols.issubset(set(df.columns)):
        return []

    df = df[df["ts_code"] == ts_code].copy()
    if df.empty:
        return []
    df["end_date"] = pd.to_datetime(df["end_date"])
    # Prefer ANNUAL then Q4 (end_date month = 12)
    annual = df[
        df["report_type"].isin(["ANNUAL", "A"]) |
        (df["end_date"].dt.month == 12)
    ].copy()
    if annual.empty:
        annual = df.copy()
    annual = annual.sort_values("end_date", ascending=False)
    annual = annual.drop_duplicates(subset=["end_date"], keep="first")
    annual = annual.head(n_years).sort_values("end_date")
    return annual.to_dict("records")
