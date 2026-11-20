import { useEffect, useRef, useState } from "react";
import { BellRing, X } from "lucide-react";
import SectionState from "./SectionState";
import { useAckTracking, useRemindAcks } from "../hooks/useCompanyDocuments";
import { formatDate, formatDateTime } from "../../../../utils/dateTime";

/**
 * Who has confirmed reading a company document, and who has not yet (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A3).
 * @param {{ open: boolean, document: { id:number, title:string } | null, onClose: () => void }} props
 */
export default function AckTrackingDrawer({ open, document: doc, onClose }) {
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useState(null);
  const query = useAckTracking(open ? doc?.id : null, { status: status || undefined });
  const remind = useRemindAcks();
  const closeBtn = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    setNotice(null);
    const back = document.activeElement;
    closeBtn.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); back?.focus?.(); };
  }, [open]);

  if (!open || !doc) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={`Read confirmations for ${doc.title}`} onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-[#1e293b]">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-[#f1f5f9]">Read confirmations: {doc.title}</h2>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="flex-1 space-y-3 overflow-auto p-5">
          <SectionState query={query} skeleton="list" label="Loading" isEmpty={() => false}>
            {(data) => (data.round === null ? <p className="text-sm text-slate-500">This document doesn't ask people to confirm they have read it.</p> : (
              <>
                <p className="text-sm text-slate-700">
                  Round {data.round}: <strong>{data.acknowledged}</strong> confirmed, <strong>{data.pending}</strong> waiting
                  {data.due_at && <> · due {formatDate(data.due_at)}</>}
                </p>
                <div className="flex items-center gap-2">
                  {[["", "Everyone"], ["pending", "Waiting"], ["acknowledged", "Confirmed"]].map(([v, l]) => (
                    <button key={v || "all"} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold ${status === v ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-600"}`}>{l}</button>
                  ))}
                  {data.pending > 0 && (
                    <button type="button" disabled={remind.isPending}
                      onClick={async () => { const r = await remind.mutateAsync({ documentId: doc.id }); setNotice(`Reminded ${r.sent}.`); }}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">
                      <BellRing size={14} aria-hidden="true" /> Remind waiting
                    </button>
                  )}
                </div>
                {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
                <ul className="divide-y divide-gray-100">
                  {data.items.map((r) => (
                    <li key={r.employee_id} className="flex items-center justify-between py-2 text-sm">
                      <span>{r.name}</span>
                      <span className={r.status === "acknowledged" ? "text-emerald-700" : "text-amber-700"}>
                        {r.status === "acknowledged" ? `Confirmed ${formatDateTime(r.acknowledged_at)}` : "Waiting"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ))}
          </SectionState>
        </div>
      </section>
    </div>
  );
}
