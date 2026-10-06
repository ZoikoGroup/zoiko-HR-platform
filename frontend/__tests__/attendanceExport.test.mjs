/** ZHR-56: the CSV and Excel attendance downloads are different files with the right names. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });

async function loadService(t) {
  t.mock.module("../src/service/api.js", { exports: { api: {}, getAccessToken: () => "tok", API_BASE_URL: "http://api.test", refreshSession: async () => false } });
  return import(`../src/service/hrService.js?t=${Math.random()}`);
}

function fakeFetch(handler) {
  const urls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { urls.push([url, opts]); return handler(url); };
  return { urls, restore: () => { globalThis.fetch = original; } };
}

function captureDownloads() {
  const saved = [];
  const U = window.URL;
  const had = { create: Object.getOwnPropertyDescriptor(U, "createObjectURL"), revoke: Object.getOwnPropertyDescriptor(U, "revokeObjectURL") };
  U.createObjectURL = (blob) => { saved.push({ blob }); return "blob:x"; };
  U.revokeObjectURL = () => {};
  const proto = window.HTMLElement.prototype;
  const clickDesc = Object.getOwnPropertyDescriptor(proto, "click");
  proto.click = function () { if (this.tagName === "A") saved[saved.length - 1].name = this.download; };
  return {
    saved,
    restore: () => {
      Object.defineProperty(proto, "click", clickDesc);
      if (had.create) Object.defineProperty(U, "createObjectURL", had.create); else delete U.createObjectURL;
      if (had.revoke) Object.defineProperty(U, "revokeObjectURL", had.revoke); else delete U.revokeObjectURL;
    },
  };
}

const response = (body, type, disposition) => ({
  ok: true, status: 200, blob: async () => new Blob([body], { type }),
  headers: { get: (h) => (h.toLowerCase() === "content-disposition" ? disposition : null) },
});

test("CSV and Excel hit different endpoints and are saved under the server's file names", async (t) => {
  const { exportAttendanceCsv, exportAttendanceExcel } = await loadService(t);
  const net = fakeFetch((url) => (url.includes("/export/csv")
    ? response("a,b", "text/csv", 'attachment; filename="attendance_2026-10-01_2026-10-31.csv"')
    : response("PK", "application/octet-stream", 'attachment; filename="attendance_2026-10-01_2026-10-31.xlsx"')));
  const dl = captureDownloads();
  try {
    const csvName = await exportAttendanceCsv({ date_from: "2026-10-01", date_to: "2026-10-31" });
    const xlsxName = await exportAttendanceExcel({ date_from: "2026-10-01", date_to: "2026-10-31" });
    assert.equal(csvName, "attendance_2026-10-01_2026-10-31.csv");
    assert.equal(xlsxName, "attendance_2026-10-01_2026-10-31.xlsx");
    assert.match(net.urls[0][0], /\/hr\/attendance\/export\/csv\?date_from=2026-10-01&date_to=2026-10-31$/);
    assert.match(net.urls[1][0], /\/hr\/attendance\/export\/excel\?/);
    assert.equal(net.urls[0][1].headers.Authorization, "Bearer tok");
    assert.deepEqual(dl.saved.map((s) => s.name), [csvName, xlsxName]);
  } finally { net.restore(); dl.restore(); }
});

test("without a Content-Disposition the extension still matches the format", async (t) => {
  const { exportAttendanceCsv, exportAttendanceExcel } = await loadService(t);
  const net = fakeFetch(() => response("x", "application/octet-stream", ""));
  const dl = captureDownloads();
  try {
    assert.equal(await exportAttendanceCsv(), "attendance_export.csv");
    assert.equal(await exportAttendanceExcel(), "attendance_export.xlsx");
  } finally { net.restore(); dl.restore(); }
});

test("a refused export shows the server's reason", async (t) => {
  const { exportAttendanceExcel } = await loadService(t);
  const net = fakeFetch(() => ({ ok: false, status: 403, json: async () => ({ message: "This action requires admin privileges." }), headers: { get: () => null } }));
  try {
    await assert.rejects(exportAttendanceExcel(), /requires admin privileges/);
  } finally { net.restore(); }
});

test("the Analytics page offers both formats and sends the chosen month as a date range", async (t) => {
  const calls = [];
  const noop = async () => ({});
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getAttendanceKpis: async () => ({ changes: {} }), getAttendance: async () => ({ items: [] }), getAttendanceAnalytics: async () => ({}), getAttendanceTrends: async () => [], getDepartmentAnalysis: async () => [], getOvertimeAnalytics: async () => [],
    getAttendanceRecords: async () => ({ items: [] }), getShiftEfficiency: noop, getShifts: async () => [], getHrEmployees: async () => ({ items: [] }),
    exportAttendanceCsv: async (p) => { calls.push(["csv", p]); },
    exportAttendanceExcel: async (p) => { calls.push(["excel", p]); },
  }, });
  let Page;
  try { ({ default: Page } = await import("../src/modules/zoiko-hr/attendance/analytics.jsx")); } catch (e) { assert.fail(`analytics page could not load: ${e.message}`); }
  render(React.createElement(Page));
  await settle();
  fireEvent.change(document.querySelector('input[type="month"]'), { target: { value: "2026-02" } });
  fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
  fireEvent.click(screen.getByRole("button", { name: /Export Excel/ }));
  await settle();
  assert.deepEqual(calls, [
    ["csv", { date_from: "2026-02-01", date_to: "2026-02-28" }],
    ["excel", { date_from: "2026-02-01", date_to: "2026-02-28" }],
  ]);
});

test("the old single Export Report button and the unused analytics params are gone", () => {
  const src = fs.readFileSync("src/modules/zoiko-hr/attendance/analytics.jsx", "utf8");
  assert.doesNotMatch(src, /Export Report|analytics: true/);
});
