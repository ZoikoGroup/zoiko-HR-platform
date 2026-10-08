"""Formats for banking and identity details typed into an employee profile.

Every function takes what a person typed and returns it cleaned up (spaces and dashes removed, letters in capitals),
or None when it is blank (so a cleared box clears the stored value), or raises ValueError with a message written for
the person filling in the form. The same rules are mirrored in the browser (frontend/src/utils/profileForm.js).
"""
import re
from datetime import date
from typing import Optional

_SEPARATORS = re.compile(r"[\s\-]")


def _blank(value) -> bool:
    return value is None or str(value).strip() == ""


def _compact(value, keep_slash: bool = False) -> str:
    text = re.sub(r"[\s\-]", "", str(value).strip())
    return text if keep_slash else text.replace("/", "")


def pan_number(value) -> Optional[str]:
    if _blank(value):
        return None
    text = _compact(value).upper()
    if not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", text):
        raise ValueError("Enter a valid PAN: 5 letters, 4 digits and 1 letter, for example ABCDE1234F.")
    return text


def aadhar_number(value) -> Optional[str]:
    if _blank(value):
        return None
    text = _compact(value)
    if not re.fullmatch(r"[0-9]{12}", text):
        raise ValueError("Enter a valid Aadhar number: 12 digits, for example 2345 6789 0123.")
    if text[0] in "01":
        raise ValueError("An Aadhar number cannot start with 0 or 1.")
    return text


def ifsc_code(value) -> Optional[str]:
    if _blank(value):
        return None
    text = _compact(value).upper()
    if not re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", text):
        raise ValueError("Enter a valid IFSC code: 4 letters, the digit 0, then 6 letters or digits, for example HDFC0001234.")
    return text


def bank_account(value) -> Optional[str]:
    if _blank(value):
        return None
    text = _compact(value)
    if not re.fullmatch(r"[0-9]{9,18}", text):
        raise ValueError("Enter a valid account number: 9 to 18 digits, with no letters or symbols.")
    if len(set(text)) == 1:
        raise ValueError("That account number is not valid.")
    return text


def bank_name(value) -> Optional[str]:
    if _blank(value):
        return None
    text = " ".join(str(value).split())
    if len(text) > 100:
        raise ValueError("Bank name can be at most 100 characters.")
    if not re.fullmatch(r"[A-Za-z][A-Za-z .,&'()\-]*", text):
        raise ValueError("Bank name can contain only letters, spaces and . , & ' ( ) - and must start with a letter.")
    return text


def uan_number(value) -> Optional[str]:
    if _blank(value):
        return None
    text = _compact(value)
    if not re.fullmatch(r"[0-9]{12}", text):
        raise ValueError("Enter a valid UAN: 12 digits.")
    return text


def esic_number(value) -> Optional[str]:
    if _blank(value):
        return None
    text = _compact(value)
    if not re.fullmatch(r"[0-9]{10}|[0-9]{17}", text):
        raise ValueError("Enter a valid ESIC number: 10 or 17 digits.")
    return text


def pf_number(value) -> Optional[str]:
    if _blank(value):
        return None
    text = re.sub(r"\s", "", str(value).strip()).upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9/\-]{4,29}", text):
        raise ValueError("Enter a valid PF number: 5 to 30 letters, digits, / or -, for example MH/BAN/1234567/000/0001234.")
    return text


def passport_number(value) -> Optional[str]:
    if _blank(value):
        return None
    text = _compact(value).upper()
    if not re.fullmatch(r"[A-Z0-9]{6,9}", text) or not re.search(r"[0-9]", text):
        raise ValueError("Enter a valid passport number: 6 to 9 letters and digits, for example K1234567.")
    return text


def visa_number(value) -> Optional[str]:
    if _blank(value):
        return None
    text = _compact(value).upper()
    if not re.fullmatch(r"[A-Z0-9]{5,20}", text):
        raise ValueError("Enter a valid visa number: 5 to 20 letters and digits.")
    return text


def expiry_date(value, label: str = "Expiry date") -> Optional[date]:
    """A document's expiry must be a real date in a believable range."""
    if value is None:
        return None
    if not (2000 <= value.year <= 2100):
        raise ValueError(f"{label} must be between the years 2000 and 2100.")
    return value


def person_text(value, label: str, max_len: int = 100, letters_only: bool = True) -> Optional[str]:
    if _blank(value):
        return None
    text = " ".join(str(value).split())
    if len(text) > max_len:
        raise ValueError(f"{label} can be at most {max_len} characters.")
    if letters_only and not re.fullmatch(r"[A-Za-z][A-Za-z .'\-]*", text):
        raise ValueError(f"{label} can contain only letters, spaces and . ' - and must start with a letter.")
    return text


def free_text(value, label: str, max_len: int = 2000) -> Optional[str]:
    if _blank(value):
        return None
    text = str(value).strip()
    if len(text) > max_len:
        raise ValueError(f"{label} can be at most {max_len} characters.")
    return text


def pincode(value) -> Optional[str]:
    if _blank(value):
        return None
    text = re.sub(r"\s", "", str(value).strip()).upper()
    if not re.fullmatch(r"[A-Z0-9\-]{3,10}", text):
        raise ValueError("Enter a valid pincode: 3 to 10 letters or digits (for example 560001).")
    return text


BLOOD_GROUPS = ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")
MARITAL_STATUSES = ("single", "married", "divorced", "widowed")


def blood_group(value) -> Optional[str]:
    if _blank(value):
        return None
    text = str(value).strip().upper()
    if text not in BLOOD_GROUPS:
        raise ValueError("Choose a blood group from the list.")
    return text


def marital_status(value) -> Optional[str]:
    if _blank(value):
        return None
    text = str(value).strip().lower()
    if text not in MARITAL_STATUSES:
        raise ValueError("Choose a marital status from the list.")
    return text


MAX_EMERGENCY_CONTACTS = 5


def _last10(phone: str) -> str:
    return re.sub(r"\D", "", phone)[-10:]


def emergency_contacts(value):
    """The list of emergency contacts, checked and cleaned. Each needs a name, relationship, valid phone and address; the
    same person (same name and relationship) or the same phone number cannot be listed twice; at most one is primary."""
    from app.core.phone import normalize_phone
    if value is None:
        return None
    if not isinstance(value, list):
        raise ValueError("Emergency contacts must be a list.")
    if len(value) > MAX_EMERGENCY_CONTACTS:
        raise ValueError(f"You can add at most {MAX_EMERGENCY_CONTACTS} emergency contacts.")
    out, seen_people, seen_phones = [], {}, {}
    for pos, raw in enumerate(value, start=1):
        if not isinstance(raw, dict):
            raise ValueError(f"Contact {pos} is not valid.")
        name = person_text(raw.get("name"), "Contact name", 100)
        if not name:
            raise ValueError(f"Contact {pos}: name is required.")
        label = name
        relationship = person_text(raw.get("relationship"), "Relationship", 50)
        if not relationship:
            raise ValueError(f"{label}: relationship is required.")
        try:
            primary = normalize_phone(raw.get("primaryPhone"))
            alternate = normalize_phone(raw.get("alternatePhone"))
        except ValueError as e:
            raise ValueError(f"{label}: {e}") from None
        if not primary:
            raise ValueError(f"{label}: primary phone is required.")
        address = free_text(raw.get("address"), "Address", 500)
        if not address:
            raise ValueError(f"{label}: home address is required.")
        if alternate and _last10(alternate) == _last10(primary):
            raise ValueError(f"{label}: the alternate phone cannot be the same as the primary phone.")
        person = (" ".join(name.lower().split()), relationship.lower())
        if person in seen_people:
            raise ValueError(f"{label} ({relationship}) is already in your emergency contacts.")
        seen_people[person] = True
        for ph in filter(None, (primary, alternate)):
            owner = seen_phones.get(_last10(ph))
            if owner:
                raise ValueError(f"The phone number {ph} is already used for {owner}. Each emergency contact needs their own number.")
            seen_phones[_last10(ph)] = label
        out.append({**{k: v for k, v in raw.items() if k not in ("name", "relationship", "primaryPhone", "alternatePhone", "address")},
                    "name": name, "relationship": relationship, "primaryPhone": primary, "alternatePhone": alternate or "", "address": address,
                    "isPrimary": bool(raw.get("isPrimary"))})
    if sum(c["isPrimary"] for c in out) > 1:
        raise ValueError("Only one emergency contact can be the primary contact.")
    return out
