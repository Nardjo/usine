import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleTemplate, pruneSkills } from "../build/assemble.js";
import { writeFile, mkdir } from "node:fs/promises";

const twoSkills = [
  { category: "engineering", name: "tdd" },
  { category: "productivity", name: "grill-me" },
];

function fakeFetcher(extra = {}) {
  return async (category, name) => {
    const files = [
      {
        path: "SKILL.md",
        content: `---\nname: ${name}\ndescription: ${name} description\n---\nbody`,
      },
    ];
    if (extra[name]) files.push(...extra[name]);
    return files;
  };
}

test("assembles exactly the manifest skills as folders with SKILL.md", async () => {
  const out = await mkdtemp(join(tmpdir(), "cc-asm-"));
  const names = await assembleTemplate({ skills: twoSkills, fetchSkill: fakeFetcher(), outDir: out });

  assert.deepEqual([...names].sort(), ["grill-me", "tdd"]);
  assert.deepEqual((await readdir(out)).sort(), ["grill-me", "tdd"]);
  assert.ok((await stat(join(out, "tdd", "SKILL.md"))).isFile());
});

test("preserves supporting files within a skill", async () => {
  const out = await mkdtemp(join(tmpdir(), "cc-asm-"));
  await assembleTemplate({
    skills: [{ category: "engineering", name: "tdd" }],
    fetchSkill: fakeFetcher({ tdd: [{ path: "tests.md", content: "x" }] }),
    outDir: out,
  });
  assert.ok((await stat(join(out, "tdd", "tests.md"))).isFile());
});

test("rejects a skill missing SKILL.md", async () => {
  const out = await mkdtemp(join(tmpdir(), "cc-asm-"));
  const fetcher = async () => [{ path: "README.md", content: "no skill here" }];
  await assert.rejects(
    () => assembleTemplate({ skills: [{ category: "engineering", name: "x" }], fetchSkill: fetcher, outDir: out }),
    /SKILL\.md manquant/,
  );
});

test("rejects incomplete frontmatter (missing description)", async () => {
  const out = await mkdtemp(join(tmpdir(), "cc-asm-"));
  const fetcher = async () => [{ path: "SKILL.md", content: "---\nname: x\n---\nbody" }];
  await assert.rejects(
    () => assembleTemplate({ skills: [{ category: "engineering", name: "x" }], fetchSkill: fetcher, outDir: out }),
    /frontmatter incomplet/,
  );
});

test("is reproducible and pruneSkills clears dropped upstream skills", async () => {
  const out = await mkdtemp(join(tmpdir(), "cc-asm-"));
  await assembleTemplate({ skills: twoSkills, fetchSkill: fakeFetcher(), outDir: out });
  const first = await readFile(join(out, "tdd", "SKILL.md"), "utf8");
  await assembleTemplate({ skills: twoSkills, fetchSkill: fakeFetcher(), outDir: out });
  const second = await readFile(join(out, "tdd", "SKILL.md"), "utf8");
  assert.equal(first, second);

  await assembleTemplate({
    skills: [{ category: "engineering", name: "tdd" }],
    fetchSkill: fakeFetcher(),
    outDir: out,
  });
  // assemble alone keeps sibling dirs; prune removes dropped upstream names
  await pruneSkills(out, {
    nextNames: new Set(["tdd"]),
    preserveNames: new Set(),
  });
  assert.deepEqual((await readdir(out)).sort(), ["tdd"]);
});

test("assemble leaves non-upstream (house) skills intact", async () => {
  const out = await mkdtemp(join(tmpdir(), "cc-asm-"));
  await mkdir(join(out, "caveman"), { recursive: true });
  await writeFile(join(out, "caveman", "SKILL.md"), "mine\n");
  await assembleTemplate({
    skills: [{ category: "engineering", name: "tdd" }],
    fetchSkill: fakeFetcher(),
    outDir: out,
  });
  assert.equal(await readFile(join(out, "caveman", "SKILL.md"), "utf8"), "mine\n");
  await pruneSkills(out, {
    nextNames: new Set(["tdd"]),
    preserveNames: new Set(["caveman"]),
  });
  assert.deepEqual((await readdir(out)).sort(), ["caveman", "tdd"]);
});
