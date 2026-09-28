# Pas de moteur de sync dans le harness — standard Agent Skills + symlinks

`create-usine` génère un harness qui stocke chaque skill **une seule fois** au format `skills/<nom>/SKILL.md`, et un `setup.sh` qui détecte les outils installés (Claude Code, OpenCode, Codex, Antigravity, Grok) puis **symlink** ces dossiers vers l'emplacement global que chaque outil lit (`~/.claude/skills/`, `~/.config/opencode/skills/`, `~/.agents/skills/`, `~/.gemini/skills/`, `~/.grok/skills/`). Il n'y a **aucun** moteur de conversion/sync entre providers.

C'est une déviation délibérée par rapport à cerberus lui-même, qui embarque un `sync.py` transformant les skills `claude/` en formats OpenCode (commands) et Codex (prompts à plat). Ce moteur répondait à une époque où les trois outils divergeaient. Depuis, Claude Code, OpenCode et Codex ont convergé vers le **même** standard « Agent Skills » : un dossier `SKILL.md` avec frontmatter `name`/`description`, le corps Markdown étant identique et portable. Les rares champs spécifiques (ex. `disable-model-invocation` côté Claude) sont ignorés — pas rejetés — par les autres. Plus rien à convertir : un symlink suffit, et l'édition d'un skill est instantanément vue par tous les outils.

## Conséquence

Si un provider diverge un jour du standard `SKILL.md` (champ obligatoire propre, format incompatible), il faudra réintroduire une étape de conversion pour ce provider. Le pari est que la convergence de l'écosystème tient.
