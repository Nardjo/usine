import { cp, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { cliVersion, managedSnapshot, writeManifest } from "./manifest.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(moduleDir, "..", "template");

export async function scaffold(name) {
  if (!name) {
    throw new Error("Usage : create-usine <dossier>");
  }

  const target = resolve(process.cwd(), name);

  if (await pathExists(target)) {
    throw new Error(`Le dossier « ${name} » existe déjà.`);
  }

  await cp(TEMPLATE_DIR, target, { recursive: true });
  await writeManifest(target, {
    version: await cliVersion(),
    files: await managedSnapshot(target),
  });

  console.log(`✓ Harness créé dans ${name}/`);
  return target;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
