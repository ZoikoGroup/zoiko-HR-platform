import { ArrowRight, Users, Clock, Layers, DollarSign, FileText, Repeat, Diamond, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const spineSteps = [
  { label: "Zoiko HR", sub: "Worker record", icon: Users },
  { label: "ZoikoTime", sub: "Captures work", icon: Clock },
  { label: "Projects", sub: "Organizes delivery", icon: Layers },
  { label: "Payroll", sub: "Pays the team", icon: DollarSign },
  { label: "Billing", sub: "Invoices client", icon: FileText },
  { label: "ZoikoPay", sub: "Settles money", icon: Repeat },
  { label: "ZoikoCoreX", sub: "Records truth", icon: Diamond },
  { label: "Insights", sub: "Informs decisions", icon: BarChart3 },
];

export default function WhyExists() {
  const navigate = useNavigate();
  return (
    <section className="bg-white py-20 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-12 text-center">
        <p className="text-xs font-bold text-[#4F46E5] tracking-[0.15em] uppercase mb-4">
          The Connected Spine
        </p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] leading-tight tracking-tight mb-4">
          People. Time. Payroll. Billing.
          <br />
          Projects. Compliance. Insights.
        </h2>
        <p className="text-[#6B7280] max-w-2xl mx-auto leading-relaxed mb-12">
          One platform where operational evidence moves end to end — settled through ZoikoPay
          and recorded through ZoikoCoreX.
        </p>

        <div className="rounded-3xl p-8 md:p-10 bg-gradient-to-br from-[#1E1B4B] via-[#312E81] to-[#3B82F6] text-white text-left">
          <h3 className="text-xl md:text-2xl font-bold mb-2 text-center md:text-left">
            From employee record to paid invoice — connected end to end
          </h3>
          <p className="text-sm text-blue-200 mb-8 text-center md:text-left">
            Watch one approved hour become pay, revenue, an audit record, and an insight.
          </p>

          <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
            {spineSteps.map((s, i) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className="flex flex-col items-center text-center w-20">
                  <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center mb-2">
                    <s.icon size={16} className="text-white" />
                  </div>
                  <p className="text-xs font-semibold">{s.label}</p>
                  <p className="text-[10px] text-blue-300">{s.sub}</p>
                </div>
                {i < spineSteps.length - 1 && (
                  <ArrowRight size={14} className="text-blue-400 hidden sm:block shrink-0" />
                )}
              </div>
            ))}
          </div>

          <div className="text-center">
            <button onClick={() => navigate("/platform")} className="inline-flex items-center gap-2 bg-[#F97316] hover:bg-[#EA580C] text-white font-bold px-6 py-3 rounded-full text-sm shadow-lg shadow-orange-500/30 transition-all duration-200 hover:scale-[1.03]">
              View Platform Overview <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}