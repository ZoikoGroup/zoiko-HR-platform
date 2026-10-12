// A route component that can also be fetched ahead of time: lazyRoute(() => import("./Page")) is React.lazy plus a
// .preload() that starts the same dynamic import (the browser's module cache makes the later render instant). One
// declaration per page is the single source for both rendering and prefetching.
import { lazy } from "react";

export function lazyRoute(load) {
  const Component = lazy(load);
  let started = null;
  Component.preload = () => {
    if (!started) started = load().catch(() => { started = null; });   // a failed prefetch can be tried again on the next hover
    return started;
  };
  return Component;
}
