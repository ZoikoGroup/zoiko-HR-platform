import { useEffect, useState } from "react";
import { FileSignature, ExternalLink, Loader2, ShieldCheck, Clock } from "lucide-react";
import { downloadGeneratedDocument, signatureImageUrl } from "../../service/docTemplatesService";
import { showDateTime } from "./generatedDocumentMeta";

// The onboarding documents a new hire has signed, as org admins see them: each document with the signature itself (the
// drawn image, or the typed name in a signature style), who signed, when, how it was verified, and the signed PDF.

function SignatureMark({ signature }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!signature.has_image) return undefined;
    let alive = true;
    let url = null;
    signatureImageUrl(signature.id)
      .then((u) => { url = u; if (alive) setSrc(u); else URL.revokeObjectURL(u); })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [signature.id, signature.has_image]);

  if (signature.has_image && !failed) {
    return src
      ? <img src={src} alt={`Signature of ${signature.name}`} className="h-12 max-w-full object-contain object-left" />
      : <Loader2 className="h-4 w-4 animate-spin text-gray-300" aria-label="Loading signature" />;
  }
  return (
    <span className="block truncate text-2xl leading-tight text-blue-900" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontStyle: "italic" }}
      aria-label={`Typed signature: ${signature.name}`}>
      {signature.name}
    </span>
  );
}

function SignedDocumentCard({ doc }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadGeneratedDocument(doc.id);
    } catch (e) {
      setError(e?.message || "The signed PDF could not be opened.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-gray-200 bg-white">
      <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-gray-900">{doc.title}</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-gray-400">{doc.document_number}</p>
        </div>
        {doc.fully_signed ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Signed
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
            <Clock className="h-3 w-3" aria-hidden="true" /> Awaiting other signatures
          </span>
        )}
      </div>
      <div className="flex-1 space-y-3 px-4 py-3">
        {doc.signatures.map((s) => (
          <div key={s.id}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">{s.party}</p>
            <div className="mt-1 flex h-14 items-end border-b border-gray-300 pb-1"><SignatureMark signature={s} /></div>
            <p className="mt-1.5 text-sm font-medium text-gray-800">{s.name}</p>
            <p className="text-xs text-gray-500">
              {showDateTime(s.signed_at)} · {s.method === "DRAWN" ? "Drawn" : "Typed"}{s.otp_verified ? " · e-mail code verified" : ""}
            </p>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 px-4 py-2.5">
        <button type="button" onClick={open} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
          View signed PDF<span className="sr-only">: {doc.title}</span>
        </button>
        {error && <p role="alert" className="mt-1 text-xs text-rose-600">{error}</p>}
      </div>
    </li>
  );
}

export default function SignedDocumentsPanel({ documents = [] }) {
  if (!documents.length) return null;
  return (
    <div className="border-b border-gray-100 bg-blue-50/30 px-4 py-4 sm:px-5" data-testid="signed-documents">
      <div className="mb-3 flex items-center gap-2">
        <FileSignature className="h-4 w-4 text-blue-600" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-gray-900">Signed documents</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-200">{documents.length}</span>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {documents.map((d) => <SignedDocumentCard key={d.id} doc={d} />)}
      </ul>
    </div>
  );
}
