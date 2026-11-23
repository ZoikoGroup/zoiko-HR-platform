import { Link } from "react-router-dom";
import { formatDateTime } from "../../../../utils/dateTime";

const TONE = {
  published: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
  unpublished: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  scheduled: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  pending: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  expired: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
};
const DOT = { published: "bg-emerald-500", unpublished: "bg-slate-400", scheduled: "bg-amber-500", pending: "bg-blue-500", expired: "bg-rose-500" };

/** Which of the five company-file states applies; waiting for approval and expired win over the publish state. */
export function publishStatus(file) {
  if (file?.status === "pending_approval") return { key: "pending", label: "Waiting for approval" };
  if (file?.expiry_state === "expired") return { key: "expired", label: "Expired" };
  if (file?.publish_state === "published") return { key: "published", label: "Published" };
  if (file?.publish_state === "scheduled") return { key: "scheduled", label: file.publish_at ? `Scheduled · ${formatDateTime(file.publish_at)}` : "Scheduled" };
  return { key: "unpublished", label: "Unpublished" };
}

/**
 * Status of a company file: Published (green), Unpublished (grey), Scheduled (amber), Waiting for approval (blue,
 * links to Approval Workflow) or Expired (red). Always written out, never colour alone.
 */
export default function PublishStatusChip({ file }) {
  const s = publishStatus(file);
  const cls = `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE[s.key]}`;
  const body = <><span className={`h-1.5 w-1.5 rounded-full ${DOT[s.key]}`} aria-hidden="true" />{s.label}</>;
  if (s.key === "pending") {
    return <Link to={`/zoiko-hr/documents/approvals?item=${file.id}`} title="Open in Approval Workflow" data-status={s.key} className={`${cls} hover:underline`}>{body}</Link>;
  }
  return <span className={cls} data-status={s.key}>{body}</span>;
}
