"""
Batch scan endpoint: return top-N stocks sorted by composite_score.
Uses cached ValuationSnapshot; stocks without a snapshot are skipped.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
import json

from app.db.session import get_db
from app.models.orm import Stock, ValuationSnapshot

router = APIRouter()


@router.get("/")
async def scan_stocks(
    industry_group: str | None = None,
    min_score: float = Query(0.0),
    max_score: float = Query(100.0),
    exclude_st: bool = True,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    from datetime import date
    today = date.today()
    stmt = (
        select(ValuationSnapshot, Stock)
        .join(Stock, ValuationSnapshot.ts_code == Stock.ts_code)
        .where(
            ValuationSnapshot.snapshot_date == today,
            ValuationSnapshot.composite_score >= min_score,
            ValuationSnapshot.composite_score <= max_score,
        )
        .order_by(desc(ValuationSnapshot.composite_score))
        .limit(limit)
    )
    if exclude_st:
        stmt = stmt.where(Stock.is_st == False)
    if industry_group:
        stmt = stmt.where(Stock.industry_group == industry_group)

    rows = (await db.execute(stmt)).all()
    return [
        {
            "ts_code": snap.ts_code,
            "name": stock.name,
            "industry": stock.industry,
            "industry_group": stock.industry_group,
            "is_st": stock.is_st,
            "composite_score": snap.composite_score,
            "recommendation": snap.recommendation,
            "margin_of_safety": snap.margin_of_safety,
            "dcf_base": snap.dcf_intrinsic_base,
            "red_flags": json.loads(snap.red_flags_json or "[]"),
        }
        for snap, stock in rows
    ]
