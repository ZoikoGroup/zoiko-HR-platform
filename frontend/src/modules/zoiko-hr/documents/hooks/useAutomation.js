/** Automation admin data (docs/new_docs/ZHR-DOCS-ARCH-001 §7.6). Notification wording now; rules and runs in Phase 8. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../../../../service/queryKeys";
import {
  createAutomationRule, deleteAutomationRule, dryRunAutomationRule, getAutomationCatalog, getAutomationRun, getAutomationSettings,
  listAutomationRules, listAutomationRuns, retryAutomationRun, saveAutomationSettings, setAutomationRuleStatus, updateAutomationRule,
  deleteRetentionPolicy, listRetentionPolicies, saveRetentionPolicy,
  listNotificationTemplates, previewNotificationTemplate, revertNotificationTemplate, saveNotificationTemplate,
} from "../../../../service/documentsService";

export function useNotificationTemplates() {
  return useQuery({ queryKey: keys.automation.templates(), queryFn: listNotificationTemplates });
}
function useTemplateChange(fn) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: keys.automation.templates() }) });
}
export const useSaveNotificationTemplate = () => useTemplateChange(saveNotificationTemplate);
export const useRevertNotificationTemplate = () => useTemplateChange(revertNotificationTemplate);
export function usePreviewNotificationTemplate() {
  return useMutation({ mutationFn: previewNotificationTemplate });
}

const RETENTION = ["automation", "retention"];
export function useRetentionPolicies() {
  return useQuery({ queryKey: RETENTION, queryFn: listRetentionPolicies });
}
function useRetentionChange(fn) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: RETENTION }) });
}
export const useSaveRetentionPolicy = () => useRetentionChange(saveRetentionPolicy);
export const useDeleteRetentionPolicy = () => useRetentionChange(deleteRetentionPolicy);

// ── rules engine ──────────────────────────────────────────────────────────────────────────────────────────────────
export function useAutomationCatalog() {
  return useQuery({ queryKey: keys.automation.catalog(), queryFn: getAutomationCatalog, staleTime: 5 * 60 * 1000 });
}
export function useAutomationRules(filters) {
  return useQuery({ queryKey: keys.automation.rules(filters), queryFn: () => listAutomationRules(filters) });
}
function useRuleChange(fn) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: keys.automation.all }) });
}
export const useCreateAutomationRule = () => useRuleChange(createAutomationRule);
export const useUpdateAutomationRule = () => useRuleChange(updateAutomationRule);
export const useDeleteAutomationRule = () => useRuleChange(deleteAutomationRule);
export const useSetAutomationRuleStatus = () => useRuleChange(setAutomationRuleStatus);
export const useRetryAutomationRun = () => useRuleChange(retryAutomationRun);
export const useSaveAutomationSettings = () => useRuleChange(saveAutomationSettings);
export function useDryRunAutomationRule() {
  return useMutation({ mutationFn: dryRunAutomationRule });
}
export function useAutomationRuns(filters) {
  return useQuery({ queryKey: keys.automation.runs(filters), queryFn: () => listAutomationRuns(filters) });
}
export function useAutomationRun(id) {
  return useQuery({ queryKey: keys.automation.run(id), queryFn: () => getAutomationRun(id), enabled: Boolean(id) });
}
export function useAutomationSettings() {
  return useQuery({ queryKey: keys.automation.settings(), queryFn: getAutomationSettings });
}
