import { Type } from "@sinclair/typebox";
import { loadConfig } from "../../config/config.js";
import { resolveStateDir } from "../../config/paths.js";
import {
  loadAllRecipes,
  loadRecipeById,
  isRecipeAllowed,
  validateRecipeCard,
  parseRecipeCard,
} from "../../recipes/index.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveRecipeDirs } from "../../recipes/loader.js";

// ---------------------------------------------------------------------------
// recipes_list — discover available recipe cards
// ---------------------------------------------------------------------------

const RecipesListToolSchema = Type.Object({});

export function createRecipesListTool(): AnyAgentTool {
  return {
    label: "Recipes",
    name: "recipes_list",
    description:
      "List available recipe cards that can be spawned via sessions_spawn(recipe=\"<id>\"). " +
      "Returns recipe id, name, description, model, and skills for each card.",
    parameters: RecipesListToolSchema,
    execute: async () => {
      const cfg = loadConfig();
      const stateDir = resolveStateDir(process.env);
      const cards = await loadAllRecipes(cfg.recipes, stateDir);
      const allowed = cards.filter((card) => isRecipeAllowed(card.id, cfg.recipes));

      const recipes = allowed.map((card) => ({
        id: card.id,
        name: card.name,
        description: card.description,
        model: card.model,
        thinking: card.thinking,
        skills: card.skills,
        hasSoul: Boolean(card.sections.soul),
        hasAgents: Boolean(card.sections.agents),
        timeout_seconds: card.timeout_seconds,
        max_children: card.max_children,
        cleanup: card.cleanup,
      }));

      return jsonResult({
        count: recipes.length,
        recipes,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// recipes_show — view full recipe card details
// ---------------------------------------------------------------------------

const RecipesShowToolSchema = Type.Object({
  id: Type.String({
    description: "Recipe card ID to show.",
  }),
});

export function createRecipesShowTool(): AnyAgentTool {
  return {
    label: "Recipes",
    name: "recipes_show",
    description:
      "Show full details of a recipe card including its SOUL, AGENTS, and TOOLS sections.",
    parameters: RecipesShowToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const id = readStringParam(params, "id", { required: true });
      const cfg = loadConfig();
      const stateDir = resolveStateDir(process.env);
      const card = await loadRecipeById(id, cfg.recipes, stateDir);

      if (!card) {
        return jsonResult({
          status: "error",
          error: `Recipe not found: "${id}"`,
        });
      }

      if (!isRecipeAllowed(card.id, cfg.recipes)) {
        return jsonResult({
          status: "error",
          error: `Recipe "${card.id}" is blocked by allow/deny config.`,
        });
      }

      return jsonResult({
        id: card.id,
        name: card.name,
        description: card.description,
        version: card.version,
        model: card.model,
        thinking: card.thinking,
        identity: card.identity,
        tools: card.tools,
        skills: card.skills,
        sandbox: card.sandbox,
        workspace_template: card.workspace_template,
        timeout_seconds: card.timeout_seconds,
        max_children: card.max_children,
        cleanup: card.cleanup,
        sections: {
          soul: card.sections.soul ?? null,
          agents: card.sections.agents ?? null,
          tools: card.sections.tools ?? null,
          user: card.sections.user ?? null,
          identity: card.sections.identity ?? null,
        },
        sourcePath: card.sourcePath,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// recipes_create — create a new recipe card
// ---------------------------------------------------------------------------

const RecipesCreateToolSchema = Type.Object({
  id: Type.String({
    description:
      "Unique recipe ID (lowercase, hyphens/underscores). Becomes the filename: {id}.md",
  }),
  name: Type.String({
    description: "Human-readable display name for the recipe agent.",
  }),
  description: Type.String({
    description: "Short description of what this recipe agent does.",
  }),
  soul: Type.String({
    description:
      "The SOUL content — persona, boundaries, voice. This becomes the agent's identity.",
  }),
  agents: Type.String({
    description:
      "The AGENTS content — operating instructions, output format, red lines.",
  }),
  model: Type.Optional(
    Type.String({
      description: "Model slug (e.g. 'openai-codex/gpt-5.4'). Omit to use defaults.",
    }),
  ),
  thinking: Type.Optional(
    Type.String({
      description: "Thinking level (off, minimal, low, medium, high).",
    }),
  ),
  tools_guidance: Type.Optional(
    Type.String({
      description: "Optional TOOLS section — tool usage guidance for the agent.",
    }),
  ),
  tools_profile: Type.Optional(
    Type.String({
      description: "Tool access profile (minimal, coding, messaging, full).",
    }),
  ),
  tools_allow: Type.Optional(
    Type.Array(Type.String(), {
      description: "Explicit tool allowlist.",
    }),
  ),
  tools_deny: Type.Optional(
    Type.Array(Type.String(), {
      description: "Tool denylist.",
    }),
  ),
  skills: Type.Optional(
    Type.Array(Type.String(), {
      description: "Skills allowlist for the recipe agent.",
    }),
  ),
  timeout_seconds: Type.Optional(
    Type.Number({
      description: "Run timeout in seconds.",
      minimum: 0,
    }),
  ),
  max_children: Type.Optional(
    Type.Number({
      description: "Max child subagents (0 = leaf agent, cannot spawn).",
      minimum: 0,
    }),
  ),
  cleanup: Type.Optional(
    Type.String({
      description: "Session cleanup after completion: 'delete' or 'keep'.",
    }),
  ),
});

export function createRecipesCreateTool(): AnyAgentTool {
  return {
    label: "Recipes",
    name: "recipes_create",
    description:
      "Create a new recipe card. Recipe cards define ephemeral specialized agents that can be " +
      "spawned via sessions_spawn(recipe=\"<id>\").",
    parameters: RecipesCreateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const id = readStringParam(params, "id", { required: true });
      const name = readStringParam(params, "name", { required: true });
      const description = readStringParam(params, "description", { required: true });
      const soul = readStringParam(params, "soul", { required: true });
      const agents = readStringParam(params, "agents", { required: true });
      const model = readStringParam(params, "model");
      const thinking = readStringParam(params, "thinking");
      const toolsGuidance = readStringParam(params, "tools_guidance");
      const toolsProfile = readStringParam(params, "tools_profile");
      const toolsAllow = Array.isArray(params.tools_allow)
        ? (params.tools_allow as string[])
        : undefined;
      const toolsDeny = Array.isArray(params.tools_deny)
        ? (params.tools_deny as string[])
        : undefined;
      const skills = Array.isArray(params.skills) ? (params.skills as string[]) : undefined;
      const timeoutSeconds =
        typeof params.timeout_seconds === "number" ? params.timeout_seconds : undefined;
      const maxChildren =
        typeof params.max_children === "number" ? params.max_children : undefined;
      const cleanup =
        params.cleanup === "delete" || params.cleanup === "keep" ? params.cleanup : undefined;

      // Validate the id format.
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
        return jsonResult({
          status: "error",
          error: `Invalid recipe id "${id}". Must be lowercase alphanumeric with hyphens/underscores.`,
        });
      }

      // Check if recipe already exists.
      const cfg = loadConfig();
      const stateDir = resolveStateDir(process.env);
      const existing = await loadRecipeById(id, cfg.recipes, stateDir);
      if (existing) {
        return jsonResult({
          status: "error",
          error: `Recipe "${id}" already exists at ${existing.sourcePath}`,
        });
      }

      // Build the recipe card markdown.
      const frontmatterLines: string[] = [];
      frontmatterLines.push(`id: ${id}`);
      frontmatterLines.push(`name: ${name}`);
      frontmatterLines.push(`description: ${description}`);
      frontmatterLines.push(`version: 1`);
      if (model) frontmatterLines.push(`\nmodel: ${model}`);
      if (thinking) frontmatterLines.push(`thinking: ${thinking}`);

      // Tools config
      const hasToolsConfig = toolsProfile || toolsAllow || toolsDeny;
      if (hasToolsConfig) {
        frontmatterLines.push(`\ntools:`);
        if (toolsProfile) frontmatterLines.push(`  profile: ${toolsProfile}`);
        if (toolsAllow && toolsAllow.length > 0) {
          frontmatterLines.push(`  allow:`);
          for (const t of toolsAllow) frontmatterLines.push(`    - ${t}`);
        }
        if (toolsDeny && toolsDeny.length > 0) {
          frontmatterLines.push(`  deny:`);
          for (const t of toolsDeny) frontmatterLines.push(`    - ${t}`);
        }
      }

      if (skills && skills.length > 0) {
        frontmatterLines.push(`\nskills:`);
        for (const s of skills) frontmatterLines.push(`  - ${s}`);
      }

      if (timeoutSeconds !== undefined) frontmatterLines.push(`\ntimeout_seconds: ${timeoutSeconds}`);
      if (maxChildren !== undefined) frontmatterLines.push(`max_children: ${maxChildren}`);
      if (cleanup) frontmatterLines.push(`cleanup: ${cleanup}`);

      const sections: string[] = [];
      sections.push(`# SOUL\n\n${soul}`);
      sections.push(`# AGENTS\n\n${agents}`);
      if (toolsGuidance) sections.push(`# TOOLS\n\n${toolsGuidance}`);

      const cardContent = `---\n${frontmatterLines.join("\n")}\n---\n\n${sections.join("\n\n---\n\n")}\n`;

      // Write the file.
      const recipeDirs = resolveRecipeDirs(cfg.recipes, stateDir);
      const targetDir = recipeDirs[0]; // Write to the first configured directory.
      await mkdir(targetDir, { recursive: true });
      const filePath = join(targetDir, `${id}.md`);
      await writeFile(filePath, cardContent, "utf-8");

      // Validate what we just wrote.
      const card = parseRecipeCard(cardContent, filePath);
      const validation = validateRecipeCard(card);

      return jsonResult({
        status: "created",
        id: card.id,
        name: card.name,
        path: filePath,
        validation: {
          valid: validation.valid,
          issues: validation.issues,
          warnings: validation.warnings,
        },
      });
    },
  };
}
