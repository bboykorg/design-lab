"""Design&Lab — FastAPI entry point. Serves the API and the static frontend."""
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
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
from .admin import router as admin_router
from .design_api import router as design_router

app = FastAPI(title="Design&Lab API", version="1.0.0", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    if request.method == "POST" and request.url.path == "/api/plan/subscribe":
        return JSONResponse(status_code=403, content={"detail": "Самостоятельная смена тарифа отключена."})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), geolocation=(), payment=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    return response

@app.get("/api/health")
def health():
    return {"ok": True}

app.include_router(ai_router)
app.include_router(audit_router)
app.include_router(projects_router)
app.include_router(auth_router)
app.include_router(plans_router)
app.include_router(profile_router)
app.include_router(proxy_router)
app.include_router(ocr_router)
app.include_router(admin_router)
app.include_router(design_router)

_PATCH_SCRIPTS = (
    "dl-design-skills.js",
    "auth-token-normalize.js",
    "models-patch.js", "model-free-set.js", "model-plan-groups.js", "hide-google-models.js",
    "model-access-lock.js", "ai-creative-prompt.js", "plans-patch.js", "plan-lock-ui.js",
    "profile-patch.js", "profile-id-patch.js",
    "ui-cleanup.js", "iframe-cursor-bridge.js", "design-edit-fix.js", "design-text-scale.js",
    "design-resize-free.js", "design-autoarm.js", "design-clean-save.js",
    "design-inert.js", "session-restore.js",
    "proxy-auth-patch.js", "proxy-key-strip.js", "auth-error-patch.js",
    "seekai-models.js", "model-no-autoswitch.js", "model-default.js",
    "request-cancel.js", "cancel-quiet.js", "model-order.js",
    "project-delete-fix.js", "project-dedupe.js", "project-delete-verify.js", "project-thumb-fix.js",
    "dl-scroll.js", "dl-mobile.js", "dl-mobile-sheet.js", "dl-mobile-polish.js",
    "dl-ui-kit.js", "dl-fix.js", "dl-mobile-chat.js", "dl-mobile-fix.js",
    "dl-chat-mobile.js", "dl-desktop-chat.js", "dl-hero-composer.js",
    "dl-board-ai.js", "board-json-force.js", "board-log-trim.js",
    "dl-mobile-fixes.js",
    "dl-palettes.js",
    # Финальные мобильные слои: свободное место для палитры, удаление старой
    # кнопки «Цвета» и полноценная закрываемая шторка выбора шрифта.
    "palette-visibility-guard.js",
    "hide-colors-button.js",
    "mobile-font-sheet.js",
)

_PATCH_STYLES = (
    "dl-design-system.css", "dl-scroll.css", "dl-mobile.css", "dl-mobile-sheet.css",
    "dl-mobile-polish.css", "dl-ui-kit.css", "dl-ui-kit-mobile.css", "dl-ui-kit-desktop.css",
    "dl-fix.css", "dl-mobile-chat.css", "dl-mobile-fix.css", "dl-chat-mobile.css",
    "dl-desktop-chat.css", "dl-hero-composer.css",
)
_index_cache = None


def _version(name: str) -> str:
    try:
        stat = (config.FRONTEND_DIR / name).stat()
        return str(int(stat.st_mtime))[-8:] + "-" + str(stat.st_size)
    except OSError:
        return "0"


def _early_boot() -> str:
    return (
        "<script>(function(){var d=document.documentElement;"
        "function set(){var phone;try{phone=window.matchMedia('(max-width:760px)').matches;}"
        "catch(e){phone=(window.innerWidth||0)<=760;}"
        "if(phone){d.classList.add('dl-phone');}else{d.classList.remove('dl-phone');}}"
        "set();window.addEventListener('resize',set);"
        "window.addEventListener('orientationchange',set);})();</script>"
    )


def _build_index() -> str:
    raw = (config.FRONTEND_DIR / "index.html").read_text(encoding="utf-8")
    styles = [
        f'<link rel="stylesheet" href="/{name}?v={_version(name)}">'
        for name in _PATCH_STYLES if name not in raw
    ]
    scripts = [
        f'<script src="/{name}?v={_version(name)}"></script>'
        for name in _PATCH_SCRIPTS if name not in raw
    ]
    head = _early_boot()
    if styles:
        head += "\n" + "\n".join(styles)
    j = raw.find("</head>")
    raw = head + raw if j < 0 else raw[:j] + head + "\n" + raw[j:]
    tail = styles + scripts
    if not tail:
        return raw
    patch = "\n".join(tail)
    i = raw.rfind("</body>")
    return raw + patch if i < 0 else raw[:i] + patch + "\n" + raw[i:]

@app.get("/", include_in_schema=False)
@app.get("/index.html", include_in_schema=False)
def index():
    global _index_cache
    if _index_cache is None:
        try:
            _index_cache = _build_index()
        except OSError:
            raise HTTPException(status_code=404, detail="frontend/index.html not found")
    return HTMLResponse(_index_cache, headers={"Cache-Control": "no-store, must-revalidate"})

if config.FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(config.FRONTEND_DIR), html=True), name="frontend")
