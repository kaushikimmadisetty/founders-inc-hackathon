"""Offline tests: no API keys needed. Exercise heuristic planner, catalog parts,
chassis STL, assembler, sim runner with fallback controllers."""
import asyncio
from pathlib import Path

import pytest

import config
from agents import critic, parts as parts_agent, planner
from cad.chassis import build_chassis
from models import PartsSelection, RobotSpec
from sim import assembler, runner
from sim.controllers_fallback import load_source
from sim.sandbox import static_check


def _url(p: Path) -> str:
    return f"file://{p}"


@pytest.mark.parametrize("prompt,template,task", [
    ("a robot that fetches my keys from under the couch", "mecanum_arm", "fetch_under_obstacle"),
    ("a little rover that patrols my apartment", "diff_drive_rover", "drive_loop"),
    ("something that can climb the ramp to my porch", "diff_drive_rover", "ramp_climb"),
])
def test_heuristic_planner(prompt, template, task):
    spec = planner.heuristic_plan("r1", prompt)
    assert spec.template == template and spec.task.id == task


def test_catalog_parts_cover_roles():
    spec = planner.heuristic_plan("r1", "fetch keys from under the couch")
    sel = parts_agent.catalog_pick(spec)
    roles = {p.role for p in sel.parts}
    assert {"mcu", "drive_motor", "motor_driver", "battery", "regulator", "imu", "wheel", "servo", "gripper", "camera"} <= roles
    assert sel.total_usd > 0 and sel.by_role("drive_motor").qty == 4


def test_low_profile_revision_swaps_camera():
    spec = planner.heuristic_plan("r1", "fetch keys from under the couch")
    tall = parts_agent.catalog_pick(spec).by_role("camera")
    low = parts_agent.catalog_pick(spec, "use a low profile camera").by_role("camera")
    assert low.dims_mm[2] < tall.dims_mm[2]


def test_fallback_controllers_pass_static_check():
    for t in ("diff_drive_rover", "mecanum_base", "mecanum_arm"):
        ok, msg = static_check(load_source(t))
        assert ok, msg


def test_static_check_rejects_os():
    ok, msg = static_check("import os\nclass Controller:\n  def __init__(self,i):pass\n  def step(self,o,t):return {}")
    assert not ok and "forbidden import" in msg


def _build(spec: RobotSpec, tmp: Path, revision=""):
    parts = parts_agent.catalog_pick(spec, revision)
    body = build_chassis(spec, parts.by_role("wheel"), parts.by_role("battery"), parts.by_role("drive_motor"), (80, 60), tmp, _url)
    return parts, body


def test_chassis_stl_written(tmp_path):
    spec = planner.heuristic_plan("r1", "patrol rover")
    _, body = _build(spec, tmp_path)
    assert (tmp_path / "chassis.stl").stat().st_size > 84


def test_diff_drive_loop_passes(tmp_path):
    spec = planner.heuristic_plan("r1", "a little rover that drives around")
    parts, body = _build(spec, tmp_path)
    xml, info = assembler.assemble(spec, parts, body)
    rep = runner.run(xml, load_source(spec.template), info, 1, tmp_path, _url, make_gif=False)
    assert rep.failure_class in ("none", "task_timeout", "missed_target"), rep.failure_detail
    assert (tmp_path / "trajectory.json").exists()


def test_fetch_under_couch_fail_then_pass(tmp_path):
    """The demo loop: tall first design collides with couch, critic routes to body, shrunk design passes."""
    spec = planner.heuristic_plan("r1", "a robot that fetches my keys from under the couch")
    spec.params.chassis_height_mm = 70  # scripted attempt 1
    parts, body = _build(spec, tmp_path / "it1")
    xml, info = assembler.assemble(spec, parts, body)
    rep1 = runner.run(xml, load_source(spec.template), info, 1, tmp_path / "it1", _url, make_gif=False)
    assert rep1.failure_class == "geometry_collision", rep1
    assert rep1.route_to == "body"

    from models import RunState
    st = RunState(run_id="r1", prompt="x", source="web", spec=spec, parts=parts, body=body)
    verdict = critic.heuristic_verdict(st, rep1)
    assert verdict.route_to == "body" and "100" in verdict.summary

    from agents.body import heuristic_decision
    dec = heuristic_decision(spec, parts_agent.catalog_pick(spec, verdict.instruction), verdict.instruction)
    spec.params.chassis_height_mm = dec.chassis_height_mm
    parts2, body2 = _build(spec, tmp_path / "it2", verdict.instruction)
    xml2, info2 = assembler.assemble(spec, parts2, body2)
    assert info2["total_height_mm"] < 100
    rep2 = runner.run(xml2, load_source(spec.template), info2, 2, tmp_path / "it2", _url, make_gif=False)
    assert rep2.failure_class != "geometry_collision", rep2.failure_detail
