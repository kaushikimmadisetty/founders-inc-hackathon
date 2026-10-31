# RoboForge — text to robot

Text a robot idea from your phone. Get back a robot designed from real parts, tested in physics simulation, ready to manufacture (BOM, PCB, printable chassis), plus a GIF of it doing the job.

Thesis: robotics is bottlenecked by evaluation, not model scale. Every generated robot must pass a MuJoCo sim gate before it ships. Failures route back to the agent responsible, which revises the design, and the loop reruns (max 3 attempts). The visible fail → fix → pass loop is the demo.

See `PRIOR_WORK.md` for the disclosure of pre-existing work.

## Architecture

```
iMessage (Photon) / web prompt
   → Planner (Claude) → RobotSpec (one of 3 templates + task)
   → Parts (Claude + Firecrawl, catalog fallback)
   → Body (CadQuery chassis, STL/STEP) ‖ Board (HeyPCB, fallback render) ‖ Brain (sandboxed controller)
   → Assembler → MJCF with real masses / motor limits
   → Sim gate (MuJoCo headless) → SimReport
   → Critic routes failure → one agent revises → rerun
   → Build pack + GIF + live 3D replay
```

Templates: `diff_drive_rover`, `mecanum_base`, `mecanum_arm`. Tasks: `drive_loop`, `fetch_under_obstacle`, `ramp_climb`, `pick_and_place`.

## Repo layout

```
backend/   FastAPI + orchestrator + agents + MuJoCo sim (Python 3.11)
web/       Next.js app (landing, /run/[runId] live screen) + Convex functions
```

## Run locally

Backend:

```bash
cd backend && uv venv -p 3.11 .venv && uv pip install -p .venv/bin/python -r requirements.txt
```

```bash
cd backend && cp ../.env.example ../.env   # fill in keys; everything has a fallback when blank
```

```bash
cd backend && .venv/bin/uvicorn app:app --reload --port 8000
```

Frontend:

```bash
cd web && npm install && cp .env.local.example .env.local && npm run dev
```

Convex (optional, enables live agent lanes): `cd web && npx convex dev`, then put the deployment URL in both `.env` (`CONVEX_URL`) and `web/.env.local` (`NEXT_PUBLIC_CONVEX_URL`). Without Convex the run page polls the backend instead.

Tests (offline, no keys needed):

```bash
cd backend && .venv/bin/python -m pytest -q
```

## Fallbacks

Every external dependency degrades gracefully: no Anthropic key → heuristic planner / catalog parts / fallback controllers; no Firecrawl → catalog; no HeyPCB → reference carrier board rendered locally and marked `provider: fallback`; no Photon → console adapter and the web prompt box; no Convex → backend polling. `DEMO_SCRIPTED_FAIL=1` (default) makes attempt 1 of `fetch_under_obstacle` too tall so the fail → fix → pass loop is visible.

## Simulation notes

- MJCF is generated from Jinja templates with primitives only, so the browser mirrors geometry without meshes.
- Motor torque / speed limits come from the selected motor's stall torque and RPM. Body masses come from the parts list.
- Mecanum bases are simulated as a force-limited planar joint (x, y, yaw) with kinematic wheel mapping, not rolling rollers. Documented simplification.
- Rendering: EGL on Linux, CGL on macOS. If no GL context is available a trajectory plot GIF is produced instead.

## Deploy

- Frontend: Vercel (`web/`). Set `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_PHOTON_NUMBER`.
- Backend: any Linux box with Python 3.11 (`backend/Dockerfile`). Set `MUJOCO_GL=egl` and `PUBLIC_BASE_URL` / `BACKEND_BASE_URL`.

## Team / event

Night Hack, San Francisco. Submission details live in `SUBMISSION.md` (to be written before the deadline).
