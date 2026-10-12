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

const snap = async (label) => {
  const s = await page.evaluate(() => ({
    value: document.querySelector('input[aria-label="Search documents"]').value,
    rows: document.querySelectorAll("tbody tr").length,
    page: (() => { const el = [...document.querySelectorAll("span")].find((x) => /Page \d+ of/.test(x.textContent)); return el ? el.textContent : null; })(),
  }));
  console.log(label, JSON.stringify(s));
};

await snap("initial:");
net.length = 0;
await page.click('input[aria-label="Search documents"]');
await page.keyboard.type("zhr27", { delay: 80 });
await snap("typed:");
await new Promise((r) => setTimeout(r, 800));
await snap("t+800ms:");
await new Promise((r) => setTimeout(r, 2500));
await snap("t+3.3s:");
console.log("--- requests after typing ---");
console.log(net.join("\n"));
await browser.close();