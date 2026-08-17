import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import SuperAdminShell from "./components/SuperAdminShell";
import { flatRoutes } from "./navigation";
import { AlertTriangle } from "lucide-react";
import { ROLE_ALLOWED_PREFIXES, ROLE_DISALLOWED_PREFIXES } from "./config/roles";

function PagePlaceholderFallback({ title, path, badge }) {
  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">Route: <span className="font-semibold text-slate-800">{path ?? "unknown"}</span></p>
        {badge && <p className="mt-2 text-sm text-slate-600">Badge: <span className="font-semibold text-[#FF7A00]">{badge}</span></p>}
        <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-500">
          Module page ready for implementation.
        </div>
      </div>
    </div>
  );
}

function ModuleSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF7A00]" />
    </div>
  );
}
import HomePage from "./pages/public/HomePage";
import LoginPage from "./pages/auth/LoginPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import RegisterPage from "./pages/auth/RegisterPage";
import RegistrationSuccessPage from "./pages/auth/RegistrationSuccessPage";
import ZoikoProductsPage from "./pages/public/ZoikoProductsPage";
import PlatformPage from "./pages/public/PlatformPage";
import SolutionsPage from "./pages/public/SolutionsPage";
import PricingPage from "./pages/public/PricingPage";
import ContactPage from "./pages/public/ContactPage";
import ResourcesPage from "./pages/public/ResourcesPage";
import AboutPage from "./pages/public/AboutPage";
import ZoikoLeadershipPage from "./pages/public/ZoikoLeadershipPage";
import ZoikoCareersPage from "./pages/public/ZoikoCareersPage";
import ZoikoDemoPage from "./pages/public/ZoikoDemoPage";
import ZoikoHRPage from "./pages/products/ZoikoHRPage";
import ZoikoPeoplePage from "./pages/public/five-pillars/ZoikoPeoplePage";
import ZoikoMoneyPage from "./pages/public/five-pillars/ZoikoMoneyPage";
import ZoikoWorkPage from "./pages/public/five-pillars/ZoikoWorkPage";
import ZoikoSupplyPage from "./pages/public/five-pillars/ZoikoSupplyPage";
import ZoikoControlPage from "./pages/public/five-pillars/ZoikoControlPage";
import ZoikoHowItWorksPage from "./pages/platform/ZoikoHowItWorksPage";
import ZoikoSecurityPage from "./pages/platform/ZoikoSecurityPage";
import ZoikoTrustCenterPage from "./pages/platform/ZoikoTrustCenterPage";
import ZoikoConnectPage from "./pages/platform/ZoikoConnectPage";
import ZoikoApiDocsPage from "./pages/platform/ZoikoApiDocsPage";
import ZoikoSystemStatusPage from "./pages/platform/ZoikoSystemStatusPage";
import ZoikoEcosystemPage from "./pages/public/eco-system/ZoikoEcosystemPage";
import ZoikoVertexPage from "./pages/public/eco-system/ZoikoVertexPage";
import ZoikoSuitePage from "./pages/public/eco-system/ZoikoSuitePage";
import ZoikoSemaPage from "./pages/public/eco-system/ZoikoSemaPage";
import ZoikoLocalPage from "./pages/public/eco-system/ZoikoLocalPage";
import ZoikoDigitalPage from "./pages/public/eco-system/ZoikoDigitalPage";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";

// Target 'HrDashBoard.jsx' directly
import ZoikoHRModule from "./modules/zoiko-hr/HrDashBoard.jsx";

// Sub-module imports — lazy-loaded for code splitting
const ZoikoHRLeaveDashboard = lazy(() => import("./modules/zoiko-hr/leave/dashboard.jsx"));
const ZoikoHRLeaveRequests = lazy(() => import("./modules/zoiko-hr/leave/leave-requests.jsx"));
const ZoikoHRLeaveCalendar = lazy(() => import("./modules/zoiko-hr/leave/leave-calendar.jsx"));
const ZoikoHRLeaveReports = lazy(() => import("./modules/zoiko-hr/leave/reports.jsx"));

const ZoikoHRDepartmentsDashboard = lazy(() => import("./modules/zoiko-hr/departments/dashboard.jsx"));
const ZoikoHRDepartmentsDepartmentList = lazy(() => import("./modules/zoiko-hr/departments/department-list.jsx"));
const ZoikoHRDepartmentsDepartmentStructure = lazy(() => import("./modules/zoiko-hr/departments/department-structure.jsx"));
const ZoikoHRDepartmentsReports = lazy(() => import("./modules/zoiko-hr/departments/reports.jsx"));
const ZoikoHRDepartmentsSettings = lazy(() => import("./modules/zoiko-hr/departments/settings.jsx"));

const ZoikoHRDesignationsDashboard = lazy(() => import("./modules/zoiko-hr/designations/dashboard.jsx"));
const ZoikoHRDesignationList = lazy(() => import("./modules/zoiko-hr/designations/designation-list.jsx"));
const ZoikoHRDesignationStructure = lazy(() => import("./modules/zoiko-hr/designations/designation-structure.jsx"));
const ZoikoHRDesignationReports = lazy(() => import("./modules/zoiko-hr/designations/reports.jsx"));
const ZoikoHRDesignationSettings = lazy(() => import("./modules/zoiko-hr/designations/settings.jsx"));

const PerformanceDashboard = lazy(() => import("./modules/zoiko-hr/performance/dashboard.jsx"));
const GoalsOKRs = lazy(() => import("./modules/zoiko-hr/performance/goals.jsx"));
const PerformanceReviews = lazy(() => import("./modules/zoiko-hr/performance/reviews.jsx"));
const Appraisals = lazy(() => import("./modules/zoiko-hr/performance/appraisals.jsx"));
const PerformanceAnalytics = lazy(() => import("./modules/zoiko-hr/performance/analytics.jsx"));
const RecruitmentDashboard = lazy(() => import("./modules/zoiko-hr/recruitment/dashboard.jsx"));
const JobRequisitions = lazy(() => import("./modules/zoiko-hr/recruitment/job-requisitions.jsx"));
const Candidates = lazy(() => import("./modules/zoiko-hr/recruitment/candidates.jsx"));
const Interviews = lazy(() => import("./modules/zoiko-hr/recruitment/interviews.jsx"));
const OfferManagement = lazy(() => import("./modules/zoiko-hr/recruitment/offers.jsx"));
const ZoikoHROnboardingDashboard = lazy(() => import("./modules/zoiko-hr/onboarding/dashboard.jsx"));
const ZoikoHROnboardingNewHires = lazy(() => import("./modules/zoiko-hr/onboarding/new-hires.jsx"));
const ZoikoHROnboardingPreOnboarding = lazy(() => import("./modules/zoiko-hr/onboarding/pre-onboarding.jsx"));
const ZoikoHROnboardingDocuments = lazy(() => import("./modules/zoiko-hr/onboarding/documents.jsx"));
const ZoikoHROnboardingChecklists = lazy(() => import("./modules/zoiko-hr/onboarding/checklists.jsx"));
const ZoikoHROnboardingOrientation = lazy(() => import("./modules/zoiko-hr/onboarding/orientation.jsx"));
const ZoikoHROnboardingReports = lazy(() => import("./modules/zoiko-hr/onboarding/reports.jsx"));
const ZoikoHROnboardingSettings = lazy(() => import("./modules/zoiko-hr/onboarding/settings.jsx"));
const ZoikoHRLearning = lazy(() => import("./modules/zoiko-hr/learning/learning.jsx"));

const EssDashboard = lazy(() => import("./modules/zoiko-hr/ess/dashboard.jsx"));
const EssProfile = lazy(() => import("./modules/zoiko-hr/ess/profile.jsx"));
const EssLeaveManagement = lazy(() => import("./modules/zoiko-hr/ess/leave-management.jsx"));
const EssAttendance = lazy(() => import("./modules/zoiko-hr/ess/attendance.jsx"));
const EssMyDocuments = lazy(() => import("./modules/zoiko-hr/ess/my-documents.jsx"));
const EssAssignedDocuments = lazy(() => import("./modules/zoiko-hr/ess/assigned-documents.jsx"));
const EssRequests = lazy(() => import("./modules/zoiko-hr/ess/requests.jsx"));
const EssSettings = lazy(() => import("./modules/zoiko-hr/ess/settings.jsx"));

const TravelDashboard = lazy(() => import("./modules/zoiko-hr/travel/dashboard.jsx"));
const TravelRequests = lazy(() => import("./modules/zoiko-hr/travel/travel-requests.jsx"));
const TravelApprovals = lazy(() => import("./modules/zoiko-hr/travel/approvals.jsx"));
const TravelExpenses = lazy(() => import("./modules/zoiko-hr/travel/expenses.jsx"));
const TravelSettings = lazy(() => import("./modules/zoiko-hr/travel/settings.jsx"));

// Assets — lazy-load individual components (named exports, can't use barrel lazy)
const AssetsDashboard = lazy(() => import("./modules/zoiko-hr/assets/assetsdashboard"));
const MyAssets = lazy(() => import("./modules/zoiko-hr/assets/my-assets"));
const AssetCatalog = lazy(() => import("./modules/zoiko-hr/assets/inventory"));
const AssetRequests = lazy(() => import("./modules/zoiko-hr/assets/returns"));
const AssetMaintenance = lazy(() => import("./modules/zoiko-hr/assets/maintenance"));
const AssetReports = lazy(() => import("./modules/zoiko-hr/assets/reports"));
const AssetSettings = lazy(() => import("./modules/zoiko-hr/assets/settings"));

const DocumentsDashboard = lazy(() => import("./modules/zoiko-hr/documents/dashboard.jsx"));
const EmployeeDocuments = lazy(() => import("./modules/zoiko-hr/documents/employee-documents.jsx"));
const CompanyDocuments = lazy(() => import("./modules/zoiko-hr/documents/company-documents.jsx"));
const ApprovalWorkflow = lazy(() => import("./modules/zoiko-hr/documents/approvals.jsx"));

const ZoikoHRAttendanceDashboard = lazy(() => import("./modules/zoiko-hr/attendance/dashboard.jsx"));
const ZoikoHRAttendanceDailyRecords = lazy(() => import("./modules/zoiko-hr/attendance/daily-records.jsx"));
const ZoikoHRAttendanceLeaves = lazy(() => import("./modules/zoiko-hr/attendance/leave-management.jsx"));
const ZoikoHRAttendanceShifts = lazy(() => import("./modules/zoiko-hr/attendance/shifts.jsx"));
const ZoikoHRAttendanceHolidays = lazy(() => import("./modules/zoiko-hr/attendance/holidays.jsx"));
const ZoikoHRAttendanceAnalytics = lazy(() => import("./modules/zoiko-hr/attendance/analytics.jsx"));

const WorkforceDashboard = lazy(() => import("./modules/zoiko-hr/workforce-planning/dashboard.jsx"));
const WorkforcePlans = lazy(() => import("./modules/zoiko-hr/workforce-planning/plans.jsx"));
const HeadcountPlanning = lazy(() => import("./modules/zoiko-hr/workforce-planning/headcount.jsx"));
const Succession = lazy(() => import("./modules/zoiko-hr/workforce-planning/succession.jsx"));
const WorkforceReports = lazy(() => import("./modules/zoiko-hr/workforce-planning/reports.jsx"));

const ZoikoHRCompDashboard = lazy(() => import("./modules/zoiko-hr/compensation/dashboard.jsx"));
const ZoikoHRCompSalaryStructures = lazy(() => import("./modules/zoiko-hr/compensation/salary-structures.jsx"));
const ZoikoHRCompPayGrades = lazy(() => import("./modules/zoiko-hr/compensation/pay-grades.jsx"));
const ZoikoHRCompSalaryComponents = lazy(() => import("./modules/zoiko-hr/compensation/salary-components.jsx"));
const ZoikoHRCompBands = lazy(() => import("./modules/zoiko-hr/compensation/compensation-bands.jsx"));
const ZoikoHRCompRevisions = lazy(() => import("./modules/zoiko-hr/compensation/salary-revisions.jsx"));
const ZoikoHRCompAllowances = lazy(() => import("./modules/zoiko-hr/compensation/allowances.jsx"));
const ZoikoHRCompBenefits = lazy(() => import("./modules/zoiko-hr/compensation/benefits.jsx"));

const ZoikoHRDashboard = lazy(() => import("./pages/Peoples/Employees/EmployeeManagement/dashboard.jsx"));
const ZoikoHREmployees = lazy(() => import("./pages/Peoples/Employees/EmployeeManagement/employees.jsx"));
const ZoikoHRProfile = lazy(() => import("./pages/Peoples/Employees/EmployeeManagement/profile.jsx"));
const ZoikoHROrgChart = lazy(() => import("./pages/Peoples/Employees/EmployeeManagement/organization.jsx"));
const ZoikoHRLifecycle = lazy(() => import("./pages/Peoples/Employees/EmployeeManagement/lifecycle.jsx"));
const ZoikoHRReports = lazy(() => import("./pages/Peoples/Employees/EmployeeManagement/reports.jsx"));

const OrgAdminDashboardPage = lazy(() => import("./modules/organization-admin/DashboardPage"));
const OrgAdminOrganizationPage = lazy(() => import("./modules/organization-admin/OrganizationPage"));
const OrgAdminAssetRequestsPage = lazy(() => import("./modules/organization-admin/AssetRequestsPage"));
const OrgAdminAssetsPage = lazy(() => import("./modules/organization-admin/AssetsPage"));
const OrgAdminEmployeeDocumentsPage = lazy(() => import("./modules/organization-admin/EmployeeDocumentsPage"));
const OrgAdminUserManagementPage = lazy(() => import("./modules/organization-admin/UserManagementPage"));
const OrgAdminMetricsPage = lazy(() => import("./modules/organization-admin/MetricsPage"));
const OrgAdminPayrollGuidancePage = lazy(() => import("./modules/organization-admin/PayrollGuidancePage"));

const HrAdminDashboardPage = lazy(() => import("./modules/hr-admin/DashboardPage"));
const HrAdminOrganizationPage = lazy(() => import("./modules/hr-admin/OrganizationPage"));

const SuperAdminDashboardPage = lazy(() => import("./modules/super-admin/DashboardPage"));
const SuperAdminOrganizationsPage = lazy(() => import("./modules/super-admin/OrganizationsPage"));
const SuperAdminAuditLogsPage = lazy(() => import("./modules/super-admin/AuditLogsPage"));
const SuperAdminPlatformSettingsPage = lazy(() => import("./modules/super-admin/PlatformSettingsPage"));
const NotificationCenter = lazy(() => import("./modules/super-admin/NotificationCenter"));
const OrganizationDetailPage = lazy(() => import("./modules/super-admin/OrganizationDetailPage"));

const DashboardPage = lazy(() => import("./modules/platform/DashboardPage"));
const OrganizationsPage = lazy(() => import("./modules/platform/OrganizationsPage"));
const SubscriptionsPage = lazy(() => import("./modules/platform/SubscriptionsPage"));

const ZoikoIdPage = lazy(() => import("./modules/shared-layers/ZoikoIdPage"));
const ZoikoWorkflowPage = lazy(() => import("./modules/shared-layers/ZoikoWorkflowPage"));
const ZoikoHubPage = lazy(() => import("./modules/shared-layers/ZoikoHubPage"));
const ZoikoConnectPageModule = lazy(() => import("./modules/shared-layers/ZoikoConnectPage"));
const DocumentsPage = lazy(() => import("./modules/shared-layers/DocumentsPage"));
const ApprovalsPage = lazy(() => import("./modules/shared-layers/ApprovalsPage"));
const ExpensesPage = lazy(() => import("./modules/shared-layers/ExpensesPage"));
const AdminKnowledgePage = lazy(() => import("./modules/shared-layers/assistant/AdminKnowledgePage"));
const AssistantLauncher = lazy(() => import("./modules/shared-layers/assistant/AssistantLauncher"));
const UserManagementPage = lazy(() => import("./modules/settings/UserManagementPage"));

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE WORKSPACE — src/pages/Peoples/Employees/
// Filenames use capital E prefix: Employee_ (except EmployeeProfile.jsx)
// ─────────────────────────────────────────────────────────────────────────────

// Profile folder
const EmployeeProfilePage = lazy(() => import("./pages/Peoples/Employees/Profile/EmployeeProfile.jsx"));
const EmployeeBankDetails = lazy(() => import("./pages/Peoples/Employees/Profile/Employee_BankDetails.jsx"));
const EmployeeAssetDetails = lazy(() => import("./pages/Peoples/Employees/Profile/Employee_AssetDetails.jsx"));
const EmployeeEmergencyContacts = lazy(() => import("./pages/Peoples/Employees/Profile/Employee_EmergencyContacts.jsx"));
const EmployeeSecuritySettings = lazy(() => import("./pages/Peoples/Employees/Profile/Employee_settings.jsx"));

// ESS folder
const EmployeeEssDashboard = lazy(() => import("./pages/Peoples/Employees/ESS/Employee_EssDashboard.jsx"));
const EmployeeEssAttendance = lazy(() => import("./pages/Peoples/Employees/ESS/Employee_EssAttendance.jsx"));
const EmployeeEssRequests = lazy(() => import("./pages/Peoples/Employees/ESS/EmployeeLearning.jsx"));
const EmployeeEssSettings = lazy(() => import("./pages/Peoples/Employees/ESS/Employee_EssSettings.jsx"));

// Leaves folder
const EmployeeMyLeave = lazy(() => import("./pages/Peoples/Employees/Leaves/Employee_MyLeaveDashboard.jsx"));
const EmployeeApplyLeave = lazy(() => import("./pages/Peoples/Employees/Leaves/Employee_ApplyLeaveForm.jsx"));
const EmployeeLeaveCalendar = lazy(() => import("./pages/Peoples/Employees/Leaves/Employee_LeaveCalendar.jsx"));
const EmployeeLeaveHistory = lazy(() => import("./pages/Peoples/Employees/Leaves/Employee_LeaveHistory.jsx"));
// Documents folder
const EmployeeMyFiles = lazy(() => import("./pages/Peoples/Employees/Documents/Employee_MyFiles.jsx"));
const EmployeePayslips = lazy(() => import("./pages/Peoples/Employees/Documents/Employee_Payslips.jsx"));
const EmployeeOfferContracts = lazy(() => import("./pages/Peoples/Employees/Documents/Employee_OfferContracts.jsx"));
const EmployeeTaxCompliance = lazy(() => import("./pages/Peoples/Employees/Documents/Employee_TaxCompliance.jsx"));
const EmployeeUploadRequest = lazy(() => import("./pages/Peoples/Employees/Documents/Employee_UploadRequest.jsx"));
const EmployeeCompanyDocuments = lazy(() => import("./pages/Peoples/Employees/Documents/Employee_CompanyDocuments.jsx"));

// Travel folder
const EmployeeTravelDashboard = lazy(() => import("./pages/Peoples/Employees/Travel/Employee_TravelDashboard.jsx"));
const EmployeeTravelRequests = lazy(() => import("./pages/Peoples/Employees/Travel/Employee_TravelRequests.jsx"));
const EmployeeTravelApprovals = lazy(() => import("./pages/Peoples/Employees/Travel/Employee_TravelApprovals.jsx"));
const EmployeeTravelExpenses = lazy(() => import("./pages/Peoples/Employees/Travel/Employee_TravelExpenses.jsx"));
const EmployeeTravelSettings = lazy(() => import("./pages/Peoples/Employees/Travel/Employee_TravelSettings.jsx"));

const routeOverrides = {
  "/dashboard": <DashboardPage />,
  "/organizations": <OrganizationsPage />,
  "/subscriptions": <SubscriptionsPage />,
  "/shared/id": <ZoikoIdPage />,
  "/shared/workflow": <ZoikoWorkflowPage />,
  "/shared/hub": <ZoikoHubPage />,
  "/shared/connect": <ZoikoConnectPageModule />,
  "/shared/documents": <DocumentsPage />,
  "/shared/approvals": <ApprovalsPage />,
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
  "/zoiko-hr/performance": <PerformanceDashboard />,
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
  "/zoiko-hr/performance/goals": <GoalsOKRs />,
  "/zoiko-hr/performance/reviews": <PerformanceReviews />,
  "/zoiko-hr/performance/appraisals": <Appraisals />,
  "/zoiko-hr/performance/analytics": <PerformanceAnalytics />,
  // Documents
  "/zoiko-hr/documents": <DocumentsDashboard />,
  "/zoiko-hr/documents/employee-documents": <EmployeeDocuments />,
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
  // Super Admin
  "/super-admin/dashboard": <SuperAdminDashboardPage />,
  "/super-admin/organizations": <SuperAdminOrganizationsPage />,
  "/super-admin/organizations/:orgId": <OrganizationDetailPage />,
  "/super-admin/audit-logs": <SuperAdminAuditLogsPage />,
  "/super-admin/settings": <SuperAdminPlatformSettingsPage />,
  "/super-admin/notifications": <NotificationCenter />,

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
  "/employee/ess/attendance": <EmployeeEssAttendance />,
  "/employee/ess/requests":   <EmployeeEssRequests />,
  "/employee/ess/settings":   <EmployeeEssSettings />,

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
  "/employee/documents/upload-request": <EmployeeUploadRequest />,

  // Travel
  "/employee/travel":           <EmployeeTravelDashboard />,
  "/employee/travel/requests":  <EmployeeTravelRequests />,
  "/employee/travel/approvals": <EmployeeTravelApprovals />,
  "/employee/travel/expenses":  <EmployeeTravelExpenses />,
  "/employee/travel/settings":  <EmployeeTravelSettings />,
};

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

  const flatRouteMap = new Map(flatRoutes.map(r => [routePath(r.href), r]));

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
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register/success" element={<RegistrationSuccessPage />} />

        {allPaths.map((path) => {
          let element = routeOverrides[path];
          const routeInfo = flatRouteMap.get(path);
          const label = routeInfo ? routeInfo.label : path.split('/').pop();
          const badge = routeInfo ? routeInfo.badge : null;

          if (!element) {
            element = (
              <PagePlaceholderFallback
                title={label}
                path={path}
                badge={badge}
              />
            );
          }

          const allowedRoles = getAllowedRolesForPath(path);

          return (
            <Route
              key={path}
              path={path}
              element={
                <ErrorBoundary>
                  <ProtectedRoute allowedRoles={allowedRoles}>
                    <SuperAdminShell>
                      {element}
                    </SuperAdminShell>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />
          );
        })}

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
      <Suspense fallback={null}>
        <AssistantLauncher />
      </Suspense>
    </>
  );
}
