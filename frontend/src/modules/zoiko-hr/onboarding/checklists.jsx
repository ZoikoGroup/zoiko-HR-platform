import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import {
  getOnboardingChecklistTemplates,
  createOnboardingChecklistTemplate,
  updateOnboardingChecklistTemplate,
  deleteOnboardingChecklistTemplate,
  getOnboardingChecklistAssignments,
  createOnboardingChecklistAssignment,
  updateOnboardingChecklistAssignment,
  deleteOnboardingChecklistAssignment,
  getOnboardingRecords,
} from "../../../service/hrService";

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

const CATEGORIES = ["HR", "IT", "Manager", "Custom"];

const CATEGORY_COLORS = {
  HR: "blue",
  IT: "green",
  Manager: "purple",
  Custom: "orange",
};

export default function OnboardingChecklists() {
  const [activeTab, setActiveTab] = useState("HR");
  const [templates, setTemplates] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState({ type: "", text: "" });

  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formItems, setFormItems] = useState([{ title: "", description: "" }]);
  const [saving, setSaving] = useState(false);

  const [assigningTo, setAssigningTo] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [expandedTemplate, setExpandedTemplate] = useState(null);

  const showAction = (type, text) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg({ type: "", text: "" }), 4000);
  };

  const fetchTemplates = async () => {
    try {
      const data = await getOnboardingChecklistTemplates(activeTab);
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load templates");
      setTemplates([]);
    }
  };

  const fetchAssignments = async () => {
    try {
      const data = await getOnboardingChecklistAssignments();
      setAssignments(Array.isArray(data) ? data : []);
    } catch {
      setAssignments([]);
    }
  };

  const fetchRecords = async () => {
    try {
      const data = await getOnboardingRecords();
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      setRecords([]);
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchTemplates(), fetchAssignments(), fetchRecords()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, [activeTab]);

  const resetForm = () => {
    setShowForm(false);
    setEditingTemplate(null);
    setFormName("");
    setFormDescription("");
    setFormItems([{ title: "", description: "" }]);
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setFormName(template.name || "");
    setFormDescription(template.description || "");
    setFormItems(
      template.items && template.items.length > 0
        ? template.items.map((i) => ({ title: i.title || "", description: i.description || "" }))
        : [{ title: "", description: "" }]
    );
    setShowForm(true);
  };

  const handleAddItem = () => {
    setFormItems((prev) => [...prev, { title: "", description: "" }]);
  };

  const handleRemoveItem = (idx) => {
    setFormItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx, field, value) => {
    setFormItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      showAction("error", "Template name is required");
      return;
    }
    const validItems = formItems.filter((i) => i.title.trim());
    if (validItems.length === 0) {
      showAction("error", "At least one checklist item is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription.trim(),
        category: activeTab,
        items: validItems,
      };
      if (editingTemplate) {
        await updateOnboardingChecklistTemplate(editingTemplate.id, payload);
        showAction("success", "Template updated successfully");
      } else {
        await createOnboardingChecklistTemplate(payload);
        showAction("success", "Template created successfully");
      }
      resetForm();
      await fetchTemplates();
    } catch (err) {
      showAction("error", err.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId) => {
    if (!window.confirm("Are you sure you want to delete this template?")) return;
    try {
      await deleteOnboardingChecklistTemplate(templateId);
      showAction("success", "Template deleted");
      await fetchTemplates();
    } catch (err) {
      showAction("error", err.message || "Failed to delete template");
    }
  };

  const handleAssign = async () => {
    if (!selectedRecord || !assigningTo) return;
    setAssigning(true);
    try {
      await createOnboardingChecklistAssignment({
        onboarding_record_id: Number(selectedRecord),
        template_id: assigningTo,
      });
      showAction("success", "Checklist assigned successfully");
      setAssigningTo(null);
      setSelectedRecord("");
      await fetchAssignments();
    } catch (err) {
      showAction("error", err.message || "Failed to assign checklist");
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (assignmentId) => {
    try {
      await deleteOnboardingChecklistAssignment(assignmentId);
      showAction("success", "Assignment removed");
      await fetchAssignments();
    } catch (err) {
      showAction("error", err.message || "Failed to remove assignment");
    }
  };

  const handleToggleItem = async (assignment, itemIdx) => {
    const updatedItems = [...(assignment.items || [])];
    updatedItems[itemIdx] = {
      ...updatedItems[itemIdx],
      completed: !updatedItems[itemIdx]?.completed,
    };
    try {
      await updateOnboardingChecklistAssignment(assignment.id, { items: updatedItems });
      await fetchAssignments();
    } catch (err) {
      showAction("error", err.message || "Failed to update item");
    }
  };

  const getAssignmentsForTemplate = (templateId) => {
    return assignments.filter((a) => a.template_id === templateId || a.templateId === templateId);
  };

  const getRecordName = (recordId) => {
    const rec = records.find((r) => r.id === recordId || r.id === Number(recordId));
    return rec ? rec.candidate_name || rec.name || `Record #${recordId}` : `Record #${recordId}`;
  };

  const calcProgress = (templateId) => {
    const tAssignments = getAssignmentsForTemplate(templateId);
    if (tAssignments.length === 0) return { total: 0, done: 0, pct: 0 };
    let totalItems = 0;
    let doneItems = 0;
    tAssignments.forEach((a) => {
      const items = a.items || [];
      totalItems += items.length;
      doneItems += items.filter((i) => i.completed).length;
    });
    return {
      total: totalItems,
      done: doneItems,
      pct: totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0,
    };
  };

  if (loading && templates.length === 0) {
    return (
      <HRPage title="Onboarding Checklists" subtitle="Create and manage HR, IT, Manager, and Custom checklist templates.">
        <OnboardingSubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading checklists...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Onboarding Checklists" subtitle="Create and manage HR, IT, Manager, and Custom checklist templates.">
      <OnboardingSubNav />

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      {actionMsg.text && (
        <div className={`mb-4 px-4 py-3 rounded-lg flex justify-between items-center ${
          actionMsg.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg({ type: "", text: "" })} className="font-bold">&times;</button>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === cat
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Header Actions */}
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">
          {templates.length} template{templates.length !== 1 ? "s" : ""} in {activeTab}
        </p>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + New Template
        </button>
      </div>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={resetForm}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">
                {editingTemplate ? "Edit Template" : "New Template"}
              </h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Template Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. New Hire IT Setup"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Brief description of this checklist..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-gray-600">Checklist Items</label>
                  <button
                    onClick={handleAddItem}
                    className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                  >
                    + Add Item
                  </button>
                </div>
                <div className="space-y-2">
                  {formItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-1">
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => handleItemChange(idx, "title", e.target.value)}
                          placeholder="Item title"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                          placeholder="Optional description"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      {formItems.length > 1 && (
                        <button
                          onClick={() => handleRemoveItem(idx)}
                          className="text-red-400 hover:text-red-600 text-sm px-1 py-1 mt-1"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? "Saving..." : editingTemplate ? "Update Template" : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assigningTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setAssigningTo(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Assign Checklist</h3>
              <button onClick={() => setAssigningTo(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-sm text-gray-600">Select an onboarding record to assign this checklist to:</p>
              <select
                value={selectedRecord}
                onChange={(e) => setSelectedRecord(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose a record...</option>
                {records.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.candidate_name || r.name || `Record #${r.id}`} {r.email ? `(${r.email})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setAssigningTo(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={assigning || !selectedRecord}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              >
                {assigning ? "Assigning..." : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates List */}
      {templates.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium">No {activeTab} checklist templates yet.</p>
          <p className="text-gray-400 text-sm mt-1">Click "+ New Template" to create one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((tpl) => {
            const tplId = tpl.id || tpl._id;
            const tplAssignments = getAssignmentsForTemplate(tplId);
            const progress = calcProgress(tplId);
            const isExpanded = expandedTemplate === tplId;

            return (
              <div key={tplId} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-gray-800 truncate">{tpl.name}</h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-${CATEGORY_COLORS[tpl.category] || "gray"}-100 text-${CATEGORY_COLORS[tpl.category] || "gray"}-800`}>
                        {tpl.category || activeTab}
                      </span>
                    </div>
                    {tpl.description && (
                      <p className="text-sm text-gray-500 mt-0.5 truncate">{tpl.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400">
                      <span>{(tpl.items || []).length} item{(tpl.items || []).length !== 1 ? "s" : ""}</span>
                      <span>{tplAssignments.length} assignment{tplAssignments.length !== 1 ? "s" : ""}</span>
                      {progress.total > 0 && (
                        <span className="flex items-center gap-1">
                          <span className={`inline-block w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden`}>
                            <span
                              className={`block h-full rounded-full ${
                                progress.pct === 100 ? "bg-green-500" : "bg-blue-500"
                              }`}
                              style={{ width: `${progress.pct}%` }}
                            />
                          </span>
                          {progress.done}/{progress.total} ({progress.pct}%)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setAssigningTo(tplId)}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1"
                    >
                      Assign
                    </button>
                    <button
                      onClick={() => handleEdit(tpl)}
                      className="text-gray-500 hover:text-gray-700 text-xs px-2 py-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(tplId)}
                      className="text-red-400 hover:text-red-600 text-xs px-2 py-1"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setExpandedTemplate(isExpanded ? null : tplId)}
                      className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1"
                    >
                      {isExpanded ? "\u25BC" : "\u25B6"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {/* Template Items */}
                    <div className="px-5 py-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Template Items</h4>
                      {(tpl.items || []).length === 0 ? (
                        <p className="text-xs text-gray-400">No items defined.</p>
                      ) : (
                        <ul className="space-y-1">
                          {tpl.items.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                              <span className="text-gray-300 mt-0.5">&#8226;</span>
                              <div>
                                <span>{item.title}</span>
                                {item.description && (
                                  <p className="text-xs text-gray-400">{item.description}</p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Assignments with Progress */}
                    <div className="px-5 py-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Assignments</h4>
                      {tplAssignments.length === 0 ? (
                        <p className="text-xs text-gray-400">Not yet assigned to any onboarding record.</p>
                      ) : (
                        <div className="space-y-3">
                          {tplAssignments.map((assn) => {
                            const assnItems = assn.items || [];
                            const doneCount = assnItems.filter((i) => i.completed).length;
                            return (
                              <div key={assn.id} className="bg-gray-50 rounded-lg p-3">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-sm font-medium text-gray-800">
                                    {getRecordName(assn.onboarding_new_hire_id)}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">
                                      {doneCount}/{assnItems.length} done
                                    </span>
                                    <button
                                      onClick={() => handleUnassign(assn.id)}
                                      className="text-red-400 hover:text-red-600 text-xs"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  {assnItems.map((item, idx) => (
                                    <label
                                      key={idx}
                                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white rounded px-1 py-0.5"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={!!item.completed}
                                        onChange={() => handleToggleItem(assn, idx)}
                                        className="rounded border-gray-300"
                                      />
                                      <span className={item.completed ? "line-through text-gray-400" : "text-gray-700"}>
                                        {item.title}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </HRPage>
  );
}
