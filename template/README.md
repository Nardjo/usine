# Mon harness

Un harness multi-provider (Claude Code, OpenCode, Codex, Antigravity, Grok, omp), basé sur le workflow engineering de Matt Pocock.

## Structure

```
.
├── skills/           # skills partagés (format Agent Skills)
├── commands/         # commandes partagées (symlinkées dans chaque outil)
├── tools/
│   ├── claude/       # settings.json, hooks/, agents/, plugins/ (sans cache)
│   ├── opencode/     # opencode.json, tui.json, plugins/, agent/
│   ├── codex/        # hooks.json, config.toml, agents/, rules/
│   ├── gemini/       # settings.json, agents/, hooks/ (Antigravity)
│   ├── grok/         # config.toml, hooks/
│   └── omp/          # config.yml, extensions/
├── CLAUDE.md         # règles Claude Code
├── AGENTS.md         # règles OpenCode / Codex / Gemini / Grok / omp
├── RTK.md            # Rust Token Killer (préfixe `rtk` sur les commandes bruyantes)
├── SKILLS.md         # catalogue
└── setup.sh          # adopt + link (+ install RTK si absent)
```

`setup.sh` **adopte** tes configs / hooks / plugins / agents déjà présents sous `~/.claude`, `~/.codex`, etc., puis les **symlink** depuis ce dossier.

| Reste local (jamais dans le harness) | Adopté (peut être machine-local) |
|--------------------------------------|----------------------------------|
| `settings.local.json`, auth / oauth | settings, hooks, agents |
| Claude `plugins/cache/` | Claude `plugins/*` (hors cache) |
| Codex `~/.codex/plugins/` (marketplace) | Codex `config.toml`, `agents/`, `rules/` |
| | OpenCode `tui.json`, `agent/`, `plugins/` |
| | Gemini `hooks/` |

Si tu versionnes le harness : retire secrets et chemins purement locaux de `config.toml` / settings avant commit.

**RTK** : si le binaire n'est pas installé, `setup.sh` tente `brew install rtk` (ou le script curl). Puis il branche les hooks Claude/OpenCode et symlink `RTK.md`.

**trash** : si absent, `setup.sh` tente `brew install trash` (CLI hasseg, corbeille macOS). Les règles du harness interdisent `rm` : les agents passent par `trash` pour tout pouvoir récupérer.

## Brancher le harness à tes outils

```bash
bash setup.sh
```

Relance après avoir installé un nouvel outil.

## Installer un skill tiers

Source de vérité : `skills/<nom>/` dans **ce** dossier, puis `setup.sh` pour tous les outils. Ne laisse jamais une skill uniquement sous un home d'outil.

1. Invoque le skill **`install-skill`** (api2cli, skills.sh, URL GitHub, dossier local, ou skill déjà posée au mauvais endroit).
2. Il copie vers `skills/`, met à jour `SKILLS.md`, relance `setup.sh`.
3. Les binaires / auth du runtime (ex. `~/.cli`) restent hors harness ; seul le `SKILL.md` (+ assets) est versionné ici.

Pour rafraîchir le **template de l'usine à code** curé (pas une skill perso) : skill **`update-harness`**.

Détail par outil : `tools/<provider>/README.md`.

## C'est à toi

Ce dossier t'appartient. Versionne-le dans git si tu veux et fais-le évoluer librement.
