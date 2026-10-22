import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { NavLink } from "react-router-dom";
import {
  Plus, X, Edit2, Trash2, AlertCircle, CheckCircle2, Building2, ChevronDown, Loader2, Eye, FileText, ShieldCheck,
  Undo2, Send, Mail, Clock, XCircle, MoreVertical, RefreshCw, Briefcase, MapPin, Phone, Circle, ExternalLink, Inbox,
  GraduationCap, StickyNote, Activity as ActivityIcon, LayoutTemplate,
} from "lucide-react";
import RemunerationFields, { CountrySelect, currencyForCountry, guessCountry, useRegions } from "../../../components/RemunerationFields";
import BusinessLookupFields, { checkBusinessId, checkPostal, useBusinessFormats } from "../../../components/BusinessLookupFields";
import {
  getOffers, createOffer, updateOffer, deleteOffer, getCandidates,
} from "../../../service/hrService";
// optional extras (requisition names for the position card) are read through the namespace so a page or test that
// provides only the core calls still works
import * as hrApi from "../../../service/hrService";
import {
  getOfferDocument, getOfferLetterPreflight, approveOfferDocument, generateOfferLetter, issueOfferLetter,
  amendOffer, requestOfferWithdrawal, clearOfferCondition,
} from "../../../service/recruitmentDocumentsService";
import * as recDocs from "../../../service/recruitmentDocumentsService";
import { previewGeneratedDocument, downloadGeneratedDocument } from "../../../service/docTemplatesService";
import * as docApi from "../../../service/docTemplatesService";
import SandboxedHtmlPreview from "../../../components/documents/SandboxedHtmlPreview";
import OfferLetterSetupPanel from "./OfferLetterSetupPanel";
import { formatDate as formatDateUtil } from "../../../utils/dateTime";
import { EMPLOYMENT_TYPES, DEFAULT_PERIOD, PAY_PERIODS, remunerationFor, remunerationLabel } from "../../../utils/money";
import {
  RecruitmentLayout, PrimaryButton, SecondaryButton, QuickAction, KpiCard, KpiGrid, Card, StatusPill, Avatar,
  SearchInput, FilterSelect, UnderlineTabs, Table, td, EmptyState, Pagination, DetailPanel, WithDetail, DetailSection,
  relativeTime, shortDate, money, useInsights,
} from "./ui";

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try { return formatDateUtil(dateStr); } catch { return dateStr; }
}

// ── statuses ───────────────────────────────────────────────────────────────────────────────────────────────────────
const STATUS_LABEL = { draft: "Draft", pending: "Sent", approved: "Ready to Send", rejected: "Declined", accepted: "Accepted", countered: "Countered", withdrawn: "Withdrawn", expired: "Expired" };
const CLOSED = ["accepted", "rejected", "withdrawn", "expired"];
const WITHDRAW_BLOCKED = ["rejected", "withdrawn", "expired"];

/**
 * The pill an offer shows. A sent offer (status "pending") is "Awaiting Response" when it carries a response deadline the
 * candidate is answering against, otherwise "Sent".
 */
function offerStatus(o) {
  const s = o?.status;
  // an issued offer the candidate has not answered yet (the "Sent" card counts every issued offer, this one included)
  if (s === "pending") return o.issued_at ? { key: "awaiting", label: "Awaiting Response", tone: "amber", icon: Clock } : { key: "sent", label: "Sent", tone: "violet", icon: Mail };
  if (s === "approved") return { key: "ready", label: "Ready to Send", tone: "blue", icon: Send };
  if (s === "draft") return { key: "draft", label: "Draft", tone: "gray", icon: FileText };
  if (s === "accepted") return { key: "accepted", label: "Accepted", tone: "green", icon: CheckCircle2 };
  if (s === "rejected") return { key: "declined", label: "Declined", tone: "red", icon: XCircle };
  if (s === "countered") return { key: "countered", label: "Countered", tone: "amber", icon: RefreshCw };
  return { key: s, label: STATUS_LABEL[s] || s || "—", tone: "gray", icon: null };
}

// The offer letter templates (backend OFFER_LETTERS) and the server's selection rule, mirrored to show which template an
// offer uses before its letter exists. Once a letter is generated its own canonical_id is shown instead.
const OFFER_LETTER_IDS = ["HR-HIR-011", "HR-HIR-012", "HR-HIR-014", "HR-HIR-015", "HR-HIR-016", "HR-HIR-017"];
function templateFor(o) {
  if (o.amends_offer_id) return "HR-HIR-017";
  const kind = o.employment_type || "full_time";
  if (kind === "freelance") return null;
  if (kind === "internship") return "HR-HIR-014";
  if (kind === "contract") return "HR-HIR-015";
  if (kind === "part_time") return "HR-HIR-016";
  const open = (o.conditions || []).some((c) => c && typeof c === "object" && (c.status || "open") !== "cleared");
  return open ? "HR-HIR-011" : "HR-HIR-012";
}

const PERIOD_WORD = { annual: "year", monthly: "month", weekly: "week", hourly: "hour" };
function payBasis(o) {
  const kind = remunerationLabel(o.remuneration_type);
  const per = PERIOD_WORD[o.pay_period];
  if (per) return `${kind} / ${per}`;
  return o.pay_period === "one_time" ? `${kind} · one-time` : kind;
}
const freqText = (f) => PAY_PERIODS.find((p) => p.value === f)?.label || "";

const EVENT_LABEL = {
  emailed: "Email sent", delivered: "Email delivered", viewed: "Letter opened", signed: "Letter signed", reminded: "Reminder sent",
  previewed: "Previewed by HR", approved: "Letter approved", rendered: "Letter generated", approval_waived: "Generated without approval",
  issued: "Letter sent", requested: "Letter requested",
};

const field = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white";
const labelCls = "text-xs text-gray-500 font-medium";

const EMPTY_ENTITY = {
  entity_country: null, entity_id_type: null, entity_tax_id: "", entity_name: "", entity_address: "",
  entity_city: "", entity_region: "", entity_postal_code: "",
};
const ENTITY_TEXT = ["entity_tax_id", "entity_name", "entity_address", "entity_city", "entity_region", "entity_postal_code"];

const emptyForm = (orgCurrency = "USD") => ({
  candidate_id: "", candidate_name: "", position: "", employment_type: "full_time", work_country: null,
  pay: { remuneration_type: "salary", amount: "", currency: orgCurrency, pay_period: "annual", currencyTouched: false },
  equity: "", joining_date: "", response_deadline: "", notes: "",
  entity: { ...EMPTY_ENTITY },
  entityCountryTouched: false,
});

const asList = (d) => (Array.isArray(d) ? d : d?.items || d?.data || []);

function RowMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"><MoreVertical className="h-4 w-4" /></button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {items.filter(Boolean).map((it) => (
            <button key={it.label} type="button" role="menuitem" title={it.title} disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick(); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-40 ${it.danger ? "text-rose-600 hover:bg-rose-50" : "text-gray-700 hover:bg-gray-50"}`}>
              {it.icon && <it.icon className="h-4 w-4" />}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckItem({ state, title, sub }) {
  const look = state === "done" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
    : state === "waived" ? <ShieldCheck className="h-5 w-5 text-blue-500" />
    : state === "blocked" ? <XCircle className="h-5 w-5 text-rose-500" />
    : <Circle className="h-5 w-5 text-gray-300" />;
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0">{look}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">{title}</p>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
      </div>
    </li>
  );
}

/** mode "issued": the Offers Issued section (Recruitment → Offers Issued) — the same screen limited to offers whose letter
 * was sent, with views by the candidate's response. */
export default function OfferManagement({ mode = "all" }) {
  const issuedOnly = mode === "issued";
  const regions = useRegions();
  const businessFormats = useBusinessFormats();
  const insights = useInsights("offers");
  const orgCurrency = regions?.organization?.currency || "USD";
  const [offers, setOffers] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [tab, setTab] = useState(issuedOnly ? "issued" : "all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [startFrom, setStartFrom] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(() => new Set());

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showEntity, setShowEntity] = useState(false);

  const [showPreview, setShowPreview] = useState(false);
  const [previewOffer, setPreviewOffer] = useState(null);
  const [documentDownloadBusy, setDocumentDownloadBusy] = useState(false);
  const [letterState, setLetterState] = useState({ loading: false, error: "", data: null, preflight: null, html: "" });
  const [workflowForm, setWorkflowForm] = useState({ mode: "", comment: "", category: "other", statement: "", condition: "", legal_review_completed: false, position: "", salary: "", currency: "", joining_date: "" });

  const [detailId, setDetailId] = useState(null);
  const [setupCountry, setSetupCountry] = useState(null);   // the "Set up offer letters" panel (work country or "")
  const [detailTab, setDetailTab] = useState("overview");
  const [detail, setDetail] = useState({ id: null, loading: false, error: "", doc: null, timeline: [] });
  const [templates, setTemplates] = useState({ loaded: false, loading: false, error: "", items: [] });

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      getOffers({ per_page: 100 }),
      getCandidates({ per_page: 100 }).catch(() => ({ items: [] })),
      typeof hrApi.getRequisitions === "function" ? hrApi.getRequisitions({ per_page: 100 }).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
    ]).then(([d, cands, reqs]) => {
      setOffers(asList(d));
      setCandidates(asList(cands));
      setRequisitions(asList(reqs));
    }).catch((err) => {
      setLoadError(err.message || "Failed to load offers.");
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const reloadInsights = insights.reload;
  const refreshAll = useCallback(() => { load(); reloadInsights(); }, [load, reloadInsights]);

  // ── lookups ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const candById = useMemo(() => Object.fromEntries(candidates.map((c) => [String(c.id), c])), [candidates]);
  const reqById = useMemo(() => Object.fromEntries(requisitions.map((r) => [String(r.id), r])), [requisitions]);
  const managerNames = useMemo(() => Object.fromEntries((insights.data?.hiring_managers || []).map((m) => [String(m.id), m.name])), [insights.data]);
  const activity = insights.data?.activity || {};
  const reqOf = (o) => {
    const c = o.candidate_id ? candById[String(o.candidate_id)] : null;
    const r = c?.requisition_id ? reqById[String(c.requisition_id)] : null;
    return { cand: c, req: r, reqTitle: r?.title || c?.requisition_title || "", reqId: c?.requisition_id || null };
  };

  const entityOptions = useMemo(() => {
    const names = insights.data?.entities?.length ? insights.data.entities : [...new Set(offers.map((o) => o.entity_name).filter(Boolean))].sort();
    return names.map((n) => ({ value: n, label: n }));
  }, [insights.data, offers]);
  const managerOptions = useMemo(() => (insights.data?.hiring_managers || []).map((m) => ({ value: String(m.id), label: m.name })), [insights.data]);
  const statusOptions = useMemo(() => {
    const seen = new Map();
    offers.forEach((o) => { const s = offerStatus(o); if (!seen.has(s.key)) seen.set(s.key, s.label); });
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [offers]);

  const tabRows = useMemo(() => ({
    all: offers,
    issued: offers.filter((o) => o.issued_at),
    archive: offers.filter((o) => CLOSED.includes(o.status)),
    awaiting: offers.filter((o) => o.issued_at && ["pending", "countered"].includes(o.status)),
    accepted: offers.filter((o) => o.issued_at && o.status === "accepted"),
    closed: offers.filter((o) => o.issued_at && ["rejected", "withdrawn", "expired"].includes(o.status)),
  }), [offers]);

  const filtered = useMemo(() => (tabRows[tab] || offers).filter((o) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const { reqTitle, reqId } = reqOf(o);
      const hay = [o.candidate_name, o.position, o.entity_name, reqTitle, reqId ? `#${reqId}` : ""].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (statusFilter && offerStatus(o).key !== statusFilter) return false;
    if (entityFilter && o.entity_name !== entityFilter) return false;
    if (managerFilter && String(o.reporting_manager_id || "") !== managerFilter) return false;
    if (startFrom && (!o.joining_date || String(o.joining_date).slice(0, 10) < startFrom)) return false;
    return true;
  }), [tabRows, tab, offers, search, statusFilter, entityFilter, managerFilter, startFrom, candById, reqById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // ── form helpers ───────────────────────────────────────────────────────────────────────────────────────────────────
  const setWorkCountry = (code, prev) => {
    const cur = currencyForCountry(regions, code);
    // until someone picks the entity's country, it follows the work country (with that country's ID type and fields)
    const entity = prev.entityCountryTouched || !code || prev.entity.entity_country === code
      ? prev.entity
      : { ...prev.entity, entity_country: code, entity_id_type: businessFormats?.countries?.[code]?.ids?.[0]?.key || null, entity_region: "" };
    return {
      ...prev,
      work_country: code,
      entity,
      pay: prev.pay.currencyTouched || !cur ? prev.pay : { ...prev.pay, currency: cur },
    };
  };

  const setEmploymentType = (type) => setForm((prev) => {
    const remuneration_type = remunerationFor(type, prev.pay.remuneration_type);
    const periodChanged = remuneration_type !== prev.pay.remuneration_type;
    return {
      ...prev,
      employment_type: type,
      equity: type === "internship" ? "" : prev.equity,
      pay: { ...prev.pay, remuneration_type, pay_period: periodChanged ? DEFAULT_PERIOD[remuneration_type] : prev.pay.pay_period },
    };
  });

  const openCreate = () => {
    setEditItem(null);
    const f = emptyForm(orgCurrency);
    if (regions?.organization?.country_code) {
      f.work_country = regions.organization.country_code;
      f.entity.entity_country = regions.organization.country_code;
      f.entity.entity_id_type = businessFormats?.countries?.[regions.organization.country_code]?.ids?.[0]?.key || null;
    }
    setForm(f);
    setFormError(null);
    setShowEntity(false);
    setShowModal(true);
  };

  const openEdit = (o) => {
    setEditItem(o);
    setForm({
      candidate_id: o.candidate_id ? String(o.candidate_id) : "",
      candidate_name: o.candidate_name || "",
      position: o.position || "",
      employment_type: o.employment_type || (o.remuneration_type === "stipend" ? "internship" : "full_time"),
      work_country: o.work_country || null,
      pay: {
        remuneration_type: o.remuneration_type || "salary",
        amount: o.salary ?? "",
        currency: o.currency || orgCurrency,
        pay_period: o.pay_period || DEFAULT_PERIOD[o.remuneration_type || "salary"],
        currencyTouched: true,
      },
      equity: o.equity ?? "",
      joining_date: o.joining_date ? String(o.joining_date).split("T")[0] : "",
      response_deadline: o.response_deadline ? String(o.response_deadline).slice(0, 10) : "",
      notes: o.notes || "",
      entity: {
        ...EMPTY_ENTITY,
        entity_country: o.entity_country || null, entity_id_type: o.entity_id_type || null, entity_tax_id: o.entity_tax_id || "",
        entity_name: o.entity_name || "", entity_address: o.entity_address || "", entity_city: o.entity_city || "",
        entity_region: o.entity_region || "", entity_postal_code: o.entity_postal_code || "",
      },
      entityCountryTouched: !!o.entity_country,
    });
    setFormError(null);
    setShowEntity(!!(o.entity_name || o.entity_tax_id));
    setShowModal(true);
  };

  const handleCandidateSelect = (candId) => {
    const cand = candidates.find((c) => String(c.id) === String(candId));
    setForm((prev) => {
      let next = {
        ...prev,
        candidate_id: candId,
        candidate_name: cand ? cand.name : prev.candidate_name,
        position: cand ? cand.position || prev.position : prev.position,
      };
      const country = cand ? guessCountry(regions, cand.location) : null;
      if (country) next = setWorkCountry(country, { ...next, pay: { ...next.pay, currencyTouched: false } });
      return next;
    });
  };

  const handleSave = async () => {
    setFormError(null);
    if (!form.candidate_name.trim() || !form.position.trim()) {
      setFormError("Candidate name and position are required.");
      return;
    }
    const amount = form.pay.amount === "" ? null : Number(form.pay.amount);
    if (amount !== null && (Number.isNaN(amount) || amount < 0)) {
      setFormError("Enter a valid amount.");
      return;
    }
    const ent = form.entity;
    const hasEntity = ENTITY_TEXT.some((k) => String(ent[k] || "").trim());
    if (hasEntity) {
      const country = ent.entity_country || form.work_country;
      if (!country) {
        setShowEntity(true);
        setFormError("Choose the country the contracting entity is registered in.");
        return;
      }
      const fmt = businessFormats?.countries?.[country] || businessFormats?.default;
      const idType = fmt?.ids?.find((t) => t.key === ent.entity_id_type) || fmt?.ids?.[0];
      const problem = checkBusinessId(fmt, idType, ent.entity_tax_id, country) || checkPostal(fmt, ent.entity_postal_code);
      if (problem) {
        setShowEntity(true);
        setFormError(problem);
        return;
      }
    }
    const payload = {
      candidate_id: form.candidate_id ? Number(form.candidate_id) : null,
      candidate_name: form.candidate_name.trim(),
      position: form.position.trim(),
      employment_type: form.employment_type,
      work_country: form.work_country || null,
      remuneration_type: form.pay.remuneration_type,
      salary: amount,
      currency: form.pay.currency,
      pay_period: form.pay.pay_period,
      equity: form.employment_type === "internship" ? null : (form.equity === "" ? null : String(form.equity)),
      joining_date: form.joining_date || null,
      response_deadline: form.response_deadline || null,
      notes: form.notes || null,
      ...(hasEntity ? {
        entity_country: ent.entity_country || form.work_country || null,
        entity_id_type: ent.entity_id_type || null,
        entity_tax_id: ent.entity_tax_id?.trim() || null,
        entity_name: ent.entity_name?.trim() || null,
        entity_address: ent.entity_address?.trim() || null,
        entity_city: ent.entity_city?.trim() || null,
        entity_region: ent.entity_region || null,
        entity_postal_code: ent.entity_postal_code?.trim() || null,
      } : {
        entity_country: null, entity_id_type: null, entity_tax_id: null, entity_name: null, entity_address: null,
        entity_city: null, entity_region: null, entity_postal_code: null,
      }),
    };
    if (!editItem) payload.status = "draft";
    setSaving(true);
    try {
      const saved = editItem ? await updateOffer(editItem.id, payload) : await createOffer(payload);
      setShowModal(false);
      // "Offer letters without approval" (recruitment settings): the server approves the saved offer and generates its
      // letter straight away, so it comes back ready to send
      const auto = saved?.status === "approved" && (!editItem || editItem.status !== "approved");
      setNotice(auto && saved?.document_id
        ? `${editItem ? "Offer updated" : "Offer created"}. Its letter was generated automatically and is ready to send.`
        : auto ? `${editItem ? "Offer updated" : "Offer created"} and approved automatically. Open Preview Offer to see why the letter was not generated.`
        : editItem ? "Offer updated." : "Offer created.");
      refreshAll();
      if (detailId && editItem && detailId === editItem.id) loadDetail(detailId);
    } catch (err) {
      setFormError(err.message || "Failed to save offer.");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (o, fn, { confirm, ok }) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusyId(o.id);
    setActionError(null);
    try {
      const res = await fn(o.id);
      setNotice(typeof ok === "function" ? ok(res) : ok);
      refreshAll();
      if (detailId === o.id) loadDetail(o.id);
    } catch (err) {
      setActionError(err.message || "The action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const lockedType = form.employment_type === "internship" ? "stipend" : null;
  const workCountryName = regions?.countries?.find((c) => c.code === form.work_country)?.name;
  const autoCurrency = currencyForCountry(regions, form.work_country);
  const currencyHint = !form.pay.currencyTouched && workCountryName && autoCurrency === form.pay.currency
    ? `Set from ${workCountryName}` : !form.work_country ? "Organization default" : null;

  // ── offer letter workflow (preview dialog) ─────────────────────────────────────────────────────────────────────────
  const openPreview = async (offer, mode = "") => {
    setPreviewOffer(offer);
    setWorkflowForm({ mode, comment: "", category: "other", statement: "", condition: "", legal_review_completed: false,
      position: offer.position || "", salary: offer.salary ?? "", currency: offer.currency || "", joining_date: offer.joining_date ? String(offer.joining_date).slice(0, 10) : "" });
    setShowPreview(true);
    setLetterState({ loading: true, error: "", data: null, preflight: null, html: "" });
    try {
      const [data, preflight, readiness] = await Promise.all([getOfferDocument(offer.id), getOfferLetterPreflight(offer.id), typeof recDocs.getOfferLetterReadiness === "function" ? recDocs.getOfferLetterReadiness(offer.id).catch(() => null) : null]);
      const html = data?.letter?.id ? (await previewGeneratedDocument(data.letter.id))?.html || "" : "";
      setLetterState({ loading: false, error: "", data, preflight, readiness, html });
    } catch (e) {
      setLetterState({ loading: false, error: e?.message || "Offer documents could not be loaded.", data: null, preflight: null, html: "" });
    }
  };

  const refreshLetter = async (offerId = previewOffer?.id) => {
    if (!offerId) return;
    setLetterState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const [data, preflight, readiness] = await Promise.all([getOfferDocument(offerId), getOfferLetterPreflight(offerId), typeof recDocs.getOfferLetterReadiness === "function" ? recDocs.getOfferLetterReadiness(offerId).catch(() => null) : null]);
      const html = data?.letter?.id ? (await previewGeneratedDocument(data.letter.id))?.html || "" : "";
      setLetterState({ loading: false, error: "", data, preflight, readiness, html });
      refreshAll();
      if (detailId === offerId) loadDetail(offerId);
    } catch (e) {
      setLetterState((prev) => ({ ...prev, loading: false, error: e?.message || "Offer documents could not be refreshed." }));
    }
  };

  const closePreview = () => {
    setShowPreview(false);
    setPreviewOffer(null);
    setWorkflowForm((prev) => ({ ...prev, mode: "" }));
  };

  const manageLetter = async (action, successText) => {
    if (!previewOffer) return;
    setBusyId(previewOffer.id);
    setActionError(null);
    try {
      const response = await action();
      setNotice(typeof successText === "function" ? successText(response) : successText);
      setWorkflowForm((prev) => ({ ...prev, mode: "" }));
      await refreshLetter(previewOffer.id);
    } catch (e) {
      setActionError(e?.message || "The offer document action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const submitWorkflow = (event) => {
    event.preventDefault();
    if (!previewOffer) return;
    if (workflowForm.mode === "approve") return manageLetter(() => approveOfferDocument(previewOffer.id, workflowForm.comment.trim() || null), "Offer approved.");
    if (workflowForm.mode === "generate") return manageLetter(() => generateOfferLetter(previewOffer.id), "Offer letter generated.");
    if (workflowForm.mode === "issue") return manageLetter(() => issueOfferLetter(previewOffer.id), "Offer letter issued to the candidate.");
    if (workflowForm.mode === "amend") {
      const changes = {};
      if (workflowForm.position.trim() !== (previewOffer.position || "")) changes.position = workflowForm.position.trim();
      if (workflowForm.salary !== "" && Number(workflowForm.salary) !== Number(previewOffer.salary)) changes.salary = Number(workflowForm.salary);
      if (workflowForm.currency.trim() && workflowForm.currency.trim() !== (previewOffer.currency || "")) changes.currency = workflowForm.currency.trim();
      if (workflowForm.joining_date && workflowForm.joining_date !== String(previewOffer.joining_date || "").slice(0, 10)) changes.joining_date = workflowForm.joining_date;
      if (!Object.keys(changes).length) { setActionError("Enter at least one change to the offer."); return; }
      return manageLetter(() => amendOffer(previewOffer.id, changes), (r) => r?.warning || "Amendment draft created. Review and approve it as a new offer.");
    }
    if (workflowForm.mode === "withdraw") {
      return manageLetter(() => requestOfferWithdrawal(previewOffer.id, {
        category: workflowForm.category,
        statement: workflowForm.statement.trim(),
        condition: workflowForm.condition.trim() || null,
        legal_review_completed: workflowForm.legal_review_completed,
      }), "Withdrawal notice requested. It must be reviewed and issued before the offer is withdrawn.");
    }
  };

  const downloadLetter = async () => {
    const documentId = letterState.data?.letter?.id;
    if (!documentId) return;
    setDocumentDownloadBusy(true);
    try { await downloadGeneratedDocument(documentId); }
    catch (e) { setActionError(e?.message || "The issued document could not be downloaded."); }
    finally { setDocumentDownloadBusy(false); }
  };

  const clearCondition = (index) => manageLetter(async () => {
    const result = await clearOfferCondition(previewOffer.id, index);
    setPreviewOffer((current) => current ? ({
      ...current,
      conditions: (current.conditions || []).map((condition, i) => i === index
        ? { ...condition, status: "cleared", cleared: true }
        : condition),
    }) : current);
    return result;
  }, "Offer condition cleared.");

  // ── detail panel ───────────────────────────────────────────────────────────────────────────────────────────────────
  const loadDetail = useCallback(async (id) => {
    setDetail((prev) => ({ id, loading: true, error: "", doc: prev.id === id ? prev.doc : null, timeline: prev.id === id ? prev.timeline : [] }));
    try {
      const [doc, readiness] = await Promise.all([
        getOfferDocument(id),
        typeof recDocs.getOfferLetterReadiness === "function" ? recDocs.getOfferLetterReadiness(id).catch(() => null) : null,
      ]);
      let timeline = [];
      if (doc?.letter?.id && typeof docApi.getDocumentTimeline === "function") {
        timeline = asList(await docApi.getDocumentTimeline(doc.letter.id).catch(() => ({ items: [] })));
      }
      setDetail((prev) => (prev.id === id ? { id, loading: false, error: "", doc, timeline, readiness } : prev));
    } catch (e) {
      setDetail((prev) => (prev.id === id ? { ...prev, loading: false, error: e?.message || "Offer details could not be loaded." } : prev));
    }
  }, []);

  const openDetail = (o) => { setDetailId(o.id); setDetailTab("overview"); loadDetail(o.id); };
  const detailOffer = detailId ? offers.find((o) => o.id === detailId) : null;

  const sendLetter = (o) => runAction(o, issueOfferLetter, { confirm: `Send the offer letter to ${o.candidate_name}?`, ok: "Offer letter issued to the candidate." });

  // ── templates tab ──────────────────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "templates" || templates.loaded || templates.loading) return;
    if (typeof docApi.listTemplates !== "function") { setTemplates({ loaded: true, loading: false, error: "", items: [] }); return; }
    setTemplates((t) => ({ ...t, loading: true }));
    docApi.listTemplates({ search: "HR-HIR", per_page: 100 })
      .then((d) => setTemplates({ loaded: true, loading: false, error: "", items: asList(d).filter((t) => OFFER_LETTER_IDS.includes(t.canonical_id)) }))
      .catch((e) => setTemplates({ loaded: true, loading: false, error: e?.message || "Templates could not be loaded.", items: [] }));
  }, [tab, templates.loaded, templates.loading]);

  const templateUse = useMemo(() => {
    const m = {};
    offers.forEach((o) => { const t = templateFor(o); if (t) (m[t] = m[t] || []).push(o); });
    return m;
  }, [offers]);

  // ── render ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const headerActions = issuedOnly ? (
    <NavLink to="/zoiko-hr/recruitment/offers"
      className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
      <FileText className="h-4 w-4" /> Offer Management
    </NavLink>
  ) : (
    <>
      <NavLink to="/zoiko-hr/documents/templates"
        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
        <LayoutTemplate className="h-4 w-4" /> Create Template
      </NavLink>
      <SecondaryButton icon={ShieldCheck} onClick={() => setSetupCountry("")}>Offer letter setup</SecondaryButton>
      <PrimaryButton icon={Plus} onClick={openCreate}>New Offer</PrimaryButton>
    </>
  );
  const TITLE = issuedOnly ? "Offers Issued" : "Offer Management";
  const SUBTITLE = issuedOnly ? "Every offer letter sent to candidates, with their response and delivery status."
    : "Create, review, send, and track employment offers end-to-end.";

  if (loading && offers.length === 0) {
    return <RecruitmentLayout title={TITLE} subtitle={SUBTITLE}><div className="p-6 text-gray-400">Loading...</div></RecruitmentLayout>;
  }

  if (loadError && offers.length === 0) {
    return (
      <RecruitmentLayout title={TITLE} subtitle={SUBTITLE}>
        <div className="p-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-lg"><AlertCircle className="w-5 h-5" />{loadError}</div>
          <div className="mt-4"><button onClick={load} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Try Again</button></div>
        </div>
      </RecruitmentLayout>
    );
  }

  const kpis = insights.data?.kpis || {};
  const KPI_CARDS = [
    ["Drafts", "drafts", FileText, "blue", "draft"],
    ["Ready to Send", "ready_to_send", Send, "teal", "ready"],
    ["Sent", "sent", Mail, "violet", "sent"],
    ["Awaiting Response", "awaiting_response", Clock, "amber", "awaiting"],
    ["Accepted", "accepted", CheckCircle2, "green", "accepted"],
    ["Declined", "declined", XCircle, "red", "declined"],
  ].filter(([, key]) => !issuedOnly || ["sent", "awaiting_response", "accepted", "declined"].includes(key));

  const pageIds = paged.map((o) => o.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allOnPage) pageIds.forEach((id) => next.delete(id)); else pageIds.forEach((id) => next.add(id));
    return next;
  });
  const toggleOne = (id) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const resetPage = (fn) => (v) => { fn(v); setPage(1); };

  return (
    <RecruitmentLayout title={TITLE} subtitle={SUBTITLE} actions={headerActions}>
      <WithDetail detail={detailOffer && (
        <OfferDetail
          offer={detailOffer} detail={detail} tab={detailTab} onTab={setDetailTab} onClose={() => setDetailId(null)}
          info={reqOf(detailOffer)} managerName={managerNames[String(detailOffer.reporting_manager_id)]}
          delivery={activity[detailOffer.id]?.delivery} approvedByName={activity[detailOffer.id]?.approved_by_name} busy={busyId === detailOffer.id}
          onPreview={() => openPreview(detailOffer)} onEdit={() => openEdit(detailOffer)} onSend={() => sendLetter(detailOffer)}
          onWithdraw={() => openPreview(detailOffer, "withdraw")} onAmend={() => openPreview(detailOffer, "amend")}
          onSetup={setSetupCountry}
        />
      )}>
        <div className="space-y-6">
          {actionError && (
            <div className="flex items-center gap-2 break-words rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {actionError}
              <button onClick={() => setActionError(null)} aria-label="Dismiss" className="ml-auto shrink-0 -m-1 p-1.5"><X className="h-4 w-4" /></button>
            </div>
          )}
          {notice && (
            <div className="flex items-center gap-2 break-words rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
              <button onClick={() => setNotice(null)} aria-label="Dismiss" className="ml-auto shrink-0 -m-1 p-1.5"><X className="h-4 w-4" /></button>
            </div>
          )}

          <KpiGrid cols={issuedOnly ? 4 : 6}>
            {KPI_CARDS.map(([label, key, icon, tone, filterKey]) => (
              <button key={key} type="button" aria-pressed={statusFilter === filterKey} title={`Show ${label.toLowerCase()} offers`}
                onClick={() => { setTab(issuedOnly ? "issued" : "all"); setStatusFilter(statusFilter === filterKey ? "" : filterKey); setPage(1); }}
                className={`rounded-2xl text-left ${statusFilter === filterKey ? "ring-2 ring-blue-400" : ""}`}>
                <KpiCard label={label} icon={icon} tone={tone} kpi={kpis[key]} loading={insights.loading && !insights.data} />
              </button>
            ))}
          </KpiGrid>
          {insights.error && <p className="text-xs text-amber-700">Offer figures could not be loaded: {insights.error}</p>}

          <Card bodyClass="">
            <div className="px-5 pt-3">
              <UnderlineTabs label="Offer views" value={tab} onChange={(v) => { setTab(v); setPage(1); }} tabs={issuedOnly ? [
                { value: "issued", label: "All Issued", count: tabRows.issued.length },
                { value: "awaiting", label: "Awaiting Response", count: tabRows.awaiting.length },
                { value: "accepted", label: "Accepted", count: tabRows.accepted.length },
                { value: "closed", label: "Declined / Withdrawn / Expired", count: tabRows.closed.length },
              ] : [
                { value: "all", label: "All Offers", count: offers.length },
                { value: "issued", label: "Offers Issued", count: tabRows.issued.length },
                { value: "templates", label: "Templates" },
                { value: "archive", label: "Archive", count: tabRows.archive.length },
              ]} />
            </div>

            {tab === "templates" ? (
              <TemplatesView templates={templates} use={templateUse} />
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-3 px-5 py-4">
                  <SearchInput value={search} onChange={resetPage(setSearch)} label="Search offers" placeholder="Search by candidate name, position, or requisition…" />
                  <FilterSelect label="Status" allLabel="All Statuses" value={statusFilter} onChange={resetPage(setStatusFilter)} options={statusOptions} />
                  <FilterSelect label="Entity" allLabel="All Entities" value={entityFilter} onChange={resetPage(setEntityFilter)} options={entityOptions} />
                  <FilterSelect label="Hiring Manager" allLabel="All Managers" value={managerFilter} onChange={resetPage(setManagerFilter)} options={managerOptions} />
                  <label className="min-w-[150px] text-xs font-medium text-gray-600">Start Date (from)
                    <input type="date" value={startFrom} onChange={(e) => { setStartFrom(e.target.value); setPage(1); }}
                      className="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800" />
                  </label>
                </div>

                <Table
                  columns={[
                    { label: <input type="checkbox" aria-label="Select all offers on this page" checked={allOnPage} onChange={toggleAll} /> , className: "w-10" },
                    { label: "Candidate" }, { label: "Position" }, { label: "Entity", className: "hidden md:table-cell" },
                    { label: "Compensation" }, { label: "Status" }, { label: "Start Date", className: "hidden lg:table-cell" },
                    { label: "Created", className: "hidden lg:table-cell" }, { label: "Last Activity", className: "hidden xl:table-cell" },
                    { label: "Actions", className: "text-right" },
                  ]}
                  empty={paged.length === 0 && (
                    <EmptyState icon={Inbox} title={offers.length ? "No offers match these filters" : "No offers yet"}>
                      {offers.length ? "Change the search or filters to see more offers." : "Create an offer with New Offer."}
                    </EmptyState>
                  )}
                >
                  {paged.map((o) => {
                    const busy = busyId === o.id;
                    const st = offerStatus(o);
                    const { reqTitle, reqId } = reqOf(o);
                    const typeLabel = EMPLOYMENT_TYPES.find((t) => t.value === o.employment_type)?.label;
                    const last = activity[o.id]?.last_activity;
                    const place = o.entity_city || o.work_location;
                    return (
                      <tr key={o.id} onClick={() => openDetail(o)} aria-selected={detailId === o.id}
                        className={`cursor-pointer hover:bg-gray-50 ${detailId === o.id ? "bg-blue-50/50" : ""}`}>
                        <td className={td} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" aria-label={`Select offer for ${o.candidate_name}`} checked={selected.has(o.id)} onChange={() => toggleOne(o.id)} />
                        </td>
                        <td className={`${td} min-w-[12rem]`}>
                          <div className="flex min-w-0 items-center gap-3"
                            title={o.candidate_id ? "Linked to candidate record" : "Not linked to a candidate — accepting won't start onboarding and the offer can't be emailed"}>
                            <Avatar name={o.candidate_name} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900">{o.candidate_name || "—"}</p>
                              {o.candidate_id
                                ? <p className="truncate text-xs text-gray-500">Candidate #{o.candidate_id}</p>
                                : <p className="truncate text-xs text-amber-600">⚠ No candidate linked</p>}
                            </div>
                          </div>
                        </td>
                        <td className={`${td} min-w-[9rem]`}>
                          <p className="font-medium text-gray-800">{o.position || "—"}</p>
                          <p className="text-xs text-gray-500">{[reqId ? `REQ #${reqId}` : null, reqTitle && reqTitle !== o.position ? reqTitle : null, typeLabel].filter(Boolean).join(" · ") || "—"}</p>
                        </td>
                        <td className={`${td} hidden md:table-cell`}>
                          {o.entity_name ? (
                            <>
                              <p className="text-gray-800" title={[o.entity_address, o.entity_city, o.entity_region, o.entity_postal_code].filter(Boolean).join(", ")}>{o.entity_name}</p>
                              <p className="text-xs text-gray-500">
                                {place || ""}
                                {o.entity_tax_id && <span className="font-mono">{place ? " · " : ""}{(businessFormats?.countries?.[o.entity_country]?.ids?.find((t) => t.key === o.entity_id_type)?.label) || "ID"} {o.entity_tax_id}</span>}
                              </p>
                            </>
                          ) : <span className="text-gray-400">{place || "—"}</span>}
                        </td>
                        <td className={`${td} whitespace-nowrap`}>
                          <p className="font-medium text-gray-900">{o.salary != null ? money(o.salary, o.currency || orgCurrency) : "—"}</p>
                          <p className="text-xs text-gray-500">{payBasis(o)}{o.equity ? ` · ${o.equity}% equity` : ""}</p>
                        </td>
                        <td className={td}><StatusPill tone={st.tone} icon={st.icon}>{st.label}</StatusPill></td>
                        <td className={`${td} hidden whitespace-nowrap lg:table-cell`}>{formatDate(o.joining_date)}</td>
                        <td className={`${td} hidden whitespace-nowrap lg:table-cell`}>
                          <p>{o.created_at ? shortDate(o.created_at) : "—"}</p>
                          <p className="text-xs text-gray-500">{relativeTime(o.created_at)}</p>
                        </td>
                        <td className={`${td} hidden xl:table-cell`}>
                          {last?.label ? <><p>{last.label}</p><p className="text-xs text-gray-500">{relativeTime(last.at)}</p></> : <span className="text-gray-400">—</span>}
                        </td>
                        <td className={`${td} whitespace-nowrap text-right`}>
                          <div className="inline-flex items-center gap-1">
                            {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                            <button type="button" title="Manage offer letter" onClick={(e) => { e.stopPropagation(); openPreview(o); }}
                              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"><Eye className="h-4 w-4" /></button>
                            <RowMenu label={`Actions for ${o.candidate_name}`} items={[
                              { label: "View details", icon: FileText, onClick: () => openDetail(o) },
                              { label: "Preview offer", icon: Eye, onClick: () => openPreview(o) },
                              !CLOSED.includes(o.status) && { label: "Edit", title: "Edit", icon: Edit2, onClick: () => openEdit(o) },
                              !WITHDRAW_BLOCKED.includes(o.status) && { label: "Request withdrawal", title: "Request offer withdrawal", icon: Undo2, onClick: () => openPreview(o, "withdraw") },
                              { label: "Delete", title: "Delete", icon: Trash2, danger: true, disabled: busy, onClick: () => runAction(o, deleteOffer, { confirm: "Delete this offer permanently?", ok: "Offer deleted." }) },
                            ]} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Table>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="px-4 pt-3 text-sm text-gray-500">{selected.size} of {offers.length} selected</span>
                </div>
                <Pagination page={safePage} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
              </>
            )}
          </Card>
        </div>
      </WithDetail>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div role="dialog" aria-modal="true" aria-label={editItem ? "Edit offer" : "New offer"} className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 sm:px-6 sm:py-4">
              <h2 className="text-lg font-semibold">{editItem ? "Edit offer" : "New offer"}</h2>
              <button onClick={() => setShowModal(false)} aria-label="Close" className="-m-1.5 p-1.5"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
              <div>
                <label className={labelCls}>Link to candidate</label>
                <select value={form.candidate_id} onChange={(e) => handleCandidateSelect(e.target.value)} className={field}>
                  <option value="">No candidate linked (name only)</option>
                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email}){c.location ? ` · ${c.location}` : ""}</option>)}
                </select>
                {!form.candidate_id && (
                  <p className="text-xs text-amber-600 mt-1">Without a linked candidate the offer can't be emailed, and accepting it won't mark them hired or start onboarding.</p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Candidate name *</label>
                  <input value={form.candidate_name} onChange={(e) => setForm({ ...form, candidate_name: e.target.value })} className={field} maxLength={150} />
                </div>
                <div>
                  <label className={labelCls}>Position *</label>
                  <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className={field} maxLength={150} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Employment type</label>
                  <select value={form.employment_type} onChange={(e) => setEmploymentType(e.target.value)} className={field}>
                    {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Work country (sets the currency)</label>
                  <CountrySelect regions={regions} value={form.work_country} onChange={(c) => setForm((prev) => setWorkCountry(c, { ...prev, pay: { ...prev.pay, currencyTouched: false } }))} />
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 sm:p-4">
                <RemunerationFields regions={regions} value={form.pay} lockedType={lockedType} currencyHint={currencyHint}
                  onChange={(pay) => setForm((prev) => ({ ...prev, pay }))} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {form.employment_type !== "internship" && (
                  <div>
                    <label className={labelCls}>Equity (%)</label>
                    <input type="number" step="0.01" min="0" max="100" value={form.equity} onChange={(e) => setForm({ ...form, equity: e.target.value })} className={field} />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Start date</label>
                  <input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={labelCls}>Response deadline</label>
                  <input type="date" value={form.response_deadline} onChange={(e) => setForm({ ...form, response_deadline: e.target.value })} className={field} />
                </div>
                <div className="flex items-end">
                  <p className="text-xs text-gray-500">{editItem ? `Current status: ${STATUS_LABEL[editItem.status] || editItem.status}. Approval and delivery status are managed in the offer letter workflow.` : "New offers are saved as drafts and approved or issued in the offer letter workflow. If your organization sends offer letters without approval, the letter is generated on save."}</p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200">
                <button type="button" onClick={() => setShowEntity((v) => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-gray-700">
                  <span className="flex min-w-0 flex-wrap items-center gap-2"><Building2 className="h-4 w-4 shrink-0 text-gray-400" /> Employing / contracting entity
                    <span className="text-xs font-normal text-gray-400">{form.pay.remuneration_type === "fee" ? "recommended for fee-based work" : "optional"}</span></span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${showEntity ? "rotate-180" : ""}`} />
                </button>
                {showEntity && (
                  <div className="border-t border-gray-100 p-3 sm:p-4">
                    <BusinessLookupFields regions={regions} value={form.entity}
                      onChange={(entity) => setForm((prev) => ({ ...prev, entity, entityCountryTouched: prev.entityCountryTouched || entity.entity_country !== prev.entity.entity_country }))} />
                  </div>
                )}
              </div>

              <div>
                <label className={labelCls}>Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={field} rows={3} />
              </div>
              {formError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-4 py-3 sm:px-6 sm:py-4">
              <SecondaryButton onClick={() => setShowModal(false)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}{editItem ? "Update" : "Create"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* The document engine owns rendering, approval, issue, and PDF download. */}
      {showPreview && previewOffer && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 sm:p-6">
          <div role="dialog" aria-modal="true" aria-label={`Offer documents for ${previewOffer.candidate_name}`} className="flex max-h-[95vh] w-full max-w-5xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Offer documents · {previewOffer.candidate_name}</h2>
                <p className="text-xs text-slate-500">{previewOffer.position}</p>
              </div>
              <button onClick={closePreview} aria-label="Close" className="-m-1.5 p-1.5 text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="space-y-4">
                {letterState.loading ? <p role="status" className="py-8 text-center text-sm text-gray-500">Loading server document status…</p> : null}
                {letterState.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{letterState.error}</div>}
                {letterState.data?.letter ? (
                  <SandboxedHtmlPreview html={letterState.html} title={`Offer letter for ${previewOffer.candidate_name}`} height="min(65vh, 720px)" />
                ) : (
                  <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                    {letterState.loading ? "Checking offer documents…" : "No offer letter has been generated yet."}
                  </div>
                )}
                {letterState.data?.documents?.length > 0 && (
                  <section className="rounded-xl border border-gray-200 p-4">
                    <h3 className="font-semibold text-gray-900">Document history</h3>
                    <ul className="mt-2 space-y-2 text-sm">
                      {letterState.data.documents.map((doc) => (
                        <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span><FileText className="mr-1 inline h-4 w-4 text-gray-400" />{doc.title || doc.document_number || doc.canonical_id}</span>
                          <span className="text-xs font-medium text-gray-500">{doc.status?.replace(/_/g, " ")}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
              <aside className="space-y-4">
                <section className="rounded-xl border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900">Offer status</h3>
                  <div className="mt-3 space-y-2 text-sm text-gray-600">
                    <p>Offer: <strong className="capitalize text-gray-900">{letterState.data?.status || previewOffer.status}</strong></p>
                    <p>Letter: <strong className="text-gray-900">{letterState.data?.letter?.status?.replace(/_/g, " ") || "Not generated"}</strong></p>
                    {letterState.data?.template && <p>Template: <span className="font-mono text-gray-900">{letterState.data.template}</span></p>}
                    {letterState.data?.approved_at && <p>Approved: {formatDate(letterState.data.approved_at)}</p>}
                    {letterState.data?.issued_at && <p>Issued: {formatDate(letterState.data.issued_at)}</p>}
                    {letterState.data?.decline_reason && <p>Decline reason: {letterState.data.decline_reason}</p>}
                  </div>
                  {letterState.data?.letter?.id && ["ISSUED", "EXECUTED"].includes(letterState.data.letter.status) && (
                    <button type="button" onClick={downloadLetter} disabled={documentDownloadBusy} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      {documentDownloadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Download issued PDF
                    </button>
                  )}
                </section>
                {letterState.readiness && !letterState.data?.letter && (
                  <section className="rounded-xl border border-gray-200 p-4">
                    <h3 className="mb-2 font-semibold text-gray-900">What the letter needs</h3>
                    <LetterReadiness readiness={letterState.readiness} onSetup={setSetupCountry} />
                  </section>
                )}
                {letterState.preflight && (
                  <section className="rounded-xl border border-gray-200 p-4">
                    <h3 className="font-semibold text-gray-900">Generation preflight</h3>
                    {letterState.preflight.selection_blocked && <p className="mt-2 text-sm text-amber-700">{letterState.preflight.selection_blocked}</p>}
                    {letterState.preflight.preflight && (
                      <>
                        <p className="mt-2 text-sm">Result: <strong>{letterState.preflight.preflight.outcome || "Not ready"}</strong></p>
                        {(letterState.preflight.preflight.reasons || []).length > 0 && (
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-600">{letterState.preflight.preflight.reasons.map((reason) => <li key={reason}>{typeof docApi.reasonText === "function" ? docApi.reasonText(reason) : reason}</li>)}</ul>
                        )}
                      </>
                    )}
                  </section>
                )}
                {Array.isArray(previewOffer.conditions) && previewOffer.conditions.length > 0 && (
                  <section className="rounded-xl border border-gray-200 p-4">
                    <h3 className="font-semibold text-gray-900">Offer conditions</h3>
                    <ul className="mt-2 space-y-2 text-sm">
                      {previewOffer.conditions.map((condition, index) => (
                        <li key={`${condition.type || condition.name || index}-${index}`} className="flex items-center justify-between gap-2">
                          <span className="text-gray-600">{condition.label || condition.description || condition.type || condition.name || `Condition ${index + 1}`} · {condition.status || (condition.cleared ? "cleared" : "pending")}</span>
                          {!condition.cleared && condition.status !== "cleared" && <button type="button" onClick={() => clearCondition(index)} className="text-xs font-medium text-blue-700 hover:underline">Clear</button>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {!letterState.loading && letterState.data && (
                  <section className="space-y-2 rounded-xl border border-gray-200 p-4">
                    <h3 className="font-semibold text-gray-900">Actions</h3>
                    {!letterState.data?.approved_at && letterState.data?.status !== "approved" && (
                      <button type="button" onClick={() => setWorkflowForm((prev) => ({ ...prev, mode: "approve" }))} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                        <ShieldCheck className="h-4 w-4" /> Approve offer
                      </button>
                    )}
                    {(letterState.data?.status === "approved" || letterState.data?.status === "APPROVED"
                      || letterState.readiness?.steps?.some((step) => step.key === "approval" && step.automatic)) && !letterState.data?.letter && (
                      <button type="button" onClick={() => manageLetter(() => generateOfferLetter(previewOffer.id), "Offer letter generated.")} disabled={Boolean(busyId)} className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50">Generate server letter</button>
                    )}
                    {(letterState.data?.letter?.status === "HUMAN_APPROVED"
                      || (letterState.data?.letter?.status === "RENDERED_DRAFT" && letterState.data?.letter?.approval_policy === "L1")) && (
                      <button type="button" onClick={() => manageLetter(() => issueOfferLetter(previewOffer.id), "Offer letter issued to the candidate.")} disabled={Boolean(busyId)} className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Issue to candidate</button>
                    )}
                    {letterState.data?.letter && !["HUMAN_APPROVED", "ISSUED", "EXECUTED"].includes(letterState.data.letter.status)
                      && !(letterState.data.letter.status === "RENDERED_DRAFT" && letterState.data.letter.approval_policy === "L1") && (
                      <p className="text-xs text-amber-700">This document is {letterState.data.letter.status?.replace(/_/g, " ") || "in progress"}. Complete any remaining document approvals in Generated Documents.</p>
                    )}
                    {letterState.data?.letter && ["ISSUED", "EXECUTED"].includes(letterState.data.letter.status) && !WITHDRAW_BLOCKED.includes(letterState.data.status) && (
                      <button type="button" onClick={() => setWorkflowForm((prev) => ({ ...prev, mode: "amend" }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Amend issued offer</button>
                    )}
                    {!WITHDRAW_BLOCKED.includes(letterState.data.status || previewOffer.status) && (
                      <button type="button" onClick={() => setWorkflowForm((prev) => ({ ...prev, mode: "withdraw" }))} className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Request withdrawal</button>
                    )}
                    {workflowForm.mode && (
                      <form onSubmit={submitWorkflow} className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                        {workflowForm.mode === "approve" && (
                          <>
                            <label className="block text-xs font-medium text-gray-600">Approval comment (optional)
                              <textarea value={workflowForm.comment} onChange={(e) => setWorkflowForm({ ...workflowForm, comment: e.target.value })} maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                            </label>
                            <p className="text-xs text-gray-500">Someone other than the person who prepared the offer must approve it.</p>
                            <button type="submit" disabled={Boolean(busyId)} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Confirm approval</button>
                          </>
                        )}
                        {workflowForm.mode === "amend" && (
                          <>
                            <label className="block text-xs font-medium text-gray-600">Position<input value={workflowForm.position} onChange={(e) => setWorkflowForm({ ...workflowForm, position: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
                            <label className="block text-xs font-medium text-gray-600">Salary<input type="number" min="0" value={workflowForm.salary} onChange={(e) => setWorkflowForm({ ...workflowForm, salary: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
                            <label className="block text-xs font-medium text-gray-600">Currency<input value={workflowForm.currency} onChange={(e) => setWorkflowForm({ ...workflowForm, currency: e.target.value })} maxLength={3} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
                            <label className="block text-xs font-medium text-gray-600">Start date<input type="date" value={workflowForm.joining_date} onChange={(e) => setWorkflowForm({ ...workflowForm, joining_date: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
                            <p className="text-xs text-amber-700">An amendment creates a new draft offer that needs approval and a new letter.</p>
                            <button type="submit" disabled={Boolean(busyId)} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Create amendment draft</button>
                          </>
                        )}
                        {workflowForm.mode === "withdraw" && (
                          <>
                            <label className="block text-xs font-medium text-gray-600">Reason
                              <select value={workflowForm.category} onChange={(e) => setWorkflowForm({ ...workflowForm, category: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                                <option value="condition_not_met">Condition not met</option><option value="role_cancelled">Role cancelled</option><option value="candidate_request">Candidate request</option><option value="other">Other</option>
                              </select>
                            </label>
                            <label className="block text-xs font-medium text-gray-600">Reviewed statement for the candidate
                              <textarea required maxLength={4000} value={workflowForm.statement} onChange={(e) => setWorkflowForm({ ...workflowForm, statement: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                            </label>
                            <label className="block text-xs font-medium text-gray-600">Condition {workflowForm.category === "condition_not_met" ? "*" : "(if applicable)"}<input required={workflowForm.category === "condition_not_met"} maxLength={300} value={workflowForm.condition} onChange={(e) => setWorkflowForm({ ...workflowForm, condition: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
                            {letterState.data.status === "accepted" && <p className="text-xs text-amber-700">This offer was accepted. Record the legal-review outcome for the withdrawal request.</p>}
                            <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={workflowForm.legal_review_completed} onChange={(e) => setWorkflowForm({ ...workflowForm, legal_review_completed: e.target.checked })} /> Legal review completed</label>
                            <p className="text-xs text-amber-700">The withdrawal is not final until its notice has been approved and issued.</p>
                            <button type="submit" disabled={Boolean(busyId)} className="w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Request withdrawal notice</button>
                          </>
                        )}
                        <button type="button" onClick={() => setWorkflowForm((prev) => ({ ...prev, mode: "" }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600">Cancel</button>
                      </form>
                    )}
                  </section>
                )}
              </aside>
            </div>
          </div>
        </div>
      )}
      {setupCountry !== null && (
        <OfferLetterSetupPanel country={setupCountry || undefined} onClose={() => setSetupCountry(null)}
          onDone={() => { load(); reloadInsights(); if (detailId) loadDetail(detailId); if (previewOffer) refreshLetter(previewOffer.id); }} />
      )}
    </RecruitmentLayout>
  );
}

// ── Templates tab ────────────────────────────────────────────────────────────────────────────────────────────────────
function TemplatesView({ templates, use }) {
  const byId = Object.fromEntries((templates.items || []).map((t) => [t.canonical_id, t]));
  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">Offer letter templates and the offers each one is selected for. Template wording is managed in the template library.</p>
        <NavLink to="/zoiko-hr/documents/templates" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
          Open template library <ExternalLink className="h-3.5 w-3.5" />
        </NavLink>
      </div>
      {templates.loading && <p role="status" className="py-4 text-sm text-gray-500">Loading templates…</p>}
      {templates.error && <p className="py-2 text-sm text-amber-700">{templates.error}</p>}
      <Table columns={[{ label: "Template" }, { label: "Availability" }, { label: "Active version", className: "hidden md:table-cell" }, { label: "Offers using it" }]}>
        {OFFER_LETTER_IDS.map((cid) => {
          const t = byId[cid];
          const offers = use[cid] || [];
          return (
            <tr key={cid}>
              <td className={td}>
                <p className="font-mono text-xs text-gray-500">{cid}</p>
                <p className="font-medium text-gray-900">{t?.title || "—"}</p>
              </td>
              <td className={td}>
                {t ? (t.available ? <StatusPill tone="green">Available</StatusPill> : <span title={t.unavailable_reason || ""}><StatusPill tone="amber">Not available</StatusPill></span>) : <span className="text-gray-400">—</span>}
                {t && !t.available && t.unavailable_reason && <p className="mt-1 text-xs text-gray-500">{t.unavailable_reason}</p>}
              </td>
              <td className={`${td} hidden md:table-cell`}>{t?.active_variant ? `v${t.active_variant.version}` : "—"}</td>
              <td className={td}>
                {offers.length ? (
                  <>
                    <p className="font-medium text-gray-900">{offers.length}</p>
                    <p className="max-w-[18rem] truncate text-xs text-gray-500" title={offers.map((o) => o.candidate_name).join(", ")}>{offers.map((o) => o.candidate_name).join(", ")}</p>
                  </>
                ) : <span className="text-gray-400">0</span>}
              </td>
            </tr>
          );
        })}
      </Table>
      <p className="mt-3 text-xs text-gray-400">An offer's template follows its type (internship, contract, part-time, full-time with or without open conditions; amendments use the amendment letter). Freelance engagements have no offer letter template yet.</p>
    </div>
  );
}

// ── right-hand detail panel ──────────────────────────────────────────────────────────────────────────────────────────
/** What the offer letter still needs, every prerequisite at once, each with a link to where it is fixed. */
const SETUP_STEPS = ["entity", "signatory", "pack", "template", "clauses"];

function LetterReadiness({ readiness, onSetup }) {
  const steps = readiness?.steps || [];
  const open = steps.filter((st) => !st.ok && !st.automatic).length;
  const automatic = steps.filter((st) => !st.ok && st.automatic).length;
  const automaticSetup = steps.some((st) => !st.ok && st.automatic && SETUP_STEPS.includes(st.key));
  const setupHelps = onSetup && steps.some((st) => !st.ok && !st.automatic && SETUP_STEPS.includes(st.key));
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <p className="text-xs font-medium text-amber-800">
        {open ? `${open} thing${open === 1 ? "" : "s"} to set up before ${readiness.canonical_id || "the letter"} can be generated`
          : automatic ? `${automatic} setup step${automatic === 1 ? "" : "s"} will run when you generate ${readiness.canonical_id || "the letter"}`
            : "Ready to generate"}
      </p>
      <ul className="mt-2 space-y-2">
        {steps.map((st) => (
          <li key={st.key} className="flex gap-2 text-xs">
            {st.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Done" />
              : st.automatic ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-label="Automatic" />
              : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-label="Missing" />}
            <span className="min-w-0">
              <span className="font-medium text-gray-900">{st.label}{st.automatic ? " · Automatic" : ""}</span>
              <span className="block text-gray-600">{st.detail}</span>
              {st.fix && <NavLink to={st.fix.href} className="font-medium text-blue-600 hover:underline">{st.fix.label} →</NavLink>}
            </span>
          </li>
        ))}
      </ul>
      {automaticSetup && readiness.auto_setup_available && (
        <p className="mt-3 text-xs text-blue-900">Generating will activate the unchanged starter wording for this work country. Your generation request is recorded as the organization’s attestation.</p>
      )}
      {setupHelps && (
        <button type="button" onClick={() => onSetup(readiness.work_country || "")}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
          <ShieldCheck className="h-4 w-4" /> Set up offer letters{readiness.work_country ? ` for ${readiness.work_country}` : ""}
        </button>
      )}
    </div>
  );
}

function OfferDetail({ offer: o, detail, tab, onTab, onClose, info, managerName, delivery, approvedByName, onSetup, busy, onPreview, onEdit, onSend, onWithdraw, onAmend }) {
  const st = offerStatus(o);
  const cand = info.cand;
  const mine = detail.id === o.id;
  const doc = mine ? detail.doc : null;
  const timeline = mine ? detail.timeline : [];
  const letter = doc?.letter || null;
  const letterStatus = letter?.status || "";
  const issued = Boolean(doc?.issued_at || o.issued_at);
  // Approval is waived by the organization setting "offer letters without approval": the letter records an
  // approval_waived event, or the offer was approved by the person who prepared it (separation of duties forbids that
  // for a normal approval, so only the automatic waiver path produces it).
  const waived = timeline.some((e) => e.event_type === "approval_waived")
    || Boolean(o.approved_by && o.created_by && o.approved_by === o.created_by);
  const approvedAt = doc?.approved_at || o.approved_at;
  const typeLabel = EMPLOYMENT_TYPES.find((t) => t.value === o.employment_type)?.label;
  const department = info.req?.department || "";
  const location = o.work_location || o.entity_city || info.req?.location || "";
  const components = Array.isArray(o.components) ? o.components.filter((c) => c && c.label) : [];
  const sentAt = delivery?.sent_at || doc?.issued_at || o.issued_at;
  const openedAt = delivery?.opened_at || letter?.viewed_at;

  const closed = CLOSED.includes(o.status);
  const sendReason = issued ? "The letter has already been sent."
    : closed ? `This offer is ${STATUS_LABEL[o.status]?.toLowerCase() || o.status}.`
    : letterStatus === "HUMAN_APPROVED" ? ""
    : letter ? `The letter is ${letterStatus.replace(/_/g, " ").toLowerCase()}; finish its approvals first.`
    : o.status === "approved" ? "Generate the letter first (Preview Offer)."
    : "Approve the offer first (Preview Offer).";

  const events = [
    o.created_at && { at: o.created_at, label: "Offer created" },
    approvedAt && { at: approvedAt, label: waived ? "Offer approved automatically (approval not required)" : "Offer approved" },
    (doc?.accepted_at || o.accepted_at) && { at: doc?.accepted_at || o.accepted_at, label: "Offer accepted" },
    o.status === "rejected" && o.updated_at && { at: o.updated_at, label: `Offer declined${o.decline_reason ? ` — ${o.decline_reason}` : ""}` },
    ...timeline.filter((e) => EVENT_LABEL[e.event_type] || e.event_type).map((e) => ({ at: e.created_at, label: EVENT_LABEL[e.event_type] || e.event_type.replace(/_/g, " ") })),
  ].filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const header = (
    <div>
      <h2 className="text-base font-semibold text-gray-900">Offer Details</h2>
      <div className="mt-3 flex items-center gap-3">
        <Avatar name={o.candidate_name} size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-semibold text-gray-900">{o.candidate_name}</p>
            {o.candidate_id && <StatusPill tone="green">Candidate</StatusPill>}
            <StatusPill tone={st.tone}>{st.label}</StatusPill>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {cand?.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{cand.email}</span>}
            {cand?.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{cand.phone}</span>}
            {!o.candidate_id && <span className="text-amber-600">Not linked to a candidate record</span>}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <DetailPanel title="Offer Details" onClose={onClose} header={header}>
      <UnderlineTabs label="Offer detail sections" value={tab} onChange={onTab} tabs={[
        { value: "overview", label: "Overview" }, { value: "acad", label: "Acad & Exp" }, { value: "notes", label: "Notes" }, { value: "activity", label: "Activity" },
      ]} />
      {mine && detail.error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{detail.error}</p>}

      {tab === "overview" && (
        <div className="mt-4">
          <DetailSection>
            <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Briefcase className="h-5 w-5" /></div>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-gray-900">{o.position}</p>
                <p className="mt-0.5 text-xs text-gray-500">{[info.reqId ? `REQ #${info.reqId}` : null, info.reqTitle && info.reqTitle !== o.position ? info.reqTitle : null, department, typeLabel].filter(Boolean).join(" · ") || "No requisition linked"}</p>
                {(o.entity_name || location) && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500"><MapPin className="h-3 w-3" />{[o.entity_name, location].filter(Boolean).join(" · ")}</p>
                )}
                {managerName && <p className="mt-0.5 text-xs text-gray-500">Reports to {managerName}</p>}
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Compensation Summary" action={!closed && (
            <button type="button" onClick={issued ? onAmend : onEdit} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
              <Edit2 className="h-3.5 w-3.5" />{issued ? "Amend" : "Edit"}
            </button>
          )}>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-gray-200 p-3">
                <p className="text-base font-bold text-gray-900">{o.salary != null ? money(o.salary, o.currency) : "—"}</p>
                <p className="text-xs text-gray-500">{payBasis(o)}</p>
              </div>
              {o.equity && (
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-base font-bold text-gray-900">{o.equity}%</p>
                  <p className="text-xs text-gray-500">Equity</p>
                </div>
              )}
              {components.map((c, i) => (
                <div key={`${c.label}-${i}`} className="rounded-xl border border-gray-200 p-3">
                  <p className="text-base font-bold text-gray-900">{money(c.amount, o.currency)}</p>
                  <p className="text-xs text-gray-500">{c.label}{c.frequency ? ` · ${freqText(c.frequency)}` : ""}</p>
                </div>
              ))}
            </div>
            {o.benefits_summary && <p className="mt-2 text-xs text-gray-500">{o.benefits_summary}</p>}
          </DetailSection>

          {detail?.readiness && !detail.readiness.ready && !(detail?.doc?.letter) && (
            <DetailSection title="Offer letter readiness">
              <LetterReadiness readiness={detail.readiness} onSetup={onSetup} />
            </DetailSection>
          )}
          <DetailSection title="Approval Checklist" action={<button type="button" onClick={onPreview} className="text-xs font-medium text-blue-600 hover:underline">View workflow</button>}>
            {mine && detail.loading && !doc ? <p role="status" className="text-xs text-gray-500">Loading approval status…</p> : (
              <ul className="space-y-3">
                <CheckItem
                  state={waived ? "waived" : approvedAt ? "done" : "pending"}
                  title="Offer approval"
                  sub={waived ? `Approval not required (organization setting)${approvedAt ? ` · ${formatDate(approvedAt)}` : ""}` : approvedAt ? `Approved${approvedByName ? ` by ${approvedByName}` : ""} · ${formatDate(approvedAt)}` : "Pending · someone other than the preparer must approve"} />
                <CheckItem
                  state={letter ? "done" : doc?.selection_blocked ? "blocked" : "pending"}
                  title={`Offer letter${letter?.canonical_id || doc?.template ? ` (${letter?.canonical_id || doc?.template})` : ""}`}
                  sub={letter ? `Generated${letter.created_at ? ` · ${formatDate(letter.created_at)}` : ""}` : doc?.selection_blocked || "Not generated"} />
                {letter && (
                  <CheckItem
                    state={waived ? "waived" : ["HUMAN_APPROVED", "ISSUED", "EXECUTED"].includes(letterStatus) ? "done" : "pending"}
                    title="Letter approval"
                    sub={waived ? "Approval not required (organization setting)" : ["HUMAN_APPROVED", "ISSUED", "EXECUTED"].includes(letterStatus) ? "Approved" : letterStatus.replace(/_/g, " ").toLowerCase()} />
                )}
                <CheckItem state={issued ? "done" : "pending"} title="Sent to candidate" sub={issued ? formatDate(doc?.issued_at || o.issued_at) : "Not sent"} />
              </ul>
            )}
          </DetailSection>

          <DetailSection title="Email Delivery Status">
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-violet-50/70 p-3 text-xs">
              <div>
                <p className="flex items-center gap-1 font-medium text-gray-800"><Mail className="h-3.5 w-3.5 text-violet-600" />Offer sent to candidate</p>
                <p className="mt-0.5 text-gray-500">{sentAt ? `${formatDate(sentAt)} · ${relativeTime(sentAt)}` : "Not sent yet"}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 font-medium text-gray-800"><span className={`h-2 w-2 rounded-full ${openedAt ? "bg-emerald-500" : "bg-gray-300"}`} />Opened</p>
                <p className="mt-0.5 text-gray-500">{openedAt ? `${formatDate(openedAt)} · ${relativeTime(openedAt)}` : "Not opened yet"}</p>
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Quick Actions">
            <div className="flex flex-wrap gap-2">
              <QuickAction icon={Eye} label="Preview Offer" onClick={onPreview} />
              <QuickAction icon={Edit2} label="Edit" onClick={issued ? onAmend : onEdit} disabled={closed}
                title={closed ? "A closed offer cannot be edited." : issued ? "An issued offer is changed by an amendment." : undefined} />
              <QuickAction icon={busy ? Loader2 : Send} label="Send" tone="primary" onClick={onSend} disabled={Boolean(sendReason) || busy} title={sendReason || "Send the approved letter to the candidate"} />
              <QuickAction icon={RefreshCw} label="Resend" disabled
                title={issued ? "Resending is not available: the document engine sends reminders on the signing link automatically." : "Nothing has been sent yet."} />
              <QuickAction icon={X} label="Withdraw" tone="danger" onClick={onWithdraw} disabled={WITHDRAW_BLOCKED.includes(o.status)}
                title={WITHDRAW_BLOCKED.includes(o.status) ? `A ${STATUS_LABEL[o.status]?.toLowerCase()} offer cannot be withdrawn.` : "Request a reviewed withdrawal notice"} />
            </div>
            {sendReason && !closed && <p className="mt-2 text-xs text-gray-500">Send: {sendReason}</p>}
          </DetailSection>
        </div>
      )}

      {tab === "acad" && (
        <div className="mt-4 space-y-3 text-sm">
          {(cand?.experience != null || cand?.location || cand?.resume_link || o.academic_institution || (o.learning_objectives || []).length) ? (
            <dl className="space-y-3">
              {o.academic_institution && <div><dt className="text-xs text-gray-500">Academic institution</dt><dd className="font-medium text-gray-900">{o.academic_institution}</dd></div>}
              {cand?.experience != null && <div><dt className="text-xs text-gray-500">Experience</dt><dd className="font-medium text-gray-900">{cand.experience} year{cand.experience === 1 ? "" : "s"}</dd></div>}
              {cand?.location && <div><dt className="text-xs text-gray-500">Location</dt><dd className="font-medium text-gray-900">{cand.location}</dd></div>}
              {cand?.resume_link && <div><dt className="text-xs text-gray-500">Resume</dt><dd><a href={cand.resume_link} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">Open resume <ExternalLink className="h-3.5 w-3.5" /></a></dd></div>}
              {(o.learning_objectives || []).length > 0 && (
                <div><dt className="text-xs text-gray-500">Learning objectives</dt><dd><ul className="list-disc pl-5 text-gray-800">{o.learning_objectives.map((l, i) => <li key={i}>{l}</li>)}</ul></dd></div>
              )}
            </dl>
          ) : (
            <EmptyState icon={GraduationCap} title="No academic or experience details">
              {o.candidate_id ? "The candidate record has no experience, location or resume yet." : "Link the offer to a candidate to see their details."}
            </EmptyState>
          )}
        </div>
      )}

      {tab === "notes" && (
        <div className="mt-4">
          {o.notes ? <p className="whitespace-pre-wrap text-sm text-gray-700">{o.notes}</p> : (
            <EmptyState icon={StickyNote} title="No notes">{closed ? null : "Add notes with Edit."}</EmptyState>
          )}
          {cand?.notes && (
            <DetailSection title="Candidate notes"><p className="whitespace-pre-wrap text-sm text-gray-700">{cand.notes}</p></DetailSection>
          )}
        </div>
      )}

      {tab === "activity" && (
        <div className="mt-4">
          {mine && detail.loading && <p role="status" className="mb-2 text-xs text-gray-500">Loading activity…</p>}
          {events.length ? (
            <ol className="space-y-3 border-l border-gray-200 pl-4">
              {events.map((e, i) => (
                <li key={`${e.label}-${i}`} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white" />
                  <p className="text-sm text-gray-800">{e.label}</p>
                  <p className="text-xs text-gray-500">{formatDate(e.at)} · {relativeTime(e.at)}</p>
                </li>
              ))}
            </ol>
          ) : <EmptyState icon={ActivityIcon} title="No activity yet" />}
        </div>
      )}
    </DetailPanel>
  );
}
