// The assistant (and its plan/billing lookups) only exists for signed-in people.
// Keeping the lazy import behind this check means public pages do not download
// the assistant chunk or the billing service at all.
import { lazy, Suspense } from "react";
import { useAuth } from "../context/AuthContext";

const AssistantLauncher = lazy(() => import("../modules/shared-layers/assistant/AssistantLauncher"));

export default function AuthenticatedAssistant() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;
  return (
    <Suspense fallback={null}>
      <AssistantLauncher />
    </Suspense>
  );
}
