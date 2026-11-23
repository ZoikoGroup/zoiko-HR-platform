"""Learning: set each open enrollment's progress from the quizzes its learner has already passed

Revision ID: 4c8e1f2a9b7d
Revises: b0c1d2e3f4a5
Create Date: 2026-11-23

From this release an enrollment's progress_pct is worked out from its course's quizzes (passed quizzes / quizzes in the
course x 100; only quizzes that are switched on and have questions count), and passing the last one completes the
enrollment (learning_service.sync_learner_progress). Until now progress stayed 0 until an admin marked the course
completed, so this brings the enrollments that already exist in line once:

- only enrollments that are not completed or dropped are touched, and only for courses that have a quiz;
- progress_pct = the share of the course's quizzes the learner has passed;
- a learner with any attempt on those quizzes is in_progress (started_at filled in if empty);
- a learner who has passed them all is completed (completed_at = now). The completion record that a mandatory course
  gets when it is completed in the app (HR-PRF-018) is not generated here: no documents are made inside a migration.

No schema change. Downgrade does nothing: the earlier values were never stored anywhere else.
"""
from datetime import datetime

import sqlalchemy as sa
from alembic import op

revision = "4c8e1f2a9b7d"
down_revision = "b0c1d2e3f4a5"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    now = datetime.utcnow()
    quizzes = {}
    for course_id, assessment_id in bind.execute(sa.text(
        "SELECT a.course_id, a.id FROM learning_assessments a WHERE a.is_active = :on "
        "AND EXISTS (SELECT 1 FROM learning_assessment_questions q WHERE q.assessment_id = a.id)"
    ), {"on": True}).fetchall():
        quizzes.setdefault(course_id, set()).add(assessment_id)
    if not quizzes:
        return

    enrollments = bind.execute(sa.text(
        "SELECT id, course_id, employee_id, started_at FROM learning_enrollments "
        "WHERE status IS NULL OR status NOT IN ('completed', 'dropped')"
    )).fetchall()
    for enrollment_id, course_id, employee_id, started_at in enrollments:
        quiz_ids = quizzes.get(course_id)
        if not quiz_ids:
            continue
        attempts = bind.execute(sa.text(
            "SELECT assessment_id, status, passed FROM learning_quiz_attempts WHERE employee_id = :e"
        ), {"e": employee_id}).fetchall()
        mine = [a for a in attempts if a[0] in quiz_ids]
        passed = {a[0] for a in mine if a[1] == "completed" and a[2]}
        pct = round(len(passed) * 100 / len(quiz_ids))
        values = {"id": enrollment_id, "pct": pct, "now": now}
        if pct >= 100:
            bind.execute(sa.text(
                "UPDATE learning_enrollments SET progress_pct = :pct, status = 'completed', "
                "started_at = COALESCE(started_at, :now), completed_at = COALESCE(completed_at, :now) WHERE id = :id"
            ), values)
        elif mine:
            bind.execute(sa.text(
                "UPDATE learning_enrollments SET progress_pct = :pct, status = 'in_progress', "
                "started_at = COALESCE(started_at, :now) WHERE id = :id"
            ), values)
        else:
            bind.execute(sa.text("UPDATE learning_enrollments SET progress_pct = :pct WHERE id = :id"), values)


def downgrade():
    pass
