# -*- coding: utf-8 -*-
"""HTTP-доступ к базе дизайн-скиллов.

Нужен для двух вещей:
1. Фронтенд может показать пользователю, какой скилл применён.
2. Можно быстро проверить движок без траты токенов модели.
"""
from fastapi import APIRouter, Query

from . import design_skills as ds

router = APIRouter(prefix="/api/design", tags=["design"])


@router.get("/stats")
def design_stats():
    """Размер базы: сколько палитр, шрифтов, композиций и комбинаций."""
    return {"available": ds.available(), **ds.stats()}


@router.get("/skill")
def design_skill(
    message: str = Query("", max_length=4000),
    mode: str = Query("scratch"),
    variant: int = Query(0, ge=0, le=99),
    full: bool = Query(False),
):
    """Подбирает дизайн-скилл под запрос.

    full=false — только краткая сводка для интерфейса.
    full=true  — ещё и готовые CSS-токены и текст брифа.
    """
    skill = ds.build_skill(message, mode=mode, variant=variant)
    if not skill:
        return {"available": False}
    out = {"available": True}
    out.update(ds.summary(skill))
    if full:
        out["tokens"] = ds.render_tokens(skill)
        out["brief"] = ds.render_brief(skill)
        out["fontLink"] = skill["font"]["link"]
    return out
