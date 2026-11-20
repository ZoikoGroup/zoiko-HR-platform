import { Building2, ClipboardCheck, FileCheck2, FileText, FolderOpen, LayoutDashboard, Receipt, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { ModuleLayout } from "../recruitment/ui";
// Namespace imports: a page test that mocks these services with only the calls it needs still renders the layout.
import * as apiModule from "../../../service/api";
import * as documentsService from "../../../service/documentsService";

const DOCUMENTS_NAV = [
  { label: "Dashboard", href: "/zoiko-hr/documents", icon: LayoutDashboard },
  { label: "Employee Documents", href: "/zoiko-hr/documents/employees", icon: Users },
  { label: "Company Documents", href: "/zoiko-hr/documents/company-documents", icon: Building2 },
  { label: "Approval Workflow", href: "/zoiko-hr/documents/approvals", icon: ClipboardCheck },
];

const PAGE_OF_TITLE = {
  "Documents Overview": "Dashboard",
  "Employee Documents": "Employee Documents",
  "Company Documents": "Company Documents",
  "Approval Workflow": "Approval Workflow",
  "Document governance": "Governance",
  Dashboard: "Dashboard",
};

// `countKey` names the /hr/me/documents/counts figure shown as the tab's badge. The signatory tab is shown only to people who
// are authorised signatories (its count is null for everyone else).
const EMPLOYEE_DOCUMENTS_NAV = [
  { label: "Company Documents", href: "/employee/documents/company", icon: Building2, countKey: "company_needs_ack" },
  { label: "Documents to Action", href: "/employee/documents/to-action", icon: ClipboardCheck, countKey: "to_action" },
  { label: "Company Policies", href: "/employee/documents/policies", icon: FileText, countKey: "policies_pending" },
  { label: "Awaiting My Signature", href: "/employee/documents/signatory-queue", icon: FileCheck2, countKey: "signatory_queue", signatoryOnly: true },
  { label: "My Files", href: "/employee/documents/my-files", icon: FolderOpen, countKey: "my_files_attention" },
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

let lastCounts = null;                                  // shared across tab switches so badges don't flicker

/** The badge numbers for the employee Documents tabs; refreshed after any change the person makes. */
export function useMyDocumentCounts() {
  const [counts, setCounts] = useState(lastCounts);
  useEffect(() => {
    if (!apiModule.getAccessToken?.() || !documentsService.getMyDocumentCounts) return undefined;   // signed out / test render
    let alive = true;
    const event = apiModule.MUTATION_EVENT || "zoiko-api-mutation";
    const load = () => documentsService.getMyDocumentCounts()
      .then((c) => { lastCounts = c; if (alive) setCounts(c); })
      .catch(() => { /* badges are a convenience: the tabs work without them */ });
    load();
    window.addEventListener(event, load);
    return () => { alive = false; window.removeEventListener(event, load); };
  }, []);
  return counts;
}

export function employeeDocumentTabs(counts) {
  return EMPLOYEE_DOCUMENTS_NAV
    .filter((item) => !item.signatoryOnly || !counts || counts[item.countKey] !== null)
    .map((item) => ({ ...item, count: counts && item.countKey ? counts[item.countKey] || 0 : 0 }));
}

export function EmployeeDocumentsLayout({ title, subtitle, actions, children }) {
  const counts = useMyDocumentCounts();
  return (
    <ModuleLayout
      module="Documents"
      items={employeeDocumentTabs(counts)}
      pageOfTitle={EMPLOYEE_PAGE_OF_TITLE}
      title={title}
      subtitle={subtitle}
      actions={actions}
    >
      {children}
    </ModuleLayout>
  );
}
