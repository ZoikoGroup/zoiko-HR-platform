import { AlertCircle } from "lucide-react";

/**
 * Shared, always-visible error surface for the document pages — used both
 * for the initial list-fetch error and for `fileError` from useDocumentFile
 * (a view/download failure must never be silently swallowed; every page
 * that calls the hook renders this for its `fileError`, same as its own
 * fetch `error`). Semantic red, deliberately not part of the blue system —
 * an error must never read as a primary action.
 */
export default function DocumentErrorState({ message, onRetry }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm"
    >
      <AlertCircle size={16} className="flex-shrink-0" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex-shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 rounded"
        >
          Retry
        </button>
      )}
    </div>
  );
}
