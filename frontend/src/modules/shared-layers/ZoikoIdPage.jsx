import React, { useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { Shield, Key } from "lucide-react";
import { api } from "../../service/api";
import { StatusPill, fmt } from "./integrationsUi";

export default function ZoikoIdPage() {
  const [providers, setProviders] = useState([]);
  const [sessions, setSessions] = useState({ session_tracking: "not_enabled", sessions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const [idp, sess] = await Promise.all([
          api.get("/super-admin/identity-providers"),
          api.get("/super-admin/active-sessions"),
        ]);
        if (cancelled) return;
        setProviders(idp?.providers || []);
        setSessions(sess || { session_tracking: "not_enabled", sessions: [] });
      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to load Zoiko ID data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const header = (
    <PageHeader
      title="Zoiko ID"
      description="Identity providers and authentication sessions."
    />
  );

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        {header}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#3B82F6] border-t-transparent" />
          </div>
        </div>
      </div>
    );
  }

  const rows = sessions.sessions || [];

  return (
    <div className="space-y-6 font-sans">
      {header}

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Shield className="h-5 w-5 text-[#3B82F6]" /> Identity Providers
        </h3>
        <div className="space-y-3">
          {providers.map((p) => (
            <div key={p.key} className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {p.type}
                    {p.client_id ? ` · Client ID ${p.client_id}` : ""}
                  </p>
                </div>
                <StatusPill status={p.status} />
              </div>
              {p.status === "Not configured" && p.required_env?.length > 0 && (
                <p className="text-xs text-slate-400 mt-1">Requires env: {p.required_env.join(", ")}</p>
              )}
              {p.login_routes?.length > 0 && (
                <p className="text-xs text-slate-500 mt-1 font-mono break-all">{p.login_routes.join("  ")}</p>
              )}
              {p.last_activity_at && (
                <p className="text-xs text-slate-400 mt-1">Last successful sign-in {fmt(p.last_activity_at)}</p>
              )}
              {p.metrics?.successful_sign_ins != null && (
                <p className="text-xs text-slate-500 mt-1">
                  <span className="font-semibold text-slate-700">{p.metrics.successful_sign_ins}</span> successful sign-ins
                </p>
              )}
            </div>
          ))}
          {!error && providers.length === 0 && <p className="text-sm text-slate-500">No identity providers found.</p>}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Key className="h-5 w-5 text-[#3B82F6]" /> Active Auth Sessions
        </h3>
        {sessions.session_tracking === "not_enabled" ? (
          <p className="p-4 text-sm text-slate-500">Session tracking is not enabled.</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No active sessions.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody>
              {rows.map((s, idx) => (
                <tr key={s.id ?? idx} className="hover:bg-slate-50/50 transition">
                  <td className="py-3 px-4 font-bold text-slate-800">{s.user}</td>
                  <td className="py-3 px-4">{s.role}</td>
                  <td className="py-3 px-4 font-mono">{s.ip}</td>
                  <td className="py-3 px-4">{s.device}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
