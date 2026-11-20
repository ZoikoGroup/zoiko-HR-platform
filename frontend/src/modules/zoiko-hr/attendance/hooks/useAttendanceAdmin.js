/** Admin attendance log (attendance plan M5): records with server filters, one record, its audit trail, and writes. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../../../../service/queryKeys";
import {
  createAttendanceRecord, deleteAttendanceRecord, getAttendanceRecord, getAttendanceRecordAudit, listAttendanceRecords,
  updateAttendanceRecord,
} from "../../../../service/attendanceService";

export function useAttendanceRecords(filters) {
  return useQuery({ queryKey: keys.attendance.records.list(filters), queryFn: ({ signal }) => listAttendanceRecords(filters, { signal }),
                    placeholderData: keepPreviousData });
}
export function useAttendanceRecord(id) {
  return useQuery({ queryKey: keys.attendance.records.detail(id), queryFn: () => getAttendanceRecord(id), enabled: Boolean(id) });
}
export function useAttendanceRecordAudit(id) {
  return useQuery({ queryKey: keys.attendance.records.audit(id), queryFn: () => getAttendanceRecordAudit(id), enabled: Boolean(id) });
}
function useRecordChange(fn) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: keys.attendance.all }) });
}
export const useCreateAttendanceRecord = () => useRecordChange(createAttendanceRecord);
export const useUpdateAttendanceRecord = () => useRecordChange(updateAttendanceRecord);
export const useDeleteAttendanceRecord = () => useRecordChange(deleteAttendanceRecord);

