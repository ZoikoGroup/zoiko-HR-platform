import { api, API_BASE_URL } from "./api";

// ── CORE GENERIC FETCHERS ──────────────────────────────────────────────────
export async function fetchList(resource) {
  const url = `/hr/${resource}`;
  // Directly returns the api call promise; no local mock fallbacks
  return api.get(url);
}


export const createRecord = (resource, payload) => api.post(`/hr/${resource}`, payload);
export const updateRecord = (resource, id, payload) => api.put(`/hr/${resource}/${id}`, payload);
export const deleteRecord = (resource, id) => api.delete(`/hr/${resource}/${id}`)

export const getCurrentUser = () => api.get("/auth/me");
export const getOverview = () => fetchList("overview");
export const getAttendance = () => fetchList("attendance");
export const getLeave = () => api.get("/hr/leaves");
export const getWorkforce = () => fetchList("workforce");
export const getCompensation = () => fetchList("compensation");
export const getCompensationDashboard = () => api.get("/hr/compensation/dashboard");
export const getPayGrades = () => fetchList("compensation/pay-grades");
export const getCompensationBands = () => fetchList("compensation/bands");
export const getSalaryComponents = () => fetchList("compensation/salary-components");
export const getSalaryStructures = () => fetchList("compensation/salary-structures");
export const getStructureComponents = (id) => api.get(`/hr/compensation/salary-structures/${id}/components`);
export const getEmployeeCompensation = (employeeId) => api.get(`/hr/compensation/employee-compensation${employeeId ? `?employee_id=${employeeId}` : ''}`);
export const getSalaryRevisions = () => fetchList("compensation/revisions");
export const getAllowances = () => fetchList("compensation/allowances");
export const getBenefits = () => fetchList("compensation/benefits");
export const getEmployeeBenefits = () => fetchList("compensation/employee-benefits");

export const updateSalaryRevision = (id, payload) => api.put(`/hr/compensation/revisions/${id}`, payload);
export const deleteSalaryRevision = (id) => api.delete(`/hr/compensation/revisions/${id}`);

export const createPayGrade = (payload) => api.post("/hr/compensation/pay-grades", payload);
export const updatePayGrade = (id, payload) => api.put(`/hr/compensation/pay-grades/${id}`, payload);
export const deletePayGrade = (id) => api.delete(`/hr/compensation/pay-grades/${id}`);

export const createCompensationBand = (payload) => api.post("/hr/compensation/bands", payload);
export const updateCompensationBand = (id, payload) => api.put(`/hr/compensation/bands/${id}`, payload);
export const deleteCompensationBand = (id) => api.delete(`/hr/compensation/bands/${id}`);

export const createSalaryComponent = (payload) => api.post("/hr/compensation/salary-components", payload);
export const updateSalaryComponent = (id, payload) => api.put(`/hr/compensation/salary-components/${id}`, payload);
export const deleteSalaryComponent = (id) => api.delete(`/hr/compensation/salary-components/${id}`);

export const createSalaryStructure = (payload) => api.post("/hr/compensation/salary-structures", payload);
export const updateSalaryStructure = (id, payload) => api.put(`/hr/compensation/salary-structures/${id}`, payload);
export const deleteSalaryStructure = (id) => api.delete(`/hr/compensation/salary-structures/${id}`);

export const addStructureComponent = (id, payload) => api.post(`/hr/compensation/salary-structures/${id}/components`, payload);
export const deleteStructureComponent = (id, compId) => api.delete(`/hr/compensation/salary-structures/${id}/components/${compId}`);

export const createEmployeeCompensation = (payload) => api.post("/hr/compensation/employee-compensation", payload);
export const updateEmployeeCompensation = (id, payload) => api.put(`/hr/compensation/employee-compensation/${id}`, payload);
export const deleteEmployeeCompensation = (id) => api.delete(`/hr/compensation/employee-compensation/${id}`);

export const createSalaryRevision = (payload) => api.post("/hr/compensation/revisions", payload);

export const createAllowance = (payload) => api.post("/hr/compensation/allowances", payload);
export const updateAllowance = (id, payload) => api.put(`/hr/compensation/allowances/${id}`, payload);
export const deleteAllowance = (id) => api.delete(`/hr/compensation/allowances/${id}`);

export const createBenefit = (payload) => api.post("/hr/compensation/benefits", payload);
export const updateBenefit = (id, payload) => api.put(`/hr/compensation/benefits/${id}`, payload);
export const deleteBenefit = (id) => api.delete(`/hr/compensation/benefits/${id}`);

export const createEmployeeBenefit = (payload) => api.post("/hr/compensation/employee-benefits", payload);
export const deleteEmployeeBenefit = (id) => api.delete(`/hr/compensation/employee-benefits/${id}`);
export const getPayrollSummary = () => fetchList("payrollSummary");
export const getLearning = () => fetchList("learning");


// ════════════════════════════════════════════════════════════════════════════
// RECRUITMENT MODULE
// ════════════════════════════════════════════════════════════════════════════
export const getRecruitmentDashboard = () => api.get("/hr/recruitment/dashboard");

export const getRequisitions = (params = {}) => api.get("/hr/recruitment/requisitions", { params });
export const getRequisitionById = (id) => api.get(`/hr/recruitment/requisitions/${id}`);
export const createRequisition = (payload) => api.post("/hr/recruitment/requisitions", payload);
export const updateRequisition = (id, payload) => api.put(`/hr/recruitment/requisitions/${id}`, payload);
export const deleteRequisition = (id) => api.delete(`/hr/recruitment/requisitions/${id}`);
export const approveRequisition = (id) => api.put(`/hr/recruitment/requisitions/${id}/approve`);
export const rejectRequisition = (id) => api.put(`/hr/recruitment/requisitions/${id}/reject`);

export const getCandidates = (params = {}) => api.get("/hr/recruitment/candidates", { params });
export const getCandidateById = (id) => api.get(`/hr/recruitment/candidates/${id}`);
export const createCandidate = (payload) => api.post("/hr/recruitment/candidates", payload);
export const updateCandidate = (id, payload) => api.put(`/hr/recruitment/candidates/${id}`, payload);
export const deleteCandidate = (id) => api.delete(`/hr/recruitment/candidates/${id}`);
export const updateCandidateStatus = (id, payload) => api.put(`/hr/recruitment/candidates/${id}/status`, payload);

export const getInterviews = (params = {}) => api.get("/hr/recruitment/interviews", { params });
export const getInterviewById = (id) => api.get(`/hr/recruitment/interviews/${id}`);
export const createInterview = (payload) => api.post("/hr/recruitment/interviews", payload);
export const updateInterview = (id, payload) => api.put(`/hr/recruitment/interviews/${id}`, payload);
export const deleteInterview = (id) => api.delete(`/hr/recruitment/interviews/${id}`);
export const updateInterviewFeedback = (id, payload) => api.put(`/hr/recruitment/interviews/${id}/feedback`, payload);

export const getOffers = (params = {}) => api.get("/hr/recruitment/offers", { params });
export const getOfferById = (id) => api.get(`/hr/recruitment/offers/${id}`);
export const createOffer = (payload) => api.post("/hr/recruitment/offers", payload);
export const updateOffer = (id, payload) => api.put(`/hr/recruitment/offers/${id}`, payload);
export const deleteOffer = (id) => api.delete(`/hr/recruitment/offers/${id}`);
export const acceptOffer = (id) => api.put(`/hr/recruitment/offers/${id}/accept`);
export const rejectOffer = (id) => api.put(`/hr/recruitment/offers/${id}/reject`);
export const withdrawOffer = (id) => api.put(`/hr/recruitment/offers/${id}/withdraw`);

// ════════════════════════════════════════════════════════════════════════════
// TRAVEL MODULE
// ════════════════════════════════════════════════════════════════════════════

export const getHrEmployees = async (params = {}) => {
  try {
    return await api.get("/hr/employees", { params });
  } catch (e) {
    console.warn("/hr/employees failed, trying fallback:", e.message);
    try {
      const fallback = await api.get("/hr/employee-management/employees", { params });
      return fallback;
    } catch (e2) {
      throw new Error(`${e.message}; fallback also failed: ${e2.message}`);
    }
  }
};
export const getTravel = (employeeId) => api.get(`/hr/travel${employeeId ? `?employee_id=${employeeId}` : ''}`);
export const getTravelById = (id) => api.get(`/hr/travel/${id}`);
export const createTravel = (payload) => api.post("/hr/travel", payload);
export const updateTravel = (id, payload) => api.put(`/hr/travel/${id}`, payload);
export const deleteTravel = (id) => api.delete(`/hr/travel/${id}`);

export const getMyProfile = () => api.get("/hr/employees/me");
export const updateMyProfile = (payload) => api.put("/hr/employees/me", payload);

export const getMyLeave = (employeeId) => api.get(`/hr/leaves${employeeId ? `?employee_id=${employeeId}` : ''}`);
export const getMyAttendanceLegacy = (employeeId) => api.get(`/hr/attendance${employeeId ? `?employee_id=${employeeId}` : ''}`);

export const getEss = (employeeId) => api.get(`/hr/ess${employeeId ? `?employee_id=${employeeId}` : ''}`);
export const createEss = (payload) => api.post("/hr/ess", payload);
export const updateEss = (id, payload) => api.put(`/hr/ess/${id}`, payload);
export const deleteEss = (id) => api.delete(`/hr/ess/${id}`);

export const getOnboardingTasks = (employeeId) => api.get(`/hr/onboarding/preboarding-tasks${employeeId ? `?employee_id=${employeeId}` : ''}`);
export const createOnboardingTask = (payload) => api.post("/hr/onboarding/preboarding-tasks", payload);
export const updateOnboardingTask = (id, payload) => api.put(`/hr/onboarding/preboarding-tasks/${id}`, payload);
export const deleteOnboardingTask = (id) => api.delete(`/hr/onboarding/preboarding-tasks/${id}`);

export const getOnboardingRecords = () => api.get("/hr/onboarding/records");
export const getOnboardingRecordById = (id) => api.get(`/hr/onboarding/records/${id}`);
export const createOnboardingRecord = (payload) => api.post("/hr/onboarding/records", payload);
export const updateOnboardingRecord = (id, payload) => api.put(`/hr/onboarding/records/${id}`, payload);
export const deleteOnboardingRecord = (id) => api.delete(`/hr/onboarding/records/${id}`);

// ── ONBOARDING DOCUMENTS ──────────────────────────────────────────────────
export const getOnboardingDocuments = (recordId) => api.get(`/hr/onboarding/documents${recordId ? `?onboarding_record_id=${recordId}` : ''}`);
export const getOnboardingDocumentById = (id) => api.get(`/hr/onboarding/documents/${id}`);
export const createOnboardingDocument = (formData) => api.post("/hr/onboarding/documents", formData, { headers: { "Content-Type": undefined }, auth: true });
export const updateOnboardingDocument = (id, payload) => api.put(`/hr/onboarding/documents/${id}`, payload);
export const deleteOnboardingDocument = (id) => api.delete(`/hr/onboarding/documents/${id}`);

// ── ONBOARDING CHECKLIST TEMPLATES ───────────────────────────────────────
export const getOnboardingChecklistTemplates = (category) => api.get(`/hr/onboarding/checklist-templates${category ? `?category=${category}` : ''}`);
export const getOnboardingChecklistTemplateById = (id) => api.get(`/hr/onboarding/checklist-templates/${id}`);
export const createOnboardingChecklistTemplate = (payload) => api.post("/hr/onboarding/checklist-templates", payload);
export const updateOnboardingChecklistTemplate = (id, payload) => api.put(`/hr/onboarding/checklist-templates/${id}`, payload);
export const deleteOnboardingChecklistTemplate = (id) => api.delete(`/hr/onboarding/checklist-templates/${id}`);

// ── ONBOARDING CHECKLIST ASSIGNMENTS ─────────────────────────────────────
export const getOnboardingChecklistAssignments = (recordId) => api.get(`/hr/onboarding/checklist-assignments${recordId ? `?onboarding_record_id=${recordId}` : ''}`);
export const createOnboardingChecklistAssignment = (payload) => api.post("/hr/onboarding/checklist-assignments", payload);
export const updateOnboardingChecklistAssignment = (id, payload) => api.put(`/hr/onboarding/checklist-assignments/${id}`, payload);
export const deleteOnboardingChecklistAssignment = (id) => api.delete(`/hr/onboarding/checklist-assignments/${id}`);

// ── ONBOARDING ORIENTATIONS ──────────────────────────────────────────────
export const getOnboardingOrientationSessions = () => api.get("/hr/onboarding/orientation-sessions");
export const createOnboardingOrientationSession = (payload) => api.post("/hr/onboarding/orientation-sessions", payload);
export const updateOnboardingOrientationSession = (id, payload) => api.put(`/hr/onboarding/orientation-sessions/${id}`, payload);
export const deleteOnboardingOrientationSession = (id) => api.delete(`/hr/onboarding/orientation-sessions/${id}`);
export const getOnboardingOrientationAttendees = (sessionId) => api.get(`/hr/onboarding/orientation-attendees${sessionId ? `?session_id=${sessionId}` : ""}`);
export const createOnboardingOrientationAttendee = (payload) => api.post("/hr/onboarding/orientation-attendees", payload);
export const updateOnboardingOrientationAttendee = (id, payload) => api.put(`/hr/onboarding/orientation-attendees/${id}`, payload);
export const deleteOnboardingOrientationAttendee = (id) => api.delete(`/hr/onboarding/orientation-attendees/${id}`);

// ── ONBOARDING ACTIVITIES ────────────────────────────────────────────────
export const getOnboardingActivities = (limit = 50) => api.get(`/hr/onboarding/activities?limit=${limit}`);

// ── ONBOARDING DASHBOARD & REPORTS ───────────────────────────────────────
export const getOnboardingDashboard = () => api.get("/hr/onboarding/dashboard");
export const getOnboardingJoiningReport = () => api.get("/hr/onboarding/reports/joining");


// ════════════════════════════════════════════════════════════════════════════
// ASSETS
// ════════════════════════════════════════════════════════════════════════════
export const getAssetDashboard = () => api.get("/hr/assets/dashboard");

export const getAssets = (params = {}) => api.get("/hr/assets", { params });
export const getAssetById = (id) => api.get(`/hr/assets/${id}`);
export const createAsset = (payload) => api.post("/hr/assets", payload);
export const updateAsset = (id, payload) => api.put(`/hr/assets/${id}`, payload);
export const deleteAsset = (id) => api.delete(`/hr/assets/${id}`);

export const getMaintenanceByAsset = (assetId) => api.get(`/hr/assets/${assetId}/maintenance`);
export const getMaintenanceById = (assetId, maintId) => api.get(`/hr/assets/${assetId}/maintenance/${maintId}`);
export const createMaintenance = (assetId, payload) => api.post(`/hr/assets/${assetId}/maintenance`, payload);
export const updateMaintenance = (assetId, maintId, payload) => api.put(`/hr/assets/${assetId}/maintenance/${maintId}`, payload);
export const resolveMaintenance = (assetId, maintId, payload) => api.put(`/hr/assets/${assetId}/maintenance/${maintId}/resolve`, payload);

export const getAssetRequests = (params = {}) => api.get("/hr/assets/requests", { params });
export const createAssetRequest = (payload) => api.post("/hr/assets/requests", payload);
export const approveAssetRequest = (reqId, payload) => api.put(`/hr/assets/requests/${reqId}/approve`, payload);
export const rejectAssetRequest = (reqId) => api.put(`/hr/assets/requests/${reqId}/reject`);
export const fulfillAssetRequest = (reqId) => api.put(`/hr/assets/requests/${reqId}/fulfill`);
export const cancelAssetRequest = (reqId) => api.put(`/hr/assets/requests/${reqId}/cancel`);

export const getAssetCategories = () => api.get("/hr/assets/categories");
export const createAssetCategory = (payload) => api.post("/hr/assets/categories", payload);
export const updateAssetCategory = (catId, payload) => api.put(`/hr/assets/categories/${catId}`, payload);
export const deleteAssetCategory = (catId) => api.delete(`/hr/assets/categories/${catId}`);
export const transferAsset = (assetId, payload) => api.put(`/hr/assets/${assetId}/transfer`, payload);
export const assignAsset = (assetId, payload) => api.put(`/hr/assets/${assetId}/assign`, payload);
export const returnAsset = (assetId, payload) => api.put(`/hr/assets/${assetId}/return`, payload);

export const getAssetReports = () => api.get("/hr/assets/reports");
export const createAssetReport = (payload) => api.post("/hr/assets/reports", payload);

export const getAssetSettings = () => api.get("/hr/assets/settings");
export const updateAssetSetting = (key, payload) => api.put(`/hr/assets/settings/${key}`, payload);

export async function exportAssetsCsv() {
  const { getAccessToken, API_BASE_URL: DynamicBaseUrl } = await import("./api");
  const token = getAccessToken();
  const res = await fetch(`${DynamicBaseUrl}/hr/assets/export/csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to export CSV");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assets_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportAssetsExcel() {
  const { getAccessToken, API_BASE_URL: DynamicBaseUrl } = await import("./api");
  const token = getAccessToken();
  const res = await fetch(`${DynamicBaseUrl}/hr/assets/export/excel`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to export Excel");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assets_${new Date().toISOString().split("T")[0]}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── TIMELINE/LEARNING ──────────────────────────────────────────────────────
export const getLearningDashboard = () => api.get("/hr/learning/dashboard");

export const getCourses = (params = {}) => api.get("/hr/learning/courses", { params });
export const getCourseById = (id) => api.get(`/hr/learning/courses/${id}`);
export const createCourse = (payload) => api.post("/hr/learning/courses", payload);
export const updateCourse = (id, payload) => api.put(`/hr/learning/courses/${id}`, payload);
export const deleteCourse = (id) => api.delete(`/hr/learning/courses/${id}`);



// ── TRAINING PROGRAMS ──────────────────────────────────────────────────────
export const getTrainingPrograms = (params = {}) => api.get("/hr/learning/programs", { params });
export const getTrainingProgramById = (id) => api.get(`/hr/learning/programs/${id}`);
export const createTrainingProgram = (payload) => api.post("/hr/learning/programs", payload);
export const updateTrainingProgram = (id, payload) => api.put(`/hr/learning/programs/${id}`, payload);
export const deleteTrainingProgram = (id) => api.delete(`/hr/learning/programs/${id}`);

// ── ASSESSMENTS & QUIZZES ──────────────────────────────────────────────────
export const getAssessments = (courseId) => api.get(`/hr/learning/assessments${courseId ? `?course_id=${courseId}` : ''}`);
export const getAssessmentById = (id) => api.get(`/hr/learning/assessments/${id}`);
export const createAssessment = (payload) => api.post("/hr/learning/assessments", payload);
export const updateAssessment = (id, payload) => api.put(`/hr/learning/assessments/${id}`, payload);
export const deleteAssessment = (id) => api.delete(`/hr/learning/assessments/${id}`);

export const getQuestions = (assessmentId) => api.get(`/hr/learning/assessments/${assessmentId}/questions`);
export const createQuestion = (assessmentId, payload) => api.post(`/hr/learning/assessments/${assessmentId}/questions`, payload);
export const updateQuestion = (assessmentId, questionId, payload) => api.put(`/hr/learning/assessments/${assessmentId}/questions/${questionId}`, payload);
export const deleteQuestion = (assessmentId, questionId) => api.delete(`/hr/learning/assessments/${assessmentId}/questions/${questionId}`);

export const getQuizAttempts = (assessmentId, employeeId) => {
  let url = `/hr/learning/assessments/${assessmentId}/attempts`;
  const params = [];
  if (employeeId) params.push(`employee_id=${employeeId}`);
  if (params.length) url += `?${params.join("&")}`;
  return api.get(url);
};

// ── LEARNING REPORTS ───────────────────────────────────────────────────────
export const getCourseCompletionReport = () => api.get("/hr/learning/reports/course-completion");
export const getCertificationReport = () => api.get("/hr/learning/reports/certifications");
export const getSkillGapAnalysis = () => api.get("/hr/learning/reports/skill-gap");

async function downloadLearningReport(endpoint, filename) {
  const { getAccessToken, API_BASE_URL } = await import("./api");
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to export learning report");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const exportCourseCompletionReportCsv = () =>
  downloadLearningReport("/hr/learning/reports/course-completion/csv", `course_completion_${new Date().toISOString().split("T")[0]}.csv`);

export const exportCourseCompletionReportExcel = () =>
  downloadLearningReport("/hr/learning/reports/course-completion/excel", `course_completion_${new Date().toISOString().split("T")[0]}.xlsx`);

export const exportCertificationReportCsv = () =>
  downloadLearningReport("/hr/learning/reports/certifications/csv", `certifications_${new Date().toISOString().split("T")[0]}.csv`);

export const exportCertificationReportExcel = () =>
  downloadLearningReport("/hr/learning/reports/certifications/excel", `certifications_${new Date().toISOString().split("T")[0]}.xlsx`);

export const exportSkillGapReportCsv = () =>
  downloadLearningReport("/hr/learning/reports/skill-gap/csv", `skill_gap_${new Date().toISOString().split("T")[0]}.csv`);

export const exportSkillGapReportExcel = () =>
  downloadLearningReport("/hr/learning/reports/skill-gap/excel", `skill_gap_${new Date().toISOString().split("T")[0]}.xlsx`);

export const getPerformanceDashboard = (employeeId) => api.get(`/hr/performance/dashboard${employeeId ? `?employee_id=${employeeId}` : ""}`);

export const getReviewCycles = () => api.get("/hr/performance/cycles");
export const getReviewCycleById = (id) => api.get(`/hr/performance/cycles/${id}`);
export const createReviewCycle = (payload) => api.post("/hr/performance/cycles", payload);
export const updateReviewCycle = (id, payload) => api.put(`/hr/performance/cycles/${id}`, payload);
export const deleteReviewCycle = (id) => api.delete(`/hr/performance/cycles/${id}`);

export const getPerformanceGoals = (employeeId) => api.get(`/hr/performance/goals${employeeId ? `?employee_id=${employeeId}` : ''}`);
export const getPerformanceGoalById = (id) => api.get(`/hr/performance/goals/${id}`);
export const createPerformanceGoal = (payload) => api.post("/hr/performance/goals", payload);
export const updatePerformanceGoal = (id, payload) => api.put(`/hr/performance/goals/${id}`, payload);
export const deletePerformanceGoal = (id) => api.delete(`/hr/performance/goals/${id}`);

export const getPerformanceKpis = (employeeId) => api.get(`/hr/performance/kpis${employeeId ? `?employee_id=${employeeId}` : ''}`);
export const getPerformanceKpiById = (id) => api.get(`/hr/performance/kpis/${id}`);
export const createPerformanceKpi = (payload) => api.post("/hr/performance/kpis", payload);
export const updatePerformanceKpi = (id, payload) => api.put(`/hr/performance/kpis/${id}`, payload);
export const deletePerformanceKpi = (id) => api.delete(`/hr/performance/kpis/${id}`);

export const getPerformanceReviews = (employeeId) => api.get(`/hr/performance${employeeId ? `?employee_id=${employeeId}` : ''}`);
export const getPerformanceReviewById = (id) => api.get(`/hr/performance/${id}`);
export const createPerformanceReview = (payload) => api.post("/hr/performance", payload);
export const updatePerformanceReview = (id, payload) => api.put(`/hr/performance/${id}`, payload);
export const deletePerformanceReview = (id) => api.delete(`/hr/performance/${id}`);

export const getPeerFeedback = (employeeId, reviewerId) => {
  let url = "/hr/performance/feedback";
  const params = [];
  if (employeeId) params.push(`employee_id=${employeeId}`);
  if (reviewerId) params.push(`reviewer_id=${reviewerId}`);
  if (params.length) url += `?${params.join("&")}`;
  return api.get(url);
};
export const createPeerFeedback = (payload) => api.post("/hr/performance/feedback", payload);
export const deletePeerFeedback = (id) => api.delete(`/hr/performance/feedback/${id}`);

export const getImprovementPlans = (employeeId) => api.get(`/hr/performance/pips${employeeId ? `?employee_id=${employeeId}` : ''}`);
export const getImprovementPlanById = (id) => api.get(`/hr/performance/pips/${id}`);
export const createImprovementPlan = (payload) => api.post("/hr/performance/pips", payload);
export const updateImprovementPlan = (id, payload) => api.put(`/hr/performance/pips/${id}`, payload);
export const deleteImprovementPlan = (id) => api.delete(`/hr/performance/pips/${id}`);

export const getPerformanceAppraisals = (employeeId) => api.get(`/hr/performance/appraisals${employeeId ? `?employee_id=${employeeId}` : ''}`);
export const getPerformanceAppraisalById = (id) => api.get(`/hr/performance/appraisals/${id}`);
export const createPerformanceAppraisal = (payload) => api.post("/hr/performance/appraisals", payload);
export const updatePerformanceAppraisal = (id, payload) => api.put(`/hr/performance/appraisals/${id}`, payload);
export const deletePerformanceAppraisal = (id) => api.delete(`/hr/performance/appraisals/${id}`);

export const getPerformanceAnalytics = (employeeId) => api.get(`/hr/performance/analytics${employeeId ? `?employee_id=${employeeId}` : ""}`);

export const getDefaultReviewers = (employeeId) => api.get(`/hr/performance/default-reviewers?employee_id=${employeeId}`);

// ── COMPENSATION & BENEFITS HELPERS ─────────────────────────────────────────
// Compensation Dashboard, PayGrades, Bands, Components, Structures, EmployeeCompensation,
// Revisions, Allowances, Benefits, EmployeeBenefits are exported at top of file (lines 17-63)

// ── HR DASHBOARD STATS ──────────────────────────────────────────────────────
export const getHrDashboardStats = () => api.get("/hr/dashboard/stats");

// ════════════════════════════════════════════════════════════════════════════
// ATTENDANCE MODULE
// ════════════════════════════════════════════════════════════════════════════

// ── Dashboard ──────────────────────────────────────────────────────────────
export const getAttendanceDashboard = () => api.get("/hr/attendance/dashboard");

// ── Attendance Records ────────────────────────────────────────────────────
export const getAttendanceRecords = (params = {}) => api.get("/hr/attendance/records", { params });
export const getAttendanceRecordById = (id) => api.get(`/hr/attendance/records/${id}`);
export const createAttendanceRecord = (payload) => api.post("/hr/attendance/records", payload);
export const updateAttendanceRecord = (id, payload) => api.put(`/hr/attendance/records/${id}`, payload);
export const deleteAttendanceRecord = (id) => api.delete(`/hr/attendance/records/${id}`);

// ── Shifts ────────────────────────────────────────────────────────────────
export const getShifts = (params = {}) => api.get("/hr/attendance/shifts", { params });
export const getShiftById = (id) => api.get(`/hr/attendance/shifts/${id}`);
export const createShift = (payload) => api.post("/hr/attendance/shifts", payload);
export const updateShift = (id, payload) => api.put(`/hr/attendance/shifts/${id}`, payload);
export const deleteShift = (id) => api.delete(`/hr/attendance/shifts/${id}`);

// ── Shift Rosters ─────────────────────────────────────────────────────────
export const getShiftRosters = (params = {}) => api.get("/hr/attendance/shifts/rosters", { params });
export const createShiftRoster = (payload) => api.post("/hr/attendance/shifts/rosters", payload);
export const deleteShiftRoster = (id) => api.delete(`/hr/attendance/shifts/rosters/${id}`);

// ── Holidays ──────────────────────────────────────────────────────────────
export const getHolidays = (params = {}) => api.get("/hr/attendance/holidays", { params });
export const getHolidayById = (id) => api.get(`/hr/attendance/holidays/${id}`);
export const createHoliday = (payload) => api.post("/hr/attendance/holidays", payload);
export const updateHoliday = (id, payload) => api.put(`/hr/attendance/holidays/${id}`, payload);
export const deleteHoliday = (id) => api.delete(`/hr/attendance/holidays/${id}`);
export const importHolidays = (payload) => api.post("/hr/attendance/holidays/import", payload);

// ── Exports ────────────────────────────────────────────────────────────────
export async function exportAttendanceCsv(params = {}) {
  const { getAccessToken, API_BASE_URL } = await import("./api");
  const token = getAccessToken();
  const queryString = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const response = await fetch(`${API_BASE_URL}/hr/attendance/export/csv${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to export attendance CSV");
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "attendance_export.csv";
  a.click();
  window.URL.revokeObjectURL(url);
}

export async function exportAttendanceExcel(params = {}) {
  const { getAccessToken, API_BASE_URL } = await import("./api");
  const token = getAccessToken();
  const queryString = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const response = await fetch(`${API_BASE_URL}/hr/attendance/export/excel${queryString ? `?${queryString}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to export attendance Excel");
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "attendance_export.xlsx";
  a.click();
  window.URL.revokeObjectURL(url);
}

// ── Analytics ─────────────────────────────────────────────────────────────
export const getAttendanceAnalytics = (params = {}) => api.get("/hr/attendance/analytics", { params });
export const getAttendanceTrends = (params = {}) => api.get("/hr/attendance/analytics/trends", { params });
export const getDepartmentAnalysis = (params = {}) => api.get("/hr/attendance/analytics/department", { params });
export const getOvertimeAnalytics = (params = {}) => api.get("/hr/attendance/analytics/overtime", { params });
export const getShiftEfficiency = (params = {}) => api.get("/hr/attendance/analytics/shift-efficiency", { params });

// ── LEAVE CRUD SPECIFIC ─────────────────────────────────────────────────────
export const createLeaveRequest = (payload) => api.post("/hr/leaves", payload);
export const getLeaveRequests = (employeeId, params = {}) => {
  const query = new URLSearchParams();
  if (employeeId) query.set("employee_id", employeeId);
  if (params.status) query.set("status", params.status);
  if (params.leave_type) query.set("leave_type", params.leave_type);
  if (params.start_date) query.set("start_date", params.start_date);
  if (params.end_date) query.set("end_date", params.end_date);
  const qs = query.toString();
  return api.get(`/hr/leaves${qs ? `?${qs}` : ""}`);
};
export const getLeaveRequest = (id) => api.get(`/hr/leaves/${id}`);
export const updateLeaveRequest = (id, payload) => api.put(`/hr/leaves/${id}`, payload);
export const deleteLeaveRequest = (id) => api.delete(`/hr/leaves/${id}`);
export const reviewLeaveRequest = (id, payload) => api.put(`/hr/leaves/${id}/review`, payload);
export const getLeaveDashboard = () => api.get("/hr/leaves/dashboard");
export const getLeaveCalendar = (params = {}) => {
  const query = new URLSearchParams();
  if (params.year) query.set("year", params.year);
  if (params.month) query.set("month", params.month);
  const qs = query.toString();
  return api.get(`/hr/leaves/calendar${qs ? `?${qs}` : ""}`);
};
export const getLeaveStatistics = () => api.get("/hr/leaves/statistics");
export const getLeaveTypeConfigs = () => api.get("/hr/leaves/type-configs");
export const createLeaveTypeConfig = (payload) => api.post("/hr/leaves/type-configs", payload);
export const updateLeaveTypeConfig = (id, payload) => api.put(`/hr/leaves/type-configs/${id}`, payload);
export const deleteLeaveTypeConfig = (id) => api.delete(`/hr/leaves/type-configs/${id}`);
export const getLeaveBalances = (employeeId) =>
  api.get(`/hr/leaves/balance${employeeId ? `?employee_id=${employeeId}` : ""}`);
export const updateLeaveBalance = (id, payload) => api.put(`/hr/leaves/balance/${id}`, payload);
export const initLeaveBalances = (employeeId, year) =>
  api.post(`/hr/leaves/balance/init?employee_id=${employeeId}&year=${year}`);
export const getLeaveSettings = () => api.get("/hr/leaves/settings");
export const updateLeaveSettings = (payload) => api.put("/hr/leaves/settings", payload);
export const resetLeaveSettings = () => api.delete("/hr/leaves/settings");

// ── WORKFORCE PLANNING SPECIFIC ─────────────────────────────────────────────
export const getWorkforcePlans = () => api.get("/hr/workforce-planning");
export const createWorkforcePlan = (payload) => api.post("/hr/workforce-planning", payload);
export const getWorkforceSummary = () => api.get("/hr/workforce/summary");

// ── WORKFORCE PLANNING V2 (Production API) ─────────────────────────────────
export const getWorkforceDashboard = () => api.get("/hr/workforce/dashboard");

export const getWfPlans = (params = {}) => api.get("/hr/workforce/plans", { params });
export const getWfPlanById = (id) => api.get(`/hr/workforce/plans/${id}`);
export const createWfPlan = (payload) => api.post("/hr/workforce/plans", payload);
export const updateWfPlan = (id, payload) => api.put(`/hr/workforce/plans/${id}`, payload);
export const deleteWfPlan = (id) => api.delete(`/hr/workforce/plans/${id}`);

export const getWfHeadcounts = (params = {}) => api.get("/hr/workforce/headcount", { params });
export const getWfHeadcountById = (id) => api.get(`/hr/workforce/headcount/${id}`);
export const createWfHeadcount = (payload) => api.post("/hr/workforce/headcount", payload);
export const updateWfHeadcount = (id, payload) => api.put(`/hr/workforce/headcount/${id}`, payload);
export const deleteWfHeadcount = (id) => api.delete(`/hr/workforce/headcount/${id}`);

export const getWfSuccessions = (params = {}) => api.get("/hr/workforce/succession", { params });
export const getWfSuccessionById = (id) => api.get(`/hr/workforce/succession/${id}`);
export const createWfSuccession = (payload) => api.post("/hr/workforce/succession", payload);
export const updateWfSuccession = (id, payload) => api.put(`/hr/workforce/succession/${id}`, payload);
export const deleteWfSuccession = (id) => api.delete(`/hr/workforce/succession/${id}`);

export const getWfReports = (params = {}) => api.get("/hr/workforce/reports", { params });
export const generateWfReport = (payload) => api.post("/hr/workforce/reports/generate", payload);

async function downloadWfExport(endpoint, filename) {
  const { getAccessToken, API_BASE_URL } = await import("./api");
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to export workforce report");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const exportWfCsv = (reportType = "workforce_summary") =>
  downloadWfExport(`/hr/workforce/reports/export/csv?report_type=${reportType}`, `workforce_${reportType}_${new Date().toISOString().split("T")[0]}.csv`);

export const exportWfExcel = (reportType = "workforce_summary") =>
  downloadWfExport(`/hr/workforce/reports/export/excel?report_type=${reportType}`, `workforce_${reportType}_${new Date().toISOString().split("T")[0]}.xlsx`);

export const exportWfPdf = (reportType = "workforce_summary") =>
  downloadWfExport(`/hr/workforce/reports/export/pdf?report_type=${reportType}`, `workforce_${reportType}_${new Date().toISOString().split("T")[0]}.pdf`);

// ── DOCUMENTS ──────────────────────────────────────────────────────────────
// NOTE: api.js uses raw fetch and resolves to the parsed JSON body directly
// (not an axios-style { data, status, headers } envelope). Every document
// component (employee-documents.jsx, company-documents.jsx, dashboard.jsx,
// approvals.jsx, settings.jsx) was written expecting `res.data`, so we wrap
// the result here to match that shape without having to touch 5 files.

/**
 * Get all HR documents.
 * @param {Object} params  - Optional filters:
 *   category    {string}  – "company" | "employee" | "policy" | "contract" | "other"
 *   status      {string}  – "pending" | "approved" | "rejected" | "expired"
 *   employee_id {number}  – filter to a specific employee
 *   search      {string}  – search by title or document type
 */
export const getDocuments = (params = {}) => {
  // Build query string from non-empty params
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return api.get(`/hr/documents${query ? `?${query}` : ""}`).then(data => ({ data }));
};

// Get a single document by ID
export const getDocumentById = (documentId) =>
  api.get(`/hr/documents/${documentId}`).then(data => ({ data }));

/**
 * Upload a new document (multipart/form-data).
 *
 * Uses native fetch (NOT the api wrapper) so the browser sets the correct
 * multipart/form-data Content-Type + boundary automatically.
 *
 * The api wrapper hard-codes Content-Type: application/json which corrupts
 * multipart uploads and causes FastAPI to return 422 "Field required".
 *
 * Build a FormData before calling:
 *   const fd = new FormData();
 *   fd.append("file", fileObject);
 *   fd.append("title", "Offer Letter");
 *   fd.append("category", "employee");        // optional, defaults to "other"
 *   fd.append("document_type", "offer_letter"); // optional
 *   fd.append("employee_id", 42);             // optional
 *   fd.append("expiry_date", "2026-12-31");   // optional, YYYY-MM-DD
 *   fd.append("tags", JSON.stringify(["onboarding"])); // optional
 */
export async function uploadDocument(formData) {
  const { getAccessToken, API_BASE_URL: base } = await import("./api");
  const token = getAccessToken();
  // Do NOT set Content-Type — browser sets it automatically with the correct
  // multipart boundary when body is a FormData instance.
  const res = await fetch(`${base}/hr/documents/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const err = new Error(`Upload failed: ${res.status}`);
    err.response = { data: detail };
    throw err;
  }
  const data = await res.json();
  return { data };
}

// Soft-delete a document
export const deleteDocument = (documentId) =>
  api.delete(`/hr/documents/${documentId}`).then(data => ({ data }));

/**
 * Update document approval status.
 * @param {number} documentId
 * @param {string} newStatus         – "pending" | "approved" | "rejected" | "expired"
 * @param {string} [rejectionReason] – required when newStatus === "rejected"
 */
export const updateDocumentStatus = (documentId, newStatus, rejectionReason = undefined) =>
  api.patch(`/hr/documents/${documentId}/status`, {
    status: newStatus,
    ...(rejectionReason !== undefined && { rejection_reason: rejectionReason }),
  }).then(data => ({ data }));

// Edit document metadata (title, description, category, document_type, employee_id, expiry_date, tags)
export const updateDocument = (documentId, updateData) =>
  api.put(`/hr/documents/${documentId}`, updateData).then(data => ({ data }));

// ── DOCUMENT DASHBOARD STATS ──────────────────────────────────────────────
export const getDocumentDashboardStats = () =>
  api.get("/hr/documents/dashboard/stats").then(data => ({ data }));

// ── DOCUMENT VERSIONS ─────────────────────────────────────────────────────
export const getDocumentVersions = (documentId) =>
  api.get(`/hr/documents/${documentId}/versions`).then(data => ({ data }));

export async function uploadDocumentVersion(documentId, formData) {
  const { getAccessToken, API_BASE_URL: base } = await import("./api");
  const token = getAccessToken();
  const res = await fetch(`${base}/hr/documents/${documentId}/versions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const err = new Error(`Version upload failed: ${res.status}`);
    err.response = { data: detail };
    throw err;
  }
  const data = await res.json();
  return { data };
}

// ── APPROVAL WORKFLOW ──────────────────────────────────────────────────────
export const getPendingApprovals = () =>
  api.get("/hr/documents/approvals/pending").then(data => ({ data }));

export const approveDocument = (documentId, comment) =>
  api.post(`/hr/documents/${documentId}/approve`, comment ? { comment } : {}).then(data => ({ data }));

export const rejectDocument = (documentId, comment) =>
  api.post(`/hr/documents/${documentId}/reject`, comment ? { comment } : {}).then(data => ({ data }));

export const getApprovalAuditLog = (documentId) => {
  const params = documentId ? `?document_id=${documentId}` : "";
  return api.get(`/hr/documents/approvals/audit-log${params}`).then(data => ({ data }));
};


// ── DOCUMENT-EMPLOYEE ASSIGNMENTS ──────────────────────────────────────────
export const assignDocumentToEmployees = (documentId, employeeIds, notes) =>
  api.post(`/hr/documents/${documentId}/assign`, { employee_ids: employeeIds, notes }).then(data => ({ data }));

export const getDocumentAssignments = (documentId) =>
  api.get(`/hr/documents/${documentId}/assignments`).then(data => ({ data }));

export const removeDocumentAssignment = (assignmentId) =>
  api.delete(`/hr/documents/assignments/${assignmentId}`).then(data => ({ data }));

export const getMyAssignedDocuments = () =>
  api.get("/hr/documents/assigned-to-me").then(data => ({ data }));


/// ── DEPARTMENT CRUD SPECIFIC ────────────────────────────────────────────────

// GET an individual department by its ID
export const getDepartmentById = (deptId) =>
  api.get(`/hr/departments/${deptId}`).then(data => ({ data }));

// POST - Create a new department
// Ensure payload contains: { name: "Engineering", code: "ENG", description: "..." }
export const createDepartment = (payload) =>
  api.post("/hr/departments", payload).then(data => ({ data }));

// PUT - Update an existing department
export const updateDepartment = (deptId, payload) =>
  api.put(`/hr/departments/${deptId}`, payload).then(data => ({ data }));

// DELETE - Deactivate/Remove a department
export const deleteDepartment = (deptId) =>
  api.delete(`/hr/departments/${deptId}`).then(data => ({ data }));


export const getDepartments = (params = {}) => api.get("/hr/departments", { params }).then(data => ({ data }));
export const getDesignations = () => api.get("/hr/designations");

// ── DESIGNATIONS CRUD SPECIFIC ──────────────────────────────────────────────
export const getDesignationById = (id) =>
  api.get(`/hr/designations/${id}`).then(data => ({ data }));
export const createDesignation = (payload) =>
  api.post("/hr/designations", payload).then(data => ({ data }));
export const updateDesignation = (id, payload) =>
  api.put(`/hr/designations/${id}`, payload).then(data => ({ data }));
export const deleteDesignation = (id) =>
  api.delete(`/hr/designations/${id}`).then(data => ({ data }));

// ── (Employee management endpoints moved to src/service/employee.js) ──────────