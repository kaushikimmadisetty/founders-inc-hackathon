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
RUNS: dict[str, RunState] = {}


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

    async def status(self, st: str):
        self.s.status = st
        await convex.upsert_run(runId=self.s.run_id, prompt=self.s.prompt, source=self.s.source, status=st,
                                iteration=self.s.iteration, specJson=self.s.spec.model_dump_json() if self.s.spec else None,
                                createdAt=int(time.time() * 1000))

    async def text(self, body: str, media: str | None = None):
        if self.s.phone:
            if media:
                await self.msg.send_media(self.s.phone, media, body)
            else:
                await self.msg.send_text(self.s.phone, body)

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
        await self.ev("parts", "done", f"{len(self.s.parts.parts)} parts, ${self.s.parts.total_usd:.2f}, {self.s.parts.total_mass_g:.0f} g", self.s.parts.model_dump())

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
        return rep

    # ---- main loop ------------------------------------------------------
    async def execute(self):
        try:
            await self.status("planning")
            await self.ev("planner", "start", "Reading your idea")
            self.s.spec = await planner.plan(self.s.run_id, self.s.prompt)
            await self.ev("planner", "done", f"{self.s.spec.template} / {self.s.spec.task.id}: {self.s.spec.rationale}", self.s.spec.model_dump())
            await self.text(f"On it. Designing a {self.s.spec.template.replace('_', ' ')} for: {self.s.prompt}\nWatch live: {config.PUBLIC_BASE_URL}/run/{self.s.run_id}")

            self.s.iteration = 1
            await self.status("building")
            # parts first (board + body need dims), then board/body/brain fan out
            await self.do_parts()
            await asyncio.gather(self.do_board(), self.do_body())
            _, info = assembler.assemble(self.s.spec, self.s.parts, self.s.body)
            await self.do_brain(info)

            while True:
                rep = await self.do_sim()
                if rep.passed:
                    await self.status("passed")
                    await self.text(f"Passed in sim on attempt {self.s.iteration}. BOM ${self.s.parts.total_usd:.0f}. Build pack: {config.PUBLIC_BASE_URL}/run/{self.s.run_id}", rep.gif_url)
                    return
                if self.s.iteration >= config.MAX_ITERATIONS:
                    await self.status("failed")
                    await self.text(f"Closest design after {self.s.iteration} attempts still fails: {rep.failure_detail}. Details: {config.PUBLIC_BASE_URL}/run/{self.s.run_id}", rep.gif_url)
                    return
                await self.status("revising")
                await self.ev("critic", "start", "Diagnosing failure")
                verdict = await critic_agent.critique(self.s, rep)
                self.s.critic_history.append(verdict)
                await self.ev("critic", "done", verdict.summary, verdict.model_dump())
                await self.text(f"Attempt {self.s.iteration} failed: {verdict.summary} Fixing.")

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


def start_run(prompt: str, source: str = "web", phone: str | None = None) -> RunState:
    state = RunState(run_id=str(uuid.uuid4()), prompt=prompt, source=source, phone=phone)
    RUNS[state.run_id] = state
    asyncio.create_task(Run(state).execute())
    return state


async def run_sync(prompt: str) -> RunState:
    state = RunState(run_id=str(uuid.uuid4()), prompt=prompt, source="web")
    RUNS[state.run_id] = state
    await Run(state).execute()
    return state
