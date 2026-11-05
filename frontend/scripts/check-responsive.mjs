/**
 * Responsive layout audit: opens every page for every role at a range of screen sizes and reports anything that does not
 * fit the screen.
 *
 *   # 1. a backend with data (never a shared/production one) and the frontend dev server or a preview build
 *   # 2. credentials come from the environment, never from this file (leave a role out to skip it):
 *   RESP_BASE_URL=http://localhost:5173 RESP_API_URL=http://localhost:8000 \
 *   RESP_SA=email:password RESP_ADMIN=email:password RESP_HR=email:password \
 *   RESP_MANAGER=email:password RESP_EMPLOYEE=email:password \
 *   node scripts/check-responsive.mjs [--json out.json] [--only /path/prefix] [--roles sa,hr] [--widths 320,768]
 *        [--shots dir]   # save a screenshot of every failing page
 *
 * For each page and width it checks:
 *   page-scroll   the document scrolls sideways (scrollWidth > viewport width)
 *   offscreen     a visible element sticks out of the viewport and no scrolling container around it clips it
 *                 (tables inside an overflow-x-auto wrapper are fine: that is the intended mobile behaviour)
 * Exit code 1 when anything fails. Needs puppeteer (a devDependency).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ROLE_ALLOWED_PREFIXES, ROLE_DISALLOWED_PREFIXES } from "../src/config/roles.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.RESP_BASE_URL || "http://localhost:5173";
const API = process.env.RESP_API_URL || "http://localhost:8000";
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const OUT = arg("--json", null);
const ONLY = arg("--only", null);
const SHOTS = arg("--shots", null);
const WIDTHS = (arg("--widths", "320,375,414,768,1024,1280,1440,1920")).split(",").map(Number);
const HEIGHT = { 320: 640, 375: 812, 414: 896, 768: 1024, 1024: 768, 1280: 800, 1440: 900, 1920: 1080 };
const ROLE_FILTER = arg("--roles", null)?.split(",");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROLE_ENV = { sa: ["RESP_SA", "super_admin"], admin: ["RESP_ADMIN", "admin"], hr: ["RESP_HR", "hr_admin"], manager: ["RESP_MANAGER", "manager"], employee: ["RESP_EMPLOYEE", "employee"] };

// Sample values for the parameterised routes; a route whose parameter has no sample is skipped.
const PARAMS = { id: process.env.RESP_EMPLOYEE_ID || "13", orgId: process.env.RESP_ORG_ID || "3" };

const PUBLIC_PATHS = ["/login", "/register", "/register/success", "/forgot-password", "/reset-password", "/verify-email", "/book-demo", "/get-demo", "/contact", "/hr-products", "/request-pricing", "/terms"];

function portalPaths() {
  const src = fs.readFileSync(path.join(ROOT, "src/routes/PortalApp.jsx"), "utf8");
  const nav = fs.readFileSync(path.join(ROOT, "src/navigation.js"), "utf8");
  const found = new Set();
  for (const m of src.matchAll(/["'](\/[a-z0-9\-/:]*)["']\s*:/gi)) found.add(m[1]);
  for (const m of src.matchAll(/path:\s*["'](\/[a-z0-9\-/:]*)["']/gi)) found.add(m[1]);
  for (const m of nav.matchAll(/href:\s*["'](\/[a-z0-9\-/:?=&]*)["']/gi)) found.add(m[1].split("?")[0]);
  const out = [];
  for (const p of found) {
    if (p === "/") continue;
    const filled = p.replace(/:(\w+)/g, (_, k) => PARAMS[k] ?? `:${k}`);
    if (!filled.includes(":")) out.push(filled);
  }
  return [...new Set(out)].sort();
}

const under = (p, prefix) => p === prefix || p.startsWith(prefix.endsWith("/") ? prefix : prefix + "/");
function allowed(role, p) {
  if ((ROLE_DISALLOWED_PREFIXES[role] || []).some((x) => under(p, x))) return false;
  return (ROLE_ALLOWED_PREFIXES[role] || []).some((x) => x !== "/" && under(p, x));
}

async function login(cred) {
  const [email, ...rest] = cred.split(":");
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: rest.join(":") }) });
    const body = await r.json().catch(() => ({}));
    if (r.ok && body.access_token) return body;
    if (r.status === 429) { await sleep(15000); continue; }
    throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
  }
  throw new Error(`login rate-limited for ${email}`);
}

// Runs in the page. Returns the layout problems at the current viewport.
const MEASURE = () => {
  const vw = document.documentElement.clientWidth;
  const problems = [];
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) problems.push({ kind: "page-scroll", detail: `scrollWidth ${sw} > ${vw}` });
  const clips = (el) => {
    const s = getComputedStyle(el);
    return ["auto", "scroll", "hidden", "clip"].includes(s.overflowX);
  };
  const describe = (el) => {
    const cls = (typeof el.className === "string" ? el.className : el.getAttribute("class") || "").trim().split(/\s+/).slice(0, 6).join(".");
    const txt = (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 50);
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls ? "." + cls : ""}${txt ? ` "${txt}"` : ""}`;
  };
  const offenders = [];
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    // entirely past the left edge: cannot cause sideways scrolling and is always hidden on purpose (honeypot fields,
    // off-screen labels)
    if (r.right <= 0) continue;
    const s = getComputedStyle(el);
    // a fixed element never widens the page; one moved out of view is a closed drawer
    if (s.position === "fixed" && (r.right <= 0 || r.left >= vw)) continue;
    // An overflow box clips an absolutely positioned descendant only if the box is that element's containing block or
    // sits above it. `anchor` is the nearest positioned ancestor once we have walked past it.
    const absolute = s.position === "absolute";
    let anchorReached = !absolute;
    let p = el.parentElement, clipped = false, invisible = s.visibility === "hidden" || Number(s.opacity) === 0, insideFixed = false;
    while (p && p !== document.body) {
      const ps = getComputedStyle(p);
      if (ps.visibility === "hidden" || Number(ps.opacity) === 0) invisible = true;
      if (ps.position === "fixed") { insideFixed = true; const pr = p.getBoundingClientRect(); if (pr.right <= 0 || pr.left >= vw) invisible = true; }
      if (!anchorReached && ps.position !== "static") anchorReached = true;
      if (clips(p) && anchorReached) {
        const pr = p.getBoundingClientRect();
        if (pr.right <= vw + 1 && pr.left >= -1) { clipped = true; break; }
      }
      p = p.parentElement;
    }
    if (clipped) continue;
    // Something nobody can see that sits inside a fixed layer cannot widen the page either.
    if (invisible && insideFixed) continue;
    // 1px screen-reader-only text counts as invisible: it matters only if it widens the page.
    offenders.push(Object.assign(el, { __invisible: invisible || (r.width <= 1 && r.height <= 1) }));
  }
  // Report only the outermost offenders (children of an offender add nothing).
  const top = offenders.filter((el) => !offenders.some((o) => o !== el && o.contains(el)));
  const visible = top.filter((el) => !el.__invisible);
  // Invisible elements only matter when they widen the page (an sr-only label or a hidden popover escaping a scroll box).
  const widening = sw > vw + 1 ? top.filter((el) => el.__invisible) : [];
  for (const el of [...visible.slice(0, 8), ...widening.slice(0, 4)]) {
    const r = el.getBoundingClientRect();
    const kind = el.__invisible ? "hidden-widener" : "offscreen";
    problems.push({ kind, detail: `${describe(el)} [${Math.round(r.left)}..${Math.round(r.right)} of ${vw}]` });
  }
  // A table wider than an overflow:hidden box is cut off with no way to scroll to the rest of its columns.
  for (const t of document.body.querySelectorAll("table")) {
    const tr = t.getBoundingClientRect();
    if (!tr.width) continue;
    for (let p = t.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll") break;
      if (ox === "hidden" || ox === "clip") {
        const pr = p.getBoundingClientRect();
        if (tr.right > pr.right + 2) problems.push({ kind: "clipped-table", detail: `${describe(p).slice(0, 90)} cuts off ${Math.round(tr.right - pr.right)}px of its table` });
        break;
      }
    }
  }
  return problems;
};

async function settle(page) {
  // Polling (notifications) keeps the network from ever going fully idle and decorative "live" dots pulse forever,
  // so both waits are capped; a loading spinner is the signal that data is still on its way.
  // The page is ready when no spinner and no skeleton block is left. Skeletons are large animate-pulse blocks; small
  // pulsing status dots are decoration and never go away, so they are ignored.
  const ready = await page.waitForFunction(() => {
    if (document.querySelector(".animate-spin")) return false;
    return ![...document.querySelectorAll(".animate-pulse")].some((el) => { const r = el.getBoundingClientRect(); return r.width > 24 && r.height > 12; });
  }, { timeout: 25000, polling: 250 }).then(() => true, () => false);
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 4000 }).catch(() => {});
  await sleep(300);
  return ready;
}

async function main() {
  const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const results = [];
  const record = (role, route, width, problems, finalUrl) => {
    results.push({ role, route, width, finalUrl, problems });
    const tag = problems.length ? "FAIL" : "ok  ";
    if (problems.length) console.log(`${tag} [${role}] ${route} @${width}  ${problems.map((p) => `${p.kind}: ${p.detail}`).join(" | ")}`);
  };

  const runSet = async (role, paths, auth) => {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    if (auth) {
      await page.evaluate((a) => {
        localStorage.setItem("zoiko_access_token", a.access_token);
        if (a.refresh_token) localStorage.setItem("zoiko_refresh_token", a.refresh_token);
        localStorage.setItem("zoiko_user", JSON.stringify(a.employee || a.user));
      }, auth);
    }
    let done = 0;
    for (const route of paths) {
      if (ONLY && !route.startsWith(ONLY)) continue;
      if (++done % 10 === 0) console.log(`.. [${role}] ${done}/${paths.length} routes`);
      // Load once per route at a desktop width, then resize: resizing is what a real device rotation / window drag does
      // and it avoids re-fetching every page eight times.
      await page.setViewport({ width: 1280, height: 800 });
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      } catch (e) { record(role, route, 0, [{ kind: "load", detail: e.message }]); continue; }
      const ready = await settle(page);
      const finalUrl = new URL(page.url()).pathname;
      // Still loading after the wait: say so, since the layout measured is the loading state, not the page.
      if (!ready) console.log(`WARN [${role}] ${route} still loading after 25s; measured anyway`);
      const crashed = await page.evaluate(() => /Something went wrong|is not valid JSON|This page ran into a problem/.test(document.body.innerText));
      if (crashed) { record(role, route, 0, [{ kind: "render", detail: "error screen instead of the page" }], finalUrl); continue; }
      if (auth && (finalUrl === "/login" || finalUrl !== route && !finalUrl.startsWith(route))) {
        results.push({ role, route, width: 0, finalUrl, skipped: `redirected to ${finalUrl}`, problems: [] });
        continue;
      }
      for (const w of WIDTHS) {
        await page.setViewport({ width: w, height: HEIGHT[w] || 900 });
        await sleep(350);
        const problems = await page.evaluate(MEASURE);
        record(role, route, w, problems, finalUrl);
        if (problems.length && SHOTS) {
          fs.mkdirSync(SHOTS, { recursive: true });
          await page.screenshot({ path: path.join(SHOTS, `${role}${route.replace(/\//g, "_")}@${w}.png`) });
        }
      }
    }
    if (errors.length) console.log(`  [${role}] page errors: ${[...new Set(errors)].slice(0, 5).join(" || ")}`);
    await page.close();
  };

  if (!ROLE_FILTER || ROLE_FILTER.includes("public")) await runSet("public", PUBLIC_PATHS, null);
  const all = portalPaths();
  for (const [key, [envName, role]] of Object.entries(ROLE_ENV)) {
    if (ROLE_FILTER && !ROLE_FILTER.includes(key)) continue;
    const cred = process.env[envName];
    if (!cred) { console.log(`skip ${key}: ${envName} not set`); continue; }
    const auth = await login(cred);
    const paths = all.filter((p) => allowed(role, p));
    console.log(`== ${key}: ${paths.length} routes`);
    await runSet(key, paths, auth);
  }
  await browser.close();

  const checked = results.filter((r) => !r.skipped && r.width);
  const failed = checked.filter((r) => r.problems.length);
  const failedRoutes = new Set(failed.map((r) => `${r.role} ${r.route}`));
  console.log(`\n${checked.length} page/width checks, ${failed.length} failing, on ${failedRoutes.size} routes; ${results.filter((r) => r.skipped).length} routes skipped (redirected).`);
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
