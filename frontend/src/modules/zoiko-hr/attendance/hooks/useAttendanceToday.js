/** Live "Today" (attendance plan M6): refreshed every minute while the page is open. */
import { useQuery } from "@tanstack/react-query";
import { keys } from "../../../../service/queryKeys";
import { getAttendanceToday } from "../../../../service/attendanceService";

export function useAttendanceToday(filters) {
  return useQuery({ queryKey: keys.attendance.today(filters), queryFn: () => getAttendanceToday(filters), refetchInterval: 60 * 1000 });
}
