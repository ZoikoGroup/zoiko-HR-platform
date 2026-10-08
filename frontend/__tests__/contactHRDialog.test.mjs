/** ZHR-90: Contact HR dialog validation and submission. */
import "./support/setup-jsdom.mjs";
import { test, afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, waitFor } from "@testing-library/react";
import { CONTACT_HR_TOPICS, normalizeMessage, validateContactHRForm, validateTopic, validateMessage } from "../src/utils/contactHRForm.js";

afterEach(() => cleanup());

describe("contactHRForm utils", () => {
  test("normalizeMessage trims, collapses whitespace, keeps newlines", () => {
    assert.equal(normalizeMessage("  hello   world  "), "hello world");
    assert.equal(normalizeMessage("line1\n  line2  \nline3"), "line1\nline2\nline3");
    assert.equal(normalizeMessage(""), "");
    assert.equal(normalizeMessage(null), "");
    assert.equal(normalizeMessage(undefined), "");
  });

  test("validateTopic accepts valid topics and rejects invalid", () => {
    assert.equal(validateTopic("Leave balance not set up"), null);
    assert.equal(validateTopic("Other"), null);
    assert.match(validateTopic(""), /Choose a topic/);
    assert.match(validateTopic("Invalid topic"), /Choose a topic from the list/);
    assert.match(validateTopic(null), /Choose a topic/);
  });

  test("validateMessage enforces length limits", () => {
    assert.match(validateMessage("short"), /at least 10 characters/);
    assert.match(validateMessage("x".repeat(1001)), /at most 1000 characters/);
    assert.equal(validateMessage("This is a valid message with enough characters."), null);
    assert.equal(validateMessage("x".repeat(10)), null);
    assert.equal(validateMessage("x".repeat(1000)), null);
  });

  test("validateContactHRForm returns all validation results", () => {
    const result = validateContactHRForm("Leave balance not set up", "This is a valid message.");
    assert.equal(result.topicError, null);
    assert.equal(result.messageError, null);
    assert.equal(result.normalizedMessage, "This is a valid message.");
  });

  test("CONTACT_HR_TOPICS matches server schema", () => {
    assert.deepEqual(CONTACT_HR_TOPICS, [
      "Leave balance not set up",
      "Leave request question",
      "Payroll or payslip",
      "Profile or documents",
      "Other",
    ]);
  });
});

const ME = { id: 7, firstName: "Anne", lastName: "Lee", email: "anne@x.com" };
const EMPTY_BALANCES = [];
const SOME_HISTORY = [
  { id: 1, leave_type: "Annual Leave", start_date: "2026-01-15", end_date: "2026-01-16", days: 2, status: "Approved" },
  { id: 2, leave_type: "Sick Leave", start_date: "2026-02-10", end_date: "2026-02-10", days: 1, status: "Pending" },
];

const delegate = {
  balances: EMPTY_BALANCES,
  history: SOME_HISTORY,
  contactHRCalls: [],
  contactHRError: null,
};

const svc = {
  getLeaveBalances: async () => delegate.balances,
  getLeaveRequests: async () => delegate.history,
  contactHR: async (topic, message) => {
    delegate.contactHRCalls.push({ topic, message });
    if (delegate.contactHRError) throw delegate.contactHRError;
    return { message: "Sent", sent_to: 2 };
  },
};

async function renderMyLeave(t, { balances = EMPTY_BALANCES, history = SOME_HISTORY, contactHRError } = {}) {
  delegate.balances = balances;
  delegate.history = history;
  delegate.contactHRCalls = [];
  delegate.contactHRError = contactHRError;

  t.mock.module("../src/service/employee.js", { exports: svc });
  t.mock.module("../src/service/api.js", { exports: { getStoredUser: () => ME, apiClient: {} } });
  t.mock.module("react-router-dom", { exports: { useNavigate: () => () => {} } });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children, actions }) => React.createElement("div", null, actions, children) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Leaves/Employee_MyLeaveDashboard.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  return { contactHRCalls: delegate.contactHRCalls };
}

test("MyLeaveDashboard shows empty state with Contact HR button when no balances", async (t) => {
  await renderMyLeave(t, { balances: [] });
  assert.ok(screen.getByText(/No Leave Balances Configured/i));
  assert.ok(screen.getByRole("button", { name: /Contact HR Department/i }));
});

test("MyLeaveDashboard shows balance cards when balances exist", async (t) => {
  await renderMyLeave(t, { balances: [{ leave_type: "Annual Leave", total_days: 20, used_days: 5, remaining_days: 15 }] });
  assert.ok(screen.getAllByText(/Annual Leave/i).length > 0);
  assert.ok(screen.getByText("15"));
  assert.ok(screen.getByText(/of 20 days remaining/i));
});

test("MyLeaveDashboard shows leave history with filters", async (t) => {
  await renderMyLeave(t);
  assert.ok(screen.getByText(/Leave History/i));
  assert.ok(screen.getAllByText(/Annual Leave/i).length > 0);
  assert.ok(screen.getByText(/Sick Leave/i));
  assert.ok(screen.getByRole("button", { name: /all/i }));
  assert.ok(screen.getByRole("button", { name: /pending/i }));
  assert.ok(screen.getByRole("button", { name: /approved/i }));
  assert.ok(screen.getByRole("button", { name: /rejected/i }));
});

test("MyLeaveDashboard filter tabs work", async (t) => {
  await renderMyLeave(t);
  fireEvent.click(screen.getByRole("button", { name: /pending/i }));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  assert.ok(screen.getByText(/Sick Leave/i));
  // Annual Leave may still be in pending or not visible - check it's not in approved view
  fireEvent.click(screen.getByRole("button", { name: /approved/i }));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  assert.ok(screen.getAllByText(/Annual Leave/i).length > 0);
});

test("Contact HR dialog opens from empty state button", async (t) => {
  await renderMyLeave(t, { balances: [] });
  fireEvent.click(screen.getByRole("button", { name: /Contact HR Department/i }));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  assert.ok(screen.getByRole("dialog", { name: /Contact HR Department/i }));
  assert.ok(screen.getByLabelText(/Topic/i));
  assert.ok(screen.getByLabelText(/Message/i));
});

test("Contact HR dialog validates topic and message", async (t) => {
  await renderMyLeave(t, { balances: [] });
  fireEvent.click(screen.getByRole("button", { name: /Contact HR Department/i }));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  // Set a valid topic and a short message, then submit
  await act(async () => {
    fireEvent.change(screen.getByLabelText(/Topic/i), { target: { value: "Leave balance not set up" } });
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: "short" } });
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Send/i }));
    await new Promise((r) => setTimeout(r, 50));
  });
  assert.ok(screen.getByText(/at least 10 characters/i));
});

test("Contact HR dialog submits successfully and shows confirmation", async (t) => {
  const { contactHRCalls } = await renderMyLeave(t, { balances: [] });
  fireEvent.click(screen.getByRole("button", { name: /Contact HR Department/i }));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  fireEvent.change(screen.getByLabelText(/Topic/i), { target: { value: "Leave balance not set up" } });
  fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: "Please set up my leave balance. I have been waiting for weeks." } });
  fireEvent.click(screen.getByRole("button", { name: /Send/i }));
  await waitFor(() => assert.ok(screen.getByText(/Message sent/i)));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  assert.equal(contactHRCalls.length, 1);
  assert.equal(contactHRCalls[0].topic, "Leave balance not set up");
  assert.equal(contactHRCalls[0].message, "Please set up my leave balance. I have been waiting for weeks.");
});

test("Contact HR dialog shows 400 'No HR contact' error", async (t) => {
  const err = Object.assign(new Error("No HR contact"), { status: 400 });
  await renderMyLeave(t, { balances: [], contactHRError: err });
  fireEvent.click(screen.getByRole("button", { name: /Contact HR Department/i }));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  fireEvent.change(screen.getByLabelText(/Topic/i), { target: { value: "Leave balance not set up" } });
  fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: "Please set up my leave balance. I have been waiting for weeks." } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Send/i }));
    await new Promise((r) => setTimeout(r, 50));
  });
  await waitFor(() => assert.ok(screen.getByText(/No HR contact is set up for your organization yet/i)));
});

test("Contact HR dialog shows 429 rate-limit error", async (t) => {
  const err = Object.assign(new Error("Rate limited"), { status: 429 });
  await renderMyLeave(t, { balances: [], contactHRError: err });
  fireEvent.click(screen.getByRole("button", { name: /Contact HR Department/i }));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  fireEvent.change(screen.getByLabelText(/Topic/i), { target: { value: "Leave balance not set up" } });
  fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: "Please set up my leave balance. I have been waiting for weeks." } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Send/i }));
    await new Promise((r) => setTimeout(r, 50));
  });
  await waitFor(() => assert.ok(screen.getByText(/Too many requests/i)), { timeout: 1000 });
});

test("Contact HR dialog uses correct default topic based on balances", async (t) => {
  const { contactHRCalls: calls1 } = await renderMyLeave(t, { balances: [] });
  fireEvent.click(screen.getByRole("button", { name: /Contact HR Department/i }));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  assert.equal(screen.getByLabelText(/Topic/i).value, "Leave balance not set up");
  // Close dialog
  fireEvent.click(screen.getByLabelText(/Close dialog/i));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
});