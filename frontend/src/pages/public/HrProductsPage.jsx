import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Users, CalendarCheck, FileSignature, ArrowRight, Check, ShieldCheck, Network, Building2, UserPlus, FolderOpen, BarChart3,
  Clock, Layers, Globe2, FileCheck2, History, LayoutTemplate, PenLine, Bot, Lock,
} from "lucide-react";
import PlanComparison from "../../components/PlanComparison";
import logo from "../../assets/zoikohr-logo-svg.svg";

// What each product does and which self-serve plan carries it. Capabilities mirror config/planMatrix.js (the commercial matrix).
const PRODUCTS = [
  {
    id: "core-hr",
    icon: Users,
    tone: { chip: "bg-blue-50 text-blue-700", icon: "bg-blue-600", ring: "ring-blue-200", text: "text-blue-600" },
    name: "Core HR",
    tag: "The people system of record",
    summary: "One trusted home for every worker: records, teams, locations and the full history of every change, with self-service for employees and managers.",
    plan: "Included in Core and Advanced",
    features: [
      { icon: Users, title: "Employee records & history", text: "Profiles, job details, documents and a dated history of every change." },
      { icon: Network, title: "Directory & org chart", text: "Find anyone and see who reports to whom, across departments and teams." },
      { icon: Building2, title: "Locations, departments & teams", text: "Model how your organization is really structured." },
      { icon: UserPlus, title: "Onboarding & offboarding", text: "Standard onboarding plans on Core; custom, reusable plans and automation on Advanced." },
      { icon: Layers, title: "Employee & manager self-service", text: "People update their own details and managers act on their team, on desktop or mobile." },
      { icon: BarChart3, title: "Dashboards & HR reports", text: "Standard reports and CSV / Excel export; custom report builder on Advanced." },
    ],
    advanced: ["Multiple legal entities (Core: 1)", "Position management", "Expanded custom HR fields", "Performance reviews, goals & 1:1s"],
  },
  {
    id: "leave",
    icon: CalendarCheck,
    tone: { chip: "bg-emerald-50 text-emerald-700", icon: "bg-emerald-600", ring: "ring-emerald-200", text: "text-emerald-600" },
    name: "Leave Management",
    tag: "Time off, handled properly",
    summary: "Employees ask, managers decide, balances stay right. Every request, decision and balance change is recorded.",
    plan: "Included in Core and Advanced",
    features: [
      { icon: CalendarCheck, title: "Requests & approvals", text: "Apply for leave in a few clicks; the right approver is asked and the decision is shown back." },
      { icon: Clock, title: "Live balances", text: "Remaining, used and pending days per leave type, always up to date." },
      { icon: Globe2, title: "Calendars & holidays", text: "Team leave and public holidays on one calendar so clashes are seen early." },
      { icon: History, title: "Full leave history", text: "Every request with who decided it and when, for employees and HR." },
      { icon: ShieldCheck, title: "Policies that apply by themselves", text: "Standard policies on Core; the rules your people actually work under." },
      { icon: Layers, title: "Attendance alongside", text: "Attendance records and holidays live next to leave, so records agree." },
    ],
    advanced: ["Advanced leave policies", "Complex accrual & carry-over rules", "Multi-country leave configuration", "Custom, conditional, multi-step approvals"],
  },
  {
    id: "docs-pro",
    icon: FileSignature,
    tone: { chip: "bg-indigo-50 text-indigo-700", icon: "bg-indigo-600", ring: "ring-indigo-200", text: "text-indigo-600" },
    name: "Zoiko Docs Pro",
    tag: "The document layer (premium capability)",
    summary: "Create, share and keep HR documents under control: employee files, policies people must acknowledge, and a trail of who saw and signed what.",
    plan: "Documents and policy acknowledgments are in every plan; document workflows and e-sign orchestration are Advanced, where enabled",
    features: [
      { icon: FolderOpen, title: "Employee files", text: "Contracts, IDs and certificates stored against the right person, with controlled access." },
      { icon: FileCheck2, title: "Policy acknowledgments", text: "Send a policy, see who has read and accepted it, and chase the rest." },
      { icon: LayoutTemplate, title: "Template library", text: "Reusable letters and forms so documents come out consistent." },
      { icon: PenLine, title: "e-Signatures", text: "Orchestrate signing for the documents that need it, where enabled for your account." },
      { icon: History, title: "Version control", text: "Keep the history of a document as it changes." },
      { icon: Lock, title: "Audit trail", text: "A record of who opened, changed or signed each document." },
    ],
    advanced: ["Bulk document distribution", "Document workflows & e-sign orchestration (where enabled)", "Policy & document Q&A with the AI assistant"],
  },
];

const TRUST = [
  { icon: ShieldCheck, title: "Role-based access", text: "People see only what their role allows." },
  { icon: Lock, title: "MFA & tenant isolation", text: "Included on every plan." },
  { icon: History, title: "Auditable lifecycle", text: "Changes are recorded with who and when." },
  { icon: Bot, title: "Built-in assistant", text: "Product help and policy Q&A inside the app." },
];

export default function HrProductsPage() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo(0, 0);
  }, [hash]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/login" aria-label="Zoiko HR, sign in"><img src={logo} alt="Zoiko HR" className="h-8" /></Link>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-semibold text-slate-700 hover:text-blue-700 px-3 py-2">Sign in</Link>
            <Link to="/register" className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl px-4 py-2 shadow-sm">Start free evaluation</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0A192F] via-[#0F2942] to-[#1E3A8A] text-white">
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-100 text-xs font-semibold tracking-wide">HR PRODUCTS</p>
          <h1 className="mt-5 text-4xl md:text-5xl font-extrabold tracking-tight max-w-3xl leading-tight">
            Core HR, Leave Management and Docs Pro, on one connected platform.
          </h1>
          <p className="mt-5 text-lg text-slate-300 max-w-2xl leading-relaxed">
            Keep people records, time off and HR documents in one place, with the access controls and audit trail a growing organization needs.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold shadow-lg shadow-blue-600/30">Start free evaluation <ArrowRight className="w-4 h-4" /></Link>
            <Link to="/login" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 font-semibold">Sign in</Link>
          </div>
          <nav aria-label="Products on this page" className="mt-10 flex flex-wrap gap-2.5">
            {PRODUCTS.map((p) => (
              <a key={p.id} href={`#${p.id}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-sm font-semibold">
                <p.icon className="w-4 h-4" /> {p.name}
              </a>
            ))}
          </nav>
        </div>
        <div className="absolute -right-16 -bottom-28 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/3 w-64 h-64 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
      </section>

      {/* Trust strip */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-20">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {TRUST.map((t) => (
            <div key={t.title} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600 shrink-0"><t.icon className="w-5 h-5" /></div>
              <div><p className="text-sm font-bold text-slate-900">{t.title}</p><p className="text-xs text-slate-500 mt-0.5">{t.text}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* Products */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
        {PRODUCTS.map((p, idx) => (
          <section key={p.id} id={p.id} aria-labelledby={`${p.id}-h`} className="scroll-mt-24">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-2xl text-white flex items-center justify-center shadow-md shrink-0 ${p.tone.icon}`}><p.icon className="w-7 h-7" /></div>
                <div>
                  <p className={`text-xs font-bold tracking-widest uppercase ${p.tone.text}`}>{String(idx + 1).padStart(2, "0")} · {p.tag}</p>
                  <h2 id={`${p.id}-h`} className="text-3xl font-extrabold tracking-tight text-slate-900 mt-1">{p.name}</h2>
                  <p className="text-slate-600 mt-2 max-w-2xl leading-relaxed">{p.summary}</p>
                </div>
              </div>
              <span className={`self-start md:self-end text-xs font-semibold px-3 py-1.5 rounded-full max-w-sm ${p.tone.chip}`}>{p.plan}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {p.features.map((f) => (
                <div key={f.title} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${p.tone.chip}`}><f.icon className="w-5 h-5" /></div>
                  <h3 className="font-bold text-slate-900">{f.title}</h3>
                  <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{f.text}</p>
                </div>
              ))}
            </div>

            <div className={`mt-4 rounded-2xl bg-white border border-slate-200 p-5 ring-1 ${p.tone.ring}`}>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Adds on the Advanced plan</p>
              <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
                {p.advanced.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-sm text-slate-700"><Check className={`w-4 h-4 mt-0.5 shrink-0 ${p.tone.text}`} /> {a}</li>
                ))}
              </ul>
            </div>
          </section>
        ))}

        {/* Plans */}
        <section aria-labelledby="plans-h" className="scroll-mt-24">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <p className="text-xs font-bold tracking-widest uppercase text-blue-600">Plans</p>
            <h2 id="plans-h" className="text-3xl font-extrabold tracking-tight text-slate-900 mt-1">Which plan includes what</h2>
            <p className="text-slate-600 mt-2">Start on Core and move to Advanced when you need more. Enterprise adds contract-grade security, identity provisioning, sandbox environments and an SLA, priced by contract.</p>
          </div>
          <PlanComparison />
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0A192F] via-[#0F2942] to-[#1E3A8A] text-white p-10 md:p-14 text-center">
          <h2 className="relative z-10 text-3xl font-extrabold tracking-tight">Try it with your own team</h2>
          <p className="relative z-10 text-slate-300 mt-3 max-w-xl mx-auto">Start a free evaluation, no card needed, then pick a plan when you are ready.</p>
          <div className="relative z-10 mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold shadow-lg shadow-blue-600/30">Start free evaluation <ArrowRight className="w-4 h-4" /></Link>
            <Link to="/login" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 font-semibold">I already have an account</Link>
          </div>
          <div className="absolute -left-10 -bottom-24 w-72 h-72 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Zoiko Group. All rights reserved.</span>
          <Link to="/terms" className="font-semibold text-blue-600 hover:underline">Terms &amp; Conditions</Link>
        </div>
      </footer>
    </div>
  );
}
