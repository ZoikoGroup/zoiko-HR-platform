import { useState } from "react";
import HRPage from "../../../components/HRPage";
import AttendanceSubNav from "./components/AttendanceSubNav";
import ShiftsTab from "./components/ShiftsTab";
import ShiftAssignmentsTab from "./components/ShiftAssignmentsTab";
import RosterNoticesTab from "./components/RosterNoticesTab";
import WorkPolicyTab from "./components/WorkPolicyTab";
import { Toast, useToast } from "../documents/generated/docUi";

const TABS = [["shifts", "Shifts"], ["assignments", "Assignments"], ["roster", "Roster & notices"], ["policy", "Work policy"]];

/**
 * Admin → Attendance → Shifts & Work Policy (My Attendance plan step 6): define shifts (timing, required hours,
 * working days, thresholds), assign them to people or departments over periods, publish roster patterns and change
 * notices, and set the organization's attendance rules. What is set here is what My Attendance shows and what the
 * shared status engine uses; nothing is recalculated in the browser.
 */
export default function ShiftsWorkPolicyPage() {
  const [tab, setTab] = useState("shifts");
  const [toast, showToast] = useToast();
  return (
    <HRPage title="Shifts & Work Policy" subtitle="Shifts, who works them, shift notices and the organization's attendance rules.">
      <AttendanceSubNav />
      <Toast toast={toast} />
      <div role="tablist" aria-label="Shifts and work policy" className="mb-4 flex flex-wrap gap-2" onKeyDown={(e) => {
        const i = TABS.findIndex(([k]) => k === tab);
        const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        const k = TABS[(next + TABS.length) % TABS.length][0];
        setTab(k);
        document.getElementById(`swp-tab-${k}`)?.focus();
      }}>
        {TABS.map(([k, label]) => (
          <button key={k} id={`swp-tab-${k}`} role="tab" type="button" aria-selected={tab === k} aria-controls={`swp-panel-${k}`} tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              tab === k ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`swp-panel-${tab}`} aria-labelledby={`swp-tab-${tab}`}>
        {tab === "shifts" && <ShiftsTab onToast={showToast} />}
        {tab === "assignments" && <ShiftAssignmentsTab onToast={showToast} />}
        {tab === "roster" && <RosterNoticesTab onToast={showToast} />}
        {tab === "policy" && <WorkPolicyTab onToast={showToast} />}
      </div>
    </HRPage>
  );
}
