"""Automation admin API (ZHR-DOCS-ARCH-001 §7.6 / §15.3): notification wording now; rules, runs and settings join in Phase 8.

Admin + HR Admin (`automation.manage`)."""
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.hr.documents.automation import admin_service as admin, retention, templates as svc
from app.modules.hr.documents.permissions import DocAction, require_doc_permission

router = APIRouter(prefix="/hr/automation", tags=["📄 HR Documents · Automation"])

KEY = Path(..., max_length=60, pattern=r"^[a-z_.]+$")
CHANNEL = Path(..., pattern="^(email|in_app)$")


class TemplateIn(BaseModel):
    subject: Optional[str] = Field(None, max_length=200)
    body: str = Field(..., min_length=1, max_length=4000)


@router.get("/templates", summary="Document notifications and the organization's own wording")
def list_templates(db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.AUTOMATION_MANAGE))):
    return {"items": svc.list_templates(db, user.organization_id), "variables": svc.VARIABLES}


@router.put("/templates/{key}/{channel}", summary="Save the organization's wording for one notification")
def put_template(body: TemplateIn, key: str = KEY, channel: str = CHANNEL, db: Session = Depends(get_db),
                 user=Depends(require_doc_permission(DocAction.AUTOMATION_MANAGE))):
    return svc.put(db, user, key, channel, body.subject, body.body)


@router.delete("/templates/{key}/{channel}", status_code=204, summary="Go back to the platform wording")
def delete_template(key: str = KEY, channel: str = CHANNEL, db: Session = Depends(get_db),
                    user=Depends(require_doc_permission(DocAction.AUTOMATION_MANAGE))):
    svc.delete(db, user, key, channel)


@router.post("/templates/{key}/{channel}/preview", summary="Show the wording with sample values")
def preview_template(body: TemplateIn, key: str = KEY, channel: str = CHANNEL,
                     user=Depends(require_doc_permission(DocAction.AUTOMATION_MANAGE))):
    return svc.preview(key, channel, body.subject, body.body)


# ── retention policies ─────────────────────────────────────────────────────────────────────────────────────────────

SCOPE = Path(..., pattern="^(employee|company)$")
CAT_KEY = Path(..., max_length=50, pattern=r"^[a-z0-9_]+$")


class RetentionIn(BaseModel):
    retain_years: int = Field(..., ge=1, le=100)
    clock: str = Field(..., pattern="^(from_upload|from_exit|from_expiry)$")
    action: str = Field("archive", pattern="^(flag|archive|delete)$")
    review_days: int = Field(30, ge=7, le=365)


@router.get("/retention-policies", summary="How long each category's files are kept")
def list_retention(db: Session = Depends(get_db), user=Depends(require_doc_permission(DocAction.AUTOMATION_MANAGE))):
    return retention.list_policies(db, user)


@router.put("/retention-policies/{scope}/{key}", summary="Set a category's retention policy")
def put_retention(body: RetentionIn, scope: str = SCOPE, key: str = CAT_KEY, db: Session = Depends(get_db),
                  user=Depends(require_doc_permission(DocAction.AUTOMATION_MANAGE))):
    return retention.put_policy(db, user, scope, key, retain_years=body.retain_years, clock=body.clock, action=body.action,
                                review_days=body.review_days)


@router.delete("/retention-policies/{scope}/{key}", status_code=204, summary="Keep this category's files indefinitely")
def delete_retention(scope: str = SCOPE, key: str = CAT_KEY, db: Session = Depends(get_db),
                     user=Depends(require_doc_permission(DocAction.AUTOMATION_MANAGE))):
    retention.delete_policy(db, user, scope, key)


# ── rules engine (Phase 8) ─────────────────────────────────────────────────────────────────────────────────────────

MANAGE = require_doc_permission(DocAction.AUTOMATION_MANAGE)


class RuleIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=1000)
    trigger_event: str = Field(..., max_length=80)
    definition: dict
    status: str = Field("paused", pattern="^(active|paused|shadow)$")


class RulePatch(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=1000)
    trigger_event: Optional[str] = Field(None, max_length=80)
    definition: Optional[dict] = None


class StatusIn(BaseModel):
    status: str = Field(..., pattern="^(active|paused|shadow)$")


class DryRunIn(BaseModel):
    definition: Optional[dict] = None              # the unsaved edit, if any
    trigger_event: Optional[str] = Field(None, max_length=80)
    sample: Optional[dict] = None                  # an example event payload instead of recent real events
    last_n: int = Field(20, ge=1, le=50)


@router.get("/catalog", summary="Events, condition fields, operators and actions a rule can use")
def get_catalog(user=Depends(MANAGE)):
    return admin.catalog()


@router.get("/rules", summary="Automation rules")
def list_rules(event: Optional[str] = Query(None, max_length=80), status: Optional[str] = Query(None, pattern="^(active|paused|shadow)$"),
               system: Optional[bool] = Query(None), db: Session = Depends(get_db), user=Depends(MANAGE)):
    return admin.list_rules(db, user, event=event, status=status, system=system)


@router.post("/rules", status_code=201, summary="Create a rule (paused unless said otherwise)")
def create_rule(body: RuleIn, db: Session = Depends(get_db), user=Depends(MANAGE)):
    return admin.create_rule(db, user, name=body.name, trigger_event=body.trigger_event, definition=body.definition,
                             description=body.description, status=body.status)


@router.post("/rules/dry-run", summary="Try an unsaved rule against recent events (sends nothing)")
def dry_run_new(body: DryRunIn, db: Session = Depends(get_db), user=Depends(MANAGE)):
    return admin.dry_run(db, user, None, definition=body.definition, trigger_event=body.trigger_event, sample=body.sample,
                         last_n=body.last_n)


@router.get("/rules/{rule_id}", summary="One rule")
def get_rule(rule_id: int, db: Session = Depends(get_db), user=Depends(MANAGE)):
    return admin.get_rule(db, user, rule_id)


@router.patch("/rules/{rule_id}", summary="Change a rule (a new version)")
def update_rule(rule_id: int, body: RulePatch, db: Session = Depends(get_db), user=Depends(MANAGE)):
    return admin.update_rule(db, user, rule_id, body.model_dump(exclude_unset=True))


@router.delete("/rules/{rule_id}", status_code=204, summary="Delete a rule (system rules can only be paused)")
def delete_rule(rule_id: int, db: Session = Depends(get_db), user=Depends(MANAGE)):
    admin.delete_rule(db, user, rule_id)


@router.post("/rules/{rule_id}/status", summary="Activate, pause, or run in shadow mode")
def set_rule_status(rule_id: int, body: StatusIn, db: Session = Depends(get_db), user=Depends(MANAGE)):
    return admin.set_status(db, user, rule_id, body.status)


@router.post("/rules/{rule_id}/dry-run", summary="What the rule would do for recent events (sends nothing)")
def dry_run(rule_id: int, body: DryRunIn, db: Session = Depends(get_db), user=Depends(MANAGE)):
    return admin.dry_run(db, user, rule_id, definition=body.definition, sample=body.sample, last_n=body.last_n)


@router.get("/runs", summary="Run history")
def list_runs(rule_id: Optional[int] = Query(None), status: Optional[str] = Query(None, max_length=12),
              event: Optional[str] = Query(None, max_length=80), date_from: Optional[datetime] = Query(None, alias="from"),
              date_to: Optional[datetime] = Query(None, alias="to"), page: int = Query(1, ge=1),
              per_page: int = Query(50, ge=1, le=200), db: Session = Depends(get_db), user=Depends(MANAGE)):
    return admin.list_runs(db, user, rule_id=rule_id, status=status, event=event, date_from=date_from, date_to=date_to,
                           page=page, per_page=per_page)


@router.get("/runs/{run_id}", summary="One run: its steps and error")
def get_run(run_id: int, db: Session = Depends(get_db), user=Depends(MANAGE)):
    return admin.get_run(db, user, run_id)


@router.post("/runs/{run_id}/retry", summary="Retry a failed run (dead-letter replay)")
def retry_run(run_id: int, db: Session = Depends(get_db), user=Depends(MANAGE)):
    return admin.retry_run(db, user, run_id)


@router.get("/settings", summary="Organization automation settings")
def get_settings(db: Session = Depends(get_db), user=Depends(MANAGE)):
    return admin.get_settings(db, user)


@router.put("/settings", summary="Change automation settings (pause, quiet hours and limits: Org Admin only)")
def put_settings(body: dict[str, Any], db: Session = Depends(get_db), user=Depends(MANAGE)):
    return admin.put_settings(db, user, body)
