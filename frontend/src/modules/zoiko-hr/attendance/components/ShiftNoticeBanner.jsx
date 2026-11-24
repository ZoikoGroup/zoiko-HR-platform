import { useState } from "react";
import { BellRing } from "lucide-react";
import DocumentActionDialog from "../../../../components/documents/DocumentActionDialog";
import { formatDate } from "../../../../utils/dateTime";

/**
 * A shift notice waiting for the person's acknowledgement (My Attendance plan step 5). The notice is an issued
 * HR-TIM document, so "Read and acknowledge" opens the same document dialog the Documents pages use (it shows the
 * notice, its declaration and records the acknowledgement); nothing about acknowledging is re-implemented here.
 *
 * @param {{ notice: {notice_id: number, kind: string, start_date: string, document: object}|null, onAcknowledged?: () => void }} props
 */
export default function ShiftNoticeBanner({ notice, onAcknowledged }) {
  const [open, setOpen] = useState(false);
  if (!notice) return null;
  const what = notice.kind === "assignment" ? "A new shift has been assigned to you" : "Your shift is changing";
  return (
    <>
      <div role="region" aria-label="Shift notice" className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
        <BellRing size={18} className="shrink-0" aria-hidden="true" />
        <p className="flex-1">
          <span className="font-semibold">{what}</span> from {formatDate(notice.start_date)}. Please read the notice and confirm you have received it.
        </p>
        <button type="button" onClick={() => setOpen(true)}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
          Read and acknowledge
        </button>
      </div>
      {open && (
        <DocumentActionDialog doc={notice.document} mode="acknowledge" onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); onAcknowledged?.(); }} />
      )}
    </>
  );
}
