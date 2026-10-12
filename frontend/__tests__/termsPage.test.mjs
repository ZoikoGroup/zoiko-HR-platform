/** ZHR-1: the Terms & Conditions link on the registration page opens a real, complete Terms page (it used to fall through to the login page). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, cleanup, act } from "@testing-library/react";
import { TERMS_SECTIONS, TERMS_LAST_UPDATED } from "../src/pages/legal/termsContent.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });

async function open(t, url = "/terms") {
  t.mock.module("../src/landing/LandingHeader.jsx", { exports: { default: () => React.createElement("header", null, "HEADER") } });
  t.mock.module("../src/landing/Footer.jsx", { exports: { default: () => React.createElement("footer", null, "FOOTER") } });
  const { default: Page } = await import(`../src/pages/legal/TermsPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Routes, null,
    React.createElement(Route, { path: "/terms", element: React.createElement(Page) }),
    React.createElement(Route, { path: "/login", element: React.createElement("div", null, "LOGIN PAGE") }))));
  await settle();
}

test("the content covers the sections a user needs and every section has an unique anchor", () => {
  const ids = TERMS_SECTIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const needed of ["acceptance", "accounts", "evaluation", "acceptable-use", "your-data", "liability", "termination", "contact"]) assert.ok(ids.includes(needed), needed);
  for (const s of TERMS_SECTIONS) {
    assert.ok(s.title && s.paragraphs.length > 0, s.id);
    assert.ok(/^\d+\. /.test(s.title), "numbered: " + s.title);
  }
});

test("/terms shows the Terms page, not the login page, with a contents list that links to every section", async (t) => {
  await open(t);
  assert.doesNotMatch(document.body.textContent, /LOGIN PAGE/);
  assert.equal(document.querySelector("h1").textContent, "Terms & Conditions");
  assert.match(document.body.textContent, new RegExp(`Last updated ${TERMS_LAST_UPDATED}`));
  const toc = [...document.querySelectorAll(".terms-toc a")].map((a) => a.getAttribute("href"));
  assert.deepEqual(toc, TERMS_SECTIONS.map((s) => `#${s.id}`));
  for (const s of TERMS_SECTIONS) {
    const section = document.getElementById(s.id);
    assert.ok(section, s.id);
    assert.equal(section.querySelector("h2").textContent, s.title);
  }
  assert.equal(document.title, "Terms & Conditions | Zoiko HR");
});

test("the page offers a way back to registration and to sign in, and a contact address", async (t) => {
  await open(t);
  assert.equal(screen.getByRole("link", { name: "Back to registration" }).getAttribute("href"), "/register");
  assert.equal(screen.getByRole("link", { name: "Sign in" }).getAttribute("href"), "/login");
  assert.ok(document.querySelector('a[href^="mailto:info@zoikohr.com"]'));
});

test("a link to one section opens at that section", async (t) => {
  let scrolled = null;
  window.HTMLElement.prototype.scrollIntoView = function () { scrolled = this.id; };
  await open(t, "/terms#liability");
  assert.equal(scrolled, "liability");
});

test("the route exists, is public, and the registration link opens it in a new tab", () => {
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /<Route path="\/terms" element=\{<TermsPage \/>\} \/>/);
  const register = fs.readFileSync(new URL("../src/pages/auth/RegisterPage.jsx", import.meta.url), "utf8");
  assert.match(register, /<Link to="\/terms" target="_blank" rel="noopener noreferrer"/);
  const footer = fs.readFileSync(new URL("../src/landing/Footer.jsx", import.meta.url), "utf8");
  assert.match(footer, /label: "Terms of Service", href: "\/terms"/);
});
