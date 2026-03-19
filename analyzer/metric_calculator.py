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
    def _calculate_dcf(fb: FinancialData):
        """
        A valuation method that estimates the value of an investment based on its expected future cash flows, discounted back to their present value.
        """
        growth_rate = 0.1  # Assume a constant growth rate of 10% for next 5 years
        terminal_growth_rate = 0.03  # Assume a terminal growth rate of 3% after year 5
        required_rate_of_return = 0.10  # Assume a required rate of return of 10%

        cash_flows = []
        for year in range(1, 6):
            cash_flow = fb.free_cash_flow * (1 + growth_rate) ** year
            cash_flows.append(cash_flow)
        terminal_value = cash_flows[-1] * (1 + terminal_growth_rate) / (required_rate_of_return - terminal_growth_rate)
        dcf_value = sum(cf / (1 + required_rate_of_return) ** year for year, cf in enumerate(cash_flows, start=1))
        dcf_value += terminal_value / (1 + required_rate_of_return) ** 5

        return dcf_value

    @staticmethod
    def _calculate_pe_ratio(fb: FinancialData) -> float:
        """
        A valuation ratio that compares a company's current share price to its earnings per share (EPS).
        """
        if fb.eps is None:
            fb.eps = fb.total_earning / fb.shares_outstanding

        pe_ratio = fb.current_stock_price / fb.eps
        return pe_ratio

    @staticmethod
    def _calculate_pb_ratio(fb: FinancialData) -> float:
        """
        A valuation ratio that compares a company's market value to its book value.
        """
        if fb.bvps is None:
            fb.bvps = fb.total_equity / fb.shares_outstanding
        pb_ratio = fb.current_stock_price / fb.bvps
        return pb_ratio
    
    @staticmethod
    def _calculate_fcf_yield(fb: FinancialData) -> float:
        """
        A measure of a company's financial performance.
        """
        if fb.market_cap is None:
            fb.market_cap = fb.current_stock_price * fb.shares_outstanding
        fcf_yield = fb.free_cash_flow / fb.market_cap
        return fcf_yield