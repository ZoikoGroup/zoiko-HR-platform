import test from "node:test";
import assert from "node:assert/strict";
import { parseAppraisalPeriod, validateAppraisalForm } from "../src/utils/appraisalPeriod.js";

test("valid periods are accepted and written one way", () => {
  for (const [raw, want] of [["2024-2025", "2024-2025"], [" 2024 - 2025 ", "2024-2025"], ["2024-25", "2024-2025"], ["2024/2025", "2024-2025"], ["2025", "2025"], ["q1 2026", "Q1 2026"], ["H2-2025", "H2 2025"]]) {
    assert.deepEqual(parseAppraisalPeriod(raw), { value: want, error: "" }, raw);
  }
});

test("the reported 20214-2025 and other bad periods are refused with a message", () => {
  for (const raw of ["20214-2025", "2024-20255", "2024-2026", "2025-2024", "2024-2024", "1999-2000", "12345", "abc", "", "  ", "Q5 2026", "H3 2025", "2024-", "Q1 20266"]) {
    const r = parseAppraisalPeriod(raw);
    assert.equal(r.value, "", raw);
    assert.ok(r.error.length > 10, raw);
  }
});

test("the form is checked as a whole", () => {
  const ok = { employee_id: "1", cycle: "2024-25", reviewer_id: "2", self_score: "4", manager_score: "", final_score: "5", salary_hike: "10" };
  const good = validateAppraisalForm(ok);
  assert.deepEqual(good.errors, {});
  assert.equal(good.cycle, "2024-2025");
  const bad = validateAppraisalForm({ ...ok, employee_id: "", cycle: "20214-2025", reviewer_id: "1", self_score: "6", final_score: "-1", salary_hike: "150" });
  assert.deepEqual(Object.keys(bad.errors).sort(), ["cycle", "employee_id", "final_score", "salary_hike", "self_score"]);
  assert.ok(validateAppraisalForm({ ...ok, employee_id: "3", reviewer_id: "3" }).errors.reviewer_id);
});
