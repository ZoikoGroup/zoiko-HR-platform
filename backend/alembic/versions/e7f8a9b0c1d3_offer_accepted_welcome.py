"""offer-accepted welcome e-mail: default welcome message, welcome signature, one e-mail per accepted offer

- onboarding_settings.welcome_signature (sign-off of the welcome e-mail)
- onboarding_settings.welcome_message: organisations with no message get the default text (custom messages are kept)
- recruitment_offers.welcome_email_sent_at: the welcome e-mail is sent once per accepted offer

Revision ID: e7f8a9b0c1d3
Revises: 4f39f5164151
Create Date: 2026-11-20 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7f8a9b0c1d3"
down_revision: Union[str, Sequence[str], None] = "4f39f5164151"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    from app.modules.hr.welcome_message import DEFAULT_WELCOME_MESSAGE

    if "welcome_signature" not in _columns("onboarding_settings"):
        op.add_column("onboarding_settings", sa.Column("welcome_signature", sa.String(length=120), nullable=True))
    if "welcome_email_sent_at" not in _columns("recruitment_offers"):
        op.add_column("recruitment_offers", sa.Column("welcome_email_sent_at", sa.DateTime(), nullable=True))
    backfill(op.get_bind(), DEFAULT_WELCOME_MESSAGE)


def backfill(bind, default_text: str) -> int:
    """Fill only organisations whose message is NULL or blank; a custom message is never touched."""
    result = bind.execute(
        sa.text("UPDATE onboarding_settings SET welcome_message = :msg "
                "WHERE welcome_message IS NULL OR TRIM(welcome_message) = ''"),
        {"msg": default_text})
    return result.rowcount or 0


def downgrade() -> None:
    if "welcome_email_sent_at" in _columns("recruitment_offers"):
        op.drop_column("recruitment_offers", "welcome_email_sent_at")
    if "welcome_signature" in _columns("onboarding_settings"):
        op.drop_column("onboarding_settings", "welcome_signature")
