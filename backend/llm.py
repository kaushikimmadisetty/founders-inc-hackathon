"""LLM wrapper used by every agent: structured JSON validated by a Pydantic
model, or free text. Provider is OpenAI or Anthropic (config.LLM_PROVIDER).
Timeout, one retry on validation failure, then raise so the caller falls back."""
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

_anthropic = None
_openai = None


def enabled() -> bool:
    return bool(config.LLM_PROVIDER)


def _anthropic_client():
    global _anthropic
    if _anthropic is None:
        from anthropic import AsyncAnthropic
        _anthropic = AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY, timeout=config.LLM_TIMEOUT_S, max_retries=1)
    return _anthropic


def _openai_client():
    global _openai
    if _openai is None:
        from openai import AsyncOpenAI
        _openai = AsyncOpenAI(api_key=config.OPENAI_API_KEY, timeout=config.LLM_TIMEOUT_S, max_retries=1)
    return _openai


def load_prompt(name: str, **kw) -> str:
    text = (PROMPTS / f"{name}.md").read_text()
    for k, v in kw.items():
        text = text.replace("{{" + k + "}}", str(v))
    return text


def _extract_json(text: str) -> dict:
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    raw = m.group(1) if m else text[text.find("{"): text.rfind("}") + 1]
    return json.loads(raw)


async def _complete(system: str, messages: list[dict], model: str, max_tokens: int, json_mode: bool) -> str:
    """One round trip, provider-agnostic. messages = [{role, content}, ...] without the system turn."""
    if config.LLM_PROVIDER == "openai":
        kwargs = {"model": model, "messages": [{"role": "system", "content": system}, *messages], "max_completion_tokens": max_tokens}
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        resp = await asyncio.wait_for(_openai_client().chat.completions.create(**kwargs), timeout=config.LLM_TIMEOUT_S)
        return resp.choices[0].message.content or ""
    if config.LLM_PROVIDER == "anthropic":
        resp = await asyncio.wait_for(
            _anthropic_client().messages.create(model=model, max_tokens=max_tokens, system=system, messages=messages),
            timeout=config.LLM_TIMEOUT_S)
        return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    raise RuntimeError("no LLM provider configured (set OPENAI_API_KEY or ANTHROPIC_API_KEY)")


async def structured(system: str, user: str, schema: Type[T], model: str | None = None, max_tokens: int = 4000) -> T:
    """Ask the model for JSON matching `schema`. One retry with the validation error fed back."""
    if not enabled():
        raise RuntimeError("no LLM provider configured")
    model = model or config.AGENT_MODEL
    schema_json = json.dumps(schema.model_json_schema(), indent=1)
    sys_full = f"{system}\n\nRespond with ONLY a JSON object matching this schema:\n{schema_json}"
    messages = [{"role": "user", "content": user}]
    last_err: Exception | None = None
    for attempt in range(2):
        text = await _complete(sys_full, messages, model, max_tokens, json_mode=True)
        try:
            return schema.model_validate(_extract_json(text))
        except (ValidationError, json.JSONDecodeError, ValueError) as e:
            last_err = e
            log.warning("structured output invalid (attempt %d, %s): %s", attempt + 1, model, e)
            messages += [{"role": "assistant", "content": text},
                         {"role": "user", "content": f"That was invalid: {e}\nReturn corrected JSON only."}]
    raise RuntimeError(f"LLM structured output failed: {last_err}")


async def text(system: str, user: str, model: str | None = None, max_tokens: int = 4000) -> str:
    if not enabled():
        raise RuntimeError("no LLM provider configured")
    return await _complete(system, [{"role": "user", "content": user}], model or config.AGENT_MODEL, max_tokens, json_mode=False)
