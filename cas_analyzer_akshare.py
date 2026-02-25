"""
Chinese CAS (China A-Share) Quarterly Report Analyzer
Integrated with AkShare for real market & financial data.

Install:
    pip install akshare pandas rich

Usage:
    python cas_analyzer_akshare.py --code 300750          # Single stock
    python cas_analyzer_akshare.py --code 300750 002594   # Multiple stocks
    python cas_analyzer_akshare.py --code 300750 --export # Save report to CSV
    python cas_analyzer_akshare.py --demo                 # Offline demo (no AkShare)

Python 3.12+
"""

import argparse
import sys
import warnings
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

warnings.filterwarnings("ignore")

# ── Optional rich for pretty output ───────────────────────────
try:
    from rich.console import Console
    from rich.table import Table
    from rich import box
    from rich.text import Text
    from rich.panel import Panel
    console = Console()
    RICH = True
except ImportError:
    RICH = False
    console = None

# ── AkShare ───────────────────────────────────────────────────
try:
    import akshare as ak
    import pandas as pd
    AKSHARE_AVAILABLE = True
except ImportError:
    AKSHARE_AVAILABLE = False


# ═════════════════════════════════════════════════════════════
# Data Structures
# ═════════════════════════════════════════════════════════════

class Recommendation(Enum):
    STRONG_BUY  = "STRONG BUY ★★"
    BUY         = "BUY ★"
    HOLD        = "HOLD ◆"
    SELL        = "SELL ▼"
    STRONG_SELL = "STRONG SELL ▼▼"


@dataclass
class FinancialData:
    # Identity
    company_name: str = ""
    stock_code: str = ""
    report_period: str = ""

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
    market_cap: Optional[float] = None
    total_shares: Optional[float] = None

    # Data source tracking
    data_source: str = "manual"
    fetch_errors: list[str] = field(default_factory=list)


@dataclass
class AnalysisResult:
    financial_data: FinancialData
    scores: dict[str, float] = field(default_factory=dict)
    total_score: float = 0.0
    recommendation: Recommendation = Recommendation.HOLD
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# ═════════════════════════════════════════════════════════════
# AkShare Data Fetcher
# ═════════════════════════════════════════════════════════════

class AkShareFetcher:
    """
    Fetches real financial data for A-share stocks using AkShare.

    Key AkShare APIs used:
        ak.stock_individual_info_em()       – company info & basic stats
        ak.stock_financial_abstract()       – financial summary (multi-period)
        ak.stock_financial_report_sina()    – income / balance / cash flow
        ak.stock_a_indicator_lg()           – PE, PB, ROE etc.
        ak.stock_zh_a_hist()                – recent price history
    """

    def fetch(self, code: str) -> FinancialData:
        """Main entry point. Returns a populated FinancialData."""
        fd = FinancialData(stock_code=code, data_source="akshare")

        # Normalise code  (strip exchange prefix if present)
        clean_code = code.replace("sh", "").replace("sz", "").strip()
        fd.stock_code = clean_code

        print(f"\n  [AkShare] Fetching data for {clean_code} …")

        self._fetch_basic_info(fd, clean_code)
        self._fetch_financial_indicators(fd, clean_code)
        self._fetch_income_statement(fd, clean_code)
        self._fetch_balance_sheet(fd, clean_code)
        self._fetch_cash_flow(fd, clean_code)
        self._fetch_current_price(fd, clean_code)
        self._derive_ratios(fd)

        return fd

    # ── Individual fetchers (each wrapped in try/except) ───────

    def _fetch_basic_info(self, fd: FinancialData, code: str):
        try:
            df = ak.stock_individual_info_em(symbol=code)
            info = dict(zip(df.iloc[:, 0], df.iloc[:, 1]))
            fd.company_name = str(info.get("股票简称", info.get("名称", code)))
            fd.total_shares = self._to_float(info.get("总股本"))
            fd.market_cap   = self._to_float(info.get("总市值"))
        except Exception as e:
            fd.fetch_errors.append(f"basic_info: {e}")

    def _fetch_financial_indicators(self, fd: FinancialData, code: str):
        """PE, PB, ROE, dividend yield from indicator endpoint."""
        try:
            df = ak.stock_a_indicator_lg(symbol=code)
            if df is None or df.empty:
                return
            latest = df.sort_values("trade_date", ascending=False).iloc[0]

            fd.pe_ratio       = self._to_float(latest.get("pe"))
            fd.pb_ratio       = self._to_float(latest.get("pb"))
            fd.roe            = self._to_float(latest.get("roe"))
            fd.dividend_yield = self._to_float(latest.get("dv_ratio"))
            fd.bvps           = self._to_float(latest.get("bps"))
        except Exception as e:
            fd.fetch_errors.append(f"indicators: {e}")

        # Fallback: try eastmoney financial abstract
        if fd.pe_ratio is None:
            try:
                df2 = ak.stock_financial_abstract(symbol=code)
                if df2 is not None and not df2.empty:
                    row = df2.iloc[0]
                    fd.roe = fd.roe or self._to_float(row.get("净资产收益率(%)"))
                    fd.eps = fd.eps or self._to_float(row.get("每股收益(元)"))
            except Exception as e2:
                fd.fetch_errors.append(f"financial_abstract: {e2}")

    def _fetch_income_statement(self, fd: FinancialData, code: str):
        """Revenue, net profit, gross margin from Sina income statement."""
        try:
            df = ak.stock_financial_report_sina(stock=code, symbol="利润表")
            if df is None or df.empty:
                return

            df = df.set_index(df.columns[0])

            def row(key_candidates):
                for k in key_candidates:
                    if k in df.index:
                        return df.loc[k]
                return None

            rev_row = row(["营业总收入", "营业收入"])
            np_row  = row(["归属于母公司所有者的净利润", "净利润"])
            gp_row  = row(["毛利率(%)", "毛利率"])
            op_row  = row(["营业利润"])
            eps_row = row(["基本每股收益(元)", "基本每股收益"])

            cols = list(df.columns)  # sorted newest first typically

            def get_val(series, idx=0):
                if series is None or len(series) <= idx:
                    return None
                return self._to_float(series.iloc[idx])

            fd.revenue          = get_val(rev_row, 0)
            fd.revenue_prev     = get_val(rev_row, 4)   # ~1 year ago (quarterly = 4 periods)
            fd.net_profit       = get_val(np_row,  0)
            fd.net_profit_prev  = get_val(np_row,  4)
            fd.operating_profit = get_val(op_row,  0)
            fd.eps              = fd.eps or get_val(eps_row, 0)
            fd.eps_prev         = get_val(eps_row, 4)

            if gp_row is not None:
                fd.gross_profit_margin = get_val(gp_row, 0)

            # Derive gross margin from revenue & COGS if not provided
            if fd.gross_profit_margin is None:
                cogs_row = row(["营业成本"])
                cogs = get_val(cogs_row, 0)
                if cogs and fd.revenue and fd.revenue != 0:
                    fd.gross_profit_margin = (fd.revenue - cogs) / fd.revenue * 100

            # Set period label from column header
            if cols:
                fd.report_period = str(cols[0])[:10]

        except Exception as e:
            fd.fetch_errors.append(f"income_statement: {e}")

    def _fetch_balance_sheet(self, fd: FinancialData, code: str):
        try:
            df = ak.stock_financial_report_sina(stock=code, symbol="资产负债表")
            if df is None or df.empty:
                return

            df = df.set_index(df.columns[0])

            def row(keys):
                for k in keys:
                    if k in df.index:
                        return df.loc[k]
                return None

            def get_val(series, idx=0):
                if series is None or len(series) <= idx:
                    return None
                return self._to_float(series.iloc[idx])

            fd.total_assets       = get_val(row(["资产总计", "总资产"]))
            fd.total_equity       = get_val(row(["归属于母公司所有者权益合计",
                                                  "所有者权益合计", "股东权益合计"]))
            fd.total_liabilities  = get_val(row(["负债合计"]))
            fd.cash               = get_val(row(["货币资金"]))
            fd.current_assets     = get_val(row(["流动资产合计"]))
            fd.current_liabilities= get_val(row(["流动负债合计"]))

            if fd.total_assets and fd.total_liabilities:
                fd.debt_to_equity = fd.total_liabilities / fd.total_assets * 100

            if fd.current_assets and fd.current_liabilities and fd.current_liabilities != 0:
                fd.current_ratio = fd.current_assets / fd.current_liabilities

            if fd.total_equity and fd.total_equity != 0:
                total_shares = fd.total_shares
                if total_shares:
                    fd.bvps = fd.bvps or (fd.total_equity / total_shares)

        except Exception as e:
            fd.fetch_errors.append(f"balance_sheet: {e}")

    def _fetch_cash_flow(self, fd: FinancialData, code: str):
        try:
            df = ak.stock_financial_report_sina(stock=code, symbol="现金流量表")
            if df is None or df.empty:
                return

            df = df.set_index(df.columns[0])

            def row(keys):
                for k in keys:
                    if k in df.index:
                        return df.loc[k]
                return None

            def get_val(series, idx=0):
                if series is None or len(series) <= idx:
                    return None
                return self._to_float(series.iloc[idx])

            fd.operating_cash_flow = get_val(row(["经营活动产生的现金流量净额",
                                                    "经营活动现金流量净额"]))
            capex_row = row(["购建固定资产、无形资产和其他长期资产支付的现金",
                              "购置固定资产支付的现金"])
            fd.capex = get_val(capex_row)

            if fd.operating_cash_flow is not None and fd.capex is not None:
                fd.free_cash_flow = fd.operating_cash_flow - abs(fd.capex)

        except Exception as e:
            fd.fetch_errors.append(f"cash_flow: {e}")

    def _fetch_current_price(self, fd: FinancialData, code: str):
        try:
            df = ak.stock_zh_a_hist(
                symbol=code,
                period="daily",
                adjust="qfq",
                start_date=self._days_ago(7),
                end_date=self._today(),
            )
            if df is not None and not df.empty:
                fd.current_price = float(df.iloc[-1]["收盘"])
        except Exception as e:
            fd.fetch_errors.append(f"price: {e}")

    def _derive_ratios(self, fd: FinancialData):
        """Fill in any remaining ratios from raw figures."""
        if fd.pe_ratio is None and fd.current_price and fd.eps and fd.eps != 0:
            fd.pe_ratio = fd.current_price / fd.eps

        if fd.pb_ratio is None and fd.current_price and fd.bvps and fd.bvps != 0:
            fd.pb_ratio = fd.current_price / fd.bvps

        if fd.roe is None and fd.net_profit and fd.total_equity and fd.total_equity != 0:
            fd.roe = fd.net_profit / fd.total_equity * 100

    # ── Helpers ────────────────────────────────────────────────

    @staticmethod
    def _to_float(val) -> Optional[float]:
        if val is None:
            return None
        try:
            s = str(val).replace(",", "").replace("%", "").strip()
            if s in ("--", "-", "", "nan", "None"):
                return None
            return float(s)
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _today() -> str:
        from datetime import date
        return date.today().strftime("%Y%m%d")

    @staticmethod
    def _days_ago(n: int) -> str:
        from datetime import date, timedelta
        return (date.today() - timedelta(days=n)).strftime("%Y%m%d")


# ═════════════════════════════════════════════════════════════
# Scoring Engine (same multi-category logic)
# ═════════════════════════════════════════════════════════════

class CASAnalyzer:
    """Score -50 to +50 → Recommendation."""

    def analyze(self, fd: FinancialData) -> AnalysisResult:
        result = AnalysisResult(financial_data=fd)
        result.scores["revenue_growth"]   = self._score_revenue_growth(fd, result)
        result.scores["profitability"]    = self._score_profitability(fd, result)
        result.scores["valuation"]        = self._score_valuation(fd, result)
        result.scores["financial_health"] = self._score_financial_health(fd, result)
        result.scores["cash_flow"]        = self._score_cash_flow(fd, result)
        result.total_score = sum(result.scores.values())
        result.recommendation = self._map_rec(result.total_score)
        return result

    # ── Scorers ────────────────────────────────────────────────

    def _score_revenue_growth(self, fd, r) -> float:
        s = 0.0
        if fd.revenue and fd.revenue_prev and fd.revenue_prev != 0:
            g = (fd.revenue - fd.revenue_prev) / abs(fd.revenue_prev) * 100
            if   g > 30:  s += 10; r.reasons.append(f"Revenue growth outstanding: +{g:.1f}% YoY")
            elif g > 15:  s +=  7; r.reasons.append(f"Revenue growth strong: +{g:.1f}% YoY")
            elif g >  5:  s +=  4; r.reasons.append(f"Revenue growth moderate: +{g:.1f}% YoY")
            elif g >  0:  s +=  1; r.reasons.append(f"Revenue growth slow: +{g:.1f}% YoY")
            elif g > -10: s -=  3; r.warnings.append(f"Revenue declining slightly: {g:.1f}% YoY")
            else:         s -=  7; r.warnings.append(f"Revenue declining sharply: {g:.1f}% YoY")
        else:
            r.warnings.append("Revenue YoY comparison data unavailable")
        return s

    def _score_profitability(self, fd, r) -> float:
        s = 0.0
        if fd.gross_profit_margin is not None:
            g = fd.gross_profit_margin
            if   g > 40: s += 4; r.reasons.append(f"High gross margin: {g:.1f}%")
            elif g > 25: s += 2; r.reasons.append(f"Decent gross margin: {g:.1f}%")
            elif g < 10: s -= 3; r.warnings.append(f"Low gross margin: {g:.1f}%")

        if fd.net_profit and fd.net_profit_prev and fd.net_profit_prev != 0:
            g = (fd.net_profit - fd.net_profit_prev) / abs(fd.net_profit_prev) * 100
            if   g > 30:  s += 6; r.reasons.append(f"Net profit growth strong: +{g:.1f}%")
            elif g > 10:  s += 3; r.reasons.append(f"Net profit growth moderate: +{g:.1f}%")
            elif g >  0:  s += 1
            elif g > -20: s -= 2; r.warnings.append(f"Net profit declining: {g:.1f}%")
            else:         s -= 6; r.warnings.append(f"Net profit sharply declining: {g:.1f}%")

        if fd.roe is not None:
            if   fd.roe > 20: s += 3; r.reasons.append(f"Excellent ROE: {fd.roe:.1f}%")
            elif fd.roe > 10: s += 1; r.reasons.append(f"Adequate ROE: {fd.roe:.1f}%")
            elif fd.roe <  0: s -= 4; r.warnings.append(f"Negative ROE: {fd.roe:.1f}%")

        if fd.net_profit is not None and fd.net_profit < 0:
            s -= 5; r.warnings.append("Company reporting net loss this period")

        return max(-10, min(10, s))

    def _score_valuation(self, fd, r) -> float:
        s = 0.0
        pe = fd.pe_ratio or (fd.current_price / fd.eps if fd.current_price and fd.eps and fd.eps != 0 else None)
        if pe is not None:
            if   pe <  0:  s -= 5; r.warnings.append(f"Negative P/E (loss-making): {pe:.1f}x")
            elif pe < 10:  s += 5; r.reasons.append(f"Undervalued P/E: {pe:.1f}x")
            elif pe < 20:  s += 3; r.reasons.append(f"Reasonable P/E: {pe:.1f}x")
            elif pe < 35:  s += 0
            elif pe < 60:  s -= 3; r.warnings.append(f"High P/E: {pe:.1f}x — strong growth required")
            else:          s -= 6; r.warnings.append(f"Very high P/E risk: {pe:.1f}x")

        pb = fd.pb_ratio or (fd.current_price / fd.bvps if fd.current_price and fd.bvps and fd.bvps != 0 else None)
        if pb is not None:
            if   pb < 1: s += 4; r.reasons.append(f"Trading below book value (P/B {pb:.2f}x)")
            elif pb < 2: s += 2; r.reasons.append(f"Fair P/B: {pb:.2f}x")
            elif pb < 4: s += 0
            elif pb < 8: s -= 2; r.warnings.append(f"High P/B: {pb:.2f}x")
            else:        s -= 4; r.warnings.append(f"Very high P/B: {pb:.2f}x")

        if fd.dividend_yield and fd.dividend_yield > 3:
            s += 2; r.reasons.append(f"Attractive dividend yield: {fd.dividend_yield:.1f}%")

        return max(-10, min(10, s))

    def _score_financial_health(self, fd, r) -> float:
        s = 0.0
        dte = fd.debt_to_equity
        if dte is None and fd.total_liabilities and fd.total_assets and fd.total_assets != 0:
            dte = fd.total_liabilities / fd.total_assets * 100
        if dte is not None:
            if   dte < 30: s += 4; r.reasons.append(f"Low leverage: {dte:.1f}% debt ratio")
            elif dte < 50: s += 2
            elif dte < 70: s -= 1
            elif dte < 85: s -= 4; r.warnings.append(f"High leverage: {dte:.1f}%")
            else:          s -= 7; r.warnings.append(f"Extremely high leverage: {dte:.1f}%")

        cr = fd.current_ratio
        if cr is None and fd.current_assets and fd.current_liabilities and fd.current_liabilities != 0:
            cr = fd.current_assets / fd.current_liabilities
        if cr is not None:
            if   cr > 2:   s += 3; r.reasons.append(f"Strong liquidity (CR {cr:.2f})")
            elif cr > 1.5: s += 1
            elif cr < 1:   s -= 4; r.warnings.append(f"Poor liquidity (CR {cr:.2f})")

        if fd.cash and fd.total_assets:
            cr_pct = fd.cash / fd.total_assets
            if   cr_pct > 0.2: s += 2; r.reasons.append(f"Strong cash position: {cr_pct*100:.1f}% of assets")
            elif cr_pct < 0.05: s -= 1; r.warnings.append("Low cash reserves")

        return max(-10, min(10, s))

    def _score_cash_flow(self, fd, r) -> float:
        s = 0.0
        if fd.operating_cash_flow is not None:
            ocf = fd.operating_cash_flow
            if ocf > 0:
                s += 3; r.reasons.append(f"Positive operating cash flow: ¥{ocf/1e8:.2f}B")
                if fd.net_profit and fd.net_profit > 0:
                    ratio = ocf / fd.net_profit
                    if   ratio > 1.2: s += 3; r.reasons.append(f"High earnings quality (OCF/NP {ratio:.2f}x)")
                    elif ratio > 0.8: s += 1
                    elif ratio < 0.3: s -= 2; r.warnings.append(f"Low earnings quality (OCF/NP {ratio:.2f}x)")
            else:
                s -= 5; r.warnings.append(f"Negative operating cash flow: ¥{ocf/1e8:.2f}B")

        if fd.free_cash_flow is not None:
            if   fd.free_cash_flow > 0: s += 2; r.reasons.append(f"Positive free cash flow: ¥{fd.free_cash_flow/1e8:.2f}B")
            else:                        s -= 1; r.warnings.append("Negative free cash flow")

        return max(-10, min(10, s))

    @staticmethod
    def _map_rec(score: float) -> Recommendation:
        if   score > 20:  return Recommendation.STRONG_BUY
        elif score >  8:  return Recommendation.BUY
        elif score > -8:  return Recommendation.HOLD
        elif score > -20: return Recommendation.SELL
        else:             return Recommendation.STRONG_SELL


# ═════════════════════════════════════════════════════════════
# Report Printer (rich or plain fallback)
# ═════════════════════════════════════════════════════════════

REC_COLORS = {
    Recommendation.STRONG_BUY:  ("bright_green",  "\033[92m"),
    Recommendation.BUY:         ("green",          "\033[32m"),
    Recommendation.HOLD:        ("yellow",         "\033[33m"),
    Recommendation.SELL:        ("red",            "\033[31m"),
    Recommendation.STRONG_SELL: ("bright_red",     "\033[91m"),
}
RESET = "\033[0m"


def fmt_yuan(v: Optional[float]) -> str:
    if v is None:
        return "N/A"
    if abs(v) >= 1e12:
        return f"¥{v/1e12:.2f}T"
    if abs(v) >= 1e8:
        return f"¥{v/1e8:.2f}B"
    if abs(v) >= 1e4:
        return f"¥{v/1e4:.2f}万"
    return f"¥{v:.2f}"


def fmt_pct(v: Optional[float]) -> str:
    return f"{v:.2f}%" if v is not None else "N/A"


def fmt_x(v: Optional[float]) -> str:
    return f"{v:.2f}x" if v is not None else "N/A"


def print_report(result: AnalysisResult) -> None:
    fd  = result.financial_data
    rec = result.recommendation
    rich_color, ansi_color = REC_COLORS.get(rec, ("white", ""))

    if RICH:
        _print_rich(result, fd, rec, rich_color)
    else:
        _print_plain(result, fd, rec, ansi_color)


def _print_rich(result, fd, rec, color):
    from rich.columns import Columns

    console.print()
    console.rule(f"[bold]CAS Analysis Report[/bold]")

    # Header
    console.print(f"  [bold]Company:[/bold]  {fd.company_name}  ([cyan]{fd.stock_code}[/cyan])")
    console.print(f"  [bold]Period  :[/bold]  {fd.report_period or 'N/A'}")
    console.print(f"  [bold]Price   :[/bold]  {fmt_yuan(fd.current_price)}   "
                  f"[bold]Market Cap:[/bold]  {fmt_yuan(fd.market_cap)}")
    console.print()

    # Key metrics table
    t = Table(title="Key Financial Metrics", box=box.SIMPLE_HEAVY, show_header=True)
    t.add_column("Metric", style="cyan", width=28)
    t.add_column("Value", justify="right")
    t.add_column("Metric", style="cyan", width=28)
    t.add_column("Value", justify="right")

    rows = [
        ("Revenue",            fmt_yuan(fd.revenue),              "Revenue (prev yr)",  fmt_yuan(fd.revenue_prev)),
        ("Net Profit",         fmt_yuan(fd.net_profit),           "Net Profit (prev yr)",fmt_yuan(fd.net_profit_prev)),
        ("Gross Margin",       fmt_pct(fd.gross_profit_margin),   "ROE",                fmt_pct(fd.roe)),
        ("P/E Ratio",          fmt_x(fd.pe_ratio),                "P/B Ratio",          fmt_x(fd.pb_ratio)),
        ("Debt Ratio",         fmt_pct(fd.debt_to_equity),        "Current Ratio",      fmt_x(fd.current_ratio)),
        ("Operating CF",       fmt_yuan(fd.operating_cash_flow),  "Free CF",            fmt_yuan(fd.free_cash_flow)),
        ("EPS",                f"¥{fd.eps:.3f}" if fd.eps else "N/A",  "BVPS",         f"¥{fd.bvps:.2f}" if fd.bvps else "N/A"),
        ("Cash",               fmt_yuan(fd.cash),                 "Total Assets",       fmt_yuan(fd.total_assets)),
    ]
    for r in rows:
        t.add_row(*r)
    console.print(t)

    # Scores table
    s_table = Table(title="Category Scores", box=box.SIMPLE, show_header=True)
    s_table.add_column("Category", style="cyan", width=22)
    s_table.add_column("Score", justify="right", width=8)
    s_table.add_column("Bar", width=24)
    for cat, score in result.scores.items():
        bar_len = int(abs(score))
        bar = ("█" * bar_len) + ("░" * (10 - bar_len))
        score_color = "green" if score >= 0 else "red"
        s_table.add_row(cat.replace("_", " ").title(),
                        f"[{score_color}]{score:+.1f}[/{score_color}]",
                        f"[{score_color}]{bar}[/{score_color}]")
    s_table.add_row("[bold]TOTAL[/bold]",
                    f"[bold {color}]{result.total_score:+.1f}[/bold {color}]",
                    "")
    console.print(s_table)

    # Recommendation
    console.print(Panel(
        f"[bold {color}]  ★  {rec.value}  ★\n  Score: {result.total_score:+.1f} / 50[/bold {color}]",
        title="Recommendation",
        border_style=color,
        width=50,
    ))

    # Reasons / warnings
    console.print("\n  [bold green]✅ Positive Factors:[/bold green]")
    for r in result.reasons or ["None identified"]:
        console.print(f"     [green]•[/green] {r}")

    console.print("\n  [bold red]⚠️  Risk Factors:[/bold red]")
    for w in result.warnings or ["None identified"]:
        console.print(f"     [red]•[/red] {w}")

    if fd.fetch_errors:
        console.print(f"\n  [dim]Data fetch notes: {'; '.join(fd.fetch_errors[:3])}[/dim]")

    console.rule()


def _print_plain(result, fd, rec, ansi_color):
    print("\n" + "═"*62)
    print("  CAS Analysis Report")
    print("═"*62)
    print(f"  Company  : {fd.company_name}  ({fd.stock_code})")
    print(f"  Period   : {fd.report_period or 'N/A'}")
    print(f"  Price    : {fmt_yuan(fd.current_price)}   Market Cap: {fmt_yuan(fd.market_cap)}")
    print("─"*62)
    print("\n  Key Financial Metrics:")
    metrics = [
        ("Revenue",        fmt_yuan(fd.revenue)),
        ("Net Profit",     fmt_yuan(fd.net_profit)),
        ("Gross Margin",   fmt_pct(fd.gross_profit_margin)),
        ("ROE",            fmt_pct(fd.roe)),
        ("P/E",            fmt_x(fd.pe_ratio)),
        ("P/B",            fmt_x(fd.pb_ratio)),
        ("Debt Ratio",     fmt_pct(fd.debt_to_equity)),
        ("Current Ratio",  fmt_x(fd.current_ratio)),
        ("Operating CF",   fmt_yuan(fd.operating_cash_flow)),
        ("Free CF",        fmt_yuan(fd.free_cash_flow)),
    ]
    for k, v in metrics:
        print(f"    {k:<18} {v}")

    print("\n  Category Scores (max ±10):")
    for cat, score in result.scores.items():
        bar = ("█" * int(abs(score))) + ("░" * (10 - int(abs(score))))
        print(f"    {cat:<22} {score:+5.1f}  [{bar}]")

    print(f"\n  Total Score : {result.total_score:+.1f}  (range -50 to +50)")
    print(f"\n  {ansi_color}  ★ RECOMMENDATION: {rec.value} ★  {RESET}")

    print("\n  ✅ Positive Factors:")
    for r in result.reasons or ["None identified"]:
        print(f"     • {r}")
    print("\n  ⚠️  Risk Factors:")
    for w in result.warnings or ["None identified"]:
        print(f"     • {w}")
    if fd.fetch_errors:
        print(f"\n  [Data notes: {'; '.join(fd.fetch_errors[:3])}]")
    print("═"*62)


# ═════════════════════════════════════════════════════════════
# CSV Export
# ═════════════════════════════════════════════════════════════

def export_csv(results: list[AnalysisResult], path: str = "cas_results.csv"):
    try:
        import csv
        fieldnames = [
            "stock_code", "company_name", "report_period",
            "recommendation", "total_score",
            "revenue_growth", "profitability", "valuation",
            "financial_health", "cash_flow",
            "current_price", "pe_ratio", "pb_ratio", "roe",
            "gross_profit_margin", "debt_to_equity", "current_ratio",
            "revenue", "net_profit", "operating_cash_flow",
        ]
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for res in results:
                fd = res.financial_data
                row = {
                    "stock_code":          fd.stock_code,
                    "company_name":        fd.company_name,
                    "report_period":       fd.report_period,
                    "recommendation":      res.recommendation.value,
                    "total_score":         f"{res.total_score:.1f}",
                    **{k: f"{v:.1f}" for k, v in res.scores.items()},
                    "current_price":       fd.current_price,
                    "pe_ratio":            fd.pe_ratio,
                    "pb_ratio":            fd.pb_ratio,
                    "roe":                 fd.roe,
                    "gross_profit_margin": fd.gross_profit_margin,
                    "debt_to_equity":      fd.debt_to_equity,
                    "current_ratio":       fd.current_ratio,
                    "revenue":             fd.revenue,
                    "net_profit":          fd.net_profit,
                    "operating_cash_flow": fd.operating_cash_flow,
                }
                writer.writerow(row)
        print(f"\n  ✅ Results exported to: {path}")
    except Exception as e:
        print(f"\n  ⚠️  CSV export failed: {e}")


# ═════════════════════════════════════════════════════════════
# Offline Demo
# ═════════════════════════════════════════════════════════════

def run_demo():
    print("\n  [DEMO MODE — no AkShare required]\n")
    analyzer = CASAnalyzer()
    samples = [
        FinancialData(
            company_name="宁德时代 CATL", stock_code="300750", report_period="2024-Q3",
            revenue=120e9, revenue_prev=95e9, net_profit=11e9, net_profit_prev=8.5e9,
            gross_profit_margin=26.5, roe=18.0, operating_cash_flow=14e9,
            free_cash_flow=8e9, total_assets=300e9, total_liabilities=130e9,
            cash=60e9, current_ratio=1.8, eps=4.52, eps_prev=3.50, current_price=180.0,
            data_source="demo",
        ),
        FinancialData(
            company_name="某中型制造企业", stock_code="601001", report_period="2024-Q3",
            revenue=5e9, revenue_prev=4.8e9, net_profit=300e6, net_profit_prev=310e6,
            gross_profit_margin=14.0, roe=9.5, operating_cash_flow=280e6,
            total_assets=10e9, total_liabilities=5.5e9, current_ratio=1.2,
            eps=0.62, current_price=12.0, data_source="demo",
        ),
        FinancialData(
            company_name="某问题地产企业", stock_code="000001", report_period="2024-Q3",
            revenue=2e9, revenue_prev=4e9, net_profit=-500e6, net_profit_prev=200e6,
            gross_profit_margin=3.0, roe=-8.0, operating_cash_flow=-800e6,
            total_assets=20e9, total_liabilities=18.5e9, current_ratio=0.6,
            pe_ratio=-10.0, pb_ratio=0.4, data_source="demo",
        ),
    ]
    results = [analyzer.analyze(fd) for fd in samples]
    for res in results:
        print_report(res)
    return results


# ═════════════════════════════════════════════════════════════
# CLI Entry Point
# ═════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Chinese CAS Quarterly Report Analyzer (AkShare integration)",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "--code", nargs="+",
        help="One or more A-share stock codes, e.g. --code 300750 002594 600519",
    )
    parser.add_argument(
        "--export", action="store_true",
        help="Export results to cas_results.csv",
    )
    parser.add_argument(
        "--demo", action="store_true",
        help="Run offline demo with sample data (no AkShare needed)",
    )
    args = parser.parse_args()

    analyzer = CASAnalyzer()
    results: list[AnalysisResult] = []

    if args.demo or not args.code:
        results = run_demo()

    else:
        if not AKSHARE_AVAILABLE:
            print("\n  ❌ AkShare not installed. Run:  pip install akshare pandas")
            print("     Or use --demo for offline mode.\n")
            sys.exit(1)

        fetcher = AkShareFetcher()
        for code in args.code:
            try:
                fd = fetcher.fetch(code)
                res = analyzer.analyze(fd)
                print_report(res)
                results.append(res)
            except Exception as e:
                print(f"\n  ❌ Error processing {code}: {e}")

    if args.export and results:
        export_csv(results)


if __name__ == "__main__":
    main()
