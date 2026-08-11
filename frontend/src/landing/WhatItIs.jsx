import { useNavigate } from "react-router-dom";
import { ArrowRight, FileText, Clock, AlertTriangle, ShieldAlert } from "lucide-react";

const problems = [
  {
    icon: FileText,
    title: "Duplicate records",
    desc: "HR, payroll, and finance each keep their own version of the truth.",
  },
  {
    icon: Clock,
    title: "Manual timesheets",
    desc: "Hours captured in spreadsheets never reach payroll or billing cleanly.",
  },
  {
    icon: AlertTriangle,
    title: "Missed billable work",
    desc: "Approved effort leaks before it ever becomes an invoice.",
  },
  {
    icon: ShieldAlert,
    title: "Compliance gaps",
    desc: "Obligations and audit evidence scattered across inboxes and drives.",
  },
];

export default function WhatItIs() {
  const navigate = useNavigate();
  return (
    <section className="bg-[#F8F7FC] py-20 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-12 text-center">
        <p className="text-xs font-bold text-[#F97316] tracking-[0.15em] uppercase mb-4">
          The Operations Problem
        </p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] leading-tight tracking-tight mb-4">
          Business operations break
          <br />
          when systems don't talk to each other.
        </h2>
        <p className="text-[#6B7280] max-w-2xl mx-auto leading-relaxed mb-12">
          Disconnected tools create duplicate work, payroll risk, missed revenue, and reporting
          nobody trusts. Zoiko One closes the gaps.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10 text-left">
          {problems.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl p-6 border border-gray-100 shadow-sm bg-white transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
            >
              <p.icon size={20} className="text-[#F97316] mb-3" />
              <h3 className="text-sm font-bold text-[#111827] mb-1.5">{p.title}</h3>
              <p className="text-xs text-[#6B7280] leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>

        <button onClick={() => navigate("/how-it-works")} className="inline-flex items-center gap-2 bg-[#1E1B4B] hover:bg-[#2D2A6B] text-white font-bold px-7 py-3.5 rounded-full text-sm transition-all duration-200 hover:scale-[1.03]">
          See How Zoiko One Works <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}