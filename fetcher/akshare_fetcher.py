import akshare as ak

from utils.commons_cn import (
    COMPANY_NAME_CN,
    CURRENT_STOCK_PRICE_CN,
    INDUSTRY_CN,
    MARKET_VALUE_CN,
    TOTAL_SHARES_CN,
)
from utils.stock_dataclass import FinancialData


class AkShareFetcher:
    def fetch(self, code: str) -> FinancialData:
        fd = FinancialData(stock_code=code, data_source="akshare")

        clean_code = code.replace("sh", "").replace("sz", "").strip()
        fd.stock_code = clean_code

        print(f"\n  [AkShare] Fetching data for {clean_code} …")

        self._fetch_basic_info(fd, clean_code)

        return fd

    def _fetch_basic_info(self, fd: FinancialData, code: str):
        try:
            df = ak.stock_individual_info_em(symbol=code)
            info = dict(zip(df.iloc[:, 0], df.iloc[:, 1]))
            fd.company_name = str(info.get(COMPANY_NAME_CN, code))
            fd.total_shares = float(info.get(TOTAL_SHARES_CN))
            fd.market_value = float(info.get(MARKET_VALUE_CN))
            fd.current_stock_price = float(info.get(CURRENT_STOCK_PRICE_CN))
            fd.industry = str(info.get(INDUSTRY_CN))
        except Exception as e:
            fd.fetch_errors.append(f"basic_info: {e}")
