// How a candidate's details are shown. A value that was entered is always shown (including 0 years); only a value
// that was never entered shows the placeholder.

/** The text, or the placeholder when it is empty. */
export function shown(value, empty = "-") {
  const text = value == null ? "" : String(value).trim();
  return text === "" ? empty : text;
}

/** "5 yrs" or "1 yr"; 0 is a real answer and is shown as "0 yrs"; nothing entered shows the placeholder. */
export function experienceText(value, empty = "-") {
  if (value == null || value === "") return empty;
  const n = Number(value);
  if (!Number.isFinite(n)) return empty;
  return `${n} ${n === 1 ? "yr" : "yrs"}`;
}

const SOURCES = { referral: "Referral", linkedin: "LinkedIn", indeed: "Indeed", company_website: "Company Website", recruiter: "Recruiter", other: "Other" };

export function sourceLabel(value, empty = "-") {
  const key = String(value ?? "").trim();
  if (!key) return empty;
  return SOURCES[key.toLowerCase()] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

const csvCell = (v) => {
  const text = v == null ? "" : String(v);
  return `"${text.replace(/"/g, '""')}"`;
};

/** Headers + rows as CSV text; every cell is quoted, quotes are escaped, and 0 stays 0. */
export function candidateCsv(headers, rows) {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

/** What the record itself knows about this candidate's history, newest first. */
export function candidateTimeline(candidate) {
  const events = [];
  const add = (date, description) => { if (date) events.push({ date, description }); };
  add(candidate?.applied_at || candidate?.created_at, `Applied${candidate?.position ? ` for ${candidate.position}` : ""}`);
  if (candidate?.updated_at && candidate.updated_at !== (candidate.applied_at || candidate.created_at)) add(candidate.updated_at, "Details last updated");
  if (candidate?.onboarding_new_hire_id) add(candidate.updated_at || candidate.created_at, "Onboarding started");
  const fromServer = Array.isArray(candidate?.activity) ? candidate.activity : [];
  return [...fromServer, ...events].sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0));
}
