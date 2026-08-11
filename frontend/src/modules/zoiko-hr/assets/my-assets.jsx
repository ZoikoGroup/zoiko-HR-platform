import { useState, useEffect, useMemo } from "react";
import { Package, Tag, Calendar, AlertCircle, Search } from "lucide-react";
import { getAssets } from "../../../service/hrService";

const statusColors = {
  assigned: "bg-blue-100 text-blue-800", available: "bg-green-100 text-green-800",
  maintenance: "bg-orange-100 text-orange-800", retired: "bg-gray-100 text-gray-800",
  lost: "bg-red-100 text-red-800",
};

const conditionColors = {
  new: "bg-emerald-100 text-emerald-800", good: "bg-green-100 text-green-800",
  fair: "bg-yellow-100 text-yellow-800", poor: "bg-orange-100 text-orange-800",
  damaged: "bg-red-100 text-red-800",
};

function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function MyAssets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      setLoading(true);
      try {
        const data = await getAssets();
        if (mounted) setAssets(data?.items || (Array.isArray(data) ? data : []));
      } catch {
        if (mounted) setAssets([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    return () => { mounted = false; };
  }, []);

  const userAssets = useMemo(() => {
    return assets.filter((a) => a.employeeName || a.employee_name);
  }, [assets]);

  const filtered = useMemo(() => {
    if (!search) return userAssets;
    const q = search.toLowerCase();
    return userAssets.filter((a) =>
      (a.name || a.itemName || "").toLowerCase().includes(q) ||
      (a.assetTag || a.asset_tag || "").toLowerCase().includes(q) ||
      (a.category || "").toLowerCase().includes(q)
    );
  }, [userAssets, search]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading your assets...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Assets</h1>
        <p className="text-sm text-gray-500 mt-1">Assets assigned to employees</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Search your assets..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {userAssets.length === 0 ? "No assets assigned to employees yet." : "No assets match your search."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((asset) => {
            const name = asset.name || asset.itemName || "";
            const tag = asset.assetTag || asset.asset_tag || "";
            const cat = asset.category || "";
            const emp = asset.employeeName || asset.employee_name || "";
            const assigned = asset.assignedDate || asset.assigned_date || "";
            const cond = asset.condition || "new";
            const status = asset.status || "available";
            const notes = asset.notes || "";
            return (
              <div key={asset.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <Package className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[status] || "bg-gray-100 text-gray-800"}`}>
                    {status.replace(/_/g, " ")}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{name}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Tag className="w-3.5 h-3.5" />
                    <span className="font-mono text-xs text-amber-600 font-semibold">{tag}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    <span className="w-3.5 h-3.5 inline-flex items-center justify-center text-xs font-bold">#</span>
                    <span>{cat}</span>
                  </div>
                  {emp && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <span className="w-3.5 h-3.5 inline-flex items-center justify-center text-xs font-bold">@</span>
                      <span>{emp}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-gray-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Assigned: {formatDate(assigned)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${conditionColors[cond] || "bg-gray-100 text-gray-800"}`}>
                      {cond}
                    </span>
                  </div>
                </div>
                {notes && <p className="mt-3 text-xs text-gray-400 italic border-t border-gray-100 pt-2">{notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
