// One canonical template: its definition, platform and organization versions, version lifecycle and differences.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileDiff, GitBranch, Info, Loader2, Pencil, Plus, Rocket, Send, ShieldCheck } from "lucide-react";
import HRPage from "../../../../components/HRPage";
import { Modal } from "../../../../components/billing-ui";
import {
  approveVariantLegal, createVariant, diffVariants, getTemplate, listPacks, releaseVariant, retireVariant, submitVariant, suspendVariant,
} from "../../../../service/docTemplatesService";
import ApproveVariantModal from "./components/ApproveVariantModal";
import VariantDiff from "./components/VariantDiff";
import {
  Badge, ErrorBanner, GOVERNANCE_PATH, InfoBanner, Labeled, PACKS_PATH, ReasonModal, ReleaseModeBadge, RiskBadge, SensitivityBadge,
  Spinner, StatusBadge, TEMPLATES_PATH, btnPrimary, btnSecondary, btnSmall, cardClass, editorPath, errorMessage, fmtDate, fmtDateTime,
  inputClass, useCurrentUser, useToast,
} from "./components/ui";

const REASON = {
  NOT_IMPLEMENTED: "This template is not available yet.",
  NO_ACTIVE_PACK: "No active jurisdiction pack covers your organization yet.",
  NO_ACTIVE_VARIANT: "There is no approved version of this template for your organization yet.",
};

function packLabel(p) {
  if (!p) return "—";
  return `${p.country}${p.region ? ` · ${p.region}` : ""} (${p.owner === "organization" ? "organization" : "platform"} pack #${p.id})`;
}

function DefinitionItem({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-800">{children || "—"}</dd>
    </div>
  );
}

// "Set up for my organization": choose an organization pack (and optionally a version to start from), then create a draft.
function SetupModal({ open, onClose, template, packs, onCreated }) {
  const orgPacks = useMemo(() => packs.filter((p) => p.owner === "organization" && p.status !== "RETIRED"), [packs]);
  const [packId, setPackId] = useState("");
  const [fromId, setFromId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) { setPackId(orgPacks[0] ? String(orgPacks[0].id) : ""); setFromId(""); setError(""); }
  }, [open, orgPacks]);

  const create = async () => {
    setBusy(true); setError("");
    try {
      const body = { pack_id: Number(packId), language: "en" };
      if (fromId) body.from_variant_id = Number(fromId);
      const v = await createVariant(template.canonical_id, body);
      onCreated(v);
    } catch (e) {
      setError(e?.code === "NO_STARTER_CONTENT" ? "Starter content for this template arrives in a later release." : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Set up for my organization" icon={Plus} size="md"
      description="Creates a draft organization version of this template in one of your jurisdiction packs."
      footer={orgPacks.length ? <>
        <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} onClick={create} disabled={!packId || busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create draft
        </button>
      </> : null}>
      <ErrorBanner error={error} />
      {orgPacks.length === 0 ? (
        <div className="text-sm text-gray-700">
          <p>Your organization has no jurisdiction pack yet. Organization templates live in your own pack for each country.</p>
          <Link to={PACKS_PATH} className="mt-3 inline-flex font-semibold text-blue-700 hover:underline">Create a jurisdiction pack →</Link>
        </div>
      ) : (
        <div className="space-y-4">
          <Labeled id="setup-pack" label="Jurisdiction pack" required hint="Only your organization's packs are listed; the pack must be active before a version can be released.">
            <select id="setup-pack" className={inputClass} value={packId} onChange={(e) => setPackId(e.target.value)}>
              {orgPacks.map((p) => <option key={p.id} value={p.id}>{packLabel(p)} — {p.status}</option>)}
            </select>
          </Labeled>
          {template.variants?.length > 0 && (
            <Labeled id="setup-from" label="Start from an existing version (optional)">
              <select id="setup-from" className={inputClass} value={fromId} onChange={(e) => setFromId(e.target.value)}>
                <option value="">Starter content</option>
                {template.variants.map((v) => (
                  <option key={v.id} value={v.id}>Version {v.version} · {v.owner} · {v.status}</option>
                ))}
              </select>
            </Labeled>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function TemplateDetailPage() {
  const { canonicalId } = useParams();
  const navigate = useNavigate();
  const me = useCurrentUser();
  const [toastNode, showToast] = useToast();
  const [template, setTemplate] = useState(null);
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [approveFor, setApproveFor] = useState(null);
  const [withdraw, setWithdraw] = useState(null); // { variant, action: "suspend" | "retire" }
  const [selected, setSelected] = useState([]);
  const [diff, setDiff] = useState(null);
  const [diffBusy, setDiffBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError("");
    return Promise.all([getTemplate(canonicalId), listPacks({ per_page: 200 }).catch(() => ({ items: [] }))])
      .then(([t, p]) => { setTemplate(t); setPacks(p?.items || []); })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [canonicalId]);

  useEffect(() => { load(); }, [load]);

  const packById = useMemo(() => Object.fromEntries(packs.map((p) => [p.id, p])), [packs]);

  const run = async (variant, fn, success) => {
    setBusyId(variant.id);
    try {
      await fn();
      showToast("success", success);
      await load();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const toggleSelect = (id) => {
    setDiff(null);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]));
  };

  const compare = async () => {
    if (selected.length !== 2) return;
    const [a, b] = [...selected].map((id) => template.variants.find((v) => v.id === id)).sort((x, y) => x.version - y.version);
    setDiffBusy(true);
    try {
      setDiff(await diffVariants(a.id, b.id));
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setDiffBusy(false);
    }
  };

  if (loading && !template) return <HRPage title="Template"><Spinner /></HRPage>;
  if (!template) {
    return (
      <HRPage title="Template">
        <ErrorBanner error={error || "Template not found."} />
        <Link to={TEMPLATES_PATH} className={btnSecondary}><ArrowLeft className="h-4 w-4" /> Back to templates</Link>
      </HRPage>
    );
  }

  const t = template;
  const variants = t.variants || [];
  const canSetUp = t.implemented && !t.engine_record;

  // Pre-checks mirroring the server's separation-of-duties rules (the server's answer is always final).
  const approveBlock = (v) => {
    if (v.authored_by && v.authored_by === me.id) return "You authored this version, so someone else must approve it.";
    if (!me.isOrgAdmin) return "Only an organization admin or an authorised signatory can approve. If you are a signatory, you may still try.";
    return "";
  };
  const releaseBlock = (v) => {
    if (!me.isOrgAdmin) return "Only an organization admin can release a version.";
    if (v.authored_by === me.id) return "You authored this version, so someone else must release it.";
    if (v.reviewed_by === me.id) return "You approved this version, so someone else must release it.";
    return "";
  };

  const renderActions = (v) => {
    if (v.owner !== "organization") return <span className="text-xs text-gray-500">Read-only (platform counsel)</span>;
    const busy = busyId === v.id;
    const out = [];
    if (v.status === "IN_DRAFT") {
      out.push(<Link key="edit" to={editorPath(v.id)} className={btnSmall}><Pencil className="h-3.5 w-3.5" /> Edit</Link>);
      out.push(
        <button key="submit" type="button" className={btnSmall} disabled={busy || !v.change_reason}
          title={!v.change_reason ? "Add a change reason in the editor before submitting." : undefined}
          onClick={() => run(v, () => submitVariant(v.id), "Submitted for legal review.")}>
          <Send className="h-3.5 w-3.5" /> Submit for review
        </button>,
      );
      if (!v.change_reason) out.push(<p key="cr" className="w-full text-xs text-amber-700">Add a change reason in the editor before submitting.</p>);
    } else {
      out.push(<Link key="view" to={editorPath(v.id)} className={btnSmall}>View content</Link>);
    }
    if (v.status === "LEGAL_REVIEW") {
      const why = approveBlock(v);
      const hard = v.authored_by === me.id;
      out.push(
        <button key="approve" type="button" className={btnSmall} disabled={busy || hard} onClick={() => setApproveFor(v)}>
          <ShieldCheck className="h-3.5 w-3.5" /> Approve
        </button>,
      );
      if (why) out.push(<p key="aw" className="w-full text-xs text-amber-700">{why}</p>);
    }
    if (v.status === "LEGAL_APPROVED" || v.status === "RELEASE_TESTED") {
      const why = releaseBlock(v);
      out.push(
        <button key="release" type="button" className={btnSmall} disabled={busy || !!why}
          onClick={() => run(v, () => releaseVariant(v.id), "Version released and now active.")}>
          <Rocket className="h-3.5 w-3.5" /> Release
        </button>,
      );
      if (why) out.push(<p key="rw" className="w-full text-xs text-amber-700">{why}</p>);
    }
    if (v.status === "ACTIVE") {
      out.push(<button key="suspend" type="button" className={btnSmall} disabled={busy} onClick={() => setWithdraw({ variant: v, action: "suspend" })}>Suspend</button>);
    }
    if (["ACTIVE", "SUSPENDED", "IN_DRAFT", "LEGAL_REVIEW", "LEGAL_APPROVED"].includes(v.status)) {
      out.push(<button key="retire" type="button" className={btnSmall} disabled={busy} onClick={() => setWithdraw({ variant: v, action: "retire" })}>Retire</button>);
    }
    if (["ACTIVE", "SUSPENDED", "RETIRED"].includes(v.status) && canSetUp) {
      out.push(
        <button key="newver" type="button" className={btnSmall} disabled={busy}
          onClick={() => run(v, async () => {
            const nv = await createVariant(t.canonical_id, { pack_id: v.pack_id, language: v.language || "en", from_variant_id: v.id });
            navigate(editorPath(nv.id));
          }, "New draft version created.")}>
          <GitBranch className="h-3.5 w-3.5" /> New version
        </button>,
      );
    }
    return <div className="flex flex-wrap items-center gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin text-gray-500" aria-label="Working" />}{out}</div>;
  };

  return (
    <HRPage title={t.title} subtitle={`${t.canonical_id} · ${t.family_name || t.family_id}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link to={TEMPLATES_PATH} className={btnSecondary}><ArrowLeft className="h-4 w-4" /> All templates</Link>
          {canSetUp && (
            <button type="button" className={btnPrimary} onClick={() => setSetupOpen(true)}>
              <Plus className="h-4 w-4" /> Set up for my organization
            </button>
          )}
        </div>
      }>
      <ErrorBanner error={error} onDismiss={() => setError("")} />

      {t.engine_record && (
        <InfoBanner icon={Info}>
          This is a governance record produced automatically by the document engine (for example approval registers and signature evidence).
          It has no editable content. View it on the <Link to={GOVERNANCE_PATH} className="font-semibold underline">Governance reports</Link> page.
        </InfoBanner>
      )}
      {!t.implemented && !t.engine_record && <InfoBanner tone="gray" icon={Info}>This template is not available yet.</InfoBanner>}
      {t.implemented && !t.engine_record && !t.has_starter_content && (
        <InfoBanner tone="gray" icon={Info}>Starter content for this template arrives in a later release.</InfoBanner>
      )}

      <section className={`${cardClass} mb-6`} aria-labelledby="def-h">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 id="def-h" className="mr-2 text-base font-semibold text-gray-900">Definition</h2>
          <RiskBadge value={t.legal_risk} />
          <SensitivityBadge value={t.sensitivity} />
          {t.available ? <Badge tone="green">Available</Badge> : (
            <Badge tone="gray">Blocked: {REASON[t.unavailable_reason] || t.unavailable_reason || "Unavailable"}</Badge>
          )}
          {t.active_variant && <ReleaseModeBadge mode={t.active_variant.release_mode} />}
        </div>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DefinitionItem label="Kind">{t.kind}</DefinitionItem>
          <DefinitionItem label="Audience">{t.audience}</DefinitionItem>
          <DefinitionItem label="Output">{t.output_mode}</DefinitionItem>
          <DefinitionItem label="Execution">{t.execution_mode}</DefinitionItem>
          <DefinitionItem label="Approval policy">{t.approval_policy}</DefinitionItem>
          <DefinitionItem label="Lifecycle trigger">{t.lifecycle_trigger}</DefinitionItem>
          <DefinitionItem label="Who can request">{(t.request_roles || []).join(", ")}</DefinitionItem>
          <DefinitionItem label="Active version">{t.active_variant ? `Version ${t.active_variant.version}` : "None"}</DefinitionItem>
        </dl>
        {t.required_fields?.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Required information</p>
            <div className="mt-1 flex flex-wrap gap-1">{t.required_fields.map((f) => <code key={f} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{f}</code>)}</div>
          </div>
        )}
      </section>

      {!t.engine_record && (
        <section className={cardClass} aria-labelledby="ver-h">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="ver-h" className="text-base font-semibold text-gray-900">Versions</h2>
              <p className="text-xs text-gray-500">Select two versions to compare them. Author, legal reviewer and releaser must be different people.</p>
            </div>
            <button type="button" className={btnSecondary} disabled={selected.length !== 2 || diffBusy} onClick={compare}>
              {diffBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDiff className="h-4 w-4" />} Compare selected ({selected.length}/2)
            </button>
          </div>
          {variants.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No versions yet.{canSetUp && " Use “Set up for my organization” to create one."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Template versions</caption>
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                    <th scope="col" className="px-2 py-2"><span className="sr-only">Compare</span></th>
                    <th scope="col" className="px-2 py-2">Version</th>
                    <th scope="col" className="px-2 py-2">Owner / pack</th>
                    <th scope="col" className="px-2 py-2">Status</th>
                    <th scope="col" className="px-2 py-2">Effective</th>
                    <th scope="col" className="px-2 py-2">Change reason</th>
                    <th scope="col" className="px-2 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.id} className="border-b border-gray-100 align-top last:border-0">
                      <td className="px-2 py-3">
                        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={selected.includes(v.id)}
                          onChange={() => toggleSelect(v.id)} aria-label={`Select version ${v.version} (${v.owner}) for comparison`} />
                      </td>
                      <td className="px-2 py-3 font-semibold text-gray-900">v{v.version}<div className="text-xs font-normal text-gray-500">{v.language}</div></td>
                      <td className="px-2 py-3">
                        <div className="text-gray-800">{v.owner === "organization" ? "Your organization" : "Platform"}</div>
                        <div className="text-xs text-gray-500">{packLabel(packById[v.pack_id]) === "—" ? `Pack #${v.pack_id}` : packLabel(packById[v.pack_id])}</div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap gap-1"><StatusBadge status={v.status} /><ReleaseModeBadge mode={v.release_mode} /></div>
                        <div className="mt-1 text-xs text-gray-500">since {fmtDateTime(v.status_changed_at || v.created_at)}</div>
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-600">{fmtDate(v.effective_from)} – {v.effective_to ? fmtDate(v.effective_to) : "open"}</td>
                      <td className="max-w-[16rem] px-2 py-3 text-xs text-gray-600">{v.change_reason || "—"}</td>
                      <td className="px-2 py-3">{renderActions(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {diff && <div className="mt-6 border-t border-gray-100 pt-4"><VariantDiff diff={diff} /></div>}
        </section>
      )}

      <SetupModal open={setupOpen} onClose={() => setSetupOpen(false)} template={t} packs={packs}
        onCreated={(v) => { setSetupOpen(false); navigate(editorPath(v.id)); }} />

      <ApproveVariantModal open={!!approveFor} onClose={() => setApproveFor(null)} variant={approveFor}
        country={approveFor ? packById[approveFor.pack_id]?.country : ""} legalRisk={t.legal_risk} expectedName={me.fullName}
        onApprove={async (body) => {
          await approveVariantLegal(approveFor.id, body);
          setApproveFor(null);
          showToast("success", "Version legally approved.");
          load();
        }} />

      <ReasonModal open={!!withdraw} busy={withdraw && busyId === withdraw.variant.id}
        title={withdraw?.action === "suspend" ? `Suspend version ${withdraw?.variant.version}` : `Retire version ${withdraw?.variant.version}`}
        description={withdraw?.action === "suspend"
          ? "A suspended version cannot be used to create documents until a new version is released."
          : "A retired version can never be used again. Documents already created are not affected."}
        confirmLabel={withdraw?.action === "suspend" ? "Suspend" : "Retire"}
        onClose={() => setWithdraw(null)}
        onConfirm={(reason) => {
          const { variant, action } = withdraw;
          setWithdraw(null);
          run(variant, () => (action === "suspend" ? suspendVariant(variant.id, reason) : retireVariant(variant.id, reason)),
            action === "suspend" ? "Version suspended." : "Version retired.");
        }} />

      {toastNode}
    </HRPage>
  );
}
