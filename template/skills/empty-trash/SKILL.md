---
name: "empty-trash"
description: "Liste puis vide la corbeille macOS (Trash) via le CLI trash. Suppression définitive après confirmation. Utiliser quand : \"empty trash\", \"vider la corbeille\", \"vider trash\", \"empty the trash\", \"purge trash\"."
allowed-tools: Bash, AskUserQuestion
argument-hint: [--list] [--yes]
---

# Empty Trash

Vide la **corbeille macOS** (où vont les fichiers passés par `trash` au lieu de `rm`).
macOS uniquement : sous Linux / Windows, dire de vider la corbeille depuis le système et s'arrêter.
C'est **définitif** une fois confirmé — pas de récupération.

## Prérequis

CLI hasseg `trash` (installé par `setup.mjs` du harness) :

```bash
TRASH_BIN=""
for c in \
  /opt/homebrew/opt/trash/bin/trash \
  /usr/local/opt/trash/bin/trash \
  "$(command -v brew >/dev/null 2>&1 && brew --prefix)/opt/trash/bin/trash" \
  "$(command -v trash)"; do
  [ -n "$c" ] && [ -x "$c" ] && [ "$c" != "/usr/bin/trash" ] && TRASH_BIN="$c" && break
done
```

Si `TRASH_BIN` est vide : dire d'installer (`brew install trash` ou `node setup.mjs` du harness) et s'arrêter.
Ne pas utiliser Apple's `/usr/bin/trash` (pas d'option empty).

## Étapes

### 1. Lister le contenu

```bash
"$TRASH_BIN" -l
"$TRASH_BIN" -lv
```

Si la corbeille est vide : le dire et s'arrêter.
Si l'argument est `--list` : s'arrêter après le listing.

### 2. Confirmation

**Toujours** confirmer avant de vider, sauf si l'utilisateur a passé `--yes` **et** a explicitement demandé de vider dans le message courant.

Via AskUserQuestion : **Annuler** / **Vider définitivement**.

### 3. Vider

```bash
"$TRASH_BIN" -ey
"$TRASH_BIN" -l
```

### 4. Résumé

Dire que la corbeille est vide (ou ce qui a échoué). Rappeler que c'est irréversible.

## Règles

- **Ne jamais** `rm -rf ~/.Trash` : utiliser uniquement `"$TRASH_BIN" -e`.
- **Ne jamais** vider sans confirmation (sauf `--yes` explicite dans la requête).
- Ne pas confondre avec `trash <fichier>` (mettre *dans* la corbeille) : ce skill **vide** la corbeille.
- Secure empty (`-s`) : seulement si demandé explicitement, avec une seconde confirmation.
