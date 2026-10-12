/**
 * components/OrgPicker.jsx
 * ------------------------
 * Shared organization search/picker used by super-admin pages that need to
 * scope a view to one organization at a time. Wraps the same
 * `superAdminService.getOrganizations` search call OrganizationsPage.jsx
 * uses for its own table search — this does not reimplement org search, it
 * just exposes it as a standalone typeahead.
 */
import { useState, useEffect, useRef } from "react";
import { Search, Building2, X, Loader2 } from "lucide-react";
import { superAdminService } from "../service/superAdminService";

export default function OrgPicker({ selectedOrg, onSelect, placeholder = "Search organizations by name or code..." }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await superAdminService.getOrganizations({ search: query, page: 1, page_size: 10 });
        if (!cancelled) setResults(data.organizations || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  if (selectedOrg) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#EFF6FF] px-4 py-2.5 transition-all duration-200 ease-in-out">
        <Building2 className="h-4 w-4 text-[#2563EB]" />
        <span className="text-sm font-semibold text-[#1E293B]">{selectedOrg.name}</span>
        {selectedOrg.organization_code && (
          <span className="text-xs font-mono text-slate-400">{selectedOrg.organization_code}</span>
        )}
        <button
          onClick={() => { onSelect(null); setQuery(""); }}
          className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-all duration-200 ease-in-out hover:bg-blue-100/70 hover:text-blue-700"
          aria-label="Clear selected organization"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[#CBD5E1] bg-white py-2.5 pl-9 pr-9 text-sm text-[#475569] placeholder:text-slate-400 outline-none transition-all duration-200 ease-in-out hover:border-blue-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-500/20"
        />
        {loading && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
      </div>

      {open && query.trim() && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-[0_4px_20px_rgba(15,23,42,0.12)]">
          {loading ? (
            <div className="px-4 py-3 text-sm text-[#475569]">Searching...</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[#475569]">No organizations found</div>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {results.map((org) => (
                <li key={org.id}>
                  <button
                    onClick={() => { onSelect(org); setOpen(false); setQuery(""); }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors duration-200 ease-in-out hover:bg-blue-50/50"
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="font-semibold text-[#1E293B]">{org.name}</span>
                    {org.organization_code && (
                      <span className="ml-auto text-xs font-mono text-slate-400">{org.organization_code}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}