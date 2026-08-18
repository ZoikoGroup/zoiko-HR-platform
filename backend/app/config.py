"""
config.py
---------
Configuration for the standalone Zoiko HR Platform backend.

Every variable is read from the environment (or a local .env file). HR-specific
variables are prefixed with HR_ so this platform never reads the monolith's
DATABASE_URL / SECRET_KEY even when both live on the same machine. A missing
required variable refuses startup on purpose.
"""

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────
    # HR_ prefixed so it can never collide with the monolith's DATABASE_URL.
    # PostgreSQL (Neon) only — required (see app/database.py).
    DATABASE_URL: str | None = Field(default=None, validation_alias="HR_DATABASE_URL")

    # ── JWT / Auth ────────────────────────────────────────────────────────
    # HR_ prefixed namespace — tokens issued here are unreadable by the
    # monolith and vice-versa, even with an identical SECRET_KEY.
    SECRET_KEY: str = Field(
        default="dev-change-me-zoiko-hr-platform", validation_alias="HR_SECRET_KEY"
    )
    ALGORITHM: str = Field(default="HS256", validation_alias="HR_ALGORITHM")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=1440, validation_alias="HR_ACCESS_TOKEN_EXPIRE_MINUTES"
    )  # default = 1 day

    # ── App Info ──────────────────────────────────────────────────────────
    APP_NAME: str = Field(default="Zoiko HR Platform Backend", validation_alias="HR_APP_NAME")
    APP_VERSION: str = Field(default="1.0.0", validation_alias="HR_APP_VERSION")
    DEBUG: bool = Field(default=True, validation_alias="HR_DEBUG")

    @field_validator("DEBUG", mode="before")
    @classmethod
    def normalize_debug(cls, value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"release", "prod", "production"}:
                return False
            if normalized in {"dev", "development"}:
                return True
        return value

    # ── CORS ──────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,"
        "http://127.0.0.1:5173,http://127.0.0.1:5174"
    )

    # ── Frontend base URL (used only to build links embedded in emails) ────
    FRONTEND_URL: str = "http://localhost:5173"

    # ── Super Admin bootstrap ─────────────────────────────────────────────
    # Secret key that unlocks the POST /super-admin/bootstrap endpoint and the
    # scripts/seed_super_admin.py CLI. Leave empty to DISABLE both.
    SUPER_ADMIN_SETUP_KEY: str = ""

    # ── Email / SMTP (used by app/services/email_service.py) ───────────────
    SMTP_HOST: str = "smtpout.secureserver.net"
    SMTP_PORT: str = "465"
    SMTP_USERNAME: str = "Info@zoikoone.com"
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "Info@zoikoone.com"
    SMTP_USE_TLS: str = "true"

    # ── Assistant / LLM (app/modules/assistant) ─────────────────────────────
    # Groq is the chat-completion provider (llm_client.py); embeddings are a
    # separate local model (embeddings.py) since Groq has no embeddings API.
    GROQ_API_KEY: str = Field(default="", validation_alias="HR_GROQ_API_KEY")
    # llama-3.3-70b-versatile was retired from Groq's catalog; gpt-oss-120b
    # is the current flagship general-purpose chat model with reliable JSON
    # mode. Re-verify against `client.models.list()` before changing this.
    GROQ_MODEL: str = Field(default="openai/gpt-oss-120b", validation_alias="HR_GROQ_MODEL")
    EMBEDDING_MODEL: str = Field(default="BAAI/bge-small-en-v1.5", validation_alias="HR_EMBEDDING_MODEL")


settings = Settings()
