import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";

const token = readFileSync("C:/Users/DELL/AppData/Local/Temp/opencode/sa_token.txt", "utf8").trim();
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const net = [];
page.on("pageerror", (e) => net.push(`[pageerror] ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") net.push(`[console.error] ${m.text()}`); });
page.on("response", (r) => { if (r.url().includes("super-admin/documents")) net.push(`<< ${r.status()} ${r.request().method()} ${r.url().replace("http://localhost:8000/super-admin/documents", "")}`); });
page.on("requestfailed", (r) => net.push(`XX ${r.method()} ${r.url()} ${r.failure()?.errorText}`));

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.evaluate((t) => {
  localStorage.setItem("zoiko_access_token", t);
  localStorage.setItem("zoiko_refresh_token", "r");
  localStorage.setItem("zoiko_user", JSON.stringify({ id: 1, email: "info@zoikohr.com", role: "super_admin" }));
}, token);
await page.goto("http://localhost:5173/shared/documents", { waitUntil: "networkidle2" });
await page.waitForSelector('tbody tr', { timeout: 30000 });
await page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, { timeout: 30000 });
console.log("initial rows:", await page.evaluate(() => document.querySelectorAll("tbody tr").length));

// ── SEARCH ───────────────────────────────────────────────────────────────────
const box = await page.$('input[aria-label="Search documents"]');
console.log("search box found:", !!box);
await page.click('input[aria-label="Search documents"]');
await page.keyboard.type("zhr27", { delay: 60 });
console.log("input value after typing:", await page.evaluate(() => document.querySelector('input[aria-label="Search documents"]').value));
await new Promise((r) => setTimeout(r, 2500));
console.log("rows after search:", await page.evaluate(() => [...document.querySelectorAll("tbody tr")].map((r) => r.innerText.replace(/\s+/g, " ").slice(0, 50))));
console.log("pagination text:", await page.evaluate(() => {
  const el = [...document.querySelectorAll("span")].find((s) => /Page \d+ of/.test(s.textContent));
  return el ? el.textContent : null;
}));

// search for something that must return nothing
await page.evaluate(() => {
  const el = document.querySelector('input[aria-label="Search documents"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  el.focus();
});
await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
await page.keyboard.type("zzzznotfound", { delay: 40 });
await new Promise((r) => setTimeout(r, 2500));
console.log("rows for no-match:", await page.evaluate(() => document.body.innerText.includes("No documents match your search.")));

// clear
await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
await page.keyboard.press("Backspace");
await new Promise((r) => setTimeout(r, 2000));
console.log("rows after clear:", await page.evaluate(() => document.querySelectorAll("tbody tr").length));

// ── DELETE ───────────────────────────────────────────────────────────────────
const target = await page.evaluate(() => {
  const row = document.querySelector("tbody tr");
  const btn = row.querySelector('button[aria-label^="Delete"]');
  return btn ? btn.getAttribute("aria-label") : null;
});
console.log("delete target:", target);
await page.click(`button[aria-label="${target}"]`);
await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
console.log("confirm dialog:", await page.evaluate(() => document.querySelector('[role="dialog"]').innerText.replace(/\s+/g, " ").slice(0, 160)));
const delBtn = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const b = [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "Delete");
  return b ? { disabled: b.disabled, type: b.type } : null;
});
console.log("delete button:", JSON.stringify(delBtn));
await page.click('[role="dialog"] button.btn, [role="dialog"] button');
await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const b = [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "Delete");
  b.click();
});
await new Promise((r) => setTimeout(r, 4000));
console.log("dialog after delete:", await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  return d ? d.innerText.replace(/\s+/g, " ").slice(0, 200) : "closed";
}));
console.log("notice:", await page.evaluate(() => {
  const n = [...document.querySelectorAll("div")].find((x) => /was deleted|already deleted/.test(x.textContent) && x.children.length === 0);
  return n ? n.textContent : null;
}));
console.log("error note:", await page.evaluate(() => { const n = document.querySelector(".border-red-100"); return n ? n.innerText : null; }));
console.log("--- net ---");
console.log(net.join("\n"));
await browser.close();