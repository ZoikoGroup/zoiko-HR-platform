// The app's single TanStack Query client: cached, shared server data with sensible freshness rules.
//
//   staleTime 30 s      data shown again within 30 s is not refetched; older data is shown at once and refreshed behind it
//   gcTime 5 min        data nobody is looking at is dropped after 5 minutes
//   refetch on window focus / reconnect   a user coming back to the tab sees current data
//   retry once          only for failures that can be transient: network errors, timeouts and 5xx. Client errors
//                       (400/401/403/404/409/422/...) will fail the same way again, so they are not retried.
//   mutations never retry  repeating a write could do it twice
//
// Cache keys are ["module", "resource", params] (factories in service/queryKeys.js). The cache is emptied whenever the
// session ends or a different person signs in (see api.js), so one user's data is never shown to the next.
import { QueryClient } from "@tanstack/react-query";

/** Retry a failed query once, unless the server answered with a client error (4xx). */
export function shouldRetryQuery(failureCount, error) {
  const status = Number(error?.status);
  if (status >= 400 && status < 500) return false;
  return failureCount < 1;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: shouldRetryQuery,
      },
      mutations: { retry: false },
    },
  });
}

export const queryClient = createQueryClient();
