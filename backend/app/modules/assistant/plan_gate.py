"""Which plan feature each part of the assistant needs.

The chatbot is not part of the Core plan (plan_baseline: the hr.ai.* chat keys are False for Core), so an organization
whose plan leaves the feature out (NOT_ENTITLED) gets a 403 with the upgrade message from every assistant route below,
as does one whose access is paused for an overdue payment. Every other state keeps the assistant as before: Enterprise
without contract rows and organizations without a plan resolve to ENTITLED_NOT_CONFIGURED, and evaluations to
TRIAL_RESTRICTED, and taking the chatbot away from those is not what "Core has no chatbot" means.

Platform accounts (no organization, no plan) are let through. Left ungated on purpose: the public website assistant
(/assistant/public, no login) and privacy requests (/assistant/privacy-requests), so a customer can still access or
erase old chat data after a downgrade.
"""
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.modules.billing.entitlement_service import DELINQUENCY_RESTRICTED, NOT_ENTITLED, check_entitlement

BLOCKING_STATES = frozenset({NOT_ENTITLED, DELINQUENCY_RESTRICTED})


def _require(feature_key: str):
    def _enforce(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
        organization_id = getattr(current_user, "organization_id", None)
        if organization_id is None:
            return current_user
        result = check_entitlement(db, organization_id, feature_key)
        state = result["state"]
        if state not in BLOCKING_STATES:
            return current_user
        from app.modules.billing.plan_baseline import UPGRADE_URL, not_entitled_message
        raise HTTPException(status_code=403, detail={
            "entitlement_state": state,
            "feature_key": feature_key,
            "required_plan": result.get("required_plan"),
            "upgrade_url": UPGRADE_URL,
            "message": not_entitled_message(feature_key, state, result.get("required_plan")),
        })
    return _enforce


CHAT = [Depends(_require("hr.ai.navigation"))]
KNOWLEDGE_ADMIN = [Depends(_require("hr.ai.policy_qa"))]
HANDOFF_ADMIN = [Depends(_require("hr.ai.workflow_assist"))]
CONTROLS_ADMIN = [Depends(_require("hr.ai.governance_admin"))]
