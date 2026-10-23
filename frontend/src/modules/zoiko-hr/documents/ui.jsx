import { Building2, ClipboardCheck, FileText, LayoutDashboard, Users } from "lucide-react";
import { ModuleLayout } from "../recruitment/ui";

const DOCUMENTS_NAV = [
  { label: "Dashboard", href: "/zoiko-hr/documents", icon: LayoutDashboard },
  { label: "Employee Documents", href: "/zoiko-hr/documents/employee-upload", icon: Users },
  { label: "Company Documents", href: "/zoiko-hr/documents/company-documents", icon: Building2 },
  { label: "Approval Workflow", href: "/zoiko-hr/documents/approvals", icon: ClipboardCheck },
];

const PAGE_OF_TITLE = {
  "Employee Documents": "Employee Documents",
  "Company Documents": "Company Documents",
  "Approval Workflow": "Approval Workflow",
};

export function OrganizationDocumentsLayout({ title, subtitle, actions, children }) {
  return (
    <ModuleLayout
      module="Documents"
      items={DOCUMENTS_NAV}
      pageOfTitle={PAGE_OF_TITLE}
      title={title}
      subtitle={subtitle}
      actions={actions}
    >
      {children}
    </ModuleLayout>
  );
}
