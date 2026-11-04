// Drop-in "Generate document" button for any module screen (lifecycle, recruitment, compensation...). It runs the
// engine's preflight first, explains anything that blocks generation with a link to where it can be fixed, and only then
// creates a draft. The draft is reviewed / approved / issued on the Generated documents page.
//
//   <GenerateDocumentButton canonicalId="HR-EMP-001" subjectType="employee" subjectId={42} sourceRef="lifecycle:17" />
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ExternalLink, FilePlus2, Loader2, XCircle } from "lucide-react";
import { Modal } from "../billing-ui";
import { generateDocument, preflightDocument, reasonText } from "../../service/docTemplatesService";

const CHANNEL_TEXT = {
  portal: "Employee portal",
  email: "E-mail",
  email_link: "E-mail signing link",
  none: "Not delivered (record only)",
};

const ROLE_TEXT = { admin: "Organization admin", hr_admin: "HR admin", manager: "Manager", authorised_signatory: "Authorised signatory", signatory: "Authorised signatory", legal: "Legal" };
const RELEASE_MODE_TEXT = { PLATFORM_COUNSEL: "reviewed by platform counsel", TENANT_ATTESTED: "organization-approved" };
const roleText = (roles) => (Array.isArray(roles) ? roles : roles ? [roles] : []).map((r) => ROLE_TEXT[r] || String(r).replace(/_/g, " ")).join(" or ");
const STEP_KIND_TEXT = { APPROVER: "Approver", HR_APPROVER: "HR approver", SIGNATORY: "Signatory" };

const ENTITY_REASONS = ["NO_EMPLOYER_ENTITY", "EMPLOYER_ENTITY_INCOMPLETE", "NO_AUTHORISED_SIGNATORY", "INSUFFICIENT_APPROVERS"];
const TEMPLATE_REASONS = ["NO_ACTIVE_PACK", "NO_ACTIVE_VARIANT", "VARIANT_EXPIRED", "AMBIGUOUS_VARIANT", "CROSS_BORDER_UNRESOLVED", "LANGUAGE_NOT_APPROVED"];

// Where can this problem be fixed? Returns {to, label} or null.
function fixLink(code, { subjectType, subjectId, canonicalId }) {
  const head = String(code || "").split(":")[0];
  const field = head === "MISSING_FIELD" ? String(code).split(":")[1] || "" : head;
  const profile = subjectType === "employee" && subjectId ? `/zoiko-hr/employee-management/employees/${subjectId}` : null;
  if (head === "WORK_COUNTRY_UNKNOWN") return profile ? { to: profile, label: "Set the work country in Jurisdiction on the employee profile" } : null;
  if (/^(employment|worker)\./.test(field)) return profile ? { to: profile, label: "Complete the employee profile" } : null;
  if (/^(employer|entity|signatory)\./.test(field) || ENTITY_REASONS.includes(head)) return null;   // the legal entities page was removed: no screen to link to
  if (TEMPLATE_REASONS.includes(head)) return { to: `/zoiko-hr/documents/templates/${encodeURIComponent(canonicalId)}`, label: "Open the template" };
  return null;
}

function OutcomeBanner({ outcome }) {
  const map = {
    ALLOW: ["Ready to generate", "border-emerald-200 bg-emerald-50 text-emerald-800", CheckCircle2],
    NEEDS_LEGAL_REVIEW: ["Needs legal review before it can be generated", "border-amber-200 bg-amber-50 text-amber-900", AlertTriangle],
    DENY: ["Cannot be generated yet", "border-red-200 bg-red-50 text-red-800", XCircle],
  };
  const [text, cls, Icon] = map[outcome] || map.DENY;
  return (
    <div role="status" className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${cls}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {text}
    </div>
  );
}

function Problems({ result, ctx }) {
  const reasons = result?.reasons || [];
  const missing = result?.missing_fields || [];
  const missingAsCodes = missing.filter((f) => !reasons.includes(`MISSING_FIELD:${f}`)).map((f) => `MISSING_FIELD:${f}`);
  const all = [...reasons, ...missingAsCodes];
  if (!all.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-800">What needs fixing</h3>
      <ul className="space-y-2">
        {all.map((code) => {
          const link = fixLink(code, ctx);
          return (
            <li key={code} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <p className="text-slate-800">{reasonText(code)}</p>
              {link && (
                <Link to={link.to} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 underline-offset-2 hover:underline">
                  {link.label} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Details({ result }) {
  const chain = result.approval_policy === "L1" ? [] : result.approval_chain || [];
  const jurisdiction = [result.work_region, result.work_country].filter(Boolean).join(", ");
  const rows = [
    ["Template version", result.variant ? `v${result.variant.version} · ${RELEASE_MODE_TEXT[result.variant.release_mode] || result.variant.release_mode || "—"} · ${result.variant.language || "en"}` : "—"],
    ["Jurisdiction", jurisdiction || "—"],
    ["Approval", chain.length
      ? `Needs approval by: ${chain.map((s) => `${STEP_KIND_TEXT[s.step_kind] || s.step_kind} (${roleText(s.required_roles)})`).join(", then ")}`
      : "You can issue it yourself (L1)"],
    ...(result.signatory ? [["Signed for the employer by", result.signatory.title || `Signatory #${result.signatory.employee_id}`]] : []),
    ["Delivery", CHANNEL_TEXT[result.recipient?.channel] || result.recipient?.channel || "—"],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-medium text-slate-600">{k}</dt>
          <dd className="text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function GenerateDocumentDialog({ open, onClose, canonicalId, subjectType = "employee", subjectId, sourceRef, language = "en", effectiveDate, entityId, signatoryId, title, onGenerated }) {
  const [phase, setPhase] = useState("checking"); // checking | result | generating | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [doc, setDoc] = useState(null);

  const body = useCallback(() => {
    const b = { canonical_id: canonicalId, subject_type: subjectType, subject_id: Number(subjectId), language };
    if (sourceRef) b.source_ref = String(sourceRef);
    if (effectiveDate) b.effective_date = effectiveDate;
    if (entityId) b.entity_id = entityId;
    if (signatoryId) b.signatory_id = signatoryId;
    return b;
  }, [canonicalId, subjectType, subjectId, sourceRef, language, effectiveDate, entityId, signatoryId]);

  const runPreflight = useCallback(async () => {
    setPhase("checking"); setError(null); setResult(null); setDoc(null);
    try {
      setResult(await preflightDocument(body()));
      setPhase("result");
    } catch (e) {
      if (e.detail && (e.detail.reasons || e.detail.outcome)) { setResult(e.detail); setPhase("result"); }
      else { setError(e.message || "The check could not be run."); setPhase("error"); }
    }
  }, [body]);

  useEffect(() => { if (open) runPreflight(); }, [open, runPreflight]);

  const generate = async () => {
    setPhase("generating"); setError(null);
    try {
      const created = await generateDocument(body());
      setDoc(created);
      setPhase("done");
      onGenerated?.(created);
    } catch (e) {
      if (e.detail && (e.detail.reasons || e.detail.missing_fields)) { setResult({ ...e.detail, outcome: e.detail.outcome || "DENY" }); setPhase("result"); }
      else { setError(e.message || "The document could not be generated."); setPhase("result"); }
    }
  };

  const ctx = { subjectType, subjectId, canonicalId };
  const allowed = result?.outcome === "ALLOW";
  const btn = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60";

  return (
    <Modal
      open={open}
      onClose={phase === "generating" ? undefined : onClose}
      title={title || "Generate document"}
      description={canonicalId}
      icon={FilePlus2}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={phase === "generating"} className={`${btn} border border-gray-200 bg-white text-slate-700 hover:bg-slate-50`}>
            {phase === "done" ? "Close" : "Cancel"}
          </button>
          {phase === "result" && !allowed && (
            <button type="button" onClick={runPreflight} className={`${btn} border border-gray-200 bg-white text-slate-700 hover:bg-slate-50`}>Check again</button>
          )}
          {(phase === "result" || phase === "generating") && allowed && (
            <button type="button" onClick={generate} disabled={phase === "generating"} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
              {phase === "generating" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Generate draft
            </button>
          )}
          {phase === "done" && doc && (
            <Link to={`/zoiko-hr/documents/generated?id=${doc.id}`} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>Open document</Link>
          )}
        </>
      }
    >
      <div className="space-y-4" aria-live="polite">
        {phase === "checking" && (
          <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking everything this document needs…</p>
        )}
        {phase === "error" && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</div>
        )}
        {(phase === "result" || phase === "generating") && result && (
          <>
            <OutcomeBanner outcome={result.outcome} />
            {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</div>}
            {allowed ? <Details result={result} /> : <Problems result={result} ctx={ctx} />}
            {allowed && <p className="text-xs text-slate-600">A draft is created first. Nothing is sent to the recipient until it is issued.</p>}
          </>
        )}
        {phase === "done" && doc && (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
            <p className="font-semibold">Draft created{doc.document_number ? `: ${doc.document_number}` : ""}.</p>
            <p className="mt-1">Review it, then {doc.approval_policy === "L1" ? "issue it" : "send it for approval"} from the Generated documents page.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function GenerateDocumentButton({ canonicalId, subjectType = "employee", subjectId, sourceRef, label = "Generate document", className = "", disabled, onGenerated, ...dialogProps }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || !canonicalId || !subjectId}
        className={`inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      >
        <FilePlus2 className="h-4 w-4" aria-hidden="true" /> {label}
      </button>
      <GenerateDocumentDialog
        open={open}
        onClose={() => setOpen(false)}
        canonicalId={canonicalId}
        subjectType={subjectType}
        subjectId={subjectId}
        sourceRef={sourceRef}
        onGenerated={onGenerated}
        {...dialogProps}
      />
    </>
  );
}
