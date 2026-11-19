// The organisation's document request (upload) categories (Onboarding › Settings › Documents requested from new hires).
import { useEffect, useState } from "react";
import { getRequestCategories } from "../service/docsSetupService";

export const DEFAULT_REQUEST_CATEGORIES = [
  { value: "id_proof", label: "ID proof" },
  { value: "education_certificates", label: "Education certificates" },
  { value: "experience_letters", label: "Experience letters" },
  { value: "bank_details", label: "Bank details" },
  { value: "other", label: "Other" },
];

/**
 * { active, all }: the active categories (what can be requested now) and every category (labels for documents uploaded
 * under one that was switched off later), as { value, label, description, accepted_types, max_size_mb }.
 * Falls back to the five standard categories while loading or when the list cannot be read.
 */
export function useRequestCategories() {
  const [state, setState] = useState({ active: DEFAULT_REQUEST_CATEGORIES, all: DEFAULT_REQUEST_CATEGORIES });
  useEffect(() => {
    let live = true;
    getRequestCategories()
      .then((v) => {
        if (!live || !v?.categories) return;
        const all = v.categories.map((c) => ({ value: c.key, label: c.label, description: c.description, accepted_types: c.accepted_types,
          max_size_mb: c.max_size_mb, active: c.active }));
        setState({ active: all.filter((c) => c.active), all });
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return state;
}
