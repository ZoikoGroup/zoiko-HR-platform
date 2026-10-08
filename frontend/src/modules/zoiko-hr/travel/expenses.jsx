import { useState, useEffect } from "react";
import { Landmark, TrendingUp, Clock, AlertOctagon, BarChart3, Receipt, AlertTriangle, RefreshCw } from "lucide-react";
import TravelLayout from "./TravelLayout";
import { staffName, indexById } from "../../../utils/travelDisplay";
import { api } from "../../../service/api";
import { formatMoney, claimState, totalsByCurrency, categoryTotals } from "../../../utils/travelExpenseAdmin";
import { formatDate } from "../../../utils/dateTime";

function MoneyLines({ lines, className = "" }) {
  if (!lines.length) return <p className={className}>{formatMoney(0)}</p>;
  return lines.map((l) => <p key={l.currency} className={className}>{formatMoney(l.amount, l.currency)}</p>);
}

function safeArray(arr) {
  return Array.isArray(arr) ? arr : [];
}

function getEmployeeDisplay(emp) {
  if (!emp) return "Unknown";
  if (typeof emp === "string") return emp;
  if (typeof emp === "object") {
    const fullName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
    return fullName || emp.full_name || emp.name || emp.email || "Unknown";
  }
  return "Unknown";
}

function getDestinationDisplay(dest) {
  if (!dest) return "—";
  if (typeof dest === "string") return dest;
  if (typeof dest === "object") {
    return dest.city || dest.name || dest.location || JSON.stringify(dest);
  }
  return "—";
}

function ErrorFallback({ error, onRetry }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-xl mx-auto my-10">
      <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
      <h3 className="text-md font-bold text-gray-800">Something went wrong</h3>
      <p className="text-sm text-gray-600 mt-1">{error?.message || "An unexpected error occurred while loading expenses."}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      )}
    </div>
  );
}

export default function TravelExpenses() {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState(null);

  const fetchExpenses = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const response = await api.get("/hr/travel-expenses?page=1&per_page=100&search=");
      setRaw(response);
    } catch (err) {
      console.error("Error connecting with expenses catalog schema:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const expenses = safeArray(raw?.items || raw);

  const totalClaimed = totalsByCurrency(expenses, ["pending", "approved", "reimbursed"]);
  const approvedValue = totalsByCurrency(expenses, ["approved", "reimbursed"]);
  const pendingValue = totalsByCurrency(expenses, ["pending"]);
  const rejectedValue = totalsByCurrency(expenses, ["rejected"]);
  const categories = categoryTotals(expenses.filter((e) => claimState(e?.status) !== "rejected"));
  const categoryMax = categories.reduce((m, c) => Math.max(m, c.amount), 0);

  const handleExpenseAction = async (id, status) => {
    if (id == null || actionLoading != null) return;
    setActionLoading(id);
    setMessage(null);
    try {
      await api.put(`/hr/travel-expenses/${id}`, { status });
      setMessage({ ok: true, text: status === "approved" ? "Claim approved." : status === "rejected" ? "Claim rejected." : "Claim marked as reimbursed." });
      setTimeout(() => setMessage(null), 3000);
      await fetchExpenses({ silent: true });
    } catch (err) {
      setMessage({ ok: false, text: err?.message || "The claim could not be updated." });
    } finally {
      setActionLoading(null);
    }
  };

  return (
        <TravelLayout title="Travel" subtitle="Manage travel expenses and reimbursements">
          {error ? (
            <ErrorFallback error={error} onRetry={fetchExpenses} />
          ) : (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-black text-gray-900">Travel Expenses</h1>
                <p className="text-sm text-gray-500 mt-0.5">Review employee expense claims and approve or reject reimbursements</p>
              </div>

              {message && (
                <div role={message.ok ? "status" : "alert"} className={`px-4 py-3 rounded-lg text-sm font-medium ${message.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                  {message.text}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Claimed</p>
                  <MoneyLines lines={totalClaimed} className="text-2xl font-black text-gray-900 mt-2" />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-xs font-bold text-green-500 uppercase tracking-wider">Approved Value</p>
                  <MoneyLines lines={approvedValue} className="text-2xl font-black text-green-600 mt-2" />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-xs font-bold text-yellow-500 uppercase tracking-wider">Pending Audit</p>
                  <MoneyLines lines={pendingValue} className="text-2xl font-black text-yellow-600 mt-2" />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Rejected Outlay</p>
                  <MoneyLines lines={rejectedValue} className="text-2xl font-black text-red-600 mt-2" />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm p-5">
                  <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2"><Receipt className="w-4 h-4 text-blue-500" /> Transaction Audit Stream</h2>
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                      <p className="text-sm font-medium">Loading expenses...</p>
                    </div>
                  ) : expenses.length === 0 ? (
                    <div className="text-center py-12">
                      <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm font-medium text-gray-500">No expenses found</p>
                      <p className="text-xs text-gray-400 mt-1">Claims submitted by employees will appear here for review.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100 text-gray-400 font-bold bg-gray-50/50">
                            <th className="p-3">Claimant</th>
                            <th className="p-3">Classification</th>
                            <th className="p-3">Submitted</th>
                            <th className="p-3">Outlay</th>
                            <th className="p-3">State</th>
                            <th className="p-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-gray-700 font-medium">
                          {expenses.map((row, idx) => (
                            <tr key={row?.id || idx} className="hover:bg-gray-50/30 transition-colors">
                              <td className="p-3 font-semibold text-gray-900">{staffName(row)}</td>
                              <td className="p-3">
                                <span className="capitalize">{row?.expense_type || row?.category || "General"}</span>
                                {row?.description ? <span className="block text-xs font-normal text-gray-500 max-w-xs truncate" title={row.description}>{row.description}</span> : null}
                              </td>
                              <td className="p-3 text-xs text-gray-500">{row?.created_at || row?.submitted_at ? formatDate(row.created_at || row.submitted_at) : "—"}</td>
                              <td className="p-3 font-semibold text-gray-900">{formatMoney(row?.amount, row?.currency)}</td>
                              <td className="p-3">
                                {(() => {
                                  const state = claimState(row?.status);
                                  const tone = state === "approved" ? "bg-green-100 text-green-800" : state === "reimbursed" ? "bg-blue-100 text-blue-800" : state === "pending" ? "bg-yellow-100 text-yellow-800" : state === "cancelled" ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-800";
                                  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${tone}`}>{state}</span>;
                                })()}
                              </td>
                              <td className="p-3 text-center">
                                {claimState(row?.status) === "approved" ? (
                                  <button
                                    onClick={() => handleExpenseAction(row.id, "completed")}
                                    disabled={actionLoading != null}
                                    className="px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 transition-colors"
                                  >
                                    Mark reimbursed
                                  </button>
                                ) : claimState(row?.status) === "pending" ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => handleExpenseAction(row.id, "approved")}
                                      disabled={actionLoading != null}
                                      className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50 transition-colors"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleExpenseAction(row.id, "rejected")}
                                      disabled={actionLoading != null}
                                      className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 transition-colors"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-500" /> Allocation Breakdown</h2>
              <div className="space-y-4">
                {categories.length === 0 ? (
                  <p className="text-center py-6 text-gray-400 text-sm">No expense data to categorize.</p>
                ) : (
                  categories.map((cat) => (
                    <div key={cat.label} className="bg-gray-50 p-3 rounded-lg">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-600 mb-1 capitalize">
                        <span>{cat.label}</span>
                        <span>{formatMoney(cat.amount, cat.currency)}</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${categoryMax > 0 ? (cat.amount / categoryMax) * 100 : 0}%` }}
                        />
                      </div>
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
