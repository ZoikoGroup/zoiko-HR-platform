"""
modules/hr/learning_router.py
------------------------------
Defines all HTTP endpoints for the Learning & Development sub-module.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, status, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_current_admin

from app.modules.hr import learning_service
from app.modules.hr.schemas import (
    SuccessResponse,
    CourseCreate, CourseUpdate, CourseResponse,
    EnrollmentCreate, EnrollmentUpdate, EnrollmentResponse,
    LearningPathCreate, LearningPathUpdate, LearningPathItemCreate,
    LearningPathItemResponse, LearningPathResponse,
    CertificationCreate, CertificationUpdate, CertificationResponse,
    SkillCreate, SkillUpdate, SkillResponse,
    AssessmentCreate, AssessmentUpdate, AssessmentResponse,
    QuestionCreate, QuestionUpdate, QuestionResponse,
    QuizAttemptStart, QuizAttemptSubmit, QuizAttemptResponse,
    TrainingProgramCreate, TrainingProgramUpdate, TrainingProgramResponse,
    ProgramAssignmentCreate, ProgramAssignmentUpdate, ProgramAssignmentResponse,
    CalendarEventCreate, CalendarEventUpdate, CalendarEventResponse,
    LearningDashboardResponse,
)

learning_router = APIRouter(prefix="/hr/learning", tags=["Learning"])


# ════════════════════════════════════════════════════════════════════════════
# DASHBOARD
# ════════════════════════════════════════════════════════════════════════════

@learning_router.get(
    "/dashboard",
    response_model=LearningDashboardResponse,
    summary="Learning dashboard overview",
    description="Returns aggregated learning metrics: course counts, enrollments, completion rate, etc."
)
def learning_dashboard(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_learning_dashboard(db, organization_id=current_user.organization_id)


# ════════════════════════════════════════════════════════════════════════════
# COURSES
# ════════════════════════════════════════════════════════════════════════════

@learning_router.get(
    "/courses",
    summary="List courses (paginated)",
    description="Returns a paginated list of courses, optionally filtered by search, category, status, or type."
)
def list_courses(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=10000, description="Results per page"),
    search: Optional[str] = Query(None, description="Search by course name"),
    category: Optional[str] = Query(None, description="Filter by category"),
    status: Optional[str] = Query(None, description="Filter by status"),
    course_type: Optional[str] = Query(None, description="Filter by course type"),
):
    return learning_service.get_courses(db, page, per_page, search, category, status, course_type, organization_id=current_user.organization_id)


@learning_router.post(
    "/courses",
    response_model=CourseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a course",
)
def create_course(
    data: CourseCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return learning_service.create_course(db, data, created_by=current_user.id, organization_id=current_user.organization_id)


@learning_router.get(
    "/courses/{course_id}",
    response_model=CourseResponse,
    summary="Get a course by ID",
)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_course_by_id(db, course_id, organization_id=current_user.organization_id)


@learning_router.put(
    "/courses/{course_id}",
    response_model=CourseResponse,
    summary="Update a course",
    dependencies=[Depends(get_current_admin)],
)
def update_course(
    course_id: int,
    data: CourseUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.update_course(db, course_id, data, organization_id=current_user.organization_id)


@learning_router.delete(
    "/courses/{course_id}",
    response_model=SuccessResponse,
    summary="Delete a course",
    dependencies=[Depends(get_current_admin)],
)
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    learning_service.delete_course(db, course_id, organization_id=current_user.organization_id)
    return {"message": f"Course {course_id} has been deleted successfully."}


# ════════════════════════════════════════════════════════════════════════════
# ENROLLMENTS
# ════════════════════════════════════════════════════════════════════════════

@learning_router.get(
    "/enrollments",
    summary="List enrollments (paginated)",
    description="Returns paginated enrollments, optionally filtered by employee, course, or status."
)
def list_enrollments(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=10000, description="Results per page"),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
    course_id: Optional[int] = Query(None, description="Filter by course ID"),
    status: Optional[str] = Query(None, description="Filter by enrollment status"),
):
    return learning_service.get_enrollments(db, page, per_page, employee_id, course_id, status, organization_id=current_user.organization_id)


@learning_router.post(
    "/enrollments",
    response_model=EnrollmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an enrollment",
)
def create_enrollment(
    data: EnrollmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.create_enrollment(db, data, organization_id=current_user.organization_id)


@learning_router.get(
    "/enrollments/{id}",
    response_model=EnrollmentResponse,
    summary="Get an enrollment by ID",
)
def get_enrollment(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_enrollment_by_id(db, id)


@learning_router.put(
    "/enrollments/{id}",
    response_model=EnrollmentResponse,
    summary="Update an enrollment",
    dependencies=[Depends(get_current_admin)],
)
def update_enrollment(
    id: int,
    data: EnrollmentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.update_enrollment(db, id, data, organization_id=current_user.organization_id)


@learning_router.delete(
    "/enrollments/{id}",
    response_model=SuccessResponse,
    summary="Delete an enrollment",
    dependencies=[Depends(get_current_admin)],
)
def delete_enrollment(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    learning_service.delete_enrollment(db, id, organization_id=current_user.organization_id)
    return {"message": f"Enrollment {id} has been deleted successfully."}


# ════════════════════════════════════════════════════════════════════════════
# LEARNING PATHS
# ════════════════════════════════════════════════════════════════════════════

@learning_router.get(
    "/paths",
    summary="List all learning paths",
    description="Returns all learning paths with their items."
)
def list_learning_paths(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_learning_paths(db, organization_id=current_user.organization_id)


@learning_router.post(
    "/paths",
    response_model=LearningPathResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a learning path",
)
def create_learning_path(
    data: LearningPathCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return learning_service.create_learning_path(db, data, created_by=current_user.id, organization_id=current_user.organization_id)


@learning_router.get(
    "/paths/{path_id}",
    response_model=LearningPathResponse,
    summary="Get a learning path by ID",
)
def get_learning_path(
    path_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_learning_path_by_id(db, path_id, organization_id=current_user.organization_id)


@learning_router.put(
    "/paths/{path_id}",
    response_model=LearningPathResponse,
    summary="Update a learning path",
    dependencies=[Depends(get_current_admin)],
)
def update_learning_path(
    path_id: int,
    data: LearningPathUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.update_learning_path(db, path_id, data, organization_id=current_user.organization_id)


@learning_router.delete(
    "/paths/{path_id}",
    response_model=SuccessResponse,
    summary="Delete a learning path",
    dependencies=[Depends(get_current_admin)],
)
def delete_learning_path(
    path_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    learning_service.delete_learning_path(db, path_id, organization_id=current_user.organization_id)
    return {"message": f"Learning path {path_id} has been deleted successfully."}


@learning_router.post(
    "/paths/{path_id}/items",
    response_model=LearningPathItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add an item to a learning path",
    dependencies=[Depends(get_current_admin)],
)
def add_path_item(
    path_id: int,
    data: LearningPathItemCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.add_path_item(db, path_id, data, organization_id=current_user.organization_id)


@learning_router.put(
    "/paths/{path_id}/items/{item_id}",
    response_model=LearningPathItemResponse,
    summary="Update a learning path item",
    dependencies=[Depends(get_current_admin)],
)
def update_path_item(
    path_id: int,
    item_id: int,
    data: LearningPathItemCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.update_path_item(db, path_id, item_id, data, organization_id=current_user.organization_id)


@learning_router.delete(
    "/paths/{path_id}/items/{item_id}",
    response_model=SuccessResponse,
    summary="Remove an item from a learning path",
    dependencies=[Depends(get_current_admin)],
)
def remove_path_item(
    path_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    learning_service.remove_path_item(db, path_id, item_id, organization_id=current_user.organization_id)
    return {"message": f"Item {item_id} has been removed from learning path {path_id}."}


# ════════════════════════════════════════════════════════════════════════════
# CERTIFICATIONS
# ════════════════════════════════════════════════════════════════════════════

@learning_router.get(
    "/certifications",
    response_model=list[CertificationResponse],
    summary="List certifications",
    description="Returns all certifications, optionally filtered by employee ID."
)
def list_certifications(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
):
    return learning_service.get_certifications(db, employee_id, organization_id=current_user.organization_id)


@learning_router.post(
    "/certifications",
    response_model=CertificationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a certification record",
)
def create_certification(
    data: CertificationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return learning_service.create_certification(db, data, created_by=current_user.id, organization_id=current_user.organization_id)


@learning_router.get(
    "/certifications/{id}",
    response_model=CertificationResponse,
    summary="Get a certification by ID",
)
def get_certification(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_certification_by_id(db, id)


@learning_router.put(
    "/certifications/{id}",
    response_model=CertificationResponse,
    summary="Update a certification",
    dependencies=[Depends(get_current_admin)],
)
def update_certification(
    id: int,
    data: CertificationUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.update_certification(db, id, data, organization_id=current_user.organization_id)


@learning_router.delete(
    "/certifications/{id}",
    response_model=SuccessResponse,
    summary="Delete a certification",
    dependencies=[Depends(get_current_admin)],
)
def delete_certification(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    learning_service.delete_certification(db, id, organization_id=current_user.organization_id)
    return {"message": f"Certification {id} has been deleted successfully."}


# ════════════════════════════════════════════════════════════════════════════
# SKILLS
# ════════════════════════════════════════════════════════════════════════════

@learning_router.get(
    "/skills",
    response_model=list[SkillResponse],
    summary="List skills",
    description="Returns all skills, optionally filtered by employee ID."
)
def list_skills(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
):
    return learning_service.get_skills(db, employee_id)


@learning_router.post(
    "/skills",
    response_model=SkillResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a skill record",
)
def create_skill(
    data: SkillCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return learning_service.create_skill(db, data, organization_id=current_user.organization_id)


@learning_router.get(
    "/skills/{id}",
    response_model=SkillResponse,
    summary="Get a skill by ID",
)
def get_skill(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_skill_by_id(db, id)


@learning_router.put(
    "/skills/{id}",
    response_model=SkillResponse,
    summary="Update a skill",
    dependencies=[Depends(get_current_admin)],
)
def update_skill(
    id: int,
    data: SkillUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.update_skill(db, id, data)


@learning_router.delete(
    "/skills/{id}",
    response_model=SuccessResponse,
    summary="Delete a skill",
    dependencies=[Depends(get_current_admin)],
)
def delete_skill(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    learning_service.delete_skill(db, id)
    return {"message": f"Skill {id} has been deleted successfully."}


# ════════════════════════════════════════════════════════════════════════════
# ASSESSMENTS & QUESTIONS (static paths first)
# ════════════════════════════════════════════════════════════════════════════

@learning_router.post(
    "/assessments/start",
    response_model=QuizAttemptResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start a quiz attempt",
)
def start_quiz(
    data: QuizAttemptStart,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.start_quiz(db, data)


@learning_router.get(
    "/assessments/attempts/{attempt_id}",
    response_model=QuizAttemptResponse,
    summary="Get a quiz attempt by ID",
)
def get_quiz_attempt(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_quiz_attempt_by_id(db, attempt_id)


@learning_router.get(
    "/assessments",
    response_model=list[AssessmentResponse],
    summary="List assessments",
    description="Returns all assessments, optionally filtered by course ID."
)
def list_assessments(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    course_id: Optional[int] = Query(None, description="Filter by course ID"),
):
    return learning_service.get_assessments(db, course_id)


@learning_router.post(
    "/assessments",
    response_model=AssessmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an assessment",
)
def create_assessment(
    data: AssessmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return learning_service.create_assessment(db, data, created_by=current_user.id)


@learning_router.get(
    "/assessments/{id}",
    response_model=AssessmentResponse,
    summary="Get an assessment by ID",
)
def get_assessment(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_assessment_by_id(db, id)


@learning_router.put(
    "/assessments/{id}",
    response_model=AssessmentResponse,
    summary="Update an assessment",
    dependencies=[Depends(get_current_admin)],
)
def update_assessment(
    id: int,
    data: AssessmentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.update_assessment(db, id, data)


@learning_router.delete(
    "/assessments/{id}",
    response_model=SuccessResponse,
    summary="Delete an assessment",
    dependencies=[Depends(get_current_admin)],
)
def delete_assessment(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    learning_service.delete_assessment(db, id)
    return {"message": f"Assessment {id} has been deleted successfully."}


# ── Assessment questions ──────────────────────────────────────────────────

@learning_router.get(
    "/assessments/{id}/questions",
    response_model=list[QuestionResponse],
    summary="List questions for an assessment",
)
def list_questions(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_questions(db, id)


@learning_router.post(
    "/assessments/{id}/questions",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a question to an assessment",
    dependencies=[Depends(get_current_admin)],
)
def add_question(
    id: int,
    data: QuestionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.add_question(db, id, data)


@learning_router.put(
    "/assessments/{id}/questions/{q_id}",
    response_model=QuestionResponse,
    summary="Update a question",
    dependencies=[Depends(get_current_admin)],
)
def update_question(
    id: int,
    q_id: int,
    data: QuestionUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.update_question(db, q_id, data)


@learning_router.delete(
    "/assessments/{id}/questions/{q_id}",
    response_model=SuccessResponse,
    summary="Delete a question",
    dependencies=[Depends(get_current_admin)],
)
def delete_question(
    id: int,
    q_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    learning_service.delete_question(db, q_id)
    return {"message": f"Question {q_id} has been deleted successfully."}


# ── Quiz attempts ─────────────────────────────────────────────────────────

@learning_router.post(
    "/assessments/{id}/attempts/{attempt_id}/submit",
    response_model=QuizAttemptResponse,
    summary="Submit a quiz attempt",
)
def submit_quiz(
    id: int,
    attempt_id: int,
    data: QuizAttemptSubmit,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.submit_quiz(db, attempt_id, data)


@learning_router.get(
    "/assessments/{id}/attempts",
    response_model=list[QuizAttemptResponse],
    summary="List quiz attempts for an assessment",
    description="Returns all attempts for an assessment, optionally filtered by employee ID."
)
def list_quiz_attempts(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    employee_id: Optional[int] = Query(None, description="Filter by employee ID"),
):
    return learning_service.get_quiz_attempts(db, assessment_id=id, employee_id=employee_id)


# ════════════════════════════════════════════════════════════════════════════
# TRAINING PROGRAMS
# ════════════════════════════════════════════════════════════════════════════

@learning_router.get(
    "/programs",
    summary="List training programs (paginated)",
    description="Returns a paginated list of training programs, optionally filtered by status."
)
def list_training_programs(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=10000, description="Results per page"),
    status: Optional[str] = Query(None, description="Filter by status"),
):
    return learning_service.get_training_programs(db, page, per_page, status, organization_id=current_user.organization_id)


@learning_router.post(
    "/programs",
    response_model=TrainingProgramResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a training program",
)
def create_training_program(
    data: TrainingProgramCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return learning_service.create_training_program(db, data, created_by=current_user.id, organization_id=current_user.organization_id)


@learning_router.get(
    "/programs/{prog_id}",
    response_model=TrainingProgramResponse,
    summary="Get a training program by ID",
)
def get_training_program(
    prog_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_training_program_by_id(db, prog_id, organization_id=current_user.organization_id)


@learning_router.put(
    "/programs/{prog_id}",
    response_model=TrainingProgramResponse,
    summary="Update a training program",
    dependencies=[Depends(get_current_admin)],
)
def update_training_program(
    prog_id: int,
    data: TrainingProgramUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.update_training_program(db, prog_id, data, organization_id=current_user.organization_id)


@learning_router.delete(
    "/programs/{prog_id}",
    response_model=SuccessResponse,
    summary="Delete a training program",
    dependencies=[Depends(get_current_admin)],
)
def delete_training_program(
    prog_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    learning_service.delete_training_program(db, prog_id, organization_id=current_user.organization_id)
    return {"message": f"Training program {prog_id} has been deleted successfully."}


# ── Program assignments ───────────────────────────────────────────────────

@learning_router.get(
    "/programs/{prog_id}/assignments",
    summary="List assignments for a training program",
)
def list_program_assignments(
    prog_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_program_assignments(db, prog_id, organization_id=current_user.organization_id)


@learning_router.post(
    "/programs/{prog_id}/assignments",
    response_model=ProgramAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Assign an employee to a training program",
    dependencies=[Depends(get_current_admin)],
)
def assign_program(
    prog_id: int,
    data: ProgramAssignmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.assign_program(db, data, organization_id=current_user.organization_id)


@learning_router.put(
    "/programs/{prog_id}/assignments/{assign_id}",
    response_model=ProgramAssignmentResponse,
    summary="Update a program assignment",
    dependencies=[Depends(get_current_admin)],
)
def update_program_assignment(
    prog_id: int,
    assign_id: int,
    data: ProgramAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.update_program_assignment(db, assign_id, data, organization_id=current_user.organization_id)


@learning_router.delete(
    "/programs/{prog_id}/assignments/{assign_id}",
    response_model=SuccessResponse,
    summary="Remove a program assignment",
    dependencies=[Depends(get_current_admin)],
)
def remove_program_assignment(
    prog_id: int,
    assign_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    learning_service.remove_program_assignment(db, assign_id, organization_id=current_user.organization_id)
    return {"message": f"Assignment {assign_id} has been removed successfully."}


# ════════════════════════════════════════════════════════════════════════════
# CALENDAR EVENTS
# ════════════════════════════════════════════════════════════════════════════

@learning_router.get(
    "/calendar",
    response_model=list[CalendarEventResponse],
    summary="List calendar events",
    description="Returns calendar events, optionally filtered by date range."
)
def list_calendar_events(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    start_date: Optional[date] = Query(None, description="Filter events starting from this date"),
    end_date: Optional[date] = Query(None, description="Filter events up to this date"),
):
    return learning_service.get_calendar_events(db, start_date, end_date, organization_id=current_user.organization_id)


@learning_router.post(
    "/calendar",
    response_model=CalendarEventResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a calendar event",
)
def create_calendar_event(
    data: CalendarEventCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    return learning_service.create_calendar_event(db, data, created_by=current_user.id, organization_id=current_user.organization_id)


@learning_router.get(
    "/calendar/{id}",
    response_model=CalendarEventResponse,
    summary="Get a calendar event by ID",
)
def get_calendar_event(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_calendar_event_by_id(db, id, organization_id=current_user.organization_id)


@learning_router.put(
    "/calendar/{id}",
    response_model=CalendarEventResponse,
    summary="Update a calendar event",
    dependencies=[Depends(get_current_admin)],
)
def update_calendar_event(
    id: int,
    data: CalendarEventUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.update_calendar_event(db, id, data, organization_id=current_user.organization_id)


@learning_router.delete(
    "/calendar/{id}",
    response_model=SuccessResponse,
    summary="Delete a calendar event",
    dependencies=[Depends(get_current_admin)],
)
def delete_calendar_event(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    learning_service.delete_calendar_event(db, id, organization_id=current_user.organization_id)
    return {"message": f"Calendar event {id} has been deleted successfully."}


# ════════════════════════════════════════════════════════════════════════════
# LEARNING REPORTS
# ════════════════════════════════════════════════════════════════════════════

@learning_router.get(
    "/reports/course-completion",
    summary="Course completion report",
    description="Returns completion stats grouped by course.",
)
def course_completion_report(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_course_completion_report(db, current_user.organization_id)


@learning_router.get(
    "/reports/course-completion/csv",
    summary="Export course completion report as CSV",
)
def export_course_completion_report_csv(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    csv_data = learning_service.export_course_completion_csv(db, current_user.organization_id)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=course_completion.csv"}
    )


@learning_router.get(
    "/reports/course-completion/excel",
    summary="Export course completion report as Excel",
)
def export_course_completion_report_excel(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    xlsx_data = learning_service.export_course_completion_excel(db, current_user.organization_id)
    return Response(
        content=xlsx_data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=course_completion.xlsx"}
    )


@learning_router.get(
    "/reports/certifications",
    response_model=list[CertificationResponse],
    summary="Certification report",
    description="Returns all certification records.",
)
def certification_report(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_certifications(db, organization_id=current_user.organization_id)


@learning_router.get(
    "/reports/certifications/csv",
    summary="Export certifications report as CSV",
)
def export_certifications_report_csv(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    csv_data = learning_service.export_certifications_csv(db, current_user.organization_id)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=certifications.csv"}
    )


@learning_router.get(
    "/reports/certifications/excel",
    summary="Export certifications report as Excel",
)
def export_certifications_report_excel(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    xlsx_data = learning_service.export_certifications_excel(db, current_user.organization_id)
    return Response(
        content=xlsx_data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=certifications.xlsx"}
    )


@learning_router.get(
    "/reports/skill-gap",
    summary="Skill gap analysis",
    description="Returns skill gap analysis across employees.",
)
def skill_gap_report(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return learning_service.get_skill_gap_analysis(db, current_user.organization_id)


@learning_router.get(
    "/reports/skill-gap/csv",
    summary="Export skill gap report as CSV",
)
def export_skill_gap_report_csv(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    csv_data = learning_service.export_skill_gap_csv(db, current_user.organization_id)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=skill_gap.csv"}
    )


@learning_router.get(
    "/reports/skill-gap/excel",
    summary="Export skill gap report as Excel",
)
def export_skill_gap_report_excel(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    xlsx_data = learning_service.export_skill_gap_excel(db, current_user.organization_id)
    return Response(
        content=xlsx_data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=skill_gap.xlsx"}
    )
