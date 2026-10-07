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
import { formatDateTime } from "../../../utils/dateTime";
import {
  QUESTION_TYPES, EMPTY_ASSESSMENT, EMPTY_QUESTION, assessmentToForm, validateAssessmentForm, assessmentPayload,
  parseOptions, questionToForm, validateQuestionForm, questionPayload, serverFormErrors, ASSESSMENT_LABELS, QUESTION_LABELS,
  resultOf, scoreText,
} from "../../../utils/assessmentForm";

const ITEMS_PER_PAGE = 10;
const inputBase = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const TONES = { green: "bg-green-100 text-green-800", red: "bg-red-100 text-red-800", blue: "bg-blue-100 text-blue-800" };

function Pager({ page, total, onPage, count }) {
  if (total <= 1) return null;
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-400">Showing {(page - 1) * ITEMS_PER_PAGE + 1}-{Math.min(page * ITEMS_PER_PAGE, count)} of {count}</span>
      <div className="flex gap-1">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
        {Array.from({ length: total }, (_, i) => i + 1).map((p) => (
          <button key={p} onClick={() => onPage(p)} className={`px-3 py-1 text-sm border rounded-lg ${p === page ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 hover:bg-gray-50"}`}>{p}</button>
        ))}
        <button onClick={() => onPage(Math.min(total, page + 1))} disabled={page >= total} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
      </div>
    </div>
  );
}

// One form for adding and editing, so both ask for (and check) exactly the same things.
function AssessmentForm({ title, form, setForm, errors, setErrors, courses, editing, submitting, submitLabel, busyLabel, onSubmit, onCancel }) {
  const set = (key) => (e) => {
    const value = key === "is_active" ? e.target.value === "active" : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] || prev.submit ? { ...prev, [key]: undefined, submit: undefined } : prev));
  };
  const box = (name) => `${inputBase} ${errors[name] ? "border-red-300" : "border-gray-200"}`;
  const err = (name) => (errors[name] ? <p role="alert" className="text-red-500 text-xs mt-1">{errors[name]}</p> : null);
  const star = <span className="text-red-500"> *</span>;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <button type="button" aria-label="Close" onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form noValidate onSubmit={onSubmit} className="p-6 space-y-4">
          {errors.submit && <div role="alert" className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{errors.submit}</div>}
          <p className="text-xs text-gray-400">Fields marked <span className="text-red-500">*</span> are required.</p>

          <div>
            <label htmlFor="a-title" className="block text-sm font-medium text-gray-700 mb-1">Title{star}</label>
            <input id="a-title" type="text" value={form.title} maxLength={200} aria-invalid={!!errors.title} onChange={set("title")} className={box("title")} />
            {err("title")}
          </div>
          <div>
            <label htmlFor="a-desc" className="block text-sm font-medium text-gray-700 mb-1">Description{star}</label>
            <textarea id="a-desc" rows={2} value={form.description} maxLength={5000} aria-invalid={!!errors.description} onChange={set("description")} className={box("description")} />
            {err("description")}
          </div>
          <div>
            <label htmlFor="a-course" className="block text-sm font-medium text-gray-700 mb-1">Course{star}</label>
            <select id="a-course" value={form.course_id} aria-invalid={!!errors.course_id} onChange={set("course_id")} className={box("course_id")}>
              <option value="">Select course...</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.course_name || c.title}</option>)}
            </select>
            {err("course_id")}
          </div>
          <div>
            <label htmlFor="a-link" className="block text-sm font-medium text-gray-700 mb-1">Resource Link / PDF URL</label>
            <input id="a-link" type="text" value={form.resource_link} maxLength={500} aria-invalid={!!errors.resource_link} onChange={set("resource_link")} placeholder="https://example.com/assessment-material.pdf" className={box("resource_link")} />
            {err("resource_link")}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="a-pass" className="block text-sm font-medium text-gray-700 mb-1">Passing Score (%){star}</label>
              <input id="a-pass" type="number" min={1} max={100} step={1} value={form.passing_score} aria-invalid={!!errors.passing_score} onChange={set("passing_score")} placeholder="e.g. 70" className={box("passing_score")} />
              {err("passing_score")}
            </div>
            <div>
              <label htmlFor="a-attempts" className="block text-sm font-medium text-gray-700 mb-1">Max Attempts</label>
              <input id="a-attempts" type="number" min={1} max={100} step={1} value={form.max_attempts} aria-invalid={!!errors.max_attempts} onChange={set("max_attempts")} placeholder="Unlimited" className={box("max_attempts")} />
              {err("max_attempts")}
            </div>
            <div>
              <label htmlFor="a-duration" className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
              <input id="a-duration" type="number" min={1} max={600} step={1} value={form.duration_minutes} aria-invalid={!!errors.duration_minutes} onChange={set("duration_minutes")} placeholder="No limit" className={box("duration_minutes")} />
              {err("duration_minutes")}
            </div>
          </div>
          <p className="text-[11px] text-gray-400 -mt-2">The passing score is the percentage of the total points a learner must earn. Leave Max Attempts or Duration empty for no limit.</p>
          {editing && (
            <div>
              <label htmlFor="a-status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select id="a-status" value={form.is_active ? "active" : "inactive"} onChange={set("is_active")} className={box("status")}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <p className="text-[11px] text-gray-400 mt-1">Learners only see active assessments.</p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">{submitting ? busyLabel : submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QuestionForm({ editing, form, setForm, errors, setErrors, submitting, onSubmit, onCancel }) {
  const set = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setErrors((prev) => (prev[key] || prev.submit ? { ...prev, [key]: undefined, submit: undefined } : prev));
  };
  const box = (name) => `${inputBase} ${errors[name] ? "border-red-300" : "border-gray-200"}`;
  const err = (name) => (errors[name] ? <p role="alert" className="text-red-500 text-xs mt-1">{errors[name]}</p> : null);
  const star = <span className="text-red-500"> *</span>;
  const options = parseOptions(form.options);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{editing ? "Edit Question" : "Add Question"}</h2>
          <button type="button" aria-label="Close" onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form noValidate onSubmit={onSubmit} className="p-6 space-y-4">
          {errors.submit && <div role="alert" className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{errors.submit}</div>}
          <div>
            <label htmlFor="q-text" className="block text-sm font-medium text-gray-700 mb-1">Question Text{star}</label>
            <textarea id="q-text" rows={2} value={form.question_text} maxLength={2000} aria-invalid={!!errors.question_text} onChange={set("question_text")} className={box("question_text")} />
            {err("question_text")}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="q-type" className="block text-sm font-medium text-gray-700 mb-1">Question Type{star}</label>
              <select id="q-type" value={form.question_type} onChange={set("question_type")} className={box("question_type")}>
                {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {err("question_type")}
            </div>
            <div>
              <label htmlFor="q-points" className="block text-sm font-medium text-gray-700 mb-1">Points{star}</label>
              <input id="q-points" type="number" min={1} max={100} step={1} value={form.points} aria-invalid={!!errors.points} onChange={set("points")} placeholder="e.g. 1" className={box("points")} />
              {err("points")}
            </div>
          </div>
          {form.question_type === "multiple_choice" && (
            <>
              <div>
                <label htmlFor="q-options" className="block text-sm font-medium text-gray-700 mb-1">Options (comma-separated){star}</label>
                <input id="q-options" type="text" value={form.options} aria-invalid={!!errors.options} onChange={set("options")} placeholder="Red, Blue, Green" className={box("options")} />
                {err("options")}
              </div>
              <div>
                <label htmlFor="q-answer" className="block text-sm font-medium text-gray-700 mb-1">Correct Answer{star}</label>
                <select id="q-answer" value={form.correct_answer} aria-invalid={!!errors.correct_answer} onChange={set("correct_answer")} className={box("correct_answer")}>
                  <option value="">Choose the correct option</option>
                  {options.map((o) => <option key={o} value={o}>{o}</option>)}
                  {form.correct_answer && !options.some((o) => o.toLowerCase() === form.correct_answer.toLowerCase()) && <option value={form.correct_answer}>{form.correct_answer} (not in the options)</option>}
                </select>
                {err("correct_answer")}
              </div>
            </>
          )}
          {form.question_type === "true_false" && (
            <div>
              <label htmlFor="q-answer" className="block text-sm font-medium text-gray-700 mb-1">Correct Answer{star}</label>
              <select id="q-answer" value={form.correct_answer} aria-invalid={!!errors.correct_answer} onChange={set("correct_answer")} className={box("correct_answer")}>
                <option value="">Choose</option>
                <option value="True">True</option>
                <option value="False">False</option>
              </select>
              {err("correct_answer")}
            </div>
          )}
          {form.question_type === "short_answer" && (
            <div>
              <label htmlFor="q-answer" className="block text-sm font-medium text-gray-700 mb-1">Correct Answer{star}</label>
              <input id="q-answer" type="text" value={form.correct_answer} aria-invalid={!!errors.correct_answer} onChange={set("correct_answer")} className={box("correct_answer")} />
              {err("correct_answer")}
            </div>
          )}
          {form.question_type === "essay" && <p className="text-xs text-gray-400">An essay has no answer key. A person marks it.</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">{submitting ? "Saving..." : editing ? "Update Question" : "Add Question"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ZoikoHRAssessments({ isTab }) {
  const [activeTab, setActiveTab] = useState("assessments");
  const [assessments, setAssessments] = useState([]);
  const [quizAttempts, setQuizAttempts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [editQuestionId, setEditQuestionId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_ASSESSMENT });
  const [formErrors, setFormErrors] = useState({});
  const [questionData, setQuestionData] = useState({ ...EMPTY_QUESTION });
  const [questionErrors, setQuestionErrors] = useState({});
  const [selectedAssessmentId, setSelectedAssessmentId] = useState(null);

  const fetchAssessments = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, crs] = await Promise.all([getAssessments(), getCourses({ per_page: 200 })]);
      setAssessments(Array.isArray(data) ? data : []);
      setCourses(Array.isArray(crs?.items) ? crs.items : Array.isArray(crs) ? crs : []);
    } catch (err) {
      setError(err.message || "Failed to load assessments");
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttempts = async (assessmentId) => {
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

  useEffect(() => { if (activeTab === "assessments" || assessments.length === 0) fetchAssessments(); }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab !== "attempts") return;
    if (selectedAssessmentId) fetchAttempts(selectedAssessmentId);
    else setQuizAttempts([]);
  }, [activeTab, selectedAssessmentId]);

  const courseName = (id) => courses.find((c) => c.id === id)?.course_name || assessments.find((a) => a.course_id === id)?.course_name || `Course #${id}`;

  const stats = useMemo(() => ({
    total: assessments.length,
    active: assessments.filter((a) => a.is_active).length,
    inactive: assessments.filter((a) => !a.is_active).length,
    noQuestions: assessments.filter((a) => !a.questions_count).length,
  }), [assessments]);

  const filtered = useMemo(() => {
    if (!search.trim()) return assessments;
    const q = search.toLowerCase();
    return assessments.filter((a) => a.title?.toLowerCase().includes(q) || (a.course_name || "").toLowerCase().includes(q));
  }, [assessments, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);
  const aTotalPages = Math.max(1, Math.ceil(quizAttempts.length / ITEMS_PER_PAGE));
  const aSafePage = Math.min(currentPage, aTotalPages);
  const aPaginated = quizAttempts.slice((aSafePage - 1) * ITEMS_PER_PAGE, aSafePage * ITEMS_PER_PAGE);

  const openCreate = () => { setFormData({ ...EMPTY_ASSESSMENT }); setFormErrors({}); setShowCreate(true); };
  const closeForm = () => { setShowCreate(false); setEditItem(null); setFormErrors({}); };
  const openEdit = (a) => { setEditItem(a); setFormData(assessmentToForm(a)); setFormErrors({}); };

  const save = async (e, existing) => {
    e.preventDefault();
    const errors = validateAssessmentForm(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = assessmentPayload(formData, !!existing);
      if (existing) await updateAssessment(existing.id, payload);
      else await createAssessment(payload);
      closeForm();
      await fetchAssessments();
    } catch (err) {
      const fields = serverFormErrors(err?.validation, ASSESSMENT_LABELS);
      setFormErrors(Object.keys(fields).length ? fields : { submit: err.message || (existing ? "The assessment could not be updated." : "The assessment could not be created.") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (a) => {
    if (!window.confirm(`Delete "${a.title}" and its questions?`)) return;
    try {
      await deleteAssessment(a.id);
      await fetchAssessments();
    } catch (err) {
      setError(err.message || "Failed to delete assessment");
    }
  };

  const loadQuestions = async (id) => {
    const qs = await getQuestions(id);
    setQuestions(Array.isArray(qs) ? qs : []);
  };

  const openDetail = async (id) => {
    try {
      setDetailItem(await getAssessmentById(id));
      await loadQuestions(id);
    } catch (err) {
      setError(err.message || "Failed to load assessment details");
    }
  };

  const closeDetail = () => { setDetailItem(null); setQuestions([]); };
  const openQuestion = (q) => {
    setQuestionErrors({});
    setEditQuestionId(q ? q.id : null);
    setQuestionData(q ? questionToForm(q) : { ...EMPTY_QUESTION });
    setQuestionOpen(true);
  };
  const closeQuestion = () => { setQuestionOpen(false); setEditQuestionId(null); setQuestionErrors({}); };

  const saveQuestion = async (e) => {
    e.preventDefault();
    if (!detailItem) return;
    const errors = validateQuestionForm(questionData);
    setQuestionErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      const payload = questionPayload(questionData);
      if (editQuestionId) await updateQuestion(detailItem.id, editQuestionId, payload);
      else await createQuestion(detailItem.id, payload);
      closeQuestion();
      await loadQuestions(detailItem.id);
      setDetailItem(await getAssessmentById(detailItem.id));
      fetchAssessments();
    } catch (err) {
      const fields = serverFormErrors(err?.validation, QUESTION_LABELS);
      setQuestionErrors(Object.keys(fields).length ? fields : { submit: err.message || "The question could not be saved." });
    } finally {
      setSubmitting(false);
    }
  };

  const removeQuestion = async (id) => {
    if (!window.confirm("Delete this question?")) return;
    try {
      await deleteQuestion(detailItem.id, id);
      await loadQuestions(detailItem.id);
      setDetailItem(await getAssessmentById(detailItem.id));
      fetchAssessments();
    } catch (err) {
      setError(err.message || "Failed to delete question");
    }
  };

  const tabs = [{ key: "assessments", label: "Assessments" }, { key: "attempts", label: "Quiz Attempts" }];

  const content = (
    <>
      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setActiveTab(t.key); setCurrentPage(1); setSearch(""); setError(null); setSelectedAssessmentId(null); }}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      {activeTab === "assessments" && (
        loading && assessments.length === 0 ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-500">Loading assessments...</span>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="flex flex-wrap gap-3">
                <div className="bg-white px-4 py-2 border border-gray-100 rounded-lg shadow-sm text-sm"><span className="text-gray-400">Total: </span><span className="font-bold text-gray-800">{stats.total}</span></div>
                <div className="bg-white px-4 py-2 border border-green-100 rounded-lg shadow-sm text-sm"><span className="text-gray-400">Active: </span><span className="font-bold text-green-600">{stats.active}</span></div>
                <div className="bg-white px-4 py-2 border border-gray-100 rounded-lg shadow-sm text-sm"><span className="text-gray-400">Inactive: </span><span className="font-bold text-gray-500">{stats.inactive}</span></div>
                {stats.noQuestions > 0 && (
                  <div className="bg-amber-50 px-4 py-2 border border-amber-200 rounded-lg shadow-sm text-sm text-amber-800">
                    <span className="font-bold">{stats.noQuestions}</span> without questions, open it to add some
                  </div>
                )}
              </div>
              <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ Add Assessment</button>
            </div>

            {assessments.length > 0 && (
              <input type="text" placeholder="Search by title or course..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            )}

            {filtered.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
                <p className="text-gray-500 font-medium">{assessments.length === 0 ? "No assessments yet. Add your first assessment to get started." : "No assessments match your search criteria."}</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {["Title", "Course", "Passing Score", "Max Attempts", "Duration", "Status"].map((h) => <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>)}
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Questions</th>
                          <th className="text-left px-4 py-3 font-semibold text-gray-600">Resource</th>
                          <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {paginated.map((a) => (
                          <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-800">
                              <button onClick={() => openDetail(a.id)} className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left">{a.title}</button>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{a.course_name || courseName(a.course_id)}</td>
                            <td className="px-4 py-3 text-gray-700">{a.passing_score != null ? `${a.passing_score}%` : <span className="text-amber-700 text-xs font-medium">Not set</span>}</td>
                            <td className="px-4 py-3 text-gray-700">{a.max_attempts ?? <span className="text-gray-400">Unlimited</span>}</td>
                            <td className="px-4 py-3 text-gray-700">{a.duration_minutes ? `${a.duration_minutes} min` : <span className="text-gray-400">No limit</span>}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${a.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>{a.is_active ? "Active" : "Inactive"}</span>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-700">{a.questions_count ?? 0}</td>
                            <td className="px-4 py-3">
                              {a.resource_link ? <a href={a.resource_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-xs font-medium hover:underline">View</a> : <span className="text-gray-300">-</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openEdit(a)} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1">Edit</button>
                                <button onClick={() => handleDelete(a)} className="text-red-500 hover:text-red-700 text-xs font-medium px-1">Delete</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <Pager page={safePage} total={totalPages} onPage={setCurrentPage} count={filtered.length} />
              </>
            )}
          </div>
        )
      )}

      {activeTab === "attempts" && (
        <>
          <div className="mb-4">
            <label htmlFor="attempt-assessment" className="block text-sm font-medium text-gray-700 mb-1">Select Assessment</label>
            <select id="attempt-assessment" value={selectedAssessmentId ?? ""} onChange={(e) => { setSelectedAssessmentId(e.target.value ? parseInt(e.target.value, 10) : null); setCurrentPage(1); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-md">
              <option value="">Choose an assessment...</option>
              {assessments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </div>
          {loading && quizAttempts.length === 0 ? (
            <div className="flex justify-center items-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div><span className="ml-3 text-gray-500">Loading quiz attempts...</span></div>
          ) : quizAttempts.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
              <p className="text-gray-500 font-medium">{selectedAssessmentId ? "No quiz attempts found for this assessment." : "Select an assessment to view quiz attempts."}</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>{["Employee", "Attempt", "Score", "Result", "Started", "Completed"].map((h) => <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {aPaginated.map((a) => {
                        const result = resultOf(a);
                        return (
                          <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-800">{a.employee_name || `Employee #${a.employee_id}`}</td>
                            <td className="px-4 py-3 text-gray-700">#{a.attempt_number}</td>
                            <td className="px-4 py-3 text-gray-700">{scoreText(a)}</td>
                            <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TONES[result.tone]}`}>{result.label}</span></td>
                            <td className="px-4 py-3 text-xs text-gray-500">{a.started_at ? formatDateTime(a.started_at) : "-"}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{a.completed_at ? formatDateTime(a.completed_at) : "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <Pager page={aSafePage} total={aTotalPages} onPage={setCurrentPage} count={quizAttempts.length} />
            </div>
          )}
        </>
      )}

      {showCreate && (
        <AssessmentForm title="Add Assessment" form={formData} setForm={setFormData} errors={formErrors} setErrors={setFormErrors} courses={courses}
          editing={false} submitting={submitting} submitLabel="Create Assessment" busyLabel="Creating..." onSubmit={(e) => save(e, null)} onCancel={closeForm} />
      )}
      {editItem && (
        <AssessmentForm title="Update Assessment" form={formData} setForm={setFormData} errors={formErrors} setErrors={setFormErrors} courses={courses}
          editing submitting={submitting} submitLabel="Update Assessment" busyLabel="Updating..." onSubmit={(e) => save(e, editItem)} onCancel={closeForm} />
      )}

      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div role="dialog" aria-label="Assessment details" className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{detailItem.title}</h2>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${detailItem.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>{detailItem.is_active ? "Active" : "Inactive"}</span>
              </div>
              <button aria-label="Close" onClick={closeDetail} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-1">Description</p>
                <p className="text-gray-700 whitespace-pre-wrap">{detailItem.description || "Not provided"}</p>
              </div>
              <dl className="grid grid-cols-2 gap-4">
                {[
                  ["Course", detailItem.course_name || courseName(detailItem.course_id)],
                  ["Passing score", detailItem.passing_score != null ? `${detailItem.passing_score}%` : "Not set"],
                  ["Max attempts", detailItem.max_attempts ?? "Unlimited"],
                  ["Duration", detailItem.duration_minutes ? `${detailItem.duration_minutes} min` : "No limit"],
                ].map(([label, value]) => <div key={label}><dt className="text-xs text-gray-400">{label}</dt><dd className="font-medium text-gray-800">{value}</dd></div>)}
                <div className="col-span-2">
                  <dt className="text-xs text-gray-400">Resource</dt>
                  <dd className="font-medium">{detailItem.resource_link ? <a href={detailItem.resource_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{detailItem.resource_link}</a> : <span className="text-gray-800">Not provided</span>}</dd>
                </div>
              </dl>

              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Questions ({questions.length})</h3>
                  <button onClick={() => openQuestion(null)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg font-medium">+ Add Question</button>
                </div>
                {questions.length === 0 ? (
                  <p className="text-sm text-gray-400">No questions added yet.</p>
                ) : (
                  <div className="space-y-2">
                    {questions.map((q, i) => (
                      <div key={q.id} className="bg-gray-50 rounded-lg px-4 py-3 flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-gray-400">Q{i + 1}.</span>
                            <span className="text-sm font-medium text-gray-800">{q.question_text}</span>
                            <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{q.question_type?.replace(/_/g, " ")}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {q.options?.length > 0 && <span>Options: {q.options.join(", ")} | </span>}
                            {q.correct_answer ? <span>Answer: {q.correct_answer} | </span> : <span>Marked by a person | </span>}
                            Points: {q.points}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-3">
                          <button onClick={() => openQuestion(q)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                          <button onClick={() => removeQuestion(q.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100 text-xs text-gray-600 space-y-1">
                <div>Created: {detailItem.created_at ? formatDateTime(detailItem.created_at) : "-"}</div>
                <div>Updated: {detailItem.updated_at ? formatDateTime(detailItem.updated_at) : "-"}</div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={closeDetail} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Close</button>
                <button onClick={() => { const item = detailItem; closeDetail(); openEdit(item); }} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">Edit Assessment</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {questionOpen && (
        <QuestionForm editing={!!editQuestionId} form={questionData} setForm={setQuestionData} errors={questionErrors} setErrors={setQuestionErrors}
          submitting={submitting} onSubmit={saveQuestion} onCancel={closeQuestion} />
      )}
    </>
  );

  if (isTab) return content;

  return (
    <HRPage title="Assessments & Quizzes" subtitle="Create and manage assessments, quizzes, and track attempts.">
      {content}
    </HRPage>
  );
}
