"""Market context and thermometer endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.orm import MacroIndicator
import numpy as np

router = APIRouter()


@router.get("/erp")
async def get_erp(db: AsyncSession = Depends(get_db)):
    """ERP history and current percentile."""
    csi_q = select(MacroIndicator).where(
        MacroIndicator.indicator == "csi300_pe_ttm"
    ).order_by(MacroIndicator.period_date)
    csi_rows = (await db.execute(csi_q)).scalars().all()

    cn10y_q = select(MacroIndicator).where(
        MacroIndicator.indicator == "cn10y_yield"
    ).order_by(MacroIndicator.period_date)
    cn10y_rows = (await db.execute(cn10y_q)).scalars().all()

    cn10y_map = {r.period_date: r.value for r in cn10y_rows}

    erp_series = []
    for r in csi_rows:
        rf = cn10y_map.get(r.period_date)
        if rf and r.value and r.value > 0:
            erp = (1 / r.value) - rf
            erp_series.append({"date": r.period_date.isoformat(), "erp": round(erp, 5)})

    if not erp_series:
        return {"erp_series": [], "current_erp": None, "erp_percentile": None, "status": "no_data"}

    erp_values = [p["erp"] for p in erp_series]
    current = erp_values[-1]
    pct = float(np.percentile(erp_values, np.searchsorted(sorted(erp_values), current) / len(erp_values) * 100))

    status = "neutral"
    if pct >= 0.90:
        status = "extreme_undervalue"
    elif pct >= 0.70:
        status = "undervalue"
    elif pct <= 0.10:
        status = "extreme_overvalue"
    elif pct <= 0.30:
        status = "overvalue"

    return {
        "erp_series": erp_series[-252:],  # last ~1 year
        "current_erp": round(current, 5),
        "erp_percentile": round(pct, 3),
        "status": status,
    }


@router.get("/cn10y")
async def get_cn10y(db: AsyncSession = Depends(get_db)):
    q = select(MacroIndicator).where(
        MacroIndicator.indicator == "cn10y_yield"
    ).order_by(desc(MacroIndicator.period_date)).limit(1)
    row = (await db.execute(q)).scalar_one_or_none()
    return {"cn10y_yield": row.value if row else None, "date": row.period_date.isoformat() if row else None, "source": row.source if row else "unavailable"}
