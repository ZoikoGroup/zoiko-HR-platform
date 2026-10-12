/** Sparkline: dependency-free SVG line; renders nothing for fewer than two points; never overshoots the data. */
import "./support/setup-jsdom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import Sparkline, { sparklinePath } from "../src/components/Sparkline.jsx";

afterEach(() => cleanup());
const h = React.createElement;

test("draws one path with the colour and stroke given", () => {
  const { container } = render(h("div", null, h(Sparkline, { values: [1, 3, 2, 5], color: "#10B981", strokeWidth: 2 })));
  const path = container.querySelector("svg path");
  assert.ok(path);
  assert.equal(path.getAttribute("stroke"), "#10B981");
  assert.match(path.getAttribute("d"), /^M[\d.]+,[\d.]+( C[\d. ,-]+)+$/);
  assert.equal(container.querySelector("svg").getAttribute("aria-hidden"), "true");
});

test("fewer than two usable points draws nothing; non-numbers are ignored", () => {
  assert.equal(render(h("div", null, h(Sparkline, { values: [] }))).container.querySelector("svg"), null);
  cleanup();
  assert.equal(render(h("div", null, h(Sparkline, { values: [4] }))).container.querySelector("svg"), null);
  cleanup();
  assert.ok(render(h("div", null, h(Sparkline, { values: [1, "x", null, 3] }))).container.querySelector("svg"));
});

test("a flat series is a flat line, and the curve stays inside the data's range", () => {
  const flat = render(h("div", null, h(Sparkline, { values: [5, 5, 5], height: 32 }))).container.querySelector("path").getAttribute("d");
  const ys = [...flat.matchAll(/[\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(ys.every((y) => y === 16));
  const pts = [0, 1, 2, 3, 4].map((i) => ({ x: i * 10, y: [10, 10, 0, 0, 10][i] }));
  const d = sparklinePath(pts);
  const allY = [...d.matchAll(/(?:^|[ CM])[-\d.]+,([-\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(allY.every((y) => y >= -1e-9 && y <= 10 + 1e-9), "no overshoot above or below the points");
});

test("a labelled sparkline is exposed to assistive technology", () => {
  const { getByRole } = render(h("div", null, h(Sparkline, { values: [1, 2], ariaLabel: "30 day trend" })));
  assert.equal(getByRole("img").getAttribute("aria-label"), "30 day trend");
});
