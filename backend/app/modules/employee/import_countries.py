"""Employee import templates for the 20 main countries.

Every country maps its own identifiers onto the same four employee fields, so one import handles all of them:

    pan_number    the personal tax / national ID   (PAN, SSN, NI number, SIN, TFN, Steuer-ID, BSN, CPF, RFC, ...)
    uan_number    the social-security / payroll ref (UAN, SV-Nummer, NUSS, PIS, NSS, GOSI, ...)
    bank_account  the account number or IBAN
    bank_ifsc     the bank / branch / routing code  (IFSC, routing number, sort code, BSB, BIC, CLABE bank, ...)

Each country's column headings are registered with the import's header map (see register_headers), so a filled-in
template reads back into the right fields. A heading never means two different fields: this is checked at import time.
The frontend mirrors the labels in src/utils/employeeStatutory.js (generated from this table).
"""
from __future__ import annotations

FIELDS = ("pan_number", "uan_number", "bank_account", "bank_ifsc")


def _c(name, currency, aliases, ids, person, money, place):
    """ids: {field: (column heading, form label, example)}"""
    return {"name": name, "currency": currency, "aliases": aliases, "ids": ids, "person": person, "money": money, "place": place}


COUNTRIES = [
    _c("India", "INR", ["bharat"], {
        "pan_number": ("PAN Number", "PAN", "ABCDE1234F"),
        "uan_number": ("UAN", "UAN", "101234567890"),
        "bank_account": ("Bank Account Number", "Bank account number", "12345678901"),
        "bank_ifsc": ("IFSC Code", "IFSC code", "SBIN0001234"),
    }, ("Rahul", "Mehta", "+91-9876543210"), ("75000", "180000", "1200000"),
       ("123 MG Road, Andheri East", "Mumbai", "Maharashtra", "400069")),
    _c("United States", "USD", ["usa", "us", "united states of america", "america"], {
        "pan_number": ("SSN", "SSN", "123-45-6789"),
        "uan_number": ("State Payroll ID", "State payroll ID (optional)", ""),
        "bank_account": ("Bank Account Number", "Bank account number", "000123456789"),
        "bank_ifsc": ("Routing Number", "Routing number", "021000021"),
    }, ("John", "Doe", "+1-415-555-0100"), ("80000", "0", "110000"),
       ("500 Howard St", "San Francisco", "California", "94105")),
    _c("United Kingdom", "GBP", ["uk", "great britain", "britain", "england"], {
        "pan_number": ("National Insurance Number", "National Insurance number", "QQ 12 34 56 C"),
        "uan_number": ("Payroll Reference", "Payroll reference (optional)", ""),
        "bank_account": ("Bank Account Number", "Bank account number", "12345678"),
        "bank_ifsc": ("Sort Code", "Sort code", "12-34-56"),
    }, ("Oliver", "Smith", "+44-7700-900123"), ("45000", "0", "60000"),
       ("10 High Street", "London", "England", "SW1A 1AA")),
    _c("Canada", "CAD", [], {
        "pan_number": ("SIN", "SIN", "123 456 789"),
        "uan_number": ("Employee Payroll Reference", "Payroll reference (optional)", ""),
        "bank_account": ("Bank Account Number", "Bank account number", "1234567"),
        "bank_ifsc": ("Transit Number", "Transit + institution number", "12345-678"),
    }, ("Liam", "Brown", "+1-416-555-0100"), ("75000", "0", "95000"),
       ("100 King St W", "Toronto", "Ontario", "M5X 1A9")),
    _c("Australia", "AUD", [], {
        "pan_number": ("TFN", "TFN", "123 456 782"),
        "uan_number": ("Super Reference", "Super fund member number (optional)", ""),
        "bank_account": ("Bank Account Number", "Bank account number", "12345678"),
        "bank_ifsc": ("BSB", "BSB", "062-000"),
    }, ("Jack", "Wilson", "+61-400-123-456"), ("90000", "0", "110000"),
       ("1 George St", "Sydney", "New South Wales", "2000")),
    _c("Germany", "EUR", ["deutschland"], {
        "pan_number": ("Steuer-ID", "Tax ID (Steuer-ID)", "12345678901"),
        "uan_number": ("SV-Nummer", "Social insurance number (SV-Nummer)", "65120350M532"),
        "bank_account": ("IBAN", "IBAN", "DE89 3704 0044 0532 0130 00"),
        "bank_ifsc": ("BIC", "BIC (optional)", "COBADEFFXXX"),
    }, ("Lukas", "Schmidt", "+49-170-1234567"), ("5000", "0", "75000"),
       ("Friedrichstrasse 1", "Berlin", "Berlin", "10117")),
    _c("France", "EUR", [], {
        "pan_number": ("NIR", "Social security number (NIR)", "1 84 12 75 123 456 10"),
        "uan_number": ("Matricule", "Payroll number (matricule, optional)", ""),
        "bank_account": ("IBAN", "IBAN", "FR76 3000 6000 0112 3456 7890 189"),
        "bank_ifsc": ("BIC", "BIC (optional)", "BNPAFRPP"),
    }, ("Louis", "Martin", "+33-6-12-34-56-78"), ("4500", "0", "70000"),
       ("1 Rue de Rivoli", "Paris", "Ile-de-France", "75001")),
    _c("United Arab Emirates", "AED", ["uae", "emirates", "dubai", "abu dhabi"], {
        "pan_number": ("Emirates ID", "Emirates ID", "784-1990-1234567-1"),
        "uan_number": ("Labour Card Number", "Labour card number (optional)", ""),
        "bank_account": ("IBAN", "IBAN", "AE07 0331 2345 6789 0123 456"),
        "bank_ifsc": ("SWIFT Code", "SWIFT / BIC (optional)", "NBADAEAAXXX"),
    }, ("Ahmed", "Khan", "+971-50-123-4567"), ("15000", "6000", "300000"),
       ("Sheikh Zayed Rd, Trade Centre", "Dubai", "Dubai", "")),
    _c("Singapore", "SGD", [], {
        "pan_number": ("NRIC", "NRIC / FIN", "S1234567D"),
        "uan_number": ("CPF Account Number", "CPF account number (optional)", ""),
        "bank_account": ("Bank Account Number", "Bank account number", "123-45678-9"),
        "bank_ifsc": ("Bank Branch Code", "Bank + branch code", "7171-001"),
    }, ("Wei", "Tan", "+65-8123-4567"), ("6000", "0", "90000"),
       ("1 Raffles Place", "Singapore", "Singapore", "048616")),
    _c("Netherlands", "EUR", ["holland", "the netherlands"], {
        "pan_number": ("BSN", "BSN (citizen service number)", "123456782"),
        "uan_number": ("Personnel Number", "Personnel number (optional)", ""),
        "bank_account": ("IBAN", "IBAN", "NL91 ABNA 0417 1643 00"),
        "bank_ifsc": ("BIC", "BIC (optional)", "ABNANL2A"),
    }, ("Daan", "de Vries", "+31-6-12345678"), ("4500", "0", "65000"),
       ("Damrak 1", "Amsterdam", "Noord-Holland", "1012 LG")),
    _c("Spain", "EUR", ["espana"], {
        "pan_number": ("DNI / NIE", "DNI / NIE", "12345678Z"),
        "uan_number": ("NUSS", "Social security number (NUSS)", "28 12345678 40"),
        "bank_account": ("IBAN", "IBAN", "ES91 2100 0418 4502 0005 1332"),
        "bank_ifsc": ("BIC", "BIC (optional)", "CAIXESBBXXX"),
    }, ("Lucia", "Garcia", "+34-612-345-678"), ("3000", "0", "42000"),
       ("Gran Via 1", "Madrid", "Comunidad de Madrid", "28013")),
    _c("Italy", "EUR", ["italia"], {
        "pan_number": ("Codice Fiscale", "Codice fiscale", "RSSMRA85T10A562S"),
        "uan_number": ("INPS Number", "INPS number (optional)", ""),
        "bank_account": ("IBAN", "IBAN", "IT60 X054 2811 1010 0000 0123 456"),
        "bank_ifsc": ("BIC", "BIC (optional)", "BCITITMM"),
    }, ("Marco", "Rossi", "+39-312-345-6789"), ("3200", "0", "45000"),
       ("Via Montenapoleone 1", "Milan", "Lombardy", "20121")),
    _c("Ireland", "EUR", ["eire"], {
        "pan_number": ("PPSN", "PPS number", "1234567FA"),
        "uan_number": ("Employee Payroll Number", "Payroll number (optional)", ""),
        "bank_account": ("IBAN", "IBAN", "IE29 AIBK 9311 5212 3456 78"),
        "bank_ifsc": ("BIC", "BIC (optional)", "AIBKIE2D"),
    }, ("Sean", "Murphy", "+353-85-123-4567"), ("4200", "0", "60000"),
       ("1 Grafton Street", "Dublin", "Co. Dublin", "D02 X285")),
    _c("Japan", "JPY", ["nippon"], {
        "pan_number": ("My Number", "My Number (individual number)", "123456789018"),
        "uan_number": ("Basic Pension Number", "Basic pension number (optional)", "1234-567890"),
        "bank_account": ("Bank Account Number", "Bank account number", "1234567"),
        "bank_ifsc": ("Bank and Branch Code", "Bank + branch code", "0001-001"),
    }, ("Haruto", "Sato", "+81-90-1234-5678"), ("400000", "0", "6000000"),
       ("1-1 Marunouchi, Chiyoda-ku", "Tokyo", "Tokyo", "100-0005")),
    _c("China", "CNY", ["prc", "people's republic of china"], {
        "pan_number": ("Resident ID Number", "Resident identity card number", "11010519491231002X"),
        "uan_number": ("Social Insurance Number", "Social insurance number (optional)", ""),
        "bank_account": ("Bank Card Number", "Bank card number", "6222021234567890123"),
        "bank_ifsc": ("CNAPS Code", "CNAPS bank code", "102100099996"),
    }, ("Wei", "Zhang", "+86-138-0013-8000"), ("20000", "0", "300000"),
       ("100 Century Ave, Pudong", "Shanghai", "Shanghai", "200120")),
    _c("Brazil", "BRL", ["brasil"], {
        "pan_number": ("CPF", "CPF", "123.456.789-09"),
        "uan_number": ("PIS / PASEP", "PIS / PASEP", "120.12345.67-8"),
        "bank_account": ("Bank Account Number", "Account number (conta)", "12345-6"),
        "bank_ifsc": ("Bank and Agency", "Bank code + agency (agência)", "001-1234"),
    }, ("Lucas", "Silva", "+55-11-91234-5678"), ("8000", "0", "120000"),
       ("Av. Paulista 1000", "Sao Paulo", "SP", "01310-100")),
    _c("Mexico", "MXN", ["mexico city"], {
        "pan_number": ("RFC", "RFC", "GODE561231GR8"),
        "uan_number": ("NSS", "IMSS social security number (NSS)", "12345678901"),
        "bank_account": ("CLABE", "CLABE (18 digits)", "002010077777777771"),
        "bank_ifsc": ("Bank Code", "Bank code (optional)", "002"),
    }, ("Diego", "Hernandez", "+52-55-1234-5678"), ("30000", "0", "450000"),
       ("Paseo de la Reforma 250", "Mexico City", "CDMX", "06600")),
    _c("South Africa", "ZAR", ["rsa"], {
        "pan_number": ("SARS Tax Number", "SARS income tax number", "0123456789"),
        "uan_number": ("UIF Reference", "UIF reference (optional)", ""),
        "bank_account": ("Bank Account Number", "Bank account number", "62123456789"),
        "bank_ifsc": ("Branch Code", "Branch code", "250655"),
    }, ("Thabo", "Nkosi", "+27-82-123-4567"), ("35000", "0", "520000"),
       ("1 Sandton Drive", "Johannesburg", "Gauteng", "2196")),
    _c("Saudi Arabia", "SAR", ["ksa"], {
        "pan_number": ("National ID / Iqama", "National ID / Iqama number", "1012345678"),
        "uan_number": ("GOSI Number", "GOSI number (optional)", ""),
        "bank_account": ("IBAN", "IBAN", "SA03 8000 0000 6080 1016 7519"),
        "bank_ifsc": ("SWIFT Code", "SWIFT / BIC (optional)", "RJHISARI"),
    }, ("Faisal", "Al-Harbi", "+966-50-123-4567"), ("15000", "3750", "250000"),
       ("King Fahd Rd, Olaya", "Riyadh", "Riyadh", "12214")),
    _c("New Zealand", "NZD", ["nz", "aotearoa"], {
        "pan_number": ("IRD Number", "IRD number", "123-456-789"),
        "uan_number": ("KiwiSaver Reference", "KiwiSaver reference (optional)", ""),
        "bank_account": ("Bank Account Number", "Bank account number", "12-3456-7890123-00"),
        "bank_ifsc": ("Bank and Branch Number", "Bank + branch number", "12-3456"),
    }, ("Aroha", "Williams", "+64-21-123-4567"), ("6000", "0", "85000"),
       ("1 Queen Street", "Auckland", "Auckland", "1010")),
]

BY_KEY: dict[str, dict] = {}
for _row in COUNTRIES:
    for _k in [_row["name"].lower(), *_row["aliases"]]:
        BY_KEY[_k] = _row

DEFAULT = BY_KEY["india"]          # no country chosen: the original template

# Any other country: international headings that still read back into the right fields.
GENERIC = _c("", "", [], {
    "pan_number": ("Tax ID", "Tax identification number", ""),
    "uan_number": ("Social Security / Payroll Reference", "Social security / payroll reference", ""),
    "bank_account": ("Bank Account Number", "Bank account number / IBAN", ""),
    "bank_ifsc": ("SWIFT Code", "Bank / branch / SWIFT code", ""),
}, ("Alex", "Doe", ""), ("", "", ""), ("", "", "", ""))


def for_country(country: str | None) -> dict:
    key = " ".join(str(country or "").strip().lower().replace("_", " ").split())
    if not key:
        return DEFAULT
    return BY_KEY.get(key) or {**GENERIC, "name": str(country).strip(), "currency": ""}


def register_headers(clean_header, clean_map: dict) -> None:
    """Teach the import every country's headings; refuse a heading that would mean two different fields."""
    for row in [*COUNTRIES, GENERIC]:
        for field, (header, _label, _example) in row["ids"].items():
            key = clean_header(header)
            existing = clean_map.get(key)
            if existing is not None and existing != field:
                raise RuntimeError(f"Import heading '{header}' ({row['name'] or 'generic'}) would mean both {existing} and {field}")
            clean_map[key] = field


def summary() -> list[dict]:
    """For the template picker: each country, its currency and the identifiers its template uses."""
    return [{"name": r["name"], "currency": r["currency"],
             "identifiers": [r["ids"][f][1] for f in ("pan_number", "uan_number", "bank_ifsc")]} for r in COUNTRIES]
