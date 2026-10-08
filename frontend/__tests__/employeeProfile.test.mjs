/** ZHR-84: My Profile checks banking and identity formats and says what is wrong, field by field. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { validateProfile, changedFields, cleanedValue, serverProfileErrors, FORMATS } from "../src/utils/profileForm.js";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

test("each format accepts the right shape and says what is expected otherwise", () => {
  const ok = { pan_number: "abcde1234f", aadhar_number: "2345 6789 0123", bank_ifsc: "hdfc0001234", bank_account: "1234 5678 9012", uan_number: "100123456789", esic_number: "1234567890", passport_number: "k1234567", visa_number: "AB12345", pf_number: "MH/BAN/1234567/000/0001234", phone: "+91 98765 43210", pincode: "560 001" };
  for (const [k, val] of Object.entries(ok)) assert.equal(FORMATS[k](val), "", k);
  const bad = { pan_number: "ABCDE12345", aadhar_number: "12345", bank_ifsc: "HDFC1001234", bank_account: "12AB", uan_number: "123", esic_number: "12", passport_number: "123", visa_number: "A", pf_number: "#", phone: "123", pincode: "!!" };
  for (const [k, val] of Object.entries(bad)) assert.ok(FORMATS[k](val).length > 15, k);
  assert.match(FORMATS.pan_number("x"), /ABCDE1234F/);
  assert.match(FORMATS.aadhar_number("023456789012"), /cannot start with 0 or 1/);
});

test("validateProfile checks only what has been typed, plus the required names", () => {
  assert.deepEqual(validateProfile({ first_name: "Anne", last_name: "Lee" }), {});
  assert.equal(validateProfile({ first_name: "", last_name: "Lee" }).first_name, "First name is required.");
  const errors = validateProfile({ first_name: "Anne", last_name: "Lee", pan_number: "bad", bank_ifsc: "bad", passport_expiry: "1980-01-01", date_of_birth: "2999-01-01" });
  assert.deepEqual(Object.keys(errors).sort(), ["bank_ifsc", "date_of_birth", "pan_number", "passport_expiry"]);
  assert.match(errors.date_of_birth, /in the past/);
  assert.match(errors.passport_expiry, /2000 and 2100/);
});

test("values are cleaned up, only changes are sent, and an emptied box becomes null", () => {
  assert.equal(cleanedValue("pan_number", " abcde 1234-f "), "ABCDE1234F");
  assert.equal(cleanedValue("aadhar_number", "2345 6789 0123"), "234567890123");
  assert.equal(cleanedValue("bank_name", "  "), null);
  assert.deepEqual(changedFields(["pan_number", "bank_name", "uan_number"], { pan_number: "abcde1234f", bank_name: "", uan_number: "100123456789" }, { pan_number: "ABCDE1234F", bank_name: "Axis Bank", uan_number: "100123456789" }),
    { bank_name: null }, "an unchanged PAN (only its case differs) is not re-sent, a cleared bank name clears it");
  assert.equal(serverProfileErrors([{ loc: ["body", "bank_ifsc"], msg: "Value error, Enter a valid IFSC code." }]).bank_ifsc, "Enter a valid IFSC code.");
});

const ME = { id: 7, firstName: "Anne", lastName: "Lee", email: "anne@x.com", phoneNumber: "9876543210", gender: "female" };
const EXT = { pan_number: "ABCDE1234F", bank_name: "Axis Bank", bank_account: "123456789012", bank_ifsc: "UTIB0001234" };

async function load(t, { updateProfileError } = {}) {
  const calls = { me: [], profile: [] };
  const svc = {
    getMyProfile: async () => ME,
    getEmployeeProfile: async () => EXT,
    updateMyProfile: async (p) => { calls.me.push(p); return {}; },
    updateEmployeeProfile: async (id, p) => { calls.profile.push([id, p]); if (updateProfileError) throw updateProfileError; return {}; },
  };
  t.mock.module("../src/service/employee.js", { exports: svc });
  t.mock.module("../src/components/employee/EmployeePageShell.jsx", { exports: { default: ({ children }) => React.createElement("div", null, children) } });
  const { default: Page } = await import(`../src/pages/Peoples/Employees/Profile/EmployeeProfile.jsx?t=${Math.random()}`);
  render(React.createElement(Page));
  await settle();
  return calls;
}

const openBanking = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
  fireEvent.click(screen.getByRole("button", { name: "Banking & Documents" }));
  await settle();
};
const type = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });

test("an invalid IFSC, PAN and account number are refused with a message under each box and nothing is sent", async (t) => {
  const calls = await load(t);
  await openBanking();
  type("pf-bank_ifsc", "HDFC1001234"); type("pf-pan_number", "ABCDE12345"); type("pf-bank_account", "12AB");
  fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
  await settle();
  const text = document.body.textContent;
  assert.match(text, /Enter a valid IFSC code/);
  assert.match(text, /Enter a valid PAN/);
  assert.match(text, /Enter a valid account number/);
  assert.match(text, /3 fields need attention/);
  assert.equal(calls.me.length + calls.profile.length, 0, "nothing was saved");
  assert.equal(document.getElementById("pf-bank_ifsc").getAttribute("aria-invalid"), "true");
  type("pf-bank_ifsc", "HDFC0001234");
  assert.doesNotMatch(document.body.textContent, /Enter a valid IFSC code/, "the message goes away when that box is corrected");
});

test("a mistake on another tab takes the person to that tab", async (t) => {
  await load(t);
  fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
  type("pf-phone", "123");
  fireEvent.click(screen.getByRole("button", { name: "Banking & Documents" }));
  type("pf-pan_number", "bad");
  fireEvent.click(screen.getByRole("button", { name: "Personal Details" }));
  fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
  await settle();
  assert.match(document.body.textContent, /Enter a valid 10-digit phone number/);
});

test("PAN and IFSC are shown in capitals as they are typed", async (t) => {
  await load(t);
  await openBanking();
  type("pf-pan_number", "abcde1234f");
  assert.equal(document.getElementById("pf-pan_number").value, "ABCDE1234F");
  type("pf-bank_ifsc", "hdfc0001234");
  assert.equal(document.getElementById("pf-bank_ifsc").value, "HDFC0001234");
});

test("valid details save cleaned up, only what changed is sent, and a cleared box really clears", async (t) => {
  const calls = await load(t);
  await openBanking();
  type("pf-aadhar_number", "2345 6789 0123");
  type("pf-bank_name", "");
  fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
  await settle();
  assert.equal(calls.me.length, 0, "no personal field changed");
  assert.deepEqual(calls.profile, [[7, { aadhar_number: "234567890123", bank_name: null }]]);
  assert.match(document.body.textContent, /Profile updated successfully/);
});

test("a refusal from the server appears under the box it is about", async (t) => {
  const err = Object.assign(new Error("x"), { validation: [{ loc: ["body", "bank_account"], msg: "Value error, Enter a valid account number: 9 to 18 digits, with no letters or symbols." }] });
  await load(t, { updateProfileError: err });
  await openBanking();
  type("pf-bank_account", "999999999998");
  fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
  await settle();
  assert.match(document.body.textContent, /Enter a valid account number: 9 to 18 digits/);
  assert.match(document.body.textContent, /1 field needs attention/);
});
