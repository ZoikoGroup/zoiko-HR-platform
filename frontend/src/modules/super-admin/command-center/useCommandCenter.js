// Data for the Platform Command Center: one query per card, so each card shows as soon as its own data arrives and a
// slow or failing endpoint never holds back or breaks the others.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { superAdminService as api } from "../../../service/superAdminService";
import { keys } from "../../../service/queryKeys";

const cc = keys.superAdmin.commandCenter;

/** days is part of the key of the cards that depend on it, so changing the period refetches only those cards, and the
 *  previous numbers stay on screen until the new ones arrive. */
export function useCommandCenter(days) {
  const withDays = { placeholderData: keepPreviousData };
  return {
    overview: useQuery({ queryKey: cc.overview(days), queryFn: ({ signal }) => api.getCommandCenterOverview({ days }, { signal }), ...withDays }),
    attention: useQuery({ queryKey: cc.attention(), queryFn: ({ signal }) => api.getCommandCenterAttention({ signal }) }),
    customerHealth: useQuery({ queryKey: cc.customerHealth(), queryFn: ({ signal }) => api.getCommandCenterCustomerHealth({ signal }) }),
    commercialHealth: useQuery({ queryKey: cc.commercialHealth(days), queryFn: ({ signal }) => api.getCommandCenterCommercialHealth({ days }, { signal }), ...withDays }),
    lifecycle: useQuery({ queryKey: cc.lifecycle(), queryFn: ({ signal }) => api.getCommandCenterLifecycle({ signal }) }),
    platformHealth: useQuery({ queryKey: cc.platformHealth(), queryFn: ({ signal }) => api.getCommandCenterPlatformHealth({ signal }) }),
    security: useQuery({ queryKey: cc.security(days), queryFn: ({ signal }) => api.getCommandCenterSecurity({ days }, { signal }), ...withDays }),
    recentAudit: useQuery({ queryKey: cc.recentAudit(8), queryFn: ({ signal }) => api.getAuditLogs({ limit: 8 }, { signal }) }),
  };
}

/** Refetch every dashboard card (the refresh button). */
export function useRefreshCommandCenter() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: cc.all });
}

/** Change a service's health status. The platform-health card is updated from the answer (no refetch of it); the
 *  overview is refetched because its banner status and reliability figure come from the same records. */
export function useUpdateServiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceName, status, existing }) => api.updateCommandCenterPlatformHealth(serviceName, {
      status,
      availability_pct: existing?.availability_pct ?? null,
      latency_p95_ms: existing?.latency_p95_ms ?? null,
      notes: existing?.notes ?? null,
    }),
    onSuccess: (updated, { serviceName }) => {
      qc.setQueryData(cc.platformHealth(), (prev) => (prev || []).map((s) => (s.service_name === serviceName ? updated : s)));
      qc.invalidateQueries({ queryKey: ["superAdmin", "commandCenter", "overview"] });
    },
  });
}
