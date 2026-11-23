/*
 * Offboarding → Exit Interviews: who was asked, who answered, and why people leave (by reason, department and month),
 * with the employee Net Promoter Score from the "would you recommend us" question. Answers are HR-only.
 * Data: GET /hr/offboarding/interviews?date_from&date_to&department_id.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gauge, MessageSquareText, Percent, Send, ShieldCheck } from "lucide-react";
import { getDepartments } from "../../../service/hrService";
import { getInterviewAnalytics } from "../../../service/offboardingService";
import { formatDate } from "../../../utils/dateTime";
import { Card, EmptyState, FilterSelect, KpiCard, StatusPill, Table, td } from "../recruitment/ui";
import OffboardingLayout from "./OffboardingLayout";
import { ErrorNote, humanize, inputClass, useLoad } from "./part2Helpers";

const STATUS_TONE = { sent: "blue", draft: "amber", submitted: "green", declined: "gray", not_sent: "gray" };
const asList = (raw) => (Array.isArray(raw) ? raw : raw?.items || raw?.data || raw?.departments || []);

function Bars({ rows, color = "bg-blue-500", label }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="text-sm text-slate-500">No answers yet.</p>;
  return (
    <ul aria-label={label} className="space-y-2">
      {rows.map((r) => (
        <li key={r.key || r.label || r.month} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 truncate text-slate-700" title={r.label || r.month}>{r.label || r.month}</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span className={`block h-full rounded-full ${color}`} style={{ width: `${(r.count * 100) / max}%` }} />
          </span>
          <span className="w-8 text-right font-semibold text-slate-900">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ExitInterviews() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dept, setDept] = useState("");
  const [departments, setDepartments] = useState([]);
  useEffect(() => { getDepartments().then((r) => setDepartments(asList(r?.data ?? r))).catch(() => setDepartments([])); }, []);
  const data = useLoad(() => getInterviewAnalytics({ date_from: from || undefined, date_to: to || undefined, department_id: dept || undefined }),
    [from, to, dept]);
  const d = data.data;
  const s = d?.summary || {};
  const loading = data.loading && !d;

  return (
    <OffboardingLayout title="Exit Interviews" subtitle="Why people leave, from their own answers.">
      <div className="space-y-5">
        <p className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-900">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Answers are visible to HR only. Managers never see them.
        </p>
        <Card bodyClass="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="iv-from" className="mb-1 block text-xs font-medium text-gray-600">Sent from</label>
              <input id="iv-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="iv-to" className="mb-1 block text-xs font-medium text-gray-600">Sent to</label>
              <input id="iv-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            </div>
            <FilterSelect label="Department" value={dept} onChange={setDept} allLabel="All departments"
              options={departments.map((x) => ({ value: String(x.id), label: x.name }))} />
          </div>
        </Card>
        <ErrorNote>{data.error}</ErrorNote>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Sent" icon={Send} tone="blue" kpi={{ value: s.sent ?? 0 }} loading={loading} />
          <KpiCard label="Answered" icon={MessageSquareText} tone="green" kpi={{ value: s.submitted ?? 0 }} loading={loading} />
          <KpiCard label="Response rate" icon={Percent} tone="violet" kpi={{ value: s.response_rate ?? 0 }} format={(v) => `${v}%`} loading={loading} />
          <KpiCard label="Employee NPS" icon={Gauge} tone="amber" kpi={{ value: s.enps }} format={(v) => (v > 0 ? `+${v}` : `${v}`)} loading={loading} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card title="Why people leave"><Bars rows={d?.by_reason || []} label="Reasons for leaving" /></Card>
          <Card title="By department"><Bars rows={d?.by_department || []} color="bg-emerald-500" label="Answers by department" /></Card>
          <Card title="By month"><Bars rows={d?.by_month || []} color="bg-violet-500" label="Answers by month" /></Card>
        </div>
        <Card title="Interviews" bodyClass="p-0 pt-3">
          <Table columns={[{ label: "Employee" }, { label: "Department" }, { label: "Status" }, { label: "Main reason" }, { label: "Recommend (0-10)" },
            { label: "Sent" }, { label: "Answered" }, { label: "Case" }]}
            empty={!loading && (d?.items || []).length === 0 && <EmptyState icon={MessageSquareText} title="No exit interviews yet" />}>
            {(d?.items || []).map((i) => (
              <tr key={i.id}>
                <td className={td}>{i.employee?.name}</td>
                <td className={td}>{i.department}</td>
                <td className={td}><StatusPill tone={STATUS_TONE[i.status] || "gray"}>{humanize(i.status)}</StatusPill></td>
                <td className={td}>{i.primary_reason_label || (i.primary_reason ? humanize(i.primary_reason) : "—")}</td>
                <td className={td}>{i.would_recommend ?? "—"}</td>
                <td className={td}>{i.sent_at ? formatDate(i.sent_at) : "—"}</td>
                <td className={td}>{i.submitted_at ? formatDate(i.submitted_at) : "—"}</td>
                <td className={td}><Link to={`/zoiko-hr/offboarding/cases/${i.case_id}?tab=interview`} className="font-medium text-blue-700 hover:underline">{i.case_number}</Link></td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </OffboardingLayout>
  );
}
