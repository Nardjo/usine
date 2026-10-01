---
name: "update-harness"
description: "Met à jour ou réinstalle ce harness de l'usine à code via la CLI (update / reinstall). Template curé Nardjo/usine uniquement — pas une sync mattpocock. À utiliser pour \"update harness\", \"reinstall harness\", \"mets à jour mon harness\"."
allowed-tools: Bash, AskUserQuestion
argument-hint: [update|reinstall] [--check] [chemin]
---

# Update Harness

Marche à suivre pour mettre à jour **ce harness** avec le template curé de
https://github.com/Nardjo/usine.

**Source unique** : `npx github:Nardjo/usine` (le `template/` du package).
**Hors scope** : ne jamais cloner `mattpocock/skills`, ne jamais importer des
skills amont Matt Pocock. Cette sync-là est réservée au mainteneur de l'usine à code
(repo `usine`, hors harness coaché).

## Commandes

```bash
# Update normal (layout déjà à jour)
npx --yes github:Nardjo/usine update [chemin]
npx --yes github:Nardjo/usine update --check [chemin]
npx --yes github:Nardjo/usine update [chemin] --take skills/<nom>

# Ancien harness (commands/claude, agents/…, pas de tools/)
npx --yes github:Nardjo/usine reinstall [chemin]
# alias :
npx --yes github:Nardjo/usine upgrade [chemin]
```

| Commande / argument | Effet |
|---------------------|--------|
| `update` | Nouveaux skills + maj setup/SKILLS/RTK si layout moderne. |
| `reinstall` / `upgrade` | Migre l'ancien layout → `tools/` + `commands/` partagés, force `setup.sh` + `RTK.md`, puis update + link. Conserve skills et CLAUDE.md. |
| `chemin` | Dossier du harness. Optionnel si le cwd est un harness, ou si les symlinks des tools y pointent. |
| `--check` | Tableau de statuts seulement (`update` only). |
| `--take <unité>` | En cas de conflit, prendre la version amont (répétable). Backup dans `.usine/backup/`. |

Si `update` affiche « Ancien layout détecté », lancer **`reinstall`** (ne pas re-scaffold un nouveau dossier).

## Étapes pour l'agent

### 1. Localiser le harness (si pas de chemin fourni)

```bash
HARNESS="$(dirname "$(readlink "$HOME/.claude/CLAUDE.md")")"
```

Fallbacks : `readlink` sur `~/.config/opencode/AGENTS.md`, `~/.codex/AGENTS.md`,
`~/.gemini/GEMINI.md`, `~/.omp/agent/AGENTS.md`. Sinon demander le chemin. Vérifier que
`$HARNESS/setup.sh` et `$HARNESS/skills/` existent.

### 2. Ancien layout ?

Si le harness a encore `commands/claude/`, `agents/claude/`, etc. (pas de `tools/`) :

```bash
npx --yes github:Nardjo/usine reinstall "$HARNESS"
```

Puis résumé et stop (reinstall inclut déjà update + setup.sh). Sinon continuer.

### 3. Dry-run

```bash
npx --yes github:Nardjo/usine update --check "$HARNESS"
```

Lire le tableau. Statuts :

| Status | Sens |
|--------|------|
| `NOUVEAU` | Skill ajouté au template curé → sera ajouté |
| `MAJ` | Corrigé en amont, jamais modifié ici → remplacé sans question |
| `CONFLIT` | Modifié ici ET en amont → décision humaine |
| `local` | Modifié ici, rien de neuf → laissé |
| `OK` | Identique |

Si l'argument est `--check` : s'arrêter après ce tableau.

### 4. Conflits

Pour chaque `CONFLIT`, demander via AskUserQuestion : garder local / prendre amont.

### 5. Appliquer

```bash
npx --yes github:Nardjo/usine update "$HARNESS"
# ou avec conflits acceptés :
npx --yes github:Nardjo/usine update "$HARNESS" --take skills/tdd
```

### 6. Résumé

Relayer la sortie CLI : unités appliquées, conflits gardés, rappel `.usine/backup/`.

## Règles

- Toujours passer par `npx github:Nardjo/usine update` ou `reinstall`.
- Ne jamais toucher `CLAUDE.md` / `AGENTS.md` du harness.
- Ne jamais supprimer un skill absent du template.
- Ne jamais prendre l'amont sur un conflit skill sans confirmation.
- Ne jamais chercher / importer des skills depuis `mattpocock/skills`.
