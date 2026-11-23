/** Learning fix batch 4: the report dashboard's period really filters and its downloads are the server's real CSV / .xlsx
 * exports (L12), the dashboard tiles count what they say and the trend / category data is shown (L13), and the admin
 * screens have dark mode and phone-width forms (L17). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = (ms = 80) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const page = () => ({ default: ({ children }) => React.createElement("div", null, children) });

test("L12: a period becomes the report's start and end dates; the download query is encoded", async (t) => {
  t.mock.module("../src/components/HRPage.jsx", { exports: page() });
  const none = async () => [];
  t.mock.module("../src/service/hrService.js", { exports: {
    getCourseCompletionReport: none, getCertificationReport: none, getSkillGapAnalysis: none,
    exportCourseCompletionReportCsv: none, exportCourseCompletionReportExcel: none, exportCertificationReportCsv: none,
    exportCertificationReportExcel: none, exportSkillGapReportCsv: none, exportSkillGapReportExcel: none,
  } });
  const { periodParams } = await import(`../src/modules/zoiko-hr/learning/reports.jsx?t=${Math.random()}`);
  const today = new Date(2026, 10, 20);
  assert.deepEqual(periodParams("all", today), {});
  assert.deepEqual(periodParams("30d", today), { start_date: "2026-10-22", end_date: "2026-11-20" });
  assert.deepEqual(periodParams("12m", today), { start_date: "2025-11-20", end_date: "2026-11-20" });
  assert.deepEqual(periodParams("year", today), { start_date: "2026-01-01", end_date: "2026-11-20" });
});

test("L12: the download query leaves out empty values and encodes the rest", async (t) => {
  t.mock.module("../src/service/api.js", { exports: {
    api: {}, API_BASE_URL: "http://api.test", getAccessToken: () => "t", refreshSession: async () => false,
  } });
  const { learningReportQuery } = await import(`../src/service/hrService.js?t=${Math.random()}`);
  assert.equal(learningReportQuery({}), "");
  assert.equal(learningReportQuery({ start_date: "2026-01-01", end_date: "" }), "?start_date=2026-01-01");
  assert.equal(learningReportQuery({ a: "x y", b: "1" }), "?a=x%20y&b=1");
});

test("L12: the dashboard tab refetches for the chosen period and downloads the server's CSV and real Excel for it", async (t) => {
  const asked = [];
  const csv = [];
  const xlsx = [];
  t.mock.module("../src/components/HRPage.jsx", { exports: page() });
  t.mock.module("../src/service/hrService.js", { exports: {
    getCourseCompletionReport: async (params) => {
      asked.push(params);
      return params?.start_date
        ? [{ course_id: 1, course_name: "Safety, Level 1", total_enrollments: 2, completed: 1, completion_rate: 50 }]
        : [{ course_id: 1, course_name: "Safety, Level 1", total_enrollments: 4, completed: 3, completion_rate: 75 },
          { course_id: 2, course_name: "First Aid", total_enrollments: 0, completed: 0, completion_rate: 0 }];
    },
    getCertificationReport: async () => [], getSkillGapAnalysis: async () => [],
    exportCourseCompletionReportCsv: async (p) => { csv.push(p); },
    exportCourseCompletionReportExcel: async (p) => { xlsx.push(p); throw new Error("Your session has expired. Please sign in again."); },
    exportCertificationReportCsv: async () => {}, exportCertificationReportExcel: async () => {},
    exportSkillGapReportCsv: async () => {}, exportSkillGapReportExcel: async () => {},
  } });
  const { default: Reports, periodParams } = await import(`../src/modules/zoiko-hr/learning/reports.jsx?t=${Math.random()}`);
  render(React.createElement(Reports));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
  await settle();
  assert.deepEqual(asked.at(-1), {});
  assert.equal(screen.getByTestId("total-enrollments").textContent, "4");
  assert.equal(screen.getByTestId("overall-completion").textContent, "75.0%");

  fireEvent.change(document.getElementById("report-period"), { target: { value: "30d" } });
  await settle();
  assert.deepEqual(asked.at(-1), periodParams("30d"));
  assert.equal(screen.getByTestId("total-enrollments").textContent, "2");

  fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
  await settle();
  assert.deepEqual(csv, [periodParams("30d")]);
  fireEvent.click(screen.getByRole("button", { name: /Export Excel/ }));
  await settle();
  assert.deepEqual(xlsx, [periodParams("30d")]);                         // the server's .xlsx, not a CSV renamed
  assert.match(screen.getByRole("alert").textContent, /session has expired/);
});

test("L13: the tiles count what their labels say, and the trend, categories and recent enrollments are shown", async (t) => {
  t.mock.module("../src/components/HRPage.jsx", { exports: page() });
  t.mock.module("../src/service/hrService.js", { exports: {
    getLearningDashboard: async () => ({
      total_courses: 5, awaiting_review: 3, in_progress_attempts: 7, pending_assessments: 3,
      enrollment_trend: [{ month: "2026-09", count: 4 }, { month: "2026-10", count: 6 }],
      category_distribution: [{ category: "Safety", count: 1 }, { category: "Compliance", count: 4 }],
      recent_enrollments: [{ id: 1, employee_name: "Sam Lee", course_name: "Fire Safety", status: "in_progress", enrolled_at: "2026-11-02T09:00:00" }],
    }),
  } });
  const { default: Dashboard, KPI_CONFIG, monthLabel } = await import(`../src/modules/zoiko-hr/learning/dashboard.jsx?t=${Math.random()}`);
  assert.ok(!KPI_CONFIG.some((k) => k.label === "Pending Assessments"));
  assert.equal(monthLabel("2026-09"), "Sep 2026");
  render(React.createElement(Dashboard, { isTab: true }));
  await settle();
  assert.match(screen.getByTestId("kpi-awaiting_review").textContent, /Awaiting Review\s*3/);
  assert.match(screen.getByTestId("kpi-in_progress_attempts").textContent, /Quizzes In Progress\s*7/);
  const categories = screen.getByRole("region", { name: "Courses by category" }).textContent;
  assert.ok(categories.indexOf("Compliance") < categories.indexOf("Safety"));    // biggest first
  assert.ok(screen.getByRole("region", { name: "Enrollment trend" }));
  assert.match(screen.getByRole("region", { name: "Recent enrollments" }).textContent, /Sam Lee · Fire Safety.*in progress · 2026-11-02/);
});

test("L13: an older server without awaiting_review still fills the tile from pending_assessments", async (t) => {
  t.mock.module("../src/components/HRPage.jsx", { exports: page() });
  t.mock.module("../src/service/hrService.js", { exports: { getLearningDashboard: async () => ({ pending_assessments: 2 }) } });
  const { default: Dashboard } = await import(`../src/modules/zoiko-hr/learning/dashboard.jsx?t=${Math.random()}`);
  render(React.createElement(Dashboard, { isTab: true }));
  await settle();
  assert.match(screen.getByTestId("kpi-awaiting_review").textContent, /2/);
  assert.match(document.body.textContent, /No enrollments yet/);
});

test("L17: the course form stacks on a phone and has dark variants", async (t) => {
  t.mock.module("../src/components/HRPage.jsx", { exports: page() });
  t.mock.module("../src/service/hrService.js", { exports: {
    getCourses: async () => ({ items: [], total: 0 }), getCourseById: async () => ({}),
    createCourse: async () => ({}), updateCourse: async () => ({}), deleteCourse: async () => ({}),
  } });
  const { default: Courses } = await import(`../src/modules/zoiko-hr/learning/courses.jsx?t=${Math.random()}`);
  render(React.createElement(Courses));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "+ Add Course" }));
  const form = document.querySelector("form");
  const grids = [...form.querySelectorAll(".grid")];
  assert.ok(grids.length > 0 && grids.every((g) => g.classList.contains("grid-cols-1") && g.classList.contains("sm:grid-cols-2")));
  assert.ok(form.closest(".bg-white").classList.contains("dark:bg-[#1e293b]"));
  assert.ok(document.getElementById("c-title").classList.contains("dark:bg-[#0f172a]"));
});
