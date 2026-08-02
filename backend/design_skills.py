# -*- coding: utf-8 -*-
"""Движок дизайн-скиллов Design&Lab.

Идея: слабая модель плохо придумывает дизайн-систему с нуля, но хорошо
выполняет конкретные инструкции. Поэтому мы сами выбираем из базы
готовую арт-дирекцию (палитра с проверенным контрастом, шрифтовая пара,
композиция, шкала, форма, движение, микродетали, план секций) и отдаём её
модели готовым CSS-блоком :root. Модели остаётся только вёрстка и текст.

База: frontend/dl-design-kb.json (генерится tools/build_design_kb.py).
Тот же файл использует фронтенд (dl-design-skills.js) — один источник правды
для встроенной модели и для моделей, которые вызываются из браузера.
"""
import hashlib
import json
import pathlib
import re
from typing import Any, Dict, List, Optional

_KB_PATHS = [
    pathlib.Path(__file__).resolve().parents[1] / "frontend" / "dl-design-kb.json",
    pathlib.Path(__file__).resolve().parent / "dl-design-kb.json",
]

_kb: Optional[Dict[str, Any]] = None


def kb() -> Dict[str, Any]:
    """Ленивая загрузка базы. Если файла нет — движок молча отключается."""
    global _kb
    if _kb is None:
        for p in _KB_PATHS:
            try:
                _kb = json.loads(p.read_text(encoding="utf-8"))
                break
            except OSError:
                continue
            except ValueError:
                break
        if _kb is None:
            _kb = {}
    return _kb


def available() -> bool:
    return bool(kb().get("directions"))


def _seed(text: str, salt: str = "") -> int:
    return int(hashlib.sha1((salt + "|" + text).encode("utf-8")).hexdigest()[:12], 16)


def _pick(items: List[Any], n: int):
    return items[n % len(items)] if items else None


def _by_id(items: List[Dict[str, Any]], key: str) -> Dict[str, Dict[str, Any]]:
    return {it[key]: it for it in items}


# ------------------------------------------------------------------ выбор ----

def choose_direction(text: str, n: int) -> Dict[str, Any]:
    """Скоринг арт-дирекций по тексту запроса."""
    data = kb()
    low = " " + (text or "").lower().replace("\u0451", "е") + " "
    scores: Dict[str, float] = {d["id"]: 0.0 for d in data["directions"]}

    for pattern, ids in data.get("industries", {}).items():
        for token in pattern.split("|"):
            token = token.strip().replace("\u0451", "е")
            if token and token in low:
                for i, did in enumerate(ids):
                    if did in scores:
                        scores[did] += 6.0 - i * 0.8
                break

    for d in data["directions"]:
        for kw in d.get("keywords", []):
            if kw.replace("\u0451", "е") in low:
                scores[d["id"]] += 2.2
        if d["name"].lower() in low:
            scores[d["id"]] += 3.0

    moods = detect_moods(low)
    for d in data["directions"]:
        overlap = len(set(moods) & set(d.get("paletteMood", [])))
        scores[d["id"]] += overlap * 1.6

    ranked = sorted(data["directions"], key=lambda d: (-scores[d["id"]], d["id"]))
    top = [d for d in ranked if scores[d["id"]] >= max(scores.values()) - 0.01]
    if scores[ranked[0]["id"]] <= 0:
        # Ничего не угадалось — берём универсальные сильные направления.
        safe = ["swiss", "editorial", "corporate-modern", "minimalmono", "tech", "luxe"]
        pool = [d for d in data["directions"] if d["id"] in safe] or data["directions"]
        return _pick(pool, n)
    return _pick(top, n)


def detect_moods(low: str) -> List[str]:
    found = []
    for mood, words in kb().get("moodWords", {}).items():
        if any(w in low for w in words):
            found.append(mood)
    return found


def choose_palette(direction: Dict[str, Any], text: str, n: int, prefer_dark: Optional[bool] = None) -> Dict[str, Any]:
    data = kb()
    low = " " + (text or "").lower() + " "
    wants = set(direction.get("paletteMood", [])) | set(detect_moods(low))
    if prefer_dark is None:
        if any(w in low for w in ("темн", "тёмн", "dark", "ноч", "черный фон")):
            prefer_dark = True
        elif any(w in low for w in ("светл", "light", "белый фон", "воздушн")):
            prefer_dark = False

    scored = []
    for p in data["palettes"]:
        s = len(wants & set(p.get("mood", []))) * 2.0
        if prefer_dark is True:
            s += 4.0 if p.get("dark") else -6.0
        elif prefer_dark is False:
            s += 4.0 if not p.get("dark") else -6.0
        scored.append((s, p))
    best = max(s for s, _ in scored)
    pool = [p for s, p in scored if s >= best - 0.01]
    return _pick(pool, n)


def choose_font(direction: Dict[str, Any], text: str, n: int) -> Dict[str, Any]:
    data = kb()
    fonts = _by_id(data["fonts"], "id")
    pool = [fonts[f] for f in direction.get("fonts", []) if f in fonts] or data["fonts"]
    # Сайты на кириллице — берём только шрифты с кириллицей, иначе будут квадраты.
    if re.search(r"[\u0430-\u044f\u0451]", (text or "").lower()):
        cyr = [f for f in pool if f.get("cyrillic")]
        if cyr:
            pool = cyr
        else:
            cyr_all = [f for f in data["fonts"] if f.get("cyrillic")]
            pool = cyr_all or pool
    return _pick(pool, n)


def _scale_for(direction: Dict[str, Any], layout_id: str, n: int) -> Dict[str, Any]:
    scales = _by_id(kb()["scales"], "id")
    if layout_id in ("poster", "full-bleed") or direction["id"] in ("brutal", "sport", "nightclub"):
        return scales["poster"]
    if direction["id"] in ("tech", "data", "terminalcore", "corporate-modern"):
        return scales["compact"]
    if direction["id"] in ("calmcare", "luxe", "organic", "education"):
        return scales["calm"]
    if direction["id"] in ("editorial", "craft", "fashion", "travel"):
        return scales["editorial"]
    return _pick(kb()["scales"], n)


def _shape_for(direction: Dict[str, Any], n: int) -> Dict[str, Any]:
    shapes = _by_id(kb()["shapes"], "id")
    hard = ("swiss", "minimalmono", "gallerywhite", "fashion", "editorial", "terminalcore")
    slab = ("brutal", "sport", "nightclub", "cyber", "retro")
    round_ = ("playful", "calmcare", "organic", "appetite")
    if direction["id"] in hard:
        return shapes["sharp"]
    if direction["id"] in slab:
        return shapes["slab"]
    if direction["id"] in round_:
        return shapes["round"]
    return shapes["soft"]


def build_skill(message: str, mode: str = "scratch", variant: int = 0,
                html: str = "") -> Optional[Dict[str, Any]]:
    """Собирает конкретный дизайн-скилл под запрос."""
    if not available():
        return None
    data = kb()
    text = (message or "").strip()
    n = _seed(text.lower(), str(variant))

    direction = choose_direction(text, n)
    palette = choose_palette(direction, text, n >> 3)
    font = choose_font(direction, text, n >> 6)

    layouts = _by_id(data["layouts"], "id")
    lpool = [layouts[l] for l in direction.get("layouts", []) if l in layouts] or data["layouts"]
    layout = _pick(lpool, n >> 9)

    motion = _by_id(data["motion"], "id").get(direction.get("motion"), data["motion"][0])
    texture = _by_id(data["textures"], "id").get(direction.get("texture"), data["textures"][0])
    scale = _scale_for(direction, layout["id"], n >> 12)
    shape = _shape_for(direction, n >> 15)

    details_all = data["details"]
    base = [d for d in details_all if d["id"] in ("focus", "icon-svg", "hairline")]
    rest = [d for d in details_all if d not in base]
    start = (n >> 18) % len(rest)
    extra = [rest[(start + i) % len(rest)] for i in range(4)]
    details = base + extra

    sections_map = _by_id(data["sections"], "id")
    plan = [sections_map[s] for s in direction.get("sections", []) if s in sections_map]

    return {
        "variant": variant,
        "mode": mode,
        "direction": direction,
        "palette": palette,
        "font": font,
        "layout": layout,
        "motion": motion,
        "texture": texture,
        "scale": scale,
        "shape": shape,
        "details": details,
        "plan": plan,
        "checklist": data.get("checklist", []),
    }


# ------------------------------------------------------------------ вывод ----

def render_tokens(skill: Dict[str, Any]) -> str:
    p, f, s, sh = skill["palette"], skill["font"], skill["scale"], skill["shape"]
    m = skill["motion"]
    return "\n".join([
        ":root{",
        f"  --bg: {p['bg']};",
        f"  --surface: {p['surface']};",
        f"  --raised: {p['raised']};",
        f"  --text: {p['text']};",
        f"  --muted: {p['muted']};",
        f"  --border: {p['border']};",
        f"  --accent: {p['accent']};",
        f"  --accent-soft: {p['accentSoft']};",
        f"  --accent-2: {p['accent2']};",
        f"  --on-accent: {p['onAccent']};",
        f"  --font-display: '{f['display']}', Georgia, serif;" if "Serif" in f["display"] or f["display"] in ("Playfair Display", "Cormorant Garamond", "Bodoni Moda", "Prata", "Marcellus", "Gloock", "Fraunces", "Literata", "Lora", "Alegreya", "Merriweather", "Newsreader", "Libre Baskerville")
        else f"  --font-display: '{f['display']}', system-ui, sans-serif;",
        f"  --font-body: '{f['body']}', system-ui, -apple-system, sans-serif;",
        f"  --fs-display: {s['display']};",
        f"  --fs-h2: {s['h2']};",
        f"  --fs-h3: {s['h3']};",
        f"  --fs-body: {s['body']};",
        f"  --fs-small: {s['small']};",
        f"  --lh: {s['lh']};",
        f"  --lh-tight: {s['lhTight']};",
        f"  --tracking-display: {s['tracking']};",
        f"  --measure: {s['measure']};",
        f"  --radius: {sh['radius']};",
        f"  --radius-lg: {sh['radiusLg']};",
        f"  --border-w: {sh['border']};",
        f"  --shadow: {sh['shadow']};",
        "  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;",
        "  --space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px;",
        "  --space-9: 96px; --space-10: 140px;",
        "  --container: 1120px;",
        f"  --ease: {m['easing']};",
        f"  --dur: {m['duration']};",
        "}",
    ])


def render_brief(skill: Optional[Dict[str, Any]]) -> str:
    """Собирает текстовый бриф для системного промпта."""
    if not skill:
        return ""
    d = skill["direction"]
    p, f, l = skill["palette"], skill["font"], skill["layout"]
    m, t, sh = skill["motion"], skill["texture"], skill["shape"]

    plan = "\n".join(f"   {i+1}. {s['name']} — {s['recipe']}" for i, s in enumerate(skill["plan"]))
    details = "\n".join(f"   • {x['text']}" for x in skill["details"])
    check = "\n".join(f"   ☐ {c}" for c in skill["checklist"])

    return f"""
═══════════════════════════════════════════════════════════════════════════
DESIGN&LAB · ГОТОВЫЙ ДИЗАЙН-СКИЛЛ ИЗ БАЗЫ (выбран движком под этот запрос)
═══════════════════════════════════════════════════════════════════════════
Это не рекомендации, а выданная тебе дизайн-система. Твоя работа — безупречно
реализовать её в вёрстке и в тексте. Не придумывай свою палитру и свои шрифты.

1) АРТ-ДИРЕКЦИЯ: {d['name']}
   {d['vibe']}
   Фирменный приём (обязателен, именно он даёт эффект «вау»):
   → {d['signature']}
   Запрет этой дирекции: {d['forbid']}

2) ТОКЕНЫ ДИЗАЙН-СИСТЕМЫ — вставь ЭТОТ блок в <style> СИМВОЛ В СИМВОЛ
   и дальше используй только эти переменные, ни одного цвета мимо них:

{render_tokens(skill)}

   Палитра «{p['name']}» уже проверена на контраст: текст {p['contrast']['text']}:1,
   вторичный {p['contrast']['muted']}:1, акцент {p['contrast']['accent']}:1. Не правь эти hex.
   Фон — {'тёмный' if p['dark'] else 'светлый'}. Акцент используется не более чем на 10% площади экрана.

3) ШРИФТЫ — подключи ровно этот <link> в <head>:
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
   <link rel="stylesheet" href="{f['link']}">
   Дисплейный: {f['display']} — только заголовки и крупные числа.
   Текстовой: {f['body']} — всё остальное. Третьего шрифта нет.

4) КОМПОЗИЦИЯ: {l['name']}
   Первый экран: {l['hero']}
   Сетка дальше: {l['grid']}
   Геометрия: радиус {sh['radius']} (крупные блоки {sh['radiusLg']}), граница {sh['border']}.

5) ПЛАН СЕКЦИЙ (иди сверху вниз, ни одна секция не повторяет соседнюю по композиции):
{plan}

6) ФОН И ТЕКСТУРА: {t['name']}
   {t['recipe']}

7) ДВИЖЕНИЕ: {m['name']} · transition: all var(--dur) var(--ease)
   {m['recipe']}
   Обязательно: @media (prefers-reduced-motion: reduce) отключает всё движение.

8) МИКРОДЕТАЛИ — реализуй все до единой, именно они отличают дорогой сайт от шаблона:
{details}

9) ПРИЁМКА — молча пройдись по списку перед ответом и исправь нарушения:
{check}
═══════════════════════════════════════════════════════════════════════════
""".rstrip()


EDIT_NOTE = """
В РЕЖИМЕ ПРАВКИ дизайн-скилл работает иначе:
• Если пользователь просит точечную правку — НЕ перекрашивай сайт в новую палитру.
  Скилл в этом случае — только эталон качества: правка должна попасть в уже
  существующий язык шаблона (его цвета, его радиусы, его шкала).
• Если пользователь прямо просит редизайн, «сделай красиво», «другой стиль»,
  «другие цвета» — применяй скилл целиком и пересобирай визуал полностью.
• Живые движки, canvas и подключённые скрипты шаблона остаются нетронутыми всегда.
""".strip()


def brief_for(message: str, mode: str = "scratch", variant: int = 0) -> str:
    """Готовый кусок системного промпта для любого режима."""
    skill = build_skill(message, mode=mode, variant=variant)
    if not skill:
        return ""
    brief = render_brief(skill)
    if mode != "scratch":
        brief += "\n\n" + EDIT_NOTE
    return brief


def summary(skill: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Короткое описание скилла для интерфейса."""
    if not skill:
        return {}
    return {
        "direction": skill["direction"]["name"],
        "directionId": skill["direction"]["id"],
        "palette": skill["palette"]["name"],
        "paletteId": skill["palette"]["id"],
        "colors": [skill["palette"][k] for k in ("bg", "surface", "text", "accent", "accent2")],
        "fonts": f"{skill['font']['display']} + {skill['font']['body']}",
        "layout": skill["layout"]["name"],
        "motion": skill["motion"]["name"],
        "texture": skill["texture"]["name"],
        "variant": skill["variant"],
    }


def stats() -> Dict[str, int]:
    data = kb()
    if not data:
        return {}
    combos = (len(data["palettes"]) * len(data["fonts"]) * len(data["layouts"])
              * len(data["scales"]) * len(data["shapes"]))
    return {
        "palettes": len(data["palettes"]),
        "fonts": len(data["fonts"]),
        "layouts": len(data["layouts"]),
        "directions": len(data["directions"]),
        "details": len(data["details"]),
        "sections": len(data["sections"]),
        "combinations": combos,
    }
