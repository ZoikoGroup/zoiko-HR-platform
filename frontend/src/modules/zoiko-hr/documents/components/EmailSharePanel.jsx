import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, Mail, Paperclip, RotateCcw, XCircle } from "lucide-react";
import { useEmailStatus, useRetryShare, useShareByEmail, useShares } from "../hooks/useCompanyDocuments";
import { getDepartments, getHrEmployees } from "../../../../service/hrService";
import { formatDateTime } from "../../../../utils/dateTime";

const asList = (raw) => (Array.isArray(raw) ? raw : raw?.items || raw?.data || raw?.list || []);
const personName = (p) => `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email || `Employee ${p.id}`;
const EMAIL_RE = /^[^@\s<>,;"']+@[^@\s<>,;"']+\.[A-Za-z]{2,}$/;
const MESSAGE_MAX = 1000;
const STATUS = {
  sent: ["Sent", "bg-emerald-50 text-emerald-700"], partial: ["Partly sent", "bg-amber-50 text-amber-800"],
  failed: ["Failed", "bg-rose-50 text-rose-700"], sending: ["Sending…", "bg-blue-50 text-blue-700"],
};
const RECIPIENT = { sent: "Sent", failed: "Failed", pending: "Waiting", skipped: "Not sent" };

export function splitEmails(text) {
  return [...new Set(String(text || "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

/**
 * The Email tab of the Share dialog (Company Documents P5). Sends a file, folder or category by email through
 * POST /hr/documents/shares/email, then shows the sending history for that target with each recipient's result and Retry.
 *
 * Portal link (default): employees only; the server refuses when someone can't open the files, and the message names
 * them; ticking "Also give them access" sends again with access granted. Attachments: download-allowed files only, up to
 * 10 MB, and the only way to reach outside addresses. SMTP settings never reach the browser: only "set up or not".
 *
 * @param {{ targetType: 'category'|'folder'|'document', targetId: number, targetName: string, onSent?: (share: object) => void }} props
 */
export default function EmailSharePanel({ targetType, targetId, targetName, onSent }) {
  const status = useEmailStatus();
  const send = useShareByEmail();
  const retry = useRetryShare();
  const history = useShares({ target_type: targetType, target_id: targetId, per_page: 10 });
  const [mode, setMode] = useState("link");
  const [picked, setPicked] = useState([]);
  const [depts, setDepts] = useState([]);
  const [search, setSearch] = useState("");
  const [outside, setOutside] = useState("");
  const [message, setMessage] = useState("");
  const [grant, setGrant] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [result, setResult] = useState(null);
  const departments = useQuery({ queryKey: ["hr", "departments", "share"], queryFn: () => getDepartments().then((r) => asList(r?.data ?? r)) });
  const people = useQuery({ queryKey: ["hr", "employees", "share"], queryFn: () => getHrEmployees({ status: "active", per_page: 200 }).then((r) => asList(r?.data ?? r)) });

  const peopleList = people.data || [];
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? peopleList.filter((p) => `${personName(p)} ${p.email || ""}`.toLowerCase().includes(q)) : peopleList;
  }, [peopleList, search]);
  const toggle = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const configured = status.data?.configured !== false;
  const maxMb = status.data?.max_attachment_mb ?? 10;

  const submit = async (e) => {
    e.preventDefault();
    const emails = mode === "attachment" ? splitEmails(outside) : [];
    const found = {};
    const bad = emails.filter((x) => !EMAIL_RE.test(x));
    if (bad.length) found.emails = `Check ${bad.length === 1 ? "this address" : "these addresses"}: ${bad.join(", ")}`;
    else if (emails.length > (status.data?.max_external ?? 20)) found.emails = `Add at most ${status.data?.max_external ?? 20} outside addresses at a time.`;
    if (!picked.length && !depts.length && !emails.length) found.recipients = "Choose at least one person, department or email address.";
    if (message.length > MESSAGE_MAX) found.message = `Keep the message under ${MESSAGE_MAX} characters.`;
    setErrors(found);
    if (Object.keys(found).length) return;
    setServerError(null);
    setResult(null);
    try {
      const share = await send.mutateAsync({
        target_type: targetType, target_id: targetId, mode, employee_ids: picked, department_ids: depts, emails,
        message: message.trim() || null, grant_portal_access: mode === "link" && grant,
      });
      setResult(share);
      setPicked([]); setDepts([]); setOutside(""); setMessage(""); setGrant(false);
      onSent?.(share);
    } catch (err) {
      setServerError({ text: err?.message || "The email was not sent.", code: err?.code });
    }
  };

  if (status.isLoading) {
    return <div role="status" className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading…</div>;
  }

  return (
    <div className="space-y-4">
      {!configured && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {status.data?.message || "Email sending isn't set up yet."}
        </p>
      )}
      <form onSubmit={submit} noValidate aria-label={`Email ${targetName}`} className="space-y-4">
        <fieldset disabled={!configured || send.isPending} className="space-y-4 disabled:opacity-60">
          <legend className="sr-only">How to send</legend>
          <div role="radiogroup" aria-label="How to send" className="grid gap-2 sm:grid-cols-2">
            {[["link", Mail, "Portal link", "Employees open it in Zoiko HR. Their access rules apply."],
              ["attachment", Paperclip, "Attach the files", `Downloadable files only, up to ${maxMb} MB. Needed for people outside the company.`]].map(([v, Icon, label, hint]) => (
              <label key={v} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${mode === v ? "border-blue-500 bg-blue-50/60 dark:bg-blue-900/20" : "border-slate-200 dark:border-[#334155]"}`}>
                <input type="radio" name="share-mode" value={v} checked={mode === v} onChange={() => setMode(v)} className="mt-0.5" />
                <span><span className="flex items-center gap-1 font-semibold"><Icon size={14} aria-hidden="true" />{label}</span>
                  <span className="block text-xs text-slate-500">{hint}</span></span>
              </label>
            ))}
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">People</p>
            <input type="search" aria-label="Search people" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-[#334155] dark:bg-[#0f172a]" />
            <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2 dark:border-[#334155]">
              {people.isLoading ? <p className="text-xs text-slate-500">Loading people…</p>
                : shown.length === 0 ? <p className="text-xs text-slate-500">No one matches.</p>
                : shown.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(picked, setPicked, p.id)} />
                    <span>{personName(p)}{!p.email && <span className="text-xs text-slate-500"> · no email address</span>}</span>
                  </label>
                ))}
            </div>
            {picked.length > 0 && <p className="mt-1 text-xs text-slate-500">{picked.length} selected</p>}
          </div>

          {(departments.data || []).length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Whole departments</p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {departments.data.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={depts.includes(d.id)} onChange={() => toggle(depts, setDepts, d.id)} /> {d.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {mode === "attachment" ? (
            <div>
              <label htmlFor="share-outside" className="text-sm font-medium text-slate-700 dark:text-slate-200">People outside the company (optional)</label>
              <textarea id="share-outside" rows={2} value={outside} onChange={(e) => setOutside(e.target.value)} placeholder="name@example.com, another@example.org"
                aria-invalid={Boolean(errors.emails)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]" />
              {errors.emails
                ? <p role="alert" className="mt-1 text-xs text-rose-700">{errors.emails}</p>
                : <p className="mt-1 text-xs text-slate-500">Separate addresses with commas or spaces. They receive the files only, never a portal link.</p>}
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">To email someone outside the company, choose “Attach the files”.</p>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={grant} onChange={(e) => setGrant(e.target.checked)} className="mt-0.5" />
                <span>Also give them access in the portal
                  <span className="block text-xs text-slate-500">For people who can't open {targetType === "document" ? "this file" : "these files"} yet. Leave it off to keep Who can see as it is.</span>
                </span>
              </label>
            </>
          )}

          <div>
            <label htmlFor="share-message" className="text-sm font-medium text-slate-700 dark:text-slate-200">Message (optional)</label>
            <textarea id="share-message" rows={3} maxLength={MESSAGE_MAX + 50} value={message} onChange={(e) => setMessage(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]" />
            <p className={`text-right text-xs ${message.length > MESSAGE_MAX ? "text-rose-700" : "text-slate-500"}`}>{message.length}/{MESSAGE_MAX}</p>
            {errors.message && <p role="alert" className="text-xs text-rose-700">{errors.message}</p>}
          </div>
        </fieldset>
        {errors.recipients && <p role="alert" className="text-xs text-rose-700">{errors.recipients}</p>}
        {serverError && (
          <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {serverError.text}
            {serverError.code === "DOC_SHARE_NO_ACCESS" && !grant && (
              <button type="button" onClick={() => setGrant(true)} className="ml-2 font-semibold underline">Tick “Also give them access”</button>
            )}
          </div>
        )}
        {result && <ResultNote share={result} />}
        <div className="flex justify-end">
          <button type="submit" disabled={!configured || send.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {send.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Mail size={16} aria-hidden="true" />} Send email
          </button>
        </div>
      </form>

      <section aria-label="Sent before" className="border-t border-slate-200 pt-3 dark:border-[#334155]">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Sent before</h3>
        {history.isLoading ? <p className="mt-1 text-xs text-slate-500">Loading…</p>
          : !(history.data?.items || []).length ? <p className="mt-1 text-xs text-slate-500">Nothing has been emailed from here yet.</p>
          : (
            <ul className="mt-2 space-y-2">
              {history.data.items.map((s) => <HistoryRow key={s.id} share={s} retrying={retry.isPending}
                onRetry={() => retry.mutateAsync(s.id).then(setResult).catch((err) => setServerError({ text: err?.message || "Retry failed." }))} />)}
            </ul>
          )}
      </section>
    </div>
  );
}

function ResultNote({ share }) {
  const { sent = 0, failed = 0, skipped = 0, pending = 0 } = share.counts || {};
  const ok = !failed && !skipped;
  return (
    <p role="status" className={`rounded-lg px-3 py-2 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
      {pending && share.status === "sending" ? `Sending to ${pending + sent} ${pending + sent === 1 ? "person" : "people"}…`
        : `Sent to ${sent} ${sent === 1 ? "person" : "people"}.`}
      {failed ? ` ${failed} failed.` : ""}{skipped ? ` ${skipped} had no email address.` : ""}
      {!ok && " See “Sent before” for the reasons; you can retry the failed ones."}
    </p>
  );
}

function HistoryRow({ share, onRetry, retrying }) {
  const [open, setOpen] = useState(false);
  const [label, tone] = STATUS[share.status] || STATUS.sent;
  const { sent = 0, failed = 0 } = share.counts || {};
  return (
    <li className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#334155]">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 font-medium hover:underline">
          {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          {formatDateTime(share.created_at)}
        </button>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>
        <span className="text-xs text-slate-500">
          {share.mode === "attachment" ? "Attachments" : "Portal link"} · {sent} sent{failed ? ` · ${failed} failed` : ""}{share.created_by ? ` · by ${share.created_by.name}` : ""}
        </span>
        {failed > 0 && (
          <button type="button" onClick={onRetry} disabled={retrying} aria-label={`Retry ${failed} failed`}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RotateCcw size={12} aria-hidden="true" /> Retry {failed} failed
          </button>
        )}
      </div>
      {open && (
        <ul className="mt-2 space-y-1 pl-5">
          {share.message && <li className="text-xs italic text-slate-600">“{share.message}”</li>}
          {share.recipients.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
              {r.status === "sent" ? <CheckCircle2 size={12} className="text-emerald-600" aria-hidden="true" />
                : <XCircle size={12} className={r.status === "pending" ? "text-slate-400" : "text-rose-600"} aria-hidden="true" />}
              <span className="font-medium">{r.name}</span>
              {r.kind === "external" && <span className="text-slate-500">outside the company</span>}
              <span className="text-slate-500">{RECIPIENT[r.status] || r.status}</span>
              {r.error && <span className="text-rose-700">— {r.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
