/* The e-mailed exit-documents link (/exit-documents/:token): a leaver downloads a letter after the last working day,
   without signing in. GET /public/offboarding/documents/{token}; the PDF is /public/offboarding/documents/{token}/pdf. */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, Download, FileText, Loader2 } from "lucide-react";
import { getPublicExitDocument, publicExitDocumentUrl } from "../service/offboardingService";
import { formatDate } from "../utils/dateTime";

export default function ExitDocumentsPage() {
  const { token } = useParams();
  const [doc, setDoc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    getPublicExitDocument(token).then((d) => live && setDoc(d)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 px-4">
      <main className="w-full max-w-md rounded-3xl border border-white/70 bg-white/90 p-8 shadow-xl">
        {!doc && !failed && (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Opening your document…</p>
        )}
        {failed && (
          <div role="alert" className="text-center">
            <AlertCircle size={40} className="mx-auto text-amber-500" aria-hidden="true" />
            <h1 className="mt-3 text-xl font-bold text-slate-900">This link has expired or is not valid</h1>
            <p className="mt-2 text-sm text-slate-600">Ask the HR team of your former employer to send it again.</p>
          </div>
        )}
        {doc && (
          <div className="text-center">
            <FileText size={40} className="mx-auto text-blue-600" aria-hidden="true" />
            <p className="mt-3 text-sm text-slate-500">{doc.organization}</p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">{doc.title}</h1>
            <p className="mt-1 text-sm text-slate-600">For {doc.employee_name}</p>
            <a href={publicExitDocumentUrl(token)} download
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
              <Download size={16} aria-hidden="true" /> Download PDF
            </a>
            {doc.expires_at && <p className="mt-4 text-xs text-slate-500">This link works until {formatDate(doc.expires_at)}.</p>}
          </div>
        )}
      </main>
    </div>
  );
}
