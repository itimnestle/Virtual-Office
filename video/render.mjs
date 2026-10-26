// Renders the storyboard to out/virtual-office-showcase.mp4 (1920×1080, H.264 + AAC).
//   node render.mjs            full video
//   node render.mjs 9.4 15.4   only a time range (for quick checks)
//
// 1. Chrome renders each frame of composition.html (window.__render(t)) to JPEG.
// 2. FFmpeg encodes the frames from stdin.
// 3. Sound cues (window.__cues) are mixed from assets/sfx with adelay + amix.
// 4. Video and audio are muxed into the final MP4.
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const [fromArg, toArg] = process.argv.slice(2).map(Number);

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: [input ? "pipe" : "ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${err.slice(-2000)}`))));
    if (input) input(p.stdin);
  });
}

await mkdir("out", { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--allow-file-access-from-files", "--force-color-profile=srgb", "--hide-scrollbars"], defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve("composition.html")).href, { waitUntil: "load" });
await page.evaluate(() => window.__ready);
const { fps, duration, SFX, music } = await page.evaluate(() => window.STORYBOARD);
const cues = await page.evaluate(() => window.__cues());
const t0 = Number.isFinite(fromArg) ? fromArg : 0;
const t1 = Number.isFinite(toArg) ? toArg : duration;
const frames = Math.round((t1 - t0) * fps);
const silent = path.resolve("out/video-silent.mp4");

// ---- 1+2: frames → H.264
console.log(`rendering ${frames} frames (${t0}s – ${t1}s) at ${fps} fps`);
const started = Date.now();
await run(FFMPEG, ["-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent], async (stdin) => {
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.__render(t), t0 + i / fps);
    const jpg = await page.screenshot({ type: "jpeg", quality: 95 });
    if (!stdin.write(jpg)) await new Promise((r) => stdin.once("drain", r));
    if (i % (fps * 5) === 0) console.log(`  ${(t0 + i / fps).toFixed(1)}s  (${Math.round((Date.now() - started) / 1000)}s elapsed)`);
  }
  stdin.end();
});
await browser.close();

// ---- 3: sound effects mix
const inRange = cues.filter((c) => c.t >= t0 && c.t < t1);
const inputs = [];
const filters = [];
inRange.forEach((c, i) => {
  const s = SFX[c.sfx];
  inputs.push("-i", path.resolve(s.file));
  const gain = (s.gain ?? 1) * (c.gain ?? 1);
  const delay = Math.max(0, Math.round((c.t - t0) * 1000));
  const trim = c.dur ? `atrim=0:${c.dur},afade=t=out:st=${Math.max(0, c.dur - 0.25)}:d=0.25,` : "";
  filters.push(`[${i}:a]${trim}volume=${gain.toFixed(2)},adelay=${delay}|${delay}[a${i}]`);
});
let mixInputs = inRange.map((_, i) => `[a${i}]`).join("");
let count = inRange.length;
if (music) {
  inputs.push("-i", path.resolve(music));
  filters.push(`[${count}:a]atrim=${t0}:${t1},asetpts=PTS-STARTPTS,volume=0.35,afade=t=out:st=${Math.max(0, t1 - t0 - 2)}:d=2[m]`);
  mixInputs += "[m]";
  count += 1;
}
const audio = path.resolve("out/audio.m4a");
const length = (t1 - t0).toFixed(3);
if (count) {
  filters.push(`${mixInputs}amix=inputs=${count}:normalize=0:dropout_transition=0,apad,atrim=0:${length},alimiter=limit=0.89[out]`);
  await run(FFMPEG, ["-y", ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", audio]);
} else {
  await run(FFMPEG, ["-y", "-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo`, "-t", length, "-c:a", "aac", audio]);
}

// ---- 4: mux
const name = t0 === 0 && t1 === duration ? "virtual-office-showcase.mp4" : `clip-${t0}-${t1}.mp4`;
const final = path.resolve("out", name);
await run(FFMPEG, ["-y", "-i", silent, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "copy", "-shortest", "-movflags", "+faststart", final]);
console.log(`done in ${Math.round((Date.now() - started) / 1000)}s → ${final}  (${inRange.length} sound cues)`);
