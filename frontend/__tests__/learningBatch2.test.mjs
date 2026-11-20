/** Learning fix batch 2: quiz attempts resume and are not double-started (L8), essays wait for review (L7), lists page on the
 * server (L9), certification rows carry the holder's name (L10), and report exports refresh the session and show errors (L11). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { attemptsLeft, awaitingReview, openQuizzes } from "../src/utils/employeeLearning.js";
import { fetchAllPages } from "../src/utils/learningPaging.js";

afterEach(() => cleanup());
const settle = (ms = 80) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

test("L8: only a submitted try uses up an attempt; an essay quiz waiting for review is not offered again", () => {
  const quiz = { id: 1, max_attempts: 2 };
  assert.equal(attemptsLeft(quiz, [{ status: "in_progress" }, { status: "in_progress" }]), 2);
  assert.equal(attemptsLeft(quiz, [{ status: "completed" }, { status: "pending_review" }]), 0);
  assert.equal(awaitingReview([{ status: "pending_review" }]), true);
  assert.equal(awaitingReview([{ status: "pending_review" }, { status: "completed", passed: true }]), false);
  const unlimited = { id: 2 };
  assert.deepEqual(openQuizzes([quiz, unlimited], { 1: [{ status: "in_progress" }], 2: [{ status: "pending_review" }] }).map((a) => a.id), [1]);
});

test("L8: two opens at once (StrictMode, double click) share one start request", async (t) => {
  let calls = 0;
  t.mock.module("../src/service/employee.js", { exports: {
    getQuestions: async () => [], submitQuiz: async () => ({}),
    startQuiz: async (a, e) => { calls += 1; await new Promise((r) => setTimeout(r, 20)); return { id: 9, assessment_id: a, employee_id: e }; },
  } });
  const { startQuizOnce } = await import(`../src/pages/Peoples/Employees/Learning/QuizModal.jsx?t=${Math.random()}`);
  const [a, b] = await Promise.all([startQuizOnce(4, 7), startQuizOnce(4, 7)]);
  assert.equal(calls, 1);
  assert.equal(a.id, b.id);
  await startQuizOnce(4, 7);                       // a later open asks again (the server resumes the same attempt)
  assert.equal(calls, 2);
});

test("L7: a submission waiting for review says so instead of showing a 0% fail", async (t) => {
  t.mock.module("../src/service/employee.js", { exports: {
    getQuestions: async () => [{ id: 1, question_text: "Explain.", question_type: "essay" }],
    startQuiz: async () => ({ id: 3 }),
    submitQuiz: async () => ({ id: 3, status: "pending_review", score: null, passed: null }),
  } });
  const { default: QuizModal } = await import(`../src/pages/Peoples/Employees/Learning/QuizModal.jsx?t=${Math.random()}`);
  let finished = 0;
  render(React.createElement(QuizModal, { course: { course_name: "C" }, assessment: { id: 5, title: "Essay quiz", passing_score: 50 },
    employeeId: 7, onClose: () => {}, onFinished: () => { finished += 1; } }));
  await settle();
  fireEvent.change(screen.getByLabelText("Answer to question 1"), { target: { value: "Because." } });
  fireEvent.click(screen.getByRole("button", { name: "Submit Quiz" }));
  await settle();
  assert.match(document.body.textContent, /Answers submitted/);
  assert.match(document.body.textContent, /reviewer/);
  assert.doesNotMatch(document.body.textContent, /Quiz not passed/);
  assert.equal(finished, 1);
});

test("L9: a picker walks every page instead of stopping at the first", async () => {
  const rows = Array.from({ length: 450 }, (_, i) => ({ id: i + 1 }));
  const asked = [];
  const fetcher = async ({ page, per_page }) => {
    asked.push(page);
    return { items: rows.slice((page - 1) * per_page, page * per_page), total: rows.length, page, per_page };
  };
  const all = await fetchAllPages(fetcher, { status: "active" });
  assert.equal(all.length, 450);
  assert.deepEqual(asked, [1, 2, 3]);
  assert.deepEqual(await fetchAllPages(async () => [{ id: 1 }]), [{ id: 1 }]);      // a plain list is taken as is
});

test("L9: the course list asks the server for one page and shows catalog-wide figures", async (t) => {
  const asked = [];
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getCourses: async (params) => {
      asked.push(params);
      return { items: [{ id: 1, course_name: "Course 1", description: "d", category: "A", provider: "p", course_type: "online", duration_hours: 1 }],
        total: 130, page: params.page, per_page: params.per_page, catalog_total: 140, categories: ["A", "B", "C"], incomplete: 4 };
    },
    getCourseById: async () => ({}), createCourse: async () => ({}), updateCourse: async () => ({}), deleteCourse: async () => ({}),
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/learning/courses.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  assert.deepEqual(asked[0], { page: 1, per_page: 8, search: undefined, category: undefined });
  const text = document.body.textContent;
  assert.match(text, /Total: 140/);
  assert.match(text, /Categories: 3/);
  assert.match(text, /4 incomplete courses/);
  assert.match(text, /Page 1 of 17/);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await settle();
  assert.equal(asked.at(-1).page, 2);
  fireEvent.change(screen.getByPlaceholderText(/Search by title/), { target: { value: "fire" } });
  await settle(400);
  assert.deepEqual(asked.at(-1), { page: 1, per_page: 8, search: "fire", category: undefined });
});

function reportsPage(t, svc) {
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getCourseCompletionReport: async () => [], getSkillGapAnalysis: async () => [],
    getCertificationReport: async () => [{ id: 1, employee_id: 42, employee_name: "Morgan Admin", certification_name: "First Aid", issue_date: "2026-01-01" }],
    exportCourseCompletionReportCsv: async () => {}, exportCourseCompletionReportExcel: async () => {},
    exportSkillGapReportCsv: async () => {}, exportSkillGapReportExcel: async () => {},
    exportCertificationReportCsv: async () => {}, exportCertificationReportExcel: async () => {},
    ...svc,
  } });
  return import(`../src/modules/zoiko-hr/learning/reports.jsx?t=${Math.random()}`);
}

test("L10 + L11: the certification report names the holder, and a failed export is shown", async (t) => {
  const { default: Page } = await reportsPage(t, {
    exportCertificationReportCsv: async () => { throw new Error("You do not have permission to export this report."); },
  });
  render(React.createElement(Page));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Certification Report" }));
  await settle();
  assert.match(document.body.textContent, /Morgan Admin/);
  assert.doesNotMatch(document.body.textContent, /#42/);
  fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /permission to export/);
});

test("L11: an export refreshes an expired session once, retries, and reports the server's refusal", async (t) => {
  let token = "old";
  let refreshed = 0;
  t.mock.module("../src/service/api.js", { exports: {
    api: { get: async () => ({}), post: async () => ({}), put: async () => ({}), patch: async () => ({}), delete: async () => ({}) },
    API_BASE_URL: "http://api.test", getAccessToken: () => token,
    refreshSession: async () => { refreshed += 1; token = "new"; return true; },
  } });
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    seen.push([url, opts.headers.Authorization]);
    if (opts.headers.Authorization === "Bearer old") return new Response("{}", { status: 401, headers: { "content-type": "application/json" } });
    if (url.endsWith("/excel")) return new Response(JSON.stringify({ detail: "Not allowed here." }), { status: 403, headers: { "content-type": "application/json" } });
    return new Response("a,b\n1,2", { status: 200, headers: { "content-type": "text/csv" } });
  };
  const created = [];
  const realCreate = URL.createObjectURL;
  URL.createObjectURL = (b) => { created.push(b); return "blob:x"; };
  URL.revokeObjectURL = () => {};
  try {
    const svc = await import(`../src/service/hrService.js?t=${Math.random()}`);
    assert.equal(await svc.exportCertificationReportCsv(), true);
    assert.equal(refreshed, 1);
    assert.deepEqual(seen.map((s) => s[1]), ["Bearer old", "Bearer new"]);
    assert.equal(created.length, 1);
    await assert.rejects(svc.exportCertificationReportExcel(), /Not allowed here\./);
  } finally {
    globalThis.fetch = realFetch;
    URL.createObjectURL = realCreate;
  }
});
