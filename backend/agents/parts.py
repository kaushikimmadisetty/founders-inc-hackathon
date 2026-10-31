from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

import config
import llm
from adapters import firecrawl_client as fc
from adapters.firecrawl_client import search_parts
from models import Part, PartsSelection, RobotSpec

log = logging.getLogger("agent.parts")
CATALOG: list[dict] = json.loads((Path(__file__).parent.parent / "data" / "parts_catalog.json").read_text())


def required_roles(spec: RobotSpec) -> dict[str, int]:
    n = spec.wheel_count
    roles = {"mcu": 1, "drive_motor": n, "motor_driver": max(1, n // 2), "battery": 1, "regulator": 1, "imu": 1, "wheel": n}
    if spec.template == "diff_drive_rover":
        roles["caster"] = 1
    if spec.template == "mecanum_arm":
        roles["servo"] = 3
        roles["gripper"] = 1
    if "camera" in spec.sensors:
        roles["camera"] = 1
    if any(s.startswith("tof") for s in spec.sensors):
        roles["tof"] = 1
    return roles


REF_PREFIX = {"mcu": "U", "drive_motor": "M", "motor_driver": "D", "battery": "B", "regulator": "R", "imu": "IMU",
              "camera": "CAM", "tof": "TOF", "servo": "S", "wheel": "W", "caster": "C", "gripper": "G"}


def annotate(sel: PartsSelection, spec: RobotSpec) -> PartsSelection:
    """Give every part a designator and a one-sentence job description for the inspector."""
    n = spec.wheel_count
    tmpl = spec.template
    for p in sel.parts:
        pre = REF_PREFIX.get(p.role, p.role[:3].upper())
        p.ref = pre if p.qty == 1 else f"{pre}1-{pre}{p.qty}"
        t = f" at {p.stall_torque_nm} N·m stall, {p.rated_rpm} rpm" if p.stall_torque_nm and p.rated_rpm else ""
        if p.role == "drive_motor":
            p.purpose = (f"Drives the {'left and right' if n == 2 else 'four mecanum'} wheels{t}. "
                         f"{'Differential steering: speed difference turns the robot.' if n == 2 else 'Each wheel is driven independently so the base can strafe sideways.'}")
        elif p.role == "wheel":
            p.purpose = ("Mecanum wheel: angled rollers let the base move in any direction without turning." if "mecanum" in p.name.lower()
                         else f"Drive wheel, Ø{p.dims_mm[0]:.0f} mm. Sets top speed together with the motor rpm.")
        elif p.role == "caster":
            p.purpose = "Free-rolling third contact point at the back so the two-wheel base stays level."
        elif p.role == "mcu":
            p.purpose = "The brain: runs controller.py, reads sensors, commands the motor drivers over PWM."
        elif p.role == "motor_driver":
            p.purpose = f"H-bridge that turns the MCU's logic signals into motor current (two channels each, {max(1, n // 2)} needed for {n} motors)."
        elif p.role == "battery":
            p.purpose = (f"{p.capacity_mah or '?'} mAh at {p.voltage_v or '?'} V powers everything; "
                         f"sized for about {spec.constraints.target_runtime_min:.0f} min of driving.")
        elif p.role == "regulator":
            p.purpose = "Steps the battery voltage down to a clean 5 V rail for the MCU and sensors."
        elif p.role == "imu":
            p.purpose = "Measures tilt and rotation rate so the controller can hold heading and detect tipping."
        elif p.role == "camera":
            p.purpose = ("Low-profile camera for spotting the target under tight clearance." if "low profile" in p.name.lower()
                         else "Forward camera for finding the target.")
        elif p.role == "tof":
            p.purpose = "Time-of-flight distance sensor on the nose: stops the robot before it hits an obstacle."
        elif p.role == "servo":
            p.purpose = f"Three servos form the arm's shoulder, elbow and wrist joints ({p.stall_torque_nm} N·m each, {spec.params.arm_reach_mm or 150:.0f} mm reach)."
        elif p.role == "gripper":
            p.purpose = "Servo-driven jaws at the end of the arm that close on the target."
        else:
            p.purpose = p.name
    return sel


def catalog_pick(spec: RobotSpec, revision: str = "", exclude_skus: set[str] | None = None) -> PartsSelection:
    """Deterministic catalog selection honouring constraints. The demo's attempt-1
    'tall camera' trap lives here: a low clearance task + camera picks the tall
    ESP32-CAM first unless the revision asks for low profile."""
    exclude_skus = exclude_skus or set()
    low_profile = "low profile" in revision.lower() or "shorter" in revision.lower() or "height" in revision.lower()
    stronger = "stronger" in revision.lower() or "torque" in revision.lower() or "stall" in revision.lower()
    bigger_batt = "battery" in revision.lower() and ("bigger" in revision.lower() or "larger" in revision.lower())
    cheaper = "cheaper" in revision.lower() or "budget" in revision.lower()
    mecanum = spec.template != "diff_drive_rover"
    wd = spec.params.wheel_diameter_mm

    def pick(role: str, pref: list[str]) -> dict:
        cands = [c for c in CATALOG if c["role"] == role and c["sku"] not in exclude_skus]
        for sku in pref:
            for c in cands:
                if c["sku"] == sku:
                    return c
        return cands[0]

    choice = {
        "mcu": pick("mcu", ["picow" if cheaper else "esp32s3"]),
        "drive_motor": pick("drive_motor", ["n20_100", "jga25"] if stronger else ["n20_300", "n20_100"]),
        "motor_driver": pick("motor_driver", ["drv8833", "tb6612"]),
        "battery": pick("battery", ["lipo2s_2200"] if bigger_batt else ["lipo2s_1000"]),
        "regulator": pick("regulator", ["mp1584" if cheaper else "d24v22f5"]),
        "imu": pick("imu", ["mpu6050"]),
        "wheel": pick("wheel", (["mecanum80" if wd >= 75 else "mecanum60"] if mecanum else ["wheel60" if wd <= 62 else "wheel65"])),
        "caster": pick("caster", ["caster34"]),
        "servo": pick("servo", ["mg90s", "sg90"]),
        "gripper": pick("gripper", ["gripper_mini"]),
        "camera": pick("camera", ["ov5640_lp"] if low_profile else ["ov2640", "ov5640_lp"]),
        "tof": pick("tof", ["vl53l0x"]),
    }
    parts = []
    for role, qty in required_roles(spec).items():
        c = dict(choice[role]); c.pop("sku_", None)
        parts.append(Part(role=role, qty=qty, source="catalog", **{k: v for k, v in c.items() if k != "role"}))
    return annotate(PartsSelection(parts=parts).recompute(), spec)


async def verify_live(sel: PartsSelection, on_part=None, budget_s: float | None = None) -> PartsSelection:
    """Firecrawl every part's real store page: live price + stock. Catalog values
    stay when the scrape fails or the price looks wrong. Bounded by one budget."""
    if not fc.enabled():
        log.info("FIRECRAWL_API_KEY not set, prices are catalog values")
        return sel
    budget_s = budget_s or config.FIRECRAWL_TIMEOUT_S
    sem = asyncio.Semaphore(6)

    async def one(p: Part):
        async with sem:
            live = await fc.scrape_product(p.url, timeout_s=budget_s - 1)
        if not live:
            return
        base = p.catalog_price_usd or p.unit_price_usd
        plausible = 0.3 * base <= live["price_usd"] <= 4 * base
        p.catalog_price_usd = base
        if plausible:
            p.unit_price_usd = round(live["price_usd"], 2)
        p.in_stock = live.get("in_stock")
        p.vendor = live.get("vendor")
        p.url = live.get("url") or p.url
        p.source = "firecrawl"
        if on_part:
            await on_part(p, live, plausible)

    try:
        await asyncio.wait_for(asyncio.gather(*(one(p) for p in sel.parts if p.url), return_exceptions=True), timeout=budget_s)
    except asyncio.TimeoutError:
        log.warning("live price check hit the %.0fs budget; remaining parts keep catalog prices", budget_s)
    return sel.recompute()


async def select_parts(spec: RobotSpec, revision: str = "", previous: PartsSelection | None = None) -> PartsSelection:
    base = catalog_pick(spec, revision)
    # enrich with Firecrawl candidates (bounded) then let Claude choose
    candidates: list[dict] = []
    if config.FIRECRAWL_API_KEY:
        motor_q = f"{'mecanum' if spec.template != 'diff_drive_rover' else 'N20'} gear motor stall torque rpm price hobby robot"
        res = await asyncio.gather(search_parts(motor_q, 3), search_parts("small lipo battery 2S mAh grams price robot", 3), return_exceptions=True)
        for r in res:
            if isinstance(r, list):
                candidates += [{"title": h.get("title"), "url": h.get("url"), "snippet": (h.get("markdown") or h.get("description") or "")[:1200]} for h in r]
    try:
        rev = f"\nREVISION from critic (must apply): {revision}\nPrevious selection: {previous.model_dump_json() if previous else 'none'}" if revision else ""
        user = (f"SPEC:\n{spec.model_dump_json(indent=1)}\n\nCATALOG:\n{json.dumps(CATALOG)}\n\nCANDIDATES (web):\n{json.dumps(candidates)[:6000]}"
                f"\n\nRequired roles and quantities: {json.dumps(required_roles(spec))}")
        sel = await llm.structured(llm.load_prompt("parts", revision=rev), user, PartsSelection)
        sel.recompute()
        missing = set(required_roles(spec)) - {p.role for p in sel.parts}
        if missing:
            log.warning("LLM parts missing roles %s, filling from catalog", missing)
            sel.parts += [p for p in base.parts if p.role in missing]
            sel.recompute()
        return annotate(sel, spec)
    except Exception as e:
        log.warning("parts LLM failed, catalog fallback: %s", e)
        return base
