# RTK - Rust Token Killer

Token-optimized CLI proxy (typically 60-90% savings on noisy dev commands).

## Rule (all tools)

When a shell command produces bulky output, prefix it with `rtk` so the filtered result enters context instead of the raw dump.

```bash
rtk git status
rtk git log
rtk git diff
rtk cargo test
rtk npm test
rtk pnpm test
rtk pytest -q
rtk ls
rtk tree
rtk docker ps
rtk gh pr list
```

If a command has no RTK equivalent, run it normally. To force the raw command: `rtk proxy <cmd>`.

## Meta commands

```bash
rtk gain              # Token savings analytics
rtk gain --history    # Recent command savings history
rtk discover          # Analyze history for missed opportunities
rtk proxy <cmd>       # Run without filtering
rtk rewrite <cmd>     # Show rewritten form (dry-run)
```

## Installation check

```bash
rtk --version         # expect: rtk X.Y.Z
rtk gain
which rtk
```

Name collision: if `rtk gain` fails, you may have the wrong `rtk` binary (e.g. Rust Type Kit).

## How it is wired per tool

| Tool | Mode |
|------|------|
| Claude Code | Automatic: PreToolUse hook rewrites commands |
| OpenCode | Automatic: plugin calls `rtk rewrite` |
| Codex | Instruction: this file + AGENTS.md rule (no rewrite hook) |
| Grok | Instruction: this file + AGENTS.md rule |
| omp | Instruction: this file + AGENTS.md rule |
| Antigravity / Gemini | Optional hook via `rtk init -g --gemini` |

This file lives in your harness (`RTK.md`) and is symlinked into each tool home by `setup.sh`.
