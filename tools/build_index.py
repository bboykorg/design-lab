"""Собирает index.html точно так же, как это делает backend/main.py::_build_index,
но без запуска FastAPI — чтобы можно было тестить статикой.
Списки ассетов читаются из backend/main.py, чтобы не расходиться с продом.
"""
import ast
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FRONT = ROOT / "frontend"
OUT = ROOT / "build"


def _tuple_from_main(name: str):
    src = (ROOT / "backend" / "main.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == name:
                    return tuple(ast.literal_eval(node.value))
    raise SystemExit(f"{name} not found in backend/main.py")


def build() -> str:
    styles = _tuple_from_main("_PATCH_STYLES")
    scripts = _tuple_from_main("_PATCH_SCRIPTS")
    raw = (FRONT / "index.html").read_text(encoding="utf-8")

    for n in list(styles) + list(scripts):
        if not (FRONT / n).exists():
            print(f"  !! отсутствует файл: {n}")

    missing = [f'<link rel="stylesheet" href="/{n}">' for n in styles if n not in raw]
    missing += [f'<script src="/{n}"></script>' for n in scripts if n not in raw]
    if not missing:
        return raw
    patch = "\n".join(missing)
    i = raw.rfind("</body>")
    return raw + patch if i < 0 else raw[:i] + patch + "\n" + raw[i:]


if __name__ == "__main__":
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(FRONT, OUT)
    html = build()
    (OUT / "index.html").write_text(html, encoding="utf-8")
    ok = 'dl-fix.css' in html and 'dl-fix.js' in html
    print(f"build -> {OUT/'index.html'}  ({len(html)} байт)")
    print(f"dl-fix подключён: {ok}")
    sys.exit(0 if ok else 1)
