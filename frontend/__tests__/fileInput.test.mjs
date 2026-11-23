/** QA R1-23 / R2-8: one styled file picker (Browse button + file name) replaces the bare "Choose File / No file chosen". */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React, { useState } from "react";
import { render, screen, cleanup, act, fireEvent, within } from "@testing-library/react";
import FileInput, { fileSizeLabel } from "../src/components/FileInput.jsx";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

function Harness({ onPick }) {
  const [file, setFile] = useState(null);
  return React.createElement("div", null,
    React.createElement("label", { htmlFor: "f1" }, "File"),
    React.createElement(FileInput, { id: "f1", accept: ".pdf", file, onChange: (f) => { setFile(f); onPick?.(f); } }));
}

test("shows a Browse button and 'No file chosen', then the chosen file's name and size; Remove empties it", async () => {
  const picked = [];
  render(React.createElement(Harness, { onPick: (f) => picked.push(f?.name ?? null) }));
  const input = screen.getByLabelText("File");
  assert.equal(input.type, "file");
  assert.equal(input.getAttribute("accept"), ".pdf");
  assert.match(input.className, /sr-only/, "the native control is hidden but still focusable");
  const box = input.closest("[data-file-input]");
  assert.match(box.textContent, /Browse/);
  assert.match(box.textContent, /No file chosen/);
  fireEvent.change(input, { target: { files: [new File(["x".repeat(2048)], "offer.pdf", { type: "application/pdf" })] } });
  await settle();
  assert.match(box.textContent, /offer\.pdf/);
  assert.match(box.textContent, /2 KB/);
  fireEvent.click(within(box).getByRole("button", { name: "Remove offer.pdf" }));
  await settle();
  assert.match(box.textContent, /No file chosen/);
  assert.deepEqual(picked, ["offer.pdf", null]);
});

test("the Browse label opens the picker (it is a <label> for the input) and the invalid state is announced", () => {
  render(React.createElement(FileInput, { id: "f2", invalid: true, file: null, onChange: () => {} }));
  const input = document.getElementById("f2");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  const label = input.closest("[data-file-input]").querySelector("label");
  assert.equal(label.htmlFor, "f2");
  assert.match(label.className, /border-rose-300/);
});

test("file sizes read naturally", () => {
  assert.equal(fileSizeLabel(500), "500 B");
  assert.equal(fileSizeLabel(1536), "2 KB");
  assert.equal(fileSizeLabel(5 * 1024 * 1024), "5.0 MB");
});

test("the Documents module's Upload dialog uses it", async (t) => {
  const { default: UploadDialog } = await import("../src/modules/zoiko-hr/documents/components/UploadDialog.jsx");
  render(React.createElement(UploadDialog, { open: true, category: { id: 1, name: "Passport" }, onSubmit: async () => {}, onClose: () => {} }));
  const dialog = screen.getByRole("dialog");
  const input = within(dialog).getByLabelText("File");
  assert.ok(input.closest("[data-file-input]"));
  assert.match(input.closest("[data-file-input]").textContent, /Browse/);
});

test("the company file dialog uses it", async () => {
  const { default: CompanyFileDialog } = await import("../src/modules/zoiko-hr/documents/components/CompanyFileDialog.jsx");
  render(React.createElement(CompanyFileDialog, { open: true, mode: "new", category: { id: 2, name: "Policies" }, onSubmit: async () => {}, onClose: () => {} }));
  const input = within(screen.getByRole("dialog")).getByLabelText("File");
  assert.match(input.closest("[data-file-input]").textContent, /Browse/);
});
