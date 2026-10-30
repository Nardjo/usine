#!/usr/bin/env node
// Wire this harness into every installed AI coding tool, in two passes:
//   1. ADOPT  — pull the coaché's existing personal skills/commands/config/hooks
//               into this harness, so the scaffolded folder becomes the single
//               source of truth. Nothing is lost.
//   2. LINK   — symlink the harness back into each tool.
// Re-run any time (after installing a new tool, for example). Idempotent: once a
// tool's entry is a symlink it is left alone, so a second run is a no-op.
// Runs on macOS, Linux and Windows with nothing but Node: `node setup.mjs`.
//
// Structure:
//   skills/              — shared across all tools (same SKILL.md format)
//   commands/            — shared across all tools
//   tools/claude/        — settings.json + hooks/ + agents/ + plugins/ (no cache)
//   tools/opencode/      — opencode.json + tui.json + plugins/ + agent/
//   tools/codex/         — hooks.json + config.toml + agents/ + rules/
//   tools/gemini/        — settings.json + agents/ + hooks/ (Antigravity)
//   tools/grok/          — config.toml + hooks/
//   CLAUDE.md / AGENTS.md — global rules, symlinked per tool
// Secrets stay local: settings.local.json, auth.json, credentials, oauth.

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

// --- fs helpers ------------------------------------------------------------

const lstatOrNull = (p) => {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
};
const statOrNull = (p) => {
  try {
    return statSync(p);
  } catch {
    return null;
  }
};
const isLink = (p) => lstatOrNull(p)?.isSymbolicLink() ?? false;
const isDir = (p) => statOrNull(p)?.isDirectory() ?? false;
const isFile = (p) => statOrNull(p)?.isFile() ?? false;
// Follows symlinks: a dangling link does not exist.
const exists = (p) => statOrNull(p) !== null;
const isEmptyDir = (p) => readdirSync(p).length === 0;

// Visible entries, sorted (dotfiles skipped, dangling symlinks skipped).
function entries(dir) {
  return readdirSync(dir)
    .filter((name) => !name.startsWith("."))
    .sort()
    .map((name) => join(dir, name))
    .filter(exists);
}

// rename, falling back to copy + delete across volumes (harness on D:, home on C:).
function move(from, to) {
  try {
    renameSync(from, to);
  } catch (err) {
    if (err.code !== "EXDEV") throw err;
    cpSync(from, to, { recursive: true, verbatimSymlinks: true });
    rmSync(from, { recursive: true, force: true });
  }
}

// Windows junctions are removed with rmdir, everything else with unlink.
function removeLink(p) {
  try {
    unlinkSync(p);
  } catch (err) {
    if (!IS_WIN) throw err;
    rmdirSync(p);
  }
}

// Directories become junctions on Windows: no admin or Developer Mode needed.
function makeLink(target, path) {
  const type = isDir(target) ? (IS_WIN ? "junction" : "dir") : "file";
  symlinkSync(target, path, type);
}

const rel = (p) => relative(HARNESS_DIR, p).split("\\").join("/");

// --- helpers ---------------------------------------------------------------

// Pick a non-colliding destination path inside harnessDir for name.
// On collision the adopted entry is suffixed with -local (keeping both):
//   dir   tdd      -> tdd-local, tdd-local2, ...
//   file  ship.md  -> ship-local.md  (suffix inserted before the extension)
function destPath(harnessDir, name, dir) {
  if (!existsSync(join(harnessDir, name))) return join(harnessDir, name);
  const ext = dir ? "" : extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  let n = 1;
  let candidate = join(harnessDir, `${stem}-local${ext}`);
  while (existsSync(candidate)) {
    n += 1;
    candidate = join(harnessDir, `${stem}-local${n}${ext}`);
  }
  return candidate;
}

// Move every real (non-symlink) entry of toolDir into harnessDir, except skip.
// Symlinks are skipped — they are already managed (by us or another tool).
function adoptDir(toolDir, harnessDir, skip = []) {
  if (!isDir(toolDir) || isLink(toolDir)) return;
  for (const entry of entries(toolDir)) {
    const name = basename(entry);
    if (isLink(entry) || skip.includes(name)) continue;
    mkdirSync(harnessDir, { recursive: true });
    const target = destPath(harnessDir, name, isDir(entry));
    move(entry, target);
    console.log(`  adopté (${basename(harnessDir)}): ${name} → ${basename(target)}`);
  }
}

// Append a tool's personal config into the harness config, then back it up.
// Skips a config that is already a symlink (re-run) or has already been imported.
function adoptConfig(toolCfg, harnessCfg, provider) {
  if (!exists(toolCfg) || isLink(toolCfg)) return;
  if (!isFile(harnessCfg)) return;
  if (statSync(toolCfg).size === 0) return;
  const marker = `<!-- usine:imported:${provider} -->`;
  const current = readFileSync(harnessCfg, "utf8");
  // Pre-rebrand harnesses carry the cerberus marker.
  if (!current.includes(marker) && !current.includes(`<!-- cerberus:imported:${provider} -->`)) {
    appendFileSync(
      harnessCfg,
      `\n\n${marker}\n## Config importée (${provider})\n\n${readFileSync(toolCfg, "utf8")}`,
    );
    console.log(`  config importée (${provider}) → ${basename(harnessCfg)}`);
  }
  move(toolCfg, `${toolCfg}.bak`);
  console.log(`  sauvegarde: ${basename(toolCfg)} → ${basename(toolCfg)}.bak`);
}

// Move a real file into the harness only when the harness target is missing.
// If the harness already has the file, leave the live file for linkConfig.
function adoptFile(live, hub) {
  if (!exists(live) || isLink(live) || existsSync(hub)) return;
  mkdirSync(dirname(hub), { recursive: true });
  move(live, hub);
  console.log(`  adopté: ${basename(live)} → ${rel(hub)}`);
}

// Move a real directory into the harness only when the hub dir is missing/empty.
// If the hub already has content, leave the live dir for linkTree.
function adoptTree(live, hub) {
  if (!isDir(live) || isLink(live)) return;
  if (isDir(hub) && !isEmptyDir(hub)) return;
  mkdirSync(dirname(hub), { recursive: true });
  if (isDir(hub)) rmdirSync(hub);
  if (existsSync(hub)) return;
  move(live, hub);
  console.log(`  adopté: ${basename(live)}/ → ${rel(hub)}/`);
}

// Symlink every entry of srcDir into dest. No-op if srcDir is empty/absent.
// Used for skills: dest stays a real dir holding one symlink per skill.
// A real entry that collides with a harness name is backed up to .bak.
function linkDir(srcDir, dest) {
  if (!isDir(srcDir)) return;
  for (const entry of entries(srcDir)) {
    mkdirSync(dest, { recursive: true });
    const name = basename(entry);
    const target = join(dest, name);
    if (isLink(target)) {
      removeLink(target);
    } else if (existsSync(target)) {
      move(target, `${target}.bak`);
      console.log(`  sauvegarde: ${basename(dest)}/${name} → ${basename(dest)}/${name}.bak`);
    }
    makeLink(entry, target);
  }
}

// Symlink srcDir itself as dest (whole-dir link). No-op if srcDir is empty/absent.
// Used for commands/agents/hooks/plugins: dest becomes a single symlink to the
// harness dir, so new entries appear automatically. An existing real dest is
// emptied by adoption first, then removed; a non-empty leftover is backed up.
function linkTree(srcDir, dest) {
  if (!isDir(srcDir) || isEmptyDir(srcDir)) return;
  mkdirSync(dirname(dest), { recursive: true });
  if (isLink(dest)) {
    removeLink(dest);
  } else if (isDir(dest)) {
    if (isEmptyDir(dest)) {
      rmdirSync(dest);
    } else {
      move(dest, `${dest}.bak`);
      console.log(`  sauvegarde: ${basename(dest)}/ → ${basename(dest)}.bak`);
    }
  } else if (existsSync(dest)) {
    move(dest, `${dest}.bak`);
  }
  makeLink(srcDir, dest);
}

function linkConfig(src, dest) {
  if (!isFile(src)) return;
  mkdirSync(dirname(dest), { recursive: true });
  if (isLink(dest)) {
    removeLink(dest);
  } else if (lstatOrNull(dest)) {
    move(dest, `${dest}.bak`);
    console.log(`  sauvegarde: ${basename(dest)} → ${basename(dest)}.bak`);
  }
  makeLink(src, dest);
}

// Windows only allows file symlinks with Developer Mode (or admin). Check before
// touching anything so a half-wired home never happens.
function assertCanSymlinkFiles() {
  if (!IS_WIN) return;
  const dir = mkdtempSync(join(tmpdir(), "usine-"));
  try {
    writeFileSync(join(dir, "a"), "");
    symlinkSync(join(dir, "a"), join(dir, "b"), "file");
  } catch (err) {
    if (err.code !== "EPERM") throw err;
    console.error(
      "Windows refuse les liens symboliques de fichiers.\n" +
        "Active le Mode développeur (Paramètres → Système → Espace développeurs), puis relance : node setup.mjs",
    );
    process.exit(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- process helpers -------------------------------------------------------

function which(cmd) {
  const exts = IS_WIN ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = join(dir, cmd + ext);
      if (isFile(p)) return p;
    }
  }
  return null;
}

// Commands are constant strings; the shell resolves npm.cmd / brew / pipes.
function sh(command, { quiet = false } = {}) {
  return (
    spawnSync(command, { shell: true, stdio: quiet ? "ignore" : "inherit" }).status === 0
  );
}

function capture(command) {
  const r = spawnSync(command, { shell: true, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}

// --- pass 1: adopt the coaché's existing content into the harness ----------

assertCanSymlinkFiles();

const H = (...p) => join(HARNESS_DIR, ...p);
const U = (...p) => join(HOME, ...p);

if (isDir(U(".claude"))) {
  adoptDir(U(".claude/skills"), H("skills"));
  adoptDir(U(".claude/commands"), H("commands"));
  adoptDir(U(".claude/agents"), H("tools/claude/agents"));
  adoptDir(U(".claude/hooks"), H("tools/claude/hooks"));
  // plugins: marketplaces + install metadata; runtime cache/ stays under ~/.claude
  adoptDir(U(".claude/plugins"), H("tools/claude/plugins"), ["cache"]);
  adoptFile(U(".claude/settings.json"), H("tools/claude/settings.json"));
  // settings.local.json stays local (API tokens / machine secrets) — never adopt.
  adoptConfig(U(".claude/CLAUDE.md"), H("CLAUDE.md"), "Claude Code");
}

if (isDir(U(".config/opencode"))) {
  adoptDir(U(".config/opencode/skills"), H("skills"));
  adoptDir(U(".config/opencode/commands"), H("commands"));
  adoptDir(U(".config/opencode/agent"), H("tools/opencode/agent"));
  adoptFile(U(".config/opencode/opencode.json"), H("tools/opencode/opencode.json"));
  adoptFile(U(".config/opencode/tui.json"), H("tools/opencode/tui.json"));
  adoptTree(U(".config/opencode/plugins"), H("tools/opencode/plugins"));
  adoptConfig(U(".config/opencode/AGENTS.md"), H("AGENTS.md"), "OpenCode");
}

if (isDir(U(".codex"))) {
  adoptDir(U(".agents/skills"), H("skills"));
  adoptDir(U(".codex/agents"), H("tools/codex/agents"));
  adoptDir(U(".codex/rules"), H("tools/codex/rules"));
  adoptFile(U(".codex/hooks.json"), H("tools/codex/hooks.json"));
  adoptFile(U(".codex/config.toml"), H("tools/codex/config.toml"));
  // ~/.codex/plugins is marketplace cache/staging (hundreds of MB) — never adopt.
  adoptConfig(U(".codex/AGENTS.md"), H("AGENTS.md"), "Codex");
}

// Antigravity CLI reuses Gemini's ~/.gemini dir (instructions live in GEMINI.md).
if (isDir(U(".gemini"))) {
  adoptDir(U(".gemini/skills"), H("skills"));
  adoptDir(U(".gemini/commands"), H("commands"));
  adoptDir(U(".gemini/agents"), H("tools/gemini/agents"));
  adoptDir(U(".gemini/hooks"), H("tools/gemini/hooks"));
  adoptFile(U(".gemini/settings.json"), H("tools/gemini/settings.json"));
  adoptConfig(U(".gemini/GEMINI.md"), H("AGENTS.md"), "Antigravity");
}

if (isDir(U(".grok"))) {
  adoptDir(U(".grok/skills"), H("skills"));
  adoptDir(U(".grok/commands"), H("commands"));
  adoptDir(U(".grok/hooks"), H("tools/grok/hooks"));
  adoptFile(U(".grok/config.toml"), H("tools/grok/config.toml"));
  adoptConfig(U(".grok/AGENTS.md"), H("AGENTS.md"), "Grok");
}

// --- pass 2: link the harness into every installed tool --------------------

const linked = [];

if (isDir(U(".claude"))) {
  linkDir(H("skills"), U(".claude/skills"));
  linkTree(H("commands"), U(".claude/commands"));
  linkTree(H("tools/claude/agents"), U(".claude/agents"));
  linkTree(H("tools/claude/hooks"), U(".claude/hooks"));
  // Per-entry links so ~/.claude/plugins/cache can remain a real local dir.
  linkDir(H("tools/claude/plugins"), U(".claude/plugins"));
  linkConfig(H("tools/claude/settings.json"), U(".claude/settings.json"));
  linkConfig(H("CLAUDE.md"), U(".claude/CLAUDE.md"));
  linkConfig(H("RTK.md"), U(".claude/RTK.md"));
  linked.push("Claude Code");
}

if (isDir(U(".config/opencode"))) {
  linkDir(H("skills"), U(".config/opencode/skills"));
  linkTree(H("commands"), U(".config/opencode/commands"));
  linkTree(H("tools/opencode/agent"), U(".config/opencode/agent"));
  linkConfig(H("tools/opencode/opencode.json"), U(".config/opencode/opencode.json"));
  linkConfig(H("tools/opencode/tui.json"), U(".config/opencode/tui.json"));
  linkTree(H("tools/opencode/plugins"), U(".config/opencode/plugins"));
  linkConfig(H("AGENTS.md"), U(".config/opencode/AGENTS.md"));
  linked.push("OpenCode");
}

if (isDir(U(".codex"))) {
  linkDir(H("skills"), U(".agents/skills"));
  linkTree(H("tools/codex/agents"), U(".codex/agents"));
  linkTree(H("tools/codex/rules"), U(".codex/rules"));
  linkConfig(H("tools/codex/hooks.json"), U(".codex/hooks.json"));
  linkConfig(H("tools/codex/config.toml"), U(".codex/config.toml"));
  linkConfig(H("AGENTS.md"), U(".codex/AGENTS.md"));
  linkConfig(H("RTK.md"), U(".codex/RTK.md"));
  linked.push("Codex");
}

if (isDir(U(".gemini"))) {
  linkDir(H("skills"), U(".gemini/skills"));
  linkTree(H("commands"), U(".gemini/commands"));
  linkTree(H("tools/gemini/agents"), U(".gemini/agents"));
  linkTree(H("tools/gemini/hooks"), U(".gemini/hooks"));
  linkConfig(H("tools/gemini/settings.json"), U(".gemini/settings.json"));
  linkConfig(H("AGENTS.md"), U(".gemini/GEMINI.md"));
  linked.push("Antigravity");
}

if (isDir(U(".grok"))) {
  linkDir(H("skills"), U(".grok/skills"));
  linkTree(H("commands"), U(".grok/commands"));
  linkTree(H("tools/grok/hooks"), U(".grok/hooks"));
  linkConfig(H("tools/grok/config.toml"), U(".grok/config.toml"));
  linkConfig(H("AGENTS.md"), U(".grok/AGENTS.md"));
  linkConfig(H("RTK.md"), U(".grok/RTK.md"));
  linked.push("Grok");
}

if (linked.length === 0) {
  console.log("Aucun outil détecté (Claude Code, OpenCode, Codex, Antigravity, Grok). Rien lié.");
  console.log("Installe un outil puis relance : node setup.mjs");
} else {
  console.log(`Harness lié à : ${linked.join(" ")}`);
}

// trash — recoverable deletes (Trash / Recycle Bin) instead of rm -rf.
// macOS: hasseg CLI via Homebrew (keg-only; agents use the full path from CLAUDE.md).
// Linux / Windows: trash-cli from npm (or the distro's trash-cli), both expose `trash`.
// Skip with CC_SKIP_TRASH=1 (tests / offline).
if (process.env.CC_SKIP_TRASH !== "1") {
  const brew = which("brew");
  const findTrash = () => {
    const prefixes = ["/opt/homebrew", "/usr/local"];
    if (brew) prefixes.push(capture("brew --prefix"));
    for (const prefix of prefixes) {
      const p = prefix && join(prefix, "opt/trash/bin/trash");
      if (IS_MAC && p && isFile(p)) return p;
    }
    const onPath = which("trash");
    // Ignore Apple's stub: it does not take the hasseg flags the harness uses.
    return onPath && onPath !== "/usr/bin/trash" ? onPath : null;
  };

  let trashBin = findTrash();
  if (!trashBin) {
    console.log("trash absent — installation (suppressions récupérables)…");
    const install = IS_MAC && brew ? "brew install trash" : "npm install -g trash-cli";
    if (sh(install)) {
      trashBin = findTrash();
      console.log("  ✓ trash installé");
    } else {
      console.log(`  ⚠ ${install} a échoué — installe trash à la main`);
    }
  }

  if (trashBin) {
    console.log(`trash prêt (${trashBin}) — les agents doivent l'utiliser à la place de rm`);
  } else {
    console.log("trash non disponible — les règles du harness interdisent rm ; installe puis relance setup.mjs");
  }
}

// rtk (Rust Token Killer) — install if missing, then wire hooks.
// Claude/OpenCode: rewrite hooks via `rtk init`. Codex/Grok: RTK.md + AGENTS.md rule.
// Do NOT run `rtk init --codex`: it replaces the AGENTS.md symlink with a real file.
// Skip entirely with CC_SKIP_RTK=1 (tests / offline).
if (process.env.CC_SKIP_RTK !== "1") {
  if (!which("rtk")) {
    console.log("RTK absent — installation (économies de tokens)…");
    if (which("brew")) {
      if (sh("brew install rtk")) console.log("  ✓ rtk installé via Homebrew");
      else console.log("  ⚠ brew install rtk a échoué — installe manuellement : brew install rtk");
    } else if (!IS_WIN && which("curl")) {
      if (sh("curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh")) {
        process.env.PATH = `${join(HOME, ".local/bin")}${delimiter}${process.env.PATH}`;
        console.log("  ✓ rtk installé dans ~/.local/bin");
      } else {
        console.log("  ⚠ install rtk a échoué — voir https://github.com/rtk-ai/rtk");
      }
    } else {
      console.log("  ⚠ Impossible d'installer rtk auto. Voir https://github.com/rtk-ai/rtk");
    }
  }

  if (which("rtk")) {
    // Prefer non-interactive patch when available.
    const init = (flags) =>
      sh(`rtk init -g ${flags} --auto-patch`, { quiet: true }) ||
      sh(`rtk init -g ${flags}`, { quiet: true });
    init(isDir(U(".config/opencode")) ? "--opencode" : "");
    if (isDir(U(".gemini"))) init("--gemini");
    const version = capture("rtk --version") || "ok";
    console.log(`rtk prêt (${version}) — hooks Claude/OpenCode ; instructions Codex/Grok via RTK.md`);
  } else {
    console.log("rtk non disponible — le harness a RTK.md ; installe le binaire puis relance setup.mjs");
  }
}
