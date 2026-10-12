// In a form's multi-line box, a bare Enter saves the form (like Enter in every other box) and Shift+Enter adds a
// new line. Without this, Enter in the last box of a dialog only added a blank line and the form looked unresponsive.
export function submitOnEnter(e) {
  if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.nativeEvent?.isComposing || e.isComposing) return;     // choosing a character with an input method
  const form = e.currentTarget?.form;
  if (!form) return;
  e.preventDefault();
  if (typeof form.requestSubmit === "function") form.requestSubmit();
  else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}

export const ENTER_HINT = "Press Enter to save. Shift+Enter adds a new line.";
