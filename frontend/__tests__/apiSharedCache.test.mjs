/** Page-load performance: identical reference-list GETs share one request; any write clears them. */
import "./support/setup-jsdom.mjs";
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

let calls;
let original;
beforeEach(() => {
  calls = [];
  original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push([url, opts?.method]);
    const n = calls.length;
    return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ items: [{ id: 1, n }] }) };
  };
});
afterEach(() => { globalThis.fetch = original; });

const load = () => import(`../src/service/api.js?t=${Math.random()}`);

test("the same employee list requested by several widgets is fetched once", async () => {
  const { api } = await load();
  const params = { per_page: 200, include_all_roles: true };
  const [a, b, c] = await Promise.all([api.get("/hr/employees", { params }), api.get("/hr/employees", { params }), api.get("/hr/employees", { params })]);
  assert.equal(calls.length, 1);
  assert.deepEqual(a, b);
  a.items[0].id = 999; // a caller mutating its copy must not corrupt the others
  assert.equal(c.items[0].id, 1);
  await api.get("/hr/employees", { params });
  assert.equal(calls.length, 1, "still served from the short cache");
});

test("different query parameters, other endpoints and signalled requests are not shared", async () => {
  const { api } = await load();
  await api.get("/hr/employees", { params: { per_page: 20 } });
  await api.get("/hr/employees", { params: { per_page: 200 } });
  await api.get("/hr/leaves");
  await api.get("/hr/leaves");
  await api.get("/hr/employees", { params: { per_page: 20 }, signal: new AbortController().signal });
  assert.equal(calls.length, 5);
});

test("any write clears the cache so the next read is fresh", async () => {
  const { api } = await load();
  await api.get("/hr/departments");
  await api.post("/hr/departments", { name: "Ops" });
  await api.get("/hr/departments");
  assert.deepEqual(calls.map((c) => c[1]), ["GET", "POST", "GET"]);
});

test("a failed request is not remembered", async () => {
  const { api } = await load();
  globalThis.fetch = async (url, opts) => { calls.push([url, opts?.method]); return { ok: false, status: 500, statusText: "boom", json: async () => ({ detail: "boom" }), headers: { get: () => "application/json" } }; };
  await assert.rejects(api.get("/hr/designations"), /boom/);
  await assert.rejects(api.get("/hr/designations"), /boom/);
  assert.equal(calls.length, 2);
});

test("logging out or in drops cached lists", async () => {
  const { api, setSession, clearSession } = await load();
  await api.get("/hr/employees");
  clearSession();
  await api.get("/hr/employees");
  setSession({ accessToken: "t" });
  await api.get("/hr/employees");
  assert.equal(calls.length, 3);
});
