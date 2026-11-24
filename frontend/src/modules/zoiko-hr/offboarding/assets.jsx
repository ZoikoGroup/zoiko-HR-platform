/*
 * Offboarding → Asset Recovery: everything still assigned to people who are leaving, and what happened to it.
 * Data: GET /hr/offboarding/assets?status=…; resolve: PUT /hr/offboarding/assets/{id} (returned / damaged / lost /
 * written off / back to pending). Returning an item frees it in the asset register; damaged or lost items can carry an
 * amount to recover, which the settlement picks up as a deduction.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Package, RefreshCw } from "lucide-react";
import { errorMessage, listAssetReturns, resolveAssetReturn } from "../../../service/offboardingService";
import { formatDate } from "../../../utils/dateTime";
import { Card, EmptyState, FilterSelect, PersonCell, PrimaryButton, SecondaryButton, StatusPill, Table, td } from "../recruitment/ui";
import OffboardingLayout from "./OffboardingLayout";
import { ErrorNote, Modal, humanize, inputClass, useLoad } from "./part2Helpers";

const STATUS_TONE = { pending: "amber", returned: "green", damaged: "red", lost: "red", written_off: "gray" };
const STATUSES = [
  { value: "pending", label: "Pending" }, { value: "returned", label: "Returned" }, { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" }, { value: "written_off", label: "Written off" }, { value: "all", label: "All" },
];
const OUTCOMES = [
  { value: "returned", label: "Returned" }, { value: "damaged", label: "Returned damaged" }, { value: "lost", label: "Lost" },
  { value: "written_off", label: "Written off" }, { value: "pending", label: "Back to pending" },
];
const CONDITIONS = ["new", "good", "fair", "poor", "damaged"];

export default function AssetRecovery() {
  const [status, setStatus] = useState("pending");
  const list = useLoad(() => listAssetReturns({ status }), [status]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState(null);
  const [notice, setNotice] = useState(null);
  const rows = list.data?.items || [];

  const open = (r) => {
    setEditing(r);
    setForm({ status: r.status === "pending" ? "returned" : r.status, condition: r.condition || "good",
              recovery_amount: r.recovery_amount ?? "", note: r.note || "" });
    setDialogError(null);
  };
  const save = async () => {
    const body = { status: form.status, note: form.note || null };
    if (form.status === "returned") body.condition = form.condition;
    if (form.status === "damaged" || form.status === "lost") body.recovery_amount = form.recovery_amount === "" ? null : form.recovery_amount;
    setBusy(true); setDialogError(null);
    try {
      await resolveAssetReturn(editing.id, body);
      setNotice(`${editing.asset_name || "Asset"} recorded as ${humanize(form.status).toLowerCase()}.`);
      setEditing(null);
      await list.reload();
    } catch (e) { setDialogError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <OffboardingLayout title="Asset Recovery" subtitle="Company property held by people who are leaving."
      actions={<SecondaryButton icon={RefreshCw} onClick={list.reload}>Refresh</SecondaryButton>}>
      <div className="space-y-5">
        <Card bodyClass="p-4">
          <FilterSelect label="Status" value={status === "all" ? "" : status}onChange={(v) => setStatus(v || "all")} allLabel="All" options={STATUSES.filter((s) => s.value !== "all")} />
        </Card>
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{notice}</p>}
        <ErrorNote>{list.error}</ErrorNote>
        <Card bodyClass="p-0">
          {list.loading && !list.data ? <p role="status" className="p-5 text-sm text-slate-500">Loading assets…</p> : (
            <Table columns={[{ label: "Asset" }, { label: "Leaver" }, { label: "Case" }, { label: "Last working day" }, { label: "Status" },
              { label: "Condition" }, { label: "To recover" }, { label: <span className="sr-only">Actions</span> }]}
              empty={rows.length === 0 && <EmptyState icon={Package} title="No assets here">Nothing matches this filter.</EmptyState>}>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={td}><p className="font-medium text-slate-900">{r.asset_name || "Asset"}</p><p className="text-xs text-slate-500">{r.asset_tag || "—"}</p></td>
                  <td className={td}><PersonCell name={r.employee?.name} sub={r.employee?.employee_code} /></td>
                  <td className={td}><Link to={`/zoiko-hr/offboarding/cases/${r.case_id}`} className="font-medium text-blue-700 hover:underline">{r.case_number || `Case ${r.case_id}`}</Link></td>
                  <td className={td}>{r.last_working_day ? formatDate(r.last_working_day) : "—"}</td>
                  <td className={td}><StatusPill tone={STATUS_TONE[r.status] || "gray"}>{humanize(r.status)}</StatusPill></td>
                  <td className={td}>{r.condition ? humanize(r.condition) : "—"}</td>
                  <td className={td}>{r.recovery_amount != null ? r.recovery_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}</td>
                  <td className={`${td} text-right`}>
                    <button type="button" onClick={() => open(r)} aria-label={`Record ${r.asset_name || "asset"} ${r.asset_tag || ""}`.trim()}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Record</button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Modal open={Boolean(editing)} title={`${editing?.asset_name || "Asset"} ${editing?.asset_tag ? `(${editing.asset_tag})` : ""}`}
        onClose={() => setEditing(null)}
        footer={<>
          <SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton>
          <PrimaryButton disabled={busy} onClick={save}>Save</PrimaryButton>
        </>}>
        <div className="space-y-3">
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">What happened?</legend>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {OUTCOMES.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="asset-outcome" value={o.value} checked={form.status === o.value}
                    onChange={() => setForm((f) => ({ ...f, status: o.value }))} /> {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          {form.status === "returned" && (
            <div>
              <label htmlFor="asset-condition" className="mb-1 block text-sm font-medium text-slate-700">Condition</label>
              <select id="asset-condition" value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))} className={inputClass}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
              </select>
            </div>
          )}
          {(form.status === "damaged" || form.status === "lost") && (
            <div>
              <label htmlFor="asset-recovery" className="mb-1 block text-sm font-medium text-slate-700">Amount to recover (optional)</label>
              <input id="asset-recovery" type="number" min="0" step="0.01" value={form.recovery_amount}
                onChange={(e) => setForm((f) => ({ ...f, recovery_amount: e.target.value }))} className={inputClass} />
              <p className="mt-1 text-xs text-slate-500">Added to the final settlement as a deduction.</p>
            </div>
          )}
          <div>
            <label htmlFor="asset-note" className="mb-1 block text-sm font-medium text-slate-700">Note</label>
            <textarea id="asset-note" rows={2} maxLength={1000} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className={inputClass} />
          </div>
          <ErrorNote>{dialogError}</ErrorNote>
        </div>
      </Modal>
    </OffboardingLayout>
  );
}
