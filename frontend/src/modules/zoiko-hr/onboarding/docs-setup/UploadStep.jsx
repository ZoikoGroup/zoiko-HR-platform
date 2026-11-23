// Step 1: upload the company's documents in two groups.
//   Your templates      the documents to use as your own onboarding documents (offer letter, contract, NDA …); each one
//                       becomes a draft template, filled with placeholders for the hire's details and your settings.
//   Other documents     handbooks, policies, forms: read for settings only.
// Each file goes through the security checks and text reading as it is uploaded; its status is shown in words.
import { useRef, useState } from "react";
import { FileText, LayoutTemplate, Library, Loader2, Trash2, UploadCloud } from "lucide-react";
import { deleteDocsSetupFile, setDocsSetupFileLabel, uploadDocsSetupFile } from "../../../../service/docsSetupService";
import { Banner, KIND_LABELS, errorText, inputCls } from "./shared";

const ACCEPT_BY_KIND = {
  docx: ".docx,.dotx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: ".pdf,application/pdf",
  txt: ".txt,text/plain",
};
const KIND_NAME = { docx: "Word (.docx)", pdf: "PDF", txt: "text" };

export const TEMPLATE_CHOICES = [
  { value: "tpl:auto", label: "Work it out for me" },
  { value: "tpl:offer_letter", label: "Offer Letter" },
  { value: "tpl:employment_contract", label: "Employment Contract" },
  { value: "tpl:nda", label: "Non-Disclosure Agreement" },
  { value: "tpl:job_description", label: "Job Description" },
  { value: "tpl:daily_kpi", label: "Daily Key Performance Indicators" },
  { value: "tpl:exclusivity_affidavit", label: "Affidavit of Employment Exclusivity" },
  { value: "tpl:self_disclosure", label: "Self-Disclosure Declaration" },
  { value: "tpl:job_application", label: "Job Application Form" },
  { value: "tpl:daily_work_report", label: "Daily Work Report" },
  { value: "tpl:velocity_report", label: "Project Velocity Report" },
  { value: "tpl:new", label: "A new document of our own" },
];
const SOURCE_CHOICES = [
  { value: "", label: "Work it out for me" },
  { value: "handbook", label: "Handbook" },
  { value: "policy", label: "Policy" },
  { value: "form", label: "Form" },
  { value: "other", label: "Other" },
];

function DropZone({ id, accept, help, onFiles }) {
  const [over, setOver] = useState(false);
  const input = useRef(null);
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}
      className={`rounded-2xl border-2 border-dashed p-5 text-center ${over ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-gray-50/60"}`}>
      <UploadCloud className="mx-auto h-7 w-7 text-gray-400" aria-hidden="true" />
      <p className="mt-1 text-sm text-gray-700">Drag files here, or</p>
      <button type="button" onClick={() => input.current?.click()}
        className="mt-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300">
        Choose files
      </button>
      <input ref={input} id={id} type="file" multiple accept={accept} className="sr-only" aria-label={help}
        onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

function FileRow({ f, locked, onRemove, choices, onRelabel }) {
  const [saving, setSaving] = useState(false);
  const relabel = async (value) => {
    setSaving(true);
    try { await onRelabel(f.id, value); } finally { setSaving(false); }
  };
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{f.filename}</p>
          <p className="text-xs text-gray-600">
            {f.scan_status === "clean" ? "Security checks passed" : `Security check: ${f.scan_status}`}
            {" · "}{f.extract_status === "failed" ? "Text could not be read"
              : f.extract_status !== "done" ? "Reading text…"
              : (f.warnings || []).some((w) => w.code === "no_text") ? "No text found"
              : (f.warnings || []).some((w) => w.code === "ocr_used") ? "Text read from the scan" : "Text read"}
            {f.detected_kind && f.role !== "template" ? ` · Looks like: ${KIND_LABELS[f.detected_kind] || f.detected_kind}` : ""}
          </p>
          {(f.warnings || []).map((w) => (
            <p key={w.code} className={`mt-1 text-xs ${w.code === "injection_attempt" ? "text-rose-700" : "text-amber-700"}`}>{w.message}</p>
          ))}
          {!locked && (
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor={`lbl-${f.id}`} className="shrink-0 text-xs text-gray-600">{f.role === "template" ? "Which document is this?" : "What is it?"}</label>
              <select id={`lbl-${f.id}`} className={`${inputCls} py-1 text-xs sm:w-64`} disabled={saving}
                value={f.label || (f.role === "template" ? "tpl:auto" : "")} onChange={(e) => relabel(e.target.value)}>
                {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" aria-label="Saving" />}
            </div>
          )}
        </div>
        {!locked && (
          <button type="button" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-50" aria-label={`Delete ${f.filename}`}
            onClick={() => onRemove(f.id)}><Trash2 className="h-4 w-4" /></button>
        )}
      </div>
    </li>
  );
}

function Section({ icon: Icon, title, help, choices, defaultChoice, files, accept, dropHelp, locked, onRemove, onRelabel,
  onUpload, idPrefix }) {
  const [state, setState] = useState({ busy: 0, errors: [] });
  const add = async (list) => {
    const picked = Array.from(list || []);
    if (!picked.length) return;
    setState({ busy: picked.length, errors: [] });
    const errors = await onUpload(picked.map((file) => ({ file, label: defaultChoice })));
    setState({ busy: 0, errors });
  };
  return (
    <section aria-labelledby={`${idPrefix}-title`} className="space-y-3 rounded-2xl border border-gray-200 p-4">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
        <div>
          <h3 id={`${idPrefix}-title`} className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-600">{help}</p>
        </div>
      </div>
      {!locked && <DropZone id={`${idPrefix}-input`} accept={accept} help={dropHelp} onFiles={add} />}
      {state.busy > 0 && (
        <p role="status" className="inline-flex items-center gap-2 text-sm text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin" />Uploading and checking {state.busy} file{state.busy === 1 ? "" : "s"}…
        </p>
      )}
      {state.errors.map((e) => <Banner key={e} tone="error">{e}</Banner>)}
      <p className="text-xs font-medium text-gray-700">Uploaded ({files.length})</p>
      {files.length === 0 ? <p className="text-sm text-gray-500">None yet.</p> : (
        <ul className="space-y-2">
          {files.map((f) => <FileRow key={f.id} f={f} locked={locked} onRemove={onRemove} choices={choices} onRelabel={onRelabel} />)}
        </ul>
      )}
    </section>
  );
}

export default function UploadStep({ session, onSession, locked }) {
  const [errors, setErrors] = useState([]);
  const limits = session.limits || { files: 20, file_mb: 20, total_mb: 100 };
  // the server says which kinds it takes (Word and PDF unless the deployment narrows it)
  const kinds = session.file_types?.length ? session.file_types : ["docx", "pdf"];
  const wordOnly = kinds.length === 1 && kinds[0] === "docx";
  const accept = kinds.map((k) => ACCEPT_BY_KIND[k]).filter(Boolean).join(",");
  const allowedExt = kinds.flatMap((k) => (k === "docx" ? ["docx", "dotx"] : [k]));
  const files = session.files || [];

  const uploadAll = async (queue) => {
    const problems = [];
    let latest = null;
    const ready = queue.filter((item) => {
      const ext = (item.file.name.split(".").pop() || "").toLowerCase();
      if (!allowedExt.includes(ext)) {
        problems.push(`${item.file.name}: ${wordOnly ? "upload Word documents (.docx) only. Open it in Word and use Save As › Word Document." : "this file type is not accepted."}`);
        return false;
      }
      if (item.file.size > limits.file_mb * 1024 * 1024) {
        problems.push(`${item.file.name}: larger than ${limits.file_mb} MB.`);
        return false;
      }
      return true;
    });
    // three uploads at a time: each is checked and read on the server while the next one travels
    let next = 0;
    const worker = async () => {
      while (next < ready.length) {
        const item = ready[next++];
        try {
          const view = await uploadDocsSetupFile(session.id, item.file, item.label);
          if (!latest || (view?.files?.length || 0) >= (latest?.files?.length || 0)) latest = view;
        } catch (e) {
          problems.push(`${item.file.name}: ${errorText(e, "could not be uploaded.")}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, ready.length) }, worker));
    if (latest) onSession(latest);
    return problems;
  };

  const relabel = async (fileId, label) => {
    try {
      onSession(await setDocsSetupFileLabel(session.id, fileId, label));
    } catch (e) {
      setErrors([errorText(e, "The change could not be saved.")]);
    }
  };

  const remove = async (fileId) => {
    try {
      onSession(await deleteDocsSetupFile(session.id, fileId));
    } catch (e) {
      setErrors([errorText(e, "The file could not be removed.")]);
    }
  };

  const dropHelp = wordOnly ? "Word documents (.docx). An old .doc file? Open it in Word and use Save As › Word Document."
    : `${kinds.map((k) => KIND_NAME[k]).join(", ")} files.${kinds.includes("pdf") && kinds.includes("docx")
      ? " A PDF template becomes plain paragraphs and headings; upload the Word file to keep lists, tables and bold text." : ""}`;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Upload your templates and your other documents separately; each file is uploaded as soon as you choose it. We read everything together: your templates become your own
        onboarding documents, filled with placeholders for each hire's details and your company settings, and every document is
        read for settings. Up to {limits.files} files, {limits.file_mb} MB each. {dropHelp} Uploaded files are deleted 30 days after you finish.
      </p>
      {errors.map((e) => <Banner key={e} tone="error">{e}</Banner>)}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section icon={LayoutTemplate} idPrefix="tpl" title="Your templates"
          help="The documents to use as your own: offer letter, contract, NDA and so on. Say which document each one is, or let us work it out."
          choices={TEMPLATE_CHOICES} defaultChoice="tpl:auto"
          files={files.filter((f) => f.role === "template")} accept={accept}
          dropHelp="Template files" locked={locked} onRemove={remove} onRelabel={relabel} onUpload={uploadAll} />
        <Section icon={Library} idPrefix="src" title="Other documents"
          help="Handbooks, policies and forms. They are read for settings such as notice periods, leave and pay rules."
          choices={SOURCE_CHOICES} defaultChoice=""
          files={files.filter((f) => f.role !== "template")} accept={accept}
          dropHelp="Other documents" locked={locked} onRemove={remove} onRelabel={relabel} onUpload={uploadAll} />
      </div>
    </div>
  );
}
