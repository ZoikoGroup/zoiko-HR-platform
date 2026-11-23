/** The welcome message: the portal shows the server-rendered blocks as text (never HTML); the editor flags unknown placeholders. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

test("server blocks render as headings and paragraphs with line breaks, and HTML stays text", async () => {
  const { default: WelcomeMessage } = await import("../src/components/WelcomeMessage.jsx");
  const blocks = [
    { type: "heading", text: "Welcome to the Team!" },
    { type: "paragraph", lines: ["Hi <script>alert(1)</script>,", "second line"] },
    { type: "paragraph", lines: ["Another paragraph."] },
  ];
  const { container } = render(React.createElement(WelcomeMessage, { blocks, signature: "Your People & Culture Team" }));
  assert.equal(container.querySelector("h2").textContent, "Welcome to the Team!");
  const paras = container.querySelectorAll("p");
  assert.equal(paras[0].querySelectorAll("br").length, 1);
  assert.equal(container.querySelector("script"), null);
  assert.match(container.textContent, /Hi <script>alert\(1\)<\/script>,/);
  assert.match(container.textContent, /Your People & Culture Team/);
});

test("nothing is shown without blocks", async () => {
  const { default: WelcomeMessage } = await import("../src/components/WelcomeMessage.jsx");
  const { container } = render(React.createElement(WelcomeMessage, { blocks: null }));
  assert.equal(container.textContent, "");
});

test("only the five placeholders are allowed", async (t) => {
  t.mock.module("../src/service/hrService.js", { exports: { previewWelcomeMessage: async () => ({}), sendTestWelcomeMessage: async () => ({}) } });
  const { unknownPlaceholders } = await import(`../src/modules/zoiko-hr/onboarding/WelcomeMessageEditor.jsx?t=${Math.random()}`);
  assert.deepEqual(unknownPlaceholders("Hi {{employee_first_name}}, see you on {{ start_date }} at {{company_name}}"), []);
  assert.deepEqual(unknownPlaceholders("Hi {{first_name}} {{salary}} {{first_name}}"), ["first_name", "salary"]);
});
