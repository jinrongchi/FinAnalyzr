from typing import Literal

import akshare as ak
import pandas as pd

Recommandation = Literal["STRONG BUY", "BUY", "HOLD", "SELL", "STRONG SELL"]


class ChineseStockAnalyzer:
    def __init__(self, stock_code: str):
        """
        Initialize with a 6-digit Chinese Stock Code.
        """
        self.stock_code = stock_code

    def fetch_financial_indicators(self) -> pd.DataFrame:
        """
        Fetches the latest financial indicators from Eastmoney.
        """
        try:
            print(f"Fetching financial data for {self.stock_code}...")
            df = ak.stock_financial_abstract_em(symbol=self.stock_code)

            if df.empty:
                raise ValueError(f"No financial data found for code {self.stock_code}.")

            return df
        except Exception as e:
            print(f"Error fetching financial indicators: {e}")
            return pd.DataFrame()

    def fetch_current_valuation(self) -> dict:
        """
        Fetches current P/E (TTM) and P/B ratios.
        """
        try:
            quote_df = ak.stock_zh_a_spot_em()
            stock_info = quote_df[quote_df["代码"] == self.stock_code].iloc[0]

            return {
                # Dynamic P/E
                "PE_ratio": stock_info["市盈率-动态"],
                # P/B ratio
                "PB_ratio": stock_info["市净率"],
            }
        except Exception as e:
            print(f"Error fetching current valuation: {e}")
            return {"PE_ratio": None, "PB_ratio": None}

    def analyze_stock(self) -> dict:
        """
        Analyzes the fetched data and generates a Buy/Sell/Hold signal.
        """
        financials = self.fetch_financial_indicators()
        valuation = self.fetch_current_valuation()

        if financials.empty or valuation["PE_ratio"] is None:
            return {"Error": "Insufficient data to analyze."}

        # Get the most recent quarter's financial data (first row)
        latest_report = financials.iloc[0]

        try:
            roe = float(latest_report["净资产收益率(%)"])
            net_profit_growth = float(latest_report["净利润同比增长率(%)"])
            gross_margin = float(latest_report["毛利率(%)"])
        except KeyError as e:
            return {"Error": f"Missing expected column in data: {e}"}

        pe_ratio = valuation["PE_ratio"]

        # --- Scoring Logic ---
        score = 0

        # 1. Profitability (ROE) - Warren Buffett likes > 15%
        if roe > 15:
            score += 2
        elif roe > 8:
            score += 1
        else:
            score -= 1

        # 2. Growth (Net Profit YoY)
        if net_profit_growth > 20:
            score += 2
        elif net_profit_growth > 5:
            score += 1
        elif net_profit_growth < 0:
            score -= 2

        # 3. Valuation (P/E Ratio)
        if pe_ratio < 15:
            score += 2
        elif pe_ratio < 25:
            score += 1
        elif pe_ratio > 40:
            score -= 2

        # 4. Efficiency (Gross Margin)
        if gross_margin > 40:
            score += 1

        # --- Decision Making ---
        recommandation: Recommandation
        match score:
            case s if s >= 5:
                recommandation = "STRONG BUY"
            case s if 3 <= s < 5:
                recommandation = "BUY"
            case s if 0 <= s < 3:
                recommandation = "HOLD"
            case s if -2 <= s < 0:
                recommandation = "SELL"
            case _:
                recommandation = "STRONG SELL"

        return {
            "Stock Code": self.stock_code,
            "Report Date": latest_report["报告期"],
            "ROE (%)": roe,
            "Net Profit Growth YoY(%)": net_profit_growth,
            "Gross Margin (%)": gross_margin,
            "P/E Ratio": pe_ratio,
            "Total Score": score,
            "Recommandation": recommandation,
        }


if __name__ == "__main__":
    stock_code = input("Enter a 6-digit Chinese Stock Code (e.g., 600519): ")

    analyzer = ChineseStockAnalyzer(stock_code)
    result = analyzer.analyze_stock()

    print("\n" + "=" * 40)
    print(f"--- Analysis Result for {stock_code} ---")
    print("\n" + "=" * 40)
    for key, value in result.items():
        print(f"{key}: {value}")
    print("\n" + "=" * 40)
