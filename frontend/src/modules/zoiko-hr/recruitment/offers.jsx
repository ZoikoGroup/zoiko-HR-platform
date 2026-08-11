import { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { FileCheck2, Plus, Search, ChevronLeft, ChevronRight, X, Edit2, Trash2, AlertCircle, DollarSign, Calendar, Clock, User } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getOffers, createOffer, updateOffer, deleteOffer, acceptOffer, rejectOffer, withdrawOffer, getCandidates } from "../../../service/hrService";

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

function StatusBadge({ status }) {
  const m = { draft: "bg-gray-100 text-gray-800", pending: "bg-yellow-100 text-yellow-800", approved: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-800", accepted: "bg-blue-100 text-blue-800", countered: "bg-purple-100 text-purple-800", withdrawn: "bg-gray-100 text-gray-500" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${m[status] || "bg-gray-100 text-gray-800"}`}>{status?.replace(/_/g, " ")}</span>;
}

const PAGE_SIZE = 8;
const initForm = { candidate_id: "", candidate_name: "", position: "", salary: "", equity: "", joining_date: "", status: "draft", notes: "" };

export default function OfferManagement() {
  const [offers, setOffers] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ ...initForm });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getOffers({ per_page: 100 }),
      getCandidates({ per_page: 200 }).catch(() => ({ items: [] })),
    ]).then(([d, cands]) => {
      setOffers(Array.isArray(d) ? d : d?.items || d?.data || []);
      setCandidates(Array.isArray(cands) ? cands : cands?.items || cands?.data || []);
    }).catch((err) => {
      console.error("Offers load error:", err);
      setError("Failed to load offers.");
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = offers.filter((o) => {
    if (search && !o.candidate_name?.toLowerCase().includes(search.toLowerCase()) && !o.position?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && o.status !== statusFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const formatSalary = (val) => {
    if (!val) return "-";
    const n = Number(val);
    if (isNaN(n)) return val;
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
    return `$${n.toLocaleString()}`;
  };

  const openCreate = () => { setEditItem(null); setForm({ ...initForm }); setShowModal(true); };
  const openEdit = (o) => {
    setEditItem(o);
    setForm({
      candidate_id: o.candidate_id ? String(o.candidate_id) : "",
      candidate_name: o.candidate_name || "",
      position: o.position || "",
      salary: o.salary ?? "",
      equity: o.equity ?? "",
      joining_date: o.joining_date ? o.joining_date.split("T")[0] : "",
      status: o.status || "draft",
      notes: o.notes || "",
    });
    setShowModal(true);
  };

  const handleCandidateSelect = (candId) => {
    const cand = candidates.find((c) => String(c.id) === String(candId));
    setForm((prev) => ({
      ...prev,
      candidate_id: candId,
      candidate_name: cand ? cand.name : prev.candidate_name,
      position: cand ? cand.position || prev.position : prev.position,
    }));
  };

  const handleSave = async () => {
    try {
      const payload = {
        candidate_id: form.candidate_id ? Number(form.candidate_id) : null,
        candidate_name: form.candidate_name,
        position: form.position,
        salary: Number(form.salary) || null,
        equity: form.equity || null,
        joining_date: form.joining_date || null,
        status: form.status,
        notes: form.notes,
      };
      if (editItem) {
        await updateOffer(editItem.id, payload);
      } else {
        await createOffer(payload);
      }
      setShowModal(false);
      load();
    } catch (err) {
      console.error("Save offer error:", err);
      setError(err.message || "Failed to save offer.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this offer?")) return;
    try {
      await deleteOffer(id);
      load();
    } catch (err) {
      console.error("Delete offer error:", err);
      setError(err.message || "Failed to delete offer.");
    }
  };

  const handleAccept = async (id) => {
    if (!window.confirm("Accept this offer?")) return;
    try {
      await acceptOffer(id);
      load();
    } catch (err) {
      console.error("Accept offer error:", err);
      setError(err.message || "Failed to accept offer.");
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm("Reject this offer?")) return;
    try {
      await rejectOffer(id);
      load();
    } catch (err) {
      console.error("Reject offer error:", err);
      setError(err.message || "Failed to reject offer.");
    }
  };

  const handleWithdraw = async (id) => {
    if (!window.confirm("Withdraw this offer?")) return;
    try {
      await withdrawOffer(id);
      load();
    } catch (err) {
      console.error("Withdraw offer error:", err);
      setError(err.message || "Failed to withdraw offer.");
    }
  };

  if (loading) return <HRPage title="Offer Management" subtitle="Create and manage job offers"><SubNav /><div className="p-6 text-gray-400">Loading...</div></HRPage>;

  if (error) return <HRPage title="Offer Management" subtitle="Create and manage job offers"><SubNav /><div className="p-6 text-center"><div className="inline-flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-lg"><AlertCircle className="w-5 h-5" />{error}</div><div className="mt-4"><button onClick={load} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm">Try Again</button></div></div></HRPage>;

  return (
    <HRPage title="Offer Management" subtitle="Create and manage job offers">
      <SubNav />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Offers</h1>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> New Offer
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search offers..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="accepted">Accepted</option>
            <option value="countered">Countered</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                {["Candidate", "Position", "Salary", "Equity", "Status", "Start Date", "Created", ""].map((h) => (
                  <th key={h} className="px-3 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((o) => (
                <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                  <td className="px-3 py-3 font-medium text-gray-900">
                    <div className="flex items-center gap-1.5" title={o.candidate_id ? "Linked to candidate record" : "Not linked to a candidate — accepting won't trigger onboarding"}>
                      <User className="w-3.5 h-3.5 text-gray-400" />{o.candidate_name || "-"}
                      {!o.candidate_id && <span className="text-amber-500 text-xs">⚠</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-gray-500">{o.position || "-"}</td>
                  <td className="px-3 py-3"><div className="flex items-center gap-1.5 font-medium text-gray-900"><DollarSign className="w-3.5 h-3.5 text-green-500" />{formatSalary(o.salary)}</div></td>
                  <td className="px-3 py-3 text-gray-500">{o.equity ? `${o.equity}%` : "-"}</td>
                  <td className="px-3 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-3 py-3 text-xs text-gray-500"><div className="flex items-center gap-1.5"><Calendar className="w-3 h-3" />{formatDate(o.joining_date)}</div></td>
                  <td className="px-3 py-3 text-xs text-gray-400">{formatDate(o.created_at)}</td>
                  <td className="px-3 py-3">
                      <div className="flex gap-2 items-center">
                        <button onClick={() => openEdit(o)} className="text-gray-400 hover:text-orange-600"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(o.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        {(o.status === "draft" || o.status === "pending") && <button onClick={() => handleAccept(o.id)} className="text-xs text-green-600 hover:text-green-800 font-medium">Accept</button>}
                        {(o.status === "draft" || o.status === "pending") && <button onClick={() => handleReject(o.id)} className="text-xs text-red-600 hover:text-red-800 font-medium">Reject</button>}
                        {(o.status === "draft" || o.status === "pending" || o.status === "approved") && <button onClick={() => handleWithdraw(o.id)} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Withdraw</button>}
                      </div>
                    </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">No offers found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{filtered.length} total offer(s)</span>
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
              <h2 className="text-lg font-semibold">{editItem ? "Edit Offer" : "New Offer"}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">Link to Candidate</label>
                <select value={form.candidate_id} onChange={(e) => handleCandidateSelect(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">No candidate linked (name only)</option>
                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
                </select>
                {!form.candidate_id && (
                  <p className="text-xs text-amber-600 mt-1">Without a linked candidate, accepting this offer won't automatically mark them Hired or start Onboarding.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Candidate Name</label>
                  <input value={form.candidate_name} onChange={(e) => setForm({ ...form, candidate_name: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Position</label>
                  <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Salary</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="100000" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Equity (%)</label>
                  <input type="number" step="0.1" value={form.equity} onChange={(e) => setForm({ ...form, equity: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="0.5" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Start Date</label>
                  <input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="draft">Draft</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="accepted">Accepted</option>
                    <option value="countered">Countered</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={3} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm text-white bg-orange-600 rounded-lg hover:bg-orange-700">{editItem ? "Update" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </HRPage>
  );
}
