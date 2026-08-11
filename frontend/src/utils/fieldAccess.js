// Field-access helpers for API responses that mix camelCase / snake_case keys.
// The backend serializes some models with camelCase aliases (e.g. EmployeeResponse)
// while legacy endpoints return snake_case. These helpers read the first key that
// is actually present on the object so the UI never renders "undefined".

export function pick(obj, ...names) {
  if (!obj) return undefined;
  for (const n of names) {
    if (obj[n] !== undefined && obj[n] !== null) return obj[n];
  }
  return undefined;
}

export function employeeName(emp, fallback = "—") {
  if (!emp) return fallback;
  return pick(
    emp,
    "full_name",
    "fullName",
    "display_name",
    "displayName",
    "name"
  )
    || [pick(emp, "first_name", "firstName"), pick(emp, "last_name", "lastName")]
        .filter(Boolean)
        .join(" ")
    || fallback;
}

export function employeeInitials(emp, fallback = "??") {
  if (!emp) return fallback;
  const name = employeeName(emp, "");
  if (name) {
    const initials = name.split(" ").map((w) => w?.[0]).filter(Boolean).join("").toUpperCase().slice(0, 2);
    if (initials) return initials;
  }
  const first = pick(emp, "first_name", "firstName", "");
  const last = pick(emp, "last_name", "lastName", "");
  const combined = `${first}${last}`.toUpperCase().slice(0, 2);
  return combined || fallback;
}

export function employeeEmail(emp) {
  return pick(emp, "email", "work_email", "official_email");
}
