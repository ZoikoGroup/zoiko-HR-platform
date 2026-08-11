import { Search } from "lucide-react";

export function SearchInput({ placeholder = "Search..." }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#ECEBF5] bg-white px-3.5 py-2.5 shadow-sm">
      <Search className="w-4 h-4 text-[#847FA0]" />
      <input
        type="search"
        placeholder={placeholder}
        className="flex-1 bg-transparent text-[13px] text-[#170F35] outline-none placeholder:text-[#847FA0]"
      />
    </div>
  );
}

export function TopBarButton({ icon: Icon, label, primary = false }) {
  return (
    <button
      type="button"
      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium border transition-colors whitespace-nowrap ${
        primary
          ? "bg-gradient-to-r from-[#4524B9] to-[#6E35DF] text-white border-transparent"
          : "bg-white text-[#170F35] border-[#ECEBF5] hover:bg-[#F5F4FB]"
      }`}
    >
      <Icon className="w-4 h-4" strokeWidth={2} />
      {label}
    </button>
  );
}

export function StatCard({ label, icon: Icon, iconBg = "#4C2CC5", value, sub, metrics }) {
  return (
    <div className="rounded-2xl border border-[#ECEBF5] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          <Icon className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
        <span className="text-[13px] font-semibold text-[#170F35]">{label}</span>
      </div>

      <p className="text-[28px] font-extrabold text-[#170F35] leading-none mb-1.5">{value}</p>
      {sub ? <p className="text-[12px] text-[#847FA0] mb-3">{sub}</p> : null}

      {metrics ? (
        <div className="flex flex-wrap gap-4 pt-3 border-t border-[#F0EFF7]">
          {metrics.map((m) => (
            <div key={m.label}>
              <p className="text-[13px] font-bold" style={{ color: m.color }}>
                {m.value}
              </p>
              <p className="text-[10.5px] text-[#847FA0]">{m.label}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
