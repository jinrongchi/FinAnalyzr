from dataclasses import dataclass, field
from typing import Optional


@dataclass
class FinancialData:
    # Identity
    company_name: str = ""
    stock_code: str = ""
    report_period: str = ""
    industry: Optional[str] = None

    # Income Statement
    revenue: Optional[float] = None
    revenue_prev: Optional[float] = None
    net_profit: Optional[float] = None
    net_profit_prev: Optional[float] = None
    gross_profit_margin: Optional[float] = None
    operating_profit: Optional[float] = None

    # Balance Sheet
    total_assets: Optional[float] = None
    total_equity: Optional[float] = None
    total_liabilities: Optional[float] = None
    cash: Optional[float] = None
    current_assets: Optional[float] = None
    current_liabilities: Optional[float] = None

    # Cash Flow
    operating_cash_flow: Optional[float] = None
    free_cash_flow: Optional[float] = None
    capex: Optional[float] = None

    # Per-Share / Ratios
    eps: Optional[float] = None
    eps_prev: Optional[float] = None
    bvps: Optional[float] = None
    current_price: Optional[float] = None
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    roe: Optional[float] = None
    debt_to_equity: Optional[float] = None
    current_ratio: Optional[float] = None
    dividend_yield: Optional[float] = None

    # Market
    market_value: Optional[float] = None
    total_shares: Optional[float] = None

    # Data source tracking
    data_source: str = "manual"
    fetch_errors: list[str] = field(default_factory=list)
