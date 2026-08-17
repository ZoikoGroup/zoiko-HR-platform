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
  FileCheck2,
  FileText,
  GitBranch,
  Globe,
  GraduationCap,
  HeartHandshake,
  History,
  LayoutDashboard,
  Layers,
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
  Sparkles,
  Tags,
  Target,
  TrendingUp,
  User,
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
  Settings,
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
} from "lucide-react";

import { ROLES } from "./config/roles";

// Platform core commands
const platform = {
  title: "PLATFORM",
  items: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Organizations", href: "/organizations", icon: ShieldCheck, badge: "3" },
  ],
};

// Super Admin / Platform Owner profile
const superAdminProfile = {
  title: "PROFILE",
  items: [
    {
      label: "Platform Owner",
      href: "/admin-profile",
      icon: User,
      dp: true,
    },
  ],
};

// ── Super Admin (Organization Owner) — per ZHR-COM-BILL-001 ──────────────────
// Sidebar sections map to the spec's billing/subscription ownership model.
// Separation of duties: HR Admin, IT Admin and Security Admin permission sets
// remain separate — super_admin does NOT auto-inherit them.

const superAdminBilling = {
  title: "BILLING & SUBSCRIPTION",
  items: [
    { label: "Overview", href: "/super-admin/billing", icon: LayoutDashboard },
    { label: "Plans & Catalog", href: "/super-admin/billing/plans", icon: Package },
    { label: "Discounts", href: "/super-admin/billing/discounts", icon: Percent },
  ],
};

const superAdminPlatform = {
  title: "PLATFORM",
  items: [
    { label: "Dashboard",                href: "/super-admin/dashboard",           icon: LayoutDashboard },
    { label: "Organizations",            href: "/super-admin/organizations",       icon: Building2 },
    { label: "Access & Role Management", href: "/super-admin/access",              icon: Shield },
    { label: "Audit Logs",               href: "/super-admin/audit-logs",          icon: FileTextIcon },
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
          { label: "Approval Workflow",    href: "/zoiko-hr/documents/approvals",           icon: ClipboardCheck },
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
        ]},
        { label: "Performance",        icon: Activity, children: [
          { label: "Dashboard",             href: "/zoiko-hr/performance",              icon: LayoutDashboard },
          { label: "Goals & OKRs",          href: "/zoiko-hr/performance/goals",        icon: Target },
          { label: "Performance Reviews",   href: "/zoiko-hr/performance/reviews",      icon: ClipboardCheck },
          { label: "Appraisals",            href: "/zoiko-hr/performance/appraisals",   icon: Award },
          { label: "Performance Analytics", href: "/zoiko-hr/performance/analytics",    icon: BarChart3 },
        ]},
        { label: "Recruitment",        icon: UserPlus, children: [
          { label: "Dashboard",              href: "/zoiko-hr/recruitment",              icon: LayoutDashboard },
          { label: "Job Requisitions",       href: "/zoiko-hr/recruitment/job-requisitions", icon: Briefcase },
          { label: "Candidates",             href: "/zoiko-hr/recruitment/candidates",    icon: Users },
          { label: "Interviews",             href: "/zoiko-hr/recruitment/interviews",    icon: Calendar },
          { label: "Offer Management",       href: "/zoiko-hr/recruitment/offers",        icon: FileCheck2 },
        ]},
        { label: "Onboarding",         icon: UserCheck, children: [
          { label: "Dashboard",             href: "/zoiko-hr/onboarding",               icon: LayoutDashboard },
          { label: "New Hires",             href: "/zoiko-hr/onboarding/new-hires",      icon: UserPlus },
          { label: "Pre-Onboarding",        href: "/zoiko-hr/onboarding/pre-onboarding", icon: CalendarCheck },
          { label: "Documents",             href: "/zoiko-hr/onboarding/documents",       icon: FileText },
          { label: "Checklists",            href: "/zoiko-hr/onboarding/checklists",     icon: ClipboardCheck },
          { label: "Orientation",           href: "/zoiko-hr/onboarding/orientation",     icon: Calendar },
          { label: "Reports",               href: "/zoiko-hr/onboarding/reports",         icon: BarChart3 },
          { label: "Settings",              href: "/zoiko-hr/onboarding/settings",        icon: SlidersHorizontal },
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
          { label: "Allowances",         href: "/zoiko-hr/compensation/allowances",     icon: WalletCards },
          { label: "Benefits",           href: "/zoiko-hr/compensation/benefits",       icon: HeartHandshake },
        ]},
        { label: "ESS",                icon: User, excludeRoles: [ROLES.ADMIN], children: [
          { label: "Dashboard",          href: "/zoiko-hr/ess",                   icon: LayoutDashboard },
          { label: "Profile",            href: "/zoiko-hr/ess/profile",           icon: User },
          { label: "Leave Management",   href: "/zoiko-hr/ess/leave",             icon: Calendar },
          { label: "Attendance",         href: "/zoiko-hr/ess/attendance",        icon: Clock },
          { label: "My Documents",       href: "/zoiko-hr/ess/my-documents",      icon: FileText },
          { label: "Learning",           href: "/zoiko-hr/ess/requests",          icon: BookOpen },
          { label: "Settings",           href: "/zoiko-hr/ess/settings",          icon: SlidersHorizontal },
        ]},
        { label: "Employee Documents", icon: FolderOpen, excludeRoles: [ROLES.ADMIN], children: [
          { label: "My Files",           href: "/zoiko-hr/ess/documents/my-files",        icon: FolderOpen },
          { label: "Payslips",           href: "/zoiko-hr/ess/documents/payslips",        icon: Receipt },
          { label: "Offer & Contracts",  href: "/zoiko-hr/ess/documents/contracts",       icon: FileSignature },
          { label: "Tax & Compliance",   href: "/zoiko-hr/ess/documents/tax",             icon: ShieldCheck },
          { label: "Upload Request",     href: "/zoiko-hr/ess/documents/upload-request",  icon: UploadCloud },
        ]},
        { label: "Travel",             icon: Plane, children: [
          { label: "Dashboard",          href: "/zoiko-hr/travel",                icon: LayoutDashboard },
          { label: "Travel Requests",    href: "/zoiko-hr/travel/requests",       icon: Plane },
          { label: "Approvals",          href: "/zoiko-hr/travel/approvals",      icon: ClipboardCheck },
          { label: "Expenses",           href: "/zoiko-hr/travel/expenses",       icon: Receipt },
          { label: "Settings",           href: "/zoiko-hr/travel/settings",       icon: SlidersHorizontal },
        ]},
        { label: "Workforce Planning", icon: Target, children: [
          { label: "Dashboard",             href: "/zoiko-hr/workforce-planning",       icon: LayoutDashboard },
          { label: "Plans",                 href: "/zoiko-hr/workforce-planning/plans",  icon: Target },
          { label: "Headcount",             href: "/zoiko-hr/workforce-planning/headcount", icon: Users },
          { label: "Succession",            href: "/zoiko-hr/workforce-planning/succession", icon: UserCheck },
          { label: "Reports",               href: "/zoiko-hr/workforce-planning/reports", icon: FileText },
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
        { label: "Learning",    href: "/employee/ess/requests",   icon: BookOpen },
        { label: "Settings",    href: "/employee/ess/settings",   icon: SlidersHorizontal },
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
        { label: "My Files",          href: "/employee/documents/my-files",       icon: FolderOpen },
        { label: "Payslips",          href: "/employee/documents/payslips",        icon: Receipt },
        { label: "Offer & Contracts", href: "/employee/documents/contracts",       icon: FileSignature },
        { label: "Tax & Compliance",  href: "/employee/documents/tax",             icon: ShieldCheck },
        { label: "Upload Request",    href: "/employee/documents/upload-request",  icon: UploadCloud },
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
  ],
};

// Administration
const settings = {
  title: "ADMINISTRATION",
  items: [
    { label: "User Management", href: "/organization-admin/users", icon: Users },
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
        { label: "Zoiko ID", href: "/shared/id", icon: User },
        { label: "Zoiko Workflow", href: "/shared/workflow", icon: Workflow },
        { label: "Zoiko Hub", href: "/shared/hub", icon: Layers },
        { label: "Zoiko Connect", href: "/shared/connect", icon: Globe },
        { label: "Documents", href: "/shared/documents", icon: FileText },
        { label: "Approvals", href: "/shared/approvals", icon: FileCheck2 },
        { label: "Expenses", href: "/shared/expenses", icon: WalletCards },
        { label: "AI Assistance", href: "/shared/ai-assistance", icon: Sparkles },
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
    { label: "Documents", href: "/zoiko-hr/documents", icon: FileText },
    { label: "Payroll Guidance", href: "/organization-admin/payroll-guidance", icon: BookOpen, badge: "Payroll" },
  ],
};

export const sections = [
  superAdminBilling,
  superAdminPlatform,
  superAdminProfile,
  organizationAdminDashboard,
  hrAdminDashboard,
  platform,
  products,
  // Employee-only workspace section (filtered to role=employee by useFilteredNavigation)
  employeeWorkspace,
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
