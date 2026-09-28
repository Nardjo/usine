import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, lstat, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold } from "../src/scaffold.js";

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

test("scaffolds a harness folder with skills and README", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-scaffold-"));
  const target = join(base, "mon-harness");
  const returned = await scaffold(target);

  assert.equal(returned, target);
  assert.ok((await lstat(join(target, "skills"))).isDirectory());
  assert.ok((await lstat(join(target, "skills", "tdd", "SKILL.md"))).isFile());
  const readme = await readFile(join(target, "README.md"), "utf8");
  assert.match(readme, /harness/i);
  assert.ok(!(await pathExists(join(target, ".git"))));

  const manifest = JSON.parse(
    await readFile(join(target, ".usine", "manifest.json"), "utf8"),
  );
  assert.ok(manifest.version);
  assert.ok(manifest.files["skills/tdd/SKILL.md"]);
  assert.ok(manifest.files["setup.sh"]);
  assert.ok(manifest.files["RTK.md"]);
  assert.equal(manifest.files["CLAUDE.md"], undefined);

  // House skills live in template/skills/ and ship with the harness
  assert.ok((await lstat(join(target, "skills", "empty-trash", "SKILL.md"))).isFile());
  assert.ok((await lstat(join(target, "skills", "caveman", "SKILL.md"))).isFile());
  assert.ok((await lstat(join(target, "skills", "update-harness", "SKILL.md"))).isFile());
});

test("errors when name is missing", async () => {
  await assert.rejects(() => scaffold(undefined), /Usage/);
});

test("errors when target already exists", async () => {
  const base = await mkdtemp(join(tmpdir(), "cc-scaffold-"));
  const target = join(base, "dup");
  await scaffold(target);
  await assert.rejects(() => scaffold(target), /existe déjà/);
});
