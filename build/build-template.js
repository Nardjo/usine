import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyFile, readdir } from "node:fs/promises";
import { SKILLS, CATALOG_ORDER } from "./manifest.js";
import { assembleTemplate, pruneSkills } from "./assemble.js";
import { generateCatalog } from "./catalog.js";
import { DESCRIPTIONS_FR } from "./descriptions.fr.js";
import { createGithubFetcher } from "./github.js";

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, "..", "template");
const skillsDir = resolve(templateDir, "skills");

const upstreamNames = new Set(SKILLS.map((s) => s.name));

// Dirs already on disk that are not upstream = house-owned (preserve always).
const before = await readdir(skillsDir, { withFileTypes: true }).catch(() => []);
const preserveNames = new Set(
  before
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !upstreamNames.has(e.name))
    .map((e) => e.name),
);

// Known house skills (in case a prior failed wipe already deleted them from disk —
// restore is the caller's job; we still refuse to prune these names if re-added).
for (const name of ["caveman", "update-harness", "install-skill", "empty-trash"]) {
  preserveNames.add(name);
}

const names = await assembleTemplate({
  skills: SKILLS,
  fetchSkill: createGithubFetcher(),
  outDir: skillsDir,
});

const pruned = await pruneSkills(skillsDir, {
  nextNames: upstreamNames,
  preserveNames,
});

await generateCatalog({
  skillsDir,
  outFile: resolve(templateDir, "SKILLS.md"),
  descriptions: DESCRIPTIONS_FR,
  order: CATALOG_ORDER,
});
await copyFile(resolve(templateDir, "CLAUDE.md"), resolve(templateDir, "AGENTS.md"));

const local = [...preserveNames].sort();
console.log(
  `✓ ${names.length} Matt + preserve ${local.join(", ") || "(none)"} → template/skills/`,
);
if (pruned.length) {
  console.log(`  retiré (plus dans UPSTREAM_SKILLS) : ${pruned.join(", ")}`);
}
