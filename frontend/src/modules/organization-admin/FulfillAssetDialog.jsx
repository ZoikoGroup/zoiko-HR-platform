// Fulfilling an asset request hands the requester one available asset; the server assigns it in the same step (audit A9).
import { useState } from "react";
import { Search, X } from "lucide-react";
import { useAvailableAssets } from "./assetPickers";

export default function FulfillAssetDialog({ request, saving, onClose, onFulfill }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const { items, loading, error } = useAvailableAssets(query);
  const who = request.employee_name || "the requester";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" role="dialog" aria-label="Fulfill request">
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#334155]">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Fulfill request</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose the available asset to give {who} ({request.asset_type || "asset"})
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search available assets by name, tag, serial..." value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); }} autoFocus
              className="w-full pl-8 pr-3 py-2 border border-slate-200 dark:border-[#334155] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div className="max-h-60 overflow-y-auto border border-slate-100 dark:border-[#334155] rounded-xl">
            {error ? (
              <p className="text-xs text-red-500 text-center py-4">{error}</p>
            ) : loading && items.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Searching...</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No available assets match. Clear the search or add an asset first.</p>
            ) : items.map((a) => (
              <button key={a.id} type="button" onClick={() => setSelected(a)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between border-b border-slate-50 dark:border-[#334155] last:border-0 transition ${
                  selected?.id === a.id ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-200"
                }`}>
                <span className="font-medium truncate">{a.name}</span>
                <span className="font-mono text-xs text-amber-600 ml-3">{a.asset_tag}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#334155] text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition">Cancel</button>
            <button type="button" disabled={!selected || saving} onClick={() => onFulfill(selected.id)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold transition">
              {saving ? "Fulfilling..." : "Assign & fulfill"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
