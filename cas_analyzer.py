"""
Chinese CAS (China A-Share) Quarterly Report Analyzer
Analyzes financial reports to generate Buy/Sell/Hold recommendations
Python 3.12
"""

import json
import re
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


# ─────────────────────────────────────────────────────────────
# Data Structures
# ─────────────────────────────────────────────────────────────

class Recommendation(Enum):
    STRONG_BUY  = "STRONG BUY"
    BUY         = "BUY"
    HOLD        = "HOLD"
    SELL        = "SELL"
    STRONG_SELL = "STRONG SELL"


@dataclass
class FinancialData:
    """Core financial metrics extracted from a CAS quarterly report."""

    # Identity
    company_name: str = ""
    stock_code: str = ""
    report_period: str = ""          # e.g. "2024-Q3"

    # Income Statement
    revenue: Optional[float] = None          # 营业收入 (¥)
    revenue_prev: Optional[float] = None     # Same period previous year
    net_profit: Optional[float] = None       # 归母净利润
    net_profit_prev: Optional[float] = None
    operating_profit: Optional[float] = None # 营业利润
    gross_profit_margin: Optional[float] = None  # 毛利率 (%)

    # Balance Sheet
    total_assets: Optional[float] = None     # 总资产
    total_equity: Optional[float] = None     # 股东权益
    total_liabilities: Optional[float] = None
    cash: Optional[float] = None             # 货币资金

    # Cash Flow
    operating_cash_flow: Optional[float] = None   # 经营活动现金流量净额
    free_cash_flow: Optional[float] = None         # 自由现金流

    # Per-Share Data
    eps: Optional[float] = None              # 每股收益
    eps_prev: Optional[float] = None
    bvps: Optional[float] = None             # 每股净资产
    current_price: Optional[float] = None

    # Derived / Additional
    pe_ratio: Optional[float] = None         # 市盈率
    pb_ratio: Optional[float] = None         # 市净率
    roe: Optional[float] = None              # 净资产收益率 (%)
    debt_to_equity: Optional[float] = None   # 资产负债率 (%)
    current_ratio: Optional[float] = None    # 流动比率
    inventory_turnover: Optional[float] = None


@dataclass
class AnalysisResult:
    financial_data: FinancialData
    scores: dict[str, float] = field(default_factory=dict)
    total_score: float = 0.0
    recommendation: Recommendation = Recommendation.HOLD
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────
# Scoring Engine
# ─────────────────────────────────────────────────────────────

class CASAnalyzer:
    """
    Scores a stock across five categories and maps the total to a recommendation.

    Score range: -10 (worst) → +10 (best) per category.
    Total range: -50 → +50.

    Mapping:
      > +20  → STRONG BUY
      > +8   → BUY
      > -8   → HOLD
      > -20  → SELL
      ≤ -20  → STRONG SELL
    """

    # ── Public API ─────────────────────────────────────────────

    def analyze(self, fd: FinancialData) -> AnalysisResult:
        result = AnalysisResult(financial_data=fd)

        result.scores["revenue_growth"]  = self._score_revenue_growth(fd, result)
        result.scores["profitability"]   = self._score_profitability(fd, result)
        result.scores["valuation"]       = self._score_valuation(fd, result)
        result.scores["financial_health"]= self._score_financial_health(fd, result)
        result.scores["cash_flow"]       = self._score_cash_flow(fd, result)

        result.total_score = sum(result.scores.values())
        result.recommendation = self._map_recommendation(result.total_score)
        return result

    # ── Category Scorers ───────────────────────────────────────

    def _score_revenue_growth(self, fd: FinancialData, r: AnalysisResult) -> float:
        score = 0.0
        if fd.revenue and fd.revenue_prev and fd.revenue_prev != 0:
            growth = (fd.revenue - fd.revenue_prev) / abs(fd.revenue_prev) * 100
            if   growth > 30:  score += 10;  r.reasons.append(f"Revenue growth outstanding: +{growth:.1f}% YoY")
            elif growth > 15:  score += 7;   r.reasons.append(f"Revenue growth strong: +{growth:.1f}% YoY")
            elif growth > 5:   score += 4;   r.reasons.append(f"Revenue growth moderate: +{growth:.1f}% YoY")
            elif growth > 0:   score += 1;   r.reasons.append(f"Revenue growth slow: +{growth:.1f}% YoY")
            elif growth > -10: score -= 3;   r.warnings.append(f"Revenue declining slightly: {growth:.1f}% YoY")
            else:              score -= 7;   r.warnings.append(f"Revenue declining sharply: {growth:.1f}% YoY")
        else:
            r.warnings.append("Revenue YoY comparison unavailable")
        return score

    def _score_profitability(self, fd: FinancialData, r: AnalysisResult) -> float:
        score = 0.0

        # Gross profit margin (毛利率)
        if fd.gross_profit_margin is not None:
            gpm = fd.gross_profit_margin
            if   gpm > 40: score += 4;  r.reasons.append(f"High gross margin: {gpm:.1f}%")
            elif gpm > 25: score += 2;  r.reasons.append(f"Decent gross margin: {gpm:.1f}%")
            elif gpm > 10: score += 0
            else:          score -= 3;  r.warnings.append(f"Low gross margin: {gpm:.1f}%")

        # Net profit growth
        if fd.net_profit and fd.net_profit_prev and fd.net_profit_prev != 0:
            npg = (fd.net_profit - fd.net_profit_prev) / abs(fd.net_profit_prev) * 100
            if   npg > 30:  score += 6;  r.reasons.append(f"Net profit growth strong: +{npg:.1f}%")
            elif npg > 10:  score += 3;  r.reasons.append(f"Net profit growth moderate: +{npg:.1f}%")
            elif npg > 0:   score += 1
            elif npg > -20: score -= 2;  r.warnings.append(f"Net profit declining: {npg:.1f}%")
            else:           score -= 6;  r.warnings.append(f"Net profit sharply declining: {npg:.1f}%")

        # ROE (净资产收益率)
        if fd.roe is not None:
            if   fd.roe > 20: score += 3; r.reasons.append(f"Excellent ROE: {fd.roe:.1f}%")
            elif fd.roe > 10: score += 1; r.reasons.append(f"Adequate ROE: {fd.roe:.1f}%")
            elif fd.roe < 0:  score -= 4; r.warnings.append(f"Negative ROE: {fd.roe:.1f}%")

        # Net profit itself (negative is a red flag)
        if fd.net_profit is not None and fd.net_profit < 0:
            score -= 5
            r.warnings.append("Company reporting net loss this period")

        return max(-10, min(10, score))

    def _score_valuation(self, fd: FinancialData, r: AnalysisResult) -> float:
        score = 0.0

        # P/E ratio — derive if possible
        pe = fd.pe_ratio
        if pe is None and fd.current_price and fd.eps and fd.eps != 0:
            pe = fd.current_price / fd.eps

        if pe is not None:
            if   pe < 0:   score -= 5; r.warnings.append(f"Negative P/E (loss-making): {pe:.1f}x")
            elif pe < 10:  score += 5; r.reasons.append(f"Undervalued P/E: {pe:.1f}x")
            elif pe < 20:  score += 3; r.reasons.append(f"Reasonable P/E: {pe:.1f}x")
            elif pe < 35:  score += 0
            elif pe < 60:  score -= 3; r.warnings.append(f"High P/E, growth premium needed: {pe:.1f}x")
            else:          score -= 6; r.warnings.append(f"Very high P/E risk: {pe:.1f}x")

        # P/B ratio
        pb = fd.pb_ratio
        if pb is None and fd.current_price and fd.bvps and fd.bvps != 0:
            pb = fd.current_price / fd.bvps

        if pb is not None:
            if   pb < 1:   score += 4; r.reasons.append(f"Trading below book value (P/B {pb:.2f}x)")
            elif pb < 2:   score += 2; r.reasons.append(f"Fair P/B ratio: {pb:.2f}x")
            elif pb < 4:   score += 0
            elif pb < 8:   score -= 2; r.warnings.append(f"High P/B: {pb:.2f}x")
            else:          score -= 4; r.warnings.append(f"Very high P/B: {pb:.2f}x")

        return max(-10, min(10, score))

    def _score_financial_health(self, fd: FinancialData, r: AnalysisResult) -> float:
        score = 0.0

        # Debt-to-equity / leverage (资产负债率)
        dte = fd.debt_to_equity
        if dte is None and fd.total_liabilities and fd.total_assets and fd.total_assets != 0:
            dte = fd.total_liabilities / fd.total_assets * 100

        if dte is not None:
            if   dte < 30: score += 4; r.reasons.append(f"Low leverage: {dte:.1f}% debt ratio")
            elif dte < 50: score += 2
            elif dte < 70: score -= 1
            elif dte < 85: score -= 4; r.warnings.append(f"High leverage: {dte:.1f}% debt ratio")
            else:          score -= 7; r.warnings.append(f"Extremely high leverage: {dte:.1f}%")

        # Current ratio (流动比率)
        if fd.current_ratio is not None:
            if   fd.current_ratio > 2:   score += 3; r.reasons.append(f"Strong liquidity (CR {fd.current_ratio:.2f})")
            elif fd.current_ratio > 1.5: score += 1
            elif fd.current_ratio > 1:   score += 0
            else:                        score -= 4; r.warnings.append(f"Poor liquidity (CR {fd.current_ratio:.2f})")

        # Cash buffer
        if fd.cash and fd.total_assets:
            cash_ratio = fd.cash / fd.total_assets
            if cash_ratio > 0.2: score += 2; r.reasons.append(f"Strong cash position: {cash_ratio*100:.1f}% of assets")
            elif cash_ratio < 0.05: score -= 1; r.warnings.append("Low cash reserves")

        return max(-10, min(10, score))

    def _score_cash_flow(self, fd: FinancialData, r: AnalysisResult) -> float:
        score = 0.0

        if fd.operating_cash_flow is not None:
            if fd.operating_cash_flow > 0:
                score += 3
                r.reasons.append(f"Positive operating cash flow: ¥{fd.operating_cash_flow/1e8:.2f}B")
                # OCF vs Net profit quality check
                if fd.net_profit and fd.net_profit > 0:
                    ratio = fd.operating_cash_flow / fd.net_profit
                    if ratio > 1.2:  score += 3; r.reasons.append(f"High earnings quality (OCF/NP {ratio:.2f}x)")
                    elif ratio > 0.8: score += 1
                    elif ratio < 0.3: score -= 2; r.warnings.append(f"Low earnings quality (OCF/NP {ratio:.2f}x)")
            else:
                score -= 5
                r.warnings.append(f"Negative operating cash flow: ¥{fd.operating_cash_flow/1e8:.2f}B")

        if fd.free_cash_flow is not None:
            if fd.free_cash_flow > 0:
                score += 2; r.reasons.append(f"Positive free cash flow: ¥{fd.free_cash_flow/1e8:.2f}B")
            else:
                score -= 1; r.warnings.append("Negative free cash flow")

        return max(-10, min(10, score))

    # ── Recommendation Mapper ──────────────────────────────────

    @staticmethod
    def _map_recommendation(score: float) -> Recommendation:
        if   score > 20:  return Recommendation.STRONG_BUY
        elif score > 8:   return Recommendation.BUY
        elif score > -8:  return Recommendation.HOLD
        elif score > -20: return Recommendation.SELL
        else:             return Recommendation.STRONG_SELL


# ─────────────────────────────────────────────────────────────
# Report Printer
# ─────────────────────────────────────────────────────────────

def print_report(result: AnalysisResult) -> None:
    fd = result.financial_data
    rec = result.recommendation
    score = result.total_score

    # Color codes for terminal
    colors = {
        Recommendation.STRONG_BUY:  "\033[92m",  # bright green
        Recommendation.BUY:         "\033[32m",   # green
        Recommendation.HOLD:        "\033[33m",   # yellow
        Recommendation.SELL:        "\033[31m",   # red
        Recommendation.STRONG_SELL: "\033[91m",   # bright red
    }
    RESET = "\033[0m"
    color = colors.get(rec, "")

    print("\n" + "═"*60)
    print(f"  CAS Analysis Report")
    print("═"*60)
    print(f"  Company  : {fd.company_name or 'N/A'}  ({fd.stock_code or 'N/A'})")
    print(f"  Period   : {fd.report_period or 'N/A'}")
    print("─"*60)

    # Category scores
    print("\n  Category Scores (max ±10 each):")
    for cat, s in result.scores.items():
        bar = ("█" * int(abs(s))) + ("░" * (10 - int(abs(s))))
        sign = "+" if s >= 0 else "-"
        print(f"  {cat:<20} {sign}{abs(s):4.1f}  [{bar}]")

    print(f"\n  Total Score : {score:+.1f}  (range -50 to +50)")
    print(f"\n  {color}  ★ RECOMMENDATION: {rec.value} ★  {RESET}")

    print("\n  ✅ Positive Factors:")
    for r in result.reasons or ["None identified"]:
        print(f"     • {r}")

    print("\n  ⚠️  Risk Factors:")
    for w in result.warnings or ["None identified"]:
        print(f"     • {w}")

    print("═"*60 + "\n")


# ─────────────────────────────────────────────────────────────
# JSON / Dict Loader
# ─────────────────────────────────────────────────────────────

def load_from_dict(data: dict) -> FinancialData:
    """
    Load FinancialData from a plain Python dict or parsed JSON.
    Keys match FinancialData field names (snake_case).
    """
    fd = FinancialData()
    for key, value in data.items():
        if hasattr(fd, key):
            setattr(fd, key, value)
    return fd


def load_from_json_file(path: str) -> FinancialData:
    with open(path, encoding="utf-8") as f:
        return load_from_dict(json.load(f))


# ─────────────────────────────────────────────────────────────
# (Optional) Basic Text Parser for Chinese Report Snippets
# ─────────────────────────────────────────────────────────────

def parse_chinese_text(text: str) -> FinancialData:
    """
    Attempts a naive regex extraction of key numbers from a Chinese
    financial report text snippet (simplified characters).
    For robust extraction, consider using an LLM or a dedicated parser.
    """
    fd = FinancialData()

    patterns = {
        "revenue":      r"营业(?:总)?收入[：:]*\s*([\d,\.]+)\s*(?:万元|亿元)?",
        "net_profit":   r"归(?:属于母公司)?股东的净利润[：:]*\s*([\d,\.]+)\s*(?:万元|亿元)?",
        "eps":          r"基本每股收益[：:]*\s*([\d,\.]+)\s*元",
        "roe":          r"净资产收益率[：:]*\s*([\d,\.]+)\s*%",
        "gross_profit_margin": r"毛利率[：:]*\s*([\d,\.]+)\s*%",
        "current_ratio": r"流动比率[：:]*\s*([\d,\.]+)",
        "debt_to_equity": r"资产负债率[：:]*\s*([\d,\.]+)\s*%",
    }

    def clean(s: str) -> float:
        return float(s.replace(",", ""))

    for field_name, pattern in patterns.items():
        m = re.search(pattern, text)
        if m:
            try:
                setattr(fd, field_name, clean(m.group(1)))
            except ValueError:
                pass

    return fd


# ─────────────────────────────────────────────────────────────
# Demo / Example Usage
# ─────────────────────────────────────────────────────────────

def demo():
    """
    Three demo companies to show BUY, HOLD, and SELL outcomes.
    Replace with real data from CNINFO, Wind, or your data source.
    """

    analyzer = CASAnalyzer()

    # ── Example 1: Strong performer (expected BUY) ─────────────
    data_good = FinancialData(
        company_name="宁德时代 (CATL)",
        stock_code="300750",
        report_period="2024-Q3",
        revenue=120_000_000_000,
        revenue_prev=95_000_000_000,
        net_profit=11_000_000_000,
        net_profit_prev=8_500_000_000,
        gross_profit_margin=26.5,
        roe=18.0,
        operating_cash_flow=14_000_000_000,
        free_cash_flow=8_000_000_000,
        total_assets=300_000_000_000,
        total_liabilities=130_000_000_000,
        cash=60_000_000_000,
        current_ratio=1.8,
        eps=4.52,
        eps_prev=3.50,
        current_price=180.0,
    )

    # ── Example 2: Mediocre performer (expected HOLD) ──────────
    data_mid = FinancialData(
        company_name="某中型制造企业",
        stock_code="601001",
        report_period="2024-Q3",
        revenue=5_000_000_000,
        revenue_prev=4_800_000_000,
        net_profit=300_000_000,
        net_profit_prev=310_000_000,
        gross_profit_margin=14.0,
        roe=9.5,
        operating_cash_flow=280_000_000,
        total_assets=10_000_000_000,
        total_liabilities=5_500_000_000,
        current_ratio=1.2,
        eps=0.62,
        current_price=12.0,
    )

    # ── Example 3: Distressed company (expected SELL) ──────────
    data_bad = FinancialData(
        company_name="某问题地产企业",
        stock_code="000001",
        report_period="2024-Q3",
        revenue=2_000_000_000,
        revenue_prev=4_000_000_000,
        net_profit=-500_000_000,
        net_profit_prev=200_000_000,
        gross_profit_margin=3.0,
        roe=-8.0,
        operating_cash_flow=-800_000_000,
        total_assets=20_000_000_000,
        total_liabilities=18_500_000_000,
        current_ratio=0.6,
        pe_ratio=-10.0,
        pb_ratio=0.4,
    )

    for data in [data_good, data_mid, data_bad]:
        result = analyzer.analyze(data)
        print_report(result)


# ─────────────────────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if len(sys.argv) == 2:
        # Accept a JSON file path as argument
        path = sys.argv[1]
        fd = load_from_json_file(path)
        result = CASAnalyzer().analyze(fd)
        print_report(result)
    else:
        # Run built-in demo
        print("Running demo analysis (no JSON file provided)\n")
        demo()
