// Renders still frames of the composition for review.
//   node preview.mjs 2.5 10 23.8      → out/preview/t-2.50.png …
//   node preview.mjs --sheet          → one still per second in out/preview/sheet.png
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const args = process.argv.slice(2);
const sheet = args.includes("--sheet");
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--allow-file-access-from-files", "--force-color-profile=srgb", "--hide-scrollbars"], defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve("composition.html")).href, { waitUntil: "load" });
await page.evaluate(() => window.__ready);
const duration = await page.evaluate(() => window.STORYBOARD.duration);
const times = sheet ? Array.from({ length: Math.floor(duration) }, (_, i) => i + 0.5) : args.map(Number).filter((n) => !Number.isNaN(n));
await mkdir("out/preview", { recursive: true });
const files = [];
for (const t of times) {
  await page.evaluate((tt) => window.__render(tt), t);
  const file = path.resolve(`out/preview/t-${t.toFixed(2)}.png`);
  await page.screenshot({ path: file });
  files.push(file);
}
if (sheet) {
  const html = `<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(6,320px);gap:6px;padding:6px;font:13px sans-serif;color:#ddd}img{width:320px;display:block}</style>` +
    files.map((f, i) => `<div><img src="${pathToFileURL(f).href}">${times[i].toFixed(1)}s</div>`).join("");
  await writeFile("out/preview/sheet.html", html);
  await page.setViewport({ width: 6 * 326 + 6, height: 600 });
  await page.goto(pathToFileURL(path.resolve("out/preview/sheet.html")).href, { waitUntil: "load" });
  await page.screenshot({ path: "out/preview/sheet.png", fullPage: true });
  console.log("out/preview/sheet.png");
} else console.log(files.join("\n"));
await browser.close();
