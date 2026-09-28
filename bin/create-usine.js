#!/usr/bin/env node
import { scaffold } from "../src/scaffold.js";
import { link } from "../src/link.js";
import { update } from "../src/update.js";
import { reinstall } from "../src/reinstall.js";

const USAGE = `Usage :
  create-usine <dossier>                 Crée un harness
  create-usine update [dossier]          Met à jour skills / setup (layout actuel)
  create-usine update --check [dossier]
  create-usine update [dossier] --take skills/<nom>
  create-usine reinstall [dossier]       Migre l'ancien layout + update + link
  create-usine upgrade [dossier]         Alias de reinstall
`;

try {
  const [cmd, ...rest] = process.argv.slice(2);

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(USAGE);
    process.exit(cmd ? 0 : 2);
  }

  if (cmd === "update") {
    await update(rest);
  } else if (cmd === "reinstall" || cmd === "upgrade") {
    await reinstall(rest);
  } else {
    const target = await scaffold(cmd);
    await link(target);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
