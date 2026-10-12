/** ZHR-72: a training program cannot be added or edited with the details learners rely on left blank. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateProgramForm, programPayload, programToForm, serverProgramErrors, missingProgramDetails, statusOptions, EMPTY_PROGRAM } from "../src/utils/programForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const FULL = { name: "Leadership Workshop", description: "Two days on leading teams.", instructor_id: "5", start_date: "2027-03-01", end_date: "2027-03-02", max_participants: "20", department: "", resource_link: "", status: "planned" };

test("every detail a learner relies on is required, each with its own message", () => {
  assert.deepEqual(validateProgramForm(FULL), {});
  assert.deepEqual(Object.keys(validateProgramForm({ ...EMPTY_PROGRAM })).sort(), ["description", "end_date", "instructor_id", "max_participants", "name", "start_date"]);
  assert.equal(validateProgramForm({ ...FULL, end_date: "2027-02-01" }).end_date, "The end date cannot be before the start date.");
  assert.equal(validateProgramForm({ ...FULL, end_date: "2027-03-01" }).end_date, undefined, "a one-day program is fine");
  assert.equal(validateProgramForm({ ...FULL, max_participants: "0" }).max_participants, "Maximum participants must be between 1 and 10000.");
  assert.equal(validateProgramForm({ ...FULL, max_participants: "2.5" }).max_participants, "Maximum participants must be a whole number.");
  assert.match(validateProgramForm({ ...FULL, start_date: "1999-01-01" }).start_date, /2000 and 2100/);
  assert.match(validateProgramForm({ ...FULL, resource_link: "abc" }).resource_link, /http/);
  assert.match(validateProgramForm({ ...FULL, instructor_id: "" }).instructor_id, /Choose the instructor/);
});

test("the payload is clean, status moves forward only, and an old program's gaps are reported", () => {
  assert.deepEqual(programPayload({ ...FULL, name: "  Leadership   Workshop ", department: " " }), {
    name: "Leadership Workshop", description: "Two days on leading teams.", instructor_id: 5, start_date: "2027-03-01", end_date: "2027-03-02",
    max_participants: 20, department: null, resource_link: null, status: "planned",
  });
  assert.deepEqual(statusOptions("completed").map((o) => o.value), ["completed"]);
  assert.deepEqual(statusOptions("cancelled").map((o) => o.value), ["cancelled", "planned"]);
  assert.deepEqual(statusOptions("planned").map((o) => o.value), ["planned", "active", "completed", "cancelled"]);
  assert.deepEqual(missingProgramDetails({ name: "x", description: "", instructor_id: null, start_date: null, end_date: "2027-01-01", max_participants: 0 }), ["description", "instructor", "start date", "maximum participants"]);
  assert.equal(programToForm({ name: "X", instructor_id: 9, start_date: "2027-03-01T00:00:00", max_participants: 4 }).start_date, "2027-03-01");
  assert.equal(serverProgramErrors([{ loc: ["body"], msg: "Value error, The end date cannot be before the start date." }]).end_date, "The end date cannot be before the start date.");
  assert.equal(serverProgramErrors([{ loc: ["body", "name"], msg: "Field required" }]).name, "Program name is required.");
});

const OLD = { id: 3, name: "Legacy program", description: "", instructor_id: null, start_date: null, end_date: null, status: "planned", max_participants: null, participants_count: 0, department: null };

async function load(t, over = {}) {
  const calls = { create: [], update: [] };
  const svc = {
    getTrainingPrograms: async () => ({ items: over.items ?? [OLD] }),
    getTrainingProgramById: async (id) => (over.items ?? [OLD]).find((p) => p.id === id),
    createTrainingProgram: async (p) => { calls.create.push(p); if (over.createError) throw over.createError; return {}; },
    updateTrainingProgram: async (id, p) => { calls.update.push([id, p]); if (over.updateError) throw over.updateError; return {}; },
    deleteTrainingProgram: async () => ({}),
    getHrEmployees: async () => ({ items: [{ id: 5, first_name: "Sam", last_name: "Lee" }, { id: 6, first_name: "Ann", last_name: "Roy" }] }),
  };
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/learning/training-programs.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

const set = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });

test("an incomplete program is flagged, and Update refuses until every missing detail is filled in", async (t) => {
  const calls = await load(t);
  assert.ok(screen.getByText("Incomplete"));
  assert.match(document.body.textContent, /1 incomplete program/);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Update Program" }));
  await settle();
  const text = document.querySelector(".fixed").textContent;
  for (const want of ["Description is required", "Choose the instructor", "Start date is required", "End date is required", "Maximum participants is required"]) assert.match(text, new RegExp(want));
  assert.equal(calls.update.length, 0);
  set("p-desc", "Covers the basics."); set("p-instructor", "6"); set("p-start", "2027-04-01"); set("p-end", "2027-04-03"); set("p-max", "15");
  fireEvent.click(screen.getByRole("button", { name: "Update Program" }));
  await settle();
  assert.deepEqual(calls.update, [[3, { name: "Legacy program", description: "Covers the basics.", instructor_id: 6, start_date: "2027-04-01", end_date: "2027-04-03", max_participants: 15, department: null, resource_link: null }]]);
  assert.equal(document.querySelector(".fixed"), null);
});

test("Add Program with nothing entered names every required field and sends nothing", async (t) => {
  const calls = await load(t, { items: [] });
  fireEvent.click(screen.getByRole("button", { name: "+ Add Program" }));
  fireEvent.click(screen.getByRole("button", { name: "Create Program" }));
  await settle();
  const text = document.querySelector(".fixed").textContent;
  for (const want of ["Program name is required", "Description is required", "Choose the instructor", "Start date is required", "End date is required", "Maximum participants is required"]) assert.match(text, new RegExp(want));
  assert.doesNotMatch(text, /Field required|Value error/);
  assert.equal(calls.create.length, 0);
  set("p-name", "x");
  assert.doesNotMatch(document.querySelector(".fixed").textContent, /Program name is required/);
});

test("a complete program is created with the instructor chosen from a list", async (t) => {
  const calls = await load(t, { items: [] });
  fireEvent.click(screen.getByRole("button", { name: "+ Add Program" }));
  assert.deepEqual([...document.getElementById("p-instructor").options].map((o) => o.textContent), ["Select instructor", "Sam Lee", "Ann Roy"]);
  set("p-name", "Leadership Workshop"); set("p-desc", "Two days."); set("p-instructor", "5"); set("p-start", "2027-03-01"); set("p-end", "2027-03-02"); set("p-max", "20");
  fireEvent.click(screen.getByRole("button", { name: "Create Program" }));
  await settle();
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0].instructor_id, 5);
  assert.ok(!("status" in calls.create[0]));
});

test("a server refusal stays in the dialog next to its field", async (t) => {
  const err = Object.assign(new Error("x"), { validation: [{ loc: ["body", "name"], msg: "Value error, Program name is required." }] });
  await load(t, { items: [{ ...OLD, description: "d", instructor_id: 5, start_date: "2027-03-01", end_date: "2027-03-02", max_participants: 10 }], updateError: err });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Update Program" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /Program name is required\./);
});

test("clicking a program name opens its details and Edit Program carries on from there", async (t) => {
  await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Legacy program" }));
  await settle();
  const dialog = screen.getByRole("dialog", { name: "Program details" });
  assert.match(dialog.textContent, /missing: description, instructor, start date, end date, maximum participants/);
  fireEvent.click(screen.getByRole("button", { name: "Edit Program" }));
  await settle();
  assert.equal(document.getElementById("p-name").value, "Legacy program");
});
