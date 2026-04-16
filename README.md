# Pantry Manager MVP (No AI Yet)

Python-first backend MVP for pantry + recipe management.

## Stack

- FastAPI
- SQLModel
- SQLite (local file DB)

## Features

- Pantry CRUD
- Inventory event history (`add/use/discard/adjust`)
- Expiration queries (`/pantry/expiring`)
- Recipe CRUD
- Recipe ingredient storage
- Recipe matching against pantry (`/recipes/matches`)
- Shopping list CRUD
- Ingredient aliases for normalization

## API Contract Notes

- Canonical pantry clear endpoint: `DELETE /pantry`
- Backward-compat endpoint: `POST /pantry/clear` (deprecated; remove after all clients migrate)
- Health endpoint: `GET /health` returns `status`, `version`, `environment`, and `git_sha`
- Frontend calls API through relative `/api/*` paths
- Backend supports `/api/*` by rewriting `/api/...` to existing routes

## Robust Deployment Pattern

- Serve frontend and API under one origin
- Route UI at `/` and API at `/api/*`
- Keep frontend API base as relative `/api` only (no host fallbacks)
- Gate deploys with smoke checks that validate JSON endpoints

## Pre-Deploy Smoke Check

```bash
./scripts/smoke_api.sh http://127.0.0.1:8000
```

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open:

- http://127.0.0.1:8000/
- http://127.0.0.1:8000/api/docs

If you are on an SSH server and want remote browser access:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then access `http://<server-ip>:8000/`.

## UI Features

- Add pantry items
- View pantry and expiring items
- Record inventory events
- Create recipes
- Add recipe ingredients
- View recipe matches
- Add shopping list items
- Add ingredient aliases

## Next planned phase

- Add auth + user scoping
- Add AI parser/chat layer on top of these structured endpoints
