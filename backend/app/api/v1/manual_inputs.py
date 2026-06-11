"""Manual override inputs – for fields Tushare cannot reliably supply."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.orm import ManualOverride

router = APIRouter()

ALLOWED_FIELDS = {
    "cn10y_yield": "10年期国债收益率 (小数，如0.028)",
    "beta": "个股Beta值",
    "wacc": "WACC (小数，如0.09)",
    "effective_tax_rate": "有效税率 (小数，如0.25)",
    "div_per_share": "近3年平均每股分红 (元)",
    "cost_of_debt": "债务成本 (小数)",
}


class OverrideIn(BaseModel):
    field_name: str
    value: float
    note: str | None = None


@router.get("/fields")
async def get_allowed_fields():
    """List fields that can be manually overridden."""
    return [{"field_name": k, "description": v} for k, v in ALLOWED_FIELDS.items()]


@router.get("/{ts_code}")
async def get_overrides(ts_code: str, db: AsyncSession = Depends(get_db)):
    q = select(ManualOverride).where(ManualOverride.ts_code == ts_code)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "field_name": r.field_name,
            "value": r.value,
            "note": r.note,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.put("/{ts_code}")
async def upsert_override(ts_code: str, body: OverrideIn, db: AsyncSession = Depends(get_db)):
    if body.field_name not in ALLOWED_FIELDS:
        raise HTTPException(400, f"Field '{body.field_name}' is not overridable. Allowed: {list(ALLOWED_FIELDS)}")
    q = select(ManualOverride).where(
        ManualOverride.ts_code == ts_code,
        ManualOverride.field_name == body.field_name,
    )
    existing = (await db.execute(q)).scalar_one_or_none()
    if existing:
        existing.value = body.value
        existing.note = body.note
    else:
        db.add(ManualOverride(
            ts_code=ts_code, field_name=body.field_name,
            value=body.value, note=body.note,
        ))
    await db.commit()
    return {"status": "saved", "field_name": body.field_name, "value": body.value, "source": "manual"}


@router.delete("/{ts_code}/{field_name}")
async def delete_override(ts_code: str, field_name: str, db: AsyncSession = Depends(get_db)):
    q = select(ManualOverride).where(
        ManualOverride.ts_code == ts_code,
        ManualOverride.field_name == field_name,
    )
    existing = (await db.execute(q)).scalar_one_or_none()
    if not existing:
        raise HTTPException(404, "Override not found")
    await db.delete(existing)
    await db.commit()
    return {"status": "deleted"}
