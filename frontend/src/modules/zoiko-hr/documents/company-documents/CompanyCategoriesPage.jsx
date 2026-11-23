import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Eye, EyeOff, FolderOpen, Mail, Plus, RefreshCw, Settings, Share2, Trash2, X } from "lucide-react";
import { OrganizationDocumentsLayout } from "../ui";
import SectionState from "../components/SectionState";
import AccessBadge from "../components/AccessBadge";
import ShareModal from "../components/ShareModal";
import StatusChip from "../components/StatusChip";
import ActionMenu from "../components/ActionMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import CategorySettingsDialog from "../components/CategorySettingsDialog";
import {
  useCompanyCategories, useCompanyFiles, useCreateCompanyCategory, useDeleteCompanyCategory, useUpdateCompanyCategory,
} from "../hooks/useCompanyDocuments";
import { formatDate } from "../../../../utils/dateTime";

const SEGMENTS = [["all", "All"], ["expiring_soon", "Expiring soon"], ["expired", "Expired"]];
const ACCESS = [["", "Any access"], ["all", "All employees"], ["restricted", "Restricted"], ["admin_only", "Admin only"]];
const NOTICE_MS = 5000;

/**
 * Admin → Company Documents, level 1 (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A3): category cards with how many files they
 * hold, when they last changed and who can see them. Never a blank page: the built-in categories are always there.
 * Each card has a "⋯" menu: Open, Settings, Who can see, Hide / Show, and Delete for empty custom categories (built-in
 * ones can be renamed and hidden, never deleted). Hidden categories sit in their own collapsed section.
 * "Expiring soon" / "Expired" switch to one list across all categories.
 */
export default function CompanyCategoriesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [access, setAccess] = useState("");
  const [segment, setSegment] = useState("all");
  const [sharing, setSharing] = useState(null);
  const [settings, setSettings] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const cards = useCompanyCategories({ access: access || undefined, search: search.trim() || undefined, include_hidden: true });
  const flat = useCompanyFiles({ expiry: segment, search: search.trim() || undefined }, segment !== "all");
  const create = useCreateCompanyCategory();
  const update = useUpdateCompanyCategory();
  const remove = useDeleteCompanyCategory();

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);
  const closeConfirm = useCallback(() => setConfirm(null), []);
  const closeSettings = useCallback(() => setSettings(null), []);

  const add = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    try {
      const name = newName.trim();
      await create.mutateAsync({ name });
      setNewName("");
      setNotice(`Category “${name}” added.`);
    } catch (err) { setError(err?.message || "The category was not added."); }
  };

  const toggleHidden = async (c) => {
    try {
      await update.mutateAsync({ id: c.id, data: { is_hidden: !c.is_hidden } });
      setNotice(c.is_hidden ? `“${c.name}” is shown again. Employees who are allowed can see its files.` : `“${c.name}” is hidden. Employees no longer see its files.`);
    } catch (err) { setError(err?.message || "That didn't work."); }
  };
  const askHide = (c) => setConfirm({
    title: `Hide ${c.name}?`, confirmLabel: "Hide category",
    message: <p>Employees stop seeing its {c.file_count === 1 ? "file" : `${c.file_count} files`} and open read-confirmation requests are cancelled. Nothing is deleted: show it again any time.</p>,
    run: () => update.mutateAsync({ id: c.id, data: { is_hidden: true } }),
    done: () => setNotice(`“${c.name}” is hidden. Employees no longer see its files.`),
  });
  const askDelete = (c) => setConfirm({
    title: `Delete ${c.name}?`, confirmLabel: "Delete category", danger: true,
    message: c.file_count
      ? <p>“{c.name}” still has {c.file_count} file{c.file_count === 1 ? "" : "s"}. Move or remove them first.</p>
      : <p>The category must be empty (no files or folders). This cannot be undone.</p>,
    run: () => remove.mutateAsync(c.id),
    done: () => setNotice(`Category “${c.name}” was deleted.`),
  });

  const menu = (c) => [
    { label: "Open", icon: FolderOpen, onSelect: () => navigate(`/zoiko-hr/documents/company-documents/${c.id}`) },
    { label: "Settings", icon: Settings, onSelect: () => setSettings(c) },
    { label: "Who can see", icon: Share2, onSelect: () => setSharing(c) },
    { label: "Email", icon: Mail, hidden: c.is_hidden, onSelect: () => setSharing({ ...c, tab: "email" }) },
    c.is_hidden ? { label: "Show to employees", icon: Eye, onSelect: () => toggleHidden(c) } : { label: "Hide", icon: EyeOff, onSelect: () => askHide(c) },
    { label: "Delete", icon: Trash2, danger: true, hidden: c.is_system, onSelect: () => askDelete(c) },
  ];

  const card = (c) => (
    <li key={c.id} className={`flex flex-col gap-3 rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-[#334155] dark:bg-[#1e293b] ${c.is_hidden ? "opacity-75" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-blue-50 p-2 text-blue-700"><FolderOpen size={18} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <Link to={`/zoiko-hr/documents/company-documents/${c.id}`} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline dark:text-[#f1f5f9]">{c.name}</Link>
          <p className="text-xs text-slate-500">{c.file_count} file{c.file_count === 1 ? "" : "s"}{c.last_updated && ` · updated ${formatDate(c.last_updated)}`}</p>
        </div>
        <ActionMenu label={`More actions for ${c.name}`} items={menu(c)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {c.is_hidden ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">Hidden from employees</span> : <AccessBadge access={c.access} />}
        {c.requires_approval && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Needs approval</span>}
        {c.access?.require_ack && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Read confirmation</span>}
        {c.is_hidden
          ? <button type="button" onClick={() => toggleHidden(c)} aria-label={`Show ${c.name} to employees`}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Eye size={14} aria-hidden="true" /> Show
            </button>
          : <button type="button" onClick={() => setSharing(c)} aria-label={`Who can see ${c.name}`}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Share2 size={14} aria-hidden="true" /> Share
            </button>}
      </div>
    </li>
  );

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
        {error && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-800">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="rounded p-0.5 hover:bg-black/5"><X size={14} aria-hidden="true" /></button>
          </div>
        )}
        {notice && (
          <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="rounded p-0.5 hover:bg-black/5"><X size={14} aria-hidden="true" /></button>
          </div>
        )}

        {segment === "all" ? (
          <SectionState query={cards} skeleton="cards" label="Loading categories" isEmpty={(d) => !d?.length}
            empty={{ title: "No categories match", message: "Try another search or access filter." }}>
            {(items) => {
              const shown = items.filter((c) => !c.is_hidden);
              const hidden = items.filter((c) => c.is_hidden);
              return (
                <>
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {shown.map(card)}
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
                  {hidden.length > 0 && (
                    <section className="mt-5">
                      <button type="button" aria-expanded={showHidden} onClick={() => setShowHidden((v) => !v)}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 hover:underline dark:text-slate-200">
                        {showHidden ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                        Hidden categories ({hidden.length})
                      </button>
                      {showHidden && <ul aria-label="Hidden categories" className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{hidden.map(card)}</ul>}
                    </section>
                  )}
                </>
              );
            }}
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
      <ShareModal open={Boolean(sharing)} targetType="category" targetId={sharing?.id} targetName={sharing?.name || ""}
        initialTab={sharing?.tab || "portal"} onClose={() => setSharing(null)}
        onEmailed={(s) => setNotice(`“${s.target_name}” emailed to ${s.counts?.sent ?? 0} ${s.counts?.sent === 1 ? "person" : "people"}${s.counts?.failed ? `; ${s.counts.failed} failed` : ""}.`)} />
      <CategorySettingsDialog open={Boolean(settings)} category={settings} onClose={closeSettings}
        onWhoCanSee={() => { const c = settings; setSettings(null); setSharing(c); }}
        onSave={(data) => update.mutateAsync({ id: settings.id, data }).then(() => setNotice(`Settings for “${data.name || settings.name}” saved.`))} />
      <ConfirmDialog open={Boolean(confirm)} title={confirm?.title || ""} message={confirm?.message} confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger} onClose={closeConfirm} onConfirm={async () => { await confirm.run(); confirm.done?.(); }} />
    </OrganizationDocumentsLayout>
  );
}
