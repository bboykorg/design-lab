"""Admin-only actions that are not exposed to ordinary users."""
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from . import config
from .plans import PLANS, _set_remote

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(x_admin_token: str = Header(None)):
    expected = config.ADMIN_API_TOKEN
    if not expected or not x_admin_token or not secrets.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=404, detail="Not Found")


class GrantPlanIn(BaseModel):
    user_id: str = Field(min_length=1, max_length=200)
    plan: str


@router.post("/plans/grant")
async def grant_plan(body: GrantPlanIn, _admin=Depends(require_admin)):
    """Выдать, сменить или снять тариф через внешний сервис пользователей."""
    user_id = body.user_id.strip()
    plan = body.plan.strip().lower()
    if plan not in PLANS:
        raise HTTPException(status_code=400, detail="Неизвестный тариф")
    if not config.USER_DB_SERVICE_URL or not config.SERVICE_API_TOKEN:
        raise HTTPException(status_code=503, detail="Не настроен сервис пользователей")
    await _set_remote(user_id, plan)
    return {"ok": True, "user_id": user_id, "plan": plan}
