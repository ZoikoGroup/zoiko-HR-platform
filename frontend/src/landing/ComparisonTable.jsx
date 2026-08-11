import { ArrowRight, Quote } from "lucide-react";

const stats = [
  { value: "-61%", label: "Less time spent on reconciliation", color: "#F97316" },
  { value: "+18%", label: "Improvement in billable utilization", color: "#3B82F6" },
  { value: "4→1", label: "Tools consolidated onto one platform", color: "#F97316" },
];

export default function ComparisonTable() {
  return (
    <section className="bg-white py-20 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-12 text-center">
        <p className="text-xs font-bold text-[#3B82F6] tracking-[0.15em] uppercase mb-4">Proof</p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] leading-tight tracking-tight mb-14">
          See how connected operations
          <br />
          reduce friction.
        </h2>

        <div className="grid md:grid-cols-2 gap-6 mb-10 text-left">
          <div className="rounded-2xl p-7 bg-gradient-to-br from-[#312E81] to-[#4338CA] text-white flex flex-col justify-between">
            <div>
              <Quote size={24} className="text-[#FB923C] mb-3" />
              <p className="text-base leading-relaxed mb-6">
                We replaced four disconnected tools with one connected platform. Payroll,
                billing, and project margin finally agree — and our month-end close is days
                shorter.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-[#F97316] flex items-center justify-center text-xs font-bold">
                RM
              </span>
              <div>
                <p className="text-sm font-bold">Rachel Morgan</p>
                <p className="text-xs text-blue-200">CFO · Brightfield Professional Services</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl p-5 border border-gray-100 shadow-sm flex-1 flex flex-col justify-center transition-all duration-200 hover:shadow-md"
              >
                <p className="text-2xl font-extrabold" style={{ color: s.color }}>
                  {s.value}
                </p>
                <p className="text-xs text-[#6B7280] mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <button className="inline-flex items-center gap-2 bg-white text-[#1E1B4B] font-semibold px-6 py-3 rounded-full text-sm border border-gray-200 shadow-sm transition-all duration-200 hover:border-[#3B82F6] hover:text-[#3B82F6]">
          Read Customer Stories
        </button>
      </div>
    </section>
  );
}