"""
- Discounted Cash Flow (DCF): A valuation method that estimates the value of an investment based on its expected future cash flows, discounted back to their present value.
                              If the current stock price is significantly lower than the DCF valuation, it may indicate that the stock is undervalued.
                              IntrinsicValue = ∑ (CashFlow_t / (1 + r)^t) + TerminalValue / (1 + r)^n
                              where r is the discount rate, t is the time period, and n is the number of periods.

- Price-to-Earnings (P/E) Ratio: A valuation ratio that compares a company's current share price to its earnings per share (EPS).
                                 Compare a company's P/E to its historical average and its domestic peers.
                                 A significantly lower P/E may suggest undervaluation,
                                 but it can also indicate potential issues with the company, so it should be used in conjunction with other metrics.

- Price-to-Book (P/B) Ratio: A valuation ratio that compares a company's market value to its book value.
                             Compare the market's valuation to the actual value of the company's assets on paper.
                             A P/B ratio below 1.0, meaning the market values them for less than the liquidation value of their assets.

- Free Cash Flow (FCF) Yield: A measure of a company's financial performance, calculated as free cash flow divided by market capitalization.
                              FCF is the cash left over after a company pays for its operations and capital expenditures.
                              A high FCF yield indicates a healthy, cash-generating business.

"""

from utils.stock_dataclass import FinancialData


class MetricCalculator:
    @staticmethod
    def _calculate_dcf(fb: FinancialData) -> float | None:
        """
        Discounted Cash Flow models estimate intrinsic valuation.
        """
        if fb.free_cash_flow is None:
            return None

        growth_rate = 0.1
        terminal_growth_rate = 0.03
        required_rate_of_return = 0.10

        cash_flows = [
            fb.free_cash_flow * (1 + growth_rate) ** year for year in range(1, 6)
        ]
        terminal_value = (cash_flows[-1] * (1 + terminal_growth_rate)) / (
            required_rate_of_return - terminal_growth_rate
        )

        dcf_value = sum(
            cf / (1 + required_rate_of_return) ** year
            for year, cf in enumerate(cash_flows, start=1)
        )
        dcf_value += terminal_value / (1 + required_rate_of_return) ** 5
        fb.dcf_value = dcf_value
        return

    @staticmethod
    def _calculate_pe_ratio(fb: FinancialData) -> float | None:
        """
        Price-to-Earnings ratio.
        """
        eps = fb.eps
        if eps is None and fb.total_earning is not None and fb.shares_outstanding:
            eps = MetricCalculator._safe_divide(fb.total_earning, fb.shares_outstanding)

        if eps is None:
            return None

        fb.pe_tario = fb.current_stock_price / eps

        return

    @staticmethod
    def _calculate_pb_ratio(fb: FinancialData) -> float | None:
        """
        Price-to-Book ratio.
        """
        bvps = fb.bvps
        if bvps is None and fb.total_equity is not None and fb.shares_outstanding:
            bvps = MetricCalculator._safe_divide(fb.total_equity, fb.shares_outstanding)

        if bvps is None:
            return None
        fb.pb_ratio = fb.total_equity / fb.shares_outstanding

        return

    @staticmethod
    def _calculate_fcf_yield(fb: FinancialData) -> float | None:
        """
        Free Cash Flow yield.
        """
        if fb.free_cash_flow is None:
            return None

        market_cap = fb.market_cap
        if (
            market_cap is None
            and fb.current_stock_price is not None
            and fb.shares_outstanding
        ):
            market_cap = fb.current_stock_price * fb.shares_outstanding
        fb.fcf_yield = fb.free_cash_flow / fb.market_cap

        return
