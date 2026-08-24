import { useNavigate } from "react-router-dom";
import { INK, INK_SOFT } from "./format";

export default function SecurityAccessCard({ data, loading }) {
  const navigate = useNavigate();

  const tiles = [
    { label: "Privileged Sign-Ins", value: data?.privileged_sign_ins },
    { label: "Admin Users", value: data?.admin_users },
    { label: "Privileged Actions", value: data?.privileged_actions },
    { label: "Super Admins", value: data?.super_admins },
    { label: "Review Due", value: data?.review_due },
  ];

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold" style={{ color: INK }}>Security &amp; Privileged Access</h2>
      </div>
      {loading ? (
        <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {tiles.map((t) => (
            <div key={t.label} className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <p className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide leading-tight">{t.label}</p>
              <p className="text-lg font-extrabold mt-1" style={{ color: INK }}>{t.value ?? 0}</p>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => navigate("/super-admin/access")}
        className="mt-4 text-xs font-semibold text-blue-600 hover:text-blue-800"
      >
        View security insights →
      </button>
    </div>
  );
}
