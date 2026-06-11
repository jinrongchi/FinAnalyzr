from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    tushare_token: str = ""
    database_url: str = "postgresql+asyncpg://astock:astock@localhost:5432/astock"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # Valuation defaults (used only as fallbacks when data unavailable)
    default_risk_free_rate: float = 0.025   # 10Y CGB yield fallback
    default_erp: float = 0.065              # A-share equity risk premium
    default_wacc_stable: float = 0.09
    default_wacc_cyclical: float = 0.10
    default_wacc_high_risk: float = 0.11

    # API
    api_v1_prefix: str = "/api/v1"
    debug: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
