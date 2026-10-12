import test from "node:test";
import assert from "node:assert/strict";
import { formatScore, scorePercent, analyticsRows } from "../src/utils/performanceScores.js";

test("a score is shown out of 5 and never beyond the scale", () => {
  assert.equal(formatScore(4.25), "4.25/5");
  assert.equal(formatScore(5), "5/5");
  assert.equal(formatScore(0), "0/5");
  for (const bad of [10, 5.1, -1, null, undefined, "", "abc", NaN]) assert.equal(formatScore(bad), "-", String(bad));
});

test("a score becomes a percentage of the scale, or nothing", () => {
  assert.equal(scorePercent(4), 80);
  assert.equal(scorePercent(2.5), 50);
  assert.equal(scorePercent(10), null);
  assert.equal(scorePercent(null), null);
});

test("the export quotes cells that contain commas or quotes", () => {
  assert.equal(analyticsRows([["Metric", "Value"], ["A, B", 'say "hi"'], ["Avg", "4/5"]]), 'Metric,Value\n"A, B","say ""hi"""\nAvg,4/5');
});
