// Who a travel request or expense belongs to. The server sends `employee_name`; an employee object or a lookup by id
// are fallbacks. A person is never shown as "Unknown": at worst the page shows "Employee #id".
export function staffName(row, employeesById = {}) {
  if (!row) return "Unknown";
  if (typeof row.employee_name === "string" && row.employee_name.trim()) return row.employee_name.trim();
  const emp = row.employee && typeof row.employee === "object" ? row.employee : employeesById[row.employee_id];
  if (typeof row.employee === "string" && row.employee.trim()) return row.employee.trim();
  if (emp) {
    const full = `${emp.first_name || emp.firstName || ""} ${emp.last_name || emp.lastName || ""}`.trim();
    const name = full || emp.full_name || emp.fullName || emp.name || emp.email;
    if (name) return name;
  }
  return row.employee_id != null ? `Employee #${row.employee_id}` : "Unknown";
}

export function indexById(list) {
  const out = {};
  for (const e of Array.isArray(list) ? list : []) if (e && e.id != null) out[e.id] = e;
  return out;
}

/** A list answer from the server as one page: the paged form {items, total, page, per_page} or a plain list. */
export function asPage(res, page = 1, perPage = 25) {
  if (Array.isArray(res)) return { items: res, total: res.length, page, per_page: perPage };
  const items = Array.isArray(res?.items) ? res.items : [];
  return { ...res, items, total: Number.isFinite(res?.total) ? res.total : items.length, page: res?.page || page, per_page: res?.per_page || perPage };
}
