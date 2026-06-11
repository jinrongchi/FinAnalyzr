"""Sync trigger API endpoints."""
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.orm import Stock
from app.tasks.sync import sync_stock_basic, sync_financials, sync_daily, sync_macro

router = APIRouter()


_sync_status: dict[str, dict[str, Any]] = {
    "sync_stock_basic": {"state": "idle", "started_at": None, "finished_at": None, "error": None, "detail": None},
    "sync_macro": {"state": "idle", "started_at": None, "finished_at": None, "error": None, "detail": None},
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _run_task(task_name: str, fn, detail: dict[str, Any] | None = None):
    _sync_status.setdefault(task_name, {"state": "idle", "started_at": None, "finished_at": None, "error": None, "detail": None})
    _sync_status[task_name].update({
        "state": "running",
        "started_at": _now_iso(),
        "finished_at": None,
        "error": None,
        "detail": detail,
    })
    try:
        await fn()
        _sync_status[task_name].update({
            "state": "success",
            "finished_at": _now_iso(),
        })
    except Exception as exc:
        _sync_status[task_name].update({
            "state": "failed",
            "finished_at": _now_iso(),
            "error": str(exc),
        })
        raise


@router.get("/status")
async def sync_status_all():
    return _sync_status


@router.get("/status/{task_name}")
async def sync_status_one(task_name: str):
    st = _sync_status.get(task_name)
    if not st:
        raise HTTPException(404, f"Unknown task: {task_name}")
    return st


@router.post("/stock-basic")
async def trigger_stock_basic(background_tasks: BackgroundTasks):
    # Run async task on the server loop instead of creating a nested event loop.
    background_tasks.add_task(_run_task, "sync_stock_basic", sync_stock_basic)
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

    task_name = f"sync_stock_{ts_code}"

    async def _do():
        await sync_financials(ts_code)
        await sync_daily(ts_code, days_back)

    background_tasks.add_task(_run_task, task_name, _do, {"ts_code": ts_code, "days_back": days_back})
    return {"status": "queued", "task": task_name, "ts_code": ts_code}


@router.post("/macro")
async def trigger_macro_sync(background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_task, "sync_macro", sync_macro)
    return {"status": "queued", "task": "sync_macro"}
