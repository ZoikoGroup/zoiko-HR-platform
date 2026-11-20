import { useState, useEffect } from "react";
import { Building2, FileText, CheckCircle, Clock, AlertTriangle, PieChart, Landmark } from "lucide-react";
import TravelLayout from "./TravelLayout";
import { staffName } from "../../../utils/travelDisplay";
import { formatMoney } from "../../../utils/travelExpenseAdmin";
import {api} from "../../../service/api";

// Money is shown per currency, never added across currencies (audit T9).
const moneyLines = (list) => (Array.isArray(list) ? list : []).map((l) => ({ currency: l.currency || "INR", amount: Number(l.amount) || 0 }));

function MoneyLines({ lines, className = "" }) {
  if (!lines.length) return <p className={className}>{formatMoney(0)}</p>;
  return lines.map((l) => <p key={l.currency} className={className}>{formatMoney(l.amount, l.currency)}</p>);
}

function getDestinationDisplay(dest) {
  if (!dest) return "—";
  if (typeof dest === "string") return dest;
  if (typeof dest === "object") {
    return dest.city || dest.name || dest.location || JSON.stringify(dest);
  }
  return "—";
}

export default function TravelDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadDashboardMetrics() {
      try {
        setLoading(true);
        setError(null);
        
        const dashboardRes = await api.get("/hr/travel/dashboard");
        const dashboardData = dashboardRes || {};
        
        const travelRes = await api.get("/hr/travel?page=1&per_page=5&search=");
        const requests = travelRes?.items || travelRes || [];
        
        const expenseRes = await api.get("/hr/travel-expenses?page=1&per_page=5&search=");
        const expenses = expenseRes?.items || expenseRes || [];

        setData({
          totalRequests: dashboardData.total_requests || 0,
          pendingApprovals: dashboardData.pending_requests || 0,
          approvedRequests: dashboardData.approved_requests || 0,
          approvedExpenses: moneyLines(dashboardData.approved_expenses_by_currency),
          reimbursedExpenses: moneyLines(dashboardData.reimbursed_expenses_by_currency),
          recentRequests: requests,
          categories: (Array.isArray(dashboardData.expenses_by_category) ? dashboardData.expenses_by_category : []),
          upcomingItineraries: requests.filter(r => r.status?.toLowerCase() === "approved").slice(0, 3)
        });
      } catch (err) {
        console.error("Dashboard compilation failed:", err);
        setError("Unable to sync metrics with live servers. Please retry.");
      } finally {
        setLoading(false);
      }
    }
    loadDashboardMetrics();
  }, []);

  return (
    <TravelLayout title="Travel" subtitle="Manage travel requests and expenses">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">Retrieving operational records...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-6 text-center max-w-xl mx-auto my-10">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h3 className="text-md font-bold text-gray-800 dark:text-slate-200">Connection Interrupted</h3>
          <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">{error}</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-400">Total Bookings</p>
                  <p className="text-3xl font-black text-gray-900 dark:text-white mt-2">{data.totalRequests}</p>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-xl"><Building2 className="w-5 h-5" /></div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-400">Awaiting Action</p>
                  <p className="text-3xl font-black text-yellow-600 mt-2">{data.pendingApprovals}</p>
                </div>
                <div className="p-3 bg-yellow-50 dark:bg-yellow-950/40 text-yellow-600 rounded-xl"><Clock className="w-5 h-5" /></div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-400">Confirmed Trips</p>
                  <p className="text-3xl font-black text-green-600 mt-2">{data.approvedRequests}</p>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-950/40 text-green-600 rounded-xl"><CheckCircle className="w-5 h-5" /></div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-400">Approved Expenses</p>
                  <MoneyLines lines={data.approvedExpenses} className="text-2xl font-black text-blue-600 mt-2" />
                  {data.reimbursedExpenses.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Reimbursed: {data.reimbursedExpenses.map((l) => formatMoney(l.amount, l.currency)).join(" · ")}</p>
                  )}
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-xl"><Landmark className="w-5 h-5" /></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] shadow-sm p-6">
              <h3 className="text-md font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-500" /> Recent Itinerary Requests</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-[#334155] text-gray-400 dark:text-slate-400 font-semibold bg-gray-50/50 dark:bg-[#0f172a]">
                      <th className="py-3 px-4 rounded-l-lg">Employee</th>
                      <th className="py-3 px-4">Destination</th>
                      <th className="py-3 px-4">Dates</th>
                      <th className="py-3 px-4 rounded-r-lg">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-[#334155] font-medium">
                    {data.recentRequests.map((r, i) => (
                      <tr key={r.id || i} className="hover:bg-gray-50/50 dark:hover:bg-[#334155]/50 transition-colors">
                        <td className="py-3.5 px-4 text-gray-900 dark:text-white">{staffName(r)}</td>
                        <td className="py-3.5 px-4 text-gray-600 dark:text-slate-300">{getDestinationDisplay(r.destination)}</td>
                        <td className="py-3.5 px-4 text-gray-600 dark:text-slate-300">{r.start_date || "—"} — {r.end_date || "—"}</td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-full capitalize ${
                            r.status?.toLowerCase() === 'approved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>{r.status || 'Pending'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] shadow-sm p-6">
              <h3 className="text-md font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><PieChart className="w-4 h-4 text-blue-500" /> Expense Aggregations</h3>
              <div className="space-y-4">
                {data.categories.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-slate-400 text-center py-10">No expense claims yet.</p>
                ) : (
                  data.categories.map((c) => (
                    <div key={`${c.label}-${c.currency}`} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-[#0f172a] rounded-lg">
                      <span className="text-sm font-semibold text-gray-600 dark:text-slate-300 capitalize">{c.label}</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{formatMoney(c.amount, c.currency)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </TravelLayout>
  );
}
