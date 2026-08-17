from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user

from app.modules.assistant import scope_service

scope_router = APIRouter(prefix="/assistant/scope", tags=["Assistant Scope"])


@scope_router.get("/team")
def get_team_scope(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Empty list is a normal response for an individual contributor — the
    UI only shows the ScopeSelector when this list is non-empty."""
    members = scope_service.get_team_members(db, current_user)
    return {
        "members": [
            {"id": m.id, "full_name": m.full_name, "job_title": m.job_title}
            for m in members
        ]
    }
