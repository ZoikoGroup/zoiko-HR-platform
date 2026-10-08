// A component inside a salary structure: the same rules as the server (hr/schemas.clean_structure_amount), so the message is
// the same whether the browser or the server catches the problem. The amount or formula is REQUIRED here: this is the amount
// that counts, whether or not the component has a default amount of its own.

const FORMULA_CHARS = /^[A-Za-z0-9_ .%+\-*/()]+$/;

/** "" when fine, otherwise the message to show under the box. */
export function structureAmountError(value) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "Enter the amount or formula for this component in the structure.";
  if (text.length > 255) return "The amount or formula can be at most 255 characters.";
  const plain = text.replace(/,/g, "");
  if (/^-?\d+(\.\d+)?$/.test(plain)) {
    const n = Number(plain);
    if (n <= 0) return "The amount must be greater than 0.";
    if (n > 99999999.99) return "The amount is too large (the most is 99,999,999.99).";
    if (!/^\d+(\.\d{1,2})?$/.test(plain)) return "The amount can have at most 2 decimal places.";
    return "";
  }
  if (/^\d+(\.\d+)?%$/.test(text)) {
    const pct = Number(text.slice(0, -1));
    return pct <= 0 || pct > 100 ? "A percentage must be more than 0 and at most 100." : "";
  }
  if (!FORMULA_CHARS.test(text) || !/[A-Za-z0-9]/.test(text)) return "Use a number, a percentage such as 12%, or a formula such as 40% of basic.";
  return "";
}

/** { componentId, amount } errors for the "add component" form. */
export function validateStructureComponent(form, alreadyIn = []) {
  const e = {};
  if (!form.componentId) e.componentId = "Choose a salary component.";
  else if (alreadyIn.map(String).includes(String(form.componentId))) e.componentId = "This component is already in the structure. Change its amount instead.";
  const amount = structureAmountError(form.amount);
  if (amount) e.amount = amount;
  return e;
}

export const structureComponentPayload = (form) => ({ component_id: Number(form.componentId), amount_or_formula: String(form.amount).trim() });

/** Suggested amount when a component is picked: its default amount, when it has one. */
export function suggestedAmount(component) {
  const n = Number(component?.default_amount);
  return component && component.default_amount != null && Number.isFinite(n) && n > 0 ? String(n) : "";
}

/** Maps a refusal from the server onto the form: { fieldErrors, message }. */
export function serverStructureErrors(err) {
  const fieldErrors = {};
  if (Array.isArray(err?.validation)) {
    for (const item of err.validation) {
      const key = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
      const msg = typeof item?.msg === "string" ? item.msg.replace(/^value error,\s*/i, "") : "";
      if (key === "amount_or_formula" && msg && !fieldErrors.amount) fieldErrors.amount = msg;
      else if (key === "component_id" && msg && !fieldErrors.componentId) fieldErrors.componentId = "Choose a salary component.";
    }
  }
  const message = err?.message || "";
  if (!Object.keys(fieldErrors).length && /already part of this salary structure/i.test(message)) fieldErrors.componentId = message;
  return { fieldErrors, message: Object.keys(fieldErrors).length ? "" : message || "The salary structure could not be updated." };
}
