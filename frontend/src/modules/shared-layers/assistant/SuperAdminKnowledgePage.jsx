import React, { useEffect, useState } from "react";
import PageHeader from "../../../components/PageHeader";
import { getOrganizations } from "../../../service/documentsService";
import { setAdminOrganization } from "../../../service/assistantService";
import { SuperAdminOnly, ErrorNote, inputCls } from "../integrationsUi";
import AdminKnowledgePage from "./AdminKnowledgePage";

/**
 * Assistant Knowledge for a Super Admin (ZHR-33). The knowledge base is kept per
 * organization, so the Super Admin first chooses which organization's assistant
 * to manage; the existing knowledge page then works against that organization.
 */
export default function SuperAdminKnowledgePage() {
  const [orgs, setOrgs] = useState(null);
  const [error, setError] = useState("");
  const [orgId, setOrgId] = useState("");

  useEffect(() => {
    getOrganizations()
      .then((r) => setOrgs(r.organizations || []))
      .catch((e) => { setError(e?.message || "Failed to load organizations."); setOrgs([]); });
    return () => setAdminOrganization(null);
  }, []);

  function choose(value) {
    setAdminOrganization(value ? Number(value) : null); // before the page below mounts and fetches
    setOrgId(value);
  }

  return (
    <SuperAdminOnly>
      <div className="space-y-6 font-sans">
        <PageHeader
          title="Assistant Knowledge"
          description="Manage the knowledge the HR assistant answers from. Each organization has its own knowledge base."
        />
        <ErrorNote message={error} />
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label htmlFor="kb-org" className="text-sm font-semibold text-slate-700">Organization</label>
          <select id="kb-org" className={`${inputCls} max-w-xs`} value={orgId} onChange={(e) => choose(e.target.value)} disabled={orgs === null}>
            <option value="">Select an organization…</option>
            {(orgs || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        {orgId ? (
          <AdminKnowledgePage key={orgId} />
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            {orgs && orgs.length === 0 ? "There are no organizations yet." : "Choose an organization to view and manage its assistant knowledge."}
          </p>
        )}
      </div>
    </SuperAdminOnly>
  );
}
