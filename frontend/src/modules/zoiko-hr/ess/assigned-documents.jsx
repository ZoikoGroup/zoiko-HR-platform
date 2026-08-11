import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { FileText, Eye, Search, CheckCircle, Clock, AlertCircle, XCircle } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getMyAssignedDocuments } from "../../../service/hrService";
import { API_BASE_URL } from "../../../service/api";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/ess" },
  { label: "Profile", href: "/zoiko-hr/ess/profile" },
  { label: "Leave Management", href: "/zoiko-hr/ess/leave" },
  { label: "Attendance", href: "/zoiko-hr/ess/attendance" },
  { label: "My Documents", href: "/zoiko-hr/ess/my-documents" },
  { label: "Assigned Docs", href: "/zoiko-hr/ess/assigned-documents" },
  { label: "Learning", href: "/zoiko-hr/ess/requests" },
  { label: "Settings", href: "/zoiko-hr/ess/settings" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/zoiko-hr/ess"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

const ASSIGN_STATUS_META = {
  pending:       { label: "Pending",       icon: Clock,      bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200" },
  acknowledged:  { label: "Acknowledged",  icon: CheckCircle,bg: "bg-blue-50",    text: "text-blue-700",   border: "border-blue-200"  },
  completed:     { label: "Completed",     icon: AlertCircle,bg: "bg-emerald-50", text: "text-emerald-700",border: "border-emerald-200"},
};

const AssignStatusBadge = ({ status }) => {
  const m = ASSIGN_STATUS_META[status];
  if (!m) return null;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${m.bg} ${m.text} ${m.border} border`}>
      <Icon size={14} /> {m.label}
    </span>
  );
};

export default function AssignedDocuments() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    getMyAssignedDocuments()
      .then(res => {
        const raw = res?.data;
        setDocs(Array.isArray(raw) ? raw : []);
      })
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = docs.filter(d =>
    !search.trim() || d.document_title?.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <HRPage>
      <SubNav />
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Assigned Documents</h2>
            <p className="text-sm text-slate-500 mt-1">Documents assigned to you by HR</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none w-64"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="mx-auto text-slate-300 mb-3" size={48} />
            <p className="text-slate-500 font-medium">No documents assigned yet</p>
            <p className="text-slate-400 text-sm mt-1">Assigned company documents will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(d => (
              <div key={d.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors bg-white">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{d.document_title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-400 capitalize">{d.document_category}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs text-slate-400">Assigned {d.assigned_at ? new Date(d.assigned_at).toLocaleDateString() : ""}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <AssignStatusBadge status={d.status} />
                  {d.file_url && (
                    <a
                      href={`${API_BASE_URL}/${d.file_url.replace(/^https?:\/\/[^/]+\//, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                      title="View document"
                    >
                      <Eye size={18} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </HRPage>
  );
}
