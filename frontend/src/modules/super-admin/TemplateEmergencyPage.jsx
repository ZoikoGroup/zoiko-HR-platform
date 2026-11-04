// Template engine emergency controls (Super Admin, Prompt 4 §C11). Zoiko's own platform packs only: suspend a pack (and its
// active variants) when counsel withdraws it. New generation and unissued drafts are blocked at once, issued documents stay
// unchanged, affected organizations are told how many drafts are affected (counts only), and every suspension produces an
// HR-DOC-018 record. No tenant document, variant or person is visible here. Also: which countries tenants employ people in
// (organization counts), to prioritise platform counsel packs.
import { useCallback, useEffect, useState } from "react";
import { AlertOctagon, Globe2 } from "lucide-react";
import { getCountryDemand, listPlatformPacks, suspendPlatformPack } from "../../service/goLiveService";

export default function TemplateEmergencyPage() {
  const [packs, setPacks] = useState([]);
  const [demand, setDemand] = useState([]);
  const [notice, setNotice] = useState(null);
  const load = useCallback(() => {
    listPlatformPacks().then((r) => setPacks(r?.items || [])).catch((e) => setNotice({ ok: false, text: e.message }));
    getCountryDemand().then((r) => setDemand(r?.countries || [])).catch(() => setDemand([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const suspend = (p) => {
    const reason = window.prompt(`Why are you suspending the ${p.country} platform pack? This is recorded and sent to affected organizations (counts only).`);
    if (!reason || reason.trim().length < 5) return;
    suspendPlatformPack(p.id, reason.trim()).then((r) => { setNotice({ ok: true, text: `Suspended: ${r.variants_suspended} variants. Affected organizations were notified.` }); load(); })
      .catch((e) => setNotice({ ok: false, text: e.message }));
  };
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Template emergency controls</h1>
        <p className="text-sm text-slate-600">Platform jurisdiction packs only. Suspension blocks new documents and unissued drafts immediately; issued documents are never changed.</p>
      </header>
      {notice && <p role="status" className={`rounded-xl border p-3 text-sm ${notice.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.text}</p>}
      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Platform packs">
        <h2 className="mb-2 text-base font-semibold">Platform packs</h2>
        <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th>Country</th><th>Region</th><th>Status</th><th>Active variants</th><th /></tr></thead>
          <tbody>{packs.map((p) => <tr key={p.id} className="border-t border-slate-100"><td className="py-2">{p.country}</td><td>{p.region || "—"}</td><td>{p.status}</td><td>{p.variants_active}</td>
            <td className="text-right">{p.status === "ACTIVE" && <button type="button" onClick={() => suspend(p)}
              className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
              <AlertOctagon size={14} aria-hidden="true" /> Suspend</button>}</td></tr>)}
            {packs.length === 0 && <tr><td colSpan={5} className="py-3 text-slate-500">No platform packs.</td></tr>}</tbody></table>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Country demand">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold"><Globe2 size={18} aria-hidden="true" /> Where tenants employ people</h2>
        <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th>Country</th><th>Organizations</th><th>Platform pack</th></tr></thead>
          <tbody>{demand.map((d) => <tr key={d.country} className="border-t border-slate-100"><td className="py-1">{d.country}</td><td>{d.organizations}</td>
            <td>{d.platform_pack_active ? "active" : "none"}</td></tr>)}</tbody></table>
      </section>
    </div>
  );
}
