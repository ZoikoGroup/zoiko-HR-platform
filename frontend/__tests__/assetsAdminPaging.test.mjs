/** Assets audit batch 2: the admin Assets and Asset Requests pages page/filter on the server, count from the server, pick
 * employees from the server, and fulfil a request by handing over a chosen available asset. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = (ms = 350) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

function makeApi(routes) {
  const calls = [];
  const handle = (method) => async (url, a, b) => {
    const params = method === "get" ? a?.params || {} : {};
    const body = method === "get" ? undefined : a;
    calls.push({ method, url, params, body });
    const fn = routes[`${method} ${url}`] || routes[`${method} *`];
    return fn ? fn(params, body, url) : {};
  };
  return { api: { get: handle("get"), post: handle("post"), put: handle("put"), delete: handle("delete") }, calls };
}

const asset = (id, extra = {}) => ({ id, name: `Laptop ${id}`, asset_tag: `LT-${id}`, status: "available", ...extra });

// The Assets functions of hrService, wired to the current test's fake api (same URLs and params as the real ones).
// Module level on purpose: shared modules (assetPickers.jsx) are imported once and keep the first mock they saw.
let current;
const proxyApi = {
  get: (...a) => current.get(...a), post: (...a) => current.post(...a), put: (...a) => current.put(...a),
};
const hr = {
  getAssets: (params = {}) => proxyApi.get("/hr/assets", { params }),
  createAsset: (payload) => proxyApi.post("/hr/assets", payload),
  getAssetCategories: () => proxyApi.get("/hr/assets/categories"),
  getAssetDashboard: () => proxyApi.get("/hr/assets/dashboard"),
  assignAsset: (id, payload) => proxyApi.put(`/hr/assets/${id}/assign`, payload),
  getAssetEmployeeOptions: (params = {}) => proxyApi.get("/hr/assets/employee-options", { params }),
  getAssetRequests: (params = {}) => proxyApi.get("/hr/assets/requests", { params }),
  approveAssetRequest: (id) => proxyApi.put(`/hr/assets/requests/${id}/approve`),
  rejectAssetRequest: (id) => proxyApi.put(`/hr/assets/requests/${id}/reject`),
  fulfillAssetRequest: (id, payload) => proxyApi.put(`/hr/assets/requests/${id}/fulfill`, payload),
};

async function loadPage(t, path, routes) {
  const { api, calls } = makeApi(routes);
  current = api;
  t.mock.module("../src/service/hrService.js", { exports: hr });
  const { default: Page } = await import(`${path}?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("assets: counts come from the dashboard and the list pages on the server", async (t) => {
  const calls = await loadPage(t, "../src/modules/organization-admin/AssetsPage.jsx", {
    "get /hr/assets": (p) => ({ total: 45, page: p.page, per_page: p.per_page, items: [asset(p.page * 100)] }),
    "get /hr/assets/dashboard": () => ({ total_assets: 45, assigned_count: 30, available_count: 12 }),
    "get /hr/assets/categories": () => [],
  });
  assert.equal(screen.getByTestId("count-total").textContent, "45");
  assert.equal(screen.getByTestId("count-assigned").textContent, "30");
  assert.equal(screen.getByTestId("count-available").textContent, "12");
  const first = calls.find((c) => c.url === "/hr/assets");
  assert.equal(first.params.page, 1);
  assert.equal(first.params.per_page, 20);
  assert.match(document.body.textContent, /1–20 of 45 assets/);
  fireEvent.click(screen.getByLabelText("Next page"));
  await settle();
  const last = calls.filter((c) => c.url === "/hr/assets").at(-1);
  assert.equal(last.params.page, 2);
  assert.match(document.body.textContent, /LT-200/);
});

test("assets: search and status filter go to the server and start again at page 1", async (t) => {
  const calls = await loadPage(t, "../src/modules/organization-admin/AssetsPage.jsx", {
    "get /hr/assets": (p) => ({ total: 45, items: [asset(1)] }),
    "get /hr/assets/dashboard": () => ({ total_assets: 45, assigned_count: 0, available_count: 45 }),
    "get /hr/assets/categories": () => [],
  });
  fireEvent.click(screen.getByLabelText("Next page"));
  await settle();
  fireEvent.change(screen.getByPlaceholderText("Search by name, tag, serial..."), { target: { value: "dell" } });
  fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "maintenance" } });
  await settle(600);
  const last = calls.filter((c) => c.url === "/hr/assets").at(-1);
  assert.deepEqual([last.params.search, last.params.status, last.params.page], ["dell", "maintenance", 1]);
});

test("assets: the assign picker searches active staff on the server", async (t) => {
  const calls = await loadPage(t, "../src/modules/organization-admin/AssetsPage.jsx", {
    "get /hr/assets": () => ({ total: 1, items: [asset(7)] }),
    "get /hr/assets/dashboard": () => ({ total_assets: 1, assigned_count: 0, available_count: 1 }),
    "get /hr/assets/categories": () => [],
    "get /hr/assets/employee-options": (p) => [{ id: 5, first_name: "Ann", last_name: "Lee", full_name: "Ann Lee", email: "ann@x.example" }],
    "put /hr/assets/7/assign": () => asset(7, { status: "assigned" }),
  });
  fireEvent.click(screen.getByText("Assign", { selector: "button" }));
  fireEvent.change(screen.getByPlaceholderText("Type name or email..."), { target: { value: "ann" } });
  await settle(600);
  const search = calls.filter((c) => c.url === "/hr/assets/employee-options").at(-1);
  assert.equal(search.params.search, "ann");
  assert.equal(search.params.include_inactive, undefined, "only active staff are offered");
  assert.ok(!calls.some((c) => c.url === "/hr/employees"), "no 200-row employee download");
  fireEvent.click(screen.getByText("Ann Lee"));
  const buttons = screen.getAllByText("Assign", { selector: "button" });
  fireEvent.click(buttons.at(-1));
  await settle();
  const put = calls.find((c) => c.method === "put");
  assert.deepEqual([put.url, put.body], ["/hr/assets/7/assign", { employee_id: 5 }]);
});

test("requests: the pending banner counts every pending request and the status filter is a server filter", async (t) => {
  const calls = await loadPage(t, "../src/modules/organization-admin/AssetRequestsPage.jsx", {
    "get /hr/assets/requests": (p) => (p.status === "pending" && p.per_page === 1
      ? { total: 57, items: [] }
      : { total: 80, items: [{ id: 1, employee_name: "Ann Lee", asset_type: "Monitor", status: "approved" }] }),
  });
  assert.match(document.body.textContent, /57 pending requests awaiting your review/);
  assert.match(document.body.textContent, /1–20 of 80 requests/);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "rejected" } });
  await settle(600);
  const last = calls.filter((c) => c.url === "/hr/assets/requests" && c.params.per_page === 20).at(-1);
  assert.deepEqual([last.params.status, last.params.page], ["rejected", 1]);
});

test("requests: fulfilling sends the chosen available asset", async (t) => {
  const calls = await loadPage(t, "../src/modules/organization-admin/AssetRequestsPage.jsx", {
    "get /hr/assets/requests": () => ({ total: 1, items: [{ id: 9, employee_name: "Ann Lee", asset_type: "Monitor", status: "approved" }] }),
    "get /hr/assets": (p) => ({ total: 1, items: [asset(31, { name: "Dell 24" })] }),
    "put /hr/assets/requests/9/fulfill": () => ({ id: 9, status: "fulfilled" }),
  });
  fireEvent.click(screen.getByText("Fulfill"));
  await settle(600);
  const lookup = calls.find((c) => c.url === "/hr/assets");
  assert.equal(lookup.params.status, "available");
  fireEvent.click(screen.getByText("Dell 24"));
  fireEvent.click(screen.getByText("Assign & fulfill"));
  await settle();
  const put = calls.find((c) => c.method === "put");
  assert.deepEqual([put.url, put.body], ["/hr/assets/requests/9/fulfill", { asset_id: 31 }]);
});
