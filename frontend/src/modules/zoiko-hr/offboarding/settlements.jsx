/*
 * Offboarding → Settlements: every final settlement with its status. Draft → approved → paid (or not applicable).
 * The lines themselves are edited in the case's Settlement tab; here HR and finance approve, mark paid and export.
 * Data: GET /hr/offboarding/settlements; status changes: POST /hr/offboarding/cases/{id}/settlement/{status}.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, RefreshCw, WalletCards } from "lucide-react";
import { errorMessage, exportSettlements, listSettlements, setSettlementStatus } from "../../../service/offboardingService";
import { formatDate } from "../../../utils/dateTime";
import { Card, EmptyState, FilterSelect, PersonCell, PrimaryButton, SecondaryButton, StatusPill, Table, money, td } from "../recruitment/ui";
import OffboardingLayout from "./OffboardingLayout";
import { ErrorNote, Modal, humanize, inputClass, useLoad } from "./part2Helpers";

const STATUS_TONE = { draft: "amber", approved: "blue", paid: "green", not_applicable: "gray" };
const FILTERS = [
  { value: "pending", label: "Pending (draft or approved)" }, { value: "draft", label: "Draft" }, { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" }, { value: "not_applicable", label: "Not applicable" },
];
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function Settlements() {
  const [status, setStatus] = useState("pending");
  const list = useLoad(() => listSettlements({ status: status === "all" ? undefined : status }), [status]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [paying, setPaying] = useState(null);
  const [pay, setPay] = useState({ paid_on: todayIso(), payment_reference: "" });
  const [dialogError, setDialogError] = useState(null);
  const rows = list.data?.items || [];
  const currencies = [...new Set(rows.map((r) => r.currency).filter(Boolean))];
  const totalNet = rows.reduce((s, r) => s + Number(r.net_amount || 0), 0);

  const approve = async (r) => {
    setBusy(true); setError(null); setNotice(null);
    try { await setSettlementStatus(r.case_id, "approved"); setNotice(`Settlement for ${r.employee?.name} approved.`); await list.reload(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const markPaid = async () => {
    setBusy(true); setDialogError(null);
    try {
      await setSettlementStatus(paying.case_id, "paid", { paid_on: pay.paid_on, payment_reference: pay.payment_reference.trim() || null });
      setNotice(`Settlement for ${paying.employee?.name} marked paid.`);
      setPaying(null);
      await list.reload();
    } catch (e) { setDialogError(errorMessage(e)); } finally { setBusy(false); }
  };
  const doExport = async () => {
    setError(null);
    try { await exportSettlements(status === "all" ? undefined : status); } catch (e) { setError(errorMessage(e)); }
  };

  return (
    <OffboardingLayout title="Settlements" subtitle="Final settlements: leave pay-out, notice, deductions and payment."
      actions={<>
        <SecondaryButton icon={RefreshCw} onClick={list.reload}>Refresh</SecondaryButton>
        <SecondaryButton icon={Download} onClick={doExport}>Export CSV</SecondaryButton>
      </>}>
      <div className="space-y-5">
        <Card bodyClass="p-4">
          <FilterSelect label="Status" value={status === "all" ? "" : status} onChange={(v) => setStatus(v || "all")} allLabel="All" options={FILTERS} />
        </Card>
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{notice}</p>}
        <ErrorNote>{error || list.error}</ErrorNote>
        <Card bodyClass="p-0">
          {list.loading && !list.data ? <p role="status" className="p-5 text-sm text-slate-500">Loading settlements…</p> : (
            <Table columns={[{ label: "Leaver" }, { label: "Case" }, { label: "Last working day" }, { label: "Earnings" }, { label: "Deductions" },
              { label: "Net" }, { label: "Status" }, { label: "Paid" }, { label: <span className="sr-only">Actions</span> }]}
              empty={rows.length === 0 && <EmptyState icon={WalletCards} title="No settlements here">Nothing matches this filter.</EmptyState>}>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={td}><PersonCell name={r.employee?.name} sub={r.employee?.employee_code} /></td>
                  <td className={td}><Link to={`/zoiko-hr/offboarding/cases/${r.case_id}`} className="font-medium text-blue-700 hover:underline">{r.case_number}</Link></td>
                  <td className={td}>{r.last_working_day ? formatDate(r.last_working_day) : "—"}</td>
                  <td className={td}>{money(r.total_earnings, r.currency)}</td>
                  <td className={td}>{money(r.total_deductions, r.currency)}</td>
                  <td className={`${td} font-semibold text-slate-900`}>{money(r.net_amount, r.currency)}</td>
                  <td className={td}><StatusPill tone={STATUS_TONE[r.status] || "gray"}>{humanize(r.status)}</StatusPill></td>
                  <td className={td}>{r.paid_on ? <>{formatDate(r.paid_on)}{r.payment_reference && <p className="text-xs text-slate-500">{r.payment_reference}</p>}</> : "—"}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <div className="flex justify-end gap-1.5">
                      <Link to={`/zoiko-hr/offboarding/cases/${r.case_id}?tab=settlement`}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Open case</Link>
                      {r.status === "draft" && (
                        <button type="button" disabled={busy} onClick={() => approve(r)} aria-label={`Approve settlement for ${r.employee?.name}`}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Approve</button>
                      )}
                      {r.status === "approved" && (
                        <button type="button" disabled={busy} aria-label={`Mark settlement for ${r.employee?.name} paid`}
                          onClick={() => { setPaying(r); setPay({ paid_on: todayIso(), payment_reference: "" }); setDialogError(null); }}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Mark paid</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="bg-slate-50">
                  <td className={`${td} font-semibold`} colSpan={5}>Total net ({rows.length})</td>
                  <td className={`${td} font-bold text-slate-900`} colSpan={4}>
                    {currencies.length <= 1 ? money(totalNet, currencies[0]) : "Several currencies"}
                  </td>
                </tr>
              )}
            </Table>
          )}
        </Card>
      </div>

      <Modal open={Boolean(paying)} title={`Mark settlement for ${paying?.employee?.name || ""} paid`} onClose={() => setPaying(null)}
        footer={<>
          <SecondaryButton onClick={() => setPaying(null)}>Cancel</SecondaryButton>
          <PrimaryButton disabled={busy || !pay.paid_on} onClick={markPaid}>Mark paid</PrimaryButton>
        </>}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Net amount {money(paying?.net_amount, paying?.currency)}</p>
          <div>
            <label htmlFor="paid-on" className="mb-1 block text-sm font-medium text-slate-700">Paid on</label>
            <input id="paid-on" type="date" value={pay.paid_on} onChange={(e) => setPay((p) => ({ ...p, paid_on: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label htmlFor="pay-ref" className="mb-1 block text-sm font-medium text-slate-700">Payment reference (optional)</label>
            <input id="pay-ref" value={pay.payment_reference} maxLength={120} onChange={(e) => setPay((p) => ({ ...p, payment_reference: e.target.value }))} className={inputClass} />
          </div>
          <ErrorNote>{dialogError}</ErrorNote>
        </div>
      </Modal>
    </OffboardingLayout>
  );
}
