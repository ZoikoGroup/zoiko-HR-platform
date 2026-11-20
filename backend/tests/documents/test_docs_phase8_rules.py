"""Documents Phase 8: the rules engine for admins — catalog, rule CRUD (system rules can't be deleted, forbidden actions are
refused), dry runs against real recent events, shadow mode, run history with retry, and the org automation settings."""
from datetime import datetime

from app.modules.hr.documents.automation.models import AutomationRule, AutomationRun
from test_docs_phase2_flows import _drain, _notified, _upload, api  # noqa: F401

REJECTED_ID_RULE = {
    "name": "Rejected identity document: tell the manager",
    "trigger_event": "document.rejected",
    "definition": {"conditions": {"all": [{"field": "data.category_key", "op": "in", "value": ["identity_proof"]}]},
                   "actions": [{"type": "notify", "to": "manager", "event": "document.task_escalated", "title": "ID document"},
                               {"type": "create_task", "kind": "reupload", "due_in_days": 5}]},
}


def test_the_catalog_lists_events_fields_operators_and_safe_actions(api):
    api.as_("hr")
    cat = api.get("/hr/automation/catalog").json()
    assert "document.rejected" in [e["type"] for e in cat["events"]]
    assert "data.category_key" in next(e for e in cat["events"] if e["type"] == "document.rejected")["fields"]
    assert "in" in cat["operators"] and {"notify", "create_task", "delay"} <= {a["type"] for a in cat["actions"]}
    assert not {"approve", "approve_document", "widen_access"} & {a["type"] for a in cat["actions"]}


def test_create_dry_run_activate_and_see_it_in_run_history(api):
    api.as_("hr")
    r = api.post("/hr/automation/rules", json=REJECTED_ID_RULE)
    assert r.status_code == 201, r.text
    rule = r.json()
    assert rule["status"] == "paused" and rule["version"] == 1
    # some real events to dry-run against: an identity upload rejected
    up = _upload(api).json()
    api.as_("hr")
    api.post(f"/hr/documents/{up['id']}/decision/reject", json={"reason_code": "illegible", "note": "Too blurry to read"})
    _drain(api)
    before = api.db.query(AutomationRun).filter_by(rule_id=rule["id"]).count()
    dry = api.post(f"/hr/automation/rules/{rule['id']}/dry-run", json={}).json()
    assert dry["source"] == "recent" and dry["events"] >= 1 and dry["matched"] >= 1
    assert [a["type"] for a in dry["results"][0]["actions"]] == ["notify", "create_task"]
    assert api.db.query(AutomationRun).filter_by(rule_id=rule["id"]).count() == before          # nothing ran for real
    # a sample that does not match
    miss = api.post(f"/hr/automation/rules/{rule['id']}/dry-run", json={"sample": {"category_key": "education"}}).json()
    assert miss["source"] == "sample" and miss["matched"] == 0
    assert api.post(f"/hr/automation/rules/{rule['id']}/status", json={"status": "active"}).json()["status"] == "active"
    up2 = _upload(api, name="passport2.pdf").json()
    api.as_("hr")
    api.post(f"/hr/documents/{up2['id']}/decision/reject", json={"reason_code": "illegible", "note": "Still too blurry"})
    _drain(api)
    runs = api.get("/hr/automation/runs", params={"rule_id": rule["id"]}).json()
    assert runs["total"] == 1 and runs["items"][0]["status"] == "succeeded"
    detail = api.get(f"/hr/automation/runs/{runs['items'][0]['id']}").json()
    assert [s.get("type") for s in detail["steps"]][:2] == ["notify", "create_task"] and "_context" not in detail["definition"]
    listed = next(r for r in api.get("/hr/automation/rules").json() if r["id"] == rule["id"])
    assert listed["runs_7d"] == 1 and listed["success_rate_7d"] == 100


def test_an_unsaved_rule_can_be_dry_run_too(api):
    api.as_("hr")
    r = api.post("/hr/automation/rules/dry-run", json={"trigger_event": "document.rejected", "definition": REJECTED_ID_RULE["definition"],
                                                         "sample": {"category_key": "identity_proof", "employee_id": api.people["emp"].id}})
    assert r.status_code == 200 and r.json()["matched"] == 1


def test_forbidden_or_unknown_actions_and_bad_events_are_refused(api):
    api.as_("hr")
    bad = dict(REJECTED_ID_RULE, definition={"conditions": {"all": []}, "actions": [{"type": "approve_document"}]})
    r = api.post("/hr/automation/rules", json=bad)
    assert r.status_code == 422 and any("not allowed" in p for p in r.json().get("problems", []))
    assert api.post("/hr/automation/rules", json=dict(REJECTED_ID_RULE, trigger_event="nope.event")).status_code == 422
    long_delay = dict(REJECTED_ID_RULE, definition={"conditions": {"all": []}, "actions": [{"type": "delay", "seconds": 8 * 86400}]})
    assert api.post("/hr/automation/rules", json=long_delay).status_code == 422


def test_system_rules_can_be_paused_and_edited_but_not_deleted_or_retriggered(api):
    api.as_("hr")
    sys_rule = next(r for r in api.get("/hr/automation/rules", params={"system": True}).json() if r["key"] == "sys.onboarding_checklist")
    assert api.delete(f"/hr/automation/rules/{sys_rule['id']}").status_code == 403
    assert api.patch(f"/hr/automation/rules/{sys_rule['id']}", json={"trigger_event": "document.uploaded"}).status_code == 403
    edited = api.patch(f"/hr/automation/rules/{sys_rule['id']}",
                       json={"definition": {"conditions": {"all": []}, "actions": [{"type": "create_upload_tasks", "due_in_days": 7}]}})
    assert edited.status_code == 200 and edited.json()["version"] == sys_rule["version"] + 1
    assert api.post(f"/hr/automation/rules/{sys_rule['id']}/status", json={"status": "paused"}).json()["status"] == "paused"
    own = api.post("/hr/automation/rules", json=REJECTED_ID_RULE).json()
    assert api.delete(f"/hr/automation/rules/{own['id']}").status_code == 204


def test_shadow_rules_record_what_they_would_do_without_doing_it(api):
    api.as_("hr")
    rule = api.post("/hr/automation/rules", json=dict(REJECTED_ID_RULE, status="shadow")).json()
    up = _upload(api).json()
    api.as_("hr")
    api.post(f"/hr/documents/{up['id']}/decision/reject", json={"reason_code": "illegible", "note": "Too blurry to read"})
    _drain(api)
    run = api.db.query(AutomationRun).filter_by(rule_id=rule["id"]).one()
    assert run.mode == "shadow"
    from app.modules.hr.documents.automation.models import DocumentTask
    assert api.db.query(DocumentTask).filter_by(rule_id=rule["id"]).count() == 0


def test_a_dead_run_can_be_retried(api):
    api.as_("hr")
    rule = api.post("/hr/automation/rules", json=REJECTED_ID_RULE).json()
    run = AutomationRun(organization_id=1, rule_id=rule["id"], rule_version=1, event_id="e1", event_type="document.rejected",
                        trigger_payload={"id": "e1", "type": "document.rejected", "organization_id": 1, "data": {}},
                        definition_snapshot={"actions": [{"type": "log"}]}, status="dead", attempt=5, idempotency_key="k-dead",
                        error="boom", created_at=datetime.utcnow())
    api.db.add(run)
    api.db.commit()
    assert api.get("/hr/automation/runs", params={"status": "dead"}).json()["items"][0]["can_retry"] is True
    r = api.post(f"/hr/automation/runs/{run.id}/retry")
    assert r.status_code == 200 and r.json()["status"] == "pending"
    assert api.post(f"/hr/automation/runs/{run.id}/retry").status_code == 409


def test_other_organizations_rules_and_runs_are_invisible(api):
    api.as_("hr")
    rule = api.post("/hr/automation/rules", json=REJECTED_ID_RULE).json()
    api.as_("other")
    assert api.get(f"/hr/automation/rules/{rule['id']}").status_code == 403          # an employee: no automation at all
    other = api.db.query(AutomationRule).filter_by(id=rule["id"]).one()
    other.organization_id = 2
    api.db.commit()
    api.as_("hr")
    assert api.get(f"/hr/automation/rules/{rule['id']}").status_code == 404


def test_settings_only_the_org_admin_pauses_or_sets_quiet_hours(api):
    api.as_("hr")
    s = api.get("/hr/automation/settings").json()
    assert s["paused"] is False and s["approval_sla_hours"] == 72 and s["can_change_global"] is False
    assert api.put("/hr/automation/settings", json={"approval_sla_hours": 48, "features": {"ocr": True}}).json()["features"]["ocr"] is True
    assert api.put("/hr/automation/settings", json={"paused": True}).status_code == 403
    assert api.put("/hr/automation/settings", json={"quiet_hours": {"start": "20:00", "end": "08:00", "tz": "UTC"}}).status_code == 403
    api.as_("admin")
    r = api.put("/hr/automation/settings", json={"paused": True, "quiet_hours": {"start": "20:00", "end": "08:00", "tz": "Asia/Kolkata"},
                                                 "rate_limits": {"reminders_per_employee_per_day": 3}})
    assert r.status_code == 200 and r.json()["paused"] is True and r.json()["quiet_hours"]["tz"] == "Asia/Kolkata"
    assert api.put("/hr/automation/settings", json={"quiet_hours": {"start": "8pm", "end": "08:00"}}).status_code == 422
    assert api.put("/hr/automation/settings", json={"default_ladder": [{"after_days": 3, "to": "nobody"}]}).status_code == 422
    assert api.put("/hr/automation/settings", json={"features": {"teleport": True}}).status_code == 422
    api.as_("emp")
    assert api.get("/hr/automation/settings").status_code == 403
