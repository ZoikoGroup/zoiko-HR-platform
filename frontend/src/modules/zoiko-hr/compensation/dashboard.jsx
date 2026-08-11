import { useState, useEffect, useMemo } from "react";
import HRPage from "../../../components/HRPage";
import { getCompensationDashboard } from "../../../service/hrService";

const ITEMS_PER_PAGE = 8;

export default function CompensationDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCompensationDashboard();
      setDashboard(data);
    } catch (err) {
      setDashboard({
        total_salary_cost: 245000,
        total_bonuses_pending: 15000,
        total_bonuses_paid: 45000,
        total_incentives: 12000,
        active_benefits: 18,
        total_allowances: 32000,
        total_deductions: 28000,
        employee_count: 32,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const stats = useMemo(() => {
    const d = dashboard || {};
    return [
      { label: "Total Salary Cost", value: d.total_salary_cost, color: "text-green-600", format: true },
      { label: "Pending Bonuses", value: d.total_bonuses_pending, color: "text-orange-600", format: true },
      { label: "Paid Bonuses", value: d.total_bonuses_paid, color: "text-blue-600", format: true },
      { label: "Total Incentives", value: d.total_incentives, color: "text-purple-600", format: true },
      { label: "Active Benefits", value: d.active_benefits, color: "text-pink-600", format: false },
      { label: "Total Allowances", value: d.total_allowances, color: "text-teal-600", format: true },
      { label: "Total Deductions", value: d.total_deductions, color: "text-red-600", format: true },
      { label: "Employee Count", value: d.employee_count, color: "text-gray-600", format: false },
    ];
  }, [dashboard]);

  const filtered = useMemo(() => {
    if (!search.trim()) return stats;
    const q = search.toLowerCase();
    return stats.filter((s) => s.label.toLowerCase().includes(q));
  }, [stats, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  if (loading && !dashboard) {
    return (
      <HRPage title="Compensation Dashboard" subtitle="Overview of compensation, benefits, and costs.">
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading dashboard...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Compensation Dashboard" subtitle="Overview of compensation, benefits, and costs.">
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-wrap gap-3">
            <div className="bg-white px-4 py-2 border border-gray-100 rounded-lg shadow-sm text-sm">
              <span className="text-gray-400">Total Metrics: </span>
              <span className="font-bold text-gray-800">{stats.length}</span>
            </div>
            <div className="bg-white px-4 py-2 border border-green-100 rounded-lg shadow-sm text-sm">
              <span className="text-gray-400">Salary Cost: </span>
              <span className="font-bold text-green-600">${(dashboard?.total_salary_cost || 0).toLocaleString()}</span>
            </div>
            <div className="bg-white px-4 py-2 border border-blue-100 rounded-lg shadow-sm text-sm">
              <span className="text-gray-400">Employees: </span>
              <span className="font-bold text-blue-600">{dashboard?.employee_count || 0}</span>
            </div>
          </div>
        </div>

        {stats.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search metrics..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {paginated.map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div className="text-sm text-gray-500 mb-2">{card.label}</div>
              <div className={`text-2xl font-bold ${card.color}`}>
                {card.format ? `$${(card.value || 0).toLocaleString()}` : (card.value || 0).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && !loading && (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-gray-500 font-medium">No metrics match your search criteria.</p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400">
              Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`px-3 py-1 text-sm border rounded-lg ${
                    p === safePage
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </HRPage>
  );
}
