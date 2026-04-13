import { describe, it, expect } from "vitest";

import { parseRecipeCard } from "./loader.js";
import { validateRecipeCard, isRecipeAllowed } from "./validator.js";
import type { RecipesConfig } from "./types.js";

// ---------------------------------------------------------------------------
// validateRecipeCard
// ---------------------------------------------------------------------------

describe("validateRecipeCard", () => {
  it("passes for a valid card with all sections", () => {
    const card = parseRecipeCard(
      `---
id: valid-agent
name: Valid Agent
description: A valid test recipe
---

# SOUL

You are valid.

---

# AGENTS

Do valid things.
`,
      "/test/valid.md",
    );
    const result = validateRecipeCard(card);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("fails for invalid id format", () => {
    const card = parseRecipeCard(
      `---
id: Invalid-Agent!
---

# SOUL

Test.
`,
      "/test/invalid.md",
    );
    const result = validateRecipeCard(card);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === "id")).toBe(true);
  });

  it("warns for missing SOUL section", () => {
    const card = parseRecipeCard(
      `---
id: no-soul
description: Missing soul
---

# AGENTS

Just agents.
`,
      "/test/no-soul.md",
    );
    const result = validateRecipeCard(card);
    expect(result.valid).toBe(true); // Warnings don't fail validation.
    expect(result.warnings.some((w) => w.path === "sections.soul")).toBe(true);
  });

  it("warns for missing AGENTS section", () => {
    const card = parseRecipeCard(
      `---
id: no-agents
description: Missing agents
---

# SOUL

Just soul.
`,
      "/test/no-agents.md",
    );
    const result = validateRecipeCard(card);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.path === "sections.agents")).toBe(true);
  });

  it("warns for missing description", () => {
    const card = parseRecipeCard(
      `---
id: no-desc
---

# SOUL

Test.

---

# AGENTS

Test.
`,
      "/test/no-desc.md",
    );
    const result = validateRecipeCard(card);
    expect(result.warnings.some((w) => w.path === "description")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isRecipeAllowed
// ---------------------------------------------------------------------------

describe("isRecipeAllowed", () => {
  it("allows everything when no config", () => {
    expect(isRecipeAllowed("anything", undefined)).toBe(true);
  });

  it("allows everything when config has no allow/deny", () => {
    const config: RecipesConfig = { dirs: ["/some/dir"] };
    expect(isRecipeAllowed("anything", config)).toBe(true);
  });

  it("blocks recipes on the denylist", () => {
    const config: RecipesConfig = { deny: ["blocked-agent"] };
    expect(isRecipeAllowed("blocked-agent", config)).toBe(false);
    expect(isRecipeAllowed("other-agent", config)).toBe(true);
  });

  it("supports glob patterns in denylist", () => {
    const config: RecipesConfig = { deny: ["experimental-*"] };
    expect(isRecipeAllowed("experimental-alpha", config)).toBe(false);
    expect(isRecipeAllowed("experimental-beta", config)).toBe(false);
    expect(isRecipeAllowed("production-agent", config)).toBe(true);
  });

  it("only allows recipes on the allowlist", () => {
    const config: RecipesConfig = { allow: ["demand-drafter", "lien-analyst"] };
    expect(isRecipeAllowed("demand-drafter", config)).toBe(true);
    expect(isRecipeAllowed("lien-analyst", config)).toBe(true);
    expect(isRecipeAllowed("other-agent", config)).toBe(false);
  });

  it("deny takes precedence over allow", () => {
    const config: RecipesConfig = {
      allow: ["demand-*"],
      deny: ["demand-experimental"],
    };
    expect(isRecipeAllowed("demand-drafter", config)).toBe(true);
    expect(isRecipeAllowed("demand-experimental", config)).toBe(false);
  });

  it("supports wildcard allow", () => {
    const config: RecipesConfig = { allow: ["*"] };
    expect(isRecipeAllowed("anything", config)).toBe(true);
  });

  it("supports glob patterns in allowlist", () => {
    const config: RecipesConfig = { allow: ["legal-*"] };
    expect(isRecipeAllowed("legal-demand", config)).toBe(true);
    expect(isRecipeAllowed("legal-lien", config)).toBe(true);
    expect(isRecipeAllowed("marketing-agent", config)).toBe(false);
  });
});
