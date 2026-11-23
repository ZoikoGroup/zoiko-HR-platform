/** Assets audit A12: the Org Admin Assets page can edit, delete, return (unassign) and transfer assets and manage
 * categories; server messages show inline in the dialog and buttons are disabled while a request runs. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

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

const SPARE = { id: 7, name: "Laptop 7", asset_tag: "LT-7", status: "available", category: "Laptops", condition: "good" };
const HELD = { id: 8, name: "Phone 8", asset_tag: "PH-8", status: "assigned", employee_id: 5, employee_name: "Ann Lee" };

async function loadPage(t, routes = {}) {
  const { api, calls } = makeApi({
    "get /hr/assets": () => ({ total: 2, items: [SPARE, HELD] }),
    "get /hr/assets/dashboard": () => ({ total_assets: 2, assigned_count: 1, available_count: 1 }),
    "get /hr/assets/categories": () => [{ id: 1, name: "Laptops" }, { id: 2, name: "Phones" }],
    ...routes,
  });
  current = api;
  t.mock.module("../src/service/hrService.js", { exports: hr });
  const { default: Page } = await import(`../src/modules/organization-admin/AssetsPage.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

const fail = (message) => () => { throw new Error(message); };
const listLoads = (calls) => calls.filter((c) => c.method === "get" && c.url === "/hr/assets").length;

test("edit: details are saved, the holder is never sent and 'assigned' is not offered for an available asset", async (t) => {
  const calls = await loadPage(t, { "put /hr/assets/7": (_, body) => ({ ...SPARE, ...body }) });
  const before = listLoads(calls);
  fireEvent.click(screen.getByLabelText("Edit LT-7"));
  const dialog = screen.getByRole("dialog", { name: "Edit asset" });
  const statuses = [...within(dialog).getByLabelText("Status").querySelectorAll("option")].map((o) => o.value);
  assert.ok(!statuses.includes("assigned"));
  fireEvent.change(within(dialog).getByLabelText("Name *"), { target: { value: "MacBook Pro" } });
  fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "maintenance" } });
  fireEvent.click(within(dialog).getByText("Save changes"));
  await settle();
  const put = calls.find((c) => c.method === "put");
  assert.equal(put.url, "/hr/assets/7");
  assert.equal(put.body.name, "MacBook Pro");
  assert.equal(put.body.status, "maintenance");
  assert.ok(!("employee_id" in put.body), "the holder is changed only by assign / transfer / return");
  assert.equal(screen.queryByRole("dialog"), null);
  assert.ok(listLoads(calls) > before, "the list reloads after saving");
});

test("edit: the server's message shows inline and Save is disabled while saving", async (t) => {
  let release;
  await loadPage(t, {
    "put /hr/assets/7": () => new Promise((_, reject) => { release = () => reject(new Error("Asset tag 'LT-1' already exists in this organization")); }),
  });
  fireEvent.click(screen.getByLabelText("Edit LT-7"));
  const dialog = screen.getByRole("dialog", { name: "Edit asset" });
  fireEvent.click(within(dialog).getByText("Save changes"));
  await settle(50);
  const busy = within(dialog).getByText("Saving...").closest("button");
  assert.equal(busy.disabled, true);
  assert.equal(within(dialog).getByText("Cancel").disabled, true);
  await act(async () => { release(); });
  await settle(50);
  assert.match(within(dialog).getByRole("alert").textContent, /already exists in this organization/);
  assert.equal(within(dialog).getByText("Save changes").closest("button").disabled, false);
});

test("edit: an assigned asset keeps 'assigned' as an option and warns that another status ends the assignment", async (t) => {
  await loadPage(t);
  fireEvent.click(screen.getByLabelText("Edit PH-8"));
  const dialog = screen.getByRole("dialog", { name: "Edit asset" });
  const select = within(dialog).getByLabelText("Status");
  assert.equal(select.value, "assigned");
  fireEvent.change(select, { target: { value: "lost" } });
  assert.match(dialog.textContent, /ends the assignment to Ann Lee/);
});

test("delete: confirm first, and the server's refusal for an assigned asset shows in the dialog", async (t) => {
  const calls = await loadPage(t, {
    "delete /hr/assets/8": fail("Asset PH-8 is assigned to Ann Lee. Return it before deleting it."),
    "delete /hr/assets/7": () => ({ message: "deleted" }),
  });
  fireEvent.click(screen.getByLabelText("Delete PH-8"));
  let dialog = screen.getByRole("dialog", { name: "Delete asset" });
  assert.ok(!calls.some((c) => c.method === "delete"), "nothing is deleted before confirming");
  fireEvent.click(within(dialog).getByText("Delete"));
  await settle();
  assert.match(within(dialog).getByRole("alert").textContent, /Return it before deleting it/);
  fireEvent.click(within(dialog).getByText("Cancel"));
  fireEvent.click(screen.getByLabelText("Delete LT-7"));
  dialog = screen.getByRole("dialog", { name: "Delete asset" });
  fireEvent.click(within(dialog).getByText("Delete"));
  await settle();
  assert.ok(calls.some((c) => c.method === "delete" && c.url === "/hr/assets/7"));
  assert.equal(screen.queryByRole("dialog"), null);
});

test("return: needs a reason, sends the condition, and is offered only for assigned assets", async (t) => {
  const calls = await loadPage(t, { "put /hr/assets/8/return": () => ({ ...HELD, status: "available", employee_id: null }) });
  assert.equal(screen.queryByLabelText("Return LT-7"), null);
  fireEvent.click(screen.getByLabelText("Return PH-8"));
  const dialog = screen.getByRole("dialog", { name: "Return asset" });
  fireEvent.click(within(dialog).getByText("Return asset", { selector: "button" }));
  await settle(50);
  assert.match(within(dialog).getByRole("alert").textContent, /reason/);
  assert.ok(!calls.some((c) => c.method === "put"));
  fireEvent.change(within(dialog).getByLabelText("Reason *"), { target: { value: "leaving" } });
  fireEvent.change(within(dialog).getByLabelText("Condition on return"), { target: { value: "poor" } });
  fireEvent.click(within(dialog).getByText("Return asset", { selector: "button" }));
  await settle();
  const put = calls.find((c) => c.method === "put");
  assert.deepEqual([put.url, put.body], ["/hr/assets/8/return", { reason: "leaving", condition: "poor" }]);
});

test("transfer: picks another active employee from the server (not the current holder)", async (t) => {
  const calls = await loadPage(t, {
    "get /hr/assets/employee-options": () => [
      { id: 5, first_name: "Ann", last_name: "Lee", full_name: "Ann Lee" },
      { id: 6, first_name: "Raj", last_name: "Kumar", full_name: "Raj Kumar" },
    ],
    "put /hr/assets/8/transfer": () => ({ ...HELD, employee_id: 6 }),
  });
  assert.equal(screen.queryByLabelText("Transfer LT-7"), null);
  fireEvent.click(screen.getByLabelText("Transfer PH-8"));
  await settle(600);
  const dialog = screen.getByRole("dialog", { name: "Transfer asset" });
  assert.equal(within(dialog).queryByText("Ann Lee"), null, "the current holder is not offered");
  assert.equal(within(dialog).getByText("Transfer", { selector: "button" }).disabled, true);
  fireEvent.click(within(dialog).getByText("Raj Kumar"));
  fireEvent.click(within(dialog).getByText("Transfer", { selector: "button" }));
  await settle();
  const put = calls.find((c) => c.method === "put");
  assert.deepEqual([put.url, put.body], ["/hr/assets/8/transfer", { employee_id: 6 }]);
});

test("categories: create shows the per-organization duplicate message; rename and delete call the server", async (t) => {
  const calls = await loadPage(t, {
    "post /hr/assets/categories": fail("Asset category 'laptops' already exists in this organization"),
    "put /hr/assets/categories/2": (_, body) => ({ id: 2, ...body }),
    "delete /hr/assets/categories/1": () => ({ message: "deleted" }),
  });
  fireEvent.click(screen.getByText("Categories"));
  const dialog = screen.getByRole("dialog", { name: "Asset categories" });
  fireEvent.change(within(dialog).getByLabelText("New category name"), { target: { value: "laptops" } });
  fireEvent.click(within(dialog).getByText("Add"));
  await settle();
  assert.match(within(dialog).getByRole("alert").textContent, /already exists in this organization/);

  fireEvent.click(within(dialog).getByLabelText("Rename Phones"));
  fireEvent.change(within(dialog).getByLabelText("New name for Phones"), { target: { value: "Mobiles" } });
  fireEvent.click(within(dialog).getByText("Save"));
  await settle();
  const put = calls.find((c) => c.method === "put");
  assert.equal(put.url, "/hr/assets/categories/2");
  assert.equal(put.body.name, "Mobiles");

  fireEvent.click(within(dialog).getByLabelText("Delete Laptops"));
  assert.ok(!calls.some((c) => c.method === "delete"), "deleting asks first");
  fireEvent.click(within(dialog).getByText("Yes, delete"));
  await settle();
  assert.ok(calls.some((c) => c.method === "delete" && c.url === "/hr/assets/categories/1"));
  assert.ok(calls.filter((c) => c.url === "/hr/assets/categories" && c.method === "get").length >= 2, "the list reloads");
});

test("assign: the server's refusal shows inside the Assign dropdown", async (t) => {
  await loadPage(t, {
    "get /hr/assets/employee-options": () => [{ id: 9, first_name: "Old", last_name: "Timer", full_name: "Old Timer" }],
    "put /hr/assets/7/assign": fail("Old Timer is no longer an active employee (status: terminated); assets can only be given to active staff."),
  });
  fireEvent.click(screen.getByText("Assign", { selector: "button" }));
  await settle(600);
  fireEvent.click(screen.getByText("Old Timer"));
  const buttons = screen.getAllByText("Assign", { selector: "button" });
  fireEvent.click(buttons.at(-1));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /no longer an active employee/);
});
