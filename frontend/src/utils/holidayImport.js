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
  else if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})$/.exec(text)) && monthNumber(m[2])) { [d, mo, y] = [m[1], monthNumber(m[2]), m[3]]; }
  else if ((m = /^([A-Za-z]{3,9})\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s-]+(\d{4})$/.exec(text)) && monthNumber(m[1])) { [mo, d, y] = [monthNumber(m[1]), m[2], m[3]]; }
  else return "";
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  const real = dt.getUTCFullYear() === Number(y) && dt.getUTCMonth() === Number(mo) - 1 && dt.getUTCDate() === Number(d);
  return real ? `${y}-${pad(mo)}-${pad(d)}` : "";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function monthNumber(word) {
  const i = MONTHS.indexOf(String(word).toLowerCase().slice(0, 3));
  return i === -1 ? 0 : i + 1;
}

// Holidays that fall on the same day every year. Typing just a name and a year ("New Year, 2027, Public") is
// enough for these; the preview shows the date that was filled in so it can be checked before importing.
const FIXED_DATE_HOLIDAYS = [
  [/^new year(?:'?s)?(?: day)?$/i, "01-01"],
  [/^republic day$/i, "01-26"],
  [/^(?:may day|labou?r day|international workers'? day)$/i, "05-01"],
  [/^independence day$/i, "08-15"],
  [/^gandhi jayanti$/i, "10-02"],
  [/^christmas(?: day)?$/i, "12-25"],
  [/^christmas eve$/i, "12-24"],
  [/^new year'?s eve$/i, "12-31"],
];

/** "YYYY-MM-DD" for a well-known fixed-date holiday in `year`, or "" when the name is not one of them. */
export function knownHolidayDate(name, year) {
  const hit = FIXED_DATE_HOLIDAYS.find(([re]) => re.test(String(name || "").trim()));
  return hit ? `${year}-${hit[1]}` : "";
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
    let date = normalizeDate(row.date);
    let assumed = false;
    const bareYear = /^\d{4}$/.test(String(row.date ?? "").trim());
    if (!date && bareYear && row.name) {
      date = knownHolidayDate(row.name, String(row.date).trim());
      assumed = Boolean(date);
    }
    const type = HOLIDAY_TYPES[row.type.toLowerCase()];
    if (!row.name) return problems.push({ row: line, name: "", error: "Name is required." });
    if (row.name.length > 150) return problems.push({ row: line, name: row.name.slice(0, 40), error: "Name is longer than 150 characters." });
    if (!date && bareYear) return problems.push({ row: line, name: row.name, error: `"${row.date}" is only a year. Enter the full date, for example ${row.date}-01-01.` });
    if (!date) return problems.push({ row: line, name: row.name, error: `Date "${row.date ?? ""}" is missing or not a real date (use YYYY-MM-DD, or a date like 1 Jan 2027).` });
    if (!type) return problems.push({ row: line, name: row.name, error: `Type "${row.type}" must be Public, Company or Optional.` });
    const key = `${date}|${row.name.toLowerCase()}`;
    if (seen.has(key)) return problems.push({ row: line, name: row.name, error: "Listed twice in this file." });
    seen.add(key);
    valid.push({ name: row.name, date, type, description: row.description, is_recurring: row.is_recurring, _row: line, _assumed: assumed });
  });
  return { valid, problems };
}

const HEADER_WORDS = new Set(Object.values(KEY_ALIASES).flat());
const POSITIONAL_COLUMNS = ["name", "date", "type", "description", "recurring"];

/** Split pasted text into rows of cells. The delimiter (comma, semicolon, tab or pipe) is the one the first
 *  line uses most; double quotes protect a delimiter or a newline inside a cell. */
export function parseDelimited(text) {
  const src = String(text || "").replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  const firstLine = src.split("\n").find((l) => l.trim()) || "";
  const delimiter = [",", ";", "\t", "|"].map((d) => [d, firstLine.split(d).length - 1]).sort((a, b) => b[1] - a[1])[0];
  const sep = delimiter && delimiter[1] > 0 ? delimiter[0] : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n") { row.push(cell.trim()); cell = ""; rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** A table of cells -> one object per holiday. The first row is a header only if it names columns (Name, Date,
 *  ...); otherwise every row is a holiday in the order Name, Date, Type, Description, Recurring. */
export function rowsFromTable(table) {
  if (!table.length) return [];
  const hasHeader = table[0].some((c) => HEADER_WORDS.has(String(c).trim().toLowerCase()));
  const columns = hasHeader ? table[0].map((c) => String(c).trim()) : POSITIONAL_COLUMNS;
  return table.slice(hasHeader ? 1 : 0).map((cells) => Object.fromEntries(columns.map((c, i) => [c, cells[i] ?? ""])));
}

/** Pasted text: a JSON array (or {holidays: []}), otherwise delimited text with or without a header row. */
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
  return rowsFromTable(parseDelimited(trimmed));
}

/** An uploaded .csv / .xlsx / .xls file -> raw rows (first sheet; a header row is optional). */
export async function parseHolidayFile(file) {
  if (!file) throw new Error("Choose a file first.");
  if (!/\.(csv|xlsx|xls)$/i.test(file.name || "")) throw new Error("Upload a .csv, .xlsx or .xls file.");
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("The file has no sheets.");
  const table = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true }).filter((r) => r.some((c) => String(c).trim() !== ""));
  const rows = rowsFromTable(table);
  if (!rows.length) throw new Error("The file has no holidays in it. Add a row with a name and a date.");
  return rows;
}
