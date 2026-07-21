# Design&Lab

ИИ-конструктор красивых сайтов: галерея из 98 премиум-шаблонов, редактор «опиши словами»,
загрузка своего **ZIP/папки** в предпросмотр и встроенный **аудит безопасности**.
Теперь с бэкендом — ключи ИИ живут на сервере, а не в коде сайта.

```
project/
├── backend/                 FastAPI
│   ├── main.py              точка входа: CORS + роутеры + раздача статики
│   ├── config.py            настройки из .env (ключи, провайдер, пути)
│   ├── models.py            Pydantic-схемы запросов/ответов
│   ├── prompts.py           системный промпт против «ИИ-слопа» (impeccable)
│   ├── ai.py                POST /api/ai  → прокси к OpenAI-совместимому API
│   ├── projects.py          CRUD /api/projects (JSON-файлы, потом SQLite/PG)
│   ├── audit.py             POST /api/audit → статический аудит багов/дыр
│   ├── test_backend.py      тесты (TestClient, сеть замокана) — 20/20
│   └── requirements.txt
├── frontend/                статика (её же раздаёт бэкенд)
│   ├── index.html           только разметка + подключение файлов
│   ├── style.css            все стили
│   └── js/
│       ├── core.js          утилиты, галерея, движок ZIP/папок, аудит
│       ├── api.js           клиент бэкенда (/api/ai, /api/projects, /api/audit)
│       ├── editor.js        редактор, чат (fetch → /api/ai), проекты, голос
│       └── main.js          инициализация, роутер, drag&drop
├── .env.example
└── README.md
```

## Запуск

```bash
git clone <repo>
cd design-lab
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt

cp .env.example .env          # впиши свой AI_API_KEY (можно бесплатный OpenRouter)

uvicorn backend.main:app --reload
# открой http://localhost:8000
```

Бесплатный вариант без затрат: заведи ключ на **openrouter.ai**, в `.env` оставь
`AI_BASE_URL=https://openrouter.ai/api/v1` и `AI_MODEL=qwen/qwen3-coder:free`.
Без ключа сайт всё равно открывается и показывает офлайн-демо + загрузку ZIP/папок.

### Docker

```bash
docker build -t design-lab .
docker run -p 8000:8000 -e AI_API_KEY=... design-lab
```

### Деплой на Render

Репозиторий содержит `render.yaml` (Blueprint) и `Procfile`. На Render: New → Blueprint →
выбери репозиторий → задай секрет `AI_API_KEY` в дашборде. Порт берётся из `$PORT`
автоматически.

## API

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/health` | статус + готов ли ключ ИИ |
| POST | `/api/ai` | `{mode, message, html, model?, images?}` → `{html, model, say}` |
| POST | `/api/ai/stream` | то же, потоково (SSE): события `{delta}` … финал `{done, html}` |
| POST | `/api/audit` | `{html}` → оценка 0–100 + список проблем |
| GET | `/api/projects` | список проектов |
| POST | `/api/projects` | создать/обновить (`{id?, name, html, kind}`) |
| GET | `/api/projects/{id}` | загрузить проект |
| DELETE | `/api/projects/{id}` | удалить |
| POST | `/api/auth/register`, `/api/auth/login` | → `{token, username}` |
| GET | `/api/auth/me`, POST `/api/auth/logout` | текущий пользователь / выход |

`/api/ai` работает с любым **OpenAI-совместимым** провайдером (OpenAI, OpenRouter, Cerebras,
Mistral, Groq, локальные) — задаётся через `AI_BASE_URL` / `AI_MODEL` / `AI_API_KEY`.

## Хранилище

По умолчанию проекты лежат в JSON-файлах (`data/projects/`). Для многих проектов переключись
на SQLite одной переменной: `STORE=sqlite` (появится `data/projects.db`). Интерфейс в
`backend/store.py` изолирован — позже так же добавляется Postgres.

## Аккаунты и приватные проекты (опционально)

Выключено по умолчанию. Включи `AUTH_ENABLED=1` — появятся вход/регистрация, а проекты
станут приватными (каждый видит только свои). Пароли хешируются PBKDF2-HMAC-SHA256,
сессии — токены в `data/auth.db`. Фронтенд шлёт `Authorization: Bearer` автоматически.

## Тесты

```bash
# бэкенд (Python, сеть замокана) — оба хранилища
python backend/test_backend.py            # JSON  → 20/20
STORE=sqlite python backend/test_backend.py   # SQLite → 20/20
python backend/test_stream.py                 # streaming (SSE) → 7/7
AUTH_ENABLED=1 python backend/test_auth.py    # аккаунты + приватные проекты → 16/16
```

CI (`.github/workflows/ci.yml`) гоняет оба прогона на каждый push.

Фронтенд-логика (аудит, извлечение HTML, определение точки входа/стартовой команды, сборка
ZIP/папки) покрыта jsdom-тестами в процессе разработки.

## Безопасность

- **Ключи только на сервере** (`.env`, не коммитится). В коде сайта ключей нет.
- Аудит ловит утёкшие секреты, XSS-риски, `target=_blank` без `noopener`, mixed-content,
  скрипты без SRI, отсутствие CSP/viewport/`lang`/`alt` и т.д.
- В проде задай `CORS_ORIGINS` своим доменом (не `*`).

## Дальше (по желанию)
- Хранилище проектов: JSON → SQLite/Postgres (интерфейс в `projects.py` уже изолирован).
- Живой запуск проектов со сборкой (React/Vite/Next) — через WebContainers или sandbox-раннер
  на сервере; сейчас `/api` определяет фреймворк и стартовую команду и показывает статику.
- Аутентификация и приватные проекты по пользователю.
