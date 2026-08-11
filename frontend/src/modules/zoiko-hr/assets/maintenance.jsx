import { useState, useEffect, useMemo } from "react";
import { getAssets, getMaintenanceByAsset, createMaintenance, resolveMaintenance } from "../../../service/hrService";

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
  { value: "high", label: "High" }, { value: "urgent", label: "Urgent" },
];

const STATUS_OPTIONS = [
  { value: "reported", label: "Reported" }, { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" }, { value: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS = {
  reported: "bg-orange-100 text-orange-800", in_progress: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800", cancelled: "bg-gray-100 text-gray-800",
};

const PRIORITY_COLORS = {
  low: "bg-gray-100 text-gray-700", medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800", urgent: "bg-red-100 text-red-800",
};

const initialForm = { asset_id: "", assetName: "", assetTag: "", issue: "", priority: "medium", reportedBy: "" };

export default function Maintenance() {
  const [assets, setAssets] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [resolveId, setResolveId] = useState(null);
  const [resolution, setResolution] = useState("");
  const [form, setForm] = useState({ ...initialForm });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const fetchAssets = async () => {
    try {
      const data = await getAssets({});
      setAssets(data?.items || (Array.isArray(data) ? data : []));
    } catch (err) {
      setError(err.message || "Failed to load assets");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMaintenance = async (assetId) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMaintenanceByAsset(assetId);
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load maintenance records");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAssets(); }, []);

  useEffect(() => {
    if (selectedAsset) {
      fetchMaintenance(selectedAsset.id);
    } else {
      setRecords([]);
    }
  }, [selectedAsset]);

  const filtered = useMemo(() => {
    let result = records;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        (r.assetName || r.asset_name || "").toLowerCase().includes(q) ||
        (r.assetTag || r.asset_tag || "").toLowerCase().includes(q) ||
        (r.issue || r.description || "").toLowerCase().includes(q) ||
        (r.reportedBy || r.reported_by || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter) result = result.filter((r) => (r.status || "") === statusFilter);
    return result;
  }, [records, search, statusFilter]);

  const validate = (d) => {
    const e = {};
    if (!d.asset_id) e.asset_id = "Please select an asset";
    if (!(d.issue || "").trim()) e.issue = "Issue description is required";
    if (!(d.reportedBy || "").trim()) e.reportedBy = "Reporter name is required";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      await createMaintenance(form.asset_id, {
        asset_id: form.asset_id,
        issue: form.issue.trim(),
        priority: form.priority,
        reported_by: form.reportedBy.trim(),
        reported_on: new Date().toISOString().split("T")[0],
      });
      setShowModal(false);
      setForm({ ...initialForm });
      if (selectedAsset) await fetchMaintenance(selectedAsset.id);
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to report issue" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!resolution.trim()) return;
    setSubmitting(true);
    try {
      await resolveMaintenance(selectedAsset.id, resolveId, {
        status: "resolved",
        resolution: resolution.trim(),
        resolved_on: new Date().toISOString().split("T")[0],
      });
      setResolveId(null);
      setResolution("");
      await fetchMaintenance(selectedAsset.id);
    } catch (err) {
      setError(err.message || "Failed to resolve");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && assets.length === 0) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading assets...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asset Maintenance</h1>
          <p className="text-sm text-gray-500 mt-1">Track and manage asset repairs and maintenance</p>
        </div>
        <button onClick={() => {
          setForm({
            ...initialForm,
            asset_id: selectedAsset?.id || "",
            assetName: selectedAsset?.name || selectedAsset?.asset_name || "",
            assetTag: selectedAsset?.tag || selectedAsset?.asset_tag || "",
          });
          setFormErrors({});
          setShowModal(true);
        }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors">+ Report Issue</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <select
            value={selectedAsset?.id || ""}
            onChange={(e) => {
              const val = e.target.value;
              if (val) {
                const asset = assets.find((a) => a.id === parseInt(val, 10));
                setSelectedAsset(asset);
              } else {
                setSelectedAsset(null);
              }
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="">-- Select an asset --</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.asset_name || ""} - {a.tag || a.asset_tag || ""}
              </option>
            ))}
          </select>
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <input type="text" placeholder="Search by asset, tag, issue, or reporter..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-3 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
        </select>
      </div>

      {!selectedAsset ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 font-medium">Select an asset to view its maintenance records.</p>
        </div>
      ) : filtered.length === 0 && !loading ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 font-medium">{records.length === 0 ? "No maintenance records for this asset." : "No records match your search."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Asset</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tag</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Issue</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reported By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filtered.map((r) => {
                  const name = r.assetName || r.asset_name || "";
                  const tag = r.assetTag || r.asset_tag || "";
                  const issue = r.issue || r.description || "";
                  const priority = r.priority || "medium";
                  const status = r.status || "reported";
                  const reporter = r.reportedBy || r.reported_by || "";
                  const date = r.reportedOn || r.reported_on || r.created_at || "";
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{name}</td>
                      <td className="px-4 py-3 text-sm font-mono text-xs text-amber-600 font-semibold">{tag}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{issue}</td>
                      <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[priority] || "bg-gray-100 text-gray-700"}`}>{priority}</span></td>
                      <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || "bg-gray-100 text-gray-800"}`}>{status.replace(/_/g, " ")}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-700">{reporter}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{date ? new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "-"}</td>
                      <td className="px-4 py-3 text-right">
                        {status !== "resolved" && status !== "cancelled" ? (
                          <button onClick={() => setResolveId(r.id)} className="flex items-center justify-end gap-1 text-xs font-medium text-green-600 hover:text-green-800 transition-colors">
                            &#10003; Resolve
                          </button>
                        ) : <span className="text-xs text-gray-400">-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Report Maintenance Issue</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formErrors.submit && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{formErrors.submit}</div>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Asset *</label>
                <select
                  value={form.asset_id}
                  onChange={(e) => {
                    const assetId = parseInt(e.target.value, 10);
                    const asset = assets.find((a) => a.id === assetId);
                    setForm({
                      ...form,
                      asset_id: assetId,
                      assetName: asset ? (asset.name || asset.asset_name || "") : "",
                      assetTag: asset ? (asset.tag || asset.asset_tag || "") : "",
                    });
                  }}
                  className={`w-full border ${formErrors.asset_id ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">-- Select an asset --</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || a.asset_name || ""} - {a.tag || a.asset_tag || ""}
                    </option>
                  ))}
                </select>
                {formErrors.asset_id && <p className="text-red-500 text-xs mt-1">{formErrors.asset_id}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asset Name</label>
                  <input type="text" value={form.assetName} disabled
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asset Tag</label>
                  <input type="text" value={form.assetTag} disabled
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Issue Description *</label>
                <textarea rows={3} value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })}
                  className={`w-full border ${formErrors.issue ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                {formErrors.issue && <p className="text-red-500 text-xs mt-1">{formErrors.issue}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {PRIORITY_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reported By *</label>
                  <input type="text" value={form.reportedBy} onChange={(e) => setForm({ ...form, reportedBy: e.target.value })}
                    className={`w-full border ${formErrors.reportedBy ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                  {formErrors.reportedBy && <p className="text-red-500 text-xs mt-1">{formErrors.reportedBy}</p>}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Submitting..." : "Report Issue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resolveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Resolve Maintenance</h2>
              <button onClick={() => setResolveId(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleResolve} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resolution Details *</label>
                <textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)}
                  placeholder="Describe how the issue was resolved..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setResolveId(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={!resolution.trim() || submitting} className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Saving..." : "Mark Resolved"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
