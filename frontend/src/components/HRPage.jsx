import { ModuleLayout } from "../modules/zoiko-hr/recruitment/ui";
import OnboardingLayout from "../modules/zoiko-hr/onboarding/OnboardingLayout";
import { OrganizationDocumentsLayout } from "../modules/zoiko-hr/documents/ui";

function getModuleName(pathname) {
  if (pathname.startsWith("/zoiko-hr/performance")) return "Performance";
  if (pathname.startsWith("/zoiko-hr/attendance")) return "Attendance";
  if (pathname.startsWith("/zoiko-hr/compensation")) return "Compensation";
  if (pathname.startsWith("/zoiko-hr/workforce-planning")) return "Workforce Planning";
  if (pathname.startsWith("/zoiko-hr/leave")) return "Leave";
  if (pathname.startsWith("/zoiko-hr/learning")) return "Learning";
  if (pathname.startsWith("/zoiko-hr/travel")) return "Travel";
  if (pathname.startsWith("/zoiko-hr/departments")) return "Departments";
  if (pathname.startsWith("/zoiko-hr/designations")) return "Designations";
  if (pathname.startsWith("/zoiko-hr/employee-changes")) return "Employee Changes";
  if (pathname.startsWith("/zoiko-hr/helpdesk")) return "Helpdesk";
  if (pathname.startsWith("/zoiko-hr/compliance")) return "Compliance";
  return "Zoiko HR";
}

/**
 * Shared page frame for Zoiko HR modules. Module-specific tabs remain with their pages,
 * while the title, breadcrumb, actions, background, and content width stay consistent.
 */
export default function HRPage({ title, subtitle, children, actions }) {
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;
  const isOnboarding = /onboarding|new hires|orientation sessions/i.test(title || "");
  const isDocuments = pathname.startsWith("/zoiko-hr/documents");

  if (isDocuments) {
    return (
      <OrganizationDocumentsLayout title={title} subtitle={subtitle} actions={actions}>
        {children}
      </OrganizationDocumentsLayout>
    );
  }

  if (isOnboarding) {
    return <OnboardingLayout title={title} subtitle={subtitle} actions={actions}>{children}</OnboardingLayout>;
  }

  return (
    <ModuleLayout
      module={getModuleName(pathname)}
      items={[]}
      title={title}
      subtitle={subtitle}
      actions={actions}
    >
      {children}
    </ModuleLayout>
  );
}
