import { Link } from "react-router-dom";
import { statusMeta } from "../constants";

const TONES = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
  amber: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  rose: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
  orange: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
  violet: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800",
  slate: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};
const DOTS = { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", orange: "bg-orange-500", violet: "bg-violet-500", slate: "bg-slate-400" };

/**
 * One status chip for every document status (docs/new_docs/ZHR-DOCS-ARCH-001 §9.4). The colour is never the only signal:
 * the label is always written out. With `href` the chip links (e.g. a pending file to its item in Approval Workflow).
 *
 * @param {{ status: string, size?: 'sm'|'md', href?: string, title?: string }} props
 */
export default function StatusChip({ status, size = "sm", href, title }) {
  const meta = statusMeta(status);
  const cls = `inline-flex items-center gap-1.5 rounded-full border font-semibold ${size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"} ${TONES[meta.tone] || TONES.slate}`;
  const body = (
    <>
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[meta.tone] || DOTS.slate}`} aria-hidden="true" />
      {meta.label}
    </>
  );
  if (href) {
    return (
      <Link to={href} title={title || `Open in Approval Workflow`} data-status={status}
        className={`${cls} hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600`}>
        {body}
      </Link>
    );
  }
  return <span className={cls} title={title} data-status={status}>{body}</span>;
}
