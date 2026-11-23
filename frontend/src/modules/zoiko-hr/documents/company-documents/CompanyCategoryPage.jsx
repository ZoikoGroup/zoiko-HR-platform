import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  CheckSquare, Download, Eye, EyeOff, FileText, FileWarning, Folder, FolderOpen, FolderPlus, Globe2, History, Mail, Pencil, RefreshCw, Share2, Trash2, Upload, X,
} from "lucide-react";
import { OrganizationDocumentsLayout } from "../ui";
import SectionState from "../components/SectionState";
import DocsBreadcrumb from "../components/DocsBreadcrumb";
import AccessBadge from "../components/AccessBadge";
import StatusChip from "../components/StatusChip";
import ShareModal from "../components/ShareModal";
import CompanyFileDialog from "../components/CompanyFileDialog";
import AckTrackingDrawer from "../components/AckTrackingDrawer";
import FilePreviewDrawer from "../components/FilePreviewDrawer";
import Pager from "../components/Pager";
import ActionMenu from "../components/ActionMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import FolderDialog from "../components/FolderDialog";
import PublishStatusChip from "../components/PublishStatusChip";
import {
  useCompanyItems, useCompanyVersions, useCreateCompanyFolder, useDeleteCompanyDocument, useDeleteCompanyFolder, usePublishCompanyDocument,
  useRenameCompanyFolder, useUnpublishCompanyDocument, useUploadCompanyDocument, useUploadCompanyVersion,
} from "../hooks/useCompanyDocuments";
import { getDocumentFile } from "../../../../service/hrService";
import { saveBlobAs } from "../../../../utils/documents";
import { formatDate, formatDateTime } from "../../../../utils/dateTime";

const SEGMENTS = [["all", "All"], ["expiring_soon", "Expiring soon"], ["expired", "Expired"]];
const NOTICE_MS = 5000;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function VersionsPanel({ document: doc, onClose }) {
  const query = useCompanyVersions(doc?.id);
  if (!doc) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={`Versions of ${doc.title}`} onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-md overflow-auto bg-white p-5 shadow-2xl dark:bg-[#1e293b]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Versions of {doc.title}</h2>
          <button type="button" onClick={onClose} className="text-sm underline">Close</button>
        </div>
        <SectionState query={query} skeleton="list" isEmpty={(d) => !d?.length} empty={{ title: "No versions" }}>
          {(rows) => (
            <ol className="space-y-3">
              {rows.map((v) => (
                <li key={v.id} className="rounded-xl border border-gray-200 p-3 text-sm">
                  <div className="flex items-center gap-2"><strong>v{v.version}</strong><StatusChip status={v.status} />{v.is_current && <span className="text-xs text-emerald-700">current</span>}</div>
                  <p className="text-xs text-slate-500">{formatDateTime(v.uploaded_at)} · {v.uploaded_by}{v.material_change ? "" : " · minor change"}</p>
                  {v.change_notes && <p className="mt-1 text-slate-700">{v.change_notes}</p>}
                </li>
              ))}
            </ol>
          )}
        </SectionState>
      </section>
    </div>
  );
}

/**
 * Admin → Company Documents, level 2 (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A3): the folders and files of one category.
 * Works the same for every category (Onboarding, Company Policies, Employee Handbook, Payslip Templates, …).
 * Upload, New folder and Share act on what is open (the category, or the folder inside it). Folder cards show what they
 * hold and have a "⋯" menu (Open, Rename, Who can see, Delete). Each file row keeps Preview and Download as icons, a
 * labelled Publish / Unpublish button (always confirmed) and a "⋯" menu for the rest. Results name the file and the
 * effect, and clear themselves after a few seconds.
 */
export default function CompanyCategoryPage() {
  const { categoryId } = useParams();
  const [params, setParams] = useSearchParams();
  const folderId = Number(params.get("folder")) || null;
  const [segment, setSegment] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);             // { mode: 'new'|'version', document? }
  const [sharing, setSharing] = useState(null);           // { type, id, name }
  const [tracking, setTracking] = useState(null);
  const [versions, setVersions] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [folderDialog, setFolderDialog] = useState(null); // { mode: 'create'|'rename', folder? }
  const [confirm, setConfirm] = useState(null);           // { title, message, confirmLabel, danger, run, done }
  const [notice, setNotice] = useState(null);             // { tone: 'success'|'error', text }
  const [selected, setSelected] = useState(() => new Set()); // ticked file ids, shared together (QA R1-21)
  const query = useCompanyItems(categoryId, { folder_id: folderId || undefined, expiry: segment, search: search.trim() || undefined, page, per_page: 50 });
  const upload = useUploadCompanyDocument();
  const version = useUploadCompanyVersion();
  const publish = usePublishCompanyDocument();
  const unpublish = useUnpublishCompanyDocument();
  const remove = useDeleteCompanyDocument();
  const createFolder = useCreateCompanyFolder();
  const renameFolder = useRenameCompanyFolder();
  const deleteFolder = useDeleteCompanyFolder();
  const category = query.data?.category;
  const pageFiles = query.data?.files?.items || [];
  const allChosen = pageFiles.length > 0 && pageFiles.every((f) => selected.has(f.id));
  const someChosen = pageFiles.some((f) => selected.has(f.id));
  const selectAllRef = useRef(null);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someChosen && !allChosen; }, [someChosen, allChosen]);
  // another folder, filter, search or page shows other files: start the selection again
  useEffect(() => { setSelected(new Set()); }, [categoryId, folderId, segment, search, page]);
  const toggle = (id, on) => setSelected((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });
  const toggleAll = (on) => setSelected(on ? new Set(pageFiles.map((f) => f.id)) : new Set());

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);
  const ok = (text) => setNotice({ tone: "success", text });
  const fail = (e) => setNotice({ tone: "error", text: e?.message || "That didn't work. Please try again." });
  const closeConfirm = useCallback(() => setConfirm(null), []);
  const closeFolderDialog = useCallback(() => setFolderDialog(null), []);

  const goFolder = (id) => { const p = new URLSearchParams(params); if (id) p.set("folder", String(id)); else p.delete("folder"); setParams(p); setPage(1); };

  const crumbs = [{ label: "Documents", to: "/zoiko-hr/documents" }, { label: "Company Documents", to: "/zoiko-hr/documents/company-documents" },
    { label: category?.name || "Category", to: folderId ? `/zoiko-hr/documents/company-documents/${categoryId}` : undefined },
    ...((query.data?.breadcrumb) || []).map((b, i, all) => ({ label: b.name, to: i < all.length - 1 ? `/zoiko-hr/documents/company-documents/${categoryId}?folder=${b.id}` : undefined }))];

  const openFolder = folderId ? (query.data?.breadcrumb || []).at(-1) : null;
  const targetName = openFolder?.name || category?.name || "";

  const audienceText = (access) => {
    if (!access || access.visibility === "admin_only") return "Only admins can see it until you change Who can see.";
    const count = typeof access.audience_count === "number" ? ` (${access.audience_count} ${access.audience_count === 1 ? "person" : "people"})` : "";
    return `${access.label}${count} will be able to see it.`;
  };
  const askPublish = (f) => setConfirm({
    title: `Publish ${f.title}?`, confirmLabel: "Publish now",
    message: <p>{audienceText(f.access)}</p>,
    run: () => publish.mutateAsync({ documentId: f.id }),
    done: () => ok(f.access?.visibility === "admin_only" || !f.access
      ? `“${f.title}” is published, but only admins can see it.`
      : `“${f.title}” is published. ${f.access.label} can see it now.`),
  });
  const askUnpublish = (f) => setConfirm({
    title: `Unpublish ${f.title}?`, confirmLabel: "Unpublish",
    message: <p>Employees will stop seeing it straight away. The file and its versions are kept, and you can publish it again later.</p>,
    run: () => unpublish.mutateAsync(f.id),
    done: () => ok(`“${f.title}” is unpublished. Employees can no longer see it.`),
  });
  const askRemove = (f) => setConfirm({
    title: `Remove ${f.title}?`, confirmLabel: "Remove", danger: true,
    message: <p>It disappears from {category?.name || "this category"} and from employees. Its history stays in the audit log.</p>,
    run: () => remove.mutateAsync(f.id),
    done: () => ok(`“${f.title}” was removed.`),
  });
  const askDeleteFolder = (f) => setConfirm({
    title: `Delete folder ${f.name}?`, confirmLabel: "Delete folder", danger: true,
    message: (f.file_count || f.folder_count)
      ? <p>“{f.name}” still has {[f.file_count ? plural(f.file_count, "file") : null, f.folder_count ? plural(f.folder_count, "folder") : null].filter(Boolean).join(" and ")}. Move or remove them first.</p>
      : <p>Deleting a folder cannot be undone. Only empty folders can be deleted.</p>,
    run: () => deleteFolder.mutateAsync(f.id),
    done: () => ok(`Folder “${f.name}” was deleted.`),
  });
  const uploadNotice = ({ uploaded, failed }, d) => {
    if (d?.mode === "version") {
      if (uploaded.length) ok(`New version of “${d.document?.title}” uploaded.`);
      return;
    }
    if (!failed.length) {
      ok(uploaded.length === 1 ? `“${uploaded[0]}” uploaded to ${targetName}.` : `${uploaded.length} files uploaded to ${targetName}.`);
    } else {
      setNotice({ tone: "error", text: `${uploaded.length} of ${uploaded.length + failed.length} files uploaded to ${targetName}. Not uploaded: ${failed.join(", ")}.` });
    }
  };
  const download = async (f) => {
    try {
      const { blob, filename } = await getDocumentFile(f.id);
      saveBlobAs(blob, filename || f.title);
    } catch (e) { fail(e); }
  };

  return (
    <OrganizationDocumentsLayout title="Company Documents" subtitle="Upload, share and version company-wide files."
      actions={(
        <button type="button" onClick={() => query.refetch()}
          className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15">
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </button>
      )}>
      <div className="space-y-5">
        <DocsBreadcrumb items={crumbs} />
        {/* Upload, New folder and Share act on what is open: the chosen category, or the folder inside it. */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200/80 bg-white px-4 py-3 shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">{targetName || "Category"}</h2>
            <p className="text-xs text-slate-500">{folderId ? `Folder in ${category?.name || "this category"}` : "Company document category"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setDialog({ mode: "new" })} disabled={!category}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              <Upload size={16} aria-hidden="true" /> Upload to {targetName || "category"}
            </button>
            <button type="button" onClick={() => setFolderDialog({ mode: "create" })} disabled={!category}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-[#334155] dark:text-slate-200">
              <FolderPlus size={16} aria-hidden="true" /> New folder
            </button>
            <button type="button" disabled={!category}
              onClick={() => setSharing({ type: folderId ? "folder" : "category", id: folderId || Number(categoryId), name: targetName })}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-[#334155] dark:text-slate-200">
              <Share2 size={16} aria-hidden="true" /> Share {targetName || "category"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="min-w-[220px] flex-1">
            <span className="sr-only">Search files</span>
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search files…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <div role="tablist" aria-label="Expiry" className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            {SEGMENTS.map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={segment === v} onClick={() => { setSegment(v); setPage(1); }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${segment === v ? "bg-blue-600 text-white" : "text-slate-600"}`}>{l}</button>
            ))}
          </div>
        </div>
        {notice && <Notice notice={notice} onClose={() => setNotice(null)} />}
        {selected.size > 0 && (
          <div role="region" aria-label="Selected files" className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
            <span><strong>{selected.size}</strong> selected</span>
            <button type="button" onClick={() => setSharing({ type: "document", ids: [...selected], name: `${selected.size} documents` })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700">
              <Share2 size={14} aria-hidden="true" /> Share selected
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="text-blue-800 underline">Clear</button>
          </div>
        )}

        <SectionState query={query} label="Loading files" isEmpty={() => false}>
          {(data) => (
            <>
              {data.folders.length > 0 && (
                <ul aria-label="Folders" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {data.folders.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white px-3 py-2 dark:border-[#334155] dark:bg-[#1e293b]">
                      <button type="button" onClick={() => goFolder(f.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        <Folder size={18} className="shrink-0 text-amber-500" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{f.name}</span>
                          {typeof f.file_count === "number" && (
                            <span className="block text-xs text-slate-500">
                              {f.file_count || f.folder_count
                                ? [plural(f.file_count, "file"), f.folder_count ? plural(f.folder_count, "folder") : null].filter(Boolean).join(" · ")
                                : "Empty"}
                            </span>
                          )}
                        </span>
                      </button>
                      <ActionMenu label={`More actions for folder ${f.name}`} items={[
                        { label: "Open", icon: FolderOpen, onSelect: () => goFolder(f.id) },
                        { label: "Rename", icon: Pencil, onSelect: () => setFolderDialog({ mode: "rename", folder: f }) },
                        { label: "Who can see", icon: Share2, onSelect: () => setSharing({ type: "folder", id: f.id, name: f.name }) },
                        { label: "Email", icon: Mail, onSelect: () => setSharing({ type: "folder", id: f.id, name: f.name, tab: "email" }) },
                        { label: "Delete", icon: Trash2, danger: true, onSelect: () => askDeleteFolder(f) },
                      ]} />
                    </li>
                  ))}
                </ul>
              )}
              {data.files.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
                  No files here yet. Use Upload to add the first one.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="w-10 px-4 py-3">
                          <input ref={selectAllRef} type="checkbox" checked={allChosen} onChange={(e) => toggleAll(e.target.checked)}
                            aria-label="Select all files on this page" className="h-4 w-4 rounded border-slate-300" />
                        </th>
                        <th className="px-4 py-3">File</th><th className="px-4 py-3">Version</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Who can see</th><th className="px-4 py-3">Read</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.files.items.map((f) => {
                        const pending = f.status === "pending_approval";
                        const published = f.publish_state === "published";
                        return (
                          <tr key={f.id} className={selected.has(f.id) ? "bg-blue-50/60 dark:bg-blue-900/20" : undefined}>
                            <td className="px-4 py-3">
                              <input type="checkbox" checked={selected.has(f.id)} onChange={(e) => toggle(f.id, e.target.checked)}
                                aria-label={`Select ${f.title}`} className="h-4 w-4 rounded border-slate-300" />
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-2 font-medium"><FileText size={16} className="text-slate-400" aria-hidden="true" />{f.title}</span>
                              {f.file_available === false && (
                                <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                                  <FileWarning size={12} aria-hidden="true" /> File missing
                                </span>
                              )}
                              <p className="text-xs text-slate-500">{f.uploaded_by?.name} · {formatDate(f.uploaded_at)}</p>
                            </td>
                            <td className="px-4 py-3">v{f.version}</td>
                            <td className={`px-4 py-3 ${f.expiry_state === "expired" ? "text-rose-700 font-semibold" : f.expiry_state === "expiring_soon" ? "text-amber-700 font-semibold" : ""}`}>
                              {f.expiry_date ? formatDate(f.expiry_date) : "—"}
                            </td>
                            <td className="px-4 py-3"><PublishStatusChip file={f} /></td>
                            <td className="px-4 py-3">
                              <AccessBadge access={f.access} />
                              <ClashNote file={f} onShare={() => setSharing({ type: "document", id: f.id, name: f.title })} />
                            </td>
                            <td className="px-4 py-3">{f.ack ? <button type="button" onClick={() => setTracking(f)} className="text-xs font-semibold text-blue-700 hover:underline">{f.ack.acknowledged}/{f.ack.acknowledged + f.ack.pending}</button> : "—"}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <IconButton label={`Preview ${f.title}`} onClick={() => setPreviewing(f)} icon={Eye} />
                                <IconButton label={`Download ${f.title}`} onClick={() => download(f)} icon={Download} />
                                {!pending && (published
                                  ? <TextButton label={`Unpublish ${f.title}`} text="Unpublish" icon={EyeOff} onClick={() => askUnpublish(f)} />
                                  : <TextButton label={`Publish ${f.title} now`} text="Publish" icon={Globe2} primary onClick={() => askPublish(f)} />)}
                                <ActionMenu label={`More actions for ${f.title}`} items={[
                                  { label: "Who can see", icon: Share2, onSelect: () => setSharing({ type: "document", id: f.id, name: f.title }) },
                                  { label: "Email", icon: Mail, onSelect: () => setSharing({ type: "document", id: f.id, name: f.title, tab: "email" }) },
                                  { label: f.file_available === false ? "Upload it again" : "New version", icon: Upload, onSelect: () => setDialog({ mode: "version", document: f }) },
                                  { label: "Versions", icon: History, onSelect: () => setVersions(f) },
                                  { label: "Read confirmations", icon: CheckSquare, onSelect: () => setTracking(f), hidden: !f.ack },
                                  { label: "Remove", icon: Trash2, danger: true, onSelect: () => askRemove(f) },
                                ]} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <Pager page={data.files.page} perPage={data.files.per_page} total={data.files.total} onPage={setPage} />
            </>
          )}
        </SectionState>
        {folderId && <Link to={`/zoiko-hr/documents/company-documents/${categoryId}`} className="text-sm text-blue-700 hover:underline">Back to {category?.name}</Link>}
      </div>

      <CompanyFileDialog open={Boolean(dialog)} mode={dialog?.mode} category={category} document={dialog?.document} folderId={folderId}
        existingTitles={(query.data?.files?.items || []).map((f) => f.title)}
        onClose={() => setDialog(null)}
        onSubmit={(v) => (dialog?.mode === "version" ? version.mutateAsync(v) : upload.mutateAsync(v))}
        onFinished={(r) => uploadNotice(r, dialog)} />
      <FolderDialog open={Boolean(folderDialog)} mode={folderDialog?.mode} initialName={folderDialog?.folder?.name || ""} placeName={targetName}
        onClose={closeFolderDialog}
        onSubmit={(name) => (folderDialog?.mode === "rename"
          ? renameFolder.mutateAsync({ folderId: folderDialog.folder.id, name }).then(() => ok(`Folder “${folderDialog.folder.name}” renamed to “${name}”.`))
          : createFolder.mutateAsync({ name, categoryId: Number(categoryId), parentId: folderId }).then(() => ok(`Folder “${name}” created in ${targetName}.`)))} />
      <ConfirmDialog open={Boolean(confirm)} title={confirm?.title || ""} message={confirm?.message} confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger} onClose={closeConfirm}
        onConfirm={async () => { await confirm.run(); confirm.done?.(); }} />
      <ShareModal open={Boolean(sharing)} targetType={sharing?.type} targetId={sharing?.id} targetIds={sharing?.ids} targetName={sharing?.name || ""}
        initialTab={sharing?.tab || "portal"} onClose={() => setSharing(null)}
        onSaved={() => { if (sharing?.ids) { ok(`Sharing updated for ${sharing.ids.length} documents.`); setSelected(new Set()); } }}
        onEmailed={(s) => ok(`“${s.target_name}” emailed to ${s.counts?.sent ?? 0} ${s.counts?.sent === 1 ? "person" : "people"}${s.counts?.failed ? `; ${s.counts.failed} failed` : ""}.`)} />
      <AckTrackingDrawer open={Boolean(tracking)} document={tracking} onClose={() => setTracking(null)} />
      {versions && <VersionsPanel document={versions} onClose={() => setVersions(null)} />}
      <FilePreviewDrawer open={Boolean(previewing)} documentId={previewing?.id} title={previewing?.title} onClose={() => setPreviewing(null)}
        missingActions={{ upload_version: previewing ? { label: "Upload it again", onClick: () => { setDialog({ mode: "version", document: previewing }); setPreviewing(null); } } : undefined }} />
    </OrganizationDocumentsLayout>
  );
}

/** When the publish state and "Who can see" disagree, say so plainly next to the audience. */
function ClashNote({ file, onShare }) {
  if (file.status === "pending_approval") return null;
  if (file.publish_state !== "published" && file.publish_state !== "scheduled") {
    return <p className="mt-1 text-xs text-slate-500">No one yet (not published)</p>;
  }
  if (file.publish_state === "published" && file.access?.visibility === "admin_only") {
    return (
      <p className="mt-1 text-xs text-amber-800">
        Published, but only admins can see it.{" "}
        <button type="button" onClick={onShare} className="font-semibold underline" aria-label={`Share ${file.title} with employees`}>Share</button>
      </p>
    );
  }
  return null;
}

function Notice({ notice, onClose }) {
  const error = notice.tone === "error";
  return (
    <div role={error ? "alert" : "status"}
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-2 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
      <span>{notice.text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss message" className="rounded p-0.5 hover:bg-black/5"><X size={14} aria-hidden="true" /></button>
    </div>
  );
}

function TextButton({ label, text, icon: Icon, onClick, primary }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold ${primary ? "border-blue-200 text-blue-700 hover:bg-blue-50" : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-[#334155] dark:text-slate-200"}`}>
      <Icon size={14} aria-hidden="true" />{text}
    </button>
  );
}

function IconButton({ label, onClick, icon: Icon, danger }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`rounded-lg p-1.5 ${danger ? "text-rose-700 hover:bg-rose-50" : "text-slate-600 hover:bg-slate-100"}`}>
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
