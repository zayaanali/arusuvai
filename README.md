# Pantry Manager

A standard single-service web app:

- Backend: Node.js + Express
- Database: SQLite
- Frontend: Static HTML/CSS/JS served by Express

## Why this is simpler

- One runtime (JavaScript)
- One deployment unit (single server process)
- One API surface (`/api/*`)
- One frontend (`public/index.html`)

## Project structure

- `server/index.js` - API + static file server
- `server/db.js` - SQLite setup + DB helpers
- `public/index.html` - single standard UI
- `public/app.js` - client-side API calls
- `public/styles.css` - styling

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:18001`.

If you want a different port:

```bash
PORT=8000 npm run dev
```

## AI mode setup

1. Create env file from the template:

```bash
cp .env.example .env
```

2. Edit `.env` and set:

- `OPENROUTER_API_KEY=...`
- `OPENROUTER_MODEL=openai/gpt-4.1-mini` (or your preferred OpenRouter model slug)
- Optional fallback: `OPENROUTER_FALLBACK_MODEL=openai/gpt-4.1-nano`
- Optional: `OPENROUTER_SITE_URL` and `OPENROUTER_APP_NAME`

3. Restart server:

```bash
npm run dev
```

## API overview

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token required)
- `POST /api/auth/logout` (Bearer token required)
- `GET /api/pantry`
- `POST /api/pantry`
- `PATCH /api/pantry/:id`
- `DELETE /api/pantry/:id`
- `DELETE /api/pantry`
- `GET /api/pantry/expiring?days=7`
- `GET /api/shopping-list`
- `POST /api/shopping-list`
- `PATCH /api/shopping-list/:id`
- `DELETE /api/shopping-list/:id`
- `GET /api/recipes`
- `POST /api/recipes`
- `DELETE /api/recipes/:id`
- `POST /api/ai/chat` (AI integration point)

## Users, Pantry Isolation, and Global Items

- Each account has `username` + password auth and its own pantry records.
- Send `Authorization: Bearer <token>` for pantry and AI endpoints.
- A global item catalog (`global_items`) is upserted before pantry item creation.
- Pantry add auto-loads default `unit` and `category` from the global catalog when fields are omitted.
- Admin users can set global defaults by updating item `unit`/`category`.
  - Admin users are assigned via `ADMIN_USERNAMES` in `.env` (comma-separated).

## AI backend integration

Keep CRUD endpoints deterministic and stable.
Integrate your model in `POST /api/ai/chat`, and have it call internal pantry/recipe services instead of writing DB records directly.
