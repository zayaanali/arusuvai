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

Open `http://127.0.0.1:8000`.

## API overview

- `GET /health`
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

## AI backend integration

Keep CRUD endpoints deterministic and stable.
Integrate your model in `POST /api/ai/chat`, and have it call internal pantry/recipe services instead of writing DB records directly.
