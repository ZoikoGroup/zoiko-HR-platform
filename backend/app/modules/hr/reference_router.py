"""Reference data shared by every form that records pay or an address.

    GET /hr/reference/regions            countries with their currency, the currency list, and the organization's own default
    GET /hr/reference/business-formats   per country: business ID types (GSTIN, EIN, ABN, VAT...), formats, address labels
    GET /hr/reference/business-lookup    legal name + registered address for a tax / VAT / company registration number
"""
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core import regions
from app.core.dependencies import get_current_admin, get_current_user
from app.core.exceptions import ZoikoException
from app.core.rate_limiter import limiter
from app.database import get_db

reference_router = APIRouter(prefix="/hr/reference", tags=["HR - Reference data"])


@reference_router.get("/regions", summary="Countries, currencies and the organization's default currency")
def get_regions(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    payload = regions.reference_payload()
    org_country, org_currency = None, regions.DEFAULT_CURRENCY
    if current_user.organization_id:
        from app.modules.hr.models import Organization
        org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
        if org is not None:
            org_country = regions.country_code(org.country)
            org_currency = (org.currency or "").upper() if regions.is_currency(org.currency) else regions.currency_for(org.country)
    payload["organization"] = {"country_code": org_country, "currency": org_currency}
    return payload


@reference_router.get("/business-formats", summary="Per country: which business IDs exist, their format, and how addresses are written")
def business_formats(current_user=Depends(get_current_user)):
    from app.core import business_ids
    return business_ids.payload()


@reference_router.get("/business-lookup", summary="Look a business up in the official register by its tax / VAT / company number")
@limiter.limit("20/minute")
def business_lookup(
    request: Request,
    country: str = Query(..., min_length=2, max_length=2, description="ISO country code the business is registered in"),
    number: str = Query(..., min_length=4, max_length=40, description="VAT / TIN / TRN / company registration number"),
    id_type: str = Query(None, max_length=30, description="Which number it is (gstin, ein, abn, vat...); defaults to the country's main one"),
    current_user=Depends(get_current_admin),
):
    from app.services import business_registry
    try:
        return business_registry.lookup(country, number, id_type)
    except business_registry.LookupError_ as e:
        code = "LOOKUP_NOT_CONFIGURED" if e.status == 501 else "LOOKUP_UNAVAILABLE" if e.status == 503 else "LOOKUP_INVALID"
        raise ZoikoException(e.status if e.status in (400, 501, 503) else 400, code, e.message)
