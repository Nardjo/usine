import { rm, mkdir, writeFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseFrontmatter } from "./frontmatter.js";

// Assemble upstream skills into outDir. Replaces only the named skill folders —
// never wipes the whole directory (house-owned skills live alongside).
// `fetchSkill(category, name)` resolves to [{ path, content }] for one skill folder.
export async function assembleTemplate({ skills, fetchSkill, outDir }) {
  await mkdir(outDir, { recursive: true });

  const nextNames = new Set(skills.map((s) => s.name));

  for (const { category, name } of skills) {
    const files = await fetchSkill(category, name);

    const skillMd = files.find((f) => f.path === "SKILL.md");
    if (!skillMd) {
      throw new Error(`${name}: SKILL.md manquant`);
    }

    const fm = parseFrontmatter(skillMd.content);
    if (!fm.name || !fm.description) {
      throw new Error(`${name}: frontmatter incomplet (name et description requis)`);
    }

    await rm(join(outDir, name), { recursive: true, force: true });
    for (const file of files) {
      const dest = join(outDir, name, file.path);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, file.content);
    }
  }

  // Drop upstream skills removed from the curated list (not house-owned).
  // house-owned = present on disk before this run and never in `skills`.
  // We only remove names that appear in the previous "was upstream" set: any
  // directory that is neither in nextNames nor in preserveNames.
  // Caller passes preserveNames (dirs that must never be deleted).
  return skills.map((s) => s.name);
}

/** Remove skill dirs that are neither in nextNames nor preserveNames. */
export async function pruneSkills(outDir, { nextNames, preserveNames }) {
  let entries;
  try {
    entries = await readdir(outDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const removed = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (nextNames.has(entry.name) || preserveNames.has(entry.name)) continue;
    await rm(join(outDir, entry.name), { recursive: true, force: true });
    removed.push(entry.name);
  }
  return removed;
}
