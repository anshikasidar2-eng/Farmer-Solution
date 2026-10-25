# AgriSmart AI - Intelligent Farming Assistant

React (TypeScript) + Node.js + SQLite. One connected workflow: profile and location -> weather -> crop recommendation -> fertilizer and irrigation -> photo disease check -> yield estimate -> one report.

```
client/    React + TypeScript app (Vite)
server/    Node.js API (no npm packages needed) + SQLite + the original CSV datasets in server/datasets/
Dockerfile, render.yaml, .env.example, DATA.md
```

## Run on your computer

1. Install **Node.js 22.5 or newer** (LTS from https://nodejs.org). Check with `node -v`. Older Node cannot load the built-in SQLite, and the server will tell you so.
2. In the project folder:
```bash
cp .env.example .env          # Windows: copy .env.example .env   - then put any long random text after JWT_SECRET=
npm run build                 # installs and builds the React client (needs internet once)
npm start                     # open http://localhost:8080
```
For development with live reload use two terminals: `npm run dev:server` and `npm run dev:client` (app on http://localhost:5173).

`npm test` runs the backend tests. `npm --prefix client run typecheck` checks the React code.

## Photo disease check
Set `ANTHROPIC_API_KEY` in `.env` (or the host's environment). A general AI model then reads the photo together with the farmer's saved crop, location and weather. It is not a trained plant-disease classifier and the app says so. With no key the app clearly says detection is not configured and shows no result. Unclear photos get a "retake" message instead of a guess.

## Weather
Live data comes from NASA POWER (past 30 days) and Open-Meteo place lookup. Neither needs a key. If they cannot be reached the app says so and the farmer can type values; weather is never invented. "Rain expected" is always the farmer's own entry.

## Deploy online
SQLite and photos are files, so use a host with a **persistent disk** and run **one** copy.
- **Render:** push to GitHub, New > Blueprint, pick the repo (uses `render.yaml`), add `ANTHROPIC_API_KEY`.
- **Any Docker host (Railway, Fly.io, VPS):** `docker build -t agrismart .` then `docker run -p 8080:8080 -v agrismart-data:/data -e JWT_SECRET=... agrismart`. Put HTTPS in front.
- **Plain VPS:** install Node 22, `npm run build`, run `npm start` under pm2 or systemd, Caddy/nginx for HTTPS.
`JWT_SECRET` is mandatory in production.

## If something does not run
- "needs Node.js 22.5 or newer": install the current LTS.
- Blank page or 404 at :8080: run `npm run build` first (it creates `client/dist`).
- Port busy: set `PORT=3000` in `.env`.
- Build error in the client: send me the message.

## Existing database
Tables use `CREATE TABLE IF NOT EXISTS` and nothing is dropped. Point `DATA_DIR` and `DB_FILE` at an existing SQLite file to reuse it; if an old `users` table has different columns the server will not change it (send me the schema for a migration). Data from the earlier browser-only page cannot be moved automatically.
