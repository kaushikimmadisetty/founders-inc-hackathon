"""HeyPCB carrier board adapter.

HeyPCB has no REST API; its interface is an MCP server (Streamable HTTP) at
https://api.heypcb.ai/mcp, authenticated with a personal key (hpcb_pk_...).
`build_board` runs Inky, HeyPCB's design agent, which takes minutes and bills
the account (a free trial has 3 boards), so this runs once per run, in the
background, only when HEYPCB_BUILD=1. Inky pauses after a few unattended steps;
HEYPCB_CONTINUES sets how many billed continues it gets before we take the board as is.
Every billed call first checks whoami and only runs on the plan's included
allowance: never purchased credit or extra usage (ensure_plan_covers). Returns None on any failure so callers
keep the fallback board."""
from __future__ import annotations

import base64
import itertools
import json
import logging
import time
from pathlib import Path

import httpx

import config
from models import BoardArtifact, BomLine

log = logging.getLogger("heypcb")
MCP_URL = "https://api.heypcb.ai/mcp"
PROTOCOL = "2025-06-18"
# Choice ids that let Inky carry on without a human (approve plan, route, re-place).
APPROVE_WORDS = ("build", "approve", "route", "yes", "continue", "go", "accept", "ok")


def enabled() -> bool:
    return bool(config.HEYPCB_API_KEY) and config.HEYPCB_BUILD


class HeyPCBError(RuntimeError):
    pass


class MCPClient:
    def __init__(self, api_key: str, http: httpx.AsyncClient | None = None):
        self._http = http or httpx.AsyncClient(timeout=70)
        self._headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
                         "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": PROTOCOL}
        self._ids = itertools.count(1)

    async def call(self, tool: str, args: dict) -> dict:
        """Calls a tool; returns its structured result, plus `_images` (base64 PNGs) if any."""
        rid = next(self._ids)
        r = await self._http.post(MCP_URL, headers=self._headers,
                                  json={"jsonrpc": "2.0", "id": rid, "method": "tools/call",
                                        "params": {"name": tool, "arguments": args}})
        if r.is_error:
            raise HeyPCBError(f"{tool}: HTTP {r.status_code} {r.text[:200]}")
        msg = _rpc_response(r, rid)
        if "error" in msg:
            raise HeyPCBError(f"{tool}: {msg['error']}")
        res = msg.get("result") or {}
        out = res.get("structuredContent")
        content = res.get("content") or []
        if out is None:
            text = next((c.get("text") for c in content if c.get("type") == "text"), None)
            try:
                out = json.loads(text) if text else {}
            except ValueError:
                out = {"text": text}
        images = [c["data"] for c in content if c.get("type") == "image" and c.get("data")]
        if images:
            out = {**out, "_images": images}
        if res.get("isError") or (isinstance(out, dict) and out.get("code") and out.get("error")):
            raise HeyPCBError(f"{tool}: {out.get('error') or out} {out.get('fix', '')}".strip())
        return out


def _rpc_response(r: httpx.Response, rid: int) -> dict:
    """The server answers plain JSON or an SSE stream (progress, then the result)."""
    if "text/event-stream" not in r.headers.get("content-type", ""):
        return r.json()
    for line in r.text.splitlines():
        if line.startswith("data:"):
            try:
                msg = json.loads(line[5:].strip())
            except ValueError:
                continue
            if msg.get("id") == rid:
                return msg
    raise HeyPCBError("no result in event stream")


def brief_for(outline_mm: tuple[float, float], mount_holes: list[tuple[float, float]], bom: list[BomLine]) -> str:
    parts = "\n".join(f"- {b.ref}: {b.qty}x {b.part}" for b in bom)
    holes = ", ".join(f"({x:.1f}, {y:.1f})" for x, y in mount_holes)
    return (
        f"Carrier PCB for a small mobile robot, {outline_mm[0]:.0f} x {outline_mm[1]:.0f} mm, 2 layers, FR-4.\n"
        f"M3 mounting holes at (mm, from the bottom-left corner): {holes}.\n"
        f"Parts and connectors:\n{parts}\n"
        "Power comes in on the battery connector through the regulator to the MCU and sensors; the motor driver(s) "
        "drive the motor headers from the battery rail. Route it and take it to fab-ready. "
        "Use sensible defaults and do not stop to ask questions."
    )


async def ensure_plan_covers(mcp: MCPClient) -> None:
    """Billed Inky work only runs from the plan's included allowance: never from
    purchased credit or extra usage. Checked before every billed call."""
    w = await mcp.call("whoami", {})
    bal = w.get("balance") or {}
    included = bal.get("included") or {}
    if not w.get("canRunAgent") or bal.get("delinquent"):
        raise HeyPCBError("account can't run Inky right now")
    if (bal.get("extraUsage") or {}).get("enabled"):
        raise HeyPCBError("extra usage is enabled on heypcb.ai; refusing billed work that could exceed the plan")
    trial = bal.get("trial")
    if trial is not None:
        if (trial.get("usedFraction") or 0) >= 1:
            raise HeyPCBError("free trial used up")
    elif included.get("exhausted") or (included.get("usedFraction") or 0) >= 1:
        raise HeyPCBError("plan's included Inky work is used up for this period")


def _approving_choice(decision: dict) -> str | None:
    for c in decision.get("choices") or []:
        label = f"{c.get('id', '')} {c.get('label', '')}".lower()
        if any(w in label for w in APPROVE_WORDS) and "not" not in label and "change" not in label:
            return c.get("id")
    return None


async def _run_to_completion(mcp: MCPClient, brief: str, name: str, deadline: float) -> dict:
    await ensure_plan_covers(mcp)
    r = await mcp.call("build_board", {"brief": brief, "name": name})
    project = r.get("project")
    continues = config.HEYPCB_CONTINUES
    for _ in range(200):
        status = r.get("status")
        if status == "running":
            if time.monotonic() > deadline:
                raise HeyPCBError(f"timed out; board {project} is still being built on heypcb.ai")
            log.info("heypcb %s: %s %s", project, r.get("stage") or (r.get("board") or {}).get("stage") or "", r.get("activity") or "")
            r = await mcp.call("wait_for_turn", {"project": project, "turn": r["turn"]})
        elif status == "awaiting_decision":
            d = (r.get("decisions") or [{}])[-1]
            choice = _approving_choice(d)
            if not choice:
                raise HeyPCBError(f"Inky needs a decision we can't answer: {d.get('question') or d}")
            log.info("heypcb %s: answering %s with %s", project, d.get("decision"), choice)
            await ensure_plan_covers(mcp)
            r = await mcp.call("answer_decision", {"project": project, "thread": r.get("thread") or d.get("thread"),
                                                   "decision": d["decision"], "choice": choice})
        elif status == "paused" and continues > 0:
            # Inky stops after a few unattended steps (plan dependent); each continue is billed.
            continues -= 1
            try:
                await ensure_plan_covers(mcp)
            except HeyPCBError as e:
                log.info("heypcb %s: not continuing: %s", project, e)
                r.setdefault("project", project)
                return r
            log.info("heypcb %s: paused at %s (%s), continuing (%d left)", project, r.get("stage"), r.get("stopReason"), continues)
            d = (r.get("decisions") or [None])[-1]
            choice = _approving_choice(d) if d else None
            if choice:
                r = await mcp.call("answer_decision", {"project": project, "thread": r.get("thread") or d.get("thread"),
                                                       "decision": d["decision"], "choice": choice})
            else:
                args = {"project": project, "message": "continue"}
                if r.get("thread"):
                    args["thread"] = r["thread"]
                r = await mcp.call("ask_inky", args)
        else:
            r.setdefault("project", project)
            return r
    raise HeyPCBError("too many steps")


async def design_board(outline_mm: tuple[float, float], mount_holes: list[tuple[float, float]],
                       bom: list[BomLine], run_id: str, out_dir: Path, url_for,
                       http: httpx.AsyncClient | None = None) -> BoardArtifact | None:
    if not config.HEYPCB_API_KEY:
        return None
    mcp = MCPClient(config.HEYPCB_API_KEY, http)
    try:
        done = await _run_to_completion(mcp, brief_for(outline_mm, mount_holes, bom), f"roboforge-{run_id[:8]}",
                                        time.monotonic() + config.HEYPCB_TIMEOUT_S)
        project = done["project"]
        log.info("heypcb %s finished: stage=%s result=%s", project, done.get("stage"), json.dumps(done)[:1500])
        out_dir.mkdir(parents=True, exist_ok=True)
        render_url = gerbers_url = None
        try:
            img = await mcp.call("get_board_image", {"project": project, "view": "pcb-top", "width": 1200})
            if img.get("_images"):
                p = out_dir / "pcb_render_heypcb.png"
                p.write_bytes(base64.b64decode(img["_images"][0]))
                render_url = url_for(p)
        except Exception as e:
            log.warning("heypcb render failed: %s", e)
        try:
            exp = await mcp.call("export", {"project": project, "kind": "gerbers"})
            link = exp.get("url") or exp.get("downloadUrl")
            if link:  # export links last ~10 minutes, so keep a copy
                z = await mcp._http.get(link, follow_redirects=True)
                z.raise_for_status()
                p = out_dir / "gerbers_heypcb.zip"
                p.write_bytes(z.content)
                gerbers_url = url_for(p)
        except Exception as e:
            log.warning("heypcb gerbers export failed: %s", e)
        return BoardArtifact(provider="heypcb", outline_mm=outline_mm, mount_holes_mm=mount_holes, bom_lines=bom,
                             render_png_url=render_url, gerbers_zip_url=gerbers_url,
                             heypcb_url=done.get("url") or done.get("webUrl"), heypcb_stage=done.get("stage"))
    except Exception as e:
        log.warning("heypcb failed: %s", e)
        return None
