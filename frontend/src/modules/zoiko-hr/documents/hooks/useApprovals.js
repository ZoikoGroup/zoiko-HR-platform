/** Approval Workflow data (docs/new_docs/ZHR-DOCS-ARCH-001 §7.3, §9.6). */
import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../../../../service/queryKeys";
import {
  acquireReviewLock, approveDocumentVersion, bulkApproveDocuments, getApprovalSummary, listApprovals, listDocumentAudit,
  rejectDocumentVersion, releaseReviewLock, requestDocumentReupload,
} from "../../../../service/documentsService";
import { invalidateAfterDecision } from "./invalidation";

export function useApprovalSummary() {
  return useQuery({ queryKey: keys.documents.approvals.summary(), queryFn: getApprovalSummary });
}

export function useApprovalList(filters) {
  return useQuery({
    queryKey: keys.documents.approvals.list(filters),
    queryFn: ({ signal }) => listApprovals(filters, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useDocumentAudit(filters, enabled = true) {
  return useQuery({ queryKey: keys.documents.audit(filters), queryFn: () => listDocumentAudit(filters), enabled,
                    placeholderData: keepPreviousData });
}

function useDecision(fn) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => invalidateAfterDecision(qc) });
}
export const useApproveDocument = () => useDecision(approveDocumentVersion);
export const useRejectDocument = () => useDecision(rejectDocumentVersion);
export const useRequestReupload = () => useDecision(requestDocumentReupload);
export const useBulkApprove = () => useDecision(({ items, remark }) => bulkApproveDocuments(items, remark));

const HEARTBEAT_MS = 60_000;

/**
 * Holds the review lock on `documentId` while it is open in the preview panel: takes it, renews it every minute and
 * releases it on close / when the tab is hidden for good. Returns the person holding it when someone else does.
 */
export function useReviewLock(documentId, enabled = true) {
  const [state, setState] = useState({ held: false, lockedBy: null });
  const current = useRef(null);

  useEffect(() => {
    if (!documentId || !enabled) return undefined;
    let stopped = false;
    current.current = documentId;
    const take = () => acquireReviewLock(documentId)
      .then(() => { if (!stopped) setState({ held: true, lockedBy: null }); })
      .catch((e) => { if (!stopped) setState({ held: false, lockedBy: e?.code === "DOC_LOCKED" ? e.locked_by_name || "Another approver" : null }); });
    take();
    const timer = setInterval(take, HEARTBEAT_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      releaseReviewLock(documentId).catch(() => {});
      current.current = null;
      setState({ held: false, lockedBy: null });
    };
  }, [documentId, enabled]);

  return state;
}
