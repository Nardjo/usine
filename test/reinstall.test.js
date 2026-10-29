import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  access,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateLayout, needsMigration } from "../src/migrate.js";
import { reinstall } from "../src/reinstall.js";
import { managedSnapshot, writeManifest } from "../src/manifest.js";

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function makeTemplate(base) {
  const templateDir = join(base, "repo", "template");
  await mkdir(join(templateDir, "skills", "tdd"), { recursive: true });
  await writeFile(
    join(templateDir, "skills", "tdd", "SKILL.md"),
    "---\nname: tdd\ndescription: tdd\n---\n# tdd v2\n",
  );
  await mkdir(join(templateDir, "skills", "new-skill"), { recursive: true });
  await writeFile(
    join(templateDir, "skills", "new-skill", "SKILL.md"),
    "---\nname: new-skill\ndescription: new\n---\n# new\n",
  );
  await writeFile(join(templateDir, "setup.mjs"), "console.log('setup v2');\n");
  await writeFile(join(templateDir, "SKILLS.md"), "# Catalogue v2\n");
  await writeFile(join(templateDir, "RTK.md"), "# RTK\n");
  await writeFile(join(templateDir, "CLAUDE.md"), "# Rules\n");
  await writeFile(join(templateDir, "AGENTS.md"), "# Rules\n");
  for (const p of ["claude", "opencode", "codex", "gemini", "grok"]) {
    await mkdir(join(templateDir, "tools", p), { recursive: true });
    await writeFile(
      join(templateDir, "tools", p, "README.md"),
      `# ${p}\n`,
    );
  }
  await writeFile(
    join(base, "repo", "package.json"),
    JSON.stringify({ version: "9.9.9" }),
  );
  return templateDir;
}

/** Old-layout harness: commands/claude, agents/claude, old skills. */
async function makeOldHarness(base, templateDir) {
  const harness = join(base, "harness");
  await mkdir(join(harness, "skills", "tdd"), { recursive: true });
  await writeFile(
    join(harness, "skills", "tdd", "SKILL.md"),
    "---\nname: tdd\ndescription: tdd\n---\n# tdd v1\n",
  );
  await mkdir(join(harness, "skills", "mine"), { recursive: true });
  await writeFile(
    join(harness, "skills", "mine", "SKILL.md"),
    "---\nname: mine\ndescription: perso\n---\n# perso\n",
  );
  await mkdir(join(harness, "commands", "claude"), { recursive: true });
  await writeFile(join(harness, "commands", "claude", "deploy.md"), "deploy");
  await mkdir(join(harness, "agents", "claude"), { recursive: true });
  await writeFile(join(harness, "agents", "claude", "scout.md"), "scout");
  await mkdir(join(harness, "agents", "antigravity"), { recursive: true });
  await writeFile(
    join(harness, "agents", "antigravity", "bot.md"),
    "bot",
  );
  await writeFile(join(harness, "setup.sh"), "#!/bin/bash\necho setup v1\n");
  await writeFile(join(harness, "SKILLS.md"), "# Catalogue v1\n");
  await writeFile(join(harness, "CLAUDE.md"), "# mes règles\n");
  await writeFile(join(harness, "AGENTS.md"), "# mes règles agents\n");
  // Manifest as if scaffolded from v1 skills only
  await writeManifest(harness, {
    version: "0.0.1",
    files: await managedSnapshot(harness),
  });
  // Point template skills tdd hash as "recorded" so tdd becomes update when template changes
  // (already recorded from harness snapshot at v1)
  return harness;
}

test("needsMigration detects old provider buckets", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-mig-"));
  const templateDir = await makeTemplate(base);
  const harness = await makeOldHarness(base, templateDir);
  assert.equal(await needsMigration(harness), true);
});

test("migrateLayout flattens commands and moves agents into tools/", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-mig-"));
  const templateDir = await makeTemplate(base);
  const harness = await makeOldHarness(base, templateDir);

  const steps = await migrateLayout(harness, templateDir, () => {});

  assert.ok(steps.length > 0);
  assert.equal(
    await readFile(join(harness, "commands", "deploy.md"), "utf8"),
    "deploy",
  );
  assert.ok(!(await pathExists(join(harness, "commands", "claude"))));
  assert.equal(
    await readFile(join(harness, "tools", "claude", "agents", "scout.md"), "utf8"),
    "scout",
  );
  assert.equal(
    await readFile(join(harness, "tools", "gemini", "agents", "bot.md"), "utf8"),
    "bot",
  );
  assert.ok(!(await pathExists(join(harness, "agents"))));
  assert.ok(await pathExists(join(harness, "tools", "claude", "README.md")));
  // personal skill untouched
  assert.match(
    await readFile(join(harness, "skills", "mine", "SKILL.md"), "utf8"),
    /perso/,
  );
  assert.equal(await needsMigration(harness), false);
});

test("reinstall migrates, updates skills, keeps personal + CLAUDE.md", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-re-"));
  const templateDir = await makeTemplate(base);
  const harness = await makeOldHarness(base, templateDir);
  // Template has newer tdd → safe update after migrate
  await writeFile(
    join(templateDir, "skills", "tdd", "SKILL.md"),
    "---\nname: tdd\ndescription: tdd\n---\n# tdd v2\n",
  );

  const result = await reinstall([harness], {
    templateDir,
    runLink: false,
    log: () => {},
  });

  assert.ok(result.migrated.length > 0);
  assert.ok(result.applied.includes("skills/tdd") || result.applied.includes("setup.mjs"));
  assert.equal(
    await readFile(join(harness, "skills", "tdd", "SKILL.md"), "utf8"),
    "---\nname: tdd\ndescription: tdd\n---\n# tdd v2\n",
  );
  assert.ok(await pathExists(join(harness, "skills", "new-skill", "SKILL.md")));
  assert.match(
    await readFile(join(harness, "skills", "mine", "SKILL.md"), "utf8"),
    /perso/,
  );
  assert.equal(
    await readFile(join(harness, "CLAUDE.md"), "utf8"),
    "# mes règles\n",
  );
  assert.match(
    await readFile(join(harness, "setup.mjs"), "utf8"),
    /setup v2/,
  );
  assert.ok(!(await pathExists(join(harness, "setup.sh"))), "legacy setup.sh retired");
  assert.match(
    await readFile(join(harness, ".usine", "backup", "setup.sh"), "utf8"),
    /setup v1/,
  );
  assert.equal(
    await readFile(join(harness, "commands", "deploy.md"), "utf8"),
    "deploy",
  );
});

test("migrate is idempotent on a modern harness", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-mig-"));
  const templateDir = await makeTemplate(base);
  const harness = join(base, "modern");
  await cp(templateDir, harness, { recursive: true });
  await writeManifest(harness, {
    version: "1.0.0",
    files: await managedSnapshot(harness),
  });

  assert.equal(await needsMigration(harness), false);
  const steps = await migrateLayout(harness, templateDir, () => {});
  assert.deepEqual(steps, []);
});
