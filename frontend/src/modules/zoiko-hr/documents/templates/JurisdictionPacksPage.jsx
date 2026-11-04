// Jurisdiction packs: platform packs (read-only) and the organization's own packs with their lifecycle.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Globe2, Info, Loader2, Pencil, Plus, Send, ShieldCheck } from "lucide-react";
import HRPage from "../../../../components/HRPage";
import { Modal } from "../../../../components/billing-ui";
import { api } from "../../../../service/api";
import { activatePack, listPacks, packAction, submitPack } from "../../../../service/docTemplatesService";
import PackFormModal from "./components/PackFormModal";
import {
  Badge, ErrorBanner, InfoBanner, Labeled, Spinner, StatusBadge, TEMPLATES_PATH, btnDanger, btnPrimary, btnSecondary, btnSmall, cardClass,
  errorMessage, fmtDate, fmtDateTime, inputClass, useCurrentUser, useToast,
} from "./components/ui";

const ACTION_TEXT = {
  suspend: { title: "Suspend pack", body: "Templates in this pack cannot be used to create documents while it is suspended.", done: "Pack suspended." },
  retire: { title: "Retire pack", body: "A retired pack can never be used again. Its templates and clauses stop being available.", done: "Pack retired." },
  reinstate: { title: "Reinstate pack", body: "The pack becomes active again. Only an organization admin can reinstate a pack.", done: "Pack reinstated." },
  "return-to-draft": { title: "Return pack to draft", body: "The pack leaves review and can be edited again.", done: "Pack returned to draft." },
};

function PackDetails({ p, countryName }) {
  const rules = Object.entries(p.retention_rules || {});
  return (
    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div><dt className="text-xs font-semibold text-gray-500">Jurisdiction</dt><dd className="text-gray-800">{countryName(p.country)}{p.region ? ` · ${p.region}` : ""}</dd></div>
      <div><dt className="text-xs font-semibold text-gray-500">Effective</dt><dd className="text-gray-800">{fmtDate(p.effective_from)} – {p.effective_to ? fmtDate(p.effective_to) : "open"}</dd></div>
      <div className="sm:col-span-2">
        <dt className="text-xs font-semibold text-gray-500">Sign-off</dt>
        <dd className="text-gray-800">
          {p.signed_off_by_name
            ? `${p.signed_off_by_name}${p.signed_off_by_role ? `, ${p.signed_off_by_role}` : ""}${p.signed_off_firm ? ` (${p.signed_off_firm})` : ""} on ${fmtDateTime(p.signed_off_at)}`
            : "Not signed off"}
        </dd>
      </div>
      {rules.length > 0 && (
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold text-gray-500">Retention rules</dt>
          <dd className="text-gray-800">{rules.map(([k, y]) => <span key={k} className="mr-2 inline-block font-mono text-xs">{k}: {y} yr</span>)}</dd>
        </div>
      )}
      {p.source_references?.length > 0 && (
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold text-gray-500">Sources</dt>
          <dd>
            <ul className="text-xs">
              {p.source_references.map((s, i) => (
                <li key={i}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{s.title || s.url}</a> : s.title}</li>
              ))}
            </ul>
          </dd>
        </div>
      )}
      {p.notes && <div className="sm:col-span-4"><dt className="text-xs font-semibold text-gray-500">Notes</dt><dd className="whitespace-pre-wrap text-gray-700">{p.notes}</dd></div>}
    </dl>
  );
}

export default function JurisdictionPacksPage() {
  const me = useCurrentUser();
  const [toastNode, showToast] = useToast();
  const [packs, setPacks] = useState([]);
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [formFor, setFormFor] = useState(null); // { pack | null }
  const [activateFor, setActivateFor] = useState(null);
  const [attest, setAttest] = useState({ accepted: false, name: "", role: "", firm: "" });
  const [confirm, setConfirm] = useState(null); // { pack, action }

  const load = useCallback(() => {
    setLoading(true); setError("");
    return listPacks({ per_page: 200 })
      .then((r) => setPacks(r?.items || []))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    api.get("/hr/reference/regions").then((r) => setCountries(r?.countries || [])).catch(() => {});
  }, [load]);

  const countryMap = useMemo(() => Object.fromEntries(countries.map((c) => [c.code, c.name])), [countries]);
  const countryName = (code) => (countryMap[code] ? `${countryMap[code]} (${code})` : code);
  const platformPacks = packs.filter((p) => p.owner !== "organization");
  const orgPacks = packs.filter((p) => p.owner === "organization");

  const run = async (p, fn, done) => {
    setBusyId(p.id);
    try {
      await fn();
      showToast("success", done);
      await load();
      return true;
    } catch (e) {
      showToast("error", errorMessage(e));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const activateWhy = (p) => {
    if (!me.isOrgAdmin) return "Only an organization admin can activate a pack.";
    if (p.created_by === me.id) return "You created this pack, so another organization admin must activate it.";
    return "";
  };

  const orgActions = (p) => {
    const busy = busyId === p.id;
    const out = [];
    let note = "";
    if (p.status === "DRAFT") {
      out.push(<button key="e" type="button" className={btnSmall} disabled={busy} onClick={() => setFormFor({ pack: p })}><Pencil className="h-3.5 w-3.5" /> Edit</button>);
      out.push(<button key="s" type="button" className={btnSmall} disabled={busy} onClick={() => run(p, () => submitPack(p.id), "Pack submitted for review.")}><Send className="h-3.5 w-3.5" /> Submit for review</button>);
    }
    if (p.status === "LEGAL_REVIEW") {
      note = activateWhy(p);
      out.push(
        <button key="a" type="button" className={btnSmall} disabled={busy || !!note}
          onClick={() => { setAttest({ accepted: false, name: me.fullName, role: "", firm: "" }); setActivateFor(p); }}>
          <ShieldCheck className="h-3.5 w-3.5" /> Activate
        </button>,
      );
      out.push(<button key="d" type="button" className={btnSmall} disabled={busy} onClick={() => setConfirm({ pack: p, action: "return-to-draft" })}>Return to draft</button>);
    }
    if (p.status === "ACTIVE") out.push(<button key="su" type="button" className={btnSmall} disabled={busy} onClick={() => setConfirm({ pack: p, action: "suspend" })}>Suspend</button>);
    if (p.status === "SUSPENDED") {
      out.push(<button key="ri" type="button" className={btnSmall} disabled={busy || !me.isOrgAdmin} onClick={() => setConfirm({ pack: p, action: "reinstate" })}>Reinstate</button>);
      if (!me.isOrgAdmin) note = "Only an organization admin can reinstate a pack.";
    }
    if (p.status !== "RETIRED") out.push(<button key="re" type="button" className={btnSmall} disabled={busy} onClick={() => setConfirm({ pack: p, action: "retire" })}>Retire</button>);
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-500" aria-label="Working" />}
        {out}
        {note && <p className="w-full text-xs text-amber-700">{note}</p>}
      </div>
    );
  };

  return (
    <HRPage title="Jurisdiction packs" subtitle="The legal basis for using templates in each country your organization employs people in."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link to={TEMPLATES_PATH} className={btnSecondary}><ArrowLeft className="h-4 w-4" /> Templates</Link>
          <button type="button" className={btnPrimary} onClick={() => setFormFor({ pack: null })}><Plus className="h-4 w-4" /> New pack</button>
        </div>
      }>
      <InfoBanner icon={Info}>
        <p>An organization pack goes from <strong>draft</strong> to <strong>review</strong> to <strong>active</strong>. Activating a pack is an attestation:
          only an organization admin can do it, and the person who created the pack cannot activate it.</p>
      </InfoBanner>
      <ErrorBanner error={error} onDismiss={() => setError("")} />

      {loading ? <Spinner label="Loading packs…" /> : (
        <div className="space-y-6">
          <section className={cardClass} aria-labelledby="org-packs-h">
            <h2 id="org-packs-h" className="mb-3 text-base font-semibold text-gray-900">Your organization's packs</h2>
            {orgPacks.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No packs yet. Create one for each country you employ people in.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {orgPacks.map((p) => (
                  <li key={p.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Globe2 className="h-4 w-4 text-gray-400" aria-hidden="true" />
                        <span className="font-semibold text-gray-900">{countryName(p.country)}{p.region ? ` · ${p.region}` : ""}</span>
                        <span className="text-xs text-gray-500">#{p.id}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      {orgActions(p)}
                    </div>
                    <PackDetails p={p} countryName={countryName} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={cardClass} aria-labelledby="plat-packs-h">
            <h2 id="plat-packs-h" className="mb-1 text-base font-semibold text-gray-900">Platform packs</h2>
            <p className="mb-3 text-xs text-gray-500">Maintained by Zoiko legal counsel. Read-only.</p>
            {platformPacks.length === 0 ? <p className="text-sm text-gray-500">No platform packs.</p> : (
              <ul className="divide-y divide-gray-100">
                {platformPacks.map((p) => (
                  <li key={p.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Globe2 className="h-4 w-4 text-gray-400" aria-hidden="true" />
                      <span className="font-semibold text-gray-900">{countryName(p.country)}{p.region ? ` · ${p.region}` : ""}</span>
                      <StatusBadge status={p.status} />
                      <Badge tone="blue">Platform</Badge>
                      {p.status === "SUSPENDED" && <Badge tone="amber">Research seed only — not activated</Badge>}
                    </div>
                    {p.status === "SUSPENDED" && (
                      <p className="mt-1 text-xs text-amber-800">
                        This pack is a research seed and has not been activated by platform counsel. It cannot be used to create documents.
                      </p>
                    )}
                    <PackDetails p={p} countryName={countryName} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <PackFormModal open={!!formFor} pack={formFor?.pack} countries={countries} onClose={() => setFormFor(null)}
        onSaved={() => { const editing = !!formFor?.pack; setFormFor(null); showToast("success", editing ? "Pack saved." : "Pack created as a draft."); load(); }} />

      <Modal open={!!activateFor} onClose={() => setActivateFor(null)} size="md" icon={ShieldCheck}
        title={`Activate ${activateFor ? countryName(activateFor.country) : ""} pack`}
        description="Only an organization admin who did not create this pack can activate it."
        footer={<>
          <button type="button" className={btnSecondary} onClick={() => setActivateFor(null)}>Cancel</button>
          <button type="button" className={btnPrimary} disabled={!attest.accepted || busyId === activateFor?.id}
            onClick={async () => {
              const body = { accepted: true };
              ["name", "role", "firm"].forEach((k) => { if (attest[k].trim()) body[k] = attest[k].trim(); });
              if (await run(activateFor, () => activatePack(activateFor.id, body), "Pack activated.")) setActivateFor(null);
            }}>
            {busyId === activateFor?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Activate
          </button>
        </>}>
        {activateFor && (
          <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={attest.accepted} onChange={(e) => setAttest((a) => ({ ...a, accepted: e.target.checked }))} />
              <span>We have reviewed this jurisdiction pack for use in {countryName(activateFor.country)}{activateFor.region ? ` (${activateFor.region})` : ""} and accept responsibility for its content.</span>
            </label>
            <Labeled id="act-name" label="Signed off by (name)">
              <input id="act-name" className={inputClass} value={attest.name} onChange={(e) => setAttest((a) => ({ ...a, name: e.target.value }))} />
            </Labeled>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled id="act-role" label="Role" hint="Defaults to “Organization admin”.">
                <input id="act-role" className={inputClass} value={attest.role} onChange={(e) => setAttest((a) => ({ ...a, role: e.target.value }))} />
              </Labeled>
              <Labeled id="act-firm" label="Law firm (if any)">
                <input id="act-firm" className={inputClass} value={attest.firm} onChange={(e) => setAttest((a) => ({ ...a, firm: e.target.value }))} />
              </Labeled>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} size="sm" title={confirm ? ACTION_TEXT[confirm.action].title : ""}
        description={confirm ? ACTION_TEXT[confirm.action].body : ""}
        footer={<>
          <button type="button" className={btnSecondary} onClick={() => setConfirm(null)}>Cancel</button>
          <button type="button" className={confirm?.action === "retire" || confirm?.action === "suspend" ? btnDanger : btnPrimary}
            onClick={() => { const { pack, action } = confirm; setConfirm(null); run(pack, () => packAction(pack.id, action), ACTION_TEXT[action].done); }}>
            Confirm
          </button>
        </>}>
        {confirm && <p className="text-sm text-gray-700">{countryName(confirm.pack.country)}{confirm.pack.region ? ` · ${confirm.pack.region}` : ""} (pack #{confirm.pack.id})</p>}
      </Modal>

      {toastNode}
    </HRPage>
  );
}
