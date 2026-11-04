import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, Suspense } from "react";
import { lazyRoute } from "./lib/lazyRoute";
import LoginPage from "./pages/auth/LoginPage";
import AuthenticatedAssistant from "./components/AuthenticatedAssistant";

// Public routes only. Everything behind sign-in lives in ./routes/PortalApp,
// which is fetched the first time the router reaches a portal URL. A visitor
// who only reads the marketing pages or signs in never downloads the portal's
// route table, navigation tree, icon set or billing code.
// LoginPage is eager on purpose: "/" redirects to /login, so it is the first
// paint for every visitor. Loading its ~4 kB with the entry removes a
// dynamic-import round trip ahead of the hero LCP image.
const ForgotPasswordPage = lazyRoute(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazyRoute(() => import("./pages/auth/ResetPasswordPage"));
const OnboardingPortalPage = lazyRoute(() => import("./pages/OnboardingPortalPage"));
const TermsPage = lazyRoute(() => import("./pages/legal/TermsPage"));
const HrProductsPage = lazyRoute(() => import("./pages/public/HrProductsPage"));
const RequestPricingPage = lazyRoute(() => import("./pages/public/RequestPricingPage"));
const BookDemoPage = lazyRoute(() => import("./pages/public/BookDemoPage"));
const VerifyEmailPage = lazyRoute(() => import("./pages/auth/VerifyEmailPage"));
const QuotationDecisionPage = lazyRoute(() => import("./pages/auth/QuotationDecisionPage"));
const ChangePasswordPage = lazyRoute(() => import("./pages/auth/ChangePasswordPage"));
const RegisterPage = lazyRoute(() => import("./pages/auth/RegisterPage"));
const RegistrationSuccessPage = lazyRoute(() => import("./pages/auth/RegistrationSuccessPage"));
const ContactPage = lazyRoute(() => import("./pages/public/ContactPage"));
const CandidateSignPage = lazyRoute(() => import("./pages/public/CandidateSignPage.jsx"));
const VerifyDocumentPage = lazyRoute(() => import("./pages/public/VerifyDocumentPage.jsx"));

const PortalApp = lazyRoute(() => import("./routes/PortalApp"));

function ModuleSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3B82F6]" />
    </div>
  );
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<ModuleSpinner />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/onboarding-portal/:token" element={<OnboardingPortalPage />} />
        {/* Candidate e-signature (single-use link) and public document verification: no app shell, no sign-in. */}
        <Route path="/sign/:token" element={<CandidateSignPage />} />
        <Route path="/verify/:documentNumber" element={<VerifyDocumentPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/hr-products" element={<HrProductsPage />} />
        <Route path="/request-pricing" element={<RequestPricingPage />} />
        <Route path="/book-demo" element={<BookDemoPage />} />
        <Route path="/get-demo" element={<Navigate to="/book-demo" replace />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/quotation/decide" element={<QuotationDecisionPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register/success" element={<RegistrationSuccessPage />} />
        <Route path="/contact" element={<ContactPage />} />
        {/* Platform Settings page was removed (ZHR-18): keep old bookmarks working. */}
        <Route path="/super-admin/settings" element={<Navigate to="/super-admin/dashboard" replace />} />

        {/* Signed-in portal. Loaded on demand so public visitors never pay for it. */}
        <Route path="*" element={<PortalApp />} />
      </Routes>
      </Suspense>
      <AuthenticatedAssistant />
    </>
  );
}
