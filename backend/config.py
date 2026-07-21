"""Design&Lab backend configuration (env-driven, no secrets in code)."""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:  # dotenv optional
    pass

ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = Path(os.getenv("FRONTEND_DIR", ROOT / "frontend"))
DATA_DIR = Path(os.getenv("DATA_DIR", ROOT / "data"))
PROJECTS_DIR = DATA_DIR / "projects"
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

# --- AI provider (OpenAI-compatible: OpenAI, OpenRouter, Groq, Cerebras, Mistral, local…) ---
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "gpt-4o-mini")
AI_TEMPERATURE = float(os.getenv("AI_TEMPERATURE", "0.5"))
AI_MAX_TOKENS = int(os.getenv("AI_MAX_TOKENS", "8192"))
AI_TIMEOUT = float(os.getenv("AI_TIMEOUT", "120"))

# CORS: comma-separated origins, or * for dev
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

# --- Auth (optional). Off by default: projects stay anonymous/shared.
# Turn on with AUTH_ENABLED=1 to require login and make projects private per user. ---
AUTH_ENABLED = os.getenv("AUTH_ENABLED", "0").lower() in ("1", "true", "yes", "on")
AUTH_DB = DATA_DIR / "auth.db"
AUTH_TOKEN_TTL = float(os.getenv("AUTH_TOKEN_TTL_DAYS", "30"))  # days

def has_ai_key() -> bool:
    return bool(AI_API_KEY)
