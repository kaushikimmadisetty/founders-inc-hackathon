"""Photon adapter against a mocked API: webhook parsing, reply routing, attachment upload."""
import asyncio
import json

import httpx

import config
from adapters.photon_adapter import PhotonAdapter, parse_photon_webhook

PRJ = "pho_prj_01m67r8gkvfap8x9vtc1fxabze"


def _event(content, kind="human", type_="message.received"):
    return {"type": type_, "data": {"projectId": PRJ, "object": {
        "id": "pho_msg_1", "platform": "imessage", "status": "received", "content": content,
        "sentBy": {"id": "pho_usr_human", "handle": "+14155550123", "kind": kind},
        "receivedBy": {"id": "pho_usr_agent", "handle": "+14155550188", "kind": "agent"},
        "space": {"id": "pho_spc_1", "kind": "direct"},
    }}}


def test_parse_text_and_group():
    m = parse_photon_webhook(_event({"type": "text", "format": "plain", "text": " fetch my keys "}))
    assert (m.handle, m.text, m.space_id, m.agent_user_id) == ("+14155550123", "fetch my keys", "pho_spc_1", "pho_usr_agent")
    g = parse_photon_webhook(_event({"type": "group", "parts": [{"type": "text", "format": "plain", "text": "rover"},
                                                                {"type": "attachment", "attachmentId": "x"}]}))
    assert g.text == "rover"


def test_parse_ignores_other_events():
    text = {"type": "text", "format": "plain", "text": "hi"}
    assert parse_photon_webhook(_event(text, type_="message.delivered")) is None
    assert parse_photon_webhook(_event(text, kind="agent")) is None
    assert parse_photon_webhook(_event({"type": "reaction", "reaction": "love"})) is None


def _adapter(calls):
    def handler(req: httpx.Request):
        calls.append(req)
        if req.url.path.endswith("/attachments"):
            return httpx.Response(201, json={"id": "pho_att_1"})
        return httpx.Response(202, json={"id": "pho_msg_out"})
    a = PhotonAdapter("pho_sk_test", PRJ)
    a._http = httpx.AsyncClient(base_url=f"{a.BASE}/projects/{PRJ}", transport=httpx.MockTransport(handler))
    return a


def test_reply_uses_inbound_conversation(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORAGE_DIR", tmp_path)
    (tmp_path / "run1").mkdir()
    (tmp_path / "run1" / "sim.gif").write_bytes(b"GIF89a-fake")
    calls = []
    a = _adapter(calls)
    a.remember(parse_photon_webhook(_event({"type": "text", "format": "plain", "text": "hi"})))

    async def go():
        await a.send_text("+14155550123", "On it")
        await a.send_media("+14155550123", f"{config.BACKEND_BASE_URL}/artifacts/run1/sim.gif", "Passed")
    asyncio.run(go())

    assert [c.url.path for c in calls] == [f"/v1/projects/{PRJ}/messages", f"/v1/projects/{PRJ}/attachments", f"/v1/projects/{PRJ}/messages"]
    first = json.loads(calls[0].content)
    assert first == {"spaceId": "pho_spc_1", "senderId": "pho_usr_agent", "content": {"type": "text", "format": "plain", "text": "On it"}}
    assert all(c.headers.get("Idempotency-Key") for c in calls)
    upload = calls[1]
    assert upload.headers["Content-Type"].startswith("multipart/related")
    assert b'"contentType": "image/gif"' in upload.content and b"GIF89a-fake" in upload.content
    media = json.loads(calls[2].content)["content"]
    assert media["type"] == "group" and media["parts"][1] == {"type": "attachment", "attachmentId": "pho_att_1"}


def test_unknown_recipient_on_shared_line_does_not_send():
    calls = []
    asyncio.run(_adapter(calls).send_text("+19999999999", "hello"))
    assert calls == []
