# omp (`tools/omp/`)

| Path | Live path | Notes |
|------|-----------|--------|
| `config.yml` | `~/.omp/agent/config.yml` | Adopted if present — strip tokens (`searxng.token`, `auth.broker.token`, …) before git commit |
| `extensions/` | `~/.omp/agent/extensions` | Whole-dir symlink |

Skills: `skills/` → `~/.omp/agent/skills/`. Commands: `commands/` → `~/.omp/agent/commands`. Rules: `AGENTS.md` → `~/.omp/agent/AGENTS.md`.

**Never tracked:** `agent.db` (auth), `sessions/`, `models.yml`, `mcp.json`, `.env` stay in `~/.omp/agent`.
