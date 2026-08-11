import React from "react";
import PageHeader from "../../components/PageHeader";
import { CheckCircle2, XCircle, Clock, Check, X, ShieldAlert, Award } from "lucide-react";

export default function ApprovalsPage() {
  const pendingApprovals = [
    { id: "req-102", type: "Leave Request", requester: "Evelyn Carter", details: "Annual leave request (June 28 - July 04)", submitted: "3 hours ago", priority: "High" },
    { id: "req-103", type: "Budget Allocation", requester: "Acme Corporation", details: "Increase SaaS seats budget request ($4,200/mo)", submitted: "5 hours ago", priority: "Medium" },
    { id: "req-104", type: "Expense Reimbursement", requester: "Sarah Jenkins", details: "Enterprise training course invoice ($150)", submitted: "1 day ago", priority: "Low" }
  ];

  const processedApprovals = [
    { id: "req-101", type: "Data Access Request", requester: "Marcus Thorne", status: "Approved", processed: "2 days ago" },
    { id: "req-100", type: "Refund Request", requester: "Umbrella Pharm.", status: "Rejected", processed: "3 days ago" }
  ];

  return (
    <div className="space-y-6 font-sans">
      <PageHeader 
        title="Approvals" 
        description="Verify and approve platform actions, HR leave requests, organization budget adjustments, and credentials provisioning."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pending Approvals List */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" /> Pending Approvals
          </h3>
          <div className="space-y-3">
            {pendingApprovals.map((item, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:bg-slate-100/30 transition">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold text-slate-800">{item.type}</span>
                    <span className="text-[10px] text-slate-400 font-mono">#{item.id}</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      item.priority === "High" ? "bg-red-50 text-red-700" :
                      item.priority === "Medium" ? "bg-amber-50 text-amber-700" :
                      "bg-slate-200 text-slate-500"
                    }`}>{item.priority}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-850 leading-snug">{item.details}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Requester: <span className="font-semibold text-slate-650">{item.requester}</span> • {item.submitted}</p>
                </div>
                
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-500 hover:text-white transition" aria-label="Approve request">
                    <Check className="h-4 w-4" />
                  </button>
                  <button className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-50 text-red-500 border border-red-100 hover:bg-red-500 hover:text-white transition" aria-label="Reject request">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Processed requests */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Award className="h-5 w-5 text-[#FF7A00]" /> Recent Decisions
            </h3>
            <div className="space-y-4">
              {processedApprovals.map((p, idx) => (
                <div key={idx} className="flex gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border ${
                    p.status === "Approved" ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-red-50 border-red-100 text-red-500"
                  }`}>
                    {p.status === "Approved" ? <CheckCircle2 className="h-4.5 w-4.5" /> : <XCircle className="h-4.5 w-4.5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{p.type}</p>
                    <p className="text-[10px] text-slate-450 mt-0.5">{p.requester}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">Processed {p.processed}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 text-center">
            <span className="text-[10px] text-slate-400 font-semibold">Decisions are fully logged in Audit trail</span>
          </div>
        </div>
      </div>
    </div>
  );
}
