import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileText,
  LayoutDashboard,
  Plane,
  Target,
  UserRound,
  WalletCards,
} from "lucide-react";
import { ModuleLayout } from "../../modules/zoiko-hr/recruitment/ui";

const EMPLOYEE_WORKSPACE_NAV = [
  { label: "Overview", href: "/employee/ess", icon: LayoutDashboard },
  { label: "Profile", href: "/employee/profile", icon: UserRound },
  { label: "Attendance", href: "/employee/ess/attendance", icon: Clock3 },
  { label: "Time requests", href: "/employee/ess/time-requests", icon: ClipboardCheck },
  { label: "Learning", href: "/employee/learning", icon: BookOpen },
  { label: "Leave", href: "/employee/leaves", icon: CalendarDays },
  { label: "Documents", href: "/employee/documents/company", icon: FileText },
  { label: "Travel", href: "/employee/travel", icon: Plane },
  { label: "Compensation", href: "/employee/compensation", icon: WalletCards },
  { label: "Performance", href: "/employee/performance", icon: Target },
];

const PAGE_OF_TITLE = {
  "Overview": "Overview",
  "Employee Self Service": "Overview",
  "Employee Profile": "Profile",
  "Profile": "Profile",
  "My Attendance": "Attendance",
  "Attendance": "Attendance",
  "Time requests": "Time requests",
  "Learning": "Learning",
  "Leave": "Leave",
  "My Leave": "Leave",
  "Documents": "Documents",
  "Travel": "Travel",
  "My compensation": "Compensation",
  "Compensation": "Compensation",
  "My performance": "Performance",
  "Performance": "Performance",
  "Settings": "Overview",
};

/** Shared employee workspace frame for profile, ESS, leave, learning, travel and compensation pages. */
export default function EmployeePageShell({
  title,
  breadcrumbTitle,
  subtitle,
  actions,
  children,
  variant = "banner",
  excludeNav = [],
}) {
  const items = excludeNav.length
    ? EMPLOYEE_WORKSPACE_NAV.filter((i) => !excludeNav.includes(i.label))
    : EMPLOYEE_WORKSPACE_NAV;
  return (
    <ModuleLayout
      module="My Workspace"
      items={items}
      pageOfTitle={PAGE_OF_TITLE}
      title={title}
      breadcrumbTitle={breadcrumbTitle}
      subtitle={subtitle}
      actions={actions}
      variant={variant === "plain" ? "plain" : "default"}
    >
      {children}
    </ModuleLayout>
  );
}
