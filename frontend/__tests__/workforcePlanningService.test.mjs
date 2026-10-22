import { test } from "node:test";
import assert from "node:assert/strict";

test("workforce planning service uses the contract routes and request payloads", async (t) => {
  const calls = [];
  const api = Object.fromEntries(["get", "post", "put"].map((method) => [
    method,
    async (...args) => { calls.push([method, ...args]); return { ok: true }; },
  ]));
  t.mock.module("../src/service/api.js", { exports: { api } });
  const service = await import(`../src/service/workforcePlanningService.js?test=${Math.random()}`);
  const jd = { title: "Engineer" };
  const decision = { approve: true, comment: "Reviewed" };
  const hc = { rationale: "Growth", plan_id: 7 };
  const position = { reason: "New role", job_description_id: 3 };
  const succession = { owner_id: 8, development_actions: "Mentoring" };

  await service.getJobDescriptions();
  await service.getJobDescription(2);
  await service.createJobDescription(jd);
  await service.updateJobDescription(2, jd);
  await service.checkJobDescriptionLanguage(2);
  await service.submitJobDescription(2);
  await service.decideJobDescription(2, decision);
  await service.createJobDescriptionVersion(2);
  await service.submitHeadcountAuthorization(4, hc);
  await service.decideHeadcountAuthorization(4, decision);
  await service.getHeadcountAuthorization(4);
  await service.requestPositionApproval(5, position);
  await service.decidePositionApproval(5, decision);
  await service.getPositionAuthorization(5);
  await service.submitSuccessionAuthorization(6, succession);
  await service.decideSuccessionAuthorization(6, decision);
  await service.getSuccessionPlanDocument(6);

  assert.deepEqual(calls, [
    ["get", "/hr/workforce/job-descriptions", { params: {} }],
    ["get", "/hr/workforce/job-descriptions/2"],
    ["post", "/hr/workforce/job-descriptions", jd],
    ["put", "/hr/workforce/job-descriptions/2", jd],
    ["post", "/hr/workforce/job-descriptions/2/language-check"],
    ["post", "/hr/workforce/job-descriptions/2/submit"],
    ["post", "/hr/workforce/job-descriptions/2/decision", decision],
    ["post", "/hr/workforce/job-descriptions/2/new-version"],
    ["post", "/hr/workforce/headcount/4/submit", hc],
    ["post", "/hr/workforce/headcount/4/decision", decision],
    ["get", "/hr/workforce/headcount/4/authorization"],
    ["post", "/hr/workforce/positions/5/request", position],
    ["post", "/hr/workforce/positions/5/decision", decision],
    ["get", "/hr/workforce/positions/5/authorization"],
    ["post", "/hr/workforce/succession/6/submit", succession],
    ["post", "/hr/workforce/succession/6/decision", decision],
    ["get", "/hr/workforce/succession/6/plan-document"],
  ]);
});
