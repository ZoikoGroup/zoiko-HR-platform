import React from "react";
import PageHeader from "../../components/PageHeader";
import { UserCheck, Shield, Key, Eye, Lock, Smartphone } from "lucide-react";

export default function ZoikoIdPage() {
  const providers = [
    { name: "Google Workspace OIDC", status: "Connected", type: "Single Sign-On", users: "142 users" },
    { name: "Microsoft Entra ID (SAML)", status: "Active", type: "Active Directory", users: "8 admins" },
    { name: "Okta Integration", status: "Inactive", type: "Enterprise SSO", users: "0 users" }
  ];

  const sessions = [
    { user: "admin@zoiko.com", role: "Super Admin", status: "Active Now", ip: "192.168.1.52", device: "Chrome / macOS" },
    { user: "marcus.t@zoiko.com", role: "Admin", status: "2 hours ago", ip: "127.0.0.1", device: "Safari / iPhone" },
    { user: "e.carter@zoiko.com", role: "HR Manager", status: "1 day ago", ip: "10.0.4.15", device: "Firefox / Windows" }
  ];

  return (
    <div className="space-y-6 font-sans">
      <PageHeader 
        title="Zoiko ID" 
        description="Configure enterprise Single Sign-On (SSO), multi-factor authentication (MFA), and secure identity governance."
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* SSO Providers */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#FF7A00]" /> Identity Providers (IdP)
          </h3>
          <div className="space-y-3">
            {providers.map((p, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-400 mt-1">{p.type} • {p.users}</p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  p.status === "Connected" || p.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-100 text-slate-400 border border-slate-200"
                }`}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Global Security Settings */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#FF7A00]" /> Password & MFA Policies
            </h3>
            <div className="space-y-4 text-xs font-medium text-slate-700">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span>Enforce 2FA for all accounts</span>
                <span className="text-emerald-600 font-bold">YES</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span>Minimum password length</span>
                <span className="text-slate-800 font-bold">12 characters</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span>Lockout threshold</span>
                <span className="text-red-500 font-bold">5 failed attempts</span>
              </div>
              <div className="flex justify-between pt-1">
                <span>Session duration limit</span>
                <span className="text-slate-800 font-bold">24 hours</span>
              </div>
            </div>
          </div>
          <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-slate-150 hover:bg-slate-200 border border-slate-200 text-slate-700 px-4 py-2 text-xs font-semibold transition">
            <Smartphone className="h-4 w-4" /> Setup MFA Backup Controls
          </button>
        </div>
      </div>

      {/* Active Identity Sessions */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Key className="h-5 w-5 text-[#FF7A00]" /> Active Auth Sessions
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">User Session</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4">Device Info</th>
                <th className="py-3 px-4 text-right">Last Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium">
              {sessions.map((s, idx) => (
                <tr key={idx} className="text-slate-650 hover:bg-slate-50/50 transition">
                  <td className="py-4 px-4 font-bold text-slate-800">{s.user}</td>
                  <td className="py-4 px-4">{s.role}</td>
                  <td className="py-4 px-4 font-mono">{s.ip}</td>
                  <td className="py-4 px-4">{s.device}</td>
                  <td className="py-4 px-4 text-right">
                    <span className={`inline-block font-semibold ${s.status === "Active Now" ? "text-emerald-600" : "text-slate-400"}`}>
                      {s.status}
                    </span>
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
