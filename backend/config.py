import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

def _secret(name: str) -> str:
    """Env value, but placeholders like REPLACE_ME_... count as unset so fallbacks stay fast."""
    v = os.getenv(name, "").strip()
    return "" if v.upper().startswith("REPLACE") or v.upper() in ("TODO", "CHANGEME", "XXX") else v


ANTHROPIC_API_KEY = _secret("ANTHROPIC_API_KEY")
OPENAI_API_KEY = _secret("OPENAI_API_KEY")
# LLM provider: OpenAI when its key is set, else Anthropic, else heuristics only.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "").lower() or ("openai" if OPENAI_API_KEY else ("anthropic" if ANTHROPIC_API_KEY else ""))
FIRECRAWL_API_KEY = _secret("FIRECRAWL_API_KEY")
CONVEX_URL = _secret("CONVEX_URL")
CONVEX_DEPLOY_KEY = _secret("CONVEX_DEPLOY_KEY")
PHOTON_API_KEY = _secret("PHOTON_API_KEY")
PHOTON_PROJECT_ID = _secret("PHOTON_PROJECT_ID")
# Optional: the agent line's number. Only needed to text someone who has not texted it first (dedicated lines).
PHOTON_AGENT_HANDLE = _secret("PHOTON_AGENT_HANDLE")
HEYPCB_API_KEY = _secret("HEYPCB_API_KEY")
# Real HeyPCB boards bill the account (free trial: 3 boards), so they are opt-in: one per run.
HEYPCB_BUILD = os.getenv("HEYPCB_BUILD", "0") == "1"
HEYPCB_TIMEOUT_S = float(os.getenv("HEYPCB_TIMEOUT_S", "1800"))
HEYPCB_CONTINUES = int(os.getenv("HEYPCB_CONTINUES", "3"))
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:3000").rstrip("/")
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000").rstrip("/")

import platform as _platform
_gl_default = {"Linux": "egl", "Darwin": "cgl"}.get(_platform.system(), "glfw")
_gl = os.getenv("MUJOCO_GL", "").lower()
if not _gl or (_platform.system() == "Darwin" and _gl in ("egl", "osmesa")) or (_platform.system() == "Linux" and _gl == "cgl"):
    os.environ["MUJOCO_GL"] = _gl_default

STORAGE_DIR = Path(os.getenv("STORAGE_DIR", ROOT / "storage"))
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

_DEFAULT_MODELS = {"openai": ("gpt-5.4-mini", "gpt-5.5"), "anthropic": ("claude-sonnet-5-5", "claude-opus-5-5"), "": ("", "")}
AGENT_MODEL = os.getenv("AGENT_MODEL") or _DEFAULT_MODELS[LLM_PROVIDER][0]
PLANNER_MODEL = os.getenv("PLANNER_MODEL") or _DEFAULT_MODELS[LLM_PROVIDER][1]
# an Anthropic model name left over in env while running on OpenAI (or vice versa) falls back to the provider default
if LLM_PROVIDER == "openai" and AGENT_MODEL.startswith("claude"):
    AGENT_MODEL = _DEFAULT_MODELS["openai"][0]
if LLM_PROVIDER == "openai" and PLANNER_MODEL.startswith("claude"):
    PLANNER_MODEL = _DEFAULT_MODELS["openai"][1]
if LLM_PROVIDER == "anthropic" and AGENT_MODEL.startswith("gpt"):
    AGENT_MODEL = _DEFAULT_MODELS["anthropic"][0]
if LLM_PROVIDER == "anthropic" and PLANNER_MODEL.startswith("gpt"):
    PLANNER_MODEL = _DEFAULT_MODELS["anthropic"][1]
MAX_ITERATIONS = int(os.getenv("MAX_ITERATIONS", "3"))
LLM_TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "40"))
FIRECRAWL_TIMEOUT_S = float(os.getenv("FIRECRAWL_TIMEOUT_S", "20"))
SIM_SEED = int(os.getenv("SIM_SEED", "7"))

# Demo mode: force attempt 1 of fetch_under_obstacle to be too tall so the
# fail -> fix -> pass loop is visible. Disable with DEMO_SCRIPTED_FAIL=0.
DEMO_SCRIPTED_FAIL = os.getenv("DEMO_SCRIPTED_FAIL", "1") == "1"


def artifact_url(rel: str) -> str:
    return f"{BACKEND_BASE_URL}/artifacts/{rel}"
