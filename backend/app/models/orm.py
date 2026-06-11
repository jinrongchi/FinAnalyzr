"""
SQLAlchemy ORM models – all financial amounts stored in 万元 (10k CNY).
TimescaleDB hypertable candidates: DailyQuote, FinancialStatement, MacroIndicator.
"""
from datetime import date, datetime
from sqlalchemy import (
    String, Float, Integer, Boolean, Date, DateTime, Text, Index,
    ForeignKey, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base


class Stock(Base):
    """Master stock list from stock_basic."""
    __tablename__ = "stock"

    ts_code: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    industry: Mapped[str | None] = mapped_column(String(50))
    industry_group: Mapped[str | None] = mapped_column(String(50))  # mapped IndustryGroup
    list_date: Mapped[date | None] = mapped_column(Date)
    market: Mapped[str | None] = mapped_column(String(20))   # 主板/创业板/科创板
    is_st: Mapped[bool] = mapped_column(Boolean, default=False)
    is_delisted: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    quotes: Mapped[list["DailyQuote"]] = relationship(back_populates="stock", lazy="noload")
    statements: Mapped[list["FinancialStatement"]] = relationship(back_populates="stock", lazy="noload")


class DailyQuote(Base):
    """Daily market data (daily + daily_basic merged)."""
    __tablename__ = "daily_quote"
    __table_args__ = (
        UniqueConstraint("ts_code", "trade_date"),
        Index("ix_dq_ts_date", "ts_code", "trade_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts_code: Mapped[str] = mapped_column(String(20), ForeignKey("stock.ts_code"), index=True)
    trade_date: Mapped[date] = mapped_column(Date, index=True)
    close: Mapped[float | None] = mapped_column(Float)
    adj_factor: Mapped[float | None] = mapped_column(Float)
    adj_close: Mapped[float | None] = mapped_column(Float)  # close * adj_factor
    total_mv: Mapped[float | None] = mapped_column(Float)   # 万元
    circ_mv: Mapped[float | None] = mapped_column(Float)    # 万元
    pe: Mapped[float | None] = mapped_column(Float)
    pe_ttm: Mapped[float | None] = mapped_column(Float)
    pb: Mapped[float | None] = mapped_column(Float)
    turnover_rate_f: Mapped[float | None] = mapped_column(Float)

    stock: Mapped["Stock"] = relationship(back_populates="quotes", lazy="noload")


class FinancialStatement(Base):
    """
    Normalised quarterly financial data (income + balancesheet + cashflow merged).
    end_date = report period end (e.g. 20241231 for Q4).
    All monetary amounts in 万元.
    """
    __tablename__ = "financial_statement"
    __table_args__ = (
        UniqueConstraint("ts_code", "end_date", "report_type"),
        Index("ix_fs_ts_end", "ts_code", "end_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts_code: Mapped[str] = mapped_column(String(20), ForeignKey("stock.ts_code"), index=True)
    end_date: Mapped[date] = mapped_column(Date, index=True)
    report_type: Mapped[str] = mapped_column(String(10), default="Q")  # Q1/Q2/Q3/Q4/ANNUAL

    # Income statement
    revenue: Mapped[float | None] = mapped_column(Float)
    total_cogs: Mapped[float | None] = mapped_column(Float)
    sell_exp: Mapped[float | None] = mapped_column(Float)
    admin_exp: Mapped[float | None] = mapped_column(Float)
    fin_exp: Mapped[float | None] = mapped_column(Float)
    n_income_attr_p: Mapped[float | None] = mapped_column(Float)   # 归母净利润
    deducted_profit: Mapped[float | None] = mapped_column(Float)   # 扣非净利润
    minority_int: Mapped[float | None] = mapped_column(Float)
    income_tax: Mapped[float | None] = mapped_column(Float)

    # Balance sheet
    total_assets: Mapped[float | None] = mapped_column(Float)
    total_liab: Mapped[float | None] = mapped_column(Float)
    total_hldr_eqy_exc_min_int: Mapped[float | None] = mapped_column(Float)  # 归母净资产
    goodwill: Mapped[float | None] = mapped_column(Float)
    intan_assets: Mapped[float | None] = mapped_column(Float)
    other_receiv: Mapped[float | None] = mapped_column(Float)       # 其他应收款
    inventories: Mapped[float | None] = mapped_column(Float)
    acct_receiv: Mapped[float | None] = mapped_column(Float)        # 应收账款
    notes_receiv: Mapped[float | None] = mapped_column(Float)       # 应收票据
    acct_payable: Mapped[float | None] = mapped_column(Float)
    money_cap: Mapped[float | None] = mapped_column(Float)          # 货币资金
    st_borrow: Mapped[float | None] = mapped_column(Float)
    lt_borrow: Mapped[float | None] = mapped_column(Float)
    fixed_assets: Mapped[float | None] = mapped_column(Float)

    # Cash flow
    c_fr_oper: Mapped[float | None] = mapped_column(Float)          # 经营活动现金流
    c_paid_for_assets: Mapped[float | None] = mapped_column(Float)  # CapEx
    dep_amor: Mapped[float | None] = mapped_column(Float)           # 折旧摊销

    stock: Mapped["Stock"] = relationship(back_populates="statements", lazy="noload")


class MacroIndicator(Base):
    """Macro time series: CGB yield, CPI, CSI300 PE/PB."""
    __tablename__ = "macro_indicator"
    __table_args__ = (
        UniqueConstraint("indicator", "period_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    indicator: Mapped[str] = mapped_column(String(50), index=True)
    period_date: Mapped[date] = mapped_column(Date, index=True)
    value: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(20), default="auto")  # DataSource label


class ValuationSnapshot(Base):
    """Cached valuation results per stock per date."""
    __tablename__ = "valuation_snapshot"
    __table_args__ = (
        UniqueConstraint("ts_code", "snapshot_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts_code: Mapped[str] = mapped_column(String(20), index=True)
    snapshot_date: Mapped[date] = mapped_column(Date, index=True)
    composite_score: Mapped[float | None] = mapped_column(Float)
    recommendation: Mapped[str | None] = mapped_column(String(30))
    dcf_intrinsic_bear: Mapped[float | None] = mapped_column(Float)
    dcf_intrinsic_base: Mapped[float | None] = mapped_column(Float)
    dcf_intrinsic_bull: Mapped[float | None] = mapped_column(Float)
    margin_of_safety: Mapped[float | None] = mapped_column(Float)
    red_flags_json: Mapped[str | None] = mapped_column(Text)   # JSON list
    scores_json: Mapped[str | None] = mapped_column(Text)      # JSON dict of sub-scores
    sources_json: Mapped[str | None] = mapped_column(Text)     # JSON dict of DataSource per field
    manual_overrides_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ManualOverride(Base):
    """User-supplied values for fields unavailable from Tushare."""
    __tablename__ = "manual_override"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts_code: Mapped[str] = mapped_column(String(20), index=True)
    field_name: Mapped[str] = mapped_column(String(60))
    value: Mapped[float] = mapped_column(Float)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("ts_code", "field_name"),)
