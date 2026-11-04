import { useId, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, ShieldAlert, Upload, Loader2, Lock, FileText } from "lucide-react";
import { verifyDocument } from "../../service/docTemplatesService";
import { showDate } from "../../components/documents/generatedDocumentMeta";

// Public check that a PDF is a document an organization really issued through Zoiko HR (route /verify/:documentNumber).
// The file is hashed in the browser (SHA-256, Web Crypto); only the document number and the first 16 hex characters of
// the hash are sent. The file itself never leaves the device.

const STATUS_TEXT = {
  ISSUED: "Issued",
  ACKNOWLEDGED: "Acknowledged by the recipient",
  EXECUTED: "Signed by all parties",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  CORRECTED: "Replaced by a corrected version",
  SUPERSEDED: "Superseded by a newer document",
  RETAINED: "Archived",
  LEGAL_HOLD: "Issued (on hold)",
};

export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function VerifyDocumentPage() {
  const params = useParams();
  const uid = useId();
  const [number, setNumber] = useState(params.documentNumber || "");
  const [code, setCode] = useState("");
  const [fileName, setFileName] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const resultRef = useRef(null);

  const check = async (hash16) => {
    if (!number.trim()) {
      setError("Enter the document number printed on the document.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await verifyDocument(number.trim(), hash16.toLowerCase());
      setResult(r);
      setTimeout(() => resultRef.current?.focus(), 0);
    } catch (e) {
      setError(e?.status === 429 ? "Too many checks. Wait a minute and try again." : e?.message || "The check could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    if (!window.crypto?.subtle) {
      setError("This browser cannot fingerprint files. Use the 16-character code instead, or a recent browser.");
      return;
    }
    setBusy(true);
    try {
      const hex = await sha256Hex(await file.arrayBuffer());
      setCode(hex.slice(0, 16));
      await check(hex.slice(0, 16));
    } catch {
      setError("The file could not be read.");
      setBusy(false);
    }
  };

  const codeOk = /^[0-9a-fA-F]{16}$/.test(code.trim());

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:py-12">
        <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700" aria-hidden="true"><ShieldCheck size={22} /></span>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Verify a document</h1>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Check that a PDF is exactly the document an organization issued through Zoiko HR, with nothing changed.
          </p>
        </header>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby={`${uid}-h`}>
          <h2 id={`${uid}-h`} className="sr-only">Check a document</h2>
          <div>
            <label htmlFor={`${uid}-num`} className="mb-1.5 block text-sm font-semibold text-slate-700">Document number</label>
            <input id={`${uid}-num`} value={number} onChange={(e) => setNumber(e.target.value)} maxLength={40} autoComplete="off"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base sm:text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-slate-700" id={`${uid}-file-l`}>The PDF you received</p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }}
              className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${dragging ? "border-blue-500 bg-blue-50" : "border-slate-300"}`}
            >
              <FileText size={28} className="mx-auto mb-2 text-slate-400" aria-hidden="true" />
              <p className="text-sm text-slate-600">{fileName ? <>Selected: <strong className="break-all">{fileName}</strong></> : "Drop the PDF here, or"}</p>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50">
                <Upload size={16} aria-hidden="true" /> {fileName ? "Choose another file" : "Choose a file"}
              </button>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-labelledby={`${uid}-file-l`}
                onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
              <Lock size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              The file never leaves your device. Your browser calculates its fingerprint (SHA-256) and only the first 16 characters are sent.
            </p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); if (codeOk) check(code.trim()); }} className="space-y-2 border-t border-slate-100 pt-4">
            <label htmlFor={`${uid}-code`} className="block text-sm font-semibold text-slate-700">Or paste the 16-character verification code</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input id={`${uid}-code`} value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 16))}
                maxLength={16} autoComplete="off" spellCheck={false} aria-describedby={`${uid}-code-h`}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base tracking-wider sm:text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              <button type="submit" disabled={!codeOk || busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50">
                {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Verify
              </button>
            </div>
            <p id={`${uid}-code-h`} className="text-xs text-slate-500">Letters a–f and digits 0–9 only.</p>
          </form>

          {busy && <p role="status" className="text-sm text-slate-600">Checking...</p>}
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        </section>

        {result && (
          <section ref={resultRef} tabIndex={-1} aria-live="polite" className="outline-none">
            {result.valid ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-6">
                <div className="flex items-center gap-2 text-emerald-800">
                  <ShieldCheck size={22} aria-hidden="true" />
                  <h2 className="text-lg font-bold">Valid: this document matches the issued version</h2>
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Issued by</dt><dd className="text-slate-900">{result.issuer_legal_name || "—"}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Document</dt><dd className="text-slate-900">{result.template_title || "—"}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Issued on</dt><dd className="text-slate-900">{result.issued_on ? showDate(result.issued_on) : "—"}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Status</dt><dd className="text-slate-900">{STATUS_TEXT[result.status] || result.status || "—"}</dd></div>
                </dl>
              </div>
            ) : (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-6">
                <div className="flex items-center gap-2 text-red-800">
                  <ShieldAlert size={22} aria-hidden="true" />
                  <h2 className="text-lg font-bold">Not verified</h2>
                </div>
                <p className="mt-2 text-sm text-red-900">
                  We could not match this file or code to the document number. The file may have been changed, it may be a
                  different version (for example the signed copy instead of the original), or the number may be wrong.
                  Ask the issuing organization for help.
                </p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
