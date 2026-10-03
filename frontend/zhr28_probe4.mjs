import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";

const token = readFileSync("C:/Users/DELL/AppData/Local/Temp/opencode/sa_token.txt", "utf8").trim();
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const ev = [];
page.on("request", (r) => { if (r.url().includes("super-admin/documents")) ev.push(`REQ  ${String(Date.now() % 100000).padStart(5)} ${r.method()} ${r.url().replace("http://localhost:8000/super-admin/documents", "")}`); });
page.on("response", (r) => { const u = r.url(); if (u.includes("super-admin/documents")) ev.push(`RES  ${String(Date.now() % 100000).padStart(5)} ${r.status()} ${r.url().replace("http://localhost:8000/super-admin/documents", "")}`); });

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.evaluate((t) => {
  localStorage.setItem("zoiko_access_token", t);
  localStorage.setItem("zoiko_refresh_token", "r");
  localStorage.setItem("zoiko_user", JSON.stringify({ id: 1, email: "info@zoikohr.com", role: "super_admin" }));
}, token);
await page.goto("http://localhost:5173/shared/documents", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelectorAll("tbody tr").length > 0, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

const rowInfo = () => page.evaluate(() => [...document.querySelectorAll("tbody tr")].map((r) => r.querySelector('button[aria-label^="Delete"]').getAttribute("aria-label")));
const total = () => page.evaluate(() => { const el = [...document.querySelectorAll("span")].find((x) => /Page \d+ of/.test(x.textContent)); return el ? el.textContent : null; });

ev.length = 0;
const target = (await rowInfo())[0];
console.log("== deleting", target);
await page.click(`button[aria-label="${target}"]`);
await page.waitForSelector('[role="dialog"]');
await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "Delete").click();
});
await new Promise((r) => setTimeout(r, 6000));
console.log("after delete:", await total());
console.log("target still listed:", (await rowInfo()).includes(target));
console.log(ev.join("\n"));
await browser.close();