import React, { useState } from "react";
import PageHeader from "../../components/PageHeader";
import { Search, Building, MoreVertical, Edit, ShieldAlert, Plus, CheckCircle } from "lucide-react";

export default function OrganizationsPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const organizations = [
    { id: "tenant-acme", name: "Acme Corporation", industry: "Technology", tier: "Enterprise", status: "Active", users: 420, joined: "2024-01-15" },
    { id: "tenant-globex", name: "Globex Industries", industry: "Logistics & Delivery", tier: "Business", status: "Active", users: 150, joined: "2024-02-01" },
    { id: "tenant-initech", name: "Initech LLC", industry: "Financial Services", tier: "Starter", status: "Active", users: 45, joined: "2024-03-10" },
    { id: "tenant-umbrella", name: "Umbrella Pharmaceutical", industry: "Healthcare & Research", tier: "Enterprise", status: "Suspended", users: 512, joined: "2024-04-18" },
    { id: "tenant-hooli", name: "Hooli Corp", industry: "Search & Infrastructure", tier: "Trial", status: "Active", users: 89, joined: "2024-05-22" },
    { id: "tenant-vehement", name: "Vehement Capital", industry: "Venture Investments", tier: "Business", status: "Active", users: 62, joined: "2024-06-01" }
  ];

  const filteredOrgs = organizations.filter(org => 
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.industry.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.tier.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 font-sans">
      <PageHeader 
        title="Organizations" 
        description="Provision, manage, suspend, or configure licenses for customer organizational environments."
        action={
          <button className="flex items-center gap-2 rounded-full bg-[#FF7A00] hover:bg-[#e56e00] text-white px-4 py-2.5 text-sm font-semibold transition shadow-[0_4px_14px_rgba(255,122,0,0.3)]">
            <Plus className="h-4 w-4" /> Provision Org
          </button>
        }
      />

      {/* Main List Card */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-800">Customer Environments</h3>
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search organizations, industries, tiers..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:bg-white focus:border-[#FF7A00]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Organization Name</th>
                <th className="py-3 px-4">Industry / Domain</th>
                <th className="py-3 px-4">Service Tier</th>
                <th className="py-3 px-4">License Seats</th>
                <th className="py-3 px-4">Joined Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrgs.map((o) => (
                <tr key={o.id} className="text-sm text-slate-650 hover:bg-slate-50/50 transition">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-550 border border-slate-200/50">
                        <Building className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-850">{o.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{o.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-slate-700">{o.industry}</td>
                  <td className="py-4 px-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      o.tier === "Enterprise" ? "bg-indigo-50 text-indigo-600 border border-indigo-100" :
                      o.tier === "Business" ? "bg-blue-50 text-blue-600 border border-blue-100" :
                      o.tier === "Starter" ? "bg-[#FF7A00]/5 text-[#FF7A00] border border-[#FF7A00]/10" :
                      "bg-purple-50 text-purple-600 border border-purple-100"
                    }`}>
                      {o.tier}
                    </span>
                  </td>
                  <td className="py-4 px-4 font-semibold text-slate-800">{o.users} seats</td>
                  <td className="py-4 px-4 text-slate-500">{o.joined}</td>
                  <td className="py-4 px-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      o.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
                    }`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex justify-end gap-2 text-slate-400">
                      <button className="p-1.5 hover:text-[#FF7A00] hover:bg-slate-50 rounded-lg transition" aria-label="Edit license"><Edit className="h-4 w-4" /></button>
                      <button className={`p-1.5 rounded-lg transition ${o.status === "Active" ? "hover:text-red-500 hover:bg-red-50" : "hover:text-emerald-500 hover:bg-emerald-50"}`} aria-label="Toggle status">
                        {o.status === "Active" ? <ShieldAlert className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                      </button>
                    </div>
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
