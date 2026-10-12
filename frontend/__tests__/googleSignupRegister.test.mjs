/** After "Continue with Google" for a person with no account: the Register page opens with their Google email filled in, and the
 * organization they register starts with the address already confirmed. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { readGoogleSignup, withoutGoogleSignupParams } from "../src/utils/googleSignup.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

test("the address Google's sign-in sends the person to is read, and then cleaned", () => {
  assert.deepEqual(readGoogleSignup("?google_email=lee%40gmail.com&google_name=Lee+Park&google_proof=abc.def"), { email: "lee@gmail.com", name: "Lee Park", proof: "abc.def" });
  assert.equal(readGoogleSignup("?google_email=lee%40gmail.com"), null, "an email without the proof is not trusted");
  assert.equal(readGoogleSignup(""), null);
  assert.equal(withoutGoogleSignupParams("?google_email=a&google_name=b&google_proof=c&plan=core"), "?plan=core");
  assert.equal(withoutGoogleSignupParams("?google_proof=c"), "");
});

function Where() {
  const l = useLocation();
  return React.createElement("div", { "data-testid": "where" }, `${l.pathname}${l.search}`);
}

async function open(t, url, register) {
  const calls = { register: [] };
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({
    error: null,
    register: register || (async (payload) => { calls.register.push(payload); return { evaluation_ends_at: "2026-10-25T00:00:00Z" }; }),
  }) } });
  t.mock.module("../src/hooks/usePublicCatalog.js", { exports: { usePublicCatalog: () => ({ byCode: {} }), formatRate: () => null } });
  t.mock.module("../src/components/PlanComparison.jsx", { exports: { default: () => React.createElement("div") } });
  t.mock.module("../src/landing/LandingHeader.jsx", { exports: { default: () => React.createElement("header") } });
  t.mock.module("../src/landing/Footer.jsx", { exports: { default: () => React.createElement("footer") } });
  const { default: Page } = await import(`../src/pages/auth/RegisterPage.jsx?t=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Routes, null,
    React.createElement(Route, { path: "/register", element: React.createElement(React.Fragment, null, React.createElement(Page), React.createElement(Where)) }),
    React.createElement(Route, { path: "/register/success", element: React.createElement(Where) }))));
  await settle();
  return calls;
}

const labelled = (label) => {
  const l = [...document.querySelectorAll("label")].find((x) => x.textContent.trim().startsWith(label));
  return l?.parentElement.querySelector("input,select,textarea");
};
const type = (label, value) => fireEvent.change(labelled(label), { target: { value } });
const next = async () => { fireEvent.click(screen.getByRole("button", { name: "Continue" })); await settle(); };

const GOOGLE_URL = "/register?google_email=lee.park%40gmail.com&google_name=Lee+Park&google_proof=signed.proof";

test("the page says who signed in, keeps the proof out of the address bar, and fills in the registered email", async (t) => {
  await open(t, GOOGLE_URL);
  assert.match(document.body.textContent, /You signed in with Google as lee\.park@gmail\.com/);
  assert.match(document.body.textContent, /already confirmed/);
  assert.equal(document.querySelector('[data-testid="where"]').textContent, "/register", "the proof is not left in the address");
  fireEvent.click(screen.getByText("Core"));                       // choose a plan
  await next();
  assert.equal(labelled("Registered Email").value, "lee.park@gmail.com");
});

test("the admin step uses the Google name and email, and the email cannot be changed", async (t) => {
  await open(t, GOOGLE_URL);
  fireEvent.click(screen.getByText("Core"));
  await next();
  type("Organization Name", "Acme Inc."); type("Organization Type", "partnership"); type("Phone Number", "9876543210");
  type("Tax / Registration Number", "TAX123"); type("Address", "1 Main Road");
  type("Country", [...labelled("Country").options].find((o) => o.value)?.value);
  await next();
  assert.equal(labelled("Admin Name").value, "Lee Park");
  assert.equal(labelled("Admin Email").value, "lee.park@gmail.com");
  assert.equal(labelled("Admin Email").readOnly, true);
  assert.match(document.body.textContent, /Confirmed by Google/);
});

test("registering sends Google's proof, and the success page says the address is already confirmed", async (t) => {
  const calls = await open(t, GOOGLE_URL);
  fireEvent.click(screen.getByText("Core"));
  await next();
  type("Organization Name", "Acme Inc."); type("Organization Type", "partnership"); type("Phone Number", "9876543210");
  type("Tax / Registration Number", "TAX123"); type("Address", "1 Main Road");
  type("Country", [...labelled("Country").options].find((o) => o.value)?.value);
  await next();
  type("Password", "Passw0rd1");
  fireEvent.click(document.getElementById("termsAccepted"));
  fireEvent.click(screen.getByRole("button", { name: "Start Evaluation" }));
  await settle();
  assert.equal(calls.register.length, 1);
  assert.equal(calls.register[0].email, "lee.park@gmail.com");
  assert.equal(calls.register[0].googleProof, "signed.proof");
  assert.equal(calls.register[0].registeredEmail, "lee.park@gmail.com");
  assert.equal(document.querySelector('[data-testid="where"]').textContent, "/register/success");
});

test("without Google the Register page is as before: empty email boxes, no banner, no proof sent", async (t) => {
  const calls = await open(t, "/register");
  assert.doesNotMatch(document.body.textContent, /signed in with Google/);
  fireEvent.click(screen.getByText("Core"));
  await next();
  assert.equal(labelled("Registered Email").value, "");
  assert.equal(calls.register.length, 0);
});
