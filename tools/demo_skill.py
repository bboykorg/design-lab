# -*- coding: utf-8 -*-
"""Демо-рендер: собирает страницу строго по токенам дизайн-скилла.

Нужен, чтобы глазами проверить качество любой комбинации из базы без вызова модели:
    python3 tools/demo_skill.py "сайт кофейни" 0 demo.html
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from backend import design_skills as ds  # noqa: E402

TPL = """<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{font_link}">
<style>
{tokens}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:var(--bg);color:var(--text);font-family:var(--font-body);
  font-size:var(--fs-body);line-height:var(--lh);-webkit-font-smoothing:antialiased}}
.wrap{{max-width:var(--container);margin:0 auto;padding:0 var(--space-5)}}
h1,h2,h3{{font-family:var(--font-display);line-height:var(--lh-tight);
  letter-spacing:var(--tracking-display);font-weight:600}}
h1{{font-size:var(--fs-display)}} h2{{font-size:var(--fs-h2)}} h3{{font-size:var(--fs-h3)}}
p{{max-width:var(--measure);color:var(--muted)}}
header{{position:sticky;top:0;z-index:9;background:color-mix(in srgb,var(--bg) 88%,transparent);
  backdrop-filter:blur(12px);border-bottom:var(--border-w) solid var(--border)}}
header .wrap{{display:flex;align-items:center;gap:var(--space-6);height:64px}}
.brand{{font-family:var(--font-display);font-size:19px;font-weight:700;letter-spacing:-.01em}}
nav{{margin-left:auto;display:flex;gap:var(--space-5)}}
nav a{{color:var(--muted);text-decoration:none;font-size:var(--fs-small);
  transition:color var(--dur) var(--ease)}}
nav a:hover{{color:var(--text)}}
.btn{{display:inline-flex;align-items:center;gap:8px;padding:13px 22px;border-radius:var(--radius);
  background:var(--accent);color:var(--on-accent);text-decoration:none;font-weight:600;
  font-size:var(--fs-small);border:none;cursor:pointer;
  transition:transform var(--dur) var(--ease),box-shadow var(--dur) var(--ease)}}
.btn:hover{{transform:translateY(-2px);box-shadow:var(--shadow)}}
.btn.ghost{{background:transparent;color:var(--text);
  border:var(--border-w) solid var(--border)}}
.hero{{padding:var(--space-10) 0 var(--space-9);position:relative;overflow:hidden}}
.hero .eyebrow{{display:inline-flex;align-items:center;gap:8px;font-size:var(--fs-small);
  color:var(--accent-2);letter-spacing:.08em;text-transform:uppercase;margin-bottom:var(--space-5)}}
.hero .eyebrow::before{{content:"";width:28px;height:1px;background:var(--accent-2)}}
.hero h1{{max-width:16ch;margin-bottom:var(--space-5)}}
.hero .lead{{font-size:calc(var(--fs-body) + 3px);margin-bottom:var(--space-6)}}
.cta{{display:flex;gap:var(--space-3);flex-wrap:wrap}}
.stats{{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-6);
  margin-top:var(--space-9);padding-top:var(--space-6);
  border-top:var(--border-w) solid var(--border)}}
.stats b{{display:block;font-family:var(--font-display);font-size:var(--fs-h2);color:var(--accent)}}
.stats span{{font-size:var(--fs-small);color:var(--muted)}}
section{{padding:var(--space-9) 0}}
.section-head{{margin-bottom:var(--space-7)}}
.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-5)}}
.card{{background:var(--surface);border:var(--border-w) solid var(--border);
  border-radius:var(--radius-lg);padding:var(--space-6);
  transition:transform var(--dur) var(--ease),border-color var(--dur) var(--ease)}}
.card:hover{{transform:translateY(-4px);border-color:var(--accent)}}
.card .ic{{width:40px;height:40px;border-radius:var(--radius);background:var(--accent-soft);
  display:grid;place-items:center;margin-bottom:var(--space-4)}}
.card h3{{margin-bottom:var(--space-2)}}
.card p{{font-size:var(--fs-small)}}
.band{{background:var(--raised);border-top:var(--border-w) solid var(--border);
  border-bottom:var(--border-w) solid var(--border)}}
.split{{display:grid;grid-template-columns:1.1fr .9fr;gap:var(--space-8);align-items:center}}
.rows{{display:flex;flex-direction:column;gap:var(--space-4)}}
.row{{display:flex;align-items:baseline;gap:var(--space-3);
  padding-bottom:var(--space-3);border-bottom:1px dashed var(--border)}}
.row .n{{font-family:var(--font-display);color:var(--accent);font-size:var(--fs-h3)}}
.row .d{{margin-left:auto;font-size:var(--fs-small);color:var(--muted)}}
.final{{text-align:center;padding:var(--space-10) 0}}
.final h2{{max-width:18ch;margin:0 auto var(--space-5)}}
.final p{{margin:0 auto var(--space-6)}}
footer{{border-top:var(--border-w) solid var(--border);padding:var(--space-6) 0;
  font-size:var(--fs-small);color:var(--muted)}}
footer .wrap{{display:flex;gap:var(--space-5);flex-wrap:wrap}}
footer .r{{margin-left:auto}}
a:focus-visible,button:focus-visible{{outline:2px solid var(--accent-2);outline-offset:3px}}
@media (max-width:860px){{.grid,.split,.stats{{grid-template-columns:1fr}}}}
@media (prefers-reduced-motion:reduce){{*{{transition:none!important;animation:none!important}}}}
</style></head>
<body>
<header><div class="wrap">
  <div class="brand">{brand}</div>
  <nav><a href="#f">Возможности</a><a href="#h">Как работает</a><a href="#p">Цены</a></nav>
  <a class="btn" href="#p">Начать</a>
</div></header>

<div class="hero"><div class="wrap">
  <div class="eyebrow">{direction}</div>
  <h1>{h1}</h1>
  <p class="lead">{lead}</p>
  <div class="cta"><a class="btn" href="#p">Попробовать бесплатно</a>
    <a class="btn ghost" href="#h">Как это работает</a></div>
  <div class="stats">
    <div><b>168</b><span>палитр с проверенным контрастом</span></div>
    <div><b>24</b><span>арт-дирекции с фирменным приёмом</span></div>
    <div><b>1,7 млн</b><span>уникальных дизайн-систем</span></div>
  </div>
</div></div>

<section id="f"><div class="wrap">
  <div class="section-head"><h2>Что получает модель</h2>
    <p>Не советы, а готовая дизайн-система: hex-цвета, шкала, шрифты и план секций.</p></div>
  <div class="grid">{cards}</div>
</div></section>

<section id="h" class="band"><div class="wrap split">
  <div><h2>{split_h2}</h2><p>{split_p}</p></div>
  <div class="rows">{rows}</div>
</div></section>

<section id="p" class="final"><div class="wrap">
  <h2>{final_h2}</h2>
  <p>{final_p}</p>
  <a class="btn" href="#">Собрать сайт</a>
</div></section>

<footer><div class="wrap"><span>&copy; 2026 {brand}</span>
  <span class="r">{direction} · {palette} · {fonts}</span></div></footer>
</body></html>
"""


def render(message: str, variant: int = 0) -> str:
    sk = ds.build_skill(message, variant=variant)
    plan = sk["plan"]
    cards = "".join(
        '<div class="card"><div class="ic">'
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        'stroke-width="1.8"><path d="M4 12h16M12 4v16"/></svg></div>'
        f"<h3>{s['name']}</h3><p>{s['recipe']}</p></div>"
        for s in plan[:6]
    )
    rows = "".join(
        f'<div class="row"><span class="n">{i+1:02d}</span>'
        f"<span>{d['text']}</span><span class=\"d\">в базе</span></div>"
        for i, d in enumerate(sk["details"][:5])
    )
    return TPL.format(
        title=f"{sk['direction']['name']} · демо скилла",
        brand="Design&Lab",
        font_link=sk["font"]["link"],
        tokens=ds.render_tokens(sk),
        direction=sk["direction"]["name"],
        palette=sk["palette"]["name"],
        fonts=f"{sk['font']['display']} + {sk['font']['body']}",
        h1="Любая модель делает дизайн уровня студии",
        lead=sk["direction"]["vibe"] + " Фирменный приём: " + sk["direction"]["signature"],
        split_h2="Скилл подбирается автоматически под текст запроса",
        split_p=f"Композиция: {sk['layout']['hero']} Сетка: {sk['layout']['grid']}",
        rows=rows,
        cards=cards,
        final_h2="Два-три промта — и готово",
        final_p="Каждый повторный запрос даёт новую арт-дирекцию из базы, а не случайный шаблон.",
    )


if __name__ == "__main__":
    msg = sys.argv[1] if len(sys.argv) > 1 else "сайт кофейни"
    var = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    out = sys.argv[3] if len(sys.argv) > 3 else "demo.html"
    pathlib.Path(out).write_text(render(msg, var), encoding="utf-8")
    print("Готово:", out)
