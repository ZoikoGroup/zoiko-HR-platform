import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const app = read("src/App.jsx");
const navigation = read("src/navigation.js");

test("Prompt 2 workforce and payroll pages have routes and navigation entries", () => {
  for (const route of [
    "/zoiko-hr/onboarding/payroll-verifications",
    "/zoiko-hr/workforce-planning/job-descriptions",
  ]) {
    assert.ok(navigation.includes(`"${route}"`), `missing navigation entry for ${route}`);
    assert.ok(app.includes(`"${route}":`), `missing route override for ${route}`);
  }
});

test("onboarding portal forms and hire review and probation views are integrated", () => {
  const portal = read("src/pages/OnboardingPortalPage.jsx");
  const hires = read("src/modules/zoiko-hr/onboarding/new-hires.jsx");
  assert.match(app, /path="\/onboarding-portal\/:token"/);
  assert.match(portal, /<PortalStructuredForms token=\{token\} \/>/);
  assert.match(hires, /<OnboardingFormsReview hireId=\{rec\.id\} \/>/);
  assert.match(hires, /<ProbationScheduleForm employeeId=\{rec\.employee_id\}/);
});

test("manager onboarding tasks appear only on the manager dashboard", () => {
  const dashboard = read("src/modules/zoiko-hr/HrDashBoard.jsx");
  assert.match(dashboard, /role === ROLES\.MANAGER && .*<MyOnboardingTasks \/>/);
});
