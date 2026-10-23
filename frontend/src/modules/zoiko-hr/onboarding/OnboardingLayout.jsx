/* Onboarding module shell: the same navy header and section tabs as Recruitment (recruitment/ui.jsx ModuleLayout). */
import { BarChart3, CalendarCheck, ClipboardCheck, FileText, LayoutDashboard, SlidersHorizontal, UserPlus, Users, WalletCards } from "lucide-react";
import { ModuleLayout } from "../recruitment/ui";

export const ONBOARDING_NAV = [
  { label: "Dashboard", href: "/zoiko-hr/onboarding", icon: LayoutDashboard },
  { label: "New Hires", href: "/zoiko-hr/onboarding/new-hires", icon: UserPlus },
  { label: "Pre-Onboarding", href: "/zoiko-hr/onboarding/pre-onboarding", icon: CalendarCheck },
  { label: "Documents", href: "/zoiko-hr/onboarding/documents", icon: FileText },
  { label: "Checklists", href: "/zoiko-hr/onboarding/checklists", icon: ClipboardCheck },
  { label: "Orientation", href: "/zoiko-hr/onboarding/orientation", icon: Users },
  { label: "Reports", href: "/zoiko-hr/onboarding/reports", icon: BarChart3 },
  { label: "Payroll Verification", href: "/zoiko-hr/onboarding/payroll-verifications", icon: WalletCards },
  { label: "Settings", href: "/zoiko-hr/onboarding/settings", icon: SlidersHorizontal },
];

// headings that belong to a tab with a different label
const PAGE_OF_TITLE = { "Onboarding Dashboard": "Dashboard", "Onboarding Documents": "Documents", "Onboarding Checklists": "Checklists",
  "Onboarding Reports": "Reports", "Onboarding Settings": "Settings", "Orientation Sessions": "Orientation", "Payroll Verifications": "Payroll Verification" };

export default function OnboardingLayout(props) {
  return <ModuleLayout module="Onboarding" items={ONBOARDING_NAV} pageOfTitle={PAGE_OF_TITLE} {...props} />;
}
