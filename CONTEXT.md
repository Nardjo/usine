# L'usine à code — create-harness

Langage du domaine pour le CLI scaffolder qui distribue le harness aux coachés. Glossaire uniquement, pas de détails d'implémentation.

## Language

**Harness**:
L'espace de travail curé et multi-provider (skills, commands, agents) qu'un coaché possède et fait évoluer. Vision Matt Pocock : Agent = Model + Harness.
_Avoid_: setup, config, dotfiles

**Provider**:
Un outil de codage IA cible vers lequel le harness se synchronise, chacun avec sa propre convention de config. Set v1 : Claude Code, OpenCode, Codex, Antigravity CLI (réutilise `~/.gemini`), Grok Build (`~/.grok`), omp (`~/.omp/agent`).
_Avoid_: tool, platform, outil

**Coaché**:
Un dev freelance du programme de coaching de Jordan qui reçoit un harness et en devient propriétaire (source de vérité locale).
_Avoid_: client, élève, user

**Starter curé**:
Contenu initial du harness : skills Matt (engineering + productivity, hors deprecated/misc/in-progress) + skills maison, le tout dans un seul `template/skills/` (puis `skills/` chez le coaché).
_Avoid_: extras, dossier skills séparé à la racine du repo scaffolder

**Skill mainteneur**:
Skill réservé au repo create-usine (`maintainer/skills/…`), jamais livré aux coachés. Ex. sync des skills Matt Pocock dans le template.
_Avoid_: le confondre avec `update-harness` (côté coaché)
