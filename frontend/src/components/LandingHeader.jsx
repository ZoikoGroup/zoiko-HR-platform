import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X, ChevronDown } from "lucide-react";
import logo from "../assets/logo.png";
import { useAuth } from "../context/AuthContext";

const productLinks = [
  { label: "Zoiko HR", href: "/products/zoiko-hr", desc: "People & lifecycle management", color: "#4F46E5" },
  { label: "ZoikoTime", href: "/products/zoikotime", desc: "Time, attendance & shifts", color: "#0891B2" },
  { label: "Zoiko Payroll", href: "/payroll", desc: "Pay runs & filings", color: "#059669" },
  { label: "Zoiko Billing", href: "/products/billing", desc: "Invoicing & collections", color: "#D97706" },
  { label: "Zoiko Comply", href: "/products/comply", desc: "Compliance & governance", color: "#DC2626" },
  { label: "Zoiko Insights", href: "/insights", desc: "Dashboards & analytics", color: "#7C3AED" },
  { label: "Zoiko Spend", href: "/products/spend", desc: "Procurement & spend management", color: "#0EA5E9" },
  { label: "Zoiko Projects", href: "/projects", desc: "Projects, tasks & delivery", color: "#6366F1" },
  { label: "Zoiko Inventory", href: "/inventory", desc: "Stock & asset tracking", color: "#84CC16" },
  { label: "Zoiko Docs Pro", href: "/zoiko-docs", desc: "Document management & collaboration", color: "#06B6D4" },
];

export default function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b border-gray-200 transition-all duration-300 rounded-b-xl ${
        scrolled ? "bg-white shadow-md" : "bg-white/95 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo */}
        <a href="https://zoikoone.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 shrink-0">
          <img src={logo} alt="Zoiko One" style={{ height: "40px", width: "auto", objectFit: "contain" }} />
        </a>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {/* Products dropdown */}
          <div className="relative group">
            <Link
              to="/products"
              className="flex items-center gap-1 px-3.5 py-2 text-sm font-medium text-gray-700 rounded-lg no-underline hover:bg-gray-100 transition-colors duration-200"
            >
              Products <ChevronDown size={14} className="mt-0.5 transition-transform duration-200 group-hover:rotate-180" />
            </Link>
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-[480px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-gray-200 p-4 mt-2 z-[100] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 before:content-[''] before:absolute before:top-[-8px] before:left-0 before:w-full before:h-[8px]">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3 pl-2">
                Zoiko One Products
              </p>
              <div className="grid grid-cols-2 gap-1">
                {productLinks.map((p) => (
                  <Link
                    key={p.href}
                    to={p.href}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-gray-50 transition-colors duration-150 no-underline"
                  >
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: p.color }} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 m-0">{p.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5 m-0">{p.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {[
{ label: "Solutions", href: "/solutions" },
            { label: "Platform", href: "/platform" },
            { label: "Pricing", href: "/#pricing" },
            { label: "Trust Center", href: "/trust-center" },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="px-3.5 py-2 text-sm font-medium text-gray-700 rounded-lg no-underline hover:bg-gray-100 transition-colors duration-200"
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTA buttons */}
        <div className="hidden lg:flex items-center gap-3">
          <Link
            to="/login"
            className="px-[18px] py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg bg-white no-underline hover:border-orange-500 hover:text-orange-500 transition-all duration-200"
          >
            {isAuthenticated ? "Dashboard" : "Sign In"}
          </Link>
          <Link
            to={isAuthenticated ? "/dashboard" : "/register"}
            className="px-5 py-2 text-sm font-semibold text-white no-underline rounded-lg transition-all duration-200 hover:shadow-[0_6px_20px_rgba(255,107,0,0.5)]"
            style={{
              background: "linear-gradient(135deg, #FF6B00, #FF8C38)",
              boxShadow: "0 4px 14px rgba(255,107,0,0.35)",
            }}
          >
            {isAuthenticated ? "Go to Dashboard" : "Get Started Free"}
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="lg:hidden p-2 rounded-lg border border-gray-200 bg-white cursor-pointer"
          onClick={() => setMobileOpen(v => !v)}
        >
          {mobileOpen ? <X size={20} color="#374151" /> : <Menu size={20} color="#374151" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex flex-col gap-2">
            <Link to="/products" onClick={() => setMobileOpen(false)}
              className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest no-underline hover:text-gray-600">Products</Link>
            {productLinks.map((p) => (
              <Link key={p.href} to={p.href} onClick={() => setMobileOpen(false)}
                className="text-sm text-gray-700 no-underline py-1.5">{p.label}</Link>
            ))}
            <div className="h-px bg-gray-200 my-2" />
            {[{ label: "Solutions", href: "/solutions" }, { label: "Platform", href: "/platform" }, { label: "Pricing", href: "/#pricing" }, { label: "Trust Center", href: "/trust-center" }].map(l => (
              <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)}
                className="text-sm text-gray-700 no-underline py-1.5">{l.label}</a>
            ))}
            <div className="h-px bg-gray-200 my-2" />
            <Link to="/login" onClick={() => setMobileOpen(false)}
              className="text-center py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 no-underline">
              Sign In
            </Link>
            <Link to="/register" onClick={() => setMobileOpen(false)}
              className="text-center py-2.5 rounded-lg text-sm font-semibold text-white no-underline"
              style={{ background: "linear-gradient(135deg, #FF6B00, #FF8C38)" }}>
              Get Started Free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
