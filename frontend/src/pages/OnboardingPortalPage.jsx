import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  PenTool,
  Calendar,
  Briefcase,
  Building2,
  User,
  ShieldCheck,
  Clock,
  Sparkles,
  ArrowRight,
  Upload,
  AlertCircle,
  FileCheck2,
  Lock,
} from "lucide-react";
import { getPortal, getPortalDocumentFile, savePortalDetails, uploadPortalDocument, acknowledgePortalDocument,
  savePortalOutsideActivities, portalPackageFileUrl } from "../service/hrService";
import { formatDate } from "../utils/dateTime";
import PortalStructuredForms from "../modules/zoiko-hr/onboarding/PortalStructuredForms";

// The new hire's own pre-onboarding page. Public: the link token is the credential.

const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png", "doc", "docx"];
const MAX_BYTES = 10 * 1024 * 1024;

// Emergency contacts removed per requirement
const DETAIL_FIELDS = [
  { key: "phone", label: "Phone Number", type: "tel", placeholder: "+1 (555) 000-0000" },
  { key: "address", label: "Residential Street Address", wide: true, placeholder: "123 Main St, Apt 4B" },
  { key: "city", label: "City", placeholder: "New York" },
  { key: "state", label: "State / Province / Region", placeholder: "NY" },
  { key: "country", label: "Country", placeholder: "United States" },
  { key: "postal_code", label: "Postal / ZIP Code", placeholder: "10001" },
];

const detailsFromView = (view) => {
  const d = view?.details || {};
  const out = {};
  DETAIL_FIELDS.forEach(({ key }) => {
    out[key] = (key === "phone" ? view?.phone : d[key]) || "";
  });
  return out;
};

function validateFile(file) {
  if (!file) return "Choose a file first.";
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return "Allowed file types: PDF, JPG, JPEG, PNG, DOC, DOCX.";
  if (file.size > MAX_BYTES) return "The file is larger than 10 MB.";
  return null;
}

function StatusBadge({ status, requiresSignature }) {
  if (requiresSignature && status === "approved") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        Signed & Verified
      </span>
    );
  }
  if (requiresSignature && status !== "approved") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20 animate-pulse">
        <PenTool className="h-3.5 w-3.5 text-blue-600" />
        E-Signature Required
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        Ready / Approved
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
        <Clock className="h-3.5 w-3.5 text-amber-600" />
        Under HR Review
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
        <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
        Revision Requested
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
      <Clock className="h-3.5 w-3.5 text-slate-400" />
      Awaiting Upload
    </span>
  );
}

function SignableDocCard({ doc, token, onUpdated, onError }) {
  const [busy, setBusy] = useState(false);
  const isSigned = doc.requires_signature && doc.status === "approved";

  const handleDownload = async () => {
    setBusy(true);
    try {
      const res = await getPortalDocumentFile(token, doc.id);
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || `${doc.title}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      onError(err.message || "Could not download document.");
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    setBusy(true);
    try {
      const res = await getPortalDocumentFile(token, doc.id);
      const url = URL.createObjectURL(res.blob);
      const win = window.open(url, "_blank", "noopener");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename || `${doc.title}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      onError(err.message || "Could not preview document.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`group rounded-2xl border p-4 sm:p-5 transition-all duration-200 ${
      isSigned
        ? "border-emerald-100 bg-white hover:border-emerald-200 hover:shadow-xs"
        : "border-blue-200/90 bg-gradient-to-r from-blue-50/50 via-white to-indigo-50/30 hover:border-blue-300 hover:shadow-md"
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
            isSigned ? "bg-emerald-50 text-emerald-600" : "bg-blue-600 text-white shadow-xs"
          }`}>
            {isSigned ? <FileCheck2 className="h-5 w-5" /> : <PenTool className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-slate-900 break-words">{doc.title}</h4>
              <StatusBadge status={doc.status} requiresSignature={doc.requires_signature} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {isSigned
                ? "This document has been electronically signed and approved."
                : doc.needs_declaration
                  ? "Before signing, complete Schedule A: declare your outside activities (or confirm you have none) below."
                  : "Legally binding agreement. Please review the clauses and apply your electronic signature."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {doc.uploaded && (
            <button
              type="button"
              onClick={handlePreview}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition"
            >
              <Eye className="h-3.5 w-3.5 text-slate-500" />
              Preview
            </button>
          )}

          {isSigned ? (
            <button
              type="button"
              onClick={handleDownload}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition"
            >
              <Download className="h-3.5 w-3.5" />
              Download Signed PDF
            </button>
          ) : doc.sign_url ? (
            <a
              href={
                doc.sign_url.startsWith("http")
                  ? (typeof window !== "undefined" && doc.sign_url.includes(window.location.host)
                      ? doc.sign_url
                      : doc.sign_url.replace(/^https?:\/\/[^/]+/, ""))
                  : doc.sign_url
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:from-blue-700 hover:to-indigo-700 hover:shadow transition"
            >
              <PenTool className="h-3.5 w-3.5" />
              Sign Electronically
              <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OperationalDocRow({ doc, token, onError }) {
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    setBusy(true);
    try {
      const res = await getPortalDocumentFile(token, doc.id);
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || `${doc.title}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      onError(err.message || "Could not download document.");
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    setBusy(true);
    try {
      const res = await getPortalDocumentFile(token, doc.id);
      const url = URL.createObjectURL(res.blob);
      const win = window.open(url, "_blank", "noopener");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename || `${doc.title}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      onError(err.message || "Could not preview document.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/60 rounded-xl px-3 transition">
      <div className="flex items-center gap-3 min-w-0">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <span className="text-sm font-medium text-slate-800 break-words">{doc.title}</span>
          <p className="text-[11px] text-slate-400">
            {doc.package_mode === "VOLUNTARY"
              ? "Optional and entirely voluntary. Return it to HR only if you wish; it is never added to your personnel file."
              : doc.package_mode === "INFO" ? "Template you will use after you join" : "Reference document"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        {doc.uploaded && (
          <button
            type="button"
            onClick={handlePreview}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition"
          >
            <Eye className="h-3.5 w-3.5 text-slate-400" />
            View
          </button>
        )}
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50/60 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition"
        >
          <Download className="h-3.5 w-3.5" />
          Download PDF
        </button>
      </div>
    </div>
  );
}

function UploadableDocRow({ doc, token, onUpdated, onError }) {
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const upload = async () => {
    const problem = validateFile(file);
    if (problem) { setFileError(problem); return; }
    setUploading(true);
    try {
      const view = await uploadPortalDocument(token, doc.id, file);
      setFile(null);
      onUpdated(view, `${doc.title} uploaded successfully.`);
    } catch (err) {
      onError(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 transition">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText className="h-4 w-4 text-slate-400 shrink-0" />
          <span className="text-sm font-semibold text-slate-800">{doc.title}</span>
        </div>
        <StatusBadge status={doc.status} requiresSignature={false} />
      </div>

      {doc.package_mode === "COMPLETE" && doc.has_package_file && (doc.status === "requested" || doc.status === "rejected") && (
        <p className="mt-2 text-xs text-slate-600">
          <a href={portalPackageFileUrl(token, doc.category)} className="font-semibold text-blue-600 hover:underline">Download the form</a>,
          complete and sign it, then upload it here.
        </p>
      )}
      {doc.status === "rejected" && doc.rejection_reason && (
        <p className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2.5 break-words">
          Revision requested: {doc.rejection_reason}
        </p>
      )}

      {(doc.status === "requested" || doc.status === "rejected") && (
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              setFileError(f ? validateFile(f) : null);
            }}
            className="block w-full min-w-0 text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <button
            onClick={upload}
            disabled={!file || !!fileError || uploading}
            className="shrink-0 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow-xs"
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading ? "Uploading..." : "Upload File"}
          </button>
        </div>
      )}
      {fileError && <p className="mt-1 text-xs text-rose-600">{fileError}</p>}
    </div>
  );
}

function AcknowledgeDocCard({ doc, token, ack, onUpdated, onError }) {
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const done = doc.status === "approved";

  const open = async () => {
    try {
      const res = await getPortalDocumentFile(token, doc.id);
      const url = URL.createObjectURL(res.blob);
      if (!window.open(url, "_blank", "noopener")) {
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename || `${doc.title}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      onError(err.message || "Could not open the document.");
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const view = await acknowledgePortalDocument(token, doc.id, ack?.ack_text_version);
      onUpdated(view, `Thank you. Your acknowledgement of the ${doc.title} has been recorded.`);
    } catch (err) {
      onError(err.message || "Could not record your acknowledgement.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 ${done ? "border-emerald-100 bg-white" : "border-sky-200 bg-sky-50/40"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${done ? "bg-emerald-50 text-emerald-600" : "bg-sky-600 text-white"}`}>
            {done ? <FileCheck2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <h4 className="break-words text-sm font-semibold text-slate-900">{doc.title}</h4>
            <p className="mt-1 text-xs text-slate-500">
              {done ? `Receipt acknowledged${doc.acknowledged_at ? ` on ${formatDate(doc.acknowledged_at)}` : ""}.`
                : "Please read this document and confirm you have received it. This is not a signature."}
            </p>
          </div>
        </div>
        <button type="button" onClick={open}
          className="inline-flex shrink-0 items-center gap-1.5 self-end rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:self-start">
          <Eye className="h-3.5 w-3.5 text-slate-500" />Read document
        </button>
      </div>
      {!done && (
        <div className="mt-3 flex flex-col gap-2 border-t border-sky-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 rounded border-slate-300" />
            <span>{ack?.ack_text || "I confirm that I have received and read this document."}</span>
          </label>
          <button type="button" onClick={submit} disabled={!checked || busy}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
            <CheckCircle2 className="h-3.5 w-3.5" />{busy ? "Saving…" : "Acknowledge receipt"}
          </button>
        </div>
      )}
    </div>
  );
}

const EMPTY_ACTIVITY = { organisation: "", role: "", hours: "", paid: "unpaid" };

function OutsideActivitiesCard({ token, onUpdated, onError }) {
  const [none, setNone] = useState(false);
  const [rows, setRows] = useState([{ ...EMPTY_ACTIVITY }]);
  const [busy, setBusy] = useState(false);
  const set = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const cls = "w-full min-w-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm";

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const view = await savePortalOutsideActivities(token, {
        none, rows: none ? [] : rows.filter((r) => r.organisation.trim()).map((r) => ({ ...r, hours: Number(r.hours) || 0 })),
      });
      onUpdated(view, "Thank you. Schedule A is complete; you can now sign your Affidavit of Employment Exclusivity.");
    } catch (err) {
      onError(err.message || "Could not save your declaration.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-slate-900">Outside activities</h4>
      <p className="mt-1 text-xs text-slate-500">
        Schedule A of your Affidavit of Employment Exclusivity: list any other employment, consultancy, directorship or business
        activity, paid or unpaid, or confirm you have none. It is attached to the affidavit when you sign it.
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={none} onChange={(e) => setNone(e.target.checked)} className="rounded border-slate-300" />
        I have no outside activities
      </label>
      {!none && (
        <div className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto]">
              <input aria-label="Organisation" placeholder="Organisation" className={cls} value={r.organisation} onChange={(e) => set(i, { organisation: e.target.value })} />
              <input aria-label="Role" placeholder="Role" className={cls} value={r.role} onChange={(e) => set(i, { role: e.target.value })} />
              <input aria-label="Hours per week" type="number" min={0} max={168} placeholder="Hours / week" className={cls} value={r.hours} onChange={(e) => set(i, { hours: e.target.value })} />
              <select aria-label="Paid or unpaid" className={cls} value={r.paid} onChange={(e) => set(i, { paid: e.target.value })}>
                <option value="unpaid">Unpaid</option><option value="paid">Paid</option>
              </select>
              <button type="button" onClick={() => setRows((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [{ ...EMPTY_ACTIVITY }]))}
                className="rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-rose-600">Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => setRows((x) => [...x, { ...EMPTY_ACTIVITY }])} className="text-xs font-semibold text-blue-600 hover:underline">
            + Add another activity
          </button>
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={busy || (!none && !rows.some((r) => r.organisation.trim()))}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? "Saving…" : "Save declaration"}
        </button>
      </div>
    </form>
  );
}

export default function OnboardingPortalPage() {
  const { token } = useParams();
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [details, setDetails] = useState(detailsFromView(null));
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState({ type: "", text: "" });

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getPortal(token);
      setView(data);
      setDetails(detailsFromView(data));
    } catch (err) {
      if (err?.status === 404 || err?.status === 410) setInvalid(true);
      else setLoadError(err?.message || "We could not load this onboarding portal.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "Pre-onboarding Portal | Zoiko HR";
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const applyView = (data, message) => {
    if (data) setView(data);
    setBanner({ type: "success", text: message });
  };

  const saveDetails = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {};
      DETAIL_FIELDS.forEach(({ key }) => {
        payload[key] = details[key].trim() || null;
      });
      const data = await savePortalDetails(token, payload);
      if (data) {
        setView(data);
        setDetails(detailsFromView(data));
      }
      setBanner({ type: "success", text: "Your personal details have been safely saved." });
    } catch (err) {
      if (err?.status === 404 || err?.status === 410) setInvalid(true);
      else setBanner({ type: "error", text: err?.message || "Could not save your details. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  // Group documents by what the new hire must do: sign, acknowledge, upload/complete, or nothing (for information / voluntary)
  const documents = view?.documents || [];
  const { signableDocs, ackDocs, operationalDocs, uploadableDocs, progress } = useMemo(() => {
    const signable = [];
    const acks = [];
    const operational = [];
    const uploadable = [];
    let completed = 0;
    let total = 0;

    documents.forEach((d) => {
      const mode = d.package_mode;
      if (d.requires_signature) {
        signable.push(d);
      } else if (mode === "ACKNOWLEDGE") {
        acks.push(d);
      } else if (mode === "INFO" || mode === "VOLUNTARY" || (!mode && d.uploaded && d.status === "approved")) {
        operational.push(d);
        return;                                   // optional / informational: not counted in progress
      } else {
        uploadable.push(d);
      }
      total++;
      if (d.status === "approved" || (!d.requires_signature && mode !== "ACKNOWLEDGE" && d.status === "pending")) completed++;
    });

    return {
      signableDocs: signable,
      ackDocs: acks,
      operationalDocs: operational,
      uploadableDocs: uploadable,
      progress: { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 },
    };
  }, [documents]);
  const needs = view?.package?.needs || [];

  const overallStatus = useMemo(() => {
    if (!progress.total) return { label: "Not started", tone: "amber" };
    if (progress.completed === progress.total) return { label: "Completed", tone: "emerald" };
    if (progress.completed > 0) return { label: "In progress", tone: "blue" };
    return { label: "Not started", tone: "amber" };
  }, [documents, progress]);

  if (loading && !view) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-200/30 blur-3xl rounded-full pointer-events-none" />
        <div className="relative flex flex-col items-center">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-600 border-b-transparent shadow-sm" />
          <p className="mt-4 text-sm font-medium text-slate-600">Loading your onboarding portal...</p>
        </div>
      </div>
    );
  }

  if (invalid || (!view && loadError)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50/60 to-slate-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-lg border border-blue-100/80 max-w-md w-full p-8 text-center relative overflow-hidden">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600 ring-8 ring-blue-50/50">
            <Lock className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">{invalid ? "Link Not Available" : "Unable to Load"}</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            {invalid
              ? "This onboarding link is expired or invalid. Please reach out to your HR contact to request a fresh portal invitation."
              : loadError}
          </p>
          {!invalid && (
            <button
              onClick={load}
              className="mt-6 w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 transition shadow-sm"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  const orientation = view.orientation || [];

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 antialiased relative overflow-hidden">
      {/* Ambient background soft light */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1200px] h-[550px] bg-gradient-to-b from-blue-200/40 via-sky-100/25 to-transparent blur-3xl opacity-80" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] bg-blue-100/30 blur-3xl rounded-full" />
        <div className="absolute bottom-10 -left-40 w-[500px] h-[500px] bg-indigo-50/40 blur-3xl rounded-full" />
      </div>

      {/* Modern Top Header Bar */}
      <header className="sticky top-0 z-30 border-b border-blue-100/80 bg-white/85 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-sm shadow-xs">
                ZH
              </span>
              <div>
                <span className="text-sm font-bold tracking-tight text-slate-900 block leading-tight">Zoiko HR</span>
                <span className="text-[10px] font-medium text-slate-400 block leading-none">Employee Onboarding</span>
              </div>
            </div>
            {view.organization_name && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20 truncate max-w-[200px]">
                {view.organization_name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-2.5 py-1 text-xs font-medium text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
              Secure Portal
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        {/* Banner alerts */}
        {banner.text && (
          <div
            className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm transition-all shadow-xs ${
              banner.type === "success"
                ? "border-emerald-200 bg-emerald-50/90 text-emerald-800"
                : "border-rose-200 bg-rose-50/90 text-rose-800"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {banner.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span className="break-words font-medium">{banner.text}</span>
            </div>
            <button
              onClick={() => setBanner({ type: "", text: "" })}
              aria-label="Dismiss"
              className="shrink-0 p-1 font-bold text-slate-400 hover:text-slate-600 leading-none"
            >
              &times;
            </button>
          </div>
        )}

        {/* Hero Card */}
        <section className="relative overflow-hidden rounded-3xl border border-blue-100/90 bg-white p-6 sm:p-8 shadow-sm">
          {/* Top highlight bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-400" />

          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-xl shadow-md ring-4 ring-blue-50">
                {(view.candidate_name || "NH").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                    Welcome, {view.candidate_name}!
                  </h1>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                    overallStatus.tone === "emerald"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : overallStatus.tone === "blue"
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      overallStatus.tone === "emerald"
                        ? "bg-emerald-600"
                        : overallStatus.tone === "blue"
                        ? "bg-blue-600"
                        : "bg-amber-600"
                    }`} />
                    Status: {overallStatus.label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {view.welcome_message || "We are thrilled to welcome you to our team. Please complete your onboarding steps below."}
                </p>
              </div>
            </div>
          </div>

          {/* Key metadata grid */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 sm:p-3.5 transition">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
                <Briefcase className="h-3.5 w-3.5 text-blue-600" />
                Position
              </div>
              <p className="text-sm font-semibold text-slate-800 truncate">{view.position || "—"}</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 sm:p-3.5 transition">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
                <Building2 className="h-3.5 w-3.5 text-blue-600" />
                Department
              </div>
              <p className="text-sm font-semibold text-slate-800 truncate">{view.department_name || "—"}</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 sm:p-3.5 transition">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
                <Calendar className="h-3.5 w-3.5 text-blue-600" />
                Start Date
              </div>
              <p className="text-sm font-semibold text-slate-800 truncate">
                {view.joining_date ? formatDate(view.joining_date) : "To be confirmed"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 sm:p-3.5 transition">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
                <User className="h-3.5 w-3.5 text-blue-600" />
                Manager
              </div>
              <p className="text-sm font-semibold text-slate-800 truncate">{view.manager_name || "HR Team"}</p>
            </div>
          </div>

          {/* Progress Overview */}
          {progress.total > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2 text-xs font-medium mb-2">
                <span className="text-slate-600 font-semibold">Onboarding Completion Progress</span>
                <span className="text-blue-700 font-bold">{progress.completed} of {progress.total} items completed ({progress.percent}%)</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {view.expires_at && (
            <div className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400">
              <Clock className="h-3 w-3" />
              <span>This private onboarding link remains active until {formatDate(view.expires_at)}.</span>
            </div>
          )}
        </section>

        {/* Section 1: Signable Documents (Requires Electronic Signature) */}
        {signableDocs.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-blue-600 text-white shadow-xs">
                  <PenTool className="h-3.5 w-3.5" />
                </span>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Required Signatures ({signableDocs.filter((d) => d.status === "approved").length} of {signableDocs.length} signed)
                </h2>
              </div>
              <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">
                Action Required
              </span>
            </div>

            <div className="space-y-3">
              {signableDocs.map((doc) => (
                <SignableDocCard
                  key={doc.id}
                  doc={doc}
                  token={token}
                  onUpdated={applyView}
                  onError={(text) => setBanner({ type: "error", text })}
                />
              ))}
            </div>

            <p className="flex items-center gap-1.5 px-1 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
              HR is told automatically as soon as you sign; there is nothing else to submit.
            </p>
          </section>
        )}

        {needs.length > 0 && (
          <section className="space-y-3 rounded-3xl border border-amber-200 bg-amber-50/50 p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <h2 className="text-base font-bold tracking-tight text-slate-900">Still needed from you</h2>
            </div>
            <p className="text-xs text-slate-600">
              Some of your agreements are prepared as soon as you give these details. They appear above for signing straight away.
            </p>
            {needs.includes("address") && (
              <a href="#portal-details" className="block rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium text-blue-700 hover:bg-blue-50/40">
                Add your residential address below – it is printed in your Non-Disclosure Agreement and Employment Contract. →
              </a>
            )}
            {needs.includes("outside_activities") && (
              <OutsideActivitiesCard token={token} onUpdated={applyView} onError={(text) => setBanner({ type: "error", text })} />
            )}
          </section>
        )}

        {ackDocs.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-sky-600 text-white shadow-xs"><FileText className="h-3.5 w-3.5" /></span>
              <h2 className="text-base font-bold tracking-tight text-slate-900">
                To read and acknowledge ({ackDocs.filter((d) => d.status === "approved").length} of {ackDocs.length})
              </h2>
            </div>
            {ackDocs.map((doc) => (
              <AcknowledgeDocCard key={doc.id} doc={doc} token={token} ack={view.package}
                onUpdated={applyView} onError={(text) => setBanner({ type: "error", text })} />
            ))}
          </section>
        )}

        {/* Section 2: Structured Forms (Cleaned, Emergency Contacts Excluded) */}
        <PortalStructuredForms token={token} />

        {/* Section 3: Operational Templates & Corporate Handbooks */}
        {operationalDocs.length > 0 && (
          <section className="rounded-3xl border border-blue-100/90 bg-white p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-slate-100 text-slate-700">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  For information (no action needed)
                </h2>
              </div>
              <span className="text-xs text-slate-400 font-medium">{operationalDocs.length} documents</span>
            </div>

            <div className="space-y-1">
              {operationalDocs.map((doc) => (
                <OperationalDocRow
                  key={doc.id}
                  doc={doc}
                  token={token}
                  onError={(text) => setBanner({ type: "error", text })}
                />
              ))}
            </div>
          </section>
        )}

        {/* Section 4: Uploadable / Verification Documents */}
        {uploadableDocs.length > 0 && (
          <section className="rounded-3xl border border-blue-100/90 bg-white p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-50 text-amber-600">
                  <Upload className="h-3.5 w-3.5" />
                </span>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Verification Documents</h2>
              </div>
              <span className="text-xs text-slate-400 font-medium">{uploadableDocs.length} items</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {uploadableDocs.map((doc) => (
                <UploadableDocRow
                  key={doc.id}
                  doc={doc}
                  token={token}
                  onUpdated={applyView}
                  onError={(text) => setBanner({ type: "error", text })}
                />
              ))}
            </div>
          </section>
        )}

        {/* Section 5: Personal Details (Emergency Contacts Excluded) */}
        <section id="portal-details" className="scroll-mt-20 rounded-3xl border border-blue-100/90 bg-white p-5 sm:p-7 shadow-sm">
          <div className="border-b border-slate-100 pb-4 mb-5">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                <User className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Your Contact & Address Details</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Provide your residential address and contact phone number to finalize your employee profile.
            </p>
          </div>

          <form onSubmit={saveDetails} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {DETAIL_FIELDS.map((f) => (
              <div key={f.key} className={f.wide ? "min-w-0 sm:col-span-2" : "min-w-0"}>
                <label htmlFor={`pd-${f.key}`} className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {f.label}
                </label>
                <input
                  id={`pd-${f.key}`}
                  type={f.type || "text"}
                  value={details[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })}
                  className="w-full min-h-10 border border-slate-200 rounded-xl px-3.5 py-2 text-sm bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition outline-none"
                />
              </div>
            ))}

            <div className="sm:col-span-2 pt-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto min-h-10 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-6 py-2.5 rounded-xl shadow-xs hover:shadow transition"
              >
                {saving ? "Saving Details..." : "Save Personal Details"}
              </button>
            </div>
          </form>
        </section>

        {/* Section 6: Orientation (if any) */}
        {orientation.length > 0 && (
          <section className="rounded-3xl border border-blue-100/90 bg-white p-5 sm:p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-blue-50 text-blue-600">
                <Calendar className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Orientation Schedule</h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {orientation.map((o, i) => (
                <li key={`${o.title}-${i}`} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 text-sm break-words">{o.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {[o.date && formatDate(o.date), o.time, o.location].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {/^https?:\/\//i.test(o.meeting_link || "") && (
                    <a
                      href={o.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center justify-center rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold px-4 py-1.5 transition"
                    >
                      Join Meeting
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer */}
        <footer className="pt-6 pb-12 text-center space-y-2">
          <p className="text-xs text-slate-400">
            Zoiko HR Platform · Protected by enterprise-grade 256-bit SSL encryption.
          </p>
          <p className="text-[11px] text-slate-400">
            Have questions or need assistance? Reply directly to your welcome email from HR.
          </p>
        </footer>
      </main>
    </div>
  );
}
