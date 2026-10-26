# Office visual refresh — 23 October 2026

> **Update (24 Oct 2026, D-100):** the office is now the whole app shell. The `/office` page layout described below (heading, stats, side roster) was replaced by `src/components/shell/world-shell.tsx`; the scene, furniture, avatars and directory pieces described here are reused there.

The `/office` page now presents the authorized office snapshot as a detailed,
self-contained diorama. No model hosting, image service, font download, or new
runtime dependency is required.

## Visual changes

- Sage and warm wood palette, inset windows, framed artwork, glass room
  partitions, flooring, rugs, plants, and a reading lamp.
- Desks with dual monitors, screen content, keyboards, mice, mugs, notebooks,
  drawers, workload lights, and chairs. The director's desk uses darker wood.
- Six-seat meeting room with presentation screen; lounge with sofa, cushions,
  coffee table, ottoman, and coffee station; leave area represented by a house.
- Avatars retain saved skin, hair, clothing, and glasses. Companion pets have
  faces, ears, legs, and tails. The directory uses matching vector portraits.
- App navigation and auth pages share the new visual language. Auth artwork is
  a lightweight local SVG and does not load the Three.js scene.

## Interaction

- Overview, top, meeting, and lounge camera presets; zoom, reset, daylight /
  evening lighting, name visibility, controls help, and expanded workspace.
- Selecting an avatar or directory entry focuses the camera and opens the
  person's real workload, next deadline, and authorized task links.
- Name / job-title search and location filters; readable 2D directory with the
  same selection behavior. Empty search and empty team states are explicit.
- Locations describe the meeting / absence schedule, not network presence.
  Snapshot time is shown in Bangkok time. Assignment navigation appears only
  for directors and managers.
- Responsive sidebar and stacked mobile layout; keyboard labels, Escape to
  close, focus restoration, and focus containment in expanded view.

## Rendering and boundaries

- Scene is dynamically loaded on the client. `frameloop="demand"`, DPR capped
  at 1.5, static lighting, and no continuous animation loop.
- Percentage-closer shadow mapping is selected explicitly for Three.js 0.186.
- WebGL feature detection, render error boundary, and context-loss handling
  retain access to the directory when the scene cannot be rendered.
- More members add desk rows and extend the floor. Overview and top views fit
  every corner of the room in perspective, including the walls, with an edge
  margin on portrait and landscape screens.
- Server snapshot derivation, RLS, business rules, and migrations are unchanged.

## Verification

- TypeScript, ESLint, production build, and client-secret bundle scan passed.
- Existing test suite: 9 files, 108 tests passed, including local live API tests.
- Production browser checks: Thai directory search, selected-person task panel,
  camera focus and presets, evening lighting, expanded view, 2D mode, empty
  location filter, and the redesigned sign-in page.
- Checked Thai / English and light / dark themes, desktop layouts at 1280 and
  1440 pixels, and a 390-pixel mobile viewport with no horizontal page overflow.
- Verified focus moves into a selected profile, returns to its directory row,
  stays inside expanded view when tabbing, and Escape closes expanded view.
- No browser errors were reported in the final production tab. Development
  asset caching was bypassed by verifying the compiled production build.
- Test account settings were restored to Thai, system theme, and the original
  motion setting. Preview images are saved in `artifacts/`.

Known limitation: the installed React Three Fiber version internally uses
`THREE.Clock`, which Three.js warns is deprecated. It does not prevent rendering;
the application does not patch dependency internals. Real-device mobile GPU
performance still depends on the device.
