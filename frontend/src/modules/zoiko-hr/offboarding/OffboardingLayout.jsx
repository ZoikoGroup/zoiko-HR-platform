/* Offboarding module shell: the same navy header and section tabs as Recruitment and Onboarding (recruitment/ui.jsx). */
import { ClipboardCheck, FileSignature, LayoutDashboard, MessageSquareText, Package, SlidersHorizontal, UserMinus,
  Users, WalletCards } from "lucide-react";
import { ModuleLayout } from "../recruitment/ui";

export const OFFBOARDING_NAV = [
  { label: "Dashboard", href: "/zoiko-hr/offboarding", icon: LayoutDashboard },
  { label: "Exit Cases", href: "/zoiko-hr/offboarding/cases", icon: Users },
  { label: "New Exit", href: "/zoiko-hr/offboarding/new", icon: UserMinus },
  { label: "Resignations", href: "/zoiko-hr/offboarding/resignations", icon: FileSignature },
  { label: "Clearance Board", href: "/zoiko-hr/offboarding/clearance", icon: ClipboardCheck },
  { label: "Asset Recovery", href: "/zoiko-hr/offboarding/assets", icon: Package },
  { label: "Settlements", href: "/zoiko-hr/offboarding/settlements", icon: WalletCards },
  { label: "Exit Interviews", href: "/zoiko-hr/offboarding/interviews", icon: MessageSquareText },
  { label: "Settings", href: "/zoiko-hr/offboarding/settings", icon: SlidersHorizontal },
];

const PAGE_OF_TITLE = { "Offboarding Dashboard": "Dashboard", "Exit Case": "Exit Cases", "Offboarding Settings": "Settings" };

export default function OffboardingLayout({ counts = {}, ...props }) {
  const items = OFFBOARDING_NAV.map((i) => ({ ...i, count: counts[i.label] || 0 }));
  return <ModuleLayout module="Offboarding" items={items} pageOfTitle={PAGE_OF_TITLE} {...props} />;
}
