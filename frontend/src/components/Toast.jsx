/*
 * A short-lived success / error message in the bottom-right corner, above dialogs and slide-overs (z-[120]), so the result
 * of an action is seen even when the form that triggered it is scrolled. The same look as the Documents module's toast
 * (modules/zoiko-hr/documents/generated/docUi.jsx), without that module's service imports, so any page can use it.
 *
 *   const [toast, showToast] = useToast();
 *   showToast("success", "Choices saved");      // or "error"
 *   return <>…<Toast toast={toast} /></>;
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

export function useToast(ms = 4000) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const showToast = useCallback((type, msg) => {
    clearTimeout(timer.current);
    setToast({ type: type === "success" ? "success" : "error", msg });
    timer.current = setTimeout(() => setToast(null), ms);
  }, [ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [toast, showToast];
}

export function Toast({ toast }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div role={ok ? "status" : "alert"} aria-live={ok ? "polite" : "assertive"} data-testid="toast"
      className={`fixed bottom-6 right-6 z-[120] flex max-w-sm items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${ok ? "bg-emerald-700" : "bg-rose-700"}`}>
      {ok ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <X className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="break-words">{toast.msg}</span>
    </div>
  );
}

export default Toast;
