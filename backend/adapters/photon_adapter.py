"""MessagingAdapter: Photon (iMessage) + Console fallback. Photon API shape is a
placeholder. Confirm endpoints with the Photon team onsite and adjust `PhotonAdapter`."""
from __future__ import annotations

import logging
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


class PhotonAdapter:
    BASE = "https://api.photon.chat/v1"  # TODO confirm onsite

    def __init__(self, api_key: str, from_number: str):
        self.key, self.frm = api_key, from_number
        self._http = httpx.AsyncClient(timeout=15, headers={"Authorization": f"Bearer {api_key}"})

    async def _post(self, path: str, payload: dict):
        try:
            r = await self._http.post(f"{self.BASE}{path}", json=payload)
            r.raise_for_status()
        except Exception as e:
            log.warning("photon send failed: %s", e)

    async def send_text(self, to: str, body: str) -> None:
        await self._post("/messages", {"from": self.frm, "to": to, "text": body})

    async def send_media(self, to: str, media_url: str, body: str = "") -> None:
        await self._post("/messages", {"from": self.frm, "to": to, "text": body, "media_urls": [media_url]})


def get_messaging() -> MessagingAdapter:
    if config.PHOTON_API_KEY and config.PHOTON_NUMBER:
        return PhotonAdapter(config.PHOTON_API_KEY, config.PHOTON_NUMBER)
    return ConsoleAdapter()


def parse_photon_webhook(payload: dict) -> tuple[str, str] | None:
    """Return (from_number, text) from an inbound Photon webhook. Tolerant of shape."""
    frm = payload.get("from") or payload.get("sender") or (payload.get("message") or {}).get("from")
    txt = payload.get("text") or payload.get("body") or (payload.get("message") or {}).get("text")
    if frm and txt:
        return str(frm), str(txt)
    return None
