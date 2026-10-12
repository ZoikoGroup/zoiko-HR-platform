/**
 * hooks/useMyLeave.js
 * -------------------
 * The signed-in employee's leave requests and balances, on the query cache. These pages show other people's decisions
 * (an approval, a rejection), so they re-check every 30 s while the tab is visible and whenever it is shown or focused
 * again (staleTime 0). A failed background refresh keeps what is on screen; only a first load shows an error.
 */
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as employeeApi from "../service/employee";
import { getStoredUser } from "../service/api";
import { keys } from "../service/queryKeys";

/** The query client re-checks when the tab becomes visible; a plain window focus (no tab switch) should too. */
function useRefreshOnFocus(key) {
  const qc = useQueryClient();
  useEffect(() => {
    const onFocus = () => qc.invalidateQueries({ queryKey: key });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [qc, key.join("/")]); // eslint-disable-line react-hooks/exhaustive-deps
}

const REFRESH = { staleTime: 0, refetchInterval: 30_000, retry: false };

function newestFirst(data) {
  const list = Array.isArray(data) ? [...data] : [];
  list.sort((a, b) => {
    const da = a.created_at || a.appliedOn || a.start_date;
    const db = b.created_at || b.appliedOn || b.start_date;
    const diff = new Date(db || 0) - new Date(da || 0);
    return diff || (Number(b.id) || 0) - (Number(a.id) || 0);
  });
  return list;
}

export function useMyLeaveRequests() {
  const employeeId = getStoredUser()?.id;
  useRefreshOnFocus(keys.hr.leave.requests(employeeId));
  const query = useQuery({
    queryKey: keys.hr.leave.requests(employeeId),
    enabled: !!employeeId,
    queryFn: ({ signal }) => employeeApi.getLeaveRequests(employeeId, {}, { signal }),
    ...REFRESH,
  });
  const records = useMemo(() => newestFirst(query.data), [query.data]);
  return { query, records, missingUser: !employeeId };
}

export function useMyLeaveBalances() {
  const employeeId = getStoredUser()?.id;
  useRefreshOnFocus(keys.hr.leave.balances(employeeId));
  const query = useQuery({
    queryKey: keys.hr.leave.balances(employeeId),
    enabled: !!employeeId,
    queryFn: ({ signal }) => employeeApi.getLeaveBalances(employeeId, { signal }),
    ...REFRESH,
  });
  const balances = useMemo(() => (Array.isArray(query.data) ? query.data : []), [query.data]);
  return { query, balances };
}
