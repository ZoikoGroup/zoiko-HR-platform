from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr


# ── Bootstrap ────────────────────────────────────────────────────────────────
class SuperAdminBootstrapRequest(BaseModel):
    setup_key: str
    email: EmailStr
    password: str
    first_name: str = "Super"
    last_name: str = "Admin"


# ── Organization management ──────────────────────────────────────────────────
class OrganizationSummary(BaseModel):
    id: int
    name: Optional[str] = None
    organization_code: Optional[str] = None
    status: Optional[str] = None
    is_active: bool = True
    total_employees: int = 0
    active_employees: int = 0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OrganizationDetail(OrganizationSummary):
    domain: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    timezone: Optional[str] = None
    industry: Optional[str] = None
    admin_name: Optional[str] = None
    admin_email: Optional[str] = None
    hr_admins: int = 0
    managers: int = 0


class OrganizationStatusUpdate(BaseModel):
    status: str  # active | suspended | deactivated | on_hold | approved | rejected
    reason: Optional[str] = None


# ── Dashboard ────────────────────────────────────────────────────────────────
class DashboardStats(BaseModel):
    total_organizations: int
    active_organizations: int
    suspended_organizations: int
    total_employees: int
    active_employees: int
    total_admins: int
    total_hr_admins: int
    recent_organizations: List[OrganizationSummary]


# ── Audit / activity ─────────────────────────────────────────────────────────
class AuditLogItem(BaseModel):
    id: int
    action: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    performed_by_email: Optional[str] = None
    details: Optional[dict] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LoginActivityItem(BaseModel):
    id: int
    email: Optional[str] = None
    organization_id: Optional[int] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    status: Optional[str] = None
    failure_reason: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NotificationItem(BaseModel):
    id: int
    title: str
    message: str
    notification_type: Optional[str] = None
    priority: Optional[str] = None
    is_read: bool = False
    target_org_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NotificationCreate(BaseModel):
    title: str
    message: str
    notification_type: str = "info"
    priority: str = "normal"
    target_org_id: Optional[int] = None
    target_user_id: Optional[int] = None


# ── Platform settings ────────────────────────────────────────────────────────
class PlatformSettingItem(BaseModel):
    id: int
    key: str
    value: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_encrypted: bool = False

    class Config:
        from_attributes = True


class PlatformSettingUpdate(BaseModel):
    value: str
