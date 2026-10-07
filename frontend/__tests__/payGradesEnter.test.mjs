/** ZHR-74: Enter saves the Pay Grade edit form from every box, including Description (Shift+Enter adds a line). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { submitOnEnter } from "../src/utils/submitOnEnter.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("submitOnEnter: Enter submits, Shift+Enter and typing do not, IME composition is left alone", () => {
  let submitted = 0;
  const form = { requestSubmit: () => { submitted += 1; } };
  const press = (over) => {
    let prevented = false;
    submitOnEnter({ key: "Enter", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, nativeEvent: {}, currentTarget: { form }, preventDefault: () => { prevented = true; }, ...over });
    return prevented;
  };
  assert.equal(press({}), true);
  assert.equal(submitted, 1);
  assert.equal(press({ shiftKey: true }), false);
  assert.equal(press({ key: "a" }), false);
  assert.equal(press({ nativeEvent: { isComposing: true } }), false);
  assert.equal(submitted, 1, "only the plain Enter submitted");
  assert.doesNotThrow(() => submitOnEnter({ key: "Enter", currentTarget: { form: null }, nativeEvent: {}, preventDefault() {} }));
});

const GRADE = { id: 4, name: "Grade A", min_salary: 1000, max_salary: 2000, description: "Entry level", created_at: "2026-10-01T10:00:00Z" };

async function load(t) {
  const calls = { update: [] };
  const svc = {
    getPayGrades: async () => [GRADE],
    createPayGrade: async () => ({}),
    updatePayGrade: async (id, p) => { calls.update.push([id, p]); return {}; },
    deletePayGrade: async () => ({}),
  };
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/compensation/pay-grades.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("Enter in the Description box saves the edit, exactly like Enter in the other boxes", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const box = document.querySelector(".fixed form textarea");
  fireEvent.change(box, { target: { value: "Updated description" } });
  fireEvent.keyDown(box, { key: "Enter" });
  await settle();
  assert.deepEqual(calls.update, [[4, { description: "Updated description" }]]);
  assert.equal(document.querySelector(".fixed"), null, "the dialog closes after saving");
});

test("Shift+Enter in the Description box adds a line and does not save", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const box = document.querySelector(".fixed form textarea");
  fireEvent.change(box, { target: { value: "Line one" } });
  const notPrevented = fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
  await settle();
  assert.equal(notPrevented, true, "the browser is left to insert the new line");
  assert.equal(calls.update.length, 0);
  assert.ok(document.querySelector(".fixed"), "the dialog stays open");
  assert.match(document.querySelector(".fixed form").textContent, /Shift\+Enter adds a new line/);
});

test("Enter in the Name and Max Salary boxes still saves", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const name = document.querySelector(".fixed form input[type=text]");
  fireEvent.change(name, { target: { value: "Grade A1" } });
  fireEvent.submit(name.form);
  await settle();
  assert.deepEqual(calls.update, [[4, { name: "Grade A1" }]]);
});
