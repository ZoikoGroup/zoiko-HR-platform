// Legal approval of an organization template version (the organization's attestation; counsel details for L3).
import { useEffect, useState } from "react";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Modal } from "../../../../../components/billing-ui";
import { ErrorBanner, Labeled, btnIcon, btnPrimary, btnSecondary, btnSmall, errorMessage, inputClass } from "./ui";

const EMPTY = {
  attestation_accepted: false, signed_name: "", reviewer_role: "", qualification_statement: "", conditions: "",
  counsel_name: "", counsel_firm: "", counsel_qualification: "", review_date: "",
};

export default function ApproveVariantModal({ open, onClose, onApprove, variant, country, legalRisk, expectedName }) {
  const [form, setForm] = useState(EMPTY);
  const [sources, setSources] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) { setForm(EMPTY); setSources([]); setError(""); }
  }, [open]);

  const isL3 = legalRisk === "L3";
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const counselMissing = isL3 && ["counsel_name", "counsel_firm", "counsel_qualification", "review_date"].some((k) => !form[k].trim());
  const canSubmit = form.attestation_accepted && form.signed_name.trim() && !counselMissing && !busy;

  const submit = async () => {
    setBusy(true); setError("");
    const body = { attestation_accepted: true, signed_name: form.signed_name.trim(),
      sources: sources.filter((s) => s.title.trim() || s.url.trim()) };
    ["reviewer_role", "qualification_statement", "conditions", "counsel_name", "counsel_firm", "counsel_qualification", "review_date"]
      .forEach((k) => { if (form[k].trim()) body[k] = form[k].trim(); });
    try {
      await onApprove(body);
    } catch (e) {
      const missing = Array.isArray(e?.detail?.missing) ? ` Missing: ${e.detail.missing.join(", ")}.` : "";
      setError(errorMessage(e) + missing);
    } finally {
      setBusy(false);
    }
  };

  const attestation = `We have reviewed this template for use in ${country || "this jurisdiction"} and accept responsibility for its content.`;

  return (
    <Modal open={open} onClose={onClose} size="lg" icon={ShieldCheck} title={`Approve version ${variant?.version ?? ""}`}
      description="Legal approval is recorded in the approval register with your typed name."
      footer={<>
        <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} disabled={!canSubmit} onClick={submit}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Approve
        </button>
      </>}>
      <ErrorBanner error={error} />
      <div className="space-y-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <label className="flex items-start gap-3 text-sm text-blue-900">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={form.attestation_accepted} onChange={set("attestation_accepted")} />
            <span>{attestation}</span>
          </label>
        </div>

        <Labeled id="appr-name" label="Your full name" required
          hint={expectedName ? `Type your name exactly as on your profile: ${expectedName}` : "Type your full name exactly as on your profile."}>
          <input id="appr-name" className={inputClass} value={form.signed_name} onChange={set("signed_name")} autoComplete="name" />
        </Labeled>

        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled id="appr-role" label="Your role (optional)">
            <input id="appr-role" className={inputClass} value={form.reviewer_role} onChange={set("reviewer_role")} />
          </Labeled>
          <Labeled id="appr-qual" label="Qualification statement (optional)">
            <input id="appr-qual" className={inputClass} value={form.qualification_statement} onChange={set("qualification_statement")} />
          </Labeled>
        </div>
        <Labeled id="appr-cond" label="Conditions of approval (optional)">
          <textarea id="appr-cond" rows={2} className={inputClass} value={form.conditions} onChange={set("conditions")} />
        </Labeled>

        {isL3 && (
          <fieldset className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <legend className="px-1 text-sm font-semibold text-amber-900">Legal counsel (required for high-risk L3 templates)</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled id="appr-cn" label="Counsel name" required>
                <input id="appr-cn" className={inputClass} value={form.counsel_name} onChange={set("counsel_name")} />
              </Labeled>
              <Labeled id="appr-cf" label="Counsel firm" required>
                <input id="appr-cf" className={inputClass} value={form.counsel_firm} onChange={set("counsel_firm")} />
              </Labeled>
              <Labeled id="appr-cq" label="Counsel qualification" required>
                <input id="appr-cq" className={inputClass} value={form.counsel_qualification} onChange={set("counsel_qualification")} />
              </Labeled>
              <Labeled id="appr-rd" label="Review date" required>
                <input id="appr-rd" type="date" className={inputClass} value={form.review_date} onChange={set("review_date")} />
              </Labeled>
            </div>
          </fieldset>
        )}

        <fieldset>
          <legend className="mb-1 text-xs font-semibold text-gray-600">Sources reviewed (optional)</legend>
          <ul className="space-y-2">
            {sources.map((s, i) => (
              <li key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_9rem_auto]">
                <Labeled id={`src-t-${i}`} label="Title">
                  <input id={`src-t-${i}`} className={inputClass} value={s.title}
                    onChange={(e) => setSources((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                </Labeled>
                <Labeled id={`src-u-${i}`} label="URL">
                  <input id={`src-u-${i}`} type="url" className={inputClass} value={s.url}
                    onChange={(e) => setSources((l) => l.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                </Labeled>
                <Labeled id={`src-d-${i}`} label="Retrieved on">
                  <input id={`src-d-${i}`} type="date" className={inputClass} value={s.retrieved_on}
                    onChange={(e) => setSources((l) => l.map((x, j) => (j === i ? { ...x, retrieved_on: e.target.value } : x)))} />
                </Labeled>
                <button type="button" className={`${btnIcon} mb-1`} aria-label={`Remove source ${i + 1}`}
                  onClick={() => setSources((l) => l.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={`${btnSmall} mt-2`}
            onClick={() => setSources((l) => [...l, { title: "", url: "", retrieved_on: new Date().toISOString().slice(0, 10) }])}>
            <Plus className="h-3.5 w-3.5" /> Add source
          </button>
        </fieldset>
      </div>
    </Modal>
  );
}
