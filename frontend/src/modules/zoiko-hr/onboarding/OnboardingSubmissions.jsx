/*
 * Onboarding › Documents › All submissions: every document a new hire submitted (uploads, filled-in forms, package
 * documents) across hires, with "Needs review" first. A row opens a detail panel: in-app preview, the form's answers
 * (masked; "Reveal" only when the server allows it), signature / acknowledgement evidence, version history, approve or
 * reject with a reason, download the PDF, and download all of the hire's documents as a ZIP.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Eye, FileText, FileX2, FolderDown, Hourglass, Inbox, ShieldCheck, X } from "lucide-react";
import { EmptyState, FilterSelect, PersonCell, StatusPill, Table, shortDate, td } from "../recruitment/ui";
import {
  downloadHireDocumentsZip, downloadOnboardingDocumentFile, getOnboardingDocumentDetail, getOnboardingDocumentFile,
  getOnboardingSubmissions, reviewOnboardingDocument,
} from "../../../service/hrService";
import { openFile } from "../../../utils/fileViewer";

export const SUBMISSION_STATUSES = [
  { value: "pending", label: "Needs review", tone: "amber", icon: Inbox },
  { value: "requested", label: "Requested", tone: "blue", icon: Hourglass },
  { value: "approved", label: "Approved", tone: "green", icon: CheckCircle2 },
  { value: "rejected", label: "Rejected", tone: "red", icon: FileX2 },
];
export const SUBMISSION_TYPES = [
  { value: "upload", label: "Upload" },
  { value: "form", label: "Form" },
  { value: "package", label: "Package document" },
];
const STATUS_RANK = { pending: 0, rejected: 1, requested: 2, approved: 3 };
const MODE_LABEL = { SIGN: "Sign", ACKNOWLEDGE: "Acknowledge", COMPLETE: "Complete", INFO: "Information", VOLUNTARY: "Voluntary", UPLOAD: "Upload" };

/** "Needs review" first, then returned, requested, approved; newest submission first inside each group. */
export function sortSubmissions(items) {
  return [...items].sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
    || String(b.submitted_at || b.created_at || "").localeCompare(String(a.submitted_at || a.created_at || "")));
}

const hireOf = (d) => d.onboarding_new_hire_id;
const reviewable = (d) => !["SIGN", "ACKNOWLEDGE", "INFO", "VOLUNTARY"].includes(d?.package_mode);

function SubmissionStatus({ status }) {
  const st = SUBMISSION_STATUSES.find((s) => s.value === status);
  return <StatusPill tone={st?.tone || "gray"} icon={st?.icon}>{st?.label || status || "—"}</StatusPill>;
}

export function ReissueBadge() {
  return (
    <span data-testid="reissue-badge" className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 ring-1 ring-orange-200">
      <AlertTriangle className="h-3 w-3" />Details changed – reissue
    </span>
  );
}

const sectionCls = "rounded-2xl border border-gray-200 bg-white p-4";
const btn = "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50";

function DetailPanel({ doc, onClose, onReviewed, onError }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const load = useCallback(async (reveal = false) => {
    setLoading(true);
    try {
      setDetail(await getOnboardingDocumentDetail(doc.id, reveal));
      setRevealed(reveal);
    } catch (e) {
      onErrorRef.current(e?.message || (reveal ? "You are not allowed to reveal these answers." : "The document details could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [doc.id]);
  useEffect(() => { load(false); }, [load]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const d = { ...doc, ...(detail?.document || {}) };
  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (e) { onError(e?.message || "That did not work. Please try again."); } finally { setBusy(""); }
  };
  const preview = () => run("preview", async () => { const r = await getOnboardingDocumentFile(d.id); openFile(r.blob, r.filename || `${d.title}.pdf`, "preview"); });
  const download = () => run("download", async () => { const r = await downloadOnboardingDocumentFile(d.id); openFile(r.blob, r.filename || `${d.title}.pdf`, "download"); });
  const zip = () => run("zip", async () => { const r = await downloadHireDocumentsZip(hireOf(d)); openFile(r.blob, r.filename, "download"); });
  const approve = () => run("approve", async () => { await reviewOnboardingDocument(d.id, "approve"); onReviewed(`"${d.title}" approved.`); });
  const reject = () => {
    if (!reason.trim()) { setReasonError("Enter a reason, so the new hire knows what to fix."); return; }
    return run("reject", async () => { await reviewOnboardingDocument(d.id, "reject", reason.trim()); onReviewed(`"${d.title}" rejected. ${d.hire_name || "The new hire"} was asked to resubmit.`); });
  };

  const answers = detail?.answers;
  const ev = detail?.evidence;
  const history = detail?.history || [];
  const canReview = reviewable(d) && d.status === "pending";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={`Submission: ${d.title}`} className="relative flex h-full w-full flex-col bg-slate-50 shadow-2xl sm:max-w-[640px] sm:rounded-l-2xl">
        <header className="shrink-0 bg-gradient-to-r from-[#0A1128] to-[#111A33] px-4 py-4 text-white sm:rounded-tl-2xl sm:px-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15" aria-hidden="true"><FileText className="h-5 w-5 text-blue-300" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-lg font-semibold tracking-tight">{d.title}</h2>
              <p className="break-words text-sm text-slate-300">{[d.hire_name, d.position].filter(Boolean).join(" · ")}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          <div className={`${sectionCls} flex flex-wrap items-center gap-2`}>
            <SubmissionStatus status={d.status} />
            {d.details_changed && <ReissueBadge />}
            <span className="text-xs text-gray-500">
              {[MODE_LABEL[d.package_mode] || d.package_mode, d.version ? `Version ${d.version}` : null,
                d.submitted_at ? `Submitted ${shortDate(d.submitted_at)}` : null].filter(Boolean).join(" · ")}
            </span>
          </div>
          {d.status === "rejected" && d.rejection_reason && (
            <p className="break-words rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">Rejected: {d.rejection_reason}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={preview} disabled={!!busy} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}><Eye className="h-4 w-4" />{busy === "preview" ? "Opening…" : "Preview"}</button>
            <button type="button" onClick={download} disabled={!!busy} className={`${btn} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}><Download className="h-4 w-4" />Download PDF</button>
            {hireOf(d) && (
              <button type="button" onClick={zip} disabled={!!busy} className={`${btn} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}><FolderDown className="h-4 w-4" />{busy === "zip" ? "Preparing…" : "Download all (ZIP)"}</button>
            )}
          </div>

          {loading && !detail ? <p className="text-sm text-gray-500">Loading details…</p> : null}

          {Array.isArray(answers) && (
            <section className={sectionCls}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Answers</h3>
                {detail?.can_reveal && !revealed && (
                  <button type="button" onClick={() => load(true)} className="text-xs font-semibold text-blue-600 hover:underline">Reveal</button>
                )}
              </div>
              {answers.length === 0 ? <p className="text-sm text-gray-500">No answers recorded.</p> : (
                <dl className="divide-y divide-gray-100">
                  {answers.map((a, i) => (
                    <div key={`${a.label}-${i}`} className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-3">
                      <dt className="break-words text-xs font-medium text-gray-500">{a.label}</dt>
                      <dd className="break-words text-sm text-gray-900">{a.value === null || a.value === undefined || a.value === "" ? "—" : String(a.value)}
                        {a.masked && <span className="ml-1 text-[11px] text-gray-400">(masked)</span>}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          )}

          {ev && (
            <section className={sectionCls}>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900"><ShieldCheck className="h-4 w-4 text-emerald-600" />Evidence</h3>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                {[["Signed by", ev.signed_by], ["Signed at", ev.signed_at && shortDate(ev.signed_at)], ["Method", ev.method],
                  ["Acknowledged at", ev.acknowledged_at && shortDate(ev.acknowledged_at)], ["IP address", ev.ip]].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}><dt className="text-xs text-gray-500">{k}</dt><dd className="break-words text-gray-900">{v}</dd></div>
                ))}
              </dl>
            </section>
          )}

          {history.length > 0 && (
            <section className={sectionCls}>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Version history</h3>
              <ol className="space-y-2">
                {history.map((h) => (
                  <li key={h.version} data-testid="history-row" className="rounded-xl border border-gray-100 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">Version {h.version}</span>
                      <SubmissionStatus status={h.status} />
                      <span className="text-xs text-gray-500">{[h.submitted_at && `Submitted ${shortDate(h.submitted_at)}`,
                        h.reviewed_at && `Reviewed ${shortDate(h.reviewed_at)}${h.reviewed_by_name ? ` by ${h.reviewed_by_name}` : ""}`].filter(Boolean).join(" · ")}</span>
                    </div>
                    {h.rejection_reason && <p className="mt-1 break-words text-xs text-rose-700">Reason: {h.rejection_reason}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {rejecting && (
            <section className={sectionCls}>
              <label htmlFor="sub-reject-reason" className="mb-1 block text-sm font-medium text-gray-700">Reason for rejecting <span className="text-rose-500">*</span></label>
              <textarea id="sub-reject-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(""); }}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              {reasonError && <p role="alert" className="mt-1 text-xs text-rose-600">{reasonError}</p>}
              <p className="mt-1 text-xs text-gray-500">The new hire is emailed this reason and asked to resubmit.</p>
            </section>
          )}
        </div>
        {canReview && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
            {rejecting ? (
              <>
                <button type="button" onClick={() => setRejecting(false)} className={`${btn} border border-gray-200 bg-white text-gray-700`}>Cancel</button>
                <button type="button" onClick={reject} disabled={!!busy} className={`${btn} bg-rose-600 text-white hover:bg-rose-700`}>Reject</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setRejecting(true)} className={`${btn} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`}>Reject…</button>
                <button type="button" onClick={approve} disabled={!!busy} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>Approve</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OnboardingSubmissions({ records = [], onChanged, onError, onSuccess }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hire, setHire] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [openId, setOpenId] = useState(null);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOnboardingSubmissions({ hireId: hire, status, type });
      setItems(Array.isArray(data) ? data : data?.items || []);
    } catch (e) {
      onErrorRef.current?.(e?.message || "Submissions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [hire, status, type]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  // the server filters; the same filters apply here so a stale list never shows the wrong rows
  const rows = useMemo(() => sortSubmissions(items.filter((d) => (!hire || String(hireOf(d)) === String(hire))
    && (!status || d.status === status) && (!type || !d.kind || d.kind === type))), [items, hire, status, type]);

  const hireOptions = useMemo(() => {
    const seen = new Map();
    records.forEach((r) => seen.set(String(r.id), r.candidate_name || `New hire #${r.id}`));
    items.forEach((d) => { if (hireOf(d) && !seen.has(String(hireOf(d)))) seen.set(String(hireOf(d)), d.hire_name || `New hire #${hireOf(d)}`); });
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [records, items]);

  const open = rows.find((d) => d.id === openId) || items.find((d) => d.id === openId) || null;
  const typeLabel = (k) => SUBMISSION_TYPES.find((t) => t.value === k)?.label || k || "—";

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 px-5 py-4">
        <FilterSelect label="New hire" value={hire} onChange={setHire} allLabel="All new hires" options={hireOptions} />
        <FilterSelect label="Status" value={status} onChange={setStatus} allLabel="All statuses" options={SUBMISSION_STATUSES} />
        <FilterSelect label="Type" value={type} onChange={setType} allLabel="All types" options={SUBMISSION_TYPES} />
      </div>
      {rows.length === 0 && !loading ? (
        <EmptyState icon={Inbox} title="No submissions match the selected filters." />
      ) : (
        <Table columns={[{ label: "New hire" }, { label: "Document" }, { label: "Type" }, { label: "Mode" }, { label: "Status" },
          { label: "Submitted" }, { label: "Reviewer" }]}>
          {rows.map((d) => (
            <tr key={d.id} data-testid="submission-row" onClick={() => setOpenId(d.id)} tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") setOpenId(d.id); }} className="cursor-pointer transition-colors hover:bg-gray-50">
              <td className={td}><PersonCell name={d.hire_name || (hireOf(d) ? `New hire #${hireOf(d)}` : "Not linked")} sub={d.position || undefined} /></td>
              <td className={td}>
                <p className="break-words font-medium text-gray-900">{d.title}</p>
                {d.details_changed && <div className="mt-1"><ReissueBadge /></div>}
              </td>
              <td className={`${td} whitespace-nowrap`}>{typeLabel(d.kind)}</td>
              <td className={`${td} whitespace-nowrap`}>{MODE_LABEL[d.package_mode] || d.package_mode || "—"}</td>
              <td className={`${td} whitespace-nowrap`}><SubmissionStatus status={d.status} /></td>
              <td className={`${td} whitespace-nowrap text-gray-500`}>{d.submitted_at ? shortDate(d.submitted_at) : "—"}</td>
              <td className={`${td} whitespace-nowrap text-gray-500`}>{d.reviewed_by_name || "—"}</td>
            </tr>
          ))}
        </Table>
      )}
      {open && (
        <DetailPanel key={open.id} doc={open} onClose={() => setOpenId(null)} onError={(t) => onError?.(t)}
          onReviewed={async (msg) => { setOpenId(null); onSuccess?.(msg); await fetchItems(); onChanged?.(); }} />
      )}
    </div>
  );
}
