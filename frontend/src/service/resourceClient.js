import { api } from "./api";

/**
 * Creates a small set of CRUD helpers for a FastAPI resource.
 *
 * Expected backend routes (adjust prefixes per module as needed):
 *   GET    {basePath}/{resource}            -> list
 *   GET    {basePath}/{resource}/{id}       -> retrieve
 *   POST   {basePath}/{resource}            -> create
 *   PUT    {basePath}/{resource}/{id}       -> update
 *   DELETE {basePath}/{resource}/{id}       -> delete
 *
 * On network failure (backend not running yet) calls fall back to the
 * provided mock data so the UI keeps working during frontend development.
 */
export function createResourceClient(basePath, mockData = {}) {
  function url(resource, id) {
    const path = `${basePath}/${resource}`;
    return id !== undefined ? `${path}/${id}` : path;
  }

  async function list(resource, params) {
    try {
      const query = params ? `?${new URLSearchParams(params).toString()}` : "";
      return await api.get(`${url(resource)}${query}`);
    } catch (err) {
      console.warn(`[${basePath}] GET ${resource} failed, using mock data:`, err.message || err);
      return mockData[resource] ?? [];
    }
  }

  async function retrieve(resource, id) {
    try {
      return await api.get(url(resource, id));
    } catch (err) {
      console.warn(`[${basePath}] GET ${resource}/${id} failed, using mock data:`, err.message || err);
      const collection = mockData[resource] ?? [];
      return collection.find((item) => String(item.id) === String(id)) ?? null;
    }
  }

  async function create(resource, payload) {
    return api.post(url(resource), payload);
  }

  async function update(resource, id, payload) {
    return api.put(url(resource, id), payload);
  }

  async function remove(resource, id) {
    return api.delete(url(resource, id));
  }

  return { list, retrieve, create, update, remove };
}
