/** Company documents (docs/new_docs/ZHR-DOCS-ARCH-001 §7.2): categories, files, versions, access rules, acknowledgements. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../../../../service/queryKeys";
import * as svc from "../../../../service/documentsService";
import { invalidateAfterCompanyChange } from "./invalidation";

export const useCompanyCategories = (params) =>
  useQuery({ queryKey: keys.documents.company.categories(params), queryFn: () => svc.listCompanyCategories(params) });
export const useCompanyItems = (categoryId, params) =>
  useQuery({ queryKey: keys.documents.company.items(categoryId, params), queryFn: () => svc.listCompanyItems(categoryId, params),
             enabled: Boolean(categoryId), placeholderData: keepPreviousData });
export const useCompanyFiles = (params, enabled = true) =>
  useQuery({ queryKey: keys.documents.company.flat(params), queryFn: () => svc.listCompanyFiles(params), enabled,
             placeholderData: keepPreviousData });
export const useCompanyVersions = (documentId) =>
  useQuery({ queryKey: keys.documents.versions(documentId), queryFn: () => svc.listCompanyVersions(documentId), enabled: Boolean(documentId) });
export const useAccessRule = (targetType, targetId, enabled = true) =>
  useQuery({ queryKey: keys.documents.company.access(targetType, targetId), queryFn: () => svc.getAccessRule(targetType, targetId),
             enabled: Boolean(targetType && targetId) && enabled });
export const useAckTracking = (documentId, params) =>
  useQuery({ queryKey: keys.documents.company.acks(documentId, params), queryFn: () => svc.getAckTracking(documentId, params),
             enabled: Boolean(documentId) });

function useChange(fn) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => invalidateAfterCompanyChange(qc) });
}
export const useCreateCompanyCategory = () => useChange(svc.createCompanyCategory);
export const useUpdateCompanyCategory = () => useChange(({ id, data }) => svc.updateCompanyCategory(id, data));
export const useUploadCompanyDocument = () => useChange(svc.uploadCompanyDocument);
export const useUploadCompanyVersion = () => useChange(svc.uploadCompanyVersion);
export const usePublishCompanyDocument = () => useChange(({ documentId, publishAt }) => svc.publishCompanyDocument(documentId, publishAt));
export const useUnpublishCompanyDocument = () => useChange(svc.unpublishCompanyDocument);
export const useDeleteCompanyDocument = () => useChange(svc.deleteCompanyDocument);
export const useCreateCompanyFolder = () => useChange(svc.createCompanyFolder);
export const usePutAccessRule = () => useChange(({ targetType, targetId, rule }) => svc.putAccessRule(targetType, targetId, rule));
export const usePutBulkAccessRule = () => useChange(({ documentIds, rule }) => svc.putBulkAccessRule(documentIds, rule));
export const useRemindAcks = () => useChange(({ documentId, employeeIds }) => svc.remindAcks(documentId, employeeIds));
