# L'usine à code

Multi-provider AI coding workflow for Claude Code, OpenCode, Codex, Antigravity, and Grok.

## Language

- Respond in the user's language
- Code comments in English
- Commit messages in English: `feat:`, `fix:`, `update:`, `refactor:`, `docs:`, `chore:`

## Git

- Never add AI attribution to commits (`Co-Authored-By`, `Generated with`, etc.)
- One-line commit messages, max 50 chars
- Never use `--no-verify` or skip hooks

## File deletion

- Use `trash` instead of `rm -rf` when available
- Path: `/opt/homebrew/opt/trash/bin/trash`

## Code quality

- Simplicity first: minimal impact, no over-engineering
- No temporary fixes — find root causes
- No comments explaining what code does; only comment non-obvious WHY

## Workflow

- Plan before implementing non-trivial tasks
- Use subagents for research and parallel work
- Verify before marking tasks done

## Project

This repo is the `create-usine` CLI (package at the repo root). It scaffolds a multi-provider harness of skills for coachés, distributed via `npx github:Nardjo/usine`. See the domain glossary in `CONTEXT.md`.