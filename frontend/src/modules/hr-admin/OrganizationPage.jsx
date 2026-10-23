import { useEffect, useState } from "react";
import {
  Building2,
  CalendarDays,
  Clock3,
  CreditCard,
  Globe2,
  HardDrive,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
} from "lucide-react";
import { organizationIdOf } from "../../service/api";
import { useAuth } from "../../context/AuthContext";
import { getOrganizationDetails } from "../../service/orgAdminService";
import DelinquencyBanner from "../../components/DelinquencyBanner";
import { formatDate } from "../../utils/dateTime";
import { HrAdminLayout } from "./ui";

const cardClass = "rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]";

const STATUS_STYLES = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  approved: "bg-blue-50 text-blue-700 ring-blue-600/15",
  pending: "bg-amber-50 text-amber-700 ring-amber-600/15",
  on_hold: "bg-orange-50 text-orange-700 ring-orange-600/15",
  suspended: "bg-rose-50 text-rose-700 ring-rose-600/15",
  rejected: "bg-rose-50 text-rose-700 ring-rose-600/15",
  deactivated: "bg-slate-100 text-slate-600 ring-slate-500/10",
};

function display(value) {
  if (value === null || value === undefined || value === "") return "Not provided";
  return value;
}

function StatusPill({ value }) {
  const key = String(value || "").toLowerCase();
  const label = key ? key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Not set";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[key] || "bg-slate-100 text-slate-600 ring-slate-500/10"}`}>{label}</span>;
}

function Field({ icon: Icon, label, value, href }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
      {Icon && <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-slate-500 shadow-sm"><Icon className="h-4 w-4" aria-hidden="true" /></span>}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {href && value && value !== "Not provided"
          ? <a className="mt-1 block break-words text-sm font-semibold text-blue-700 hover:text-blue-800" href={href}>{value}</a>
          : <p className="mt-1 break-words text-sm font-semibold text-slate-800">{display(value)}</p>}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, detail, tone }) {
  const toneClasses = {
    blue: "bg-blue-50 text-blue-700",
    teal: "bg-teal-50 text-teal-700",
    violet: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className={`${cardClass} p-4 sm:p-5`}>
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${toneClasses[tone] || toneClasses.blue}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{value ?? "—"}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <section className={`${cardClass} p-5 sm:p-6`}>
      <div className="mb-5">
        <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function HrAdminOrganizationPage() {
  const { user } = useAuth();
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    getOrganizationDetails()
      .then((data) => { if (live) setOrganization(data); })
      .catch((reason) => { if (live) setError(reason?.message || "Organization details could not be loaded."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const header = (
    <HrAdminLayout title="My Organization" subtitle="Organization profile, workforce and account details.">
      {loading ? (
        <div className="space-y-6" role="status" aria-label="Loading organization details">
          <div className={`${cardClass} h-36 animate-pulse bg-slate-100`} />
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className={`${cardClass} h-32 animate-pulse bg-slate-100`} />)}</div>
          <div className={`${cardClass} h-64 animate-pulse bg-slate-100`} />
        </div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          <p className="font-semibold">Organization details are unavailable</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : organization ? (
        <div className="space-y-6">
          <DelinquencyBanner organizationId={organizationIdOf(user)} />

          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0A1128] via-[#10234a] to-[#1d4ed8] p-5 text-white shadow-lg shadow-blue-950/10 sm:p-7" aria-labelledby="organization-title">
            <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-24 h-72 w-72 rounded-full bg-blue-300/20 blur-3xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-5">
              <div className="flex min-w-0 items-center gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Building2 className="h-7 w-7 text-blue-200" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">Organization profile</p>
                  <h2 id="organization-title" className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{organization.name || "Your organization"}</h2>
                  <p className="mt-1 font-mono text-sm text-blue-100/80">{organization.organization_code || organization.org_code || organization.code || "Code not set"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill value={organization.status} />
                <StatusPill value={organization.subscription_status} />
              </div>
            </div>
            <div className="relative mt-6 grid grid-cols-1 gap-3 border-t border-white/15 pt-5 sm:grid-cols-3">
              <div><p className="text-xs text-blue-100/70">Subscription plan</p><p className="mt-1 text-sm font-semibold">{organization.subscription_plan || "Not provided"}</p></div>
              <div><p className="text-xs text-blue-100/70">Industry</p><p className="mt-1 text-sm font-semibold">{organization.industry || "Not provided"}</p></div>
              <div><p className="text-xs text-blue-100/70">Registered</p><p className="mt-1 text-sm font-semibold">{organization.created_at ? formatDate(organization.created_at) : "Not provided"}</p></div>
            </div>
          </section>

          <section aria-label="Organization summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={Users} label="Total employees" value={organization.total_employees?.toLocaleString() ?? "—"} detail="Current workforce" tone="blue" />
            <SummaryCard icon={Users} label="Active employees" value={organization.active_employees?.toLocaleString() ?? "—"} detail="Currently active" tone="teal" />
            <SummaryCard icon={ShieldCheck} label="HR administrators" value={organization.hr_admins?.toLocaleString() ?? "—"} detail="People operations access" tone="violet" />
            <SummaryCard icon={HardDrive} label="User capacity" value={organization.max_users?.toLocaleString() ?? "—"} detail="Maximum organization users" tone="amber" />
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Section title="Organization details" description="Company identity and primary contact information.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field icon={Building2} label="Organization name" value={organization.name} />
                <Field icon={ShieldCheck} label="Organization code" value={organization.organization_code || organization.org_code || organization.code} />
                <Field icon={Users} label="Organization administrator" value={organization.admin_name} />
                <Field icon={Mail} label="Administrator email" value={organization.admin_email} href={organization.admin_email ? `mailto:${organization.admin_email}` : undefined} />
                <Field icon={Phone} label="Administrator phone" value={organization.admin_phone} href={organization.admin_phone ? `tel:${organization.admin_phone}` : undefined} />
                <Field icon={CreditCard} label="Subscription plan" value={organization.subscription_plan} />
              </div>
            </Section>

            <Section title="Location & regional settings" description="The region and formats used for your organization.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field icon={MapPin} label="Address" value={organization.address} />
                <Field icon={MapPin} label="City" value={organization.city} />
                <Field icon={MapPin} label="State or province" value={organization.state} />
                <Field icon={Globe2} label="Country" value={organization.country} />
                <Field icon={Clock3} label="Time zone" value={organization.timezone} />
                <Field icon={CreditCard} label="Currency" value={organization.currency} />
                <Field icon={CalendarDays} label="Registration date" value={organization.created_at ? formatDate(organization.created_at) : undefined} />
              </div>
            </Section>
          </div>
        </div>
      ) : (
        <div className={`${cardClass} p-8 text-center text-sm text-slate-500`}>No organization details are available.</div>
      )}
    </HrAdminLayout>
  );

  return header;
}
