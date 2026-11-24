/* My Exit → Exit Status: last working day, notice, and what is still outstanding. */
import { Link } from "react-router-dom";
import { CalendarClock, ClipboardCheck, FileText, MessageSquareText, Package, WalletCards } from "lucide-react";
import { formatDate, formatDateTime } from "../../../../../utils/dateTime";
import MyExitLayout, { StatusBadge, useMyExit } from "./MyExitLayout";

const INTERVIEW = { sent: "Waiting for your answers", draft: "Draft saved", submitted: "Submitted", declined: "Not needed" };
const SETTLEMENT = { draft: "Being prepared", approved: "Approved, payment pending", paid: "Paid", not_applicable: "Not applicable" };

function countdown(days) {
  if (days == null) return "";
  if (days > 1) return `${days} days to go`;
  if (days === 1) return "Tomorrow";
  if (days === 0) return "Today";
  return "Passed";
}

function Card({ icon: Icon, title, value, to, linkLabel }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="flex items-center gap-2 text-sm text-slate-500"><Icon size={16} aria-hidden="true" />{title}</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
      {to && <Link to={to} className="mt-2 inline-block text-sm font-medium text-blue-700 hover:underline">{linkLabel}</Link>}
    </div>
  );
}

function StatusTab() {
  const { data } = useMyExit();
  const c = data.case;
  const s = data.summary || {};
  const p = c.progress || {};
  return (
    <div className="space-y-4">
      <section aria-labelledby="lwd" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <p id="lwd" className="flex items-center gap-2 text-sm text-slate-500"><CalendarClock size={16} aria-hidden="true" /> Last working day</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{formatDate(c.last_working_day)}</p>
          <p className="mt-1 text-sm text-slate-600">{countdown(c.days_left)}{c.notice_handling_label ? ` · ${c.notice_handling_label}` : ""}</p>
        </div>
        <div className="text-right">
          <StatusBadge status={c.display_status} />
          <p className="mt-2 text-xs text-slate-500">{c.exit_type_label} · {c.case_number}</p>
        </div>
      </section>
      {c.status === "submitted" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Your resignation is waiting for a decision. Your tasks appear here once it is accepted.</p>
      )}
      {c.withdrawal_requested_at && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">You asked to withdraw your resignation. HR will decide.</p>
      )}
      {c.status === "rejected" && c.decision_note && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><strong>Not accepted:</strong> {c.decision_note}</p>
      )}
      {["approved", "exited", "closed"].includes(c.status) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card icon={ClipboardCheck} title="My exit tasks" value={`${(s.my_tasks_total || 0) - (s.my_tasks_open || 0)} of ${s.my_tasks_total || 0} done`}
            to="/employee/ess/exit/tasks" linkLabel="Open tasks" />
          <Card icon={Package} title="Company property to return" value={p.assets_pending ? `${p.assets_pending} item(s)` : "Nothing outstanding"} />
          <Card icon={MessageSquareText} title="Exit interview" value={INTERVIEW[s.interview_status] || "Not sent"}
            to={s.interview_status && s.interview_status !== "not_sent" ? "/employee/ess/exit/interview" : null} linkLabel="Open interview" />
          <Card icon={WalletCards} title="Final settlement" value={SETTLEMENT[s.settlement_status] || "Not started"} />
          <Card icon={FileText} title="Exit documents" value={`${s.documents || 0} issued`}
            to={s.documents ? "/employee/ess/exit/documents" : null} linkLabel="Open documents" />
        </div>
      )}
      <section aria-labelledby="timeline" className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 id="timeline" className="text-base font-semibold text-slate-900">Timeline</h2>
        {(data.activity || []).length === 0 ? <p className="mt-2 text-sm text-slate-500">Nothing yet.</p> : (
          <ol className="mt-3 space-y-3 border-l border-slate-200 pl-4">
            {data.activity.map((a) => (
              <li key={a.id} className="text-sm">
                <p className="text-slate-800">{a.message}</p>
                <p className="text-xs text-slate-500">{formatDateTime(a.created_at)}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export default function ExitStatus() {
  return <MyExitLayout tab="status"><StatusTab /></MyExitLayout>;
}
