import { useEffect, useState } from "react";
import PageHeader from "../../../components/PageHeader";
import {
  BookOpen, CheckCircle2, Plus, ShieldOff, Search, ChevronDown, ChevronUp, Archive, PauseCircle,
  Pencil, Trash2, FilePlus2,
} from "lucide-react";
import {
  listKnowledgeSources, createKnowledgeSource, publishKnowledgeSource, retireKnowledgeSource, suspendKnowledgeSource,
  listKnowledgeVersions, listControls, setControl, addKnowledgeSourceVersion, updateKnowledgeSource, deleteKnowledgeSource,
} from "../../../service/assistantService";

const SOURCE_TYPES = ["policy", "faq", "sop", "compliance", "handbook", "guide", "form"];
const TIERS = ["A", "B", "C", "D"];
const STATUSES = ["draft", "review", "published", "superseded", "retired"];

const emptyForm = {
  title: "", source_type: "policy", authority_tier: "B", content_text: "",
  jurisdiction_code: "", worker_type: "", audience_role: "",
};

function VersionHistory({ sourceId, onSourceChanged }) {
  const [versions, setVersions] = useState(null);
  const [addingVersion, setAddingVersion] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadVersions = () => {
    listKnowledgeVersions(sourceId).then(setVersions).catch(() => setVersions([]));
  };

  useEffect(() => { loadVersions(); }, [sourceId]);

  const submitVersion = async (e) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addKnowledgeSourceVersion(sourceId, { content_text: newContent });
      setNewContent("");
      setAddingVersion(false);
      loadVersions();
      await onSourceChanged?.();
    } catch (err) {
      setError(err.message || "Failed to add a new version.");
    } finally {
      setBusy(false);
    }
  };

  if (versions === null) return <p className="px-3 py-2 text-[11px] text-slate-400">Loading versions...</p>;
  return (
    <div className="border-t border-slate-100 bg-white px-3 py-2 space-y-1.5">
      {versions.map((v) => (
        <div key={v.id} className="flex items-center justify-between text-[11px] text-slate-500">
          <span>
            Version {v.version_no} · hash {v.content_hash.slice(0, 8)}
            {v.effective_to ? ` · superseded ${new Date(v.effective_to).toLocaleDateString()}` : ""}
          </span>
          <span>{v.published_at ? `Published ${new Date(v.published_at).toLocaleDateString()}` : "Unpublished"}</span>
        </div>
      ))}
      {versions.length === 0 && <p className="text-[11px] text-slate-400">No versions found.</p>}

      {addingVersion ? (
        <form onSubmit={submitVersion} className="space-y-1.5 pt-1.5">
          <textarea
            autoFocus rows={5} placeholder="New version content — replaces the current content going forward..."
            value={newContent} onChange={(e) => setNewContent(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
          {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
          <div className="flex gap-1.5">
            <button disabled={busy} className="rounded-full bg-[var(--zhr-action-primary)] px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50">
              Save version
            </button>
            <button type="button" onClick={() => { setAddingVersion(false); setError(null); }} className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-bold text-slate-500">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAddingVersion(true)}
          className="flex items-center gap-1 pt-1 text-[11px] font-bold text-slate-500 hover:text-[var(--zhr-action-primary)]"
        >
          <FilePlus2 className="h-3.5 w-3.5" /> Add new version
        </button>
      )}
    </div>
  );
}

function EditMetadataForm({ source, onCancel, onSaved }) {
  const [form, setForm] = useState({
    title: source.title, source_type: source.source_type, authority_tier: source.authority_tier,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateKnowledgeSource(source.id, form);
      await onSaved();
    } catch (err) {
      setError(err.message || "Failed to update this source.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-slate-100 bg-white px-3 py-2.5">
      <input
        required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
      />
      <div className="flex gap-2">
        <select value={form.source_type} onChange={(e) => setForm((f) => ({ ...f, source_type: e.target.value }))} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
          {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={form.authority_tier} onChange={(e) => setForm((f) => ({ ...f, authority_tier: e.target.value }))} className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
          {TIERS.map((t) => <option key={t} value={t}>Tier {t}</option>)}
        </select>
      </div>
      {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
      <div className="flex gap-1.5">
        <button disabled={busy} className="rounded-full bg-[var(--zhr-action-primary)] px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={onCancel} className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-bold text-slate-500">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function AdminKnowledgePage() {
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showApplicability, setShowApplicability] = useState(false);
  const [controls, setControlsState] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const reload = async (params) => {
    const [srcs, ctrls] = await Promise.all([listKnowledgeSources(params), listControls()]);
    setSources(srcs);
    setControlsState(ctrls);
  };

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      reload({ search: search || undefined, status: statusFilter || undefined });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createKnowledgeSource({
        ...form,
        jurisdiction_code: form.jurisdiction_code || undefined,
        worker_type: form.worker_type || undefined,
        audience_role: form.audience_role || undefined,
      });
      setForm(emptyForm);
      await reload();
    } catch (err) {
      setError(err.message || "Failed to create knowledge source.");
    } finally {
      setBusy(false);
    }
  };

  const publish = async (id) => {
    setBusy(true);
    try { await publishKnowledgeSource(id); await reload(); } finally { setBusy(false); }
  };

  const retire = async (id) => {
    setBusy(true);
    try { await retireKnowledgeSource(id); await reload(); } finally { setBusy(false); }
  };

  const suspend = async (id) => {
    setBusy(true);
    try { await suspendKnowledgeSource(id); await reload(); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Permanently delete this draft source? This cannot be undone.")) return;
    setBusy(true);
    try { await deleteKnowledgeSource(id); await reload(); } finally { setBusy(false); }
  };

  const toggleControl = async (controlType, isEnabled) => {
    setBusy(true);
    try { await setControl(controlType, isEnabled); await reload(); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Assistant Knowledge Admin"
        description="Author and publish policy content the HR assistant retrieves answers from, and control its kill switches."
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
          <ShieldOff className="h-5 w-5 text-[var(--zhr-action-primary)]" /> Operational controls
        </h3>
        <div className="flex flex-wrap gap-4">
          {controls.map((c) => (
            <label key={c.control_type} className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                checked={c.is_enabled}
                disabled={busy}
                onChange={(e) => toggleControl(c.control_type, e.target.checked)}
              />
              <span className="text-xs font-semibold text-slate-600">
                {c.control_type === "generation_kill_switch" ? "Disable AI answers" : "Disable actions (bookings)"}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
            <Plus className="h-5 w-5 text-[var(--zhr-action-primary)]" /> New knowledge source
          </h3>
          <form onSubmit={submit} className="space-y-3">
            <input
              required placeholder="Title (e.g. Annual Leave Policy)"
              value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <select value={form.source_type} onChange={(e) => setForm((f) => ({ ...f, source_type: e.target.value }))} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={form.authority_tier} onChange={(e) => setForm((f) => ({ ...f, authority_tier: e.target.value }))} className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {TIERS.map((t) => <option key={t} value={t}>Tier {t}</option>)}
              </select>
            </div>
            <textarea
              required rows={8} placeholder="Full policy content..."
              value={form.content_text} onChange={(e) => setForm((f) => ({ ...f, content_text: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />

            <button
              type="button"
              onClick={() => setShowApplicability((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-[var(--zhr-action-primary)]"
            >
              {showApplicability ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Applicability (optional — restricts who this source answers for)
            </button>
            {showApplicability && (
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3">
                <input placeholder="Jurisdiction code" value={form.jurisdiction_code}
                  onChange={(e) => setForm((f) => ({ ...f, jurisdiction_code: e.target.value }))}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                <input placeholder="Worker type" value={form.worker_type}
                  onChange={(e) => setForm((f) => ({ ...f, worker_type: e.target.value }))}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
                <input placeholder="Audience role" value={form.audience_role}
                  onChange={(e) => setForm((f) => ({ ...f, audience_role: e.target.value }))}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
              </div>
            )}

            {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
            <button disabled={busy} className="rounded-full bg-[var(--zhr-action-primary)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--zhr-action-primary-hover)] disabled:opacity-50">
              Create draft
            </button>
          </form>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-800">
            <BookOpen className="h-5 w-5 text-[var(--zhr-action-primary)]" /> Sources
          </h3>
          <div className="mb-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="Search sources..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-xs"
              />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {sources.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-100 bg-slate-50">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <button className="flex-1 text-left" onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                    <p className="text-sm font-bold text-slate-800">{s.title}</p>
                    <p className="text-[11px] text-slate-500">{s.source_type} · Tier {s.authority_tier} · {s.status}</p>
                  </button>
                  <div className="flex items-center gap-1.5">
                    {s.status !== "published" && s.status !== "retired" && (
                      <button disabled={busy} onClick={() => publish(s.id)} className="rounded-full border border-[var(--zhr-action-primary)] px-3 py-1 text-[11px] font-bold text-[var(--zhr-action-primary)]">
                        Publish
                      </button>
                    )}
                    {s.status === "published" && (
                      <>
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Live</span>
                        <button disabled={busy} onClick={() => suspend(s.id)} title="Suspend (reversible — publish again to reactivate)" className="rounded-full border border-slate-300 p-1.5 text-slate-500 hover:text-amber-600 hover:border-amber-300">
                          <PauseCircle className="h-3.5 w-3.5" />
                        </button>
                        <button disabled={busy} onClick={() => retire(s.id)} title="Retire (permanent)" className="rounded-full border border-slate-300 p-1.5 text-slate-500 hover:text-rose-600 hover:border-rose-300">
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {s.status === "retired" && <span className="text-[11px] font-bold text-slate-400">Retired</span>}
                    <button
                      disabled={busy}
                      onClick={() => { setEditingId(editingId === s.id ? null : s.id); setExpandedId(null); }}
                      title="Edit title / type / tier"
                      className="rounded-full border border-slate-300 p-1.5 text-slate-500 hover:text-[var(--zhr-action-primary)] hover:border-[var(--zhr-action-primary)]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {s.status === "draft" && (
                      <button disabled={busy} onClick={() => remove(s.id)} title="Delete draft (never published)" className="rounded-full border border-slate-300 p-1.5 text-slate-500 hover:text-rose-600 hover:border-rose-300">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {editingId === s.id && (
                  <EditMetadataForm
                    source={s}
                    onCancel={() => setEditingId(null)}
                    onSaved={async () => { setEditingId(null); await reload(); }}
                  />
                )}
                {expandedId === s.id && <VersionHistory sourceId={s.id} onSourceChanged={reload} />}
              </div>
            ))}
            {sources.length === 0 && <p className="text-xs text-slate-400">No knowledge sources match your filters.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
