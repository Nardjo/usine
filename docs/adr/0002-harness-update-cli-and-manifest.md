# Update du harness : CLI + manifest, pas une sync Matt Pocock

Les coachés **possèdent** leur harness (source de vérité locale). Les mises à jour depuis le template curé `Nardjo/usine` sont **opt-in**, pilotées par la CLI `create-usine` (`update` / `reinstall`), pas par un pull silencieux ni par une sync depuis `mattpocock/skills`.

## Décision

1. **Source de l'update** : le `template/` du package que `npx github:Nardjo/usine` vient de récupérer (déjà assemblé : skills Matt + skills maison, un seul `skills/` plat). Le coaché ne clone pas Matt Pocock.
2. **CLI comme voie principale** :
   - `create-usine update [path]` — merge unitaires (skills, `setup.sh`, `SKILLS.md`, `RTK.md`)
   - `create-usine reinstall [path]` — migration de layout (ex. `commands/<outil>/` → `commands/`, `agents/` → `tools/…`) puis update + `setup.sh`
   - Alias `upgrade` = `reinstall`
3. **Skill `update-harness`** livré dans le harness : **marche à suivre** qui appelle cette CLI (dry-run, conflits, reinstall si ancien layout). Ce n'est pas un moteur parallèle et ce n'est **pas** `sync-mattpocock`.
4. **Manifest** `.usine/manifest.json` (hashes au scaffold) : classifie chaque unité en `new` / `update` / `conflict` / `local` / `ok`. Les unités jamais touchées depuis la livraison se rafraîchissent sans question ; un conflit sur un skill montre un diff et demande confirmation (backup `.usine/backup/`).
5. **`reinstall` force le wiring** : `setup.sh` et `RTK.md` sont toujours repris depuis le template (pas de prompt), avec backup si la copie locale différait. C'est volontaire : le saut de layout / d'outillage ne doit pas rester sur un vieux `setup.sh`. Les skills et `CLAUDE.md` / `AGENTS.md` restent hors de ce forçage.
6. **Jamais touchés par l'update** : `CLAUDE.md` / `AGENTS.md` (règles du coaché), skills absents du template (persos ou retirés de la curation — on ne supprime pas).
7. **Layout `tools/`** : squelette + adopt des configs / hooks / plugins live via `setup.sh` (pas de defaults secrets curés). Secrets (`settings.local.json`, auth) hors harness. `RTK.md` est symlinké pour Claude / Codex / Grok ; OpenCode / Gemini s'appuient sur `rtk init`.
8. **Côté repo create-usine uniquement** : `maintainer/skills/sync-mattpocock/` + `npm run build:template` rafraîchissent les skills Matt **dans le template**. Jamais livré aux coachés. Les skills maison s'éditent sous `template/skills/` et sont préservés au rebuild.

## Options écartées

| Option | Pourquoi non |
|--------|----------------|
| Sous-commande absente, update seulement via skill agent | Fragile (TTY, non-déterministe) ; le coaché doit pouvoir update sans IA |
| Clone `mattpocock/skills` dans le harness | Fuit la curation ; double source de vérité ; hors programme |
| Dossier `extras/` séparé des skills Matt | Charge mentale inutile ; un seul `skills/` plat partout |
| `update` qui migre le layout tout seul sans commande dédiée | Trop de surprise ; `reinstall` rend le saut de version explicite |
| Écraser `CLAUDE.md` / skills perso | Contredit « le harness est au coaché » |

## Conséquences

- Un harness 0.3 sans `tools/` / avec `commands/claude/` doit passer par **`reinstall`** (ou `upgrade`), pas un nouveau scaffold.
- Un coaché qui a customisé `setup.sh` / `RTK.md` et lance `reinstall` récupère le template (backup dans `.usine/backup/` si besoin).
- Ajouter un skill maison = l'écrire dans `template/skills/<nom>/` (+ catalogue) ; les coachés le reçoivent au prochain `update`.
- Élargir le starter Matt = éditer `UPSTREAM_SKILLS` puis `build:template` (mainteneur), pas un skill coaché.
- Le moteur de merge (`update.mjs`) reste embarqué dans le skill pour autonomie Node dans le harness, mais l'orchestration officielle reste la CLI.
