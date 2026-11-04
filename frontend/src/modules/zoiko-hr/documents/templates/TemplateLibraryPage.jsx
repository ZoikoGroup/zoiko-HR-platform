// Catalogue of the 566 canonical document templates, with filters and organization settings.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, Info, Library, Scale, Settings } from "lucide-react";
import HRPage from "../../../../components/HRPage";
import { SearchInput } from "../../../../components/billing-ui";
import { listTemplateFamilies, listTemplates } from "../../../../service/docTemplatesService";
import TemplateSettingsCard from "./TemplateSettingsCard";
import {
  Badge, CLAUSES_PATH, ErrorBanner, InfoBanner, PACKS_PATH, ReleaseModeBadge, RiskBadge, SensitivityBadge, Spinner,
  btnSecondary, cardClass, errorMessage, inputClass, templatePath,
} from "./components/ui";

const PAGE_SIZE = 25;

const UNAVAILABLE_TEXT = {
  NOT_IMPLEMENTED: "Not available yet",
  NO_ACTIVE_PACK: "No active jurisdiction pack",
  NO_ACTIVE_VARIANT: "No approved version for your organization",
};

function AvailabilityCell({ item }) {
  if (item.engine_record) return <Badge tone="slate">Produced automatically</Badge>;
  if (item.available) return <Badge tone="green">Available</Badge>;
  return <Badge tone="gray" title={item.unavailable_reason || ""}>Blocked: {UNAVAILABLE_TEXT[item.unavailable_reason] || item.unavailable_reason || "Unavailable"}</Badge>;
}

export default function TemplateLibraryPage() {
  const [items, setItems] = useState([]);
  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [family, setFamily] = useState("");
  const [search, setSearch] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [implementedOnly, setImplementedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    listTemplateFamilies().then((r) => setFamilies(r?.items || [])).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true); setError("");
    listTemplates({ per_page: 600, family: family || undefined, search: search.trim() || undefined,
      implemented: implementedOnly ? true : undefined, available: availableOnly ? true : undefined })
      .then((r) => setItems(r?.items || []))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [family, search, implementedOnly, availableOnly]);

  useEffect(() => { load(); setPage(1); }, [load]);

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const visible = useMemo(() => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [items, page]);
  const attestationBlocked = settings && (!settings.platform_allows_tenant_attestation || !settings.plan_includes_tenant_attestation);

  return (
    <HRPage title="Document templates" subtitle="The canonical template catalogue and your organization's approved versions."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link to={PACKS_PATH} className={btnSecondary}><Scale className="h-4 w-4" /> Jurisdiction packs</Link>
          <Link to={CLAUSES_PATH} className={btnSecondary}><BookOpen className="h-4 w-4" /> Clause library</Link>
        </div>
      }>
      <InfoBanner icon={Info}>
        All templates are blocked until an approved jurisdiction version is active for your organization.
      </InfoBanner>
      {attestationBlocked && (
        <InfoBanner tone="amber">
          {!settings.platform_allows_tenant_attestation
            ? "Organization-approved templates are currently switched off by the platform. Only platform counsel versions can be used."
            : "Your plan does not include organization-approved templates. Only platform counsel versions can be used."}
        </InfoBanner>
      )}

      <section className={`${cardClass} mb-6`}>
        <button type="button" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings} aria-controls="tpl-settings-panel"
          className="flex w-full items-center justify-between rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Settings className="h-4 w-4 text-gray-500" /> Template settings</span>
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showSettings ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {/* Kept mounted (hidden) so the banners above know the platform/plan flags without opening the panel. */}
        <div id="tpl-settings-panel" hidden={!showSettings} className="mt-4 border-t border-gray-100 pt-4">
          <TemplateSettingsCard onChange={setSettings} />
        </div>
      </section>

      <section className={cardClass} aria-label="Template catalogue">
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_16rem_auto_auto] md:items-end">
          <div>
            <label htmlFor="tpl-search" className="mb-1 block text-xs font-semibold text-gray-600">Search</label>
            <SearchInput id="tpl-search" value={search} onChange={setSearch} placeholder="Title or id, e.g. HR-EMP-001" />
          </div>
          <div>
            <label htmlFor="tpl-family" className="mb-1 block text-xs font-semibold text-gray-600">Family</label>
            <select id="tpl-family" className={inputClass} value={family} onChange={(e) => setFamily(e.target.value)}>
              <option value="">All families</option>
              {families.map((f) => (
                <option key={f.family_id} value={f.family_id}>{f.family_id} — {f.name} ({f.implemented}/{f.total})</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 py-2 text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
            Available only
          </label>
          <label className="flex items-center gap-2 py-2 text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={implementedOnly} onChange={(e) => setImplementedOnly(e.target.checked)} />
            Implemented only
          </label>
        </div>

        <ErrorBanner error={error} />

        {loading ? <Spinner label="Loading templates…" /> : items.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <Library className="mb-2 h-10 w-10 text-gray-300" aria-hidden="true" />
            <p className="text-sm font-semibold text-gray-700">No templates match your filters.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Templates</caption>
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                    <th scope="col" className="px-3 py-2">Template</th>
                    <th scope="col" className="px-3 py-2">Kind</th>
                    <th scope="col" className="px-3 py-2">Risk / sensitivity</th>
                    <th scope="col" className="px-3 py-2">Availability</th>
                    <th scope="col" className="px-3 py-2">Active version</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => (
                    <tr key={t.canonical_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-3">
                        <Link to={templatePath(t.canonical_id)} className="font-semibold text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                          {t.title}
                        </Link>
                        <div className="mt-0.5 font-mono text-xs text-gray-500">{t.canonical_id} · {t.family_name || t.family_id}</div>
                      </td>
                      <td className="px-3 py-3 text-gray-700">{t.kind || "—"}{!t.implemented && <div className="text-xs text-gray-500">Not implemented</div>}</td>
                      <td className="px-3 py-3"><div className="flex flex-wrap gap-1"><RiskBadge value={t.legal_risk} /><SensitivityBadge value={t.sensitivity} /></div></td>
                      <td className="px-3 py-3"><AvailabilityCell item={t} /></td>
                      <td className="px-3 py-3">
                        {t.active_variant ? (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-xs text-gray-600">v{t.active_variant.version}</span>
                            <ReleaseModeBadge mode={t.active_variant.release_mode} />
                          </div>
                        ) : <span className="text-xs text-gray-500">None</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="mt-4 flex items-center justify-between text-sm text-gray-600" aria-label="Pagination">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, items.length)} of {items.length}
              </span>
              <div className="flex items-center gap-2">
                <button type="button" className={btnSecondary} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span aria-live="polite">Page {page} of {pageCount}</span>
                <button type="button" className={btnSecondary} disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </nav>
          </>
        )}
      </section>
    </HRPage>
  );
}
