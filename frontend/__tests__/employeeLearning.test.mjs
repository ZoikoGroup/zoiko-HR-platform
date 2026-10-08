/** ZHR-88: the employee Learning page opens (it crashed when the profile's department was an object) and quizzes are marked by the server. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { departmentName, forMyDepartment, courseProgress, attemptsLeft } from "../src/utils/employeeLearning.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

test("department comes out of a name, an object or nothing", () => {
  assert.equal(departmentName({ department: { id: 3, name: "Engineering" } }), "Engineering");
  assert.equal(departmentName({ departmentName: "HR" }), "HR");
  assert.equal(departmentName({ department: 5 }), "");
  assert.equal(departmentName(null), "");
  const items = [{ id: 1, department: "engineering" }, { id: 2, department: "Sales" }, { id: 3, department: null }];
  assert.deepEqual(forMyDepartment(items, "Engineering").map((i) => i.id), [1, 3]);
  assert.deepEqual(forMyDepartment(items, "").map((i) => i.id), [1, 2, 3]);
});

test("progress and tries come from the person's attempts", () => {
  const a = [{ id: 1, max_attempts: 2 }, { id: 2 }];
  assert.equal(courseProgress(a, {}).status, "not_started");
  assert.equal(courseProgress(a, { 1: [{ status: "completed", passed: false }] }).status, "in_progress");
  assert.equal(courseProgress(a, { 1: [{ status: "completed", passed: true }], 2: [{ status: "completed", passed: true }] }).status, "completed");
  assert.equal(attemptsLeft(a[0], [{ status: "completed" }]), 1);
  assert.equal(attemptsLeft(a[1], [{ status: "completed" }]), null);
});

const PROFILE = { id: 7, firstName: "Anne", department: { id: 3, name: "Engineering" } };
const COURSES = { items: [{ id: 1, course_name: "Fire Safety", department: "Engineering", duration_hours: 2 }, { id: 2, course_name: "Sales Pitch", department: "Sales" }, { id: 3, course_name: "Code of Conduct", department: null }] };
const ASSESS = [{ id: 10, course_id: 1, title: "Fire quiz", passing_score: 50, max_attempts: 2 }];
const QUESTIONS = [{ id: 100, question_text: "Colour?", question_type: "multiple_choice", options: ["Red", "Blue"], correct_answer: null }];

async function load(t, over = {}) {
  const calls = { started: [], submitted: [] };
  const svc = {
    getMyProfile: async () => PROFILE, getCourses: async () => COURSES, getTrainingPrograms: async () => ({ items: [] }), getAssessments: async () => ASSESS,
    getQuizAttempts: async () => [], getQuestions: async () => QUESTIONS,
    startQuiz: async (a, e) => { calls.started.push([a, e]); return { id: 55, assessment_id: a, employee_id: e }; },
    submitQuiz: async (a, at, answers) => { calls.submitted.push([a, at, answers]); return { score: 100, passed: true, status: "completed" }; },
    ...over,
  };
  t.mock.module("../src/service/employee.js", { exports: svc });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/ESS/EmployeeLearning.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

test("the page opens when the profile department is an object, and shows my department's courses", async (t) => {
  await load(t);
  const text = document.body.textContent;
  assert.match(text, /Fire Safety/);
  assert.match(text, /Code of Conduct/);
  assert.doesNotMatch(text, /Sales Pitch/);
  assert.match(text, /Department:Engineering/);
});

test("a failed load shows a message instead of crashing", async (t) => {
  await load(t, { getCourses: async () => { throw new Error("Could not load courses"); } });
  assert.match(document.body.textContent, /Could not load courses/);
});

test("taking a quiz starts an attempt for me, sends the answers and shows the server's result", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: /Fire quiz/ }));
  await settle();
  assert.deepEqual(calls.started, [[10, 7]]);
  fireEvent.click(screen.getByLabelText("Red"));
  fireEvent.click(screen.getByRole("button", { name: "Submit Quiz" }));
  await settle();
  assert.deepEqual(calls.submitted, [[10, 55, [{ question_id: 100, answer: "Red" }]]]);
  assert.match(document.body.textContent, /Congratulations! Quiz passed/);
  assert.match(document.body.textContent, /Badge earned/);
});
