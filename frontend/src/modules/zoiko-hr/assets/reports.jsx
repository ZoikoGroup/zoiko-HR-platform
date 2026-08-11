import { useState, useEffect, useMemo } from "react";
import { FileText, Download, BarChart3, ClipboardList, FileSearch, Archive } from "lucide-react";
import { getAssetReports, createAssetReport } from "../../../service/hrService";

const typeIcons = {
  inventory: Archive, depreciation: BarChart3,
  assignment: ClipboardList, audit_trail: FileSearch,
};

const typeColors = {
  inventory: "bg-blue-50 text-blue-700 border-blue-200",
  depreciation: "bg-purple-50 text-purple-700 border-purple-200",
  assignment: "bg-green-50 text-green-700 border-green-200",
  audit_trail: "bg-orange-50 text-orange-700 border-orange-200",
};

const typeLabels = {
  inventory: "Inventory", depreciation: "Depreciation",
  assignment: "Assignment", audit_trail: "Audit Trail",
};

function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const REPORT_TYPES = [
  { value: "inventory", label: "Inventory Report" },
  { value: "assignment", label: "Asset Allocation Report" },
  { value: "audit_trail", label: "Asset Maintenance Report" },
];

export default function AssetReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);
  const [genForm, setGenForm] = useState({ report_type: "inventory", title: "", description: "" });
  const [genLoading, setGenLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      setLoading(true);
      try {
        const data = await getAssetReports();
        if (mounted) setReports(data?.items || (Array.isArray(data) ? data : []));
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load reports");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    return () => { mounted = false; };
  }, []);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!genForm.title.trim()) return;
    setGenLoading(true);
    try {
      await createAssetReport({
        report_type: genForm.report_type,
        title: genForm.title.trim(),
        description: genForm.description.trim() || null,
      });
      setShowGenerate(false);
      setGenForm({ report_type: "inventory", title: "", description: "" });
      const data = await getAssetReports();
      setReports(data?.items || (Array.isArray(data) ? data : []));
    } catch (err) {
      setError(err.message || "Failed to generate report");
    } finally {
      setGenLoading(false);
    }
  };

  const handleDownload = (report) => {
    if (report.file_url) {
      window.open(report.file_url, "_blank");
    } else {
      const dataStr = JSON.stringify(report, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.title || "report"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const categories = useMemo(() => {
    const types = new Set(reports.map((r) => r.report_type || "").filter(Boolean));
    return [...types];
  }, [reports]);

  const filtered = categoryFilter ? reports.filter((r) => r.report_type === categoryFilter) : reports;

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading reports...</span>
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
          <h1 className="text-2xl font-bold text-gray-900">Asset Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Generate and download asset management reports</p>
        </div>
        <button onClick={() => setShowGenerate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium transition-colors">+ Generate Report</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setCategoryFilter("")}
          className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${!categoryFilter ? "bg-amber-600 text-white border-amber-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
          All
        </button>
        {categories.map((cat) => (
          <button key={cat} onClick={() => setCategoryFilter(cat)}
            className={`px-4 py-1.5 text-sm rounded-lg border capitalize transition-colors ${categoryFilter === cat ? "bg-amber-600 text-white border-amber-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
            {typeLabels[cat] || cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No reports found for this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((report) => {
            const Icon = typeIcons[report.report_type] || FileText;
            const title = report.title || "";
            const desc = report.description || "";
            const date = report.created_at || "";
            return (
              <div key={report.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className={`p-2.5 rounded-lg border ${typeColors[report.report_type] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm mb-1">{title}</h3>
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{desc}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{formatDate(date)}</span>
                      </div>
                      <button onClick={() => handleDownload(report)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                        <Download className="w-3.5 h-3.5" /> Download
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Generate Report</h2>
              <button onClick={() => setShowGenerate(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleGenerate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Report Type *</label>
                <select value={genForm.report_type} onChange={(e) => setGenForm({ ...genForm, report_type: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                  {REPORT_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input type="text" value={genForm.title} onChange={(e) => setGenForm({ ...genForm, title: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea rows={3} value={genForm.description} onChange={(e) => setGenForm({ ...genForm, description: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowGenerate(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={!genForm.title.trim() || genLoading} className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white rounded-lg font-medium transition-colors">
                  {genLoading ? "Generating..." : "Generate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
