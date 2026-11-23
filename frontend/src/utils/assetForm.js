// Shared create / edit rules for an asset (QA R1-19, R1-20). Both asset screens (Organization Admin → Assets and
// Zoiko HR → Assets → Inventory) build their form, payload and checks from here, and the server applies the same rules.
//
// Who holds an asset is changed only by Assign / Transfer / Return, never by Edit: the edit payload carries no
// employee_id or assigned_date, and an assigned asset keeps its "assigned" status until it is returned.

export const ASSET_STATUS_OPTIONS = ["available", "assigned", "maintenance", "retired", "lost"];
export const ASSET_CONDITION_OPTIONS = ["new", "good", "fair", "poor", "damaged"];

export const EMPTY_ASSET_FORM = {
  name: "", assetTag: "", category: "", serialNumber: "", department: "",
  status: "available", condition: "new", purchaseDate: "", purchasePrice: "", notes: "", employee_id: "",
};

const pick = (...values) => {
  for (const v of values) if (v !== undefined && v !== null) return v;
  return "";
};

export function isAssetAssigned(asset) {
  if (!asset) return false;
  return asset.status === "assigned" || (asset.employee_id ?? asset.employeeId) != null;
}

/** The form values for editing an existing asset (server rows use snake_case). */
export function assetToForm(asset) {
  if (!asset) return { ...EMPTY_ASSET_FORM };
  const price = pick(asset.purchase_cost, asset.purchasePrice, asset.purchase_price);
  return {
    ...EMPTY_ASSET_FORM,
    name: pick(asset.name, asset.itemName),
    assetTag: pick(asset.asset_tag, asset.assetTag),
    category: pick(asset.category),
    serialNumber: pick(asset.serial_number, asset.serialNumber),
    department: pick(asset.department, asset.department_name),
    status: pick(asset.status) || "available",
    condition: pick(asset.condition) || "new",
    purchaseDate: String(pick(asset.purchase_date, asset.purchaseDate)).slice(0, 10),
    purchasePrice: price === "" ? "" : String(price),
    notes: pick(asset.notes),
  };
}

/** Status choices for the form: an assigned asset stays "assigned" (return it first); otherwise "assigned" is set by
 *  Assign, not by picking it here. */
export function assetStatusOptions(asset) {
  if (asset && isAssetAssigned(asset)) return ["assigned"];
  return ASSET_STATUS_OPTIONS.filter((s) => s !== "assigned");
}

const norm = (v) => String(v ?? "").trim();

/** Field errors, keyed like the form. `assets` (optional) is the list already loaded, for an early duplicate-tag hint;
 *  the server is the final word on uniqueness. */
export function validateAssetForm(form, { assets = [], editingId = null } = {}) {
  const errors = {};
  const name = norm(form.name);
  const tag = norm(form.assetTag);
  if (!name) errors.name = "Name is required";
  else if (name.length > 150) errors.name = "Name must be 150 characters or fewer";
  if (!tag) errors.assetTag = "Asset tag is required";
  else if (tag.length > 100) errors.assetTag = "Asset tag must be 100 characters or fewer";
  else if (assets.some((a) => a && a.id !== editingId && norm(a.asset_tag ?? a.assetTag) === tag)) {
    errors.assetTag = "An asset with this tag already exists in this organization.";
  }
  if (norm(form.serialNumber).length > 200) errors.serialNumber = "Serial number must be 200 characters or fewer";
  if (form.purchasePrice !== "" && form.purchasePrice != null) {
    const n = Number(form.purchasePrice);
    if (!Number.isFinite(n) || n < 0) errors.purchasePrice = "Enter a price of 0 or more";
  }
  return errors;
}

/** The request body. mode "create" may carry the status chosen; "edit" never touches who holds the asset. */
export function assetFormPayload(form, { mode = "create" } = {}) {
  const payload = {
    name: norm(form.name),
    asset_tag: norm(form.assetTag),
    category: norm(form.category) || null,
    serial_number: norm(form.serialNumber) || null,
    department: norm(form.department) || null,
    status: form.status || "available",
    condition: form.condition || null,
    purchase_date: form.purchaseDate || null,
    purchase_cost: form.purchasePrice === "" || form.purchasePrice == null ? null : Number(form.purchasePrice),
    notes: norm(form.notes) || null,
  };
  if (mode === "create" && payload.status === "assigned") payload.status = "available";   // Assign sets it
  return payload;
}

/** Why an asset cannot be deleted right now, or null. */
export function assetDeleteBlockReason(asset) {
  if (isAssetAssigned(asset)) return "This asset is assigned to an employee. Return it before deleting it.";
  return null;
}

/** Category choices for the select: the organization's categories, plus the asset's own if it is no longer listed. */
export function categoryChoices(categories, current) {
  const list = [...(categories || [])];
  if (current && !list.includes(current)) list.unshift(current);
  return list;
}
