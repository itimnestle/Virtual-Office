// Captures 1920×1080 scenes of the running app (LOCAL dev server + seed/demo data only).
// For each shot it saves a PNG and the on-screen rectangles of chosen elements,
// so the storyboard can aim the cursor, zooms and highlights at real UI.
//
//   node capture.mjs            all shots
//   node capture.mjs reports    only shots whose name contains "reports"
//
// Seed accounts and password come from supabase/seed.sql (test values for this app).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_PASSWORD ?? "VirtualOffice2026";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = path.resolve("assets/shots");
const only = process.argv[2];

/** Shots in story order. `rects` maps a name to a CSS selector measured after the page settles. */
const SHOTS = [
  { name: "01-login", user: null, url: "/login", wait: 1500, rects: { form: "form:has(input[type=password])", submit: "form:has(input[type=password]) button[type=submit]" } },
  { name: "02-office", user: "manager", url: "/office", scene: true, wait: 9000,
    rects: { hotbar: ".hud-hotbar ol", player: ".hud-player", minimap: ".hud-minimap", menu: ".world-hud-button.is-menu" } },
  { name: "03-meeting", user: "manager", url: "/meetings", firstLink: "a[href^='/meetings/']", scene: true, wait: 6000,
    rects: { window: ".world-window", body: ".world-window-body", hotbarMeetings: ".hud-slot[href='/meetings']" } },
  { name: "04-inbox", user: "manager", url: "/inbox", scene: true, wait: 6000, scrollTo: ".world-window-body .ui-btn--primary", scrollOffset: -640,
    click: ".world-window-body input[type=checkbox]",
    rects: { window: ".world-window", body: ".world-window-body", firstItem: ".world-window-body li, .world-window-body .ui-card", assign: ".world-window-body .ui-btn--primary" } },
  { name: "05-tasks", user: "manager", url: "/tasks", scene: true, wait: 6000,
    rects: { window: ".world-window", hero: ".tasks-hero", stats: ".tasks-stats", firstCard: ".quest-card:not(.is-locked)", grid: ".quest-grid", slotTasks: ".hud-slot[href='/tasks']" } },
  { name: "05b-tasks-cards", user: "manager", url: "/tasks", scene: true, wait: 6000, scrollTo: ".quest-grid",
    rects: { window: ".world-window", grid: ".quest-grid", firstCard: ".quest-card:not(.is-locked)" } },
  { name: "06-member-tasks", user: "member1", url: "/tasks?view=mine", scene: true, wait: 6000,
    rects: { window: ".world-window", stats: ".tasks-stats", firstCard: ".quest-card:not(.is-locked)" } },
  { name: "07-task-review", user: "manager", url: "/tasks?status=in_review", firstLink: ".quest-card[data-status='in_review'] a", scene: true, wait: 6000, scrollTo: ".world-window-body button[value=approved]", scrollOffset: -520,
    rects: { window: ".world-window", approve: ".world-window-body button[value=approved]", review: ".world-window-body form:has(button[value=approved])", body: ".world-window-body" } },
  { name: "08-reports", user: "manager", url: "/reports?period=30d", scene: true, wait: 6500,
    rects: { window: ".world-window", hero: ".rpt-hero", period: ".rpt-period", kpis: ".rpt-kpis", trend: ".rpt-trend", donut: ".rpt-donut", export: ".rpt-export" } },
  { name: "08b-reports-charts", user: "manager", url: "/reports?period=30d", scene: true, wait: 6500, scrollTo: ".rpt-kpis",
    rects: { window: ".world-window", kpis: ".rpt-kpis", trend: ".rpt-trend", donut: ".rpt-donut" } },
  { name: "09-me", user: "member1", url: "/me", scene: true, wait: 9000, scrollTo: ".world-window-body canvas",
    rects: { window: ".world-window", preview: ".world-window-body canvas" } },
  { name: "11-phone", user: "member1", url: "/office", scene: true, wait: 9000, viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, rects: {} },
  { name: "10-office-member", user: "member1", url: "/office", scene: true, wait: 9000,
    rects: { hotbar: ".hud-hotbar ol", player: ".hud-player", minimap: ".hud-minimap" } },
];

const EMAIL = { manager: "manager@example.com", member1: "member1@example.com", director: "director@example.com" };

async function signIn(page, user) {
  await page.goto(`${BASE}/auth/signout`, { waitUntil: "networkidle2" }).catch(() => {});
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  if (!user) return;
  // Let React hydrate the form first, or the typed values are reset.
  await new Promise((r) => setTimeout(r, 2500));
  await page.type("input[type=email]", EMAIL[user], { delay: 10 });
  await page.type("input[type=password]", PASSWORD, { delay: 10 });
  await page.click("form:has(input[type=password]) button[type=submit]");
  await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
}

/** The dev server compiles pages on first request, so navigations get a few patient retries. */
async function go(page, url) {
  for (let attempt = 1; ; attempt++) {
    try { return await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 }); }
    catch (error) { if (attempt >= 3) throw error; console.warn("retrying", url); }
  }
}

async function measure(page, rects) {
  return page.evaluate((map) => Object.fromEntries(Object.entries(map).map(([k, sel]) => {
    const el = document.querySelector(sel);
    if (!el) return [k, null];
    const r = el.getBoundingClientRect();
    return [k, { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }];
  })), rects);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--window-size=1920,1080", "--hide-scrollbars", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--force-color-profile=srgb", "--lang=th-TH"],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
await mkdir(OUT, { recursive: true });
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "no-preference" }]);
const meta = {};
const metaFile = path.resolve("assets/shots.json");
let existing = {};
try { existing = JSON.parse(await (await import("node:fs/promises")).readFile(metaFile, "utf8")); } catch {}
const saveMeta = () => writeFile(metaFile, JSON.stringify({ ...existing, ...meta }, null, 2));
let current = undefined;

for (const shot of SHOTS) {
  if (only && !shot.name.includes(only)) continue;
  await page.setViewport(shot.viewport ?? { width: 1920, height: 1080, deviceScaleFactor: 1 });
  if (shot.user !== current) { await signIn(page, shot.user); current = shot.user; }
  // Best visuals for the recording; the choice lives in this browser profile only.
  await page.evaluate(() => { try { localStorage.setItem("vo.quality", "high"); } catch {} });
  await go(page, `${BASE}${shot.url}`);
  if (shot.firstLink) {
    const href = await page.$eval(shot.firstLink, (a) => a.getAttribute("href")).catch(() => null);
    if (href) await go(page, `${BASE}${href}`);
  }
  if (shot.scene) await page.waitForSelector("canvas", { timeout: 30000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, shot.wait));
  if (shot.scrollTo) {
    await page.evaluate((sel, offset) => { const el = document.querySelector(sel); const body = document.querySelector(".world-window-body");
      if (el && body) body.scrollTop += el.getBoundingClientRect().top - body.getBoundingClientRect().top + offset; }, shot.scrollTo, shot.scrollOffset ?? -24);
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (shot.click) { await page.click(shot.click).catch(() => {}); await new Promise((r) => setTimeout(r, 1200)); }
  const file = path.join(OUT, `${shot.name}.png`);
  await page.screenshot({ path: file, type: "png" });
  meta[shot.name] = { url: page.url().replace(BASE, ""), rects: await measure(page, shot.rects ?? {}) };
  console.log("captured", shot.name, meta[shot.name].url);
  await saveMeta();
}
await browser.close();
