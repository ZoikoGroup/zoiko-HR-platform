/**
 * components/HomeRedirect.jsx
 * ---------------------------
 * The "/" route (B14). A signed-in person goes to their role's dashboard; everyone else to /login.
 */
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function HomeRedirect() {
  const { isAuthenticated, loading, getFirstAccessibleRoute, defaultRedirect } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3B82F6]" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const target = getFirstAccessibleRoute?.() || defaultRedirect;
  return <Navigate to={target && target !== "/" ? target : "/login"} replace />;
}
