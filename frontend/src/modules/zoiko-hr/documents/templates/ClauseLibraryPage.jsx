// Clause library: jurisdiction-specific clause texts referenced by templates as {{clause:key}}, with their lifecycle.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, GitBranch, History, Info, Loader2, Pencil, Plus, Rocket, Send, ShieldCheck } from "lucide-react";
import HRPage from "../../../../components/HRPage";
import { Modal } from "../../../../components/billing-ui";
import { clauseAction, listClauses, listPacks, listTemplateFields } from "../../../../service/docTemplatesService";
import ClauseFormModal from "./components/ClauseFormModal";
import {
  ErrorBanner, InfoBanner, Spinner, StatusBadge, TEMPLATES_PATH, btnDanger, btnPrimary, btnSecondary, btnSmall, cardClass,
  errorMessage, fmtDate, fmtDateTime, inputClass, useCurrentUser, useToast,
} from "./components/ui";

const STATUSES = ["IN_DRAFT", "LEGAL_REVIEW", "LEGAL_APPROVED", "ACTIVE", "SUSPENDED", "RETIRED"];

function packText(p, id) {
  return p ? `${p.country}${p.region ? ` · ${p.region}` : ""} (${p.owner === "organization" ? "organization" : "platform"})` : `Pack #${id}`;
}

export default function ClauseLibraryPage() {
  const me = useCurrentUser();
  const [toastNode, showToast] = useToast();
  const [clauses, setClauses] = useState([]);
  const [total, setTotal] = useState(0);
  const [packs, setPacks] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [packId, setPackId] = useState("");
  const [keyFilter, setKeyFilter] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState(null); // { mode, initial }
  const [approveFor, setApproveFor] = useState(null);
  const [attest, setAttest] = useState(false);
  const [confirm, setConfirm] = useState(null); // { clause, action }
  const [history, setHistory] = useState(null); // { key, pack_id, items, loading }

  useEffect(() => {
    listPacks({ per_page: 200 }).then((r) => setPacks(r?.items || [])).catch(() => {});
    listTemplateFields().then((r) => setFields((r?.items || []).filter((f) => !f.system_only))).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true); setError("");
    return listClauses({ pack_id: packId || undefined, clause_key: keyFilter.trim() || undefined, status: status || undefined, per_page: 200 })
      .then((r) => { setClauses(r?.items || []); setTotal(r?.total || 0); })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [packId, keyFilter, status]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const packById = useMemo(() => Object.fromEntries(packs.map((p) => [p.id, p])), [packs]);

  const act = async (c, action, body, success) => {
    setBusyId(c.id);
    try {
      await clauseAction(c.id, action, body);
      showToast("success", success);
      await load();
      return true;
    } catch (e) {
      showToast("error", errorMessage(e));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const openHistory = async (c) => {
    setHistory({ key: c.clause_key, pack_id: c.pack_id, items: [], loading: true });
    try {
      const r = await listClauses({ clause_key: c.clause_key, pack_id: c.pack_id, per_page: 200 });
      setHistory({ key: c.clause_key, pack_id: c.pack_id, items: r?.items || [], loading: false });
    } catch (e) {
      setHistory(null);
      showToast("error", errorMessage(e));
    }
  };

  const approveWhy = (c) => {
    if (!me.isOrgAdmin) return "Only an organization admin can approve clauses.";
    if (c.authored_by === me.id) return "You wrote this clause, so someone else must approve it.";
    return "";
  };
  const releaseWhy = (c) => {
    if (!me.isOrgAdmin) return "Only an organization admin can release clauses.";
    if (c.authored_by === me.id) return "You wrote this clause, so someone else must release it.";
    if (c.reviewed_by === me.id) return "You approved this clause, so someone else must release it.";
    return "";
  };

  const actions = (c) => {
    if (c.owner !== "organization") return <span className="text-xs text-gray-500">Read-only (platform)</span>;
    const busy = busyId === c.id;
    const notes = [];
    const out = [];
    if (c.status === "IN_DRAFT") {
      out.push(<button key="e" type="button" className={btnSmall} disabled={busy} onClick={() => setForm({ mode: "edit", initial: c })}><Pencil className="h-3.5 w-3.5" /> Edit</button>);
      out.push(<button key="s" type="button" className={btnSmall} disabled={busy} onClick={() => act(c, "submit", {}, "Clause submitted for review.")}><Send className="h-3.5 w-3.5" /> Submit</button>);
    }
    if (c.status === "LEGAL_REVIEW") {
      const why = approveWhy(c);
      out.push(<button key="a" type="button" className={btnSmall} disabled={busy || !!why} onClick={() => { setAttest(false); setApproveFor(c); }}><ShieldCheck className="h-3.5 w-3.5" /> Approve</button>);
      if (why) notes.push(why);
    }
    if (c.status === "LEGAL_APPROVED") {
      const why = releaseWhy(c);
      out.push(<button key="r" type="button" className={btnSmall} disabled={busy || !!why} onClick={() => act(c, "release", {}, "Clause released.")}><Rocket className="h-3.5 w-3.5" /> Release</button>);
      if (why) notes.push(why);
    }
    if (c.status === "ACTIVE") out.push(<button key="su" type="button" className={btnSmall} disabled={busy} onClick={() => setConfirm({ clause: c, action: "suspend" })}>Suspend</button>);
    if (c.status === "ACTIVE" || c.status === "SUSPENDED") out.push(<button key="re" type="button" className={btnSmall} disabled={busy} onClick={() => setConfirm({ clause: c, action: "retire" })}>Retire</button>);
    if (["ACTIVE", "SUSPENDED", "RETIRED"].includes(c.status)) {
      out.push(<button key="nv" type="button" className={btnSmall} disabled={busy} onClick={() => setForm({ mode: "new-version", initial: c })}><GitBranch className="h-3.5 w-3.5" /> New version</button>);
    }
    out.push(<button key="h" type="button" className={btnSmall} onClick={() => openHistory(c)}><History className="h-3.5 w-3.5" /> History</button>);
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-500" aria-label="Working" />}
        {out}
        {notes.map((n) => <p key={n} className="w-full text-xs text-amber-700">{n}</p>)}
      </div>
    );
  };

  return (
    <HRPage title="Clause library" subtitle="Jurisdiction-specific clause texts that templates include with {{clause:key}}."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link to={TEMPLATES_PATH} className={btnSecondary}><ArrowLeft className="h-4 w-4" /> Templates</Link>
          <button type="button" className={btnPrimary} onClick={() => setForm({ mode: "create", initial: null })}><Plus className="h-4 w-4" /> New clause</button>
        </div>
      }>
      <InfoBanner icon={Info}>
        <p className="font-semibold">Separation of duties</p>
        <p>A clause is written, approved and released by three steps: the author cannot approve it, and the person who releases it must be
          neither the author nor the approver. Only organization admins can approve and release. Releasing a new version retires the previous active one.</p>
      </InfoBanner>

      <section className={cardClass} aria-label="Clauses">
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div>
            <label htmlFor="cl-f-pack" className="mb-1 block text-xs font-semibold text-gray-600">Jurisdiction pack</label>
            <select id="cl-f-pack" className={inputClass} value={packId} onChange={(e) => setPackId(e.target.value)}>
              <option value="">All packs</option>
              {packs.map((p) => <option key={p.id} value={p.id}>{packText(p, p.id)} · {p.status}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cl-f-key" className="mb-1 block text-xs font-semibold text-gray-600">Clause key (exact)</label>
            <input id="cl-f-key" type="search" className={inputClass} placeholder="e.g. notice_period" value={keyFilter} onChange={(e) => setKeyFilter(e.target.value)} />
          </div>
          <div>
            <label htmlFor="cl-f-status" className="mb-1 block text-xs font-semibold text-gray-600">Status</label>
            <select id="cl-f-status" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ").toLowerCase()}</option>)}
            </select>
          </div>
        </div>

        <ErrorBanner error={error} />
        {loading ? <Spinner label="Loading clauses…" /> : clauses.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">No clauses match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Clauses</caption>
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                  <th scope="col" className="px-2 py-2">Clause</th>
                  <th scope="col" className="px-2 py-2">Pack</th>
                  <th scope="col" className="px-2 py-2">Version / status</th>
                  <th scope="col" className="px-2 py-2">Text</th>
                  <th scope="col" className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clauses.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 align-top last:border-0">
                    <td className="px-2 py-3">
                      <code className="font-semibold text-gray-900">{c.clause_key}</code>
                      {c.title && <div className="text-xs text-gray-600">{c.title}</div>}
                    </td>
                    <td className="px-2 py-3 text-xs text-gray-700">{packText(packById[c.pack_id], c.pack_id)}</td>
                    <td className="px-2 py-3">
                      <div className="text-xs text-gray-600">v{c.version} · {c.language}</div>
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="max-w-md px-2 py-3 text-xs text-gray-600"><p className="line-clamp-3 whitespace-pre-wrap">{c.text}</p></td>
                    <td className="px-2 py-3">{actions(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {total > clauses.length && <p className="mt-3 text-xs text-gray-500">Showing the first {clauses.length} of {total}. Narrow the filters to see more.</p>}
          </div>
        )}
      </section>

      <ClauseFormModal open={!!form} mode={form?.mode} initial={form?.initial} packs={packs} fields={fields}
        onClose={() => setForm(null)}
        onSaved={() => { setForm(null); showToast("success", "Clause draft saved."); load(); }} />

      <Modal open={!!approveFor} onClose={() => setApproveFor(null)} title={`Approve ${approveFor?.clause_key} v${approveFor?.version}`} icon={ShieldCheck} size="md"
        footer={<>
          <button type="button" className={btnSecondary} onClick={() => setApproveFor(null)}>Cancel</button>
          <button type="button" className={btnPrimary} disabled={!attest || busyId === approveFor?.id}
            onClick={async () => { if (await act(approveFor, "approve", { attestation_accepted: true }, "Clause approved.")) setApproveFor(null); }}>
            {busyId === approveFor?.id && <Loader2 className="h-4 w-4 animate-spin" />} Approve
          </button>
        </>}>
        {approveFor && (
          <div className="space-y-3">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800">{approveFor.text}</pre>
            <label className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
              <span>I have reviewed this clause for use in {packById[approveFor.pack_id]?.country || "this jurisdiction"} and accept responsibility for its content.</span>
            </label>
          </div>
        )}
      </Modal>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} size="sm"
        title={confirm?.action === "suspend" ? `Suspend ${confirm?.clause.clause_key}?` : `Retire ${confirm?.clause.clause_key}?`}
        description={confirm?.action === "suspend"
          ? "Templates that require this clause will be blocked in this pack until it is reinstated by a new released version."
          : "A retired clause version can never be used again."}
        footer={<>
          <button type="button" className={btnSecondary} onClick={() => setConfirm(null)}>Cancel</button>
          <button type="button" className={btnDanger} onClick={() => { const { clause, action } = confirm; setConfirm(null); act(clause, action, {}, action === "suspend" ? "Clause suspended." : "Clause retired."); }}>
            {confirm?.action === "suspend" ? "Suspend" : "Retire"}
          </button>
        </>}>
        <p className="text-sm text-gray-700">This is recorded in the audit trail.</p>
      </Modal>

      <Modal open={!!history} onClose={() => setHistory(null)} size="lg" icon={History}
        title={`Version history: ${history?.key || ""}`} description={history ? packText(packById[history.pack_id], history.pack_id) : ""}>
        {history?.loading ? <Spinner /> : (
          <ol className="space-y-3">
            {(history?.items || []).map((c) => (
              <li key={c.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">Version {c.version}</span>
                  <StatusBadge status={c.status} />
                  <span className="text-xs text-gray-500">created {fmtDateTime(c.created_at)} · effective {fmtDate(c.effective_from)} – {c.effective_to ? fmtDate(c.effective_to) : "open"}</span>
                </div>
                {c.change_reason && <p className="mt-1 text-xs text-gray-600">Reason: {c.change_reason}</p>}
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-700">{c.text}</pre>
              </li>
            ))}
            {history && !history.loading && history.items.length === 0 && <li className="text-sm text-gray-500">No versions.</li>}
          </ol>
        )}
      </Modal>

      {toastNode}
    </HRPage>
  );
}
