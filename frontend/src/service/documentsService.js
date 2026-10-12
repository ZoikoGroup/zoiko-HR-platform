import { api, getAccessToken, refreshSession, API_BASE_URL } from "./api";
import { saveBlobAs } from "../utils/documents";

// Super Admin document repository (ZHR-27/28). Talks to /super-admin/documents.
// There is deliberately no mock/fallback data here: a failed call must surface.

export const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "rtf", "odt", "png", "jpg", "jpeg", "gif"];
export const MAX_FILE_SIZE_MB = 10;

export function validateFile(file) {
  if (!file) return "Choose a file to upload.";
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return `“.${ext}” files are not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`;
  if (file.size === 0) return "The file is empty.";
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) return `File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`;
  return null;
}

export const getOrganizations = () => api.get("/super-admin/documents/organizations");

export const getDocuments = (params, signal) => api.get("/super-admin/documents", { params, signal });

export const deleteDocument = (id) => api.delete(`/super-admin/documents/${id}`);

/** multipart upload with progress (fetch cannot report upload progress). */
export function uploadDocument({ file, organization_id, title, description, category }, onProgress, allowRetry = true) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("organization_id", String(organization_id));
    if (title) form.append("title", title);
    if (description) form.append("description", description);
    if (category) form.append("category", category);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/super-admin/documents`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading. Please try again."));
    xhr.onload = async () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body);
      // The access token can expire mid-session; refresh once and retry the upload.
      if (xhr.status === 401 && allowRetry) {
        const refreshed = await refreshSession();
        if (refreshed) {
          return uploadDocument({ file, organization_id, title, description, category }, onProgress, false).then(resolve, reject);
        }
      }
      let detail = body?.message || body?.detail;
      if (Array.isArray(detail)) detail = detail.map((d) => d.msg || String(d)).join(", ");
      reject(new Error(detail || `Upload failed (${xhr.status}).`));
    };
    xhr.send(form);
  });
}

/** Filename from Content-Disposition, supporting RFC 5987 (filename*=UTF-8''...). */
export function filenameFromDisposition(header, fallback) {
  if (!header) return fallback;
  const star = header.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/);
  return plain ? plain[1] : fallback;
}

/** Authenticated download -> browser save-as with the original filename. */
export async function downloadDocument(doc) {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}/super-admin/documents/${doc.id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let msg = `Download failed (${res.status}).`;
    try {
      const body = await res.json();
      msg = body?.message || body?.detail || msg;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const name = filenameFromDisposition(res.headers.get("Content-Disposition"), doc.file_name || `document-${doc.id}`);
  saveBlobAs(blob, name); // creates and revokes the object URL
  return name;
}
