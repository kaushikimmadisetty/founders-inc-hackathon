"""HeyPCB adapter against a mocked MCP server: SSE parsing, the build/wait/decision loop, saved artifacts."""
import asyncio
import base64
import json
import sys

import httpx

import config
from adapters import heypcb_adapter
from models import BomLine

WHOAMI = {"ok": True, "canRunAgent": True, "balance": {"included": {"usedFraction": 0.2, "exhausted": False},
                                                     "extraUsage": {"enabled": False}, "trial": None, "delinquent": False}}
WHOAMI_SEQ = []
PNG = base64.b64encode(b"\x89PNG-fake").decode()
BOM = [BomLine(ref="U1", part="ESP32-S3 DevKit", qty=1, unit_price_usd=8.0),
       BomLine(ref="U2", part="TB6612FNG", qty=1, unit_price_usd=2.5)]


def _sse(rid, result):
    body = ": keepalive\n\nevent: message\ndata: " + json.dumps({"jsonrpc": "2.0", "id": rid, "result": result}) + "\n\n"
    return httpx.Response(200, headers={"content-type": "text/event-stream"}, text=body)


def _structured(d):
    return {"content": [{"type": "text", "text": json.dumps(d)}], "structuredContent": d}


def _server(calls, build_steps):
    steps = iter(build_steps)

    def handler(req: httpx.Request):
        if req.url.host == "files.example":
            return httpx.Response(200, content=b"PK-gerbers")
        msg = json.loads(req.content)
        tool, args = msg["params"]["name"], msg["params"]["arguments"]
        calls.append((tool, args))
        assert req.headers["authorization"] == "Bearer hpcb_pk_test"
        if tool in ("build_board", "wait_for_turn", "answer_decision", "ask_inky"):
            return _sse(msg["id"], _structured(next(steps)))
        if tool == "whoami":
            bal = WHOAMI_SEQ.pop(0) if WHOAMI_SEQ else WHOAMI["balance"]
            return _sse(msg["id"], _structured({**WHOAMI, "balance": bal}))
        if tool == "get_board_image":
            return _sse(msg["id"], {"content": [{"type": "image", "data": PNG, "mimeType": "image/png"}]})
        if tool == "export":
            return _sse(msg["id"], _structured({"url": "https://files.example/g.zip"}))
        raise AssertionError(tool)
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _run(tmp_path, monkeypatch, steps):
    monkeypatch.setattr(config, "HEYPCB_API_KEY", "hpcb_pk_test")
    calls = []
    art = asyncio.run(heypcb_adapter.design_board((90, 72), [(4, 4), (86, 68)], BOM, "run12345abc", tmp_path,
                                                  lambda p: f"url:{p.name}", http=_server(calls, steps)))
    return art, calls


def test_build_waits_answers_decision_and_saves_files(tmp_path, monkeypatch):
    art, calls = _run(tmp_path, monkeypatch, [
        {"status": "running", "project": "p1", "turn": "k_p1_0123456789ab_a", "stage": "schematic_only"},
        {"status": "awaiting_decision", "project": "p1", "thread": "t1",
         "decisions": [{"decision": "d1", "choices": [{"id": "not_yet", "label": "Not yet"}, {"id": "route_it", "label": "Route it"}]}]},
        {"status": "done", "project": "p1", "stage": "fab_ready", "url": "https://heypcb.ai/p/p1"},
    ])
    assert [c[0] for c in calls] == ["whoami", "build_board", "wait_for_turn", "whoami", "answer_decision", "get_board_image", "export"]
    assert "90 x 72 mm" in calls[1][1]["brief"] and "TB6612FNG" in calls[1][1]["brief"]
    assert calls[4][1] == {"project": "p1", "thread": "t1", "decision": "d1", "choice": "route_it"}
    assert art.provider == "heypcb" and art.heypcb_stage == "fab_ready" and art.heypcb_url == "https://heypcb.ai/p/p1"
    assert art.render_png_url == "url:pcb_render_heypcb.png" and (tmp_path / "pcb_render_heypcb.png").read_bytes() == b"\x89PNG-fake"
    assert art.gerbers_zip_url == "url:gerbers_heypcb.zip" and (tmp_path / "gerbers_heypcb.zip").read_bytes() == b"PK-gerbers"


def test_unanswerable_decision_falls_back(tmp_path, monkeypatch):
    art, calls = _run(tmp_path, monkeypatch, [
        {"status": "awaiting_decision", "project": "p1", "thread": "t1",
         "decisions": [{"decision": "d1", "question": "Which MCU?", "choices": [{"id": "esp32"}, {"id": "rp2040"}]}]},
    ])
    assert art is None and [c[0] for c in calls] == ["whoami", "build_board"]


def test_refusal_falls_back(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "HEYPCB_API_KEY", "hpcb_pk_test")

    def handler(req):
        msg = json.loads(req.content)
        return _sse(msg["id"], {"isError": True, **_structured({"code": "balance", "error": "Out of trial boards", "fix": "Upgrade"})})
    art = asyncio.run(heypcb_adapter.design_board((90, 72), [], BOM, "r", tmp_path, str,
                                                  http=httpx.AsyncClient(transport=httpx.MockTransport(handler))))
    assert art is None


def test_disabled_without_opt_in(monkeypatch):
    monkeypatch.setattr(config, "HEYPCB_API_KEY", "hpcb_pk_test")
    monkeypatch.setattr(config, "HEYPCB_BUILD", False)
    assert not heypcb_adapter.enabled()
    monkeypatch.setattr(config, "HEYPCB_BUILD", True)
    assert heypcb_adapter.enabled()


def test_paused_board_gets_limited_continues(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "HEYPCB_CONTINUES", 1)
    paused = {"status": "paused", "project": "p1", "thread": "t1", "stage": "placed", "stopReason": "step_limit"}
    art, calls = _run(tmp_path, monkeypatch, [paused, {"status": "running", "project": "p1", "turn": "k_p1_0123456789ab_a"}, paused])
    assert [c[0] for c in calls] == ["whoami", "build_board", "whoami", "ask_inky", "wait_for_turn", "get_board_image", "export"]
    assert calls[3][1] == {"project": "p1", "message": "continue", "thread": "t1"}
    assert art.heypcb_stage == "placed"  # out of continues: keep the partial board


def test_never_spends_beyond_plan(tmp_path, monkeypatch):
    for bal in ({"included": {"exhausted": True}, "extraUsage": {"enabled": False}, "trial": None},
                {"included": {"usedFraction": 0.1}, "extraUsage": {"enabled": True}, "trial": None},
                {"included": {}, "extraUsage": {"enabled": False}, "trial": {"usedFraction": 1}}):
        monkeypatch.setitem(WHOAMI, "balance", bal)
        art, calls = _run(tmp_path, monkeypatch, [])
        assert art is None and [c[0] for c in calls] == ["whoami"]  # nothing billed was called


def test_stops_continuing_when_allowance_runs_out(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "HEYPCB_CONTINUES", 3)
    ok, used_up = WHOAMI["balance"], {**WHOAMI["balance"], "included": {"usedFraction": 1, "exhausted": True}}
    monkeypatch.setattr(sys.modules[__name__], "WHOAMI_SEQ", [ok, used_up])
    paused = {"status": "paused", "project": "p1", "thread": "t1", "stage": "placed"}
    art, calls = _run(tmp_path, monkeypatch, [paused])
    assert [c[0] for c in calls] == ["whoami", "build_board", "whoami", "get_board_image", "export"]
    assert art.heypcb_stage == "placed"  # kept the partial board instead of spending past the plan
