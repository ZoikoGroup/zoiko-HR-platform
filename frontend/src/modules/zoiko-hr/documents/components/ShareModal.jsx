import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AccessVisibility } from "../types";
import { isValid, validateAccessRule } from "../validation";
import { useAccessRule, usePutAccessRule } from "../hooks/useCompanyDocuments";
import { previewAccessRule } from "../../../../service/documentsService";
import { getDepartments, getHrEmployees } from "../../../../service/hrService";

const OPTIONS = [
  [AccessVisibility.ADMIN_ONLY, "Admins only"],
  [AccessVisibility.ALL, "All employees"],
  [AccessVisibility.DEPARTMENTS, "Selected departments"],
  [AccessVisibility.ROLES, "Selected roles"],
  [AccessVisibility.EMPLOYEES, "Selected people"],
];
const ROLES = [["employee", "Employees"], ["manager", "Managers"], ["hr_admin", "HR Admins"], ["admin", "Org Admins"]];

const asList = (raw) => (Array.isArray(raw) ? raw : raw?.items || raw?.data || raw?.list || []);

/**
 * Who can see a category, folder or file (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A3 "Share"). Shows live how many people the
 * rule reaches before it is saved, view-only vs download, and whether people must confirm they have read it. A folder or
 * file can simply follow its parent ("Same as …").
 *
 * @param {{ open: boolean, targetType: 'category'|'folder'|'document', targetId: number, targetName: string, onClose: () => void }} props
 */
export default function ShareModal({ open, targetType, targetId, targetName, onClose }) {
  const titleId = useId();
  const current = useAccessRule(targetType, targetId, open);
  const save = usePutAccessRule();
  const [rule, setRule] = useState(null);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [preview, setPreview] = useState(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const departments = useQuery({ queryKey: ["hr", "departments", "share"], queryFn: () => getDepartments().then((r) => asList(r?.data ?? r)), enabled: open });
  const people = useQuery({ queryKey: ["hr", "employees", "share"], queryFn: () => getHrEmployees({ status: "active", per_page: 200 }).then((r) => asList(r?.data ?? r)),
                            enabled: open && rule?.visibility === AccessVisibility.EMPLOYEES });

  useEffect(() => {
    if (!open || !current.data) return;
    const own = current.data.rule;
    const eff = current.data.effective;
    setRule({
      inherit: targetType !== "category" && (!own || own.inherit),
      visibility: own?.visibility || eff.visibility, permission: own?.permission || eff.permission,
      require_ack: own ? Boolean(own.require_ack) : Boolean(eff.require_ack),
      department_ids: own?.department_ids || eff.department_ids || [], roles: own?.roles || eff.roles || [],
      employee_ids: own?.employee_ids || eff.employee_ids || [],
    });
    setErrors({}); setServerError(null);
  }, [open, current.data, targetType]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // live audience size, debounced; nothing is saved
  useEffect(() => {
    if (!open || !rule || rule.inherit || !isValid(validateAccessRule(rule))) { setPreview(null); return undefined; }
    const t = setTimeout(() => { previewAccessRule(rule).then((r) => setPreview(r?.audience_count ?? null)).catch(() => setPreview(null)); }, 300);
    return () => clearTimeout(t);
  }, [open, rule]);

  if (!open) return null;
  const set = (patch) => setRule((r) => ({ ...r, ...patch }));
  const toggleIn = (key, value) => setRule((r) => {
    const list = new Set(r[key] || []);
    if (list.has(value)) list.delete(value); else list.add(value);
    return { ...r, [key]: [...list] };
  });

  const submit = async (e) => {
    e.preventDefault();
    const found = rule.inherit ? {} : validateAccessRule(rule);
    setErrors(found);
    if (!isValid(found)) return;
    setServerError(null);
    try {
      const payload = rule.inherit ? { ...current.data.effective, inherit: true, visibility: current.data.effective.visibility } : { ...rule, inherit: false };
      await save.mutateAsync({ targetType, targetId, rule: {
        visibility: payload.visibility, permission: payload.permission, require_ack: Boolean(payload.require_ack), inherit: Boolean(payload.inherit),
        department_ids: payload.department_ids || null, roles: payload.roles || null, employee_ids: payload.employee_ids || null } });
      closeRef.current?.();
    } catch (err) {
      setServerError(err?.message || "The change was not saved.");
    }
  };

  const deptList = departments.data || [];
  const peopleList = people.data || [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} onClick={(e) => e.stopPropagation()} noValidate
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-gray-200/80 bg-white p-6 shadow-xl dark:border-[#334155] dark:bg-[#1e293b]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">Who can see “{targetName}”</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={18} aria-hidden="true" /></button>
        </div>
        {!rule ? (
          <div role="status" className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading…</div>
        ) : (
          <>
            {targetType !== "category" && (
              <label className="mb-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={rule.inherit} onChange={(e) => set({ inherit: e.target.checked })} />
                Same as its {targetType === "document" ? "folder / category" : "parent"} ({current.data.effective.label})
              </label>
            )}
            <fieldset disabled={rule.inherit} className="space-y-4 disabled:opacity-50">
              <legend className="sr-only">Visibility</legend>
              <div role="radiogroup" aria-label="Visibility" className="space-y-1">
                {OPTIONS.map(([v, label]) => (
                  <label key={v} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="visibility" value={v} checked={rule.visibility === v} onChange={() => set({ visibility: v })} /> {label}
                  </label>
                ))}
              </div>
              {rule.visibility === AccessVisibility.DEPARTMENTS && (
                <div>
                  <p className="text-xs font-medium text-slate-600">Departments</p>
                  <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
                    {deptList.map((d) => (
                      <label key={d.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={rule.department_ids.includes(d.id)} onChange={() => toggleIn("department_ids", d.id)} /> {d.name}
                      </label>
                    ))}
                  </div>
                  {errors.department_ids && <p role="alert" className="mt-1 text-xs text-rose-700">{errors.department_ids}</p>}
                </div>
              )}
              {rule.visibility === AccessVisibility.ROLES && (
                <div>
                  <p className="text-xs font-medium text-slate-600">Roles</p>
                  {ROLES.map(([v, label]) => (
                    <label key={v} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={rule.roles.includes(v)} onChange={() => toggleIn("roles", v)} /> {label}
                    </label>
                  ))}
                  {errors.roles && <p role="alert" className="mt-1 text-xs text-rose-700">{errors.roles}</p>}
                </div>
              )}
              {rule.visibility === AccessVisibility.EMPLOYEES && (
                <div>
                  <p className="text-xs font-medium text-slate-600">People</p>
                  <div className="mt-1 max-h-48 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
                    {peopleList.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={rule.employee_ids.includes(p.id)} onChange={() => toggleIn("employee_ids", p.id)} />
                        {`${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email}
                      </label>
                    ))}
                  </div>
                  {errors.employee_ids && <p role="alert" className="mt-1 text-xs text-rose-700">{errors.employee_ids}</p>}
                </div>
              )}
              {rule.visibility !== AccessVisibility.ADMIN_ONLY && (
                <>
                  <div role="radiogroup" aria-label="Permission" className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="radio" name="permission" checked={rule.permission === "view"} onChange={() => set({ permission: "view" })} /> View only</label>
                    <label className="flex items-center gap-2"><input type="radio" name="permission" checked={rule.permission === "download"} onChange={() => set({ permission: "download" })} /> View and download</label>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={rule.require_ack} onChange={(e) => set({ require_ack: e.target.checked })} />
                    People must confirm “I have read this”
                  </label>
                </>
              )}
            </fieldset>
            <p className="mt-4 text-sm text-slate-600" role="status" aria-live="polite">
              {rule.inherit ? `Follows its parent: ${current.data.effective.label}.`
                : rule.visibility === AccessVisibility.ADMIN_ONLY ? "Only HR Admins and the Org Admin can see this."
                : preview === null ? " " : `Visible to ${preview} ${preview === 1 ? "person" : "people"}.`}
            </p>
            {serverError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{serverError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={save.isPending} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {save.isPending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Save
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
