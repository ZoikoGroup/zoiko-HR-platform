/** Audit Logs on the query cache: filter options are reused, a revisit is instant, a page change keeps the rows. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, cleanup, act, screen, fireEvent } from "@testing-library/react";
import { testQueryClient, withQuery } from "./support/queryWrapper.mjs";

afterEach(() => cleanup());
const settle = (ms = 150) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const h = React.createElement;
const state = { logCalls: [], filterCalls: 0, delay: 0 };
const row = (id, action) => ({ id, action, entity_type: "organization", entity_id: String(id), performed_by_email: "a@b.com", actor_name: "Ann", status: "success", created_at: "2026-10-09T10:00:00Z", description: `event ${id}` });
mock.module("../src/service/superAdminService.js", { exports: { superAdminService: {
  getAuditLogFilters: async () => { state.filterCalls += 1; return { actions: ["create"], entity_types: ["organization"] }; },
  getAuditLogs: async (params) => { state.logCalls.push(params); await new Promise((r) => setTimeout(r, state.delay)); return { logs: [row(params.page === 2 ? 99 : 1, "create")], total: 120 }; },
} } });
const { default: Page } = await import("../src/modules/super-admin/AuditLogsPage.jsx");
const ui = (client) => withQuery(h(MemoryRouter, null, h(Page)), client);

test("a revisit within the freshness window makes no new requests", async () => {
  state.logCalls = []; state.filterCalls = 0; state.delay = 0;
  const client = testQueryClient();
  const first = render(ui(client));
  await settle();
  assert.equal(state.logCalls.length, 1);
  assert.equal(state.filterCalls, 1);
  first.unmount();
  render(ui(client));
  await settle();
  assert.equal(state.logCalls.length, 1);
  assert.equal(state.filterCalls, 1);
});

test("going to the next page keeps the current rows visible until the new page arrives", async () => {
  state.logCalls = []; state.delay = 400;
  render(ui(testQueryClient()));
  await settle(600);
  const before = document.body.textContent;
  assert.match(before, /#1(?!\d)/);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  await settle(80);
  assert.match(document.body.textContent, /#1(?!\d)/, "old rows remain while page 2 loads");
  await settle(600);
  assert.match(document.body.textContent, /#99/);
  assert.equal(state.logCalls.at(-1).page, 2);
});
