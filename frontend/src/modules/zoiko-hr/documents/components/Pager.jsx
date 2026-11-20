/** Previous / next paging for the documents lists. @param {{ page:number, perPage:number, total:number, onPage:(p:number)=>void }} props */
export default function Pager({ page, perPage, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-end gap-2 text-sm">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border px-3 py-1 disabled:opacity-50">Previous</button>
      <span className="text-slate-600">Page {page} of {pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-lg border px-3 py-1 disabled:opacity-50">Next</button>
    </nav>
  );
}
