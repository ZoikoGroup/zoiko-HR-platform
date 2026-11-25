/**
 * Choose an option in a SearchableSelect (components/SearchableSelect.jsx) the way a person does: press the button, then
 * click the option. `field` is the button (or its id); `label` is the option text or a RegExp. Optionally type `search`
 * into the search box first.
 */
import { fireEvent, screen, within, act } from "@testing-library/react";

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });

export async function chooseOption(field, label, { search } = {}) {
  const button = typeof field === "string" ? document.getElementById(field) : field;
  if (!button) throw new Error(`no searchable select ${field}`);
  fireEvent.mouseDown(button, { button: 0 });
  await settle();
  const list = document.getElementById(button.getAttribute("aria-controls"));
  if (!list) throw new Error(`the list of ${button.id || button.getAttribute("aria-label")} did not open`);
  if (search != null) {
    fireEvent.change(screen.getAllByRole("combobox").find((c) => c.getAttribute("aria-controls") === list.id), { target: { value: search } });
    await settle();
  }
  const options = within(list).getAllByRole("option");
  const hit = options.find((o) => (label instanceof RegExp ? label.test(o.textContent) : o.textContent.trim() === label));
  if (!hit) throw new Error(`no option ${label} in [${options.slice(0, 8).map((o) => o.textContent).join(", ")}…]`);
  fireEvent.click(hit);
  await settle();
}

/** The option texts a SearchableSelect offers (opens the list, reads it, closes it again). */
export async function optionTexts(field) {
  const button = typeof field === "string" ? document.getElementById(field) : field;
  fireEvent.mouseDown(button, { button: 0 });
  await settle();
  const list = document.getElementById(button.getAttribute("aria-controls"));
  const texts = within(list).getAllByRole("option").map((o) => o.textContent.trim());
  fireEvent.mouseDown(button, { button: 0 });
  await settle();
  return texts;
}
