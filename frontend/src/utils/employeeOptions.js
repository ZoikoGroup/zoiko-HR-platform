// The people a form offers in a dropdown. The employees API answers with a plain list on some deployments and with
// { items: [...] } on others, and names arrive as fullName, full_name or first/last parts; every page reads them the
// same way so a dropdown is never empty just because of the response shape.
export function employeeList(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

export function employeeLabel(e) {
  const first = e.firstName || e.first_name;
  const last = e.lastName || e.last_name;
  return e.fullName || e.full_name || (first || last ? `${first || ""} ${last || ""}`.trim() : null) || e.email || `Employee #${e.id}`;
}

export function employeeOptions(res) {
  return employeeList(res).filter((e) => e && e.id != null).map((e) => ({ id: e.id, name: employeeLabel(e) }));
}
