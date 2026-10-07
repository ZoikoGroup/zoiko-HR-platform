/** Typing "New Year, 2027, Public" must import, not say "No holidays were found"; and the calendar shows what was saved. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { parseHolidayText, validateRows, normalizeDate, parseDelimited, rowsFromTable, knownHolidayDate } from "../src/utils/holidayImport.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const check = async (text) => validateRows(await parseHolidayText(text));

test("a single line without a header row is a holiday, not a header", async () => {
  const { valid, problems } = await check("New Year, 2027, Public");
  assert.deepEqual(problems, []);
  assert.deepEqual(valid.map((r) => [r.name, r.date, r.type, r._assumed]), [["New Year", "2027-01-01", "Public", true]]);
});

test("a header row is still recognised, and headerless lines may use semicolons, tabs or pipes", async () => {
  assert.equal((await check("Name,Date,Type\nDiwali,2027-11-01,Company")).valid.length, 1);
  assert.equal((await check("Holiday;Date\nDiwali;2027-11-01")).valid.length, 1);
  assert.equal((await check("Diwali;2027-11-01;Company")).valid[0].type, "Company");
  assert.equal((await check("Diwali\t2027-11-01\tOptional")).valid[0].type, "Optional");
  assert.equal((await check("Diwali|2027-11-01")).valid[0].type, "Public");
});

test("several lines, quoted commas and blank lines", async () => {
  const { valid, problems } = await check('New Year, 2027, Public\n\nChristmas, 2027, Public\n"Founders Day, big", 10 Mar 2027, Company\n');
  assert.deepEqual(problems, []);
  assert.deepEqual(valid.map((r) => [r.name, r.date]), [["New Year", "2027-01-01"], ["Christmas", "2027-12-25"], ["Founders Day, big", "2027-03-10"]]);
});

test("a year alone is only accepted for well-known fixed-date holidays; otherwise it says what to enter", async () => {
  const { valid, problems } = await check("Founders Day, 2027, Company");
  assert.equal(valid.length, 0);
  assert.match(problems[0].error, /only a year.*2027-01-01/);
  assert.equal(knownHolidayDate("Republic Day", 2027), "2027-01-26");
  assert.equal(knownHolidayDate("Independence Day", 2027), "2027-08-15");
  assert.equal(knownHolidayDate("Diwali", 2027), "");
});

test("dates with month names and ordinals are understood; nonsense is not", () => {
  assert.equal(normalizeDate("January 1, 2027"), "2027-01-01");
  assert.equal(normalizeDate("1st Jan 2027"), "2027-01-01");
  assert.equal(normalizeDate("10-Mar-2027"), "2027-03-10");
  assert.equal(normalizeDate("31 Feb 2027"), "");
  assert.equal(normalizeDate("Foo 1 2027"), "");
});

test("the delimited reader handles Windows line endings and a byte-order mark", () => {
  assert.deepEqual(parseDelimited("﻿a,b\r\nc,d\r\n"), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(rowsFromTable([["x", "2027-01-01"]]), [{ name: "x", date: "2027-01-01", type: "", description: "", recurring: "" }]);
});

async function loadPage(t, { existing = [], importResult } = {}) {
  const sent = [];
  let list = existing;
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getHolidays: async () => list,
    createHoliday: async (p) => { list = [...list, { id: 50, ...p }]; return {}; },
    updateHoliday: async () => ({}), deleteHoliday: async () => ({}),
    importHolidays: async (p) => { sent.push(p); list = [...list, ...p.holidays.map((h, i) => ({ id: 100 + i, ...h }))]; return importResult || { total: p.holidays.length, imported: p.holidays.length, duplicates: 0, errors: [] }; },
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/attendance/holidays.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return sent;
}

test("typing 'New Year, 2027, Public' previews, imports, and the calendar jumps to January 2027", async (t) => {
  const sent = await loadPage(t);
  const now = new Date();
  assert.ok(screen.getByText(new RegExp(`${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][now.getMonth()]} ${now.getFullYear()}`)));
  fireEvent.click(screen.getByRole("button", { name: /^Import$/ }));
  fireEvent.change(screen.getByLabelText("Paste holidays"), { target: { value: "New Year, 2027, Public" } });
  fireEvent.click(screen.getByRole("button", { name: "Run Import" }));
  await settle();
  assert.doesNotMatch(document.body.textContent, /No holidays were found/);
  assert.match(document.body.textContent, /1 ready to import/);
  assert.match(document.body.textContent, /\(date filled in\)/);
  fireEvent.click(screen.getByRole("button", { name: /Import 1 holiday/ }));
  await settle();
  assert.deepEqual(sent, [{ holidays: [{ name: "New Year", date: "2027-01-01", type: "Public", description: "", is_recurring: false }] }], "no internal fields are sent");
  fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1));
  await settle();
  assert.ok(screen.getByRole("heading", { name: "January 2027" }), "the calendar shows the imported month");
  assert.match(document.body.textContent, /1 holiday imported\. Showing January 2027\./);
  assert.ok(screen.getAllByText("New Year").length > 0, "the holiday is visible on the calendar");
});

test("adding a single holiday for another year also jumps the calendar to it", async (t) => {
  await loadPage(t);
  fireEvent.click(screen.getByRole("button", { name: /Add Holiday/ }));
  fireEvent.change(screen.getByPlaceholderText("e.g. New Year's Day"), { target: { value: "Founders Day" } });
  fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: "2027-03-10" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Holiday" }));
  await settle();
  assert.ok(screen.getByRole("heading", { name: "March 2027" }));
  assert.match(document.body.textContent, /Holiday added\. Showing March 2027\./);
});
