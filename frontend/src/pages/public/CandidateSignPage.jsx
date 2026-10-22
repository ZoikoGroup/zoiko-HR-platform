import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Loader2, CheckCircle2, XCircle, FileText, AlertTriangle } from "lucide-react";
import SandboxedHtmlPreview from "../../components/documents/SandboxedHtmlPreview";
import SigningSteps from "../../components/documents/SigningSteps";
import { showDate } from "../../components/documents/generatedDocumentMeta";
import {
  getPublicSigning,
  publicSigningPdfUrl,
  requestPublicSignOtp,
  publicSign,
  publicDecline,
} from "../../service/docTemplatesService";

// A candidate's signing page (route /sign/:token). Public: the link token is the credential, there is no login and no
// app shell. The candidate reads the document, downloads the PDF if they want, then signs (consent → e-mailed code →
// typed or drawn signature) or declines with a reason.

function usePreviewHeight() {
  const get = () => (typeof window === "undefined" ? 640 : Math.max(360, Math.min(Math.round(window.innerHeight * 0.7), 900)));
  const [h, setH] = useState(get);
  useEffect(() => {
    const onResize = () => setH(get());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return h;
}

function Shell({ children }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:space-y-6 sm:py-12">{children}</main>
    </div>
  );
}

function CenteredCard({ icon: Icon, tone = "slate", title, children }) {
  const toneCls = { slate: "text-slate-500", green: "text-emerald-600", red: "text-red-600" }[tone];
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8" role="status">
        {Icon && <Icon size={40} className={`mx-auto mb-3 ${toneCls}`} aria-hidden="true" />}
        <h1 className="mb-2 text-lg font-semibold text-slate-800">{title}</h1>
        <div className="text-sm text-slate-600">{children}</div>
      </div>
    </div>
  );
}

export default function CandidateSignPage() {
  const { token } = useParams();
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState(null); // "invalid" | message
  const [outcome, setOutcome] = useState(null); // { kind: "signed" | "declined", document_number }
  const [loadAttempt, setLoadAttempt] = useState(0);
  const previewHeight = usePreviewHeight();
  const headingRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailure(null);
    setOutcome(null);
    setView(null);
    getPublicSigning(token)
      .then((v) => alive && setView(v))
      .catch((e) => {
        if (!alive) return;
        if (e?.status === 404 || e?.status === 409 || e?.status === 410) setFailure("invalid");
        else setFailure(e?.message || "The document could not be loaded.");
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [token, loadAttempt]);

  useEffect(() => {
    if (view?.title) document.title = `${view.title} · ${view.organization_name || "Zoiko HR"}`;
  }, [view]);
  useEffect(() => { if (outcome) headingRef.current?.focus(); }, [outcome]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4" role="status">
        <Loader2 size={24} className="mr-2 animate-spin text-blue-600" aria-hidden="true" />
        <span className="text-sm text-slate-600">Loading your document...</span>
      </div>
    );
  }
  if (failure === "invalid") {
    return (
      <CenteredCard icon={AlertTriangle} title="This link is not available">
        The link is not valid, has expired, or has already been used. If you still need to sign, ask the person who sent it
        to you for a new link.
      </CenteredCard>
    );
  }
  if (failure) {
    return (
      <CenteredCard icon={AlertTriangle} tone="red" title="Something went wrong">
        <p>{failure}</p>
        <button
          type="button"
          onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Try again
        </button>
      </CenteredCard>
    );
  }

  if (outcome) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          {outcome.kind === "signed"
            ? <CheckCircle2 size={44} className="mx-auto mb-3 text-emerald-600" aria-hidden="true" />
            : <XCircle size={44} className="mx-auto mb-3 text-slate-500" aria-hidden="true" />}
          <h1 ref={headingRef} tabIndex={-1} className="mb-2 text-xl font-semibold text-slate-900 outline-none">
            {outcome.kind === "signed" ? "Thank you, you have signed" : "You have declined this document"}
          </h1>
          <p className="text-sm text-slate-600" role="status">
            {outcome.kind === "signed"
              ? `${view.title} (${outcome.document_number || view.document_number}) has been signed. ${view.organization_name || "The organization"} will send you a copy once everyone has signed.`
              : `${view.organization_name || "The organization"} has been told and will see your reason. You can close this page.`}
          </p>
        </div>
      </div>
    );
  }

  const v = view;
  return (
    <Shell>
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          {v.organization_logo ? (
            <img src={v.organization_logo} alt={`${v.organization_name || "Organization"} logo`} className="h-10 w-10 shrink-0 rounded-lg object-contain" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700" aria-hidden="true"><FileText size={20} /></span>
          )}
          <p className="min-w-0 break-words text-sm font-semibold text-slate-700">{v.organization_name}</p>
        </div>
        <h1 className="mt-3 break-words text-xl font-bold text-slate-900 sm:text-2xl">{v.title}</h1>
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-3">
          <div><dt className="inline font-medium text-slate-500">Document no. </dt><dd className="inline font-mono">{v.document_number}</dd></div>
          {v.recipient_name && <div><dt className="inline font-medium text-slate-500">For </dt><dd className="inline">{v.recipient_name}</dd></div>}
          {v.due_by && <div><dt className="inline font-medium text-slate-500">Please sign by </dt><dd className="inline">{showDate(v.due_by)}</dd></div>}
        </dl>
      </header>

      <section aria-labelledby="doc-read" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="doc-read" className="text-base font-bold text-slate-900">1. Read the document</h2>
          <a
            href={publicSigningPdfUrl(token)}
            download={`${v.document_number || "document"}.pdf`}
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Download size={16} aria-hidden="true" /> Download PDF
          </a>
        </div>
        <SandboxedHtmlPreview html={v.html} title={`${v.title} preview`} height={previewHeight} />
      </section>

      <section aria-labelledby="doc-sign" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 id="doc-sign" className="mb-3 text-base font-bold text-slate-900">2. Sign or decline</h2>
        {v.can_sign ? (
          <SigningSteps
            consent={v.consent}
            needsOtp={v.needs_otp !== false}
            expectedName={v.recipient_name}
            requestOtp={() => requestPublicSignOtp(token)}
            submit={(body) => publicSign(token, body)}
            decline={(reason) => publicDecline(token, reason)}
            onSigned={(res) => setOutcome({ kind: "signed", document_number: res?.document_number })}
            onDeclined={(res) => setOutcome({ kind: "declined", document_number: res?.document_number })}
          />
        ) : (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" role="status">
            This document cannot be signed from this link any more (its status is {String(v.status || "").toLowerCase().replace(/_/g, " ")}).
            You can still read and download it.
          </p>
        )}
      </section>

      <p className="pb-4 text-center text-xs text-slate-400">Secured by Zoiko HR</p>
    </Shell>
  );
}
