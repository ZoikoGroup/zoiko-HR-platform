import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { OrganizationDocumentsLayout } from "../ui";
import SectionState from "../components/SectionState";
import DocsBreadcrumb from "../components/DocsBreadcrumb";
import { useCreateEmployeeCategory, useDeleteEmployeeCategory, useEmployeeCategories, useUpdateEmployeeCategory } from "../hooks/useEmployeeDocuments";

/**
 * Employee document categories (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A5): which containers exist, which are required,
 * which need an expiry date and which identity-number check (by jurisdiction) applies. Built-in containers can be turned
 * off but not deleted; identity, address and education uploads always need a person to approve them.
 */
export default function DocumentCategorySettingsPage() {
  const query = useEmployeeCategories();
  const update = useUpdateEmployeeCategory();
  const create = useCreateEmployeeCategory();
  const remove = useDeleteEmployeeCategory();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState(null);

  const save = async (id, data) => {
    setError(null);
    try { await update.mutateAsync({ id, data }); } catch (e) { setError(e?.message || "That change was not saved."); }
  };
  const add = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    try { await create.mutateAsync({ name: newName.trim(), is_required: false }); setNewName(""); } catch (err) { setError(err?.message || "The category was not added."); }
  };
  const del = async (c) => {
    setError(null);
    try { await remove.mutateAsync(c.id); } catch (e) { setError(e?.message || "The category was not deleted."); }
  };

  return (
    <OrganizationDocumentsLayout title="Document Categories" subtitle="The containers employees upload into, and what each one requires.">
      <div className="space-y-5">
        <DocsBreadcrumb items={[{ label: "Documents", to: "/zoiko-hr/documents" }, { label: "Employee Documents", to: "/zoiko-hr/documents/employees" }, { label: "Categories" }]} />
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</p>}
        <SectionState query={query} label="Loading categories" isEmpty={(d) => !d?.items?.length} empty={{ title: "No categories" }}>
          {(data) => (
            <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-3">Category</th><th className="px-4 py-3">Required</th><th className="px-4 py-3">Needs expiry date</th>
                    <th className="px-4 py-3">Identity-number check</th><th className="px-4 py-3">Active</th><th className="px-4 py-3"><span className="sr-only">Delete</span></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 dark:text-[#f1f5f9]">{c.name}</p>
                        <p className="text-xs text-slate-500">{c.uploader === "employee" ? "Employees upload" : "Issued by HR"}
                          {c.human_approval_required && " · Always reviewed by a person"}</p>
                      </td>
                      <td className="px-4 py-3"><input type="checkbox" aria-label={`${c.name} is required`} checked={c.is_required} onChange={(e) => save(c.id, { is_required: e.target.checked })} /></td>
                      <td className="px-4 py-3"><input type="checkbox" aria-label={`${c.name} needs an expiry date`} checked={c.requires_expiry} onChange={(e) => save(c.id, { requires_expiry: e.target.checked })} /></td>
                      <td className="px-4 py-3">
                        <select aria-label={`${c.name} identity-number check`} value={c.id_number_field || ""} onChange={(e) => save(c.id, { id_number_field: e.target.value || "" })}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-sm">
                          <option value="">None</option>
                          {data.id_number_checks.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3"><input type="checkbox" aria-label={`${c.name} is active`} checked={c.is_active} onChange={(e) => save(c.id, { is_active: e.target.checked })} /></td>
                      <td className="px-4 py-3">
                        {!c.is_system && (
                          <button type="button" onClick={() => del(c)} aria-label={`Delete ${c.name}`} className="rounded-lg p-1.5 text-rose-700 hover:bg-rose-50"><Trash2 size={16} aria-hidden="true" /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionState>
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1 text-sm">
            <span className="block text-xs font-medium text-slate-600">New category</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} placeholder="e.g. Work permit"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <button type="submit" disabled={create.isPending || !newName.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            <Plus size={16} aria-hidden="true" /> Add category
          </button>
        </form>
      </div>
    </OrganizationDocumentsLayout>
  );
}
