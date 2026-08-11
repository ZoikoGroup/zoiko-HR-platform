import React from "react";
import PageHeader from "../../components/PageHeader";
import { CreditCard, Plus, ArrowUpRight, TrendingUp, CircleDollarSign } from "lucide-react";

export default function ExpensesPage() {
  const claims = [
    { id: "exp-892", user: "Marcus Thorne", item: "Travel & Mileage Reimbursement", amount: "$340.00", date: "June 10, 2026", status: "Approved" },
    { id: "exp-893", user: "David Kim", item: "Client dinner - Business Development", amount: "$150.00", date: "June 08, 2026", status: "Pending" },
    { id: "exp-894", user: "Alexander Vance", item: "AWS Cloud Hosting - Prod Instance", amount: "$2,500.00", date: "June 05, 2026", status: "Paid" },
    { id: "exp-895", user: "Sarah Jenkins", item: "Quarterly security audit courses", amount: "$150.00", date: "May 28, 2026", status: "Pending" }
  ];

  const categories = [
    { name: "Cloud Server Hosting", spent: "$12,400", budget: "$15,000", pct: "82%" },
    { name: "Travel & Lodging", spent: "$2,870", budget: "$5,000", pct: "57%" },
    { name: "Meals & Entertainment", spent: "$875", budget: "$2,000", pct: "43%" }
  ];

  return (
    <div className="space-y-6 font-sans">
      <PageHeader 
        title="Expenses" 
        description="Monitor operational costs, employee reimbursements, and central software license budgets."
        action={
          <button className="flex items-center gap-2 rounded-full bg-[#FF7A00] hover:bg-[#e56e00] text-white px-4 py-2.5 text-sm font-semibold transition shadow-[0_4px_14px_rgba(255,122,0,0.3)]">
            <Plus className="h-4 w-4" /> Create Claim
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Expenses claims list */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-[#FF7A00]" /> Cost Claims
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Claim Details</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.map((c, idx) => (
                  <tr key={idx} className="text-sm text-slate-650 hover:bg-slate-50/50 transition">
                    <td className="py-4 px-4 font-bold text-slate-800">{c.item}</td>
                    <td className="py-4 px-4 font-medium text-slate-650">{c.user}</td>
                    <td className="py-4 px-4 text-slate-800 font-bold">{c.amount}</td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        c.status === "Paid" || c.status === "Approved" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
                      }`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Budgets category */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-[#FF7A00]" /> Operational Budgets
            </h3>
            <div className="space-y-4">
              {categories.map((cat, idx) => (
                <div key={idx} className="text-xs font-medium text-slate-700">
                  <div className="flex justify-between mb-1.5">
                    <span>{cat.name}</span>
                    <span className="font-semibold text-slate-900">{cat.spent} / {cat.budget}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#FF7A00] to-[#FF8C38] rounded-full"
                      style={{ width: cat.pct }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 text-center">
            <span className="text-[10px] text-slate-400 font-semibold">Budgets renew automatically next month</span>
          </div>
        </div>
      </div>
    </div>
  );
}
