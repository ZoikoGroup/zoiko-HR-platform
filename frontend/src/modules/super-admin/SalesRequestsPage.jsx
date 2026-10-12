import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Tag, RefreshCw, Loader2, Mail, Phone, Building2, Globe2, Users, MessageSquare, Inbox } from "lucide-react";
import { listDemoRequests, updateDemoRequest, listPricingRequests, updatePricingRequest } from "../../service/demoService";
import { formatDate } from "../../utils/dateTime";

const TABS = {
  demo: { label: "Demo requests", path: "/super-admin/demo-requests", icon: CalendarDays, list: listDemoRequests, update: updateDemoRequest, statuses: ["new", "scheduled", "completed", "closed"] },
  pricing: { label: "Pricing requests", path: "/super-admin/pricing-requests", icon: Tag, list: listPricingRequests, update: updatePricingRequest, statuses: ["new", "contacted", "closed"] },
};
const TONE = {
  new: "bg-blue-50 text-blue-700 border-blue-200", scheduled: "bg-indigo-50 text-indigo-700 border-indigo-200",
  contacted: "bg-indigo-50 text-indigo-700 border-indigo-200", completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
};
const LABELS = {
  core_hr: "Core HR", leave: "Leave Management", docs_pro: "Docs Pro", attendance: "Attendance", payroll: "Payroll",
  recruitment: "Recruitment", performance: "Performance", learning: "Learning",
  morning: "Morning", afternoon: "Afternoon", evening: "Evening", live: "Live video call", recorded: "Recorded walkthrough", in_person: "In person",
  core: "Core", advanced: "Advanced", enterprise: "Enterprise", not_sure: "Not sure yet",
};
const label = (k) => LABELS[k] || k;

export default function SalesRequestsPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tab = pathname.includes("pricing") ? "pricing" : "demo";
  const cfg = TABS[tab];
  const [status, setStatus] = useState("");
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    cfg.list({ per_page: 100, ...(status ? { status } : {}) })
      .then((res) => setData({ items: res?.items || [], total: res?.total || 0 }))
      .catch((e) => setError(e?.message || "Could not load requests."))
      .finally(() => setLoading(false));
  }, [cfg, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setStatus(""); }, [tab]);

  const change = (item, next) => {
    setSaving(item.id);
    cfg.update(item.id, next)
      .then((row) => setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, ...row } : i)) })))
      .catch((e) => setError(e?.message || "Could not update the request."))
      .finally(() => setSaving(null));
  };

  return (
    <div className="min-h-screen bg-slate-50 -m-4 sm:-m-6 lg:-m-8">
      <header className="relative overflow-hidden bg-gradient-to-r from-[#0A192F] via-[#0F2942] to-[#1E3A8A] text-white">
        <div className="relative z-10 px-4 sm:px-6 lg:px-8 py-7 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sales Requests</h1>
            <p className="text-sm text-slate-300 mt-1">Demo bookings and pricing requests sent from the public website.</p>
          </div>
          <button type="button" onClick={load} aria-label="Refresh" className="h-10 w-10 flex items-center justify-center rounded-xl border border-white/20 bg-white/10 hover:bg-white/20">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="absolute -right-10 -bottom-24 w-72 h-72 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
      </header>

      <div className="p-4 sm:p-6 lg:p-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" className="flex bg-white border border-slate-200 rounded-xl p-1">
            {Object.entries(TABS).map(([key, t]) => (
              <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => navigate(t.path)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm capitalize">
              <option value="">All</option>
              {cfg.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>

        {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div> : null}

        {loading && data.items.length === 0 ? (
          <div role="status" className="py-20 flex justify-center text-slate-500 text-sm gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading requests...</div>
        ) : data.items.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 py-16 text-center">
            <Inbox className="w-8 h-8 mx-auto text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">No {cfg.label.toLowerCase()} {status ? `with status "${status}"` : "yet"}.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">{data.total} request{data.total === 1 ? "" : "s"}</p>
            {data.items.map((r) => (
              <article key={r.id} className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono text-slate-400">{r.reference} · {r.created_at ? formatDate(r.created_at) : ""}</p>
                    <h2 className="text-base font-bold text-slate-900 mt-0.5">{r.full_name} <span className="font-normal text-slate-500">· {r.job_title || "No title given"}</span></h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${TONE[r.status] || TONE.closed}`}>{r.status}</span>
                    <select aria-label={`Status of ${r.reference}`} value={r.status} disabled={saving === r.id} onChange={(e) => change(r, e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs capitalize bg-white">
                      {cfg.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                  <a href={`mailto:${r.work_email}?subject=${encodeURIComponent(`Zoiko HR ${tab === "demo" ? "demo" : "pricing"} (${r.reference})`)}`} className="flex items-center gap-2 text-blue-700 hover:underline truncate"><Mail className="w-4 h-4 shrink-0" />{r.work_email}</a>
                  <span className="flex items-center gap-2 text-slate-700"><Phone className="w-4 h-4 text-slate-400 shrink-0" />{r.phone || "No phone"}</span>
                  <span className="flex items-center gap-2 text-slate-700"><Building2 className="w-4 h-4 text-slate-400 shrink-0" />{r.company}</span>
                  <span className="flex items-center gap-2 text-slate-700"><Globe2 className="w-4 h-4 text-slate-400 shrink-0" />{r.country} · <Users className="w-4 h-4 text-slate-400" />{r.company_size}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tab === "demo" ? (
                    <>
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">{label(r.demo_format)}</span>
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                        {r.preferred_date ? formatDate(r.preferred_date) : "Any day"} · {r.preferred_time ? label(r.preferred_time) : "Any time"}{r.timezone ? ` (${r.timezone})` : ""}
                      </span>
                      {(r.interests || []).map((i) => <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700">{label(i)}</span>)}
                    </>
                  ) : (
                    <>
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700">Plan: {label(r.plan_interest)}</span>
                      {r.billing_preference ? <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 capitalize">{r.billing_preference} billing</span> : null}
                      {(r.products || []).map((i) => <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700">{label(i)}</span>)}
                    </>
                  )}
                </div>
                {r.message ? <p className="mt-3 text-sm text-slate-600 flex items-start gap-2"><MessageSquare className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />{r.message}</p> : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
