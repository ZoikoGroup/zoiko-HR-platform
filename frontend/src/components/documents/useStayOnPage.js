import { useEffect } from "react";

// Keeps a final page (e.g. "submission successful") in place: an extra history entry for the same address is added, and
// whenever the browser's Back button pops it, it is added again, so Back never returns to the forms already submitted.
// The router's own history state is reused, so the router sees no navigation.
export default function useStayOnPage() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.history?.pushState) return undefined;
    const pin = () => window.history.pushState(window.history.state, "", window.location.href);
    pin();
    window.addEventListener("popstate", pin);
    return () => window.removeEventListener("popstate", pin);
  }, []);
}
