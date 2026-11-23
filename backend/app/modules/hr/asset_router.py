"""
modules/hr/asset_router.py
--------------------------
Defines all HTTP endpoints for the Asset module.

Endpoints:
  DASHBOARD
    GET    /hr/assets/dashboard           → Dashboard stats

  ASSETS CRUD
    GET    /hr/assets                     → List assets (paginated, filterable)
    POST   /hr/assets                     → Create an asset
    GET    /hr/assets/{asset_id}          → Get one asset
    PUT    /hr/assets/{asset_id}          → Update an asset
    DELETE /hr/assets/{asset_id}          → Delete an asset

  MAINTENANCE
    GET    /hr/assets/{asset_id}/maintenance           → List maintenance records
    POST   /hr/assets/{asset_id}/maintenance           → Create maintenance record
    GET    /hr/assets/{asset_id}/maintenance/{maint_id} → Get maintenance record
    PUT    /hr/assets/{asset_id}/maintenance/{maint_id} → Update maintenance record
    PUT    /hr/assets/{asset_id}/maintenance/{maint_id}/resolve → Resolve maintenance

  REQUESTS
    GET    /hr/assets/requests                      → List asset requests
    POST   /hr/assets/requests                      → Create asset request
    PUT    /hr/assets/requests/{req_id}/approve      → Approve request
    PUT    /hr/assets/requests/{req_id}/reject       → Reject request
    PUT    /hr/assets/requests/{req_id}/fulfill      → Fulfill request
    PUT    /hr/assets/requests/{req_id}/cancel       → Cancel request

  CATEGORIES
    GET    /hr/assets/categories           → List categories
    POST   /hr/assets/categories           → Create category
    PUT    /hr/assets/categories/{cat_id}  → Update category

  REPORTS
    GET    /hr/assets/reports              → List reports
    POST   /hr/assets/reports              → Generate report

  SETTINGS
    GET    /hr/assets/settings             → List settings
    PUT    /hr/assets/settings/{key}       → Update setting
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query, Body, status, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_current_admin
from app.core.rate_limiter import limiter

from app.modules.hr import asset_service
from app.modules.employee.ownership import is_admin
from app.core.exceptions import NotFoundException
from app.modules.hr.models import AssetStatus, AssetRequestStatus, RequestPriority
from app.modules.hr.schemas import (
    AssetCreate, AssetUpdate, AssetResponse, AssetDashboardResponse, AssetListResponse,
    MaintenanceCreate, MaintenanceUpdate, MaintenanceResolve, MaintenanceResponse,
    AssetRequestCreate, AssetRequestResponse,
    AssetCategoryCreate, AssetCategoryResponse,
    AssetReportGenerate, AssetReportResponse,
    AssetSettingResponse,
    SuccessResponse,
)

asset_router = APIRouter(prefix="/hr/assets", tags=["Assets"])


# Who sees which assets: the organization admin and HR admin see every asset and request in their organization; anyone else
# (manager, employee, ...) sees only the assets assigned to them and the requests they raised. Someone else's asset or request
# answers 404, as if it did not exist.

def _own_scope(user, requested_employee_id: Optional[int] = None) -> Optional[list[int]]:
    """employee_ids for a list query: None (no limit) for admins, otherwise only the caller (or nothing when they ask for
    someone else)."""
    if is_admin(user):
        return None
    if requested_employee_id and requested_employee_id != user.id:
        return []
    return [user.id]


def _visible_asset(db, asset_id: int, user):
    asset = asset_service.get_asset_by_id(db, asset_id, user.organization_id)
    if not is_admin(user) and asset.employee_id != user.id:
        raise NotFoundException("Asset", asset_id)
    return asset


# ════════════════════════════════════════════════════════════════════════════
# DASHBOARD
# ════════════════════════════════════════════════════════════════════════════

@asset_router.get(
    "/dashboard",
    response_model=AssetDashboardResponse,
    summary="Asset dashboard statistics",
    description="Returns asset summary counts, category/status breakdown, pending requests and open maintenance.",
)
def asset_dashboard(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return asset_service.get_asset_dashboard(db, current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════
# ASSETS CRUD
# ════════════════════════════════════════════════════════════════════════════

SORTABLE_FIELDS_HELP = ", ".join(asset_service.SORTABLE_FIELDS.keys())

@asset_router.get(
    "",
    response_model=AssetListResponse,
    summary="List assets with search, filters, and sorting",
    description=f"""
    Returns a paginated list of assets.

    **Query parameters:**
    - `page`       → page number (default: 1)
    - `per_page`   → results per page (default: 20, max: 100)
    - `search`     → search by name, tag, serial, category, or assigned employee
    - `status`     → filter by status
    - `category`   → filter by category
    - `department` → filter by department
    - `employee_id`→ filter by assigned employee
    - `sort_by`    → sort field: {SORTABLE_FIELDS_HELP} (default: created_at)
    - `sort_order` → sort direction: asc or desc (default: desc)
    """,
)
def list_assets(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page:        int                    = Query(1,    ge=1,   description="Page number"),
    per_page:    int                    = Query(20,   ge=1,   le=200, description="Results per page"),
    search:      Optional[str]          = Query(None, description="Search name/tag/serial/category/employee"),
    status:      Optional[AssetStatus]  = Query(None, description="Filter by status"),
    category:    Optional[str]          = Query(None, description="Filter by category"),
    department:  Optional[str]          = Query(None, description="Filter by department"),
    employee_id: Optional[int]          = Query(None, description="Filter by employee ID"),
    sort_by:     Optional[str]          = Query("created_at", description="Sort field"),
    sort_order:  Optional[str]          = Query("desc",       description="Sort direction (asc/desc)"),
):
    return asset_service.get_assets(db, page, per_page, search, status, category, department, employee_id, sort_by, sort_order,
                                    current_user.organization_id, employee_ids=_own_scope(current_user, employee_id))


@asset_router.post(
    "",
    response_model=AssetResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new asset",
)
@limiter.limit("30/hour")
def create_asset(request: Request, data: AssetCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return asset_service.create_asset(db, data, organization_id=current_user.organization_id, actor=current_user)


# ════════════════════════════════════════════════════════════════════════════
# ASSET MAINTENANCE
# ════════════════════════════════════════════════════════════════════════════

@asset_router.get(
    "/{asset_id}/maintenance",
    response_model=list[MaintenanceResponse],
    summary="List maintenance records for an asset",
)
def list_maintenance(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _visible_asset(db, asset_id, current_user)
    return asset_service.get_maintenance_by_asset(db, asset_id, current_user.organization_id)


@asset_router.post(
    "/{asset_id}/maintenance",
    response_model=MaintenanceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a maintenance record for an asset",
)
def create_maintenance_record(
    asset_id: int,
    data: MaintenanceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _visible_asset(db, asset_id, current_user)
    data = data.model_copy(update={"asset_id": asset_id})
    if not is_admin(current_user):
        data = data.model_copy(update={"reported_by_id": current_user.id})    # you report a problem as yourself
    return asset_service.create_maintenance(db, data, current_user.organization_id)


@asset_router.get(
    "/{asset_id}/maintenance/{maint_id}",
    response_model=MaintenanceResponse,
    summary="Get a maintenance record by ID",
)
def get_maintenance(
    asset_id: int,
    maint_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _visible_asset(db, asset_id, current_user)
    return _maintenance_of(db, asset_id, maint_id, current_user)


@asset_router.put(
    "/{asset_id}/maintenance/{maint_id}",
    response_model=MaintenanceResponse,
    summary="Update a maintenance record",
)
def update_maintenance_record(
    asset_id: int,
    maint_id: int,
    data: MaintenanceUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _visible_asset(db, asset_id, current_user)
    _maintenance_of(db, asset_id, maint_id, current_user)
    return asset_service.update_maintenance(db, maint_id, data, current_user.organization_id)


@asset_router.put(
    "/{asset_id}/maintenance/{maint_id}/resolve",
    response_model=MaintenanceResponse,
    summary="Resolve a maintenance record",
)
def resolve_maintenance_record(
    asset_id: int,
    maint_id: int,
    data: MaintenanceResolve,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _visible_asset(db, asset_id, current_user)
    _maintenance_of(db, asset_id, maint_id, current_user)
    if not is_admin(current_user):
        data = data.model_copy(update={"resolved_by": current_user.id})
    return asset_service.resolve_maintenance(db, maint_id, data, current_user.organization_id)


def _maintenance_of(db, asset_id: int, maint_id: int, user):
    """The maintenance record must belong to the asset in the URL (which the caller was already allowed to see)."""
    record = asset_service.get_maintenance_by_id(db, maint_id, user.organization_id)
    if record.asset_id != asset_id:
        raise NotFoundException("AssetMaintenanceRequest", maint_id)
    return record


# ════════════════════════════════════════════════════════════════════════════
# ASSET REQUESTS
# ════════════════════════════════════════════════════════════════════════════

@asset_router.get(
    "/requests",
    summary="List asset requests with filters",
    description="""
    Returns a paginated list of asset requests.

    **Query parameters:**
    - `page`     → page number (default: 1)
    - `per_page` → results per page (default: 20, max: 100)
    - `status`   → filter by status
    - `priority` → filter by priority
    """,
)
def list_asset_requests(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page:        int                          = Query(1,    ge=1,   description="Page number"),
    per_page:    int                          = Query(20,   ge=1,   le=200, description="Results per page"),
    status:      Optional[AssetRequestStatus] = Query(None, description="Filter by status"),
    priority:    Optional[RequestPriority]    = Query(None, description="Filter by priority"),
    employee_id: Optional[int]                = Query(None, description="Filter by employee ID"),
):
    return asset_service.get_asset_requests(db, page, per_page, status, priority, employee_id, current_user.organization_id,
                                            employee_ids=_own_scope(current_user, employee_id))


@asset_router.post(
    "/requests",
    response_model=AssetRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an asset request",
)
def create_asset_request(
    data: AssetRequestCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return asset_service.create_asset_request(db, data, current_user.organization_id, current_user)


@asset_router.put(
    "/requests/{req_id}/approve",
    response_model=AssetRequestResponse,
    summary="Approve an asset request",
)
def approve_asset_request(
    req_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return asset_service.approve_asset_request(db, req_id, current_user.id, current_user.organization_id)


@asset_router.put(
    "/requests/{req_id}/reject",
    response_model=AssetRequestResponse,
    summary="Reject an asset request",
    dependencies=[Depends(get_current_admin)],
)
def reject_asset_request(req_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return asset_service.reject_asset_request(db, req_id, current_user.organization_id)


@asset_router.put(
    "/requests/{req_id}/fulfill",
    response_model=AssetRequestResponse,
    summary="Fulfill an asset request",
    dependencies=[Depends(get_current_admin)],
)
def fulfill_asset_request(req_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return asset_service.fulfill_asset_request(db, req_id, current_user.organization_id)


@asset_router.put(
    "/requests/{req_id}/cancel",
    response_model=AssetRequestResponse,
    summary="Cancel an asset request",
)
def cancel_asset_request(
    req_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # only the person who raised the request, or an admin, can cancel it; anyone else's request looks like it does not exist
    req = asset_service._get_asset_request_by_id(db, req_id, current_user.organization_id)
    if not is_admin(current_user) and req.employee_id != current_user.id:
        raise NotFoundException("AssetRequest", req_id)
    return asset_service.cancel_asset_request(db, req_id, current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════
# ASSET CATEGORIES
# ════════════════════════════════════════════════════════════════════════════

@asset_router.get(
    "/categories",
    response_model=list[AssetCategoryResponse],
    summary="List asset categories",
)
def list_asset_categories(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return asset_service.get_asset_categories(db, current_user.organization_id)


@asset_router.post(
    "/categories",
    response_model=AssetCategoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an asset category",
    dependencies=[Depends(get_current_admin)],
)
def create_asset_category(data: AssetCategoryCreate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return asset_service.create_asset_category(db, data, current_user.organization_id)


@asset_router.put(
    "/categories/{cat_id}",
    response_model=AssetCategoryResponse,
    summary="Update an asset category",
    dependencies=[Depends(get_current_admin)],
)
def update_asset_category(
    cat_id: int,
    data: AssetCategoryCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return asset_service.update_asset_category(db, cat_id, data, current_user.organization_id)


@asset_router.delete(
    "/categories/{cat_id}",
    response_model=SuccessResponse,
    summary="Delete an asset category",
    dependencies=[Depends(get_current_admin)],
)
def delete_asset_category(cat_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    asset_service.delete_asset_category(db, cat_id, current_user.organization_id)
    return {"message": f"Asset category {cat_id} has been deleted successfully."}


# ════════════════════════════════════════════════════════════════════════════
# ASSET REPORTS
# ════════════════════════════════════════════════════════════════════════════

class AssetReportPage(BaseModel):
    items: list[AssetReportResponse]
    total: int
    page: int
    per_page: int


@asset_router.get(
    "/reports",
    response_model=list[AssetReportResponse] | AssetReportPage,
    summary="List asset reports",
)
def list_asset_reports(
    page: Optional[int] = Query(None, ge=1),
    per_page: Optional[int] = Query(None, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    """Without page/per_page: the plain list (newest first, at most 200) the Asset Reports page reads today.
    With them: {items, total, page, per_page}."""
    org_id = current_user.organization_id
    if page is None and per_page is None:
        return asset_service.get_asset_reports(db, organization_id=org_id)
    rows, total = asset_service.get_asset_reports(db, page=page, per_page=per_page, organization_id=org_id)
    return AssetReportPage(items=rows, total=total, page=page or 1, per_page=min(per_page or 25, 200))


@asset_router.post(
    "/reports",
    response_model=AssetReportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate an asset report",
)
def create_asset_report(
    data: AssetReportGenerate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return asset_service.create_asset_report(db, data, current_user.id, organization_id=current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════
# ASSET SETTINGS
# ════════════════════════════════════════════════════════════════════════════

@asset_router.get(
    "/settings",
    response_model=list[AssetSettingResponse],
    summary="List asset settings",
)
def list_asset_settings(db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return asset_service.get_asset_settings(db, organization_id=current_user.organization_id)


@asset_router.put(
    "/settings/{setting_key}",
    response_model=AssetSettingResponse,
    summary="Update an asset setting",
)
def update_asset_setting(
    setting_key: str,
    setting_value: str = Body(..., embed=True, description="The new setting value"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return asset_service.update_asset_setting(db, setting_key, setting_value, current_user.id,
                                              organization_id=current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════
# EXPORT
# ════════════════════════════════════════════════════════════════════════════

@asset_router.get(
    "/export/csv",
    summary="Export assets as CSV",
    description="Exports filtered/sorted assets as a CSV file.",
)
def export_assets_csv(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    search:      Optional[str]          = Query(None, description="Search filter"),
    status:      Optional[AssetStatus]  = Query(None, description="Filter by status"),
    category:    Optional[str]          = Query(None, description="Filter by category"),
    department:  Optional[str]          = Query(None, description="Filter by department"),
    employee_id: Optional[int]          = Query(None, description="Filter by employee ID"),
    sort_by:     Optional[str]          = Query("created_at", description="Sort field"),
    sort_order:  Optional[str]          = Query("desc",       description="Sort direction"),
):
    csv_data = asset_service.export_assets_csv(db, search, status, category, department, employee_id, sort_by, sort_order,
                                               current_user.organization_id, employee_ids=_own_scope(current_user, employee_id))
    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=assets_export.csv"},
    )


@asset_router.get(
    "/export/excel",
    summary="Export assets as Excel",
    description="Exports filtered/sorted assets as an Excel (.xlsx) file.",
)
def export_assets_excel(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    search:      Optional[str]          = Query(None, description="Search filter"),
    status:      Optional[AssetStatus]  = Query(None, description="Filter by status"),
    category:    Optional[str]          = Query(None, description="Filter by category"),
    department:  Optional[str]          = Query(None, description="Filter by department"),
    employee_id: Optional[int]          = Query(None, description="Filter by employee ID"),
    sort_by:     Optional[str]          = Query("created_at", description="Sort field"),
    sort_order:  Optional[str]          = Query("desc",       description="Sort direction"),
):
    xlsx_data = asset_service.export_assets_excel(db, search, status, category, department, employee_id, sort_by, sort_order,
                                                  current_user.organization_id, employee_ids=_own_scope(current_user, employee_id))
    return Response(
        content=xlsx_data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=assets_export.xlsx"},
    )


# ════════════════════════════════════════════════════════════════════════════
# ASSIGN / RETURN
# ════════════════════════════════════════════════════════════════════════════

@asset_router.put(
    "/{asset_id}/assign",
    response_model=AssetResponse,
    summary="Assign an asset to an employee",
    dependencies=[Depends(get_current_admin)],
)
def assign_asset_to_employee(
    asset_id: int,
    employee_id: int = Body(..., embed=True, description="Employee ID to assign the asset to"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return asset_service.assign_asset(db, asset_id, employee_id, assigned_by=current_user.id, organization_id=current_user.organization_id)


@asset_router.put(
    "/{asset_id}/return",
    response_model=AssetResponse,
    summary="Return an asset from an employee",
    dependencies=[Depends(get_current_admin)],
)
def return_asset_from_employee(
    asset_id: int,
    reason: str = Body(..., embed=True, description="Reason for return"),
    condition: Optional[str] = Body(None, embed=True, description="Asset condition after return"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return asset_service.return_asset(db, asset_id, reason, condition, returned_by=current_user.id, organization_id=current_user.organization_id)


@asset_router.put(
    "/{asset_id}/transfer",
    response_model=AssetResponse,
    summary="Transfer an asset to another employee",
    dependencies=[Depends(get_current_admin)],
)
def transfer_asset_to_employee(
    asset_id: int,
    employee_id: int = Body(..., embed=True, description="New employee ID to transfer the asset to"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return asset_service.transfer_asset(db, asset_id, employee_id, transferred_by=current_user.id, organization_id=current_user.organization_id)


# ── Single-asset CRUD (must be LAST to avoid catching /requests, /categories, /settings, /export) ─

@asset_router.get(
    "/{asset_id}",
    response_model=AssetResponse,
    summary="Get a single asset by ID",
)
def get_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Retrieve the asset ORM object (someone else's asset is a 404 for anyone but an admin)
    asset = _visible_asset(db, asset_id, current_user)
    # Attach employee_name for the response model (FastAPI will serialize this attribute)
    if hasattr(asset, "employee") and asset.employee is not None:
        asset.employee_name = asset.employee.full_name
    else:
        asset.employee_name = None
    return asset


@asset_router.put(
    "/{asset_id}",
    response_model=AssetResponse,
    summary="Update an asset",
    dependencies=[Depends(get_current_admin)],
)
def update_asset(asset_id: int, data: AssetUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    return asset_service.update_asset(db, asset_id, data, updated_by=current_user.id, organization_id=current_user.organization_id,
                                      actor=current_user)


@asset_router.delete(
    "/{asset_id}",
    response_model=SuccessResponse,
    summary="Delete an asset",
    description="Soft delete, recorded in the audit log. An asset that is assigned to someone answers 409 ASSET_ASSIGNED: "
                "return it first.",
    dependencies=[Depends(get_current_admin)],
)
def delete_asset(asset_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_admin)):
    asset_service.delete_asset(db, asset_id, current_user.organization_id, actor=current_user)
    return {"message": f"Asset {asset_id} has been deleted successfully."}
