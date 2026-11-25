/**
 * The documents an organisation usually asks new hires for, by category (Set up docs → Documents to collect, QA bug 14).
 * They are suggestions for the two dropdowns; an organisation can still type its own category or document.
 * Names are general; a country's own documents (e.g. Aadhaar, PAN, SSN card) are listed where they are common.
 */
export const DOCUMENT_REQUEST_CHOICES = [
  { category: "Identity proof", documents: ["Passport", "National ID card", "Aadhaar card", "Driving licence", "Voter ID card", "Residence permit"] },
  { category: "Address proof", documents: ["Utility bill (last 3 months)", "Rental / lease agreement", "Bank statement with address", "Passport", "Aadhaar card"] },
  { category: "Educational documents", documents: ["Degree certificate", "Provisional certificate", "Marksheets / transcripts", "Diploma certificate", "School leaving certificate", "Professional certification"] },
  { category: "Previous employment", documents: ["Relieving letter", "Experience letter", "Last 3 payslips", "Previous offer letter", "Service certificate"] },
  { category: "Tax documents", documents: ["PAN card", "Tax ID / TIN", "Previous employer tax statement (Form 16)", "Tax declaration form"] },
  { category: "Bank details", documents: ["Cancelled cheque", "Bank passbook (first page)", "Bank statement", "Bank account letter"] },
  { category: "Photographs", documents: ["Passport-size photograph", "Digital photo for the ID badge"] },
  { category: "Medical", documents: ["Medical fitness certificate", "Vaccination record", "Health insurance details"] },
  { category: "Work authorisation", documents: ["Work permit / visa", "Right-to-work document", "Residence card"] },
  { category: "Emergency and family", documents: ["Emergency contact form", "Nominee declaration", "Marriage certificate", "Birth certificate of dependants"] },
];

/** Category options: the standard list, plus any category already used on this page (so it can be picked again). */
export function categoryOptions(extra = []) {
  const seen = new Set();
  const out = [];
  for (const name of [...DOCUMENT_REQUEST_CHOICES.map((c) => c.category), ...extra]) {
    const label = String(name || "").trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push({ value: label, label });
  }
  return out;
}

/** "What to upload" options for a category (any letter case); a category not on the list gets every document. */
export function documentOptions(category) {
  const key = String(category || "").trim().toLowerCase();
  const hit = DOCUMENT_REQUEST_CHOICES.find((c) => c.category.toLowerCase() === key);
  const names = hit ? hit.documents : [...new Set(DOCUMENT_REQUEST_CHOICES.flatMap((c) => c.documents))];
  return names.map((d) => ({ value: d, label: d }));
}
