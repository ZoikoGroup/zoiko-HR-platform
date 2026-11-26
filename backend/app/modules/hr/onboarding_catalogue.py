"""Ready-made choices for Onboarding › Settings › Engagement and role profiles.

- EMPLOYMENT_CATEGORIES: the kinds of engagement an organisation hires on (full-time / part-time permanent employees,
  full-time / part-time Associates (interns), contractors and consultants). Each carries the starting terms of an
  Engagement Profile, so HR picks the categories they use instead of typing every profile by hand. The category is also what
  the notice-period rules and offers choose from (they list engagement profiles).
- SECTORS: the sectors an organisation can say it operates in (one or more). Each lists the roles usually hired in it, which
  the Role Profiles list offers as ready role titles.

Plain data, no database: the organisation's own choices live in onboarding_profiles (sectors, profiles).
"""
from __future__ import annotations

_WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"]

# key -> (label, engagement profile starting terms)
EMPLOYMENT_CATEGORIES: dict[str, tuple[str, dict]] = {
    "full_time_permanent": ("Full-time permanent employee", {
        "employment_type": "Full-time, permanent", "party_term": "Employee", "engagement_term": "employment",
        "remuneration_type": "salary", "remuneration_label": "Salary", "assessment_months": 6, "assessment_label": "Probation",
        "working_days": _WEEKDAYS}),
    "part_time_permanent": ("Part-time permanent employee", {
        "employment_type": "Part-time, permanent", "party_term": "Employee", "engagement_term": "employment",
        "remuneration_type": "salary", "remuneration_label": "Salary", "assessment_months": 6, "assessment_label": "Probation",
        "working_days": _WEEKDAYS}),
    "full_time_associate": ("Full-time Associate (Intern)", {
        "employment_type": "Full-time internship", "party_term": "Associate", "engagement_term": "engagement",
        "remuneration_type": "stipend", "remuneration_label": "Monthly Stipend", "assessment_months": 3,
        "assessment_label": "Assessment Period", "working_days": _WEEKDAYS}),
    "part_time_associate": ("Part-time Associate (Intern)", {
        "employment_type": "Part-time internship", "party_term": "Associate", "engagement_term": "engagement",
        "remuneration_type": "stipend", "remuneration_label": "Monthly Stipend", "assessment_months": 3,
        "assessment_label": "Assessment Period", "working_days": _WEEKDAYS}),
    "contractor": ("Contractor / Consultant", {
        "employment_type": "Contract", "party_term": "Contractor", "engagement_term": "engagement",
        "remuneration_type": "fee", "remuneration_label": "Fee", "assessment_months": None, "assessment_label": "Initial Period",
        "working_days": _WEEKDAYS}),
}

CATEGORY_SLUGS = {key: key.replace("_", "-") for key in EMPLOYMENT_CATEGORIES}

# key -> (label, roles usually hired in the sector)
SECTORS: dict[str, tuple[str, list[str]]] = {
    "it_software": ("IT & Software", [
        "Software Engineer", "Full Stack Developer", "Frontend Developer", "Backend Developer", "QA / Test Engineer",
        "DevOps Engineer", "Data Analyst", "Product Manager", "UI/UX Designer", "IT Support Specialist"]),
    "telecommunications": ("Telecommunications", [
        "Network Engineer", "RF Engineer", "Telecom Sales Executive", "Customer Support Executive", "NOC Engineer",
        "Billing Analyst", "Field Technician"]),
    "finance_banking": ("Finance & Banking", [
        "Accountant", "Financial Analyst", "Accounts Executive", "Credit Analyst", "Compliance Officer", "Relationship Manager",
        "Payroll Specialist"]),
    "healthcare": ("Healthcare & Life Sciences", [
        "Staff Nurse", "Medical Officer", "Pharmacist", "Lab Technician", "Clinical Research Associate", "Healthcare Administrator"]),
    "manufacturing": ("Manufacturing & Engineering", [
        "Production Supervisor", "Quality Inspector", "Mechanical Engineer", "Maintenance Technician", "Plant Manager",
        "Supply Chain Coordinator"]),
    "retail_ecommerce": ("Retail & E-commerce", [
        "Store Manager", "Sales Associate", "Category Manager", "E-commerce Executive", "Merchandiser", "Customer Service Associate"]),
    "education": ("Education & Training", [
        "Teacher", "Trainer", "Curriculum Designer", "Academic Coordinator", "Counsellor", "Admissions Officer"]),
    "hospitality": ("Hospitality & Travel", [
        "Front Office Executive", "Chef", "Housekeeping Supervisor", "Travel Consultant", "Event Coordinator", "Guest Relations Executive"]),
    "logistics": ("Logistics & Transport", [
        "Logistics Coordinator", "Warehouse Supervisor", "Fleet Manager", "Dispatch Executive", "Inventory Controller"]),
    "construction_real_estate": ("Construction & Real Estate", [
        "Site Engineer", "Project Manager", "Quantity Surveyor", "Architect", "Real Estate Sales Executive", "Safety Officer"]),
    "professional_services": ("Professional Services & Consulting", [
        "Business Analyst", "Management Consultant", "Legal Associate", "Recruiter", "Project Coordinator", "Office Administrator"]),
    "media_marketing": ("Media, Marketing & Creative", [
        "Digital Marketing Executive", "Content Writer", "Graphic Designer", "Social Media Manager", "SEO Specialist", "Video Editor"]),
    "energy_utilities": ("Energy & Utilities", [
        "Electrical Engineer", "Solar Technician", "Operations Engineer", "HSE Officer", "Energy Analyst"]),
    "nonprofit_public": ("Non-profit & Public Sector", [
        "Programme Officer", "Grant Writer", "Community Coordinator", "Policy Analyst", "Volunteer Coordinator"]),
}

# roles every organisation hires, whatever its sector
COMMON_ROLES = ["HR Executive", "HR Manager", "Operations Manager", "Administrative Assistant", "Finance Executive",
                "Sales Executive", "Customer Success Executive"]


def categories() -> list[dict]:
    return [{"key": k, "label": label, "slug": CATEGORY_SLUGS[k], "employment_type": terms["employment_type"]}
            for k, (label, terms) in EMPLOYMENT_CATEGORIES.items()]


def sectors() -> list[dict]:
    return [{"key": k, "label": label, "roles": list(roles)} for k, (label, roles) in SECTORS.items()]


def suggested_roles(sector_keys: list[str]) -> list[str]:
    """The role titles for the chosen sectors (in sector order, no repeats), then the roles every organisation hires."""
    out: list[str] = []
    seen: set[str] = set()
    for key in sector_keys or []:
        for title in SECTORS.get(key, ("", []))[1]:
            if title.casefold() not in seen:
                seen.add(title.casefold())
                out.append(title)
    for title in COMMON_ROLES:
        if title.casefold() not in seen:
            seen.add(title.casefold())
            out.append(title)
    return out
