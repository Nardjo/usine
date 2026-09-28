import { access, readlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { check, apply } from "../template/skills/update-harness/scripts/update.mjs";
import { link } from "./link.js";
import { needsMigration } from "./migrate.js";
const moduleDir = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(moduleDir, "..", "template");

const STATUS_LABEL = {
  new: "NOUVEAU",
  update: "MAJ",
  conflict: "CONFLIT",
  local: "local",
  ok: "OK",
};

const PROVIDER_MARKERS = [
  [".claude", "CLAUDE.md"],
  [".config/opencode", "AGENTS.md"],
  [".codex", "AGENTS.md"],
  [".gemini", "GEMINI.md"],
  [".grok", "AGENTS.md"],
];

/**
 * @param {string[]} args - argv after "update"
 * @param {{
 *   templateDir?: string,
 *   cwd?: string,
 *   home?: string,
 *   confirm?: (question: string) => Promise<boolean>,
 *   runLink?: boolean,
 *   log?: (...args: unknown[]) => void,
 *   forceUnits?: string[],
 *   skipMigrationHint?: boolean,
 * }} [opts]
 */
export async function update(args = [], opts = {}) {
  const { checkOnly, take, pathArg } = parseUpdateArgs(args);
  const templateDir = opts.templateDir ?? TEMPLATE_DIR;
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? homedir();
  const log = opts.log ?? console.log;
  const runLink = opts.runLink ?? true;
  const forceUnits = opts.forceUnits ?? [];

  const harnessDir = await resolveHarness(pathArg, { cwd, home });
  log(`Harness : ${harnessDir}`);
  log(`Template : ${templateDir}`);
  log("");

  if (!opts.skipMigrationHint && (await needsMigration(harnessDir))) {
    log(
      "⚠ Ancien layout détecté (commands/<outil>/ ou agents/<outil>/).",
    );
    log(
      "  Pour migrer vers tools/ + commands partagés, lance :",
    );
    log(
      "  npx github:Nardjo/usine reinstall " + (pathArg ?? harnessDir),
    );
    log("");
  }

  const { units } = await check(harnessDir, templateDir);
  printTable(units, log);

  if (checkOnly) {
    log("\n(--check : aucune modification)");
    return { harnessDir, applied: [], skippedConflicts: [] };
  }

  const safe = units
    .filter((u) => u.status === "new" || u.status === "update")
    .map((u) => u.unit);
  const conflicts = units.filter((u) => u.status === "conflict");

  const acceptedConflicts = [];
  const skippedConflicts = [];
  const confirm =
    opts.confirm ??
    ((question) => promptYesNo(question, process.stdin, process.stdout));

  for (const { unit } of conflicts) {
    if (take.has(unit) || forceUnits.includes(unit)) {
      acceptedConflicts.push(unit);
      continue;
    }
    showDiff(harnessDir, templateDir, unit, log);
    const takeUpstream = await confirm(
      `Conflit sur ${unit} : prendre la version amont ? (local → .usine/backup/) [y/N] `,
    );
    if (takeUpstream) acceptedConflicts.push(unit);
    else skippedConflicts.push(unit);
  }

  const toApply = [
    ...new Set([...safe, ...acceptedConflicts, ...forceUnits]),
  ];
  const { applied } = await apply(harnessDir, templateDir, toApply);

  if (runLink) {
    log("\nRelier les skills…");
    await link(harnessDir);
  }

  log("\n✓ Mise à jour terminée");
  if (applied.length) log(`  Appliqué : ${applied.join(", ")}`);
  else log("  Rien à appliquer");
  if (skippedConflicts.length) {
    log(`  Conflits conservés (local) : ${skippedConflicts.join(", ")}`);
  }
  log("  Backups : .usine/backup/ (si un conflit a été écrasé)");

  return { harnessDir, applied, skippedConflicts };
}

/** @param {string[]} args */
export function parseUpdateArgs(args) {
  let checkOnly = false;
  const take = new Set();
  let pathArg;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--check") {
      checkOnly = true;
    } else if (a === "--take") {
      const unit = args[++i];
      if (!unit || unit.startsWith("-")) {
        throw new Error(
          "Usage : --take <unité> (ex. --take skills/tdd)",
        );
      }
      take.add(unit);
    } else if (a.startsWith("-")) {
      throw new Error(`Option inconnue : ${a}`);
    } else if (pathArg === undefined) {
      pathArg = a;
    } else {
      throw new Error(`Argument inattendu : ${a}`);
    }
  }
  return { checkOnly, take, pathArg };
}

export async function resolveHarness(pathArg, { cwd, home } = {}) {
  const base = cwd ?? process.cwd();
  const homeDir = home ?? homedir();

  if (pathArg) {
    const dir = resolve(base, pathArg);
    await assertHarness(dir);
    return dir;
  }

  if (await looksLikeHarness(base)) return base;

  for (const [relDir, file] of PROVIDER_MARKERS) {
    const marker = join(homeDir, relDir, file);
    try {
      const target = await readlink(marker);
      const harness = dirname(resolve(dirname(marker), target));
      if (await looksLikeHarness(harness)) return harness;
    } catch {
      // absent or not a symlink
    }
  }

  throw new Error(
    "Impossible de localiser un harness. Passe le chemin : create-usine update <dossier>",
  );
}

async function looksLikeHarness(dir) {
  return (
    (await pathExists(join(dir, "setup.sh"))) &&
    (await pathExists(join(dir, "skills")))
  );
}

async function assertHarness(dir) {
  if (!(await looksLikeHarness(dir))) {
    throw new Error(
      `« ${dir} » ne ressemble pas à un harness (setup.sh et skills/ attendus).`,
    );
  }
}

function printTable(units, log) {
  log("UNITÉ                          STATUS");
  log("──────────────────────────────────────");
  for (const { unit, status } of units) {
    const label = STATUS_LABEL[status] ?? status;
    const pad = unit.padEnd(30);
    log(`${pad} [${label}]`);
  }
  const counts = { new: 0, update: 0, conflict: 0, local: 0, ok: 0 };
  for (const { status } of units) {
    if (status in counts) counts[status]++;
  }
  log("");
  log(
    `${counts.new} nouveau(x), ${counts.update} maj, ${counts.conflict} conflit(s), ${counts.local} local, ${counts.ok} ok`,
  );
}

function showDiff(harnessDir, templateDir, unit, log) {
  log(`\n--- diff ${unit} ---`);
  const result = spawnSync(
    "diff",
    ["-ru", join(harnessDir, unit), join(templateDir, unit)],
    { encoding: "utf8" },
  );
  // diff exits 1 when files differ
  const out = (result.stdout || result.stderr || "").trim();
  if (out) log(out);
  else log("(diff indisponible)");
}

function promptYesNo(question, input, output) {
  if (!input?.isTTY) {
    return Promise.resolve(false);
  }
  const rl = createInterface({ input, output });
  return new Promise((resolvePromise) => {
    rl.question(question, (answer) => {
      rl.close();
      resolvePromise(/^[yYoO]/.test(answer.trim()));
    });
  });
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
