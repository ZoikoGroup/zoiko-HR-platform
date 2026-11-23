/** My attendance (attendance plan M2/M3): today, the month and one day, plus the punch actions. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "../../../../service/queryKeys";
import {
  endBreak, getMyAttendanceDay, getMyAttendanceMonth, getMyAttendanceToday, punchIn, punchOut, startBreak,
} from "../../../../service/attendanceService";

export function useMyAttendanceToday() {
  return useQuery({ queryKey: keys.attendance.me.today(), queryFn: getMyAttendanceToday, refetchInterval: 5 * 60 * 1000 });
}
export function useMyAttendanceMonth(month) {
  return useQuery({ queryKey: keys.attendance.me.month(month), queryFn: () => getMyAttendanceMonth(month) });
}
export function useMyAttendanceDay(date) {
  return useQuery({ queryKey: keys.attendance.me.day(date), queryFn: () => getMyAttendanceDay(date), enabled: Boolean(date) });
}

/** One mutation per action; on success "today" is replaced by the server's answer and the month refreshes. */
function usePunchAction(fn) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (today) => {
      // the answer IS the new "today": store it instead of asking again; the month and day views refresh
      if (today && typeof today === "object") qc.setQueryData(keys.attendance.me.today(), today);
      qc.invalidateQueries({ queryKey: ["attendance", "me", "month"] });
      qc.invalidateQueries({ queryKey: ["attendance", "me", "day"] });
    },
    // a refused action means our copy of the day is out of date (another tab, the end-of-day job): fetch it again
    onError: () => qc.invalidateQueries({ queryKey: keys.attendance.me.today() }),
  });
}
export const usePunchIn = () => usePunchAction(punchIn);
export const usePunchOut = () => usePunchAction(punchOut);
export const useStartBreak = () => usePunchAction(startBreak);
export const useEndBreak = () => usePunchAction(endBreak);
