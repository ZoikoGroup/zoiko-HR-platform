import {
  Activity,
  Award,
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  FileCheck2,
  FileText,
  GitBranch,
  Globe,
  GraduationCap,
  HeartHandshake,
  History,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  Lock,
  MapPin,
  MessageSquare,
  MinusCircle,
  Package,
  Percent,
  Phone,
  Receipt,
  Plane,
  PlayCircle,
  PlusCircle,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  Target,
  TrendingUp,
  UserCheck,
  UserCircle,
  UserPlus,
  Users,
  WalletCards,
  Workflow,
  Save,
  UserRoundCheck,
  ThumbsUp,
  Wrench,
  Server,
  Database,
  HardDrive,
  FileText as FileTextIcon,
  Globe as GlobeIcon,
  FolderOpen,
  FileSignature,
  UploadCloud,
  Landmark,
  Laptop,
  ListFilter,
  Plus,
  ScrollText,
  HandCoins,
  Hourglass,
  Webhook,
  Scale,
  KeyRound,
  AlertTriangle,
  Tag,
} from "lucide-react";

import { ROLES } from "./config/roles.js";

// Platform core commands
const platform = {
  title: "PLATFORM",
  items: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Organizations", href: "/organizations", icon: ShieldCheck, badge: "3" },
  ],
};

// ── Super Admin (Organization Owner) — per ZHR-COM-BILL-001 ──────────────────
// Sidebar sections map to the spec's billing/subscription ownership model.
// Separation of duties: HR Admin, IT Admin and Security Admin permission sets
// remain separate — super_admin does NOT auto-inherit them.
//
// NOTE: this group is deliberately titled "PLATFORM ADMINISTRATION" rather
// than "PLATFORM" — SECTION_EXCLUSIONS in useFilteredNavigation.js hides a
// section titled exactly "PLATFORM" for super_admin (that exclusion targets
// the unrelated `platform` section below, shared by other roles). Reusing
// "PLATFORM" here would silently render this group empty for super_admin.

const superAdminCommandCenter = {
  title: "COMMAND CENTER",
  items: [
    { label: "Dashboard", href: "/super-admin/dashboard", icon: LayoutDashboard },
  ],
};

const superAdminOrganizations = {
  title: "ORGANIZATIONS",
  items: [
    { label: "Organizations", href: "/super-admin/organizations", icon: Building2 },
  ],
};

const superAdminBillingSubscription = {
  title: "BILLING & SUBSCRIPTION",
  items: [
    { label: "Overview", href: "/super-admin/billing", icon: LayoutDashboard },
    { label: "Plans & Catalog", href: "/super-admin/billing/plans", icon: Package },
    { label: "Evaluations & Trials", href: "/super-admin/billing/evaluations", icon: Hourglass },
    { label: "Plan Changes", href: "/super-admin/billing/plan-changes", icon: GitBranch },
    { label: "Invoices", href: "/super-admin/billing/invoices", icon: Receipt },
    { label: "Refunds & Credits", href: "/super-admin/billing/refunds", icon: HandCoins },
    { label: "Discounts", href: "/super-admin/billing/discounts", icon: Percent },
    { label: "Delinquency & Collections", href: "/super-admin/billing/delinquency", icon: AlertTriangle },
  ],
};

const superAdminPaymentsReconciliation = {
  title: "PAYMENTS & RECONCILIATION",
  items: [
    { label: "Webhook Events", href: "/super-admin/billing/webhook-events", icon: Webhook },
    { label: "Provider Reconciliation", href: "/super-admin/billing/reconciliation", icon: Scale },
  ],
};

const superAdminAccessSecurity = {
  title: "ACCESS & SECURITY",
  items: [
    { label: "Access & Role Management", href: "/super-admin/access", icon: Shield },
    { label: "Just-in-time Support Access", href: "/super-admin/jit-support-access", icon: Lock },
    { label: "Audit Logs", href: "/super-admin/audit-logs", icon: FileTextIcon },
  ],
};

const superAdminPlatformAdministration = {
  title: "PLATFORM ADMINISTRATION",
  items: [
    { label: "Notifications", href: "/super-admin/notifications", icon: Bell },
    { label: "Demo Requests", href: "/super-admin/demo-requests", icon: CalendarDays },
    { label: "Template Controls", href: "/super-admin/template-controls", icon: Shield },
    { label: "Pricing Requests", href: "/super-admin/pricing-requests", icon: Tag },
  ],
};

// Products (Zoiko HR only)
const products = {
  title: "PRODUCTS",
  items: [
    {
      label: "Zoiko HR",
      icon: Users,
      badge: "HR",
      children: [
        { label: "Dashboard",          href: "/zoiko-hr",                    icon: LayoutDashboard },
        { label: "Documents",          icon: FileText, children: [
          { label: "Dashboard",            href: "/zoiko-hr/documents",                    icon: LayoutDashboard },
          { label: "Employee Documents",   href: "/zoiko-hr/documents/employee-upload",     icon: UploadCloud },
          { label: "Company Documents",    href: "/zoiko-hr/documents/company-documents",   icon: Building2 },
          { label: "Approval Workflow",    href: "/zoiko-hr/documents/approvals",           icon: ClipboardCheck, featureKey: "hr.documents.workflow" },
        ]},
        { label: "Departments",        icon: Building2, children: [
          { label: "Dashboard",            href: "/zoiko-hr/departments",             icon: LayoutDashboard },
          { label: "Department List",      href: "/zoiko-hr/departments/list",        icon: Building2 },
          { label: "Structure",            href: "/zoiko-hr/departments/structure",    icon: GitBranch },
          { label: "Reports",              href: "/zoiko-hr/departments/reports",      icon: FileText },
          { label: "Settings",             href: "/zoiko-hr/departments/settings",     icon: SlidersHorizontal },
        ]},
        { label: "Designations",       icon: BadgeCheck, children: [
          { label: "Dashboard",            href: "/zoiko-hr/designations",             icon: LayoutDashboard },
          { label: "Designation List",     href: "/zoiko-hr/designations/list",        icon: BadgeCheck },
          { label: "Level Matrix",         href: "/zoiko-hr/designations/levels",       icon: Layers },
          { label: "Reports",              href: "/zoiko-hr/designations/reports",      icon: FileText },
          { label: "Settings",             href: "/zoiko-hr/designations/settings",     icon: SlidersHorizontal },
        ]},
        { label: "Leave",              icon: Calendar, children: [
          { label: "Dashboard",            href: "/zoiko-hr/leave",                    icon: LayoutDashboard },
          { label: "Leave Requests",       href: "/zoiko-hr/leave/requests",            icon: ClipboardCheck },
          { label: "Calendar",             href: "/zoiko-hr/leave/calendar",            icon: Calendar },
          { label: "Reports",              href: "/zoiko-hr/leave/reports",             icon: FileText },
        ]},
        { label: "Attendance", icon: Clock, children: [
          { label: "Dashboard",              href: "/zoiko-hr/attendance",             icon: LayoutDashboard },
          { label: "Attendance Records",     href: "/zoiko-hr/attendance/daily",       icon: ClipboardList },
          { label: "Holiday Calendar",       href: "/zoiko-hr/attendance/holidays",     icon: CalendarDays },
          { label: "Attendance Analytics",   href: "/zoiko-hr/attendance/analytics",    icon: BarChart3 },
          { label: "Time Requests",          href: "/zoiko-hr/attendance/time-requests", icon: Clock, featureKey: "hr.attendance.core" },
        ]},
        { label: "Performance",        icon: Activity, children: [
          { label: "Dashboard",             href: "/zoiko-hr/performance",              icon: LayoutDashboard },
          { label: "Goals & OKRs",          href: "/zoiko-hr/performance/goals",        icon: Target },
          { label: "Performance Reviews",   href: "/zoiko-hr/performance/reviews",      icon: ClipboardCheck },
          { label: "Appraisals",            href: "/zoiko-hr/performance/appraisals",   icon: Award },
          { label: "Performance Analytics", href: "/zoiko-hr/performance/analytics",    icon: BarChart3 },
          { label: "Probation & PIPs",      href: "/zoiko-hr/performance/probation",    icon: ClipboardCheck, featureKey: "hr.performance.cycles" },
          { label: "Employment Changes",    href: "/zoiko-hr/employee-changes",         icon: Users },
        ]},
        { label: "Recruitment",        icon: UserPlus, children: [
          { label: "Dashboard",              href: "/zoiko-hr/recruitment",              icon: LayoutDashboard, featureKey: "hr.recruitment.core" },
          { label: "Job Requisitions",       href: "/zoiko-hr/recruitment/job-requisitions", icon: Briefcase, featureKey: "hr.recruitment.core" },
          { label: "Candidates",             href: "/zoiko-hr/recruitment/candidates",    icon: Users, featureKey: "hr.recruitment.core" },
          { label: "Interviews",             href: "/zoiko-hr/recruitment/interviews",    icon: Calendar, featureKey: "hr.recruitment.core" },
          { label: "Offer Management",       href: "/zoiko-hr/recruitment/offers",        icon: FileCheck2, featureKey: "hr.recruitment.core" },
          { label: "Offers Issued",          href: "/zoiko-hr/recruitment/offers-issued", icon: Send, featureKey: "hr.recruitment.core" },
        ]},
        { label: "Onboarding",         icon: UserCheck, children: [
          { label: "Dashboard",             href: "/zoiko-hr/onboarding",               icon: LayoutDashboard, featureKey: "hr.onboarding.core" },
          { label: "New Hires",             href: "/zoiko-hr/onboarding/new-hires",      icon: UserPlus, featureKey: "hr.onboarding.core" },
          { label: "Pre-Onboarding",        href: "/zoiko-hr/onboarding/pre-onboarding", icon: CalendarCheck, featureKey: "hr.onboarding.core" },
          { label: "Documents",             href: "/zoiko-hr/onboarding/documents",       icon: FileText, featureKey: "hr.onboarding.core" },
          { label: "Checklists",            href: "/zoiko-hr/onboarding/checklists",     icon: ClipboardCheck, featureKey: "hr.onboarding.core" },
          { label: "Orientation",           href: "/zoiko-hr/onboarding/orientation",     icon: Calendar, featureKey: "hr.onboarding.core" },
          { label: "Reports",               href: "/zoiko-hr/onboarding/reports",         icon: BarChart3, featureKey: "hr.onboarding.core" },
          { label: "Payroll Verification",   href: "/zoiko-hr/onboarding/payroll-verifications", icon: WalletCards, featureKey: "hr.onboarding.core" },
          { label: "Settings",              href: "/zoiko-hr/onboarding/settings",        icon: SlidersHorizontal, featureKey: "hr.onboarding.core" },
        ]},
        { label: "Employee Management", icon: Users, excludeRoles: [ROLES.ADMIN, ROLES.HR_ADMIN], children: [
          { label: "Dashboard",             href: "/zoiko-hr/employee-management",         icon: LayoutDashboard },
          { label: "Employees",             href: "/zoiko-hr/employee-management/employees", icon: Users },
          { label: "Organization",           href: "/zoiko-hr/employee-management/organization", icon: GitBranch },
          { label: "Lifecycle",              href: "/zoiko-hr/employee-management/lifecycle", icon: Clock },
          { label: "Reports",               href: "/zoiko-hr/employee-management/reports", icon: BarChart3 },
        ]},
        { label: "Assets",             icon: Package, children: [
          { label: "Assets",             href: "/organization-admin/assets",          icon: Package },
          { label: "Asset Requests",     href: "/organization-admin/assets/requests", icon: ClipboardList },
        ]},
        { label: "Learning",           icon: BookOpen, children: [
          { label: "Dashboard",          href: "/zoiko-hr/learning",               icon: LayoutDashboard },
          { label: "Courses",            href: "/zoiko-hr/learning/courses",        icon: BookOpen },
          { label: "Training Programs",  href: "/zoiko-hr/learning/training-programs", icon: GraduationCap },
          { label: "Assessments",        href: "/zoiko-hr/learning/assessments",    icon: ClipboardCheck },
          { label: "Reports",            href: "/zoiko-hr/learning/reports",        icon: FileText },
        ]},
        { label: "Compensation",       icon: CircleDollarSign, children: [
          { label: "Dashboard",          href: "/zoiko-hr/compensation",               icon: LayoutDashboard },
          { label: "Salary Structures",  href: "/zoiko-hr/compensation/salary-structures", icon: CircleDollarSign },
          { label: "Pay Grades",         href: "/zoiko-hr/compensation/pay-grades",     icon: BadgeCheck },
          { label: "Salary Components",  href: "/zoiko-hr/compensation/salary-components", icon: Layers },
          { label: "Compensation Bands", href: "/zoiko-hr/compensation/bands",          icon: BarChart3 },
          { label: "Salary Revisions",   href: "/zoiko-hr/compensation/revisions",      icon: History },
          { label: "Approvals & Letters", href: "/zoiko-hr/compensation/approvals",     icon: ClipboardCheck, featureKey: "hr.compensation.core" },
          { label: "Allowances",         href: "/zoiko-hr/compensation/allowances",     icon: WalletCards },
          { label: "Benefits",           href: "/zoiko-hr/compensation/benefits",       icon: HeartHandshake },
        ]},
        { label: "ESS",                icon: LayoutDashboard, excludeRoles: [ROLES.ADMIN], children: [
          { label: "Dashboard",          href: "/zoiko-hr/ess",                   icon: LayoutDashboard },
          { label: "Profile",            href: "/zoiko-hr/ess/profile",           icon: UserCircle },
          { label: "Leave Management",   href: "/zoiko-hr/ess/leave",             icon: Calendar },
          { label: "Attendance",         href: "/zoiko-hr/ess/attendance",        icon: Clock },
          { label: "Learning",           href: "/zoiko-hr/ess/requests",          icon: BookOpen },
          { label: "Settings",           href: "/zoiko-hr/ess/settings",          icon: SlidersHorizontal },
        ]},
        // "Employee Documents" (/zoiko-hr/ess/documents/*) removed: confirmed via
        // `grep -n "/zoiko-hr/ess/documents" src/App.jsx` that none of its 5 routes
        // were ever registered — dead nav entries. "/zoiko-hr/ess/my-documents"
        // (formerly linked here as "My Documents") is also removed from this
        // sidebar as redundant with the "Documents" section under MY WORKSPACE
        // (/employee/documents/*, the actively-designed surface) — but its route
        // stays registered and unlinked-but-reachable: 8 other zoiko-hr/ess/*.jsx
        // pages (dashboard, profile, leave-management, attendance, settings,
        // requests, assigned-documents) cross-link to it from their own internal
        // tab strip, so removing the route would 404 from within that
        // self-contained mini nav. See PR description.
        { label: "Travel",             icon: Plane, children: [
          { label: "Dashboard",          href: "/zoiko-hr/travel",                icon: LayoutDashboard },
          { label: "Travel Requests",    href: "/zoiko-hr/travel/requests",       icon: Plane },
          { label: "Approvals",          href: "/zoiko-hr/travel/approvals",      icon: ClipboardCheck },
          { label: "Expenses",           href: "/zoiko-hr/travel/expenses",       icon: Receipt },
          { label: "Settings",           href: "/zoiko-hr/travel/settings",       icon: SlidersHorizontal },
        ]},
        { label: "Workforce Planning", icon: Target, children: [
          { label: "Dashboard",             href: "/zoiko-hr/workforce-planning",       icon: LayoutDashboard, featureKey: "hr.workforce_planning.core" },
          { label: "Plans",                 href: "/zoiko-hr/workforce-planning/plans",  icon: Target, featureKey: "hr.workforce_planning.core" },
          { label: "Headcount",             href: "/zoiko-hr/workforce-planning/headcount", icon: Users, featureKey: "hr.workforce_planning.core" },
          { label: "Succession",            href: "/zoiko-hr/workforce-planning/succession", icon: UserCheck, featureKey: "hr.workforce_planning.core" },
          { label: "Job Descriptions",      href: "/zoiko-hr/workforce-planning/job-descriptions", icon: FileText, featureKey: "hr.workforce_planning.core" },
          { label: "Reports",               href: "/zoiko-hr/workforce-planning/reports", icon: FileText, featureKey: "hr.workforce_planning.core" },
        ]},
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE WORKSPACE
// Shown only to employees (filtered via ROLE_ALLOWED_PREFIXES in roles.js).
// Covers the 5 subfolders under src/pages/Peoples/Employees/
// ─────────────────────────────────────────────────────────────────────────────
const employeeWorkspace = {
  title: "MY WORKSPACE",
  items: [
    // ── Profile ────────────────────────────────────────────────────────────
    {
      label: "Profile",
      icon: UserCircle,
      children: [
        { label: "My Profile",          href: "/employee/profile",                    icon: UserCircle },
        { label: "Bank Details",        href: "/employee/profile/bank-details",       icon: Landmark },
        { label: "Asset Details",       href: "/employee/profile/assets",             icon: Laptop },
        { label: "Emergency Contacts",  href: "/employee/profile/emergency-contacts", icon: ShieldAlert },
        { label: "Security Settings",   href: "/employee/profile/settings",           icon: Lock },
      ],
    },

    // ── ESS ────────────────────────────────────────────────────────────────
    {
      label: "ESS",
      icon: LayoutDashboard,
      children: [
        { label: "Dashboard",   href: "/employee/ess",            icon: LayoutDashboard },
        { label: "Attendance",  href: "/employee/ess/attendance", icon: Clock },
        { label: "Time Requests", href: "/employee/ess/time-requests", icon: Clock },
        { label: "My Compensation", href: "/employee/compensation", icon: WalletCards },
        { label: "My Performance", href: "/employee/performance", icon: Target },
        { label: "Settings",    href: "/employee/ess/settings",   icon: SlidersHorizontal },
      ],
    },

    // ── Learning ───────────────────────────────────────────────────────────
    {
      label: "Learning",
      icon: BookOpen,
      children: [
        { label: "Dashboard",          href: "/employee/learning",                   icon: LayoutDashboard },
        { label: "Courses",            href: "/employee/learning/courses",           icon: BookOpen },
        { label: "Training Programs",  href: "/employee/learning/training-programs", icon: GraduationCap },
        { label: "Assessments",        href: "/employee/learning/assessments",       icon: ClipboardCheck },
      ],
    },

    // ── Leaves ─────────────────────────────────────────────────────────────
    {
      label: "Leaves",
      icon: Calendar,
      children: [
        { label: "My Leave",        href: "/employee/leaves",          icon: CalendarCheck },
        { label: "Apply Leave",     href: "/employee/leaves/apply",    icon: Plus },
        { label: "Leave Calendar",  href: "/employee/leaves/calendar", icon: CalendarDays },
        { label: "Leave History",   href: "/employee/leaves/history",  icon: History },
      ],
    },

    // ── Documents ──────────────────────────────────────────────────────────
    {
      label: "Documents",
      icon: FolderOpen,
      children: [
        { label: "Company Documents", href: "/employee/documents/company",        icon: FileText },
        { label: "Documents to Action", href: "/employee/documents/to-action",    icon: ClipboardCheck },
        { label: "Company Policies",  href: "/employee/documents/policies",       icon: BookOpen },
        { label: "Awaiting My Signature", href: "/employee/documents/signatory-queue", icon: FileSignature },
        { label: "My Files",          href: "/employee/documents/my-files",       icon: FolderOpen },
        { label: "Payslips",          href: "/employee/documents/payslips",        icon: Receipt },
        { label: "Offer & Contracts", href: "/employee/documents/contracts",       icon: FileSignature },
        { label: "Tax & Compliance",  href: "/employee/documents/tax",             icon: ShieldCheck },
      ],
    },

    // ── Travel ─────────────────────────────────────────────────────────────
    {
      label: "Travel",
      icon: Plane,
      children: [
        { label: "Dashboard",        href: "/employee/travel",           icon: LayoutDashboard },
        { label: "Travel Requests",  href: "/employee/travel/requests",  icon: Plane },
        { label: "Approvals",        href: "/employee/travel/approvals", icon: ClipboardCheck },
        { label: "Expenses",         href: "/employee/travel/expenses",  icon: Receipt },
        { label: "Settings",         href: "/employee/travel/settings",  icon: SlidersHorizontal },
      ],
    },

  ],
};

// User Management
const userManagement = {
  title: "USER MANAGEMENT",
  items: [
    { label: "User Management", href: "/hr-admin/settings", icon: Users },
    { label: "Assistant Knowledge", href: "/hr-admin/assistant-knowledge", icon: BookOpen, featureKey: "hr.ai.policy_qa" },
    { label: "Support Tickets", href: "/hr-admin/assistant-handoffs", icon: LifeBuoy, featureKey: "hr.ai.workflow_assist" },
  ],
};

// Administration
const settings = {
  title: "ADMINISTRATION",
  items: [
    { label: "User Management", href: "/organization-admin/users", icon: Users },
  ],
};

// Notifications inbox for the Organization and User portals (ZHR-20). Hidden for
// super_admin in useFilteredNavigation - they use the Notification Center.
const notificationsSection = {
  title: "NOTIFICATIONS",
  items: [
    { label: "Notifications", href: "/shared/notifications", icon: Bell },
  ],
};

// Shared Layers collapsible section
const sharedLayersSection = {
  title: "SHARED LAYERS",
  items: [
    {
      label: "Shared Layers",
      icon: Layers,
      children: [
        { label: "Zoiko ID", href: "/shared/id", icon: UserCheck },
        { label: "Zoiko Workflow", href: "/shared/workflow", icon: Workflow },
        { label: "Zoiko Hub", href: "/shared/hub", icon: Layers },
        { label: "Zoiko Connect", href: "/shared/connect", icon: Globe },
      ],
    },
  ],
};

// HR Admin Dashboard Section
const hrAdminDashboard = {
  title: "HR ADMIN",
  items: [
    { label: "Dashboard", href: "/hr-admin/dashboard", icon: LayoutDashboard },
    { label: "My Organization", href: "/hr-admin/my-organization", icon: Building2 },
    { label: "Documents", href: "/hr-admin/documents", icon: FileText },
  ],
};

// Organization Admin Dashboard Section
const organizationAdminDashboard = {
  title: "ORGANIZATION ADMIN",
  items: [
    { label: "Dashboard", href: "/organization-admin/dashboard", icon: LayoutDashboard },
    { label: "My Organization", href: "/organization-admin/organization", icon: Building2 },
    { label: "Payroll Guidance", href: "/organization-admin/payroll-guidance", icon: BookOpen, badge: "Payroll" },
    { label: "Billing & Plan", href: "/organization-admin/billing-and-plan", icon: CreditCard },
    // approving platform support access is the organization admin's call (the API refuses HR admins)
    { label: "Support Access", href: "/organization-admin/support-access", icon: KeyRound, excludeRoles: [ROLES.HR_ADMIN] },
  ],
};

export const sections = [
  superAdminCommandCenter,
  superAdminOrganizations,
  superAdminBillingSubscription,
  superAdminPaymentsReconciliation,
  superAdminAccessSecurity,
  superAdminPlatformAdministration,
  organizationAdminDashboard,
  hrAdminDashboard,
  platform,
  products,
  // Employee-only workspace section (filtered to role=employee by useFilteredNavigation)
  employeeWorkspace,
  notificationsSection,
  sharedLayersSection,
  userManagement,
  settings,
];

function flattenItems(items) {
  return items.flatMap((item) => {
    const current = item.href ? [{ label: item.label, href: item.href, badge: item.badge }] : [];
    const children = item.children ? flattenItems(item.children) : [];
    return [...current, ...children];
  });
}

export const flatRoutes = flattenItems(sections.flatMap((section) => section.items));
