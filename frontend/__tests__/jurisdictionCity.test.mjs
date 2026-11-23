/** QA-R2-4: the jurisdiction city is a styled dropdown like the jurisdiction country (no <datalist>, which the browser
 * showed as its own dark address-autofill popup with "Manage addresses…"); typing a city and managing addresses are
 * actions under the box, never options in it. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const FIELDS = [
  { key: "city", group: "address", label: "City", kind: "text" },
  { key: "jurisdiction_country", group: "legal", label: "Jurisdiction country", kind: "country", required: true },
  { key: "jurisdiction_city", group: "legal", label: "Jurisdiction city", kind: "text", required: true },
];

async function mount(t, profile) {
  t.mock.module("../src/service/hrService.js", { exports: {
    getCompanyProfile: async () => ({ fields: FIELDS, profile, completeness: null }),
    getOnboardingProfiles: async () => ({ engagement_profiles: [] }),
    prefillCompanyProfile: async () => ({ proposal: {} }),
    saveCompanyProfile: async () => ({ fields: FIELDS, profile }),
  } });
  const { default: CompanyProfileSettings, jurisdictionCityChoices } = await import(`../src/modules/zoiko-hr/onboarding/CompanyProfileSettings.jsx?t=${Math.random()}`);
  render(React.createElement(CompanyProfileSettings));
  await settle();
  return { jurisdictionCityChoices };
}

test("the jurisdiction city is a styled select with the registered city and the country's cities", async (t) => {
  const { jurisdictionCityChoices } = await mount(t, { city: "Pune", jurisdiction_country: "IN", jurisdiction_city: "" });
  const box = document.getElementById("cp-jurisdiction_city");
  const country = document.getElementById("cp-jurisdiction_country");
  assert.equal(box.tagName, "SELECT");
  assert.equal(box.className, country.className, "same look as the country dropdown");
  assert.equal(box.getAttribute("list"), null);
  assert.equal(document.querySelector("datalist#cp-in-cities-jurisdiction_city"), null);
  const options = [...box.options].map((o) => o.value);
  assert.equal(options[0], "");
  assert.equal(options[1], "Pune");
  assert.ok(options.includes("Mumbai"));
  assert.ok(!options.some((v) => /manage/i.test(v)), "no fake option");
  fireEvent.change(box, { target: { value: "Mumbai" } });
  assert.equal(document.getElementById("cp-jurisdiction_city").value, "Mumbai");

  // "Manage addresses…" is an action that takes you to the Registered address card
  let scrolled = false;
  const card = document.getElementById("company-profile-address");
  card.scrollIntoView = () => { scrolled = true; };
  fireEvent.click(screen.getByRole("button", { name: "Manage addresses…" }));
  assert.ok(scrolled);
  assert.equal(document.activeElement, document.getElementById("cp-city"));

  // another city can still be typed, without browser autofill
  fireEvent.click(screen.getByRole("button", { name: "Type another city" }));
  const typed = document.getElementById("cp-jurisdiction_city");
  assert.equal(typed.tagName, "INPUT");
  assert.equal(typed.getAttribute("autocomplete"), "off");
  assert.equal(typed.getAttribute("list"), null);
  fireEvent.click(screen.getByRole("button", { name: "Choose from the list" }));
  assert.equal(document.getElementById("cp-jurisdiction_city").tagName, "SELECT");

  assert.deepEqual(jurisdictionCityChoices({ value: "Leeds", country: "GB", registeredCity: "London" }), ["Leeds", "London"]);
  assert.deepEqual(jurisdictionCityChoices({ value: "", country: "GB", registeredCity: "" }), []);
});

test("with no city to offer the field is a plain text box and still links to the addresses", async (t) => {
  await mount(t, { city: "", jurisdiction_country: "GB", jurisdiction_city: "" });
  const box = document.getElementById("cp-jurisdiction_city");
  assert.equal(box.tagName, "INPUT");
  assert.equal(box.getAttribute("autocomplete"), "off");
  assert.ok(screen.getByRole("button", { name: "Manage addresses…" }));
  assert.equal(screen.queryByRole("button", { name: "Type another city" }), null);
});
