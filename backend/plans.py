"""Тарифы: дневной лимит генераций, доступ к моделям и оформление в один клик.

Лимит считается в памяти процесса и сбрасывается каждые сутки по UTC.
Для настоящего биллинга счётчик надо будет перенести в сервис пользователей
(/v1/usage/*), здесь специально одно место, которое потом меняется.
"""
import threading
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from . import config
from . import auth as auth_module
from .auth import require_user
from .ratelimit import guard

router = APIRouter(prefix="/api/plan", tags=["plan"])

# Free ограничивается точными ID моделей, а не провайдером. Иначе через
# разрешённый OpenRouter можно было бы вручную запросить любую платную модель.
# Список должен совпадать с frontend/model-free-set.js.
FREE_MODELS = {
    # OpenRouter free
    "google/gemma-4-31b-it:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "openai/gpt-oss-20b:free",
    "cohere/north-mini-code:free",
    "openrouter/free",
    # Cerebras
    "zai-glm-4.7",
    "gpt-oss-120b",
    "gemma-4-31b",
    # Добавлены в Free по запросу
    "Qwen3.6-35B-A3B",
    "glm-4.6",
    "kiwi::glm-4.6",
    "mistral-large-latest",
    "mistral-large",
    "glm-4.5v",
    "GLM-4.5V",
    "zai-glm-4.5v",
}

PLANS = {
    "free": {
        "title": "Free",
        "price": 0,
        "edits_per_day": config.FREE_DAILY_EDITS,
        "all_models": False,
        "features": [
            "5 генераций в день",
            "Бесплатные модели: Qwen 3.6, GLM-4.6, GLM 4.7, Mistral Large, gpt-oss 120b, Gemma 4",
            "Все 98 шаблонов",
            "Правки страницы в чате",
            "Экспорт HTML одним файлом",
        ],
    },
    "pro": {
        "title": "Pro",
        "price": 990,
        "edits_per_day": 0,
        "all_models": True,
        "features": [
            "Без лимита генераций",
            "Все модели, включая самые сильные",
            "Создание сайта с нуля по описанию",
            "Скриншот как задание: модель читает картинку",
            "Очередь без ожидания",
            "История проектов без ограничений",
        ],
    },
    "team": {
        "title": "Team",
        "price": 2900,
        "edits_per_day": 0,
        "all_models": True,
        "features": [
            "Всё из Pro каждому участнику",
            "До 5 участников в команде",
            "Общие проекты и шаблоны",
            "Свой логотип и цвета в экспорте",
            "Единый счёт на команду",
        ],
    },
}

_lock = threading.Lock()
_usage = {}
# Запасной вариант без внешнего сервиса: тариф живёт до перезапуска.
_override = {}


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _uid(user) -> str:
    return str((user or {}).get("id") or "")


def plan_of(user) -> str:
    uid = _uid(user)
    name = _override.get(uid) or (user or {}).get("plan") or "free"
    return name if name in PLANS else "free"


def _sweep(day: str) -> None:
    for key in list(_usage):
        if key[1] != day:
            _usage.pop(key, None)


def quota(user) -> dict:
    name = plan_of(user)
    limit = PLANS[name]["edits_per_day"]
    used = _usage.get((_uid(user), _today()), 0)
    return {
        "plan": name,
        "title": PLANS[name]["title"],
        "limit": limit,
        "used": used,
        "left": None if not limit else max(limit - used, 0),
    }


def consume_edit(user) -> None:
    """Одна генерация или правка на тарифе с лимитом."""
    name = plan_of(user)
    limit = PLANS[name]["edits_per_day"]
    if not limit:
        return
    day = _today()
    key = (_uid(user), day)
    with _lock:
        _sweep(day)
        used = _usage.get(key, 0)
        if used >= limit:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"На тарифе Free доступно {limit} генераций в сутки. "
                    "Оформи Pro, чтобы снять ограничение."
                ),
            )
        _usage[key] = used + 1


def ensure_model_allowed(user, provider: str, model: str = "") -> None:
    """Проверить точный ID модели; provider оставлен для диагностики/расширения."""
    if PLANS[plan_of(user)]["all_models"]:
        return
    model = (model or "").strip()
    if model not in FREE_MODELS and model.lower() not in {name.lower() for name in FREE_MODELS}:
        raise HTTPException(
            status_code=403,
            detail="Эта модель доступна на тарифе Pro.",
        )


def catalog() -> list:
    out = []
    for name, plan in PLANS.items():
        out.append(
            {
                "id": name,
                "title": plan["title"],
                "price": plan["price"],
                "editsPerDay": plan["edits_per_day"],
                "features": plan["features"],
            }
        )
    return out


class PlanIn(BaseModel):
    plan: str


async def _set_remote(uid: str, plan: str) -> None:
    """Поменять тариф во внешнем сервисе пользователей."""
    path = "cancel" if plan == "free" else "set"
    url = f"{config.USER_DB_SERVICE_URL}/v1/internal/subscriptions/{path}"
    payload = {"user_id": uid, "provider": "manual"}
    if plan != "free":
        payload.update(plan=plan, status="active")
    headers = {"X-Service-Token": config.SERVICE_API_TOKEN}
    try:
        async with httpx.AsyncClient(
            timeout=config.USER_DB_SERVICE_TIMEOUT, follow_redirects=False
        ) as client:
            response = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Сервис пользователей недоступен: {type(exc).__name__}",
        ) from exc
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Сервис пользователей ответил {response.status_code}: {response.text[:200]}",
        )
    # Сбросить кэш сессий, чтобы новый тариф подхватился сразу.
    auth_module._REMOTE_CACHE.clear()


@router.get("")
async def my_plan(user=Depends(require_user)):
    data = quota(user)
    data["plans"] = catalog()
    data["instantCheckout"] = True
    return data


@router.post("/subscribe")
async def subscribe(body: PlanIn, request: Request, user=Depends(require_user)):
    guard("plan", request, user)
    plan = (body.plan or "").strip().lower()
    if plan not in PLANS:
        raise HTTPException(status_code=400, detail="Неизвестный тариф")
    uid = _uid(user)
    if config.USER_DB_SERVICE_URL and config.SERVICE_API_TOKEN:
        await _set_remote(uid, plan)
        _override.pop(uid, None)
    else:
        _override[uid] = plan
    result = quota({"id": uid, "plan": plan})
    result["ok"] = True
    return result
