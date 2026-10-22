// ESS "My compensation": my own pay components and compensation letters, and a total reward statement I can request.
// Compensation documents are confidential: they open in the document viewer and e-mails never contain amounts.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileText, Loader2 } from "lucide-react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import { getMyCompensation, requestMyStatement } from "../../../../service/workDocumentsService";
import { blockedText } from "../../../../components/documents/RecordDocumentsPanel";
import { formatDate } from "../../../../utils/dateTime";

export default function EmployeeMyCompensation() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => getMyCompensation().then(setData).catch((e) => setError(e?.message || "Your compensation could not be loaded.")), []);
  useEffect(() => { load(); }, [load]);

  const statement = async () => {
    setBusy(true); setNotice(null);
    try {
      const r = await requestMyStatement(String(new Date().getFullYear()));
      setNotice({ ok: true, text: "Your statement is ready.", id: r.document_id });
      load();
    } catch (e) {
      const d = e?.detail || e?.data?.detail;
      setNotice({ ok: false, text: d?.message || (d?.reasons || []).map(blockedText).join(" ") || e?.message || "The statement could not be produced." });
    } finally { setBusy(false); }
  };

  return (
    <EmployeePageShell title="My compensation" subtitle="Your pay components and compensation letters. Only you and HR can see them."
      actions={<button type="button" onClick={statement} disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow hover:bg-slate-50 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />} Download statement</button>}>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && (
        <p role="status" className={`mb-4 rounded-xl border p-3 text-sm ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {notice.text} {notice.id && <Link to={`/employee/documents/company?generated=${notice.id}`} className="font-semibold underline">Open it</Link>}
        </p>
      )}
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Pay components">
            <h2 className="mb-2 text-base font-semibold text-slate-900">Pay</h2>
            {data.components.length === 0 ? <p className="text-sm text-slate-600">No pay details are recorded yet.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Component</th><th>Amount</th><th>Frequency</th></tr></thead>
                <tbody>{data.components.map((c) => <tr key={c.label} className="border-t border-slate-100"><td className="py-1.5">{c.label}</td><td>{c.amount}</td><td>{c.frequency}</td></tr>)}</tbody>
              </table>
            )}
            {data.estimated_annual_total && <p className="mt-2 text-sm text-slate-700">Estimated annual value (before deductions): <strong>{data.estimated_annual_total}</strong></p>}
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Compensation letters">
            <h2 className="mb-2 text-base font-semibold text-slate-900">Letters and statements</h2>
            {data.documents.length === 0 ? <p className="text-sm text-slate-600">No compensation documents yet.</p> : (
              <ul className="divide-y divide-slate-100">
                {data.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="flex items-center gap-2"><FileText size={16} className="text-slate-400" aria-hidden="true" /> {d.title}
                      <span className="text-xs text-slate-500">{d.issued_at ? formatDate(d.issued_at) : ""}</span></span>
                    <Link to={`/employee/documents/company?generated=${d.id}`} className="text-xs font-semibold text-blue-700 hover:underline">
                      {d.status === "ISSUED" ? "Read and acknowledge" : "Open"}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </EmployeePageShell>
  );
}
