import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, apply } from "../template/skills/update-harness/scripts/update.mjs";
import { managedSnapshot, readManifest, writeManifest } from "../src/manifest.js";

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function makeTemplate(base, skills) {
  const templateDir = join(base, "repo", "template");
  for (const [name, content] of Object.entries(skills)) {
    await mkdir(join(templateDir, "skills", name), { recursive: true });
    await writeFile(join(templateDir, "skills", name, "SKILL.md"), content);
  }
  await writeFile(join(templateDir, "setup.sh"), "echo setup v1\n");
  await writeFile(join(templateDir, "SKILLS.md"), "# Catalogue v1\n");
  await writeFile(join(templateDir, "RTK.md"), "# RTK v1\n");
  await writeFile(join(templateDir, "CLAUDE.md"), "# Rules v1\n");
  await writeFile(
    join(base, "repo", "package.json"),
    JSON.stringify({ version: "9.9.9" }),
  );
  return templateDir;
}

// Mimics scaffold: copy the template then record the manifest.
async function makeHarness(base, templateDir) {
  const harness = join(base, "harness");
  await cp(templateDir, harness, { recursive: true });
  await writeManifest(harness, {
    version: "0.0.1",
    files: await managedSnapshot(harness),
  });
  return harness;
}

function statusOf(result, unit) {
  return result.units.find((u) => u.unit === unit)?.status;
}

test("classifies and adds a skill that is new in the template", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-update-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n" });
  const harness = await makeHarness(base, templateDir);
  await mkdir(join(templateDir, "skills", "grill"), { recursive: true });
  await writeFile(join(templateDir, "skills", "grill", "SKILL.md"), "# grill\n");

  assert.equal(statusOf(await check(harness, templateDir), "skills/grill"), "new");

  const { applied } = await apply(harness, templateDir, ["skills/grill"]);
  assert.deepEqual(applied, ["skills/grill"]);
  assert.equal(
    await readFile(join(harness, "skills", "grill", "SKILL.md"), "utf8"),
    "# grill\n",
  );
  const manifest = await readManifest(harness);
  assert.ok(manifest.files["skills/grill/SKILL.md"]);
  assert.equal(manifest.version, "9.9.9");
});

test("classifies an upstream fix on an untouched skill as a safe update", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-update-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n" });
  const harness = await makeHarness(base, templateDir);
  await writeFile(join(templateDir, "skills", "tdd", "SKILL.md"), "# tdd v2\n");

  assert.equal(statusOf(await check(harness, templateDir), "skills/tdd"), "update");

  await apply(harness, templateDir, ["skills/tdd"]);
  assert.equal(
    await readFile(join(harness, "skills", "tdd", "SKILL.md"), "utf8"),
    "# tdd v2\n",
  );
  assert.equal(statusOf(await check(harness, templateDir), "skills/tdd"), "ok");
});

test("classifies local-only edits as local (nothing to offer)", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-update-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n" });
  const harness = await makeHarness(base, templateDir);
  await writeFile(join(harness, "skills", "tdd", "SKILL.md"), "# ma version\n");

  assert.equal(statusOf(await check(harness, templateDir), "skills/tdd"), "local");

  // Once the template evolves, it becomes a conflict.
  await writeFile(join(templateDir, "skills", "tdd", "SKILL.md"), "# tdd v2\n");
  assert.equal(statusOf(await check(harness, templateDir), "skills/tdd"), "conflict");
});

test("a kept conflict stays a conflict on the next check", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-update-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n" });
  const harness = await makeHarness(base, templateDir);
  await writeFile(join(templateDir, "skills", "tdd", "SKILL.md"), "# tdd v2\n");
  await writeFile(join(harness, "skills", "tdd", "SKILL.md"), "# ma version\n");

  // The coaché keeps their version: apply runs without the unit.
  await apply(harness, templateDir, []);

  assert.equal(
    await readFile(join(harness, "skills", "tdd", "SKILL.md"), "utf8"),
    "# ma version\n",
  );
  assert.equal(statusOf(await check(harness, templateDir), "skills/tdd"), "conflict");
});

test("applying a conflict backs up the local version first", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-update-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n" });
  const harness = await makeHarness(base, templateDir);
  await writeFile(join(templateDir, "skills", "tdd", "SKILL.md"), "# tdd v2\n");
  await writeFile(join(harness, "skills", "tdd", "SKILL.md"), "# ma version\n");

  await apply(harness, templateDir, ["skills/tdd"]);

  assert.equal(
    await readFile(join(harness, "skills", "tdd", "SKILL.md"), "utf8"),
    "# tdd v2\n",
  );
  assert.equal(
    await readFile(
      join(harness, ".usine", "backup", "skills", "tdd", "SKILL.md"),
      "utf8",
    ),
    "# ma version\n",
  );
});

test("bootstraps a harness without manifest: adopts identical, flags modified", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-update-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n", grill: "# grill v1\n" });
  const harness = await makeHarness(base, templateDir);
  await rm(join(harness, ".usine"), { recursive: true });
  await writeFile(join(templateDir, "skills", "grill", "SKILL.md"), "# grill v2\n");
  await writeFile(join(harness, "skills", "grill", "SKILL.md"), "# ma version\n");

  const result = await check(harness, templateDir);
  assert.equal(statusOf(result, "skills/tdd"), "ok");
  assert.equal(statusOf(result, "skills/grill"), "conflict");

  // apply with no units bootstraps the manifest from the identical units.
  await apply(harness, templateDir, []);
  const manifest = await readManifest(harness);
  assert.ok(manifest.files["skills/tdd/SKILL.md"]);
  assert.equal(manifest.files["skills/grill/SKILL.md"], undefined);
});

test("manages setup.sh and SKILLS.md but never CLAUDE.md", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-update-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n" });
  const harness = await makeHarness(base, templateDir);
  await writeFile(join(templateDir, "setup.sh"), "echo setup v2\n");
  await writeFile(join(templateDir, "CLAUDE.md"), "# Rules v2\n");
  await writeFile(join(harness, "CLAUDE.md"), "# mes règles\n");

  const result = await check(harness, templateDir);
  assert.equal(statusOf(result, "setup.sh"), "update");
  assert.equal(statusOf(result, "CLAUDE.md"), undefined);

  await apply(harness, templateDir, ["setup.sh"]);
  assert.equal(await readFile(join(harness, "setup.sh"), "utf8"), "echo setup v2\n");
  assert.equal(await readFile(join(harness, "CLAUDE.md"), "utf8"), "# mes règles\n");
});

test("ignores skills absent from the template (personal or removed)", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-update-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n", old: "# old\n" });
  const harness = await makeHarness(base, templateDir);
  await rm(join(templateDir, "skills", "old"), { recursive: true });

  const result = await check(harness, templateDir);
  assert.equal(statusOf(result, "skills/old"), undefined);

  await apply(harness, templateDir, []);
  assert.ok(await pathExists(join(harness, "skills", "old", "SKILL.md")));
});

test("rejects a folder that is not a harness", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-update-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n" });
  await assert.rejects(
    () => check(join(base, "vide"), templateDir),
    /ne ressemble pas à un harness/,
  );
});

test("rejects applying a unit unknown to the template", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-update-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n" });
  const harness = await makeHarness(base, templateDir);
  await assert.rejects(
    () => apply(harness, templateDir, ["skills/nimporte"]),
    /Unité inconnue/,
  );
});

test("migrates a pre-rebrand .cerberus/ state dir to .usine/", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-update-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n" });
  const harness = await makeHarness(base, templateDir);
  await rename(join(harness, ".usine"), join(harness, ".cerberus"));
  await writeFile(join(harness, "skills", "tdd", "SKILL.md"), "# ma version\n");

  // Still classified from the old manifest: a local edit, not a conflict.
  assert.equal(statusOf(await check(harness, templateDir), "skills/tdd"), "local");
  assert.ok(await pathExists(join(harness, ".usine", "manifest.json")));
  assert.ok(!(await pathExists(join(harness, ".cerberus"))));
});
