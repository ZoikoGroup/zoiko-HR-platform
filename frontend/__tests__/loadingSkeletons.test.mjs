/** Loading skeletons: announced politely, and the refresh strip only shows while cached data is being refreshed. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup, screen } from "@testing-library/react";
import { TableSkeleton, CardGridSkeleton, DetailSkeleton, RefreshBar } from "../src/components/LoadingSkeletons.jsx";

afterEach(() => cleanup());
const h = React.createElement;

test("each skeleton is a labelled busy status region", () => {
  render(h("div", null, h(TableSkeleton, { rows: 3, label: "Loading things" }), h(CardGridSkeleton, { cards: 2 }), h(DetailSkeleton, {})));
  const regions = screen.getAllByRole("status");
  assert.equal(regions.length, 3);
  assert.ok(regions.every((r) => r.getAttribute("aria-busy") === "true"));
  assert.equal(screen.getByLabelText("Loading things").children.length, 3);
});

test("RefreshBar renders only when active", () => {
  const { container, rerender } = render(h(RefreshBar, { active: false }));
  assert.equal(container.firstChild, null);
  rerender(h(RefreshBar, { active: true }));
  assert.ok(screen.getByRole("status", { name: "Refreshing" }));
});
