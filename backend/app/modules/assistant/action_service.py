"""
modules/assistant/action_service.py
---------------------------------------
Generic draft -> validate -> confirm -> execute -> reconcile workflow engine,
proven end-to-end with one concrete action type: booking a leave request.
Additional workflow_type values plug into `_VALIDATORS`/`_EXECUTORS` below
without changing the engine itself.

Consequential writes never happen from free-form model output: the model
only ever proposes draft field values (or the user edits them directly in
the UI); every transition after that is deterministic code, gated by
explicit user confirmation and an idempotency key.
"""

import datetime
import hashlib
import re
import secrets

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException, ZoikoException
from app.modules.assistant import audit_service, guardrails, safety_service
from app.modules.assistant.models import (
    ChatTurn, ChatWorkflow, ChatWorkflowField, ChatWorkflowValidation,
    ChatWorkflowConfirmation, ChatWorkflowExecution, ChatWorkflowReconciliation,
    ChatActionEvidence, ChatIdempotencyKey, ChatResponse, TurnStatus, WorkflowStatus,
    AnswerType, ConfidenceState,
)
from app.modules.hr import attendance_service
from app.modules.hr.models import LeaveType, LeaveRequest

_ISO_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _extract_leave_type(text: str) -> str | None:
    lowered = text.lower()
    for lt in LeaveType:
        if lt.value in lowered:
            return lt.value
    return None


def _extract_dates(text: str) -> tuple[str | None, str | None]:
    matches = _ISO_DATE_RE.findall(text)
    if not matches:
        return None, None
    if len(matches) == 1:
        return matches[0], matches[0]
    return matches[0], matches[1]


_CLARIFICATION_PROMPTS = {
    "leave_type": "what type of leave (e.g. annual, sick, casual)",
    "dates": "which dates (a start and end date)",
}


def start_book_leave_workflow(db: Session, turn: ChatTurn, employee) -> ChatTurn:
    """Turn-processing entry point for the book_leave intent: creates a
    ChatWorkflow draft (best-effort field extraction from the turn text) and
    completes the turn with an ACTION response pointing at it. The client
    then drives validate -> confirm -> execute via the workflow endpoints.

    A material field that couldn't be extracted (leave type or dates) is
    never silently guessed — the response asks a targeted clarifying
    question naming exactly what's missing (AI Guardrail spec, Section 21:
    "do not guess consequence-bearing intent"), while still creating the
    draft so the user can also just fill the field in directly."""
    leave_type = _extract_leave_type(turn.user_input_text)
    start_date, end_date = _extract_dates(turn.user_input_text)

    workflow = ChatWorkflow(
        conversation_id=turn.conversation_id,
        turn_id=turn.id,
        organization_id=turn.organization_id,
        employee_id=employee.id,
        workflow_type="book_leave",
        status=WorkflowStatus.DRAFT,
        version=1,
    )
    db.add(workflow)
    db.flush()

    for name, value in (
        ("leave_type", leave_type), ("start_date", start_date),
        ("end_date", end_date), ("reason", turn.user_input_text),
    ):
        db.add(ChatWorkflowField(workflow_id=workflow.id, field_name=name, field_value=value))
    db.flush()

    _write_evidence(db, workflow.id, turn.organization_id, "draft", {"fields": {
        "leave_type": leave_type, "start_date": start_date, "end_date": end_date,
    }})

    missing = []
    if not leave_type:
        missing.append(_CLARIFICATION_PROMPTS["leave_type"])
    if not (start_date and end_date):
        missing.append(_CLARIFICATION_PROMPTS["dates"])

    if missing:
        answer_text = (
            "I've started a leave request, but I need a bit more before you can submit it — "
            "could you tell me " + " and ".join(missing) + "? You can also fill it in directly below."
        )
        confidence_state = ConfidenceState.PARTIAL
        safety_service.record(db, turn.organization_id, "clarification_requested", turn_id=turn.id,
                               employee_id=employee.id, detail={"missing_fields": missing})
    else:
        answer_text = "I've drafted a leave request based on your message. Review the details and confirm to submit it."
        confidence_state = ConfidenceState.PARTIAL

    response = ChatResponse(
        turn_id=turn.id,
        answer_text=answer_text,
        answer_type=AnswerType.ACTION,
        confidence_state=confidence_state,
        next_actions=[{"type": "review_workflow", "label": "Review leave request", "workflow_id": workflow.id}],
    )
    db.add(response)

    turn.status = TurnStatus.COMPLETED
    turn.completed_at = datetime.datetime.utcnow()
    audit_service.record(db, turn.organization_id, "workflow_drafted", "chat_workflow", workflow.id, employee.id)
    db.commit()
    db.refresh(turn)
    return turn


def _write_evidence(db: Session, workflow_id: int, organization_id: int, evidence_type: str, payload: dict) -> None:
    db.add(ChatActionEvidence(
        workflow_id=workflow_id, organization_id=organization_id,
        evidence_type=evidence_type, payload=payload,
    ))
    db.flush()


def _get_workflow(db: Session, organization_id: int, employee_id: int, workflow_id: int) -> ChatWorkflow:
    workflow = (
        db.query(ChatWorkflow)
        .filter(ChatWorkflow.id == workflow_id, ChatWorkflow.organization_id == organization_id)
        .first()
    )
    if not workflow:
        raise NotFoundException("Workflow", workflow_id)
    if workflow.employee_id != employee_id:
        raise ForbiddenException("You may only act on your own workflow drafts.")
    return workflow


def _fields_dict(db: Session, workflow_id: int) -> dict:
    fields = db.query(ChatWorkflowField).filter(ChatWorkflowField.workflow_id == workflow_id).all()
    return {f.field_name: f.field_value for f in fields}


def _fingerprint(workflow: ChatWorkflow, fields: dict) -> str:
    canonical = f"{workflow.id}:{workflow.version}:" + ",".join(
        f"{k}={fields.get(k)}" for k in sorted(fields.keys())
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def update_fields(db: Session, organization_id: int, employee_id: int, workflow_id: int, updates: dict) -> ChatWorkflow:
    """User edits a draft field (e.g. corrects the leave dates) before
    validating. Bumps the workflow version so any previously-issued
    confirmation token is invalidated."""
    workflow = _get_workflow(db, organization_id, employee_id, workflow_id)
    if workflow.status not in (WorkflowStatus.DRAFT,):
        raise BadRequestException("Only a draft workflow's fields can be edited.")

    existing = {f.field_name: f for f in db.query(ChatWorkflowField).filter(ChatWorkflowField.workflow_id == workflow_id).all()}
    for name, value in updates.items():
        if name in existing:
            existing[name].field_value = value
        else:
            db.add(ChatWorkflowField(workflow_id=workflow_id, field_name=name, field_value=value))
    workflow.version += 1
    db.commit()
    db.refresh(workflow)
    return workflow


def validate_workflow(db: Session, organization_id: int, employee_id: int, workflow_id: int) -> ChatWorkflow:
    workflow = _get_workflow(db, organization_id, employee_id, workflow_id)
    if workflow.status not in (WorkflowStatus.DRAFT,):
        raise BadRequestException(f"Cannot validate a workflow in status '{workflow.status.value}'.")

    fields = _fields_dict(db, workflow_id)
    checks = _VALIDATORS[workflow.workflow_type](db, workflow, fields)

    db.query(ChatWorkflowValidation).filter(ChatWorkflowValidation.workflow_id == workflow_id).delete()
    for rule_name, passed, message in checks:
        db.add(ChatWorkflowValidation(workflow_id=workflow_id, rule_name=rule_name, passed=passed, message=message))

    all_passed = all(passed for _, passed, _ in checks)
    workflow.status = WorkflowStatus.VALIDATED if all_passed else WorkflowStatus.DRAFT
    db.flush()

    _write_evidence(db, workflow.id, organization_id, "validated",
                     {"passed": all_passed, "checks": [{"rule": r, "passed": p, "message": m} for r, p, m in checks]})
    audit_service.record(db, organization_id, "workflow_validated", "chat_workflow", workflow.id, employee_id,
                          {"passed": all_passed})
    db.commit()
    db.refresh(workflow)
    return workflow


def get_confirmation_token(db: Session, workflow: ChatWorkflow) -> str:
    """Fingerprint of the workflow's current version + field values. The
    client must echo this back at /confirm; if the workflow changed in the
    meantime the fingerprint won't match and confirm is rejected (409)."""
    return _fingerprint(workflow, _fields_dict(db, workflow.id))


def confirm_workflow(db: Session, organization_id: int, employee_id: int, workflow_id: int,
                      confirmation_token: str) -> ChatWorkflow:
    workflow = _get_workflow(db, organization_id, employee_id, workflow_id)
    if workflow.status != WorkflowStatus.VALIDATED:
        raise BadRequestException(f"Cannot confirm a workflow in status '{workflow.status.value}'. Validate it first.")

    current_fingerprint = get_confirmation_token(db, workflow)
    if current_fingerprint != confirmation_token:
        raise ZoikoException(409, "WORKFLOW_STALE",
                              "This workflow changed since it was validated. Please re-validate before confirming.")

    db.add(ChatWorkflowConfirmation(
        workflow_id=workflow.id, confirmation_token=confirmation_token, fingerprint_hash=current_fingerprint,
        workflow_version=workflow.version, confirmed_by=employee_id,
    ))
    workflow.status = WorkflowStatus.AWAITING_CONFIRMATION  # confirmed by the user; awaiting the execute call
    db.flush()

    _write_evidence(db, workflow.id, organization_id, "confirmed", {"fingerprint": current_fingerprint})
    audit_service.record(db, organization_id, "workflow_confirmed", "chat_workflow", workflow.id, employee_id)
    db.commit()
    db.refresh(workflow)
    return workflow


def execute_workflow(db: Session, organization_id: int, employee_id: int, workflow_id: int,
                      idempotency_key: str) -> ChatWorkflow:
    if not guardrails.is_actions_enabled(db, organization_id, employee_id=employee_id):
        if guardrails.is_employee_processing_restricted(db, employee_id):
            raise ZoikoException(403, "ASSISTANT_ACTIONS_DISABLED", "Actions are restricted for your account per a data-privacy request you submitted.")
        raise ZoikoException(403, "ASSISTANT_ACTIONS_DISABLED", "Actions are currently disabled by an administrator.")

    workflow = _get_workflow(db, organization_id, employee_id, workflow_id)

    existing_key = (
        db.query(ChatIdempotencyKey)
        .filter(ChatIdempotencyKey.organization_id == organization_id, ChatIdempotencyKey.employee_id == employee_id,
                ChatIdempotencyKey.operation == "execute_workflow", ChatIdempotencyKey.idempotency_key == idempotency_key)
        .first()
    )
    if existing_key:
        return workflow  # already executed under this key — idempotent no-op

    if workflow.status != WorkflowStatus.AWAITING_CONFIRMATION:
        raise BadRequestException(f"Cannot execute a workflow in status '{workflow.status.value}'. Confirm it first.")

    workflow.status = WorkflowStatus.EXECUTING
    db.flush()

    fields = _fields_dict(db, workflow_id)
    try:
        record_id = _EXECUTORS[workflow.workflow_type](db, workflow, fields, employee_id)
        db.add(ChatWorkflowExecution(
            workflow_id=workflow.id, idempotency_key=idempotency_key, target_record_type="leave_requests",
            target_record_id=record_id, status="completed", result={"record_id": record_id},
            executed_at=datetime.datetime.utcnow(),
        ))
        db.add(ChatIdempotencyKey(
            organization_id=organization_id, employee_id=employee_id, operation="execute_workflow",
            idempotency_key=idempotency_key, response_snapshot={"workflow_id": workflow.id, "record_id": record_id},
        ))
        workflow.status = WorkflowStatus.COMPLETED
        _write_evidence(db, workflow.id, organization_id, "executed", {"record_id": record_id})
        audit_service.record(db, organization_id, "workflow_executed", "chat_workflow", workflow.id, employee_id,
                              {"record_id": record_id})
        db.commit()
    except Exception as e:
        db.rollback()
        workflow.status = WorkflowStatus.RECONCILIATION_REQUIRED
        execution = ChatWorkflowExecution(
            workflow_id=workflow.id, idempotency_key=idempotency_key, status="failed", result={"error": str(e)},
        )
        db.add(execution)
        db.flush()
        db.add(ChatWorkflowReconciliation(workflow_execution_id=execution.id, status="unresolved"))
        _write_evidence(db, workflow.id, organization_id, "reconciled", {"error": str(e)})
        audit_service.record(db, organization_id, "workflow_execution_failed", "chat_workflow", workflow.id,
                              employee_id, {"error": str(e)})
        db.commit()

    db.refresh(workflow)
    return workflow


def cancel_workflow(db: Session, organization_id: int, employee_id: int, workflow_id: int) -> ChatWorkflow:
    workflow = _get_workflow(db, organization_id, employee_id, workflow_id)
    if workflow.status in (WorkflowStatus.COMPLETED, WorkflowStatus.CANCELLED):
        raise BadRequestException(f"Workflow is already '{workflow.status.value}'.")
    workflow.status = WorkflowStatus.CANCELLED
    audit_service.record(db, organization_id, "workflow_cancelled", "chat_workflow", workflow.id, employee_id)
    db.commit()
    db.refresh(workflow)
    return workflow


def get_workflow(db: Session, organization_id: int, employee_id: int, workflow_id: int) -> ChatWorkflow:
    return _get_workflow(db, organization_id, employee_id, workflow_id)


# ── book_leave: validator + executor ──────────────────────────────────────────

def _normalize_leave_type(raw: str) -> str:
    """Defense-in-depth only — the UI now offers a fixed dropdown of exact
    enum values, so this mainly guards any future caller that passes free
    text (e.g. 'Annual Leave' -> 'annual')."""
    normalized = raw.strip().lower()
    if normalized.endswith(" leave"):
        normalized = normalized[: -len(" leave")].strip()
    return normalized


def _validate_book_leave(db: Session, workflow: ChatWorkflow, fields: dict) -> list[tuple[str, bool, str]]:
    checks = []

    leave_type = fields.get("leave_type")
    valid_types = {lt.value for lt in LeaveType}
    if leave_type:
        leave_type = _normalize_leave_type(leave_type)
    checks.append(("leave_type_present", bool(leave_type), "Leave type is required."
                   if not leave_type else "OK"))
    if leave_type and leave_type not in valid_types:
        checks.append(("leave_type_valid", False,
                        f"'{leave_type}' is not a recognized leave type. Choose one of: {', '.join(sorted(valid_types))}."))

    start_date, end_date = fields.get("start_date"), fields.get("end_date")
    checks.append(("dates_present", bool(start_date and end_date),
                    "Both a start and end date are required." if not (start_date and end_date) else "OK"))

    if start_date and end_date:
        try:
            sd = datetime.date.fromisoformat(start_date)
            ed = datetime.date.fromisoformat(end_date)
            checks.append(("date_order_valid", sd <= ed, "Start date must be on or before the end date." if sd > ed else "OK"))
            checks.append(("not_in_past", sd >= datetime.date.today(),
                            "Leave cannot start in the past." if sd < datetime.date.today() else "OK"))
        except ValueError:
            checks.append(("dates_parseable", False, "Dates must be in YYYY-MM-DD format."))

    if leave_type and leave_type in valid_types and start_date and end_date:
        try:
            sd = datetime.date.fromisoformat(start_date)
            ed = datetime.date.fromisoformat(end_date)
            requested_days = (ed - sd).days + 1
            balances = attendance_service.get_leave_balance(db, employee_id=workflow.employee_id, organization_id=workflow.organization_id)
            bal = balances.get(leave_type)
            if bal is None:
                checks.append(("balance_available", False, f"No '{leave_type}' balance record found for you."))
            else:
                remaining = bal["total_days"] - bal["used_days"] - bal["pending_days"]
                checks.append(("balance_sufficient", requested_days <= remaining,
                                "OK" if requested_days <= remaining else
                                f"You requested {requested_days} day(s) but only have {remaining} remaining."))
        except ValueError:
            pass

    return checks


def _execute_book_leave(db: Session, workflow: ChatWorkflow, fields: dict, employee_id: int) -> int:
    # Inserted directly rather than via attendance_service.create_leave_request:
    # that helper unconditionally passes created_by= to the LeaveRequest
    # constructor, but LeaveRequest has no created_by column, so it raises.
    start_date = datetime.date.fromisoformat(fields["start_date"])
    end_date = datetime.date.fromisoformat(fields["end_date"])
    leave = LeaveRequest(
        employee_id=workflow.employee_id,
        organization_id=workflow.organization_id,
        leave_type=_normalize_leave_type(fields["leave_type"]),
        start_date=start_date,
        end_date=end_date,
        days=(end_date - start_date).days + 1,
        reason=fields.get("reason"),
    )
    db.add(leave)
    db.flush()
    return leave.id


_VALIDATORS = {"book_leave": _validate_book_leave}
_EXECUTORS = {"book_leave": _execute_book_leave}
