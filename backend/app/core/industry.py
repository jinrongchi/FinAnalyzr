"""
Shenwan Level-1 industry name → IndustryGroup mapping.
Source: skill.md §5.1
"""
from app.core.enums import IndustryGroup

_SW_MAP: dict[str, IndustryGroup] = {
    # Consumer & Pharma
    "食品饮料": IndustryGroup.CONSUMER_PHARMA,
    "医药生物": IndustryGroup.CONSUMER_PHARMA,
    "家用电器": IndustryGroup.CONSUMER_PHARMA,
    # Financial & Real Estate
    "银行": IndustryGroup.FINANCIAL_REAL_ESTATE,
    "非银金融": IndustryGroup.FINANCIAL_REAL_ESTATE,
    "房地产": IndustryGroup.FINANCIAL_REAL_ESTATE,
    # Cyclical Materials
    "钢铁": IndustryGroup.CYCLICAL_MATERIALS,
    "化工": IndustryGroup.CYCLICAL_MATERIALS,
    "有色金属": IndustryGroup.CYCLICAL_MATERIALS,
    "采掘": IndustryGroup.CYCLICAL_MATERIALS,
    "煤炭": IndustryGroup.CYCLICAL_MATERIALS,
    "建筑材料": IndustryGroup.CYCLICAL_MATERIALS,
    # Utilities & Infrastructure
    "公用事业": IndustryGroup.UTILITIES_INFRA,
    "交通运输": IndustryGroup.UTILITIES_INFRA,
    # Technology
    "电子": IndustryGroup.TECHNOLOGY,
    "计算机": IndustryGroup.TECHNOLOGY,
    "通信": IndustryGroup.TECHNOLOGY,
    "传媒": IndustryGroup.TECHNOLOGY,
    # Industrial
    "汽车": IndustryGroup.INDUSTRIAL,
    "机械设备": IndustryGroup.INDUSTRIAL,
    "电气设备": IndustryGroup.INDUSTRIAL,
    "国防军工": IndustryGroup.INDUSTRIAL,
    # Other
    "农林牧渔": IndustryGroup.OTHER,
    "商业贸易": IndustryGroup.OTHER,
    "休闲服务": IndustryGroup.OTHER,
    "轻工制造": IndustryGroup.OTHER,
    "纺织服装": IndustryGroup.OTHER,
    "综合": IndustryGroup.OTHER,
    "建筑装饰": IndustryGroup.OTHER,
}

# Valuation model weights per industry – must sum to 1.0
# Format: {model_key: weight}
INDUSTRY_WEIGHTS: dict[IndustryGroup, dict[str, float]] = {
    IndustryGroup.CONSUMER_PHARMA: {
        "dcf": 0.40, "roe_pb": 0.30, "pe_percentile": 0.30
    },
    IndustryGroup.FINANCIAL_REAL_ESTATE: {
        "roe_pb": 0.60, "pb_percentile": 0.20, "dividend_yield": 0.20
    },
    IndustryGroup.CYCLICAL_MATERIALS: {
        "cape": 0.40, "pb_percentile": 0.30, "pcf_percentile": 0.30
    },
    IndustryGroup.UTILITIES_INFRA: {
        "dividend_yield": 0.40, "dcf": 0.30, "pb_percentile": 0.30
    },
    IndustryGroup.TECHNOLOGY: {
        "peg": 0.40, "roe_pb": 0.30, "dcf": 0.30
    },
    IndustryGroup.INDUSTRIAL: {
        "dcf": 0.30, "roe_pb": 0.30, "pe_percentile": 0.40
    },
    IndustryGroup.OTHER: {
        "dcf": 0.30, "roe_pb": 0.30, "pe_percentile": 0.40
    },
}


def map_industry(sw_name: str | None) -> IndustryGroup:
    """Map a Shenwan industry name to IndustryGroup. Falls back to OTHER."""
    if not sw_name:
        return IndustryGroup.OTHER
    for key, group in _SW_MAP.items():
        if key in sw_name:
            return group
    return IndustryGroup.OTHER


def get_weights(group: IndustryGroup) -> dict[str, float]:
    return INDUSTRY_WEIGHTS[group]
