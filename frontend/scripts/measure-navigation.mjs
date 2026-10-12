/**
 * Navigation timing for the production build (re-run before/after performance work).
 *
 *   # 1. a backend with data, and a production build served by `vite preview` (or any static host):
 *   npm run build && npx vite preview --port 4173 --strictPort
 *   # 2. credentials come from the environment, never from this file:
 *   MEASURE_BASE_URL=http://localhost:4173 \
 *   MEASURE_SA_EMAIL=... MEASURE_SA_PASSWORD=... MEASURE_HR_EMAIL=... MEASURE_HR_PASSWORD=... \
 *   node scripts/measure-navigation.mjs [--json out.json] [--runs 3] [--latency 100]
 *
 * Every scenario is a sequence of client-side navigations (sidebar clicks / link clicks, not page reloads), except the
 * first step which is the login. For each step it records:
 *   ttfmc    time to first meaningful content: from the click until the page body has real content and no spinner/skeleton
 *            is left (milliseconds)
 *   api      number of API requests the step made
 *   dup      API requests repeated with the same method + URL within the step (wasted work)
 *   shell    "kept" when the sidebar and header DOM nodes are the same ones as before the step, "REMOUNTED" when replaced
 *            (checked by node identity, so the app needs no instrumentation)
 *
 * The median over --runs repetitions is reported. Needs puppeteer (a devDependency).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.MEASURE_BASE_URL || "http://localhost:4173";
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const RUNS = Number(arg("--runs", 3));
const OUT = arg("--json", null);
// Added delay per request in ms (a remote server). 0 = local, which hides what navigation work costs.
const LATENCY = Number(arg("--latency", 100));

const CREDS = {
  sa: { email: process.env.MEASURE_SA_EMAIL, password: process.env.MEASURE_SA_PASSWORD },
  hr: { email: process.env.MEASURE_HR_EMAIL, password: process.env.MEASURE_HR_PASSWORD },
};

// ── build size report ──────────────────────────────────────────────────────────────────────────────
function buildReport() {
  const dist = path.join(ROOT, "dist");
  if (!fs.existsSync(dist)) return null;
  const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  const preloaded = [...html.matchAll(/<(?:link[^>]+rel="(?:modulepreload|stylesheet|preload)"[^>]*href|script[^>]+src)="([^"]+)"/g)].map((m) => m[1]);
  const assets = path.join(dist, "assets");
  const files = fs.readdirSync(assets).filter((f) => /\.(js|css)$/.test(f)).map((f) => {
    const buf = fs.readFileSync(path.join(assets, f));
    return { file: f, kb: +(buf.length / 1024).toFixed(1), gzipKb: +(zlib.gzipSync(buf).length / 1024).toFixed(1) };
  });
  const loadedAtStart = files.filter((f) => preloaded.some((p) => p.endsWith(f.file)));
  return {
    initialGzipKb: +loadedAtStart.reduce((n, f) => n + f.gzipKb, 0).toFixed(1),
    preloaded: loadedAtStart.map((f) => `${f.file} (${f.gzipKb} KB gz)`),
    largest: files.sort((a, b) => b.gzipKb - a.gzipKb).slice(0, 12),
    totalChunks: files.length,
  };
}

// ── browser helpers ────────────────────────────────────────────────────────────────────────────────
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const installHelpers = (page) => page.evaluateOnNewDocument(`window.__contentReady = ${CONTENT_READY.toString()};`);

async function loadPuppeteer() {
  const { createRequire } = await import("node:module");
  return createRequire(path.join(ROOT, "package.json"))("puppeteer");
}

/** Tag the shell nodes so a later check can tell whether they were replaced. */
const TAG_SHELL = () => {
  const side = document.querySelector("aside") || document.querySelector("nav");
  const head = document.querySelector("header");
  window.__shell = { side, head };
};
const SHELL_KEPT = () => {
  const s = window.__shell;
  if (!s) return "unknown";
  const side = document.querySelector("aside") || document.querySelector("nav");
  const head = document.querySelector("header");
  return (s.side && s.side === side && s.side.isConnected) && (!s.head || (s.head === head && s.head.isConnected)) ? "kept" : "REMOUNTED";
};

/** True once <main> has real text and nothing in it is still a spinner or a skeleton. Small decorative pulses (status
 *  dots, under 16px) are not loading indicators; skeleton blocks and spinners are larger. */
const CONTENT_READY = () => {
  const main = document.querySelector("main") || document.body;
  const big = (el) => { const r = el.getBoundingClientRect(); return r.width >= 16 && r.height >= 8; };
  const busy = [...main.querySelectorAll(".animate-spin, .animate-pulse, [aria-busy='true']")].some(big);
  return (main.innerText || "").trim().length > 60 && !busy;
};

function trackApi(page) {
  const log = { reqs: [], inflight: 0 };
  const base = process.env.MEASURE_API_URL || "";
  const isApiUrl = (url) => (base ? url.startsWith(base) : (/\/(auth|hr|super-admin|billing|notifications|assistant|public)\//.test(new URL(url).pathname + "/") && !/\.(js|css|svg|png|woff2?)$/.test(url)));
  const tracked = new WeakSet();
  page.on("request", (r) => {
    if (isApiUrl(r.url()) && r.method() !== "OPTIONS") { log.reqs.push(`${r.method()} ${r.url()}`); log.inflight += 1; tracked.add(r); }
  });
  const done = (r) => { if (tracked.has(r)) { tracked.delete(r); log.inflight = Math.max(0, log.inflight - 1); } };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  return log;
}

const STABLE_MS = 150;

/** Resolves with the elapsed ms (since t0) at which the page first had real content, no spinner/skeleton and no API
 *  request in flight, and kept that for STABLE_MS. The stable window itself is not charged to the page. */
async function waitReady(page, api, t0, timeout = 30000, beforeText = null) {
  let readySince = null;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    // router navigations are React transitions: the old page stays on screen until the new one is ready, so "has
    // content" alone would be true instantly. The text must also differ from what was showing before the step.
    const content = await page.evaluate((prev) => {
      const main = document.querySelector("main") || document.body;
      return (!prev || (main.innerText || "").slice(0, 300) !== prev) && window.__contentReady();
    }, beforeText).catch(() => false);
    if (content && api.inflight === 0) {
      readySince ??= Date.now();
      if (Date.now() - readySince >= STABLE_MS) return readySince - t0;
    } else {
      readySince = null;
    }
    await sleep(25);
  }
  return Date.now() - t0;
}

async function step(page, api, label, action) {
  await page.evaluate(TAG_SHELL);
  const before = await page.evaluate(() => location.pathname);
  const beforeText = await page.evaluate(() => (document.querySelector("main") || document.body).innerText.slice(0, 300));
  api.reqs.length = 0;
  const t0 = Date.now();
  await action();
  // the previous page's content must not be mistaken for the new page: wait for the URL to change first
  await page.waitForFunction((b) => location.pathname !== b, { timeout: 15000, polling: 20 }, before).catch(() => {});
  const ttfmc = await waitReady(page, api, t0, 30000, beforeText);
  await sleep(400);                                   // let late requests (polling, secondary cards) show up
  const reqs = [...api.reqs];
  const seen = new Map();
  reqs.forEach((r) => seen.set(r, (seen.get(r) || 0) + 1));
  const dup = [...seen.values()].reduce((n, c) => n + (c > 1 ? c - 1 : 0), 0);
  return { label, ttfmc, api: reqs.length, dup, shell: await page.evaluate(SHELL_KEPT) };
}

/** Client-side navigation without a page reload, for pages that have no sidebar link (the router listens to popstate). */
const pushNav = (page, href) => async () => {
  await page.evaluate((h) => { window.history.pushState({}, "", h); window.dispatchEvent(new PopStateEvent("popstate")); }, href);
};

const clickLink = (page, href) => async () => {
  const ok = await page.evaluate((h) => {
    const a = [...document.querySelectorAll(`a[href="${h}"]`)][0];
    if (!a) return false;
    a.click();
    return true;
  }, href);
  if (!ok) throw new Error(`link ${href} not found`);
};

async function login(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', CREDS[who].email);
  await page.type('input[type="password"]', CREDS[who].password);
}

// ── scenarios ──────────────────────────────────────────────────────────────────────────────────────
const SCENARIOS = {
  "Super admin: login -> dashboard -> organizations -> billing -> organizations": {
    who: "sa",
    async run(page, api) {
      const out = [];
      await login(page, "sa");
      api.reqs.length = 0;
      const t0 = Date.now();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => !location.pathname.startsWith("/login") && !!document.querySelector("main"), { timeout: 30000 });
      const lt = await waitReady(page, api, t0);
      out.push({ label: "login -> landing page", ttfmc: lt, api: api.reqs.length, dup: 0, shell: "n/a" });
      await sleep(500);
      out.push(await step(page, api, "-> command-center dashboard", clickLink(page, "/super-admin/dashboard")));
      out.push(await step(page, api, "dashboard -> organizations", clickLink(page, "/super-admin/organizations")));
      out.push(await step(page, api, "organizations -> billing overview", clickLink(page, "/super-admin/billing")));
      out.push(await step(page, api, "billing overview -> organizations (back)", clickLink(page, "/super-admin/organizations")));
      out.push(await step(page, api, "organizations -> audit logs", clickLink(page, "/super-admin/audit-logs")));
      return out;
    },
  },
  "HR admin: dashboard -> employees -> profile -> back": {
    who: "hr",
    async run(page, api) {
      const out = [];
      await login(page, "hr");
      api.reqs.length = 0;
      const t0 = Date.now();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 30000 });
      const lt = await waitReady(page, api, t0);
      out.push({ label: "login -> landing", ttfmc: lt, api: api.reqs.length, dup: 0, shell: "n/a" });
      await sleep(500);
      out.push(await step(page, api, "HR dashboard -> employees", pushNav(page, "/hr-admin/employees")));
      out.push(await step(page, api, "employees -> profile", async () => {
        const ok = await page.evaluate(() => { const b = document.querySelector('tbody tr button[title="View"]'); if (b) b.click(); return !!b; });
        if (!ok) throw new Error("no View button on the employees list");
      }));
      out.push(await step(page, api, "profile -> back to employees", async () => { await page.goBack(); }));
      return out;
    },
  },
};

async function main() {
  const missing = Object.entries(CREDS).flatMap(([k, v]) => (!v.email || !v.password ? [k] : []));
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({ headless: "new" });
  const result = { build: buildReport(), baseUrl: BASE, runs: RUNS, latencyMs: LATENCY, scenarios: {} };
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    if (only && sc.who !== only) continue;
    if (missing.includes(sc.who)) { console.log(`skip "${name}": set MEASURE_${sc.who.toUpperCase()}_EMAIL / _PASSWORD`); continue; }
    const perRun = [];
    for (let i = 0; i < RUNS; i++) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setViewport({ width: 1366, height: 900 });
      if (LATENCY > 0) await page.emulateNetworkConditions({ download: 50 * 1024 * 1024 / 8, upload: 20 * 1024 * 1024 / 8, latency: LATENCY });
      await installHelpers(page);
      const api = trackApi(page);
      try { perRun.push(await sc.run(page, api)); } catch (e) { console.log(`run ${i + 1} of "${name}" failed: ${e.message}`); }
      await ctx.close();
    }
    if (!perRun.length) continue;
    const steps = perRun[0].map((s, idx) => ({
      label: s.label,
      ttfmc: median(perRun.map((r) => r[idx]?.ttfmc).filter((x) => x != null)),
      api: median(perRun.map((r) => r[idx]?.api).filter((x) => x != null)),
      dup: median(perRun.map((r) => r[idx]?.dup).filter((x) => x != null)),
      shell: perRun.map((r) => r[idx]?.shell).sort().at(-1),
    }));
    result.scenarios[name] = steps;
    console.log(`\n${name}  (median of ${perRun.length})`);
    for (const s of steps) console.log(`  ${s.label.padEnd(42)} ttfmc=${String(s.ttfmc).padStart(5)} ms  api=${String(s.api).padStart(3)}  dup=${String(s.dup).padStart(2)}  shell=${s.shell}`);
  }
  if (result.build) {
    console.log(`\nbuild: ${result.build.totalChunks} chunks; loaded at start: ${result.build.initialGzipKb} KB gzip`);
    result.build.preloaded.forEach((p) => console.log(`  ${p}`));
  }
  await browser.close();
  if (OUT) { fs.writeFileSync(OUT, JSON.stringify(result, null, 1)); console.log(`\nwritten to ${OUT}`); }
}

main().catch((e) => { console.error(e); process.exit(1); });
