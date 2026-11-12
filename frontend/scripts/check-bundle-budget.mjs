#!/usr/bin/env node
/**
 * Entry-bundle budget gate.
 *
 * "Entry" is everything the browser must download before the first route can
 * render: the module script + modulepreloads in dist/index.html and the
 * render-blocking stylesheet. Route chunks (including PortalApp.css, which a
 * signed-in user fetches with the portal) are not counted.
 *
 * Usage: node scripts/check-bundle-budget.mjs [--json]
 * Exits 1 when a budget is exceeded, so CI can fail the build.
 */
import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");
// css raised 20 -> 21 kB (Nov 2026): the framed, proportionally scaled login page (the first route) needs ~1.4 kB more.
const BUDGET = { js: 120 * 1024, css: 21 * 1024 };

const html = readFileSync(join(dist, "index.html"), "utf8");
const urls = new Set();
for (const m of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+\.(?:js|css))"[^>]*>/g)) {
  const tag = m[0];
  const url = m[1];
  if (url.includes("/assets/") && (tag.includes('type="module"') || tag.includes("modulepreload") || tag.includes("stylesheet"))) {
    urls.add(url);
  }
}

const gzSize = (path) => {
  const sidecar = `${path}.gz`;
  try {
    return statSync(sidecar).size;
  } catch {
    return gzipSync(readFileSync(path), { level: 9 }).length;
  }
};

const files = [...urls].map((url) => {
  const path = join(dist, url.replace(/^\//, ""));
  return { url, type: url.endsWith(".css") ? "css" : "js", gz: gzSize(path) };
});
const total = files.reduce((acc, f) => ({ ...acc, [f.type]: (acc[f.type] || 0) + f.gz }), { js: 0, css: 0 });

const report = {
  budget: { js: BUDGET.js, css: BUDGET.css },
  total,
  files: files.map((f) => ({ ...f, gzKb: +(f.gz / 1024).toFixed(2) })),
  ok: total.js <= BUDGET.js && total.css <= BUDGET.css,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const f of report.files) console.log(`${f.type.padEnd(3)} ${f.gzKb.toFixed(2).padStart(7)} kB gz  ${f.url}`);
  console.log(
    `\nentry js  ${(total.js / 1024).toFixed(2)} kB gz / ${(BUDGET.js / 1024).toFixed(0)} kB` +
      `\nentry css ${(total.css / 1024).toFixed(2)} kB gz / ${(BUDGET.css / 1024).toFixed(0)} kB`
  );
}

if (!report.ok) {
  console.error("\nBundle budget exceeded.");
  process.exit(1);
}
