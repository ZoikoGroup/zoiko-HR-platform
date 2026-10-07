// Upload Document form: the same rules as the server (backend/app/modules/hr/router.py), so each message
// appears next to its own field whether the browser or the server catches the problem.
export const MAX_FILE_MB = 10;
export const ALLOWED_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".tsv", ".txt",
  ".rtf", ".odt", ".ods", ".odp", ".ppt", ".pptx",
];

export const CATEGORIES = [
  { value: "id_proof", label: "ID Proof" },
  { value: "offer_letter", label: "Offer Letter" },
  { value: "nda", label: "NDA" },
  { value: "education_certificates", label: "Education Certificates" },
  { value: "experience_letters", label: "Experience Letters" },
  { value: "bank_details", label: "Bank Details" },
  { value: "other", label: "Other" },
];

export function extensionOf(name) {
  const m = /\.[^./\\]+$/.exec(String(name ?? ""));
  return m ? m[0].toLowerCase() : "";
}

export function fileSizeText(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** { field: message } for everything wrong with the form; empty when it can be uploaded. */
export function validateUploadForm(form) {
  const errors = {};
  const title = String(form.title ?? "").trim().replace(/\s+/g, " ");
  if (!title) errors.title = "Title is required.";
  else if (title.length > 200) errors.title = "Title can be at most 200 characters.";

  if (!form.category) errors.category = "Category is required.";
  else if (!CATEGORIES.some((c) => c.value === form.category)) errors.category = "Choose one of the listed categories.";

  const file = form.file;
  if (!file) errors.file = "Choose a file to upload.";
  else if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) {
    errors.file = `${extensionOf(file.name) || "This"} file type is not allowed. Use a PDF, image, Word, Excel, PowerPoint or text file.`;
  } else if (file.size === 0) errors.file = "The selected file is empty.";
  else if (file.size > MAX_FILE_MB * 1024 * 1024) errors.file = `The file is ${fileSizeText(file.size)}. The maximum size is ${MAX_FILE_MB} MB.`;
  return errors;
}

/** The server's refusal as { field: message }; the messages it writes for people are kept as they are. */
export function serverUploadErrors(detail) {
  const out = {};
  if (!Array.isArray(detail)) return out;
  const labels = { title: "Title", category: "Category", file: "File", onboarding_record_id: "Onboarding record" };
  for (const item of detail) {
    const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
    if (typeof field !== "string" || out[field]) continue;
    const msg = typeof item?.msg === "string" ? item.msg : "";
    if (/^value error,\s*/i.test(msg)) out[field] = msg.replace(/^value error,\s*/i, "");
    else if (/^field required$/i.test(msg)) out[field] = `${labels[field] || field} is required.`;
    else out[field] = `${labels[field] || field} is not valid.`;
  }
  return out;
}
