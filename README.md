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

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open:

- http://127.0.0.1:8000/
- http://127.0.0.1:8000/docs

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
