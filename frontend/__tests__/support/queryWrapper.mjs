// Test helper: render a component inside a QueryClientProvider whose client has no retries and no GC timers (a pending
// 5-minute timer would keep the test process alive after the tests finish).
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
}

/** element wrapped in a fresh provider; pass your own client to inspect the cache afterwards. */
export function withQuery(element, client = testQueryClient()) {
  return React.createElement(QueryClientProvider, { client }, element);
}
