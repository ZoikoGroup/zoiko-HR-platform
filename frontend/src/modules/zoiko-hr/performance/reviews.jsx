import { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { Plus, X, Edit2, Trash2, Star, User, MessageSquare, CheckCircle, XCircle, Send } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getStoredUser } from "../../../service/api";
import { getHrEmployees } from "../../../service/hrService";
import {
  getPerformanceReviews, createPerformanceReview, updatePerformanceReview, deletePerformanceReview,
  getPeerFeedback, createPeerFeedback, deletePeerFeedback,
  getDefaultReviewers,
} from "../../../service/hrService";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/performance" },
  { label: "Goals & OKRs", href: "/zoiko-hr/performance/goals" },
  { label: "Performance Reviews", href: "/zoiko-hr/performance/reviews" },
  { label: "Appraisals", href: "/zoiko-hr/performance/appraisals" },
  { label: "Performance Analytics", href: "/zoiko-hr/performance/analytics" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/performance"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const m = { pending: "bg-yellow-100 text-yellow-800", in_progress: "bg-purple-100 text-purple-800", completed: "bg-green-100 text-green-800", approved: "bg-green-100 text-green-800" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${m[status] || "bg-gray-100 text-gray-800"}`}>{status?.replace(/_/g, " ")}</span>;
}

function FeedbackTypeBadge({ type }) {
  const m = { peer: "bg-indigo-100 text-indigo-800", manager: "bg-orange-100 text-orange-800", self: "bg-teal-100 text-teal-800", "360": "bg-purple-100 text-purple-800" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${m[type] || "bg-gray-100 text-gray-800"}`}>{type?.replace(/_/g, " ")}</span>;
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  try { return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return dateStr; }
}

export default function PerformanceReviews() {
  const [tab, setTab] = useState("reviews");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [reviews, setReviews] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editReview, setEditReview] = useState(null);
  const [reviewForm, setReviewForm] = useState({ employee_id: "", reviewer_id: "", hr_reviewer_id: "", admin_reviewer_id: "", cycle: "", rating: 3, comments: "" });
  const [feedbackForm, setFeedbackForm] = useState({ employee_id: "", reviewer_id: "", feedback_type: "peer", rating: 5, comments: "", strengths: "", improvements: "" });
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const empMap = {};
  employees.forEach((e) => {
    const first = e.firstName || e.first_name;
    const last = e.lastName || e.last_name;
    empMap[e.id] = e.fullName || e.full_name || (first && last ? `${first} ${last}` : null) || `#${e.id}`;
  });

  const currentUser = getStoredUser();
  const currentUserId = currentUser?.id || null;

  const loadAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      getPerformanceReviews().then((r) => { setReviews(Array.isArray(r) ? r : r?.items || r?.data || []); }).catch(() => {}),
      getPeerFeedback().then((f) => { setFeedback(Array.isArray(f) ? f : f?.items || f?.data || []); }).catch(() => {}),
      getHrEmployees({ per_page: 200, include_all_roles: true }).then((e) => { setEmployees(Array.isArray(e) ? e : e?.items || e?.data || []); }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filteredReviews = reviews.filter((r) => {
    if (reviewFilter === "self") return currentUserId && (r.employee_id === currentUserId || r.reviewer_id === currentUserId);
    if (reviewFilter === "manager") return true;
    return true;
  });

  const openCreate = () => {
    setEditReview(null);
    setReviewForm({ employee_id: currentUserId || "", reviewer_id: "", hr_reviewer_id: "", admin_reviewer_id: "", cycle: "", rating: 3, comments: "" });
    setShowModal(true);
  };

  const openEdit = (r) => {
    setEditReview(r);
    setReviewForm({ employee_id: r.employee_id, reviewer_id: r.reviewer_id || "", hr_reviewer_id: r.hr_reviewer_id || "", admin_reviewer_id: r.admin_reviewer_id || "", cycle: r.cycle, rating: r.rating || 3, comments: r.comments || "" });
    setShowModal(true);
  };

  const handleReviewSave = async () => {
    const payload = { ...reviewForm, employee_id: Number(reviewForm.employee_id), reviewer_id: reviewForm.reviewer_id ? Number(reviewForm.reviewer_id) : null, hr_reviewer_id: reviewForm.hr_reviewer_id ? Number(reviewForm.hr_reviewer_id) : null, admin_reviewer_id: reviewForm.admin_reviewer_id ? Number(reviewForm.admin_reviewer_id) : null, rating: Number(reviewForm.rating) };
    if (editReview) {
      await updatePerformanceReview(editReview.id, payload);
    } else {
      await createPerformanceReview(payload);
    }
    setShowModal(false);
    loadAll();
  };

  const handleEmployeeChangeForReview = async (employeeId) => {
    setReviewForm((prev) => ({ ...prev, employee_id: employeeId, reviewer_id: prev.reviewer_id || "", hr_reviewer_id: prev.hr_reviewer_id || "", admin_reviewer_id: prev.admin_reviewer_id || "" }));
    if (!employeeId) return;
    try {
      const res = await getDefaultReviewers(employeeId);
      const data = res?.data || res;
      setReviewForm((prev) => ({
        ...prev,
        employee_id: employeeId,
        reviewer_id: prev.reviewer_id || data.manager_id || "",
        hr_reviewer_id: prev.hr_reviewer_id || data.hr_reviewer_id || "",
        admin_reviewer_id: prev.admin_reviewer_id || data.admin_reviewer_id || "",
      }));
    } catch {
      // leave defaults unchanged
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this review?")) return;
    await deletePerformanceReview(id);
    loadAll();
  };

  const handleStatusChange = async (id, status) => {
    const review = reviews.find((r) => r.id === id);
    if (!review) return;
    await updatePerformanceReview(id, { ...review, status });
    loadAll();
  };

  const handleFeedbackCreate = async () => {
    await createPeerFeedback({ ...feedbackForm, employee_id: Number(feedbackForm.employee_id), reviewer_id: feedbackForm.reviewer_id ? Number(feedbackForm.reviewer_id) : null, rating: Number(feedbackForm.rating) });
    setShowFeedbackModal(false);
    setFeedbackForm({ employee_id: "", reviewer_id: "", feedback_type: "peer", rating: 5, comments: "", strengths: "", improvements: "" });
    loadAll();
  };

  const handleFeedbackDelete = async (id) => {
    if (!window.confirm("Delete this feedback?")) return;
    await deletePeerFeedback(id);
    loadAll();
  };

  if (loading) return <HRPage title="Performance Reviews" subtitle="Review cycles, feedback, and 360 reviews"><SubNav /><div className="p-6 text-gray-400">Loading...</div></HRPage>;

  return (
    <HRPage title="Performance Reviews" subtitle="Review cycles, feedback, and 360 reviews">
      <SubNav />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <button onClick={() => setTab("reviews")} className={`text-sm font-medium pb-2 border-b-2 transition-colors ${tab === "reviews" ? "text-blue-600 border-blue-600" : "text-gray-400 border-transparent hover:text-gray-600"}`}>Reviews</button>
            <button onClick={() => setTab("feedback")} className={`text-sm font-medium pb-2 border-b-2 transition-colors ${tab === "feedback" ? "text-blue-600 border-blue-600" : "text-gray-400 border-transparent hover:text-gray-600"}`}>Feedback & 360</button>
          </div>
          <button onClick={() => tab === "reviews" ? openCreate() : setShowFeedbackModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> {tab === "reviews" ? "New Review" : "Give Feedback"}
          </button>
        </div>

        {tab === "reviews" && (
          <>
            <div className="flex gap-2 flex-wrap">
              {[
                { key: "all", label: "All Reviews" },
                { key: "self", label: "My Reviews" },
                { key: "manager", label: "All" },
              ].map((f) => (
                <button key={f.key} onClick={() => setReviewFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${reviewFilter === f.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {f.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                <p className="text-xs text-blue-600 font-medium">Pending</p>
                <p className="text-2xl font-bold text-blue-700">{filteredReviews.filter((r) => r.status === "pending").length}</p>
              </div>
              <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
                <p className="text-xs text-purple-600 font-medium">In Progress</p>
                <p className="text-2xl font-bold text-purple-700">{filteredReviews.filter((r) => r.status === "in_progress").length}</p>
              </div>
              <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                <p className="text-xs text-green-600 font-medium">Completed</p>
                <p className="text-2xl font-bold text-green-700">{filteredReviews.filter((r) => r.status === "completed" || r.status === "approved").length}</p>
              </div>
              <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
                <p className="text-xs text-orange-600 font-medium">Total</p>
                <p className="text-2xl font-bold text-orange-700">{filteredReviews.length}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    {["Employee", "Reviewer", "HR Reviewer", "Admin Reviewer", "Cycle", "Rating", "Status", "Actions", ""].map((h) => (
                      <th key={h} className="px-3 py-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredReviews.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                      <td className="px-3 py-3 font-medium text-gray-900">{empMap[r.employee_id] || `#${r.employee_id}`}</td>
                      <td className="px-3 py-3 text-gray-500">{empMap[r.reviewer_id] || (r.reviewer_id ? `#${r.reviewer_id}` : "-")}</td>
                      <td className="px-3 py-3 text-gray-500">{empMap[r.hr_reviewer_id] || (r.hr_reviewer_id ? `#${r.hr_reviewer_id}` : "-")}</td>
                      <td className="px-3 py-3 text-gray-500">{empMap[r.admin_reviewer_id] || (r.admin_reviewer_id ? `#${r.admin_reviewer_id}` : "-")}</td>
                      <td className="px-3 py-3">{r.cycle}</td>
                      <td className="px-3 py-3">{r.rating ? `${r.rating}/5` : "-"}</td>
                      <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {r.status === "pending" && (
                            <button onClick={() => handleStatusChange(r.id, "in_progress")} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200"><Send className="w-3 h-3" /> Start</button>
                          )}
                          {r.status === "in_progress" && (
                            <button onClick={() => handleStatusChange(r.id, "completed")} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-green-100 text-green-700 rounded-md hover:bg-green-200"><CheckCircle className="w-3 h-3" /> Complete</button>
                          )}
                          {r.status === "completed" && (
                            <button onClick={() => handleStatusChange(r.id, "approved")} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"><CheckCircle className="w-3 h-3" /> Approve</button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(r.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredReviews.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">No reviews found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "feedback" && (
          <div className="space-y-4">
            {feedback.map((fb) => (
              <div key={fb.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {empMap[fb.employee_id] || `#${fb.employee_id}`}
                        <span className="text-gray-400 font-normal mx-1">→</span>
                        {empMap[fb.reviewer_id] || (fb.reviewer_id ? `#${fb.reviewer_id}` : "N/A")}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <FeedbackTypeBadge type={fb.feedback_type} />
                        <span className="text-xs text-gray-400">{formatDate(fb.submitted_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {fb.rating && (
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} className={`w-4 h-4 ${s <= fb.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`} />
                        ))}
                      </div>
                    )}
                    <button onClick={() => handleFeedbackDelete(fb.id)} className="text-gray-400 hover:text-red-600 ml-2"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {fb.comments && (
                  <div className="flex items-start gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                    <MessageSquare className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
                    <p>"{fb.comments}"</p>
                  </div>
                )}
                {(fb.strengths || fb.improvements) && (
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    {fb.strengths && <div className="bg-green-50 rounded-lg p-2"><span className="font-medium text-green-700">Strengths:</span> {fb.strengths}</div>}
                    {fb.improvements && <div className="bg-orange-50 rounded-lg p-2"><span className="font-medium text-orange-700">Improvements:</span> {fb.improvements}</div>}
                  </div>
                )}
              </div>
            ))}
            {feedback.length === 0 && (
              <div className="text-center py-12 text-gray-400">No feedback found</div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">{editReview ? "Edit Review" : "New Review"}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">Employee</label>
                <select value={reviewForm.employee_id} onChange={(e) => handleEmployeeChangeForReview(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select employee</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{empMap[e.id]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Reviewer (Manager)</label>
                <select value={reviewForm.reviewer_id} onChange={(e) => setReviewForm({ ...reviewForm, reviewer_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select reviewer</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{empMap[e.id]}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">HR Reviewer</label>
                  <select value={reviewForm.hr_reviewer_id} onChange={(e) => setReviewForm({ ...reviewForm, hr_reviewer_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select HR reviewer</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{empMap[e.id]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Admin Reviewer</label>
                  <select value={reviewForm.admin_reviewer_id} onChange={(e) => setReviewForm({ ...reviewForm, admin_reviewer_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select admin reviewer</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{empMap[e.id]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Cycle</label>
                <input value={reviewForm.cycle} onChange={(e) => setReviewForm({ ...reviewForm, cycle: e.target.value })} placeholder="Q1 2025" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Rating (1-5)</label>
                <input type="number" min={1} max={5} value={reviewForm.rating} onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Comments</label>
                <textarea value={reviewForm.comments} onChange={(e) => setReviewForm({ ...reviewForm, comments: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleReviewSave} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">{editReview ? "Update" : "Create"}</button>
            </div>
          </div>
        </div>
      )}

      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Give Feedback</h2>
              <button onClick={() => setShowFeedbackModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Employee</label>
                  <select value={feedbackForm.employee_id} onChange={(e) => setFeedbackForm({ ...feedbackForm, employee_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{empMap[e.id]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Reviewer</label>
                  <select value={feedbackForm.reviewer_id} onChange={(e) => setFeedbackForm({ ...feedbackForm, reviewer_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{empMap[e.id]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Type</label>
                <select value={feedbackForm.feedback_type} onChange={(e) => setFeedbackForm({ ...feedbackForm, feedback_type: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="peer">Peer</option>
                  <option value="manager">Manager</option>
                  <option value="self">Self</option>
                  <option value="360">360 Review</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Rating (1-5)</label>
                <input type="number" min={1} max={5} value={feedbackForm.rating} onChange={(e) => setFeedbackForm({ ...feedbackForm, rating: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Comments</label>
                <textarea value={feedbackForm.comments} onChange={(e) => setFeedbackForm({ ...feedbackForm, comments: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Strengths</label>
                <textarea value={feedbackForm.strengths} onChange={(e) => setFeedbackForm({ ...feedbackForm, strengths: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Areas for Improvement</label>
                <textarea value={feedbackForm.improvements} onChange={(e) => setFeedbackForm({ ...feedbackForm, improvements: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowFeedbackModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleFeedbackCreate} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">Submit</button>
            </div>
          </div>
        </div>
      )}
    </HRPage>
  );
}
