/** Assets audit batch 4: purchase dates after today are refused (A17), Reject is disabled while Approve runs (A17), and
 * an employee's new asset request shows the server's saved row, never a made-up one (A18). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { chooseOption } from "./support/searchableSelect.mjs";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import { isFutureDate, todayISO } from "../src/modules/organization-admin/assetPickers.jsx";

afterEach(() => cleanup());
const settle = (ms = 350) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

function makeApi(routes) {
  const calls = [];
  const handle = (method) => async (url, a) => {
    const params = method === "get" ? a?.params || {} : {};
    const body = method === "get" || method === "delete" ? undefined : a;
    calls.push({ method, url, params, body });
    const fn = routes[`${method} ${url}`];
    return fn ? fn(params, body, url) : {};
  };
  return { api: { get: handle("get"), post: handle("post"), put: handle("put"), delete: handle("delete") }, calls };
}

// Module level: shared modules (assetPickers.jsx, AssetActionDialogs.jsx) are imported once and keep the first mock.
let current;
const proxyApi = {
  get: (...a) => current.get(...a), post: (...a) => current.post(...a),
  put: (...a) => current.put(...a), delete: (...a) => current.delete(...a),
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
  updateAsset: (id, payload) => proxyApi.put(`/hr/assets/${id}`, payload),
  deleteAsset: (id) => proxyApi.delete(`/hr/assets/${id}`),
  returnAsset: (id, payload) => proxyApi.put(`/hr/assets/${id}/return`, payload),
  transferAsset: (id, payload) => proxyApi.put(`/hr/assets/${id}/transfer`, payload),
  createAssetCategory: (payload) => proxyApi.post("/hr/assets/categories", payload),
  updateAssetCategory: (id, payload) => proxyApi.put(`/hr/assets/categories/${id}`, payload),
  deleteAssetCategory: (id) => proxyApi.delete(`/hr/assets/categories/${id}`),
};

const SPARE = { id: 7, name: "Laptop 7", asset_tag: "LT-7", status: "available", purchase_date: "2025-01-10" };

async function loadAdmin(t, path, routes = {}) {
  const { api, calls } = makeApi({
    "get /hr/assets": () => ({ total: 1, items: [SPARE] }),
    "get /hr/assets/dashboard": () => ({ total_assets: 1, assigned_count: 0, available_count: 1 }),
    "get /hr/assets/categories": () => [],
    ...routes,
  });
  current = api;
  t.mock.module("../src/service/hrService.js", { exports: hr });
  const { default: Page } = await import(`${path}?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("the future-date helper compares calendar days in the browser's zone", () => {
  const today = todayISO(new Date(2026, 10, 20, 23, 30));
  assert.equal(today, "2026-11-20");
  assert.equal(isFutureDate("2026-11-21", today), true);
  assert.equal(isFutureDate("2026-11-20", today), false);
  assert.equal(isFutureDate("", today), false);
});

test("create: a purchase date after today is refused before anything is sent", async (t) => {
  const calls = await loadAdmin(t, "../src/modules/organization-admin/AssetsPage.jsx", { "post /hr/assets": () => ({ id: 9 }) });
  fireEvent.click(screen.getByText("Add Asset"));
  const inputs = document.querySelectorAll("form input[type=text]");
  fireEvent.change(inputs[0], { target: { value: "Laptop" } });
  fireEvent.change(inputs[1], { target: { value: "LT-9" } });
  const date = screen.getByLabelText("Purchase Date");
  assert.equal(date.getAttribute("max"), todayISO());
  fireEvent.change(date, { target: { value: "2099-01-01" } });
  fireEvent.click(screen.getByText("Create Asset"));
  await settle(50);
  assert.match(document.body.textContent, /Purchase date cannot be in the future/);
  assert.ok(!calls.some((c) => c.method === "post"));
  fireEvent.change(date, { target: { value: "2024-05-01" } });
  fireEvent.click(screen.getByText("Create Asset"));
  await settle();
  const post = calls.find((c) => c.method === "post");
  assert.equal(post.body.purchase_date, "2024-05-01");
});

test("edit: a purchase date after today is refused inline", async (t) => {
  const calls = await loadAdmin(t, "../src/modules/organization-admin/AssetsPage.jsx", { "put /hr/assets/7": () => SPARE });
  fireEvent.click(screen.getByLabelText("Edit LT-7"));
  const dialog = screen.getByRole("dialog", { name: "Edit asset" });
  const date = within(dialog).getByLabelText("Purchase Date");
  assert.equal(date.getAttribute("max"), todayISO());
  fireEvent.change(date, { target: { value: "2099-12-31" } });
  fireEvent.click(within(dialog).getByText("Save changes"));
  await settle(50);
  assert.match(within(dialog).getByRole("alert").textContent, /cannot be in the future/);
  assert.ok(!calls.some((c) => c.method === "put"));
});

test("requests: while Approve runs, Reject (and every other action) is disabled", async (t) => {
  let release;
  await loadAdmin(t, "../src/modules/organization-admin/AssetRequestsPage.jsx", {
    "get /hr/assets/requests": () => ({ total: 2, items: [
      { id: 1, employee_name: "Ann Lee", asset_type: "Monitor", status: "pending" },
      { id: 2, employee_name: "Raj Kumar", asset_type: "Mouse", status: "approved" },
    ] }),
    "put /hr/assets/requests/1/approve": () => new Promise((resolve) => { release = () => resolve({ id: 1, status: "approved" }); }),
  });
  fireEvent.click(screen.getByText("Approve"));
  await settle(50);
  assert.equal(screen.getByText("Reject").closest("button").disabled, true);
  assert.equal(screen.getByText("Fulfill").closest("button").disabled, true);
  await act(async () => { release(); });
  await settle();
  assert.equal(screen.getByText("Reject").closest("button").disabled, false);
});

// ── A18: the employee's own request page ─────────────────────────────────────────────────────────────────────────────

async function loadEmployeePage(t, { afterSubmitList, failRefetch = false } = {}) {
  const calls = { create: [], lists: 0 };
  const SAVED = { id: 41, asset_type: "Monitor", reason: "Need a second screen (as stored)", priority: "medium", status: "pending", requested_on: "2026-11-20" };
  const employeeApi = {
    getMyProfile: async () => ({ id: 3, first_name: "Ann" }),
    getMyAssets: async () => ({ items: [] }),
    getAssetRequests: async () => {
      calls.lists += 1;
      if (calls.lists === 1) return { items: [] };
      if (failRefetch) throw new Error("offline");
      return afterSubmitList || { items: [SAVED] };
    },
    createAssetRequest: async (payload) => { calls.create.push(payload); return SAVED; },     // the api client returns the body itself
    getRequestableAssetTypes: async () => ({ items: [{ name: "Monitor", total: 2, available: 1 }] }),   // QA bug 19: the org's assets
  };
  t.mock.module("../src/service/employee.js", { exports: employeeApi });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", {
    exports: { default: ({ children }) => React.createElement("div", null, children) },
  });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Profile/Employee_AssetDetails.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByText("Request Asset"));
  await settle();
  await chooseOption("asset-request-type", /^Monitor/);
  fireEvent.change(screen.getByPlaceholderText("Describe why you need this asset..."), { target: { value: "Need a second screen" } });
  fireEvent.click(screen.getByText("Submit Request"));
  await settle();
  return calls;
}

test("A18: after submitting, the list shows the server's saved request exactly once", async (t) => {
  const calls = await loadEmployeePage(t);
  assert.equal(calls.create.length, 1);
  assert.ok(calls.lists >= 2, "the list is re-read from the server");
  const text = document.body.textContent;
  assert.match(text, /Need a second screen \(as stored\)/, "the row is the server's, not the form's");
  assert.equal(document.querySelectorAll("tbody tr").length, 1);
});

test("A18: if re-reading the list fails, the saved row (not a made-up one) still shows", async (t) => {
  await loadEmployeePage(t, { failRefetch: true });
  assert.match(document.body.textContent, /\(as stored\)/);
  assert.equal(document.querySelectorAll("tbody tr").length, 1);
});
