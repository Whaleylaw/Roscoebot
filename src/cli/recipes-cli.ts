import type { Command } from "commander";
import { loadConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import {
  loadAllRecipes,
  loadRecipeById,
  isRecipeAllowed,
  validateRecipeCard,
  resolveRecipeDirs,
} from "../recipes/index.js";
import { defaultRuntime } from "../runtime.js";
import { theme } from "../terminal/theme.js";

/**
 * Register the recipes CLI commands.
 */
export function registerRecipesCli(program: Command) {
  const recipes = program
    .command("recipes")
    .description("List, inspect, and validate recipe cards");

  // -------------------------------------------------------------------------
  // recipes list
  // -------------------------------------------------------------------------
  recipes
    .command("list")
    .description("List available recipe cards")
    .option("--json", "Output as JSON", false)
    .action(async (opts: { json?: boolean }) => {
      try {
        const cfg = loadConfig();
        const stateDir = resolveStateDir(process.env);
        const cards = await loadAllRecipes(cfg.recipes, stateDir);
        const allowed = cards.filter((card) => isRecipeAllowed(card.id, cfg.recipes));

        if (opts.json) {
          defaultRuntime.writeJson({
            count: allowed.length,
            recipes: allowed.map((card) => ({
              id: card.id,
              name: card.name,
              description: card.description,
              model: card.model,
              skills: card.skills,
              sourcePath: card.sourcePath,
            })),
          });
          return;
        }

        if (allowed.length === 0) {
          const dirs = resolveRecipeDirs(cfg.recipes, stateDir);
          defaultRuntime.log(
            `No recipe cards found.\nRecipe directories: ${dirs.join(", ")}`,
          );
          return;
        }

        const lines: string[] = [];
        lines.push(theme.heading(`Recipe Cards (${allowed.length})`));
        lines.push("");
        for (const card of allowed) {
          const nameStr = card.name ? ` — ${card.name}` : "";
          const descStr = card.description ? `  ${theme.muted(card.description)}` : "";
          const modelStr = card.model
            ? `  ${theme.muted(`model: ${typeof card.model === "string" ? card.model : card.model.primary ?? "default"}`)}`
            : "";
          lines.push(`  ${theme.command(card.id)}${nameStr}`);
          if (descStr) lines.push(descStr);
          if (modelStr) lines.push(modelStr);
          lines.push("");
        }
        defaultRuntime.log(lines.join("\n"));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // recipes show <id>
  // -------------------------------------------------------------------------
  recipes
    .command("show")
    .description("Show full details of a recipe card")
    .argument("<id>", "Recipe card ID")
    .option("--json", "Output as JSON", false)
    .option("--raw", "Show raw markdown source", false)
    .action(async (id: string, opts: { json?: boolean; raw?: boolean }) => {
      try {
        const cfg = loadConfig();
        const stateDir = resolveStateDir(process.env);
        const card = await loadRecipeById(id, cfg.recipes, stateDir);

        if (!card) {
          defaultRuntime.error(`Recipe not found: "${id}"`);
          defaultRuntime.exit(1);
          return;
        }

        if (opts.raw) {
          const { readFile } = await import("node:fs/promises");
          const raw = await readFile(card.sourcePath, "utf-8");
          defaultRuntime.writeStdout(raw);
          return;
        }

        if (opts.json) {
          defaultRuntime.writeJson({
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
            timeout_seconds: card.timeout_seconds,
            max_children: card.max_children,
            cleanup: card.cleanup,
            sections: Object.fromEntries(
              Object.entries(card.sections).map(([k, v]) => [k, v ? `${v.slice(0, 200)}...` : null]),
            ),
            sourcePath: card.sourcePath,
          });
          return;
        }

        const lines: string[] = [];
        lines.push(theme.heading(`Recipe: ${card.id}`));
        if (card.name) lines.push(`  Name: ${card.name}`);
        if (card.description) lines.push(`  Description: ${card.description}`);
        if (card.version) lines.push(`  Version: ${card.version}`);
        lines.push(`  Source: ${card.sourcePath}`);
        lines.push("");

        if (card.model) {
          const modelStr =
            typeof card.model === "string" ? card.model : card.model.primary ?? "default";
          lines.push(`  Model: ${modelStr}`);
        }
        if (card.thinking) lines.push(`  Thinking: ${card.thinking}`);
        if (card.identity) {
          lines.push(
            `  Identity: ${card.identity.emoji ?? ""} ${card.identity.name ?? ""} (${card.identity.theme ?? ""})`.trim(),
          );
        }
        if (card.tools) {
          lines.push(`  Tools: profile=${card.tools.profile ?? "default"}`);
          if (card.tools.allow) lines.push(`    allow: ${card.tools.allow.join(", ")}`);
          if (card.tools.deny) lines.push(`    deny: ${card.tools.deny.join(", ")}`);
        }
        if (card.skills) lines.push(`  Skills: ${card.skills.join(", ")}`);
        if (card.timeout_seconds) lines.push(`  Timeout: ${card.timeout_seconds}s`);
        if (card.max_children !== undefined) lines.push(`  Max children: ${card.max_children}`);
        if (card.cleanup) lines.push(`  Cleanup: ${card.cleanup}`);
        lines.push("");

        // Section previews
        for (const [section, content] of Object.entries(card.sections)) {
          if (!content) continue;
          lines.push(theme.heading(`  # ${section.toUpperCase()}`));
          const preview = content.slice(0, 300);
          lines.push(`  ${preview}${content.length > 300 ? "..." : ""}`);
          lines.push("");
        }

        defaultRuntime.log(lines.join("\n"));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // recipes validate <id>
  // -------------------------------------------------------------------------
  recipes
    .command("validate")
    .description("Validate a recipe card")
    .argument("<id>", "Recipe card ID")
    .option("--json", "Output as JSON", false)
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        const cfg = loadConfig();
        const stateDir = resolveStateDir(process.env);
        const card = await loadRecipeById(id, cfg.recipes, stateDir);

        if (!card) {
          defaultRuntime.error(`Recipe not found: "${id}"`);
          defaultRuntime.exit(1);
          return;
        }

        const result = validateRecipeCard(card);

        if (opts.json) {
          defaultRuntime.writeJson(result);
          return;
        }

        if (result.valid && result.warnings.length === 0) {
          defaultRuntime.log(theme.success(`✓ Recipe "${id}" is valid.`));
          return;
        }

        const lines: string[] = [];
        if (result.valid) {
          lines.push(theme.success(`✓ Recipe "${id}" is valid (with warnings).`));
        } else {
          lines.push(theme.warn(`✗ Recipe "${id}" has validation errors.`));
        }
        for (const issue of result.issues) {
          lines.push(`  ${theme.warn("ERROR")} ${issue.path}: ${issue.message}`);
        }
        for (const warning of result.warnings) {
          lines.push(`  ${theme.muted("WARN")} ${warning.path}: ${warning.message}`);
        }
        defaultRuntime.log(lines.join("\n"));

        if (!result.valid) {
          defaultRuntime.exit(1);
        }
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // recipes (default action — list)
  // -------------------------------------------------------------------------
  recipes.action(async () => {
    // Default to list when no subcommand.
    await recipes.commands.find((cmd) => cmd.name() === "list")?.parseAsync([], { from: "user" });
  });
}
