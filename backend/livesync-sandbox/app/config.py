from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "LiveSync Polyglot Sandbox Service"
    environment: str = "Development"
    default_timeout_ms: int = 10000
    cors_allowed_origins: list[str] = [
        "http://localhost:4200",
        "http://localhost:4000",
        "http://localhost:3000",
        "http://localhost:5038",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
