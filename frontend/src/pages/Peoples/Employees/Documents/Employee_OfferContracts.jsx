import { useEffect, useMemo, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import DocumentPreviewModal from "../../../../components/DocumentPreviewModal";
import DocumentRow from "../../../../components/documents/DocumentRow";
import DocumentEmptyState from "../../../../components/documents/DocumentEmptyState";
import DocumentErrorState from "../../../../components/documents/DocumentErrorState";
import { getDocuments } from "../../../../service/employee";
import { FileSignature, MessageSquare } from "lucide-react";
import { useDocumentFile } from "../../../../hooks/useDocumentFile";

const typeColor = {
  Offer: { color: "#1D4ED8", bg: "#EFF6FF" },
  Contract: { color: "#059669", bg: "#ECFDF5" },
  Legal: { color: "#DC2626", bg: "#FEF2F2" },
  Appraisal: { color: "#D97706", bg: "#FFFBEB" },
  Other: { color: "#64748B", bg: "#F8FAFC" },
};

function normalizeType(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("offer")) return "Offer";
  if (t.includes("contract")) return "Contract";
  if (t.includes("nda") || t.includes("legal") || t.includes("agreement")) return "Legal";
  if (t.includes("appraisal")) return "Appraisal";
  return "Other";
}

export default function OfferContracts() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [docs, setDocs] = useState([]);
  const { preview, busyId, busyAction, fileError, view, download, closePreview, downloadFromPreview } = useDocumentFile();

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // category "employee" is deliberate here (not "contract") — must stay in
        // sync with the TABS mapping in organization-admin/EmployeeDocumentsPage.jsx.
        const res = await getDocuments({ category: "employee" });
        const data = res?.data || res?.items || res?.data?.items || [];
        if (!mounted) return;

        const arr = Array.isArray(data) ? data : [];
        const filtered = arr.filter((d) => {
          const title = String(d.title || d.name || "");
          const docType = String(d.document_type || d.type || "");
          const blob = `${title} ${docType}`.toLowerCase();
          return (
            blob.includes("offer") ||
            blob.includes("contract") ||
            blob.includes("nda") ||
            blob.includes("agreement") ||
            blob.includes("appraisal")
          );
        });

        setDocs(filtered);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load contracts");
        setDocs([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const items = useMemo(() => {
    return docs
      .map((d) => {
        const title = d.title || d.name || d.document_type || d.id;
        const type = normalizeType(d.document_type || d.type || d.category || "");
        const size = d.size || "";
        const date = d.created_at || d.uploaded_at || d.updated_at || d.expiry_date || "";
        return { id: d.id, name: title, type, date, size, raw: d };
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [docs]);

  return (
    <EmployeePageShell title="Offer & Contracts" subtitle="Your employment agreements, offer letters, and legal documents.">
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-doc-primary" />
          <span className="ml-3 text-doc-ink-soft dark:text-[#94a3b8]">Loading contracts...</span>
        </div>
      )}

      {!loading && (
        <div className="space-y-3 mb-4">
          <DocumentErrorState message={error} />
          <DocumentErrorState message={fileError} />
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-3">
          {items.length === 0 ? (
            <DocumentEmptyState icon={FileSignature} title="No offer/contracts found" message="Offer letters and contracts assigned to you will appear here." />
          ) : (
            items.map((d) => {
              const colors = typeColor[d.type] || typeColor.Other;
              const raw = d.raw || {};
              return (
                <DocumentRow
                  key={d.id || d.name}
                  icon={FileSignature}
                  iconTone={{ bg: colors.bg, color: colors.color }}
                  title={d.name}
                  status={raw.status}
                  categoryBadge={{ label: d.type, color: colors.color, bg: colors.bg }}
                  meta={[d.date ? String(d.date).slice(0, 10) : null, d.size].filter(Boolean).join(" · ")}
                  onView={() => view(d.id)}
                  onDownload={() => download(d.id)}
                  busy={busyId === d.id}
                  busyAction={busyAction}
                  extra={
                    (raw.admin_feedback || raw.rejection_reason) ? (
                      <div className="flex items-start gap-1.5 bg-doc-surface-soft dark:bg-[#0f172a] border border-doc-border dark:border-[#334155] rounded-lg px-3 py-2">
                        <MessageSquare className="w-3.5 h-3.5 text-doc-ink-soft dark:text-[#64748b] shrink-0 mt-0.5" />
                        <p className="text-xs text-doc-ink-soft dark:text-[#94a3b8]"><strong>Admin feedback:</strong> {raw.admin_feedback || raw.rejection_reason}</p>
                      </div>
                    ) : null
                  }
                />
              );
            })
          )}
        </div>
      )}
      <DocumentPreviewModal preview={preview} onClose={closePreview} onDownload={downloadFromPreview} />
    </EmployeePageShell>
  );
}
