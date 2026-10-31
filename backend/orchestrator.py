"""planner -> [parts, body, board, brain] in parallel -> assembler -> sim gate -> critic loop (max 3)."""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from pathlib import Path

import config
from adapters.convex_client import convex
from adapters.photon_adapter import get_messaging
from agents import board as board_agent, body as body_agent, brain as brain_agent, critic as critic_agent, parts as parts_agent, planner
from models import RunState, SimReport
from sim import assembler, runner

log = logging.getLogger("orchestrator")
TEMPLATE_LABEL = {"diff_drive_rover": "2-wheel rover with caster", "mecanum_base": "4-wheel mecanum base",
                  "mecanum_arm": "mecanum base with 3-DOF arm and gripper"}
RUNS: dict[str, RunState] = {}
LAST_RUN_BY_PHONE: dict[str, str] = {}   # handle -> most recent run_id, so a follow-up text revises that robot
MODIFICATION_WINDOW_S = 45 * 60


def url_for(p: Path) -> str:
    rel = Path(p).resolve().relative_to(config.STORAGE_DIR.resolve())
    return config.artifact_url(str(rel).replace("\\", "/"))


class Run:
    def __init__(self, state: RunState):
        self.s = state
        self.dir = config.STORAGE_DIR / state.run_id
        self.msg = get_messaging()

    async def ev(self, agent: str, kind: str, message: str, payload=None):
        log.info("[%s][it%d] %s/%s: %s", self.s.run_id[:8], self.s.iteration, agent, kind, message)
        await convex.event(self.s.run_id, agent, kind, message, payload, self.s.iteration)

    def persist(self):
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            (self.dir / "state.json").write_text(self.s.model_dump_json())
        except Exception as e:
            log.warning("persist failed: %s", e)

    async def status(self, st: str):
        self.s.status = st
        self.persist()
        await convex.upsert_run(runId=self.s.run_id, prompt=self.s.prompt, source=self.s.source, status=st,
                                iteration=self.s.iteration, specJson=self.s.spec.model_dump_json() if self.s.spec else None,
                                createdAt=int(time.time() * 1000))

    async def text(self, body: str, media: str | None = None):
        if self.s.phone:
            if media:
                await self.msg.send_media(self.s.phone, media, body)
            else:
                await self.msg.send_text(self.s.phone, body)

    def link(self) -> str:
        return f"{config.PUBLIC_BASE_URL}/run/{self.s.run_id}"

    def pass_summary(self, rep: SimReport) -> str:
        sp, parts, body = self.s.spec, self.s.parts, self.s.body
        m = rep.metrics
        top = [p for p in parts.parts if p.role in ("drive_motor", "mcu", "battery", "camera", "servo")]
        lines = [f"Passed in simulation on attempt {self.s.iteration} ({m.time_s:.1f} s, {sp.task.description}).",
                 f"{TEMPLATE_LABEL[sp.template]}, {body.dims_mm[0]:.0f}x{body.dims_mm[1]:.0f}x{body.dims_mm[2]:.0f} mm chassis, {m.total_mass_kg*1000:.0f} g.",
                 "Key parts: " + "; ".join(f"{p.qty}x {p.name}" for p in top[:4]) + ".",
                 f"BOM ${parts.total_usd:.2f} for {sum(p.qty for p in parts.parts)} parts.",
                 f"Build pack (STL, PCB, MJCF, controller): {self.link()}"]
        return "\n".join(lines)

    def it_dir(self) -> Path:
        d = self.dir / f"it{self.s.iteration}"
        d.mkdir(parents=True, exist_ok=True)
        return d

    # ---- stages ---------------------------------------------------------
    async def do_parts(self, revision=""):
        await self.ev("parts", "start", "Selecting real components" + (" (revising)" if revision else ""))
        self.s.parts = await parts_agent.select_parts(self.s.spec, revision, self.s.parts)
        for p in self.s.parts.parts:
            await self.ev("parts", "progress", f"{p.qty}x {p.name} ${p.unit_price_usd:.2f}", p.model_dump())
        self.persist()
        await self.ev("parts", "progress", "Checking live prices and stock on the vendors' pages (Firecrawl)")

        async def on_live(p, live, plausible):
            msg = f"{p.name}: ${live['price_usd']:.2f} at {live.get('vendor')}" + ("" if plausible else " (ignored, implausible)")
            if live.get("in_stock") is False:
                msg += " — OUT OF STOCK"
            await self.ev("parts", "progress", msg, {"role": p.role, "live": live})

        self.s.parts = await parts_agent.verify_live(self.s.parts, on_live)
        live_n = sum(1 for p in self.s.parts.parts if p.source == "firecrawl")
        await self.ev("parts", "done", f"{len(self.s.parts.parts)} parts, ${self.s.parts.total_usd:.2f}, {self.s.parts.total_mass_g:.0f} g"
                      + (f", {live_n} prices verified live" if live_n else ", catalog prices"), self.s.parts.model_dump())

    async def do_board(self, revision=""):
        await self.ev("board", "start", "Designing carrier PCB")
        self.s.board = await board_agent.design_board(self.s.spec, self.s.parts, self.it_dir(), url_for, revision)
        b = self.s.board
        await convex.artifact(self.s.run_id, "pcb_render", b.render_png_url or "", self.s.iteration, "PCB render")
        if b.gerbers_zip_url:
            await convex.artifact(self.s.run_id, "gerbers", b.gerbers_zip_url, self.s.iteration, "Gerbers")
        await self.ev("board", "done", f"{b.outline_mm[0]:.0f}x{b.outline_mm[1]:.0f} mm, {len(b.bom_lines)} BOM lines, provider={b.provider}", b.model_dump())

    async def do_body(self, revision=""):
        await self.ev("body", "start", "Generating parametric chassis" + (" (revising)" if revision else ""))
        if config.DEMO_SCRIPTED_FAIL and self.s.iteration == 1 and self.s.spec.task.id == "fetch_under_obstacle" and not revision:
            # scripted demo: first design ignores the clearance constraint
            self.s.spec.params.chassis_height_mm = max(self.s.spec.params.chassis_height_mm, 70)
        outline = self.s.board.outline_mm if self.s.board else (80, 60)
        self.s.body = await body_agent.design_body(self.s.spec, self.s.parts, outline, self.it_dir(), url_for, revision)
        b = self.s.body
        await convex.artifact(self.s.run_id, "stl", b.chassis_stl_url or "", self.s.iteration, "Chassis STL")
        if b.chassis_step_url:
            await convex.artifact(self.s.run_id, "step", b.chassis_step_url, self.s.iteration, "Chassis STEP")
        await self.ev("body", "done", f"chassis {b.dims_mm[0]:.0f}x{b.dims_mm[1]:.0f}x{b.dims_mm[2]:.0f} mm, {b.chassis_mass_g:.0f} g", b.model_dump())

    async def do_brain(self, robot_info: dict, revision=""):
        await self.ev("brain", "start", "Writing controller" + (" (revising)" if revision else ""))
        prev = self.s.brain.source if self.s.brain else None
        self.s.brain = await brain_agent.write_controller(self.s.spec, robot_info, self.it_dir(), url_for, revision, prev)
        await convex.artifact(self.s.run_id, "controller", self.s.brain.controller_url or "", self.s.iteration, "controller.py")
        await self.ev("brain", "done", f"controller ({self.s.brain.origin}), static check: {self.s.brain.static_check_msg}",
                      {"source": self.s.brain.source[:1500], "origin": self.s.brain.origin})

    async def do_sim(self) -> SimReport:
        await self.ev("assembler", "start", "Assembling MJCF from real part masses and motor limits")
        xml, info = assembler.assemble(self.s.spec, self.s.parts, self.s.body)
        await self.ev("assembler", "done", f"mass {info['total_mass_kg']:.2f} kg, height {info['total_height_mm']:.0f} mm, wheel max {info['max_wheel_rad_s']:.1f} rad/s", info)
        await self.status("simulating")
        await self.ev("sim", "start", f"Running {self.s.spec.task.id} in MuJoCo (attempt {self.s.iteration})")
        loop = asyncio.get_running_loop()
        rep = await loop.run_in_executor(None, lambda: runner.run(xml, self.s.brain.source, info, self.s.iteration, self.it_dir(), url_for))
        rep.metrics.total_cost_usd = self.s.parts.total_usd
        self.s.reports.append(rep)
        await convex.artifact(self.s.run_id, "mjcf", rep.mjcf_url or "", self.s.iteration, "robot.mjcf")
        if rep.gif_url:
            await convex.artifact(self.s.run_id, "gif", rep.gif_url, self.s.iteration, "sim GIF")
        if rep.trajectory_url:
            await convex.artifact(self.s.run_id, "trajectory", rep.trajectory_url, self.s.iteration, "trajectory")
        await convex.sim_report(self.s.run_id, {"iteration": rep.iteration, "passed": rep.passed, "failureClass": rep.failure_class,
                                                "failureDetail": rep.failure_detail, "routeTo": rep.route_to,
                                                "metricsJson": rep.metrics.model_dump_json(), "gifUrl": rep.gif_url,
                                                "trajectoryUrl": rep.trajectory_url})
        await self.ev("sim", "done" if rep.passed else "error",
                      "PASSED" if rep.passed else f"FAILED: {rep.failure_detail}", rep.model_dump())
        self.persist()
        return rep

    # ---- main loop ------------------------------------------------------
    async def execute(self):
        try:
            await self.status("planning")
            parent = RUNS.get(self.s.parent_run_id) if self.s.parent_run_id else None
            if parent and self.s.modification:
                await self.ev("planner", "start", f"Revising previous design: {self.s.modification}")
                await self.text(f"Got it: \"{self.s.modification}\". Revising your robot and re-testing it.\nWatch live: {self.link()}")
            else:
                await self.ev("planner", "start", "Reading your idea")
                await self.text(f"On it. Designing your robot and testing it in physics simulation before anything gets built.\nWatch live: {self.link()}")
            self.s.spec = await planner.plan(self.s.run_id, self.s.prompt, parent.spec if parent else None, self.s.modification)
            sp = self.s.spec
            await self.ev("planner", "done", f"{sp.template} / {sp.task.id}: {sp.rationale}", sp.model_dump())
            await self.text(f"Plan: {TEMPLATE_LABEL[sp.template]}. Test: {sp.task.description}. Budget ${sp.constraints.budget_usd:.0f}."
                            + (f" {sp.rationale}" if "closest" in sp.rationale.lower() or "map" in sp.rationale.lower() else ""))

            self.s.iteration = 1
            await self.status("building")
            # parts first (board + body need dims), then board/body/brain fan out.
            # On a revision run the user's change request steers parts and body too.
            mod = self.s.modification or ""
            await self.do_parts(mod)
            await asyncio.gather(self.do_board(mod), self.do_body(mod))
            _, info = assembler.assemble(self.s.spec, self.s.parts, self.s.body)
            await self.do_brain(info)

            while True:
                rep = await self.do_sim()
                if rep.passed:
                    await self.status("passed")
                    await self.text(self.pass_summary(rep), rep.gif_url)
                    if self.s.board and self.s.board.render_png_url:
                        await self.text(f"Carrier PCB ({self.s.board.outline_mm[0]:.0f}x{self.s.board.outline_mm[1]:.0f} mm, {len(self.s.board.bom_lines)} parts) and printable chassis are in the build pack.\n"
                                        f"Reply with a change (\"make it cheaper\", \"add a camera\", \"smaller\") and I'll redesign and re-test.", self.s.board.render_png_url)
                    return
                if self.s.iteration >= config.MAX_ITERATIONS:
                    await self.status("failed")
                    await self.text(f"Closest design after {self.s.iteration} attempts still fails: {rep.failure_detail}.\nBOM ${self.s.parts.total_usd:.0f}. Details and build pack: {self.link()}\nReply with a change and I'll try again.", rep.gif_url)
                    return
                await self.status("revising")
                await self.ev("critic", "start", "Diagnosing failure")
                verdict = await critic_agent.critique(self.s, rep)
                self.s.critic_history.append(verdict)
                await self.ev("critic", "done", verdict.summary, verdict.model_dump())
                await self.text(f"Attempt {self.s.iteration} failed in sim: {verdict.summary}")

                self.s.iteration += 1
                await self.status("building")
                r = verdict.instruction
                if verdict.route_to == "parts":
                    await self.do_parts(r)
                    await self.do_body(r)  # parts changed, chassis refits
                elif verdict.route_to == "body":
                    if "camera" in r.lower() or "low profile" in r.lower():
                        await self.do_parts(r)
                    await self.do_body(r)
                elif verdict.route_to == "board":
                    await self.do_board(r)
                    await self.do_body()
                elif verdict.route_to == "brain":
                    _, info = assembler.assemble(self.s.spec, self.s.parts, self.s.body)
                    await self.do_brain(info, r)
                if verdict.route_to != "brain":
                    _, info = assembler.assemble(self.s.spec, self.s.parts, self.s.body)
                    if self.s.brain.origin == "fallback":
                        await self.do_brain(info)
        except Exception as e:
            log.exception("run failed")
            self.s.error = str(e)
            await self.status("failed")
            await self.ev("sim", "error", f"Run crashed: {e}")


def recent_runs(limit: int = 10) -> list[dict]:
    """Newest first. Used by the /live kiosk screen to jump to whatever just came in."""
    items = sorted(RUNS.values(), key=lambda r: _created_ms.get(r.run_id, 0), reverse=True)[:limit]
    return [{"run_id": r.run_id, "prompt": r.prompt, "status": r.status, "source": r.source, "iteration": r.iteration,
             "created_ms": _created_ms.get(r.run_id, 0), "modification": r.modification} for r in items]


def load_run(run_id: str) -> RunState | None:
    """Runs survive backend restarts via storage/<run_id>/state.json."""
    if run_id in RUNS:
        return RUNS[run_id]
    p = config.STORAGE_DIR / run_id / "state.json"
    if p.exists():
        try:
            st = RunState.model_validate_json(p.read_text())
            if st.status not in ("passed", "failed"):
                st.status, st.error = "failed", "backend restarted mid-run"
            RUNS[run_id] = st
            return st
        except Exception as e:
            log.warning("could not load %s: %s", run_id, e)
    return None


def start_run(prompt: str, source: str = "web", phone: str | None = None, parent_run_id: str | None = None) -> RunState:
    """New run, or a revision of `parent_run_id` where `prompt` is the change request."""
    parent = RUNS.get(parent_run_id) if parent_run_id else None
    if parent:
        state = RunState(run_id=str(uuid.uuid4()), prompt=f"{parent.prompt} (revised: {prompt})", source=source, phone=phone,
                         parent_run_id=parent.run_id, modification=prompt)
    else:
        state = RunState(run_id=str(uuid.uuid4()), prompt=prompt, source=source, phone=phone)
    RUNS[state.run_id] = state
    _created_ms[state.run_id] = time.time() * 1000
    if phone:
        LAST_RUN_BY_PHONE[phone] = state.run_id
    asyncio.create_task(Run(state).execute())
    return state


NEW_IDEA_MARKERS = ("robot", "rover", "bot ", "build me", "make me", "i want a", "new:", "design a", "something that")


def classify_inbound(phone: str, text: str) -> str | None:
    """Return the parent run_id if this text reads as a tweak to the sender's recent robot, else None."""
    rid = LAST_RUN_BY_PHONE.get(phone)
    if not rid or rid not in RUNS:
        return None
    parent = RUNS[rid]
    t = text.lower().strip()
    if t.startswith("new") or any(k in t for k in NEW_IDEA_MARKERS):
        return None
    if parent.status not in ("passed", "failed"):
        return None  # still running; treat as a fresh idea rather than interrupt
    if time.time() * 1000 - _created_ms.get(rid, 0) > MODIFICATION_WINDOW_S * 1000:
        return None
    return rid


_created_ms: dict[str, float] = {}


def restore_runs() -> None:
    for p in sorted(config.STORAGE_DIR.glob("*/state.json")):
        rid = p.parent.name
        if rid in RUNS:
            continue
        try:
            st = RunState.model_validate_json(p.read_text())
            if st.status not in ("passed", "failed"):
                st.status, st.error = "failed", "backend restarted mid-run"
            RUNS[rid] = st
            _created_ms[rid] = p.stat().st_mtime * 1000
        except Exception as e:
            log.warning("could not restore %s: %s", rid, e)


async def run_sync(prompt: str) -> RunState:
    state = RunState(run_id=str(uuid.uuid4()), prompt=prompt, source="web")
    RUNS[state.run_id] = state
    await Run(state).execute()
    return state
