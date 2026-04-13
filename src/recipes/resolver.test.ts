import { describe, it, expect } from "vitest";

import { parseRecipeCard } from "./loader.js";
import { synthesizeAgentConfig, createRecipeOverlay } from "./resolver.js";
import type { RecipesConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULL_CARD = `---
id: demand-drafter
name: Demand Draft Specialist
description: Drafts demand letters

model: openai-codex/gpt-5.4
thinking: medium

identity:
  name: Demand Drafter
  emoji: "📝"
  theme: demand specialist

tools:
  profile: coding
  allow:
    - read
    - write
  deny:
    - browser

skills:
  - demand-preparation

sandbox:
  mode: all
  workspaceAccess: rw

timeout_seconds: 600
max_children: 0
cleanup: delete
---

# SOUL

You are the Demand Drafter.

---

# AGENTS

Draft demands.

---

# TOOLS

Use read and write.
`;

// ---------------------------------------------------------------------------
// synthesizeAgentConfig
// ---------------------------------------------------------------------------

describe("synthesizeAgentConfig", () => {
  it("produces an AgentConfig from a recipe card", () => {
    const card = parseRecipeCard(FULL_CARD, "/test/demand-drafter.md");
    const config = synthesizeAgentConfig(card);

    expect(config.id).toBe("demand-drafter");
    expect(config.name).toBe("Demand Draft Specialist");
    expect(config.model).toBe("openai-codex/gpt-5.4");
    expect(config.thinkingDefault).toBe("medium");
    expect(config.identity).toEqual({
      name: "Demand Drafter",
      emoji: "📝",
      theme: "demand specialist",
    });
    expect(config.tools).toEqual({
      profile: "coding",
      allow: ["read", "write"],
      deny: ["browser"],
    });
    expect(config.skills).toEqual(["demand-preparation"]);
    expect(config.sandbox).toEqual({ mode: "all", workspaceAccess: "rw" });
  });

  it("applies recipe defaults when card has no value", () => {
    const card = parseRecipeCard(
      `---\nid: minimal\n---\n\n# SOUL\n\nTest.\n`,
      "/test/minimal.md",
    );
    const defaults: RecipesConfig = {
      defaults: {
        model: "openrouter/anthropic/claude-sonnet-4-6",
        thinking: "low",
        cleanup: "delete",
        sandbox: { mode: "all" },
      },
    };

    const config = synthesizeAgentConfig(card, defaults);
    expect(config.model).toBe("openrouter/anthropic/claude-sonnet-4-6");
    expect(config.thinkingDefault).toBe("low");
    expect(config.sandbox).toEqual({ mode: "all" });
  });

  it("card values override defaults", () => {
    const card = parseRecipeCard(
      `---\nid: override\nmodel: openai-codex/gpt-5.4\nthinking: high\n---\n\n# SOUL\n\nTest.\n`,
      "/test/override.md",
    );
    const defaults: RecipesConfig = {
      defaults: {
        model: "openrouter/anthropic/claude-sonnet-4-6",
        thinking: "low",
      },
    };

    const config = synthesizeAgentConfig(card, defaults);
    expect(config.model).toBe("openai-codex/gpt-5.4");
    expect(config.thinkingDefault).toBe("high");
  });

  it("sets allowAgents to empty array when max_children is 0", () => {
    const card = parseRecipeCard(FULL_CARD, "/test/leaf.md");
    const config = synthesizeAgentConfig(card);
    expect(config.subagents?.allowAgents).toEqual([]);
  });

  it("does not set subagents when max_children is undefined", () => {
    const card = parseRecipeCard(
      `---\nid: no-limit\n---\n\n# SOUL\n\nTest.\n`,
      "/test/no-limit.md",
    );
    const config = synthesizeAgentConfig(card);
    expect(config.subagents).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createRecipeOverlay
// ---------------------------------------------------------------------------

describe("createRecipeOverlay", () => {
  it("provides virtual workspace files from recipe sections", () => {
    const card = parseRecipeCard(FULL_CARD, "/test/demand-drafter.md");
    const overlay = createRecipeOverlay(card);

    expect(overlay.readFile("SOUL.md")).toContain("Demand Drafter");
    expect(overlay.readFile("AGENTS.md")).toContain("Draft demands");
    expect(overlay.readFile("TOOLS.md")).toContain("Use read and write");
  });

  it("returns undefined for files not in the recipe", () => {
    const card = parseRecipeCard(FULL_CARD, "/test/demand-drafter.md");
    const overlay = createRecipeOverlay(card);

    expect(overlay.readFile("USER.md")).toBeUndefined();
    expect(overlay.readFile("MEMORY.md")).toBeUndefined();
    expect(overlay.readFile("BOOTSTRAP.md")).toBeUndefined();
  });

  it("lists only the files it provides", () => {
    const card = parseRecipeCard(FULL_CARD, "/test/demand-drafter.md");
    const overlay = createRecipeOverlay(card);
    const files = overlay.files();

    expect(files).toContain("SOUL.md");
    expect(files).toContain("AGENTS.md");
    expect(files).toContain("TOOLS.md");
    expect(files).not.toContain("USER.md");
  });

  it("handles case-insensitive lookups", () => {
    const card = parseRecipeCard(FULL_CARD, "/test/demand-drafter.md");
    const overlay = createRecipeOverlay(card);

    expect(overlay.readFile("soul.md")).toContain("Demand Drafter");
    expect(overlay.readFile("agents.md")).toContain("Draft demands");
  });

  it("returns empty overlay for card with no sections", () => {
    const card = parseRecipeCard(
      `---\nid: empty\n---\n\nSome text.\n`,
      "/test/empty.md",
    );
    const overlay = createRecipeOverlay(card);

    expect(overlay.files()).toHaveLength(0);
    expect(overlay.readFile("SOUL.md")).toBeUndefined();
  });
});
