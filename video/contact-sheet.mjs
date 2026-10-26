// Renders assets/shots/*.png into one labelled grid image (out/contact-sheet.png) for quick review.
import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
const files = (await readdir("assets/shots")).filter((f) => f.endsWith(".png")).sort();
const cells = files.map((f) => `<figure><img src="${pathToFileURL(path.resolve("assets/shots", f)).href}"><figcaption>${f}</figcaption></figure>`).join("");
const html = `<style>body{margin:0;background:#222;display:grid;grid-template-columns:repeat(4,480px);gap:8px;padding:8px;font:14px sans-serif;color:#eee}
figure{margin:0}img{width:480px;height:270px;object-fit:contain;background:#000;display:block}</style>${cells}`;
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--allow-file-access-from-files"] });
const p = await b.newPage();
await p.setViewport({ width: 4 * 488 + 8, height: 900 });
await mkdir("out", { recursive: true });
const { writeFile } = await import("node:fs/promises");
await writeFile("out/contact-sheet.html", html);
await p.goto(pathToFileURL(path.resolve("out/contact-sheet.html")).href, { waitUntil: "load" });
await p.screenshot({ path: "out/contact-sheet.png", fullPage: true });
await b.close();
console.log("out/contact-sheet.png");
