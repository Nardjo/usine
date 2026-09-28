import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveHarness, update } from "../src/update.js";
import { managedSnapshot, writeManifest } from "../src/manifest.js";

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

async function makeHarness(base, templateDir) {
  const harness = join(base, "harness");
  await cp(templateDir, harness, { recursive: true });
  await writeManifest(harness, {
    version: "0.0.1",
    files: await managedSnapshot(harness),
  });
  return harness;
}

test("resolveHarness uses explicit path", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-cli-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd\n" });
  const harness = await makeHarness(base, templateDir);

  assert.equal(
    await resolveHarness(harness, { cwd: base, home: join(base, "home") }),
    harness,
  );
});

test("resolveHarness uses cwd when it is a harness", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-cli-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd\n" });
  const harness = await makeHarness(base, templateDir);

  assert.equal(
    await resolveHarness(undefined, {
      cwd: harness,
      home: join(base, "home"),
    }),
    harness,
  );
});

test("resolveHarness follows provider symlink", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-cli-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd\n" });
  const harness = await makeHarness(base, templateDir);
  const home = join(base, "home");
  await mkdir(join(home, ".claude"), { recursive: true });
  await symlink(
    join(harness, "CLAUDE.md"),
    join(home, ".claude", "CLAUDE.md"),
  );

  assert.equal(
    await resolveHarness(undefined, {
      cwd: join(base, "elsewhere"),
      home,
    }),
    harness,
  );
});

test("resolveHarness errors when nothing found", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-cli-"));
  await assert.rejects(
    () =>
      resolveHarness(undefined, {
        cwd: base,
        home: join(base, "home"),
      }),
    /localiser un harness/,
  );
});

test("update --check applies nothing", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-cli-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n" });
  const harness = await makeHarness(base, templateDir);
  await mkdir(join(templateDir, "skills", "grill"), { recursive: true });
  await writeFile(join(templateDir, "skills", "grill", "SKILL.md"), "# grill\n");

  const logs = [];
  const result = await update(["--check", harness], {
    templateDir,
    runLink: false,
    log: (...a) => logs.push(a.join(" ")),
  });

  assert.deepEqual(result.applied, []);
  assert.ok(!(await pathExists(join(harness, "skills", "grill"))));
  assert.ok(logs.some((l) => l.includes("NOUVEAU") || l.includes("grill")));
});

test("update applies new and safe updates", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-cli-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n" });
  const harness = await makeHarness(base, templateDir);
  await writeFile(join(templateDir, "skills", "tdd", "SKILL.md"), "# tdd v2\n");
  await mkdir(join(templateDir, "skills", "grill"), { recursive: true });
  await writeFile(join(templateDir, "skills", "grill", "SKILL.md"), "# grill\n");

  const result = await update([harness], {
    templateDir,
    runLink: false,
    log: () => {},
  });

  assert.ok(result.applied.includes("skills/tdd"));
  assert.ok(result.applied.includes("skills/grill"));
  assert.equal(
    await readFile(join(harness, "skills", "tdd", "SKILL.md"), "utf8"),
    "# tdd v2\n",
  );
  assert.equal(
    await readFile(join(harness, "skills", "grill", "SKILL.md"), "utf8"),
    "# grill\n",
  );
});

test("update prompts on conflict and respects keep-local", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-cli-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n" });
  const harness = await makeHarness(base, templateDir);
  await writeFile(join(templateDir, "skills", "tdd", "SKILL.md"), "# tdd v2\n");
  await writeFile(join(harness, "skills", "tdd", "SKILL.md"), "# ma version\n");

  const result = await update([harness], {
    templateDir,
    runLink: false,
    log: () => {},
    confirm: async () => false,
  });

  assert.deepEqual(result.skippedConflicts, ["skills/tdd"]);
  assert.equal(
    await readFile(join(harness, "skills", "tdd", "SKILL.md"), "utf8"),
    "# ma version\n",
  );
});

test("update takes upstream on conflict when confirmed", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-cli-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n" });
  const harness = await makeHarness(base, templateDir);
  await writeFile(join(templateDir, "skills", "tdd", "SKILL.md"), "# tdd v2\n");
  await writeFile(join(harness, "skills", "tdd", "SKILL.md"), "# ma version\n");

  const result = await update([harness], {
    templateDir,
    runLink: false,
    log: () => {},
    confirm: async () => true,
  });

  assert.ok(result.applied.includes("skills/tdd"));
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

test("update --take accepts a conflict without prompt", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-cli-"));
  const templateDir = await makeTemplate(base, { tdd: "# tdd v1\n" });
  const harness = await makeHarness(base, templateDir);
  await writeFile(join(templateDir, "skills", "tdd", "SKILL.md"), "# tdd v2\n");
  await writeFile(join(harness, "skills", "tdd", "SKILL.md"), "# ma version\n");

  let prompted = false;
  const result = await update([harness, "--take", "skills/tdd"], {
    templateDir,
    runLink: false,
    log: () => {},
    confirm: async () => {
      prompted = true;
      return false;
    },
  });

  assert.equal(prompted, false);
  assert.ok(result.applied.includes("skills/tdd"));
  assert.equal(
    await readFile(join(harness, "skills", "tdd", "SKILL.md"), "utf8"),
    "# tdd v2\n",
  );
});
