"""Thin Claude wrapper: structured JSON output validated by a Pydantic model.
Timeout, one retry on validation failure, then raise so caller falls back."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Type, TypeVar

from pydantic import BaseModel, ValidationError

import config

log = logging.getLogger("llm")
T = TypeVar("T", bound=BaseModel)
PROMPTS = Path(__file__).parent / "agents" / "prompts"

_client = None


def client():
    global _client
    if _client is None:
        from anthropic import AsyncAnthropic
        _client = AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY, timeout=config.LLM_TIMEOUT_S, max_retries=1)
    return _client


def load_prompt(name: str, **kw) -> str:
    text = (PROMPTS / f"{name}.md").read_text()
    for k, v in kw.items():
        text = text.replace("{{" + k + "}}", str(v))
    return text


def _extract_json(text: str) -> dict:
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    raw = m.group(1) if m else text[text.find("{"): text.rfind("}") + 1]
    return json.loads(raw)


async def structured(system: str, user: str, schema: Type[T], model: str | None = None, max_tokens: int = 4000) -> T:
    """Ask Claude for JSON matching `schema`. One retry with the validation error fed back."""
    if not config.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    model = model or config.AGENT_MODEL
    schema_json = json.dumps(schema.model_json_schema(), indent=1)
    sys_full = f"{system}\n\nRespond with ONLY a JSON object matching this schema:\n{schema_json}"
    messages = [{"role": "user", "content": user}]
    last_err: Exception | None = None
    for attempt in range(2):
        resp = await asyncio.wait_for(
            client().messages.create(model=model, max_tokens=max_tokens, system=sys_full, messages=messages),
            timeout=config.LLM_TIMEOUT_S,
        )
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        try:
            return schema.model_validate(_extract_json(text))
        except (ValidationError, json.JSONDecodeError, ValueError) as e:
            last_err = e
            log.warning("structured output invalid (attempt %d): %s", attempt + 1, e)
            messages += [
                {"role": "assistant", "content": text},
                {"role": "user", "content": f"That was invalid: {e}\nReturn corrected JSON only."},
            ]
    raise RuntimeError(f"LLM structured output failed: {last_err}")


async def text(system: str, user: str, model: str | None = None, max_tokens: int = 4000) -> str:
    if not config.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    resp = await asyncio.wait_for(
        client().messages.create(model=model or config.AGENT_MODEL, max_tokens=max_tokens, system=system,
                                 messages=[{"role": "user", "content": user}]),
        timeout=config.LLM_TIMEOUT_S,
    )
    return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
