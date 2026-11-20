/** Admin → Employee Documents data (docs/new_docs/ZHR-DOCS-ARCH-001 §7.1). Read-only browsing, reminders, categories. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../../../../service/queryKeys";
import {
  createEmployeeCategory, deleteEmployeeCategory, getDocumentEmployee, getDocumentEmployeesSummary, getEmployeeCategoryFiles,
  listDocumentEmployees, listEmployeeCategories, sendBulkReminders, sendEmployeeReminder, updateEmployeeCategory,
} from "../../../../service/documentsService";

export function useDocumentEmployees(filters) {
  return useQuery({ queryKey: keys.documents.employees.list(filters), queryFn: ({ signal }) => listDocumentEmployees(filters, { signal }),
                    placeholderData: keepPreviousData });
}
export function useDocumentEmployeesSummary() {
  return useQuery({ queryKey: [...keys.documents.employees.all, "summary"], queryFn: getDocumentEmployeesSummary });
}
export function useDocumentEmployee(employeeId) {
  return useQuery({ queryKey: keys.documents.employees.detail(employeeId), queryFn: () => getDocumentEmployee(employeeId),
                    enabled: Boolean(employeeId) });
}
export function useEmployeeCategoryFiles(employeeId, categoryId) {
  return useQuery({ queryKey: keys.documents.employees.files(employeeId, categoryId),
                    queryFn: () => getEmployeeCategoryFiles(employeeId, categoryId), enabled: Boolean(employeeId && categoryId) });
}
export function useSendReminder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: sendEmployeeReminder, onSettled: () => qc.invalidateQueries({ queryKey: keys.documents.employees.all }) });
}
export function useSendBulkReminders() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: sendBulkReminders, onSettled: () => qc.invalidateQueries({ queryKey: keys.documents.employees.all }) });
}
export function useEmployeeCategories() {
  return useQuery({ queryKey: keys.documents.employeeCategories(), queryFn: listEmployeeCategories });
}
function useCategoryChange(fn) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => {
    qc.invalidateQueries({ queryKey: keys.documents.employeeCategories() });
    qc.invalidateQueries({ queryKey: keys.documents.employees.all });
    qc.invalidateQueries({ queryKey: keys.documents.me.all });
  } });
}
export const useCreateEmployeeCategory = () => useCategoryChange(createEmployeeCategory);
export const useUpdateEmployeeCategory = () => useCategoryChange(({ id, data }) => updateEmployeeCategory(id, data));
export const useDeleteEmployeeCategory = () => useCategoryChange(deleteEmployeeCategory);
