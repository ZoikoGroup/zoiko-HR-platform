import { useState, useEffect } from "react";
import { Landmark, TrendingUp, Clock, AlertOctagon, BarChart3, Receipt, AlertTriangle, RefreshCw } from "lucide-react";
import TravelLayout from "./TravelLayout";
import { staffName, asPage } from "../../../utils/travelDisplay";
import TravelPager from "./TravelPager";
import { api } from "../../../service/api";
import { formatMoney, claimState, totalsByCurrency, categoryTotals } from "../../../utils/travelExpenseAdmin";
import { formatDate } from "../../../utils/dateTime";

function MoneyLines({ lines, className = "" }) {
  if (!lines.length) return <p className={className}>{formatMoney(0)}</p>;
  return lines.map((l) => <p key={l.currency} className={className}>{formatMoney(l.amount, l.currency)}</p>);
}

const PER_PAGE = 25;

function safeArray(arr) {
  return Array.isArray(arr) ? arr : [];
}

const lines = (list) => safeArray(list).map((l) => ({ currency: l.currency, amount: Number(l.amount) || 0 }));

function ErrorFallback({ error, onRetry }) {
  return (
    <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-6 text-center max-w-xl mx-auto my-10">
      <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
      <h3 className="text-md font-bold text-gray-800 dark:text-slate-200">Something went wrong</h3>
      <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">{error?.message || "An unexpected error occurred while loading expenses."}</p>
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
  const [page, setPage] = useState(1);

  // one page of claims, plus totals the server works out over every claim (audit T6)
  const fetchExpenses = async ({ silent = false, nextPage = page } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const response = await api.get(`/hr/travel-expenses?page=${nextPage}&per_page=${PER_PAGE}`);
      setRaw(response);
      setPage(nextPage);
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

  const pageData = asPage(raw || [], page, PER_PAGE);
  const expenses = safeArray(pageData.items);
  const serverTotals = raw && !Array.isArray(raw) ? raw.totals : null;

  // the server's totals cover every claim; a plain list (older server) is summed here
  const totalClaimed = serverTotals ? lines(serverTotals.total_claimed) : totalsByCurrency(expenses, ["pending", "approved", "reimbursed"]);
  const approvedValue = serverTotals ? lines(serverTotals.approved) : totalsByCurrency(expenses, ["approved", "reimbursed"]);
  const pendingValue = serverTotals ? lines(serverTotals.pending) : totalsByCurrency(expenses, ["pending"]);
  const rejectedValue = serverTotals ? lines(serverTotals.rejected) : totalsByCurrency(expenses, ["rejected"]);
  const categories = serverTotals
    ? safeArray(serverTotals.categories).map((c) => ({ ...c, amount: Number(c.amount) || 0, label: new Set(safeArray(serverTotals.categories).map((x) => x.currency)).size > 1 ? `${c.label} (${c.currency})` : c.label }))
    : categoryTotals(expenses.filter((e) => claimState(e?.status) !== "rejected"));
  const categoryMax = categories.reduce((m, c) => Math.max(m, c.amount), 0);

  const handleExpenseAction = async (id, status) => {
    if (id == null || actionLoading != null) return;
    setActionLoading(id);
    setMessage(null);
    try {
      const saved = await api.put(`/hr/travel-expenses/${id}`, { status });
      const firstOfTwo = status === "approved" && saved?.awaiting_second_approval;
      setMessage({ ok: true, text: firstOfTwo ? "First approval recorded. A second, different approver must now approve this claim."
        : status === "approved" ? "Claim approved." : status === "rejected" ? "Claim rejected." : "Claim marked as reimbursed." });
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
            <ErrorFallback error={error} onRetry={() => fetchExpenses()} />
          ) : (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">Travel Expenses</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Review employee expense claims and approve or reject reimbursements</p>
              </div>

              {message && (
                <div role={message.ok ? "status" : "alert"} className={`px-4 py-3 rounded-lg text-sm font-medium ${message.ok ? "bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300"}`}>
                  {message.text}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] p-5 shadow-sm">
                  <p className="text-xs font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider">Total Claimed</p>
                  <MoneyLines lines={totalClaimed} className="text-2xl font-black text-gray-900 dark:text-white mt-2" />
                </div>
                <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] p-5 shadow-sm">
                  <p className="text-xs font-bold text-green-500 uppercase tracking-wider">Approved Value</p>
                  <MoneyLines lines={approvedValue} className="text-2xl font-black text-green-600 mt-2" />
                </div>
                <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] p-5 shadow-sm">
                  <p className="text-xs font-bold text-yellow-500 uppercase tracking-wider">Pending Audit</p>
                  <MoneyLines lines={pendingValue} className="text-2xl font-black text-yellow-600 mt-2" />
                </div>
                <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] p-5 shadow-sm">
                  <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Rejected Outlay</p>
                  <MoneyLines lines={rejectedValue} className="text-2xl font-black text-red-600 mt-2" />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#334155] rounded-xl shadow-sm p-5">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Receipt className="w-4 h-4 text-blue-500" /> Transaction Audit Stream</h2>
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-slate-400">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                      <p className="text-sm font-medium">Loading expenses...</p>
                    </div>
                  ) : expenses.length === 0 ? (
                    <div className="text-center py-12">
                      <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm font-medium text-gray-500 dark:text-slate-400">No expenses found</p>
                      <p className="text-xs text-gray-400 dark:text-slate-400 mt-1">Claims submitted by employees will appear here for review.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-[#334155] text-gray-400 dark:text-slate-400 font-bold bg-gray-50/50 dark:bg-[#0f172a]">
                            <th className="p-3">Claimant</th>
                            <th className="p-3">Classification</th>
                            <th className="p-3">Submitted</th>
                            <th className="p-3">Outlay</th>
                            <th className="p-3">State</th>
                            <th className="p-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-[#334155] text-gray-700 dark:text-slate-300 font-medium">
                          {expenses.map((row, idx) => (
                            <tr key={row?.id || idx} className="hover:bg-gray-50/30 dark:hover:bg-[#334155]/50 transition-colors">
                              <td className="p-3 font-semibold text-gray-900 dark:text-white">{staffName(row)}</td>
                              <td className="p-3">
                                <span className="capitalize">{row?.expense_type || row?.category || "General"}</span>
                                {row?.description ? <span className="block text-xs font-normal text-gray-500 dark:text-slate-400 max-w-xs truncate" title={row.description}>{row.description}</span> : null}
                              </td>
                              <td className="p-3 text-xs text-gray-500 dark:text-slate-400">{row?.created_at || row?.submitted_at ? formatDate(row.created_at || row.submitted_at) : "—"}</td>
                              <td className="p-3 font-semibold text-gray-900 dark:text-white">
                                {formatMoney(row?.amount, row?.currency)}
                                {row?.within_policy === false ? (
                                  <span className="block mt-0.5 w-fit px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700" title="Above the daily expense limit in Travel settings. The claim can still be approved.">Over daily limit</span>
                                ) : null}
                              </td>
                              <td className="p-3">
                                {row?.awaiting_second_approval ? (
                                  <span
                                    className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 whitespace-nowrap"
                                    title={row.first_approver_name ? `First approved by ${row.first_approver_name}` : "First approval given"}
                                  >
                                    Awaiting 2nd approval
                                  </span>
                                ) : (() => {
                                  const state = claimState(row?.status);
                                  const tone = state === "approved" ? "bg-green-100 text-green-800" : state === "reimbursed" ? "bg-blue-100 text-blue-800" : state === "pending" ? "bg-yellow-100 text-yellow-800" : state === "cancelled" ? "bg-gray-100 text-gray-600 dark:text-slate-300" : "bg-red-100 text-red-800";
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
                                  <div className="flex flex-wrap items-center justify-center gap-1">
                                    {row?.first_approved_by_me ? (
                                      // the same person cannot give both approvals (audit T16)
                                      <span className="text-xs text-purple-700 dark:text-purple-300 max-w-[12rem]">You gave the first approval; a different approver must give the second.</span>
                                    ) : (
                                      <button
                                        onClick={() => handleExpenseAction(row.id, "approved")}
                                        disabled={actionLoading != null}
                                        className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-700 dark:text-green-300 rounded hover:bg-green-200 disabled:opacity-50 transition-colors"
                                      >
                                        {row?.awaiting_second_approval ? "Give 2nd approval" : "Approve"}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleExpenseAction(row.id, "rejected")}
                                      disabled={actionLoading != null}
                                      className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 dark:text-red-300 rounded hover:bg-red-200 disabled:opacity-50 transition-colors"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400 dark:text-slate-400">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <TravelPager page={page} perPage={PER_PAGE} total={pageData.total} onPage={(p) => fetchExpenses({ nextPage: p })} label="claims" />
                </div>

            <div className="bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200 dark:border-[#334155] shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-500" /> Allocation Breakdown</h2>
              <div className="space-y-4">
                {categories.length === 0 ? (
                  <p className="text-center py-6 text-gray-400 dark:text-slate-400 text-sm">No expense data to categorize.</p>
                ) : (
                  categories.map((cat) => (
                    <div key={cat.label} className="bg-gray-50 dark:bg-[#0f172a] p-3 rounded-lg">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-600 dark:text-slate-300 mb-1 capitalize">
                        <span>{cat.label}</span>
                        <span>{formatMoney(cat.amount, cat.currency)}</span>
                      </div>
                      <div className="h-2 bg-gray-200 dark:bg-[#334155] rounded-full overflow-hidden">
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
