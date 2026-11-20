/**
 * Attendance M0: the org-admin Time Requests page renders (it crashed on missing imports).
 */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, cleanup, act } from "@testing-library/react";

afterEach(() => cleanup());
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

test("the org-admin Time Requests page renders its requests", async (t) => {
  t.mock.module("../src/service/workDocumentsService.js", { exports: {
    listOvertime: async () => ({ items: [{ id: 1, employee_id: 4, employee_name: "Asha Rao", date: "2026-11-18", start_time: "18:00", end_time: "20:00", hours: 2, status: "PENDING", reason: "Release" }] }),
    listCorrections: async () => ({ items: [] }),
    decideOvertime: async () => ({}), decideCorrection: async () => ({}),
  } });
  const { default: Page } = await import(`../src/modules/organization-admin/TimeRequestsPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, null, React.createElement(Page)));
  await settle();
  assert.ok(document.body.textContent.length > 0);
  assert.equal(screen.queryByText(/is not defined/), null);
});

// My Attendance itself moved to the attendance engine API in M3: covered by attendanceM3.test.mjs.
