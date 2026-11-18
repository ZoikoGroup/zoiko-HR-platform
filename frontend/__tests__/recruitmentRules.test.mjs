/** QA report #13 (BUG-1…BUG-28): the Recruitment / New hire forms refuse what the server refuses, with the server's words. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateRequisition, validateOfferForm, wholeAmountProblem, equityProblem, searchQuery, blockKeys, WHOLE_NUMBER_BLOCKED,
  serverFieldErrors, WHOLE_AMOUNT_MESSAGE, EQUITY_MESSAGE, CURRENCY_MESSAGE, DEPARTMENT_MESSAGE, PAY_AMOUNT_MESSAGE,
} from "../src/modules/zoiko-hr/recruitment/recruitmentRules.js";
import { phoneInputFilter, MESSAGES } from "../src/utils/fieldRules.js";
import { validateCandidateForm } from "../src/utils/candidateForm.js";
import { validateInterviewForm } from "../src/utils/interviewFlow.js";
import { personEmailError, suggestEmail } from "../src/utils/realEmail.js";

const DEPTS = [{ id: 1, name: "Engineering" }, { id: 2, name: "Design" }];
const LISTS = { departments: DEPTS, currencies: ["INR", "USD", "EUR"] };
const REQ = { title: "Backend Engineer", department: "Engineering", location: "", openings: 1, budget_min: "", budget_max: "",
  currency: "INR", description: "", requirements: "" };
const PERSON = "Use letters only. Spaces, hyphens (-), apostrophes (') and full stops are allowed.";
const JOB_TITLE = "Use letters, numbers, spaces and & - / , . ( ) + # only. Include at least one letter.";

test("requisition: decimal budgets, made-up currencies and typed departments are refused (BUG-1, 3, 4, 5)", () => {
  assert.deepEqual(validateRequisition(REQ, 0, LISTS), {});
  assert.equal(validateRequisition({ ...REQ, budget_min: "0.30" }, 0, LISTS).budget_min, WHOLE_AMOUNT_MESSAGE);
  assert.equal(validateRequisition({ ...REQ, budget_max: "0.50" }, 0, LISTS).budget_max, WHOLE_AMOUNT_MESSAGE);
  assert.equal(validateRequisition({ ...REQ, budget_min: "-5" }, 0, LISTS).budget_min, WHOLE_AMOUNT_MESSAGE);
  assert.equal(validateRequisition({ ...REQ, budget_min: "900000", budget_max: "600000" }, 0, LISTS).budget_max,
    "The budget maximum cannot be below the minimum.");
  assert.equal(validateRequisition({ ...REQ, currency: "ABC" }, 0, LISTS).currency, CURRENCY_MESSAGE);
  assert.equal(validateRequisition({ ...REQ, department: "765$%^&*" }, 0, LISTS).department, DEPARTMENT_MESSAGE);
  assert.equal(validateRequisition({ ...REQ, department: "  engineering " }, 0, LISTS).department, undefined);
  assert.equal(validateRequisition({ ...REQ, location: "@#$Main" }, 0, LISTS).location, MESSAGES.location);   // BUG-2
  assert.equal(validateRequisition({ ...REQ, title: "*&^%$45^&87" }, 0, LISTS).title, JOB_TITLE);
  assert.deepEqual(validateRequisition({ ...REQ, budget_min: "600000", budget_max: "900000", location: "Bengaluru, India" }, 0, LISTS), {});
});

test("whole amounts and percentages", () => {
  assert.equal(wholeAmountProblem(""), "");
  assert.equal(wholeAmountProblem("600000"), "");
  assert.equal(wholeAmountProblem("0"), WHOLE_AMOUNT_MESSAGE);
  assert.equal(wholeAmountProblem("1e5"), WHOLE_AMOUNT_MESSAGE);
  assert.equal(wholeAmountProblem("1000000000000"), WHOLE_AMOUNT_MESSAGE);
  assert.equal(equityProblem("0.25"), "");
  assert.equal(equityProblem("100"), "");
  assert.equal(equityProblem("-20000"), EQUITY_MESSAGE);
  assert.equal(equityProblem("150"), EQUITY_MESSAGE);
  assert.equal(equityProblem("0.255"), EQUITY_MESSAGE);
  assert.equal(equityProblem("abc"), EQUITY_MESSAGE);
});

test("number boxes do not take the keys that can never be valid", () => {
  const press = (key) => { let blocked = false; blockKeys(WHOLE_NUMBER_BLOCKED)({ key, preventDefault: () => { blocked = true; } }); return blocked; };
  for (const key of [".", ",", "e", "E", "+", "-"]) assert.ok(press(key), key);
  assert.ok(!press("5"));
});

test("offer: junk names, places, patterns, negative equity and a zero salary are refused (BUG-18…23)", () => {
  const good = { candidate_name: "Priya Sharma", position: "Product Designer", work_location: "Pune, India",
    work_pattern: "Mon–Fri, 9:30–18:30", equity: "0.25", employment_type: "full_time", pay: { amount: "1200000", remuneration_type: "salary" } };
  assert.deepEqual(validateOfferForm(good), {});
  const bad = validateOfferForm({ ...good, candidate_name: "%$#", position: "*&^%", work_location: "*&^%$%^&88",
    work_pattern: "*&^%$#%^&*9gh&", equity: "-20000", pay: { amount: "0", remuneration_type: "salary" } });
  assert.deepEqual(bad, { candidate_name: PERSON, position: JOB_TITLE, work_location: MESSAGES.location, work_pattern: MESSAGES.work_pattern,
    equity: EQUITY_MESSAGE, salary: PAY_AMOUNT_MESSAGE });
  assert.equal(validateOfferForm({ ...good, employment_type: "internship", equity: "-1" }).equity, undefined);   // no equity for interns
});

test("candidate and interview forms use the same rules (BUG-7, 9, 10, 12, 13, 14, 16)", () => {
  const c = { name: "%$##$%$TR$%$", email: "a@gmail.com", phone: "", position: "#$%$#TRF", status: "applied", source: "",
    location: "uytresdfty#$%$#@", experience: "", resume_link: "", notes: "", requisition_id: "" };
  const e = validateCandidateForm(c);
  assert.deepEqual([e.name, e.position, e.location], [PERSON, JOB_TITLE, MESSAGES.location]);
  assert.deepEqual(validateCandidateForm({ ...c, name: "अनिल कुमार", position: "Senior Engineer II", location: "Hyderabad, India" }), {});
  const iv = validateInterviewForm({ candidate_name: "%$#@", position: "#$%#", interview_date: "2026-12-01", interview_type: "in_person",
    location: "@#$#^%$#$", interviewer: "%$#@#%$" });
  assert.deepEqual([iv.candidate_name, iv.position, iv.location, iv.interviewer], [PERSON, JOB_TITLE, MESSAGES.location, PERSON]);
  assert.equal(validateInterviewForm({ candidate_id: "4", interview_date: "2026-12-01", interview_type: "in_person", interviewer_id: "2" }).location,
    "Enter where the in-person interview takes place.");
});

test("search boxes: a query without a letter or digit searches nothing (BUG-11, 15)", () => {
  assert.equal(searchQuery("^%$%^%$#@"), "");
  assert.equal(searchQuery("  Anil​  "), "Anil");
  assert.equal(searchQuery("x".repeat(150)).length, 100);
});

test("phone boxes drop symbols as they are typed (BUG-26) and email typos are suggested (BUG-8, 25)", () => {
  assert.equal(phoneInputFilter("(*&^$%^&^%%^"), "(");
  assert.equal(phoneInputFilter("+91 98765*43210"), "+91 9876543210");
  assert.equal(suggestEmail("yash@gmial.com"), "yash@gmail.com");
  assert.equal(suggestEmail("yash@gmail.com"), "");
  assert.match(personEmailError("noreply@gmail.com"), /System addresses/);
  assert.equal(personEmailError("neha.verma@gmail.com"), "");
});

test("the server's 422 list lands on the right fields", () => {
  const err = { validation: [{ loc: ["body", "department"], msg: DEPARTMENT_MESSAGE }, { loc: ["body", "location"], msg: `Value error, ${MESSAGES.location}` }] };
  assert.deepEqual(serverFieldErrors(err, ["department", "location"]), { department: DEPARTMENT_MESSAGE, location: MESSAGES.location });
});
