/** QA R1-19 / R1-20: asset edit and delete (shared form rules + delete confirmation dialog). */
import "./support/setup-jsdom.mjs";
import { test, afterEach, describe, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { readFileSync } from "node:fs";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import {
  assetToForm, assetFormPayload, assetStatusOptions, validateAssetForm, assetDeleteBlockReason, categoryChoices,
  isAssetAssigned,
} from "../src/utils/assetForm.js";

afterEach(() => cleanup());

const ROW = {
  id: 5, name: "Laptop", asset_tag: "LT-5", category: "Laptops", serial_number: "SN", department: "IT",
  status: "available", condition: "good", purchase_date: "2026-01-02", purchase_cost: "1200.00", notes: "n",
  employee_id: null, employee_name: null,
};

describe("asset form rules", () => {
  test("assetToForm reads the server's snake_case row, including purchase date and cost", () => {
    const f = assetToForm(ROW);
    assert.equal(f.assetTag, "LT-5");
    assert.equal(f.serialNumber, "SN");
    assert.equal(f.purchaseDate, "2026-01-02");
    assert.equal(f.purchasePrice, "1200.00");
    assert.equal(f.department, "IT");
  });

  test("the edit payload never changes who holds the asset", () => {
    const p = assetFormPayload({ ...assetToForm(ROW), name: "  Laptop Pro " }, { mode: "edit" });
    assert.equal(p.name, "Laptop Pro");
    assert.equal(p.purchase_cost, 1200);
    assert.ok(!("employee_id" in p) && !("assigned_date" in p));
    assert.equal(assetFormPayload({ ...assetToForm(ROW), status: "assigned" }, { mode: "create" }).status, "available");
  });

  test("validation: required, lengths, price, duplicate tag within the loaded list (own row excluded)", () => {
    const assets = [ROW, { ...ROW, id: 6, asset_tag: "LT-6" }];
    assert.deepEqual(validateAssetForm(assetToForm(ROW), { assets, editingId: 5 }), {});
    const e = validateAssetForm({ ...assetToForm(ROW), name: " ", assetTag: " LT-6 ", purchasePrice: "-1" }, { assets, editingId: 5 });
    assert.match(e.name, /required/);
    assert.match(e.assetTag, /already exists/);
    assert.match(e.purchasePrice, /0 or more/);
    assert.match(validateAssetForm({ ...assetToForm(ROW), assetTag: "" }).assetTag, /required/);
  });

  test("status choices and delete block follow assignment", () => {
    const held = { ...ROW, status: "assigned", employee_id: 9 };
    assert.deepEqual(assetStatusOptions(held), ["assigned"]);
    assert.ok(!assetStatusOptions(ROW).includes("assigned"));
    assert.ok(!assetStatusOptions(null).includes("assigned"));
    assert.ok(isAssetAssigned(held));
    assert.match(assetDeleteBlockReason(held), /Return it before deleting/);
    assert.equal(assetDeleteBlockReason(ROW), null);
    assert.deepEqual(categoryChoices(["A"], "Old"), ["Old", "A"]);
  });
});

const deleted = [];
mock.module("../src/service/hrService.js", {
  exports: { deleteAsset: async (id) => { deleted.push(id); return { message: "ok" }; } },
});

describe("DeleteAssetDialog", () => {
  test("asks for confirmation, then deletes and reports back", async () => {
    const { DeleteAssetDialog } = await import(`../src/modules/organization-admin/AssetActionDialogs.jsx?t=${Math.random()}`);
    let done = null;
    render(React.createElement(DeleteAssetDialog, { asset: ROW, onClose: () => {}, onDeleted: (a) => { done = a; } }));
    assert.ok(screen.getByText(/audit log/));
    assert.equal(deleted.length, 0);
    fireEvent.click(screen.getByRole("button", { name: /Delete asset/ }));
    await waitFor(() => assert.equal(done?.id, 5));
    assert.deepEqual(deleted, [5]);
  });

  test("an assigned asset cannot be deleted from the dialog", async () => {
    const { DeleteAssetDialog } = await import(`../src/modules/organization-admin/AssetActionDialogs.jsx?t=${Math.random()}`);
    render(React.createElement(DeleteAssetDialog, { asset: { ...ROW, status: "assigned", employee_id: 9 }, onClose: () => {} }));
    assert.match(screen.getByRole("alert").textContent, /Return it before deleting/);
    assert.equal(screen.getByRole("button", { name: /Delete asset/ }).disabled, true);
  });
});

describe("both asset screens offer Edit and Delete", () => {
  for (const file of ["../src/modules/organization-admin/AssetsPage.jsx", "../src/modules/zoiko-hr/assets/inventory.jsx"]) {
    test(file, () => {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      assert.match(src, /openEdit\(a\)/);
      assert.match(src, /DeleteAssetDialog/);
      assert.match(src, /assetFormPayload\(form, \{ mode: "edit" \}\)/);
      assert.doesNotMatch(src, /window\.confirm\("Are you sure you want to delete/);
    });
  }
});
