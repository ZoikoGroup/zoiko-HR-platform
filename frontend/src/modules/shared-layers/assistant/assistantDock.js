// QA-R1-4: the floating assistant used to sit on top of pagination and action links in the bottom-right corner.
// * While the launcher is on screen the page reserves room for it: <html data-assistant-dock="launcher"> gives the
//   portal's <main> extra bottom padding (so the last row, e.g. pagination, scrolls clear of it) and keeps sticky /
//   fixed bottom action bars' right end clear (assistant-tokens.css).
// * It can be minimised to a slim tab on the right edge ("tab": nothing reserved). The choice is remembered per user
//   in localStorage; storage that is blocked or full just means it is not remembered.

export const DOCK_ATTR = "data-assistant-dock";

/** One key per person (and organisation), so the next person on a shared browser starts with the launcher shown. */
export function minimisedKey(user) {
  return `zhr.assistant.minimised:${user?.organization_id ?? "none"}:${user?.id ?? user?.email ?? "anon"}`;
}

export function readMinimised(key, storage = globalThis.localStorage) {
  try {
    return storage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeMinimised(key, minimised, storage = globalThis.localStorage) {
  try {
    if (minimised) storage?.setItem(key, "1");
    else storage?.removeItem(key);
  } catch {
    /* not remembered: private window or blocked storage */
  }
}

/**
 * What the assistant occupies at the bottom-right right now:
 *  "none"     – nothing (hidden for this plan, or stepped aside for a page dialog)
 *  "tab"      – minimised to the edge tab
 *  "launcher" – the round launcher (also while its panel is open; the panel itself is a dialog)
 */
export function dockState({ hidden = false, open = false, minimised = false } = {}) {
  if (hidden && !open) return "none";
  if (minimised && !open) return "tab";
  return "launcher";
}

/** Mirrors the state onto <html> so the layout's CSS can reserve the space; "none" removes the attribute. */
export function applyDock(state, root = globalThis.document?.documentElement) {
  if (!root) return;
  if (!state || state === "none") root.removeAttribute(DOCK_ATTR);
  else root.setAttribute(DOCK_ATTR, state);
}
