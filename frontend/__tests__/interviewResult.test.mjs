/** After an interview is marked completed the feedback & result window opens by itself, with "Interview cleared" and
 * "Rejected"; saving records the result (final) and e-mails the candidate unless HR unticks it. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

// one shared log: interviews.jsx is re-imported per test but its dialog module is cached with the first test's mocks
const calls = { update: [], feedback: [] };
let feedbackReply = {};

const IV = (id, status, name, extra = {}) => ({ id, candidate_id: id + 100, candidate_name: name, position: "Dev", interview_type: "video",
  interview_date: "2026-11-01", status, ...extra });

async function load(t, items) {
  calls.update.length = 0;
  calls.feedback.length = 0;
  feedbackReply = {};
  t.mock.module("react-router-dom", { exports: { NavLink: ({ children }) => React.createElement("a", null, typeof children === "function" ? children({ isActive: false }) : children) } });
  t.mock.module("../src/components/HRPage.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  t.mock.module("../src/service/hrService.js", { exports: {
    getInterviews: async () => ({ items }),
    createInterview: async () => ({}), deleteInterview: async () => ({}),
    getCandidates: async () => ({ items: items.map((iv) => ({ id: iv.candidate_id, name: iv.candidate_name, email: `${iv.candidate_name.split(" ")[0].toLowerCase()}@mail.com` })) }),
    updateInterview: async (id, p) => { calls.update.push([id, p]); return { emails_sent: 2 }; },
    updateInterviewFeedback: async (id, body) => { calls.feedback.push([id, body]); return { id, ...body, result_emailed: body.notify_candidate, ...feedbackReply }; },
  } });
  t.mock.module("../src/service/employee.js", { exports: { getEmployees: async () => ({ items: [] }) } });
  const { default: Page } = await import(`../src/modules/zoiko-hr/recruitment/interviews.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
}

const showAll = () => fireEvent.click(screen.getByRole("button", { name: "View all interviews" }));
const statusCard = (name) => {
  const row = screen.getByText(name).closest("tr");
  if (!row.querySelector("[data-status-actions]")) fireEvent.click(within(row).getByRole("button", { name: `More actions for ${name}` }));
  return row.querySelector("[data-status-actions]");
};

async function complete(name) {
  const original = globalThis.window.confirm;
  globalThis.window.confirm = () => true;
  try {
    fireEvent.click(within(statusCard(name)).getByRole("button", { name: "Mark completed" }));
    await settle();
  } finally {
    globalThis.window.confirm = original;
  }
}

test("completing an interview opens the result window with Interview cleared and Rejected", async (t) => {
  await load(t, [IV(3, "scheduled", "Sue Soon")]);
  showAll();
  await complete("Sue Soon");
  const dialog = screen.getByRole("dialog", { name: /Interview result · Sue Soon/ });
  const options = within(dialog).getAllByRole("radio").map((r) => r.textContent);
  assert.ok(options[0].startsWith("Interview cleared") && options[1].startsWith("Rejected"), options.join(" | "));
  assert.equal(within(dialog).getByRole("button", { name: /^Save result/ }).disabled, true, "a result must be chosen first");
});

test("choosing Rejected with a note records the result and e-mails the candidate", async (t) => {
  await load(t, [IV(3, "scheduled", "Sue Soon")]);
  showAll();
  await complete("Sue Soon");
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("radio", { name: /Rejected/ }));
  assert.match(dialog.textContent, /sue@mail\.com/);
  fireEvent.change(within(dialog).getByLabelText(/Note for the candidate/), { target: { value: "Thanks for your time." } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save result & email candidate" }));
  await settle();
  assert.deepEqual(calls.feedback, [[3, { feedback: null, rating: null, result: "rejected", result_message: "Thanks for your time.", notify_candidate: true }]]);
  assert.equal(screen.queryByRole("dialog"), null);
  assert.match(document.body.textContent, /Result recorded: rejected\. The candidate has been e-mailed\./);
});

test("HR can record Interview cleared without e-mailing the candidate", async (t) => {
  await load(t, [IV(3, "scheduled", "Sue Soon")]);
  showAll();
  await complete("Sue Soon");
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("radio", { name: /Interview cleared/ }));
  fireEvent.click(within(dialog).getByRole("checkbox"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save result" }));
  await settle();
  assert.equal(calls.feedback[0][1].result, "cleared");
  assert.equal(calls.feedback[0][1].notify_candidate, false);
});

test("a recorded result is shown in the list and locked in the window", async (t) => {
  await load(t, [IV(1, "completed", "Dan Done", { result: "cleared", result_emailed: true }), IV(2, "completed", "Pat Pending")]);
  showAll();
  assert.ok(within(screen.getByText("Dan Done").closest("tr")).getByText("Interview cleared"));
  const pending = within(screen.getByText("Pat Pending").closest("tr")).getByRole("button", { name: /Result pending/ });
  fireEvent.click(within(screen.getByText("Dan Done").closest("tr")).getByRole("button", { name: "More actions for Dan Done" }));
  fireEvent.click(screen.getByRole("button", { name: /Feedback & result/ }));
  const dialog = screen.getByRole("dialog");
  assert.equal(within(dialog).queryAllByRole("radio").length, 0, "no way to change a recorded result");
  assert.match(dialog.textContent, /was recorded and the candidate was e-mailed/);
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  fireEvent.click(pending);
  assert.equal(within(screen.getByRole("dialog")).getAllByRole("radio").length, 2);
});
