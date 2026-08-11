import { useState, useEffect, useMemo, useCallback } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import { getWfReports, generateWfReport, exportWfCsv, exportWfExcel, exportWfPdf } from "../../../service/hrService";
import { FileText, Download, Plus, Search, X, Loader } from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/workforce-planning" },
  { label: "Plans", href: "/zoiko-hr/workforce-planning/plans" },
  { label: "Headcount", href: "/zoiko-hr/workforce-planning/headcount" },
  { label: "Succession", href: "/zoiko-hr/workforce-planning/succession" },
  { label: "Reports", href: "/zoiko-hr/workforce-planning/reports" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive ? "text-teal-600 border-b-2 border-teal-600 bg-teal-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

const ITEMS_PER_PAGE = 15;

const REPORT_TYPES = {
  workforce_summary: "Workforce Summary",
  headcount_summary: "Headcount Summary",
  succession_pipeline: "Succession Pipeline",
};

export default function WorkforceReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [genForm, setGenForm] = useState({ report_name: "", report_type: "workforce_summary" });
  const [genError, setGenError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getWfReports({ page: 1, per_page: 100 });
      setReports(res?.items || []);
    } catch (err) { setError(err.message || "Failed to load reports"); setReports([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let result = reports;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) => (r.report_name || "").toLowerCase().includes(q));
    }
    if (typeFilter) result = result.filter((r) => r.report_type === typeFilter);
    return result;
  }, [reports, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [totalPages, currentPage]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!genForm.report_name.trim()) { setGenError("Report name is required"); return; }
    setGenerating(true); setGenError(null);
    try {
      await generateWfReport(genForm);
      setShowGenerate(false);
      await fetchData();
    } catch (err) { setGenError(err.message || "Failed to generate report"); }
    finally { setGenerating(false); }
  };

  const handleExport = async (type, format) => {
    setExporting(`${type}-${format}`);
    try {
      if (format === "csv") await exportWfCsv(type);
      else if (format === "excel") await exportWfExcel(type);
      else if (format === "pdf") await exportWfPdf(type);
    } catch (err) { setError(err.message || `Failed to export ${format}`); }
    finally { setExporting(null); }
  };

  const availableTypes = useMemo(() => {
    const types = new Set(reports.map((r) => r.report_type));
    return [...types];
  }, [reports]);

  return (
    <HRPage title="Workforce Reports" subtitle="Generate and export workforce analytics reports">
      <SubNav />
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Quick Export</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(REPORT_TYPES).map(([type, label]) => (
            <div key={type} className="flex items-center gap-1">
              <span className="text-xs text-gray-500 mr-1">{label}:</span>
              {["csv", "excel", "pdf"].map((fmt) => (
                <button key={fmt} onClick={() => handleExport(type, fmt)} disabled={exporting === `${type}-${fmt}`}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-xs font-medium disabled:opacity-50 transition-colors">
                  {exporting === `${type}-${fmt}` ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search reports..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">All Types</option>
          {availableTypes.map((t) => <option key={t} value={t}>{REPORT_TYPES[t] || t}</option>)}
          {availableTypes.length === 0 && Object.entries(REPORT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={() => { setShowGenerate(true); setGenError(null); setGenForm({ report_name: "", report_type: "workforce_summary" }); }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors ml-auto">
          <Plus size={16} /> Generate Report
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
          <span className="ml-3 text-gray-500">Loading reports...</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Report Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Generated By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Generated At</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {paginated.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">No reports generated yet. Click "Generate Report" to create one.</td></tr>
                ) : paginated.map((r) => (
                  <tr key={r.id} className="hover:bg-amber-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.report_name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        {REPORT_TYPES[r.report_type] || r.report_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.generated_by_name || "System"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {r.generated_at ? new Date(r.generated_at).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > ITEMS_PER_PAGE && (
            <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}</span>
              <div className="flex gap-1">
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const start = Math.max(1, Math.min(safePage - 3, totalPages - 6));
                  return start + i;
                }).map((p) => (
                  <button key={p} onClick={() => setCurrentPage(p)}
                    className={`px-3 py-1 text-sm border rounded-lg ${p === safePage ? "bg-teal-600 text-white border-teal-600" : "border-gray-200 hover:bg-gray-50"}`}>{p}</button>
                ))}
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                  className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowGenerate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Generate Report</h2>
              <button onClick={() => setShowGenerate(false)} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
            </div>
            <form onSubmit={handleGenerate} className="p-6 space-y-4">
              {genError && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{genError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Report Name</label>
                <input type="text" value={genForm.report_name} onChange={(e) => setGenForm((p) => ({ ...p, report_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
                <select value={genForm.report_type} onChange={(e) => setGenForm((p) => ({ ...p, report_type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                  {Object.entries(REPORT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowGenerate(false)}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={generating}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white rounded-lg font-medium transition-colors">
                  {generating && <Loader size={14} className="animate-spin" />}
                  {generating ? "Generating..." : "Generate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HRPage>
  );
}
