from fastapi import APIRouter
from app.api.v1 import stocks, valuation, market, manual_inputs, sync, scan

router = APIRouter()
router.include_router(stocks.router, prefix="/stocks", tags=["stocks"])
router.include_router(valuation.router, prefix="/valuation", tags=["valuation"])
router.include_router(market.router, prefix="/market", tags=["market"])
router.include_router(manual_inputs.router, prefix="/manual", tags=["manual"])
router.include_router(sync.router, prefix="/sync", tags=["sync"])
router.include_router(scan.router, prefix="/scan", tags=["scan"])
