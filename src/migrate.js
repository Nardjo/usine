import {
  access,
  cp,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, join } from "node:path";

// Pre-tools/ layout used per-provider buckets under commands/ and agents/.
const KNOWN_PROVIDERS = [
  "claude",
  "opencode",
  "codex",
  "antigravity",
  "gemini",
  "grok",
];

const AGENTS_DEST = {
  claude: "tools/claude/agents",
  opencode: "tools/opencode/agents",
  codex: "tools/codex/agents",
  antigravity: "tools/gemini/agents",
  gemini: "tools/gemini/agents",
  grok: "tools/grok/agents",
};

export async function needsMigration(harnessDir) {
  if (await hasProviderBuckets(join(harnessDir, "commands"))) return true;
  if (await hasProviderBuckets(join(harnessDir, "agents"))) return true;
  return false;
}

/** In-place layout migration. Preserves content; never deletes skills. */
export async function migrateLayout(harnessDir, templateDir, log = console.log) {
  const steps = [];

  steps.push(
    ...(await flattenProviderBuckets(
      join(harnessDir, "commands"),
      join(harnessDir, "commands"),
      "commands",
    )),
  );

  const agentsRoot = join(harnessDir, "agents");
  if (await pathExists(agentsRoot)) {
    for (const provider of await listDirs(agentsRoot)) {
      const destRel = AGENTS_DEST[provider] ?? `tools/${provider}/agents`;
      const moved = await moveDirContents(
        join(agentsRoot, provider),
        join(harnessDir, destRel),
      );
      if (moved > 0) {
        steps.push(`agents/${provider}/ → ${destRel}/ (${moved})`);
      }
      await rmEmptyDir(join(agentsRoot, provider));
    }
    await rmEmptyDir(agentsRoot);
  }

  steps.push(...(await ensureToolsSkeleton(harnessDir, templateDir)));

  if (steps.length === 0) {
    log("Layout déjà à jour (rien à migrer).");
  } else {
    log("Migration du layout :");
    for (const step of steps) log(`  • ${step}`);
  }

  return steps;
}

async function hasProviderBuckets(parent) {
  if (!(await pathExists(parent))) return false;
  for (const name of await listDirs(parent)) {
    if (KNOWN_PROVIDERS.includes(name)) return true;
  }
  return false;
}

async function flattenProviderBuckets(parent, destDir, label) {
  const steps = [];
  if (!(await pathExists(parent))) return steps;
  for (const provider of await listDirs(parent)) {
    if (!KNOWN_PROVIDERS.includes(provider)) continue;
    const src = join(parent, provider);
    const moved = await moveDirContents(src, destDir);
    if (moved > 0) {
      steps.push(`${label}/${provider}/ → ${label}/ (${moved})`);
    }
    await rmEmptyDir(src);
  }
  return steps;
}

// Same -local collision rule as setup.mjs destPath (keep both on name clash).
async function moveDirContents(srcDir, destDir) {
  if (!(await pathExists(srcDir))) return 0;
  if (!(await isDirectory(srcDir))) return 0;
  await mkdir(destDir, { recursive: true });
  let count = 0;
  for (const name of await readdir(srcDir)) {
    if (name === ".DS_Store") continue;
    const from = join(srcDir, name);
    const to = await uniqueDest(destDir, name, await isDirectory(from));
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
    count++;
  }
  return count;
}

async function uniqueDest(dir, name, isDir) {
  const candidate = join(dir, name);
  if (!(await pathExists(candidate))) return candidate;
  let stem;
  let ext;
  if (isDir || !name.includes(".")) {
    stem = name;
    ext = "";
  } else {
    stem = name.slice(0, name.lastIndexOf("."));
    ext = name.slice(name.lastIndexOf("."));
  }
  let n = 1;
  let next = join(dir, `${stem}-local${ext}`);
  while (await pathExists(next)) {
    n++;
    next = join(dir, `${stem}-local${n}${ext}`);
  }
  return next;
}

async function ensureToolsSkeleton(harnessDir, templateDir) {
  const steps = [];
  const templateTools = join(templateDir, "tools");
  if (!(await pathExists(templateTools))) return steps;
  for (const provider of await listDirs(templateTools)) {
    const srcReadme = join(templateTools, provider, "README.md");
    const destReadme = join(harnessDir, "tools", provider, "README.md");
    if (!(await pathExists(srcReadme))) continue;
    if (await pathExists(destReadme)) continue;
    await mkdir(dirname(destReadme), { recursive: true });
    await cp(srcReadme, destReadme);
    steps.push(`tools/${provider}/README.md (squelette)`);
  }
  return steps;
}

async function listDirs(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function rmEmptyDir(path) {
  try {
    const left = await readdir(path);
    if (left.length === 0) await rm(path, { recursive: true, force: true });
  } catch {
    // absent or not empty
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
