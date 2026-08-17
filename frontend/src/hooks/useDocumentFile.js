import { useState, useCallback } from "react";
import { getDocumentFile } from "../service/hrService";
import { saveBlobAs } from "../utils/documents";

/**
 * Standardizes fetching a document's file for View (in-page preview) and
 * Download across the document management pages. Every consumer used to
 * hand-roll this (and several built dead links off `file_url`, which points
 * at a static file mount that was never registered on the backend) — this
 * is the one path that actually works: an authenticated fetch against
 * /hr/documents/{id}/file, since that route requires a Bearer token a plain
 * <a href>/<iframe src> can't attach.
 */
export function useDocumentFile() {
  const [preview, setPreview] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [fileError, setFileError] = useState(null);

  // `key` identifies the busy row (usually the document id, but callers
  // fetching a specific historical version pass a distinct key since a
  // version isn't addressed by document id alone). `fetcher` defaults to
  // fetching the document's current file; pass e.g. `() =>
  // getDocumentVersionFile(documentId, versionId)` to fetch a version instead.
  const view = useCallback(async (key, fetcher = () => getDocumentFile(key)) => {
    setFileError(null);
    setBusyId(key);
    setBusyAction("view");
    try {
      const { blob, filename } = await fetcher();
      const url = URL.createObjectURL(blob);
      setPreview({ url, filename, mimeType: blob.type, blob });
    } catch (e) {
      setFileError(e?.message || "Failed to open document");
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }, []);

  const download = useCallback(async (key, fetcher = () => getDocumentFile(key)) => {
    setFileError(null);
    setBusyId(key);
    setBusyAction("download");
    try {
      const { blob, filename } = await fetcher();
      saveBlobAs(blob, filename);
    } catch (e) {
      setFileError(e?.message || "Failed to download document");
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }, []);

  const closePreview = useCallback(() => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }, [preview]);

  const downloadFromPreview = useCallback(() => {
    if (preview) saveBlobAs(preview.blob, preview.filename);
  }, [preview]);

  return { preview, busyId, busyAction, fileError, view, download, closePreview, downloadFromPreview };
}
