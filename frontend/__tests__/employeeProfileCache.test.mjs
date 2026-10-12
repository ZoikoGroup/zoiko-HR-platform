/** My Profile on the query cache: a revisit makes no requests; a failing extended profile is not a page error. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup, act } from "@testing-library/react";
import { testQueryClient, withQuery } from "./support/queryWrapper.mjs";

afterEach(() => cleanup());
const settle = (ms = 150) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const state = { me: 0, ext: 0, extFails: false };
mock.module("../src/service/employee.js", { exports: {
  getMyProfile: async () => { state.me += 1; return { id: 7, firstName: "Anne", lastName: "Lee", email: "anne@x.com" }; },
  getEmployeeProfile: async () => { state.ext += 1; if (state.extFails) throw new Error("no"); return { bank_name: "Axis" }; },
  updateMyProfile: async () => ({}), updateEmployeeProfile: async () => ({}),
} });
mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
const { default: Page } = await import("../src/pages/Peoples/Employees/Profile/EmployeeProfile.jsx");

test("a revisit within the freshness window makes no requests", async () => {
  Object.assign(state, { me: 0, ext: 0, extFails: false });
  const client = testQueryClient();
  const first = render(withQuery(React.createElement(Page), client));
  await settle();
  assert.match(document.body.textContent, /Anne/);
  assert.deepEqual([state.me, state.ext], [1, 1]);
  first.unmount();
  render(withQuery(React.createElement(Page), client));
  await settle();
  assert.match(document.body.textContent, /Anne/);
  assert.deepEqual([state.me, state.ext], [1, 1]);
});

test("the extended profile failing leaves the page showing the person", async () => {
  Object.assign(state, { extFails: true });
  render(withQuery(React.createElement(Page), testQueryClient()));
  await settle();
  assert.match(document.body.textContent, /Anne/);
  assert.doesNotMatch(document.body.textContent, /Failed to load profile/);
});
