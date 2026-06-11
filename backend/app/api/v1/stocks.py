"""Stock list and search endpoints."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.orm import Stock

router = APIRouter()


@router.get("/")
async def list_stocks(
    q: str | None = Query(None, description="Search by code or name"),
    industry: str | None = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Stock).where(Stock.is_delisted == False)
    if q:
        stmt = stmt.where(
            or_(Stock.ts_code.ilike(f"%{q}%"), Stock.name.ilike(f"%{q}%"))
        )
    if industry:
        stmt = stmt.where(Stock.industry_group == industry)
    stmt = stmt.order_by(Stock.ts_code).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "ts_code": s.ts_code,
            "name": s.name,
            "industry": s.industry,
            "industry_group": s.industry_group,
            "list_date": s.list_date,
            "market": s.market,
            "is_st": s.is_st,
        }
        for s in rows
    ]


@router.get("/{ts_code}")
async def get_stock(ts_code: str, db: AsyncSession = Depends(get_db)):
    row = await db.get(Stock, ts_code)
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Stock not found")
    return {
        "ts_code": row.ts_code,
        "name": row.name,
        "industry": row.industry,
        "industry_group": row.industry_group,
        "list_date": row.list_date,
        "market": row.market,
        "is_st": row.is_st,
    }
