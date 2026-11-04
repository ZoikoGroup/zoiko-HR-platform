/** The contracting-entity fields follow the chosen country: its ID types, their format, the register lookup, and how an
 * address is written there. The formats fixture is the server's own table (app/core/business_ids.py). */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React, { useState } from "react";
import { readFileSync } from "node:fs";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

const FORMATS = JSON.parse(readFileSync(new URL("./fixtures/businessFormats.json", import.meta.url), "utf-8"));
const REGIONS = { countries: [{ code: "IN", name: "India", currency: "INR" }, { code: "US", name: "United States", currency: "USD" },
  { code: "DE", name: "Germany", currency: "EUR" }, { code: "AU", name: "Australia", currency: "AUD" }], currencies: [] };

afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

async function mount(t, initial, lookups = []) {
  t.mock.module("../src/service/hrService.js", { exports: {
    getBusinessFormats: async () => FORMATS,
    lookupBusiness: async (...args) => { lookups.push(args); return { supported: true, valid: true, source: "EU VIES", number: "DE811569869",
      legal_name: "ACME GMBH", address: "HAUPTSTR 1, 10115 BERLIN", address_lines: ["HAUPTSTR 1", "10115 BERLIN"] }; },
    getRegions: async () => REGIONS,
  } });
  const { default: Fields } = await import(`../src/components/BusinessLookupFields.jsx?t=${Math.random()}`);
  let latest = initial;
  function Harness() {
    const [value, setValue] = useState(initial);
    latest = value;
    return React.createElement(Fields, { regions: REGIONS, value, onChange: setValue });
  }
  render(React.createElement(Harness));
  await settle();
  return { get value() { return latest; } };
}

const countrySelect = () => screen.getAllByRole("combobox")[0];

test("India: GSTIN / CIN / PAN, a state list and PIN code; no register lookup", async (t) => {
  await mount(t, { entity_country: "IN", entity_id_type: "gstin" });
  assert.ok(screen.getByText("GSTIN", { selector: "label" }));
  assert.deepEqual([...screen.getAllByRole("combobox")[1].options].map((o) => o.textContent), ["GSTIN", "CIN (company)", "PAN", "LLPIN (LLP)"]);
  assert.ok(screen.getByText("State / UT") && screen.getByText("PIN code"));
  assert.ok(screen.getByRole("option", { name: "Maharashtra" }));
  assert.equal(screen.queryByRole("button", { name: /Look up/ }), null);
  assert.match(document.body.textContent, /No public register/);
});

test("switching to the US brings EIN, ZIP code and the US states, and checks the formats as you type", async (t) => {
  const h = await mount(t, { entity_country: "IN", entity_id_type: "gstin", entity_region: "Goa" });
  fireEvent.change(countrySelect(), { target: { value: "US" } });
  await settle();
  assert.equal(h.value.entity_id_type, "ein");
  assert.equal(h.value.entity_region, "", "an Indian state does not carry over to the US");
  assert.ok(screen.getByText("EIN", { selector: "label" }) && screen.getByText("ZIP code") && screen.getByRole("option", { name: "California" }));
  fireEvent.change(screen.getByPlaceholderText("12-3456789"), { target: { value: "123" } });
  assert.match(document.body.textContent, /doesn't look like a valid EIN/);
  fireEvent.change(screen.getByPlaceholderText("12-3456789"), { target: { value: "12-3456789" } });
  assert.doesNotMatch(document.body.textContent, /doesn't look like a valid EIN/);
  fireEvent.change(screen.getByPlaceholderText("94105"), { target: { value: "941" } });
  assert.match(document.body.textContent, /Enter a valid ZIP code/);
});

test("an EU VAT number can be looked up and fills the name and address", async (t) => {
  const lookups = [];
  const h = await mount(t, { entity_country: "DE", entity_id_type: "vat", entity_tax_id: "DE811569869" }, lookups);
  fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
  await settle();
  assert.deepEqual(lookups[0], ["DE", "DE811569869", "vat"]);
  assert.equal(h.value.entity_name, "ACME GMBH");
  assert.equal(h.value.entity_address, "HAUPTSTR 1, 10115 BERLIN");
  assert.match(document.body.textContent, /Verified with EU VIES/);
});

test("Australia offers ABN (looked up) and ACN (not)", async (t) => {
  await mount(t, { entity_country: "AU", entity_id_type: "abn" });
  assert.ok(screen.getByRole("button", { name: /Look up/ }));
  fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "acn" } });
  await settle();
  assert.equal(screen.queryByRole("button", { name: /Look up/ }), null);
  assert.ok(screen.getByText("Postcode") && screen.getByText("State / territory"));
});
