/** ZHR-73: the passing score is never filled in for the person; the rest of the Assessments page checks its input. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import {
  EMPTY_ASSESSMENT, validateAssessmentForm, assessmentPayload, parseOptions, validateQuestionForm, questionPayload, resultOf, scoreText, serverFormErrors,
} from "../src/utils/assessmentForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const FULL = { title: "Fire quiz", description: "Checks the basics.", course_id: "1", passing_score: "60", max_attempts: "", duration_minutes: "", resource_link: "", is_active: true };

test("the passing score must be typed: nothing is filled in, and it is a percentage from 1 to 100", () => {
  assert.equal(EMPTY_ASSESSMENT.passing_score, "", "the empty form starts with no passing score");
  assert.equal(validateAssessmentForm({ ...FULL, passing_score: "" }).passing_score, "Passing score is required.");
  assert.equal(validateAssessmentForm({ ...FULL, passing_score: "   " }).passing_score, "Passing score is required.");
  for (const bad of ["0", "101", "-5", "2.5", "abc"]) assert.ok(validateAssessmentForm({ ...FULL, passing_score: bad }).passing_score, bad);
  for (const ok of ["1", "70", "100"]) assert.equal(validateAssessmentForm({ ...FULL, passing_score: ok }).passing_score, undefined, ok);
  assert.equal(assessmentPayload({ ...FULL, passing_score: "65" }, false).passing_score, 65);
  assert.deepEqual(validateAssessmentForm(FULL), {});
});

test("the other details are checked too", () => {
  assert.deepEqual(Object.keys(validateAssessmentForm({ ...EMPTY_ASSESSMENT })).sort(), ["course_id", "description", "passing_score", "title"]);
  assert.match(validateAssessmentForm({ ...FULL, max_attempts: "0" }).max_attempts, /between 1 and 100/);
  assert.match(validateAssessmentForm({ ...FULL, duration_minutes: "601" }).duration_minutes, /601|between 1 and 600/);
  assert.match(validateAssessmentForm({ ...FULL, resource_link: "abc" }).resource_link, /http/);
  assert.deepEqual(assessmentPayload({ ...FULL, max_attempts: "3", duration_minutes: "30", resource_link: " https://x.com/a.pdf " }, true), {
    course_id: 1, title: "Fire quiz", description: "Checks the basics.", passing_score: 60, max_attempts: 3, duration_minutes: 30, resource_link: "https://x.com/a.pdf", is_active: true,
  });
  assert.equal(assessmentPayload(FULL, false).max_attempts, null, "empty optional limits mean unlimited");
});

test("questions are checked as a whole, and their payload matches what the server stores", () => {
  const mc = { question_text: "Colour?", question_type: "multiple_choice", options: "Red, Blue ,, red", correct_answer: "Red", points: "2" };
  assert.deepEqual(parseOptions("Red, Blue ,, red\nGreen"), ["Red", "Blue", "Green"]);
  assert.deepEqual(validateQuestionForm(mc), {});
  assert.deepEqual(questionPayload(mc), { question_text: "Colour?", question_type: "multiple_choice", options: ["Red", "Blue"], correct_answer: "Red", points: 2 });
  assert.match(validateQuestionForm({ ...mc, options: "Red" }).options, /at least two/);
  assert.match(validateQuestionForm({ ...mc, correct_answer: "Pink" }).correct_answer, /one of the options/);
  assert.equal(validateQuestionForm({ ...mc, points: "" }).points, "Points is required.");
  assert.equal(validateQuestionForm({ ...mc, points: "0" }).points, "Points must be between 1 and 100.");
  assert.match(validateQuestionForm({ question_text: "x", question_type: "true_false", correct_answer: "maybe", points: "1" }).correct_answer, /True or False/);
  assert.match(validateQuestionForm({ question_text: "x", question_type: "short_answer", correct_answer: "", points: "1" }).correct_answer, /correct answer/);
  assert.deepEqual(validateQuestionForm({ question_text: "x", question_type: "essay", points: "5" }), {});
  assert.deepEqual(questionPayload({ question_text: "x", question_type: "essay", correct_answer: "ignored", points: "5" }), { question_text: "x", question_type: "essay", options: null, correct_answer: null, points: 5 });
});

test("attempt results and server messages read plainly", () => {
  assert.deepEqual(resultOf({ status: "completed", passed: true }), { label: "Passed", tone: "green" });
  assert.deepEqual(resultOf({ status: "completed", passed: false }), { label: "Failed", tone: "red" });
  assert.deepEqual(resultOf({ status: "in_progress" }), { label: "In progress", tone: "blue" });
  assert.equal(scoreText({ score: 80 }), "80%");
  assert.equal(scoreText({ score: null }), "-");
  assert.equal(serverFormErrors([{ loc: ["body", "passing_score"], msg: "Value error, Passing score is required." }]).passing_score, "Passing score is required.");
  assert.equal(serverFormErrors([{ loc: ["body", "passing_score"], msg: "Field required" }], { passing_score: "Passing score" }).passing_score, "Passing score is required.");
});

const A1 = { id: 1, course_id: 7, course_name: "Fire Safety", title: "Fire quiz", description: "d", passing_score: 60, max_attempts: null, duration_minutes: null, is_active: true, questions_count: 1, resource_link: null };

async function load(t, over = {}) {
  const calls = { create: [], update: [], question: [] };
  const svc = {
    getAssessments: async () => over.items ?? [A1],
    getAssessmentById: async (id) => (over.items ?? [A1]).find((a) => a.id === id),
    createAssessment: async (p) => { calls.create.push(p); if (over.createError) throw over.createError; return {}; },
    updateAssessment: async (id, p) => { calls.update.push([id, p]); return {}; },
    deleteAssessment: async () => ({}),
    getQuestions: async () => [{ id: 5, assessment_id: 1, question_text: "Colour?", question_type: "multiple_choice", options: ["Red", "Blue"], correct_answer: "Red", points: 2 }],
    createQuestion: async (id, p) => { calls.question.push(["create", id, p]); return {}; },
    updateQuestion: async (id, q, p) => { calls.question.push(["update", id, q, p]); return {}; },
    deleteQuestion: async () => ({}),
    getCourses: async () => ({ items: [{ id: 7, course_name: "Fire Safety" }, { id: 8, course_name: "First Aid" }] }),
    getQuizAttempts: async () => [
      { id: 1, assessment_id: 1, employee_id: 4, employee_name: "Sam Lee", attempt_number: 1, score: 80, passed: true, status: "completed", started_at: "2026-10-01T10:00:00Z", completed_at: "2026-10-01T10:20:00Z" },
      { id: 2, assessment_id: 1, employee_id: 5, employee_name: "Ann Roy", attempt_number: 2, score: 40, passed: false, status: "completed", started_at: "2026-10-02T10:00:00Z", completed_at: "2026-10-02T10:20:00Z" },
    ],
  };
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: svc });
  const { default: Page } = await import(`../src/modules/zoiko-hr/learning/assessments.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

const set = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });

test("Add Assessment opens with an EMPTY passing score and refuses to save until one is entered", async (t) => {
  const calls = await load(t, { items: [] });
  fireEvent.click(screen.getByRole("button", { name: "+ Add Assessment" }));
  assert.equal(document.getElementById("a-pass").value, "", "no 70 is put in the box");
  assert.equal(document.getElementById("a-pass").placeholder, "e.g. 70", "70 is only an example in grey");
  set("a-title", "Fire quiz"); set("a-desc", "Checks the basics."); set("a-course", "7");
  fireEvent.click(screen.getByRole("button", { name: "Create Assessment" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /Passing score is required\./);
  assert.equal(calls.create.length, 0, "nothing is sent, so nothing is saved with a made-up score");
  set("a-pass", "65");
  fireEvent.click(screen.getByRole("button", { name: "Create Assessment" }));
  await settle();
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0].passing_score, 65);
  assert.equal(calls.create[0].max_attempts, null);
});

test("Edit shows the saved passing score and an empty one is not replaced by 70", async (t) => {
  const calls = await load(t, { items: [{ ...A1, passing_score: null }] });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  assert.equal(document.getElementById("a-pass").value, "");
  fireEvent.click(screen.getByRole("button", { name: "Update Assessment" }));
  await settle();
  assert.match(document.querySelector(".fixed").textContent, /Passing score is required\./);
  assert.equal(calls.update.length, 0);
  set("a-pass", "55");
  fireEvent.click(screen.getByRole("button", { name: "Update Assessment" }));
  await settle();
  assert.equal(calls.update[0][1].passing_score, 55);
  assert.equal(calls.update[0][1].is_active, true);
});

test("the list says Not set for a missing passing score, and shows limits in words", async (t) => {
  await load(t, { items: [{ ...A1, passing_score: null }, { ...A1, id: 2, title: "Second", passing_score: 70, max_attempts: 3, duration_minutes: 30, is_active: false }] });
  const rows = [...document.querySelectorAll("tbody tr")].map((r) => r.textContent);
  assert.match(rows[0], /Not set/);
  assert.match(rows[0], /Unlimited/);
  assert.match(rows[0], /No limit/);
  assert.match(rows[1], /70%/);
  assert.match(rows[1], /30 min/);
  assert.match(rows[1], /Inactive/);
});

test("adding a question checks it as a whole and sends options as a list", async (t) => {
  const calls = await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Fire quiz" }));
  await settle();
  assert.match(screen.getByRole("dialog", { name: "Assessment details" }).textContent, /Questions \(1\)/);
  fireEvent.click(screen.getByRole("button", { name: "+ Add Question" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Question" }));
  await settle();
  const text = document.body.textContent;
  assert.match(text, /Question text is required\./);
  assert.match(text, /Points is required\./);
  assert.match(text, /at least two different options/);
  set("q-text", "Which colour?"); set("q-options", "Red, Blue"); set("q-points", "2");
  assert.deepEqual([...document.getElementById("q-answer").options].map((o) => o.value), ["", "Red", "Blue"], "the correct answer is chosen from the options");
  set("q-answer", "Blue");
  fireEvent.click(screen.getByRole("button", { name: "Add Question" }));
  await settle();
  assert.deepEqual(calls.question, [["create", 1, { question_text: "Which colour?", question_type: "multiple_choice", options: ["Red", "Blue"], correct_answer: "Blue", points: 2 }]]);
});

test("the attempts tab shows names, scores in percent and Passed / Failed", async (t) => {
  await load(t);
  fireEvent.click(screen.getByRole("button", { name: "Quiz Attempts" }));
  await settle();
  fireEvent.change(document.getElementById("attempt-assessment"), { target: { value: "1" } });
  await settle();
  const rows = [...document.querySelectorAll("tbody tr")].map((r) => r.textContent);
  assert.match(rows[0], /Sam Lee/); assert.match(rows[0], /80%/); assert.match(rows[0], /Passed/);
  assert.match(rows[1], /Ann Roy/); assert.match(rows[1], /Failed/);
});
