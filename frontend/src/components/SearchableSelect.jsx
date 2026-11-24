/**
 * components/SearchableSelect.jsx
 * -------------------------------
 * A dropdown with a search box, for long lists (countries, states / regions, calling codes). It replaces the native
 * <select>, which cannot be searched and whose list a browser draws over the form (QA bugs 3 and 4).
 *
 * - The button carries `id` (so <label htmlFor={id}> names it) and `value` (so code reading element.value still works).
 * - The list is drawn in a layer of its own (a portal, position: fixed): a dialog or scrolling panel never clips it. It opens
 *   below the button, or above when there is no room, and stays on screen.
 * - It opens on the mouse press, like a native <select>: a form that validates a field when it loses focus can grow between
 *   press and release, and a plain click would then land beside the button and be lost.
 * - Keyboard: Enter / Space / Down open it; type to search; Up / Down move; Enter chooses; Escape closes (only the list).
 *
 * options: [{ value, label, keywords?, display? }] — `display` is what the closed button shows (defaults to label),
 * `keywords` are extra words the search matches.
 * allowCustom: what is typed can be used as the value when no option is exactly it (the list offers "Use “…”"); a value
 * that is not an option is shown as it is.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";

const LIST_WIDTH = 320;      // px
const LIST_HEIGHT = 340;     // px, search box included

export function defaultMatch(option, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return String(option.label).toLowerCase().includes(q)
    || String(option.value).toLowerCase() === q
    || (option.keywords || []).some((k) => String(k).toLowerCase().includes(q));
}

export default function SearchableSelect({
  id, value, onChange, options = [], placeholder = "Select…", allowEmpty = false, emptyLabel,
  className = "", disabled, invalid, describedBy, ariaLabel, searchLabel = "Search", searchPlaceholder = "Type to search",
  noMatchText = "Nothing matches", match = defaultMatch, renderOption, listWidth = LIST_WIDTH, title, listLabel, onBlur, allowCustom = false,
}) {
  const autoId = useId();
  const listId = `${id || autoId}-list`;
  const button = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const blurTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);

  const all = useMemo(() => (allowEmpty ? [{ value: "", label: emptyLabel || placeholder, empty: true }, ...options] : options),
    [allowEmpty, emptyLabel, placeholder, options]);
  const current = options.find((o) => String(o.value) === String(value ?? ""));
  const shown = useMemo(() => {
    const list = all.filter((o) => o.empty ? !query.trim() : match(o, query));
    const typed = query.trim();
    if (allowCustom && typed && !options.some((o) => String(o.label).toLowerCase() === typed.toLowerCase())) {
      list.push({ value: typed, label: `Use “${typed}”`, custom: true });
    }
    return list;
  }, [all, query, match, allowCustom, options]);

  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.min(Math.max(listWidth, r.width), vw - 16);
    const left = Math.max(8, Math.min(r.left, vw - width - 8));
    const below = vh - r.bottom - 8, above = r.top - 8;
    const up = below < Math.min(LIST_HEIGHT, 220) && above > below;
    const maxHeight = Math.max(160, Math.min(LIST_HEIGHT, up ? above - 4 : below - 4));
    setPos(up ? { left, width, bottom: vh - r.top + 4, maxHeight } : { left, width, top: r.bottom + 4, maxHeight });
  };

  const customTyped = () => {
    const typed = query.trim();
    if (!allowCustom || !typed || options.some((o) => String(o.label).toLowerCase() === typed.toLowerCase())) return null;
    // a partial match is someone searching an existing option, not someone naming a new one
    return all.some((o) => !o.empty && !o.custom && match(o, query)) ? null : typed;
  };
  const close = (focusButton = true, commitTyped = false) => {
    const typed = commitTyped ? customTyped() : null;
    setOpen(false);
    setQuery("");
    if (typed != null) onChange?.(typed);
    if (focusButton) button.current?.focus();
    // the field has been visited: a form that checks fields on blur checks it now, after the chosen value is in its state
    if (onBlur) {
      clearTimeout(blurTimer.current);
      blurTimer.current = setTimeout(onBlur, 0);
    }
  };
  useEffect(() => () => clearTimeout(blurTimer.current), []);
  const choose = (o) => { if (o) onChange?.(o.value); close(); };
  const toggle = () => { if (open) close(); else setOpen(true); };

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    setActive(Math.max(0, shown.findIndex((o) => String(o.value) === String(value ?? ""))));
    const outside = (e) => {
      if (!button.current?.contains(e.target) && !listRef.current?.contains(e.target)) close(false, true);
    };
    const reflow = () => place();
    document.addEventListener("mousedown", outside);
    window.addEventListener("resize", reflow);
    window.addEventListener("scroll", reflow, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("resize", reflow);
      window.removeEventListener("scroll", reflow, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // the list exists only once its position is known: focus its search box then (not when `open` flips)
  const placed = Boolean(pos);
  useEffect(() => {
    if (!open || !placed) return undefined;
    searchRef.current?.focus();
    // moving focus can make the form validate the field it left and grow: measure again once that has happened
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [open, placed]); // eslint-disable-line react-hooks/exhaustive-deps

  // the highlighted option stays in view while moving with the keyboard
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(shown[active]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.nativeEvent?.stopImmediatePropagation?.(); close(); }
    else if (e.key === "Tab") close(false, true);
  };

  const shownLabel = current ? (current.display ?? current.label) : (value ? String(value) : placeholder);
  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        value={value ?? ""}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-invalid={invalid ? "true" : undefined}
        aria-describedby={describedBy}
        title={title ?? (current ? current.label : undefined)}
        disabled={disabled}
        onMouseDown={(e) => { if (e.button !== 0 || disabled) return; e.preventDefault(); toggle(); }}
        onClick={(e) => { if (e.detail !== 0) return; toggle(); }}     // keyboard: Enter / Space arrive as a click with no press
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); setOpen(true); } }}
        className={`${className} flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className={`truncate ${current ? "" : "text-gray-400"}`}>{shownLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
      </button>
      {open && pos && createPortal(
        <div ref={listRef} data-searchable-select-list=""
          style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          className="z-[1000] flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-xl">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-label={searchLabel}
              aria-expanded="true"
              aria-controls={listId}
              aria-invalid={invalid ? "true" : undefined}
              aria-describedby={describedBy}
              aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
              autoComplete="off"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onKey}
              className="w-full border-0 bg-transparent p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
            />
          </div>
          <ul id={listId} role="listbox" aria-label={listLabel || ariaLabel || "Options"}
            className="flex-1 overflow-y-auto py-1">
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">{noMatchText} “{query}”.</li>}
            {shown.map((o, i) => {
              const selected = String(o.value) === String(value ?? "") && !(o.empty && value);
              return (
                <li key={`${o.value}-${i}`} id={`${listId}-${i}`} data-index={i} role="option" aria-selected={selected}
                  onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(o)}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm ${i === active ? "bg-blue-50" : ""} ${
                    o.empty ? "text-gray-500" : o.custom ? "italic text-blue-700" : selected ? "font-semibold text-blue-700" : "text-gray-800"}`}>
                  {renderOption ? renderOption(o) : <span className="truncate">{o.label}</span>}
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
