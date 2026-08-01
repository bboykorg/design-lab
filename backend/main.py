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

_PATCH_SCRIPTS = (
    "models-patch.js", "model-plan-groups.js", "hide-google-models.js", "model-access-lock.js",
    "plans-patch.js", "plan-lock-ui.js", "profile-patch.js", "profile-id-patch.js",
    "ui-cleanup.js", "iframe-cursor-bridge.js", "design-edit-fix.js",
    "proxy-auth-patch.js", "auth-error-patch.js",
)
_index_cache = None

def _build_index() -> str:
    raw = (config.FRONTEND_DIR / "index.html").read_text(encoding="utf-8")
    missing = [f'<script src="/{name}"></script>' for name in _PATCH_SCRIPTS if name not in raw]
    if not missing:
        return raw
    patch = "\n".join(missing)
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
    return HTMLResponse(_index_cache)

if config.FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(config.FRONTEND_DIR), html=True), name="frontend")
