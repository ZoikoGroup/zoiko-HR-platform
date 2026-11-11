/**
 * hooks/useDismissible.js
 * -----------------------
 * Closes a dropdown/popover the way people expect (B15):
 *   - a pointer press anywhere outside `ref` (the element holding the trigger and the panel),
 *   - the Escape key (focus goes back to `returnFocusRef`, normally the trigger button),
 *   - a route change.
 * Listeners are attached only while `open` is true.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

export function useDismissible(ref, open, onClose, { returnFocusRef } = {}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (ref.current && !ref.current.contains(e.target)) closeRef.current();
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      closeRef.current();
      returnFocusRef?.current?.focus?.();
    };
    // pointerdown covers mouse, touch and pen; mousedown is kept for environments without pointer events.
    const pointerEvent = typeof window !== "undefined" && "PointerEvent" in window ? "pointerdown" : "mousedown";
    document.addEventListener(pointerEvent, onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener(pointerEvent, onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, returnFocusRef]);

  const { pathname } = useLocation();
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== firstPath.current) {
      firstPath.current = pathname;
      closeRef.current();
    }
  }, [pathname]);
}

export default useDismissible;
