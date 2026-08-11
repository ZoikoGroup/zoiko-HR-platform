import { useState, useEffect, useCallback } from "react";
import { NavLink, useParams, useSearchParams } from "react-router-dom";
import { Users, Plus, Search, AlertCircle, Mail, Phone, MapPin, Calendar, Briefcase, ExternalLink, ArrowLeft, ChevronLeft, ChevronRight, Edit2, Trash2, Clock, User, X } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getCandidates, getCandidateById, createCandidate, updateCandidate, deleteCandidate, updateCandidateStatus, getRequisitions } from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/recruitment" },
  { label: "Job Requisitions", href: "/zoiko-hr/recruitment/job-requisitions" },
  { label: "Candidates", href: "/zoiko-hr/recruitment/candidates" },
  { label: "Interviews", href: "/zoiko-hr/recruitment/interviews" },
  { label: "Offer Management", href: "/zoiko-hr/recruitment/offers" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/recruitment"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive ? "text-orange-600 border-b-2 border-orange-600 bg-orange-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}


function formatDate(dateStr) {
  if (!dateStr) return "-";
  try { return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return dateStr; }
}

function daysAgo(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return "Today";
    if (diff === 1) return "1d ago";
    return `${diff}d ago`;
  } catch { return ""; }
}

function StatusBadge({ status }) {
  const m = { applied: "bg-blue-100 text-blue-800", new: "bg-blue-100 text-blue-800", screening: "bg-indigo-100 text-indigo-800", interview: "bg-purple-100 text-purple-800", interviewed: "bg-purple-100 text-purple-800", offer: "bg-orange-100 text-orange-800", offered: "bg-orange-100 text-orange-800", hired: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-800" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${m[status] || "bg-gray-100 text-gray-800"}`}>{status?.replace(/_/g, " ")}</span>;
}

const PAGE_SIZE = 10;

export default function Candidates() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [candidates, setCandidates] = useState([]);
  const [candidate, setCandidate] = useState(null);
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [requisitionFilter, setRequisitionFilter] = useState(searchParams.get("requisition_id") || "");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", position: "", status: "applied", source: "referral", location: "", experience: "", notes: "", requisition_id: "" });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    if (id) {
      Promise.all([
        getCandidateById(id),
        getRequisitions({ per_page: 200 }).catch(() => ({ items: [] })),
      ]).then(([d, reqs]) => {
        if (!d) { setError("Candidate not found"); return; }
        setCandidate(d);
        setRequisitions(Array.isArray(reqs) ? reqs : reqs?.items || reqs?.data || []);
      }).catch((err) => {
        console.error("Candidate load error:", err);
        setError("Failed to load candidate.");
      }).finally(() => setLoading(false));
    } else {
      Promise.all([
        getCandidates({ per_page: 100 }),
        getRequisitions({ per_page: 200 }).catch(() => ({ items: [] })),
      ]).then(([d, reqs]) => {
        setCandidates(Array.isArray(d) ? d : d?.items || d?.data || []);
        setRequisitions(Array.isArray(reqs) ? reqs : reqs?.items || reqs?.data || []);
      }).catch((err) => {
        console.error("Candidates load error:", err);
        setError("Failed to load candidates.");
      }).finally(() => setLoading(false));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const filtered = candidates.filter((c) => {
    if (search && !c.name?.toLowerCase().includes(search.toLowerCase()) && !c.email?.toLowerCase().includes(search.toLowerCase()) && !c.position?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    if (sourceFilter && c.source !== sourceFilter) return false;
    if (requisitionFilter && String(c.requisition_id) !== String(requisitionFilter)) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const sources = [...new Set(candidates.map((c) => c.source).filter(Boolean))];

  const openCreate = () => { setEditItem(null); setForm({ name: "", email: "", phone: "", position: "", status: "applied", source: "referral", location: "", experience: "", notes: "", requisition_id: "" }); setShowModal(true); };
  const openEdit = (c) => { setEditItem(c); setForm({ name: c.name, email: c.email || "", phone: c.phone || "", position: c.position || "", status: c.status || "applied", source: c.source || "referral", location: c.location || "", experience: c.experience || "", notes: c.notes || "", requisition_id: c.requisition_id ? String(c.requisition_id) : "" }); setShowModal(true); };

  const handleRequisitionSelect = (reqId) => {
    const req = requisitions.find((r) => String(r.id) === String(reqId));
    setForm((prev) => ({ ...prev, requisition_id: reqId, position: prev.position || req?.title || prev.position }));
  };

  const handleSave = async () => {
    try {
      const payload = { ...form, experience: Number(form.experience) || 0, requisition_id: form.requisition_id ? Number(form.requisition_id) : null };
      if (editItem) {
        await updateCandidate(editItem.id, payload);
      } else {
        await createCandidate(payload);
      }
      setShowModal(false);
      load();
    } catch (err) {
      console.error("Save candidate error:", err);
      setError(err.message || "Failed to save candidate.");
    }
  };

  const handleDelete = async (candId) => {
    if (!window.confirm("Delete this candidate?")) return;
    try {
      await deleteCandidate(candId);
      if (id) window.location.href = "/zoiko-hr/recruitment/candidates";
      else load();
    } catch (err) {
      console.error("Delete candidate error:", err);
      setError(err.message || "Failed to delete candidate.");
    }
  };

  const handleStatusUpdate = async (candId, status) => {
    try {
      await updateCandidateStatus(candId, { status });
      load();
    } catch (err) {
      console.error("Status update error:", err);
      setError(err.message || "Failed to update status.");
    }
  };

  const exportCsv = () => {
    const headers = ["Name", "Email", "Phone", "Position", "Requisition", "Status", "Source", "Applied", "Location", "Experience"];
    const rows = filtered.map((c) => [c.name, c.email, c.phone, c.position, c.requisition_title || "", c.status, c.source, formatDate(c.applied_at || c.created_at), c.location, c.experience]);
    const csv = [headers.join(","), ...rows.map((row) => row.map((c) => `"${c || ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "candidates.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <HRPage title="Candidates" subtitle="Manage applicant pool"><SubNav /><div className="p-6 text-gray-400">Loading...</div></HRPage>;

  if (error) return <HRPage title="Candidates" subtitle="Manage applicant pool"><SubNav /><div className="p-6 text-center"><div className="inline-flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-lg"><AlertCircle className="w-5 h-5" />{error}</div><div className="mt-4"><button onClick={load} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm">Try Again</button></div></div></HRPage>;

  if (id && candidate) {
    const act = candidate.activity || [];
    return (
      <HRPage title="Candidate Profile" subtitle="Applicant details and activity">
        <SubNav />
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <NavLink to="/zoiko-hr/recruitment/candidates" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4" />Back to Candidates</NavLink>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center"><User className="w-7 h-7 text-orange-600" /></div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{candidate.name}</h2>
                  <p className="text-sm text-gray-500">{candidate.position || "No position specified"}</p>
                  {candidate.requisition_title && (
                    <p className="text-xs text-orange-600 mt-0.5">Applying for requisition: {candidate.requisition_title}</p>
                  )}
                </div>
              </div>
              <StatusBadge status={candidate.status} />
            </div>
            {candidate.onboarding_new_hire_id && (
              <div className="mb-4 flex items-center justify-between gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                <span className="text-sm text-green-700 font-medium">✓ Onboarding started for this candidate</span>
                <NavLink to="/zoiko-hr/onboarding/new-hires" className="text-sm text-green-700 underline hover:text-green-900">View in Onboarding →</NavLink>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2 text-gray-600"><Mail className="w-4 h-4 text-gray-400" />{candidate.email || "-"}</div>
              <div className="flex items-center gap-2 text-gray-600"><Phone className="w-4 h-4 text-gray-400" />{candidate.phone || "-"}</div>
              <div className="flex items-center gap-2 text-gray-600"><MapPin className="w-4 h-4 text-gray-400" />{candidate.location || "-"}</div>
              <div className="flex items-center gap-2 text-gray-600"><Calendar className="w-4 h-4 text-gray-400" />Applied {formatDate(candidate.applied_at || candidate.created_at)}</div>
              <div className="flex items-center gap-2 text-gray-600"><Briefcase className="w-4 h-4 text-gray-400" />{candidate.experience ? `${candidate.experience} yrs` : "-"} experience</div>
              <div className="flex items-center gap-2 text-gray-600"><ExternalLink className="w-4 h-4 text-gray-400" />Source: {candidate.source || "-"}</div>
            </div>
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Status Update</h3>
              <div className="flex flex-wrap gap-2">
                {["applied", "screening", "interview", "offer", "hired", "rejected"].map((s) => (
                  <button key={s} onClick={() => handleStatusUpdate(candidate.id, s)} disabled={candidate.status === s}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${candidate.status === s ? "bg-orange-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => openEdit(candidate)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50"><Edit2 className="w-3.5 h-3.5" /> Edit</button>
              <button onClick={() => handleDelete(candidate.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Activity Timeline</h3>
            {act.length === 0 ? (
              <div className="text-center py-8 text-gray-400">No activity recorded</div>
            ) : (
              <div className="space-y-3">
                {act.slice(0, 10).map((a, i) => (
                  <div key={i} className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0">
                    <div className="p-1.5 rounded-full bg-orange-100"><Clock className="w-3.5 h-3.5 text-orange-600" /></div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">{a.description || a.message || a.action}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(a.date || a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Candidates" subtitle="Manage applicant pool">
      <SubNav />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} className="flex items-center gap-2 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Export CSV</button>
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium">
              <Plus className="w-4 h-4" /> Add Candidate
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search candidates..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="">All Statuses</option>
            <option value="applied">Applied</option>
            <option value="screening">Screening</option>
            <option value="interview">Interviewed</option>
            <option value="offer">Offered</option>
            <option value="hired">Hired</option>
            <option value="rejected">Rejected</option>
          </select>
          <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="">All Sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={requisitionFilter} onChange={(e) => { setRequisitionFilter(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="">All Requisitions</option>
            {requisitions.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                {["Name", "Email", "Position", "Requisition", "Status", "Applied", "Source", ""].map((h) => (
                  <th key={h} className="px-3 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm cursor-pointer" onClick={() => window.location.href = `/zoiko-hr/recruitment/candidates/${c.id}`}>
                  <td className="px-3 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-3 py-3 text-gray-500">{c.email || "-"}</td>
                  <td className="px-3 py-3 text-gray-500 max-w-[150px] truncate">{c.position || "-"}</td>
                  <td className="px-3 py-3 text-gray-500 max-w-[150px] truncate">{c.requisition_title || "-"}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={c.status} />
                      {c.onboarding_new_hire_id && (
                        <span title="Onboarding started" className="text-green-600 text-xs font-medium">✓ Onboarding</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-400">{daysAgo(c.applied_at || c.created_at)}</td>
                  <td className="px-3 py-3 text-xs text-gray-400 capitalize">{c.source || "-"}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="text-gray-400 hover:text-orange-600"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">No candidates found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{filtered.length} total candidate(s)</span>
          <div className="flex items-center gap-2">
            <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-gray-700 font-medium">Page {safePage} of {totalPages}</span>
            <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">{editItem ? "Edit Candidate" : "Add Candidate"}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Phone</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Position</label>
                  <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Job Requisition</label>
                <select value={form.requisition_id} onChange={(e) => handleRequisitionSelect(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">No requisition linked</option>
                  {requisitions.map((r) => <option key={r.id} value={r.id}>{r.title} ({r.department})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="applied">Applied</option>
                    <option value="screening">Screening</option>
                    <option value="interview">Interviewed</option>
                    <option value="offer">Offered</option>
                    <option value="hired">Hired</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Source</label>
                  <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="referral">Referral</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="indeed">Indeed</option>
                    <option value="company_website">Company Website</option>
                    <option value="recruiter">Recruiter</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Location</label>
                  <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Experience (yrs)</label>
                  <input type="number" min={0} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm text-white bg-orange-600 rounded-lg hover:bg-orange-700">{editItem ? "Update" : "Add"}</button>
            </div>
          </div>
        </div>
      )}
    </HRPage>
  );
}
