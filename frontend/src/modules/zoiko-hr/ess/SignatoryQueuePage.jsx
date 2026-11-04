import { useCallback, useEffect, useId, useState } from "react";
import { ShieldCheck, AlertTriangle, RefreshCw, Eye, CheckCircle2, XCircle, FileSignature, Loader2, FileText, Inbox } from "lucide-react";
import { EmployeeDocumentsLayout } from "../documents/ui";
import { Modal } from "../../../components/billing-ui";
import SandboxedHtmlPreview from "../../../components/documents/SandboxedHtmlPreview";
import DocumentActionDialog from "../../../components/documents/DocumentActionDialog";
import { DocStatusPill, showDate, showDateTime } from "../../../components/documents/generatedDocumentMeta";
import {
  getSignatoryQueue,
  previewSignatoryDocument,
  approveGeneratedDocument,
  rejectGeneratedDocument,
} from "../../../service/docTemplatesService";

// Documents waiting for the signed-in person as an authorised signatory of the employer: an approval step that needs
// a signatory, or the employer's signature. Anyone can be a signatory (an org admin appoints them), so this page does
// not assume an HR role.

const RISK_LABEL = { L1: "Standard", L2: "Elevated", L3: "High risk" };

const cardCls = "rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]";
const btnGhost = "inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50";
const btnPrimary = "inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50";
const btnDanger = "inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50";

function PreviewDialog({ doc, onClose }) {
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    previewSignatoryDocument(doc.id)
      .then((r) => alive && setHtml(r?.html || ""))
      .catch((e) => alive && setError(e?.message || "The document could not be loaded."));
    return () => { alive = false; };
  }, [doc.id]);
  return (
    <Modal open onClose={onClose} size="xl" icon={FileText} title={doc.title || "Document"} description={doc.document_number}
      footer={<button type="button" onClick={onClose} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Close</button>}>
      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        : html === null ? <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Loading...</div>
        : <SandboxedHtmlPreview html={html} title={`${doc.title || "Document"} preview`} height="min(70vh, 720px)" />}
    </Modal>
  );
}

// Approve (optional comment) or reject (reason required) an approval step.
function DecisionDialog({ doc, decision, onClose, onDone }) {
  const id = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const reject = decision === "reject";
  const submit = async (e) => {
    e?.preventDefault?.();
    if (reject && !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (reject) await rejectGeneratedDocument(doc.id, text.trim());
      else await approveGeneratedDocument(doc.id, text.trim() || null);
      onDone(reject ? `${doc.document_number} rejected.` : `${doc.document_number} approved.`);
    } catch (err) {
      setError(err?.code === "SEPARATION_OF_DUTIES"
        ? "You cannot approve a document you requested or that is about you. Another signatory must do this."
        : err?.message || "The decision could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="md" icon={reject ? XCircle : CheckCircle2}
      title={reject ? "Reject document" : "Approve document"} description={`${doc.title} · ${doc.document_number}`}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Cancel</button>
          <button type="submit" form={`${id}-form`} disabled={busy || (reject && !text.trim())}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${reject ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500" : "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500"}`}>
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {reject ? "Reject" : "Approve"}
          </button>
        </>
      }>
      <form id={`${id}-form`} onSubmit={submit} className="space-y-3">
        <label htmlFor={`${id}-text`} className="block text-sm font-semibold text-slate-700">
          {reject ? <>Reason for rejecting <span className="text-red-600" aria-hidden="true">*</span><span className="sr-only">(required)</span></> : "Comment (optional)"}
        </label>
        <textarea id={`${id}-text`} autoFocus rows={4} maxLength={2000} required={reject} value={text} onChange={(e) => setText(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        {reject && <p className="text-xs text-slate-500">The person who requested the document will see this reason.</p>}
        {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</div>}
      </form>
    </Modal>
  );
}

export default function SignatoryQueuePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [deciding, setDeciding] = useState(null); // { doc, decision }
  const [signing, setSigning] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSignatoryQueue();
      setItems(Array.isArray(data?.items) ? data.items : []);
      setError(null);
    } catch (e) {
      setError(e?.message || "Your signatory queue could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approvals = items.filter((d) => d.my_action === "approve");
  const signatures = items.filter((d) => d.my_action === "sign");

  const renderList = (rows, kind) => (
    <ul className="space-y-3">
      {rows.map((d) => (
        <li key={d.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-slate-800">{d.title}</span>
            <DocStatusPill doc={d} />
            {d.legal_risk && <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{d.legal_risk} · {RISK_LABEL[d.legal_risk] || "risk"}</span>}
            <span className="ml-auto font-mono text-xs text-slate-500">{d.document_number}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {d.recipient_name && <>For {d.recipient_name} · </>}
            Created {showDateTime(d.created_at)}
            {d.due_by && <> · due {showDate(d.due_by)}</>}
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setPreviewing(d)} className={btnGhost}><Eye size={14} aria-hidden="true" /> Read<span className="sr-only"> {d.title}</span></button>
            {kind === "approve" ? (
              <>
                <button type="button" onClick={() => setDeciding({ doc: d, decision: "reject" })} className={btnDanger}><XCircle size={14} aria-hidden="true" /> Reject<span className="sr-only"> {d.title}</span></button>
                <button type="button" onClick={() => setDeciding({ doc: d, decision: "approve" })} className={btnPrimary}><CheckCircle2 size={14} aria-hidden="true" /> Approve<span className="sr-only"> {d.title}</span></button>
              </>
            ) : (
              <button type="button" onClick={() => setSigning(d)} className={btnPrimary}><FileSignature size={14} aria-hidden="true" /> Review & sign<span className="sr-only"> {d.title}</span></button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <EmployeeDocumentsLayout
      title="Signatory queue"
      subtitle="Documents waiting for you as an authorised signatory of the employer."
      actions={
        <button type="button" onClick={load} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
        </button>
      }
    >
      <div className="space-y-6 font-sans">
        {error && (
          <div role="alert" className="flex items-center gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" /><span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="ml-auto text-xs font-semibold text-red-700 underline">Dismiss</button>
          </div>
        )}
        {notice && (
          <div role="status" className="flex items-center gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" /><span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="ml-auto text-xs font-semibold text-emerald-800 underline">Dismiss</button>
          </div>
        )}

        <section className={cardCls} aria-labelledby="sq-approve">
          <h2 id="sq-approve" className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Waiting for your approval ({approvals.length})</h2>
          {loading ? <div role="status" className="py-8 text-center text-slate-500">Loading...</div>
            : approvals.length === 0 ? <div className="py-8 text-center text-slate-500">No documents are waiting for your approval.</div>
            : renderList(approvals, "approve")}
        </section>

        <section className={cardCls} aria-labelledby="sq-sign">
          <h2 id="sq-sign" className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Waiting for the employer's signature ({signatures.length})</h2>
          {loading ? <div role="status" className="py-8 text-center text-slate-500">Loading...</div>
            : signatures.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-slate-500">
                <Inbox className="h-8 w-8 opacity-40" aria-hidden="true" /> Nothing to sign right now.
              </div>
            ) : renderList(signatures, "sign")}
        </section>
      </div>

      {previewing && <PreviewDialog doc={previewing} onClose={() => setPreviewing(null)} />}
      {deciding && (
        <DecisionDialog
          doc={deciding.doc}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
          onDone={(msg) => { setDeciding(null); setNotice(msg); load(); }}
        />
      )}
      {signing && (
        <DocumentActionDialog
          doc={signing}
          mode="employer-sign"
          onClose={() => setSigning(null)}
          onDone={() => { setNotice(`${signing.document_number} signed for the employer.`); load(); }}
        />
      )}
    </EmployeeDocumentsLayout>
  );
}
