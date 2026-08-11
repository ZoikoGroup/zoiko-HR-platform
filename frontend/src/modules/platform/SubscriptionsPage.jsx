import React from "react";
import PageHeader from "../../components/PageHeader";
import { Download, CreditCard, Layers, Sparkles, Building2, CheckCircle2 } from "lucide-react";

export default function SubscriptionsPage() {
  const plans = [
    {
      name: "Starter",
      price: "$0",
      period: "Free Tier",
      description: "Basic features for small teams under 15 users.",
      features: ["Up to 15 users", "Basic HR Profile", "Time tracking logs", "Standard reporting"],
      badge: "bg-slate-100 text-slate-700",
      activeOrgs: "34 Organizations"
    },
    {
      name: "Business",
      price: "$29",
      period: "/ user / month",
      description: "Advanced workflow automation and comprehensive payroll.",
      features: ["Unlimited users", "Full Zoiko HR & Payroll", "Shift scheduler", "Custom billing flows", "Standard compliance checks"],
      badge: "bg-[#FF7A00]/10 text-[#FF7A00] border border-[#FF7A00]/20",
      activeOrgs: "112 Organizations",
      featured: true
    },
    {
      name: "Enterprise",
      price: "$99",
      period: "/ user / month",
      description: "Full suite integration with designated governance and WAF protection.",
      features: ["Custom user roles & controls", "Immutable audit trail", "Full API Gateway access", "WAF Block lists", "Priority 24/7 support", "Dedicated account manager"],
      badge: "bg-indigo-50 text-indigo-700 border border-indigo-100",
      activeOrgs: "34 Organizations"
    }
  ];

  const billingHistory = [
    { invoice: "INV-2026-894", org: "Acme Corporation", amount: "$4,200.00", date: "June 10, 2026", status: "Paid" },
    { invoice: "INV-2026-893", org: "Globex Industries", amount: "$870.00", date: "June 08, 2026", status: "Paid" },
    { invoice: "INV-2026-892", org: "Initech LLC", amount: "$135.00", date: "June 05, 2026", status: "Paid" },
    { invoice: "INV-2026-891", org: "Hooli Corp", amount: "$290.00", date: "May 28, 2026", status: "Paid" },
    { invoice: "INV-2026-890", org: "Umbrella Pharm.", amount: "$5,120.00", date: "May 18, 2026", status: "Overdue" }
  ];

  return (
    <div className="space-y-6 font-sans">
      <PageHeader 
        title="Plans & Subscriptions" 
        description="Monitor global subscription models, subscription plan features, active account ratios, and recent billing histories."
      />

      {/* Plans Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((p, idx) => (
          <div 
            key={idx} 
            className={`rounded-3xl bg-white border p-6 flex flex-col justify-between transition relative ${
              p.featured ? "border-[#FF7A00] shadow-[0_4px_30px_rgba(255,107,0,0.06)]" : "border-slate-200 shadow-sm"
            }`}
          >
            {p.featured && (
              <span className="absolute -top-3 left-6 rounded-full bg-[#FF7A00] px-3 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                Popular
              </span>
            )}
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${p.badge}`}>
                  {p.name}
                </span>
                <span className="text-xs text-slate-400 font-medium">{p.activeOrgs}</span>
              </div>
              <div className="flex items-baseline mb-4">
                <span className="text-4xl font-extrabold text-slate-800">{p.price}</span>
                <span className="text-sm text-slate-400 ml-1.5 font-medium">{p.period}</span>
              </div>
              <p className="text-xs text-slate-550 mb-6 leading-relaxed">{p.description}</p>
              
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Key Features</p>
              <ul className="space-y-2 mb-6">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                    <CheckCircle2 className="h-4 w-4 text-[#FF7A00] flex-shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <button className={`w-full rounded-full py-2.5 text-xs font-semibold transition ${
              p.featured 
                ? "bg-[#FF7A00] hover:bg-[#e56e00] text-white shadow-[0_4px_12px_rgba(255,107,0,0.25)]" 
                : "border border-slate-200 hover:border-slate-350 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}>
              Configure Plan
            </button>
          </div>
        ))}
      </div>

      {/* Invoice Table Section */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        <h3 className="text-lg font-bold text-slate-800 mb-5">Recent Invoices</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Invoice ID</th>
                <th className="py-3 px-4">Customer Organization</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Billing Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {billingHistory.map((item, idx) => (
                <tr key={idx} className="text-sm text-slate-650 hover:bg-slate-50/50 transition">
                  <td className="py-4 px-4 font-mono font-semibold text-slate-800">{item.invoice}</td>
                  <td className="py-4 px-4 font-semibold text-slate-850">{item.org}</td>
                  <td className="py-4 px-4 font-medium text-slate-800">{item.amount}</td>
                  <td className="py-4 px-4 text-slate-500">{item.date}</td>
                  <td className="py-4 px-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      item.status === "Paid" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <button className="p-1 text-slate-400 hover:text-[#FF7A00] transition" aria-label="Download invoice">
                      <Download className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
