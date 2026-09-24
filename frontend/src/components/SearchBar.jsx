import { Search, X } from "lucide-react";

export default function SearchBar({ value = "", onChange, placeholder = "Search..." }) {
  return (
    <div className="relative mb-6 w-full font-sans">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-9 text-sm text-white placeholder:text-[#64748B] focus:bg-white/10 focus:border-[#3A86FF]/60 focus:outline-none focus:ring-2 focus:ring-[#3A86FF]/20 transition-all duration-200"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange?.("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] transition hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}