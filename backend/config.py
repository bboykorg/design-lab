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
# Where accounts/sessions live: "memory" (in-process cache, default) or "sqlite" (persisted).
AUTH_STORE = os.getenv("AUTH_STORE", "memory").lower()

# --- OCR (OCR.space): turn any screenshot into text so EVERY model can "see" it ---
OCR_ENABLED = os.getenv("OCR_ENABLED", "1").lower() in ("1", "true", "yes", "on")
OCR_API_KEY = os.getenv("OCR_SPACE_API_KEY", "helloworld")  # free demo key; set your own for real use
OCR_ENDPOINT = os.getenv("OCR_SPACE_ENDPOINT", "https://api.ocr.space/parse/image").rstrip("/")
OCR_LANGUAGE = os.getenv("OCR_LANGUAGE", "rus")   # engine 1 language code (rus/eng/…)
OCR_ENGINE = os.getenv("OCR_ENGINE", "1")         # 1 supports Cyrillic; 2 is Latin-only but sharper
OCR_TIMEOUT = float(os.getenv("OCR_TIMEOUT", "45"))
OCR_MAX_IMAGES = int(os.getenv("OCR_MAX_IMAGES", "6"))

# Cross-origin isolation headers (COOP/COEP) — required for in-browser WebContainers.
# On by default; disable with COI=0 if it interferes with embedded cross-origin content.
CROSS_ORIGIN_ISOLATION = os.getenv("COI", "1").lower() in ("1", "true", "yes", "on")

def has_ai_key() -> bool:
    return bool(AI_API_KEY)


def has_ocr_key() -> bool:
    return bool(OCR_API_KEY)
