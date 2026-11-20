import { useEffect, useRef, useState } from "react";
import { getSkills, createSkill, updateSkill, deleteSkill } from "../../../service/hrService";
import EmployeePicker from "./EmployeePicker.jsx";
import { Banner, Dialog, DialogButtons, Pager, Table, asPage, inputCls, PER_PAGE } from "./recordsKit.jsx";

export const LEVELS = [
  { value: 1, label: "1 · Beginner" },
  { value: 2, label: "2 · Developing" },
  { value: 3, label: "3 · Competent" },
  { value: 4, label: "4 · Advanced" },
  { value: 5, label: "5 · Expert" },
];

/** Admin screen (audit L4): the skills recorded for the organization's people (they feed the skill gap report). */
export default function LearningSkills() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [who, setWho] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null);
  const latest = useRef(0);

  const load = async () => {
    const ticket = ++latest.current;
    setLoading(true);
    try {
      const res = asPage(await getSkills({ page, per_page: PER_PAGE, employee_id: who?.id }));
      if (ticket !== latest.current) return;
      setRows(res.items);
      setTotal(res.total);
    } catch (err) {
      if (ticket === latest.current) { setRows([]); setError(err?.message || "Skills could not be loaded."); }
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  };
  useEffect(() => { load(); }, [page, who]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (row) => {
    if (!window.confirm(`Delete the skill "${row.skill_name}" for ${row.employee_name || "this person"}?`)) return;
    setError(""); setNotice("");
    try {
      await deleteSkill(row.id);
      setNotice("The skill was deleted.");
      await load();
    } catch (err) {
      setError(err?.message || "The skill could not be deleted.");
    }
  };

  return (
    <div className="space-y-4">
      <Banner message={error} onClose={() => setError("")} />
      <Banner message={notice} tone="ok" onClose={() => setNotice("")} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72">
          <EmployeePicker id="skill-filter" label="Show one person" value={who} onChange={(p) => { setWho(p); setPage(1); }} />
        </div>
        <button type="button" onClick={() => setEditing({})} className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">+ Add Skill</button>
      </div>

      <Table headers={["Employee", "Skill", "Category", "Level", "Actions"]}
        empty={<>
          {!loading && rows.length === 0 && <p className="text-center py-10 text-gray-500">{who ? "This person has no skills recorded." : "No skills recorded yet."}</p>}
          <Pager page={page} total={total} onPage={setPage} />
        </>}>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-gray-50">
            <td className="px-4 py-3 font-medium text-gray-800">{r.employee_name || `Employee #${r.employee_id}`}</td>
            <td className="px-4 py-3 text-gray-700">{r.skill_name}</td>
            <td className="px-4 py-3 text-gray-500">{r.category || "-"}</td>
            <td className="px-4 py-3 text-gray-700">{LEVELS.find((l) => l.value === r.proficiency_level)?.label || r.proficiency_level}</td>
            <td className="px-4 py-3 text-right">
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(r)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                <button type="button" onClick={() => remove(r)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      {editing && (
        <SkillDialog row={editing.id ? editing : null} onClose={() => setEditing(null)}
          onDone={async (msg) => { setEditing(null); setNotice(msg); await load(); }} />
      )}
    </div>
  );
}

function SkillDialog({ row, onClose, onDone }) {
  const creating = !row;
  const [form, setForm] = useState({ skill_name: row?.skill_name || "", category: row?.category || "", proficiency_level: String(row?.proficiency_level || 3) });
  const [person, setPerson] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined, submit: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    const found = {};
    if (creating && !person) found.person = "Choose whose skill this is.";
    if (!form.skill_name.trim()) found.skill_name = "Skill name is required.";
    setErrors(found);
    if (Object.keys(found).length) return;
    const payload = { skill_name: form.skill_name.trim(), category: form.category.trim() || null, proficiency_level: Number(form.proficiency_level) };
    setBusy(true);
    try {
      if (creating) await createSkill({ ...payload, employee_id: person.id });
      else await updateSkill(row.id, payload);
      await onDone(creating ? `"${payload.skill_name}" was added for ${person.name}.` : "The skill was updated.");
    } catch (err) {
      setErrors({ submit: err?.message || "The skill could not be saved." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={creating ? "Add Skill" : "Edit Skill"} onClose={onClose}>
      <form noValidate onSubmit={submit} className="space-y-4">
        {errors.submit && <p role="alert" className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{errors.submit}</p>}
        {creating
          ? <EmployeePicker id="skill-person" label="Employee" required value={person} onChange={setPerson} error={errors.person} />
          : <p className="text-sm text-gray-600">For <span className="font-medium text-gray-800">{row.employee_name || `Employee #${row.employee_id}`}</span></p>}
        <div>
          <label htmlFor="skill-name" className="block text-sm font-medium text-gray-700 mb-1">Skill<span className="text-red-500"> *</span></label>
          <input id="skill-name" value={form.skill_name} maxLength={200} onChange={set("skill_name")} className={inputCls} />
          {errors.skill_name && <p role="alert" className="text-red-500 text-xs mt-1">{errors.skill_name}</p>}
        </div>
        <div>
          <label htmlFor="skill-category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <input id="skill-category" value={form.category} maxLength={100} onChange={set("category")} className={inputCls} />
        </div>
        <div>
          <label htmlFor="skill-level" className="block text-sm font-medium text-gray-700 mb-1">Proficiency</label>
          <select id="skill-level" value={form.proficiency_level} onChange={set("proficiency_level")} className={inputCls}>
            {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <DialogButtons busy={busy} label={creating ? "Add Skill" : "Save Changes"} busyLabel="Saving..." onCancel={onClose} />
      </form>
    </Dialog>
  );
}
