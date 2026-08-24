from typing import Any
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "LiveSync AI Intelligence Service"
    environment: str = "Development"

    # -------------------------------------------------------------------------
    # LOCAL LLM (llama.cpp / OpenAI-compatible Local Server)
    # -------------------------------------------------------------------------
    local_llm_url: str = "http://127.0.0.1:8080"
    local_llm_chat_endpoint: str = "/v1/chat/completions"

    # Registered Local Models List
    local_llm_models: list[str] = [
        "Qwen2.5-Coder-14B-Instruct-Q4_K_M.gguf",
        "Qwen2.5-Coder-14B-Instruct-Q4_K_M",
        "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
        "Qwen2.5-Coder-7B-Instruct-Q4_K_M",
        "Qwen2.5-Coder-32B-Instruct-Q4_K_M.gguf",
        "Qwen2.5-Coder-32B-Instruct-Q4_K_M",
        "llama-3.2-3b-instruct",
        "deepseek-r1-distill-qwen-14b",
    ]

    # Active Model Selection (Uncomment the active model to switch)
    local_llm_model: str = "Qwen2.5-Coder-14B-Instruct-Q4_K_M.gguf"

    # Primary Provider Preference ("gemini", "local", "groq", "ast")
    default_ai_provider: str = "gemini"

    # Provider Fallback Control Flags
    # Set to True so cloud and local providers automatically handle requests.
    enable_gemini_fallback: bool = True
    enable_local_llm_fallback: bool = True
    enable_groq_fallback: bool = False
    enable_ast_fallback: bool = True

    # -------------------------------------------------------------------------
    # CLOUD AI PROVIDERS (Endpoints & Settings)
    # -------------------------------------------------------------------------
    gemini_api_key: str | None = None
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/models"
    gemini_models: list[str] = [
        "gemini-2.5-flash",
        "gemini-1.5-flash",
        "gemini-flash-latest",
        "gemini-2.0-flash",
        "gemini-3-flash-preview",
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-flash-lite-latest",
    ]

    groq_api_key: str | None = None
    groq_base_url: str = "https://api.groq.com/openai/v1/chat/completions"
    groq_model: str = "llama-3.3-70b-versatile"

    # -------------------------------------------------------------------------
    # UPSTREAM PACKAGE REGISTRIES
    # -------------------------------------------------------------------------
    pypi_registry_url: str = "https://pypi.org/pypi/{package}/json"
    npm_registry_url: str = "https://registry.npmjs.org/-/v1/search?text={query}&size=10"

    # -------------------------------------------------------------------------
    # SECURITY & CORS
    # -------------------------------------------------------------------------
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
