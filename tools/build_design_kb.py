# -*- coding: utf-8 -*-
"""Генератор базы дизайн-скиллов Design&Lab.

Создаёт frontend/dl-design-kb.json — единый источник правды для
бэкенда (backend/design_skills.py) и фронтенда (frontend/dl-design-skills.js).

Палитры не пишутся руками: они считаются в OKLCH и проходят проверку
контраста WCAG, поэтому любая выданная модели палитра гарантированно
читаемая. Остальные разделы (арт-дирекции, шрифтовые пары, композиции,
микродетали, движение, текстуры, секции) — кураторские.

Запуск:  python3 tools/build_design_kb.py
"""
import json
import math
import pathlib

OUT = pathlib.Path(__file__).resolve().parents[1] / "frontend" / "dl-design-kb.json"

# ---------------------------------------------------------------- цвет ----


def _srgb(c):
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def oklch_to_rgb(L, C, H):
    h = math.radians(H)
    a, b = C * math.cos(h), C * math.sin(h)
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_
    g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_
    bb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_
    return _srgb(r), _srgb(g), _srgb(bb)


def _in_gamut(L, C, H):
    h = math.radians(H)
    a, b = C * math.cos(h), C * math.sin(h)
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_
    g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_
    bb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_
    return all(-0.0005 <= v <= 1.0005 for v in (r, g, bb))


def hexc(L, C, H):
    """OKLCH -> #rrggbb, с автоматическим снижением хромы до попадания в sRGB."""
    c = C
    while c > 0 and not _in_gamut(L, c, H):
        c -= 0.004
    r, g, b = oklch_to_rgb(L, max(c, 0.0), H)
    return "#%02x%02x%02x" % tuple(int(round(max(0.0, min(1.0, v)) * 255)) for v in (r, g, b))


def lum(hx):
    r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def fit_contrast(bg, L, C, H, target=4.6, darker=False):
    """Двигает светлоту, пока пара с фоном не наберёт нужный контраст."""
    step = -0.02 if darker else 0.02
    cur = L
    for _ in range(60):
        hx = hexc(cur, C, H)
        if contrast(bg, hx) >= target:
            return hx
        cur += step
        if not 0.02 < cur < 0.99:
            break
    return hexc(max(0.03, min(0.98, cur)), C, H)


def on_color(hx):
    return "#12100e" if contrast(hx, "#12100e") >= contrast(hx, "#ffffff") else "#ffffff"


# ------------------------------------------------------- семьи оттенков ----
# (id, имя, база hue, хрома акцента, hue второго акцента, настроения)
FAMILIES = [
    ("ink", "Чернильный синий", 258, 0.15, 32, ["доверие", "технологичность", "спокойствие"]),
    ("ultra", "Ультрамарин", 268, 0.19, 96, ["технологичность", "сила"]),
    ("cobalt", "Кобальт", 245, 0.17, 60, ["доверие", "технологичность"]),
    ("teal", "Глубокая бирюза", 195, 0.13, 45, ["спокойствие", "доверие", "свежесть"]),
    ("pine", "Хвойный", 158, 0.12, 70, ["спокойствие", "природа", "доверие"]),
    ("moss", "Мох", 138, 0.10, 60, ["природа", "спокойствие"]),
    ("olive", "Олива", 116, 0.09, 40, ["природа", "крафт", "спокойствие"]),
    ("lime", "Кислотный лайм", 128, 0.20, 260, ["дерзость", "энергия"]),
    ("amber", "Янтарь", 74, 0.15, 250, ["тепло", "энергия", "крафт"]),
    ("clay", "Терракота", 46, 0.12, 200, ["тепло", "крафт", "уют"]),
    ("rust", "Ржавчина", 38, 0.14, 210, ["крафт", "характер", "тепло"]),
    ("ember", "Уголь и пламя", 28, 0.18, 230, ["сила", "энергия", "дерзость"]),
    ("scarlet", "Алый", 22, 0.20, 250, ["дерзость", "энергия", "сила"]),
    ("rose", "Пыльная роза", 6, 0.11, 190, ["нежность", "уют", "премиум"]),
    ("magenta", "Маджента", 348, 0.19, 180, ["дерзость", "креатив"]),
    ("plum", "Слива", 322, 0.13, 90, ["загадочность", "премиум"]),
    ("violet", "Фиалка", 300, 0.14, 140, ["загадочность", "креатив"]),
    ("indigo", "Индиго", 282, 0.13, 70, ["загадочность", "технологичность"]),
    ("sand", "Песок", 82, 0.06, 250, ["спокойствие", "премиум", "минимализм"]),
    ("stone", "Камень", 250, 0.02, 40, ["минимализм", "строгость", "премиум"]),
    ("graphite", "Графит", 265, 0.03, 150, ["строгость", "технологичность", "минимализм"]),
    ("bronze", "Бронза", 62, 0.10, 250, ["премиум", "тепло", "характер"]),
    ("gold", "Матовое золото", 88, 0.12, 260, ["премиум", "роскошь"]),
    ("ice", "Лёд", 220, 0.07, 30, ["свежесть", "спокойствие", "минимализм"]),
    ("aqua", "Аква", 205, 0.16, 340, ["свежесть", "энергия"]),
    ("cyanpunk", "Кибер-циан", 190, 0.18, 320, ["технологичность", "дерзость"]),
    ("forest", "Тёмный лес", 148, 0.14, 84, ["природа", "премиум"]),
    ("wine", "Вино", 12, 0.13, 100, ["премиум", "уют", "характер"]),
]

# (id, имя, режим построения, настроения схемы)
SCHEMES = [
    ("paper", "Тёплая бумага", "light-warm", ["редакционный", "спокойствие", "крафт"]),
    ("mineral", "Минеральный светлый", "light-cool", ["минимализм", "технологичность"]),
    ("ink", "Чернильный тёмный", "dark-deep", ["премиум", "загадочность", "сила"]),
    ("midnight", "Полночь", "dark-soft", ["технологичность", "спокойствие"]),
    ("duotone", "Дуотон-плакат", "bold", ["дерзость", "энергия", "креатив"]),
    ("mono", "Моно + один акцент", "mono", ["строгость", "минимализм", "премиум"]),
]


def build_palette(fam, sch):
    fid, fname, hue, chroma, hue2, fmood = fam
    sid, sname, mode, smood = sch
    pid = f"{fid}-{sid}"
    name = f"{fname} · {sname}"

    if mode == "light-warm":
        bg = hexc(0.972, 0.012, 78)
        surface = hexc(0.945, 0.016, 76)
        raised = hexc(0.912, 0.018, 74)
        text = fit_contrast(bg, 0.26, 0.03, hue, 11.0, darker=True)
        muted = fit_contrast(bg, 0.55, 0.02, hue, 4.6, darker=True)
        border = hexc(0.882, 0.014, 76)
        accent = fit_contrast(bg, 0.52, chroma, hue, 4.6, darker=True)
        accent2 = fit_contrast(bg, 0.55, chroma * 0.7, hue2, 4.6, darker=True)
        soft = hexc(0.94, min(chroma * 0.34, 0.05), hue)
        dark = False
    elif mode == "light-cool":
        bg = hexc(0.988, 0.004, 250)
        surface = hexc(0.964, 0.006, 248)
        raised = hexc(0.934, 0.008, 248)
        text = fit_contrast(bg, 0.24, 0.02, hue, 12.0, darker=True)
        muted = fit_contrast(bg, 0.56, 0.015, hue, 4.6, darker=True)
        border = hexc(0.902, 0.006, 250)
        accent = fit_contrast(bg, 0.54, chroma, hue, 4.6, darker=True)
        accent2 = fit_contrast(bg, 0.56, chroma * 0.75, hue2, 4.6, darker=True)
        soft = hexc(0.955, min(chroma * 0.30, 0.045), hue)
        dark = False
    elif mode == "dark-deep":
        bg = hexc(0.185, 0.022, hue)
        surface = hexc(0.232, 0.024, hue)
        raised = hexc(0.292, 0.026, hue)
        text = fit_contrast(bg, 0.965, 0.008, hue, 12.0)
        muted = fit_contrast(bg, 0.74, 0.012, hue, 4.6)
        border = hexc(0.345, 0.024, hue)
        accent = fit_contrast(bg, 0.76, chroma, hue, 4.6)
        accent2 = fit_contrast(bg, 0.78, chroma * 0.8, hue2, 4.6)
        soft = hexc(0.30, min(chroma * 0.45, 0.07), hue)
        dark = True
    elif mode == "dark-soft":
        bg = hexc(0.225, 0.010, 262)
        surface = hexc(0.268, 0.012, 262)
        raised = hexc(0.325, 0.014, 262)
        text = fit_contrast(bg, 0.958, 0.006, 262, 12.0)
        muted = fit_contrast(bg, 0.73, 0.010, 262, 4.6)
        border = hexc(0.372, 0.012, 262)
        accent = fit_contrast(bg, 0.78, chroma, hue, 4.6)
        accent2 = fit_contrast(bg, 0.80, chroma * 0.7, hue2, 4.6)
        soft = hexc(0.32, min(chroma * 0.40, 0.06), hue)
        dark = True
    elif mode == "bold":
        bg = hexc(0.955, min(chroma * 0.30, 0.055), hue)
        surface = hexc(0.915, min(chroma * 0.36, 0.07), hue)
        raised = hexc(0.868, min(chroma * 0.40, 0.08), hue)
        text = fit_contrast(bg, 0.24, min(chroma * 0.55, 0.09), hue, 11.0, darker=True)
        muted = fit_contrast(bg, 0.52, min(chroma * 0.40, 0.06), hue, 4.6, darker=True)
        border = hexc(0.845, min(chroma * 0.42, 0.085), hue)
        accent = fit_contrast(bg, 0.56, chroma * 1.05, hue, 4.6, darker=True)
        accent2 = fit_contrast(bg, 0.50, chroma * 0.95, hue2, 4.6, darker=True)
        soft = hexc(0.90, min(chroma * 0.42, 0.085), hue2)
        dark = False
    else:  # mono
        bg = hexc(0.968, 0.003, hue)
        surface = hexc(0.938, 0.004, hue)
        raised = hexc(0.902, 0.005, hue)
        text = fit_contrast(bg, 0.20, 0.008, hue, 14.0, darker=True)
        muted = fit_contrast(bg, 0.54, 0.008, hue, 4.6, darker=True)
        border = hexc(0.878, 0.004, hue)
        accent = fit_contrast(bg, 0.52, chroma * 1.1, hue, 4.6, darker=True)
        accent2 = fit_contrast(bg, 0.42, 0.012, hue, 7.0, darker=True)
        soft = hexc(0.94, min(chroma * 0.28, 0.04), hue)
        dark = False

    pal = {
        "id": pid,
        "name": name,
        "family": fid,
        "scheme": sid,
        "dark": dark,
        "mood": sorted(set(fmood + smood)),
        "bg": bg,
        "surface": surface,
        "raised": raised,
        "text": text,
        "muted": muted,
        "border": border,
        "accent": accent,
        "accentSoft": soft,
        "accent2": accent2,
        "onAccent": on_color(accent),
        "onAccent2": on_color(accent2),
    }
    pal["contrast"] = {
        "text": round(contrast(bg, text), 2),
        "muted": round(contrast(bg, muted), 2),
        "accent": round(contrast(bg, accent), 2),
        "accent2": round(contrast(bg, accent2), 2),
        "onAccent": round(contrast(accent, pal["onAccent"]), 2),
    }
    return pal


PALETTES = [build_palette(f, s) for f in FAMILIES for s in SCHEMES]

# ------------------------------------------------------------- шрифты ----
# (id, display, body, google-query, настроения, кириллица, шкала)
FONTS = [
    ("instrument", "Instrument Serif", "Inter", "Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600", ["редакционный", "премиум", "спокойствие"], False),
    ("playfair-golos", "Playfair Display", "Golos Text", "Playfair+Display:wght@500;700;900&family=Golos+Text:wght@400;500;600", ["премиум", "редакционный", "роскошь"], True),
    ("bricolage", "Bricolage Grotesque", "Inter", "Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@400;500;600", ["креатив", "характер", "дерзость"], False),
    ("space", "Space Grotesk", "IBM Plex Sans", "Space+Grotesk:wght@400;500;700&family=IBM+Plex+Sans:wght@400;500;600", ["технологичность", "минимализм"], True),
    ("archivo", "Archivo Black", "Archivo", "Archivo+Black&family=Archivo:wght@400;500;600;700", ["сила", "дерзость", "строгость"], False),
    ("sora", "Sora", "Inter", "Sora:wght@400;600;800&family=Inter:wght@400;500;600", ["технологичность", "минимализм"], False),
    ("manrope", "Manrope", "Manrope", "Manrope:wght@400;500;700;800", ["минимализм", "спокойствие", "технологичность"], True),
    ("fraunces", "Fraunces", "Work Sans", "Fraunces:opsz,wght@9..144,400..900&family=Work+Sans:wght@400;500;600", ["крафт", "уют", "характер"], False),
    ("dmserif", "DM Serif Display", "DM Sans", "DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400..700", ["премиум", "редакционный"], True),
    ("syne", "Syne", "Inter", "Syne:wght@600;700;800&family=Inter:wght@400;500;600", ["креатив", "дерзость", "характер"], False),
    ("unbounded", "Unbounded", "Golos Text", "Unbounded:wght@500;700;900&family=Golos+Text:wght@400;500;600", ["дерзость", "энергия", "креатив"], True),
    ("libre", "Libre Baskerville", "Source Sans 3", "Libre+Baskerville:wght@400;700&family=Source+Sans+3:wght@400;500;600", ["редакционный", "доверие"], False),
    ("cormorant", "Cormorant Garamond", "Jost", "Cormorant+Garamond:wght@300;500;700&family=Jost:wght@300;400;500", ["роскошь", "нежность", "премиум"], True),
    ("bodoni", "Bodoni Moda", "Karla", "Bodoni+Moda:opsz,wght@6..96,400..900&family=Karla:wght@400;500;700", ["роскошь", "мода", "премиум"], False),
    ("outfit", "Outfit", "Outfit", "Outfit:wght@300;400;600;800", ["минимализм", "свежесть"], True),
    ("epilogue", "Epilogue", "Epilogue", "Epilogue:wght@400;600;800", ["строгость", "минимализм"], False),
    ("newsreader", "Newsreader", "Public Sans", "Newsreader:opsz,wght@6..72,400..700&family=Public+Sans:wght@400;500;600", ["редакционный", "доверие"], False),
    ("bebas", "Bebas Neue", "Barlow", "Bebas+Neue&family=Barlow:wght@400;500;600", ["энергия", "сила", "спорт"], True),
    ("oswald", "Oswald", "Lato", "Oswald:wght@400;600;700&family=Lato:wght@400;700", ["сила", "спорт", "строгость"], True),
    ("plex", "IBM Plex Serif", "IBM Plex Sans", "IBM+Plex+Serif:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600", ["технологичность", "доверие"], True),
    ("jetbrains", "JetBrains Mono", "Inter", "JetBrains+Mono:wght@400;600&family=Inter:wght@400;500;600", ["технологичность", "строгость"], True),
    ("spacemono", "Space Mono", "Space Grotesk", "Space+Mono:wght@400;700&family=Space+Grotesk:wght@400;500;700", ["технологичность", "креатив"], False),
    ("marcellus", "Marcellus", "Mulish", "Marcellus&family=Mulish:wght@400;500;700", ["роскошь", "спокойствие"], False),
    ("bigshoulders", "Big Shoulders Display", "Inter", "Big+Shoulders+Display:wght@500;700;900&family=Inter:wght@400;500;600", ["сила", "дерзость", "спорт"], False),
    ("gloock", "Gloock", "Inter", "Gloock&family=Inter:wght@400;500;600", ["редакционный", "характер", "мода"], False),
    ("prata", "Prata", "Inter", "Prata&family=Inter:wght@400;500;600", ["роскошь", "премиум"], True),
    ("literata", "Literata", "Figtree", "Literata:opsz,wght@7..72,400..700&family=Figtree:wght@400;500;700", ["доверие", "спокойствие", "редакционный"], True),
    ("michroma", "Michroma", "Inter", "Michroma&family=Inter:wght@400;500;600", ["технологичность", "загадочность"], False),
    ("orbitron", "Orbitron", "Rajdhani", "Orbitron:wght@500;700;900&family=Rajdhani:wght@400;500;600", ["технологичность", "игры"], False),
    ("merriweather", "Merriweather", "Source Sans 3", "Merriweather:wght@400;700;900&family=Source+Sans+3:wght@400;500;600", ["доверие", "редакционный"], True),
    ("ptserif", "PT Serif", "PT Sans", "PT+Serif:wght@400;700&family=PT+Sans:wght@400;700", ["доверие", "спокойствие"], True),
    ("onest", "Onest", "Onest", "Onest:wght@400;500;700;900", ["минимализм", "свежесть", "технологичность"], True),
    ("golos", "Golos Text", "Golos Text", "Golos+Text:wght@400;500;600;800", ["минимализм", "доверие"], True),
    ("rubikmono", "Rubik Mono One", "Rubik", "Rubik+Mono+One&family=Rubik:wght@400;500;700", ["дерзость", "энергия"], True),
    ("krona", "Krona One", "Inter", "Krona+One&family=Inter:wght@400;500;600", ["характер", "строгость"], False),
    ("alegreya", "Alegreya", "Alegreya Sans", "Alegreya:wght@400;700;900&family=Alegreya+Sans:wght@400;500;700", ["крафт", "уют", "природа"], True),
    ("lora", "Lora", "Nunito Sans", "Lora:wght@400;600;700&family=Nunito+Sans:opsz,wght@6..12,400..700", ["уют", "нежность", "спокойствие"], True),
    ("anton", "Anton", "Roboto", "Anton&family=Roboto:wght@400;500;700", ["сила", "спорт", "дерзость"], True),
    ("chivo", "Chivo", "Chivo", "Chivo:wght@400;600;900", ["строгость", "спорт"], True),
    ("familjen", "Familjen Grotesk", "Inter", "Familjen+Grotesk:wght@400;600;700&family=Inter:wght@400;500;600", ["минимализм", "характер"], False),
    ("sen", "Sen", "Sen", "Sen:wght@400;600;800", ["свежесть", "минимализм"], False),
    ("nunito", "Baloo 2", "Nunito", "Baloo+2:wght@500;700;800&family=Nunito:wght@400;600;700", ["уют", "детский", "нежность"], True),
]

FONTS = [
    {
        "id": f[0],
        "display": f[1],
        "body": f[2],
        "link": "https://fonts.googleapis.com/css2?family=" + f[3] + "&display=swap",
        "mood": f[4],
        "cyrillic": f[5],
    }
    for f in FONTS
]

# ---------------------------------------------------------- композиции ----
LAYOUTS = [
    ("split-editorial", "Сплит-экран, редакционный",
     "Экран делится 55/45: слева крупный заголовок в 2–3 строки, кикер и две кнопки; справа полноразмерный визуал до края вьюпорта.",
     "Контент в 12-колонках, текст живёт в 1–7, визуал в 8–12; секции чередуют сторону визуала."),
    ("stacked-type", "Типографический стек",
     "Hero без картинки: заголовок clamp(48px, 9vw, 140px) на 2 строки, под ним одна строка описания шириной 40ch и inline-ссылка со стрелкой.",
     "Одна колонка 760px по центру, разделители-hairline, крупные пустоты между секциями (96–140px)."),
    ("asym-grid", "Асимметричная сетка",
     "Заголовок в левых 7 колонках, справа — вертикальный блок с 3 фактами и цифрами.",
     "12 колонок, блоки разной ширины (5/7, 8/4, 6/6), ни одна секция не повторяет предыдущую пропорцию."),
    ("sidebar-nav", "Боковая навигация",
     "Слева фиксированная колонка 240px: логотип, вертикальное меню, контакты. Справа — скроллящийся контент.",
     "На мобильном колонка превращается в верхнюю липкую панель; контент — одна колонка."),
    ("magazine", "Журнальный разворот",
     "Крупная шапка-титул на всю ширину, под ней три неравные колонки: лид, изображение, врез с цитатой.",
     "Колонки 4/5/3, буквица в лиде, подписи мелким кеглем и капсом с трекингом."),
    ("full-bleed", "Полноэкранный визуал",
     "Первый экран — визуал/CSS-градиентная сцена на 100svh, текст в нижней трети поверх затемнения.",
     "Дальше — обычная сетка 1120px; ещё один full-bleed повторяется ровно один раз в середине."),
    ("card-rail", "Горизонтальные ленты",
     "Компактный hero (60svh) + сразу лента карточек с горизонтальным скроллом и snap.",
     "Ленты чередуются с обычными секциями; на мобильном сохраняют scroll-snap-type: x mandatory."),
    ("bento", "Бенто-сетка",
     "Hero — бенто из 5 плиток разного размера: главная плитка с заголовком 2x2, остальные — факты, цифра, мини-визуал.",
     "grid-template-columns: repeat(6, 1fr); плитки 4x2, 2x2, 3x1, 3x1, 6x1. На мобильном — 1 колонка."),
    ("sticky-scenes", "Липкие сцены",
     "Заголовок position: sticky слева, справа проходят 3–4 сцены-объяснения.",
     "grid 5/7, sticky top: 96px; на мобильном sticky отключается."),
    ("poster", "Плакат",
     "Первый экран — плакат: гигантское слово/фраза, дата или подзаголовок в углах, тонкая рамка по периметру.",
     "Дальше — плотная сетка с толстыми разделителями 2px и крупными подписями капсом."),
    ("dashboard", "Продуктовый дашборд",
     "Hero: слева обещание продукта, справа реалистичный макет интерфейса, собранный чистым HTML/CSS (панель, строки, мини-график на SVG).",
     "Секции: метрики 4 в ряд, таблица, шаги интеграции; плотность выше средней, radius 10–12px."),
    ("centered-luxe", "Центрированная роскошь",
     "Узкий центрированный hero: тонкая надпись капсом с трекингом .3em, под ней светлый серифный заголовок, много воздуха сверху и снизу.",
     "Максимум 980px, симметрия, ритм секций одинаковый — благородная монотонность."),
    ("zigzag", "Зигзаг блоков",
     "Hero 50/50, дальше секции чередуют сторону визуала.",
     "Между блоками — тонкая линия и номер секции (01, 02, 03) мелким моно-шрифтом."),
    ("terminal", "Терминальный",
     "Hero похож на консоль: моноширинная строка-приглашение, курсор, короткий вывод-описание.",
     "Сетка строгая, обводки 1px, всё выровнено по базовой линии моношрифта."),
    ("gallery-grid", "Галерейная сетка",
     "Hero — короткая строка-манифест, сразу под ней сетка работ 3xN с разной высотой карточек (masonry-эффект через grid-row-end).",
     "Подписи под карточками мелко, hover — лёгкий подъём и раскрытие подписи."),
]
LAYOUTS = [{"id": l[0], "name": l[1], "hero": l[2], "grid": l[3]} for l in LAYOUTS]

# ------------------------------------------------------------ движение ----
MOTION = [
    ("calm", "Спокойное", "cubic-bezier(.22,.61,.36,1)", "220ms",
     "Появление секций: opacity 0→1 + translateY(16px→0) через IntersectionObserver, stagger 60ms. Hover — только изменение цвета и подчёркивания."),
    ("snappy", "Резкое и точное", "cubic-bezier(.2,.9,.25,1)", "150ms",
     "Мгновенный отклик: hover сдвигает элемент на 2px, активное состояние возвращает на 0. Никаких длинных анимаций."),
    ("cinematic", "Кинематографичное", "cubic-bezier(.16,1,.3,1)", "620ms",
     "Медленное раскрытие: clip-path inset(0 0 100% 0) → inset(0), лёгкий параллакс фона на scroll (transform: translate3d) с шагом не больше 40px."),
    ("mechanical", "Механическое", "steps(6, end)", "180ms",
     "Ступенчатые переходы, счётчики цифр, мигающий курсор. Только для технической и терминальной эстетики."),
    ("organic", "Органичное", "cubic-bezier(.34,1.56,.64,1)", "420ms",
     "Лёгкий overshoot на карточках и кнопках, плавное всплытие изображений, дыхание фонового градиента 12s ease-in-out infinite alternate."),
    ("editorial", "Редакционное", "cubic-bezier(.4,0,.2,1)", "260ms",
     "Текст выезжает по строкам (overflow: hidden + translateY(100%)), изображения проявляются через scale(1.06)→scale(1)."),
]
MOTION = [{"id": m[0], "name": m[1], "easing": m[2], "duration": m[3], "recipe": m[4]} for m in MOTION]

# ------------------------------------------------------- микро-детали ----
DETAILS = [
    ("hairline", "Хайрлайны вместо теней: border: 1px solid var(--border); тени только на интерактивных всплывающих элементах."),
    ("numbered", "Нумерация секций мелким моношрифтом (01 / 02 / 03) в левом поле, opacity .5, letter-spacing .12em."),
    ("kicker", "Кикер над каждым заголовком: 12px, uppercase, letter-spacing .18em, цвет muted, перед ним короткая линия 24px."),
    ("underline", "Ссылки с анимированным подчёркиванием: background-image linear-gradient, background-size 0% 1px → 100% 1px на hover."),
    ("arrowlink", "Инлайн-ссылка со стрелкой →, которая на hover уезжает вправо на 4px (transform, не margin)."),
    ("noise", "Плёночный шум: ::after с SVG feTurbulence, opacity .035, pointer-events:none, mix-blend-mode: overlay."),
    ("grain-border", "Крупные цифры-статистики: tabular-nums, font-variant-numeric, вес 700, под ними подпись 13px muted."),
    ("marquee", "Бегущая строка с ключевыми словами: два одинаковых блока и animation: scroll 30s linear infinite; на prefers-reduced-motion — статична."),
    ("focus", ":focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; } на всех интерактивных элементах."),
    ("selection", "::selection { background: var(--accent); color: var(--on-accent); } — мелочь, которую замечают."),
    ("sticky-header", "Шапка на 64px с backdrop-filter: blur(10px) и границей снизу, появляющейся только после скролла 40px."),
    ("icon-svg", "Иконки — inline SVG 20x20, stroke-width 1.5, currentColor, никаких эмодзи и иконочных шрифтов."),
    ("badge", "Бейджи-статусы: 11px, uppercase, padding 4px 8px, радиус 999px, фон accentSoft, текст accent."),
    ("quote", "Цитата без кавычек-картинок: крупный текст 24–28px, слева линия 2px accent, автор мелко и капсом."),
    ("table", "Сравнительная таблица без вертикальных линий: только горизонтальные hairline и zebra через surface."),
    ("cursor-dot", "Кастомный курсор-точка (только на устройствах с hover): 8px кружок, mix-blend-mode: difference, follow с lerp .18."),
    ("scroll-progress", "Тонкий индикатор прокрутки 2px сверху страницы цветом accent."),
    ("figcaption", "Подписи к визуалам: 12px, muted, с левым отступом-линией; создают редакционное ощущение."),
    ("corner-marks", "Угловые метки-крестики на ключевых блоках (::before/::after 8px линии) — техническая аккуратность."),
    ("gradient-text", "Один и только один градиентный текст на странице — на самом сильном слове заголовка."),
    ("card-hover", "Карточка на hover: border меняется на accent, translateY(-2px), внутренний визуал scale(1.03) с overflow:hidden."),
    ("empty-space", "Осознанная пустота: минимум одна секция, где занято меньше половины экрана."),
    ("dotgrid", "Фон-подложка из точечной сетки: radial-gradient(currentColor 1px, transparent 1px) 24px, opacity .12."),
    ("stripe", "Диагональная штриховка repeating-linear-gradient 45deg для служебных зон и заглушек."),
]
DETAILS = [{"id": d[0], "text": d[1]} for d in DETAILS]

# ------------------------------------------------------------ текстуры ----
TEXTURES = [
    ("none", "Чистый фон", "Ровная заливка var(--bg) без эффектов. Работает всегда."),
    ("grain", "Плёночное зерно", "Слой ::after с SVG-шумом feTurbulence baseFrequency .8, opacity .04."),
    ("mesh", "Мягкая мешь-подсветка", "Два radial-gradient из accentSoft в углах, blur не нужен, opacity .5."),
    ("grid", "Техническая сетка", "linear-gradient линии 1px через 64px, цвет border, маска radial-gradient к краям."),
    ("paper", "Бумага", "Тёплый фон + едва заметная горизонтальная линовка через repeating-linear-gradient 32px, opacity .35."),
    ("halo", "Ореол за героем", "Один большой radial-gradient за заголовком, цвет accent при opacity .12, radius 60vw."),
    ("blueprint", "Чертёж", "Тёмный фон + сетка 24px линиями accent при opacity .10 + угловые метки."),
    ("canvas-fluid", "Живой canvas", "Если в шаблоне уже есть <canvas> и его движок — оставить как есть, ничего не рисовать поверх."),
]
TEXTURES = [{"id": t[0], "name": t[1], "recipe": t[2]} for t in TEXTURES]

# ------------------------------------------------------------- секции ----
SECTIONS = [
    ("hero", "Герой", "Одно обещание в 5–9 словах, подзаголовок 1–2 строки, основная и вторичная кнопка, один якорь доверия рядом."),
    ("proof-bar", "Полоса доверия", "Ряд из 4–6 логотипов/фактов мелким кеглем сразу под героем, разделители — точки или хайрлайны."),
    ("stats", "Цифры", "3–4 крупных числа с короткими подписями; числа набраны дисплейным шрифтом, tabular-nums."),
    ("features-asym", "Возможности асимметрично", "Не три одинаковые карточки: одна большая плитка + две узкие, разные внутренние композиции."),
    ("process", "Процесс", "3–5 шагов с номерами, соединённые вертикальной или горизонтальной линией."),
    ("showcase", "Витрина работ", "Сетка кейсов с разной высотой, подпись и метка категории; hover раскрывает детали."),
    ("story", "История / о нас", "Крупный текстовый блок 60–70ch с буквицей, справа — фото или факт-врез."),
    ("quote", "Отзыв", "Один сильный отзыв крупно вместо трёх пустых; имя, должность, компания мелким капсом."),
    ("pricing", "Тарифы", "2–3 плана, один выделен рамкой accent и бейджем, без агрессивных теней; список — с SVG-галочками."),
    ("faq", "Вопросы", "Нативные <details>/<summary> с плавным раскрытием и знаком +/−, хайрлайны между пунктами."),
    ("team", "Команда", "Портреты в одинаковых пропорциях, имя, роль и одна человеческая деталь."),
    ("menu", "Меню / прайс-лист", "Двухколоночный список: название и цена, соединённые точечной линией leader dots."),
    ("gallery", "Галерея", "Сетка изображений с разной шириной, lazy-loading, подписи под кадрами."),
    ("map-contact", "Контакты", "Адрес, часы, телефон, форма из 3 полей максимум; кнопка отправки с локальным подтверждением."),
    ("cta", "Финальный призыв", "Отдельная секция контрастным фоном, одна мысль и одна кнопка. Никаких дополнительных ссылок."),
    ("footer", "Подвал", "Три колонки: навигация, контакты, правовая строка. Крупный логотип-подпись внизу допустим."),
    ("spec", "Характеристики", "Таблица параметров, моношрифт для значений, hairline-строки."),
    ("timeline", "Таймлайн", "Хронология по годам с левой линией и точками; на мобильном линия уходит влево на 12px."),
    ("compare", "Сравнение", "Две колонки «было / стало» или «мы / другие», разделённые вертикальным хайрлайном."),
    ("integrations", "Интеграции", "Сетка иконок 6–12 с названиями; hover подсвечивает границу."),
]
SECTIONS = [{"id": s[0], "name": s[1], "recipe": s[2]} for s in SECTIONS]

# -------------------------------------------------------- арт-дирекции ----
# (id, имя, суть, палитра-настроения, шрифты, layouts, motion, texture,
#  секции, ключевые слова, фирменный приём, запреты)
DIRECTIONS = [
    ("swiss", "Швейцарская сетка",
     "Строгий порядок, крупный гротеск, много воздуха, ничего лишнего. Красота из пропорций, а не из декора.",
     ["минимализм", "строгость"], ["epilogue", "familjen", "space", "golos", "onest"],
     ["asym-grid", "stacked-type", "zigzag"], "snappy", "none",
     ["hero", "proof-bar", "features-asym", "process", "stats", "cta", "footer"],
     ["студия", "агентство", "консалтинг", "b2b", "портфолио", "минимализм"],
     "Заголовок прижат к левому краю сетки и занимает ровно 7 из 12 колонок; правое поле остаётся пустым намеренно.",
     "Никаких скруглений больше 8px, никаких теней, никакого центрирования текста."),
    ("editorial", "Редакционный журнал",
     "Сайт читается как хороший журнал: типографика ведёт, изображения подчинены тексту, есть ритм разворотов.",
     ["редакционный", "спокойствие"], ["instrument", "newsreader", "gloock", "playfair-golos", "literata"],
     ["magazine", "stacked-type", "sticky-scenes"], "editorial", "paper",
     ["hero", "story", "gallery", "quote", "timeline", "cta", "footer"],
     ["блог", "медиа", "журнал", "книга", "история", "культура", "музей"],
     "Буквица на первом абзаце и врезы-цитаты, выходящие в поле страницы.",
     "Не использовать карточки-плитки как основной способ подачи текста."),
    ("luxe", "Тихая роскошь",
     "Сдержанная дороговизна: воздух, тонкие линии, серифный дисплей, приглушённый металлический акцент.",
     ["роскошь", "премиум"], ["cormorant", "marcellus", "prata", "bodoni", "playfair-golos"],
     ["centered-luxe", "full-bleed", "gallery-grid"], "cinematic", "halo",
     ["hero", "story", "showcase", "quote", "pricing", "map-contact", "footer"],
     ["отель", "ювелир", "яхта", "вилла", "свадьба", "парфюм", "люкс", "премиум", "спа", "ресторан"],
     "Огромные поля: контент занимает не больше 62% ширины экрана, остальное — воздух.",
     "Запрещены яркие насыщенные кнопки, тени и любые градиенты в тексте."),
    ("brutal", "Новый бруталист",
     "Жёсткая сетка, толстые линии, гигантский шрифт, контрастные плоские цвета. Дизайн, который кричит характером.",
     ["дерзость", "энергия"], ["archivo", "anton", "rubikmono", "bigshoulders", "unbounded"],
     ["poster", "bento", "card-rail"], "snappy", "stripe" if False else "grid",
     ["hero", "stats", "features-asym", "showcase", "faq", "cta", "footer"],
     ["агентство", "креатив", "музыка", "мерч", "стрит", "молодёж", "промо", "фестиваль"],
     "Границы 2px и полное отсутствие полутонов: элемент либо на фоне, либо на акценте.",
     "Никаких мягких теней, blur и полупрозрачности."),
    ("tech", "Технологичный продукт",
     "Инженерная ясность: плотная сетка, точные подписи, макет интерфейса вместо абстракций.",
     ["технологичность", "доверие"], ["space", "sora", "plex", "onest", "manrope"],
     ["dashboard", "bento", "sticky-scenes"], "snappy", "grid",
     ["hero", "proof-bar", "features-asym", "integrations", "spec", "pricing", "faq", "cta", "footer"],
     ["saas", "платформа", "стартап", "дашборд", "api", "аналитика", "crm", "сервис", "приложение", "ии", "нейросет"],
     "Реалистичный макет продукта в герое, собранный из HTML/CSS: панель, строки данных, SVG-график.",
     "Никаких абстрактных «AI-шаров», неонового свечения и стоковых 3D-фигур."),
    ("terminalcore", "Терминал",
     "Моноширинная эстетика инженерного инструмента: строки-приглашения, тонкие рамки, ноль декора.",
     ["технологичность", "строгость"], ["jetbrains", "spacemono", "plex"],
     ["terminal", "dashboard", "stacked-type"], "mechanical", "grid",
     ["hero", "spec", "process", "integrations", "faq", "cta", "footer"],
     ["devtool", "разработчик", "код", "опенсорс", "инфраструктура", "кибербез", "хостинг"],
     "Курсор-каретка, мигающая через animation: blink 1.06s steps(2) infinite.",
     "Не смешивать с серифами и мягкими скруглениями."),
    ("cinema", "Кинематографичный",
     "Тёмная сцена, крупный кадр, медленное раскрытие, ощущение трейлера.",
     ["загадочность", "премиум", "сила"], ["michroma", "krona", "bodoni", "instrument", "unbounded"],
     ["full-bleed", "sticky-scenes", "poster"], "cinematic", "halo",
     ["hero", "story", "showcase", "stats", "quote", "cta", "footer"],
     ["кино", "продакшн", "видео", "игра", "трейлер", "клип", "фотограф"],
     "Один полноэкранный кадр с текстом в нижней трети и градиентной вуалью снизу.",
     "Не более одного полноэкранного кадра сверх героя."),
    ("organic", "Органика и природа",
     "Тёплые минеральные цвета, мягкие формы, живые фотографии, ощущение материала.",
     ["природа", "уют", "крафт"], ["fraunces", "alegreya", "lora", "literata"],
     ["zigzag", "magazine", "gallery-grid"], "organic", "paper",
     ["hero", "story", "features-asym", "gallery", "quote", "map-contact", "footer"],
     ["эко", "ферма", "сад", "чай", "кофе", "пекарня", "крафт", "косметика", "йога", "винодель"],
     "Скругления 16–24px только у изображений, у текстовых блоков — прямые углы.",
     "Никаких кислотных цветов и жёстких неоновых акцентов."),
    ("appetite", "Аппетитный",
     "Еда крупным планом, тёплый свет, вкусная типографика, ясные цены.",
     ["тепло", "уют", "энергия"], ["fraunces", "playfair-golos", "alegreya", "nunito"],
     ["full-bleed", "zigzag", "card-rail"], "organic", "grain",
     ["hero", "menu", "gallery", "quote", "map-contact", "cta", "footer"],
     ["кафе", "ресторан", "кофейн", "бар", "пицц", "суши", "еда", "кухня", "доставка", "кондитер", "бургер"],
     "Меню двумя колонками с leader-dots между названием и ценой.",
     "Не прятать цены и адрес; никаких серых холодных фонов."),
    ("sport", "Спортивная энергия",
     "Диагонали, курсив, крупные числа, ощущение скорости и усилия.",
     ["энергия", "сила", "спорт"], ["bebas", "oswald", "anton", "chivo", "bigshoulders"],
     ["poster", "card-rail", "full-bleed"], "snappy", "stripe" if False else "grid",
     ["hero", "stats", "process", "pricing", "team", "cta", "footer"],
     ["фитнес", "спорт", "зал", "тренер", "бег", "бокс", "кроссфит", "мото", "авто", "гонк"],
     "Числа-рекорды в 2 раза крупнее заголовков секций, набраны дисплейным шрифтом.",
     "Не использовать нежные пастельные палитры и тонкие начертания."),
    ("calmcare", "Спокойная забота",
     "Мягкий свет, воздух, округлые формы, доверительный тон. Медицина, велнес, психология.",
     ["спокойствие", "нежность", "доверие"], ["literata", "manrope", "outfit", "lora", "golos"],
     ["centered-luxe", "zigzag", "sticky-scenes"], "calm", "mesh",
     ["hero", "proof-bar", "features-asym", "process", "team", "faq", "map-contact", "footer"],
     ["клиник", "медицин", "стоматолог", "психолог", "велнес", "спа", "массаж", "йога", "здоровь", "реабилит"],
     "Скругления 14px, мягкие тени только на карточках записи, крупные читаемые 18px тексты.",
     "Никакой агрессии: без чёрных фонов, кричащих кнопок и капса в заголовках."),
    ("trust", "Институциональное доверие",
     "Финансы, право, B2B: строгая сетка, серифный акцент, цифры и факты вместо эмоций.",
     ["доверие", "строгость", "премиум"], ["newsreader", "ptserif", "merriweather", "plex", "literata"],
     ["asym-grid", "dashboard", "magazine"], "calm", "none",
     ["hero", "proof-bar", "stats", "features-asym", "compare", "team", "faq", "map-contact", "footer"],
     ["банк", "финанс", "инвест", "юрист", "адвокат", "страхов", "аудит", "бухгалтер", "недвижим", "фонд"],
     "Крупные проверяемые цифры и подпись-источник мелким кеглем под ними.",
     "Без сленга, без градиентных кнопок, без анимаций дольше 300ms."),
    ("playful", "Игровой и дружелюбный",
     "Живые цвета, округлые формы, лёгкая иллюстративность, человеческий язык.",
     ["энергия", "уют", "нежность"], ["nunito", "outfit", "sen", "syne"],
     ["bento", "card-rail", "zigzag"], "organic", "mesh",
     ["hero", "features-asym", "process", "gallery", "faq", "cta", "footer"],
     ["детск", "школ", "курс", "игрушк", "праздник", "аниматор", "развлеч", "комьюнити"],
     "Крупные скругления 20px и CSS-иллюстрации из простых фигур вместо стоковых картинок.",
     "Не превращать в хаос: цветов всё равно максимум три."),
    ("retro", "Ретро-футуризм",
     "Эстетика 70–80-х, тёплый градиент горизонта, широкие капсы, зерно плёнки.",
     ["характер", "тепло", "креатив"], ["krona", "michroma", "bebas", "syne"],
     ["poster", "full-bleed", "stacked-type"], "cinematic", "grain",
     ["hero", "story", "showcase", "stats", "cta", "footer"],
     ["ретро", "винтаж", "синтвейв", "80-е", "постер", "винил"],
     "Горизонт из двух-трёх горизонтальных полос тёплого градиента за заголовком.",
     "Не скатываться в фиолетово-циановый неон: тёплая гамма, а не киберпанк."),
    ("cyber", "Кибер-нуар",
     "Тёмная техносцена: сетка, HUD-подписи, точные линии, холодный акцент.",
     ["технологичность", "загадочность", "дерзость"], ["michroma", "orbitron", "jetbrains", "space"],
     ["terminal", "bento", "full-bleed"], "mechanical", "blueprint",
     ["hero", "spec", "stats", "features-asym", "integrations", "cta", "footer"],
     ["киберпанк", "игр", "esports", "крипт", "блокчейн", "web3", "nft", "хакер", "sci-fi", "космос"],
     "Служебные HUD-метки по углам блоков и координаты мелким моношрифтом.",
     "Свечение допустимо ровно в одном месте экрана и не ярче 30% opacity."),
    ("fashion", "Модный лукбук",
     "Кадр решает всё: огромные изображения, тонкая подпись, ноль лишнего интерфейса.",
     ["мода", "премиум", "минимализм"], ["bodoni", "gloock", "prata", "epilogue"],
     ["gallery-grid", "full-bleed", "magazine"], "editorial", "none",
     ["hero", "gallery", "showcase", "story", "map-contact", "footer"],
     ["мода", "одежд", "бренд", "лукбук", "бутик", "стилист", "украшен", "обув"],
     "Подписи к кадрам мелким капсом с большим трекингом, выровненные по нижнему краю изображения.",
     "Не добавлять карточки с иконками и маркетинговые блоки-плитки."),
    ("craft", "Крафт и мастерская",
     "Материальность: бумага, штамп, ручная подача, честный тон.",
     ["крафт", "тепло", "характер"], ["fraunces", "alegreya", "libre", "lora"],
     ["magazine", "zigzag", "gallery-grid"], "editorial", "paper",
     ["hero", "story", "process", "showcase", "quote", "map-contact", "footer"],
     ["мастерск", "ручн", "мебель", "керамик", "столяр", "тату", "барбер", "пивовар"],
     "Штамп-печать: круглая или прямоугольная метка с текстом капсом, повёрнутая на -6deg.",
     "Без глянца, без синих корпоративных градиентов."),
    ("gallerywhite", "Белая галерея",
     "Почти пустой белый лист, работа в центре внимания, интерфейс исчезает.",
     ["минимализм", "спокойствие"], ["epilogue", "instrument", "manrope", "onest"],
     ["gallery-grid", "centered-luxe", "stacked-type"], "calm", "none",
     ["hero", "showcase", "story", "map-contact", "footer"],
     ["портфолио", "художник", "галере", "фотограф", "архитект", "дизайнер", "выставк"],
     "Единственный акцентный цвет живёт только в ссылках и фокусе.",
     "Никаких заливок целыми секциями — только белый лист и контент."),
    ("nightclub", "Ночная сцена",
     "Тёмный фон, один горячий акцент, крупные афишные заголовки, ощущение события.",
     ["энергия", "дерзость", "загадочность"], ["unbounded", "bebas", "syne", "anton"],
     ["poster", "full-bleed", "card-rail"], "snappy", "halo",
     ["hero", "timeline", "gallery", "stats", "map-contact", "cta", "footer"],
     ["клуб", "вечеринк", "диджей", "концерт", "афиш", "событ", "бар", "фестивал"],
     "Афишный список дат: строка = дата, имя, город, разделённые хайрлайном, hover заливает строку акцентом.",
     "Не более одного свечения и без стоковых «частиц»."),
    ("corporate-modern", "Современный корпоратив",
     "Чисто, уверенно, без пафоса: понятная структура, аккуратные компоненты, спокойный акцент.",
     ["доверие", "минимализм", "технологичность"], ["onest", "golos", "manrope", "sora", "outfit"],
     ["asym-grid", "dashboard", "zigzag"], "calm", "none",
     ["hero", "proof-bar", "features-asym", "process", "stats", "pricing", "faq", "map-contact", "footer"],
     ["компания", "производств", "логистик", "поставк", "оборудован", "строител", "ремонт", "монтаж", "услуг"],
     "Секции разделены сменой фона surface/bg, а не линиями; ритм отступов строго 96px.",
     "Без стоковых рукопожатий и абстрактных синих волн."),
    ("data", "Данные и аналитика",
     "График — герой страницы. Чистая визуализация, точные подписи, никакой мишуры.",
     ["технологичность", "строгость", "доверие"], ["plex", "jetbrains", "space", "golos"],
     ["dashboard", "bento", "sticky-scenes"], "snappy", "grid",
     ["hero", "stats", "spec", "compare", "integrations", "faq", "cta", "footer"],
     ["аналитик", "данн", "отчёт", "метрик", "bi", "мониторинг", "трейдинг", "биржа"],
     "Настоящий SVG-график с осями и подписями, нарисованный вручную, а не картинка-заглушка.",
     "Не использовать более двух цветов серий данных без прямых подписей."),
    ("travel", "Путешествия",
     "Пейзаж во всю ширину, воздух, ощущение маршрута и открытия.",
     ["свежесть", "природа", "спокойствие"], ["instrument", "outfit", "literata", "marcellus"],
     ["full-bleed", "card-rail", "magazine"], "cinematic", "grain",
     ["hero", "showcase", "story", "timeline", "pricing", "faq", "cta", "footer"],
     ["путешеств", "тур", "отел", "экскурс", "остров", "горы", "поход", "виза", "аренда"],
     "Карточки направлений с наложенной подписью и лёгким зумом изображения на hover.",
     "Не перегружать текстом поверх фотографий — максимум 8 слов."),
    ("education", "Образование",
     "Структура и прогресс: понятная программа, ясные шаги, доказательства результата.",
     ["доверие", "свежесть", "энергия"], ["literata", "golos", "figtree" if False else "outfit", "manrope"],
     ["sticky-scenes", "asym-grid", "zigzag"], "calm", "mesh",
     ["hero", "stats", "process", "spec", "team", "quote", "pricing", "faq", "cta", "footer"],
     ["курс", "обучен", "школ", "универ", "вебинар", "ментор", "интенсив", "академ"],
     "Программа курса как таймлайн модулей с длительностью и результатом каждого блока.",
     "Не обещать абстрактное «раскрытие потенциала» — только конкретные навыки."),
    ("minimalmono", "Монохром с одним акцентом",
     "Чёрно-белая база и ровно один цвет, который появляется меньше десяти раз на странице.",
     ["минимализм", "строгость"], ["epilogue", "chivo", "familjen", "onest", "golos"],
     ["stacked-type", "asym-grid", "gallery-grid"], "snappy", "none",
     ["hero", "features-asym", "showcase", "stats", "faq", "cta", "footer"],
     ["минимал", "чёрно-бел", "строг", "лаконич"],
     "Акцент используется только для одного слова в заголовке, кнопок и фокуса — больше нигде.",
     "Ни одного второго цвета, даже в иллюстрациях."),
]

DIRECTIONS = [
    {
        "id": d[0], "name": d[1], "vibe": d[2], "paletteMood": d[3], "fonts": d[4],
        "layouts": d[5], "motion": d[6], "texture": d[7], "sections": d[8],
        "keywords": d[9], "signature": d[10], "forbid": d[11],
    }
    for d in DIRECTIONS
]

# ------------------------------------------------------------- шкалы ----
SCALES = [
    {"id": "editorial", "name": "Редакционная", "display": "clamp(44px, 7vw, 96px)", "h2": "clamp(28px, 3.4vw, 44px)",
     "h3": "22px", "body": "18px", "small": "14px", "lh": "1.65", "lhTight": "1.04", "tracking": "-0.02em", "measure": "68ch"},
    {"id": "compact", "name": "Плотная продуктовая", "display": "clamp(36px, 5vw, 60px)", "h2": "clamp(24px, 2.6vw, 34px)",
     "h3": "20px", "body": "16px", "small": "13px", "lh": "1.6", "lhTight": "1.1", "tracking": "-0.015em", "measure": "62ch"},
    {"id": "poster", "name": "Плакатная", "display": "clamp(56px, 12vw, 180px)", "h2": "clamp(32px, 4.4vw, 56px)",
     "h3": "24px", "body": "17px", "small": "13px", "lh": "1.55", "lhTight": "0.92", "tracking": "-0.04em", "measure": "58ch"},
    {"id": "calm", "name": "Спокойная", "display": "clamp(40px, 5.4vw, 72px)", "h2": "clamp(26px, 3vw, 38px)",
     "h3": "21px", "body": "17px", "small": "14px", "lh": "1.7", "lhTight": "1.12", "tracking": "-0.01em", "measure": "66ch"},
]

SHAPES = [
    {"id": "sharp", "radius": "0px", "radiusLg": "0px", "border": "1px", "shadow": "none"},
    {"id": "soft", "radius": "10px", "radiusLg": "18px", "border": "1px",
     "shadow": "0 1px 2px rgba(0,0,0,.05), 0 8px 24px rgba(0,0,0,.06)"},
    {"id": "round", "radius": "16px", "radiusLg": "28px", "border": "1px",
     "shadow": "0 2px 6px rgba(0,0,0,.06), 0 18px 40px rgba(0,0,0,.08)"},
    {"id": "slab", "radius": "4px", "radiusLg": "6px", "border": "2px", "shadow": "none"},
]

# ------------------------------------------------------------ отрасли ----
INDUSTRIES = {
    "кафе|ресторан|кофейн|бар |пекарн|пицц|суши|бургер|кухн|еда|доставка еды|кондитер|шаурм|столов": ["appetite", "craft", "organic"],
    "фитнес|спортзал|тренажёр|тренер|бокс|кроссфит|бег|марафон|качалк": ["sport", "brutal"],
    "клиник|медицин|стоматолог|врач|психолог|терапи|реабилитац|аптек": ["calmcare", "trust"],
    "спа|салон|красот|маникюр|космето|бровист|барбер|парикмахер": ["luxe", "calmcare", "craft"],
    "йога|медитац|велнес|ретрит": ["calmcare", "organic"],
    "банк|финанс|инвест|брокер|страхов|кредит|бухгалт|аудит": ["trust", "data"],
    "юрист|адвокат|правов|нотариус": ["trust", "swiss"],
    "крипт|блокчейн|web3|nft|токен|биржа|трейд": ["cyber", "data", "tech"],
    "saas|платформ|стартап|сервис|приложен|дашборд|api|crm|erp|облач": ["tech", "corporate-modern", "data"],
    "ии |нейросет|искусственн|ai-|машинн|llm|агент": ["tech", "cyber", "data"],
    "агентств|студи|креатив|брендинг|маркетинг|smm|реклам": ["brutal", "swiss", "editorial"],
    "портфолио|резюме|дизайнер|иллюстратор|художник|фотограф|галере|выставк": ["gallerywhite", "fashion", "editorial"],
    "свадьб|торжеств|невест|фотосъём": ["luxe", "editorial"],
    "отел|гостиниц|вилл|апартамент|курорт|остров|яхт": ["luxe", "travel"],
    "путешеств|тур|экскурс|поход|виза|авиабилет": ["travel", "editorial"],
    "недвижим|застройщик|жк |квартир|аренда офис": ["trust", "luxe", "corporate-modern"],
    "строител|ремонт|монтаж|отделк|кровл|окна|мебел|интерьер": ["corporate-modern", "craft"],
    "авто|автомобил|детейлинг|шиномонтаж|мото|байк|тюнинг": ["sport", "cinema"],
    "игр|гейм|esports|киберспорт|steam|rpg": ["cyber", "nightclub", "cinema"],
    "музык|диджей|концерт|лейбл|альбом|винил": ["nightclub", "retro", "brutal"],
    "клуб|вечеринк|фестивал|афиш|событ|конференц": ["nightclub", "brutal"],
    "мод|одежд|бутик|лукбук|стилист|украшен|ювелир|парфюм|обув": ["fashion", "luxe"],
    "магазин|интернет-магазин|ecommerce|маркетплейс|товар|каталог": ["corporate-modern", "fashion", "playful"],
    "школ|курс|обучен|универ|образован|вебинар|ментор|интенсив|репетитор": ["education", "playful"],
    "детс|малыш|игрушк|аниматор|праздник": ["playful", "organic"],
    "эко|ферм|сад|растен|цвет|чай|кофе зерн|винодель|пивовар": ["organic", "craft"],
    "мастерск|ручн|керамик|столяр|тату|хендмейд": ["craft", "organic"],
    "логистик|поставк|производств|завод|оборудован|склад|b2b": ["corporate-modern", "trust", "data"],
    "кино|продакшн|видео|клип|съёмк|трейлер": ["cinema", "fashion"],
    "devtool|разработчик|опенсорс|инфраструктур|кибербез|хостинг|сервер|код": ["terminalcore", "tech"],
    "аналитик|данн|отчёт|метрик|мониторинг|bi": ["data", "tech"],
    "космос|sci-fi|фантастик|будущ|футур": ["cyber", "cinema", "retro"],
    "блог|медиа|журнал|新聞|новост|книг|издател|музе|культур|истори": ["editorial", "gallerywhite"],
    "минимал|лаконич|строг|чёрно-бел": ["minimalmono", "swiss", "gallerywhite"],
    "ретро|винтаж|80-е|синтвейв": ["retro", "nightclub"],
    "брутал|дерзк|панк|стрит": ["brutal", "nightclub"],
    "роскош|люкс|премиум|элитн|дорог": ["luxe", "fashion", "cinema"],
}

# ------------------------------------------------------------ настрой ----
MOOD_WORDS = {
    "спокойствие": ["спокой", "тих", "мягк", "умиротвор", "уют", "дзен"],
    "сила": ["мощн", "сил", "жёстк", "брутал", "агресс", "дерзк"],
    "премиум": ["премиум", "дорог", "элитн", "люкс", "роскош", "статус"],
    "технологичность": ["технолог", "цифров", "инженер", "точн", "систем"],
    "доверие": ["надёж", "довер", "безопас", "провер", "официал"],
    "энергия": ["энерг", "драйв", "быстр", "яркo", "ярк", "взрыв", "скорост"],
    "загадочность": ["загадоч", "мрачн", "тёмн", "темн", "нуар", "мистик"],
    "нежность": ["нежн", "пастель", "воздушн", "романт", "лёгк"],
    "крафт": ["крафт", "ручн", "натурал", "честн", "локальн"],
    "минимализм": ["минимал", "чист", "просто", "лаконич"],
    "природа": ["природ", "эко", "зелён", "органик", "лес"],
    "роскошь": ["роскош", "люкс", "золот", "шик"],
    "свежесть": ["свеж", "светл", "воздух", "морск"],
}

CHECKLIST = [
    "Один герой первого уровня на экране: ровно один элемент притягивает взгляд первым.",
    "Цветов ровно три (грунт, акцент, служебный) плюс оттенки одного цвета.",
    "Контраст текста к фону ≥ 4.5:1, крупных элементов ≥ 3:1.",
    "Ни одной секции-клона: соседние блоки отличаются композицией, а не только текстом.",
    "Ноль горизонтального скролла на 360, 768, 1024 и 1440px.",
    "Ни одного лишнего элемента: каждый объясним одним из 10 законов.",
    "Есть :focus-visible, семантические теги, alt у изображений, prefers-reduced-motion.",
    "Текст конкретный и по теме: ни одной фразы вроде «раскройте потенциал».",
    "Отступы кратны 4px, ритм секций одинаковый по всей странице.",
    "В коде нет ```, нет пояснений — только один цельный HTML-документ.",
]

KB = {
    "version": 1,
    "generator": "tools/build_design_kb.py",
    "palettes": PALETTES,
    "fonts": FONTS,
    "layouts": LAYOUTS,
    "motion": MOTION,
    "details": DETAILS,
    "textures": TEXTURES,
    "sections": SECTIONS,
    "directions": DIRECTIONS,
    "scales": SCALES,
    "shapes": SHAPES,
    "industries": INDUSTRIES,
    "moodWords": MOOD_WORDS,
    "checklist": CHECKLIST,
}


def main():
    bad = [p["id"] for p in PALETTES if p["contrast"]["text"] < 7 or p["contrast"]["accent"] < 4.5
           or p["contrast"]["muted"] < 4.5 or p["contrast"]["onAccent"] < 4.5]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(KB, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    combos = len(PALETTES) * len(FONTS) * len(LAYOUTS) * len(SCALES) * len(SHAPES)
    print(f"palettes: {len(PALETTES)}  fonts: {len(FONTS)}  layouts: {len(LAYOUTS)}")
    print(f"directions: {len(DIRECTIONS)}  details: {len(DETAILS)}  sections: {len(SECTIONS)}")
    print(f"уникальных дизайн-систем (палитра×шрифт×композиция×шкала×форма): {combos:,}")
    print(f"файл: {OUT}  {OUT.stat().st_size/1024:.0f} KB")
    print("палитры, не прошедшие контраст:", bad or "нет")


if __name__ == "__main__":
    main()
