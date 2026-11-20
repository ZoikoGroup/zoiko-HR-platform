/** The signed-in person's own documents (docs/new_docs/ZHR-DOCS-ARCH-001 §7.4). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../../../../service/queryKeys";
import { getMyDocumentCategories, uploadMyDocument, withdrawMyDocument } from "../../../../service/documentsService";
import { invalidateAfterMyUpload } from "./invalidation";

export function useMyCategories() {
  return useQuery({ queryKey: keys.documents.me.categories(), queryFn: getMyDocumentCategories });
}

export function useUploadMyDocument() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: uploadMyDocument, onSuccess: () => invalidateAfterMyUpload(qc) });
}

export function useWithdrawMyDocument() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: withdrawMyDocument, onSuccess: () => invalidateAfterMyUpload(qc) });
}
