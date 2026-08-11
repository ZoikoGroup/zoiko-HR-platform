import { ArrowRight } from "lucide-react";

export default function GlobalReadiness() {
  return (
    <section className="bg-gradient-to-br from-[#1E1B4B] via-[#312E81] to-[#3B82F6] py-20 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-12">
        <p className="text-xs font-bold text-[#FDBA74] tracking-[0.15em] uppercase mb-4">
          Security, Compliance & Trust
        </p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight tracking-tight mb-8 max-w-lg">
          Built for security, control, and audit readiness.
        </h2>
        <p className="text-blue-200 max-w-xl leading-relaxed mb-8 text-sm">
          Controls are designed in from day one — not bolted on. Built for the enterprise side,
          every public claim is substantiated in our Trust Center.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-8 max-w-2xl">
          <div className="rounded-xl p-4 bg-white/10 text-sm text-blue-100 leading-relaxed">
            Action logs and evidence packs that stand up to audit and review.
          </div>
          <div className="rounded-xl p-4 bg-white/10 text-sm text-blue-100 leading-relaxed">
            Clear data handling, retention, subprocessors, and residency approach.
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <button className="inline-flex items-center gap-2 bg-[#F97316] hover:bg-[#EA580C] text-white font-bold px-7 py-3.5 rounded-full text-sm shadow-lg shadow-orange-500/30 transition-all duration-200 hover:scale-[1.03]">
            Visit Trust Center <ArrowRight size={16} />
          </button>
          <button className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-7 py-3.5 rounded-full text-sm border border-white/20 transition-all duration-200">
            Download Security Overview
          </button>
        </div>
      </div>
    </section>
  );
}