import { Hexagon, IdCard, Repeat2, Share2, Sparkles, FileStack, CheckSquare, Wallet } from "lucide-react";

const layers = [
  { icon: Hexagon, name: "Zoiko Hub", desc: "Unified dashboard, alerts, approvals, and cross-product visibility." },
  { icon: IdCard, name: "ZoikoID", desc: "Identity, SSO, permissions, delegated and agency access." },
  { icon: Repeat2, name: "Zoiko Workflow", desc: "Task, approval, routing, escalation, and state-machine engine." },
  { icon: Share2, name: "Zoiko Connect", desc: "APIs, webhooks, connectors, imports, exports, integrations." },
  { icon: Sparkles, name: "AI Assistance", desc: "Search, summaries, drafting, and anomaly surfacing — assists, never decides." },
  { icon: FileStack, name: "Documents", desc: "Contracts, payslips, invoices, policies, and audit evidence packs." },
  { icon: CheckSquare, name: "Approvals", desc: "Timesheet, leave, payroll, invoice, project, and expense approvals." },
  { icon: Wallet, name: "Expenses", desc: "Claims, receipts, reimbursements, and client allocation." },
];

export default function Philosophy() {
  return (
    <section className="bg-[#F8F7FC] py-20 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-12 text-center">
        <p className="text-xs font-bold text-[#3B82F6] tracking-[0.15em] uppercase mb-4">
          Shared Platform Layers
        </p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] leading-tight tracking-tight mb-4">
          The shared layers that make
          <br />
          every product stronger.
        </h2>
        <p className="text-[#6B7280] max-w-2xl mx-auto leading-relaxed mb-14">
          Foundation and capability layers run beneath the seven products — they're how the
          platform stays connected, not separate SKUs.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
          {layers.map((l) => (
            <div
              key={l.name}
              className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm transition-all duration-200 hover:shadow-md"
            >
              <div className="w-9 h-9 rounded-lg bg-[#E0F2FE] flex items-center justify-center mb-4">
                <l.icon size={18} className="text-[#3B82F6]" />
              </div>
              <h3 className="text-sm font-bold text-[#111827] mb-1.5">{l.name}</h3>
              <p className="text-xs text-[#6B7280] leading-relaxed">{l.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}