"""List all employees with admin-level roles."""
from app.database import initialize_database, SessionLocal
from app.modules.employee.models import Employee

initialize_database()
db = SessionLocal()
try:
    employees = db.query(Employee).filter(
        Employee.role.in_(["super_admin", "admin", "hr_admin", "billing_admin"])
    ).all()
    if not employees:
        print("No admin-level employees found.")
    for e in employees:
        print(f"  id={e.id} | {e.email} | role={e.role} | active={e.is_active} | org_id={e.organization_id}")
finally:
    db.close()
