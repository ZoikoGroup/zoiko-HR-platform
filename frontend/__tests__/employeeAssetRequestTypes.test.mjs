/** QA bug 19: "Request New Asset" offers the organisation's own assets (Assets page), not a fixed list of laptops, webcams … */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { chooseOption, optionTexts } from "./support/searchableSelect.mjs";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

async function mount(t, { types = [{ name: "laptop", total: 2, available: 1 }, { name: "mouse", total: 1, available: 0 }], fail = false } = {}) {
  const posted = [];
  t.mock.module("../src/service/employee.js", { exports: {
    getMyProfile: async () => ({ id: 7 }),
    getMyAssets: async () => ({ items: [] }),
    getAssetRequests: async () => ({ items: [] }),
    createAssetRequest: async (body) => { posted.push(body); return { id: 1, ...body, status: "pending" }; },
    getRequestableAssetTypes: async () => { if (fail) throw new Error("Network down"); return { items: types }; },
  } });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Profile/Employee_AssetDetails.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /Request Asset/ }));
  await settle();
  return posted;
}

test("the list holds only the organisation's assets, with how many are free", async (t) => {
  await mount(t);
  const field = document.getElementById("asset-request-type");
  const texts = await optionTexts(field);
  assert.deepEqual(texts.map((x) => x.replace(/\s+/g, " ").trim()), ["laptop1 available", "mouseNone free now"]);
  assert.ok(!texts.some((x) => /Webcam|Docking|ID Card/.test(x)), "no fixed catalogue");
});

test("choosing an asset and giving a reason sends the request for that asset", async (t) => {
  const posted = await mount(t);
  await chooseOption(document.getElementById("asset-request-type"), /^mouse/);
  fireEvent.change(screen.getByPlaceholderText(/Describe why/), { target: { value: "My mouse stopped working" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit Request" }));
  await settle();
  assert.equal(posted.length, 1);
  assert.equal(posted[0].asset_type, "mouse");
});

test("with no assets in the organisation it says so and nothing can be submitted", async (t) => {
  await mount(t, { types: [] });
  assert.match(screen.getByRole("status").textContent, /has not added any assets yet/);
  assert.equal(document.getElementById("asset-request-type"), null);
  assert.equal(screen.getByRole("button", { name: "Submit Request" }).disabled, true);
});

test("if the list cannot be read the dialog says so", async (t) => {
  await mount(t, { fail: true });
  assert.match(screen.getByRole("alert").textContent, /Network down/);
  assert.equal(screen.getByRole("button", { name: "Submit Request" }).disabled, true);
});
