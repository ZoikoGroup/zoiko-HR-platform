import "./support/setup-jsdom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveCurrencyForCountry,
  getCurrentAppCurrency,
  formatCurrencyForUser,
  getCurrencySymbol,
} from "../src/utils/appCurrency.js";
import { formatMoney } from "../src/utils/money.js";

test("resolveCurrencyForCountry correctly maps countries and ISO-2 codes", () => {
  assert.equal(resolveCurrencyForCountry("India"), "INR");
  assert.equal(resolveCurrencyForCountry("IN"), "INR");
  assert.equal(resolveCurrencyForCountry("United Kingdom"), "GBP");
  assert.equal(resolveCurrencyForCountry("GB"), "GBP");
  assert.equal(resolveCurrencyForCountry("UK"), "GBP");
  assert.equal(resolveCurrencyForCountry("United States"), "USD");
  assert.equal(resolveCurrencyForCountry("US"), "USD");
  assert.equal(resolveCurrencyForCountry("United Arab Emirates"), "AED");
  assert.equal(resolveCurrencyForCountry("AE"), "AED");
  assert.equal(resolveCurrencyForCountry("Germany"), "EUR");
  assert.equal(resolveCurrencyForCountry("DE"), "EUR");
  assert.equal(resolveCurrencyForCountry("Australia"), "AUD");
  assert.equal(resolveCurrencyForCountry("AU"), "AUD");
  assert.equal(resolveCurrencyForCountry("Canada"), "CAD");
  assert.equal(resolveCurrencyForCountry("CA"), "CAD");
});

test("formatCurrencyForUser formats properly for given currencies", () => {
  const inr = formatCurrencyForUser(75000, "INR");
  assert.ok(inr.includes("75,000"), `Expected 75,000 in ${inr}`);
  assert.ok(inr.includes("₹") || inr.includes("INR"), `Expected INR symbol/code in ${inr}`);

  const gbp = formatCurrencyForUser(45000, "GBP");
  assert.ok(gbp.includes("45,000"), `Expected 45,000 in ${gbp}`);
  assert.ok(gbp.includes("£") || gbp.includes("GBP"), `Expected GBP symbol/code in ${gbp}`);

  const usd = formatCurrencyForUser(60000, "USD");
  assert.ok(usd.includes("60,000"), `Expected 60,000 in ${usd}`);
  assert.ok(usd.includes("$") || usd.includes("USD"), `Expected USD symbol/code in ${usd}`);
});

test("getCurrentAppCurrency falls back to stored user currency or country", () => {
  localStorage.setItem("zoiko_user", JSON.stringify({
    id: 10,
    email: "admin@ukcorp.co.uk",
    country: "United Kingdom",
    currency: "GBP",
  }));

  assert.equal(getCurrentAppCurrency(), "GBP");

  // Format money without explicit currency uses stored user's GBP
  const autoFormatted = formatMoney(5000);
  assert.ok(autoFormatted.includes("5,000"), `Expected 5,000 in ${autoFormatted}`);
  assert.ok(autoFormatted.includes("£") || autoFormatted.includes("GBP"), `Expected GBP in ${autoFormatted}`);

  // Test with Indian user
  localStorage.setItem("zoiko_user", JSON.stringify({
    id: 11,
    email: "hr@india.in",
    country: "India",
  }));

  assert.equal(getCurrentAppCurrency(), "INR");
  const inrFormatted = formatMoney(120000);
  assert.ok(inrFormatted.includes("1,20,000") || inrFormatted.includes("120,000"), `Expected formatted inr in ${inrFormatted}`);

  localStorage.removeItem("zoiko_user");
});

test("getCurrencySymbol returns proper symbol", () => {
  const symINR = getCurrencySymbol("INR");
  assert.ok(symINR === "₹" || symINR === "INR");

  const symGBP = getCurrencySymbol("GBP");
  assert.ok(symGBP === "£" || symGBP === "GBP");

  const symUSD = getCurrencySymbol("USD");
  assert.ok(symUSD === "$" || symUSD === "USD");
});

