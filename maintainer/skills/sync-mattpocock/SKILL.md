---
name: "sync-mattpocock"
description: "MAINTEUR create-usine uniquement — synchronise les skills Matt Pocock dans template/skills/ (préserve les skills maison). Ne pas livrer aux coachés. Utiliser : \"sync mattpocock\", \"update matt skills\", \"refresh template\"."
allowed-tools: Bash, AskUserQuestion, Read, Edit
argument-hint: [--check]
---

# Sync Matt Pocock (mainteneur usine)

**Ce repo uniquement.** Jamais livré aux coachés.

## Où sont les skills

| Chemin | Rôle |
|--------|------|
| `template/skills/` | **Unique** dossier livré : Matt + maison, à plat |
| `build/manifest.js` → `UPSTREAM_SKILLS` | Liste Matt à re-fetcher |
| Skills maison (`caveman`, `update-harness`, `empty-trash`, …) | Édités **directement** sous `template/skills/` ; le build les conserve |

## Étapes

### 1. Racine du repo create-usine

```bash
cd "$(git rev-parse --show-toplevel)"
```

### 2. (Optionnel) Inspecter l'upstream

```bash
UPSTREAM=upstream/mattpocock-skills
if [ -d "$UPSTREAM/.git" ]; then git -C "$UPSTREAM" pull --ff-only
else git clone --depth 1 https://github.com/mattpocock/skills "$UPSTREAM"; fi
```

Comparer engineering + productivity avec `UPSTREAM_SKILLS`. Pour **ajouter** un skill au starter : éditer `UPSTREAM_SKILLS` + `CATALOG_ORDER` (+ `descriptions.fr.js` si besoin) **après confirmation**.

### 3. `--check`

Si demandé : lister les écarts, ne rien écrire.

### 4. Rebuild

```bash
npm run build:template
npm test
```

Le build :

1. Met de côté les dossiers de `template/skills/` qui **ne** sont **pas** dans `UPSTREAM_SKILLS`
2. Re-fetch Matt → `template/skills/`
3. Remet les skills maison
4. Régénère `SKILLS.md`

### 5. Résumé

Coachés : `npx github:Nardjo/usine update` / `reinstall` — **pas** ce skill.

## Règles

- Ne pas créer de second dossier `skills/` à la racine du repo.
- Ne pas copier ce skill dans `template/`.
- Confirmer avant d'élargir `UPSTREAM_SKILLS`.
