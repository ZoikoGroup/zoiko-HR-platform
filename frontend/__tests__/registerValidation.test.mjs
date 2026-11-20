/** B7–B13 (QA report 6 Nov 2026): the Register page checks every organization and admin field with the shared rules, shows each
 * message under its own field (aria-invalid + aria-describedby), focuses the first bad field, keeps what was typed, accepts real
 * international values, and maps the server's field messages back onto the fields. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

async function open(t, register) {
  const calls = { register: [], otp: [] };
  t.mock.module("../src/context/AuthContext.jsx", { exports: { useAuth: () => ({
    error: null,
    register: register || (async (p) => { calls.register.push(p); return {}; }),
    sendRegistrationOtp: async (p) => { calls.otp.push(p); },
  }) } });
  t.mock.module("../src/hooks/usePublicCatalog.js", { exports: { usePublicCatalog: () => ({ byCode: {} }), formatRate: () => null } });
  t.mock.module("../src/components/PlanComparison.jsx", { exports: { default: () => React.createElement("div") } });
  t.mock.module("../src/landing/LandingHeader.jsx", { exports: { default: () => React.createElement("header") } });
  t.mock.module("../src/landing/Footer.jsx", { exports: { default: () => React.createElement("footer") } });
  const { default: Page } = await import(`../src/pages/auth/RegisterPage.jsx?v=${Math.random()}`);
  render(React.createElement(MemoryRouter, { initialEntries: ["/register"] }, React.createElement(Routes, null,
    React.createElement(Route, { path: "/register", element: React.createElement(Page) }),
    React.createElement(Route, { path: "/register/success", element: React.createElement("div", null, "SUCCESS") }))));
  await settle();
  fireEvent.click(screen.getByText("Core"));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await settle();
  return calls;
}

const set = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });
const errorOf = (id) => document.getElementById(`${id}-error`)?.textContent || "";
const next = async () => { fireEvent.click(screen.getByRole("button", { name: "Continue" })); await settle(); };

function fillValid() {
  set("reg-orgName", "AT&T"); set("reg-orgType", "corporation"); set("reg-registeredEmail", "hr@acme-corp.com");
  set("reg-country", "India"); set("reg-phone", "98765 43210"); set("reg-taxNumber", "27AAPFU0939F1ZV");
  set("reg-industry", "Software"); set("reg-address", "12 MG Road, Indiranagar"); set("reg-state", "Karnataka"); set("reg-city", "Bengaluru");
}

test("B7–B12 the QA inputs are refused, each under its own field, the first bad field gets focus and the input is kept", async (t) => {
  await open(t);
  fillValid();
  set("reg-orgName", "@#$%");                 // B7
  set("reg-phone", "98765 43");               // B8 (letters cannot even be typed: see the next test)
  set("reg-taxNumber", "HELLO!!");            // B9
  set("reg-address", "abc");                  // B11
  set("reg-city", "Mumbai12");                // B12
  await next();
  assert.match(errorOf("reg-orgName"), /Include at least one letter/);
  assert.equal(errorOf("reg-phone"), "Enter a valid phone number for India.");
  assert.match(errorOf("reg-taxNumber"), /valid GSTIN/);
  assert.match(errorOf("reg-address"), /Enter a full address/);
  assert.match(errorOf("reg-city"), /Use letters only/);
  const org = document.getElementById("reg-orgName");
  assert.equal(org.getAttribute("aria-invalid"), "true");
  assert.match(org.getAttribute("aria-describedby"), /reg-orgName-error/);
  assert.equal(document.activeElement, org, "the first bad field is focused");
  assert.equal(org.value, "@#$%", "what was typed is kept");
  assert.ok(document.getElementById("reg-orgName"), "still on the organization step");
});

test("B8 letters cannot be typed into the phone box, and the person is told why", async (t) => {
  await open(t);
  set("reg-phone", "98765abc43");
  assert.equal(document.getElementById("reg-phone").value, "9876543");
  assert.match(document.body.textContent, /Only digits, spaces and \+ - \( \) can be used/);
});

test("B9 the registration number follows the country: GSTIN check digit for India, its own label and example", async (t) => {
  await open(t);
  fillValid();
  set("reg-taxNumber", "27AAPFU0939F1ZA");
  await next();
  assert.equal(errorOf("reg-taxNumber"), "That GSTIN fails its check digit. Please re-check the number.");
  assert.equal(document.getElementById("reg-taxNumber").getAttribute("placeholder"), "27AAPFU0939F1ZV");
  set("reg-taxIdType", "pan");
  assert.equal(document.querySelector('label[for="reg-taxNumber"]').textContent.replace("*", "").trim(), "PAN");
});

test("B10 industry is chosen from a list; Other asks for a name with the department rules", async (t) => {
  await open(t);
  fillValid();
  assert.equal(document.getElementById("reg-industry").tagName, "SELECT");
  set("reg-industry", "Other");
  set("reg-industryOther", "1234");
  await next();
  assert.match(errorOf("reg-industryOther"), /Include at least one letter/);
});

test("B13 the admin name refuses digits and symbols but accepts real names", async (t) => {
  await open(t);
  fillValid();
  await next();
  set("reg-adminName", "Priya 123");
  set("reg-adminEmail", "priya@acme-corp.com");
  fireEvent.click(screen.getByRole("button", { name: "Continue to Verification" }));
  await settle();
  assert.match(errorOf("reg-adminName"), /Use letters only/);
  for (const ok of ["José O'Brien", "王伟", "अनिल कुमार", "Jean-Luc D’Souza"]) {
    set("reg-adminName", ok);
    fireEvent.blur(document.getElementById("reg-adminName"));
    await settle();
    assert.equal(errorOf("reg-adminName"), "", ok);
  }
});

test("B7 real organization names with digits and symbols are accepted", async (t) => {
  await open(t);
  fillValid();
  for (const name of ["3M", "7-Eleven", "H&M", "Tata Consultancy Services (TCS)"]) {
    set("reg-orgName", name);
    fireEvent.blur(document.getElementById("reg-orgName"));
    await settle();
    assert.equal(errorOf("reg-orgName"), "", name);
  }
});

test("a field message from the server is shown under that field on the right step", async (t) => {
  const register = async () => {
    throw Object.assign(new Error("x"), { status: 422, validation: [{ loc: ["body", "city"], msg: "Use letters only. Spaces, hyphens, apostrophes and full stops are allowed." }] });
  };
  await open(t, register);
  fillValid();
  await next();
  set("reg-adminName", "Priya Sharma"); set("reg-adminEmail", "hr@acme-corp.com");
  fireEvent.change(document.getElementById("reg-password"), { target: { value: "Passw0rd1" } });
  fireEvent.click(document.getElementById("termsAccepted"));
  fireEvent.click(screen.getByRole("button", { name: "Continue to Verification" }));
  await settle();
  fireEvent.paste(document.querySelector('input[inputmode="numeric"]'), { clipboardData: { getData: () => "123456" } });
  fireEvent.click(screen.getByRole("button", { name: /Verify & Start Evaluation/ }));
  await settle();
  assert.ok(document.getElementById("reg-city"), "back on the organization step");
  assert.match(errorOf("reg-city"), /Use letters only/);
});
