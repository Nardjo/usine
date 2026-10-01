#!/usr/bin/env bash
# Wire this harness into every installed AI coding tool, in two passes:
#   1. ADOPT  — pull the coaché's existing personal skills/commands/config/hooks
#               into this harness, so the scaffolded folder becomes the single
#               source of truth. Nothing is lost.
#   2. LINK   — symlink the harness back into each tool.
# Re-run any time (after installing a new tool, for example). Idempotent: once a
# tool's entry is a symlink it is left alone, so a second run is a no-op.
#
# Structure:
#   skills/              — shared across all tools (same SKILL.md format)
#   commands/            — shared across all tools
#   tools/claude/        — settings.json + hooks/ + agents/ + plugins/ (no cache)
#   tools/opencode/      — opencode.json + tui.json + plugins/ + agent/
#   tools/codex/         — hooks.json + config.toml + agents/ + rules/
#   tools/gemini/        — settings.json + agents/ + hooks/ (Antigravity)
#   tools/grok/          — config.toml + hooks/
#   tools/omp/           — config.yml + extensions/
#   CLAUDE.md / AGENTS.md — global rules, symlinked per tool
# Secrets stay local: settings.local.json, auth.json, credentials, oauth.

set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- helpers ---------------------------------------------------------------

# Pick a non-colliding destination path inside $harness_dir for $name.
# On collision the adopted entry is suffixed with -local (keeping both):
#   dir   tdd      -> tdd-local, tdd-local2, ...
#   file  ship.md  -> ship-local.md  (suffix inserted before the extension)
dest_path() {
  local harness_dir="$1" name="$2" is_dir="$3"
  if [ ! -e "$harness_dir/$name" ]; then
    printf '%s' "$harness_dir/$name"
    return
  fi
  local stem ext
  if [ "$is_dir" = "1" ] || [[ "$name" != *.* ]]; then
    stem="$name"; ext=""
  else
    stem="${name%.*}"; ext=".${name##*.}"
  fi
  local n=1 candidate="$harness_dir/${stem}-local${ext}"
  while [ -e "$candidate" ]; do
    n=$((n + 1))
    candidate="$harness_dir/${stem}-local${n}${ext}"
  done
  printf '%s' "$candidate"
}

# Move every real (non-symlink) entry of $tool_dir into $harness_dir.
# Symlinks are skipped — they are already managed (by us or another tool).
adopt_dir() {
  local tool_dir="$1" harness_dir="$2"
  [ -d "$tool_dir" ] || return 0
  if [ -L "$tool_dir" ]; then return 0; fi
  local entry name is_dir target
  for entry in "$tool_dir"/*; do
    [ -e "$entry" ] || continue
    if [ -L "$entry" ]; then continue; fi
    is_dir=0
    if [ -d "$entry" ]; then is_dir=1; fi
    name="$(basename "$entry")"
    mkdir -p "$harness_dir"
    target="$(dest_path "$harness_dir" "$name" "$is_dir")"
    mv "$entry" "$target"
    echo "  adopté ($(basename "$harness_dir")): $name → $(basename "$target")"
  done
}

# Append a tool's personal config into the harness config, then back it up.
# Skips a config that is already a symlink (re-run) or has already been imported.
adopt_config() {
  local tool_cfg="$1" harness_cfg="$2" provider="$3"
  [ -e "$tool_cfg" ] || return 0
  if [ -L "$tool_cfg" ]; then return 0; fi
  [ -f "$harness_cfg" ] || return 0
  [ -s "$tool_cfg" ] || return 0
  local marker="<!-- usine:imported:$provider -->"
  # Pre-rebrand harnesses carry the cerberus marker.
  if ! grep -qF -e "$marker" -e "<!-- cerberus:imported:$provider -->" "$harness_cfg"; then
    {
      printf '\n\n%s\n' "$marker"
      printf '## Config importée (%s)\n\n' "$provider"
      cat "$tool_cfg"
    } >> "$harness_cfg"
    echo "  config importée ($provider) → $(basename "$harness_cfg")"
  fi
  mv "$tool_cfg" "$tool_cfg.bak"
  echo "  sauvegarde: $(basename "$tool_cfg") → $(basename "$tool_cfg").bak"
}

# Move a real file into the harness only when the harness target is missing.
# If the harness already has the file, leave the live file for link_config.
adopt_file() {
  local live="$1" hub="$2"
  [ -e "$live" ] || return 0
  if [ -L "$live" ]; then return 0; fi
  if [ -e "$hub" ]; then return 0; fi
  mkdir -p "$(dirname "$hub")"
  mv "$live" "$hub"
  echo "  adopté: $(basename "$live") → ${hub#$HARNESS_DIR/}"
}

# Move a real directory into the harness only when the hub dir is missing/empty.
# If the hub already has content, leave the live dir for link_tree.
adopt_tree() {
  local live="$1" hub="$2"
  [ -d "$live" ] || return 0
  if [ -L "$live" ]; then return 0; fi
  if [ -d "$hub" ] && [ -n "$(ls -A "$hub" 2>/dev/null)" ]; then return 0; fi
  mkdir -p "$(dirname "$hub")"
  if [ -d "$hub" ]; then
    rmdir "$hub" 2>/dev/null || return 0
  fi
  if [ -e "$hub" ]; then return 0; fi
  mv "$live" "$hub"
  echo "  adopté: $(basename "$live")/ → ${hub#$HARNESS_DIR/}/"
}

# Like adopt_dir, but skip names listed after the first two args (e.g. cache).
# Used for Claude plugins: keep runtime cache under ~/.claude, pull the rest.
adopt_dir_except() {
  local tool_dir="$1" harness_dir="$2"
  shift 2
  local -a skip=("$@")
  [ -d "$tool_dir" ] || return 0
  if [ -L "$tool_dir" ]; then return 0; fi
  local entry name is_dir target s skip_it
  for entry in "$tool_dir"/*; do
    [ -e "$entry" ] || continue
    if [ -L "$entry" ]; then continue; fi
    name="$(basename "$entry")"
    skip_it=0
    for s in "${skip[@]}"; do
      if [ "$name" = "$s" ]; then skip_it=1; break; fi
    done
    [ "$skip_it" -eq 0 ] || continue
    is_dir=0
    if [ -d "$entry" ]; then is_dir=1; fi
    mkdir -p "$harness_dir"
    target="$(dest_path "$harness_dir" "$name" "$is_dir")"
    mv "$entry" "$target"
    echo "  adopté ($(basename "$harness_dir")): $name → $(basename "$target")"
  done
}

# Symlink every entry of $src_dir into $dest. No-op if $src_dir is empty/absent.
# Used for skills: $dest stays a real dir holding one symlink per skill.
link_dir() {
  local src_dir="$1" dest="$2"
  [ -d "$src_dir" ] || return 0
  local entry name target
  for entry in "$src_dir"/*; do
    [ -e "$entry" ] || continue
    mkdir -p "$dest"
    name="$(basename "$entry")"
    target="$dest/$name"
    if [ -L "$target" ]; then rm "$target"; fi
    ln -s "$entry" "$target"
  done
}

# Symlink $src_dir itself as $dest (whole-dir link). No-op if $src_dir is empty/absent.
# Used for commands/agents/hooks/plugins: $dest becomes a single symlink to the
# harness dir, so new entries appear automatically. An existing real $dest is
# emptied by adoption first, then removed; a non-empty leftover is backed up.
link_tree() {
  local src_dir="$1" dest="$2"
  [ -d "$src_dir" ] || return 0
  if [ -z "$(ls -A "$src_dir" 2>/dev/null)" ]; then return 0; fi
  mkdir -p "$(dirname "$dest")"
  if [ -L "$dest" ]; then
    rm "$dest"
  elif [ -d "$dest" ]; then
    rmdir "$dest" 2>/dev/null || { mv "$dest" "$dest.bak"; echo "  sauvegarde: $(basename "$dest")/ → $(basename "$dest").bak"; }
  elif [ -e "$dest" ]; then
    mv "$dest" "$dest.bak"
  fi
  ln -s "$src_dir" "$dest"
}

link_config() {
  local src="$1" dest="$2"
  [ -f "$src" ] || return 0
  mkdir -p "$(dirname "$dest")"
  if [ -L "$dest" ]; then
    rm "$dest"
  elif [ -e "$dest" ]; then
    mv "$dest" "$dest.bak"
    echo "  sauvegarde: $(basename "$dest") → $(basename "$dest").bak"
  fi
  ln -s "$src" "$dest"
}

# --- pass 1: adopt the coaché's existing content into the harness ----------

if [ -d "$HOME/.claude" ]; then
  adopt_dir    "$HOME/.claude/skills"   "$HARNESS_DIR/skills"
  adopt_dir    "$HOME/.claude/commands" "$HARNESS_DIR/commands"
  adopt_dir    "$HOME/.claude/agents"   "$HARNESS_DIR/tools/claude/agents"
  adopt_dir    "$HOME/.claude/hooks"    "$HARNESS_DIR/tools/claude/hooks"
  # plugins: marketplaces + install metadata; runtime cache/ stays under ~/.claude
  adopt_dir_except "$HOME/.claude/plugins" "$HARNESS_DIR/tools/claude/plugins" "cache"
  adopt_file   "$HOME/.claude/settings.json" "$HARNESS_DIR/tools/claude/settings.json"
  # settings.local.json stays local (API tokens / machine secrets) — never adopt.
  adopt_config "$HOME/.claude/CLAUDE.md" "$HARNESS_DIR/CLAUDE.md" "Claude Code"
fi

if [ -d "$HOME/.config/opencode" ]; then
  adopt_dir    "$HOME/.config/opencode/skills"   "$HARNESS_DIR/skills"
  adopt_dir    "$HOME/.config/opencode/commands" "$HARNESS_DIR/commands"
  adopt_dir    "$HOME/.config/opencode/agent"    "$HARNESS_DIR/tools/opencode/agent"
  adopt_file   "$HOME/.config/opencode/opencode.json" "$HARNESS_DIR/tools/opencode/opencode.json"
  adopt_file   "$HOME/.config/opencode/tui.json"      "$HARNESS_DIR/tools/opencode/tui.json"
  adopt_tree   "$HOME/.config/opencode/plugins" "$HARNESS_DIR/tools/opencode/plugins"
  adopt_config "$HOME/.config/opencode/AGENTS.md" "$HARNESS_DIR/AGENTS.md" "OpenCode"
fi

if [ -d "$HOME/.codex" ]; then
  adopt_dir    "$HOME/.agents/skills" "$HARNESS_DIR/skills"
  adopt_dir    "$HOME/.codex/agents"  "$HARNESS_DIR/tools/codex/agents"
  adopt_dir    "$HOME/.codex/rules"   "$HARNESS_DIR/tools/codex/rules"
  adopt_file   "$HOME/.codex/hooks.json"  "$HARNESS_DIR/tools/codex/hooks.json"
  adopt_file   "$HOME/.codex/config.toml" "$HARNESS_DIR/tools/codex/config.toml"
  # ~/.codex/plugins is marketplace cache/staging (hundreds of MB) — never adopt.
  adopt_config "$HOME/.codex/AGENTS.md" "$HARNESS_DIR/AGENTS.md" "Codex"
fi

# Antigravity CLI reuses Gemini's ~/.gemini dir (instructions live in GEMINI.md).
if [ -d "$HOME/.gemini" ]; then
  adopt_dir    "$HOME/.gemini/skills"   "$HARNESS_DIR/skills"
  adopt_dir    "$HOME/.gemini/commands" "$HARNESS_DIR/commands"
  adopt_dir    "$HOME/.gemini/agents"   "$HARNESS_DIR/tools/gemini/agents"
  adopt_dir    "$HOME/.gemini/hooks"    "$HARNESS_DIR/tools/gemini/hooks"
  adopt_file   "$HOME/.gemini/settings.json" "$HARNESS_DIR/tools/gemini/settings.json"
  adopt_config "$HOME/.gemini/GEMINI.md" "$HARNESS_DIR/AGENTS.md" "Antigravity"
fi

if [ -d "$HOME/.grok" ]; then
  adopt_dir    "$HOME/.grok/skills"   "$HARNESS_DIR/skills"
  adopt_dir    "$HOME/.grok/commands" "$HARNESS_DIR/commands"
  adopt_dir    "$HOME/.grok/hooks"    "$HARNESS_DIR/tools/grok/hooks"
  adopt_file   "$HOME/.grok/config.toml" "$HARNESS_DIR/tools/grok/config.toml"
  adopt_config "$HOME/.grok/AGENTS.md" "$HARNESS_DIR/AGENTS.md" "Grok"
fi

# omp (oh-my-pi): agent state, auth (agent.db), sessions, models.yml and
# mcp.json stay local in ~/.omp/agent.
if [ -d "$HOME/.omp/agent" ]; then
  adopt_dir    "$HOME/.omp/agent/skills"     "$HARNESS_DIR/skills"
  adopt_dir    "$HOME/.omp/agent/commands"   "$HARNESS_DIR/commands"
  adopt_dir    "$HOME/.omp/agent/extensions" "$HARNESS_DIR/tools/omp/extensions"
  adopt_file   "$HOME/.omp/agent/config.yml" "$HARNESS_DIR/tools/omp/config.yml"
  adopt_config "$HOME/.omp/agent/AGENTS.md"  "$HARNESS_DIR/AGENTS.md" "omp"
fi

# --- pass 2: link the harness into every installed tool --------------------

linked=()

if [ -d "$HOME/.claude" ]; then
  link_dir    "$HARNESS_DIR/skills"                 "$HOME/.claude/skills"
  link_tree   "$HARNESS_DIR/commands"               "$HOME/.claude/commands"
  link_tree   "$HARNESS_DIR/tools/claude/agents"    "$HOME/.claude/agents"
  link_tree   "$HARNESS_DIR/tools/claude/hooks"     "$HOME/.claude/hooks"
  # Per-entry links so ~/.claude/plugins/cache can remain a real local dir.
  link_dir    "$HARNESS_DIR/tools/claude/plugins"   "$HOME/.claude/plugins"
  link_config "$HARNESS_DIR/tools/claude/settings.json" "$HOME/.claude/settings.json"
  link_config "$HARNESS_DIR/CLAUDE.md"              "$HOME/.claude/CLAUDE.md"
  link_config "$HARNESS_DIR/RTK.md"                 "$HOME/.claude/RTK.md"
  linked+=("Claude Code")
fi

if [ -d "$HOME/.config/opencode" ]; then
  link_dir    "$HARNESS_DIR/skills"                 "$HOME/.config/opencode/skills"
  link_tree   "$HARNESS_DIR/commands"               "$HOME/.config/opencode/commands"
  link_tree   "$HARNESS_DIR/tools/opencode/agent"   "$HOME/.config/opencode/agent"
  link_config "$HARNESS_DIR/tools/opencode/opencode.json" "$HOME/.config/opencode/opencode.json"
  link_config "$HARNESS_DIR/tools/opencode/tui.json"      "$HOME/.config/opencode/tui.json"
  link_tree   "$HARNESS_DIR/tools/opencode/plugins" "$HOME/.config/opencode/plugins"
  link_config "$HARNESS_DIR/AGENTS.md"              "$HOME/.config/opencode/AGENTS.md"
  linked+=("OpenCode")
fi

if [ -d "$HOME/.codex" ]; then
  link_dir    "$HARNESS_DIR/skills"                 "$HOME/.agents/skills"
  link_tree   "$HARNESS_DIR/tools/codex/agents"     "$HOME/.codex/agents"
  link_tree   "$HARNESS_DIR/tools/codex/rules"      "$HOME/.codex/rules"
  link_config "$HARNESS_DIR/tools/codex/hooks.json"  "$HOME/.codex/hooks.json"
  link_config "$HARNESS_DIR/tools/codex/config.toml" "$HOME/.codex/config.toml"
  link_config "$HARNESS_DIR/AGENTS.md"              "$HOME/.codex/AGENTS.md"
  link_config "$HARNESS_DIR/RTK.md"                 "$HOME/.codex/RTK.md"
  linked+=("Codex")
fi

if [ -d "$HOME/.gemini" ]; then
  link_dir    "$HARNESS_DIR/skills"                 "$HOME/.gemini/skills"
  link_tree   "$HARNESS_DIR/commands"               "$HOME/.gemini/commands"
  link_tree   "$HARNESS_DIR/tools/gemini/agents"    "$HOME/.gemini/agents"
  link_tree   "$HARNESS_DIR/tools/gemini/hooks"     "$HOME/.gemini/hooks"
  link_config "$HARNESS_DIR/tools/gemini/settings.json" "$HOME/.gemini/settings.json"
  link_config "$HARNESS_DIR/AGENTS.md"              "$HOME/.gemini/GEMINI.md"
  linked+=("Antigravity")
fi

if [ -d "$HOME/.grok" ]; then
  # Real dirs that collide with harness skill names must yield so link_dir can replace them.
  if [ -d "$HARNESS_DIR/skills" ] && [ -d "$HOME/.grok/skills" ]; then
    for entry in "$HARNESS_DIR/skills"/*; do
      [ -e "$entry" ] || continue
      name="$(basename "$entry")"
      target="$HOME/.grok/skills/$name"
      if [ -e "$target" ] && [ ! -L "$target" ]; then
        mv "$target" "$target.bak"
        echo "  sauvegarde: skills/$name → skills/$name.bak"
      fi
    done
  fi
  link_dir    "$HARNESS_DIR/skills"                 "$HOME/.grok/skills"
  link_tree   "$HARNESS_DIR/commands"               "$HOME/.grok/commands"
  link_tree   "$HARNESS_DIR/tools/grok/hooks"       "$HOME/.grok/hooks"
  link_config "$HARNESS_DIR/tools/grok/config.toml" "$HOME/.grok/config.toml"
  link_config "$HARNESS_DIR/AGENTS.md"              "$HOME/.grok/AGENTS.md"
  link_config "$HARNESS_DIR/RTK.md"                 "$HOME/.grok/RTK.md"
  linked+=("Grok")
fi

if [ -d "$HOME/.omp/agent" ]; then
  # omp dedupes skills by realpath, so the same symlinks seen through
  # ~/.claude/skills do not show up twice.
  link_dir    "$HARNESS_DIR/skills"                 "$HOME/.omp/agent/skills"
  link_tree   "$HARNESS_DIR/commands"               "$HOME/.omp/agent/commands"
  link_tree   "$HARNESS_DIR/tools/omp/extensions"   "$HOME/.omp/agent/extensions"
  link_config "$HARNESS_DIR/tools/omp/config.yml"   "$HOME/.omp/agent/config.yml"
  link_config "$HARNESS_DIR/AGENTS.md"              "$HOME/.omp/agent/AGENTS.md"
  link_config "$HARNESS_DIR/RTK.md"                 "$HOME/.omp/agent/RTK.md"
  linked+=("omp")
fi

if [ ${#linked[@]} -eq 0 ]; then
  echo "Aucun outil détecté (Claude Code, OpenCode, Codex, Antigravity, Grok, omp). Rien lié."
  echo "Installe un outil puis relance : bash setup.sh"
else
  echo "Harness lié à : ${linked[*]}"
fi

# trash — recoverable deletes (macOS Trash) instead of rm -rf.
# Homebrew formula is keg-only; agents use the full path from CLAUDE.md / AGENTS.md.
# Skip with CC_SKIP_TRASH=1 (tests / offline / non-macOS without brew).
if [ "${CC_SKIP_TRASH:-}" != "1" ]; then
  trash_bin=""
  if [ -x /opt/homebrew/opt/trash/bin/trash ]; then
    trash_bin=/opt/homebrew/opt/trash/bin/trash
  elif [ -x /usr/local/opt/trash/bin/trash ]; then
    trash_bin=/usr/local/opt/trash/bin/trash
  elif command -v brew >/dev/null 2>&1; then
    _bp="$(brew --prefix 2>/dev/null || true)"
    if [ -n "$_bp" ] && [ -x "$_bp/opt/trash/bin/trash" ]; then
      trash_bin="$_bp/opt/trash/bin/trash"
    fi
  fi
  # Prefer hasseg `trash` over Apple's /usr/bin/trash when both exist.
  if [ -z "$trash_bin" ] && command -v trash >/dev/null 2>&1; then
    _t="$(command -v trash)"
    # Ignore Apple's stub if we still plan to brew-install the real CLI.
    if [ "$_t" != "/usr/bin/trash" ]; then
      trash_bin="$_t"
    fi
  fi

  if [ -z "$trash_bin" ]; then
    echo "trash absent — installation (suppressions récupérables)…"
    if command -v brew >/dev/null 2>&1; then
      if brew install trash; then
        _bp="$(brew --prefix 2>/dev/null || true)"
        if [ -n "$_bp" ] && [ -x "$_bp/opt/trash/bin/trash" ]; then
          trash_bin="$_bp/opt/trash/bin/trash"
        fi
        echo "  ✓ trash installé (keg-only Homebrew)"
      else
        echo "  ⚠ brew install trash a échoué — installe manuellement : brew install trash"
      fi
    else
      echo "  ⚠ Homebrew absent — installe trash à la main (macOS: brew install trash)"
    fi
  fi

  if [ -n "$trash_bin" ]; then
    echo "trash prêt ($trash_bin) — les agents doivent l'utiliser à la place de rm"
  else
    echo "trash non disponible — les règles du harness interdisent rm ; installe puis relance setup.sh"
  fi
fi

# rtk (Rust Token Killer) — install if missing, then wire hooks.
# Claude/OpenCode: rewrite hooks via `rtk init`. Codex/Grok/omp: RTK.md + AGENTS.md rule.
# Do NOT run `rtk init --codex`: it replaces the AGENTS.md symlink with a real file.
# Skip entirely with CC_SKIP_RTK=1 (tests / offline).
if [ "${CC_SKIP_RTK:-}" != "1" ]; then
  if ! command -v rtk >/dev/null 2>&1; then
    echo "RTK absent — installation (économies de tokens)…"
    if command -v brew >/dev/null 2>&1; then
      if brew install rtk; then
        echo "  ✓ rtk installé via Homebrew"
      else
        echo "  ⚠ brew install rtk a échoué — installe manuellement : brew install rtk"
      fi
    elif command -v curl >/dev/null 2>&1; then
      if curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh; then
        export PATH="${HOME}/.local/bin:${PATH}"
        echo "  ✓ rtk installé dans ~/.local/bin"
      else
        echo "  ⚠ install rtk a échoué — voir https://github.com/rtk-ai/rtk"
      fi
    else
      echo "  ⚠ Impossible d'installer rtk auto. Manuellement : brew install rtk"
      echo "    (ou curl install : https://github.com/rtk-ai/rtk )"
    fi
  fi

  if command -v rtk >/dev/null 2>&1; then
    # Prefer non-interactive patch when available.
    if [ -d "$HOME/.config/opencode" ]; then
      rtk init -g --opencode --auto-patch >/dev/null 2>&1 \
        || rtk init -g --opencode >/dev/null 2>&1 \
        || true
    else
      rtk init -g --auto-patch >/dev/null 2>&1 \
        || rtk init -g >/dev/null 2>&1 \
        || true
    fi
    if [ -d "$HOME/.gemini" ]; then
      rtk init -g --gemini --auto-patch >/dev/null 2>&1 \
        || rtk init -g --gemini >/dev/null 2>&1 \
        || true
    fi
    echo "rtk prêt ($(rtk --version 2>/dev/null || echo ok)) — hooks Claude/OpenCode ; instructions Codex/Grok/omp via RTK.md"
  else
    echo "rtk non disponible — le harness a RTK.md ; installe le binaire puis relance setup.sh"
  fi
fi
