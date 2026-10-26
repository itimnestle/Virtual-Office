# 3D office detail pass — 24 October 2026

This pass builds on the current full-screen WorldShell. Page windows, object
navigation, social features, authorized snapshots, and role restrictions are
preserved.

## Scene finishes

- Deterministic, locally generated wood-grain floor texture replaces the plain
  floor seams. Texture tiling follows the room depth as additional desks appear.
- Keyboard keys are a small canvas texture instead of dozens of meshes per desk.
- Executive bookcase, acoustic slats, planter and Bangkok-time wall clock give
  the rooms more architectural detail. The clock uses the snapshot timestamp.
- The arcade has pixel artwork, a joystick, controls, coin slot and marquee.
  Foosball includes players, handles, rails, pitch markings and a ball.
- A subtle shadow catcher grounds the room, and evening light warms the reading
  corner. All textures are local; no assets or runtime packages were added.
- Scene primitives now live in `office-primitives.tsx`; furniture re-exports
  them so existing consumers remain compatible without circular imports.

## UI and interaction

- Floating overview card shows actual office / meeting / away counts and the
  snapshot time. Count buttons open the matching team filter.
- Consistent glass surfaces, muted sage controls, workload legend, icon-based
  menu rows and a camera reset button.
- The mobile camera dock uses two rows, keeping all 12 buttons available.
  Hotspot labels scale down on narrower screens.
- A selected person's mobile panel becomes a shorter sheet; camera projection
  centres the person in the uncovered part of the screen. Desktop projection
  similarly accounts for the panel on the left.
- Focus moves to the person panel and returns to the selected directory row.
  Escape closes the current help / selection / drawer layer; clicking outside
  the places menu dismisses it. Mobile search uses a 16px input font.
- Camera flights clamp the first frame delta after idle, preserve zoom commands
  received mid-flight, and respect both the user setting and OS reduced motion.

## Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: 16 test files, 144 tests passed.
- `npm run check:bundle`: 34 client files scanned, no server secrets found.
- Production browser: overview count filter, Thai search, person selection,
  focus restoration, 2D lobby and calendar window checked.
- Mobile viewport: 390 × 844, no horizontal overflow, all camera controls inside
  the screen; selected-person panel leaves the character visible above it.
- Desktop preview: 1280 × 720. Preview image:
  `artifacts/office-polish-2026-10-24.png`.

The live production preview for this pass runs on port 3002. The existing
development server on port 3000 was left running. Real-device GPU performance
has not been measured.
