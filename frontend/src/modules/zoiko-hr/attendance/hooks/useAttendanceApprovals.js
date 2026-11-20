/** Attendance approvals queue (attendance plan M7): corrections and overtime, and deciding them. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../../../../service/queryKeys";
import { listAttendanceApprovals } from "../../../../service/attendanceService";
import { decideCorrection, decideOvertime } from "../../../../service/workDocumentsService";

export function useAttendanceApprovals(filters) {
  return useQuery({ queryKey: keys.attendance.approvals(filters), queryFn: () => listAttendanceApprovals(filters),
                    placeholderData: keepPreviousData });
}

/** decide({ type: "correction" | "overtime", id, approve, reason, compensation_method }) */
export function useDecideAttendanceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, id, approve, reason, compensation_method }) => (type === "overtime"
      ? decideOvertime(id, { approve, reason: reason || null, compensation_method: compensation_method || null })
      : decideCorrection(id, { approve, reason: reason || null })),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.attendance.all }),
  });
}
