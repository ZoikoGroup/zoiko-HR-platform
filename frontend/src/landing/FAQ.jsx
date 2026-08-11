import { Rocket, Link2, Zap, ShieldCheck, TrendingUp } from "lucide-react";

const steps = [
  { icon: Rocket, title: "Start", desc: "Buy one product without platform overwhelm.", bg: "#1E1B4B" },
  { icon: Link2, title: "Connect", desc: "Link products and integrations through Zoiko Connect.", bg: "#7C3AED" },
  { icon: Zap, title: "Automate", desc: "Reduce manual ops with approvals and workflows.", bg: "#3B82F6" },
  { icon: ShieldCheck, title: "Govern", desc: "Improve control and audit readiness with Comply.", bg: "#F97316" },
  { icon: TrendingUp, title: "Scale", desc: "Expand across teams, markets, products, and entities.", bg: "#F97316" },
];

export default function FAQ() {
  return (
    <section className="bg-[#F8F7FC] py-20 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-12 text-center">
        <p className="text-xs font-bold text-[#F97316] tracking-[0.15em] uppercase mb-4">
          Grow With The Platform
        </p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] leading-tight tracking-tight mb-4">
          From one product to one
          <br />
          connected platform.
        </h2>
        <p className="text-[#6B7280] max-w-2xl mx-auto leading-relaxed mb-14">
          The expansion path is built into the product — start small, connect, automate, govern,
          and scale.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 text-left">
          {steps.map((s) => (
            <div
              key={s.title}
              className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm transition-all duration-200 hover:shadow-md"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 text-white"
                style={{ background: s.bg }}
              >
                <s.icon size={16} />
              </div>
              <h3 className="text-sm font-bold text-[#111827] mb-1">{s.title}</h3>
              <p className="text-xs text-[#6B7280] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}