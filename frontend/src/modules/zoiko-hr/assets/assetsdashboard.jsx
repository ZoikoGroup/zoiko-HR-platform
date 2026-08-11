import { useState, useEffect } from "react";
import { Package, UserCheck, Archive, Wrench, PlusCircle, Monitor, Layers, Sofa, MonitorDown, Car, FileText, BarChart3, ClipboardList, FileSearch } from "lucide-react";
import { getAssetDashboard } from "../../../service/hrService";
import Maintenance from "./maintenance";
import AssetReports from "./reports";

const TABS = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "maintenance", label: "Maintenance", icon: Wrench },
  { key: "reports", label: "Reports", icon: FileText },
];

const categoryIcons = {
  Hardware: Monitor, Software: Layers, Furniture: Sofa, Electronics: MonitorDown, Vehicle: Car, Other: Package,
};

function StatCard({ title, value, icon: Icon }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
      <div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
      <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
        <Icon size={20} className="text-amber-600" />
      </div>
    </div>
  );
}

function SimpleBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-8 text-right">{value}</span>
    </div>
  );
}

function OverviewTab({ dashboard }) {
  const {
    total_assets = 0, assigned_count = 0, available_count = 0,
    maintenance_count = 0, recently_added = 0,
    category_breakdown = [], status_breakdown = [],
  } = dashboard;

  const maxCategory = Math.max(...category_breakdown.map((c) => c.count), 1);
  const maxStatus = Math.max(...status_breakdown.map((s) => s.count), 1);

  const statusBarColors = {
    assigned: "bg-blue-500", available: "bg-green-500", maintenance: "bg-orange-500", retired: "bg-gray-500", lost: "bg-red-500",
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard title="Total Assets" value={total_assets} icon={Package} />
        <StatCard title="Assigned" value={assigned_count} icon={UserCheck} />
        <StatCard title="Available" value={available_count} icon={Archive} />
        <StatCard title="Under Maintenance" value={maintenance_count} icon={Wrench} />
        <StatCard title="Recently Added" value={recently_added} icon={PlusCircle} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Category Breakdown</h2>
          {category_breakdown.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No data available</p>
          ) : (
            <div className="space-y-3">
              {category_breakdown.map((item) => {
                const Icon = categoryIcons[item.category] || Package;
                return (
                  <div key={item.category} className="flex items-center gap-3">
                    <div className="p-1.5 bg-amber-50 rounded-lg"><Icon size={16} className="text-amber-600" /></div>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{item.category}</span>
                        <span className="text-gray-500">{item.count}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="bg-amber-500 rounded-full h-2 transition-all" style={{ width: `${(item.count / maxCategory) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Status Distribution</h2>
          {status_breakdown.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No data available</p>
          ) : (
            <div className="space-y-3">
              {status_breakdown.map((item) => (
                <div key={item.status} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700 capitalize w-28">{item.status.replace(/_/g, " ")}</span>
                  <div className="flex-1">
                    <div className="w-full bg-gray-100 rounded-full h-3">
                      <div className={`${statusBarColors[item.status] || "bg-gray-500"} rounded-full h-3 transition-all`} style={{ width: `${(item.count / maxStatus) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-sm text-gray-500 w-8 text-right">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function AssetsDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getAssetDashboard();
        if (mounted) setDashboard(data);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    return () => { mounted = false; };
  }, []);

  const renderContent = () => {
    if (activeTab === "maintenance") {
      return <Maintenance />;
    }
    if (activeTab === "reports") {
      return <AssetReports />;
    }

    if (loading) {
      return (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading dashboard...</span>
        </div>
      );
    }

    if (error || !dashboard) {
      return (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">Error: {error || "No data returned"}</div>
      );
    }

    return <OverviewTab dashboard={dashboard} />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Assets Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of company asset inventory and status</p>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {renderContent()}
    </div>
  );
}
