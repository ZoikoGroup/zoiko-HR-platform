import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const app = read("src/App.jsx");
const navigation = read("src/navigation.js");
const roles = read("src/config/roles.js");
const service = read("src/service/workDocumentsService.js");

test("Prompt 3 pages have routes and navigation entries", () => {
  for (const route of [
    "/zoiko-hr/attendance/time-requests",
    "/zoiko-hr/compensation/approvals",
    "/employee/documents/policies",
    "/employee/compensation",
    "/employee/ess/time-requests",
  ]) {
    assert.ok(navigation.includes(`"${route}"`), `missing navigation entry for ${route}`);
    assert.ok(app.includes(`"${route}":`), `missing route for ${route}`);
  }
  // the policy library stays routed but left the sidebar on request (2026-10-22)
  assert.ok(app.includes('"/zoiko-hr/documents/policies":') && !navigation.includes('"/zoiko-hr/documents/policies"'));
});

test("employees and managers can open their own policies and compensation", () => {
  const employee = roles.slice(roles.indexOf("[ROLES.EMPLOYEE]: ["));
  assert.match(employee, /"\/employee\/compensation"/);
  assert.match(employee, /"\/employee\/ess\/time-requests"/);
  const manager = roles.slice(roles.indexOf("[ROLES.MANAGER]: ["), roles.indexOf("[ROLES.EMPLOYEE]: ["));
  assert.match(manager, /"\/employee\/compensation"/);
});

test("the service calls the Prompt 3 endpoints and never builds a PDF in the browser", () => {
  for (const endpoint of ["/hr/policies", "/hr/me/policies", "/hr/policies/audience-preview", "/hr/leave-documents/", "/hr/time/overtime",
    "/hr/time/corrections", "/hr/time/rosters/publish", "/hr/compensation-documents", "/hr/me/compensation"]) {
    assert.ok(service.includes(endpoint), `missing ${endpoint}`);
  }
  for (const file of ["src/modules/zoiko-hr/documents/policies/PolicyLibraryPage.jsx", "src/modules/zoiko-hr/compensation/approvals.jsx",
    "src/pages/Peoples/Employees/Compensation/Employee_MyCompensation.jsx"]) {
    assert.doesNotMatch(read(file), /pdfmake|jspdf|html2canvas/i, file);
  }
});

test("refusing leave asks for a reason and the sickness reason is only revealed on request", () => {
  const tools = read("src/modules/zoiko-hr/leave/LeaveDecisionTools.jsx");
  assert.match(tools, /decision_reason: reason\.trim\(\)/);
  assert.match(tools, /Give the reason for refusing/);
  assert.match(tools, /revealSensitiveLeaveReason/);
  const list = read("src/modules/zoiko-hr/leave/leave-requests.jsx");
  assert.match(list, /<RefuseLeaveModal/);
  assert.match(list, /<ConfirmFamilyLeaveModal/);
  const apply = read("src/pages/Peoples/Employees/Leaves/Employee_ApplyLeaveForm.jsx");
  assert.match(apply, /!isSick && !isBereavement && formData\.reason/);
  assert.match(apply, /parental_type/);
});

test("the publish wizard previews recipients before publishing", () => {
  const page = read("src/modules/zoiko-hr/documents/policies/PolicyLibraryPage.jsx");
  assert.match(page, /previewPolicyAudience/);
  assert.match(page, /Preview recipients/);
  assert.ok(page.indexOf("runPreview") < page.indexOf("publishPolicyDistribution(id"), "preview comes before publish");
});
