// Curated starter shipped to coachés — everything ends up flat in template/skills/.
//
// - UPSTREAM_SKILLS: fetched from mattpocock/skills at build time
// - Other dirs already in template/skills/ (caveman, update-harness, empty-trash, …)
//   are house-owned: edited there, preserved across build:template
// - maintainer/skills/: this-repo-only — never shipped

export const CATALOG_ORDER = [
  "setup-matt-pocock-skills",
  "ask-matt",
  "grill-with-docs",
  "grill-me",
  "grilling",
  "research",
  "prototype",
  "wayfinder",
  "wizard",
  "to-spec",
  "to-tickets",
  "to-questionnaire",
  "implement",
  "implement-spec",
  "tdd",
  "code-review",
  "pr",
  "triage",
  "diagnosing-bugs",
  "improve-codebase-architecture",
  "codebase-design",
  "domain-modeling",
  "handoff",
  "retro",
  "teach",
  "wait-what",
  "writing-for-agents",
  "caveman",
  "update-harness",
  "install-skill",
  "empty-trash",
];

/** Matt Pocock engineering + productivity (excludes deprecated/misc/in-progress). */
export const UPSTREAM_SKILLS = [
  { category: "engineering", name: "ask-matt" },
  { category: "engineering", name: "code-review" },
  { category: "engineering", name: "codebase-design" },
  { category: "engineering", name: "diagnosing-bugs" },
  { category: "engineering", name: "domain-modeling" },
  { category: "engineering", name: "grill-with-docs" },
  { category: "engineering", name: "implement" },
  { category: "engineering", name: "implement-spec" },
  { category: "engineering", name: "improve-codebase-architecture" },
  { category: "engineering", name: "pr" },
  { category: "engineering", name: "prototype" },
  { category: "engineering", name: "research" },
  { category: "engineering", name: "retro" },
  { category: "engineering", name: "setup-matt-pocock-skills" },
  { category: "engineering", name: "tdd" },
  { category: "engineering", name: "to-spec" },
  { category: "engineering", name: "to-tickets" },
  { category: "engineering", name: "triage" },
  { category: "engineering", name: "wayfinder" },
  { category: "engineering", name: "wizard" },
  { category: "productivity", name: "grill-me" },
  { category: "productivity", name: "grilling" },
  { category: "productivity", name: "handoff" },
  { category: "productivity", name: "teach" },
  { category: "productivity", name: "to-questionnaire" },
  { category: "productivity", name: "wait-what" },
  { category: "productivity", name: "writing-for-agents" },
];

// Back-compat alias
export const SKILLS = UPSTREAM_SKILLS;
