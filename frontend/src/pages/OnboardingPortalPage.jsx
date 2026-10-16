import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getPortal, savePortalDetails, uploadPortalDocument } from "../service/hrService";
import { formatDate } from "../utils/dateTime";

// The new hire's own pre-onboarding page. Public: the link token is the credential, so nothing here needs a login.

const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png", "doc", "docx"];
const MAX_BYTES = 10 * 1024 * 1024;

const DETAIL_FIELDS = [
  { key: "phone", label: "Phone", type: "tel" },
  { key: "address", label: "Address", wide: true },
  { key: "city", label: "City" },
  { key: "state", label: "State / Province" },
  { key: "country", label: "Country" },
  { key: "postal_code", label: "Postal code" },
  { key: "emergency_contact_name", label: "Emergency contact name" },
  { key: "emergency_contact_relation", label: "Relation" },
  { key: "emergency_contact_phone", label: "Emergency contact phone", type: "tel" },
];

const detailsFromView = (view) => {
  const d = view?.details || {};
  const out = {};
  DETAIL_FIELDS.forEach(({ key }) => { out[key] = (key === "phone" ? view?.phone : d[key]) || ""; });
  return out;
};

function validateFile(file) {
  if (!file) return "Choose a file first.";
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return "Allowed file types: PDF, JPG, JPEG, PNG, DOC, DOCX.";
  if (file.size > MAX_BYTES) return "The file is larger than 10 MB.";
  return null;
}

function Banner({ type, text, onClose }) {
  if (!text) return null;
  const cls = type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700";
  return (
    <div className={`mb-4 px-4 py-3 border rounded-lg flex justify-between items-start gap-3 text-sm ${cls}`}>
      <span className="min-w-0 break-words">{text}</span>
      <button onClick={onClose} className="shrink-0 p-1.5 -m-1.5 font-bold leading-none" aria-label="Dismiss">&times;</button>
    </div>
  );
}

function DocumentRow({ doc, token, onUpdated, onError }) {
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const canUpload = doc.status === "requested" || doc.status === "rejected";

  const upload = async () => {
    const problem = validateFile(file);
    if (problem) { setFileError(problem); return; }
    setUploading(true);
    try {
      const view = await uploadPortalDocument(token, doc.id, file);
      setFile(null);
      onUpdated(view, `${doc.title} uploaded. HR will review it.`);
    } catch (err) {
      onError(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-words font-medium text-slate-800">{doc.title}</span>
        {doc.status === "pending" && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Under review</span>}
        {doc.status === "approved" && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">Approved</span>}
        {doc.status === "requested" && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">To upload</span>}
        {doc.status === "rejected" && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Please re-upload</span>}
      </div>
      {doc.status === "rejected" && doc.rejection_reason && (
        <p className="text-sm text-red-600 mt-1 break-words">{doc.rejection_reason}</p>
      )}
      {canUpload && (
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              setFileError(f ? validateFile(f) : null);
            }}
            className="block w-full min-w-0 text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          />
          <button
            onClick={upload}
            disabled={!file || !!fileError || uploading}
            className="shrink-0 w-full sm:w-auto min-h-10 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      )}
      {fileError && <p className="text-xs text-red-600 mt-1 break-words">{fileError}</p>}
    </li>
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
      else setLoadError(err?.message || "We could not load this page.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "Pre-onboarding";
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
      DETAIL_FIELDS.forEach(({ key }) => { payload[key] = details[key].trim() || null; });
      const data = await savePortalDetails(token, payload);
      if (data) { setView(data); setDetails(detailsFromView(data)); }
      setBanner({ type: "success", text: "Your details have been saved." });
    } catch (err) {
      if (err?.status === 404 || err?.status === 410) setInvalid(true);
      else setBanner({ type: "error", text: err?.message || "Could not save your details. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !view) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (invalid || (!view && loadError)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 max-w-md w-full p-6 sm:p-8 text-center">
          <h1 className="text-lg font-semibold text-slate-800 mb-2">{invalid ? "Link not available" : "Something went wrong"}</h1>
          <p className="text-sm text-slate-600 break-words">
            {invalid ? "This link is not valid or has expired. Ask your HR contact for a new one." : loadError}
          </p>
          {!invalid && (
            <button onClick={load} className="mt-5 min-h-10 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Try again</button>
          )}
        </div>
      </div>
    );
  }

  const documents = view.documents || [];
  const submitted = documents.filter((d) => d.status === "pending" || d.status === "approved").length;
  const orientation = view.orientation || [];

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-12 space-y-5 sm:space-y-6">
        <header className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
          {view.organization_name && <p className="text-sm font-medium text-blue-600 break-words">{view.organization_name}</p>}
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 break-words">Welcome{view.candidate_name ? `, ${view.candidate_name}` : ""}!</h1>
          {view.welcome_message && <p className="text-slate-600 mt-3 whitespace-pre-line break-words">{view.welcome_message}</p>}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-5 text-sm">
            {view.position && (<div className="min-w-0"><dt className="text-slate-400">Position</dt><dd className="text-slate-800 font-medium break-words">{view.position}</dd></div>)}
            {view.department_name && (<div className="min-w-0"><dt className="text-slate-400">Department</dt><dd className="text-slate-800 font-medium break-words">{view.department_name}</dd></div>)}
            {view.joining_date && (<div><dt className="text-slate-400">Start date</dt><dd className="text-slate-800 font-medium break-words">{formatDate(view.joining_date)}</dd></div>)}
            {view.manager_name && (<div className="min-w-0"><dt className="text-slate-400">Manager</dt><dd className="text-slate-800 font-medium break-words">{view.manager_name}</dd></div>)}
          </dl>
          {view.expires_at && <p className="text-xs text-slate-400 mt-5">This link is valid until {formatDate(view.expires_at)}.</p>}
        </header>

        <Banner type={banner.type} text={banner.text} onClose={() => setBanner({ type: "", text: "" })} />

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Documents</h2>
            {documents.length > 0 && <p className="text-sm text-slate-500">{submitted} of {documents.length} documents submitted</p>}
          </div>
          {documents.length > 0 && (
            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${Math.round((100 * submitted) / documents.length)}%` }} />
            </div>
          )}
          {documents.length === 0 ? (
            <p className="text-sm text-slate-500 mt-3">No documents have been requested yet.</p>
          ) : (
            <>
              <p className="text-xs text-slate-400 mt-3">PDF, JPG, PNG, DOC or DOCX, up to 10 MB each.</p>
              <ul className="divide-y divide-slate-100">
                {documents.map((d) => (
                  <DocumentRow
                    key={d.id}
                    doc={d}
                    token={token}
                    onUpdated={applyView}
                    onError={(text) => setBanner({ type: "error", text })}
                  />
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Your details</h2>
          <p className="text-sm text-slate-500 mt-1">Help us get your records ready before your first day.</p>
          <form onSubmit={saveDetails} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {DETAIL_FIELDS.map((f) => (
              <div key={f.key} className={f.wide ? "min-w-0 sm:col-span-2" : "min-w-0"}>
                <label htmlFor={`pd-${f.key}`} className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label>
                <input
                  id={`pd-${f.key}`}
                  type={f.type || "text"}
                  value={details[f.key]}
                  onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })}
                  className="w-full min-w-0 min-h-10 border border-slate-200 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
            <div className="sm:col-span-2 flex flex-wrap justify-end gap-2">
              <button type="submit" disabled={saving} className="w-full sm:w-auto min-h-10 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-5 py-2 rounded-lg">
                {saving ? "Saving..." : "Save details"}
              </button>
            </div>
          </form>
        </section>

        {orientation.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Orientation</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {orientation.map((o, i) => (
                <li key={`${o.title}-${i}`} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 break-words">{o.title}</p>
                    <p className="text-sm text-slate-500">
                      {[o.date && formatDate(o.date), o.time, o.location].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {/^https?:\/\//i.test(o.meeting_link || "") && (
                    <a href={o.meeting_link} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center justify-center min-h-10 text-center bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium px-4 py-2 rounded-lg">
                      Join
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-center text-xs text-slate-400">Questions? Reply to the email from your HR contact.</p>
      </div>
    </div>
  );
}
