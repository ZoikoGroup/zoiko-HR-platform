import { ArrowRight, Users, Clock, DollarSign, FileText, Briefcase, CheckSquare, BarChart3, Sparkles, CreditCard, Package, FileSignature } from "lucide-react";
import { useNavigate } from "react-router-dom";

const products = [
  {
    name: "Zoiko HR",
    tag: "PEOPLE SYSTEM OF RECORD",
    icon: Users,
    accent: "#4F46E5",
    tileBg: "#4338CA",
    items: ["Employee records", "Onboarding & offboarding", "Leave & lifecycle", "Worker documents", "Data controls"],
    cta: "Explore Zoiko HR",
  },
  {
    name: "ZoikoTime",
    tag: "EVIDENCE LAYER",
    icon: Clock,
    accent: "#4F46E5",
    tileBg: "#7C3AED",
    items: ["Time & attendance", "Shifts & scheduling", "Timesheets", "Approvals", "Billable work"],
    cta: "Explore ZoikoTime",
  },
  {
    name: "Zoiko Payroll",
    tag: "CONTROLLED PAY OUTCOMES",
    icon: DollarSign,
    accent: "#F97316",
    tileBg: "#F97316",
    items: ["Pay runs & payslips", "Deductions", "Approvals & corrections", "Filings", "Payroll reporting"],
    cta: "Explore Zoiko Payroll",
  },
  {
    name: "Zoiko Billing",
    tag: "REVENUE & CASH",
    icon: FileText,
    accent: "#3B82F6",
    tileBg: "#38BDF8",
    items: ["Invoices", "Recurring & usage billing", "Collections", "Client accounts", "Revenue dashboards"],
    cta: "Explore Zoiko Billing",
  },
  {
    name: "Zoiko Projects",
    tag: "WORK MANAGEMENT",
    icon: Briefcase,
    accent: "#4F46E5",
    tileBg: "#4F46E5",
    items: ["Projects & tasks", "Milestones & budgets", "Resource allocation", "Utilization", "Delivery visibility"],
    cta: "Explore Zoiko Projects",
  },
  {
    name: "Zoiko Comply",
    tag: "GOVERNANCE LAYER",
    icon: CheckSquare,
    accent: "#4F46E5",
    tileBg: "#1E1B4B",
    items: ["Compliance calendars", "Obligation tracking", "Evidence packs", "Audit logs", "Governance workflows"],
    cta: "Explore Zoiko Comply",
  },
  {
    name: "Zoiko Insights",
    tag: "INTELLIGENCE LAYER",
    icon: BarChart3,
    accent: "#F97316",
    tileBg: "#F97316",
    items: ["Dashboards", "Forecasting", "Utilization & risk", "Performance analytics", "Operational intelligence"],
    cta: "Explore Zoiko Insights",
  },
  {
    name: "Zoiko Spend",
    tag: "EXPENSE MANAGEMENT",
    icon: CreditCard,
    accent: "#0EA5E9",
    tileBg: "#0EA5E9",
    items: ["Expense claims", "Spend approvals", "Budget tracking", "Receipt capture", "Policy enforcement"],
    cta: "Explore Zoiko Spend",
  },
  {
    name: "Zoiko Inventory",
    tag: "STOCK & ASSETS",
    icon: Package,
    accent: "#10B981",
    tileBg: "#10B981",
    items: ["Stock tracking", "Asset registers", "Reorder workflows", "Supplier management", "Inventory reporting"],
    cta: "Explore Zoiko Inventory",
  },
  {
    name: "Zoiko Docs Pro",
    tag: "DOCUMENT LAYER",
    icon: FileSignature,
    accent: "#8B5CF6",
    tileBg: "#8B5CF6",
    items: ["Document generation", "e-Signatures", "Template library", "Version control", "Audit trail"],
    cta: "Explore Zoiko Docs Pro",
  },
];

export default function ProductGrid() {
  const navigate = useNavigate();
  return (
    <section id="products" className="bg-[#F8F7FC] py-20 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <p className="text-xs font-bold text-[#F97316] tracking-[0.15em] uppercase mb-4">
            10 Core Products
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] leading-tight tracking-tight mb-4">
            Start with one product. Expand
            <br />
            into the platform when you're ready.
          </h2>
          <p className="text-[#6B7280] max-w-xl mx-auto leading-relaxed">
            10 high-demand business operations products on one connected spine — buy one,
            several, or the full enterprise deployment.
          </p>
        </div>

        {/* Row 1 */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {products.slice(0, 4).map((p) => (
            <ProductCard key={p.name} p={p} />
          ))}
        </div>

        {/* Row 2 */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {products.slice(4, 8).map((p) => (
            <ProductCard key={p.name} p={p} />
          ))}
        </div>

        {/* Row 3 — products 9-10 + blue box */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {products.slice(8, 10).map((p) => (
            <ProductCard key={p.name} p={p} />
          ))}
          {/* All 10, connected */}
          <div className="rounded-2xl p-6 bg-gradient-to-br from-[#4F46E5] to-[#3B82F6] text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5">
            <div className="w-11 h-11 rounded-xl bg-white/25 flex items-center justify-center mb-4">
              <Sparkles size={20} className="text-white" strokeWidth={2.25} />
            </div>
            <h3 className="text-sm font-bold mb-0.5">All 10, connected</h3>
            <p className="text-[10px] font-semibold text-blue-200 tracking-wide mb-3">
              ZOIKO ONE BUSINESS
            </p>
            <p className="text-xs text-blue-100 leading-relaxed mb-4">
              Run the full connected platform on one operating layer with shared identity,
              workflow, and approvals.
            </p>
            <button className="inline-flex items-center gap-1 text-xs font-bold text-white hover:gap-1.5 transition-all">
              See bundles <ArrowRight size={13} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button onClick={() => navigate("/products#hero")} className="inline-flex items-center gap-2 bg-white text-[#1E1B4B] font-semibold px-6 py-3 rounded-full text-sm border border-gray-200 shadow-sm transition-all duration-200 hover:border-[#3B82F6] hover:text-[#3B82F6]">
            Compare Products
          </button>
          <button onClick={() => navigate("/pricing")} className="inline-flex items-center gap-2 bg-[#1E1B4B] hover:bg-[#2D2A6B] text-white font-bold px-6 py-3 rounded-full text-sm transition-all duration-200">
            View Pricing
          </button>
        </div>
      </div>
    </section>
  );
}

function ProductCard({ p }) {
  return (
    <div className="rounded-2xl p-6 border border-gray-100 shadow-sm bg-white transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 shadow-sm"
        style={{ background: p.tileBg }}
      >
        <p.icon size={20} className="text-white" strokeWidth={2.25} />
      </div>
      <h3 className="text-sm font-bold text-[#111827] mb-0.5">{p.name}</h3>
      <p className="text-[10px] font-semibold text-[#9CA3AF] tracking-wide mb-3">{p.tag}</p>
      <ul className="space-y-1.5 mb-4">
        {p.items.map((it) => (
          <li key={it} className="flex items-start gap-1.5 text-xs text-[#6B7280]">
            <span className="mt-0.5" style={{ color: p.accent }}>✓</span> {it}
          </li>
        ))}
      </ul>
      <button
        className="inline-flex items-center gap-1 text-xs font-bold hover:gap-1.5 transition-all"
        style={{ color: p.accent }}
      >
        {p.cta} <ArrowRight size={13} />
      </button>
    </div>
  );
}