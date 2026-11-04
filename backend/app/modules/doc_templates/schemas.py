"""Request bodies for the template engine API. Responses are plain dicts built by the services (ids, statuses, metadata)."""
from __future__ import annotations

from datetime import date
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

SubjectType = Literal["employee", "candidate", "new_hire", "position", "org"]


class GenerateRequest(BaseModel):
    canonical_id: str = Field(..., max_length=20)
    subject_type: SubjectType
    subject_id: Optional[int] = None
    source_ref: Optional[str] = Field(None, max_length=80)
    language: str = Field("en", max_length=20)
    effective_date: Optional[date] = None
    entity_id: Optional[int] = None
    signatory_id: Optional[int] = None


class BulkGenerateRequest(BaseModel):
    canonical_id: str = Field(..., max_length=20)
    subject_type: SubjectType = "employee"
    subject_ids: list[int] = Field(..., min_length=1, max_length=200)
    language: str = Field("en", max_length=20)


class Comment(BaseModel):
    comment: Optional[str] = Field(None, max_length=2000)


class Reason(BaseModel):
    reason: str = Field(..., min_length=1, max_length=2000)


class NameOverride(BaseModel):
    party: Literal["employee", "candidate"]
    name: str = Field(..., min_length=1, max_length=200)
    reason: str = Field(..., min_length=1, max_length=500)


class SignRequest(BaseModel):
    typed_name: str = Field(..., min_length=1, max_length=200)
    method: Literal["TYPED", "DRAWN"] = "TYPED"
    drawn_signature: Optional[str] = Field(None, max_length=300_000)     # data:image/png;base64,...
    consent_version: str = Field(..., max_length=40)
    otp_code: Optional[str] = Field(None, max_length=10)


class DeclineRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=2000)


class AcknowledgeRequest(BaseModel):
    text_version: str = Field(..., max_length=40)


class VariantCreate(BaseModel):
    pack_id: int
    language: str = Field("en", max_length=20)
    from_variant_id: Optional[int] = None


class VariantUpdate(BaseModel):
    content: Optional[list[dict[str, Any]]] = None
    field_contract: Optional[dict[str, Any]] = None
    clause_rules: Optional[dict[str, Any]] = None
    applicability: Optional[dict[str, Any]] = None
    options: Optional[dict[str, Any]] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    change_reason: Optional[str] = Field(None, max_length=2000)
    change_summary: Optional[str] = Field(None, max_length=2000)    # policies: "what changed", shown to employees
    minor_change: Optional[bool] = None                             # policies: a typo fix that needs no re-acknowledgement


class LegalApproval(BaseModel):
    attestation_accepted: bool = False
    signed_name: str = Field(..., min_length=1, max_length=200)
    reviewer_role: Optional[str] = Field(None, max_length=200)
    qualification_statement: Optional[str] = Field(None, max_length=1000)
    conditions: Optional[str] = Field(None, max_length=2000)
    sources: list[dict[str, Any]] = Field(default_factory=list, max_length=50)
    counsel_name: Optional[str] = Field(None, max_length=200)
    counsel_firm: Optional[str] = Field(None, max_length=200)
    counsel_qualification: Optional[str] = Field(None, max_length=1000)
    review_date: Optional[str] = Field(None, max_length=20)


class PackCreate(BaseModel):
    country: str = Field(..., min_length=2, max_length=2)
    region: Optional[str] = Field(None, max_length=100)
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    source_references: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    retention_rules: dict[str, float] = Field(default_factory=dict)
    requirements: dict[str, bool] = Field(default_factory=dict)
    notes: Optional[str] = Field(None, max_length=4000)


class PackUpdate(BaseModel):
    region: Optional[str] = Field(None, max_length=100)
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    source_references: Optional[list[dict[str, Any]]] = None
    retention_rules: Optional[dict[str, float]] = None
    requirements: Optional[dict[str, bool]] = None
    notes: Optional[str] = Field(None, max_length=4000)


class PackAttestation(BaseModel):
    accepted: bool = False
    name: Optional[str] = Field(None, max_length=200)
    role: Optional[str] = Field(None, max_length=200)
    firm: Optional[str] = Field(None, max_length=200)


class ClauseCreate(BaseModel):
    clause_key: str = Field(..., max_length=80)
    pack_id: int
    language: str = Field("en", max_length=20)
    title: Optional[str] = Field(None, max_length=200)
    text: str = Field(..., min_length=1, max_length=20000)
    source_references: list[dict[str, Any]] = Field(default_factory=list, max_length=50)
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    change_reason: Optional[str] = Field(None, max_length=2000)


class ClauseUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    text: Optional[str] = Field(None, max_length=20000)
    source_references: Optional[list[dict[str, Any]]] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    change_reason: Optional[str] = Field(None, max_length=2000)


class ClauseReview(BaseModel):
    attestation_accepted: bool = False


class SettingsUpdate(BaseModel):
    tenant_attestation_enabled: Optional[bool] = None
    prefer_tenant_variants: Optional[bool] = None
    expiry_warning_days: Optional[int] = Field(None, ge=1, le=365)
    approval_overrides: Optional[dict[str, Literal["L2", "L3"]]] = None


class EntityBody(BaseModel):
    legal_name: Optional[str] = Field(None, max_length=255)
    trading_name: Optional[str] = Field(None, max_length=255)
    registration_type: Optional[str] = Field(None, max_length=40)
    registration_number: Optional[str] = Field(None, max_length=100)
    tax_id: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=2)
    region: Optional[str] = Field(None, max_length=100)
    city: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=20)
    address_lines: Optional[list[str]] = Field(None, max_length=6)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, max_length=255)
    is_default: Optional[bool] = None


class EntityStatus(BaseModel):
    status: Literal["active", "inactive"]


class SignatoryCreate(BaseModel):
    entity_id: int
    employee_id: int
    signatory_title: str = Field(..., min_length=1, max_length=150)
    authority_scope: list[str] = Field(default_factory=lambda: ["ALL"], max_length=600)
    max_risk_level: Literal["L1", "L2", "L3"] = "L1"
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None


class SignatoryUpdate(BaseModel):
    signatory_title: Optional[str] = Field(None, max_length=150)
    authority_scope: Optional[list[str]] = Field(None, max_length=600)
    max_risk_level: Optional[Literal["L1", "L2", "L3"]] = None
    valid_to: Optional[date] = None
    status: Optional[Literal["active", "revoked"]] = None


class JurisdictionUpdate(BaseModel):
    work_country: Optional[str] = Field(None, max_length=2)
    work_region: Optional[str] = Field(None, max_length=100)
    work_city: Optional[str] = Field(None, max_length=100)
    employing_entity_id: Optional[int] = None
    worker_category: Optional[str] = Field(None, max_length=20)
    contract_end_date: Optional[date] = None
    change_reason: Optional[str] = Field(None, max_length=500)


class DistributionCreate(BaseModel):
    canonical_id: str = Field(..., max_length=20)
    title: Optional[str] = Field(None, max_length=255)
    audience: dict[str, Any] = Field(default_factory=lambda: {"type": "all"})
    requires: Literal["ACKNOWLEDGE", "SIGN"] = "ACKNOWLEDGE"
    due_date: Optional[date] = None
    reminder_days: list[int] = Field(default_factory=lambda: [7, 1], max_length=10)
    auto_include_new_joiners: bool = True


class DistributionUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    audience: Optional[dict[str, Any]] = None
    requires: Optional[Literal["ACKNOWLEDGE", "SIGN"]] = None
    due_date: Optional[date] = None
    reminder_days: Optional[list[int]] = Field(None, max_length=10)
    auto_include_new_joiners: Optional[bool] = None


class PublishRequest(BaseModel):
    confirm_partial: bool = False


class ExpiryResolve(BaseModel):
    status: Literal["RENEWED", "WAIVED", "OPEN"]
    note: Optional[str] = Field(None, max_length=2000)
