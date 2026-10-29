import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateLayout, needsMigration } from "./migrate.js";
import { resolveHarness, update } from "./update.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(moduleDir, "..", "template");

/**
 * Reinstall / upgrade in place: migrate layout, then update.
 * Forces template setup.mjs + RTK.md (wiring); skills/CLAUDE.md stay owned.
 */
export async function reinstall(args = [], opts = {}) {
  const templateDir = opts.templateDir ?? TEMPLATE_DIR;
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home;
  const log = opts.log ?? console.log;

  const pathArg = args.find((a) => !a.startsWith("-"));
  const harnessDir = await resolveHarness(pathArg, { cwd, home });

  log(`Réinstallation du harness : ${harnessDir}`);
  log(`Template : ${templateDir}`);
  log("");

  if (await needsMigration(harnessDir)) {
    log("Ancien layout détecté — migration…");
  }
  const migrated = await migrateLayout(harnessDir, templateDir, log);
  log("");

  const rest = args.filter((a) => a !== pathArg);
  const result = await update([harnessDir, ...rest], {
    ...opts,
    templateDir,
    cwd,
    home,
    log,
    forceUnits: ["setup.mjs", "RTK.md"],
    skipMigrationHint: true,
  });

  log("\n✓ Réinstallation terminée");
  if (migrated.length) {
    log(`  Layout : ${migrated.length} étape(s) de migration`);
  }
  log("  Contenu personnel (skills, CLAUDE.md, …) conservé");
  log("  setup.mjs / RTK.md repris du template (wiring) + setup.mjs relancé");

  return { ...result, migrated };
}
