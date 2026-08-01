"""Design&Lab — FastAPI entry point. Serves the API and the static frontend."""
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .ai import router as ai_router
from .audit import router as audit_router
from .projects import router as projects_router
from .auth import router as auth_router
from .plans import router as plans_router
from .profile import router as profile_router
from .proxy import router as proxy_router
from .ocr import router as ocr_router

app = FastAPI(title="Design&Lab API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    """Базовая защита ответов; iframe/CSP намеренно не меняем."""
    started = time.perf_counter()
    is_proxy = request.url.path == "/api/proxy"
    try:
        response = await call_next(request)
    except Exception:
        if is_proxy:
            elapsed = (time.perf_counter() - started) * 1000
            print(f"[proxy-timing] outcome=exception elapsed_ms={elapsed:.0f}", flush=True)
        raise

    if is_proxy:
        elapsed = (time.perf_counter() - started) * 1000
        upstream = request.query_params.get("url", "").split("?")[0]
        print(
            f"[proxy-timing] status={response.status_code} "
            f"first_response_ms={elapsed:.0f} upstream={upstream}",
            flush=True,
        )

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), geolocation=(), payment=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    return response


@app.get("/api/health")
def health():
    """Liveness only — без деталей о ключах и моделях."""
    return {"ok": True}


app.include_router(ai_router)
app.include_router(audit_router)
app.include_router(projects_router)
app.include_router(auth_router)
app.include_router(plans_router)
app.include_router(profile_router)
app.include_router(proxy_router)
app.include_router(ocr_router)

_PATCH_SCRIPTS = (
    "models-patch.js",
    "hide-google-models.js",
    "plans-patch.js",
    "profile-patch.js",
    "ui-cleanup.js",
    "proxy-auth-patch.js",
)
_index_cache = None


def _build_index() -> str:
    raw = (config.FRONTEND_DIR / "index.html").read_text(encoding="utf-8")
    missing = [
        f'<script src="/{name}"></script>'
        for name in _PATCH_SCRIPTS
        if name not in raw
    ]
    if not missing:
        return raw
    patch = "\n".join(missing)
    i = raw.rfind("</body>")
    if i < 0:
        return raw + patch
    return raw[:i] + patch + "\n" + raw[i:]


@app.get("/", include_in_schema=False)
@app.get("/index.html", include_in_schema=False)
def index():
    global _index_cache
    if _index_cache is None:
        try:
            _index_cache = _build_index()
        except OSError:
            raise HTTPException(status_code=404, detail="frontend/index.html not found")
    return HTMLResponse(_index_cache)


if config.FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(config.FRONTEND_DIR), html=True), name="frontend")
