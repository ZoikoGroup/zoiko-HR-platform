import { ModuleLayout } from "../modules/zoiko-hr/recruitment/ui";
import OnboardingLayout from "../modules/zoiko-hr/onboarding/OnboardingLayout";
import { OrganizationDocumentsLayout } from "../modules/zoiko-hr/documents/ui";

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
    <ModuleLayout module="Zoiko HR" items={[]} title={title} subtitle={subtitle} actions={actions}>
      {children}
    </ModuleLayout>
  );
}
