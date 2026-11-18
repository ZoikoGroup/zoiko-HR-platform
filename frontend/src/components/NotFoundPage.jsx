// A signed-in person who reaches an address the portal does not have (a mistyped or outdated link) sees this page with a
// way back, instead of being sent to the login screen as if their session had ended (QA report #13, BUG-6).
// Signed-out visitors never get here: AppLayout's ProtectedRoute sends them to /login first.
import { Link, useLocation } from "react-router-dom";
import { Compass } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function NotFoundPage() {
  const { pathname } = useLocation();
  const { defaultRedirect } = useAuth();
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Compass className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 break-words text-sm text-slate-600">
          There is no page at <span className="font-medium text-slate-800">{pathname}</span>. The link may be mistyped or out of date.
        </p>
        <Link to={defaultRedirect || "/"} replace
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200">
          Go to your home page
        </Link>
      </div>
    </div>
  );
}
