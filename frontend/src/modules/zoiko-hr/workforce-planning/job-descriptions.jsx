import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Check, FileText, Plus, RefreshCw, Save } from "lucide-react";
import HRPage from "../../../components/HRPage";
import GenerateDocumentButton from "../../../components/documents/GenerateDocumentButton";
import { getDepartments, getDesignations, getPayGrades } from "../../../service/hrService";
import {
  checkJobDescriptionLanguage,
  createJobDescription,
  createJobDescriptionVersion,
  decideJobDescription,
  getJobDescription,
  getJobDescriptions,
  submitJobDescription,
  updateJobDescription,
} from "../../../service/workforcePlanningService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/workforce-planning" },
  { label: "Plans", href: "/zoiko-hr/workforce-planning/plans" },
  { label: "Headcount", href: "/zoiko-hr/workforce-planning/headcount" },
  { label: "Job descriptions", href: "/zoiko-hr/workforce-planning/job-descriptions" },
  { label: "Succession", href: "/zoiko-hr/workforce-planning/succession" },
  { label: "Reports", href: "/zoiko-hr/workforce-planning/reports" },
];

const emptyForm = () => ({
  designation_id: "", title: "", purpose: "", key_responsibilities: "", requirements_essential: "",
  requirements_desirable: "", department_id: "", reporting_to_designation_id: "", direct_reports_summary: "",
  work_location: "", work_arrangement: "", pay_grade_id: "", physical_requirements: "",
});
const arrayFields = new Set(["key_responsibilities", "requirements_essential", "requirements_desirable"]);
const formFromRecord = (record = {}) => Object.fromEntries(
  Object.keys(emptyForm()).map((key) => [key, arrayFields.has(key) ? (Array.isArray(record[key]) ? record[key] : []).join("\n") : record[key] == null ? "" : String(record[key])]),
);
const toPayload = (form) => Object.fromEntries(Object.entries(form).map(([key, value]) => {
  if (arrayFields.has(key)) return [key, value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)];
  if (["designation_id", "department_id", "reporting_to_designation_id", "pay_grade_id"].includes(key)) return [key, value ? Number(value) : null];
  return [key, value.trim() || null];
}));
const inputClass = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";

export default function JobDescriptionsPage() {
  const [items, setItems] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [payGrades, setPayGrades] = useState([]);
  const [active, setActive] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [flags, setFlags] = useState(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (keepId) => {
    setLoading(true);
    try {
      const result = await getJobDescriptions();
      const rows = result?.items || [];
      setItems(rows);
      if (keepId) {
        const current = rows.find((row) => row.id === keepId) || await getJobDescription(keepId);
        if (current) { setActive(current); setForm(formFromRecord(current)); }
      } else if (active) {
        const current = rows.find((row) => row.id === active.id);
        if (current) { setActive(current); setForm(formFromRecord(current)); }
      }
    } catch (e) { setError(e.message || "Unable to load job descriptions."); }
    finally { setLoading(false); }
  }, [active]);

  useEffect(() => {
    refresh();
    Promise.all([getDesignations(), getDepartments(), getPayGrades()])
      .then(([designationResponse, departmentResponse, payGradeResponse]) => {
        const rows = (value) => Array.isArray(value) ? value : value?.items || value?.data || [];
        setDesignations(rows(designationResponse));
        setDepartments(rows(departmentResponse));
        setPayGrades(rows(payGradeResponse));
      })
      .catch(() => {});
  }, []);

  const run = async (action, success) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await action();
      const saved = result?.id ? result : active;
      if (saved) {
        setActive(saved);
        setForm(formFromRecord(saved));
        await refresh(saved.id);
      } else await refresh();
      setFlags(null);
      setNotice(success);
      return result;
    } catch (e) { setError(e.message || "The job description could not be saved."); return null; }
    finally { setBusy(false); }
  };

  const startNew = () => { setActive(null); setForm(emptyForm()); setFlags(null); setError(""); setNotice(""); };
  const choose = (item) => { setActive(item); setForm(formFromRecord(item)); setFlags(item.language_flags || null); setError(""); setNotice(""); };
  const save = () => run(
    () => active ? updateJobDescription(active.id, toPayload(form)) : createJobDescription(toPayload(form)),
    active ? "Draft saved." : "Job description created.",
  );
  const checkLanguage = async () => {
    const saved = await save();
    if (!saved?.id) return;
    setBusy(true); setError("");
    try { setFlags((await checkJobDescriptionLanguage(saved.id))?.flags || []); }
    catch (e) { setError(e.message || "Inclusive-language check failed."); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    const saved = await save();
    if (saved?.id) await run(() => submitJobDescription(saved.id), "Submitted for approval.");
  };
  const decide = (approve) => run(
    () => decideJobDescription(active.id, { approve, comment: decisionComment.trim() || null }),
    approve ? "Job description approved." : "Job description returned for revision.",
  ).then((result) => { if (result) setDecisionComment(""); });
  const newVersion = () => run(() => createJobDescriptionVersion(active.id), "New draft version created.");
  const field = (key, label, { rows, options, choices } = {}) => (
    <label key={key} className="block text-sm font-medium text-gray-700">
      {label}
      {options ? (
        <select className={inputClass} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} disabled={!canEdit}>
          <option value="">Not specified</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : choices ? (
        <select className={inputClass} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} disabled={!canEdit}>
          <option value="">Not specified</option>
          {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
      ) : rows ? (
        <textarea className={inputClass} rows={rows} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} disabled={!canEdit} />
      ) : (
        <input className={inputClass} type={key.endsWith("_id") ? "number" : "text"} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} disabled={!canEdit} />
      )}
    </label>
  );
  const canEdit = !active || active.status === "DRAFT";
  const choices = (rows, label) => rows.map((row) => ({ value: String(row.id), label: label(row) }));
  const availableDesignations = choices(designations, (row) => row.designation_code ? `${row.title} (${row.designation_code})` : row.title || `Designation #${row.id}`);
  const availableDepartments = choices(departments, (row) => row.name || `Department #${row.id}`);
  const availablePayGrades = choices(payGrades, (row) => row.name || row.code || `Pay grade #${row.id}`);
  const withCurrent = (rows, id, label) => id && !rows.some((row) => row.value === String(id)) ? [{ value: String(id), label: `Current value #${id}` }, ...rows] : rows;
  const inputFields = [
    ["designation_id", "Designation", { choices: withCurrent(availableDesignations, form.designation_id) }], ["title", "Job title"], ["purpose", "Purpose", { rows: 3 }],
    ["key_responsibilities", "Key responsibilities (one per line)", { rows: 4 }],
    ["requirements_essential", "Essential requirements (one per line)", { rows: 4 }],
    ["requirements_desirable", "Desirable requirements (one per line)", { rows: 3 }],
    ["department_id", "Department", { choices: withCurrent(availableDepartments, form.department_id) }],
    ["reporting_to_designation_id", "Reports to designation", { choices: withCurrent(availableDesignations, form.reporting_to_designation_id) }],
    ["direct_reports_summary", "Direct reports summary", { rows: 2 }], ["work_location", "Work location"],
    ["work_arrangement", "Work arrangement", { options: ["onsite", "hybrid", "remote"] }],
    ["pay_grade_id", "Pay grade", { choices: withCurrent(availablePayGrades, form.pay_grade_id) }], ["physical_requirements", "Physical requirements", { rows: 2 }],
  ];

  return (
    <HRPage title="Job descriptions" subtitle="Create, check, version and approve structured job descriptions">
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-100 pb-1">
        {NAV_ITEMS.map((item) => <NavLink key={item.href} to={item.href} className={({ isActive }) => `whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium ${isActive ? "border-b-2 border-teal-600 bg-teal-50/50 text-teal-600" : "text-gray-500 hover:bg-gray-50"}`}>{item.label}</NavLink>)}
      </div>
      {(error || notice) && <div role={error ? "alert" : "status"} className={`mb-4 rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>{error || notice}</div>}
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Job descriptions</h2>
            <button type="button" aria-label="Refresh job descriptions" onClick={() => refresh()} className="rounded p-1 text-gray-500 hover:bg-gray-100"><RefreshCw size={16} /></button>
          </div>
          <button type="button" onClick={startNew} className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"><Plus size={16} /> New job description</button>
          {loading ? <p role="status" className="py-4 text-sm text-gray-500">Loading…</p> : items.length === 0 ? <p className="py-4 text-sm text-gray-500">No job descriptions yet.</p> : (
            <ul className="space-y-1">{items.map((item) => <li key={item.id}>
              <button type="button" onClick={() => choose(item)} className={`w-full rounded-lg px-3 py-2 text-left ${active?.id === item.id ? "bg-teal-50 text-teal-800" : "hover:bg-gray-50"}`}>
                <span className="block text-sm font-medium">{item.title || "Untitled job description"}</span>
                <span className="text-xs text-gray-500">{item.reference} · v{item.version} · {item.status}</span>
              </button>
            </li>)}</ul>
          )}
        </aside>
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-lg font-semibold text-gray-900">{active ? `Edit ${active.reference}` : "New job description"}</h2>{active && <p className="text-sm text-gray-500">Version {active.version} · {active.status}</p>}</div>
            {active?.status === "APPROVED" && <button type="button" disabled={busy} onClick={newVersion} className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">Create new version</button>}
          </div>
          <div className="grid gap-4 md:grid-cols-2">{inputFields.map(([key, label, opts]) => field(key, label, opts || {}))}</div>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
            {canEdit && <button type="button" disabled={busy} onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Save size={16} /> Save draft</button>}
            {active?.id && canEdit && <button type="button" disabled={busy} onClick={checkLanguage} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50">Check inclusive language</button>}
            {active?.id && canEdit && <button type="button" disabled={busy} onClick={submit} className="rounded-lg border border-teal-200 px-4 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50">Submit for approval</button>}
            {active?.status === "PENDING" && <div className="flex min-w-full flex-wrap items-end gap-2">
              <label className="min-w-[16rem] flex-1 text-sm font-medium text-gray-700">Decision comment<textarea className={`${inputClass} mt-1`} rows={2} value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} placeholder="Required when returning for revision" /></label>
              <button type="button" disabled={busy} onClick={() => decide(true)} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white"><Check size={16} /> Approve</button>
              <button type="button" disabled={busy || !decisionComment.trim()} onClick={() => decide(false)} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">Return for revision</button>
            </div>}
            {active?.id && <GenerateDocumentButton canonicalId="HR-ORG-005" subjectType="org" subjectId={active.id} sourceRef={`job_description:${active.id}`} label="Check / generate document" />}
          </div>
          {flags && <div className={`mt-4 rounded-lg border p-3 ${flags.length ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`} role="status">
            <h3 className="text-sm font-semibold">{flags.length ? "Review inclusive-language flags" : "No inclusive-language flags found"}</h3>
            {flags.length > 0 && <ul className="mt-2 list-inside list-disc text-sm">{flags.map((flag, index) => <li key={`${flag.term}-${flag.where}-${index}`}><strong>{flag.term}</strong> in {flag.where}</li>)}</ul>}
          </div>}
          {active?.status === "APPROVED" && <p className="mt-4 flex items-center gap-2 text-xs text-gray-500"><FileText size={14} /> This approved version may be linked to an authorized position.</p>}
        </section>
      </div>
    </HRPage>
  );
}
