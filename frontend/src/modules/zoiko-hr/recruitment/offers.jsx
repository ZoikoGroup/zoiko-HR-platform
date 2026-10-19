import { useState, useEffect, useCallback, useMemo } from "react";
import { NavLink } from "react-router-dom";
import {
  Plus, Search, ChevronLeft, ChevronRight, X, Edit2, Trash2, AlertCircle, Calendar, User, Send, CheckCircle2, XCircle,
  Undo2, Building2, ChevronDown, Loader2, Wallet, Eye, Download, Mail, Printer,
} from "lucide-react";
import HRPage from "../../../components/HRPage";
import RemunerationFields, { CountrySelect, currencyForCountry, guessCountry, useRegions } from "../../../components/RemunerationFields";
import BusinessLookupFields, { checkBusinessId, checkPostal, useBusinessFormats } from "../../../components/BusinessLookupFields";
import {
  getOffers, createOffer, updateOffer, deleteOffer, acceptOffer, rejectOffer, withdrawOffer, sendOffer, sendOfferWithPDF, getCandidates,
} from "../../../service/hrService";
import { getOrganizationDetails } from "../../../service/orgAdminService";
import { formatDate as formatDateUtil } from "../../../utils/dateTime";
import { EMPLOYMENT_TYPES, DEFAULT_PERIOD, formatMoney, periodSuffix, remunerationFor, remunerationLabel } from "../../../utils/money";
import { OfferLetterTemplate } from "./OfferLetterTemplate";
import pdfMake from "pdfmake/build/pdfmake";
import vfs from "pdfmake/build/vfs_fonts";
pdfMake.vfs = vfs;

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/recruitment" },
  { label: "Job Requisitions", href: "/zoiko-hr/recruitment/job-requisitions" },
  { label: "Candidates", href: "/zoiko-hr/recruitment/candidates" },
  { label: "Interviews", href: "/zoiko-hr/recruitment/interviews" },
  { label: "Offer Management", href: "/zoiko-hr/recruitment/offers" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} to={item.href} end={item.href === "/zoiko-hr/recruitment"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`
          }>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  try { return formatDateUtil(dateStr); } catch { return dateStr; }
}

const STATUS_STYLE = {
  draft: "bg-gray-100 text-gray-800", pending: "bg-yellow-100 text-yellow-800", approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800", accepted: "bg-blue-100 text-blue-800", countered: "bg-purple-100 text-purple-800",
  withdrawn: "bg-gray-100 text-gray-500",
};
const STATUS_LABEL = { draft: "Draft", pending: "Sent", approved: "Approved", rejected: "Declined", accepted: "Accepted", countered: "Countered", withdrawn: "Withdrawn" };
const OPEN_STATUSES = ["pending", "approved", "countered"];
const CLOSED = ["accepted", "rejected", "withdrawn"];

function StatusBadge({ status }) {
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[status] || "bg-gray-100 text-gray-800"}`}>{STATUS_LABEL[status] || status}</span>;
}

const PAGE_SIZE = 10;
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
  equity: "", joining_date: "", status: "draft", notes: "",
  entity: { ...EMPTY_ENTITY },
  entityCountryTouched: false,
});

export default function OfferManagement() {
  const regions = useRegions();
  const businessFormats = useBusinessFormats();
  const orgCurrency = regions?.organization?.currency || "USD";
  const [offers, setOffers] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showEntity, setShowEntity] = useState(false);

  const [orgDetails, setOrgDetails] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewOffer, setPreviewOffer] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      getOffers({ per_page: 100 }),
      getCandidates({ per_page: 100 }).catch(() => ({ items: [] })),
      getOrganizationDetails().catch(() => null),
    ]).then(([d, cands, org]) => {
      setOffers(Array.isArray(d) ? d : d?.items || d?.data || []);
      setCandidates(Array.isArray(cands) ? cands : cands?.items || cands?.data || []);
      setOrgDetails(org || null);
    }).catch((err) => {
      setLoadError(err.message || "Failed to load offers.");
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => offers.filter((o) => {
    const q = search.trim().toLowerCase();
    if (q && !o.candidate_name?.toLowerCase().includes(q) && !o.position?.toLowerCase().includes(q) && !(o.entity_name || "").toLowerCase().includes(q)) return false;
    if (statusFilter && o.status !== statusFilter) return false;
    return true;
  }), [offers, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(() => ({
    draft: offers.filter((o) => o.status === "draft").length,
    open: offers.filter((o) => OPEN_STATUSES.includes(o.status)).length,
    accepted: offers.filter((o) => o.status === "accepted").length,
    declined: offers.filter((o) => o.status === "rejected").length,
  }), [offers]);

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
      status: o.status || "draft",
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
      status: form.status,
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
    setSaving(true);
    try {
      if (editItem) await updateOffer(editItem.id, payload);
      else await createOffer(payload);
      setShowModal(false);
      setNotice(editItem ? "Offer updated." : "Offer created.");
      load();
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
      load();
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

  const companyName = orgDetails?.name || "Zoiko Industries Private Limited";

  // ── offer letter preview / PDF / email ─────────────────────────────────────────────────────
  const openPreview = (o) => {
    setPreviewOffer(o);
    setShowPreview(true);
  };

  const closePreview = () => {
    setShowPreview(false);
    setPreviewOffer(null);
  };

  const buildOfferData = (o) => {
    const org = orgDetails || {};
    const employmentType = o.employment_type || "full_time";
    const amount = o.salary != null ? Number(o.salary) : null;
    return {
      candidateName: o.candidate_name || "Candidate",
      candidateAddress: o.entity_address || "",
      candidateCity: o.entity_city || "",
      candidateCountry: o.entity_country || "",
      position: o.position || "Position",
      department: o.department || "Engineering",
      employmentType,
      joiningDate: o.joining_date ? String(o.joining_date).split("T")[0] : "",
      remunerationType: o.remuneration_type || "salary",
      amount,
      currency: o.currency || "USD",
      payPeriod: o.pay_period || "annual",
      equity: o.equity != null ? Number(o.equity) : null,
      workLocation: o.work_location || org.city || "",
      entityName: o.entity_name || org.name || companyName,
      entityAddress: o.entity_address || org.address || "",
      entityCity: o.entity_city || org.city || "",
      entityRegion: o.entity_region || org.region || "",
      entityPostalCode: o.entity_postal_code || org.postal_code || "",
      entityCountry: o.entity_country || org.country || "",
      notes: o.notes || "",
      companyName: org.name || "Zoiko Industries Private Limited",
      companyAddress: org.address || "Prestige Tech Park, Tower 3",
      companyCity: org.city || "Bangalore",
      companyRegion: org.state || "Karnataka",
      companyPostalCode: org.postal_code || "560103",
      companyCountry: org.country || "India",
      companyWebsite: org.website || "www.zoiko.com",
      date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    };
  };

  const buildDocDefinition = (data) => {
    const employmentLabel = {
      full_time: "Full-time", part_time: "Part-time", contract: "Contract",
      internship: "Internship", freelance: "Freelance",
    }[data.employmentType] || data.employmentType;
    const remunerationDisplay = data.amount != null
      ? new Intl.NumberFormat("en-IN", { style: "currency", currency: data.currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(data.amount)
      : "Not specified";

    return {
      pageSize: "A4",
      pageMargins: [40, 60, 40, 60],
      header: (currentPage, pageCount) => ({
        text: `${data.companyName} - Offer Letter`,
        alignment: "right",
        style: "header",
      }),
      footer: (currentPage, pageCount) => ({
        text: `Page ${currentPage} of ${pageCount}`,
        alignment: "center",
        style: "footer",
      }),
      content: [
        {
          columns: [
            {
              width: "auto",
              stack: [
                {
                  svg: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="30" x="2" y="2" fill="#2563EB" rx="6"/><path d="M12 15L8 11M16 11L12 15M12 15L12 9M12 9L8 5M16 5L12 9" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`,
                  width: 40,
                  height: 40,
                  margin: [0, 0, 20, 0],
                },
                {
                  text: data.companyName,
                  style: "companyName",
                  margin: [0, 4, 0, 0],
                },
              ],
            },
            {
              alignment: "right",
              fontSize: 9,
              color: "#64748b",
              lineHeight: 1.4,
              stack: [
                { text: data.companyName, bold: true, color: "#111827" },
                { text: data.companyAddress },
                { text: `${data.companyCity}, ${data.companyRegion} - ${data.companyPostalCode}` },
                { text: `${data.companyCountry} | ${data.companyWebsite}` },
              ],
            },
          ],
          columnGap: 20,
          margin: [0, 0, 0, 20],
        },
        { text: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), style: "date", margin: [0, 0, 0, 20] },
        {
          columns: [
            {
              width: "auto",
              stack: [
                { text: data.candidateName, style: "candidateName", margin: [0, 0, 0, 4] },
                { text: data.candidateAddress, margin: [0, 0, 0, 2] },
                { text: `${data.candidateCity}, ${data.candidateCountry}` },
              ],
            },
          ],
          columnGap: 20,
          margin: [0, 0, 0, 20],
        },
        { text: `Dear ${data.candidateName.split(" ")[0]},`, style: "salutation", margin: [0, 0, 0, 16] },
        {
          text: `We are pleased to offer you the position of ${data.position} at ${data.companyName}. We believe your skills and potential will be an excellent fit for our team, and we are excited about the possibility of you joining us.`,
          style: "body",
          margin: [0, 0, 0, 16],
        },
        {
          table: {
            widths: ["auto", "*", "*"],
            body: [
              [{ text: "Position", style: "tableLabel" }, { text: data.position, colSpan: 2 }, ""],
              [{ text: "Department", style: "tableLabel" }, { text: data.department, colSpan: 2 }, ""],
              [{ text: "Employment Type", style: "tableLabel" }, { text: employmentLabel, colSpan: 2 }, ""],
              [{ text: "Start Date", style: "tableLabel" }, { text: data.joiningDate || "—", colSpan: 2 }, ""],
              [{ text: "Base " + (data.remunerationType === "stipend" ? "Stipend" : "Salary"), style: "tableLabel" }, { text: remunerationDisplay + " " + (data.payPeriod === "annual" ? "per annum" : data.payPeriod), colSpan: 2 }, ""],
              ...(data.equity != null && data.employmentType !== "internship" ? [[{ text: "Equity", style: "tableLabel" }, { text: `${data.equity}%`, colSpan: 2 }, ""]] : []),
              [{ text: "Work Location", style: "tableLabel" }, { text: data.workLocation || data.companyCity + ", " + data.companyRegion, colSpan: 2 }, ""],
            ],
          },
          layout: "noBorders",
          margin: [0, 0, 0, 24],
        },
        { text: "Benefits & Perks", style: "sectionTitle", margin: [0, 0, 0, 8] },
        {
          columns: [
            { width: 90, stack: [{ image: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIGZpbGw9IiMyNTYzRUIiIHJ4PSI2Ii8+PC9zdmc+", fit: 24 }], margin: [0, 0, 8, 0] },
            { text: "Health Insurance", bold: true, fontSize: 9, color: "#111827" },
            { text: "Group medical cover", fontSize: 8, color: "#64748b" },
          ],
          gap: 8,
        },
        {
          columns: [
            { width: 90, stack: [{ image: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkTTExIDJMMTIgMUMxMSAyIDExIDFMMTIgMloiIHN0cm9rZT0iIzI1NjNFQiIgc3Ryb2tlLXdpZHRoPSIyLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==", fit: 24 }], margin: [0, 0, 8, 0] },
            { text: "Work From Home", bold: true, fontSize: 9, color: "#111827" },
            { text: "Flexible policy", fontSize: 8, color: "#64748b" },
          ],
          gap: 8,
        },
        {
          columns: [
            { width: 90, stack: [{ image: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIGZpbGw9IiMyNTYzRUIiIHJ4PSIzIi8+PC9zdmc+", fit: 24 }], margin: [0, 0, 8, 0] },
            { text: "Learning & Dev", bold: true, fontSize: 9, color: "#111827" },
            { text: "Access to Zoiko Learn", fontSize: 8, color: "#64748b" },
          ],
          gap: 8,
        },
        {
          columns: [
            { width: 90, stack: [{ image: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkTTMgM0wyMSAyMU0yMSAzTDMgMjEiIHN0cm9rZT0iIzI1NjNFQiIgc3Ryb2tlLXdpZHRoPSIyLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==", fit: 24 }], margin: [0, 0, 8, 0] },
            { text: "Meal Allowance", bold: true, fontSize: 9, color: "#111827" },
            { text: "₹2,000 per month", fontSize: 8, color: "#64748b" },
          ],
          gap: 8,
        },
        { text: "", margin: [0, 24, 0, 0] },
        { text: `Dear ${data.candidateName.split(" ")[0]}, This offer is subject to the terms and conditions outlined in the attached Annexures. Please confirm your acceptance by ${data.joiningDate ? new Date(data.joiningDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "30 October 2026"}.`, style: "body", margin: [0, 0, 0, 16] },
        { text: `We look forward to welcoming you to ${data.companyName}!`, style: "body", margin: [0, 0, 0, 24] },
        {
          columns: [
            {
              width: "*",
              stack: [
                { text: "Sincerely,", style: "signatureLabel", margin: [0, 0, 0, 12] },
                { text: "HR Team", style: "signatureName", margin: [0, 0, 0, 2] },
                { text: "Hiring Manager", style: "signatureRole", margin: [0, 0, 0, 2] },
                { text: data.companyName, style: "signatureRole", margin: [0, 0, 0, 0] },
              ],
            },
            {
              width: "*",
              stack: [
                { text: "Accepted and Agreed", style: "signatureLabel", margin: [0, 0, 0, 12] },
                { text: data.candidateName, style: "signatureName", margin: [0, 0, 0, 8] },
                { text: "Date: ____________________", style: "signatureRole", margin: [0, 0, 0, 0] },
              ],
            },
          ],
          columnGap: 40,
          margin: [0, 24, 0, 0],
        },
      ],
      styles: {
        header: { fontSize: 8, color: "#64748b" },
        footer: { fontSize: 8, color: "#64748b" },
        companyName: { fontSize: 20, bold: true, color: "#111827", letterSpacing: -0.5 },
        date: { fontSize: 10, bold: true, color: "#374151" },
        candidateName: { fontSize: 12, bold: true, color: "#111827" },
        salutation: { fontSize: 11, bold: true, color: "#111827" },
        body: { fontSize: 10, color: "#374151", lineHeight: 1.5 },
        tableLabel: { fontSize: 9, bold: true, color: "#6b7280" },
        sectionTitle: { fontSize: 10, bold: true, color: "#111827" },
        signatureLabel: { fontSize: 8, bold: true, color: "#6b7280" },
        signatureName: { fontSize: 14, italic: true, color: "#111827", fontName: "serif" },
        signatureRole: { fontSize: 8, color: "#6b7280" },
      },
    };;
  };

  const generatePdfBlob = async (offer) => {
    const data = buildOfferData(offer);
    const docDefinition = buildDocDefinition(data);
    const pdf = pdfMake.createPdf(docDefinition);
    return await pdf.getBlob();
  };

  const generatePdfBase64 = async (offer) => {
    const data = buildOfferData(offer);
    const docDefinition = buildDocDefinition(data);
    const pdf = pdfMake.createPdf(docDefinition);
    return await pdf.getBase64();
  };


  const generatePdf = async (offer = null) => {
    const target = offer || previewOffer;
    if (!target) return;
    setPdfBusy(true);
    try {
      const blob = await generatePdfBlob(target);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Offer_Letter_${(target.candidate_name || "Candidate").replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation failed", err);
      setActionError("Failed to generate PDF. " + (err.message || ""));
    } finally {
      setPdfBusy(false);
    }
  };

  const handleSendEmail = async (o) => {
    if (!o.candidate_id) {
      setActionError("Cannot email offer: no linked candidate record.");
      return;
    }
    const ok = window.confirm(`Send offer letter to ${o.candidate_name} via email with PDF attachment?`);
    if (!ok) return;
    setBusyId(o.id);
    setActionError(null);
    try {
      const base64 = await generatePdfBase64(o);
      const res = await sendOfferWithPDF(o.id, {
        pdfData: base64,
        pdfFilename: `Offer_Letter_${(o.candidate_name || "Candidate").replace(/\s+/g, "_")}.pdf`,
      });
      setNotice(res?.email_sent ? `Offer emailed to ${o.candidate_name} with PDF attachment.` : "Offer marked as sent.");
      load();
    } catch (err) {
      setActionError(err.message || "Failed to send offer email with attachment.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading && offers.length === 0) {
    return <HRPage title="Offer Management" subtitle="Create and manage job offers"><SubNav /><div className="p-6 text-gray-400">Loading...</div></HRPage>;
  }

  if (loadError && offers.length === 0) {
    return (
      <HRPage title="Offer Management" subtitle="Create and manage job offers"><SubNav />
        <div className="p-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-lg"><AlertCircle className="w-5 h-5" />{loadError}</div>
          <div className="mt-4"><button onClick={load} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Try Again</button></div>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Offer Management" subtitle="Create, send and track job offers">
      <SubNav />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Offers</h1>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> New Offer
          </button>
        </div>

        {actionError && (
          <div className="flex items-center gap-2 break-words rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {actionError}
            <button onClick={() => setActionError(null)} className="ml-auto shrink-0 -m-1 p-1.5"><X className="h-4 w-4" /></button>
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 break-words rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
            <button onClick={() => setNotice(null)} className="ml-auto shrink-0 -m-1 p-1.5"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[["Drafts", stats.draft, "draft"], ["Awaiting answer", stats.open, "pending"], ["Accepted", stats.accepted, "accepted"], ["Declined", stats.declined, "rejected"]].map(([label, n, s]) => (
            <button key={label} onClick={() => { setStatusFilter(statusFilter === s ? "" : s); setPage(1); }}
              className={`min-w-0 rounded-xl border p-3 sm:p-4 text-left transition-colors ${statusFilter === s ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
              <div className="truncate text-xs font-medium text-gray-500">{label}</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{n}</div>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-full sm:flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search candidate, position, entity..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-full sm:w-auto px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[640px] md:min-w-[960px] text-left">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                {["Candidate", "Position", "Remuneration", "Equity", "Status", "Start date", "Created", ""].map((h) => (
                  <th key={h} className={`px-3 py-3 font-medium whitespace-nowrap ${h === "Equity" || h === "Start date" || h === "Created" ? "hidden md:table-cell" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((o) => {
                const busy = busyId === o.id;
                const typeLabel = EMPLOYMENT_TYPES.find((t) => t.value === o.employment_type)?.label;
                return (
                  <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm align-top">
                    <td className="px-3 py-3 font-medium text-gray-900 min-w-[10rem] max-w-[260px]">
                      <div className="flex min-w-0 items-center gap-1.5 break-words" title={o.candidate_id ? "Linked to candidate record" : "Not linked to a candidate — accepting won't start onboarding and the offer can't be emailed"}>
                        <User className="w-3.5 h-3.5 shrink-0 text-gray-400" />{o.candidate_name || "-"}
                        {!o.candidate_id && <span className="text-amber-500 text-xs">⚠</span>}
                      </div>
                      {o.entity_name && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 break-all text-xs text-gray-400" title={[o.entity_address, o.entity_city, o.entity_region, o.entity_postal_code].filter(Boolean).join(", ")}>
                          <Building2 className="h-3 w-3 shrink-0" />{o.entity_name}
                          {o.entity_tax_id && <span className="font-mono">· {(businessFormats?.countries?.[o.entity_country]?.ids?.find((t) => t.key === o.entity_id_type)?.label) || "ID"} {o.entity_tax_id}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-600 min-w-[8rem] break-words">
                      {o.position || "-"}
                      {typeLabel && <div className="text-xs text-gray-400">{typeLabel}</div>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-medium text-gray-900">
                        <Wallet className="w-3.5 h-3.5 shrink-0 text-green-500" />
                        {o.salary != null ? <>{formatMoney(o.salary, o.currency || orgCurrency)}<span className="text-xs font-normal text-gray-400">{periodSuffix(o.pay_period)}</span></> : "-"}
                      </div>
                      <div className="text-xs text-gray-400">{remunerationLabel(o.remuneration_type)}{o.currency ? ` · ${o.currency}` : ""}</div>
                    </td>
                    <td className="hidden md:table-cell px-3 py-3 text-gray-500">{o.equity ? `${o.equity}%` : "-"}</td>
                    <td className="px-3 py-3"><StatusBadge status={o.status} /></td>
                    <td className="hidden md:table-cell px-3 py-3 text-xs text-gray-500 whitespace-nowrap"><div className="flex items-center gap-1.5"><Calendar className="w-3 h-3" />{formatDate(o.joining_date)}</div></td>
                    <td className="hidden md:table-cell px-3 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(o.created_at)}</td>
                    <td className="px-3 py-3 min-w-[10rem]">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                        {o.status === "draft" && (
                          <button disabled={busy} title={o.candidate_id ? "Email the offer to the candidate" : "Mark as sent (no linked candidate to email)"}
                            onClick={() => runAction(o, sendOffer, { ok: (r) => r?.email_sent ? `Offer emailed to ${o.candidate_name}.` : "Offer marked as sent." })}
                            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50">
                            <Send className="h-3.5 w-3.5" /> Send
                          </button>
                        )}
                        {OPEN_STATUSES.includes(o.status) && (
                          <>
                            <button disabled={busy} onClick={() => runAction(o, acceptOffer, { confirm: `Record that ${o.candidate_name} accepted this offer? This marks them hired and starts onboarding.`, ok: "Offer accepted. Onboarding has started." })}
                              className="flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-800 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Accepted</button>
                            <button disabled={busy} onClick={() => runAction(o, rejectOffer, { confirm: `Record that ${o.candidate_name} declined this offer?`, ok: "Offer marked as declined." })}
                              className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Declined</button>
                          </>
                        )}
                        {!CLOSED.includes(o.status) && (
                          <button disabled={busy} onClick={() => runAction(o, withdrawOffer, { confirm: "Withdraw this offer?", ok: "Offer withdrawn." })}
                            className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"><Undo2 className="h-3.5 w-3.5" /> Withdraw</button>
                        )}
                        {!CLOSED.includes(o.status) && <button title="Edit" onClick={() => openEdit(o)} className="-m-1 p-1.5 text-gray-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>}
                        <button title="Preview Offer Letter" onClick={() => openPreview(o)} className="-m-1 p-1.5 text-gray-400 hover:text-blue-600"><Eye className="w-4 h-4" /></button>
                        <button title="Download PDF" onClick={() => generatePdf(o)} disabled={pdfBusy} className="-m-1 p-1.5 text-gray-400 hover:text-green-600"><Download className="w-4 h-4" /></button>
                        <button title="Delete" disabled={busy} onClick={() => runAction(o, deleteOffer, { confirm: "Delete this offer permanently?", ok: "Offer deleted." })} className="-m-1 p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">No offers found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-gray-500">{filtered.length} offer(s)</span>
          <div className="flex items-center gap-2">
            <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-gray-700 font-medium">Page {safePage} of {totalPages}</span>
            <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
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
                    <input type="number" step="0.01" min="0" max="100" value={form.equity} onChange={(e) => setForm({ ...form, equity: e.target.value })} className={field} placeholder="0.5" />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Start date</label>
                  <input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={field}>
                    <option value="draft">Draft</option>
                    <option value="pending">Sent (awaiting answer)</option>
                    {editItem && <option value="approved">Approved</option>}
                    {editItem && <option value="countered">Countered</option>}
                  </select>
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
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}{editItem ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offer Letter Preview Modal */}
      {showPreview && previewOffer && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 sm:p-6">
          <div className="flex max-h-[95vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Offer Letter — {previewOffer.candidate_name}</h2>
              <div className="flex gap-2">
                <button
                  onClick={generatePdf}
                  disabled={pdfBusy}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                >
                  {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download PDF
                </button>
                <button
                  onClick={() => handleSendEmail(previewOffer)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium disabled:opacity-50"
                  disabled={!previewOffer.candidate_id}
                >
                  <Mail className="w-4 h-4" /> Send Email
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium"
                >
                  <Printer className="w-4 h-4" /> Print
                </button>
                <button onClick={closePreview} className="-m-1.5 p-1.5 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 sm:p-8">
              <OfferLetterTemplate
                candidateName={previewOffer.candidate_name || ""}
                position={previewOffer.position || ""}
                department={previewOffer.department || "Engineering"}
                employmentType={previewOffer.employment_type || "full_time"}
                joiningDate={previewOffer.joining_date ? String(previewOffer.joining_date).split("T")[0] : ""}
                remunerationType={previewOffer.remuneration_type || "salary"}
                amount={previewOffer.salary != null ? Number(previewOffer.salary) : null}
                currency={previewOffer.currency || "USD"}
                payPeriod={previewOffer.pay_period || "annual"}
                equity={previewOffer.equity != null ? Number(previewOffer.equity) : null}
                workLocation={previewOffer.work_location || ""}
                entityName={previewOffer.entity_name || companyName}
                entityAddress={previewOffer.entity_address || ""}
                entityCity={previewOffer.entity_city || ""}
                entityRegion={previewOffer.entity_region || ""}
                entityPostalCode={previewOffer.entity_postal_code || ""}
                entityCountry={previewOffer.entity_country || ""}
                notes={previewOffer.notes || ""}
                companyName={orgDetails?.name || "Zoiko Industries Private Limited"}
                companyAddress={orgDetails?.address || "Prestige Tech Park, Tower 3"}
                companyCity={orgDetails?.city || "Bangalore"}
                companyRegion={orgDetails?.state || "Karnataka"}
                companyPostalCode={orgDetails?.postal_code || "560103"}
                companyCountry={orgDetails?.country || "India"}
                companyWebsite={orgDetails?.website || "www.zoiko.com"}
              />
            </div>
          </div>
        </div>
      )}
    </HRPage>
  );
}
