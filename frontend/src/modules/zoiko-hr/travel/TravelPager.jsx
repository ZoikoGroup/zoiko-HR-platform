// Previous / next for the travel lists, which page on the server (audit T6).
export default function TravelPager({ page, perPage, total, onPage, label = "records" }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (perPage || 1)));
  if (!total) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const btn = "px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 px-1 py-2 text-xs text-gray-500">
      <span>{from}–{to} of {total} {label}</span>
      <span className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </span>
    </nav>
  );
}
