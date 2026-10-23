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
  "Employee Self Service": "Overview",
  "My Attendance": "Overview",
  "Time requests": "Overview",
  "My compensation": "Compensation",
  "My performance": "Performance",
};

/** Shared employee workspace frame for profile, ESS, leave, learning, travel and compensation pages. */
export default function EmployeePageShell({ title, subtitle, actions, children, variant = "banner" }) {
  return (
    <ModuleLayout
      module="My Workspace"
      items={EMPLOYEE_WORKSPACE_NAV}
      pageOfTitle={PAGE_OF_TITLE}
      title={title}
      subtitle={subtitle}
      actions={actions}
      variant={variant === "plain" ? "plain" : "default"}
    >
      {children}
    </ModuleLayout>
  );
}
