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
    # No default: an unset HR_SECRET_KEY must refuse startup, not silently
    # fall back to a value anyone can read in this source file.
    SECRET_KEY: str = Field(validation_alias="HR_SECRET_KEY")
    ALGORITHM: str = Field(default="HS256", validation_alias="HR_ALGORITHM")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=1440, validation_alias="HR_ACCESS_TOKEN_EXPIRE_MINUTES"
    )  # default = 1 day

    # ── App Info ──────────────────────────────────────────────────────────
    APP_NAME: str = Field(default="Zoiko HR Platform Backend", validation_alias="HR_APP_NAME")
    APP_VERSION: str = Field(default="1.0.0", validation_alias="HR_APP_VERSION")
    DEBUG: bool = Field(default=False, validation_alias="HR_DEBUG")

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
    # This default is a fallback only — the real deployed server's .env sets
    # CORS_ORIGINS explicitly (see backend/.env.example). The production
    # origins are included here too as a safety net in case that env var is
    # ever missing: app.zoikohr.com (authenticated platform) and
    # zoikohr.com/www.zoikohr.com (public marketing site + its chat widget).
    CORS_ORIGINS: str = (
        "https://app.zoikohr.com,https://zoikohr.com,https://www.zoikohr.com,"
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001,"  # Next.js falls back here when 3000 is taken
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

    # ── Stripe (app/modules/billing/stripe_sync_service.py) ───────────────────
    # Optional, blank-default. Section 17/H2 approvals land before live billing;
    # until then these are TEST-MODE-ONLY keys. If HR_STRIPE_SECRET_KEY is empty,
    # sync_plan_to_stripe logs and no-ops (mirrors the _safe_import pattern in
    # main.py — absence degrades gracefully, never crashes).
    STRIPE_SECRET_KEY: str = Field(default="", validation_alias="HR_STRIPE_SECRET_KEY")
    STRIPE_WEBHOOK_SECRET: str = Field(default="", validation_alias="HR_STRIPE_WEBHOOK_SECRET")
    STRIPE_PUBLISHABLE_KEY: str = Field(default="", validation_alias="HR_STRIPE_PUBLISHABLE_KEY")

    # ── Route-level entitlement enforcement (Prompt 6) ─────────────────────
    # When True, the entitlement middleware blocks requests to feature-guarded
    # routes (route_entitlement_map.py) if the caller's org is NOT entitled to
    # the mapped feature key. Default OFF: the startup sweep stays report-only
    # (coverage warnings + drift checks) so the platform runs without mappings
    # in dev/test. Flip on in an environment where the entitlement matrix is
    # approved and seeding guarantees mapping rows exist.
    ENFORCE_ENTITLEMENTS: bool = Field(
        default=False, validation_alias="HR_ENFORCE_ENTITLEMENTS"
    )

    # ── Public assistant (zoikohr.com) ──────────────────────────────────────
    # Organization that owns the seeded is_public=True knowledge content and
    # that audit/safety log rows for anonymous public queries are attributed
    # to (both organization_id columns are NOT NULL). Set after running
    # scripts/seed_public_assistant.py. 0 disables the public endpoint.
    PUBLIC_ORG_ID: int = Field(default=0, validation_alias="HR_PUBLIC_ORG_ID")


settings = Settings()
