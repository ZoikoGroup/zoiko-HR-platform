import { useState } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/onboarding" },
  { label: "New Hires", href: "/zoiko-hr/onboarding/new-hires" },
  { label: "Pre-Onboarding", href: "/zoiko-hr/onboarding/pre-onboarding" },
  { label: "Documents", href: "/zoiko-hr/onboarding/documents" },
  { label: "Checklists", href: "/zoiko-hr/onboarding/checklists" },
  { label: "Orientation", href: "/zoiko-hr/onboarding/orientation" },
  { label: "Reports", href: "/zoiko-hr/onboarding/reports" },
  { label: "Settings", href: "/zoiko-hr/onboarding/settings" },
];

function OnboardingSubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/zoiko-hr/onboarding"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

const STAGES = [
  { value: "offer_sent", label: "Offer Sent" },
  { value: "offer_accepted", label: "Offer Accepted" },
  { value: "pre_joining", label: "Pre-Joining" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

const DEFAULT_CHECKLIST_TEMPLATES = [
  { id: 1, name: "HR Onboarding Checklist" },
  { id: 2, name: "IT Setup Checklist" },
  { id: 3, name: "Manager Onboarding Checklist" },
  { id: 4, name: "Facilities & Security Checklist" },
];

const DEFAULT_ORIENTATION_SESSIONS = [
  { id: 1, name: "Company Overview" },
  { id: 2, name: "HR Policies & Benefits" },
  { id: 3, name: "IT Systems Orientation" },
  { id: 4, name: "Team Welcome Session" },
];

const MANDATORY_TRAINING_PATHS = [
  { id: 1, name: "Security Awareness Training" },
  { id: 2, name: "Code of Conduct" },
  { id: 3, name: "Data Privacy & GDPR" },
  { id: 4, name: "Workplace Safety" },
];

export default function OnboardingSettings() {
  const [activeSection, setActiveSection] = useState("general");

  const [autoSendOfferLetter, setAutoSendOfferLetter] = useState(true);
  const [defaultDuration, setDefaultDuration] = useState(30);
  const [requireDocSubmission, setRequireDocSubmission] = useState(true);
  const [sendReminders, setSendReminders] = useState(true);
  const [reminderDays, setReminderDays] = useState(3);
  const [allowSelfOnboarding, setAllowSelfOnboarding] = useState(false);

  const [enabledStages, setEnabledStages] = useState(
    STAGES.map((s) => s.value)
  );

  const [selectedTemplates, setSelectedTemplates] = useState([1, 2]);
  const [selectedSessions, setSelectedSessions] = useState([1, 2, 3]);
  const [selectedTraining, setSelectedTraining] = useState([1, 2]);

  const [saved, setSaved] = useState(false);

  const toggleStage = (value) => {
    setEnabledStages((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value]
    );
  };

  const toggleArrayItem = (arr, setter, id) => {
    setter((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const sectionClass = (section) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeSection === section
        ? "bg-blue-600 text-white"
        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
    }`;

  return (
    <HRPage
      title="Onboarding Settings"
      subtitle="Configure onboarding stages, defaults, templates, and general preferences."
    >
      <OnboardingSubNav />

      {saved && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg flex justify-between items-center">
          <span>Settings saved successfully.</span>
          <button onClick={() => setSaved(false)} className="font-bold">
            &times;
          </button>
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-48 shrink-0 space-y-1">
          <button
            onClick={() => setActiveSection("general")}
            className={`w-full text-left ${sectionClass("general")}`}
          >
            General
          </button>
          <button
            onClick={() => setActiveSection("stages")}
            className={`w-full text-left ${sectionClass("stages")}`}
          >
            Onboarding Stages
          </button>
          <button
            onClick={() => setActiveSection("checklists")}
            className={`w-full text-left ${sectionClass("checklists")}`}
          >
            Default Checklists
          </button>
          <button
            onClick={() => setActiveSection("orientation")}
            className={`w-full text-left ${sectionClass("orientation")}`}
          >
            Orientation Sessions
          </button>
          <button
            onClick={() => setActiveSection("training")}
            className={`w-full text-left ${sectionClass("training")}`}
          >
            Training Paths
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6">
            {/* ========== GENERAL ========== */}
            {activeSection === "general" && (
              <div className="space-y-5">
                <h3 className="text-lg font-bold text-gray-800">
                  General Settings
                </h3>

                <div className="flex items-center justify-between py-3 border-b border-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Auto-Send Offer Letter
                    </p>
                    <p className="text-xs text-gray-400">
                      Automatically send offer letter when status changes to
                      "Offer Sent"
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSendOfferLetter}
                      onChange={(e) => setAutoSendOfferLetter(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Require Document Submission
                    </p>
                    <p className="text-xs text-gray-400">
                      New hires must submit required documents before onboarding
                      can proceed
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireDocSubmission}
                      onChange={(e) =>
                        setRequireDocSubmission(e.target.checked)
                      }
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Send Reminder Notifications
                    </p>
                    <p className="text-xs text-gray-400">
                      Automated reminders for pending onboarding tasks
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendReminders}
                      onChange={(e) => setSendReminders(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {sendReminders && (
                  <div className="flex items-center justify-between py-3 border-b border-gray-50 pl-6">
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        Reminder Days Before
                      </p>
                      <p className="text-xs text-gray-400">
                        Number of days before due date to send reminders
                      </p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={reminderDays}
                      onChange={(e) =>
                        setReminderDays(Number(e.target.value))
                      }
                      className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between py-3 border-b border-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Default Onboarding Duration
                    </p>
                    <p className="text-xs text-gray-400">
                      Standard number of days for the full onboarding process
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={defaultDuration}
                      onChange={(e) =>
                        setDefaultDuration(Number(e.target.value))
                      }
                      className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-400">days</span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Allow Self-Onboarding
                    </p>
                    <p className="text-xs text-gray-400">
                      New hires can complete pre-boarding tasks on their own
                      before start date
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowSelfOnboarding}
                      onChange={(e) =>
                        setAllowSelfOnboarding(e.target.checked)
                      }
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            )}

            {/* ========== STAGES ========== */}
            {activeSection === "stages" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">
                    Onboarding Stages / Flow
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Enable or disable onboarding stages. Disabled stages will
                    be skipped in the workflow.
                  </p>
                </div>

                <div className="space-y-2">
                  {STAGES.map((stage, idx) => (
                    <div
                      key={stage.value}
                      className="flex items-center justify-between py-3 px-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-700">
                            {stage.label}
                          </p>
                          <p className="text-xs text-gray-400">
                            {stage.value === "offer_sent" &&
                              "Initial offer letter stage"}
                            {stage.value === "offer_accepted" &&
                              "Candidate accepts the offer"}
                            {stage.value === "pre_joining" &&
                              "Pre-boarding tasks before start date"}
                            {stage.value === "in_progress" &&
                              "Active onboarding after start date"}
                            {stage.value === "completed" &&
                              "Onboarding process finalized"}
                          </p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enabledStages.includes(stage.value)}
                          onChange={() => toggleStage(stage.value)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  ))}
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">Flow order: </span>
                    {STAGES.filter((s) => enabledStages.includes(s.value))
                      .map((s) => s.label)
                      .join(" \u2192 ")}
                  </p>
                </div>
              </div>
            )}

            {/* ========== CHECKLISTS ========== */}
            {activeSection === "checklists" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">
                    Default Checklist Templates
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Select checklist templates that are automatically assigned
                    to all new hires.
                  </p>
                </div>

                <div className="space-y-2">
                  {DEFAULT_CHECKLIST_TEMPLATES.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="flex items-center justify-between py-3 px-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedTemplates.includes(tpl.id)}
                          onChange={() =>
                            toggleArrayItem(
                              selectedTemplates,
                              setSelectedTemplates,
                              tpl.id
                            )
                          }
                          className="rounded border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          {tpl.name}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          selectedTemplates.includes(tpl.id)
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {selectedTemplates.includes(tpl.id)
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </div>
                  ))}
                </div>

                {selectedTemplates.length === 0 && (
                  <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <p className="text-sm text-gray-400">
                      No checklist templates selected.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ========== ORIENTATION ========== */}
            {activeSection === "orientation" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">
                    Default Orientation Sessions
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Choose default orientation sessions that are auto-assigned
                    to new onboarding records.
                  </p>
                </div>

                <div className="space-y-2">
                  {DEFAULT_ORIENTATION_SESSIONS.map((sess) => (
                    <div
                      key={sess.id}
                      className="flex items-center justify-between py-3 px-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedSessions.includes(sess.id)}
                          onChange={() =>
                            toggleArrayItem(
                              selectedSessions,
                              setSelectedSessions,
                              sess.id
                            )
                          }
                          className="rounded border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          {sess.name}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          selectedSessions.includes(sess.id)
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {selectedSessions.includes(sess.id)
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </div>
                  ))}
                </div>

                {selectedSessions.length === 0 && (
                  <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <p className="text-sm text-gray-400">
                      No orientation sessions selected.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ========== TRAINING ========== */}
            {activeSection === "training" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">
                    Mandatory Training Paths
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Configure training paths that are mandatory for all new
                    hires to complete.
                  </p>
                </div>

                <div className="space-y-2">
                  {MANDATORY_TRAINING_PATHS.map((path) => (
                    <div
                      key={path.id}
                      className="flex items-center justify-between py-3 px-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedTraining.includes(path.id)}
                          onChange={() =>
                            toggleArrayItem(
                              selectedTraining,
                              setSelectedTraining,
                              path.id
                            )
                          }
                          className="rounded border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          {path.name}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          selectedTraining.includes(path.id)
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {selectedTraining.includes(path.id)
                          ? "Mandatory"
                          : "Optional"}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                  <p className="text-sm text-amber-700">
                    <span className="font-medium">Note: </span>
                    Mandatory training paths must be completed before the
                    onboarding status can be set to "Completed".
                  </p>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="pt-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={handleSave}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </HRPage>
  );
}
