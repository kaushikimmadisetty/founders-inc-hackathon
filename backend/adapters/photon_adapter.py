"""MessagingAdapter: Photon (iMessage) + Console fallback.

Photon API (Beta 2.0): https://photon.codes/docs/beta/api-reference
Messages are sent into a Space (conversation) by an agent User. An inbound
`message.received` webhook carries both IDs, so replies reuse them. A shared
iMessage line cannot start a conversation: the user has to text it first."""
from __future__ import annotations

import json
import logging
import mimetypes
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import httpx

import config

log = logging.getLogger("messaging")


class MessagingAdapter(Protocol):
    async def send_text(self, to: str, body: str) -> None: ...
    async def send_media(self, to: str, media_url: str, body: str = "") -> None: ...


class ConsoleAdapter:
    async def send_text(self, to: str, body: str) -> None:
        log.info("[SMS -> %s] %s", to, body)

    async def send_media(self, to: str, media_url: str, body: str = "") -> None:
        log.info("[MMS -> %s] %s %s", to, media_url, body)


@dataclass
class Inbound:
    handle: str        # the human's phone number or iMessage email
    text: str
    message_id: str
    space_id: str
    agent_user_id: str  # our line, as a Photon User; replies are sent as this User


@dataclass
class _Conversation:
    space_id: str
    agent_user_id: str


class PhotonAdapter:
    BASE = "https://api.photon.codes/v1"

    def __init__(self, api_key: str, project_id: str, agent_handle: str = "", platform: str = "imessage"):
        self.project, self.agent_handle, self.platform = project_id, agent_handle, platform
        self._http = httpx.AsyncClient(base_url=f"{self.BASE}/projects/{project_id}", timeout=30,
                                       headers={"Authorization": f"Bearer {api_key}"})
        self._convos: dict[str, _Conversation] = {}

    def remember(self, msg: Inbound) -> None:
        self._convos[msg.handle] = _Conversation(msg.space_id, msg.agent_user_id)

    async def _post(self, path: str, **kw) -> dict:
        r = await self._http.post(path, **kw)
        if r.is_error:
            raise RuntimeError(f"POST {path} -> {r.status_code}: {r.text[:300]}")
        return r.json()

    async def _conversation(self, to: str) -> _Conversation:
        if to in self._convos:
            return self._convos[to]
        # No inbound message yet (e.g. a web run with a phone number). Only works
        # from a dedicated line; shared lines reject unsolicited first messages.
        if not self.agent_handle:
            raise RuntimeError(f"no conversation with {to}; they must text the agent first (or set PHOTON_AGENT_HANDLE)")
        users = []
        for handle in (self.agent_handle, to):
            u = await self._post("/users", json={"platform": self.platform, "handle": handle})
            users.append(u["id"])
        space = await self._post("/spaces", json={"platform": self.platform, "participantIds": users},
                                 headers={"Idempotency-Key": f"roboforge-space:{self.agent_handle}:{to}"})
        self._convos[to] = _Conversation(space["id"], users[0])
        return self._convos[to]

    async def _upload(self, media_url: str) -> str:
        data, name = await _load_media(media_url)
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        boundary = uuid.uuid4().hex
        meta = json.dumps({"contentType": ctype, "sizeBytes": len(data), "filename": name}).encode()
        body = (f"--{boundary}\r\nContent-Type: application/json\r\n\r\n").encode() + meta + \
               (f"\r\n--{boundary}\r\nContent-Type: {ctype}\r\n\r\n").encode() + data + \
               (f"\r\n--{boundary}--\r\n").encode()
        att = await self._post("/attachments", content=body, headers={
            "Content-Type": f'multipart/related; boundary="{boundary}"',
            "Idempotency-Key": f"roboforge-att:{uuid.uuid4()}",
        })
        return att["id"]

    async def _send(self, to: str, content: dict) -> None:
        c = await self._conversation(to)
        await self._post("/messages", json={"spaceId": c.space_id, "senderId": c.agent_user_id, "content": content},
                         headers={"Idempotency-Key": f"roboforge-msg:{uuid.uuid4()}"})

    async def send_text(self, to: str, body: str) -> None:
        try:
            await self._send(to, _text(body))
        except Exception as e:
            log.warning("photon send to %s failed: %s", to, e)

    async def send_media(self, to: str, media_url: str, body: str = "") -> None:
        # iMessage on Photon Beta rejects text+image groups (UNSUPPORTED_CONTENT),
        # so the text and the image go as two messages.
        if body:
            await self.send_text(to, body)
        try:
            await self._send(to, {"type": "attachment", "attachmentId": await self._upload(media_url)})
        except Exception as e:
            log.warning("photon media to %s failed, sending link instead: %s", to, e)
            await self.send_text(to, media_url)


def _text(body: str) -> dict:
    return {"type": "text", "format": "plain", "text": body}


async def _load_media(media_url: str) -> tuple[bytes, str]:
    """Artifacts live under STORAGE_DIR; read them from disk instead of over HTTP."""
    prefix = f"{config.BACKEND_BASE_URL}/artifacts/"
    if media_url.startswith(prefix):
        p = config.STORAGE_DIR / media_url[len(prefix):]
        return p.read_bytes(), p.name
    if media_url.startswith("file://"):
        p = Path(media_url[len("file://"):])
        return p.read_bytes(), p.name
    async with httpx.AsyncClient(timeout=30) as h:
        r = await h.get(media_url)
        r.raise_for_status()
        return r.content, media_url.rsplit("/", 1)[-1].split("?")[0] or "media"


_messaging: MessagingAdapter | None = None


def get_messaging() -> MessagingAdapter:
    global _messaging
    if _messaging is None:
        if config.PHOTON_API_KEY and config.PHOTON_PROJECT_ID:
            _messaging = PhotonAdapter(config.PHOTON_API_KEY, config.PHOTON_PROJECT_ID, config.PHOTON_AGENT_HANDLE)
        else:
            _messaging = ConsoleAdapter()
    return _messaging


def parse_photon_webhook(payload: dict) -> Inbound | None:
    """Return the inbound message from a Photon `message.received` event, or None
    for any other event (delivery updates, typing, reactions, attachments only)."""
    if payload.get("type") != "message.received":
        return None
    m = (payload.get("data") or {}).get("object") or {}
    sender, agent, space = m.get("sentBy") or {}, m.get("receivedBy") or {}, m.get("space") or {}
    if sender.get("kind") == "agent":
        return None
    content = m.get("content") or {}
    parts = content.get("parts", []) if content.get("type") == "group" else [content]
    text = "\n".join(p["text"] for p in parts if p.get("type") == "text" and p.get("text")).strip()
    if not (text and sender.get("handle") and space.get("id") and agent.get("id")):
        return None
    return Inbound(sender["handle"], text, m.get("id", ""), space["id"], agent["id"])
