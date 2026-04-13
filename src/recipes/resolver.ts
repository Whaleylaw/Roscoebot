import type { AgentConfig } from "../config/types.agents.js";

import type { RecipeCard, RecipesConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Synthesize an AgentConfig from a RecipeCard
// ---------------------------------------------------------------------------

/**
 * Create a virtual `AgentConfig` from a parsed recipe card.
 *
 * The returned config is suitable for injection into the existing agent
 * resolution pipeline — it can be used anywhere a regular `AgentConfig`
 * is expected (system prompt building, tool policy, sandbox resolution, etc.).
 *
 * Recipe-specific defaults from `recipesConfig.defaults` are applied as
 * fallbacks (card-level values always win).
 */
export function synthesizeAgentConfig(
  recipe: RecipeCard,
  recipesConfig?: RecipesConfig,
): AgentConfig {
  const defaults = recipesConfig?.defaults;

  const config: AgentConfig = {
    id: recipe.id,
    name: recipe.name,

    // Model: recipe → defaults
    model: recipe.model ?? defaults?.model,

    // Thinking: recipe → defaults
    thinkingDefault: (recipe.thinking ?? defaults?.thinking) as AgentConfig["thinkingDefault"],

    // Identity
    identity: recipe.identity,

    // Tools: recipe → defaults
    tools: recipe.tools ?? defaults?.tools,

    // Skills
    skills: recipe.skills,

    // Sandbox: recipe → defaults
    sandbox: recipe.sandbox ?? defaults?.sandbox,

    // Subagent constraints from recipe-specific fields
    subagents:
      recipe.max_children !== undefined
        ? {
            // If max_children is 0, the recipe agent is a leaf — cannot spawn.
            // We signal this by *not* allowing any agents.
            ...(recipe.max_children === 0 ? { allowAgents: [] } : {}),
          }
        : undefined,
  };

  return config;
}

// ---------------------------------------------------------------------------
// Workspace overlay — in-memory virtual workspace files
// ---------------------------------------------------------------------------

/**
 * A virtual workspace file provider.
 *
 * The system prompt builder reads SOUL.md, AGENTS.md, etc. from the agent's
 * workspace directory.  For recipe agents, these files don't exist on disk —
 * they come from the recipe card's markdown sections.
 *
 * The overlay intercepts file reads and returns section content for files
 * defined in the recipe.  For files not in the recipe, it returns `undefined`
 * so the caller can fall through to the physical workspace.
 */
export type WorkspaceOverlay = {
  /** Returns content for a workspace file, or `undefined` to fall through to disk. */
  readFile(filename: string): string | undefined;
  /** List of virtual files this overlay provides. */
  files(): string[];
};

/** Mapping from recipe section names to workspace filenames. */
const SECTION_TO_FILE: Record<string, string> = {
  soul: "SOUL.md",
  agents: "AGENTS.md",
  tools: "TOOLS.md",
  user: "USER.md",
  identity: "IDENTITY.md",
};

const FILE_TO_SECTION: Record<string, string> = Object.fromEntries(
  Object.entries(SECTION_TO_FILE).map(([k, v]) => [v, k]),
);

/**
 * Create a workspace overlay from a recipe card's sections.
 */
export function createRecipeOverlay(recipe: RecipeCard): WorkspaceOverlay {
  const map = new Map<string, string>();

  for (const [sectionName, filename] of Object.entries(SECTION_TO_FILE)) {
    const content = recipe.sections[sectionName as keyof typeof recipe.sections];
    if (content) {
      map.set(filename, content);
      // Also support lowercase lookups.
      map.set(filename.toLowerCase(), content);
    }
  }

  return {
    readFile(filename: string): string | undefined {
      return map.get(filename) ?? map.get(filename.toLowerCase());
    },
    files(): string[] {
      // Return canonical filenames only (not lowercase duplicates).
      return [...new Set([...map.keys()].filter((k) => k.includes(".")))].filter(
        (k) => k === k.toUpperCase() || k.endsWith(".md"),
      );
    },
  };
}
