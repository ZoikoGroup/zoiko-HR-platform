// The portal shell, rendered ONCE per session: sidebar and header stay mounted while pages change inside <Outlet />.
//
//   <Route element={<AppLayout />}>                       signed-in gate + shell + local Suspense
//     <Route path="/x" element={<RouteBoundary><ProtectedRoute allowedRoles={...}>{page}</ProtectedRoute></RouteBoundary>} />
//   </Route>
//
// * A page's code loading shows a skeleton in the content area only; the sidebar and header never disappear.
// * Each page keeps its own error boundary, reset on every navigation, so one broken page never takes down the shell
//   and does not stay broken after the user moves on.
// * Who may see what is unchanged: ProtectedRoute still decides sign-in, forced password change and role access, both
//   here (nobody gets a shell without a session) and per page (allowedRoles).
import { lazy, Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import ErrorBoundary from "./ErrorBoundary";
import ProtectedRoute from "./ProtectedRoute";
import PageFallback from "./PageFallback";

// Loaded once: the layout stays mounted across navigations, so this never suspends again after the first time.
const SuperAdminShell = lazy(() => import("./SuperAdminShell"));

/** An error boundary for one page that clears itself when the route changes. */
export function RouteBoundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary inline resetKey={pathname}>{children}</ErrorBoundary>;
}

export default function AppLayout() {
  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <SuperAdminShell>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </SuperAdminShell>
      </Suspense>
    </ProtectedRoute>
  );
}
