/** The new hire fills in a "Complete and return" form online: answers are typed in, missing ones are pointed out, and the
 * completed form is submitted with every answer in the shape the server expects. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });

const FORM = {
  category: "self_disclosure", title: "Self-Disclosure Declaration", document_id: 7, status: "requested", editable: true,
  items: [
    { type: "heading", level: 1, text: "Self-Disclosure Declaration" },
    { type: "fields", id: "b1", readonly: false, rows: [{ id: "b1.0", label: "Job reference number", editable: true, value: "", placeholder: "Enter the reference" },
      { label: "Name", editable: false, value: "Nora Newstarter" }] },
    { type: "choice", id: "b3", label: "1. Do you work exclusively for Tenant A Ltd?", options: ["Yes", "No"] },
    { type: "table", id: "b5", headers: ["Business", "Hours"], rows: [[{ value: "", placeholder: "" }, { value: "", placeholder: "" }]] },
    { type: "text", id: "b7", label: "Corrections", hint: "", rows: 3 },
    { type: "signature", id: "b9", name: "Nora Newstarter", statement: "I confirm the information is true." },
  ],
  answers: { "b1.0": "", b3: "", b5: [["", ""]], b7: "", b9: { name: "", confirmed: false } },
};

test("filling in and submitting a package form", async (t) => {
  const calls = { submit: [] };
  let fail = true;
  t.mock.module("../src/service/hrService.js", { exports: {
    getPortalPackageForm: async () => FORM,
    savePortalPackageForm: async (_t, _c, answers) => ({ ...FORM, answers }),
    submitPortalPackageForm: async (_t, _c, answers) => {
      calls.submit.push(answers);
      if (fail) { fail = false; throw Object.assign(new Error("Some answers are missing."), { detail: { errors: { b9: "Type your full name to sign." } } }); }
      return { documents: [] };
    },
  } });
  const { default: Filler } = await import(`../src/components/documents/PackageFormFiller.jsx?t=${Math.random()}`);
  const done = [];
  render(React.createElement(Filler, { token: "tok", category: "self_disclosure", onSubmitted: (v, m) => done.push(m) }));
  await settle();
  assert.match(document.body.textContent, /Nora Newstarter/);
  fireEvent.change(screen.getByLabelText("Job reference number"), { target: { value: "REF-1" } });
  fireEvent.click(screen.getByLabelText("No"));
  fireEvent.change(screen.getByLabelText("Business, row 1"), { target: { value: "Riverside Tutors" } });
  fireEvent.change(screen.getByLabelText("Corrections"), { target: { value: "None." } });
  fireEvent.click(screen.getByRole("button", { name: /Submit to HR/ }));
  await settle();
  assert.ok(screen.getAllByRole("alert").some((a) => /still needed/.test(a.textContent)));
  assert.match(document.body.textContent, /Type your full name to sign/);

  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText(/Type your full name/), { target: { value: "Nora Newstarter" } });
  fireEvent.click(screen.getByRole("button", { name: /Submit to HR/ }));
  await settle();
  assert.deepEqual(calls.submit[1], {
    "b1.0": "REF-1", b3: "No", b5: [["Riverside Tutors", ""]], b7: "None.", b9: { name: "Nora Newstarter", confirmed: true },
  });
  assert.match(done[0], /submitted/);
});
