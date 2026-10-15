import { useState, useCallback, useEffect, useMemo } from "react";
import {
  ShieldCheck, AlertTriangle, KeyRound, RefreshCw, Radio, X, Plus, Siren, Eye, CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import OrgPicker from "../../components/OrgPicker";
import { useStepUp } from "../../components/StepUpDialog";
import { supportAccessService } from "../../service/supportAccessService";
import { getStoredUser } from "../../service/api";
import { formatDateTime } from "../../utils/dateTime";

// The platform view of Prompt 2: requests and their approvals, the live just-in-time grants, emergency (break-glass)
// sessions, the emergency stop, and the assurance checks. It only ever shows grant METADATA and the SHAPE of a scope -
// tenant field values appear only in the records viewer, served by the enforced /support path under a live grant.

const SEVERITY_STYLE = {
  critical: "border-red-300 bg-red-50 text-red-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-600",
};

const STATUS_STYLE = {
  DRAFT: "border-slate-200 bg-slate-50 text-slate-600",
  PENDING_TENANT: "border-amber-200 bg-amber-50 text-amber-700",
  PENDING_INDEPENDENT: "border-amber-200 bg-amber-50 text-amber-700",
  PENDING_CONFIRMATION: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-blue-200 bg-blue-50 text-blue-700",
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  REVOKED: "border-red-200 bg-red-50 text-red-700",
  HIGH: "border-orange-200 bg-orange-50 text-orange-700",
  STANDARD: "border-slate-200 bg-slate-50 text-slate-600",
};

const OPEN_REQUEST = new Set(["DRAFT", "PENDING_TENANT", "PENDING_INDEPENDENT", "APPROVED"]);
const BREAKGLASS_ACTIONS = new Set(["list", "read"]);

const TABS = [
  { key: "live", label: "Live access" },
  { key: "requests", label: "Requests" },
  { key: "breakglass", label: "Break-glass" },
  { key: "revocations", label: "Revocations" },
  { key: "assurance", label: "Assurance" },
];

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-700 outline-none focus:border-[#3B82F6]";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500";
const cardCls = "rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]";

const human = (s) => String(s || "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function Pill({ value }) {
  if (!value) return <span className="text-slate-300">—</span>;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[value] || STATUS_STYLE.DRAFT}`}>
      {human(value)}
    </span>
  );
}

function Tenant({ id, name }) {
  return (
    <div>
      <div className="font-semibold text-slate-700">{name || `Organization #${id}`}</div>
      {name && <div className="text-xs text-slate-400">#{id}</div>}
    </div>
  );
}

/** The SHAPE of a scope as the server summarises it: resources, how many records, data categories, actions. */
function scopeText(scope) {
  if (!scope) return "—";
  const parts = [(scope.resources || []).join(", ")];
  parts.push(`${scope.record_count ?? 0} record${scope.record_count === 1 ? "" : "s"}`);
  if (scope.department_count) parts.push(`${scope.department_count} dept`);
  if ((scope.categories || []).length) parts.push(scope.categories.map(human).join(", "));
  parts.push((scope.actions || []).join("/"));
  return parts.filter(Boolean).join(" · ");
}

/** "12, 34 56" -> [12, 34, 56]; null when something is not a positive whole number. */
function parseIds(text) {
  const parts = String(text || "").split(/[\s,]+/).filter(Boolean);
  const ids = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  if (ids.some((n) => !Number.isSafeInteger(n) || n <= 0)) return null;
  return [...new Set(ids)];
}

function Modal({ title, icon, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`flex max-h-[90vh] w-full ${wide ? "max-w-3xl" : "max-w-lg"} flex-col rounded-3xl border border-slate-200 bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            {icon}
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

const btnGhost = "px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50";
const btnPrimary = "flex items-center gap-2 px-4 py-2 rounded-full bg-[#3B82F6] text-white text-sm font-semibold hover:bg-[#2563EB] disabled:opacity-50";
const btnDanger = "flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50";

// ── scope editor (shared by a support request and a break-glass session) ─────────────────────────────────────────────
const EMPTY_SCOPE_FORM = { resource: "", fields: [], recordIds: "", departmentIds: "", actions: ["read"] };

function ScopeEditor({ catalog, value, onChange, purposeCategory, breakglass }) {
  const resources = catalog?.resources || [];
  const resource = resources.find((r) => r.name === value.resource) || resources[0];
  const legalLevels = new Set(catalog?.legal_basis_levels || []);
  const fields = (resource?.fields || []).filter((f) => !(breakglass && legalLevels.has(f.level)));
  const actions = (catalog?.actions || []).filter((a) => !breakglass || BREAKGLASS_ACTIONS.has(a));
  const set = (patch) => onChange({ ...value, resource: resource?.name || "", ...patch });
  const toggle = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const byLevel = useMemo(() => {
    const groups = {};
    for (const f of fields) (groups[f.level] ||= []).push(f.name);
    return Object.entries(groups);
  }, [fields]);

  if (!resource) return <p className="text-sm text-slate-400">No requestable resources are available.</p>;

  return (
    <div className="space-y-4">
      {resources.length > 1 && (
        <div>
          <label className={labelCls}>Resource *</label>
          <select value={resource.name} onChange={(e) => onChange({ ...EMPTY_SCOPE_FORM, resource: e.target.value })} className={inputCls}>
            {resources.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className={labelCls}>Fields of {resource.name} *</label>
        <div className="max-h-56 space-y-3 overflow-y-auto rounded-xl border border-slate-200 p-3">
          {byLevel.map(([level, names]) => (
            <div key={level}>
              <div className={`mb-1 text-[11px] font-bold uppercase tracking-wider ${(catalog?.high_risk_levels || []).includes(level) ? "text-orange-600" : "text-slate-400"}`}>
                {human(level)}{(catalog?.high_risk_levels || []).includes(level) ? " · high risk" : ""}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {names.map((n) => (
                  <label key={n} className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input type="checkbox" checked={value.fields.includes(n)} onChange={() => set({ fields: toggle(value.fields, n) })} />
                    {n}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Record IDs *</label>
          <input value={value.recordIds} onChange={(e) => set({ recordIds: e.target.value })} placeholder="e.g. 12, 34" className={inputCls} />
          <p className="mt-1 text-xs text-slate-400">Explicit ids only — a grant is never tenant-wide.</p>
        </div>
        <div>
          <label className={labelCls}>Department IDs</label>
          <input value={value.departmentIds} onChange={(e) => set({ departmentIds: e.target.value })} placeholder="optional" className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Actions *</label>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {actions.map((a) => {
            const blocked = a === "update" && purposeCategory !== catalog?.update_requires_purpose;
            return (
              <label key={a} className={`flex items-center gap-1.5 text-sm ${blocked ? "text-slate-300" : "text-slate-600"}`}
                title={blocked ? `update needs purpose ${human(catalog?.update_requires_purpose)}` : undefined}>
                <input type="checkbox" disabled={blocked} checked={value.actions.includes(a) && !blocked}
                  onChange={() => set({ actions: toggle(value.actions, a) })} />
                {a}{(catalog?.high_risk_actions || []).includes(a) ? " *" : ""}
              </label>
            );
          })}
        </div>
        {!breakglass && <p className="mt-1 text-xs text-slate-400">* high-risk: needs a Security co-approval.</p>}
        {breakglass && <p className="mt-1 text-xs text-slate-400">Break-glass is read-only and never covers special-category data.</p>}
      </div>
    </div>
  );
}

/** The scope form -> the API's scope object, or an error message. */
function buildScope(form, catalog, purposeCategory) {
  const resource = form.resource || catalog?.resources?.[0]?.name;
  if (!resource) return { error: "Choose a resource." };
  if (!form.fields.length) return { error: "Choose at least one field." };
  const recordIds = parseIds(form.recordIds);
  if (recordIds === null || !recordIds.length) return { error: "Enter at least one record id (whole numbers, comma separated)." };
  const departmentIds = parseIds(form.departmentIds);
  if (departmentIds === null) return { error: "Department ids must be whole numbers." };
  const actions = form.actions.filter((a) => a !== "update" || purposeCategory === catalog?.update_requires_purpose);
  if (!actions.length) return { error: "Choose at least one action." };
  return {
    scope: {
      resources: [resource], record_ids: recordIds, entity_ids: [], department_ids: departmentIds, jurisdictions: [],
      fields: { [resource]: form.fields }, actions,
    },
  };
}

function riskOf(form, catalog) {
  const levels = new Map((catalog?.resources || []).flatMap((r) => r.fields.map((f) => [f.name, f.level])));
  const chosen = form.fields.map((f) => levels.get(f));
  const records = parseIds(form.recordIds) || [];
  const high = chosen.some((l) => (catalog?.high_risk_levels || []).includes(l))
    || form.actions.some((a) => (catalog?.high_risk_actions || []).includes(a))
    || records.length > (catalog?.record_threshold ?? 25);
  const needsLegalBasis = chosen.some((l) => (catalog?.legal_basis_levels || []).includes(l));
  return { high, needsLegalBasis };
}

// ── page ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export default function JitSupportAccessPage() {
  const me = getStoredUser();
  const [catalog, setCatalog] = useState(null);
  // The server publishes whether it will demand a fresh factor (HR_SUPPORT_ACCESS_MFA_REQUIRED). Until the catalog
  // lands, assume it will, so a real step-up is never silently skipped.
  const { run, dialog: stepUpDialog } = useStepUp({ required: catalog?.mfa_required !== false });
  const [tab, setTab] = useState("live");
  const [data, setData] = useState({ grants: [], detections: [], revocations: [], requests: [], queue: [], breakglass: [] });
  const [assurance, setAssurance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const [killModal, setKillModal] = useState(false);
  const [killForm, setKillForm] = useState({ scope: "GLOBAL", target: "", reason: "" });
  const [requestModal, setRequestModal] = useState(false);
  const [breakglassModal, setBreakglassModal] = useState(false);
  const [reasonModal, setReasonModal] = useState(null);   // { title, label, confirm, danger, onSubmit(reason) }
  const [decision, setDecision] = useState(null);         // a queue item being co-approved
  const [records, setRecords] = useState(null);           // { tenantId, tenantName, rows, loading, error }

  const loadData = useCallback(async () => {
    setLoading(true);
    const failed = [];
    const safe = (label, p, fallback) => p.catch((e) => { failed.push(`${label}: ${e.message || "failed"}`); return fallback; });
    const [grants, detections, revocations, requests, queue, breakglass] = await Promise.all([
      safe("Live grants", supportAccessService.grants(), []),
      safe("Detections", supportAccessService.detections(), []),
      safe("Revocations", supportAccessService.revocations(), []),
      safe("My requests", supportAccessService.myRequests(), []),
      safe("Approval queue", supportAccessService.awaitingIndependent(), []),
      safe("Break-glass", supportAccessService.activeBreakGlass(), []),
    ]);
    const list = (x) => (Array.isArray(x) ? x : []);
    setData({
      grants: list(grants), detections: list(detections), revocations: list(revocations),
      requests: list(requests), queue: list(queue), breakglass: list(breakglass),
    });
    setLoadErrors(failed);
    setLoading(false);
  }, []);

  const loadAssurance = useCallback(async () => {
    const [reconciliation, recertification, chain] = await Promise.all([
      supportAccessService.reconciliation().catch((e) => ({ error: e.message })),
      supportAccessService.recertification().catch((e) => ({ error: e.message })),
      supportAccessService.verifyAudit().catch((e) => ({ error: e.message })),
    ]);
    setAssurance({ reconciliation, recertification, chain });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (tab === "assurance") loadAssurance(); }, [tab, loadAssurance]);
  useEffect(() => {
    supportAccessService.catalog().then(setCatalog).catch((e) => setLoadErrors((l) => [...l, `Catalog: ${e.message}`]));
  }, []);

  /** Every mutating call: a fresh MFA check when asked for, one busy flag, a notice or an error, then a reload. */
  const act = async (fn, success) => {
    setBusy(true);
    setError(null);
    try {
      const res = await run(fn);
      setNotice(typeof success === "function" ? success(res) : success);
      await loadData();
      return res;
    } catch (e) {
      if (!e?.cancelled) setError(e.message || "The action failed.");
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const handleKill = async () => {
    const res = await act(
      () => supportAccessService.killSwitch({
        scope: killForm.scope,
        target: killForm.scope === "GLOBAL" ? null : String(killForm.target).trim(),
        reason: killForm.reason.trim(),
      }),
      (r) => `Kill switch (${r.scope}) revoked ${r.revoked} live grant(s).`,
    );
    if (res) {
      setKillModal(false);
      setKillForm({ scope: "GLOBAL", target: "", reason: "" });
    }
  };

  const askRevoke = (g) => setReasonModal({
    title: "Revoke grant", label: "Reason", confirm: "Revoke now", danger: true,
    initial: "revoked by platform operator",
    onSubmit: (reason) => act(() => supportAccessService.revokeGrant(g.id, reason),
      "Grant revoked. The capability is refused from the next request."),
  });

  const openRecords = async (req) => {
    setRecords({ tenantId: req.tenant_id, tenantName: req.tenant_name, rows: [], loading: true, error: null });
    try {
      const rows = await run(() => supportAccessService.supportEmployees(req.tenant_id));
      setRecords((r) => r && { ...r, rows: Array.isArray(rows) ? rows : [], loading: false });
    } catch (e) {
      setRecords((r) => r && { ...r, loading: false, error: e?.cancelled ? "Confirmation cancelled." : (e.message || "Could not read records.") });
    }
  };

  const counts = {
    live: data.grants.length + data.detections.length,
    requests: data.requests.filter((r) => OPEN_REQUEST.has(r.status)).length + data.queue.length,
    breakglass: data.breakglass.length,
    revocations: 0,
    assurance: 0,
  };

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Just-in-time support access"
        description="Request and approve time-boxed access to a tenant, watch live grants, and stop access in an emergency."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => { loadData(); if (tab === "assurance") loadAssurance(); }} disabled={loading}
              className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={() => setRequestModal(true)} disabled={!catalog}
              className="flex items-center gap-2 rounded-full bg-[#3B82F6] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2563EB] disabled:opacity-50">
              <Plus className="h-4 w-4" /> Request access
            </button>
            <button onClick={() => setKillModal(true)}
              className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
              <Radio className="h-4 w-4" /> Kill switch
            </button>
          </div>
        }
      />

      {notice && (
        <div className="flex items-center gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="ml-auto text-xs font-semibold underline">Dismiss</button>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs font-semibold underline">Dismiss</button>
        </div>
      )}
      {loadErrors.length > 0 && (
        <div className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-semibold">Some sections could not be loaded</div>
            <ul className="mt-1 list-disc pl-5 text-xs">{loadErrors.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          <button onClick={loadData} className="ml-auto text-xs font-semibold underline">Retry</button>
        </div>
      )}

      <div className="flex w-fit flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${tab === t.key ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>
            {t.label}
            {counts[t.key] > 0 && (
              <span className={`rounded-full px-1.5 text-[11px] ${tab === t.key ? "bg-white/20" : "bg-slate-100"}`}>{counts[t.key]}</span>
            )}
          </button>
        ))}
      </div>

      {loading && !data.grants.length && !data.requests.length ? (
        <div className={`${cardCls} text-center text-slate-400`}>Loading…</div>
      ) : (
        <>
          {tab === "live" && (
            <>
              <div className={cardCls}>
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  <h3 className="text-lg font-bold text-slate-800">Needs a human now</h3>
                </div>
                {data.detections.length === 0 ? (
                  <p className="text-sm text-slate-400">Nothing to review.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.detections.map((f, i) => (
                      <li key={`${f.kind}-${i}`} className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 text-sm ${SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.low}`}>
                        <span className="text-xs font-bold uppercase tracking-wider">{f.severity}</span>
                        <span className="font-semibold">{human(f.kind)}</span>
                        <span className="text-slate-600">{f.summary}</span>
                        {f.refs?.tenant_id != null && <span className="ml-auto text-xs text-slate-500">tenant #{f.refs.tenant_id}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className={cardCls}>
                <div className="mb-4 flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-[#3B82F6]" />
                  <h3 className="text-lg font-bold text-slate-800">Live grants</h3>
                </div>
                {data.grants.length === 0 ? (
                  <p className="text-sm text-slate-400">No live grants. Nobody on the platform can see tenant data right now.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <th className="px-4 py-3">Organization</th>
                          <th className="px-4 py-3">Kind</th>
                          <th className="px-4 py-3">Scope</th>
                          <th className="px-4 py-3">Issued</th>
                          <th className="px-4 py-3">Expires</th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.grants.map((g) => (
                          <tr key={g.id} className="text-sm hover:bg-slate-50/50">
                            <td className="px-4 py-4"><Tenant id={g.tenant_id} name={g.tenant_name} /></td>
                            <td className="px-4 py-4"><Pill value={g.kind} /></td>
                            <td className="px-4 py-4 text-slate-600">{scopeText(g.scope)}</td>
                            <td className="px-4 py-4 text-xs text-slate-400">{g.issued_at ? formatDateTime(g.issued_at) : "—"}</td>
                            <td className="px-4 py-4 text-xs text-slate-400">{g.expires_at ? formatDateTime(g.expires_at) : "—"}</td>
                            <td className="px-4 py-4 text-right">
                              <button onClick={() => askRevoke(g)} disabled={busy} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">
                                Revoke
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "requests" && (
            <>
              <div className={cardCls}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">My requests</h3>
                  <button onClick={() => setRequestModal(true)} disabled={!catalog} className="text-xs font-semibold text-[#3B82F6] hover:underline disabled:opacity-50">
                    + New request
                  </button>
                </div>
                {data.requests.length === 0 ? (
                  <p className="text-sm text-slate-400">You have not requested support access.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <th className="px-4 py-3">Reference</th>
                          <th className="px-4 py-3">Organization</th>
                          <th className="px-4 py-3">Purpose</th>
                          <th className="px-4 py-3">Scope</th>
                          <th className="px-4 py-3">Risk</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.requests.map((r) => (
                          <tr key={r.id} className="text-sm align-top hover:bg-slate-50/50">
                            <td className="px-4 py-4">
                              <div className="font-mono text-xs font-semibold text-slate-700">{r.reference}</div>
                              <div className="text-xs text-slate-400">{r.ticket_reference}</div>
                              <div className="text-xs text-slate-400">{r.created_at ? formatDateTime(r.created_at) : ""}</div>
                            </td>
                            <td className="px-4 py-4"><Tenant id={r.tenant_id} name={r.tenant_name} /></td>
                            <td className="px-4 py-4 max-w-xs">
                              <div className="text-xs font-semibold text-slate-500">{human(r.purpose_category)}</div>
                              <div className="truncate text-slate-600" title={r.purpose || ""}>{r.purpose}</div>
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              {scopeText(r.requested_scope)}
                              <div className="text-xs text-slate-400">{r.requested_duration_minutes} min</div>
                            </td>
                            <td className="px-4 py-4"><Pill value={r.risk_level} /></td>
                            <td className="px-4 py-4">
                              <Pill value={r.status} />
                              {r.close_reason && <div className="mt-1 max-w-[12rem] truncate text-xs text-slate-400" title={r.close_reason}>{r.close_reason}</div>}
                            </td>
                            <td className="px-4 py-4 text-right">
                              <div className="inline-flex flex-wrap justify-end gap-3">
                                {r.status === "APPROVED" && (
                                  <button disabled={busy} className="text-xs font-semibold text-emerald-600 hover:underline disabled:opacity-50"
                                    onClick={() => act(() => supportAccessService.activate(r.id), "Grant activated. It is bound to this browser session and expires on its own.")}>
                                    Activate
                                  </button>
                                )}
                                {r.status === "ACTIVE" && (
                                  <button onClick={() => openRecords(r)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#3B82F6] hover:underline">
                                    <Eye className="h-3.5 w-3.5" /> View records
                                  </button>
                                )}
                                {OPEN_REQUEST.has(r.status) && (
                                  <button disabled={busy} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                                    onClick={() => act(() => supportAccessService.cancelRequest(r.id), `Request ${r.reference} cancelled.`)}>
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className={cardCls}>
                <h3 className="mb-1 text-lg font-bold text-slate-800">Awaiting independent approval</h3>
                <p className="mb-4 text-xs text-slate-500">
                  High-risk requests the tenant has approved. A Security or Privacy approver other than the requester must co-approve before the grant can be activated.
                </p>
                {data.queue.length === 0 ? (
                  <p className="text-sm text-slate-400">Nothing is waiting for you.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.queue.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-start gap-4 rounded-2xl border border-slate-200 p-4 text-sm">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-700">{r.reference}</span>
                            <Pill value={r.risk_level} />
                            <span className="text-xs text-slate-500">{r.tenant_name || `Organization #${r.tenant_id}`}</span>
                          </div>
                          <div className="text-slate-700">{r.purpose}</div>
                          <div className="text-xs text-slate-500">{human(r.purpose_category)} · {scopeText(r.requested_scope)} · {r.requested_duration_minutes} min</div>
                          {r.legal_basis_reference && <div className="text-xs text-slate-500">Legal basis: {r.legal_basis_reference}</div>}
                          <div className="text-xs text-slate-500">
                            Needs: {(r.required_approvals || []).map((t) => (
                              <span key={t} className={`mr-2 font-semibold ${(r.approved_types || []).includes(t) ? "text-emerald-600" : "text-amber-600"}`}>
                                {human(t)} {(r.approved_types || []).includes(t) ? "✓" : "pending"}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button onClick={() => setDecision(r)} className={btnPrimary}>Review</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {tab === "breakglass" && (
            <div className={cardCls}>
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Siren className="h-5 w-5 text-red-500" />
                  <h3 className="text-lg font-bold text-slate-800">Emergency access sessions</h3>
                </div>
                <button onClick={() => setBreakglassModal(true)} disabled={!catalog}
                  className="flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                  <Siren className="h-4 w-4" /> Start break-glass
                </button>
              </div>
              <p className="mb-4 text-xs text-slate-500">Two people, read-only, at most 60 minutes, and every session is reviewed afterwards. A session grants nothing until a different engineer confirms it.</p>
              {data.breakglass.length === 0 ? (
                <p className="text-sm text-slate-400">No open emergency sessions.</p>
              ) : (
                <ul className="space-y-3">
                  {data.breakglass.map((s) => {
                    const mine = me && s.initiator_person_id === me.id;
                    return (
                      <li key={s.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 p-4 text-sm">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-700">{s.incident_reference}</span>
                            <Pill value={s.status} />
                            <span className="text-xs text-slate-500">{s.tenant_name || `Organization #${s.tenant_id}`}</span>
                          </div>
                          <div className="text-xs text-slate-500">{scopeText(s.scope)}</div>
                          <div className="text-xs text-slate-400">
                            {s.status === "PENDING_CONFIRMATION" && s.confirm_deadline && `Confirm by ${formatDateTime(s.confirm_deadline)}`}
                            {s.status === "ACTIVE" && s.expires_at && `Ends ${formatDateTime(s.expires_at)}`}
                          </div>
                        </div>
                        {s.status === "PENDING_CONFIRMATION" && (mine ? (
                          <span className="text-xs text-slate-400">Waiting for a second engineer to confirm</span>
                        ) : (
                          <button disabled={busy} className={btnDanger}
                            onClick={() => act(() => supportAccessService.confirmBreakGlass(s.id), "Break-glass confirmed: read-only access is live for at most 60 minutes.")}>
                            Confirm
                          </button>
                        ))}
                        {s.status === "ACTIVE" && (
                          <button disabled={busy} className={btnGhost}
                            onClick={() => act(() => supportAccessService.endBreakGlass(s.id), "Break-glass session ended.")}>
                            End now
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {tab === "revocations" && (
            <div className={cardCls}>
              <h3 className="mb-4 text-lg font-bold text-slate-800">Recent revocations</h3>
              {data.revocations.length === 0 ? (
                <p className="text-sm text-slate-400">No revocations yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3">Target</th>
                        <th className="px-4 py-3">Organization</th>
                        <th className="px-4 py-3">Reason</th>
                        <th className="px-4 py-3">Requested</th>
                        <th className="px-4 py-3">Propagated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.revocations.map((r) => (
                        <tr key={r.id} className="text-sm">
                          <td className="px-4 py-3">
                            <Pill value={r.target_type} />
                            <div className="mt-1 max-w-[14rem] truncate font-mono text-xs text-slate-400" title={r.target_ref || ""}>{r.target_ref || "—"}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{r.tenant_id != null ? (r.tenant_name || `#${r.tenant_id}`) : "All"}</td>
                          <td className="max-w-xs truncate px-4 py-3 text-slate-600" title={r.reason || ""}>{r.reason}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">{r.requested_at ? formatDateTime(r.requested_at) : "—"}</td>
                          <td className="px-4 py-3 text-xs">
                            {r.propagation_confirmed ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> confirmed</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> pending</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "assurance" && <AssurancePanel assurance={assurance} />}
        </>
      )}

      {requestModal && catalog && (
        <RequestModal catalog={catalog} busy={busy} onClose={() => setRequestModal(false)}
          onSubmit={async (body) => {
            const res = await act(() => supportAccessService.createRequest(body),
              (r) => `Request ${r.reference} submitted. The organization's authoriser must approve it.`);
            if (res) { setRequestModal(false); setTab("requests"); }
          }} />
      )}

      {breakglassModal && catalog && (
        <BreakglassModal catalog={catalog} busy={busy} onClose={() => setBreakglassModal(false)}
          onSubmit={async (body) => {
            const res = await act(() => supportAccessService.startBreakGlass(body),
              "Break-glass opened. A different engineer must confirm it before any access is granted.");
            if (res) { setBreakglassModal(false); setTab("breakglass"); }
          }} />
      )}

      {decision && (
        <DecisionModal request={decision} busy={busy} onClose={() => setDecision(null)}
          onSubmit={async (body) => {
            const res = await act(() => supportAccessService.independentApprove(decision.id, body),
              (r) => `Request ${r.reference} is now ${human(r.status)}.`);
            if (res) setDecision(null);
          }} />
      )}

      {reasonModal && (
        <ReasonModal {...reasonModal} busy={busy} onClose={() => setReasonModal(null)}
          onSubmit={async (reason) => { const res = await reasonModal.onSubmit(reason); if (res) setReasonModal(null); }} />
      )}

      {records && <RecordsModal records={records} onClose={() => setRecords(null)} />}

      {killModal && (
        <Modal title="Kill switch" onClose={() => setKillModal(false)}
          icon={<div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100"><Radio className="h-5 w-5 text-red-600" /></div>}
          footer={
            <>
              <button onClick={() => setKillModal(false)} className={btnGhost}>Cancel</button>
              <button onClick={handleKill}
                disabled={busy || !killForm.reason.trim() || (killForm.scope !== "GLOBAL" && !String(killForm.target).trim())}
                className={btnDanger}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Revoke now
              </button>
            </>
          }>
          <p className="mb-4 text-xs text-slate-500">Revokes every live grant in the chosen scope. Effective from the next request; cannot be undone.</p>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Scope</label>
              <select value={killForm.scope} onChange={(e) => setKillForm((f) => ({ ...f, scope: e.target.value, target: "" }))} className={inputCls}>
                <option value="GLOBAL">GLOBAL — every live grant on the platform</option>
                <option value="TENANT">TENANT — one organization</option>
                <option value="PERSON">PERSON — one platform engineer</option>
                <option value="SESSION">SESSION — one sign-in session</option>
              </select>
            </div>
            {killForm.scope === "TENANT" && (
              <div>
                <label className={labelCls}>Organization *</label>
                <OrgPicker selectedOrg={killForm.target ? { id: killForm.target, name: killForm.targetName } : null}
                  onSelect={(o) => setKillForm((f) => ({ ...f, target: o ? String(o.id) : "", targetName: o?.name }))} />
              </div>
            )}
            {(killForm.scope === "PERSON" || killForm.scope === "SESSION") && (
              <div>
                <label className={labelCls}>{killForm.scope === "PERSON" ? "Platform person id" : "Session id"} *</label>
                <input value={killForm.target} onChange={(e) => setKillForm((f) => ({ ...f, target: e.target.value }))} className={inputCls} />
              </div>
            )}
            <div>
              <label className={labelCls}>Reason *</label>
              <textarea value={killForm.reason} onChange={(e) => setKillForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Why is access being stopped?" className={`${inputCls} min-h-[80px] resize-y`} />
            </div>
          </div>
        </Modal>
      )}

      {stepUpDialog}
    </div>
  );
}

// ── modals ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function RequestModal({ catalog, busy, onClose, onSubmit }) {
  const [org, setOrg] = useState(null);
  const [form, setForm] = useState({
    ticket_reference: "", purpose: "", purpose_category: catalog.purpose_categories?.[0] || "",
    duration_minutes: String(catalog.duration?.default ?? 30), legal_basis_reference: "",
  });
  const [scopeForm, setScopeForm] = useState({ ...EMPTY_SCOPE_FORM, resource: catalog.resources?.[0]?.name || "" });
  const [formError, setFormError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const risk = riskOf(scopeForm, catalog);
  const { min = 1, max = 120 } = catalog.duration || {};

  const submit = () => {
    if (!org) return setFormError("Choose the organization.");
    if (!form.ticket_reference.trim()) return setFormError("A ticket reference is required.");
    if (form.purpose.trim().length < 10) return setFormError("Describe the purpose in at least 10 characters.");
    const minutes = Number(form.duration_minutes);
    if (!Number.isInteger(minutes) || minutes < min || minutes > max) return setFormError(`Duration must be ${min}–${max} minutes.`);
    if (risk.needsLegalBasis && !form.legal_basis_reference.trim()) return setFormError("Special-category data needs a documented legal basis reference.");
    const built = buildScope(scopeForm, catalog, form.purpose_category);
    if (built.error) return setFormError(built.error);
    setFormError(null);
    onSubmit({
      tenant_id: org.id,
      ticket_reference: form.ticket_reference.trim(),
      purpose: form.purpose.trim(),
      purpose_category: form.purpose_category,
      scope: built.scope,
      duration_minutes: minutes,
      legal_basis_reference: form.legal_basis_reference.trim() || null,
      submit: true,
    });
  };

  return (
    <Modal title="Request support access" wide onClose={onClose}
      icon={<div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50"><KeyRound className="h-5 w-5 text-[#3B82F6]" /></div>}
      footer={
        <>
          {formError && <span role="alert" className="mr-auto self-center text-xs text-red-600">{formError}</span>}
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={submit} disabled={busy} className={btnPrimary}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit request
          </button>
        </>
      }>
      <p className="mb-4 text-xs text-slate-500">
        A request grants nothing by itself. The organization's designated authoriser approves it; high-risk requests also need a Security or Privacy co-approval.
      </p>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Organization *</label>
          <OrgPicker selectedOrg={org} onSelect={setOrg} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Ticket reference *</label>
            <input value={form.ticket_reference} onChange={set("ticket_reference")} placeholder="e.g. SUP-1234" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Purpose category *</label>
            <select value={form.purpose_category} onChange={set("purpose_category")} className={inputCls}>
              {(catalog.purpose_categories || []).map((c) => <option key={c} value={c}>{human(c)}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Purpose *</label>
          <textarea value={form.purpose} onChange={set("purpose")} placeholder="What is broken and why this data is needed to fix it"
            className={`${inputCls} min-h-[70px] resize-y`} />
        </div>
        <ScopeEditor catalog={catalog} value={scopeForm} onChange={setScopeForm} purposeCategory={form.purpose_category} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Duration (minutes)</label>
            <input type="number" min={min} max={max} value={form.duration_minutes} onChange={set("duration_minutes")} className={inputCls} />
            <p className="mt-1 text-xs text-slate-400">{min}–{max} minutes after activation.</p>
          </div>
          <div>
            <label className={labelCls}>Legal basis reference{risk.needsLegalBasis ? " *" : ""}</label>
            <input value={form.legal_basis_reference} onChange={set("legal_basis_reference")} placeholder="e.g. GDPR Art. 9(2)(f)" className={inputCls} />
          </div>
        </div>
        <div className={`rounded-xl border px-4 py-2 text-xs ${risk.high ? "border-orange-200 bg-orange-50 text-orange-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
          Estimated risk: <strong>{risk.high ? "High" : "Standard"}</strong>
          {risk.high ? " — needs a Security and/or Privacy co-approval after the tenant approves." : " — the tenant's approval is enough."}
        </div>
      </div>
    </Modal>
  );
}

function BreakglassModal({ catalog, busy, onClose, onSubmit }) {
  const [org, setOrg] = useState(null);
  const [incident, setIncident] = useState("");
  const [reason, setReason] = useState("");
  const [scopeForm, setScopeForm] = useState({ ...EMPTY_SCOPE_FORM, resource: catalog.resources?.[0]?.name || "" });
  const [formError, setFormError] = useState(null);

  const submit = () => {
    if (!org) return setFormError("Choose the organization.");
    if (!incident.trim()) return setFormError("An incident reference is required.");
    if (reason.trim().length < 10) return setFormError("Give a reason of at least 10 characters.");
    const built = buildScope({ ...scopeForm, actions: scopeForm.actions.filter((a) => BREAKGLASS_ACTIONS.has(a)) }, catalog, null);
    if (built.error) return setFormError(built.error);
    setFormError(null);
    onSubmit({ tenant_id: org.id, incident_reference: incident.trim(), reason: reason.trim(), scope: built.scope });
  };

  return (
    <Modal title="Start break-glass" wide onClose={onClose}
      icon={<div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100"><Siren className="h-5 w-5 text-red-600" /></div>}
      footer={
        <>
          {formError && <span role="alert" className="mr-auto self-center text-xs text-red-600">{formError}</span>}
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={submit} disabled={busy} className={btnDanger}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Open session
          </button>
        </>
      }>
      <p className="mb-4 text-xs text-slate-500">For a live incident only. The tenant is told, a second engineer must confirm within minutes, and the session is reviewed afterwards.</p>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Organization *</label>
          <OrgPicker selectedOrg={org} onSelect={setOrg} />
        </div>
        <div>
          <label className={labelCls}>Incident reference *</label>
          <input value={incident} onChange={(e) => setIncident(e.target.value)} placeholder="e.g. INC-2026-042" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Reason *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} min-h-[70px] resize-y`} />
        </div>
        <ScopeEditor catalog={catalog} value={scopeForm} onChange={setScopeForm} breakglass />
      </div>
    </Modal>
  );
}

function DecisionModal({ request, busy, onClose, onSubmit }) {
  const pending = (request.required_approvals || []).filter((t) => !(request.approved_types || []).includes(t));
  const [type, setType] = useState(pending[0] || request.required_approvals?.[0] || "SECURITY");
  const [comment, setComment] = useState("");
  const [legal, setLegal] = useState(request.legal_basis_reference || "");

  const decide = (decision) => onSubmit({
    approval_type: type, decision, comment: comment.trim() || null,
    legal_basis_reference: type === "PRIVACY" ? (legal.trim() || null) : null,
  });

  return (
    <Modal title={`Review ${request.reference}`} onClose={onClose}
      icon={<div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50"><ShieldCheck className="h-5 w-5 text-[#3B82F6]" /></div>}
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>Close</button>
          <button onClick={() => decide("REJECTED")} disabled={busy} className={btnDanger}><XCircle className="h-4 w-4" /> Reject</button>
          <button onClick={() => decide("APPROVED")} disabled={busy} className={btnPrimary}><CheckCircle2 className="h-4 w-4" /> Approve</button>
        </>
      }>
      <dl className="mb-4 space-y-1 text-sm">
        <div><dt className="inline font-semibold text-slate-500">Organization: </dt><dd className="inline text-slate-700">{request.tenant_name || `#${request.tenant_id}`}</dd></div>
        <div><dt className="inline font-semibold text-slate-500">Purpose: </dt><dd className="inline text-slate-700">{human(request.purpose_category)} — {request.purpose}</dd></div>
        <div><dt className="inline font-semibold text-slate-500">Scope: </dt><dd className="inline text-slate-700">{scopeText(request.requested_scope)}</dd></div>
        <div><dt className="inline font-semibold text-slate-500">Duration: </dt><dd className="inline text-slate-700">{request.requested_duration_minutes} min</dd></div>
      </dl>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Approve as</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {(request.required_approvals || ["SECURITY", "PRIVACY"]).map((t) => (
              <option key={t} value={t}>{human(t)}{(request.approved_types || []).includes(t) ? " (already approved)" : ""}</option>
            ))}
          </select>
        </div>
        {type === "PRIVACY" && (
          <div>
            <label className={labelCls}>Legal basis reference</label>
            <input value={legal} onChange={(e) => setLegal(e.target.value)} className={inputCls} />
          </div>
        )}
        <div>
          <label className={labelCls}>Comment</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} className={`${inputCls} min-h-[60px] resize-y`} />
        </div>
      </div>
    </Modal>
  );
}

function ReasonModal({ title, label, confirm, danger, initial = "", busy, onClose, onSubmit }) {
  const [reason, setReason] = useState(initial);
  return (
    <Modal title={title} onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={() => onSubmit(reason.trim())} disabled={busy || !reason.trim()} className={danger ? btnDanger : btnPrimary}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {confirm}
          </button>
        </>
      }>
      <label className={labelCls}>{label} *</label>
      <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} min-h-[70px] resize-y`} />
    </Modal>
  );
}

function RecordsModal({ records, onClose }) {
  const columns = useMemo(() => {
    const keys = new Set();
    for (const row of records.rows) Object.keys(row).forEach((k) => keys.add(k));
    return [...keys];
  }, [records.rows]);
  return (
    <Modal wide title={`Records — ${records.tenantName || `Organization #${records.tenantId}`}`} onClose={onClose}
      icon={<div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50"><Eye className="h-5 w-5 text-[#3B82F6]" /></div>}>
      <p className="mb-3 text-xs text-slate-500">Only the records and fields your live grant allows. Every read is recorded and visible to the organization.</p>
      {records.loading ? (
        <div className="py-8 text-center text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
      ) : records.error ? (
        <p role="alert" className="text-sm text-red-600">{records.error}</p>
      ) : records.rows.length === 0 ? (
        <p className="text-sm text-slate-400">The grant covers no readable records.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {columns.map((c) => <th key={c} className="px-3 py-2">{c}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.rows.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => <td key={c} className="px-3 py-2 text-slate-700">{row[c] == null ? "—" : String(row[c])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function AssurancePanel({ assurance }) {
  if (!assurance) return <div className={`${cardCls} text-center text-slate-400`}>Loading…</div>;
  const { reconciliation: rec, recertification: cert, chain } = assurance;
  const ok = (v) => (v ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className={cardCls}>
        <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-800">Reconciliation {rec && !rec.error && ok(rec.ok)}</h3>
        {rec?.error ? <p className="text-sm text-red-600">{rec.error}</p> : (
          <ul className="space-y-2 text-sm">
            {(rec?.checks || []).map((c) => (
              <li key={c.check} className="flex items-center gap-2">
                {ok(c.ok)} <span className="text-slate-600">{human(c.check)}</span>
                <span className="ml-auto font-semibold text-slate-700">{c.value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={cardCls}>
        <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-800">Audit chain {chain && !chain.error && ok(chain.ok)}</h3>
        {chain?.error ? <p className="text-sm text-red-600">{chain.error}</p> : (
          <dl className="space-y-1 text-sm">
            <div><dt className="inline text-slate-500">Events: </dt><dd className="inline font-semibold text-slate-700">{chain?.count}</dd></div>
            <div><dt className="inline text-slate-500">Status: </dt><dd className="inline text-slate-700">{chain?.ok ? "Intact" : `Broken at event #${chain?.first_bad_id}`}</dd></div>
            <div className="break-all"><dt className="inline text-slate-500">Head: </dt><dd className="inline font-mono text-xs text-slate-500">{chain?.head_hash}</dd></div>
          </dl>
        )}
      </div>
      <div className={`${cardCls} lg:col-span-2`}>
        <h3 className="mb-3 text-lg font-bold text-slate-800">Recertification</h3>
        {cert?.error ? <p className="text-sm text-red-600">{cert.error}</p> : (
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Standing authorisers ({cert?.authorisers?.length || 0})</div>
              {(cert?.authorisers || []).map((a) => (
                <div key={a.id} className="text-slate-600">Tenant #{a.tenant_id} · user #{a.user_id} · {(a.scope_limits || []).map(human).join(", ")}</div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Long-lived grants ({cert?.long_lived_grants?.length || 0})</div>
              {(cert?.long_lived_grants || []).map((g, i) => <div key={g.id || i} className="text-slate-600">Tenant #{g.tenant_id} · {g.kind || ""}</div>)}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Break-glass awaiting review ({cert?.breakglass_awaiting_review?.length || 0})</div>
              {(cert?.breakglass_awaiting_review || []).map((s, i) => <div key={s.id || i} className="text-slate-600">{s.incident_reference || s.id} · tenant #{s.tenant_id}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
