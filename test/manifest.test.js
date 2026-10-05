import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILLS, UPSTREAM_SKILLS } from "../build/manifest.js";

test("manifest lists exactly 27 upstream skills", () => {
  assert.equal(SKILLS.length, 27);
});

test("manifest includes the engineering + productivity workflow", () => {
  const names = SKILLS.map((s) => s.name);
  for (const n of [
    "tdd",
    "grill-me",
    "grilling",
    "to-spec",
    "to-tickets",
    "triage",
    "implement",
    "ask-matt",
    "diagnosing-bugs",
    "handoff",
    "teach",
    "writing-for-agents",
    "wizard",
    "wait-what",
    "to-questionnaire",
  ]) {
    assert.ok(names.includes(n), `${n} devrait être inclus`);
  }
  assert.ok(!names.includes("writing-great-skills"), "renommé writing-for-agents");
});

test("manifest excludes deprecated/personal/misc/in-progress skills", () => {
  const names = SKILLS.map((s) => s.name);
  for (const excluded of [
    "migrate-to-shoehorn",
    "scaffold-exercises",
    "git-guardrails-claude-code",
    "setup-pre-commit",
    "edit-article",
    "obsidian-vault",
    "review",
    "decision-mapping",
  ]) {
    assert.ok(!names.includes(excluded), `${excluded} ne devrait pas être inclus`);
  }
});

test("every entry has a valid category", () => {
  for (const s of SKILLS) {
    assert.ok(
      s.category === "engineering" || s.category === "productivity",
      `${s.name}: catégorie invalide (${s.category})`,
    );
    assert.match(s.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  }
});

test("no duplicate skill names", () => {
  const names = SKILLS.map((s) => s.name);
  assert.equal(new Set(names).size, names.length);
});

test("UPSTREAM_SKILLS is the mattpocock set (alias SKILLS)", () => {
  assert.equal(SKILLS, UPSTREAM_SKILLS);
  assert.equal(UPSTREAM_SKILLS.length, 27);
});
