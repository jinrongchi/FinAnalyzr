"""
Data source labels – every computed value carries one of these tags
so the frontend can show origin transparency.
"""
from enum import Enum


class DataSource(str, Enum):
    AUTO = "auto"       # fetched directly from Tushare
    CALC = "calc"       # derived by calculation from Tushare fields
    MANUAL = "manual"   # supplied by the user
    DEFAULT = "default" # system fallback constant (least preferred)
    UNAVAILABLE = "unavailable"  # could not obtain; field left empty


class IndustryGroup(str, Enum):
    CONSUMER_PHARMA = "consumer_pharma"         # 食品饮料/医药/家电
    FINANCIAL_REAL_ESTATE = "financial_re"      # 银行/非银/房地产
    CYCLICAL_MATERIALS = "cyclical_materials"   # 钢铁/化工/有色/煤炭/建材
    UTILITIES_INFRA = "utilities_infra"         # 公用事业/交通运输
    TECHNOLOGY = "technology"                   # 电子/计算机/通信/传媒
    INDUSTRIAL = "industrial"                   # 汽车/机械/电气/军工
    OTHER = "other"                             # 农林牧渔/商贸/休闲/轻工


class RedFlagLevel(str, Enum):
    OK = "ok"
    CAUTION = "caution"     # 🔵
    WARNING = "warning"     # 🟡
    REJECT = "reject"       # 🔴 hard reject


class RecommendationLabel(str, Enum):
    DO_NOT_INVEST = "do_not_invest"
    WATCH = "watch"
    FAIRLY_VALUED = "fairly_valued"
    ATTRACTIVE = "attractive"
    VERY_ATTRACTIVE = "very_attractive"
