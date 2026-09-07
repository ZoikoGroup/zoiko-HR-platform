import { useState, useCallback, useEffect } from "react";
import { Webhook, AlertTriangle, CheckCircle, XCircle, Clock, Search, RefreshCw, Eye, X, Play } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { billingService } from "../../service/billingService";

const PAGE_SIZE = 50;

export default function BillingWebhookEventsPage() {
  const [events, setEvents] = useState([]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all"); // all, processed, failed
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [replayingId, setReplayingId] = useState(null);

  const loadData = useCallback(async (currentLimit) => {
    setLoading(true);
    setError(null);
    try {
      const data = await billingService.listWebhookEvents(currentLimit);
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to load webhook events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(limit); }, [limit, loadData]);

  const handleLoadMore = () => setLimit((l) => l + PAGE_SIZE);

  const handleReplay = async (stripeEventId) => {
    setReplayingId(stripeEventId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await billingService.replayWebhookEvent(stripeEventId);
      setSuccessMsg(res.message || `Event ${stripeEventId} replayed successfully!`);
      await loadData(limit);
      if (selectedEvent && selectedEvent.stripe_event_id === stripeEventId) {
        setSelectedEvent(null);
      }
    } catch (e) {
      setError(e.message || "Replay failed");
    } finally {
      setReplayingId(null);
    }
  };

  const filteredEvents = events.filter((ev) => {
    if (statusFilter === "processed" && !ev.processed) return false;
    if (statusFilter === "failed" && ev.processed) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchType = (ev.event_type || "").toLowerCase().includes(term);
      const matchId = (ev.stripe_event_id || "").toLowerCase().includes(term);
      if (!matchType && !matchId) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Webhook Events"
        description="Recent Stripe webhook events received by the platform, with payload inspection and replay capabilities."
      />

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 underline text-xs font-semibold">Dismiss</button>
        </div>
      )}

      {successMsg && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 text-sm flex items-center gap-3">
          <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-700 underline text-xs font-semibold">Dismiss</button>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        {/* Header & Controls */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Webhook className="h-5 w-5 text-[#3B82F6]" /> Webhook Events ({filteredEvents.length})
            </h3>
            <button
              onClick={() => loadData(limit)}
              disabled={loading}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Status Filter Tabs */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"}`}
              >
                All ({events.length})
              </button>
              <button
                onClick={() => setStatusFilter("processed")}
                className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === "processed" ? "bg-white text-emerald-700 shadow-sm" : "hover:text-slate-900"}`}
              >
                Processed ({events.filter((e) => e.processed).length})
              </button>
              <button
                onClick={() => setStatusFilter("failed")}
                className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === "failed" ? "bg-white text-red-700 shadow-sm" : "hover:text-slate-900"}`}
              >
                Failed ({events.filter((e) => !e.processed).length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search type or event ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] w-full sm:w-56"
              />
            </div>
          </div>
        </div>

        {/* Table Content */}
        {loading && events.length === 0 ? (
          <div className="text-center py-12 text-slate-400">Loading webhook events...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Webhook className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No matching webhook events recorded
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Event ID</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created At</th>
                    <th className="py-3 px-4">Processed At</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEvents.map((ev) => (
                    <tr key={ev.id} className="text-sm hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-4 font-mono text-xs text-slate-700 font-semibold">{ev.stripe_event_id}</td>
                      <td className="py-4 px-4 font-medium text-slate-800">{ev.event_type}</td>
                      <td className="py-4 px-4">
                        {ev.processed ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                            <CheckCircle size={12} /> Processed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700" title={ev.error_message || undefined}>
                            <XCircle size={12} /> Failed
                          </span>
                        )}
                        {!ev.processed && ev.error_message && (
                          <p className="mt-1 text-xs text-red-500 max-w-xs truncate" title={ev.error_message}>{ev.error_message}</p>
                        )}
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-slate-400" /> {ev.created_at ? new Date(ev.created_at).toLocaleString() : "—"}</span>
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-500">{ev.processed_at ? new Date(ev.processed_at).toLocaleString() : "—"}</td>
                      <td className="py-4 px-4 text-right space-x-2">
                        <button
                          onClick={() => setSelectedEvent(ev)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Eye size={13} /> Inspect
                        </button>
                        <button
                          onClick={() => handleReplay(ev.stripe_event_id)}
                          disabled={replayingId === ev.stripe_event_id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
                        >
                          <Play size={12} className={replayingId === ev.stripe_event_id ? "animate-spin" : ""} /> {replayingId === ev.stripe_event_id ? "Replaying..." : "Replay"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Showing {filteredEvents.length} of {events.length} loaded events.
              </span>
              {events.length >= limit && (
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {loading ? "Loading..." : `Load more (+${PAGE_SIZE})`}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Event Details Drawer/Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Webhook className="h-5 w-5 text-[#3B82F6]" /> Payload Inspector
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedEvent.stripe_event_id}</p>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Event Type</span>
                <span className="font-semibold text-slate-800">{selectedEvent.event_type}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Status</span>
                <span className={`font-semibold ${selectedEvent.processed ? "text-emerald-700" : "text-red-700"}`}>
                  {selectedEvent.processed ? "Processed Successfully" : "Failed / Pending"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Received At</span>
                <span className="text-slate-700">{selectedEvent.created_at ? new Date(selectedEvent.created_at).toLocaleString() : "—"}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Processed At</span>
                <span className="text-slate-700">{selectedEvent.processed_at ? new Date(selectedEvent.processed_at).toLocaleString() : "—"}</span>
              </div>
            </div>

            {selectedEvent.error_message && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 font-mono">
                <span className="font-bold block mb-1">Error Trace:</span>
                {selectedEvent.error_message}
              </div>
            )}

            <div className="flex-1 overflow-y-auto min-h-[200px]">
              <span className="text-xs font-semibold text-slate-500 block mb-2">Raw JSON Payload</span>
              <pre className="rounded-2xl bg-slate-900 text-slate-200 p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                {selectedEvent.payload ? JSON.stringify(selectedEvent.payload, null, 2) : "No payload recorded"}
              </pre>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 text-xs font-semibold rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={() => handleReplay(selectedEvent.stripe_event_id)}
                disabled={replayingId === selectedEvent.stripe_event_id}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB] disabled:opacity-50"
              >
                <Play size={14} className={replayingId === selectedEvent.stripe_event_id ? "animate-spin" : ""} />
                {replayingId === selectedEvent.stripe_event_id ? "Replaying..." : "Replay Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
