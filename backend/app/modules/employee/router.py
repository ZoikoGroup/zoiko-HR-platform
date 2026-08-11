import io
import json
import logging
import os
import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, UploadFile, File, Form
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_current_admin, get_current_org_admin
from app.core.rate_limiter import limiter

logger = logging.getLogger("zoiko.employee.router")

from app.modules.super_admin.models import AuditLog, AuditAction, LoginActivity

from app.modules.employee import service
from app.modules.employee.models import Employee, EmployeeStatus, EmploymentType, UserRole
from app.modules.employee.schema import (
    EmployeeCreate, EmployeeUpdate, EmployeeResponse, EmployeeListResponse,
    LoginRequest, RegisterRequest, ForgotPasswordRequest, TokenResponse, RefreshRequest, SuccessResponse,
    UserCreateRequest, UserUpdateRequest, UserResponse, UserListResponse,
    PasswordResetResponse, ChangePasswordRequest, TokenPasswordRequest,
    ChangeManagerRequest, ConfirmProbationRequest,
    EmployeeCompensationCreate, EmployeeCompensationUpdate, EmployeeCompensationResponse,
    EmployeeBenefitCreate, EmployeeBenefitResponse,
    EmployeeDashboardResponse,
    EmployeeExportRequest,
    EmployeeLifecycleResponse,
    EmployeeProfileResponse,
    EmployeeProfileUpdate,
    ExitEmployeeRequest,
    PromoteEmployeeRequest,
    ResignationRequest,
    TransferEmployeeRequest,
    ImportResultResponse,
    BulkEmployeeDeleteRequest,
    BulkDeleteResultResponse,
)
from app.modules.hr.schemas import (
    LeaveRequestCreate, LeaveRequestResponse,
    TravelRequestCreate, TravelRequestResponse,
    TravelExpenseCreateSimple, TravelExpenseResponse,
    HrDocumentResponse, HrDocumentUpdate, HrDocumentStatusUpdate,
)
from app.modules.hr import service as hr_service
from app.services.email_service import LOGIN_URL

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])
employee_router = APIRouter(prefix="/hr", tags=["Employees"])


# ═══════════════════════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@auth_router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login and get access token",
)
@limiter.limit("10/minute")
def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)):
    result = service.login_employee(db, data)
    employee = result.get("employee")
    if employee:
        ip = request.client.host if request.client else None
        ua = request.headers.get("user-agent")
        login_activity = LoginActivity(
            user_id=employee.id,
            email=employee.email,
            organization_id=employee.organization_id,
            ip_address=ip,
            user_agent=ua,
            status="success",
        )
        db.add(login_activity)
        audit = AuditLog(
            action=AuditAction.LOGIN,
            entity_type="User",
            entity_id=employee.id,
            performed_by=employee.id,
            performed_by_email=employee.email,
            details={"ip": ip, "user_agent": ua},
        )
        db.add(audit)
        db.commit()
    return result


@auth_router.post(
    "/register",
    response_model=dict,
    summary="Register a new organization",
)
@limiter.limit("5/minute")
def register(request: Request, data: RegisterRequest, db: Session = Depends(get_db)):
    return service.register_enterprise(db, data)


@auth_router.get(
    "/products",
    response_model=list[dict],
    summary="List active products for registration",
)
def list_products_public(db: Session = Depends(get_db)):
    return [
        {
            "id": 1,
            "name": "HR Platform",
            "code": "hr",
            "description": "Human Resources management for your organization.",
            "icon": None,
        }
    ]


@auth_router.get(
    "/me",
    response_model=EmployeeResponse,
    summary="Get current logged-in user",
)
def get_me(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.modules.employee.schema import EmployeeResponse as EmpResp
    emp_data = EmpResp.model_validate(current_user).model_dump()
    if current_user.organization_id:
        emp_data["products"] = ["hr"]
        logger.debug("[PRODUCTS] GET /me: user=%s org_id=%s products=%s", current_user.email, current_user.organization_id, emp_data['products'])
    else:
        logger.debug("[PRODUCTS] GET /me: user=%s no organization, products=[]", current_user.email)
    return EmpResp.model_validate(emp_data)


@auth_router.post(
    "/logout",
    response_model=SuccessResponse,
    summary="Logout",
)
def logout(current_user=Depends(get_current_user), request: Request = None, db: Session = Depends(get_db)):
    ip = request.client.host if request and request.client else None
    audit = AuditLog(
        action=AuditAction.LOGOUT,
        entity_type="User",
        entity_id=current_user.id,
        performed_by=current_user.id,
        performed_by_email=current_user.email,
        details={"ip": ip},
    )
    db.add(audit)
    db.commit()
    return {"message": "Logged out successfully."}


@auth_router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
    description="Send a valid refresh token, get a new access token.",
)
def refresh_token(data: RefreshRequest, db: Session = Depends(get_db)):
    from app.core.security import decode_access_token, create_access_token
    from app.core.exceptions import UnauthorizedException

    payload = decode_access_token(data.refresh_token)
    if not payload or "id" not in payload:
        raise UnauthorizedException("Invalid or expired refresh token.")

    employee = db.query(Employee).filter(Employee.id == payload["id"]).first()
    if not employee or not employee.is_active:
        raise UnauthorizedException("Employee not found or inactive.")

    new_token = create_access_token(data={
        "sub": employee.email,
        "role": employee.role.value if hasattr(employee.role, "value") else employee.role,
        "id": employee.id,
        "organization_id": employee.organization_id,
    })
    from app.modules.employee.schema import EmployeeResponse as EmpResp
    emp_data = EmpResp.model_validate(employee).model_dump()
    if employee.organization_id:
        emp_data["products"] = ["hr"]
    employee_serialized = EmpResp.model_validate(emp_data)

    return {
        "access_token": new_token,
        "refresh_token": data.refresh_token,
        "token_type": "bearer",
        "employee": employee_serialized,
    }


@auth_router.post(
    "/change-password",
    response_model=SuccessResponse,
    summary="Change current user password",
)
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.change_password(
        db,
        employee_id=current_user.id,
        current_password=data.current_password,
        new_password=data.new_password,
    )


# ── Single-Use Action Links (invite / reset) ─────────────────────────────────


def _invalid_token_page() -> HTMLResponse:
    """One byte-identical page for every invalid state (unknown, expired, used,
    wrong purpose) — the GET endpoint must not disclose which."""
    return HTMLResponse(
        status_code=400,
        content=(
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head>"
            "<body style=\"font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:40px;\">"
            "<div style=\"max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;"
            "padding:32px;text-align:center;\">"
            "<h1 style=\"color:#7C3AED;\">Zoiko HR Security</h1>"
            "<p style=\"color:#374151;line-height:1.6;\">This link is no longer valid. Please request a new one.</p>"
            "</div></body></html>"
        ),
    )


def _action_form_page(title: str, token: str, action_path: str) -> HTMLResponse:
    return HTMLResponse(
        content=(
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head>"
            "<body style=\"font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:40px;\">"
            "<div style=\"max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;\">"
            f"<h1 style=\"color:#7C3AED;\">{title}</h1>"
            "<p style=\"color:#6B7280;font-size:13px;\">Choose a strong password you have not used for this account before.</p>"
            "<input id=\"password\" type=\"password\" placeholder=\"New password (min 8 characters)\" "
            "style=\"width:100%;padding:12px;margin:12px 0;border:1px solid #D1D5DB;border-radius:8px;box-sizing:border-box;\"/>"
            "<p id=\"error\" style=\"color:#DC2626;font-size:13px;display:none;\"></p>"
            "<button onclick=\"submitForm()\" "
            "style=\"width:100%;background:#FF7A00;color:#ffffff;padding:12px;border:none;border-radius:24px;"
            "font-size:15px;font-weight:bold;cursor:pointer;\">Continue</button>"
            "<script>"
            f"var TOKEN={json.dumps(token)};"
            f"var PATH={json.dumps(action_path)};"
            "var busy=false;"
            "function submitForm(){"
            "if(busy)return;"
            "var p=document.getElementById('password').value;"
            "var e=document.getElementById('error');"
            "if(!p||p.length<8){e.textContent='Password must be at least 8 characters.';e.style.display='block';return;}"
            "busy=true;"
            "document.querySelector('button').disabled=true;"
            "document.querySelector('button').textContent='Submitting…';"
            "fetch(PATH,{method:'POST',headers:{'Content-Type':'application/json'},"
            "body:JSON.stringify({token:TOKEN,password:p})})"
            ".then(function(r){return r.json().then(function(j){return {ok:r.ok,json:j};});})"
            ".then(function(res){"
            "if(res.ok){document.body.innerHTML="
            "'<div style=\"max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;text-align:center;\">"
            "<h1 style=\"color:#059669;\">All set</h1><p style=\"color:#374151;\">Your password has been set. "
            "<a href=\"" + LOGIN_URL + "\">Sign in to Zoiko HR</a>.</p></div>';}"
            "else{busy=false;document.querySelector('button').disabled=false;document.querySelector('button').textContent='Continue';e.textContent=res.json.detail||'Something went wrong.';e.style.display='block';}"
            "})"
            ".catch(function(){busy=false;document.querySelector('button').disabled=false;document.querySelector('button').textContent='Continue';e.textContent='Network error. Please try again.';e.style.display='block';});}"
            "</script>"
            "</div></body></html>"
        ),
    )


@auth_router.get(
    "/accept-invite",
    response_class=HTMLResponse,
    summary="Render the account-setup form from an invitation link",
    include_in_schema=False,
)
def accept_invite_form(token: str = Query(...), db: Session = Depends(get_db)):
    ctx = service.validate_action_token(db, token, service.SecurityActionPurpose.INVITE)
    if ctx is None:
        return _invalid_token_page()
    return _action_form_page("Set up your account", ctx["token"], "/auth/accept-invite")


@auth_router.post(
    "/accept-invite",
    summary="Complete account setup from an invitation link",
)
@limiter.limit("10/minute")
def accept_invite(request: Request, data: TokenPasswordRequest, db: Session = Depends(get_db)):
    return service.complete_action_token(db, data.token, service.SecurityActionPurpose.INVITE, data.password)


@auth_router.get(
    "/reset-password",
    response_class=HTMLResponse,
    summary="Render the password-reset form from a reset link",
    include_in_schema=False,
)
def reset_password_form(token: str = Query(...), db: Session = Depends(get_db)):
    ctx = service.validate_action_token(db, token, service.SecurityActionPurpose.RESET)
    if ctx is None:
        return _invalid_token_page()
    return _action_form_page("Reset your password", ctx["token"], "/auth/reset-password")


@auth_router.post(
    "/reset-password",
    summary="Set a new password from a reset link",
)
@limiter.limit("10/minute")
def reset_password(request: Request, data: TokenPasswordRequest, db: Session = Depends(get_db)):
    return service.complete_action_token(db, data.token, service.SecurityActionPurpose.RESET, data.password)


@auth_router.post(
    "/forgot-password",
    response_model=dict,
    summary="Request a password reset link for an organization admin",
    description="Public endpoint. Always returns the same message to avoid revealing whether an email is registered.",
)
@limiter.limit("5/minute")
def forgot_password(request: Request, data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    return service.request_password_reset(db, data.email)


# ═══════════════════════════════════════════════════════════════════════════════
# USER MANAGEMENT ENDPOINTS (Organization Admin)
# ═══════════════════════════════════════════════════════════════════════════════

@employee_router.get(
    "/admin/users",
    response_model=UserListResponse,
    summary="List users in the organization",
    dependencies=[Depends(get_current_admin)],
)
def list_users(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    search: Optional[str] = Query(None, description="Search by name, email, or code"),
    role: Optional[str] = Query(None, description="Filter by role"),
    status: Optional[str] = Query(None, description="Filter by status: active, inactive"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
):
    role_filter = None
    if role:
        try:
            role_filter = UserRole(role)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid role: {role}")

    return service.get_organization_users(
        db,
        organization_id=current_user.organization_id,
        search=search,
        role=role_filter,
        status=status,
        page=page,
        per_page=per_page,
    )


@employee_router.post(
    "/admin/users",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user",
    dependencies=[Depends(get_current_admin)],
)
def create_user(
    data: UserCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Validate role hierarchy: what roles can the current user create?
    current_role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    
    if current_role == "admin":
        # Organization Admin can create any role except SUPER_ADMIN
        if data.role == UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=403,
                detail="Cannot create SUPER_ADMIN role. Only platform admins can create super admins."
            )
        allowed_create_roles = [UserRole.ADMIN, UserRole.HR_ADMIN, UserRole.BILLING_ADMIN, UserRole.EMPLOYEE]
    elif current_role == "hr_admin":
        # HR Admin can only create EMPLOYEE
        allowed_create_roles = [UserRole.EMPLOYEE]
    else:
        # Other roles cannot create users (should not reach here due to dependency check)
        raise HTTPException(
            status_code=403,
            detail=f"Role '{current_role}' does not have permission to create users."
        )
    
    if data.role not in allowed_create_roles:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot create user with role '{data.role.value}'. Your role '{current_role}' can only create: {', '.join([r.value for r in allowed_create_roles])}."
        )

    employee, temp_password = service.create_organization_user(
        db, data,
        organization_id=current_user.organization_id,
        created_by_id=current_user.id,
    )

    if data.role == UserRole.ADMIN:
        return {
            "message": f"Invitation sent to {employee.email}. They will set up their own password via the secure link.",
            "user": UserResponse.model_validate(employee),
            "temporary_password": None,
        }

    return {
        "message": f"User {employee.full_name} created successfully.",
        "user": UserResponse.model_validate(employee),
        "temporary_password": temp_password,
    }


@employee_router.get(
    "/admin/users/{user_id}",
    response_model=UserResponse,
    summary="Get user details",
    dependencies=[Depends(get_current_admin)],
)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_organization_user(db, user_id, current_user.organization_id)


@employee_router.put(
    "/admin/users/{user_id}",
    response_model=UserResponse,
    summary="Update a user",
    dependencies=[Depends(get_current_admin)],
)
def update_user(
    user_id: int,
    data: UserUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Get the existing user to check their role
    existing_user = service.get_organization_user(db, user_id, current_user.organization_id)
    
    # Validate role hierarchy: what roles can the current user edit?
    current_role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    target_role = existing_user.role.value if hasattr(existing_user.role, 'value') else str(existing_user.role)
    
    if current_role == "hr_admin":
        # HR Admin cannot edit ADMIN or SUPER_ADMIN roles
        if target_role in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.BILLING_ADMIN]:
            raise HTTPException(
                status_code=403,
                detail=f"You do not have permission to edit users with role '{target_role}'. HR Admins can only edit HR staff and employees."
            )
    
    return service.update_organization_user(
        db, user_id, data,
        organization_id=current_user.organization_id,
        updated_by_id=current_user.id,
    )


@employee_router.delete(
    "/admin/users/{user_id}",
    response_model=UserResponse,
    summary="Deactivate (soft-delete) a user",
    dependencies=[Depends(get_current_admin)],
)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Get the existing user to check their role
    existing_user = service.get_organization_user(db, user_id, current_user.organization_id)
    
    # Validate role hierarchy
    current_role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    target_role = existing_user.role.value if hasattr(existing_user.role, 'value') else str(existing_user.role)
    
    if current_role == "hr_admin":
        # HR Admin cannot deactivate ADMIN or SUPER_ADMIN roles
        if target_role in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.BILLING_ADMIN]:
            raise HTTPException(
                status_code=403,
                detail=f"You do not have permission to deactivate users with role '{target_role}'."
            )
    
    return service.deactivate_organization_user(
        db, user_id,
        organization_id=current_user.organization_id,
        updated_by_id=current_user.id,
    )


@employee_router.delete(
    "/admin/users/{user_id}/hard-delete",
    response_model=SuccessResponse,
    summary="Permanently delete a user and all associated records",
    dependencies=[Depends(get_current_admin)],
)
def hard_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Get the existing user to check their role
    existing_user = service.get_organization_user(db, user_id, current_user.organization_id)

    # Validate role hierarchy
    current_role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    target_role = existing_user.role.value if hasattr(existing_user.role, 'value') else str(existing_user.role)

    if current_role == "hr_admin":
        # HR Admin cannot delete ADMIN or SUPER_ADMIN roles
        if target_role in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.BILLING_ADMIN]:
            raise HTTPException(
                status_code=403,
                detail=f"You do not have permission to delete users with role '{target_role}'."
            )

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")

    service.hard_delete_employee(db, user_id, organization_id=current_user.organization_id)
    return {"message": f"User {existing_user.full_name} has been permanently deleted."}


@employee_router.post(
    "/admin/users/{user_id}/activate",
    response_model=UserResponse,
    summary="Activate a user",
    dependencies=[Depends(get_current_admin)],
)
def activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Get the existing user to check their role
    existing_user = service.get_organization_user(db, user_id, current_user.organization_id)
    
    # Validate role hierarchy
    current_role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    target_role = existing_user.role.value if hasattr(existing_user.role, 'value') else str(existing_user.role)
    
    if current_role == "hr_admin":
        # HR Admin cannot activate ADMIN or SUPER_ADMIN roles
        if target_role in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.BILLING_ADMIN]:
            raise HTTPException(
                status_code=403,
                detail=f"You do not have permission to activate users with role '{target_role}'."
            )
    
    return service.activate_organization_user(
        db, user_id,
        organization_id=current_user.organization_id,
        updated_by_id=current_user.id,
    )


@employee_router.post(
    "/admin/users/{user_id}/suspend",
    response_model=UserResponse,
    summary="Suspend a user",
    dependencies=[Depends(get_current_admin)],
)
def suspend_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    existing_user = service.get_organization_user(db, user_id, current_user.organization_id)
    current_role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    target_role = existing_user.role.value if hasattr(existing_user.role, 'value') else str(existing_user.role)
    if current_role == "hr_admin":
        if target_role in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.BILLING_ADMIN]:
            raise HTTPException(status_code=403, detail=f"Cannot suspend user with role '{target_role}'.")
    return service.suspend_organization_user(
        db, user_id,
        organization_id=current_user.organization_id,
        updated_by_id=current_user.id,
    )


@employee_router.post(
    "/admin/users/{user_id}/archive",
    response_model=UserResponse,
    summary="Archive a user",
    dependencies=[Depends(get_current_admin)],
)
def archive_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    existing_user = service.get_organization_user(db, user_id, current_user.organization_id)
    current_role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    target_role = existing_user.role.value if hasattr(existing_user.role, 'value') else str(existing_user.role)
    if current_role == "hr_admin":
        if target_role in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.BILLING_ADMIN]:
            raise HTTPException(status_code=403, detail=f"Cannot archive user with role '{target_role}'.")
    return service.archive_organization_user(
        db, user_id,
        organization_id=current_user.organization_id,
        updated_by_id=current_user.id,
    )


@employee_router.post(
    "/admin/users/{user_id}/reset-password",
    response_model=PasswordResetResponse,
    summary="Reset user password",
    dependencies=[Depends(get_current_admin)],
)
def reset_user_password(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Get the existing user to check their role
    existing_user = service.get_organization_user(db, user_id, current_user.organization_id)
    
    # Validate role hierarchy
    current_role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    target_role = existing_user.role.value if hasattr(existing_user.role, 'value') else str(existing_user.role)
    
    if current_role == "hr_admin":
        # HR Admin cannot reset password for ADMIN or SUPER_ADMIN roles
        if target_role in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.BILLING_ADMIN]:
            raise HTTPException(
                status_code=403,
                detail=f"You do not have permission to reset password for users with role '{target_role}'."
            )
    
    user, temp_password = service.reset_user_password(
        db, user_id,
        organization_id=current_user.organization_id,
        updated_by_id=current_user.id,
    )

    if temp_password is None:
        return PasswordResetResponse(
            message=f"Password reset link sent to {user.email}.",
            temporary_password=None,
        )

    return PasswordResetResponse(
        message=f"Password reset for {user.full_name}.",
        temporary_password=temp_password,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@employee_router.get(
    "/employees/me",
    response_model=EmployeeResponse,
    summary="Get my own profile",
)
def get_my_profile(current_user=Depends(get_current_user)):
    return current_user


@employee_router.put(
    "/employees/me",
    response_model=EmployeeResponse,
    summary="Update my own profile",
)
def update_my_profile(
    data: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.update_employee(db, current_user.id, data, current_user.organization_id)


@employee_router.post(
    "/employees",
    response_model=EmployeeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Onboard a new employee",
    dependencies=[Depends(get_current_admin)],
)
def create_employee(data: EmployeeCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.create_employee(db, data, current_user.organization_id)


@employee_router.get(
    "/employees",
    response_model=EmployeeListResponse,
    summary="List employees with search and filters",
)
def list_employees(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=10000, description="Results per page"),
    search: Optional[str] = Query(None, description="Search name/email/employee ID/code"),
    department_id: Optional[int] = Query(None, description="Filter by department ID"),
    status: Optional[EmployeeStatus] = Query(None, description="Filter by status"),
    include_all_roles: bool = Query(False, description="Include admin/HR-admin roles (e.g. for performance reviewer pickers)"),
):
    # By default, filter out administrative roles — only HR staff, managers, and employees.
    # Some callers (e.g. performance goal/review/appraisal pickers) need every org member.
    visible_roles = None if include_all_roles else [UserRole.EMPLOYEE]
    return service.get_all_employees(db, page, per_page, search, department_id, status, current_user.organization_id, visible_roles)


@employee_router.get(
    "/employees/{employee_id}",
    response_model=EmployeeResponse,
    summary="Get a single employee by ID",
)
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.get_employee_by_id(db, employee_id, current_user.organization_id)


@employee_router.put(
    "/employees/{employee_id}",
    response_model=EmployeeResponse,
    summary="Update employee details",
    dependencies=[Depends(get_current_admin)],
)
def update_employee(
    employee_id: int,
    data: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.update_employee(db, employee_id, data, current_user.organization_id)


@employee_router.delete(
    "/employees/{employee_id}",
    response_model=SuccessResponse,
    summary="Deactivate / terminate an employee",
    dependencies=[Depends(get_current_admin)],
)
def deactivate_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    service.deactivate_employee(db, employee_id, current_user.organization_id)
    return {"message": f"Employee {employee_id} has been deactivated successfully."}


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE SELF-SERVICE — LEAVE
# ═══════════════════════════════════════════════════════════════════════════════

@employee_router.post(
    "/leaves",
    response_model=LeaveRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Apply for leave",
)
def create_leave(
    data: LeaveRequestCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if data.employee_id is None:
        data.employee_id = current_user.id
    return hr_service.create_leave_request(db, data, org_id=current_user.organization_id)


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE SELF-SERVICE — TRAVEL
# ═══════════════════════════════════════════════════════════════════════════════

@employee_router.post(
    "/travel",
    response_model=TravelRequestResponse,
    summary="Create a travel request",
)
def create_travel(
    data: TravelRequestCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if data.employee_id is None:
        data.employee_id = current_user.id
    return hr_service.create_travel_request(db, data, organization_id=current_user.organization_id)


@employee_router.post(
    "/travel/expenses",
    response_model=TravelExpenseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a travel expense",
)
def create_travel_expense(
    data: TravelExpenseCreateSimple,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if data.employee_id is None:
        data.employee_id = current_user.id
    return hr_service.create_travel_expense(db, data, organization_id=current_user.organization_id)


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE SELF-SERVICE — DOCUMENTS
# ═══════════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE MANAGEMENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

# ── DASHBOARD ────────────────────────────────────────────────────────────────

@employee_router.get(
    "/employee-management/dashboard",
    summary="Employee management dashboard",
    description="Returns employee statistics and analytics."
)
def employee_dashboard(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_employee_dashboard(db, current_user.organization_id)

# ── EMPLOYEES ────────────────────────────────────────────────────────────────

@employee_router.get(
    "/employee-management/employees",
    response_model=EmployeeListResponse,
    summary="List employees with search and filters",
    description="""
    Returns a paginated list of employees.

    **Query parameters:**
    - `page`          \u2192 page number (default: 1)
    - `per_page`      \u2192 results per page (default: 20, max: 100)
    - `search`        \u2192 search by name, email, employee ID, or employee code
    - `department_id` \u2192 filter by department
    - `status`        \u2192 filter by status (active, inactive, on_leave, terminated)
    """
)
def list_employees_mgmt(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page:          int                         = Query(1,    ge=1,   description="Page number"),
    per_page:      int                         = Query(20,   ge=1,   le=10000, description="Results per page"),
    search:             Optional[str]               = Query(None, description="Search name/email/employee ID/code"),
    department_id:      Optional[int]               = Query(None, description="Filter by department ID"),
    status:             Optional[EmployeeStatus]    = Query(None, description="Filter by status"),
    employment_type:    Optional[EmploymentType]    = Query(None, description="Filter by employment type"),
    include_all_roles: bool = Query(False, description="Include admin/HR-admin roles (e.g. for performance reviewer pickers)"),
):
    # Only show actual employees, exclude administrative roles, unless the caller opts in.
    # get_employees() treats a falsy visible_roles as "use the restrictive default", so
    # opting in means passing every role explicitly rather than None.
    visible_roles = list(UserRole) if include_all_roles else [UserRole.EMPLOYEE]
    return service.get_employees(db, page, per_page, search, department_id, status, employment_type, current_user.organization_id, visible_roles)


@employee_router.get(
    "/employee-management/employees/{employee_id}",
    response_model=EmployeeResponse,
    summary="Get a single employee by ID",
)
def get_employee_mgmt(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    emp = service.get_employee_by_id(db, employee_id, organization_id=current_user.organization_id)
    if current_user.organization_id and emp.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return emp


@employee_router.post(
    "/employee-management/employees",
    response_model=EmployeeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new employee",
    dependencies=[Depends(get_current_admin)],
)
def create_employee_mgmt(data: EmployeeCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.create_employee(db, data, current_user.organization_id)


@employee_router.post(
    "/employee-management/employees/import",
    response_model=ImportResultResponse,
    summary="Bulk import employees from Excel/CSV",
    dependencies=[Depends(get_current_admin)],
)
async def import_employees_mgmt(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    contents = await file.read()
    filename = file.filename or "import.xlsx"
    result = service.import_employees_from_file(
        db=db,
        file_bytes=contents,
        filename=filename,
        organization_id=current_user.organization_id,
        current_user_id=current_user.id,
    )
    return ImportResultResponse(**result)


@employee_router.get(
    "/employee-management/employees/import/template",
    summary="Download sample import template",
)
def download_import_template(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    from fastapi.responses import StreamingResponse
    data = service._generate_import_template_bytes()
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=employee-import-template.xlsx"},
    )


@employee_router.put(
    "/employee-management/employees/{employee_id}",
    response_model=EmployeeResponse,
    summary="Update employee details",
    dependencies=[Depends(get_current_admin)],
)
def update_employee_mgmt(
    employee_id: int,
    data: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    emp = service.get_employee_by_id(db, employee_id, organization_id=current_user.organization_id)
    if current_user.organization_id and emp.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return service.update_employee(db, employee_id, data, organization_id=current_user.organization_id)


@employee_router.delete(
    "/employee-management/employees/{employee_id}",
    response_model=SuccessResponse,
    summary="Delete an employee (active employees are deactivated; inactive ones are permanently deleted)",
    dependencies=[Depends(get_current_admin)],
)
def delete_employee_mgmt(employee_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    emp = service.get_employee_by_id(db, employee_id, organization_id=current_user.organization_id)
    if current_user.organization_id and emp.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")
    result = service.delete_employee(
        db,
        employee_id,
        organization_id=current_user.organization_id,
        current_user_id=current_user.id,
    )
    return {"message": result["message"]}


@employee_router.post(
    "/employee-management/employees/bulk-delete",
    response_model=BulkDeleteResultResponse,
    summary="Bulk delete employees (active ones are deactivated; inactive ones are permanently deleted)",
    dependencies=[Depends(get_current_admin)],
)
def bulk_delete_employees_mgmt(
    data: BulkEmployeeDeleteRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.bulk_delete_employees(
        db,
        data.ids,
        organization_id=current_user.organization_id,
        current_user_id=current_user.id,
    )


@employee_router.post(
    "/employee-management/employees/delete-all",
    response_model=BulkDeleteResultResponse,
    summary="Delete all employees in the organization (active ones are deactivated; inactive ones are permanently deleted)",
    dependencies=[Depends(get_current_admin)],
)
def delete_all_employees_mgmt(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.delete_all_employees(
        db,
        organization_id=current_user.organization_id,
        current_user_id=current_user.id,
    )


@employee_router.delete(
    "/employee-management/employees/{employee_id}/hard-delete",
    response_model=SuccessResponse,
    summary="Permanently delete an employee and all related records",
    dependencies=[Depends(get_current_admin)],
)
def hard_delete_employee(employee_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    emp = service.get_employee_by_id(db, employee_id, organization_id=current_user.organization_id)
    if current_user.organization_id and emp.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")
    service.hard_delete_employee(db, employee_id, organization_id=current_user.organization_id)
    return {"message": f"Employee {employee_id} has been permanently deleted."}


class BulkHardDeleteRequest(BaseModel):
    employee_ids: List[int]


@employee_router.post(
    "/employee-management/employees/bulk-hard-delete",
    response_model=SuccessResponse,
    summary="Permanently delete multiple employees",
    dependencies=[Depends(get_current_admin)],
)
def bulk_hard_delete_employees(
    body: BulkHardDeleteRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = service.bulk_hard_delete_employees(
        db, body.employee_ids,
        organization_id=current_user.organization_id,
    )
    return {
        "message": f"{len(result['deleted'])} employee(s) deleted. {len(result['failed'])} failed.",
        "failed": result["failed"],
    }


@employee_router.get(
    "/employee-management/employees/{employee_id}/profile",
    response_model=EmployeeProfileResponse,
    summary="Get employee profile",
)
def get_employee_profile_mgmt(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    emp = service.get_employee_by_id(db, employee_id, organization_id=current_user.organization_id)
    if current_user.organization_id and emp.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return service.get_employee_profile(db, employee_id, organization_id=current_user.organization_id)


@employee_router.put(
    "/employee-management/employees/{employee_id}/profile",
    response_model=EmployeeProfileResponse,
    summary="Update employee profile",
)
def update_employee_profile_mgmt(
    employee_id: int,
    data: EmployeeProfileUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    emp = service.get_employee_by_id(db, employee_id, organization_id=current_user.organization_id)
    if current_user.organization_id and emp.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return service.update_employee_profile(db, employee_id, data, organization_id=current_user.organization_id)


# ── ORGANIZATION STRUCTURE ────────────────────────────────────────────────────

@employee_router.get(
    "/employee-management/org-chart",
    response_model=dict,
    summary="Get organization chart",
)
def get_org_chart(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    organization_id: Optional[int] = Query(None, description="Filter by organization ID"),
):
    caller_role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    if caller_role == "super_admin" and organization_id:
        target_org = organization_id
    else:
        target_org = current_user.organization_id
    return service.get_org_chart(db, target_org)


@employee_router.put(
    "/employee-management/change-manager",
    response_model=EmployeeResponse,
    summary="Change employee manager",
    dependencies=[Depends(get_current_admin)],
)
def change_manager_mgmt(
    data: ChangeManagerRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    emp = service.get_employee_by_id(db, data.employee_id, organization_id=current_user.organization_id)
    if current_user.organization_id and emp.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return service.change_manager(db, data, organization_id=current_user.organization_id)

# ── EMPLOYEE LIFECYCLE ─────────────────────────────────────────────────────────

@employee_router.get(
    "/employee-management/lifecycle",
    response_model=list[EmployeeLifecycleResponse],
    summary="Get employee lifecycle events",
)
def get_employee_lifecycle_mgmt(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
):
    return service.get_employee_lifecycle(db, employee_id, current_user.organization_id)


@employee_router.post(
    "/employee-management/confirm",
    response_model=EmployeeLifecycleResponse,
    summary="Confirm employee probation",
    dependencies=[Depends(get_current_admin)],
)
def confirm_probation_mgmt(
    data: ConfirmProbationRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.confirm_probation(db, data, current_user.organization_id)


@employee_router.post(
    "/employee-management/promote",
    response_model=EmployeeLifecycleResponse,
    summary="Promote employee",
    dependencies=[Depends(get_current_admin)],
)
def promote_employee_mgmt(
    data: PromoteEmployeeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.promote_employee(db, data, current_user.organization_id)


@employee_router.post(
    "/employee-management/transfer",
    response_model=EmployeeLifecycleResponse,
    summary="Transfer employee",
    dependencies=[Depends(get_current_admin)],
)
def transfer_employee_mgmt(
    data: TransferEmployeeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.transfer_employee(db, data, current_user.organization_id)


@employee_router.post(
    "/employee-management/resign",
    response_model=EmployeeLifecycleResponse,
    summary="Resign employee",
    dependencies=[Depends(get_current_admin)],
)
def resign_employee_mgmt(
    data: ResignationRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.resign_employee(db, data, current_user.organization_id)


@employee_router.post(
    "/employee-management/exit",
    response_model=EmployeeLifecycleResponse,
    summary="Exit employee",
    dependencies=[Depends(get_current_admin)],
)
def exit_employee_mgmt(
    data: ExitEmployeeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.exit_employee(db, data, current_user.organization_id)

# ── REPORTS ─────────────────────────────────────────────────────────────────────

@employee_router.get(
    "/employee-management/reports",
    summary="Get employee reports",
)
def get_employee_reports_mgmt(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    department_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    report_type: Optional[str] = Query(None),
):
    filters = {}
    if department_id: filters["department_id"] = department_id
    if status: filters["status"] = status
    if search: filters["search"] = search
    if report_type: filters["report_type"] = report_type
    return service.get_employee_reports(db, filters or None, current_user.organization_id)


@employee_router.post(
    "/employee-management/export",
    response_model=list[EmployeeResponse],
    summary="Export employee reports",
)
def export_employee_reports_mgmt(
    data: EmployeeExportRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return service.export_employee_reports(db, data, current_user.organization_id)


# ═══════════════════════════════════════════════════════════════════════════════
# EMPLOYEE COMPENSATION & BENEFITS
# ═══════════════════════════════════════════════════════════════════════════════

@employee_router.get("/compensation/employee-compensation", response_model=list[EmployeeCompensationResponse], summary="List employee compensation")
def get_employee_compensations(db: Session = Depends(get_db), current_user=Depends(get_current_user), employee_id: Optional[int] = Query(None)):
    return service.get_employee_compensations(db, current_user.organization_id, employee_id)

@employee_router.post("/compensation/employee-compensation", response_model=EmployeeCompensationResponse, summary="Assign compensation", dependencies=[Depends(get_current_admin)])
def create_employee_compensation(data: EmployeeCompensationCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_employee_compensation(db, data, current_user.organization_id)

@employee_router.put("/compensation/employee-compensation/{id}", response_model=EmployeeCompensationResponse, summary="Update employee compensation", dependencies=[Depends(get_current_admin)])
def update_employee_compensation(id: int, data: EmployeeCompensationUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.update_employee_compensation(db, id, data, current_user.organization_id)

@employee_router.delete("/compensation/employee-compensation/{id}", summary="Delete employee compensation", dependencies=[Depends(get_current_admin)])
def delete_employee_compensation(id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_employee_compensation(db, id, current_user.organization_id)
    return {"message": "Employee compensation deleted successfully."}

@employee_router.post("/compensation/employee-benefits", response_model=EmployeeBenefitResponse, summary="Enroll in benefit", dependencies=[Depends(get_current_admin)])
def create_employee_benefit(data: EmployeeBenefitCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return service.create_employee_benefit(db, data, current_user.organization_id)

@employee_router.get("/compensation/employee-benefits", response_model=list[EmployeeBenefitResponse], summary="List employee benefits")
def get_employee_benefits(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return service.get_employee_benefits(db, current_user.organization_id)

@employee_router.delete("/compensation/employee-benefits/{id}", summary="Remove benefit", dependencies=[Depends(get_current_admin)])
def delete_employee_benefit(id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    service.delete_employee_benefit(db, id, current_user.organization_id)
    return {"message": "Employee benefit removed successfully."}
