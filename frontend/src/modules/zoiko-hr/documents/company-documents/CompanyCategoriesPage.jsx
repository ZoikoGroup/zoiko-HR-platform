import { useState } from "react";
import { Link } from "react-router-dom";
import { FolderOpen, Plus, RefreshCw, Share2 } from "lucide-react";
import { OrganizationDocumentsLayout } from "../ui";
import SectionState from "../components/SectionState";
import AccessBadge from "../components/AccessBadge";
import ShareModal from "../components/ShareModal";
import StatusChip from "../components/StatusChip";
import { useCompanyCategories, useCompanyFiles, useCreateCompanyCategory } from "../hooks/useCompanyDocuments";
import { formatDate } from "../../../../utils/dateTime";

const SEGMENTS = [["all", "All"], ["expiring_soon", "Expiring soon"], ["expired", "Expired"]];
const ACCESS = [["", "Any access"], ["all", "All employees"], ["restricted", "Restricted"], ["admin_only", "Admin only"]];

/**
 * Admin → Company Documents, level 1 (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A3): category cards with how many files they
 * hold, when they last changed and who can see them. Never a blank page: the built-in categories are always there.
 * "Expiring soon" / "Expired" switch to one list across all categories.
 */
export default function CompanyCategoriesPage() {
  const [search, setSearch] = useState("");
  const [access, setAccess] = useState("");
  const [segment, setSegment] = useState("all");
  const [sharing, setSharing] = useState(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState(null);
  const cards = useCompanyCategories({ access: access || undefined, search: search.trim() || undefined });
  const flat = useCompanyFiles({ expiry: segment, search: search.trim() || undefined }, segment !== "all");
  const create = useCreateCompanyCategory();

  const add = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    try { await create.mutateAsync({ name: newName.trim() }); setNewName(""); } catch (err) { setError(err?.message || "The category was not added."); }
  };

  return (
    <OrganizationDocumentsLayout title="Company Documents" subtitle="Company-wide files, organized by category, with control over who can see them."
      actions={(
        <button type="button" onClick={() => { cards.refetch(); if (segment !== "all") flat.refetch(); }}
          className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15">
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </button>
      )}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="min-w-[220px] flex-1">
            <span className="sr-only">Search</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories or files…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          </label>
          <select aria-label="Access" value={access} onChange={(e) => setAccess(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            {ACCESS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <div role="tablist" aria-label="Expiry" className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            {SEGMENTS.map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={segment === v} onClick={() => setSegment(v)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${segment === v ? "bg-blue-600 text-white" : "text-slate-600"}`}>{l}</button>
            ))}
          </div>
        </div>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</p>}

        {segment === "all" ? (
          <SectionState query={cards} skeleton="cards" label="Loading categories" isEmpty={(d) => !d?.length}
            empty={{ title: "No categories match", message: "Try another search or access filter." }}>
            {(items) => (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((c) => (
                  <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
                    <div className="flex items-start gap-3">
                      <span className="rounded-xl bg-blue-50 p-2 text-blue-700"><FolderOpen size={18} aria-hidden="true" /></span>
                      <div className="min-w-0 flex-1">
                        <Link to={`/zoiko-hr/documents/company-documents/${c.id}`} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline dark:text-[#f1f5f9]">{c.name}</Link>
                        <p className="text-xs text-slate-500">{c.file_count} file{c.file_count === 1 ? "" : "s"}{c.last_updated && ` · updated ${formatDate(c.last_updated)}`}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <AccessBadge access={c.access} />
                      {c.requires_approval && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Needs approval</span>}
                      {c.access.require_ack && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Read confirmation</span>}
                      <button type="button" onClick={() => setSharing(c)} aria-label={`Who can see ${c.name}`}
                        className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <Share2 size={14} aria-hidden="true" /> Share
                      </button>
                    </div>
                  </li>
                ))}
                <li className="rounded-2xl border border-dashed border-slate-300 p-4">
                  <form onSubmit={add} className="flex h-full flex-col justify-center gap-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="new-company-category">New category</label>
                    <input id="new-company-category" value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. IT policies"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                    <button type="submit" disabled={!newName.trim() || create.isPending}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                      <Plus size={16} aria-hidden="true" /> Add category
                    </button>
                  </form>
                </li>
              </ul>
            )}
          </SectionState>
        ) : (
          <SectionState query={flat} label="Loading files" isEmpty={(d) => !d?.items?.length}
            empty={{ title: segment === "expired" ? "Nothing has expired" : "Nothing expires in the next 30 days" }}>
            {(data) => (
              <ul className="space-y-2">
                {data.items.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200/80 bg-white px-4 py-3 text-sm">
                    <Link to={`/zoiko-hr/documents/company-documents/${f.category_id}`} className="font-medium text-slate-900 hover:underline">{f.title}</Link>
                    <span className={f.expiry_state === "expired" ? "text-rose-700" : "text-amber-700"}>Expires {formatDate(f.expiry_date)}</span>
                    <AccessBadge access={f.access} />
                    {f.publish_state !== "published" && <StatusChip status={f.publish_state} />}
                  </li>
                ))}
              </ul>
            )}
          </SectionState>
        )}
      </div>
      <ShareModal open={Boolean(sharing)} targetType="category" targetId={sharing?.id} targetName={sharing?.name || ""} onClose={() => setSharing(null)} />
    </OrganizationDocumentsLayout>
  );
}
