import { useEffect, useState } from "react";
import { getProgramParticipants, addProgramParticipant, removeProgramParticipant } from "../../../service/hrService";
import EmployeePicker from "./EmployeePicker.jsx";

/**
 * Who takes part in a training program, for an admin (audit L4): add someone with a server-side people search, remove
 * someone. The server's refusals ("already a participant", "program is full") are shown as they come.
 */
export default function ProgramParticipants({ program, onChanged }) {
  const [rows, setRows] = useState(null);
  const [person, setPerson] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    try {
      const res = await getProgramParticipants(program.id);
      setRows(Array.isArray(res) ? res : res?.items || []);
    } catch (err) {
      setRows([]);
      setError(err?.message || "Participants could not be loaded.");
    }
  };
  useEffect(() => { load(); }, [program.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    if (!person || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await addProgramParticipant(program.id, person.id);
      setNotice(`${person.name} was added.`);
      setPerson(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.message || "This person could not be added.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Remove ${row.employee_name || "this person"} from the program?`)) return;
    setError(""); setNotice("");
    try {
      await removeProgramParticipant(program.id, row.id);
      setNotice(`${row.employee_name || "The participant"} was removed.`);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.message || "The participant could not be removed.");
    }
  };

  const count = rows?.length ?? 0;
  const full = Boolean(program.max_participants) && count >= program.max_participants;
  return (
    <section aria-label="Participants" className="pt-4 border-t border-gray-100 space-y-3">
      <h3 className="text-sm font-semibold text-gray-800">
        Participants <span className="text-gray-400 font-normal">({count}{program.max_participants ? ` of ${program.max_participants}` : ""})</span>
      </h3>
      {error && <p role="alert" className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</p>}
      {notice && <p role="status" className="px-3 py-2 bg-green-50 border border-green-200 text-green-800 rounded-lg">{notice}</p>}
      {rows === null ? (
        <p className="text-gray-400">Loading participants...</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">No one has been added yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-3 py-2">
              <span className="text-gray-800">{r.employee_name || `Employee #${r.employee_id}`} <span className="text-xs text-gray-400 capitalize">{r.status}</span></span>
              <button type="button" onClick={() => remove(r)} className="text-red-600 hover:text-red-800 text-xs font-medium">Remove</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <EmployeePicker id="participant-person" label="Add a participant" value={person} onChange={setPerson} />
        </div>
        <button type="button" onClick={add} disabled={!person || busy} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg font-medium">
          {busy ? "Adding..." : "Add"}
        </button>
      </div>
      {full && <p className="text-xs text-amber-700">This program has reached its maximum number of participants.</p>}
    </section>
  );
}
