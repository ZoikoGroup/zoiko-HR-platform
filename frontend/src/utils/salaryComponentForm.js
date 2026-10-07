// Add / Edit Salary Component: the same rules as the server (backend/app/modules/hr/schemas.py).
// The default amount is required: every salary structure starts from it, so it can never be left blank.
export const EMPTY_COMPONENT = { name: "", component_type: "earning", is_taxable: true, default_amount: "", description: "" };

export const COMPONENT_LABELS = { name: "Component name", component_type: "Type", default_amount: "Default amount", description: "Description" };

export function componentToForm(item) {
  const amount = item.default_amount;
  return {
    name: item.name || "",
    component_type: item.component_type || "earning",
    is_taxable: item.is_taxable ?? true,
    default_amount: amount == null || amount === "" ? "" : String(Number(amount)),
    description: item.description || "",
  };
}

/** { field: message } for everything wrong with the form; empty when it can be saved. */
export function validateComponentForm(f) {
  const errors = {};
  const name = String(f.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) errors.name = "Component name is required.";
  else if (name.length > 100) errors.name = "Component name can be at most 100 characters.";
  if (!["earning", "deduction"].includes(f.component_type)) errors.component_type = "Type must be Earning or Deduction.";

  const raw = String(f.default_amount ?? "").trim();
  if (!raw) errors.default_amount = "Default amount is required.";
  else if (!/^\d+(\.\d+)?$/.test(raw)) errors.default_amount = "Default amount must be a positive number.";
  else if (Number(raw) <= 0) errors.default_amount = "Default amount must be greater than 0.";
  else if (Number(raw) > 99999999.99) errors.default_amount = "Default amount is too large (the most is 99,999,999.99).";
  else if (!/^\d+(\.\d{1,2})?$/.test(raw)) errors.default_amount = "Default amount can have at most 2 decimal places.";

  if (String(f.description ?? "").trim().length > 2000) errors.description = "Description can be at most 2000 characters.";
  return errors;
}

export function componentPayload(f) {
  const description = String(f.description ?? "").trim();
  return {
    name: String(f.name).trim().replace(/\s+/g, " "),
    component_type: f.component_type,
    is_taxable: !!f.is_taxable,
    default_amount: Number(String(f.default_amount).trim()),
    description: description === "" ? null : description,
  };
}

/** The amount as shown in the list; an old component saved without one is flagged instead of shown as a dash. */
export function amountText(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : null;
}

export function serverComponentErrors(detail) {
  const out = {};
  if (!Array.isArray(detail)) return out;
  for (const item of detail) {
    const key = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
    if (typeof key !== "string" || key === "body" || out[key]) continue;
    const msg = typeof item?.msg === "string" ? item.msg : "";
    if (/^value error,\s*/i.test(msg)) out[key] = msg.replace(/^value error,\s*/i, "");
    else if (/^field required$/i.test(msg)) out[key] = `${COMPONENT_LABELS[key] || key} is required.`;
    else out[key] = `${COMPONENT_LABELS[key] || key} is not valid.`;
  }
  return out;
}
