import { Search } from "lucide-react";

export default function SearchBar() {
  return (
    <div className="relative mb-6 w-full font-sans">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        placeholder="Search..."
        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#FF7A00]/60 focus:outline-none focus:ring-2 focus:ring-[#FF7A00]/20 transition-all duration-200"
      />
    </div>
  );
}
