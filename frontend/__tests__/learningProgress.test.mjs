/** A learner's course card shows the enrollment's progress (the server works it out from the quizzes passed). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);

const load = async () => (await import(`../src/pages/Peoples/Employees/Learning/LearnerCourses.jsx?t=${Math.random()}`)).default;
const courses = [
  { id: 1, course_name: "Safety", status: "active" },
  { id: 2, course_name: "Ethics", status: "active" },
  { id: 3, course_name: "Old", status: "active" },
  { id: 4, course_name: "New", status: "active" },
];

test("each enrolled course shows its progress; a dropped or not-enrolled course shows none", async () => {
  const LearnerCourses = await load();
  const enrollments = {
    1: { course_id: 1, status: "in_progress", progress_pct: 50 },
    2: { course_id: 2, status: "completed", progress_pct: 100 },
    3: { course_id: 3, status: "dropped", progress_pct: 25 },
  };
  render(React.createElement(LearnerCourses, { courses, enrollments, onEnroll: async () => {} }));
  assert.ok(screen.getByLabelText("Progress 50%"));
  assert.ok(screen.getByLabelText("Progress 100%"));
  assert.equal(screen.queryByLabelText("Progress 25%"), null);
  assert.equal(screen.getAllByText(/^Progress$/).length, 2);
  assert.ok(screen.getByRole("button", { name: "Enroll in New" }));
});

test("a missing or out-of-range percentage is shown safely", async () => {
  const LearnerCourses = await load();
  const enrollments = { 1: { course_id: 1, status: "enrolled" }, 2: { course_id: 2, status: "in_progress", progress_pct: 140 } };
  render(React.createElement(LearnerCourses, { courses: courses.slice(0, 2), enrollments }));
  assert.ok(screen.getByLabelText("Progress 0%"));
  assert.ok(screen.getByLabelText("Progress 100%"));
});
