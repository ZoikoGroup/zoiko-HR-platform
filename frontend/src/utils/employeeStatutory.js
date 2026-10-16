// Statutory & bank identifiers per country. The Add / Edit / View user forms always send the
// same backend fields (pan_number, uan_number, bank_account, bank_ifsc), but the label,
// placeholder and hint shown for each one follow the employee's registered country, so a US
// hire sees SSN + Routing number while an Indian hire sees PAN + UAN + IFSC.

const GENERIC = {
  pan_number: { label: "Tax identification number", placeholder: "As shown on the tax document" },
  uan_number: { label: "Social security / payroll reference", placeholder: "As shown on the payroll document" },
  bank_account: { label: "Bank account number", placeholder: "e.g. 000111222333" },
  bank_ifsc: { label: "Bank branch / routing code", placeholder: "Branch or routing code for the bank" },
};

const ORDER = ["pan_number", "uan_number", "bank_account", "bank_ifsc"];

// Only the label/placeholder change per country; the backend field names never do. Generated from the backend's
// app/modules/employee/import_countries.py (the same 20 countries the import templates cover) - keep them in step.
const BY_COUNTRY = {
  "india": {
    pan_number: { label: "PAN", placeholder: "e.g. ABCDE1234F" },
    uan_number: { label: "UAN", placeholder: "e.g. 101234567890" },
    bank_account: { label: "Bank account number", placeholder: "e.g. 12345678901" },
    bank_ifsc: { label: "IFSC code", placeholder: "e.g. SBIN0001234" },
  },
  "bharat": "india",
  "united states": {
    pan_number: { label: "SSN", placeholder: "e.g. 123-45-6789" },
    uan_number: { label: "State payroll ID (optional)", placeholder: "If applicable" },
    bank_account: { label: "Bank account number", placeholder: "e.g. 000123456789" },
    bank_ifsc: { label: "Routing number", placeholder: "e.g. 021000021" },
  },
  "usa": "united states",
  "us": "united states",
  "united states of america": "united states",
  "america": "united states",
  "united kingdom": {
    pan_number: { label: "National Insurance number", placeholder: "e.g. QQ 12 34 56 C" },
    uan_number: { label: "Payroll reference (optional)", placeholder: "If applicable" },
    bank_account: { label: "Bank account number", placeholder: "e.g. 12345678" },
    bank_ifsc: { label: "Sort code", placeholder: "e.g. 12-34-56" },
  },
  "uk": "united kingdom",
  "great britain": "united kingdom",
  "britain": "united kingdom",
  "england": "united kingdom",
  "canada": {
    pan_number: { label: "SIN", placeholder: "e.g. 123 456 789" },
    uan_number: { label: "Payroll reference (optional)", placeholder: "If applicable" },
    bank_account: { label: "Bank account number", placeholder: "e.g. 1234567" },
    bank_ifsc: { label: "Transit + institution number", placeholder: "e.g. 12345-678" },
  },
  "australia": {
    pan_number: { label: "TFN", placeholder: "e.g. 123 456 782" },
    uan_number: { label: "Super fund member number (optional)", placeholder: "If applicable" },
    bank_account: { label: "Bank account number", placeholder: "e.g. 12345678" },
    bank_ifsc: { label: "BSB", placeholder: "e.g. 062-000" },
  },
  "germany": {
    pan_number: { label: "Tax ID (Steuer-ID)", placeholder: "e.g. 12345678901" },
    uan_number: { label: "Social insurance number (SV-Nummer)", placeholder: "e.g. 65120350M532" },
    bank_account: { label: "IBAN", placeholder: "e.g. DE89 3704 0044 0532 0130 00" },
    bank_ifsc: { label: "BIC (optional)", placeholder: "e.g. COBADEFFXXX" },
  },
  "deutschland": "germany",
  "france": {
    pan_number: { label: "Social security number (NIR)", placeholder: "e.g. 1 84 12 75 123 456 10" },
    uan_number: { label: "Payroll number (matricule, optional)", placeholder: "If applicable" },
    bank_account: { label: "IBAN", placeholder: "e.g. FR76 3000 6000 0112 3456 7890 189" },
    bank_ifsc: { label: "BIC (optional)", placeholder: "e.g. BNPAFRPP" },
  },
  "united arab emirates": {
    pan_number: { label: "Emirates ID", placeholder: "e.g. 784-1990-1234567-1" },
    uan_number: { label: "Labour card number (optional)", placeholder: "If applicable" },
    bank_account: { label: "IBAN", placeholder: "e.g. AE07 0331 2345 6789 0123 456" },
    bank_ifsc: { label: "SWIFT / BIC (optional)", placeholder: "e.g. NBADAEAAXXX" },
  },
  "uae": "united arab emirates",
  "emirates": "united arab emirates",
  "dubai": "united arab emirates",
  "abu dhabi": "united arab emirates",
  "singapore": {
    pan_number: { label: "NRIC / FIN", placeholder: "e.g. S1234567D" },
    uan_number: { label: "CPF account number (optional)", placeholder: "If applicable" },
    bank_account: { label: "Bank account number", placeholder: "e.g. 123-45678-9" },
    bank_ifsc: { label: "Bank + branch code", placeholder: "e.g. 7171-001" },
  },
  "netherlands": {
    pan_number: { label: "BSN (citizen service number)", placeholder: "e.g. 123456782" },
    uan_number: { label: "Personnel number (optional)", placeholder: "If applicable" },
    bank_account: { label: "IBAN", placeholder: "e.g. NL91 ABNA 0417 1643 00" },
    bank_ifsc: { label: "BIC (optional)", placeholder: "e.g. ABNANL2A" },
  },
  "holland": "netherlands",
  "the netherlands": "netherlands",
  "spain": {
    pan_number: { label: "DNI / NIE", placeholder: "e.g. 12345678Z" },
    uan_number: { label: "Social security number (NUSS)", placeholder: "e.g. 28 12345678 40" },
    bank_account: { label: "IBAN", placeholder: "e.g. ES91 2100 0418 4502 0005 1332" },
    bank_ifsc: { label: "BIC (optional)", placeholder: "e.g. CAIXESBBXXX" },
  },
  "espana": "spain",
  "italy": {
    pan_number: { label: "Codice fiscale", placeholder: "e.g. RSSMRA85T10A562S" },
    uan_number: { label: "INPS number (optional)", placeholder: "If applicable" },
    bank_account: { label: "IBAN", placeholder: "e.g. IT60 X054 2811 1010 0000 0123 456" },
    bank_ifsc: { label: "BIC (optional)", placeholder: "e.g. BCITITMM" },
  },
  "italia": "italy",
  "ireland": {
    pan_number: { label: "PPS number", placeholder: "e.g. 1234567FA" },
    uan_number: { label: "Payroll number (optional)", placeholder: "If applicable" },
    bank_account: { label: "IBAN", placeholder: "e.g. IE29 AIBK 9311 5212 3456 78" },
    bank_ifsc: { label: "BIC (optional)", placeholder: "e.g. AIBKIE2D" },
  },
  "eire": "ireland",
  "japan": {
    pan_number: { label: "My Number (individual number)", placeholder: "e.g. 123456789018" },
    uan_number: { label: "Basic pension number (optional)", placeholder: "e.g. 1234-567890" },
    bank_account: { label: "Bank account number", placeholder: "e.g. 1234567" },
    bank_ifsc: { label: "Bank + branch code", placeholder: "e.g. 0001-001" },
  },
  "nippon": "japan",
  "china": {
    pan_number: { label: "Resident identity card number", placeholder: "e.g. 11010519491231002X" },
    uan_number: { label: "Social insurance number (optional)", placeholder: "If applicable" },
    bank_account: { label: "Bank card number", placeholder: "e.g. 6222021234567890123" },
    bank_ifsc: { label: "CNAPS bank code", placeholder: "e.g. 102100099996" },
  },
  "prc": "china",
  "people's republic of china": "china",
  "brazil": {
    pan_number: { label: "CPF", placeholder: "e.g. 123.456.789-09" },
    uan_number: { label: "PIS / PASEP", placeholder: "e.g. 120.12345.67-8" },
    bank_account: { label: "Account number (conta)", placeholder: "e.g. 12345-6" },
    bank_ifsc: { label: "Bank code + agency (ag\u00eancia)", placeholder: "e.g. 001-1234" },
  },
  "brasil": "brazil",
  "mexico": {
    pan_number: { label: "RFC", placeholder: "e.g. GODE561231GR8" },
    uan_number: { label: "IMSS social security number (NSS)", placeholder: "e.g. 12345678901" },
    bank_account: { label: "CLABE (18 digits)", placeholder: "e.g. 002010077777777771" },
    bank_ifsc: { label: "Bank code (optional)", placeholder: "e.g. 002" },
  },
  "mexico city": "mexico",
  "south africa": {
    pan_number: { label: "SARS income tax number", placeholder: "e.g. 0123456789" },
    uan_number: { label: "UIF reference (optional)", placeholder: "If applicable" },
    bank_account: { label: "Bank account number", placeholder: "e.g. 62123456789" },
    bank_ifsc: { label: "Branch code", placeholder: "e.g. 250655" },
  },
  "rsa": "south africa",
  "saudi arabia": {
    pan_number: { label: "National ID / Iqama number", placeholder: "e.g. 1012345678" },
    uan_number: { label: "GOSI number (optional)", placeholder: "If applicable" },
    bank_account: { label: "IBAN", placeholder: "e.g. SA03 8000 0000 6080 1016 7519" },
    bank_ifsc: { label: "SWIFT / BIC (optional)", placeholder: "e.g. RJHISARI" },
  },
  "ksa": "saudi arabia",
  "new zealand": {
    pan_number: { label: "IRD number", placeholder: "e.g. 123-456-789" },
    uan_number: { label: "KiwiSaver reference (optional)", placeholder: "If applicable" },
    bank_account: { label: "Bank account number", placeholder: "e.g. 12-3456-7890123-00" },
    bank_ifsc: { label: "Bank + branch number", placeholder: "e.g. 12-3456" },
  },
  "nz": "new zealand",
  "aotearoa": "new zealand",
};

function normalizeCountry(country) {
  return String(country || "").trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}

function configFor(country) {
  const hit = BY_COUNTRY[normalizeCountry(country)];
  if (!hit) return null;
  return typeof hit === "string" ? BY_COUNTRY[hit] : hit;
}

/** { label, placeholder } for a statutory backend field in the employee's country. */
export function statutoryField(name, country) {
  const cfg = configFor(country);
  if (cfg && cfg[name]) return cfg[name];
  return GENERIC[name] || null;
}

/** The four statutory fields in form order, labelled for the country. */
export function statutoryFields(country) {
  return ORDER.map((name) => ({ name, ...statutoryField(name, country) }));
}
