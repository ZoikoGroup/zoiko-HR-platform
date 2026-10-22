// Text inputs that remember where the cursor was, so the field / clause pickers can insert a placeholder there.
import { createContext, useContext, useRef } from "react";
import { inputClass } from "./ui";

export const InsertTargetContext = createContext({ register: () => {} });

// Inserts `text` into an input/textarea at its cursor (or at the end) and returns the new value.
export function insertAtCursor(el, value, text) {
  const v = value ?? "";
  const start = el && typeof el.selectionStart === "number" ? el.selectionStart : v.length;
  const end = el && typeof el.selectionEnd === "number" ? el.selectionEnd : v.length;
  return { next: v.slice(0, start) + text + v.slice(end), caret: start + text.length };
}

export default function SmartText({ id, value, onChange, multiline = false, rows = 3, disabled = false, placeholder, className = "", ...rest }) {
  const { register } = useContext(InsertTargetContext);
  const ref = useRef(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  const onFocus = () => {
    if (disabled) return;
    register({
      id,
      isAlive: () => !!ref.current?.isConnected,
      insert: (text) => {
        const el = ref.current;
        const { next, caret } = insertAtCursor(el, latest.current.value, text);
        latest.current.onChange(next);
        requestAnimationFrame(() => {
          if (!el?.isConnected) return;
          el.focus();
          el.setSelectionRange(caret, caret);
        });
      },
    });
  };

  const common = {
    id, ref, value: value ?? "", disabled, placeholder, onFocus,
    onChange: (e) => onChange(e.target.value),
    className: `${inputClass} ${multiline ? "font-mono text-[13px]" : ""} ${className}`,
    ...rest,
  };
  return multiline ? <textarea rows={rows} {...common} /> : <input type="text" {...common} />;
}
