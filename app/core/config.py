from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    zammad_url: str = "https://seu-zammad.empresa.com"
    zammad_token: str = ""

    rate_limit_capacity: int = 20
    rate_limit_refill_rate: float = 2.0

    database_url: str = "sqlite+aiosqlite:///./zammad_noc.db"
    sync_interval_seconds: int = 60
    sla_alert_minutes: int = 15

    app_env: str = "development"
    log_level: str = "INFO"

    # ── Auth ──────────────────────────────────────────────────────────────────
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 8

    noc_username: str = "noc@flux"
    noc_password_hash: str = ""  # bcrypt hash — set in .env


@lru_cache
def get_settings() -> Settings:
    return Settings()
