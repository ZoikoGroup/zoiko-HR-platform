/*
 * Onboarding Checklists: the status of the 10 onboarding documents for every new hire, and nothing else (2026-11-17, at the
 * organisation's request). One request (GET /hr/onboarding/package/status) returns every hire's documents; a hire's row opens
 * their New Hires panel, where the documents are sent, reviewed and downloaded.
 *
 * Wide screens: a grid, one row per new hire and one column per document. Phones and tablets: one card per new hire.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  AlertCircle, CheckCircle2, Circle, ClipboardCheck, Eye, FileSearch, Info, Loader2, PenLine, RefreshCw, RotateCcw, Send, Upload,
  XCircle,
} from "lucide-react";
import { getPackageStatusBoard } from "../../../service/hrService";
import { formatDate } from "../../../utils/dateTime";
import { Card, EmptyState, FilterSelect, KpiCard, KpiGrid, PersonCell, SearchInput, SecondaryButton, StatusPill } from "../recruitment/ui";
import OnboardingLayout from "./OnboardingLayout";

// what each state means for HR, and how it looks (states: onboarding_package.BOARD_STATES on the server)
const STATES = {
  not_sent: { label: "Not sent", tone: "gray", icon: Circle, cell: "bg-gray-50 text-gray-400 ring-gray-200" },
  awaiting_signature: { label: "Awaiting signature", tone: "amber", icon: PenLine, cell: "bg-amber-50 text-amber-600 ring-amber-200" },
  awaiting_acknowledgement: { label: "Awaiting acknowledgement", tone: "amber", icon: Eye, cell: "bg-amber-50 text-amber-600 ring-amber-200" },
  awaiting_upload: { label: "Awaiting the filled form", tone: "amber", icon: Upload, cell: "bg-amber-50 text-amber-600 ring-amber-200" },
  needs_review: { label: "Needs your review", tone: "blue", icon: FileSearch, cell: "bg-blue-50 text-blue-600 ring-blue-200" },
  completed: { label: "Completed", tone: "green", icon: CheckCircle2, cell: "bg-emerald-50 text-emerald-600 ring-emerald-200" },
  available: { label: "Shared (no action needed)", tone: "teal", icon: Info, cell: "bg-teal-50 text-teal-600 ring-teal-200" },
  declined: { label: "Declined or expired", tone: "red", icon: XCircle, cell: "bg-rose-50 text-rose-600 ring-rose-200" },
  rejected: { label: "Returned to the new hire", tone: "red", icon: RotateCcw, cell: "bg-rose-50 text-rose-600 ring-rose-200" },
  // a document the organisation does not send to this hire's engagement profile
  not_included: { label: "Not in this hire's package", tone: "gray", icon: Circle, cell: "bg-white text-gray-300 ring-gray-100" },
};
const WAITING = ["awaiting_signature", "awaiting_acknowledgement", "awaiting_upload"];
const ATTENTION = ["needs_review", "declined", "rejected"];
const DONE = ["completed", "available"];
const STAGE_LABEL = { offer_sent: "Offer sent", offer_accepted: "Offer accepted", pre_joining: "Pre-joining", in_progress: "In progress",
  completed: "Completed" };

const stateOf = (s) => STATES[s] || STATES.not_sent;
const sum = (counts, keys) => keys.reduce((n, k) => n + (counts?.[k] || 0), 0);
const hireLink = (id) => `/zoiko-hr/onboarding/new-hires?open=${id}`;

/** One document's state as a small square (grid) with its name and state for screen readers and the tooltip. */
function StateCell({ title, state }) {
  const s = stateOf(state);
  const Icon = s.icon;
  return (
    <span title={`${title}: ${s.label}`} aria-label={`${title}: ${s.label}`} role="img"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset ${s.cell}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

function Progress({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="whitespace-nowrap text-xs font-medium text-gray-600">{done}/{total}</span>
    </div>
  );
}

export default function OnboardingChecklists() {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("");             // "" = hires still onboarding, "all" = with completed ones
  const [stateFilter, setStateFilter] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getPackageStatusBoard(scope === "all")
      .then((data) => setBoard(data || { documents: [], hires: [], totals: {} }))
      .catch((e) => setError(e?.message || "The document status could not be loaded."))
      .finally(() => setLoading(false));
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const documents = board?.documents || [];
  const hires = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (board?.hires || []).filter((h) => {
      if (q && !`${h.candidate_name || ""} ${h.position || ""}`.toLowerCase().includes(q)) return false;
      if (stateFilter === "waiting") return sum(h.counts, WAITING) > 0;
      if (stateFilter === "attention") return sum(h.counts, ATTENTION) > 0;
      if (stateFilter === "not_sent") return (h.counts?.not_sent || 0) > 0;
      if (stateFilter === "done") return h.done === (h.total ?? documents.length);
      return true;
    });
  }, [board, search, stateFilter, documents.length]);

  const totals = board?.totals || {};
  const all = (board?.hires || []).length * documents.length;
  const doneAll = sum(totals, DONE);

  return (
    <OnboardingLayout title="Onboarding Checklists" subtitle="The status of each new hire's onboarding documents."
      actions={<SecondaryButton icon={RefreshCw} onClick={load} disabled={loading}>Refresh</SecondaryButton>}>
      <div className="space-y-5">
        <KpiGrid cols={4}>
          <KpiCard label="Documents completed" icon={CheckCircle2} tone="green" loading={loading && !board}
            kpi={{ value: all ? Math.round((doneAll / all) * 100) : 0 }} format={(v) => `${v}%`} />
          <KpiCard label="Waiting on new hires" icon={Send} tone="amber" loading={loading && !board} kpi={{ value: sum(totals, WAITING) }} />
          <KpiCard label="Needs your attention" icon={AlertCircle} tone="red" loading={loading && !board} kpi={{ value: sum(totals, ATTENTION) }} />
          <KpiCard label="Not sent yet" icon={Circle} tone="gray" loading={loading && !board} kpi={{ value: totals.not_sent || 0 }} />
        </KpiGrid>

        <Card bodyClass="p-0">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:flex-wrap sm:items-end">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name or position…" label="Search new hires" />
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <FilterSelect label="Documents" value={stateFilter} onChange={setStateFilter} allLabel="All new hires" options={[
                { value: "attention", label: "Needs your attention" }, { value: "waiting", label: "Waiting on the new hire" },
                { value: "not_sent", label: "Some not sent" }, { value: "done", label: "All done" }]} />
              <FilterSelect label="New hires" value={scope} onChange={setScope} allLabel="Still onboarding"
                options={[{ value: "all", label: "Include completed" }]} />
            </div>
          </div>

          {error ? (
            <div role="alert" className="m-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-words">{error}</span>
              <button type="button" onClick={load} className="font-semibold underline">Retry</button>
            </div>
          ) : loading && !board ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading document status…
            </div>
          ) : hires.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title={(board?.hires || []).length ? "No new hire matches" : "No new hires being onboarded"}>
              {(board?.hires || []).length ? "Try another search or filter." : "New hires appear here once they are added under New Hires."}
            </EmptyState>
          ) : (
            <>
              {/* wide screens: one row per new hire, one column per document */}
              <div className="hidden overflow-x-auto xl:block">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60 text-left align-bottom text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <th scope="col" className="sticky left-0 z-10 min-w-[220px] bg-gray-50 px-4 py-3">New hire</th>
                      {documents.map((d, i) => (
                        <th key={d.category} scope="col" className="w-[84px] px-1 py-3 text-center font-medium normal-case tracking-normal" title={`${d.title} · ${d.mode_label}`}>
                          <span className="block text-[10px] text-gray-400">{i + 1}</span>
                          <span className="line-clamp-3 text-[11px] leading-tight text-gray-600">{d.title}</span>
                        </th>
                      ))}
                      <th scope="col" className="px-4 py-3">Done</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hires.map((h) => (
                      <tr key={h.new_hire_id} className="border-b border-gray-100 last:border-0 hover:bg-blue-50/30">
                        <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-normal">
                          <NavLink to={hireLink(h.new_hire_id)} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                            <PersonCell name={h.candidate_name} sub={[h.position, h.joining_date ? `Joins ${formatDate(h.joining_date)}` : null].filter(Boolean).join(" · ")} />
                          </NavLink>
                        </th>
                        {documents.map((d) => (
                          <td key={d.category} className="px-1 py-3 text-center">
                            <StateCell title={d.title} state={h.documents?.[d.category]?.state} />
                          </td>
                        ))}
                        <td className="px-4 py-3"><Progress done={h.done} total={h.total ?? documents.length} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* phones and tablets: one card per new hire with the 10 documents listed */}
              <ul className="divide-y divide-gray-100 xl:hidden">
                {hires.map((h) => (
                  <li key={h.new_hire_id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <NavLink to={hireLink(h.new_hire_id)} className="min-w-0 flex-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                        <PersonCell name={h.candidate_name} sub={[h.position, h.joining_date ? `Joins ${formatDate(h.joining_date)}` : null].filter(Boolean).join(" · ")} />
                      </NavLink>
                      <div className="flex items-center gap-2">
                        {STAGE_LABEL[h.status] && <StatusPill tone="gray">{STAGE_LABEL[h.status]}</StatusPill>}
                        <Progress done={h.done} total={h.total ?? documents.length} />
                      </div>
                    </div>
                    <ol className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      {documents.map((d, i) => {
                        const s = stateOf(h.documents?.[d.category]?.state);
                        return (
                          <li key={d.category} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2">
                            <span className="min-w-0 text-sm text-gray-800"><span className="mr-1.5 text-xs text-gray-400">{i + 1}.</span>{d.title}</span>
                            <StatusPill tone={s.tone} icon={s.icon}>{s.label}</StatusPill>
                          </li>
                        );
                      })}
                    </ol>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* what the squares mean */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600" aria-label="Legend">
          {Object.entries(STATES).map(([key, s]) => {
            const Icon = s.icon;
            return (
              <span key={key} className="inline-flex items-center gap-1.5">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md ring-1 ring-inset ${s.cell}`}><Icon className="h-3 w-3" aria-hidden="true" /></span>
                {s.label}
              </span>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">Select a new hire to send, review or download their documents.</p>
      </div>
    </OnboardingLayout>
  );
}
