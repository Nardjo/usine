import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const MANIFEST_REL = join(".usine", "manifest.json");

// Root files managed by the template, besides skills/. CLAUDE.md and
// AGENTS.md are the coaché's own and are never tracked nor updated.
export const MANAGED_FILES = ["setup.sh", "SKILLS.md", "RTK.md"];

export async function cliVersion() {
  const pkg = JSON.parse(
    await readFile(resolve(moduleDir, "..", "package.json"), "utf8"),
  );
  return pkg.version;
}

export async function hashFile(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

// Sorted file paths under dir, relative to dir. Empty if dir is absent.
export async function listFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
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

// { relPath: sha256 } for every file under dir.
export async function snapshotDir(dir) {
  const snapshot = {};
  for (const rel of await listFiles(dir)) {
    snapshot[rel] = await hashFile(join(dir, rel));
  }
  return snapshot;
}

// { relPath: sha256 } of everything the template manages inside rootDir.
export async function managedSnapshot(rootDir) {
  const snapshot = {};
  const skills = await snapshotDir(join(rootDir, "skills"));
  for (const [rel, hash] of Object.entries(skills)) {
    snapshot[`skills/${rel}`] = hash;
  }
  for (const file of MANAGED_FILES) {
    try {
      snapshot[file] = await hashFile(join(rootDir, file));
    } catch {
      // absent: not tracked
    }
  }
  return snapshot;
}

export async function readManifest(harnessDir) {
  try {
    return JSON.parse(await readFile(join(harnessDir, MANIFEST_REL), "utf8"));
  } catch {
    return null;
  }
}

export async function writeManifest(harnessDir, manifest) {
  const path = join(harnessDir, MANIFEST_REL);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
