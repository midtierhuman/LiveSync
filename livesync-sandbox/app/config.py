from typing import Any
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "LiveSync Polyglot Sandbox Service"
    environment: str = "Development"
    default_timeout_ms: int = 15000
    max_timeout_ms: int = 120000
    gemini_api_key: str | None = None
    jwt_secret: str | None = None
    jwt_issuer: str = "LiveSyncAuthAPI"
    jwt_audience: str = "LiveSyncClient"
    cors_allowed_origins: list[str] = [
        "http://localhost:4200",
        "http://localhost:4000",
        "http://localhost:5038",
    ]

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            if v.startswith("["):
                import json
                return json.loads(v)
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
