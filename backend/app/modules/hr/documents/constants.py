"""Seed data and fixed vocabularies of the documents module.

Category names are jurisdiction-neutral (decision Q1, 2026-11-19): no country-specific document names here. Which national
identity numbers a category checks is chosen per organization through `id_number_field` (validator registry, pre-check 5).
"""

# (key, name, is_required, uploader, requires_expiry, sensitivity, human_approval_required, sort_order)
SYSTEM_EMPLOYEE_CATEGORIES = (
    ("identity_proof",      "Identity Proof",      True,  "employee", True,  "C4", True,  10),
    ("address_proof",       "Address Proof",       True,  "employee", False, "C3", True,  20),
    ("education",           "Education",           True,  "employee", False, "C3", True,  30),
    ("previous_employment", "Previous Employment", False, "employee", False, "C3", False, 40),
    ("offer_contracts",     "Offer & Contracts",   False, "company",  False, "C3", False, 50),
    ("payslips",            "Payslips",            False, "system",   False, "C4", False, 60),
    ("tax_compliance",      "Tax & Compliance",    False, "system",   False, "C4", False, 70),
    ("bank_details",        "Bank Details",        True,  "employee", False, "C4", False, 80),
    ("medical_other",       "Medical / Others",    False, "employee", False, "C4", False, 90),
)

# Categories whose uploads always need a person to approve them; no rule or setting can auto-approve them (§14.2).
HUMAN_APPROVAL_KEYS = frozenset({"identity_proof", "address_proof", "education"})

# (key, name, icon, requires_approval, default_require_ack, sort_order)
SYSTEM_COMPANY_CATEGORIES = (
    ("company_policies",      "Company Policies",                "shield",   False, True,  10),
    ("employee_handbook",     "Employee Handbook",               "book",     False, True,  20),
    ("onboarding",            "Onboarding Documents",            "clipboard", False, False, 30),
    ("payslip_templates",     "Payslip Templates",               "receipt",  False, False, 40),
    ("forms_templates",       "Forms & Templates",               "file",     False, False, 50),
    ("compliance_legal",      "Compliance & Legal",              "scale",    False, False, 60),
    ("holiday_announcements", "Holiday Calendar & Announcements", "calendar", False, False, 70),
    ("training",              "Training Materials",              "graduation", False, False, 80),
)

REJECT_REASONS = ("illegible", "wrong_document", "expired", "incomplete", "name_mismatch", "other")

EXPIRY_SOON_DAYS = 30
APPROVAL_CHAIN = ("hr_admin", "admin")          # HR Admin -> Org Admin; a decision by either completes the document

# Legacy hr_documents.category -> new category (used by the backfill, documents/backfill.py).
LEGACY_EMPLOYEE_CATEGORY = {
    "contract": "offer_contracts",
    "payslip": "payslips",
    "tax": "tax_compliance",
}
LEGACY_COMPANY_CATEGORY = {
    "policy": "company_policies",
}
# Keywords in title / document_type that place a legacy "employee" upload in a container; first match wins.
EMPLOYEE_KEYWORDS = (
    (("passport", "identity", "id proof", "id_proof", "id card", "aadhaar", "aadhar", "driving", "licence", "license",
      "national id", "voter"), "identity_proof"),
    (("address", "utility bill", "electricity", "rent agreement", "lease"), "address_proof"),
    (("degree", "diploma", "certificate", "marksheet", "transcript", "education", "school", "university"), "education"),
    (("relieving", "experience", "previous employ", "reference letter", "service letter"), "previous_employment"),
    (("offer", "contract", "appointment", "agreement"), "offer_contracts"),
    (("payslip", "pay slip", "salary slip"), "payslips"),
    (("tax", "form 16", "w-2", "p60", "p45"), "tax_compliance"),
    (("bank", "cheque", "check", "account"), "bank_details"),
)
COMPANY_KEYWORDS = (
    (("policy", "policies", "code of conduct"), "company_policies"),
    (("handbook",), "employee_handbook"),
    (("onboarding", "induction", "welcome"), "onboarding"),
    (("holiday", "announcement", "calendar"), "holiday_announcements"),
    (("training", "course", "learning"), "training"),
    (("compliance", "legal", "regulation", "statutory"), "compliance_legal"),
)
DEFAULT_EMPLOYEE_CATEGORY = "medical_other"
DEFAULT_COMPANY_CATEGORY = "forms_templates"


def map_legacy_category(category: str | None, title: str | None, document_type: str | None, has_employee: bool) -> tuple[str, str]:
    """(scope, category_key) for a legacy hr_documents row."""
    cat = (category or "other").lower()
    text = f"{title or ''} {document_type or ''}".lower()
    if cat in LEGACY_EMPLOYEE_CATEGORY:
        return "employee", LEGACY_EMPLOYEE_CATEGORY[cat]
    if cat in LEGACY_COMPANY_CATEGORY:
        return "company", LEGACY_COMPANY_CATEGORY[cat]
    if cat == "company" or (cat == "other" and not has_employee):
        for words, key in COMPANY_KEYWORDS:
            if any(w in text for w in words):
                return "company", key
        return "company", DEFAULT_COMPANY_CATEGORY
    for words, key in EMPLOYEE_KEYWORDS:
        if any(w in text for w in words):
            return "employee", key
    return "employee", DEFAULT_EMPLOYEE_CATEGORY
