# Aether — Agent Context

Chrome-extension + Node server + Modal backend for audio/YouTube transcription (Groq Whisper).

## Stack

- Frontend: React + Vite (CRXJS Chrome extension)
- Local API: `server.js` (Express, port 3000)
- Cloud API: `backend/modal_aether.py` (Modal FastAPI)
- CLI: `npm run aether` → `scripts/aether.py`

## Local commands

```bash
npm install
npm run server          # local API on :3000
npm run build           # extension build
npm run aether -- health
```

## Remotes

- `origin` → `Tylarcam/aether-server` (primary deploy track; `main-deploy` → `origin/main`)
- `aether` → `Tylarcam/Aether` (private mirror)

Prefer `aether-server` for Cloud Agents unless the task is specifically on the private `Aether` repo.

## Cursor Cloud specific instructions

- Install deps with `npm install` (see `.cursor/environment.json`).
- Do not commit `.env`. Secrets belong in the Cloud Agents dashboard Secrets tab:
  - `GROQ_API_KEY` — required for local server / Modal-adjacent testing
  - `VITE_GROQ_API_KEY` — optional browser-side Groq
  - `VITE_SERVER_URL` / `SERVER_URL` — only if testing against a deployed server
- Modal deploy (when changing `backend/modal_aether.py`):
  `modal deploy backend/modal_aether.py`
- Modal endpoint (default CLI fallback): `https://tylarcam--aether-transcribe-web.modal.run`
- Extension load: Chrome → `chrome://extensions` → Load unpacked → project root (or `dist/` after build, per project convention).
- Skip committing `session-review-48h/` and other local review dumps.
