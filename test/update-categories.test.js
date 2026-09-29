// Category-folder harnesses (skills/<category>/<name>) and flat ones.
import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { apply, check } from "../template/skills/update-harness/scripts/update.mjs";

async function put(root, rel, content) {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), content);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "update-harness-"));
  const template = join(root, "template");
  const harness = join(root, "harness");
  for (const file of ["setup.sh", "SKILLS.md", "RTK.md"]) {
    await put(template, file, `${file}\n`);
    await put(harness, file, `${file}\n`);
  }
  await mkdir(join(harness, "skills"), { recursive: true });
  return { template, harness };
}

async function status(harness, template, unit) {
  const { units } = await check(harness, template);
  return units.find((u) => u.unit === unit)?.status;
}

test("new categorized skill gets its real folder, no flat link", async () => {
  const { template, harness } = await fixture();
  await put(template, "skills/development/tdd/SKILL.md", "v1\n");
  await symlink("development/tdd", join(template, "skills/tdd"));

  assert.equal(await status(harness, template, "skills/tdd"), "new");
  await apply(harness, template, ["skills/tdd"]);

  assert.equal(
    await readFile(join(harness, "skills/development/tdd/SKILL.md"), "utf8"),
    "v1\n",
  );
  await assert.rejects(lstat(join(harness, "skills/tdd")));
  assert.equal(await status(harness, template, "skills/tdd"), "ok");
});

test("template without flat links is listed by skill name", async () => {
  const { template, harness } = await fixture();
  await put(template, "skills/development/tdd/SKILL.md", "v1\n");
  assert.equal(await status(harness, template, "skills/tdd"), "new");
  await apply(harness, template, ["skills/tdd"]);
  assert.equal(await status(harness, template, "skills/tdd"), "ok");
});

test("local edits in a category are backed up before taking upstream", async () => {
  const { template, harness } = await fixture();
  await put(template, "skills/development/tdd/SKILL.md", "v1\n");
  await put(harness, "skills/development/tdd/SKILL.md", "mine\n");

  assert.equal(await status(harness, template, "skills/tdd"), "conflict");
  await apply(harness, template, ["skills/tdd"]);

  assert.equal(
    await readFile(
      join(harness, ".usine/backup/skills/development/tdd/SKILL.md"),
      "utf8",
    ),
    "mine\n",
  );
  assert.equal(
    await readFile(join(harness, "skills/development/tdd/SKILL.md"), "utf8"),
    "v1\n",
  );
});

test("existing skill is updated in place and keeps its local category", async () => {
  const { template, harness } = await fixture();
  await put(template, "skills/development/tdd/SKILL.md", "v1\n");
  await apply(harness, template, ["skills/tdd"]);

  // Local recategorization, then an upstream fix.
  await put(harness, "skills/testing/tdd/SKILL.md", "v1\n");
  await rm(join(harness, "skills/development"), { recursive: true });
  await put(template, "skills/development/tdd/SKILL.md", "v2\n");

  assert.equal(await status(harness, template, "skills/tdd"), "update");
  await apply(harness, template, ["skills/tdd"]);

  assert.equal(
    await readFile(join(harness, "skills/testing/tdd/SKILL.md"), "utf8"),
    "v2\n",
  );
  await assert.rejects(lstat(join(harness, "skills/development")));
  assert.equal(await status(harness, template, "skills/tdd"), "ok");
});

test("legacy flat link in the harness is still honored", async () => {
  const { template, harness } = await fixture();
  await put(template, "skills/development/tdd/SKILL.md", "v2\n");
  await put(harness, "skills/testing/tdd/SKILL.md", "v1\n");
  await symlink("testing/tdd", join(harness, "skills/tdd"));

  await apply(harness, template, ["skills/tdd"]);
  assert.equal(
    await readFile(join(harness, "skills/testing/tdd/SKILL.md"), "utf8"),
    "v2\n",
  );
});

test("flat template skill lands in skills/imported in a categorized harness", async () => {
  const { template, harness } = await fixture();
  await put(harness, "skills/testing/tdd/SKILL.md", "mine\n");
  await put(template, "skills/caveman/SKILL.md", "v1\n");
  await apply(harness, template, ["skills/caveman"]);
  assert.equal(
    await readFile(join(harness, "skills/imported/caveman/SKILL.md"), "utf8"),
    "v1\n",
  );
  await assert.rejects(lstat(join(harness, "skills/caveman")));

  await put(template, "skills/caveman/SKILL.md", "v2\n");
  assert.equal(await status(harness, template, "skills/caveman"), "update");
  await apply(harness, template, ["skills/caveman"]);
  assert.equal(
    await readFile(join(harness, "skills/imported/caveman/SKILL.md"), "utf8"),
    "v2\n",
  );
});

test("flat harness keeps new skills flat", async () => {
  const { template, harness } = await fixture();
  await put(harness, "skills/grill-me/SKILL.md", "mine\n");
  await put(template, "skills/caveman/SKILL.md", "v1\n");
  await apply(harness, template, ["skills/caveman"]);
  assert.equal(
    await readFile(join(harness, "skills/caveman/SKILL.md"), "utf8"),
    "v1\n",
  );
  await assert.rejects(lstat(join(harness, "skills/imported")));
});
