/** Learning fix batch 3: a tab bar reaches every Learning page (L16), admins manage enrollments, certifications, skills and
 * program participants (L4), learners enroll themselves, and an admin grades essay answers waiting for review. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { learningTabsFor, activeLearningTab, learningTabHref } from "../src/utils/learningAccess.js";

afterEach(() => cleanup());
const settle = (ms = 80) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const keys = (tabs) => tabs.map((t) => t.key);

test("L16: admins see every Learning tab; a manager gets no admin-only links", () => {
  for (const role of ["admin", "hr_admin"]) {
    assert.deepEqual(keys(learningTabsFor({ role })), ["dashboard", "courses", "enrollments", "training-programs", "assessments", "certifications", "skills", "reports"]);
  }
  const manager = learningTabsFor({ role: "manager" });
  assert.deepEqual(keys(manager), ["courses", "training-programs", "assessments"]);
  // a manager sent to the dashboard (or ?tab=reports) lands on Courses instead
  assert.equal(activeLearningTab("/zoiko-hr/learning", "", manager), "courses");
  assert.equal(activeLearningTab("/zoiko-hr/learning", "?tab=reports", manager), "courses");
  const all = learningTabsFor({ role: "hr_admin" });
  assert.equal(activeLearningTab("/hr-admin/learning", "?tab=skills", all), "skills");
  assert.equal(activeLearningTab("/zoiko-hr/learning/assessments", "", all), "assessments");
  assert.equal(activeLearningTab("/hr-admin/learning", "", all), "dashboard");
  // the HR admin portal has one route, so its tabs are query tabs; /zoiko-hr keeps its own paths
  assert.equal(learningTabHref("/hr-admin/learning", "courses"), "/hr-admin/learning?tab=courses");
  assert.equal(learningTabHref("/zoiko-hr/learning/courses", "reports"), "/zoiko-hr/learning/reports");
  assert.equal(learningTabHref("/zoiko-hr/learning", "dashboard"), "/zoiko-hr/learning");
  assert.equal(learningTabHref("/zoiko-hr/learning/courses", "enrollments"), "/zoiko-hr/learning/enrollments");
  assert.equal(learningTabHref("/zoiko-hr/learning", "skills"), "/zoiko-hr/learning/skills");
  assert.equal(activeLearningTab("/zoiko-hr/learning/certifications", "", all), "certifications");
});

function Where() {
  const loc = useLocation();
  return React.createElement("output", { "data-testid": "where" }, `${loc.pathname}${loc.search}`);
}

async function learningPage(t, role, path) {
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/api.js", { exports: { getStoredUser: () => ({ role }) } });
  const stub = (name) => ({ default: () => React.createElement("p", null, `${name} page`) });
  for (const [file, name] of [["dashboard", "Dashboard"], ["courses", "Courses"], ["assessments", "Assessments"], ["training-programs", "Programs"],
    ["reports", "Reports"], ["enrollments", "Enrollments"], ["certifications", "Certifications"], ["skills", "Skills"]]) {
    t.mock.module(`../src/modules/zoiko-hr/learning/${file}.jsx`, { exports: stub(name) });
  }
  const { default: Learning } = await import(`../src/modules/zoiko-hr/learning/learning.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Learning), React.createElement(Where)));
  await settle();
}

test("L16: the HR admin portal shows a tab bar that opens every sub-page", async (t) => {
  await learningPage(t, "hr_admin", "/hr-admin/learning");
  const tabs = screen.getAllByRole("tab").map((b) => b.textContent);
  assert.deepEqual(tabs, ["Dashboard", "Courses", "Enrollments", "Training Programs", "Assessments", "Certifications", "Skills", "Reports"]);
  assert.ok(screen.getByText("Dashboard page"));
  fireEvent.click(screen.getByRole("tab", { name: "Enrollments" }));
  await settle();
  assert.equal(screen.getByTestId("where").textContent, "/hr-admin/learning?tab=enrollments");
  assert.ok(screen.getByText("Enrollments page"));
  assert.equal(screen.getByRole("tab", { name: "Enrollments" }).getAttribute("aria-selected"), "true");
});

test("L16: a manager's tab bar has no dashboard, reports or record screens", async (t) => {
  await learningPage(t, "manager", "/zoiko-hr/learning");
  assert.deepEqual(screen.getAllByRole("tab").map((b) => b.textContent), ["Courses", "Training Programs", "Assessments"]);
  assert.ok(screen.getByText("Courses page"));
  assert.equal(screen.queryByText("Dashboard page"), null);
});

const PEOPLE = [{ id: 4, first_name: "Sam", last_name: "Lee", email: "sam@example.test" }, { id: 5, first_name: "Ann", last_name: "Roy" }];

async function pickPerson(inputId, name) {
  fireEvent.focus(document.getElementById(inputId));
  fireEvent.change(document.getElementById(inputId), { target: { value: name.slice(0, 3) } });
  await settle(350);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
  await settle();
}

test("L4: an admin enrolls someone found by search, and a duplicate is refused in the dialog", async (t) => {
  const calls = { create: [], search: [] };
  let refuse = false;
  t.mock.module("../src/service/hrService.js", { exports: {
    getCourses: async () => ({ items: [{ id: 7, course_name: "Fire Safety", status: "active" }], total: 1 }),
    getEnrollments: async () => ({ items: [{ id: 1, course_id: 7, course_name: "Fire Safety", employee_id: 5, employee_name: "Ann Roy", status: "enrolled", progress_pct: 0 }], total: 1 }),
    createEnrollment: async (c, e) => { calls.create.push([c, e]); if (refuse) throw new Error("This person is already enrolled in this course."); return {}; },
    updateEnrollment: async () => ({}), deleteEnrollment: async () => ({}),
    searchLearningPeople: async (term) => { calls.search.push(term); return { items: PEOPLE }; },
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/learning/enrollments.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  assert.match(document.body.textContent, /Ann Roy/);
  fireEvent.click(screen.getByRole("button", { name: "+ Enroll Employee" }));
  fireEvent.click(screen.getByRole("button", { name: "Enroll" }));
  await settle();
  assert.match(screen.getByRole("dialog").textContent, /Choose a course\./);
  assert.match(screen.getByRole("dialog").textContent, /Choose who to enroll\./);
  assert.equal(calls.create.length, 0);

  fireEvent.change(document.getElementById("enroll-course"), { target: { value: "7" } });
  await pickPerson("enroll-person", "Sam Lee");
  assert.equal(calls.search.at(-1), "Sam");                                  // the search runs on the server
  refuse = true;
  fireEvent.click(screen.getByRole("button", { name: "Enroll" }));
  await settle();
  assert.deepEqual(calls.create, [[7, 4]]);
  assert.match(screen.getByRole("dialog").textContent, /already enrolled/);
  refuse = false;
  fireEvent.click(screen.getByRole("button", { name: "Enroll" }));
  await settle();
  assert.equal(screen.queryByRole("dialog"), null);
  assert.match(screen.getByRole("status").textContent, /Sam Lee is enrolled in "Fire Safety"/);
});

test("L4: program participants are added by search, the server's 'full' refusal is shown, and one can be removed", async (t) => {
  const calls = { add: [], remove: [] };
  t.mock.module("../src/service/hrService.js", { exports: {
    getProgramParticipants: async () => [{ id: 11, program_id: 3, employee_id: 5, employee_name: "Ann Roy", status: "assigned" }],
    addProgramParticipant: async (p, e) => { calls.add.push([p, e]); throw new Error("This program is full: it has reached its maximum number of participants."); },
    removeProgramParticipant: async (p, a) => { calls.remove.push([p, a]); return {}; },
    searchLearningPeople: async () => ({ items: PEOPLE }),
  } });
  const { default: Panel } = await import(`../src/modules/zoiko-hr/learning/ProgramParticipants.jsx?t=${Math.random()}`);
  render(React.createElement(Panel, { program: { id: 3, max_participants: 1 } }));
  await settle();
  assert.match(document.body.textContent, /Participants \(1 of 1\)/);
  assert.match(document.body.textContent, /reached its maximum/);
  await pickPerson("participant-person", "Sam Lee");
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await settle();
  assert.deepEqual(calls.add, [[3, 4]]);
  assert.match(screen.getByRole("alert").textContent, /program is full/);
  const realConfirm = window.confirm;
  window.confirm = () => true;
  try {
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await settle();
  } finally { window.confirm = realConfirm; }
  assert.deepEqual(calls.remove, [[3, 11]]);
});

test("L4: a certification is checked before it is sent, then saved for the chosen person", async (t) => {
  const created = [];
  t.mock.module("../src/service/hrService.js", { exports: {
    getCertifications: async () => ({ items: [], total: 0 }),
    createCertification: async (p) => { created.push(p); return {}; },
    updateCertification: async () => ({}), deleteCertification: async () => ({}),
    searchLearningPeople: async () => ({ items: PEOPLE }),
  } });
  const mod = await import(`../src/modules/zoiko-hr/learning/certifications.jsx?t=${Math.random()}`);
  assert.deepEqual(Object.keys(mod.validateCertification({ certification_name: " ", issuing_organization: "", issue_date: "2026-05-01", expiry_date: "2026-04-01", credential_url: "x", status: "active" }, null, true)).sort(),
    ["certification_name", "credential_url", "expiry_date", "person"]);
  render(React.createElement(mod.default));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "+ Add Certification" }));
  await pickPerson("cert-person", "Ann Roy");
  fireEvent.change(document.getElementById("cert-name"), { target: { value: " First Aid " } });
  fireEvent.change(document.getElementById("cert-issued"), { target: { value: "2026-05-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Add Certification" }));
  await settle();
  assert.deepEqual(created, [{ certification_name: "First Aid", issuing_organization: null, issue_date: "2026-05-01", expiry_date: null,
    credential_url: null, status: "active", employee_id: 5 }]);
  assert.match(screen.getByRole("status").textContent, /"First Aid" was added for Ann Roy/);
});

test("L4: skills list their holder and can be added with a level", async (t) => {
  const created = [];
  t.mock.module("../src/service/hrService.js", { exports: {
    getSkills: async () => ({ items: [{ id: 1, employee_id: 4, employee_name: "Sam Lee", skill_name: "Excel", category: "Office", proficiency_level: 4 }], total: 1 }),
    createSkill: async (p) => { created.push(p); return {}; }, updateSkill: async () => ({}), deleteSkill: async () => ({}),
    searchLearningPeople: async () => ({ items: PEOPLE }),
  } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/learning/skills.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  assert.match(document.body.textContent, /Sam Lee.*Excel.*4 · Advanced/);
  fireEvent.click(screen.getByRole("button", { name: "+ Add Skill" }));
  await pickPerson("skill-person", "Ann Roy");
  fireEvent.change(document.getElementById("skill-name"), { target: { value: "Python" } });
  fireEvent.change(document.getElementById("skill-level"), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Add Skill" }));
  await settle();
  assert.deepEqual(created, [{ skill_name: "Python", category: null, proficiency_level: 5, employee_id: 5 }]);
});

test("essay grading: the queue lists waiting attempts and the form sends whole points per essay", async (t) => {
  const graded = [];
  let queue = [{ id: 21, assessment_id: 9, assessment_title: "Write-up", course_name: "Ethics", employee_id: 4, employee_name: "Sam Lee",
    attempt_number: 1, status: "pending_review", completed_at: "2026-11-01T10:00:00Z",
    answers: JSON.stringify([{ question_id: 2, answer: "Because it is fair." }, { question_id: 1, answer: "4" }]) }];
  t.mock.module("../src/service/hrService.js", { exports: {
    getQuizReviewQueue: async () => queue,
    getQuestions: async () => [{ id: 1, question_type: "multiple_choice", question_text: "2+2?", points: 1 },
      { id: 2, question_type: "essay", question_text: "Why?", points: 3 }],
    gradeQuizAttempt: async (id, pts) => { graded.push([id, pts]); queue = []; return { id, score: 75, passed: true, status: "completed" }; },
  } });
  const mod = await import(`../src/modules/zoiko-hr/learning/review-queue.jsx?t=${Math.random()}`);
  assert.deepEqual(mod.checkMarks([{ id: 2, points: 3 }], { 2: "4" }).errors, { 2: "Give a whole number from 0 to 3." });
  assert.deepEqual(mod.checkMarks([{ id: 2, points: 3 }], { 2: "2" }).points, { 2: 2 });
  render(React.createElement(mod.default));
  await settle();
  assert.match(document.body.textContent, /Sam Lee.*Write-up.*Ethics/);
  fireEvent.click(screen.getByRole("button", { name: "Grade" }));
  await settle();
  const dialog = screen.getByRole("dialog", { name: "Grade essay answers" });
  assert.match(dialog.textContent, /Why\?/);
  assert.match(dialog.textContent, /Because it is fair\./);
  assert.doesNotMatch(dialog.textContent, /2\+2/);                          // only essays are marked by hand
  fireEvent.change(document.getElementById("mark-2"), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Grades" }));
  await settle();
  assert.equal(graded.length, 0);
  assert.match(dialog.textContent, /from 0 to 3/);
  fireEvent.change(document.getElementById("mark-2"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Grades" }));
  await settle();
  assert.deepEqual(graded, [[21, { 2: 2 }]]);
  assert.match(screen.getByRole("status").textContent, /Sam Lee scored 75% \(passed\)/);
  assert.match(document.body.textContent, /No answers are waiting for review/);
});

test("L4: a learner enrolls from the catalogue and then sees Enrolled; a refusal is shown on the card", async (t) => {
  const { default: LearnerCourses } = await import(`../src/pages/Peoples/Employees/Learning/LearnerCourses.jsx?t=${Math.random()}`);
  const courses = [{ id: 1, course_name: "Fire Safety" }, { id: 2, course_name: "First Aid" }];
  function Harness() {
    const [mine, setMine] = React.useState({ 2: { course_id: 2, status: "completed" } });
    const onEnroll = async (c) => {
      if (c.id === 99) throw new Error("This course is not open for enrollment.");
      setMine((m) => ({ ...m, [c.id]: { course_id: c.id, status: "enrolled" } }));
    };
    return React.createElement(LearnerCourses, { courses: [...courses, { id: 99, course_name: "Closed" }], enrollments: mine, onEnroll });
  }
  render(React.createElement(Harness));
  await settle();
  assert.match(document.body.textContent, /Completed/);
  fireEvent.click(screen.getByRole("button", { name: "Enroll in Fire Safety" }));
  await settle();
  assert.equal(screen.queryByRole("button", { name: "Enroll in Fire Safety" }), null);
  assert.match(document.body.textContent, /Enrolled/);
  fireEvent.click(screen.getByRole("button", { name: "Enroll in Closed" }));
  await settle();
  assert.match(screen.getByRole("alert").textContent, /not open for enrollment/);
});
