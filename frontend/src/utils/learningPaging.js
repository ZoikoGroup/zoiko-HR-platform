// Learning lists are paged on the server (at most 200 rows a page). A picker or a learner's catalogue that needs every row
// walks the pages instead of asking once and silently stopping at the first page (audit L9).

const PAGE_SIZE = 200;
const MAX_PAGES = 50;          // a hard stop, so a misbehaving server can never loop a page forever

/** Every item from a paged list endpoint: fetcher(params) answers { items, total } (or a plain array). */
export async function fetchAllPages(fetcher, params = {}) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const data = await fetcher({ ...params, page, per_page: PAGE_SIZE });
    if (Array.isArray(data)) return data;
    const items = Array.isArray(data?.items) ? data.items : [];
    all.push(...items);
    const total = Number(data?.total);
    if (items.length < PAGE_SIZE || (Number.isFinite(total) && all.length >= total)) break;
  }
  return all;
}
