import React from "react";
import PageHeader from "../../components/PageHeader";
import { LayoutDashboard, Users, CreditCard, Activity, TrendingUp, ArrowUpRight, ArrowDownRight, Package } from "lucide-react";

export default function DashboardPage() {
  const stats = [
    { title: "Monthly Recurring Revenue", value: "$142,480", change: "+12.4%", isPositive: true, icon: CreditCard, color: "text-[#FF7A00] bg-[#FF7A00]/10 border-[#FF7A00]/25" },
    { title: "Active Organizations", value: "180", change: "+3.2%", isPositive: true, icon: Users, color: "text-blue-600 bg-blue-500/10 border-blue-500/25" },
    { title: "System Uptime (24h)", value: "99.99%", change: "Stable", isPositive: true, icon: Activity, color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/25" },
    { title: "Pending Approvals", value: "5", change: "-2 today", isPositive: false, icon: Package, color: "text-purple-600 bg-purple-500/10 border-purple-500/25" }
  ];

  const productStats = [
    { name: "Zoiko HR", activeUsers: "1,248", activeTenants: "112", status: "Healthy" },
    { name: "ZoikoTime", activeUsers: "980", activeTenants: "94", status: "Healthy" },
    { name: "Zoiko Payroll", activeUsers: "560", activeTenants: "45", status: "Maintenance" },
    { name: "Zoiko Billing", activeUsers: "812", activeTenants: "82", status: "Healthy" },
    { name: "Zoiko Comply", activeUsers: "340", activeTenants: "38", status: "Healthy" }
  ];

  const recentSignups = [
    { org: "Global Tech Inc.", tier: "Enterprise", users: "150", joined: "2 hours ago" },
    { org: "Apex Retailers Ltd.", tier: "Business", users: "45", joined: "5 hours ago" },
    { org: "Quantum Logistics", tier: "Starter", users: "12", joined: "1 day ago" }
  ];

  return (
    <div className="space-y-6 font-sans">
      <PageHeader 
        title="Dashboard" 
        description="Comprehensive overview of system health, monthly recurring revenue, and active customer metrics."
      />

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, idx) => (
          <div key={idx} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:border-[#FF7A00]/40 transition duration-255">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">{s.title}</p>
                <p className="mt-2 text-3xl font-extrabold text-slate-800">{s.value}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  {s.change !== "Stable" && (
                    s.isPositive ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> : <ArrowDownRight className="h-4 w-4 text-slate-400" />
                  )}
                  <span className={`text-xs font-semibold ${s.isPositive ? "text-emerald-600" : "text-slate-500"}`}>
                    {s.change}
                  </span>
                </div>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Product Adoption Table */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-slate-800">Product Portfolio Usage</h3>
            <span className="text-xs text-slate-400">Real-Time Sync</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4">Active Users</th>
                  <th className="py-3 px-4">Subscribed Orgs</th>
                  <th className="py-3 px-4 text-right">System Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productStats.map((p, idx) => (
                  <tr key={idx} className="text-sm text-slate-600 hover:bg-slate-50/50 transition">
                    <td className="py-4 px-4 font-bold text-slate-850">{p.name}</td>
                    <td className="py-4 px-4 font-medium text-slate-800">{p.activeUsers}</td>
                    <td className="py-4 px-4 text-slate-500">{p.activeTenants}</td>
                    <td className="py-4 px-4 text-right">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        p.status === "Healthy" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
                      }`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Organizations */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4">New Tenant Registrations</h3>
            <div className="space-y-4">
              {recentSignups.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <div>
                    <p className="text-xs font-bold text-slate-800">{s.org}</p>
                    <p className="text-[10px] text-slate-405 mt-0.5">Users: <span className="font-semibold text-slate-700">{s.users}</span></p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block rounded-full bg-[#FF7A00]/10 border border-[#FF7A00]/20 px-2 py-0.5 text-[9px] font-bold text-[#FF7A00] uppercase">
                      {s.tier}
                    </span>
                    <p className="text-[9px] text-slate-400 mt-1">{s.joined}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 hover:border-slate-350 hover:bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 transition">
            View All Signups
          </button>
        </div>
      </div>
    </div>
  );
}
