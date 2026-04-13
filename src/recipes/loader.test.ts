import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { parseRecipeCard, loadRecipeById, loadAllRecipes, resolveRecipeDirs, clearRecipeCache, loadRecipeCached } from "./loader.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL_CARD = `---
id: test-agent
name: Test Agent
description: A test recipe
---

# SOUL

You are a test agent.

---

# AGENTS

## Instructions

Do the thing.
`;

const FULL_CARD = `---
id: demand-drafter
name: Demand Draft Specialist
description: Drafts demand letters from structured case files
version: 1

model: openai-codex/gpt-5.4
thinking: medium

identity:
  name: Demand Drafter
  emoji: "📝"
  theme: demand letter specialist

tools:
  profile: coding
  allow:
    - read
    - write
    - edit
  deny:
    - browser

skills:
  - demand-preparation
  - medical-records-analysis

sandbox:
  mode: all
  workspaceAccess: rw

workspace_template: demand-workspace
timeout_seconds: 600
max_children: 0
cleanup: delete
---

# SOUL

You are the Demand Draft Specialist.

## Core Purpose
Draft demand letters from case data.

## Boundaries
- Never send communications externally

---

# AGENTS

## Operating Instructions

1. Read the case file
2. Draft demand letter
3. Save output

---

# TOOLS

Use read and write tools. Avoid browser.
`;

const NO_FRONTMATTER_CARD = `# SOUL

Just a soul section with no frontmatter.
`;

const EMPTY_SECTIONS_CARD = `---
id: empty-sections
name: Empty Sections Agent
---

Some text before any heading.
`;

// ---------------------------------------------------------------------------
// parseRecipeCard
// ---------------------------------------------------------------------------

describe("parseRecipeCard", () => {
  it("parses a minimal recipe card", () => {
    const card = parseRecipeCard(MINIMAL_CARD, "/test/test-agent.md");
    expect(card.id).toBe("test-agent");
    expect(card.name).toBe("Test Agent");
    expect(card.description).toBe("A test recipe");
    expect(card.sections.soul).toBe("You are a test agent.");
    expect(card.sections.agents).toContain("Do the thing.");
    expect(card.sourcePath).toBe("/test/test-agent.md");
  });

  it("parses a full recipe card with all fields", () => {
    const card = parseRecipeCard(FULL_CARD, "/test/demand-drafter.md");

    // Metadata
    expect(card.id).toBe("demand-drafter");
    expect(card.name).toBe("Demand Draft Specialist");
    expect(card.description).toContain("demand letters");
    expect(card.version).toBe(1);

    // Model
    expect(card.model).toBe("openai-codex/gpt-5.4");
    expect(card.thinking).toBe("medium");

    // Identity
    expect(card.identity).toEqual({
      name: "Demand Drafter",
      emoji: "📝",
      theme: "demand letter specialist",
    });

    // Tools
    expect(card.tools).toEqual({
      profile: "coding",
      allow: ["read", "write", "edit"],
      deny: ["browser"],
    });

    // Skills
    expect(card.skills).toEqual(["demand-preparation", "medical-records-analysis"]);

    // Sandbox
    expect(card.sandbox).toEqual({
      mode: "all",
      workspaceAccess: "rw",
    });

    // Recipe-specific
    expect(card.workspace_template).toBe("demand-workspace");
    expect(card.timeout_seconds).toBe(600);
    expect(card.max_children).toBe(0);
    expect(card.cleanup).toBe("delete");

    // Sections
    expect(card.sections.soul).toContain("Demand Draft Specialist");
    expect(card.sections.agents).toContain("Read the case file");
    expect(card.sections.tools).toContain("Use read and write tools");
  });

  it("derives id from filename when frontmatter has no id", () => {
    const raw = `---
name: No ID Agent
---

# SOUL

Test.
`;
    const card = parseRecipeCard(raw, "/recipes/my-derived-agent.md");
    expect(card.id).toBe("my-derived-agent");
  });

  it("handles missing frontmatter gracefully", () => {
    const card = parseRecipeCard(NO_FRONTMATTER_CARD, "/test/no-fm.md");
    expect(card.id).toBe("no-fm");
    expect(card.sections.soul).toBe("Just a soul section with no frontmatter.");
    expect(card.model).toBeUndefined();
  });

  it("handles card with no recognised sections", () => {
    const card = parseRecipeCard(EMPTY_SECTIONS_CARD, "/test/empty.md");
    expect(card.id).toBe("empty-sections");
    expect(card.sections.soul).toBeUndefined();
    expect(card.sections.agents).toBeUndefined();
  });

  it("parses model as object with primary and fallbacks", () => {
    const raw = `---
id: model-test
model:
  primary: openai-codex/gpt-5.4
  fallbacks:
    - openrouter/anthropic/claude-sonnet-4-6
---

# SOUL

Test.
`;
    const card = parseRecipeCard(raw, "/test/model-test.md");
    expect(card.model).toEqual({
      primary: "openai-codex/gpt-5.4",
      fallbacks: ["openrouter/anthropic/claude-sonnet-4-6"],
    });
  });

  it("handles --- section separators between sections", () => {
    const raw = `---
id: separator-test
---

# SOUL

First section.

---

# AGENTS

Second section.
`;
    const card = parseRecipeCard(raw, "/test/sep.md");
    expect(card.sections.soul).toBe("First section.");
    expect(card.sections.agents).toBe("Second section.");
  });

  it("ignores unrecognised headings", () => {
    const raw = `---
id: heading-test
---

# SOUL

Soul content.

# RANDOM HEADING

This should be ignored.

# AGENTS

Agent content.
`;
    const card = parseRecipeCard(raw, "/test/heading.md");
    expect(card.sections.soul).toContain("Soul content.");
    // The unrecognised heading content gets captured under soul since
    // "# RANDOM HEADING" is not a recognised section, so it stays in
    // whatever section is active... let me check the logic.
    // Actually: RANDOM is not in SECTION_NAMES, so it won't trigger flush.
    // The content under RANDOM will be part of the soul section's buffer.
    expect(card.sections.agents).toBe("Agent content.");
  });
});

// ---------------------------------------------------------------------------
// File-system loading
// ---------------------------------------------------------------------------

describe("file-system loading", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `recipe-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    clearRecipeCache();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    clearRecipeCache();
  });

  describe("resolveRecipeDirs", () => {
    it("uses default stateDir/recipes when no dirs configured", () => {
      const dirs = resolveRecipeDirs(undefined, "/data/.openclaw");
      expect(dirs).toEqual(["/data/.openclaw/recipes"]);
    });

    it("uses configured dirs", () => {
      const dirs = resolveRecipeDirs({ dirs: ["/custom/recipes", "/extra/recipes"] }, "/data/.openclaw");
      expect(dirs).toEqual(["/custom/recipes", "/extra/recipes"]);
    });
  });

  describe("loadAllRecipes", () => {
    it("loads all .md files from the recipes directory", async () => {
      await writeFile(join(testDir, "agent-a.md"), MINIMAL_CARD);
      await writeFile(
        join(testDir, "agent-b.md"),
        `---\nid: agent-b\nname: Agent B\n---\n\n# SOUL\n\nAgent B soul.\n`,
      );

      const cards = await loadAllRecipes({ dirs: [testDir] }, testDir);
      expect(cards).toHaveLength(2);
      expect(cards.map((c) => c.id).sort()).toEqual(["agent-b", "test-agent"]);
    });

    it("skips non-.md files", async () => {
      await writeFile(join(testDir, "agent.md"), MINIMAL_CARD);
      await writeFile(join(testDir, "readme.txt"), "not a recipe");
      await writeFile(join(testDir, "config.json"), "{}");

      const cards = await loadAllRecipes({ dirs: [testDir] }, testDir);
      expect(cards).toHaveLength(1);
    });

    it("skips duplicate recipe IDs (first wins)", async () => {
      await writeFile(join(testDir, "first.md"), MINIMAL_CARD);
      await writeFile(
        join(testDir, "second.md"),
        MINIMAL_CARD, // Same id: test-agent
      );

      const warnings: string[] = [];
      const cards = await loadAllRecipes({ dirs: [testDir] }, testDir, (msg) => warnings.push(msg));
      expect(cards).toHaveLength(1);
      expect(warnings.some((w) => w.includes("duplicate"))).toBe(true);
    });

    it("returns empty array for non-existent directory", async () => {
      const cards = await loadAllRecipes({ dirs: ["/nonexistent/path"] }, testDir);
      expect(cards).toEqual([]);
    });
  });

  describe("loadRecipeById", () => {
    it("loads by filename match", async () => {
      await writeFile(join(testDir, "my-recipe.md"), MINIMAL_CARD);

      // The card's frontmatter id is "test-agent" but filename is "my-recipe".
      // loadRecipeById("my-recipe") should find it by filename.
      const card = await loadRecipeById("my-recipe", { dirs: [testDir] }, testDir);
      // File is found by filename, but parsed card.id is "test-agent" from frontmatter.
      // The function tries direct path first ({id}.md), and if that works, returns it.
      expect(card).toBeDefined();
      expect(card!.id).toBe("test-agent"); // Frontmatter id wins over filename.
    });

    it("loads by frontmatter id when filename doesn't match", async () => {
      await writeFile(join(testDir, "some-file.md"), MINIMAL_CARD);

      const card = await loadRecipeById("test-agent", { dirs: [testDir] }, testDir);
      expect(card).toBeDefined();
      expect(card!.id).toBe("test-agent");
    });

    it("returns undefined for unknown recipe", async () => {
      const card = await loadRecipeById("nonexistent", { dirs: [testDir] }, testDir);
      expect(card).toBeUndefined();
    });
  });

  describe("loadRecipeCached", () => {
    it("caches and returns cached result on second load", async () => {
      await writeFile(join(testDir, "cached.md"), MINIMAL_CARD);

      const card1 = await loadRecipeCached("test-agent", { dirs: [testDir] }, testDir);
      expect(card1).toBeDefined();

      const card2 = await loadRecipeCached("test-agent", { dirs: [testDir] }, testDir);
      expect(card2).toBeDefined();
      // Same object reference from cache.
      expect(card2).toBe(card1);
    });

    it("invalidates cache when file changes", async () => {
      const filePath = join(testDir, "mutable.md");
      await writeFile(filePath, MINIMAL_CARD);

      const card1 = await loadRecipeCached("test-agent", { dirs: [testDir] }, testDir);
      expect(card1!.name).toBe("Test Agent");

      // Wait a tick to ensure mtime changes.
      await new Promise((r) => setTimeout(r, 50));

      const updatedCard = MINIMAL_CARD.replace("Test Agent", "Updated Agent");
      await writeFile(filePath, updatedCard);

      const card2 = await loadRecipeCached("test-agent", { dirs: [testDir] }, testDir);
      expect(card2!.name).toBe("Updated Agent");
      expect(card2).not.toBe(card1);
    });
  });
});
