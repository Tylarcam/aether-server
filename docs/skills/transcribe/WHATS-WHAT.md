# Aether `transcribe` skill — What's What

_Drafted 2026-07-19 · CLI-only agent skill; no MCP_

## Verdict

| Question | Answer |
|----------|--------|
| Need an MCP? | **No** |
| How do agents use it? | **CLI** via `scripts/aether.py` |
| What does the skill add? | Calling convention + TLDR / takeaways (not transcription itself) |

## What's what

| Asset | Full path / URL | Role |
|-------|-----------------|------|
| Skill (Claude) | `C:\Users\tylar\.claude\skills\transcribe\SKILL.md` | Procedure agents follow |
| Skill (Cursor, if mirrored) | `C:\Users\tylar\.cursor\skills\transcribe\SKILL.md` | Same procedure for Cursor discovery |
| CLI entrypoint | `C:\Users\tylar\code\Aether\scripts\aether.py` | health / transcribe / file / extract |
| npm alias | `npm run aether -- <cmd>` from repo root | Thin wrapper → same Python CLI |
| Local API | `http://localhost:3000` (`server.js`) | Preferred backend |
| Modal API | `https://tylarcam--aether-transcribe-web.modal.run` | Fallback when local is down |
| Agent context | `C:\Users\tylar\code\Aether\AGENTS.md` | Project stack + deploy notes |
| This what's-what | `C:\Users\tylar\code\Aether\docs\skills\transcribe\WHATS-WHAT.md` | Operator map for handoffs |

## Commands (agent happy path)

```bash
python C:/Users/tylar/code/Aether/scripts/aether.py health
python C:/Users/tylar/code/Aether/scripts/aether.py transcribe "<video url>"
```

Optional: `--lang en`, `--text`, `--out transcript.txt`

Also available (not primary for the skill): `file <path>`, `extract <youtube-url>` (local only).

## Env

From `C:\Users\tylar\code\Aether\.env` (`AETHER_` prefix only for CLI):

| Var | Default | Purpose |
|-----|---------|---------|
| `AETHER_URL` | `http://localhost:3000` | Local base |
| `AETHER_MODAL_URL` | Modal URL above | Cloud fallback |
| `GROQ_API_KEY` | (server secret) | Used by local/Modal — not by the skill directly |

## Flow

```
URL → aether.py transcribe
      → local /health OK? POST /api/transcribe-url
      → else Modal /health OK? POST /transcribe/youtube
      → JSON { success, text, title, channel, ... }
      → agent: TLDR + 3–6 takeaways
```

## Anti-goals

- Do not add an Aether MCP server for this.
- Do not re-implement yt-dlp / chunking / Groq in the agent.
- Do not commit `.env` or `session-review-48h/`.

## Handoff one-liner for another agent

> Read `C:\Users\tylar\.claude\skills\transcribe\SKILL.md` and this what's-what. Use the CLI only. No MCP. Transcribe the URL, then return title/channel, one-paragraph TLDR, and 3–6 takeaways.
