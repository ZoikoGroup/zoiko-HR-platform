/** "Set up docs for your organisation", step 1: templates and other documents upload from their own sections. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const SESSION = { id: 3, status: "uploading", files: [{ id: 1, filename: "offer.docx", role: "template", label: "tpl:auto",
  scan_status: "clean", extract_status: "done", warnings: [] }], file_types: ["docx"], limits: { files: 20, file_mb: 20, total_mb: 100 } };

test("other documents are uploaded from their own section, as sources", async (t) => {
  const calls = [];
  t.mock.module("../src/service/docsSetupService.js", { exports: {
    uploadDocsSetupFile: async (id, file, label) => {
      calls.push({ id, name: file.name, label });
      return { ...SESSION, files: [...SESSION.files, { id: 2, filename: file.name, role: "source", label: label || null,
        scan_status: "clean", extract_status: "done", warnings: [] }] };
    },
    deleteDocsSetupFile: async () => SESSION,
    setDocsSetupFileLabel: async (id, fileId, label) => { calls.push({ relabel: fileId, label }); return SESSION; },
  } });
  const { default: UploadStep } = await import(`../src/modules/zoiko-hr/onboarding/docs-setup/UploadStep.jsx?t=${Math.random()}`);
  let latest = SESSION;
  const view = render(React.createElement(UploadStep, { session: SESSION, onSession: (s) => { latest = s; }, locked: false }));
  const section = screen.getByRole("region", { name: "Other documents" });
  const input = section.querySelector('input[type="file"]');
  const file = new File(["PK"], "handbook.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  fireEvent.change(input, { target: { files: [file] } });             // uploaded as soon as it is chosen
  await settle();
  assert.deepEqual(calls, [{ id: 3, name: "handbook.docx", label: "" }]);
  view.rerender(React.createElement(UploadStep, { session: latest, onSession: () => {}, locked: false }));
  const other = screen.getByRole("region", { name: "Other documents" });
  assert.ok(within(other).getByText("handbook.docx"));
  fireEvent.change(within(other).getByLabelText("What is it?"), { target: { value: "handbook" } });
  await settle();
  assert.deepEqual(calls.at(-1), { relabel: 2, label: "handbook" }, "the kind can be changed after uploading");
});

