import { STATUS } from "../constants";

/** A coloured status label. `status` is a backend status value (present, late, …); nothing is shown for none. */
export default function AttendanceStatusChip({ status, className = "" }) {
  if (!status) return <span className={`text-xs text-slate-400 ${className}`}>—</span>;
  const s = STATUS[status] || { label: status, chip: "bg-slate-100 text-slate-700 ring-slate-200" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.chip} ${className}`}>
      {s.label}
    </span>
  );
}
