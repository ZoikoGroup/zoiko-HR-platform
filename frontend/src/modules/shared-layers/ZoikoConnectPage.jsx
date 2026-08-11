import React from "react";
import PageHeader from "../../components/PageHeader";
import { Globe, MessageSquare, Send, Mail, CheckCircle2, ShieldCheck } from "lucide-react";

export default function ZoikoConnectPage() {
  const channels = [
    { name: "SMTP Email Server", icon: Mail, desc: "Global outbound email dispatcher", status: "Active", config: "smtp.zoiko.com:587" },
    { name: "Slack Notifications", icon: MessageSquare, desc: "Transactional alert workspace channel", status: "Connected", config: "#zoiko-alerts" },
    { name: "Twilio Gateway", icon: Send, desc: "MFA SMS token transmission module", status: "Active", config: "Global Sender" }
  ];

  return (
    <div className="space-y-6 font-sans">
      <PageHeader 
        title="Zoiko Connect" 
        description="Manage company communications channels, transactional mail servers, and real-time slack alert channels."
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Connected Channels */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Globe className="h-5 w-5 text-[#FF7A00]" /> Integrated Channels
          </h3>
          <div className="space-y-3">
            {channels.map((c, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 border border-orange-100 text-[#FF7A00]">
                    <c.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{c.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{c.desc}</p>
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  c.status === "Active" || c.status === "Connected" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-100 text-slate-400 border border-slate-200"
                }`}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Messaging Uptime / Queue */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#FF7A00]" /> Communication Metrics
            </h3>
            <div className="space-y-4 text-xs font-medium text-slate-700">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span>Outbound dispatch queue</span>
                <span className="text-slate-800 font-bold">0 pending (healthy)</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span>Email delivery rate</span>
                <span className="text-emerald-600 font-bold">99.85%</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span>SMS Latency</span>
                <span className="text-slate-800 font-bold">~1.2 seconds</span>
              </div>
              <div className="flex justify-between pt-1">
                <span>API quota usage (monthly)</span>
                <span className="text-slate-800 font-bold">14,280 / 100,000 requests</span>
              </div>
            </div>
          </div>

          <button className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-full bg-slate-150 hover:bg-slate-200 border border-slate-200 text-slate-700 px-4 py-2.5 text-xs font-semibold transition">
            Send Test Message
          </button>
        </div>
      </div>
    </div>
  );
}
