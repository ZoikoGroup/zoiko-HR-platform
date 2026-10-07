/** Audit Logs show times in the viewer's own timezone, named plainly (IST, not GMT+5:30 or UTC). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

const realTz = process.env.TZ;
afterEach(() => { cleanup(); if (realTz === undefined) delete process.env.TZ; else process.env.TZ = realTz; });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

test("a UTC instant is shown as India time, labelled IST", async () => {
  process.env.TZ = "Asia/Kolkata";
  const { formatDateTimeWithZone, timeZoneLabel } = await import(`../src/utils/dateTime.js?t=${Math.random()}`);
  assert.equal(formatDateTimeWithZone("2026-10-07T04:00:00Z"), "07 Oct 2026, 09:30:00 IST");
  assert.equal(formatDateTimeWithZone("2026-09-30T23:30:00Z"), "01 Oct 2026, 05:00:00 IST", "the date rolls over with the conversion");
  assert.equal(timeZoneLabel(new Date("2026-10-07T04:00:00Z")), "IST");
});

test("the legacy Calcutta zone name is also IST, and other zones keep their own label", async () => {
  const mod = await import(`../src/utils/dateTime.js?t=${Math.random()}`);
  process.env.TZ = "Asia/Calcutta";
  assert.equal(mod.timeZoneLabel(new Date("2026-10-07T04:00:00Z")), "IST");
  process.env.TZ = "America/New_York";
  assert.equal(mod.formatDateTimeWithZone("2026-10-07T04:00:00Z"), "07 Oct 2026, 00:00:00 GMT-4");
});

test("the Audit Logs table and detail dialog show IST and no UTC", async (t) => {
  process.env.TZ = "Asia/Kolkata";
  t.mock.module("react-router-dom", { exports: { useSearchParams: () => [new URLSearchParams(), () => {}], useNavigate: () => () => {}, Link: ({ children }) => children } });
  const log = { id: 7, action: "create", entity_type: "Organization", entity_id: 1, performed_by_email: "root@example.com", created_at: "2026-10-07T04:00:00Z", details: null, ip_address: null };
  t.mock.module("../src/service/superAdminService.js", { exports: { superAdminService: {
    getAuditLogFilters: async () => ({ actions: [], entity_types: [] }),
    getAuditLogs: async () => ({ logs: [log], total: 1, page: 1, page_size: 50 }),
  } } });
  let Page;
  try {
    ({ default: Page } = await import(`../src/modules/super-admin/AuditLogsPage.jsx?t=${Math.random()}`));
  } catch (e) { assert.fail(`AuditLogsPage could not load: ${e.message}`); }
  render(React.createElement(Page));
  await settle();
  assert.match(document.body.textContent, /07 Oct 2026, 09:30:00 IST/);
  assert.doesNotMatch(document.body.textContent, /UTC/);
  assert.equal(document.querySelector("[title*='UTC']"), null, "no hover text in UTC either");
  fireEvent.click(screen.getByRole("button", { name: "View" }));
  await settle();
  const dialog = screen.getByRole("dialog");
  assert.match(dialog.textContent, /Time \(IST\)/);
  assert.match(dialog.textContent, /09:30:00 IST/);
  assert.doesNotMatch(dialog.textContent, /UTC/);
});
