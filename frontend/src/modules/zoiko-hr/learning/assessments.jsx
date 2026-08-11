import { useState, useEffect, useMemo } from "react";
import HRPage from "../../../components/HRPage";
import {
  getAssessments,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  getAssessmentById,
  getQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getCourses,
  getQuizAttempts,
} from "../../../service/hrService";

const ASSESS_STATUS_COLORS = {
  draft: "bg-yellow-100 text-yellow-800",
  published: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-800",
};

const ASSESS_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const ATTEMPT_STATUS_COLORS = {
  passed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  in_progress: "bg-blue-100 text-blue-800",
};

const QUESTION_TYPES = [
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "true_false", label: "True/False" },
  { value: "short_answer", label: "Short Answer" },
  { value: "essay", label: "Essay" },
];

const ITEMS_PER_PAGE = 10;

const initialForm = {
  title: "",
  description: "",
  course_id: "",
  duration_minutes: "",
  passing_score: "",
  max_attempts: "",
  resource_link: "",
};

const questionForm = {
  question_text: "",
  question_type: "multiple_choice",
  options: "",
  correct_answer: "",
  points: "",
};

export default function ZoikoHRAssessments({ isTab }) {
  const [activeTab, setActiveTab] = useState("assessments");
  const [assessments, setAssessments] = useState([]);
  const [quizAttempts, setQuizAttempts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [editQuestionId, setEditQuestionId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ ...initialForm });
  const [formErrors, setFormErrors] = useState({});
  const [editForm, setEditForm] = useState({ ...initialForm });
  const [questionFormData, setQuestionFormData] = useState({ ...questionForm });
  const [selectedAssessmentId, setSelectedAssessmentId] = useState(null);

  const fetchAssessments = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, crs] = await Promise.all([
        getAssessments(),
        getCourses({}),
      ]);
      setAssessments(Array.isArray(data) ? data : []);
      setCourses(Array.isArray(crs?.items) ? crs.items : []);
    } catch (err) {
      setError(err.message || "Failed to load assessments");
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchQuizAttemptsForAssessment = async (assessmentId) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getQuizAttempts(assessmentId);
      setQuizAttempts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load quiz attempts");
      setQuizAttempts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "assessments") fetchAssessments();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "attempts") {
      if (selectedAssessmentId) {
        fetchQuizAttemptsForAssessment(selectedAssessmentId);
      } else {
        setQuizAttempts([]);
      }
    }
  }, [activeTab, selectedAssessmentId]);

  const courseMap = useMemo(() => {
    const m = {}; courses.forEach((c) => { m[c.id] = c; }); return m;
  }, [courses]);

  const stats = useMemo(() => {
    const total = assessments.length;
    const published = assessments.filter((a) => a.status === "published").length;
    const draft = assessments.filter((a) => a.status === "draft").length;
    return { total, published, draft };
  }, [assessments]);

  const filtered = useMemo(() => {
    let result = assessments;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.title?.toLowerCase().includes(q) ||
          (courseMap[a.course_id]?.course_name || courseMap[a.course_id]?.title || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [assessments, search, courseMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const qTotalPages = Math.max(1, Math.ceil(quizAttempts.length / ITEMS_PER_PAGE));
  const qSafePage = Math.min(currentPage, qTotalPages);
  const qPaginated = useMemo(() => {
    const start = (qSafePage - 1) * ITEMS_PER_PAGE;
    return quizAttempts.slice(start, start + ITEMS_PER_PAGE);
  }, [quizAttempts, qSafePage]);

  const resetForm = () => setFormData({ ...initialForm });

  const validateForm = (data) => {
    const errors = {};
    if (!data.title?.trim()) errors.title = "Title is required";
    if (!data.course_id) errors.course_id = "Course is required";
    return errors;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const errors = validateForm(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      await createAssessment({
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        course_id: parseInt(formData.course_id, 10),
        duration_minutes: formData.duration_minutes ? parseInt(formData.duration_minutes, 10) : null,
        passing_score: formData.passing_score ? parseInt(formData.passing_score, 10) : 70,
        max_attempts: formData.max_attempts ? parseInt(formData.max_attempts, 10) : null,
        resource_link: formData.resource_link.trim() || null,
      });
      setShowCreateModal(false);
      resetForm();
      await fetchAssessments();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to create assessment" });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (assessment) => {
    setEditItem(assessment);
    setEditForm({
      title: assessment.title || "",
      description: assessment.description || "",
      course_id: assessment.course_id ? String(assessment.course_id) : "",
      duration_minutes: assessment.duration_minutes ? String(assessment.duration_minutes) : "",
      passing_score: assessment.passing_score ? String(assessment.passing_score) : "",
      max_attempts: assessment.max_attempts ? String(assessment.max_attempts) : "",
      resource_link: assessment.resource_link || "",
    });
    setFormErrors({});
    setShowEditModal(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editItem) return;
    const errors = validateForm(editForm);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      await updateAssessment(editItem.id, {
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        course_id: parseInt(editForm.course_id, 10),
        duration_minutes: editForm.duration_minutes ? parseInt(editForm.duration_minutes, 10) : null,
        passing_score: editForm.passing_score ? parseInt(editForm.passing_score, 10) : 70,
        max_attempts: editForm.max_attempts ? parseInt(editForm.max_attempts, 10) : null,
        resource_link: editForm.resource_link.trim() || null,
      });
      setShowEditModal(false);
      setEditItem(null);
      await fetchAssessments();
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to update assessment" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this assessment?")) return;
    try {
      await deleteAssessment(id);
      await fetchAssessments();
    } catch (err) {
      setError(err.message || "Failed to delete assessment");
    }
  };

  const openDetailModal = async (id) => {
    setLoading(true);
    try {
      const data = await getAssessmentById(id);
      setDetailItem(data);
      const qs = await getQuestions(id);
      setQuestions(Array.isArray(qs) ? qs : []);
      setShowDetailModal(true);
    } catch (err) {
      setError(err.message || "Failed to load assessment details");
    } finally {
      setLoading(false);
    }
  };

  const resetQuestionForm = () => {
    setQuestionFormData({ ...questionForm });
    setEditQuestionId(null);
  };

  const openQuestionModal = (question) => {
    if (question) {
      setEditQuestionId(question.id);
      setQuestionFormData({
        question_text: question.question_text || "",
        question_type: question.question_type || "multiple_choice",
        options: Array.isArray(question.options) ? question.options.join(", ") : (question.options || ""),
        correct_answer: question.correct_answer || "",
        points: question.points ? String(question.points) : "",
      });
    } else {
      resetQuestionForm();
    }
    setShowQuestionModal(true);
  };

  const handleQuestionSubmit = async (e) => {
    e.preventDefault();
    if (!questionFormData.question_text.trim() || !detailItem) return;
    setSubmitting(true);
    try {
      const payload = {
        question_text: questionFormData.question_text.trim(),
        question_type: questionFormData.question_type,
        options: questionFormData.options ? questionFormData.options.split(",").map((o) => o.trim()).filter(Boolean) : null,
        correct_answer: questionFormData.correct_answer.trim() || null,
        points: questionFormData.points ? parseInt(questionFormData.points, 10) : null,
      };
      if (editQuestionId) {
        await updateQuestion(detailItem.id, editQuestionId, payload);
      } else {
        await createQuestion(detailItem.id, payload);
      }
      setShowQuestionModal(false);
      resetQuestionForm();
      const qs = await getQuestions(detailItem.id);
      setQuestions(Array.isArray(qs) ? qs : []);
    } catch (err) {
      setError(err.message || "Failed to save question");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteQuestion = async (id) => {
    if (!window.confirm("Delete this question?")) return;
    try {
      await deleteQuestion(detailItem.id, id);
      const qs = await getQuestions(detailItem.id);
      setQuestions(Array.isArray(qs) ? qs : []);
    } catch (err) {
      setError(err.message || "Failed to delete question");
    }
  };

  const tabs = [
    { key: "assessments", label: "Assessments" },
    { key: "attempts", label: "Quiz Attempts" },
  ];

  const content = (
    <>
      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setActiveTab(t.key); setCurrentPage(1); setSearch(""); setError(null); setSelectedAssessmentId(null); }}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      {formErrors.submit && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{formErrors.submit}</div>
      )}

      {activeTab === "assessments" && (
        <>
          {loading && assessments.length === 0 ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-500">Loading assessments...</span>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap justify-between items-center gap-4">
                <div className="flex flex-wrap gap-3">
                  <div className="bg-white px-4 py-2 border border-gray-100 rounded-lg shadow-sm text-sm">
                    <span className="text-gray-400">Total: </span>
                    <span className="font-bold text-gray-800">{stats.total}</span>
                  </div>
                  <div className="bg-white px-4 py-2 border border-green-100 rounded-lg shadow-sm text-sm">
                    <span className="text-gray-400">Published: </span>
                    <span className="font-bold text-green-600">{stats.published}</span>
                  </div>
                  <div className="bg-white px-4 py-2 border border-yellow-100 rounded-lg shadow-sm text-sm">
                    <span className="text-gray-400">Draft: </span>
                    <span className="font-bold text-yellow-600">{stats.draft}</span>
                  </div>
                </div>
                <button
                  onClick={() => { resetForm(); setShowCreateModal(true); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  + Add Assessment
                </button>
              </div>

              {assessments.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  <input
                    type="text"
                    placeholder="Search by title or course..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {filtered.length === 0 && !loading ? (
                <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
                  <p className="text-gray-500 font-medium">
                    {assessments.length === 0
                      ? "No assessments yet. Add your first assessment to get started."
                      : "No assessments match your search criteria."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Title</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Course</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Passing Score</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Max Attempts</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                            <th className="text-center px-4 py-3 font-semibold text-gray-600">Questions</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Resource</th>
                            <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {paginated.map((a) => (
                            <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 font-medium text-gray-800">
                                <button
                                  onClick={() => openDetailModal(a.id)}
                                  className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                >
                                  {a.title}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-gray-600">{courseMap[a.course_id]?.course_name || courseMap[a.course_id]?.title || <span className="text-gray-300">-</span>}</td>
                              <td className="px-4 py-3 text-gray-700">{a.passing_score ?? <span className="text-gray-300">-</span>}</td>
                              <td className="px-4 py-3 text-gray-700">{a.max_attempts ?? <span className="text-gray-300">-</span>}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ASSESS_STATUS_COLORS[a.status] || ASSESS_STATUS_COLORS.draft}`}>
                                  {a.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center text-gray-700">{a.questions_count ?? <span className="text-gray-300">-</span>}</td>
                              <td className="px-4 py-3">
                                {a.resource_link ? (
                                  <a href={a.resource_link} target="_blank" rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 text-xs font-medium hover:underline">
                                    View
                                  </a>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => openEditModal(a)}
                                    className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDelete(a.id)}
                                    className="text-red-500 hover:text-red-700 text-xs font-medium px-1"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">
                        Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={safePage <= 1}
                          className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                        >
                          Prev
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                          <button
                            key={p}
                            onClick={() => setCurrentPage(p)}
                            className={`px-3 py-1 text-sm border rounded-lg ${
                              p === safePage
                                ? "bg-blue-600 text-white border-blue-600"
                                : "border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                        <button
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={safePage >= totalPages}
                          className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === "attempts" && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Assessment</label>
            <select
              value={selectedAssessmentId ?? ""}
              onChange={(e) => setSelectedAssessmentId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-md"
            >
              <option value="">Choose an assessment...</option>
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
          </div>

          {loading && quizAttempts.length === 0 ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-500">Loading quiz attempts...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {quizAttempts.length === 0 && !loading ? (
                <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
                  <p className="text-gray-500 font-medium">
                    {selectedAssessmentId ? "No quiz attempts found for this assessment." : "Select an assessment to view quiz attempts."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Assessment ID</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Employee ID</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Score</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Started At</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Completed At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {qPaginated.map((a) => (
                            <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 font-medium text-gray-800">{a.assessment_id}</td>
                              <td className="px-4 py-3 text-gray-700">{a.employee_id}</td>
                              <td className="px-4 py-3 text-gray-700">{a.score ?? "-"}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ATTEMPT_STATUS_COLORS[a.status] || "bg-gray-100 text-gray-800"}`}>
                                  {a.status ? a.status.replace(/_/g, " ") : "-"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500">{a.started_at ? new Date(a.started_at).toLocaleString() : "-"}</td>
                              <td className="px-4 py-3 text-xs text-gray-500">{a.completed_at ? new Date(a.completed_at).toLocaleString() : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {qTotalPages > 1 && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">
                        Showing {(qSafePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(qSafePage * ITEMS_PER_PAGE, quizAttempts.length)} of {quizAttempts.length}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={qSafePage <= 1}
                          className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                        >
                          Prev
                        </button>
                        {Array.from({ length: qTotalPages }, (_, i) => i + 1).map((p) => (
                          <button
                            key={p}
                            onClick={() => setCurrentPage(p)}
                            className={`px-3 py-1 text-sm border rounded-lg ${
                              p === qSafePage
                                ? "bg-blue-600 text-white border-blue-600"
                                : "border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                        <button
                          onClick={() => setCurrentPage((p) => Math.min(qTotalPages, p + 1))}
                          disabled={qSafePage >= qTotalPages}
                          className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Add Assessment</h2>
              <button onClick={() => { setShowCreateModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className={`w-full border ${formErrors.title ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.title && <p className="text-red-500 text-xs mt-1">{formErrors.title}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course *</label>
                <select
                  value={formData.course_id}
                  onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
                  className={`w-full border ${formErrors.course_id ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">Select course...</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.course_name || c.title}</option>
                  ))}
                </select>
                  {formErrors.course_id && <p className="text-red-500 text-xs mt-1">{formErrors.course_id}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resource Link / PDF URL</label>
                <input
                  type="url"
                  value={formData.resource_link}
                  onChange={(e) => setFormData({ ...formData, resource_link: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/assessment-material.pdf"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Passing Score</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.passing_score}
                    onChange={(e) => setFormData({ ...formData, passing_score: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Attempts</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.max_attempts}
                    onChange={(e) => setFormData({ ...formData, max_attempts: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreateModal(false); resetForm(); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Creating..." : "Create Assessment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Update Assessment</h2>
              <button onClick={() => { setShowEditModal(false); setEditItem(null); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleUpdate} className="p-6 space-y-4">
              <div className="text-sm text-gray-500 mb-1">
                Editing: <span className="font-medium text-gray-800">{editItem.title}</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className={`w-full border ${formErrors.title ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.title && <p className="text-red-500 text-xs mt-1">{formErrors.title}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course *</label>
                <select
                  value={editForm.course_id}
                  onChange={(e) => setEditForm({ ...editForm, course_id: e.target.value })}
                  className={`w-full border ${formErrors.course_id ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">Select course...</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.course_name || c.title}</option>
                  ))}
                </select>
                  {formErrors.course_id && <p className="text-red-500 text-xs mt-1">{formErrors.course_id}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resource Link / PDF URL</label>
                <input
                  type="url"
                  value={editForm.resource_link}
                  onChange={(e) => setEditForm({ ...editForm, resource_link: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/assessment-material.pdf"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
                  <input
                    type="number"
                    min="1"
                    value={editForm.duration_minutes}
                    onChange={(e) => setEditForm({ ...editForm, duration_minutes: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Passing Score</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.passing_score}
                    onChange={(e) => setEditForm({ ...editForm, passing_score: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Attempts</label>
                  <input
                    type="number"
                    min="1"
                    value={editForm.max_attempts}
                    onChange={(e) => setEditForm({ ...editForm, max_attempts: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {editItem.created_at && (
                <div className="text-xs text-gray-400">Created: {new Date(editItem.created_at).toLocaleString()}</div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowEditModal(false); setEditItem(null); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Updating..." : "Update Assessment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDetailModal && detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Assessment Details</h2>
              <button onClick={() => { setShowDetailModal(false); setDetailItem(null); setQuestions([]); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Title</label>
                  <p className="text-sm text-gray-900 font-medium">{detailItem.title}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Course</label>
                  <p className="text-sm text-gray-900">{courseMap[detailItem.course_id]?.course_name || courseMap[detailItem.course_id]?.title || `#${detailItem.course_id}`}</p>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-500 mb-1">Description</label>
                  <p className="text-sm text-gray-700">{detailItem.description || <span className="text-gray-400">-</span>}</p>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-500 mb-1">Resource Link</label>
                  {detailItem.resource_link ? (
                    <a href={detailItem.resource_link} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium break-all">
                      {detailItem.resource_link}
                    </a>
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Passing Score</label>
                  <p className="text-sm text-gray-900">{detailItem.passing_score ?? "-"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Max Attempts</label>
                  <p className="text-sm text-gray-900">{detailItem.max_attempts ?? "-"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Duration</label>
                  <p className="text-sm text-gray-900">{detailItem.duration_minutes ? `${detailItem.duration_minutes} min` : "-"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Status</label>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ASSESS_STATUS_COLORS[detailItem.status] || ASSESS_STATUS_COLORS.draft}`}>
                    {detailItem.status}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Questions ({questions.length})</h3>
                  <button
                    onClick={() => openQuestionModal(null)}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg font-medium"
                  >
                    + Add Question
                  </button>
                </div>
                {questions.length === 0 ? (
                  <p className="text-sm text-gray-400">No questions added yet.</p>
                ) : (
                  <div className="space-y-2">
                    {questions.map((q, i) => (
                      <div key={q.id} className="bg-gray-50 rounded-lg px-4 py-3 flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-400">Q{i + 1}.</span>
                            <span className="text-sm font-medium text-gray-800">{q.question_text}</span>
                            <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{q.question_type?.replace(/_/g, " ")}</span>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {q.options?.length > 0 && <span>Options: {q.options.join(", ")} | </span>}
                            {q.correct_answer && <span>Answer: {q.correct_answer} | </span>}
                            Points: {q.points ?? "-"}
                          </div>
                        </div>
                        <div className="flex gap-1 ml-3">
                          <button onClick={() => openQuestionModal(q)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                          <button onClick={() => handleDeleteQuestion(q.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Del</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Timeline</h3>
                <div className="space-y-1 text-xs text-gray-600">
                  <div>Created: {detailItem.created_at ? new Date(detailItem.created_at).toLocaleString() : <span className="text-gray-400">-</span>}</div>
                  <div>Updated: {detailItem.updated_at ? new Date(detailItem.updated_at).toLocaleString() : <span className="text-gray-400">-</span>}</div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => { setShowDetailModal(false); setDetailItem(null); setQuestions([]); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Close</button>
                <button onClick={() => { setShowDetailModal(false); setDetailItem(null); setQuestions([]); openEditModal(detailItem); }} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">Edit Assessment</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showQuestionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">{editQuestionId ? "Edit Question" : "Add Question"}</h2>
              <button onClick={() => { setShowQuestionModal(false); resetQuestionForm(); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleQuestionSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Question Text *</label>
                <textarea
                  rows={2}
                  value={questionFormData.question_text}
                  onChange={(e) => setQuestionFormData({ ...questionFormData, question_text: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Question Type</label>
                  <select
                    value={questionFormData.question_type}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, question_type: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {QUESTION_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Points</label>
                  <input
                    type="number"
                    min="0"
                    value={questionFormData.points}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, points: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Options (comma-separated)</label>
                <input
                  type="text"
                  value={questionFormData.options}
                  onChange={(e) => setQuestionFormData({ ...questionFormData, options: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correct Answer</label>
                <input
                  type="text"
                  value={questionFormData.correct_answer}
                  onChange={(e) => setQuestionFormData({ ...questionFormData, correct_answer: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowQuestionModal(false); resetQuestionForm(); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Saving..." : editQuestionId ? "Update Question" : "Add Question"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );

  if (isTab) {
    return content;
  }

  return (
    <HRPage title="Assessments & Quizzes" subtitle="Create and manage assessments, quizzes, and track attempts.">
      {content}
    </HRPage>
  );
}
