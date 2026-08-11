import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import PageHeader from "../../components/PageHeader";
import { getOrganizationDetails } from "../../service/orgAdminService";
import { Building, Calendar, Shield, MapPin, Globe, Clock, BadgeDollarSign, HardDrive, Users, Coins, Briefcase, User, Phone, Mail, FileText } from "lucide-react";

const statusColors = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  on_hold: "bg-orange-50 text-orange-700 border-orange-200",
  suspended: "bg-red-50 text-red-700 border-red-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  deactivated: "bg-slate-50 text-slate-700 border-slate-200",
};

export default function HrAdminOrganizationPage() {
  const { user } = useAuth();
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getOrganizationDetails()
      .then(setOrg)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="My Organization" description="Loading..." />
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-400">Loading organization details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 font-sans">
        <PageHeader title="My Organization" description="Error loading data" />
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  const statusClass = statusColors[org.status] || "bg-slate-50 text-slate-700 border-slate-200";
  const subStatusClass = statusColors[org.subscription_status] || "bg-slate-50 text-slate-700 border-slate-200";

  const infoRows = [
    { label: "Organization Name", value: org.name },
    { label: "Organization Code", value: org.code },
    { label: "Organization Admin", value: org.admin_name || "—", icon: User },
    { label: "Admin Email", value: org.admin_email || "—", icon: Mail },
    { label: "Organization Status", value: (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${statusClass}`}>
        {org.status?.charAt(0).toUpperCase() + org.status?.slice(1) || "—"}
      </span>
    )},
    { label: "Subscription Plan", value: org.subscription_plan || "Free" },
    { label: "Subscription Status", value: (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${subStatusClass}`}>
        {org.subscription_status?.charAt(0).toUpperCase() + org.subscription_status?.slice(1) || "Active"}
      </span>
    )},
    { label: "Max Users", value: org.max_users ?? "—" },
    { label: "Registration Date", value: org.created_at ? new Date(org.created_at).toLocaleDateString() : "—" },
    { label: "Industry", value: org.industry || "—" },
    { label: "Admin Phone", value: org.admin_phone || "—", icon: Phone },
    { label: "Address", value: org.address || "—" },
    { label: "City", value: org.city || "—" },
    { label: "State", value: org.state || "—" },
    { label: "Country", value: org.country || "—" },
    { label: "Timezone", value: org.timezone || "UTC" },
    { label: "Currency", value: org.currency || "USD" },
    { label: "Total Employees", value: org.total_employees?.toLocaleString() || "0" },
    { label: "Active Employees", value: org.active_employees?.toLocaleString() || "0" },
    { label: "HR Admins", value: org.hr_admins?.toLocaleString() || "0" },
  ];

  return (
    <div className="space-y-6 font-sans">
      <PageHeader title="My Organization" description="View your organization details." />

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-16 w-16 bg-[#FF7A00]/10 rounded-2xl flex items-center justify-center">
            <Building className="h-8 w-8 text-[#FF7A00]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{org.name}</h2>
            <span className="text-xs text-slate-400 font-mono">{org.code}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          {infoRows.map((row) => (
            <div key={row.label} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <span className="text-slate-400 block text-xs font-medium mb-1">{row.label}</span>
              <span className="font-semibold text-slate-700">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}