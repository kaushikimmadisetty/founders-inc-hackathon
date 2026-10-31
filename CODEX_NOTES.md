# Codex handoff

Implemented all three requested tasks; **changes are uncommitted**. The sandbox denies `.git/index.lock` writes, so even local commits are impossible. Each task's pull/commit/push was attempted: pull refuses the dirty shared checkout, commit is sandbox-blocked, and push lacks GitHub credentials. No branches, tests, or server restarts were created.

- Landing: `web/app/page.tsx` + `web/components/Hero3D.tsx`. Rotating assembled mecanum arm, cinematic lights/shadows/grid, responsive headline, Photon number, original POST/run navigation and example chips. Sample build uses catalog dimensions/prices.
- Props: `backend/sim/assets.py`, `backend/routers/assets.py`, `web/components/SceneProps.tsx`, requirements, and exactly one router include line in `backend/app.py`. Recursive USD references/payloads/sublayers, texture-free triangulated world-space mesh, metre conversion, grounded OBJ/GLB, PNG thumbnail, source/license metadata, URL-keyed disk cache and query lookup. Subprocess enforces a 20-second overall timeout; errors return null/None for primitive fallback. Added usd-core/trimesh dependency declarations and installed scipy + fast-simplification.
- GIFs: `backend/sim/render.py`; only the render call changed in `backend/sim/runner.py`, adding `attempt=iteration`. Defaults 480×360 / 15 fps / camera distance 1.3, elevation -20, azimuth 150. PIL attempt/status banners, quantization and frame reduction under 2 MB with playback duration preserved.

## Integration gotchas

- `PropGLB` is Y-up; for MuJoCo/Z-up scenes pass `rotation={[Math.PI / 2, 0, 0]}`. OBJ and `dims_m` are Z-up. Both meshes are in metres and grounded. Viewer3D is untouched; Claude can wire in the hook and component. Keep source attribution with the asset (CC-BY-4.0 metadata included).
- Runner passes only `attempt`, as requested. Status banners require optional `passed` / `label`; they are not inferred when omitted. Claude can pass the outcome later if desired.
- Cached props are gitignored: sofa 815,504 bytes; bin 907,308; pallet 208,928; cardboard box 810,620. All four pre-warmed and reopened successfully with trimesh. Search's best cardboard match came from the PalatialSim mirror, whose URL is preserved in metadata.
- Browser host was unavailable, so no screenshot verification of the landing. HTTP :3001 returned 200. Port :8000 was not listening; router and GLB static serving verified in-process with HTTP 200. No servers were started/stopped.
- Native MuJoCo rendering hit `invalid CoreGraphics connection`; verified the light trajectory fallback with attempt/pass banners (480×360, 60 frames, 4 seconds, ~420 KB). Noisy compression check yielded 1.24 MB and preserved its 2-second duration. Native tracking camera still needs a GL-capable environment.

Validation: `cd web && npx tsc --noEmit`, `cd backend && .venv/bin/python -c "import app"`, and `git diff --check` pass. No test files were written or edited.

Suggested commit groups/messages for Claude (pull/rebase before each, preserve any concurrent edits):
1. page.tsx + Hero3D.tsx — `Build cinematic 3D robot landing page`
2. assets.py modules + SceneProps.tsx + requirements + app.py router line — `Add cached SimReady prop conversion and scene helpers`
3. render.py + runner.py call — `Polish phone simulation GIFs and attempt banners`
4. this file — `Document RoboForge implementation handoff`

## 2026-10-30 — Light blueprint CAD workspace

Implemented the requested UI overhaul in `web/`, plus this handoff. No backend files were edited, no tests were written, no screenshots were taken, and no servers were started or stopped. Existing concurrent backend changes and the separately added `web/app/live/` were left untouched.

### Shipped

- Light tokens, white rounded chrome, readable 14px+ interface text, 36px+ controls, focus outlines, Inter body font and Instrument Serif titles through `next/font/google`.
- Shared `BlueprintFloor.tsx`: metre-based geometry, 10mm minor / 50mm major blue grid, millimetre rulers baked into a canvas texture, soft contact shadows. Handles both the hero's Y-up coordinates and the viewers' Z-up coordinates. No drei `Html` anywhere.
- Shared studio lighting across all three canvases, with hemisphere fill, shadow-casting key and city environment reflections. Reflection downloads have Suspense plus an error boundary so failed HDR loading leaves the base lights available.
- Director is a viewport-first, fixed-height workspace. Planning, sourcing, critic, rebuilding, success and build-pack cards float over the scene. The critic retains the failed replay behind its route/instruction card; success retains confetti. Camera framing shifts the model left when a large card occupies the right side.
- Persistent Parts / This robot panel: two-column CSS isometric component thumbnails, quantities/prices, progressive sourcing highlights, searchable grouped references, specification summary, simulation history and selected-part detail with vendor, quantity, mass, torque/RPM where supplied, and truthful live/catalog price badges.
- Bidirectional selection in both viewers and the panel. `partRefs.ts` maps physical pieces to M1–M4, W1–W4, B1, R1, U1, D1–D2, IMU, CAM, TOF, S1–S3, G1, CH and PCB. Child chassis/gripper geometry shares the logical selection. Hover tooltips are plain fixed DOM nodes driven by R3F pointer events; flying labels retain direct projection to DOM.
- Shared 3D / Top / Ortho controls (true orthographic camera), ~0.6s position/target transitions, clickable TOP/FRONT/RIGHT cube, reset, fit, zoom and exploded tools. Simulation follow camera continues moving eye and target together so orbit remains available. Assembly retains Build / Assembled / Exploded animation modes.
- Muted grey-blue PLA, brushed metal motors/servos, rubber wheels with tread rings and metal hubs, green PCB with copper pads and silkscreen details, charcoal battery with a narrow yellow label. Corrected the wheel/motor cylinder axes so wheels stand vertically, and added the third wrist servo primitive.
- Floating revision input preserves POST `/runs` with `parent_run_id` and navigation to the new run; includes network failure feedback and duplicate-submit protection. Original landing POST and every build-pack download link remain intact.
- Light landing page retains the rotating robot, sample-build labels, example prompts, serif headline and huge iMessage number.
- Assembly completion now stays latched when the backend report is late, and resumes correctly when auto-play is re-enabled. Actual assembly waits for parts/body before consuming its playback time. The Director is keyed by run ID for clean revision navigation. Trajectory fetches abort on report changes and distinguish failure from loading.

### Validation and limitations

`cd web && npx tsc --noEmit` passed after each task and the final flow correction. `git diff --check` passed. HTTP requests to the existing localhost:3001 server returned 200 for `/` and `/run/preview`. These are compilation/server checks, not browser/WebGL visual validation; screenshots and tests were deliberately not used.

The environment HDR is remotely loaded by drei; Google fonts are fetched by Next's font pipeline. Basic scene lighting survives HDR failure. Grid labels are texture-based: the 1m assembly/hero floor labels every 10mm, and the larger 6m simulation floor labels every 100mm for density (grid spacing remains 10/50mm). Thumbnails are CSS isometric illustrations rather than separate WebGL contexts. The mic is a decorative cue for the revision input, not a speech-recognition control. Settings exposes viewport gestures and units. Geometry remains primitive-based and, as before, historical replay uses the latest run body/spec rather than per-attempt mesh snapshots. Preview geometry before sourcing is illustrative.

### Commit handoff — all changes remain uncommitted

The branch is `main`. Every local `git add ... && git commit ...` attempt failed before staging with `Unable to create .../.git/index.lock: Operation not permitted`. No stash/reset/checkout/pull/push was used. The filesystem policy prevents completing commits here; Claude must stage explicit UI paths and commit them from its permitted shell. Do not accidentally include concurrent backend edits or `web/app/live/` in the UI commits.

Requested logical groups / attempted messages:
1. `Introduce light blueprint theme and shared studio lighting` — theme/config/layout, BlueprintFloor, initial shared lighting and component contrast.
2. `Build persistent CAD workspace with parts inspector and review story` — Director, PartsPanel, TweakBox, partRefs, run page and workspace CSS.
3. `Add CAD camera tools bidirectional part selection and realistic materials` — ViewportControls, Robot3D, Viewer3D and related wiring/styles.
4. `Restyle robot landing page with light blueprint hero and serif typography` — landing page/Hero3D.
5. `Keep auto-play advancing when simulation reports arrive after assembly` — final Director/Robot3D flow guard.
6. `Document blueprint CAD workspace and integration notes` — this section.

Some files span groups because staging was blocked throughout; a single explicit-path UI commit is also safe. Run `cd web && npx tsc --noEmit` immediately before committing.
