import React from "react";
import PageHeader from "../../components/PageHeader";
import { Layers, Database, Webhook, RefreshCw, Key, ArrowRight } from "lucide-react";

export default function ZoikoHubPage() {
  const integrations = [
    { name: "Slack Communications", status: "Healthy", type: "Chat Notifications", sync: "Real-time" },
    { name: "QuickBooks Online", status: "Healthy", type: "Accounting Ledger", sync: "Hourly sync" },
    { name: "Salesforce CRM Link", status: "Sync Warning", type: "Customer Impersonation", sync: "Daily sync" },
    { name: "AWS CloudWatch Logs", status: "Healthy", type: "Infrastructure Metrics", sync: "Streaming" }
  ];

  const webhooks = [
    { url: "https://api.zoiko.com/v1/webhooks/hr_sync", event: "employee.profile_changed", status: "Enabled" },
    { url: "https://api.zoiko.com/v1/webhooks/invoice_paid", event: "billing.invoice_received", status: "Enabled" }
  ];

  return (
    <div className="space-y-6 font-sans">
      <PageHeader 
        title="Zoiko Hub" 
        description="Configure third-party integrations, manage outgoing webhook endpoints, and check central API schema mapping details."
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Connected Apps */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Database className="h-5 w-5 text-[#FF7A00]" /> Integrated Applications
            </h3>
            <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
          <div className="space-y-3">
            {integrations.map((i, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-800">{i.name}</p>
                  <p className="text-xs text-slate-400 mt-1">{i.type} • {i.sync}</p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  i.status === "Healthy" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
                }`}>
                  {i.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Webhooks config */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Webhook className="h-5 w-5 text-[#FF7A00]" /> Webhook Endpoints
            </h3>
            <div className="space-y-4">
              {webhooks.map((w, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-xs font-bold text-slate-800 truncate font-mono">{w.url}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 font-medium">Event: <code className="bg-orange-50/50 px-1 py-0.5 border border-orange-100 text-[#FF7A00] font-mono">{w.event}</code></span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">{w.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-full bg-slate-150 hover:bg-slate-200 border border-slate-200 text-slate-700 px-4 py-2.5 text-xs font-semibold transition">
            Register New Webhook <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
