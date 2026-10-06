// Reading a holiday list the user gives us (CSV / Excel file, or pasted JSON / CSV text) into rows the
// import endpoint understands, and checking each row so problems are shown BEFORE anything is sent.

export const HOLIDAY_TYPES = { public: "Public", company: "Company", optional: "Optional" };
export const TEMPLATE_CSV = "Name,Date,Type,Description,Recurring\nNew Year's Day,2027-01-01,Public,Office closed,yes\nFounders Day,2027-03-10,Company,,no\n";
export const MAX_ROWS = 1000;

const KEY_ALIASES = {
  name: ["name", "holiday", "holiday name", "title", "occasion"],
  date: ["date", "holiday date", "day"],
  type: ["type", "category", "holiday type"],
  description: ["description", "notes", "note", "details"],
  is_recurring: ["recurring", "is_recurring", "is recurring", "repeats", "repeat yearly", "yearly"],
};

const pad = (n) => String(n).padStart(2, "0");

/** Excel stores dates as serial numbers (days since 1899-12-30). Done in UTC so the day never shifts. */
export function excelSerialToIso(serial) {
  const ms = Math.round((Number(serial) - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Any of ISO, day-first (31/12/2027, 31-12-2027, 31.12.2027), a Date, or an Excel serial -> "YYYY-MM-DD" or "". */
export function normalizeDate(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  if (typeof value === "number") return value > 20000 && value < 80000 ? excelSerialToIso(value) : "";
  const text = String(value).trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text);
  let y; let mo; let d;
  if (m) { [y, mo, d] = [m[1], m[2], m[3]]; }
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text))) { [d, mo, y] = [m[1], m[2], m[3]]; }
  else return "";
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  const real = dt.getUTCFullYear() === Number(y) && dt.getUTCMonth() === Number(mo) - 1 && dt.getUTCDate() === Number(d);
  return real ? `${y}-${pad(mo)}-${pad(d)}` : "";
}

const truthy = (v) => ["1", "true", "yes", "y", "recurring"].includes(String(v ?? "").trim().toLowerCase());

/** Map a row with arbitrary header spellings to {name, date, type, description, is_recurring}. */
export function canonicalRow(raw) {
  const lowered = {};
  Object.entries(raw || {}).forEach(([k, v]) => { lowered[String(k).trim().toLowerCase()] = v; });
  const pick = (key) => {
    for (const alias of KEY_ALIASES[key]) if (lowered[alias] !== undefined && lowered[alias] !== "") return lowered[alias];
    return undefined;
  };
  const type = String(pick("type") ?? "Public").trim() || "Public";
  return {
    name: String(pick("name") ?? "").trim(),
    date: pick("date"),
    type,
    description: pick("description") == null ? "" : String(pick("description")).trim(),
    is_recurring: truthy(pick("is_recurring")),
  };
}

/** Split into rows ready to send and rows with a reason they cannot be. Nothing is dropped silently. */
export function validateRows(rawRows) {
  const valid = [];
  const problems = [];
  const seen = new Set();
  rawRows.forEach((raw, i) => {
    const row = canonicalRow(raw);
    const line = i + 1;
    const date = normalizeDate(row.date);
    const type = HOLIDAY_TYPES[row.type.toLowerCase()];
    if (!row.name) return problems.push({ row: line, name: "", error: "Name is required." });
    if (row.name.length > 150) return problems.push({ row: line, name: row.name.slice(0, 40), error: "Name is longer than 150 characters." });
    if (!date) return problems.push({ row: line, name: row.name, error: `Date "${row.date ?? ""}" is missing or not a real date (use YYYY-MM-DD).` });
    if (!type) return problems.push({ row: line, name: row.name, error: `Type "${row.type}" must be Public, Company or Optional.` });
    const key = `${date}|${row.name.toLowerCase()}`;
    if (seen.has(key)) return problems.push({ row: line, name: row.name, error: "Listed twice in this file." });
    seen.add(key);
    valid.push({ name: row.name, date, type, description: row.description, is_recurring: row.is_recurring, _row: line });
  });
  return { valid, problems };
}

/** Pasted text: a JSON array (or {holidays: []}), otherwise CSV with a header row. */
export async function parseHolidayText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Choose a file or paste your holidays first.");
  if (trimmed[0] === "[" || trimmed[0] === "{") {
    let parsed;
    try { parsed = JSON.parse(trimmed); } catch (e) { throw new Error(`That is not valid JSON (${e.message}). Check for a missing comma or quote, or paste CSV instead.`); }
    const rows = Array.isArray(parsed) ? parsed : parsed?.holidays;
    if (!Array.isArray(rows)) throw new Error('Paste a JSON list of holidays, or an object like {"holidays": [...]}.');
    return rows;
  }
  const XLSX = await import("xlsx");
  const wb = XLSX.read(trimmed, { type: "string", raw: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}

/** An uploaded .csv / .xlsx / .xls file -> raw rows (first sheet, first row is the header). */
export async function parseHolidayFile(file) {
  if (!file) throw new Error("Choose a file first.");
  if (!/\.(csv|xlsx|xls)$/i.test(file.name || "")) throw new Error("Upload a .csv, .xlsx or .xls file.");
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("The file has no sheets.");
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  if (!rows.length) throw new Error("The file has no rows below the header.");
  return rows;
}
