# Agent rules

Global rules for your AI coding agents. This file is symlinked into Claude Code (`~/.claude/CLAUDE.md`) and, as `AGENTS.md`/`GEMINI.md`, into OpenCode (`~/.config/opencode/AGENTS.md`), Codex (`~/.codex/AGENTS.md`), Antigravity CLI (`~/.gemini/GEMINI.md`), Grok (`~/.grok/AGENTS.md`), and omp (`~/.omp/agent/AGENTS.md`). Edit it to taste: it's yours.

## Language

- Respond in the user's language.
- Code comments in English.
- Commit messages in English, conventional format: `feat:`, `fix:`, `update:`, `refactor:`, `docs:`, `chore:`.
- Never use em dashes in written output; rephrase, or use a comma, colon, or parentheses.

## Workflow

- **Plan first.** For any non-trivial task (3+ steps or an architectural decision), plan before implementing. If something goes sideways, stop and re-plan rather than pushing on.
- **Use subagents** for research, exploration, and parallel analysis to keep the main context clean. One focused task per subagent.
- **Verify before done.** Never mark a task complete without proving it works: run the tests, check the logs, diff against the previous behavior.
- **Demand elegance.** For non-trivial changes, pause and ask "is there a simpler way?" before presenting. Skip this for obvious fixes; don't over-engineer.
- **Fix autonomously.** Given a bug report, reproduce and resolve it without hand-holding: point at the logs, the failing test, the error, then fix it.

## Self-improvement

- After any correction from the user, record the pattern in `tasks/lessons.md` and write a rule that prevents repeating it.
- Review `tasks/lessons.md` at the start of a session.

## Git

- Never add AI attribution to commits or PRs (`Co-Authored-By`, "Generated with", etc.).
- One-line commit messages, max 50 chars unless asked otherwise.
- Never use `--no-verify` or skip hooks.

## File deletion

- **Never** use `rm` / `rm -rf` to delete files or folders. Always use `trash` so items land in the macOS Trash (recoverable).
- Prefer the Homebrew CLI if present: `/opt/homebrew/opt/trash/bin/trash` (or `$(brew --prefix)/opt/trash/bin/trash`), else `trash` on `PATH`.
- Only if `trash` is unavailable: stop and ask the user — do not fall back to `rm`.

## Task management

- Write the plan to `tasks/todo.md` as checkable items; confirm before implementing.
- Mark items complete as you go; add a short review section when done.

## Discipline

- **Ask before assuming.** If anything is ambiguous or incomplete, ask before writing a single line of code. Never make an implicit assumption about intent, architecture, constraints, or business needs.
- **Simplest solution first.** Start with the simplest solution that solves the problem. Don't add abstractions, layers, config options, or generic mechanisms that weren't explicitly requested.
- **Limit the scope of changes.** Touch only the files and code directly relevant to the task. Leave anything not needed for the solution unchanged, even if improvements seem possible.
- **Flag uncertainty.** If you're unsure about an approach, a technical choice, or expected behavior, say so before acting. Better to surface uncertainty than proceed with false certainty; when in doubt, ask for clarification.
- **No temporary fixes.** Find the root cause, to senior-engineer standards.

## Skills

This harness ships a curated set of Agent Skills. See [SKILLS.md](SKILLS.md) for the catalog, and invoke a skill by name when a task matches its description.

- **Source of truth: this harness** (`skills/`, `commands/`, `tools/`). Never leave a new skill only under a tool home (`~/.claude/skills`, `~/.agents/skills`, `~/.grok/skills`, `~/.config/opencode/skills`, `~/.gemini/skills`, `~/.omp/agent/skills`, or `~/.cli/…/skills`).
- To install or adopt any skill (api2cli, skills.sh, GitHub, cloud, or a folder already dropped in a tool home): use the **`install-skill`** skill, then `bash setup.sh`.

## RTK

- Prefix noisy shell commands with `rtk` (`git status`/`log`/`diff`, tests, package managers, `ls`/`tree`, docker, `gh`).
- Details and per-tool wiring: [RTK.md](RTK.md).

