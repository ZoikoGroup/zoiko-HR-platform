// Step 3: every proposed setting next to its current value and the exact text it came from. Suggestions arrive accepted;
// the admin edits or rejects anything wrong. Where documents disagree, the value found most often is chosen and the others
// are offered as alternatives. A value that breaks its rule waits for an edit. Nothing is saved until Apply.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ExternalLink, Loader2, Pencil, X } from "lucide-react";
import { bulkDocsSetupProposals, decideDocsSetupProposal, getDocsSetupProposals, openDocsSetupSource } from "../../../../service/docsSetupService";
import { Banner, UNIT_LABELS, errorText, formatValue, inputCls } from "./shared";

const AREA_ORDER = ["Company details", "Legal & policy defaults", "Engagement profiles", "Role profiles", "Clause wording", "Offer settings"];
const REVIEW_TARGETS = new Set(["company_profile", "engagement_profile", "role_profile", "clause", "offer_setting"]);

function Editor({ p, onSave, onCancel }) {
  const v = p.final_value ?? p.proposed_value;
  const notice = v && typeof v === "object" && "unit" in v;
  const list = Array.isArray(v);
  const long = p.target === "clause" || (typeof v === "string" && v.length > 80);
  const [text, setText] = useState(notice ? String(v.value ?? "") : list ? v.join("\n") : String(v ?? ""));
  const [unit, setUnit] = useState(notice ? v.unit : "calendar_days");
  const value = () => (notice ? { value: Number(text), unit } : list ? text.split("\n").map((x) => x.trim()).filter(Boolean)
    : typeof v === "number" ? Number(text) : text);
  return (
    <div className="mt-2 space-y-2">
      {notice ? (
        <div className="flex gap-2">
          <label htmlFor={`ed-${p.id}`} className="sr-only">Notice period</label>
          <input id={`ed-${p.id}`} type="number" min={0} max={365} className={`${inputCls} w-28`} value={text} onChange={(e) => setText(e.target.value)} />
          <label htmlFor={`ed-u-${p.id}`} className="sr-only">Unit</label>
          <select id={`ed-u-${p.id}`} className={`${inputCls} w-40`} value={unit} onChange={(e) => setUnit(e.target.value)}>
            {Object.entries(UNIT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      ) : long || list ? (
        <><label htmlFor={`ed-${p.id}`} className="sr-only">New value</label>
          <textarea id={`ed-${p.id}`} rows={p.target === "clause" ? 8 : 3} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} /></>
      ) : (
        <><label htmlFor={`ed-${p.id}`} className="sr-only">New value</label>
          <input id={`ed-${p.id}`} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} /></>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave(value())} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Use this value</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}

function ProposalRow({ p, sessionId, onChanged, onError }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const decide = async (decision, finalValue) => {
    setBusy(true);
    try {
      await decideDocsSetupProposal(sessionId, p.id, decision, finalValue);
      setEditing(false);
      await onChanged();
    } catch (e) {
      onError(errorText(e, "The decision could not be saved."));
    } finally {
      setBusy(false);
    }
  };
  const accepted = p.decision === "accepted" || p.decision === "edited";
  const alternative = p.conflict_group && p.decision === "rejected";
  const status = p.problem && p.decision === "pending" ? "Needs your edit"
    : alternative ? "Other value found" : { pending: "Waiting for your decision", accepted: "Accepted", edited: "Accepted with your edit",
      rejected: "Rejected" }[p.decision];
  return (
    <li className={`rounded-xl border p-3 ${p.decision === "rejected" ? "border-gray-200 bg-gray-50"
      : p.conflict_group ? "border-amber-300 bg-amber-50/40" : accepted ? "border-emerald-200 bg-white" : "border-gray-200 bg-white"}`}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-gray-900">{p.label}</p>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="text-gray-500">Now</dt><dd className="break-words text-gray-700">{formatValue(p.current_value)}</dd>
            <dt className="text-gray-500">Proposed</dt><dd className="break-words font-medium text-gray-900 whitespace-pre-line">{formatValue(p.final_value ?? p.proposed_value)}</dd>
            <dt className="text-gray-500">Confidence</dt><dd className="text-gray-700">{Math.round((p.confidence || 0) * 100)}%{p.origin === "ai" ? " · suggested by AI, checked against the text" : p.origin === "manual" ? " · added by you" : ""}</dd>
          </dl>
          {p.problem && <p className="inline-flex items-start gap-1 text-xs text-rose-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Needs attention: {p.problem}</p>}
          {p.conflict_group && accepted && <p className="text-xs text-amber-800">Your documents disagree on this. We chose the value found most often; the other values are listed below it.</p>}
          {(p.sources || []).map((src, i) => (
            <blockquote key={`${src.file_id}-${i}`} className="rounded-lg border-l-4 border-blue-200 bg-blue-50/40 px-3 py-1.5 text-xs text-gray-700">
              <span className="block">We found this in <em>{src.filename || "your file"}</em>{src.page ? `, page ${src.page}` : ""}{src.paragraph ? `, paragraph ${src.paragraph}` : ""}:</span>
              <span className="block font-medium text-gray-900">“{src.quote}”</span>
              <button type="button" onClick={() => openDocsSetupSource(sessionId, src.file_id, { page: src.page, chunk: src.chunk_id, filename: src.filename }).catch(() => onError("The file could not be opened."))}
                className="mt-1 inline-flex items-center gap-1 text-blue-700 underline-offset-2 hover:underline">
                <ExternalLink className="h-3 w-3" />Open the file at this place
              </button>
            </blockquote>
          ))}
          {editing && <Editor p={p} onSave={(v) => decide("edited", v)} onCancel={() => setEditing(false)} />}
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:flex-row lg:flex-col">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${accepted ? "text-emerald-700" : p.problem ? "text-rose-700" : "text-gray-600"}`}>
            {accepted && <Check className="h-3.5 w-3.5" aria-hidden="true" />}{status}
          </span>
          {!accepted && !p.problem && (
            <button type="button" disabled={busy} onClick={() => decide("accepted")}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{alternative ? "Use this value instead" : "Accept"}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => setEditing(true)}
            className={`inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${p.problem && !accepted
              ? "bg-blue-600 text-white hover:bg-blue-700" : "border border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
            <Pencil className="h-4 w-4" />Edit
          </button>
          {p.decision !== "rejected" && (
            <button type="button" disabled={busy} onClick={() => decide("rejected")}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              <X className="h-4 w-4" />Reject
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function ReviewStep({ session, onSession }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [bulkBusy, setBulkBusy] = useState("");

  const load = async () => {
    const res = await getDocsSetupProposals(session.id);
    setData(res);
    onSession({ ...session, unresolved_conflicts: res.unresolved_conflicts });
  };
  useEffect(() => { load().catch((e) => setError(errorText(e, "The proposals could not be loaded."))); }, [session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const areas = useMemo(() => {
    const items = (data?.items || []).filter((p) => REVIEW_TARGETS.has(p.target));
    const by = {};
    for (const p of items) (by[p.area] = by[p.area] || []).push(p);
    return AREA_ORDER.filter((a) => by[a]).map((a) => ({ area: a, items: by[a] }))
      .concat(Object.keys(by).filter((a) => !AREA_ORDER.includes(a)).map((a) => ({ area: a, items: by[a] })));
  }, [data]);

  const acceptHigh = async (area, items) => {
    setBulkBusy(area);
    try {
      for (const target of new Set(items.map((p) => p.target))) await bulkDocsSetupProposals(session.id, target, 0.8, "accepted");
      await load();
    } catch (e) {
      setError(errorText(e, "The proposals could not be accepted."));
    } finally {
      setBulkBusy("");
    }
  };

  if (!data) return <p className="inline-flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading proposals…</p>;
  const conflicts = data.unresolved_conflicts || [];
  const reviewItems = (data.items || []).filter((p) => REVIEW_TARGETS.has(p.target));
  const disagreements = new Set(reviewItems.filter((p) => p.conflict_group).map((p) => p.conflict_group)).size;
  const needsEdit = reviewItems.filter((p) => p.problem && p.decision === "pending").length;
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Every suggestion is accepted for you. Use <strong>Edit</strong> to change a value or <strong>Reject</strong> to leave a setting as it is.
        Nothing is saved until you apply in the last step.
      </p>
      {error && <Banner tone="error">{error}</Banner>}
      {disagreements > 0 && (
        <Banner tone="info">{disagreements} setting{disagreements === 1 ? " has" : "s have"} different values in different documents (highlighted). We chose the value found most often; check them and use another value if needed.</Banner>
      )}
      {needsEdit > 0 && <Banner tone="warn">{needsEdit} value{needsEdit === 1 ? " does" : "s do"} not pass a check yet. Edit {needsEdit === 1 ? "it" : "them"} to use {needsEdit === 1 ? "it" : "them"}, or reject.</Banner>}
      {conflicts.length > 0 && (
        <Banner tone="warn">Choose one value for each highlighted setting before you continue.</Banner>
      )}
      {areas.length === 0 && <Banner tone="info">No settings were found in your documents. You can still map them to templates in the next step.</Banner>}
      {areas.map(({ area, items }) => (
        <section key={area} aria-labelledby={`area-${area}`} className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`area-${area}`} className="text-sm font-semibold text-gray-900">{area} <span className="font-normal text-gray-500">({items.length})</span></h3>
            {items.some((p) => p.decision === "pending" && !p.problem && !p.conflict_group) && (
              <button type="button" onClick={() => acceptHigh(area, items)} disabled={!!bulkBusy}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {bulkBusy === area ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Accept all
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {items.map((p) => <ProposalRow key={p.id} p={p} sessionId={session.id} onChanged={load} onError={setError} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}
