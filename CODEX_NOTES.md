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

## 2026-10-30 — Owner follow-up: calm Etch-style workbench

This section supersedes the earlier motion/auto-play behavior. The owner requested a still CAD tool, so the default robot is now fully assembled and stationary.

### Changes

- Removed hero turntable rotation; added manual OrbitControls with damping disabled. There are no idle rotations anywhere.
- Assembly defaults to Assembled. Exploded applies fixed offsets immediately. Build is optional, starts only on a button click, settles within 1.5 seconds total, and switches back to Assembled. Repeated clicks during the build are disabled. Removed per-piece frame updates and the old flying-label frame handler.
- Simulation camera no longer follows the robot. It fits the trajectory bounds once, then stays fixed unless the user orbits or chooses a preset. Replay clamps at the last frame instead of wrapping. The small Replay button explicitly restarts it; completed attempts are remembered by the Director so revisiting them does not automatically replay.
- Finished runs open on the final simulation frame, with BuildPack in the right panel. No completion overlay or celebration obscures the viewport.
- Removed all Director presentation clocks, auto-play UI, assembly-completion sequencing, progressive parts spotlight timers, confetti, pulse dots and ping classes (including `/live`). Stages derive solely from available backend artifacts, reports, critic results, iteration and terminal status. Manual stage browsing survives identical polls; a genuinely new backend milestone advances the displayed stage.
- Stage changes use a 150ms native View Transition crossfade where supported, with a 150ms opacity fade fallback. No scheduling timers are involved. Camera preset transitions last 350ms and run only on explicit control clicks. Initial framing is immediate, not an entrance animation. All orbit damping is disabled.
- Reworked the chrome around the supplied Etch screenshot: compact white breadcrumb header (`roboforge / runs / <serif prompt>`), quiet status text, functional Copy link / Build pack / Share buttons, separate grey-icon toolbar and centered 3D / Top / Ortho control, edge-to-edge pale `#eef4fb` viewport, top-left cube and circular tools, fixed 400px desktop parts panel (narrower responsive widths), Parts / This robot tabs, serif Parts title, Selected/group filter with actual component count and search, two-column grey component cards, bottom attribution, dark Ask input, and Settings / Snap grid 1.0 mm readouts. Step tape is a quiet manual navigation strip. Plan/critic detail lives in the right panel.
- `/live` uses the same header/workbench as `/run/[runId]` and has a still waiting screen. Backend polling behavior is preserved.

### Audit and verification

Read/audited all motion matches from `rg` over components, pages, and `useRun`: the only `useFrame` callbacks left are the explicitly triggered Build action, bounded trajectory playback, and user-requested camera transitions. No `setInterval`, `animate-*`, turntable increment, follow camera, or modulo-based replay remains. Only two opacity keyframes remain (150ms in/out). `setTimeout` remains exclusively in backend network polling (`useRun.ts` and `/live`), which is required for data-driven progression and is not a presentation timer.

`cd web && npx tsc --noEmit` passes. `git diff --check` passes. HTTP checks on the existing localhost:3001 server returned 200 for `/`, `/run/preview`, and `/live`. No tests, screenshots, backend edits, dependencies, or server restarts. Etch's board URL could not be opened by the browsing tool; layout matching used the owner's attached screenshots and explicit measurements. Pixel-exact visual equivalence has not been screenshot-verified.

### Commit status

Still on `main`. Local commits were attempted after passing TypeScript, but `git add` is denied with `.git/index.lock: Operation not permitted`; changes remain uncommitted for Claude's permitted shell. Intended commits:

1. `Make robot workspace still and match Etch board layout`
2. `Keep completed replays still and use brief stage crossfades`
3. `Document calm workspace motion audit and handoff`

Stage only the modified `web/` files plus `CODEX_NOTES.md`; the new file is `web/components/CADHeader.tsx`. No backend files belong to these changes. Run `cd web && npx tsc --noEmit` before committing.

## 2026-10-30 — Explore gallery, asset inspection, and Board view

Owner-approved implementation plan: (1) move the existing POST `/runs` prompt experience to `/build`, support `?prompt=`, and replace `/` plus `/explore` with the screenshot-based gallery; (2) add a static GLB asset workspace using the shared CAD chrome; (3) add the PCB-only Board preset, backend references/purposes, and static exploded leader lines; (4) compile, inspect routes, and commit only explicit task paths on main. No tests or backend edits.

Implemented:
- Explore uses the supplied Etch layout: blueprint paper, breadcrumb/header CTA, serif hero, feed counts, category chips, search, passed-sim toggle, Popular/Recent control, two-column cards (one on phones), phone banner and fail → fix → pass help popover. Feed polling continues every 5 seconds while warming, immediately displays available assets, aborts on unmount, and retries connection failures. No backend popularity metric currently exists: Popular uses optional popularity/stars when supplied, otherwise passed robots first and stable feed order; Recent uses `created_ms` (assets without dates keep stable order).
- Robot GIF thumbnails are drawn once into canvas to remain completely still. Missing thumbnails use an illustrative robot drawing. Empty robot feeds show three clearly marked example concepts with prefilled `/build` links. Robot licenses missing from the feed say “License not supplied”.
- `/build` retains the original form, sample 3D robot, phone number, POST payload and run navigation, with query-string prefill. `/asset/[id]` finds the asset in the gallery (including after warming), loads its GLB through useGLTF with +90° X rotation for Z-up, frames by dimensions, and shows attribution/source/license, dimensions in cm and a prefilled scene idea. Loading, missing-asset and GLB failure states are visible. No asset auto-rotation or animation.
- Fourth Board preset uses the assembly viewer even for completed runs. Only PCB/electronics/header/BOM primitives remain; camera frames the board. Backend `board.bom_lines` drive clickable projected DOM silkscreen labels, including actual backend U2–U3/U4/U5 references rather than assuming D/R/IMU names. Additional connector/passive BOM entries get selectable primitives and detail cards. Layout is illustrative carrier geometry, not imported PCB manufacturing geometry.
- Exploded mode uses fixed principal-axis offsets, grey drei Line leaders to assembled seats and projected DOM ref pills. Camera refits immediately when toggling exploded mode. The parts panel lists backend ref and purpose and retains quantity, mass, torque/RPM, price, vendor link and truthful live/catalog status. Unknown sourced roles can still be selected and inspected even without dedicated geometry.
- All simulation stages now open still on the last frame; Replay and the existing optional Build action remain explicit user actions. No new presentation timers, auto-orbit, or looping playback. DOM label projection follows user orbit only.

Validation: `cd web && npx tsc --noEmit` passed during implementation. `/explore` returned HTTP 200 on the already-running localhost:3001 server. Live `/gallery` was inspected read-only and matches the frontend types. Browser access host is unavailable and the public Etch URL could not be opened, so screenshot/WebGL comparison is not verified; references came from the supplied screenshots. No tests, dependencies, backend changes, or server restarts were made.

Concurrent changes exist in `.env.example`, backend files, `web/.env.local.example`, `web/components/AgentLane.tsx`, and `web/components/ConvexClientProvider.tsx`; these are not part of this task and must not be staged with it.

Final checks: TypeScript passes; `git diff --check` passes. HTTP 200 verified for `/`, `/explore`, `/build?prompt=…`, `/asset/sofa`, `/run/preview`, and an actual asset ID from the live gallery. The live feed returned 4 robots and 8 assets with warming false. These checks establish compilation and route availability, not browser interaction or visual equivalence.

Commit attempt: after the final passing `cd web && npx tsc --noEmit`, explicit-path `git add ... && git commit -m "Add Etch-style Explore gallery and static board inspection"` failed with `Unable to create .git/index.lock: Operation not permitted`. No files were staged by this attempt; changes remain uncommitted on main. Claude should rerun TypeScript, stage only CODEX_NOTES.md; web/app/{page.tsx,globals.css,build/page.tsx,explore/page.tsx,asset/[id]/page.tsx}; web/components/{Gallery,AssetWorkspace,CADHeader,Director,PartsPanel,Robot3D,Viewer3D,ViewportControls}.tsx; and web/lib/{gallery,partRefs,types}.ts, then commit with the above message and push. Preserve unrelated concurrent changes.

## QA findings — 2026-10-30 urgent asset + owner QA pass

Scope: changed only `web/` and this file. All scratch scripts, dependencies, API captures and image downloads are in `/tmp/rf-qa` (macOS canonical path `/private/tmp/rf-qa`). No test files added to the repository. No backend edits. No new idle animation or automatic replay; simulation remains still until Replay is explicitly clicked, then the existing bounded playback holds its last frame.

### Urgent asset investigation and fixes

- Requested repro: `http://localhost:3001/asset/Comau-robot-arm` and `https://roboforge-web.onrender.com/asset/Comau-robot-arm`. Both return HTTP 200 and link the global CSS. The linked CSS also returns 200 and contains Tailwind reset/utilities, `.font-sans`, `.flex`, `.rounded-full`, and `.segment` pill rules. The root layout imports globals; `./app/**/*.{ts,tsx}` includes the dynamic route, and `./components/**/*.{ts,tsx}` includes its workspace. No missing CSS module or layout was found. **The original unstyled browser appearance has not been reproduced or established as fixed.** Browser launch is blocked below; adding duplicate CSS imports or widening already-correct globs would not be evidence-based. Saved HTTP evidence: `/tmp/rf-qa/route-styles.json`, `local.css`, `public.css`, `local-asset.html`, `public-asset.html`.
- Both `/gallery` APIs supplied `Comau-robot-arm` at initial inspection, with `warming: false`. Exact ID lookup worked in the original component regression. Added query-slug fallback (`query.replace(/ /g, "-")`) to explicitly support the API ID convention. No speculative `/assets/prop` conversion is used to resolve pages.
- Gallery requests now bypass browser caching, time out after 10 seconds, validate feed arrays, retry errors and warming responses every 5 seconds, and cancel on unmount. Previously a hung request could leave the loading state forever. Warming remains a visible retry state until the backend finishes.
- Missing/unreachable assets now explain their state in the details panel as well as the viewport, with an Explore link. An existing asset without a GLB says “3D model unavailable” instead of incorrectly saying “Asset not found.” Slow GLBs have a static dimensioned wireframe box and loading label; the existing model error boundary remains. Unknown licenses no longer falsely default to CC-BY.
- Confirmed `/gallery` was missing from the frontend's same-origin backend rewrites (404 on both frontend hosts before change). Added it alongside `/runs` and `/artifacts`; local `/gallery` now returns 200. Explicit `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000` was already configured locally, so this proxy omission does not explain that local direct-backend case. Relative media URLs also now resolve when BACKEND is an empty string for same-origin deployments.

### Other web fixes

- Unknown run 404 now produces a clear “Robot not found” state with Explore navigation, rather than “Backend unreachable: Error: 404” plus a permanent connecting workspace. Transient failures retry calmly; requests time out and abort on route changes. Stale run state resets on ID changes.
- `/live` now reports unavailable feeds instead of silently looking healthy, cancels polling requests/timers, and shares run polling/error handling. Phone text wraps at narrow widths.
- Revision header shows `Revision: <modification>`; build and revision POSTs have bounded waits, and build failure no longer displays raw backend response HTML.
- At <=600px, workspace uses the full-width viewport with details below it rather than leaving a roughly 180px-wide model area beside a 210px panel. Toolbar presets no longer collide with left/right buttons. Details scroll/wrap; phone banner and board/exploded labels are at least 14px. These CSS changes are compiled but need visual browser verification.
- Explore deduplicates asset cards by GLB URL (and robot cards by ID), with category/asset counts matching the displayed feed. Different robot runs with the same prompt remain distinct. Asset aliases remain directly resolvable.

### Executed checks and matrix coverage

1. **Explore, local and public:** HTTP 200 + linked CSS rules verified. All initial gallery asset thumbnail/GLB URLs HEAD 200 (12 local checks, 14 public checks). Downloaded and visually inspected the public Comau thumbnail: recognizable red robot on a light background, not a black square. Scratch component checks exercise category selection, Popular/Recent state, passed-only filtering, unique cards, and asset/robot link targets using captured local feed data. Actual browser console, card clicks, computed styling, and full thumbnail grid remain unverified.
2. **Build:** route/CSS 200 on both hosts. Component test verifies `?prompt=QA%20rover`, exact POST payload and navigation to `/run/built`. Actual API POSTs executed on both backends (IDs below); browser submission remains unverified.
3. **Fresh run:** actual local run `ef7a0c2a-a2ae-4b26-981b-88b82cc260b7` advanced from planning to building, sourced parts/body/board/brain, failed attempts, and passed on attempt 3 (poll log reaches terminal state at approximately 63 seconds of nominal poll delay, excluding HTTP time). Parts contain ref, purpose and truthful firecrawl/catalog sources; e.g. U is firecrawl at $4, M1-M2 catalog at $3.90. Component tests verify stage tape grows only with supplied artifacts, manual Board selection, and Critic review on a failed attempt. HEAD 200 for `it3/chassis.stl`, `it1/pcb_render.png`, `it3/controller.py`, `it3/robot.mjcf`, `it3/run.gif`, `it3/trajectory.json`. Public fresh-run verification was interrupted by the backend losing the run (below). WebGL/PCB geometry, leader lines, presets' actual camera positions, hover, click-select, replay-once/hold, and browser downloads remain unverified.
4. **Revision:** local POST `{ "prompt": "make it smaller", "source": "web", "parent_run_id": "ef7a0c2a-a2ae-4b26-981b-88b82cc260b7" }` returned 200 and created `b807a4a3-bc53-425e-ada2-098a26096cfc`; it subsequently passed. GET confirms parent ID and modification. Component tests verify Ask submission/navigation and revision header. Equivalent public revision returned 404 because parent run had vanished.
5. **Live:** HTTP/CSS 200 on both hosts. Component test starts idle, changes the supplied backend feed to first then second run, and verifies header switches on each 1200ms polling cycle (checks at ~1300ms). Offline feed shows calm error. End-to-end public/local projector switching after actual POST remains browser-blocked; do not claim measured two-second live latency.
6. **390px mobile:** responsive fix and font rule inspection only. No browser screenshot, actual horizontal-overflow measurement, or visual usability pass was possible.
7. **Robustness:** component regressions verify warming → resolved asset, failed fetch → calm error in details, hung fetch → timeout message, missing asset, asset without GLB, unknown run, and live offline state. Both APIs return 404 for `/runs/qa-definitely-missing`. Slow GLB placeholder is implemented but requires WebGL visual verification.

Scratch suite `/tmp/rf-qa/components.cjs` bundles actual web components with esbuild into jsdom, stubbing Next navigation and the R3F canvas boundary; it is **not a browser/WebGL test**. Fifteen checks pass; results in `/tmp/rf-qa/components-results.txt`. Tests were observed failing before asset/error/revision and duplicate-card fixes. Supporting scripts: `/tmp/rf-qa/api-qa.cjs`, `api-artifacts.py`, `routes.py`; captures: `api-qa.json`, `api-artifacts.json`, `local-fresh-run.json`, `local-revision.json`, `public-fresh-run.json`, `route-styles.json`.

### Backend issues (report only)

- **Public run disappears during execution.** URL: `POST https://roboforge-backend.onrender.com/runs`. Payload: `{ "prompt": "a small two-wheel rover that drives a 2 metre loop around obstacles", "source": "web" }`. Observed HTTP 200 with `run_id=8762dfde-2ab9-43f0-b65d-021a20484343`; GET initially returned planning, then building with parts, then `GET https://roboforge-backend.onrender.com/runs/8762dfde-2ab9-43f0-b65d-021a20484343` returned HTTP 404 `{"detail":"unknown run"}`. Expected: run remains accessible through terminal verdict and artifact downloads, including across deployments/restarts. Cause not established; concurrent deployment/restart is possible. Public revision POST with that parent ID returns 404 as well. An ID returned by public `/runs?limit=3`, `246b1adf-1330-49a7-96d0-432e4ff636ce`, also returned unknown run when fetched later. Capture timestamps/sequence are in `api-qa.json` and `public-runs.json`.
- **Asset search metadata aliases/mismatches.** `GET http://localhost:8000/gallery`: `Robotiq-2F-85-gripper` and `Robotiq-hand-e-gripper` share `/artifacts/assets/robotiq-hand-e-5cc34c0c72e3/prop.glb` and the same source; public initial feed labels that same Hand-E model `Robotiq-2F-140-gripper`. Local “robot end effector suction gripper” resolves to OnRobot 2FG14 source/model. Expected titles/search matches accurately identify the supplied model, or explicitly describe a fallback. Frontend dedup prevents repeat model cards but cannot correct source identity. Exact feed captures: `local-gallery.json`, `public-gallery.json`.

### Browser/screenshots blocker and commit handoff

Installed Playwright and Chromium in scratch only, with npm cache and browser downloads also under `/tmp/rf-qa`. Both installed Chrome and downloaded Chromium headless fail to launch in this session. Chromium logs: `FATAL: ... mach_port_rendezvous_mac.cc:159 ... bootstrap_check_in ... Permission denied (1100)`; Playwright reports SIGABRT/EPERM. Connected browser fallback reports “The browser access host is unavailable.” **No browser console or screenshot was captured.** `/tmp/rf-qa/baseline.cjs` is ready to run from a permitted shell; `/tmp/rf-qa/browser-launch.log` has the failure. Intended screenshot paths include `/tmp/rf-qa/local-asset-before.png`, `public-asset-before.png`, `local-explore-before.png`, and `public-explore-before.png`; these do not exist. Existing `/tmp/rf-qa/local-comau-thumbnail.png` and `public-comau-thumbnail.png` are downloaded API thumbnails, not screenshots.

`cd web && npx tsc --noEmit` passed before each of three commit attempts. An earlier check raced a regeneration of `.next/types` and failed on missing generated files; retry passed without source changes. All three `git add ... && git commit ...` attempts were blocked by `.git/index.lock: Operation not permitted`. During QA, another workspace participant committed the first ten web fixes as `1fd4c01` (`QA fixes: asset page details and not-found states, revision header, build/live polish`); observed on `main`. This agent did not push. Remaining intended small commits: `Deduplicate gallery asset aliases` (`web/components/Gallery.tsx`) and `Document asset and run QA findings` (this file). Claude should run TypeScript before each commit and push, then rerun the blocked browser matrix. No backend paths or scratch test files belong in those commits.
