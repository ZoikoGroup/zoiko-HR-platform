import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

/**
 * The "⋯" menu for a file or folder row. Items: `{ label, icon?, onSelect, danger?, hidden? }`. Closes on Escape, on a
 * click outside, and after an item is chosen; focus goes back to the "⋯" button.
 *
 * @param {{ label: string, items: Array<{label: string, icon?: any, onSelect: () => void, danger?: boolean, hidden?: boolean}> }} props
 */
export default function ActionMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const button = useRef(null);
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    wrap.current?.querySelector('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const onMenuKey = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const nodes = [...wrap.current.querySelectorAll('[role="menuitem"]')];
    const at = nodes.indexOf(document.activeElement);
    nodes[(at + (e.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length]?.focus();
  };

  if (!visible.length) return null;
  return (
    <div ref={wrap} className="relative inline-block">
      <button ref={button} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((v) => !v)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && (
        <ul role="menu" aria-label={label} onKeyDown={onMenuKey}
          className="absolute right-0 z-40 mt-1 min-w-[200px] rounded-xl border border-slate-200 bg-white py-1 text-left shadow-lg dark:border-[#334155] dark:bg-[#1e293b]">
          {visible.map(({ label: text, icon: Icon, onSelect, danger }) => (
            <li key={text} role="none">
              <button type="button" role="menuitem" tabIndex={-1}
                onClick={() => { setOpen(false); button.current?.focus(); onSelect(); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm ${danger ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"}`}>
                {Icon && <Icon size={15} aria-hidden="true" />}{text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
