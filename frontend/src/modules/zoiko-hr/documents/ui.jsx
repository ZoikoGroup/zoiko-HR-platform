import { Building2, ClipboardCheck, FileCheck2, FileText, FolderOpen, LayoutDashboard, Receipt, ShieldCheck, Users } from "lucide-react";
import { ModuleLayout } from "../recruitment/ui";

const DOCUMENTS_NAV = [
  { label: "Dashboard", href: "/zoiko-hr/documents", icon: LayoutDashboard },
  { label: "Employee Documents", href: "/zoiko-hr/documents/employee-upload", icon: Users },
  { label: "Company Documents", href: "/zoiko-hr/documents/company-documents", icon: Building2 },
  { label: "Approval Workflow", href: "/zoiko-hr/documents/approvals", icon: ClipboardCheck },
  { label: "Governance", href: "/zoiko-hr/documents/governance", icon: ShieldCheck },
];

const PAGE_OF_TITLE = {
  "Documents Overview": "Dashboard",
  "Employee Documents": "Employee Documents",
  "Company Documents": "Company Documents",
  "Approval Workflow": "Approval Workflow",
  "Document governance": "Governance",
  Dashboard: "Dashboard",
};

const EMPLOYEE_DOCUMENTS_NAV = [
  { label: "Company Documents", href: "/employee/documents/company", icon: Building2 },
  { label: "Documents to Action", href: "/employee/documents/to-action", icon: ClipboardCheck },
  { label: "Company Policies", href: "/employee/documents/policies", icon: FileText },
  { label: "Awaiting My Signature", href: "/employee/documents/signatory-queue", icon: FileCheck2 },
  { label: "My Files", href: "/employee/documents/my-files", icon: FolderOpen },
  { label: "Payslips", href: "/employee/documents/payslips", icon: Receipt },
  { label: "Offer & Contracts", href: "/employee/documents/contracts", icon: FileCheck2 },
  { label: "Tax & Compliance", href: "/employee/documents/tax", icon: ShieldCheck },
];

const EMPLOYEE_PAGE_OF_TITLE = {
  "Company documents": "Company Documents",
  "Documents to action": "Documents to Action",
  "Company policies": "Company Policies",
  "Signatory queue": "Awaiting My Signature",
  "My Files": "My Files",
  "My Payslips": "Payslips",
  "Offer & Contracts": "Offer & Contracts",
  "Tax & Compliance": "Tax & Compliance",
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

export function EmployeeDocumentsLayout({ title, subtitle, actions, children }) {
  return (
    <ModuleLayout
      module="Documents"
      items={EMPLOYEE_DOCUMENTS_NAV}
      pageOfTitle={EMPLOYEE_PAGE_OF_TITLE}
      title={title}
      subtitle={subtitle}
      actions={actions}
    >
      {children}
    </ModuleLayout>
  );
}
