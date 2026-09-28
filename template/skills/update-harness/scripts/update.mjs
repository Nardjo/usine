#!/usr/bin/env node
// Merge engine for the update-harness skill. Self-contained: runs inside a
// coaché's harness with nothing but Node >= 18.
//
//   node update.mjs check <harness> <template>
//   node update.mjs apply <harness> <template> [unit...]
//
// A "unit" is a skill directory (skills/<name>) or a managed root file
// (setup.sh, SKILLS.md, RTK.md). CLAUDE.md / AGENTS.md are the coaché's own
// and are never units. `check` prints { units: [{ unit, status }] } where status is:
//   new      absent locally → safe to add
//   update   upstream changed, local untouched since delivery → safe to replace
//   conflict both changed → needs a human decision
//   local    local edits, nothing new upstream → left alone
//   ok       identical to the template
// `apply` replaces the given units (conflict/local ones are backed up to
// .usine/backup/ first) and rewrites .usine/manifest.json: template
// hashes for every unit now identical to the template, previous entries for
// the ones kept — so the next run classifies them the same way. Run `apply`
// even with no units: on a manifest-less harness it bootstraps the manifest.

import { createHash } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_REL = join(".usine", "manifest.json");
const BACKUP_REL = join(".usine", "backup");
const MANAGED_FILES = ["setup.sh", "SKILLS.md", "RTK.md"];

export async function check(harnessDir, templateDir) {
  await assertHarness(harnessDir);
  await migrateStateDir(harnessDir);
  const manifest = (await readManifest(harnessDir)) ?? { files: {} };
  const units = [];
  for (const unit of await listUnits(templateDir)) {
    units.push({
      unit,
      status: await classify(harnessDir, templateDir, manifest, unit),
    });
  }
  return { units };
}

export async function apply(harnessDir, templateDir, unitNames = []) {
  await assertHarness(harnessDir);
  await migrateStateDir(harnessDir);
  const manifest = (await readManifest(harnessDir)) ?? { files: {} };
  const applied = [];

  for (const unit of unitNames) {
    const status = await classify(harnessDir, templateDir, manifest, unit);
    if (status === "ok") continue;
    if (status === "conflict" || status === "local") {
      await backupUnit(harnessDir, unit);
    }
    await replaceUnit(templateDir, harnessDir, unit);
    applied.push(unit);
  }

  // Rewrite the manifest: adopt template hashes wherever local now matches
  // the template, keep the previous entries for everything kept.
  const files = {};
  for (const unit of await listUnits(templateDir)) {
    const templateSnap = await unitSnapshot(templateDir, unit);
    const localSnap = await unitSnapshot(harnessDir, unit);
    if (sameSnapshot(localSnap, templateSnap)) {
      Object.assign(files, templateSnap);
    } else {
      Object.assign(files, subset(manifest.files, unit));
    }
  }
  await writeManifest(harnessDir, {
    version: await templateVersion(templateDir),
    files,
  });

  return { applied };
}

async function classify(harnessDir, templateDir, manifest, unit) {
  const templateSnap = await unitSnapshot(templateDir, unit);
  if (Object.keys(templateSnap).length === 0) {
    throw new Error(`Unité inconnue dans le template : ${unit}`);
  }
  const localSnap = await unitSnapshot(harnessDir, unit);
  const recorded = subset(manifest.files, unit);
  if (Object.keys(localSnap).length === 0) return "new";
  if (sameSnapshot(localSnap, templateSnap)) return "ok";
  if (sameSnapshot(localSnap, recorded)) return "update";
  if (sameSnapshot(templateSnap, recorded)) return "local";
  return "conflict";
}

async function listUnits(templateDir) {
  const entries = await readdir(join(templateDir, "skills"), {
    withFileTypes: true,
  });
  const skills = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => `skills/${entry.name}`)
    .sort();
  return [...skills, ...MANAGED_FILES];
}

// { relPath: sha256 } of the unit's files inside rootDir; {} if absent.
async function unitSnapshot(rootDir, unit) {
  const path = join(rootDir, unit);
  if (!(await pathExists(path))) return {};
  if (unit.startsWith("skills/")) {
    const snapshot = {};
    for (const rel of await listFiles(path)) {
      snapshot[`${unit}/${rel}`] = await hashFile(join(path, rel));
    }
    return snapshot;
  }
  return { [unit]: await hashFile(path) };
}

// Sorted file paths under dir, relative to dir.
async function listFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const child of await listFiles(join(dir, entry.name))) {
        files.push(`${entry.name}/${child}`);
      }
    } else {
      files.push(entry.name);
    }
  }
  return files.sort();
}

async function hashFile(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

function subset(files, unit) {
  const prefix = `${unit}/`;
  const result = {};
  for (const [rel, hash] of Object.entries(files)) {
    if (rel === unit || rel.startsWith(prefix)) result[rel] = hash;
  }
  return result;
}

function sameSnapshot(a, b) {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => a[key] === b[key])
  );
}

async function replaceUnit(templateDir, harnessDir, unit) {
  await rm(join(harnessDir, unit), { recursive: true, force: true });
  await mkdir(dirname(join(harnessDir, unit)), { recursive: true });
  await cp(join(templateDir, unit), join(harnessDir, unit), {
    recursive: true,
  });
}

// Backups live outside skills/ so setup.sh never symlinks them into a tool.
async function backupUnit(harnessDir, unit) {
  const backup = join(harnessDir, BACKUP_REL, unit);
  await rm(backup, { recursive: true, force: true });
  await mkdir(dirname(backup), { recursive: true });
  await cp(join(harnessDir, unit), backup, { recursive: true });
}

// Harnesses installed before the rebrand keep their state in .cerberus/.
async function migrateStateDir(harnessDir) {
  const legacy = join(harnessDir, ".cerberus");
  const current = join(harnessDir, ".usine");
  if ((await pathExists(legacy)) && !(await pathExists(current))) {
    await rename(legacy, current);
  }
}

async function readManifest(harnessDir) {
  try {
    return JSON.parse(
      await readFile(join(harnessDir, MANIFEST_REL), "utf8"),
    );
  } catch {
    return null;
  }
}

async function writeManifest(harnessDir, manifest) {
  const path = join(harnessDir, MANIFEST_REL);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

// The cloned repo holds package.json one level above template/.
async function templateVersion(templateDir) {
  try {
    const pkg = JSON.parse(
      await readFile(join(templateDir, "..", "package.json"), "utf8"),
    );
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function assertHarness(harnessDir) {
  for (const required of ["setup.sh", "skills"]) {
    if (!(await pathExists(join(harnessDir, required)))) {
      throw new Error(
        `« ${harnessDir} » ne ressemble pas à un harness (setup.sh et skills/ attendus).`,
      );
    }
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const [mode, harness, template, ...units] = process.argv.slice(2);
  try {
    if (mode === "check" && harness && template) {
      console.log(JSON.stringify(await check(harness, template), null, 2));
    } else if (mode === "apply" && harness && template) {
      console.log(
        JSON.stringify(await apply(harness, template, units), null, 2),
      );
    } else {
      console.error(
        "Usage : update.mjs check <harness> <template> | update.mjs apply <harness> <template> [unit...]",
      );
      process.exit(2);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
