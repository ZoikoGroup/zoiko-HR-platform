/** Employee Learning module: the read-only tabbed workspace where a person learns from their department's courses and takes quizzes marked by the server. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  departmentName,
  forMyDepartment,
  courseProgress,
  attemptsLeft,
  groupAssessmentsByCourse,
  quizResult,
  openQuizzes,
  learnerSummary,
} from "../src/utils/employeeLearning.js";
import { learningTabFromPath, LEARNING_TABS } from "../src/pages/Peoples/Employees/Learning/learningTabs.js";

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

test("assessments group under courses, drop already-passed quizzes, and roll up a summary", () => {
  const assessments = [{ id: 10, course_id: 1, max_attempts: 2 }, { id: 11, course_id: 1 }, { id: 12, course_id: 2 }];
  const byCourse = groupAssessmentsByCourse(assessments);
  assert.deepEqual(Object.keys(byCourse).sort(), ["1", "2"]);
  assert.equal(byCourse[1].length, 2);

  const attempts = { 10: [{ status: "completed", passed: true, score: 80 }], 12: [{ status: "completed", passed: false, score: 40 }] };
  assert.deepEqual(quizResult(assessments[0], attempts[10]), { passed: true, score: 80 });
  assert.equal(quizResult(assessments[1], []), null);
  assert.deepEqual(openQuizzes(byCourse[1], attempts).map((a) => a.id), [11]);

  const courses = [{ id: 1 }, { id: 2 }];
  assert.deepEqual(learnerSummary(courses, byCourse, attempts), { total: 2, completed: 0, inProgress: 2, notStarted: 0, badges: 1 });
});

test("learning tabs map from the URL and fall back to the dashboard", () => {
  assert.equal(learningTabFromPath("/employee/learning"), "dashboard");
  assert.equal(learningTabFromPath("/employee/learning/courses"), "courses");
  assert.equal(learningTabFromPath("/employee/learning/training-programs"), "training-programs");
  assert.equal(learningTabFromPath("/employee/learning/assessments"), "assessments");
  assert.equal(learningTabFromPath("/employee/ess/requests"), "dashboard");
  assert.deepEqual(LEARNING_TABS.map((t) => t.key), ["dashboard", "courses", "training-programs", "assessments"]);
});

const PROFILE = { id: 7, firstName: "Anne", department: { id: 3, name: "Engineering" } };
const COURSES = { items: [{ id: 1, course_name: "Fire Safety", department: "Engineering", duration_hours: 2 }, { id: 2, course_name: "Sales Pitch", department: "Sales" }, { id: 3, course_name: "Code of Conduct", department: null }] };
const ASSESS = [{ id: 10, course_id: 1, title: "Fire quiz", passing_score: 50, max_attempts: 2 }];
const QUESTIONS = [{ id: 100, question_text: "Colour?", question_type: "multiple_choice", options: ["Red", "Blue"], correct_answer: null }];

// One shared service mock for every test: the Learning module and its QuizModal are evaluated once,
// so the mock must be registered once (a per-test mock would leave the cached QuizModal on a stale one).
const state = { calls: { started: [], submitted: [] }, failCourses: false };
const svc = {
  getMyProfile: async () => PROFILE,
  getCourses: async () => { if (state.failCourses) throw new Error("Could not load courses"); return COURSES; },
  getTrainingPrograms: async () => ({ items: [] }),
  getAssessments: async () => ASSESS,
  getQuizAttempts: async () => [],
  getQuestions: async () => QUESTIONS,
  startQuiz: async (a, e) => { state.calls.started.push([a, e]); return { id: 55, assessment_id: a, employee_id: e }; },
  submitQuiz: async (a, at, answers) => { state.calls.submitted.push([a, at, answers]); return { score: 100, passed: true, status: "completed" }; },
};
mock.module("../src/service/employee.js", { exports: svc });
mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });

beforeEach(() => { state.calls = { started: [], submitted: [] }; state.failCourses = false; });

async function load(path = "/employee/learning") {
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Learning/EmployeeLearningModule.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Page)));
  await settle();
  return state.calls;
}

test("the dashboard opens, shows the tabs, and only shows my department's courses", async () => {
  await load();
  const text = document.body.textContent;
  assert.match(text, /Dashboard/);
  assert.match(text, /Courses/);
  assert.match(text, /Training Programs/);
  assert.match(text, /Assessments/);
  assert.match(text, /Engineering/);
  assert.match(text, /Fire Safety/);
  assert.doesNotMatch(text, /Sales Pitch/);
});

test("the courses tab shows each course's details and no quizzes; quizzes are on the Assessments tab", async () => {
  await load("/employee/learning/courses");
  const text = document.body.textContent;
  assert.match(text, /Fire Safety/);
  assert.match(text, /Code of Conduct/);
  assert.doesNotMatch(text, /Sales Pitch/);
  assert.match(text, /2 hours/);
  assert.match(text, /Everyone/, "a course for everybody says so");
  assert.equal(document.querySelectorAll('[data-testid="course-card"]').length, 2);
  assert.doesNotMatch(text, /Fire quiz|Take Quiz|quiz|Badge earned/i);
  assert.equal(screen.queryByRole("button", { name: /quiz/i }), null);
});

test("a quiz is taken from the Assessments tab, sending answers the server scores", async () => {
  const calls = await load("/employee/learning/assessments");
  fireEvent.click(screen.getByRole("button", { name: /Take quiz/ }));
  await settle();
  assert.deepEqual(calls.started, [[10, 7]]);
  fireEvent.click(screen.getByLabelText("Red"));
  fireEvent.click(screen.getByRole("button", { name: "Submit Quiz" }));
  await settle();
  assert.deepEqual(calls.submitted, [[10, 55, [{ question_id: 100, answer: "Red" }]]]);
  assert.match(document.body.textContent, /Congratulations! Quiz passed/);
});

test("the assessments tab lists quizzes to take", async () => {
  await load("/employee/learning/assessments");
  assert.match(document.body.textContent, /Fire quiz/);
  assert.match(document.body.textContent, /Take quiz/);
});

test("a failed load shows a message instead of crashing", async () => {
  state.failCourses = true;
  await load();
  assert.match(document.body.textContent, /Could not load courses/);
});

test("a course type that has no fixed label is still shown readably", async () => {
  COURSES.items.push({ id: 4, course_name: "Leadership", department: null, course_type: "on_the_job", duration_hours: 1 });
  try {
    await load("/employee/learning/courses");
    assert.match(document.body.textContent, /On The Job/);
    assert.match(document.body.textContent, /1 hour(?!s)/);
  } finally { COURSES.items.pop(); }
});


test("short-answer questions get a text box and true/false get True and False, not a made-up True/False pair", async () => {
  const saved = QUESTIONS.splice(0, QUESTIONS.length,
    { id: 200, question_text: "Name the colour", question_type: "short_answer", options: null, correct_answer: null },
    { id: 201, question_text: "Fire is hot", question_type: "true_false", options: null, correct_answer: null },
    { id: 202, question_text: "Pick one", question_type: "multiple_choice", options: ["Red", "Blue"], correct_answer: null });
  try {
    const calls = await load("/employee/learning/assessments");
    fireEvent.click(screen.getByRole("button", { name: /Take quiz/ }));
    await settle();
    fireEvent.change(screen.getByLabelText("Answer to question 1"), { target: { value: "Red" } });
    assert.ok(screen.getByLabelText("True") && screen.getByLabelText("False"));
    assert.equal(screen.getAllByLabelText("Red").length, 1, "options are only the ones the author wrote");
    const submit = screen.getByRole("button", { name: "Submit Quiz" });
    assert.equal(submit.disabled, true, "every question must be answered");
    fireEvent.click(screen.getByLabelText("True"));
    fireEvent.click(screen.getByLabelText("Blue"));
    assert.equal(submit.disabled, false);
    fireEvent.click(submit);
    await settle();
    assert.deepEqual(calls.submitted[0][2], [{ question_id: 200, answer: "Red" }, { question_id: 201, answer: "True" }, { question_id: 202, answer: "Blue" }]);
  } finally { QUESTIONS.splice(0, QUESTIONS.length, ...saved); }
});
