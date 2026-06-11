"""Sync trigger API endpoints."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.orm import Stock
from app.tasks.sync import sync_stock_basic, sync_financials, sync_daily, sync_macro

router = APIRouter()


@router.post("/stock-basic")
async def trigger_stock_basic(background_tasks: BackgroundTasks):
    # Run async task on the server loop instead of creating a nested event loop.
    background_tasks.add_task(sync_stock_basic)
    return {"status": "queued", "task": "sync_stock_basic"}


@router.post("/stock/{ts_code}")
async def trigger_stock_sync(
    ts_code: str,
    days_back: int = Query(1095, description="Days of daily quotes to fetch"),
    background_tasks: BackgroundTasks = None,
    db: AsyncSession = Depends(get_db),
):
    stock = await db.get(Stock, ts_code)
    if not stock:
        raise HTTPException(404, "Stock not found. Run /sync/stock-basic first.")

    async def _do():
        await sync_financials(ts_code)
        await sync_daily(ts_code, days_back)

    background_tasks.add_task(_do)
    return {"status": "queued", "ts_code": ts_code}


@router.post("/macro")
async def trigger_macro_sync(background_tasks: BackgroundTasks):
    background_tasks.add_task(sync_macro)
    return {"status": "queued", "task": "sync_macro"}
