import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, Suspense } from "react";
import { lazyRoute } from "./lib/lazyRoute";
import { registerRoutes } from "./lib/prefetch";
import AppLayout, { RouteBoundary } from "./components/AppLayout";
import { flatRoutes } from "./navigation";
import { AlertTriangle } from "lucide-react";
import { ROLE_ALLOWED_PREFIXES, ROLE_DISALLOWED_PREFIXES } from "./config/roles";

function ModuleSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3B82F6]" />
    </div>
  );
}
const HomePage = lazyRoute(() => import("./pages/public/HomePage"));
import LoginPage from "./pages/auth/LoginPage";
const ForgotPasswordPage = lazyRoute(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazyRoute(() => import("./pages/auth/ResetPasswordPage"));
const TermsPage = lazyRoute(() => import("./pages/legal/TermsPage"));
const HrProductsPage = lazyRoute(() => import("./pages/public/HrProductsPage"));
const RequestPricingPage = lazyRoute(() => import("./pages/public/RequestPricingPage"));
const BookDemoPage = lazyRoute(() => import("./pages/public/BookDemoPage"));
const SuperAdminSalesRequestsPage = lazyRoute(() => import("./modules/super-admin/SalesRequestsPage"));
const VerifyEmailPage = lazyRoute(() => import("./pages/auth/VerifyEmailPage"));
const QuotationDecisionPage = lazyRoute(() => import("./pages/auth/QuotationDecisionPage"));
const ChangePasswordPage = lazyRoute(() => import("./pages/auth/ChangePasswordPage"));
const RegisterPage = lazyRoute(() => import("./pages/auth/RegisterPage"));
const RegistrationSuccessPage = lazyRoute(() => import("./pages/auth/RegistrationSuccessPage"));
const ZoikoProductsPage = lazyRoute(() => import("./pages/public/ZoikoProductsPage"));
const PlatformPage = lazyRoute(() => import("./pages/public/PlatformPage"));
const SolutionsPage = lazyRoute(() => import("./pages/public/SolutionsPage"));
const PricingPage = lazyRoute(() => import("./pages/public/PricingPage"));
const ContactPage = lazyRoute(() => import("./pages/public/ContactPage"));
const ResourcesPage = lazyRoute(() => import("./pages/public/ResourcesPage"));
const AboutPage = lazyRoute(() => import("./pages/public/AboutPage"));
const ZoikoLeadershipPage = lazyRoute(() => import("./pages/public/ZoikoLeadershipPage"));
const ZoikoCareersPage = lazyRoute(() => import("./pages/public/ZoikoCareersPage"));
const ZoikoDemoPage = lazyRoute(() => import("./pages/public/ZoikoDemoPage"));
const ZoikoHRPage = lazyRoute(() => import("./pages/products/ZoikoHRPage"));
const ZoikoPeoplePage = lazyRoute(() => import("./pages/public/five-pillars/ZoikoPeoplePage"));
const ZoikoMoneyPage = lazyRoute(() => import("./pages/public/five-pillars/ZoikoMoneyPage"));
const ZoikoWorkPage = lazyRoute(() => import("./pages/public/five-pillars/ZoikoWorkPage"));
const ZoikoSupplyPage = lazyRoute(() => import("./pages/public/five-pillars/ZoikoSupplyPage"));
const ZoikoControlPage = lazyRoute(() => import("./pages/public/five-pillars/ZoikoControlPage"));
const ZoikoHowItWorksPage = lazyRoute(() => import("./pages/platform/ZoikoHowItWorksPage"));
const ZoikoSecurityPage = lazyRoute(() => import("./pages/platform/ZoikoSecurityPage"));
const ZoikoTrustCenterPage = lazyRoute(() => import("./pages/platform/ZoikoTrustCenterPage"));
const ZoikoConnectPage = lazyRoute(() => import("./pages/platform/ZoikoConnectPage"));
const ZoikoApiDocsPage = lazyRoute(() => import("./pages/platform/ZoikoApiDocsPage"));
const ZoikoSystemStatusPage = lazyRoute(() => import("./pages/platform/ZoikoSystemStatusPage"));
const ZoikoEcosystemPage = lazyRoute(() => import("./pages/public/eco-system/ZoikoEcosystemPage"));
const ZoikoVertexPage = lazyRoute(() => import("./pages/public/eco-system/ZoikoVertexPage"));
const ZoikoSuitePage = lazyRoute(() => import("./pages/public/eco-system/ZoikoSuitePage"));
const ZoikoSemaPage = lazyRoute(() => import("./pages/public/eco-system/ZoikoSemaPage"));
const ZoikoLocalPage = lazyRoute(() => import("./pages/public/eco-system/ZoikoLocalPage"));
const ZoikoDigitalPage = lazyRoute(() => import("./pages/public/eco-system/ZoikoDigitalPage"));
import PlanGate from "./components/PlanGate";
import ProtectedRoute from "./components/ProtectedRoute";

// Target 'HrDashBoard.jsx' directly
const ZoikoHRModule = lazyRoute(() => import("./modules/zoiko-hr/HrDashBoard.jsx"));

// Sub-module imports — lazy-loaded for code splitting
const ZoikoHRLeaveDashboard = lazyRoute(() => import("./modules/zoiko-hr/leave/dashboard.jsx"));
const ZoikoHRLeaveRequests = lazyRoute(() => import("./modules/zoiko-hr/leave/leave-requests.jsx"));
const ZoikoHRLeaveCalendar = lazyRoute(() => import("./modules/zoiko-hr/leave/leave-calendar.jsx"));
const ZoikoHRLeaveReports = lazyRoute(() => import("./modules/zoiko-hr/leave/reports.jsx"));

const ZoikoHRDepartmentsDashboard = lazyRoute(() => import("./modules/zoiko-hr/departments/dashboard.jsx"));
const ZoikoHRDepartmentsDepartmentList = lazyRoute(() => import("./modules/zoiko-hr/departments/department-list.jsx"));
const ZoikoHRDepartmentsDepartmentStructure = lazyRoute(() => import("./modules/zoiko-hr/departments/department-structure.jsx"));
const ZoikoHRDepartmentsReports = lazyRoute(() => import("./modules/zoiko-hr/departments/reports.jsx"));
const ZoikoHRDepartmentsSettings = lazyRoute(() => import("./modules/zoiko-hr/departments/settings.jsx"));

const ZoikoHRDesignationsDashboard = lazyRoute(() => import("./modules/zoiko-hr/designations/dashboard.jsx"));
const ZoikoHRDesignationList = lazyRoute(() => import("./modules/zoiko-hr/designations/designation-list.jsx"));
const ZoikoHRDesignationStructure = lazyRoute(() => import("./modules/zoiko-hr/designations/designation-structure.jsx"));
const ZoikoHRDesignationReports = lazyRoute(() => import("./modules/zoiko-hr/designations/reports.jsx"));
const ZoikoHRDesignationSettings = lazyRoute(() => import("./modules/zoiko-hr/designations/settings.jsx"));

const PerformanceDashboard = lazyRoute(() => import("./modules/zoiko-hr/performance/dashboard.jsx"));
const GoalsOKRs = lazyRoute(() => import("./modules/zoiko-hr/performance/goals.jsx"));
const PerformanceReviews = lazyRoute(() => import("./modules/zoiko-hr/performance/reviews.jsx"));
const Appraisals = lazyRoute(() => import("./modules/zoiko-hr/performance/appraisals.jsx"));
const PerformanceAnalytics = lazyRoute(() => import("./modules/zoiko-hr/performance/analytics.jsx"));
const RecruitmentDashboard = lazyRoute(() => import("./modules/zoiko-hr/recruitment/dashboard.jsx"));
const JobRequisitions = lazyRoute(() => import("./modules/zoiko-hr/recruitment/job-requisitions.jsx"));
const Candidates = lazyRoute(() => import("./modules/zoiko-hr/recruitment/candidates.jsx"));
const Interviews = lazyRoute(() => import("./modules/zoiko-hr/recruitment/interviews.jsx"));
const OfferManagement = lazyRoute(() => import("./modules/zoiko-hr/recruitment/offers.jsx"));
const ZoikoHROnboardingDashboard = lazyRoute(() => import("./modules/zoiko-hr/onboarding/dashboard.jsx"));
const ZoikoHROnboardingNewHires = lazyRoute(() => import("./modules/zoiko-hr/onboarding/new-hires.jsx"));
const ZoikoHROnboardingPreOnboarding = lazyRoute(() => import("./modules/zoiko-hr/onboarding/pre-onboarding.jsx"));
const ZoikoHROnboardingDocuments = lazyRoute(() => import("./modules/zoiko-hr/onboarding/documents.jsx"));
const ZoikoHROnboardingChecklists = lazyRoute(() => import("./modules/zoiko-hr/onboarding/checklists.jsx"));
const ZoikoHROnboardingOrientation = lazyRoute(() => import("./modules/zoiko-hr/onboarding/orientation.jsx"));
const ZoikoHROnboardingReports = lazyRoute(() => import("./modules/zoiko-hr/onboarding/reports.jsx"));
const ZoikoHROnboardingSettings = lazyRoute(() => import("./modules/zoiko-hr/onboarding/settings.jsx"));
const ZoikoHRLearning = lazyRoute(() => import("./modules/zoiko-hr/learning/learning.jsx"));

const EssDashboard = lazyRoute(() => import("./modules/zoiko-hr/ess/dashboard.jsx"));
const EssProfile = lazyRoute(() => import("./modules/zoiko-hr/ess/profile.jsx"));
const EssLeaveManagement = lazyRoute(() => import("./modules/zoiko-hr/ess/leave-management.jsx"));
const EssAttendance = lazyRoute(() => import("./modules/zoiko-hr/ess/attendance.jsx"));
const EssMyDocuments = lazyRoute(() => import("./modules/zoiko-hr/ess/my-documents.jsx"));
const EssAssignedDocuments = lazyRoute(() => import("./modules/zoiko-hr/ess/assigned-documents.jsx"));
const EssRequests = lazyRoute(() => import("./modules/zoiko-hr/ess/requests.jsx"));
const EssSettings = lazyRoute(() => import("./modules/zoiko-hr/ess/settings.jsx"));

const TravelDashboard = lazyRoute(() => import("./modules/zoiko-hr/travel/dashboard.jsx"));
const TravelRequests = lazyRoute(() => import("./modules/zoiko-hr/travel/travel-requests.jsx"));
const TravelApprovals = lazyRoute(() => import("./modules/zoiko-hr/travel/approvals.jsx"));
const TravelExpenses = lazyRoute(() => import("./modules/zoiko-hr/travel/expenses.jsx"));
const TravelSettings = lazyRoute(() => import("./modules/zoiko-hr/travel/settings.jsx"));

// Assets — lazy-load individual components (named exports, can't use barrel lazy)
const AssetsDashboard = lazyRoute(() => import("./modules/zoiko-hr/assets/assetsdashboard"));
const MyAssets = lazyRoute(() => import("./modules/zoiko-hr/assets/my-assets"));
const AssetCatalog = lazyRoute(() => import("./modules/zoiko-hr/assets/inventory"));
const AssetRequests = lazyRoute(() => import("./modules/zoiko-hr/assets/returns"));
const AssetMaintenance = lazyRoute(() => import("./modules/zoiko-hr/assets/maintenance"));
const AssetReports = lazyRoute(() => import("./modules/zoiko-hr/assets/reports"));
const AssetSettings = lazyRoute(() => import("./modules/zoiko-hr/assets/settings"));

const DocumentsDashboard = lazyRoute(() => import("./modules/zoiko-hr/documents/dashboard.jsx"));
const CompanyDocuments = lazyRoute(() => import("./modules/zoiko-hr/documents/company-documents.jsx"));
const ApprovalWorkflow = lazyRoute(() => import("./modules/zoiko-hr/documents/approvals.jsx"));

const ZoikoHRAttendanceDashboard = lazyRoute(() => import("./modules/zoiko-hr/attendance/dashboard.jsx"));
const ZoikoHRAttendanceDailyRecords = lazyRoute(() => import("./modules/zoiko-hr/attendance/daily-records.jsx"));
const ZoikoHRAttendanceLeaves = lazyRoute(() => import("./modules/zoiko-hr/attendance/leave-management.jsx"));
const ZoikoHRAttendanceShifts = lazyRoute(() => import("./modules/zoiko-hr/attendance/shifts.jsx"));
const ZoikoHRAttendanceHolidays = lazyRoute(() => import("./modules/zoiko-hr/attendance/holidays.jsx"));
const ZoikoHRAttendanceAnalytics = lazyRoute(() => import("./modules/zoiko-hr/attendance/analytics.jsx"));

const WorkforceDashboard = lazyRoute(() => import("./modules/zoiko-hr/workforce-planning/dashboard.jsx"));
const WorkforcePlans = lazyRoute(() => import("./modules/zoiko-hr/workforce-planning/plans.jsx"));
const HeadcountPlanning = lazyRoute(() => import("./modules/zoiko-hr/workforce-planning/headcount.jsx"));
const Succession = lazyRoute(() => import("./modules/zoiko-hr/workforce-planning/succession.jsx"));
const WorkforceReports = lazyRoute(() => import("./modules/zoiko-hr/workforce-planning/reports.jsx"));

const ZoikoHRCompDashboard = lazyRoute(() => import("./modules/zoiko-hr/compensation/dashboard.jsx"));
const ZoikoHRCompSalaryStructures = lazyRoute(() => import("./modules/zoiko-hr/compensation/salary-structures.jsx"));
const ZoikoHRCompPayGrades = lazyRoute(() => import("./modules/zoiko-hr/compensation/pay-grades.jsx"));
const ZoikoHRCompSalaryComponents = lazyRoute(() => import("./modules/zoiko-hr/compensation/salary-components.jsx"));
const ZoikoHRCompBands = lazyRoute(() => import("./modules/zoiko-hr/compensation/compensation-bands.jsx"));
const ZoikoHRCompRevisions = lazyRoute(() => import("./modules/zoiko-hr/compensation/salary-revisions.jsx"));
const ZoikoHRCompAllowances = lazyRoute(() => import("./modules/zoiko-hr/compensation/allowances.jsx"));
const ZoikoHRCompBenefits = lazyRoute(() => import("./modules/zoiko-hr/compensation/benefits.jsx"));

const ZoikoHRDashboard = lazyRoute(() => import("./pages/Peoples/Employees/EmployeeManagement/dashboard.jsx"));
const ZoikoHREmployees = lazyRoute(() => import("./pages/Peoples/Employees/EmployeeManagement/employees.jsx"));
const ZoikoHRProfile = lazyRoute(() => import("./pages/Peoples/Employees/EmployeeManagement/profile.jsx"));
const ZoikoHROrgChart = lazyRoute(() => import("./pages/Peoples/Employees/EmployeeManagement/organization.jsx"));
const ZoikoHRLifecycle = lazyRoute(() => import("./pages/Peoples/Employees/EmployeeManagement/lifecycle.jsx"));
const ZoikoHRReports = lazyRoute(() => import("./pages/Peoples/Employees/EmployeeManagement/reports.jsx"));

const OrgAdminDashboardPage = lazyRoute(() => import("./modules/organization-admin/DashboardPage"));
const OrgAdminOrganizationPage = lazyRoute(() => import("./modules/organization-admin/OrganizationPage"));
const OrgAdminAssetRequestsPage = lazyRoute(() => import("./modules/organization-admin/AssetRequestsPage"));
const OrgAdminAssetsPage = lazyRoute(() => import("./modules/organization-admin/AssetsPage"));
const OrgAdminEmployeeDocumentsPage = lazyRoute(() => import("./modules/organization-admin/EmployeeDocumentsPage"));
const OrgAdminUserManagementPage = lazyRoute(() => import("./modules/organization-admin/UserManagementPage"));
const OrgAdminMetricsPage = lazyRoute(() => import("./modules/organization-admin/MetricsPage"));
const OrgAdminPayrollGuidancePage = lazyRoute(() => import("./modules/organization-admin/PayrollGuidancePage"));
const OrgAdminBillingPlanPage = lazyRoute(() => import("./modules/organization-admin/BillingPlanPage"));
const OrgAdminPayInvoicePage = lazyRoute(() => import("./modules/organization-admin/PayInvoicePage"));

const HrAdminDashboardPage = lazyRoute(() => import("./modules/hr-admin/DashboardPage"));
const HrAdminOrganizationPage = lazyRoute(() => import("./modules/hr-admin/OrganizationPage"));

const SuperAdminDashboardPage = lazyRoute(() => import("./modules/super-admin/DashboardPage"));
const SuperAdminOrganizationsPage = lazyRoute(() => import("./modules/super-admin/OrganizationsPage"));
const SuperAdminAuditLogsPage = lazyRoute(() => import("./modules/super-admin/AuditLogsPage"));
const NotificationCenter = lazyRoute(() => import("./modules/super-admin/NotificationCenter"));
const NotificationsPage = lazyRoute(() => import("./pages/NotificationsPage"));
const OrganizationDetailPage = lazyRoute(() => import("./modules/super-admin/OrganizationDetailPage"));
const SuperAdminAccessPage = lazyRoute(() => import("./modules/super-admin/AccessPage"));
const SuperAdminBillingOverviewPage = lazyRoute(() => import("./modules/super-admin/BillingOverviewPage"));
const SuperAdminBillingPlansPage = lazyRoute(() => import("./modules/super-admin/BillingPlansPage"));
const SuperAdminBillingDiscountsPage = lazyRoute(() => import("./modules/super-admin/BillingDiscountsPage"));
const SuperAdminBillingPlanChangesPage = lazyRoute(() => import("./modules/super-admin/BillingPlanChangesPage"));
const SuperAdminBillingRefundsPage = lazyRoute(() => import("./modules/super-admin/BillingRefundsPage"));
const SuperAdminBillingEvaluationsPage = lazyRoute(() => import("./modules/super-admin/BillingEvaluationsPage"));
const SuperAdminBillingInvoicesPage = lazyRoute(() => import("./modules/super-admin/BillingInvoicesPage"));
const SuperAdminBillingDelinquencyPage = lazyRoute(() => import("./modules/super-admin/BillingDelinquencyPage"));
const SuperAdminBillingWebhookEventsPage = lazyRoute(() => import("./modules/super-admin/BillingWebhookEventsPage"));
const SuperAdminBillingReconciliationPage = lazyRoute(() => import("./modules/super-admin/BillingReconciliationPage"));
const SuperAdminSupportAccessPage = lazyRoute(() => import("./modules/super-admin/SupportAccessPage"));

const DashboardPage = lazyRoute(() => import("./modules/platform/DashboardPage"));
const OrganizationsPage = lazyRoute(() => import("./modules/platform/OrganizationsPage"));
const SubscriptionsPage = lazyRoute(() => import("./modules/platform/SubscriptionsPage"));

const ZoikoIdPage = lazyRoute(() => import("./modules/shared-layers/ZoikoIdPage"));
const ZoikoWorkflowPage = lazyRoute(() => import("./modules/shared-layers/ZoikoWorkflowPage"));
const ZoikoHubPage = lazyRoute(() => import("./modules/shared-layers/ZoikoHubPage"));
const ZoikoConnectPageModule = lazyRoute(() => import("./modules/shared-layers/ZoikoConnectPage"));
const DocumentsPage = lazyRoute(() => import("./modules/shared-layers/DocumentsPage"));
const ExpensesPage = lazyRoute(() => import("./modules/shared-layers/ExpensesPage"));
const AdminKnowledgePage = lazyRoute(() => import("./modules/shared-layers/assistant/AdminKnowledgePage"));
const AdminHandoffsPage = lazyRoute(() => import("./modules/shared-layers/assistant/AdminHandoffsPage"));
const SuperAdminKnowledgePage = lazyRoute(() => import("./modules/shared-layers/assistant/SuperAdminKnowledgePage"));
const SuperAdminSupportTicketsPage = lazyRoute(() => import("./modules/shared-layers/assistant/SuperAdminSupportTicketsPage"));
const AssistantLauncher = lazyRoute(() => import("./modules/shared-layers/assistant/AssistantLauncher"));
const UserManagementPage = lazyRoute(() => import("./modules/settings/UserManagementPage"));

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE WORKSPACE — src/pages/Peoples/Employees/
// Filenames use capital E prefix: Employee_ (except EmployeeProfile.jsx)
// ─────────────────────────────────────────────────────────────────────────────

// Profile folder
const EmployeeProfilePage = lazyRoute(() => import("./pages/Peoples/Employees/Profile/EmployeeProfile.jsx"));
const EmployeeBankDetails = lazyRoute(() => import("./pages/Peoples/Employees/Profile/Employee_BankDetails.jsx"));
const EmployeeAssetDetails = lazyRoute(() => import("./pages/Peoples/Employees/Profile/Employee_AssetDetails.jsx"));
const EmployeeEmergencyContacts = lazyRoute(() => import("./pages/Peoples/Employees/Profile/Employee_EmergencyContacts.jsx"));
const EmployeeSecuritySettings = lazyRoute(() => import("./pages/Peoples/Employees/Profile/Employee_settings.jsx"));

// ESS folder
const EmployeeEssDashboard = lazyRoute(() => import("./pages/Peoples/Employees/ESS/Employee_EssDashboard.jsx"));
const EmployeeEssAttendance = lazyRoute(() => import("./pages/Peoples/Employees/ESS/Employee_EssAttendance.jsx"));
const EmployeeEssSettings = lazyRoute(() => import("./pages/Peoples/Employees/ESS/Employee_EssSettings.jsx"));

// Learning folder
const EmployeeLearningModule = lazyRoute(() => import("./pages/Peoples/Employees/Learning/EmployeeLearningModule.jsx"));

// Leaves folder
const EmployeeMyLeave = lazyRoute(() => import("./pages/Peoples/Employees/Leaves/Employee_MyLeaveDashboard.jsx"));
const EmployeeApplyLeave = lazyRoute(() => import("./pages/Peoples/Employees/Leaves/Employee_ApplyLeaveForm.jsx"));
const EmployeeLeaveCalendar = lazyRoute(() => import("./pages/Peoples/Employees/Leaves/Employee_LeaveCalendar.jsx"));
const EmployeeLeaveHistory = lazyRoute(() => import("./pages/Peoples/Employees/Leaves/Employee_LeaveHistory.jsx"));
// Documents folder
const EmployeeMyFiles = lazyRoute(() => import("./pages/Peoples/Employees/Documents/Employee_MyFiles.jsx"));
const EmployeePayslips = lazyRoute(() => import("./pages/Peoples/Employees/Documents/Employee_Payslips.jsx"));
const EmployeeOfferContracts = lazyRoute(() => import("./pages/Peoples/Employees/Documents/Employee_OfferContracts.jsx"));
const EmployeeTaxCompliance = lazyRoute(() => import("./pages/Peoples/Employees/Documents/Employee_TaxCompliance.jsx"));
const EmployeeCompanyDocuments = lazyRoute(() => import("./pages/Peoples/Employees/Documents/Employee_CompanyDocuments.jsx"));

// Travel folder
const EmployeeTravelDashboard = lazyRoute(() => import("./pages/Peoples/Employees/Travel/Employee_TravelDashboard.jsx"));
const EmployeeTravelRequests = lazyRoute(() => import("./pages/Peoples/Employees/Travel/Employee_TravelRequests.jsx"));
const EmployeeTravelApprovals = lazyRoute(() => import("./pages/Peoples/Employees/Travel/Employee_TravelApprovals.jsx"));
const EmployeeTravelExpenses = lazyRoute(() => import("./pages/Peoples/Employees/Travel/Employee_TravelExpenses.jsx"));
const EmployeeTravelSettings = lazyRoute(() => import("./pages/Peoples/Employees/Travel/Employee_TravelSettings.jsx"));

const routeOverrides = {
  "/dashboard": <DashboardPage />,
  "/organizations": <OrganizationsPage />,
  "/subscriptions": <SubscriptionsPage />,
  "/shared/id": <ZoikoIdPage />,
  "/shared/workflow": <ZoikoWorkflowPage />,
  "/shared/hub": <ZoikoHubPage />,
  "/shared/connect": <ZoikoConnectPageModule />,
  "/shared/documents": <DocumentsPage />,
  "/shared/expenses": <ExpensesPage />,
  "/zoiko-hr": <ZoikoHRModule />,
  // Departments
  "/zoiko-hr/departments": <ZoikoHRDepartmentsDashboard />,
  "/zoiko-hr/departments/list": <ZoikoHRDepartmentsDepartmentList />,
  "/zoiko-hr/departments/structure": <ZoikoHRDepartmentsDepartmentStructure />,
  "/zoiko-hr/departments/reports": <ZoikoHRDepartmentsReports />,
  "/zoiko-hr/departments/settings": <ZoikoHRDepartmentsSettings />,
  // Designations
  "/zoiko-hr/designations": <ZoikoHRDesignationsDashboard />,
  "/zoiko-hr/designations/list": <ZoikoHRDesignationList />,
  "/zoiko-hr/designations/levels": <ZoikoHRDesignationStructure />,
  "/zoiko-hr/designations/reports": <ZoikoHRDesignationReports />,
  "/zoiko-hr/designations/settings": <ZoikoHRDesignationSettings />,
  // Leave
  "/zoiko-hr/leave": <ZoikoHRLeaveDashboard />,
  "/zoiko-hr/leave/requests": <ZoikoHRLeaveRequests />,
  "/zoiko-hr/leave/calendar": <ZoikoHRLeaveCalendar />,
  "/zoiko-hr/leave/reports": <ZoikoHRLeaveReports />,
  // Attendance
  "/zoiko-hr/attendance": <ZoikoHRAttendanceDashboard />,
  "/zoiko-hr/attendance/daily": <ZoikoHRAttendanceDailyRecords />,
  "/zoiko-hr/attendance/leaves": <ZoikoHRAttendanceLeaves />,
  "/zoiko-hr/attendance/shifts": <ZoikoHRAttendanceShifts />,
  "/zoiko-hr/attendance/holidays": <ZoikoHRAttendanceHolidays />,
  "/zoiko-hr/attendance/analytics": <ZoikoHRAttendanceAnalytics />,
  "/zoiko-hr/performance": <PlanGate featureKey="hr.performance.cycles" title="Performance management"><PerformanceDashboard /></PlanGate>,
  "/zoiko-hr/recruitment": <RecruitmentDashboard />,
  "/zoiko-hr/onboarding": <ZoikoHROnboardingDashboard />,
  "/zoiko-hr/onboarding/new-hires": <ZoikoHROnboardingNewHires />,
  "/zoiko-hr/onboarding/pre-onboarding": <ZoikoHROnboardingPreOnboarding />,
  "/zoiko-hr/onboarding/documents": <ZoikoHROnboardingDocuments />,
  "/zoiko-hr/onboarding/checklists": <ZoikoHROnboardingChecklists />,
  "/zoiko-hr/onboarding/orientation": <ZoikoHROnboardingOrientation />,
  "/zoiko-hr/onboarding/reports": <ZoikoHROnboardingReports />,
  "/zoiko-hr/onboarding/settings": <ZoikoHROnboardingSettings />,
  // Assets
  "/zoiko-hr/assets": <AssetsDashboard />,
  "/zoiko-hr/assets/my-assets": <MyAssets />,
  "/zoiko-hr/assets/catalog": <AssetCatalog />,
  "/zoiko-hr/assets/requests": <AssetRequests />,
  "/zoiko-hr/assets/maintenance": <AssetMaintenance />,
  "/zoiko-hr/assets/reports": <AssetReports />,
  "/zoiko-hr/assets/settings": <AssetSettings />,
  // Learning
  "/zoiko-hr/learning": <ZoikoHRLearning />,
  "/zoiko-hr/learning/courses": <ZoikoHRLearning />,
  "/zoiko-hr/learning/training-programs": <ZoikoHRLearning />,
  "/zoiko-hr/learning/assessments": <ZoikoHRLearning />,
  "/zoiko-hr/learning/reports": <ZoikoHRLearning />,
  // Compensation
  "/zoiko-hr/compensation": <ZoikoHRCompDashboard />,
  "/zoiko-hr/compensation/salary-structures": <ZoikoHRCompSalaryStructures />,
  "/zoiko-hr/compensation/pay-grades": <ZoikoHRCompPayGrades />,
  "/zoiko-hr/compensation/salary-components": <ZoikoHRCompSalaryComponents />,
  "/zoiko-hr/compensation/bands": <ZoikoHRCompBands />,
  "/zoiko-hr/compensation/revisions": <ZoikoHRCompRevisions />,
  "/zoiko-hr/compensation/allowances": <ZoikoHRCompAllowances />,
  "/zoiko-hr/compensation/benefits": <ZoikoHRCompBenefits />,
  // ESS (HR admin view)
  "/zoiko-hr/ess": <EssDashboard />,
  "/zoiko-hr/ess/profile": <EssProfile />,
  "/zoiko-hr/ess/leave": <EssLeaveManagement />,
  "/zoiko-hr/ess/attendance": <EssAttendance />,
  "/zoiko-hr/ess/my-documents": <EssMyDocuments />,
  "/zoiko-hr/ess/assigned-documents": <EssAssignedDocuments />,
  "/zoiko-hr/ess/requests": <EssRequests />,
  "/zoiko-hr/ess/settings": <EssSettings />,
  // Travel (HR admin view)
  "/zoiko-hr/travel": <TravelDashboard />,
  "/zoiko-hr/travel/requests": <TravelRequests />,
  "/zoiko-hr/travel/approvals": <TravelApprovals />,
  "/zoiko-hr/travel/expenses": <TravelExpenses />,
  "/zoiko-hr/travel/settings": <TravelSettings />,
  // Employee Management
  "/zoiko-hr/employee-management": <ZoikoHRDashboard />,
  "/zoiko-hr/employee-management/employees": <ZoikoHREmployees />,
  "/zoiko-hr/employee-management/employees/:id": <ZoikoHRProfile />,
  "/zoiko-hr/employee-management/organization": <ZoikoHROrgChart />,
  "/zoiko-hr/employee-management/lifecycle": <ZoikoHRLifecycle />,
  "/zoiko-hr/employee-management/reports": <ZoikoHRReports />,
  // Recruitment
  "/zoiko-hr/recruitment/job-requisitions": <JobRequisitions />,
  "/zoiko-hr/recruitment/candidates": <Candidates />,
  "/zoiko-hr/recruitment/interviews": <Interviews />,
  "/zoiko-hr/recruitment/offers": <OfferManagement />,
  // Performance
  "/zoiko-hr/performance/goals": <PlanGate featureKey="hr.performance.cycles" title="Performance management"><GoalsOKRs /></PlanGate>,
  "/zoiko-hr/performance/reviews": <PlanGate featureKey="hr.performance.cycles" title="Performance management"><PerformanceReviews /></PlanGate>,
  "/zoiko-hr/performance/appraisals": <PlanGate featureKey="hr.performance.cycles" title="Performance management"><Appraisals /></PlanGate>,
  "/zoiko-hr/performance/analytics": <PlanGate featureKey="hr.performance.cycles" title="Performance management"><PerformanceAnalytics /></PlanGate>,
  // Documents
  "/zoiko-hr/documents": <DocumentsDashboard />,
  "/zoiko-hr/documents/company-documents": <CompanyDocuments />,
  "/zoiko-hr/documents/approvals": <ApprovalWorkflow />,
  "/zoiko-hr/documents/employee-upload": <OrgAdminEmployeeDocumentsPage />,
  // Workforce Planning
  "/zoiko-hr/workforce-planning": <WorkforceDashboard />,
  "/zoiko-hr/workforce-planning/plans": <WorkforcePlans />,
  "/zoiko-hr/workforce-planning/headcount": <HeadcountPlanning />,
  "/zoiko-hr/workforce-planning/succession": <Succession />,
  "/zoiko-hr/workforce-planning/reports": <WorkforceReports />,
  // Settings
  "/settings/user-management": <UserManagementPage />,
  // Organization Admin
  "/organization-admin/dashboard": <OrgAdminDashboardPage />,
  "/organization-admin/organization": <OrgAdminOrganizationPage />,
  "/organization-admin/assets": <OrgAdminAssetsPage />,
  "/organization-admin/assets/requests": <OrgAdminAssetRequestsPage />,
  "/organization-admin/users": <OrgAdminUserManagementPage />,
  "/organization-admin/metrics": <OrgAdminMetricsPage />,
  "/organization-admin/payroll-guidance": <OrgAdminPayrollGuidancePage />,
  "/organization-admin/billing-and-plan": <OrgAdminBillingPlanPage />,
  "/organization-admin/pay-invoice": <OrgAdminPayInvoicePage />,
  // HR Admin
  "/hr-admin/dashboard": <HrAdminDashboardPage />,
  "/hr-admin/my-organization": <HrAdminOrganizationPage />,
  "/hr-admin/employees": <ZoikoHREmployees />,
  "/hr-admin/departments": <ZoikoHRDepartmentsDepartmentList />,
  "/hr-admin/designations": <ZoikoHRDesignationList />,
  "/hr-admin/attendance": <ZoikoHRAttendanceDashboard />,
  "/hr-admin/leave": <ZoikoHRLeaveDashboard />,
  "/hr-admin/onboarding": <ZoikoHROnboardingDashboard />,
  "/hr-admin/recruitment": <RecruitmentDashboard />,
  "/hr-admin/performance": <PerformanceDashboard />,
  "/hr-admin/assets": <AssetsDashboard />,
  "/hr-admin/learning": <ZoikoHRLearning />,
  "/hr-admin/documents": <DocumentsDashboard />,
  "/hr-admin/reports": <ZoikoHRReports />,
  "/hr-admin/settings": <UserManagementPage />,
  "/hr-admin/assistant-knowledge": <AdminKnowledgePage />,
  "/hr-admin/assistant-handoffs": <AdminHandoffsPage />,
  // Super Admin
  "/super-admin/dashboard": <SuperAdminDashboardPage />,
  "/super-admin/organizations": <SuperAdminOrganizationsPage />,
  "/super-admin/organizations/:orgId": <OrganizationDetailPage />,
  "/super-admin/access": <SuperAdminAccessPage />,
  "/super-admin/audit-logs": <SuperAdminAuditLogsPage />,
  "/super-admin/demo-requests": <SuperAdminSalesRequestsPage />,
  "/super-admin/pricing-requests": <SuperAdminSalesRequestsPage />,
  "/super-admin/notifications": <NotificationCenter />,
  "/shared/notifications": <NotificationsPage />,

  // Super Admin — Billing & Subscription
  "/super-admin/billing": <SuperAdminBillingOverviewPage />,
  "/super-admin/billing/plans": <SuperAdminBillingPlansPage />,
  "/super-admin/billing/discounts": <SuperAdminBillingDiscountsPage />,
  "/super-admin/billing/plan-changes": <SuperAdminBillingPlanChangesPage />,
  "/super-admin/billing/refunds": <SuperAdminBillingRefundsPage />,
  "/super-admin/billing/evaluations": <SuperAdminBillingEvaluationsPage />,
  "/super-admin/billing/invoices": <SuperAdminBillingInvoicesPage />,
  "/super-admin/billing/delinquency": <SuperAdminBillingDelinquencyPage />,

  // Super Admin — Payments & Reconciliation
  "/super-admin/billing/webhook-events": <SuperAdminBillingWebhookEventsPage />,
  "/super-admin/billing/reconciliation": <SuperAdminBillingReconciliationPage />,

  // Super Admin — Access & Security
  "/super-admin/assistant-knowledge": <SuperAdminKnowledgePage />,
  "/super-admin/support-tickets": <SuperAdminSupportTicketsPage />,
  "/super-admin/support-access": <SuperAdminSupportAccessPage />,

  // ─────────────────────────────────────────────────────────────────────────
  // EMPLOYEE WORKSPACE — /employee/* routes (role: employee only)
  // ─────────────────────────────────────────────────────────────────────────

  // Profile
  "/employee/profile":                    <EmployeeProfilePage />,
  "/employee/profile/bank-details":       <EmployeeBankDetails />,
  "/employee/profile/assets":             <EmployeeAssetDetails />,
  "/employee/profile/emergency-contacts": <EmployeeEmergencyContacts />,
  "/employee/profile/settings":           <EmployeeSecuritySettings />,

  // ESS
  "/employee/ess":            <EmployeeEssDashboard />,
  "/employee/ess-dashboard":  <Navigate to="/employee/ess" replace />,
  "/employee/ess/attendance": <EmployeeEssAttendance />,
  "/employee/ess/requests":   <Navigate to="/employee/learning" replace />,
  "/employee/ess/settings":   <EmployeeEssSettings />,

  // Learning
  "/employee/learning":                   <EmployeeLearningModule />,
  "/employee/learning/courses":           <EmployeeLearningModule />,
  "/employee/learning/training-programs": <EmployeeLearningModule />,
  "/employee/learning/assessments":       <EmployeeLearningModule />,

  // Leaves
  "/employee/leaves":          <EmployeeMyLeave />,
  "/employee/leaves/apply":    <EmployeeApplyLeave />,
  "/employee/leaves/calendar": <EmployeeLeaveCalendar />,
  "/employee/leaves/history":  <EmployeeLeaveHistory />,
  // Documents
  "/employee/documents/company":        <EmployeeCompanyDocuments />,
  "/employee/documents/my-files":       <EmployeeMyFiles />,
  "/employee/documents/payslips":       <EmployeePayslips />,
  "/employee/documents/contracts":      <EmployeeOfferContracts />,
  "/employee/documents/tax":            <EmployeeTaxCompliance />,

  // Travel
  "/employee/travel":           <EmployeeTravelDashboard />,
  "/employee/travel/requests":  <EmployeeTravelRequests />,
  "/employee/travel/approvals": <EmployeeTravelApprovals />,
  "/employee/travel/expenses":  <EmployeeTravelExpenses />,
  "/employee/travel/settings":  <EmployeeTravelSettings />,
};

// the sidebar prefetches a page's code chunk (and first data) when its link is hovered or focused
registerRoutes(routeOverrides);

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  const routePath = (href) => href ? href.split(/[?#]/)[0] : href;
  const allPaths = Array.from(new Set([
    ...Object.keys(routeOverrides),
    ...flatRoutes.map(r => routePath(r.href)).filter(Boolean)
  ]));


  function getAllowedRolesForPath(path) {
    return Object.keys(ROLE_ALLOWED_PREFIXES).filter((role) => {
      const disallowed = ROLE_DISALLOWED_PREFIXES[role] || [];
      if (disallowed.some((prefix) => path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'))) {
        return false;
      }
      const prefixes = ROLE_ALLOWED_PREFIXES[role] || [];
      return prefixes.some((prefix) => {
        if (prefix === "/") return path === "/";
        return path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : prefix + '/');
      });
    });
  }

  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<ModuleSpinner />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/hr-products" element={<HrProductsPage />} />
        <Route path="/request-pricing" element={<RequestPricingPage />} />
        <Route path="/book-demo" element={<BookDemoPage />} />
        <Route path="/get-demo" element={<Navigate to="/book-demo" replace />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/quotation/decide" element={<QuotationDecisionPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register/success" element={<RegistrationSuccessPage />} />
        <Route path="/contact" element={<ContactPage />} />

        {/* Every signed-in page lives under one layout route: the shell (sidebar + header) renders once and the page
            changes inside its <Outlet />. Each page keeps its own error boundary and its own role check. */}
        <Route element={<AppLayout />}>
          {allPaths.map((path) => {
            let element = routeOverrides[path];

            if (!element) {
              // No page built for this route: send the user home instead of a placeholder (ZHR-21).
              element = <Navigate to="/super-admin/dashboard" replace />;
            }

            const allowedRoles = getAllowedRolesForPath(path);

            return (
              <Route
                key={path}
                path={path}
                element={
                  <RouteBoundary>
                    <ProtectedRoute allowedRoles={allowedRoles}>
                      {element}
                    </ProtectedRoute>
                  </RouteBoundary>
                }
              />
            );
          })}
        </Route>

        {/* Platform Settings page was removed (ZHR-18): keep old bookmarks working. */}
        <Route path="/super-admin/settings" element={<Navigate to="/super-admin/dashboard" replace />} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
      <Suspense fallback={null}>
        <AssistantLauncher />
      </Suspense>
    </>
  );
}
