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
