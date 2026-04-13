import type { AgentModelConfig, AgentSandboxConfig } from "../config/types.agents-shared.js";
import type { IdentityConfig } from "../config/types.base.js";
import type { AgentToolsConfig } from "../config/types.tools.js";

// ---------------------------------------------------------------------------
// Recipe card — parsed from a markdown file with YAML frontmatter
// ---------------------------------------------------------------------------

/**
 * Named markdown sections extracted from the recipe card body.
 * Each section maps to a workspace bootstrap file (SOUL.md, AGENTS.md, etc.).
 */
export type RecipeCardSections = {
  /** `# SOUL` — persona, boundaries, voice (maps to SOUL.md). */
  soul?: string;
  /** `# AGENTS` — operating instructions, memory rules, red lines (maps to AGENTS.md). */
  agents?: string;
  /** `# TOOLS` — tool usage guidance (maps to TOOLS.md). */
  tools?: string;
  /** `# USER` — who the requester/user is (maps to USER.md). */
  user?: string;
  /** `# IDENTITY` — structured identity fields (maps to IDENTITY.md). */
  identity?: string;
};

/** A section heading recognised in recipe card markdown bodies. */
export type RecipeSectionName = keyof RecipeCardSections;

/**
 * Fully parsed recipe card.
 *
 * The YAML frontmatter provides structured agent configuration (model, tools,
 * identity, sandbox, etc.).  The markdown body provides free-form content that
 * maps to workspace bootstrap files (SOUL.md, AGENTS.md, …).
 */
export type RecipeCard = {
  // -- metadata -----------------------------------------------------------------
  /** Unique recipe identifier — derived from filename stem unless overridden. */
  id: string;
  /** Human-readable display name. */
  name?: string;
  /** Short description of what this recipe agent does. */
  description?: string;
  /** Card format version. */
  version?: number;

  // -- agent config (subset of AgentConfig) -------------------------------------
  /** Model config — string slug or `{primary, fallbacks[]}`. */
  model?: AgentModelConfig;
  /** Default thinking level for the recipe agent. */
  thinking?: string;
  /** Agent identity (name, emoji, theme, avatar). */
  identity?: IdentityConfig;
  /** Tool access policy. */
  tools?: AgentToolsConfig;
  /** Skills allowlist. */
  skills?: string[];
  /** Sandbox configuration. */
  sandbox?: AgentSandboxConfig;

  // -- recipe-specific fields ---------------------------------------------------
  /** Workspace template directory name (copied to child workspace on spawn). */
  workspace_template?: string;
  /** Run timeout in seconds. */
  timeout_seconds?: number;
  /** Max child subagents this recipe agent can spawn (0 = leaf). */
  max_children?: number;
  /** Session cleanup policy after completion. */
  cleanup?: "delete" | "keep";

  // -- parsed markdown sections -------------------------------------------------
  /** Named markdown sections from the card body. */
  sections: RecipeCardSections;

  // -- source metadata ----------------------------------------------------------
  /** Absolute path to the source `.md` file. */
  sourcePath: string;
};

// ---------------------------------------------------------------------------
// Recipes configuration — top-level config in openclaw.json
// ---------------------------------------------------------------------------

/**
 * Default values applied to all recipe cards.  Recipe-card-level values
 * take precedence over these defaults.
 */
export type RecipeDefaultsConfig = {
  /** Default model for recipe agents. */
  model?: AgentModelConfig;
  /** Default thinking level. */
  thinking?: string;
  /** Default tool policy. */
  tools?: AgentToolsConfig;
  /** Default sandbox config. */
  sandbox?: AgentSandboxConfig;
  /** Default cleanup policy. */
  cleanup?: "delete" | "keep";
  /** Default run timeout (seconds). */
  timeout_seconds?: number;
};

/**
 * Top-level `recipes` configuration block in `openclaw.json`.
 */
export type RecipesConfig = {
  /** Directories to scan for recipe card `.md` files. */
  dirs?: string[];
  /** Recipe ID allowlist (omit = all allowed). */
  allow?: string[];
  /** Recipe ID denylist (glob patterns supported). */
  deny?: string[];
  /** Default values applied to all recipe cards. */
  defaults?: RecipeDefaultsConfig;
};
