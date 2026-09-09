# create-cerberus

<!-- GitHub README does not render <video>; use GIF (autoplay-friendly). -->
![create-cerberus demo](public/cerberus.gif)

> Un harness de coding IA multi-outils. Une commande, rien à installer.

`create-cerberus` te pose un dossier à toi : des skills au format Agent Skills (workflow engineering + productivité de [Matt Pocock](https://github.com/mattpocock/skills), plus quelques skills Cerberus), branchés sur Claude Code, OpenCode, Codex, Antigravity et Grok. Un skill s'écrit une fois, tous tes outils le voient.

## Installer

```bash
npx  github:Nardjo/cerberus mon-harness  # npm
pnpm dlx github:Nardjo/cerberus mon-harness
yarn dlx github:Nardjo/cerberus mon-harness
bunx github:Nardjo/cerberus mon-harness
```

**Prérequis :** Node 18+, macOS, au moins un des outils ci-dessus. Homebrew aide pour `trash` et `rtk`.

Ça crée `mon-harness/`, détecte tes outils, **adopte** tes settings / hooks / plugins / commands déjà présents, puis **symlink** tout depuis ce dossier. Rien pour les outils que tu n'as pas. Secrets et caches lourds restent locaux (`settings.local.json`, fichiers d'auth, cache Claude, plugins marketplace Codex). Pas de questions, pas de `git init` : le dossier est à toi.

Pour figer une version : `npx github:Nardjo/cerberus#v0.3.0 mon-harness`.

Ensuite, lis le `README.md` du dossier créé.

### Via un agent / LLM

Copie-colle ce prompt dans Claude Code, Cursor, Codex, OpenCode, ou tout autre LLM qui peut lancer des commandes :

```
Installe mon harness Cerberus.

1. Prérequis : Node.js >= 18, macOS. Vérifie Node (`node -v`). Si Node manque ou est trop vieux, dis-moi comment l'installer et arrête.
2. Demande-moi où je veux le mettre sur ma machine (chemin parent, ex. `~/Projects`). Nom du dossier : `cerberus` par défaut — propose-le, change seulement si je le demande ou s'il existe déjà.
3. Depuis ce chemin parent, lance exactement :
   npx --yes github:Nardjo/cerberus cerberus
   (adapte le dernier argument si j'ai choisi un autre nom ; ou `pnpm dlx` / `yarn dlx` / `bunx` selon mon package manager.)
4. Ne clone pas le repo à la main, ne réécris pas setup.sh. Ne pose de questions que pour l'emplacement (et le nom si besoin).
5. À la fin, résume : chemin absolu du dossier créé, outils branchés (d'après la sortie), et dis-moi de lire `<dossier>/README.md`.

Si tu ne peux pas exécuter de commandes shell : affiche la commande exacte à coller dans mon terminal et arrête.
```

## Ce que tu obtiens

- Un starter curé : skills Matt + skills Cerberus (`caveman`, `update-harness`, `install-skill`, `empty-trash`). Catalogue : [template/SKILLS.md](template/SKILLS.md)
- Un layout unique : `skills/` et `commands/` partagés, plus `tools/<outil>/` par provider. Tes configs existantes sont adoptées puis liées ; rien n'est écrasé sans `.bak`
- Le dossier t'appartient. Les mises à jour sont opt-in et ne touchent pas tes changements sans te demander
- Un `setup.sh` qui rebranche le tout (à relancer après l'install d'un nouvel outil)

Pour ajouter un skill tiers : invoquer **`install-skill`** dans un outil, pour qu'il atterrisse dans `skills/` puis soit lié partout. Ne jamais le laisser seulement sous `~/.claude/skills` / `~/.agents/skills` / etc.

## Mettre à jour

```bash
npx github:Nardjo/cerberus update mon-harness
npx github:Nardjo/cerberus update --check mon-harness   # dry-run
npx github:Nardjo/cerberus update                       # cwd, ou détection via les symlinks
npx github:Nardjo/cerberus update mon-harness --take skills/tdd  # forcer l'upstream sur un conflit
```

`npx` récupère ce repo : `update` applique le `template/` curé sur ton harness. Les skills nouveaux sont ajoutés, ceux que tu n'as pas touchés et qui ont changé upstream sont rafraîchis, tes copies modifiées passent en conflit (diff + prompt ; backup sous `.cerberus/backup/` si tu prends l'upstream). `CLAUDE.md` / `AGENTS.md` ne sont jamais touchés, un skill retiré upstream n'est jamais supprimé, `setup.sh` est relancé à la fin. Un `.cerberus/manifest.json` (écrit au scaffold, bootstrapé au premier update pour les anciens harness) suit ce qui vient du template.

Depuis un outil IA : skill **`update-harness`** (même CLI, pas une sync Matt Pocock). Décision : [docs/adr/0002](docs/adr/0002-harness-update-cli-and-manifest.md).

### Ancien layout ?

La structure a changé (`tools/`, `commands/` partagés). Ne pas re-scaffolder dans un nouveau dossier : réinstaller sur place.

```bash
npx github:Nardjo/cerberus reinstall mon-harness
npx github:Nardjo/cerberus reinstall   # depuis le harness, ou via les symlinks
```

Ça migre `commands/<outil>/` et `agents/<outil>/`, garde tes skills et fichiers perso, rafraîchit `setup.sh` + le starter, puis relance `setup.sh`. Alias : `upgrade`.

## Un skill, tous les outils

Claude Code, OpenCode, Codex, Antigravity et Grok ont convergé sur le même standard Agent Skills : un dossier `<nom>/SKILL.md` avec du frontmatter `name` + `description`. Pas de moteur de conversion : un symlink suffit. Détail : [docs/adr/0001](docs/adr/0001-no-sync-engine-agent-skills-symlinks.md).

## À l'install

- **RTK** (Rust Token Killer) : `setup.sh` installe le binaire s'il manque (`brew install rtk` ou curl), pose `RTK.md`, le lie, et lance `rtk init` pour les hooks Claude / OpenCode
- **trash** : `setup.sh` installe le `trash` Homebrew s'il manque ; les règles du harness interdisent `rm`, les suppressions passent par la Corbeille macOS
- Si tu versionnes le harness : retire secrets et chemins machine-local de `config.toml` / settings avant de committer. Un `config.toml` Codex déjà présent est adopté tel quel

## Développement

```
.
├── bin/                 # CLI (create-cerberus / update / reinstall)
├── src/
├── build/               # rafraîchit les skills Matt dans template/skills/
├── template/            # contenu copié dans le harness
│   └── skills/          # tous les skills (Matt + Cerberus), un dossier plat
├── maintainer/          # ce repo uniquement, jamais livré
│   └── skills/sync-mattpocock/
├── test/
└── docs/adr/
```

Les skills Cerberus s'éditent sous `template/skills/` (ex. `empty-trash`).  
`npm run build:template` rafraîchit les skills Matt et **garde** les dossiers non-Matt.

```bash
npm test
npm run build:template
node bin/create-cerberus.js test-harness
node bin/create-cerberus.js update test-harness
```

## Licence

MIT
