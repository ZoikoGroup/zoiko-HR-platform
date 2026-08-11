import React from "react";
import PageHeader from "../../components/PageHeader";
import { Workflow, Plus, Play, ToggleRight, Calendar, GitBranch } from "lucide-react";

export default function ZoikoWorkflowPage() {
  const workflows = [
    { name: "Employee Onboarding Pipeline", trigger: "Employee Created", steps: 6, status: "Active", runs: "124" },
    { name: "High Expense Approval Limit", trigger: "Claim Submitted > $500", steps: 3, status: "Active", runs: "48" },
    { name: "Monthly Billing Automation", trigger: "Calendar Trigger (Month-End)", steps: 4, status: "Active", runs: "12" },
    { name: "Auto Slack Ping on Leave Approval", trigger: "Leave Approved", steps: 2, status: "Inactive", runs: "312" }
  ];

  const recentRuns = [
    { workflow: "Employee Onboarding Pipeline", target: "Alexander Vance", time: "25 mins ago", status: "Success" },
    { workflow: "High Expense Approval Limit", target: "Claim #841 (M. Thorne)", time: "1 hour ago", status: "Running" },
    { workflow: "Auto Slack Ping on Leave Approval", target: "Leave Approved (E. Carter)", time: "2 hours ago", status: "Success" }
  ];

  return (
    <div className="space-y-6 font-sans">
      <PageHeader 
        title="Zoiko Workflow" 
        description="Design, orchestrate, and audit state machine workflows that connect human actions and service micro-events."
        action={
          <button className="flex items-center gap-2 rounded-full bg-[#FF7A00] hover:bg-[#e56e00] text-white px-4 py-2.5 text-sm font-semibold transition shadow-[0_4px_14px_rgba(255,122,0,0.3)]">
            <Plus className="h-4 w-4" /> Create Workflow
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Workflows List */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-[#FF7A00]" /> Active Orchestration Flows
          </h3>
          <div className="space-y-3">
            {workflows.map((w, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-100/40 transition gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-800">{w.name}</p>
                  <p className="text-xs text-slate-400 mt-1">Trigger: <span className="font-semibold text-slate-650">{w.trigger}</span> • Steps: {w.steps}</p>
                </div>
                <div className="flex items-center gap-3 justify-between sm:justify-start">
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-700">{w.runs} runs</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    w.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-100 text-slate-400 border border-slate-200"
                  }`}>
                    {w.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Pipeline Executions */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Workflow className="h-5 w-5 text-[#FF7A00]" /> Recent Activity
            </h3>
            <div className="space-y-4">
              {recentRuns.map((r, idx) => (
                <div key={idx} className="flex gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-orange-50 border border-orange-100 text-[#FF7A00]">
                    <Play className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{r.workflow}</p>
                    <p className="text-[10px] text-slate-450 mt-0.5">Target: {r.target}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">{r.time}</p>
                  </div>
                  <div className="ml-auto flex items-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold ${
                      r.status === "Success" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                    }`}>
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 hover:border-slate-350 hover:bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 transition">
            View Executions Log
          </button>
        </div>
      </div>
    </div>
  );
}
