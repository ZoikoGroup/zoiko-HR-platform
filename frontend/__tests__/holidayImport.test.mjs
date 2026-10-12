/** ZHR-57: Holiday import no longer throws "Unexpected end of JSON input"; it reads files, previews, and reports per row. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("excel serial dates and day-first dates become ISO without shifting a day", async () => {
  const { excelSerialToIso, normalizeDate } = await import("../src/utils/holidayImport.js");
  assert.equal(excelSerialToIso(46388), "2027-01-01");
  assert.equal(normalizeDate("25/12/2027"), "2027-12-25");
  assert.equal(normalizeDate("2027-02-30"), "");
  assert.equal(normalizeDate("not a date"), "");
});

test("CSV text parses with flexible headers; bad rows are listed, not dropped silently", async () => {
  const { parseHolidayText, validateRows } = await import("../src/utils/holidayImport.js");
  const rows = await parseHolidayText("Holiday,Date,Type,Recurring\nNew Year,2027-01-01,public,yes\n,2027-02-01,Public,\nBad,xx,Public,\nOdd,2027-03-01,Floating,\nNew Year,2027-01-01,Public,");
  const { valid, problems } = validateRows(rows);
  assert.deepEqual(valid.map((r) => [r.name, r.date, r.type, r.is_recurring]), [["New Year", "2027-01-01", "Public", true]]);
  assert.equal(problems.length, 4);
  assert.match(problems[3].error, /twice/);
});

test("pasted JSON may be a list or {holidays: []}; broken JSON gives a readable message", async () => {
  const { parseHolidayText } = await import("../src/utils/holidayImport.js");
  assert.equal((await parseHolidayText('[{"name":"A","date":"2027-01-01"}]')).length, 1);
  assert.equal((await parseHolidayText('{"holidays":[{"name":"A","date":"2027-01-01"}]}')).length, 1);
  await assert.rejects(parseHolidayText("[{"), /not valid JSON/);
  await assert.rejects(parseHolidayText("   "), /Choose a file or paste/);
});

async function loadPage(t, importHolidays) {
  const sent = [];
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getHolidays: async () => [], createHoliday: async () => ({}), updateHoliday: async () => ({}), deleteHoliday: async () => ({}),
    importHolidays: async (p) => { sent.push(p); return importHolidays(p); },
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/attendance/holidays.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /^Import$/ }));
  return sent;
}

test("Run Import with nothing entered explains itself inside the dialog", async (t) => {
  const sent = await loadPage(t, async () => ({}));
  fireEvent.click(screen.getByRole("button", { name: "Run Import" }));
  await settle();
  const alert = screen.getByRole("alert");
  assert.match(alert.textContent, /Choose a file or paste/);
  assert.doesNotMatch(document.body.textContent, /Unexpected end of JSON/);
  assert.equal(sent.length, 0);
});

test("pasted CSV is previewed, then only valid rows are sent and the result is summarised", async (t) => {
  const sent = await loadPage(t, async () => ({ total: 1, imported: 1, duplicates: 0, errors: [] }));
  fireEvent.change(screen.getByLabelText("Paste holidays"), { target: { value: "Name,Date,Type\nDiwali,2027-11-01,Company\n,2027-12-01,Public" } });
  fireEvent.click(screen.getByRole("button", { name: "Run Import" }));
  await settle();
  assert.match(document.body.textContent, /1 ready to import, 1 with problems/);
  fireEvent.click(screen.getByRole("button", { name: /Import 1 holiday/ }));
  await settle();
  assert.deepEqual(sent, [{ holidays: [{ name: "Diwali", date: "2027-11-01", type: "Company", description: "", is_recurring: false }] }]);
  assert.match(document.body.textContent, /1 holiday imported, 1 not imported/);
  assert.match(document.body.textContent, /Row 2: Name is required/);
});

test("a server rejection shows its message in the dialog", async (t) => {
  await loadPage(t, async () => { throw new Error("This action requires admin privileges."); });
  fireEvent.change(screen.getByLabelText("Paste holidays"), { target: { value: '[{"name":"A","date":"2027-01-01"}]' } });
  fireEvent.click(screen.getByRole("button", { name: "Run Import" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /Import 1 holiday/ }));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /requires admin privileges/);
});
