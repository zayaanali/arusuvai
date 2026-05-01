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
- `PATCH /api/auth/preferences` (Bearer token required)
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
- `POST /api/ai/recipes` (fast pantry-aware recipe suggestions)
- `GET /api/recipe-queue` (Bearer token required)
- `POST /api/recipe-queue/bulk` (Bearer token required)
- `DELETE /api/recipe-queue/:id` (Bearer token required)
- `DELETE /api/recipe-queue` (Bearer token required)

## Users, Pantry Isolation, and Global Items

- Each account has `username` + password auth and its own pantry records.
- Send `Authorization: Bearer <token>` for pantry and AI endpoints.
- User profile includes a `preferences` text field for cuisine/style guidance.
- Update preferences via `PATCH /api/auth/preferences` with JSON body like:
  - `{ "preferences": "Prefer South Indian vegetarian meals; avoid deep fried; prioritize high-protein dinners." }`
- A global item catalog (`global_items`) is upserted before pantry item creation.
- Pantry add auto-loads default `unit` and `category` from the global catalog when fields are omitted.
- Admin users can set global defaults by updating item `unit`/`category`.
  - Admin users are assigned via `ADMIN_USERNAMES` in `.env` (comma-separated).

## AI backend integration

Keep CRUD endpoints deterministic and stable.
Integrate your model in `POST /api/ai/chat`, and have it call internal pantry/recipe services instead of writing DB records directly.

## Tailscale Funnel + Pages (no custom domain required)

Use this pattern when your backend runs on your own machine and your frontend is on Cloudflare Pages.

### 1) Run backend locally

```bash
PORT=8000 HOST=127.0.0.1 DB_PATH=/absolute/path/to/pantry-manager/data/pantry_manager.db npm start
```

Using `HOST=127.0.0.1` keeps Express bound to loopback only.

### 2) Create and run a Tailscale Funnel

```bash
tailscale up
tailscale funnel --bg 8000
tailscale funnel status
```

Use the HTTPS URL from `tailscale funnel status` (example: `https://aether.tailbc021b.ts.net`).

### 3) Configure Pages Function proxy

Set these secrets in your Cloudflare Pages project:

- `BACKEND_ORIGIN=https://<your-tailnet-funnel>.ts.net` (stored as secret for convenience)
- `BACKEND_SHARED_SECRET=<long-random-secret>`

You can set required secrets with one command:

```bash
scripts/configure_pages_secrets.sh <pages_project_name> https://<your-tailnet-funnel>.ts.net <backend_shared_secret> production
```

If you omit `<backend_shared_secret>`, the script will try to read `BACKEND_SHARED_SECRET` from local `.env`.
If you are using Cloudflare Access in a custom-domain setup, set `CF_ACCESS_CLIENT_ID_INPUT` and `CF_ACCESS_CLIENT_SECRET_INPUT` in your shell before running the script.

Your Pages API proxy (`functions/api/[[path]].js`) will automatically attach:

- `X-Backend-Secret` when `BACKEND_SHARED_SECRET` is set
- Access headers when both Access values are set

### 4) Run backend as a Linux service

1. Create app `.env`:

```bash
cp .env.example .env
```

2. Update `.env` values as needed (especially `DB_PATH`, `OPENROUTER_API_KEY`, and `ADMIN_USERNAMES`).
3. Set the same random `BACKEND_SHARED_SECRET` value in both:
   - backend `.env`
   - Pages secret `BACKEND_SHARED_SECRET`

3. Install backend service:

```bash
scripts/setup_backend_service.sh <linux_user> /absolute/path/to/pantry-manager
```

### Push + Deploy from local machine

If you prefer not to grant GitHub Actions SSH access, use:

```bash
scripts/push_and_deploy.sh
```

This local script will:

- `git push` your current branch to `origin`
- sync repo files to `/opt/pantry-manager` (preserving server `.env` and DB files)
- run `npm ci --omit=dev` in deploy path
- restart `pantry-manager.service`

Optional arguments:

```bash
scripts/push_and_deploy.sh /opt/pantry-manager pantry-manager.service
```

By default this also creates a production DB backup before install/restart.
To skip that backup for one run:

```bash
SKIP_DB_BACKUP=1 scripts/push_and_deploy.sh
```

### Production DB backups

Manual backup command:

```bash
scripts/backup_production_db.sh /opt/pantry-manager/.env /opt/pantry-manager/backups 14
```

This will:

- read `DB_PATH` from `/opt/pantry-manager/.env`
- create a timestamped `.db` snapshot in `/opt/pantry-manager/backups`
- remove backup files older than `14` days

### Daily cron backup

Install/update a daily crontab entry:

```bash
scripts/install_daily_backup_cron.sh
```

Default schedule is every day at `02:15` local server time.

Custom schedule example (03:00 daily):

```bash
scripts/install_daily_backup_cron.sh 3 0
```
