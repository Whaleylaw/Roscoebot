import { z } from "zod";

import type { RecipeCard, RecipesConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Zod schema for recipe card frontmatter
// ---------------------------------------------------------------------------

/** Model config: string slug or `{primary, fallbacks[]}`. */
const RecipeModelSchema = z.union([
  z.string(),
  z
    .object({
      primary: z.string().optional(),
      fallbacks: z.array(z.string()).optional(),
    })
    .strict(),
]);

const RecipeIdentitySchema = z
  .object({
    name: z.string().optional(),
    emoji: z.string().optional(),
    theme: z.string().optional(),
    avatar: z.string().optional(),
  })
  .strict()
  .optional();

const RecipeToolsSchema = z
  .object({
    profile: z.string().optional(),
    allow: z.array(z.string()).optional(),
    alsoAllow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
  })
  .strict()
  .optional();

const RecipeSandboxSchema = z
  .object({
    mode: z.string().optional(),
    workspaceAccess: z.string().optional(),
    scope: z.string().optional(),
    backend: z.string().optional(),
  })
  .strict()
  .optional();

/**
 * Schema for the YAML frontmatter of a recipe card.
 * Intentionally lenient — unknown keys are stripped rather than errored.
 */
export const RecipeFrontmatterSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "id must be lowercase alphanumeric with hyphens/underscores").optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    version: z.number().int().positive().optional(),

    model: RecipeModelSchema.optional(),
    thinking: z.string().optional(),
    identity: RecipeIdentitySchema,
    tools: RecipeToolsSchema,
    skills: z.array(z.string()).optional(),
    sandbox: RecipeSandboxSchema,

    workspace_template: z.string().optional(),
    timeout_seconds: z.number().positive().optional(),
    max_children: z.number().int().min(0).optional(),
    cleanup: z.enum(["delete", "keep"]).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export type RecipeValidationIssue = {
  path: string;
  message: string;
};

export type RecipeValidationResult = {
  valid: boolean;
  issues: RecipeValidationIssue[];
  warnings: RecipeValidationIssue[];
};

// ---------------------------------------------------------------------------
// Validate a parsed recipe card
// ---------------------------------------------------------------------------

/**
 * Validate a recipe card's frontmatter and sections.
 * Returns structured issues and warnings.
 */
export function validateRecipeCard(card: RecipeCard): RecipeValidationResult {
  const issues: RecipeValidationIssue[] = [];
  const warnings: RecipeValidationIssue[] = [];

  // Validate id format.
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(card.id)) {
    issues.push({
      path: "id",
      message: `Recipe id "${card.id}" must be lowercase alphanumeric with hyphens/underscores`,
    });
  }

  // Warn if no SOUL section.
  if (!card.sections.soul) {
    warnings.push({
      path: "sections.soul",
      message: "Recipe card has no # SOUL section — agent will have no persona",
    });
  }

  // Warn if no AGENTS section.
  if (!card.sections.agents) {
    warnings.push({
      path: "sections.agents",
      message: "Recipe card has no # AGENTS section — agent will have no operating instructions",
    });
  }

  // Warn if no description.
  if (!card.description) {
    warnings.push({
      path: "description",
      message: "Recipe card has no description — parent agents won't know what it does",
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Validate recipe permissions (allowlist/denylist)
// ---------------------------------------------------------------------------

/**
 * Check whether a recipe ID is permitted by the recipes config.
 * Returns `true` if allowed, `false` if denied.
 */
export function isRecipeAllowed(
  recipeId: string,
  recipesConfig: RecipesConfig | undefined,
): boolean {
  if (!recipesConfig) return true;

  // Check denylist first.
  if (recipesConfig.deny) {
    for (const pattern of recipesConfig.deny) {
      if (matchGlob(recipeId, pattern)) return false;
    }
  }

  // Check allowlist (if specified, only listed recipes are permitted).
  if (recipesConfig.allow) {
    return recipesConfig.allow.some((pattern) => matchGlob(recipeId, pattern));
  }

  return true;
}

// ---------------------------------------------------------------------------
// Minimal glob matcher (supports trailing `*` only)
// ---------------------------------------------------------------------------

function matchGlob(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return value === pattern;
}
