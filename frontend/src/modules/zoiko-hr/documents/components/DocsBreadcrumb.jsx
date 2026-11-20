import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

/** @param {{ items: { label: string, to?: string }[] }} props — the last item is the current page. */
export default function DocsBreadcrumb({ items }) {
  return (
    <nav aria-label="Document path" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1 text-slate-500">
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} aria-hidden="true" />}
            {it.to && i < items.length - 1
              ? <Link to={it.to} className="hover:text-blue-700 hover:underline">{it.label}</Link>
              : <span aria-current={i === items.length - 1 ? "page" : undefined} className="font-semibold text-slate-800 dark:text-[#f1f5f9]">{it.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
