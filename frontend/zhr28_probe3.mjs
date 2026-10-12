import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";

const token = readFileSync("C:/Users/DELL/AppData/Local/Temp/opencode/sa_token.txt", "utf8").trim();
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const net = [];
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("super-admin/documents")) net.push(`${Date.now() % 100000} << ${r.status()} ${r.request().method()} ${u.replace("http://localhost:8000/super-admin/documents", "")}`);
});

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.evaluate((t) => {
  localStorage.setItem("zoiko_access_token", t);
  localStorage.setItem("zoiko_refresh_token", "r");
  localStorage.setItem("zoiko_user", JSON.stringify({ id: 1, email: "info@zoikohr.com", role: "super_admin" }));
}, token);
await page.goto("http://localhost:5173/shared/documents", { waitUntil: "networkidle2" });
await page.waitForFunction(() => document.querySelectorAll("tbody tr").length > 0, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500)); // let any duplicate in-flight load settle

const rowInfo = () => page.evaluate(() => [...document.querySelectorAll("tbody tr")].map((r) => r.querySelector('button[aria-label^="Delete"]').getAttribute("aria-label")));

net.length = 0;
const target = (await rowInfo())[0];
console.log("deleting:", target);
await page.click(`button[aria-label="${target}"]`);
await page.waitForSelector('[role="dialog"]');
await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "Delete").click();
});
await new Promise((r) => setTimeout(r, 3000));
console.log("dialog:", await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return d ? d.innerText.replace(/\s+/g, " ").slice(0, 120) : "closed"; }));
console.log("notice:", await page.evaluate(() => {
  const n = [...document.querySelectorAll("div")].find((x) => /was deleted|already deleted/.test(x.textContent) && x.children.length === 0);
  return n ? n.textContent : null;
}));
const rows = await rowInfo();
console.log("target still in list:", rows.includes(target), "| rows:", rows.length);
console.log("page text:", await page.evaluate(() => { const el = [...document.querySelectorAll("span")].find((x) => /Page \d+ of/.test(x.textContent)); return el ? el.textContent : null; }));

// search right after a delete-refresh: does a late response restore the deleted row?
await page.click('input[aria-label="Search documents"]');
await page.keyboard.type("zhr27", { delay: 60 });
await new Promise((r) => setTimeout(r, 3000));
const after = await rowInfo();
console.log("after search rows:", after.length, "| target present:", after.includes(target));
console.log("--- requests ---");
console.log(net.join("\n"));
await browser.close();