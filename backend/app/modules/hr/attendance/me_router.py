"""Employee self-service attendance (attendance plan M2): /hr/me/attendance/*.

Every signed-in person with an employee record may use it (Admins and HR punch too). Data is always the caller's own.
Punches are rate-limited (a double click is answered with the existing day, see punch_service).
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.rate_limiter import limiter
from app.database import get_db
from app.modules.hr.attendance import me_service, punch_service
from app.modules.hr.documents.audit_service import RequestCtx, request_ctx

router = APIRouter(prefix="/hr/me/attendance", tags=["Attendance · Me"])

PUNCH_RATE = "12/minute"


class PunchOutIn(BaseModel):
    note: Optional[str] = Field(None, max_length=1000)


@router.get("/today", summary="My attendance today: punches, breaks, running time and shift")
def my_today(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return punch_service.today(db, user)


@router.post("/punch-in", summary="Punch in")
@limiter.limit(PUNCH_RATE)
def punch_in(request: Request, db: Session = Depends(get_db), user=Depends(get_current_user),
             ctx: RequestCtx = Depends(request_ctx)):
    return punch_service.punch_in(db, user, source="web", ctx=ctx)


@router.post("/punch-out", summary="Punch out (ends a running break)")
@limiter.limit(PUNCH_RATE)
def punch_out(request: Request, body: Optional[PunchOutIn] = None, db: Session = Depends(get_db),
              user=Depends(get_current_user), ctx: RequestCtx = Depends(request_ctx)):
    return punch_service.punch_out(db, user, note=body.note if body else None, source="web", ctx=ctx)


@router.post("/break/start", summary="Start a break")
@limiter.limit(PUNCH_RATE)
def break_start(request: Request, db: Session = Depends(get_db), user=Depends(get_current_user),
                ctx: RequestCtx = Depends(request_ctx)):
    return punch_service.break_start(db, user, source="web", ctx=ctx)


@router.post("/break/end", summary="End my break")
@limiter.limit(PUNCH_RATE)
def break_end(request: Request, db: Session = Depends(get_db), user=Depends(get_current_user),
              ctx: RequestCtx = Depends(request_ctx)):
    return punch_service.break_end(db, user, source="web", ctx=ctx)


@router.get("", summary="My month: a status for every day and KPIs over working days")
def my_month(month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$", description="YYYY-MM, default this month"),
             db: Session = Depends(get_db), user=Depends(get_current_user)):
    return me_service.month_view(db, user, month)


@router.get("/days/{day}", summary="One of my days: punches, breaks and history")
def my_day(day: date, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return me_service.day_detail(db, user, day)
