// Org Admin asset actions (audit A12): edit, delete, return, transfer and category management.
// Every dialog shows the server's message inline and disables its buttons while its request runs.
import { useState } from "react";
import { AlertCircle, CheckCircle, Loader2, Search, X } from "lucide-react";
import {
  updateAsset, deleteAsset, returnAsset, transferAsset,
  createAssetCategory, updateAssetCategory, deleteAssetCategory,
} from "../../service/hrService";
import { employeeName, employeeEmail } from "../../utils/fieldAccess";
import { isFutureDate, todayISO, useEmployeeOptions } from "./assetPickers";

const CONDITION_OPTIONS = ["new", "good", "fair", "poor", "damaged"];
const NON_ASSIGNED_STATUSES = ["available", "maintenance", "retired", "lost"];
const inputCls = "w-full border border-slate-200 dark:border-[#334155] rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-[#0f172a] outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 focus:bg-white dark:focus:bg-[#0f172a] transition";
const labelCls = "text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5";

const tagOf = (a) => a.asset_tag || a.assetTag || "";
const holderOf = (a) => a.employee_name || a.employeeName || "";

function ErrorLine({ message }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-center gap-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm font-semibold">
      <AlertCircle size={14} className="flex-shrink-0" /> {message}
    </div>
  );
}

function Dialog({ title, subtitle, onClose, busy, children, label }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" role="dialog" aria-label={label || title}>
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#334155]">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h2>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition disabled:opacity-40">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Actions({ onClose, busy, disabled, submitLabel, busyLabel, danger = false, onSubmit }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onClose} disabled={busy}
        className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#334155] text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition disabled:opacity-40">
        Cancel
      </button>
      <button type={onSubmit ? "button" : "submit"} onClick={onSubmit} disabled={busy || disabled}
        className={`px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition shadow-sm flex items-center gap-2 disabled:opacity-60 ${
          danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
        }`}>
        {busy ? <><Loader2 size={14} className="animate-spin" /> {busyLabel}</> : submitLabel}
      </button>
    </div>
  );
}

/** Runs `fn`, keeping `busy` and the server's error message. Resolves true on success. */
function useRequest() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err?.message || "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

// ── Edit: details only. Who holds it changes through Assign / Transfer / Return, and "assigned" is set by Assign. ─────
export function EditAssetDialog({ asset, categories = [], onClose, onSaved }) {
  const isAssigned = asset.status === "assigned";
  const [form, setForm] = useState({
    name: asset.name || "",
    asset_tag: tagOf(asset),
    category: asset.category || "",
    serial_number: asset.serial_number || "",
    status: asset.status || "available",
    condition: asset.condition || "",
    purchase_date: asset.purchase_date || "",
    purchase_cost: asset.purchase_cost ?? "",
    notes: asset.notes || "",
  });
  const { busy, error, setError, run } = useRequest();
  const statusOptions = isAssigned ? ["assigned", ...NON_ASSIGNED_STATUSES] : NON_ASSIGNED_STATUSES;
  const categoryOptions = form.category && !categories.includes(form.category) ? [form.category, ...categories] : categories;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.asset_tag.trim()) {
      setError("Name and asset tag are required.");
      return;
    }
    if (isFutureDate(form.purchase_date)) {
      setError("Purchase date cannot be in the future.");
      return;
    }
    const payload = {
      name: form.name.trim(),
      asset_tag: form.asset_tag.trim(),
      category: form.category || null,
      serial_number: form.serial_number.trim() || null,
      status: form.status,
      condition: form.condition || null,
      purchase_date: form.purchase_date || null,
      purchase_cost: form.purchase_cost === "" ? null : Number(form.purchase_cost),
      notes: form.notes || null,
    };
    if (await run(() => updateAsset(asset.id, payload))) onSaved?.();
  };

  return (
    <Dialog title="Edit asset" subtitle={tagOf(asset)} onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <ErrorLine message={error} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="edit-name">Name *</label>
            <input id="edit-name" type="text" value={form.name} onChange={set("name")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="edit-tag">Asset Tag *</label>
            <input id="edit-tag" type="text" value={form.asset_tag} onChange={set("asset_tag")} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="edit-category">Category</label>
            <select id="edit-category" value={form.category} onChange={set("category")} className={inputCls}>
              <option value="">No category</option>
              {categoryOptions.map((v) => (<option key={v} value={v}>{v}</option>))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="edit-serial">Serial Number</label>
            <input id="edit-serial" type="text" value={form.serial_number} onChange={set("serial_number")} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="edit-status">Status</label>
            <select id="edit-status" value={form.status} onChange={set("status")} className={inputCls}>
              {statusOptions.map((v) => (<option key={v} value={v}>{v}</option>))}
            </select>
            {isAssigned && form.status !== "assigned" && (
              <p className="text-xs text-amber-600 mt-1">This ends the assignment to {holderOf(asset) || "its holder"}.</p>
            )}
            {!isAssigned && (
              <p className="text-xs text-slate-400 mt-1">Use Assign to give it to someone.</p>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor="edit-condition">Condition</label>
            <select id="edit-condition" value={form.condition} onChange={set("condition")} className={inputCls}>
              <option value="">Not recorded</option>
              {CONDITION_OPTIONS.map((v) => (<option key={v} value={v}>{v}</option>))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="edit-cost">Purchase Price ($)</label>
            <input id="edit-cost" type="number" min="0" value={form.purchase_cost} onChange={set("purchase_cost")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="edit-date">Purchase Date</label>
            <input id="edit-date" type="date" max={todayISO()} value={form.purchase_date} onChange={set("purchase_date")} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="edit-notes">Notes</label>
          <textarea id="edit-notes" rows={2} value={form.notes} onChange={set("notes")} className={`${inputCls} resize-none`} />
        </div>
        <Actions onClose={onClose} busy={busy} submitLabel="Save changes" busyLabel="Saving..." />
      </form>
    </Dialog>
  );
}

// ── Delete (the server refuses an asset someone still holds: return it first) ───────────────────────────────────────
export function DeleteAssetDialog({ asset, onClose, onDeleted }) {
  const { busy, error, run } = useRequest();
  const holder = holderOf(asset);
  return (
    <Dialog title="Delete asset" onClose={onClose} busy={busy}>
      <ErrorLine message={error} />
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Delete <span className="font-semibold">{asset.name}</span> (<span className="font-mono">{tagOf(asset)}</span>)?
        It disappears from the list and its tag can be used again.
      </p>
      {asset.status === "assigned" && (
        <p className="text-xs text-amber-600">It is assigned to {holder || "an employee"}; return it before deleting it.</p>
      )}
      <Actions onClose={onClose} busy={busy} danger submitLabel="Delete" busyLabel="Deleting..."
        onSubmit={async () => { if (await run(() => deleteAsset(asset.id))) onDeleted?.(); }} />
    </Dialog>
  );
}

// ── Return (unassign) ───────────────────────────────────────────────────────────────────────────────────────────────
export function ReturnAssetDialog({ asset, onClose, onReturned }) {
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState("");
  const { busy, error, setError, run } = useRequest();
  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Give a reason for the return.");
      return;
    }
    const payload = { reason: reason.trim(), ...(condition ? { condition } : {}) };
    if (await run(() => returnAsset(asset.id, payload))) onReturned?.();
  };
  return (
    <Dialog title="Return asset" subtitle={`${asset.name} · ${tagOf(asset)} · held by ${holderOf(asset) || "—"}`}
      onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorLine message={error} />
        <div>
          <label className={labelCls} htmlFor="return-reason">Reason *</label>
          <input id="return-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}
            placeholder="e.g. leaving, upgrade, no longer needed" />
        </div>
        <div>
          <label className={labelCls} htmlFor="return-condition">Condition on return</label>
          <select id="return-condition" value={condition} onChange={(e) => setCondition(e.target.value)} className={inputCls}>
            <option value="">Unchanged</option>
            {CONDITION_OPTIONS.map((v) => (<option key={v} value={v}>{v}</option>))}
          </select>
        </div>
        <p className="text-xs text-slate-400">The asset becomes available again.</p>
        <Actions onClose={onClose} busy={busy} submitLabel="Return asset" busyLabel="Returning..." />
      </form>
    </Dialog>
  );
}

// ── Transfer to another active employee ─────────────────────────────────────────────────────────────────────────────
export function TransferAssetDialog({ asset, onClose, onTransferred }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const { items, loading, error: searchError } = useEmployeeOptions(query, { limit: 10 });
  const { busy, error, run } = useRequest();
  const options = items.filter((e) => e.id !== asset.employee_id);
  return (
    <Dialog title="Transfer asset" subtitle={`${asset.name} · ${tagOf(asset)} · held by ${holderOf(asset) || "—"}`}
      onClose={onClose} busy={busy}>
      <ErrorLine message={error || searchError} />
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search active employees..." value={query} autoFocus
          onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
          className="w-full pl-8 pr-3 py-2 border border-slate-200 dark:border-[#334155] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
      </div>
      <div className="max-h-56 overflow-y-auto border border-slate-100 dark:border-[#334155] rounded-xl">
        {loading && options.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">Searching...</p>
        ) : options.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No other active employees match</p>
        ) : options.map((emp) => (
          <button key={emp.id} type="button" onClick={() => setSelected(emp)}
            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between border-b border-slate-50 dark:border-[#334155] last:border-0 transition ${
              selected?.id === emp.id ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-200"
            }`}>
            <span className="min-w-0">
              <span className="font-medium block truncate">{employeeName(emp)}</span>
              {employeeEmail(emp) && <span className="text-xs text-slate-400 block truncate">{employeeEmail(emp)}</span>}
            </span>
            {selected?.id === emp.id && <CheckCircle size={14} className="text-blue-500 flex-shrink-0" />}
          </button>
        ))}
      </div>
      <Actions onClose={onClose} busy={busy} disabled={!selected} submitLabel="Transfer" busyLabel="Transferring..."
        onSubmit={async () => { if (await run(() => transferAsset(asset.id, { employee_id: selected.id }))) onTransferred?.(); }} />
    </Dialog>
  );
}

// ── Categories: create, rename, delete (names are unique per organization; the server's 409 message is shown) ───────
function CategoryRow({ category, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(category.name);
  const { busy, error, setError, run } = useRequest();

  const save = async () => {
    if (!name.trim()) { setError("A category needs a name."); return; }
    if (await run(() => updateAssetCategory(category.id, { name: name.trim(), description: category.description ?? null }))) {
      setEditing(false);
      onChanged?.();
    }
  };
  const remove = async () => {
    if (await run(() => deleteAssetCategory(category.id))) onChanged?.();
    else setConfirming(false);
  };

  return (
    <li className="py-2 space-y-1" data-testid={`category-${category.id}`}>
      <div className="flex items-center gap-2">
        {editing ? (
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} aria-label={`New name for ${category.name}`}
            className="flex-1 border border-slate-200 dark:border-[#334155] rounded-lg px-2 py-1.5 text-sm" autoFocus />
        ) : (
          <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">{category.name}</span>
        )}
        {editing ? (
          <>
            <button type="button" onClick={save} disabled={busy} className="px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg disabled:opacity-40">
              {busy ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => { setEditing(false); setName(category.name); setError(null); }} disabled={busy}
              className="px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/40 rounded-lg disabled:opacity-40">Cancel</button>
          </>
        ) : confirming ? (
          <>
            <span className="text-xs text-slate-500 dark:text-slate-400">Delete?</span>
            <button type="button" onClick={remove} disabled={busy} className="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg disabled:opacity-40">
              {busy ? "Deleting..." : "Yes, delete"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy}
              className="px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/40 rounded-lg disabled:opacity-40">No</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setEditing(true)} aria-label={`Rename ${category.name}`}
              className="px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg">Rename</button>
            <button type="button" onClick={() => setConfirming(true)} aria-label={`Delete ${category.name}`}
              className="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg">Delete</button>
          </>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </li>
  );
}

export function CategoryManagerDialog({ categories = [], onClose, onChanged }) {
  const [name, setName] = useState("");
  const { busy, error, setError, run } = useRequest();
  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Enter a category name."); return; }
    if (await run(() => createAssetCategory({ name: name.trim() }))) {
      setName("");
      onChanged?.();
    }
  };
  return (
    <Dialog title="Asset categories" subtitle="Names are unique within your organization" onClose={onClose} busy={busy}>
      <form onSubmit={add} className="flex items-start gap-2">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name"
          aria-label="New category name" className="flex-1 border border-slate-200 dark:border-[#334155] rounded-xl px-3 py-2 text-sm" />
        <button type="submit" disabled={busy}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60">
          {busy ? "Adding..." : "Add"}
        </button>
      </form>
      <ErrorLine message={error} />
      {categories.length === 0 ? (
        <p className="text-sm text-slate-400">No categories yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-[#334155]">
          {categories.map((c) => (<CategoryRow key={`${c.id}-${c.name}`} category={c} onChanged={onChanged} />))}
        </ul>
      )}
    </Dialog>
  );
}
