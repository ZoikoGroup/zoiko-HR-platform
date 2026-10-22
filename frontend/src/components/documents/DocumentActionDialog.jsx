import { useEffect, useId, useRef, useState } from "react";
import { FileSignature, FileCheck2, Download, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal } from "../billing-ui";
import SandboxedHtmlPreview from "./SandboxedHtmlPreview";
import SigningSteps from "./SigningSteps";
import { DocStatusPill, showDate } from "./generatedDocumentMeta";
import {
  getSigningStatements,
  previewMyGeneratedDocument,
  previewSignatoryDocument,
  downloadGeneratedDocument,
  acknowledgeMyDocument,
  requestMySignOtp,
  signMyDocument,
  declineMyDocument,
  employerSignOtp,
  employerSign,
} from "../../service/docTemplatesService";

// One dialog for every action a person takes on an issued document:
//   mode="acknowledge"   — confirm receipt and reading (NOT a signature, NOT acceptance of terms)
//   mode="sign"          — the employee's own electronic signature (consent → code → typed / drawn), or decline
//   mode="employer-sign" — an authorised signatory signing for the employer
// The document is always read first: the sandboxed preview and the PDF are above the action.

const TITLES = {
  acknowledge: "Read & acknowledge",
  sign: "Review & sign",
  "employer-sign": "Sign for the employer",
};

export default function DocumentActionDialog({ doc, mode = "acknowledge", onClose, onDone }) {
  const uid = useId();
  const [preview, setPreview] = useState(null);
  const [statements, setStatements] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [ackChecked, setAckChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [done, setDone] = useState(null); // text of the result, announced
  const doneRef = useRef(null);
  const returnFocus = useRef(typeof document !== "undefined" ? document.activeElement : null);

  // Give focus back to whatever opened the dialog.
  useEffect(() => () => { try { returnFocus.current?.focus?.(); } catch { /* element gone */ } }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    const loadPreview = mode === "employer-sign" ? previewSignatoryDocument(doc.id) : previewMyGeneratedDocument(doc.id);
    Promise.all([loadPreview, getSigningStatements()])
      .then(([p, s]) => {
        if (!alive) return;
        setPreview(p);
        setStatements(s);
      })
      .catch((e) => alive && setLoadError(e?.message || "The document could not be loaded."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [doc.id, mode]);

  useEffect(() => { if (done) doneRef.current?.focus(); }, [done]);

  const download = async () => {
    setDownloadBusy(true);
    setActionError(null);
    try {
      await downloadGeneratedDocument(doc.id, mode === "employer-sign" ? { signatory: true } : { self: true });
    } catch (e) {
      setActionError(e?.message || "The PDF could not be downloaded.");
    } finally {
      setDownloadBusy(false);
    }
  };

  const acknowledge = async () => {
    if (!ackChecked || !statements?.acknowledgement?.version) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await acknowledgeMyDocument(doc.id, statements.acknowledgement.version);
      setDone("You have acknowledged receipt of this document. A record has been kept.");
      onDone?.(res);
    } catch (e) {
      setActionError(e?.message || "The acknowledgement could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const employer = mode === "employer-sign";
  const signApi = employer
    ? { requestOtp: () => employerSignOtp(doc.id), submit: (body) => employerSign(doc.id, body), decline: null }
    : { requestOtp: () => requestMySignOtp(doc.id), submit: (body) => signMyDocument(doc.id, body), decline: (r) => declineMyDocument(doc.id, r) };

  const footer = done ? (
    <button type="button" onClick={onClose} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
      Close
    </button>
  ) : mode === "acknowledge" && !loading && !loadError ? (
    <>
      <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        Not now
      </button>
      <button
        type="button"
        onClick={acknowledge}
        disabled={!ackChecked || busy}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FileCheck2 size={16} aria-hidden="true" />}
        Acknowledge receipt
      </button>
    </>
  ) : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={mode === "acknowledge" ? FileCheck2 : FileSignature}
      title={TITLES[mode] || "Document"}
      description={`${doc.title || "Document"}${doc.document_number ? ` · ${doc.document_number}` : ""}`}
      footer={footer}
    >
      {done ? (
        <div ref={doneRef} tabIndex={-1} role="status" className="flex flex-col items-center gap-3 py-10 text-center outline-none">
          <CheckCircle2 size={40} className="text-emerald-600" aria-hidden="true" />
          <p className="max-w-md text-base font-semibold text-slate-900">{done}</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
            <DocStatusPill doc={doc} />
            {doc.recipient_name && <span>For <strong className="text-slate-800">{doc.recipient_name}</strong></span>}
            {doc.due_by && <span>Due {showDate(doc.due_by)}</span>}
            <button
              type="button"
              onClick={download}
              disabled={downloadBusy}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              {downloadBusy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
              Download PDF
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500" role="status">
              <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Loading the document...
            </div>
          ) : loadError ? (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {loadError}
            </div>
          ) : (
            <>
              <section aria-labelledby={`${uid}-read`}>
                <h3 id={`${uid}-read`} className="mb-2 text-sm font-bold text-slate-900">Read the document</h3>
                <SandboxedHtmlPreview html={preview?.html} title={`${doc.title || "Document"} preview`} height="min(60vh, 640px)" />
              </section>

              {mode === "acknowledge" && (
                <section aria-labelledby={`${uid}-ack`} className="space-y-3">
                  <h3 id={`${uid}-ack`} className="text-sm font-bold text-slate-900">Acknowledge receipt</h3>
                  {statements?.acknowledgement?.statement && (
                    <p className="text-sm text-slate-600">{statements.acknowledgement.statement}</p>
                  )}
                  <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
                    <input
                      id={`${uid}-ack-box`}
                      type="checkbox"
                      checked={ackChecked}
                      onChange={(e) => setAckChecked(e.target.checked)}
                      className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    <label htmlFor={`${uid}-ack-box`} className="text-sm text-slate-700">
                      {statements?.acknowledgement?.text}
                      {statements?.acknowledgement?.version && (
                        <span className="mt-1 block text-xs text-slate-400">Statement {statements.acknowledgement.version}</span>
                      )}
                    </label>
                  </div>
                  {actionError && (
                    <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {actionError}
                    </div>
                  )}
                </section>
              )}

              {(mode === "sign" || employer) && (
                <section aria-labelledby={`${uid}-sign`} className="space-y-3">
                  <h3 id={`${uid}-sign`} className="text-sm font-bold text-slate-900">
                    {employer ? "Sign for the employer" : "Sign the document"}
                  </h3>
                  {actionError && (
                    <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {actionError}
                    </div>
                  )}
                  <SigningSteps
                    consent={statements?.consent}
                    needsOtp={!!doc.needs_otp}
                    expectedName={employer ? null : doc.recipient_name}
                    partyNote={employer ? "You are signing as an authorised signatory on behalf of the employer." : null}
                    requestOtp={signApi.requestOtp}
                    submit={signApi.submit}
                    decline={signApi.decline}
                    signLabel="Sign"
                    onSigned={(res) => {
                      setDone(employer ? "You have signed this document for the employer." : "You have signed this document. A copy will be available once everyone has signed.");
                      onDone?.(res);
                    }}
                    onDeclined={(res) => {
                      setDone("You have declined this document. HR has been told.");
                      onDone?.(res);
                    }}
                  />
                </section>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
