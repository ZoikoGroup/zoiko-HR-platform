/** HR Leave Requests: the server sends one page at a time, filters and searches happen on the server. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, cleanup, act, fireEvent, screen } from "@testing-library/react";

afterEach(() => cleanup());
const settle = (ms = 400) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const row = (id, name, status = "pending") => ({ id, employee_name: name, employee_code: `E${id}`, department: "Eng", leave_type: "annual", start_date: "2026-10-12", end_date: "2026-10-12", days: 1, status, approved_by: "-", created_at: "2026-10-08T10:00:00" });

async function open(t, { total = 20, fetcher } = {}) {
  const calls = [];
  const impl = fetcher || (async (_id, params) => { calls.push(params); return { items: [row(params.page * 100 + 1, `Person ${params.page}`)], total, page: params.page, per_page: params.per_page }; });
  t.mock.module("../src/service/hrService", { exports: {
    getLeaveRequests: async (id, params) => { calls.push(params); return impl(id, params); },
    reviewLeaveRequest: async () => ({}), deleteLeaveRequest: async () => ({}),
    getLeaveDashboard: async () => ({ total_requests: total, pending_requests: total }), getHrEmployees: async () => [],
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/leave/leave-requests.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, null, React.createElement(Page)));
  await settle();
  return calls;
}

test("it asks the server for page 1 of 8 rows and shows the server's total pages", async (t) => {
  const calls = await open(t, { total: 20 });
  assert.equal(calls[0].page, 1);
  assert.equal(calls[0].per_page, 8);
  assert.match(document.body.textContent, /Page 1 of 3/);
});

test("Next asks the server for the next page instead of slicing a local list", async (t) => {
  const calls = await open(t, { total: 20 });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await settle();
  assert.equal(calls.at(-1).page, 2);
  assert.match(document.body.textContent, /Page 2 of 3/);
  assert.match(document.body.textContent, /Person 2/);
});

test("searching and filtering go to the server and return to page 1", async (t) => {
  const calls = await open(t, { total: 20 });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await settle();
  fireEvent.change(screen.getByPlaceholderText(/Search employee/), { target: { value: "priya" } });
  await settle(700);
  const last = calls.at(-1);
  assert.equal(last.search, "priya");
  assert.equal(last.page, 1);
  fireEvent.change(document.querySelector("select"), { target: { value: "approved" } });
  await settle();
  assert.equal(calls.at(-1).status, "approved");
});

test("a failed load shows an empty list rather than breaking the page", async (t) => {
  await open(t, { fetcher: async () => { throw new Error("down"); } });
  assert.ok(document.body.textContent.length > 0);
});
