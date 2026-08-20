import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  FileText, Eye, Download, Search, CheckCircle, Clock, AlertCircle,
  Loader2, Folder, ChevronRight, Home
} from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getMyAssignedDocuments } from "../../../service/hrService";
import { useDocumentFile } from "../../../hooks/useDocumentFile";
import DocumentPreviewModal from "../../../components/DocumentPreviewModal";

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
  pending:       { label: "Pending",       icon: Clock,       bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200" },
  acknowledged:  { label: "Acknowledged",  icon: CheckCircle, bg: "bg-blue-50",    text: "text-blue-700",   border: "border-blue-200"  },
  completed:     { label: "Completed",     icon: AlertCircle, bg: "bg-emerald-50", text: "text-emerald-700",border: "border-emerald-200"},
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

  const { preview, busyId, busyAction, view, download, closePreview, downloadFromPreview } = useDocumentFile();

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

  const allFiltered = docs.filter(d =>
    !search.trim() || d.document_title?.toLowerCase().includes(search.trim().toLowerCase()) ||
    d.folder_name?.toLowerCase().includes(search.trim().toLowerCase())
  );

  // Build folder map: folder_name -> [docs]
  const folderMap = {};
  for (const d of allFiltered) {
    if (d.folder_name) {
      if (!folderMap[d.folder_name]) folderMap[d.folder_name] = [];
      folderMap[d.folder_name].push(d);
    }
  }
  const folderNames = Object.keys(folderMap).sort();

  // Docs without a folder
  const rootDocs = allFiltered.filter(d => !d.folder_name);

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
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-sm text-slate-400">Loading documents...</span>
          </div>
        ) : allFiltered.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="mx-auto text-slate-300 mb-3" size={48} />
            <p className="text-slate-500 font-medium">No documents assigned yet</p>
            <p className="text-slate-400 text-sm mt-1">Assigned company documents will appear here</p>
          </div>
        ) : (
          <>
            {/* Folder cards */}
            {folderNames.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
                {folderNames.map(name => (
                  <div key={name} className="p-4 rounded-xl bg-white border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-50 text-amber-500">
                        <Folder className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>
                        <p className="text-xs text-slate-400">{folderMap[name].length} doc{folderMap[name].length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Folder docs (expanded inline) */}
            {folderNames.map(name => (
              <div key={name} className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Folder size={14} className="text-amber-500" />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{name}</span>
                </div>
                <div className="space-y-2 ml-2 border-l-2 border-amber-100 pl-4">
                  {folderMap[name].map(d => (
                    <DocRow key={d.document_id} d={d} view={view} download={download} busyId={busyId} busyAction={busyAction} />
                  ))}
                </div>
              </div>
            ))}

            {/* Root (ungrouped) docs */}
            {rootDocs.length > 0 && (
              <div className="space-y-2">
                {folderNames.length > 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <Home size={14} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Other Documents</span>
                  </div>
                )}
                {rootDocs.map(d => (
                  <DocRow key={d.document_id} d={d} view={view} download={download} busyId={busyId} busyAction={busyAction} />
                ))}
              </div>
            )}

            <p className="text-xs text-slate-400 mt-4">{allFiltered.length} document{allFiltered.length !== 1 ? "s" : ""}</p>
          </>
        )}
      </div>
      <DocumentPreviewModal preview={preview} onClose={closePreview} onDownload={downloadFromPreview} />
    </HRPage>
  );
}

function DocRow({ d, view, download, busyId, busyAction }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors bg-white">
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
        {d.document_id && (
          <>
            <button
              onClick={() => view(d.document_id)}
              disabled={busyId === d.document_id}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors disabled:opacity-50"
              title="View document"
            >
              {busyId === d.document_id && busyAction === "view" ? <Loader2 size={18} className="animate-spin" /> : <Eye size={18} />}
            </button>
            <button
              onClick={() => download(d.document_id)}
              disabled={busyId === d.document_id}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors disabled:opacity-50"
              title="Download document"
            >
              {busyId === d.document_id && busyAction === "download" ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
