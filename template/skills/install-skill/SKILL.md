---
name: "install-skill"
description: "Installe ou adopte un Agent Skill dans ce harness de l'usine à code (skills/), jamais seulement dans les dossiers des outils. À utiliser pour : \"install skill\", \"add skill\", \"ajoute un skill\", npx skills, skills.sh, api2cli install/link, skill depuis GitHub/cloud, ou toute install qui écrirait sous ~/.claude/skills, ~/.agents/skills, ~/.grok/skills, ~/.config/opencode/skills, ~/.gemini/skills."
allowed-tools: Bash, AskUserQuestion
argument-hint: [source|nom] [--name <nom>]
---

# Install Skill

Toute skill **personnelle / tierce** vit dans le harness, pas dans le home d'un outil.

| Rôle | Chemin |
|------|--------|
| **Source de vérité** | `$HARNESS/skills/<nom>/` (avec `SKILL.md`) |
| **Propagation** | `bash setup.sh` → symlinks vers chaque outil détecté |
| **Catalogue** | `$HARNESS/SKILLS.md` |

Les CLIs externes (`api2cli`, skills.sh, marketplaces, `npx …`) écrivent souvent sous `~/.claude/skills`, `~/.agents/skills`, `~/.cli/<app>/skills`, etc. Ce skill **rapatrie** dans le harness puis re-link.

**Hors scope** : `update-harness` (template curé Nardjo/usine). Ici = skills hors template que le coaché ajoute.

## Étapes

### 1. Localiser le harness

```bash
HARNESS=""
for p in \
  "$HOME/.claude/CLAUDE.md" \
  "$HOME/.config/opencode/AGENTS.md" \
  "$HOME/.codex/AGENTS.md" \
  "$HOME/.gemini/GEMINI.md" \
  "$HOME/.grok/AGENTS.md"; do
  if [ -L "$p" ]; then
    HARNESS="$(cd "$(dirname "$(readlink "$p")")" && pwd)"
    break
  fi
done
```

Sinon : cwd s'il contient `setup.sh` + `skills/`, sinon demander le chemin.
Vérifier `$HARNESS/setup.sh` et `$HARNESS/skills/`.

### 2. Déterminer la source

| Cas | Action |
|-----|--------|
| **Chemin local** déjà sur disque (`~/…/SKILL.md` ou dossier skill) | Copier vers le harness (étape 3) |
| **URL GitHub** / repo (`owner/repo`, `owner/repo/tree/.../skill`) | Cloner ou sparse-checkout le dossier skill dans un tmp, puis copier |
| **CLI externe** (`api2cli install`, skills.sh, plugin marketplace) | Laisser la CLI tourner **si besoin**, puis trouver le dossier skill créé et copier (étape 3). Ne pas s'arrêter après la CLI. |
| **Déjà installé au mauvais endroit** (réel sous un home d'outil, pas un symlink vers le harness) | Traiter ce dossier comme source → étape 3 |
| **Création from scratch** | Créer `$HARNESS/skills/<nom>/SKILL.md` (voir `writing-for-agents`), puis étape 4–5 |

Nom du skill = nom du dossier (kebab-case), aligné sur le `name:` du frontmatter si présent.

### 3. Placer dans le harness

```bash
NAME="<nom>"   # dossier kebab-case
SRC="<chemin du dossier skill source>"
DEST="$HARNESS/skills/$NAME"
```

- Exiger `$SRC/SKILL.md` (format Agent Skills). Sinon arrêter et expliquer.
- Si `$DEST` existe déjà :
  - Si identique (même contenu pertinent) : dire « déjà dans le harness » et passer à l'étape 5.
  - Sinon : demander via AskUserQuestion **garder local** / **écraser par la source** (backup `$DEST.bak` avant écrasement).
- Copier le dossier entier (pas seulement `SKILL.md` si scripts/refs existent) :

```bash
mkdir -p "$HARNESS/skills"
if [ -e "$DEST" ]; then
  # recoverable remove only (never rm -rf)
  TRASH_BIN="$(command -v trash 2>/dev/null || true)"
  [ -x /opt/homebrew/opt/trash/bin/trash ] && TRASH_BIN=/opt/homebrew/opt/trash/bin/trash
  if [ -n "$TRASH_BIN" ]; then
    "$TRASH_BIN" "$DEST"
  else
    mv "$DEST" "$DEST.bak.$(date +%s)"
  fi
fi
cp -R "$SRC" "$DEST"
```

### 4. Mettre à jour le catalogue

Dans `$HARNESS/SKILLS.md` : une ligne de table

```markdown
| `nom` | Description courte (depuis le frontmatter `description`) |
```

Si la ligne existe, mettre à jour la description si elle a changé. Ne pas inventer de skills absents du disque.

### 5. Linker tous les outils

```bash
bash "$HARNESS/setup.sh"
```

Vérifier qu'au moins un tool a un symlink vers `$HARNESS/skills/$NAME` (ex. `readlink ~/.claude/skills/$NAME` si Claude est installé).

### 6. Résumé

Dire : nom du skill, chemin harness, outils liés, rappel que le binaire/runtime (api2cli `~/.cli`, brew, …) peut rester hors harness mais le **SKILL.md** est versionné dans le harness.

## Règles

- **Jamais** laisser une skill uniquement sous `~/.claude/skills`, `~/.agents/skills`, `~/.grok/skills`, `~/.config/opencode/skills`, `~/.gemini/skills`, ou `~/.cli/.../skills` sans copie harness.
- **Jamais** installer « pour un seul outil » : le harness + `setup.sh` multi-provider.
- Binaires / auth / tokens : hors `skills/` (restent locaux).
- Ne pas confondre avec `update-harness` (sync template de l'usine à code).
- Si la source est un plugin Claude marketplace (pas un dossier SKILL.md classique) : expliquer la limite ; n'adopter que les skills Agent Skills (dossier + `SKILL.md`).
- Idempotent : re-run safe si déjà correctement installé.
