import { Building2, ClipboardCheck, LayoutDashboard } from "lucide-react";
import { ModuleLayout } from "../zoiko-hr/recruitment/ui";

export const HR_ADMIN_NAV = [
  { label: "Dashboard", href: "/hr-admin/dashboard", icon: LayoutDashboard },
  { label: "My Organization", href: "/hr-admin/my-organization", icon: Building2 },
  { label: "Documents", href: "/hr-admin/documents", icon: ClipboardCheck },
];

const PAGE_OF_TITLE = { "HR Admin Dashboard": "Dashboard" };

export function HrAdminLayout(props) {
  return <ModuleLayout module="HR Admin" items={HR_ADMIN_NAV} pageOfTitle={PAGE_OF_TITLE} {...props} />;
}
