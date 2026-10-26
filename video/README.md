# 3D Virtual Office — product showcase video

A 57-second, 1920×1080 product commercial built from real screens of the app.
Everything here is editable source; no paid video tools are needed.

```
video/
├─ storyboard.js        ← edit this: scenes, timing, Thai copy, camera, cursor, clicks, highlights, toasts, sound levels
├─ composition.html     ← look & feel (fonts, colours, captions, toasts, phone frame)
├─ composition.js       ← motion engine: window.__render(t) draws any moment; window.__cues() lists sounds
├─ capture.mjs          ← signs in to the LOCAL app and captures 1920×1080 screens + element positions
├─ preview.mjs          ← renders still frames for review
├─ render.mjs           ← renders all frames with Chrome, encodes with FFmpeg, mixes the sound effects
├─ contact-sheet.mjs    ← grid of all captured screens
├─ assets/shots/*.png   ← captured screens;  assets/shots.json ← element rectangles per screen
├─ assets/sfx/*.mp3     ← sound effects (pop, click, typing, swoosh) supplied by the owner
└─ out/virtual-office-showcase.mp4   ← the rendered video
```

## Requirements
- Node 20+, Google Chrome (path in `CHROME_PATH`, default `C:/Program Files/Google/Chrome/Application/chrome.exe`), FFmpeg on `PATH` (or `FFMPEG_PATH`).
- `npm install` inside `video/` (only `puppeteer-core`, which drives the installed Chrome).

## Re-render after editing the storyboard
```bash
node preview.mjs --sheet
```
```bash
node render.mjs
```
`node render.mjs 21.2 27.6` renders only one scene to `out/clip-21.2-27.6.mp4` for a quick check.

## Re-capture screens (after UI changes)
Start the app (`npm run dev` in the project root) with the local database and demo data:
```bash
npx supabase db reset
```
```bash
bash scripts/demo-data.sh
```
then, in `video/`:
```bash
node capture.mjs
```
`node capture.mjs reports` re-captures only matching shots. The capture uses the synthetic seed accounts on `localhost` only; never point it at production.

## Story (seconds)
| Time | Scene | Message |
|---|---|---|
| 0–5.2 | Problem | Meeting ends… where did the tasks go? |
| 5.2–9.4 | Brand | 3D Virtual Office — every task has an owner |
| 9.4–15.4 | Office | The whole team in one office, live; hotbar 1–9 |
| 15.4–21.2 | Step 01 | Meeting notes become action items |
| 21.2–27.6 | Step 02 | Assign in one click with explained suggestions |
| 27.6–33.6 | Step 03 | Everyone sees their own quests |
| 33.6–39.4 | Step 04 | Submit · review · approve → archived |
| 39.4–46.4 | Step 05 | Reports ready instantly, export PDF / Excel |
| 46.4–51.2 | Devices | Works on any device; characters, pets, chat |
| 51.2–57 | Outro | Teamwork, clear, nothing falls through |

## Notes
- Screens are real; the data is the synthetic seed plus `scripts/demo-data.sql` (marked "ข้อมูลตัวอย่าง (เดโม)"). The outro says so.
- Sound effects are cued automatically from the storyboard (swoosh on scene changes, click on clicks, pop on toasts / reveals, typing spans). Set `music` in `storyboard.js` to add a licensed music bed; it is mixed at 35% and faded out.
- The sound files came from the owner's library; confirm their licences before public distribution.
