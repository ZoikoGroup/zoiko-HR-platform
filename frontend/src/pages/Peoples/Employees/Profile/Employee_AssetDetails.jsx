import { useState, useEffect, useRef } from "react";
import {
  Monitor, Laptop, CreditCard, Headphones, Mouse, Keyboard,
  Plus, X, Clock, CheckCircle, XCircle, AlertCircle, ChevronDown, Loader2, Bell
} from "lucide-react";
import { getMyProfile, getMyAssets, getAssetRequests, createAssetRequest, getRequestableAssetTypes } from "../../../../service/employee";
import SearchableSelect from "../../../../components/SearchableSelect";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";

// QA bug 19: the asset list is the organisation's own assets (Assets page), read from /hr/assets/requestable-types —
// no fixed list of laptops, webcams … the organisation may not have.
const PRIORITIES = ["Low", "Medium", "High"];

const iconMap = {
  Laptop, Monitor: Monitor, Keyboard, Mouse,
  "ID Card": CreditCard, Headset: Headphones,
  Webcam: Monitor, "Docking Station": Monitor,
};

const conditionConfig = {
  new: "bg-green-50 text-green-700 border border-green-200",
  good: "bg-blue-50 text-blue-700 border border-blue-200",
  fair: "bg-amber-50 text-amber-700 border border-amber-200",
  poor: "bg-orange-50 text-orange-700 border border-orange-200",
  damaged: "bg-red-50 text-red-700 border border-red-200",
};

const statusColors = {
  assigned: "bg-emerald-50 text-emerald-600",
  available: "bg-slate-100 text-slate-600",
  maintenance: "bg-amber-50 text-amber-600",
  retired: "bg-red-50 text-red-600",
  lost: "bg-red-50 text-red-600",
  broken: "bg-red-50 text-red-600",
};

const colorMap = {
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
  amber: "bg-amber-50 text-amber-600 border-amber-100",
};

const statusConfig = {
  pending: { icon: Clock, class: "bg-amber-50 text-amber-700 border border-amber-200" },
  approved: { icon: CheckCircle, class: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  rejected: { icon: XCircle, class: "bg-red-50 text-red-700 border border-red-200" },
  fulfilled: { icon: CheckCircle, class: "bg-blue-50 text-blue-700 border border-blue-200" },
};

const priorityConfig = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-50 text-blue-600",
  high: "bg-red-50 text-red-600",
};

const emptyForm = { assetType: "", reason: "", priority: "Medium" };

const assetColors = ["blue", "blue", "emerald", "amber"];

export default function AssetDetails() {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [requests, setRequests] = useState([]);
  const [assignedAssets, setAssignedAssets] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [employeeId, setEmployeeId] = useState(null);
  const [assetTypes, setAssetTypes] = useState(null);          // null while loading; [{ name, total, available }]
  const [assetTypesError, setAssetTypesError] = useState(null);
  const mounted = useRef(true);

  // the list is read each time the dialog opens, so an asset the admin has just added is there
  useEffect(() => {
    if (!showModal) return;
    let live = true;
    setAssetTypes(null);
    setAssetTypesError(null);
    getRequestableAssetTypes()
      .then((res) => {
        if (!live) return;
        const items = res?.items || res?.data?.items || (Array.isArray(res) ? res : []);
        setAssetTypes(Array.isArray(items) ? items : []);
      })
      .catch((err) => {
        if (!live) return;
        setAssetTypes([]);
        setAssetTypesError(err?.message || "Your organisation's assets could not be loaded.");
      });
    return () => { live = false; };
  }, [showModal]);

  const assetOptions = (assetTypes || []).map((t) => ({ value: t.name, label: t.name, available: t.available || 0 }));
  const noAssets = Array.isArray(assetTypes) && assetTypes.length === 0 && !assetTypesError;

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);

    getMyProfile()
      .then((res) => {
        if (!mounted.current) return;
        const p = res.data || res;
        const eid = p.id || p._id || p.employeeId || p.employeeCode;
        setEmployeeId(eid);
        return Promise.all([
          getMyAssets(eid).catch(() => []),
          getAssetRequests({ employee_id: eid }).catch(() => ({ data: [] })),
        ]);
      })
      .then(([assetsRes, reqsRes]) => {
        if (!mounted.current) return;
        const assets = assetsRes?.items || assetsRes?.data || (Array.isArray(assetsRes) ? assetsRes : []);
        const reqs = reqsRes?.items || reqsRes?.data || (Array.isArray(reqsRes) ? reqsRes : []);
        setAssignedAssets(Array.isArray(assets) ? assets : []);
        setRequests(Array.isArray(reqs) ? reqs : []);
      })
      .catch((err) => {
        if (mounted.current) setError(err?.message || "Failed to load asset details");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });

    return () => { mounted.current = false; };
  }, []);

  const validate = () => {
    const e = {};
    if (!form.assetType) e.assetType = "Select an asset";
    else if (!assetOptions.some((o) => o.value === form.assetType)) e.assetType = "Select one of your organisation's assets";
    if (!form.reason.trim() || form.reason.length < 10) e.reason = "Provide at least 10 characters";
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSubmitting(true);
    setErrors({});
    setSuccess(null);
    createAssetRequest({
      asset_type: form.assetType,
      reason: form.reason,
      priority: form.priority.toLowerCase(),
      requested_on: new Date().toISOString().split("T")[0],
    })
      .then((res) => {
        if (!mounted.current) return;
        // The api client returns the saved request itself (not {data}); show exactly what the server stored, never a
        // made-up row, then re-read the list so it matches the server.
        const created = res?.id ? res : res?.data?.id ? res.data : null;
        if (created) setRequests((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
        getAssetRequests(employeeId ? { employee_id: employeeId } : {})
          .then((list) => {
            if (!mounted.current) return;
            const reqs = list?.items || list?.data || (Array.isArray(list) ? list : null);
            if (Array.isArray(reqs)) setRequests(reqs);
          })
          .catch(() => {});
        setForm(emptyForm);
        setShowModal(false);
        setSuccess("Your asset request has been submitted successfully! It is under process and will be reviewed by the admin.");
        setTimeout(() => { if (mounted.current) setSuccess(null); }, 5000);
      })
      .catch((err) => {
        if (mounted.current) setErrors({ _api: err?.message || "Failed to submit request" });
      })
      .finally(() => {
        if (mounted.current) setSubmitting(false);
      });
  };

  if (loading) {
    return (
      <EmployeePageShell title="Asset Details" subtitle="Profile">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          <span className="ml-3 text-sm text-slate-500 dark:text-[#94a3b8] font-medium">Loading asset details...</span>
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="Asset Details" subtitle="Profile">
      <div className="max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 dark:text-[#94a3b8] uppercase tracking-widest font-semibold">Profile</p>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-[#f1f5f9] mt-1">Asset Details</h1>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-xl transition shadow-sm shadow-blue-200"
          >
            <Plus size={16} /> Request Asset
          </button>
        </div>

        {success && (
          <div className="mb-6 flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 text-emerald-700 dark:text-emerald-300 text-sm font-semibold">
            <Bell size={16} /> {success}
          </div>
        )}

        {error && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm font-semibold">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Assigned Assets Grid */}
        <section className="mb-8">
          <h2 className="text-xs font-bold text-slate-500 dark:text-[#94a3b8] uppercase tracking-widest mb-4">Currently Assigned</h2>
          {assignedAssets.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-100 dark:border-[#334155] shadow-sm text-slate-400 dark:text-[#94a3b8] text-sm font-medium">
              No assets assigned to you.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {assignedAssets.map((asset, idx) => {
                const Icon = iconMap[asset.category] || Monitor;
                return (
                  <div key={asset.id || idx} className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-100 dark:border-[#334155] shadow-sm p-5 hover:shadow-md transition flex flex-col">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`inline-flex p-2.5 rounded-xl border ${colorMap[assetColors[idx % 4]]}`}>
                        <Icon size={20} />
                      </div>
                      {asset.status && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[asset.status] || statusColors.available}`}>
                          {asset.status ? asset.status.charAt(0).toUpperCase() + asset.status.slice(1) : "Available"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-slate-800 dark:text-[#f1f5f9]">{asset.name}</p>
                    {asset.category && <p className="text-xs text-slate-400 dark:text-[#94a3b8] font-semibold uppercase tracking-wide mt-0.5">{asset.category}</p>}
                    <div className="mt-2 space-y-1 flex-1">
                      {asset.asset_tag && <p className="text-xs text-slate-400 dark:text-[#94a3b8] font-mono">Tag: {asset.asset_tag}</p>}
                      {asset.serial_number && <p className="text-xs text-slate-400 dark:text-[#94a3b8] font-mono">SN: {asset.serial_number}</p>}
                      {asset.department && <p className="text-xs text-slate-400 dark:text-[#94a3b8]">{asset.department}</p>}
                    </div>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      {asset.condition && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${conditionConfig[asset.condition] || conditionConfig.good}`}>
                          {asset.condition ? asset.condition.charAt(0).toUpperCase() + asset.condition.slice(1) : "Good"}
                        </span>
                      )}
                      {asset.assigned_date && (
                        <span className="text-xs text-slate-400 dark:text-[#94a3b8] flex items-center gap-1">
                          <Clock size={11} /> {new Date(asset.assigned_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      )}
                    </div>
                    {asset.notes && <p className="text-xs text-slate-400 dark:text-[#94a3b8] mt-2 italic leading-relaxed line-clamp-2">{asset.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Past Requests Table */}
        <section>
          <h2 className="text-xs font-bold text-slate-500 dark:text-[#94a3b8] uppercase tracking-widest mb-4">Request History</h2>
          {requests.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-100 dark:border-[#334155] shadow-sm text-slate-400 dark:text-[#94a3b8] text-sm font-medium">
              No asset requests yet.
            </div>
          ) : (
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-100 dark:border-[#334155] shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-[#334155]">
                      {["Asset", "Reason", "Priority", "Date", "Status"].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-bold text-slate-400 dark:text-[#94a3b8] uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((req) => {
                      const StatusIcon = statusConfig[req.status]?.icon || Clock;
                      return (
                        <tr key={req.id || req._id} className="border-b border-slate-50 dark:border-[#334155] hover:bg-slate-50/60 dark:hover:bg-[#0f172a]/60 transition">
                          <td className="px-5 py-3.5 font-semibold text-slate-800 dark:text-[#f1f5f9]">{req.asset_type}</td>
                          <td className="px-5 py-3.5 text-slate-500 dark:text-[#94a3b8] max-w-[200px] truncate">{req.reason}</td>
                          <td className="px-5 py-3.5">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${priorityConfig[req.priority] || priorityConfig.medium}`}>
                              {req.priority.charAt(0).toUpperCase() + req.priority.slice(1)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-400 dark:text-[#94a3b8] text-xs">{req.requested_on ? new Date(req.requested_on).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${statusConfig[req.status]?.class || statusConfig.pending.class}`}>
                              <StatusIcon size={12} /> {req.status ? req.status.charAt(0).toUpperCase() + req.status.slice(1) : "Pending"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Request Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-[#334155]">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-[#f1f5f9]">Request New Asset</h2>
                <p className="text-xs text-slate-400 dark:text-[#94a3b8] mt-0.5">Submit a request to your IT team</p>
              </div>
              <button aria-label="Close" onClick={() => { setShowModal(false); setErrors({}); }} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#0f172a] text-slate-400 dark:text-[#94a3b8] transition">
                <X size={18} />
              </button>
            </div>

            {errors._api && (
              <div className="mx-6 mt-4 flex items-center gap-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm font-semibold">
                <AlertCircle size={14} /> {errors._api}
              </div>
            )}

            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="asset-request-type" className="text-xs font-semibold text-slate-500 dark:text-[#94a3b8] uppercase tracking-wide block mb-1.5">Asset</label>
                {assetTypes === null ? (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-[#334155] bg-slate-50 dark:bg-[#0f172a] px-3 py-2.5 text-sm text-slate-500 dark:text-[#94a3b8]">
                    <Loader2 size={14} className="animate-spin" /> Loading your organisation's assets…
                  </div>
                ) : assetTypesError ? (
                  <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{assetTypesError}</p>
                ) : noAssets ? (
                  <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                    Your organisation has not added any assets yet, so there is nothing to request. Ask your HR or IT admin.
                  </p>
                ) : (
                  <SearchableSelect
                    id="asset-request-type"
                    value={form.assetType}
                    onChange={(v) => { setForm((p) => ({ ...p, assetType: v })); setErrors((er) => ({ ...er, assetType: undefined })); }}
                    options={assetOptions}
                    placeholder="Select asset..."
                    searchLabel="Search assets"
                    searchPlaceholder="Search assets…"
                    listLabel="Your organisation's assets"
                    noMatchText="No asset matches"
                    invalid={!!errors.assetType}
                    describedBy={errors.assetType ? "asset-request-type-error" : undefined}
                    renderOption={(o) => (
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                        <span className="truncate">{o.label}</span>
                        <span className={`shrink-0 text-xs ${o.available ? "text-emerald-600" : "text-slate-400"}`}>
                          {o.available ? `${o.available} available` : "None free now"}
                        </span>
                      </span>
                    )}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-[#e2e8f0] bg-slate-50 dark:bg-[#0f172a] outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition ${errors.assetType ? "border-red-300" : "border-slate-200 dark:border-[#334155]"}`}
                  />
                )}
                {errors.assetType && <p id="asset-request-type-error" className="text-xs text-red-500 mt-1">{errors.assetType}</p>}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-[#94a3b8] uppercase tracking-wide block mb-1.5">Reason for Request</label>
                <textarea
                  rows={3}
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-[#e2e8f0] bg-slate-50 dark:bg-[#0f172a] outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 focus:bg-white dark:focus:bg-[#0f172a] transition resize-none ${errors.reason ? "border-red-300" : "border-slate-200 dark:border-[#334155]"}`}
                  placeholder="Describe why you need this asset..."
                  value={form.reason}
                  onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                />
                {errors.reason && <p className="text-xs text-red-500 mt-1">{errors.reason}</p>}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-[#94a3b8] uppercase tracking-wide block mb-1.5">Priority</label>
                <div className="flex gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      onClick={() => setForm((prev) => ({ ...prev, priority: p }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${
                        form.priority === p
                          ? p === "High" ? "bg-red-500 text-white border-red-500"
                            : p === "Medium" ? "bg-blue-500 text-white border-blue-500"
                            : "bg-slate-700 text-white border-slate-700"
                          : "bg-slate-50 dark:bg-[#0f172a] text-slate-500 dark:text-[#94a3b8] border-slate-200 dark:border-[#334155] hover:bg-slate-100 dark:hover:bg-[#0f172a]/80"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 pt-0 flex gap-3">
              <button onClick={() => { setShowModal(false); setErrors({}); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-[#334155] text-sm font-semibold text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#0f172a] transition">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !assetOptions.length}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold transition shadow-sm shadow-blue-200 flex items-center justify-center gap-2"
              >
                {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting...</> : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </EmployeePageShell>
  );
}
