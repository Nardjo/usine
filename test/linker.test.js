import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, cp, lstat, readlink, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const SETUP_SH = resolve(here, "..", "template", "setup.sh");

async function makeHarness() {
  const dir = await mkdtemp(join(tmpdir(), "cc-harness-"));
  for (const name of ["alpha", "beta"]) {
    await mkdir(join(dir, "skills", name), { recursive: true });
    await writeFile(
      join(dir, "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${name}\n---\n`,
    );
  }
  await writeFile(join(dir, "CLAUDE.md"), "# rules\n");
  await writeFile(join(dir, "AGENTS.md"), "# rules\n");
  await cp(SETUP_SH, join(dir, "setup.sh"));
  return dir;
}

async function makeHome(tools) {
  const home = await mkdtemp(join(tmpdir(), "cc-home-"));
  if (tools.includes("claude")) await mkdir(join(home, ".claude"), { recursive: true });
  if (tools.includes("opencode")) await mkdir(join(home, ".config", "opencode"), { recursive: true });
  if (tools.includes("codex")) await mkdir(join(home, ".codex"), { recursive: true });
  if (tools.includes("antigravity")) await mkdir(join(home, ".gemini"), { recursive: true });
  if (tools.includes("grok")) await mkdir(join(home, ".grok"), { recursive: true });
  if (tools.includes("omp")) await mkdir(join(home, ".omp", "agent"), { recursive: true });
  return home;
}

function runLinker(harness, home) {
  return run("bash", [join(harness, "setup.sh")], {
    env: {
      ...process.env,
      HOME: home,
      CC_SKIP_RTK: "1",
      CC_SKIP_TRASH: "1",
    },
  });
}

async function isSymlink(p) {
  try {
    return (await lstat(p)).isSymbolicLink();
  } catch {
    return false;
  }
}

async function pathExists(p) {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

test("links skills only to installed tools", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["claude"]);
  await runLinker(harness, home);

  assert.ok(await isSymlink(join(home, ".claude/skills/alpha")));
  assert.ok(await isSymlink(join(home, ".claude/skills/beta")));
  assert.ok(!(await isSymlink(join(home, ".config/opencode/skills/alpha"))));
  assert.ok(!(await isSymlink(join(home, ".agents/skills/alpha"))));
});

test("symlink points back into the harness skills dir", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["claude"]);
  await runLinker(harness, home);

  const dest = await readlink(join(home, ".claude/skills/alpha"));
  assert.ok(dest.startsWith(join(harness, "skills", "alpha")));
});

test("links skills to every installed tool location", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["claude", "opencode", "codex", "antigravity", "grok", "omp"]);
  await runLinker(harness, home);

  assert.ok(await isSymlink(join(home, ".claude/skills/alpha")));
  assert.ok(await isSymlink(join(home, ".config/opencode/skills/alpha")));
  assert.ok(await isSymlink(join(home, ".agents/skills/alpha")));
  assert.ok(await isSymlink(join(home, ".gemini/skills/alpha")));
  assert.ok(await isSymlink(join(home, ".grok/skills/alpha")));
  assert.ok(await isSymlink(join(home, ".omp/agent/skills/alpha")));
});

test("links global config to each installed tool", async () => {
  const harness = await makeHarness();
  await writeFile(join(harness, "RTK.md"), "# RTK\n");
  const home = await makeHome(["claude", "opencode", "codex", "antigravity", "grok", "omp"]);
  await runLinker(harness, home);

  assert.ok(await isSymlink(join(home, ".claude/CLAUDE.md")));
  assert.ok(await isSymlink(join(home, ".config/opencode/AGENTS.md")));
  assert.ok(await isSymlink(join(home, ".codex/AGENTS.md")));
  assert.ok(await isSymlink(join(home, ".gemini/GEMINI.md")), "Antigravity GEMINI.md linked");
  assert.equal(await readlink(join(home, ".gemini/GEMINI.md")), join(harness, "AGENTS.md"));
  assert.ok(await isSymlink(join(home, ".grok/AGENTS.md")), "Grok AGENTS.md linked");
  assert.equal(await readlink(join(home, ".grok/AGENTS.md")), join(harness, "AGENTS.md"));
  assert.ok(await isSymlink(join(home, ".claude/RTK.md")), "RTK.md linked for Claude");
  assert.equal(await readlink(join(home, ".claude/RTK.md")), join(harness, "RTK.md"));
  assert.ok(await isSymlink(join(home, ".codex/RTK.md")));
  assert.ok(await isSymlink(join(home, ".grok/RTK.md")));
  assert.equal(await readlink(join(home, ".omp/agent/AGENTS.md")), join(harness, "AGENTS.md"));
  assert.equal(await readlink(join(home, ".omp/agent/RTK.md")), join(harness, "RTK.md"));
});

test("backs up an existing global config before linking", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["claude"]);
  await writeFile(join(home, ".claude/CLAUDE.md"), "MY EXISTING RULES");

  await runLinker(harness, home);

  assert.ok(await isSymlink(join(home, ".claude/CLAUDE.md")), "now a symlink");
  const backup = await readFile(join(home, ".claude/CLAUDE.md.bak"), "utf8");
  assert.equal(backup, "MY EXISTING RULES", "old config preserved in .bak");
});

test("re-running is idempotent", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["claude"]);
  await runLinker(harness, home);
  await runLinker(harness, home);

  assert.ok(await isSymlink(join(home, ".claude/skills/alpha")));
  assert.ok(await isSymlink(join(home, ".claude/CLAUDE.md")));
});

test("no tools installed → no links, no error", async () => {
  const harness = await makeHarness();
  const home = await makeHome([]);
  const { stdout } = await runLinker(harness, home);

  assert.match(stdout, /Aucun outil/);
  assert.ok(!(await isSymlink(join(home, ".claude/skills/alpha"))));
});

test("adopts a personal skill into the harness, then links it back", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["claude"]);
  await mkdir(join(home, ".claude/skills/mine"), { recursive: true });
  await writeFile(
    join(home, ".claude/skills/mine/SKILL.md"),
    "---\nname: mine\ndescription: mine\n---\n",
  );

  await runLinker(harness, home);

  const adopted = await readFile(join(harness, "skills/mine/SKILL.md"), "utf8");
  assert.match(adopted, /name: mine/, "moved into the harness");
  assert.ok(await isSymlink(join(home, ".claude/skills/mine")), "linked back");
  const dest = await readlink(join(home, ".claude/skills/mine"));
  assert.ok(dest.startsWith(join(harness, "skills", "mine")));
});

test("adopts personal commands and agents, linked back as whole-dir symlinks", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["claude"]);
  await mkdir(join(home, ".claude/commands"), { recursive: true });
  await writeFile(join(home, ".claude/commands/deploy.md"), "deploy cmd");
  await mkdir(join(home, ".claude/agents"), { recursive: true });
  await writeFile(join(home, ".claude/agents/scout.md"), "scout agent");

  await runLinker(harness, home);

  // shared commands/ + tools/claude/agents (hub layout)
  assert.equal(await readFile(join(harness, "commands/deploy.md"), "utf8"), "deploy cmd");
  assert.equal(
    await readFile(join(harness, "tools/claude/agents/scout.md"), "utf8"),
    "scout agent",
  );
  assert.ok(await isSymlink(join(home, ".claude/commands")), "commands is a whole-dir symlink");
  assert.ok(await isSymlink(join(home, ".claude/agents")), "agents is a whole-dir symlink");
  assert.equal(await readlink(join(home, ".claude/commands")), join(harness, "commands"));
  assert.equal(
    await readlink(join(home, ".claude/agents")),
    join(harness, "tools/claude/agents"),
  );
  assert.equal(await readFile(join(home, ".claude/commands/deploy.md"), "utf8"), "deploy cmd");
});

test("on a skill name conflict, keeps both (personal suffixed -local)", async () => {
  const harness = await makeHarness(); // ships skills alpha, beta
  const home = await makeHome(["claude"]);
  await mkdir(join(home, ".claude/skills/alpha"), { recursive: true });
  await writeFile(
    join(home, ".claude/skills/alpha/SKILL.md"),
    "---\nname: alpha\ndescription: MINE\n---\n",
  );

  await runLinker(harness, home);

  const official = await readFile(join(harness, "skills/alpha/SKILL.md"), "utf8");
  assert.match(official, /description: alpha/, "official skill untouched");
  const mine = await readFile(join(harness, "skills/alpha-local/SKILL.md"), "utf8");
  assert.match(mine, /description: MINE/, "personal kept as -local");
  assert.ok(await isSymlink(join(home, ".claude/skills/alpha")));
  assert.ok(await isSymlink(join(home, ".claude/skills/alpha-local")));
});

test("on a command file conflict, suffix is inserted before the extension", async () => {
  const harness = await makeHarness();
  await mkdir(join(harness, "commands"), { recursive: true });
  await writeFile(join(harness, "commands/ship.md"), "official ship");
  const home = await makeHome(["claude"]);
  await mkdir(join(home, ".claude/commands"), { recursive: true });
  await writeFile(join(home, ".claude/commands/ship.md"), "my ship");

  await runLinker(harness, home);

  assert.equal(await readFile(join(harness, "commands/ship.md"), "utf8"), "official ship");
  assert.equal(await readFile(join(harness, "commands/ship-local.md"), "utf8"), "my ship");
});

test("appends a personal config into the harness, then backs it up", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["claude"]);
  await writeFile(join(home, ".claude/CLAUDE.md"), "PERSONAL RULE 42");

  await runLinker(harness, home);

  const merged = await readFile(join(harness, "CLAUDE.md"), "utf8");
  assert.match(merged, /# rules/, "original harness config kept");
  assert.match(merged, /usine:imported:Claude Code/, "import marker added");
  assert.match(merged, /PERSONAL RULE 42/, "personal content appended");
  assert.ok(await isSymlink(join(home, ".claude/CLAUDE.md")));
  assert.equal(
    await readFile(join(home, ".claude/CLAUDE.md.bak"), "utf8"),
    "PERSONAL RULE 42",
    "original preserved in .bak",
  );
});

test("adoption is idempotent — a second run changes nothing", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["claude"]);
  await mkdir(join(home, ".claude/skills/mine"), { recursive: true });
  await writeFile(
    join(home, ".claude/skills/mine/SKILL.md"),
    "---\nname: mine\ndescription: mine\n---\n",
  );
  await writeFile(join(home, ".claude/CLAUDE.md"), "PERSONAL RULE 42");

  await runLinker(harness, home);
  const afterFirst = await readFile(join(harness, "CLAUDE.md"), "utf8");
  await runLinker(harness, home);
  const afterSecond = await readFile(join(harness, "CLAUDE.md"), "utf8");

  assert.equal(afterSecond, afterFirst, "config not appended twice");
  assert.ok(await isSymlink(join(home, ".claude/skills/mine")));
  assert.ok(
    !(await pathExists(join(harness, "skills/mine-local"))),
    "not re-adopted into a -local copy",
  );
});

test("whole-dir command symlink is idempotent — no -local on re-run", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["claude"]);
  await mkdir(join(home, ".claude/commands"), { recursive: true });
  await writeFile(join(home, ".claude/commands/deploy.md"), "deploy cmd");

  await runLinker(harness, home);
  await runLinker(harness, home);

  assert.ok(await isSymlink(join(home, ".claude/commands")));
  assert.equal(await readFile(join(harness, "commands/deploy.md"), "utf8"), "deploy cmd");
  assert.ok(
    !(await pathExists(join(harness, "commands/deploy-local.md"))),
    "content not re-adopted through the symlink",
  );
});

test("a pre-existing symlink is not adopted", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["claude"]);
  const external = join(home, "external-skill");
  await mkdir(external, { recursive: true });
  await writeFile(join(external, "SKILL.md"), "ext");
  await mkdir(join(home, ".claude/skills"), { recursive: true });
  await symlink(external, join(home, ".claude/skills/ext"));

  await runLinker(harness, home);

  assert.ok(
    !(await pathExists(join(harness, "skills/ext"))),
    "external symlink left in place, not pulled into the harness",
  );
});

test("Antigravity: adopts ~/.gemini skills and appends a non-empty GEMINI.md", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["antigravity"]);
  await mkdir(join(home, ".gemini/skills/mine"), { recursive: true });
  await writeFile(
    join(home, ".gemini/skills/mine/SKILL.md"),
    "---\nname: mine\ndescription: mine\n---\n",
  );
  await writeFile(join(home, ".gemini/GEMINI.md"), "MES NOTES GEMINI");

  await runLinker(harness, home);

  assert.match(await readFile(join(harness, "skills/mine/SKILL.md"), "utf8"), /name: mine/);
  assert.ok(await isSymlink(join(home, ".gemini/skills/mine")));
  const merged = await readFile(join(harness, "AGENTS.md"), "utf8");
  assert.match(merged, /usine:imported:Antigravity/);
  assert.match(merged, /MES NOTES GEMINI/);
  assert.ok(await isSymlink(join(home, ".gemini/GEMINI.md")));
  assert.equal(await readFile(join(home, ".gemini/GEMINI.md.bak"), "utf8"), "MES NOTES GEMINI");
});

test("an empty personal config is not appended into the harness", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["antigravity"]);
  await writeFile(join(home, ".gemini/GEMINI.md"), ""); // 0-byte, like a fresh GEMINI.md

  await runLinker(harness, home);

  const merged = await readFile(join(harness, "AGENTS.md"), "utf8");
  assert.ok(!merged.includes("usine:imported"), "empty config not imported");
  assert.ok(await isSymlink(join(home, ".gemini/GEMINI.md")), "still linked to the harness");
});

test("adopts Claude settings + hooks into tools/claude and links them back", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["claude"]);
  await writeFile(join(home, ".claude/settings.json"), '{"theme":"dark"}\n');
  await writeFile(join(home, ".claude/settings.local.json"), '{"apiKey":"secret"}\n');
  await mkdir(join(home, ".claude/hooks"), { recursive: true });
  await writeFile(join(home, ".claude/hooks/guard.sh"), "#!/bin/bash\n");

  await runLinker(harness, home);

  assert.equal(
    await readFile(join(harness, "tools/claude/settings.json"), "utf8"),
    '{"theme":"dark"}\n',
  );
  assert.ok(await isSymlink(join(home, ".claude/settings.json")));
  assert.equal(
    await readlink(join(home, ".claude/settings.json")),
    join(harness, "tools/claude/settings.json"),
  );
  assert.equal(
    await readFile(join(harness, "tools/claude/hooks/guard.sh"), "utf8"),
    "#!/bin/bash\n",
  );
  assert.ok(await isSymlink(join(home, ".claude/hooks")));
  // secrets stay local, never pulled into the harness
  assert.ok(!(await pathExists(join(harness, "tools/claude/settings.local.json"))));
  assert.equal(
    await readFile(join(home, ".claude/settings.local.json"), "utf8"),
    '{"apiKey":"secret"}\n',
  );
});

test("adopts OpenCode plugins and opencode.json into tools/opencode", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["opencode"]);
  await writeFile(join(home, ".config/opencode/opencode.json"), '{"model":"x"}\n');
  await mkdir(join(home, ".config/opencode/plugins"), { recursive: true });
  await writeFile(join(home, ".config/opencode/plugins/rtk.ts"), "export {}\n");

  await runLinker(harness, home);

  assert.equal(
    await readFile(join(harness, "tools/opencode/opencode.json"), "utf8"),
    '{"model":"x"}\n',
  );
  assert.ok(await isSymlink(join(home, ".config/opencode/opencode.json")));
  assert.equal(
    await readFile(join(harness, "tools/opencode/plugins/rtk.ts"), "utf8"),
    "export {}\n",
  );
  assert.ok(await isSymlink(join(home, ".config/opencode/plugins")));
});

test("Grok: adopts ~/.grok skills and appends a non-empty AGENTS.md", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["grok"]);
  await mkdir(join(home, ".grok/skills/mine"), { recursive: true });
  await writeFile(
    join(home, ".grok/skills/mine/SKILL.md"),
    "---\nname: mine\ndescription: mine\n---\n",
  );
  await writeFile(join(home, ".grok/AGENTS.md"), "MES NOTES GROK");

  await runLinker(harness, home);

  assert.match(await readFile(join(harness, "skills/mine/SKILL.md"), "utf8"), /name: mine/);
  assert.ok(await isSymlink(join(home, ".grok/skills/mine")));
  const merged = await readFile(join(harness, "AGENTS.md"), "utf8");
  assert.match(merged, /usine:imported:Grok/);
  assert.match(merged, /MES NOTES GROK/);
  assert.ok(await isSymlink(join(home, ".grok/AGENTS.md")));
  assert.equal(await readFile(join(home, ".grok/AGENTS.md.bak"), "utf8"), "MES NOTES GROK");
});

test("omp: adopts skills, extensions, config.yml and AGENTS.md; agent.db stays local", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["omp"]);
  const agent = join(home, ".omp/agent");
  await mkdir(join(agent, "skills/mine"), { recursive: true });
  await writeFile(join(agent, "skills/mine/SKILL.md"), "---\nname: mine\ndescription: mine\n---\n");
  await mkdir(join(agent, "extensions"), { recursive: true });
  await writeFile(join(agent, "extensions/guard.ts"), "export default () => {};\n");
  await writeFile(join(agent, "config.yml"), "theme: dark\n");
  await writeFile(join(agent, "AGENTS.md"), "MES NOTES OMP");
  await writeFile(join(agent, "agent.db"), "SECRET");

  await runLinker(harness, home);

  assert.ok(await isSymlink(join(agent, "skills/mine")));
  assert.match(await readFile(join(harness, "skills/mine/SKILL.md"), "utf8"), /name: mine/);
  assert.equal(await readlink(join(agent, "extensions")), join(harness, "tools/omp/extensions"));
  assert.equal(await readFile(join(harness, "tools/omp/extensions/guard.ts"), "utf8"), "export default () => {};\n");
  assert.equal(await readlink(join(agent, "config.yml")), join(harness, "tools/omp/config.yml"));
  assert.equal(await readFile(join(harness, "tools/omp/config.yml"), "utf8"), "theme: dark\n");
  const merged = await readFile(join(harness, "AGENTS.md"), "utf8");
  assert.match(merged, /usine:imported:omp/);
  assert.match(merged, /MES NOTES OMP/);
  assert.ok(await isSymlink(join(agent, "AGENTS.md")));
  assert.equal(await readFile(join(agent, "agent.db"), "utf8"), "SECRET", "auth stays local");
  assert.equal(await pathExists(join(harness, "tools/omp/agent.db")), false);
});

test("adopts Claude plugins metadata but leaves plugins/cache local", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["claude"]);
  await mkdir(join(home, ".claude/plugins/marketplaces/official"), { recursive: true });
  await writeFile(join(home, ".claude/plugins/installed_plugins.json"), '{"version":2}\n');
  await mkdir(join(home, ".claude/plugins/cache/heavy"), { recursive: true });
  await writeFile(join(home, ".claude/plugins/cache/heavy/blob.bin"), "big\n");

  await runLinker(harness, home);

  assert.equal(
    await readFile(join(harness, "tools/claude/plugins/installed_plugins.json"), "utf8"),
    '{"version":2}\n',
  );
  assert.ok(await pathExists(join(harness, "tools/claude/plugins/marketplaces/official")));
  assert.ok(
    !(await pathExists(join(harness, "tools/claude/plugins/cache"))),
    "runtime cache not pulled into the harness",
  );
  assert.equal(
    await readFile(join(home, ".claude/plugins/cache/heavy/blob.bin"), "utf8"),
    "big\n",
    "cache stays under ~/.claude",
  );
  assert.ok(await isSymlink(join(home, ".claude/plugins/installed_plugins.json")));
  assert.ok(await isSymlink(join(home, ".claude/plugins/marketplaces")));
});

test("adopts OpenCode agent/ and tui.json into tools/opencode", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["opencode"]);
  await mkdir(join(home, ".config/opencode/agent"), { recursive: true });
  await writeFile(join(home, ".config/opencode/agent/review.md"), "review agent\n");
  await writeFile(join(home, ".config/opencode/tui.json"), '{"theme":"dark"}\n');

  await runLinker(harness, home);

  assert.equal(
    await readFile(join(harness, "tools/opencode/agent/review.md"), "utf8"),
    "review agent\n",
  );
  assert.ok(await isSymlink(join(home, ".config/opencode/agent")));
  assert.equal(
    await readFile(join(harness, "tools/opencode/tui.json"), "utf8"),
    '{"theme":"dark"}\n',
  );
  assert.ok(await isSymlink(join(home, ".config/opencode/tui.json")));
});

test("adopts Codex agents, rules, hooks.json and config.toml", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["codex"]);
  await mkdir(join(home, ".codex/agents"), { recursive: true });
  await writeFile(join(home, ".codex/agents/reviewer.toml"), "name = 'reviewer'\n");
  await mkdir(join(home, ".codex/rules"), { recursive: true });
  await writeFile(join(home, ".codex/rules/default.rules"), "be careful\n");
  await writeFile(join(home, ".codex/hooks.json"), '{"hooks":{}}\n');
  await writeFile(join(home, ".codex/config.toml"), "model = 'o3'\n");
  // plugins dir is cache — must not be adopted
  await mkdir(join(home, ".codex/plugins/cache"), { recursive: true });
  await writeFile(join(home, ".codex/plugins/cache/x.bin"), "heavy\n");

  await runLinker(harness, home);

  assert.equal(
    await readFile(join(harness, "tools/codex/agents/reviewer.toml"), "utf8"),
    "name = 'reviewer'\n",
  );
  assert.ok(await isSymlink(join(home, ".codex/agents")));
  assert.equal(
    await readFile(join(harness, "tools/codex/rules/default.rules"), "utf8"),
    "be careful\n",
  );
  assert.ok(await isSymlink(join(home, ".codex/rules")));
  assert.equal(
    await readFile(join(harness, "tools/codex/hooks.json"), "utf8"),
    '{"hooks":{}}\n',
  );
  assert.ok(await isSymlink(join(home, ".codex/hooks.json")));
  assert.equal(
    await readFile(join(harness, "tools/codex/config.toml"), "utf8"),
    "model = 'o3'\n",
  );
  assert.ok(await isSymlink(join(home, ".codex/config.toml")));
  assert.ok(
    !(await pathExists(join(harness, "tools/codex/plugins"))),
    "codex plugins cache not adopted",
  );
  assert.equal(await readFile(join(home, ".codex/plugins/cache/x.bin"), "utf8"), "heavy\n");
});

test("adopts Gemini hooks into tools/gemini", async () => {
  const harness = await makeHarness();
  const home = await makeHome(["antigravity"]);
  await mkdir(join(home, ".gemini/hooks"), { recursive: true });
  await writeFile(join(home, ".gemini/hooks/guard.sh"), "#!/bin/bash\n");

  await runLinker(harness, home);

  assert.equal(
    await readFile(join(harness, "tools/gemini/hooks/guard.sh"), "utf8"),
    "#!/bin/bash\n",
  );
  assert.ok(await isSymlink(join(home, ".gemini/hooks")));
});
