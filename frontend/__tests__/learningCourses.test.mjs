/** ZHR-71: a course cannot be added or edited with the details learners rely on left blank. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateCourseForm, coursePayload, courseToForm, serverCourseErrors, missingDetails, EMPTY_COURSE } from "../src/utils/courseForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const FULL = { title: "Fire Safety", description: "How to react to a fire.", course_type: "online", category: "Compliance", provider: "Internal", duration: "2", department: "", resource_link: "", status: "active" };

test("every detail a learner relies on is required, each with its own message", () => {
  assert.deepEqual(validateCourseForm(FULL), {});
  assert.deepEqual(Object.keys(validateCourseForm({ ...EMPTY_COURSE })).sort(), ["category", "course_type", "description", "duration", "provider", "title"]);
  assert.match(validateCourseForm({ ...FULL, description: "  " }).description, /Description is required/);
  assert.equal(validateCourseForm({ ...FULL, duration: "0" }).duration, "Duration must be between 1 and 1000 hours.");
  assert.equal(validateCourseForm({ ...FULL, duration: "2.5" }).duration, "Duration must be a whole number of hours.");
  assert.equal(validateCourseForm({ ...FULL, duration: "-3" }).duration, "Duration must be a whole number of hours.");
  assert.match(validateCourseForm({ ...FULL, resource_link: "abc" }).resource_link, /http/);
  assert.deepEqual(validateCourseForm({ ...FULL, resource_link: "https://example.com/c", department: "HR" }), {});
});

test("the payload is clean, and an old course's gaps are reported", () => {
  assert.deepEqual(coursePayload({ ...FULL, title: "  Fire   Safety ", duration: " 2 ", department: " " }), {
    course_name: "Fire Safety", description: "How to react to a fire.", course_type: "online", category: "Compliance", provider: "Internal",
    duration_hours: 2, department: null, resource_link: null, status: "active",
  });
  assert.deepEqual(missingDetails({ course_name: "x", description: "", category: "A", provider: null, course_type: "online", duration_hours: 0 }), ["description", "provider", "duration"]);
  assert.deepEqual(missingDetails({ description: "d", category: "c", provider: "p", course_type: "online", duration_hours: 3 }), []);
  assert.equal(courseToForm({ course_name: "X", duration_hours: 4 }).duration, "4");
  assert.equal(serverCourseErrors([{ loc: ["body", "duration_hours"], msg: "Value error, Duration is required." }, { loc: ["body", "course_name"], msg: "Field required" }]).duration, "Duration is required.");
  assert.equal(serverCourseErrors([{ loc: ["body", "course_name"], msg: "Field required" }]).title, "Course name is required.");
});

const OLD = { id: 3, course_name: "Legacy course", description: "", course_type: null, category: "Technical", provider: "", duration_hours: null, department: null, status: "active" };

async function load(t, over = {}) {
  const calls = { create: [], update: [] };
  const svc = {
    getCourses: async () => ({ items: over.items ?? [OLD] }),
    getCourseById: async (id) => (over.items ?? [OLD]).find((c) => c.id === id),
    createCourse: async (p) => { calls.create.push(p); if (over.createError) throw over.createError; return {}; },
    updateCourse: async (id, p) => { calls.update.push([id, p]); if (over.updateError) throw over.updateError; return {}; },
    deleteCourse: async () => ({}),
  };
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/learning/courses.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

const set = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });

test("an incomplete course is flagged, and Update refuses until every missing detail is filled in", async (t) => {
  const calls = await load(t);
  assert.ok(screen.getByText("Incomplete"));
  assert.match(document.body.textContent, /1 incomplete course/);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  assert.equal(document.getElementById("c-title").value, "Legacy course");
  fireEvent.click(screen.getByRole("button", { name: "Update Course" }));
  await settle();
  const text = document.querySelector(".fixed").textContent;
  assert.match(text, /Description is required/);
  assert.match(text, /Provider is required\./);
  assert.match(text, /Course type is required\./);
  assert.match(text, /Duration is required\./);
  assert.equal(calls.update.length, 0, "nothing is sent while details are missing");
  set("c-desc", "Covers the basics."); set("c-provider", "Internal"); set("c-type", "online"); set("c-duration", "3");
  fireEvent.click(screen.getByRole("button", { name: "Update Course" }));
  await settle();
  assert.equal(calls.update.length, 1);
  assert.deepEqual(calls.update[0], [3, { course_name: "Legacy course", description: "Covers the basics.", course_type: "online", category: "Technical", provider: "Internal", duration_hours: 3, department: null, resource_link: null, status: "active" }]);
  assert.equal(document.querySelector(".fixed"), null);
});

test("Add Course with nothing entered names every required field and sends nothing", async (t) => {
  const calls = await load(t, { items: [] });
  fireEvent.click(screen.getByRole("button", { name: "+ Add Course" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Course" }));
  await settle();
  const text = document.querySelector(".fixed").textContent;
  for (const want of ["Course name is required", "Description is required", "Category is required", "Provider is required", "Course type is required", "Duration is required"]) assert.match(text, new RegExp(want));
  assert.doesNotMatch(text, /Field required|Value error/);
  assert.equal(calls.create.length, 0);
  set("c-title", "x");
  assert.doesNotMatch(document.querySelector(".fixed").textContent, /Course name is required/);
});

test("a server refusal stays inside the dialog next to its field", async (t) => {
  const err = Object.assign(new Error("x"), { validation: [{ loc: ["body", "course_name"], msg: "Value error, Course name is required." }] });
  await load(t, { items: [{ ...OLD, description: "d", provider: "p", course_type: "online", duration_hours: 2 }], updateError: err });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Update Course" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /Course name is required\./);
  const dupe = Object.assign(new Error("A course named 'X' already exists."), {});
  assert.ok(dupe.message);
});

test("clicking a course title opens its details, and gaps are called out", async (t) => {
  await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Legacy course" }));
  await settle();
  const dialog = screen.getByRole("dialog", { name: "Course details" });
  assert.match(dialog.textContent, /missing: description, provider, course type, duration/);
  assert.match(dialog.textContent, /Not provided/);
});
