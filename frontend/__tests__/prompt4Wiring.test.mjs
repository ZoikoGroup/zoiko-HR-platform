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
const service = read("src/service/goLiveService.js");

test("Prompt 4 pages have routes and navigation entries", () => {
  // the documents centre stays routed but left the sidebar on request (2026-10-22)
  assert.ok(app.includes('"/zoiko-hr/documents/centre":') && !navigation.includes('"/zoiko-hr/documents/centre"'));
  for (const route of ["/zoiko-hr/performance/probation", "/zoiko-hr/employee-changes",
    "/employee/documents/to-action", "/employee/performance", "/super-admin/template-controls"]) {
    assert.ok(navigation.includes(`"${route}"`), `missing navigation entry for ${route}`);
    assert.ok(app.includes(`"${route}":`), `missing route for ${route}`);
  }
  assert.match(roles, /"\/super-admin\/template-controls"/);
});

test("the ESS home shows documents to action", () => {
  assert.match(read("src/pages/Peoples/Employees/ESS/Employee_EssDashboard.jsx"), /<DocumentActionsWidget \/>/);
});

test("the service calls the Prompt 4 endpoints", () => {
  for (const endpoint of ["/hr/me/document-actions", "/hr/performance-documents", "/hr/changes", "/hr/me/transfer-requests",
    "/hr/document-centre", "/hr/learning-documents/compliance", "/super-admin/doc-templates/packs"]) {
    assert.ok(service.includes(endpoint), `missing ${endpoint}`);
  }
});

test("letters follow decisions and the record changes only on completion", () => {
  const changes = read("src/modules/zoiko-hr/employee-changes/changes.jsx");
  assert.match(changes, /completeChange/);
  assert.match(changes, /Someone else must approve it/);
  const perf = read("src/modules/zoiko-hr/performance/performance-documents.jsx");
  assert.match(perf, /evidence required for every rating/);
  assert.match(perf, /three people/);
});
