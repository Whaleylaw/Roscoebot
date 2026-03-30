import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getBundledTemplate, listBundledTemplates } from "./template-bundled.js";
import { parseTemplateFrontmatter } from "./template-schema.js";
import type { WorkflowTemplateFrontmatter } from "./template-schema.js";

/** A fully resolved template with content, parsed frontmatter, and origin tier. */
export type ResolvedTemplate = {
  name: string;
  tier: "project" | "global" | "bundled";
  content: string;
  frontmatter: WorkflowTemplateFrontmatter;
};

/** Summary entry for listing templates across tiers. */
export type TemplateSummary = {
  name: string;
  description: string;
  tier: "project" | "global" | "bundled";
};

/**
 * Attempts to read and parse a template file at the given path.
 * Returns null on ENOENT or parse failure.
 */
async function tryReadTemplate(
  filePath: string,
): Promise<{ content: string; frontmatter: WorkflowTemplateFrontmatter } | null> {
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    // Gracefully handle missing file or directory
    if (err != null && typeof err === "object" && "code" in err && (err as { code: string }).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  const result = parseTemplateFrontmatter(content, filePath);
  if (!result.success) {
    return null;
  }

  return { content, frontmatter: result.data };
}

/** Returns the global templates directory path (~/.openclaw/templates). */
function getGlobalTemplatesDir(): string {
  return path.join(os.homedir(), ".openclaw", "templates");
}

/**
 * Resolves a template by name across three tiers in precedence order:
 * 1. Project-local ({projectDir}/templates/{name}.md)
 * 2. Global (~/.openclaw/templates/{name}.md)
 * 3. Bundled (shipped with the package)
 *
 * Returns the first match with tier annotation, or null if not found in any tier.
 */
export async function resolveTemplate(
  templateName: string,
  projectDir: string | null,
): Promise<ResolvedTemplate | null> {
  // Tier 1: project-local
  if (projectDir != null) {
    const filePath = path.join(projectDir, "templates", `${templateName}.md`);
    const result = await tryReadTemplate(filePath);
    if (result != null) {
      return { name: templateName, tier: "project", ...result };
    }
  }

  // Tier 2: global
  const globalPath = path.join(getGlobalTemplatesDir(), `${templateName}.md`);
  const globalResult = await tryReadTemplate(globalPath);
  if (globalResult != null) {
    return { name: templateName, tier: "global", ...globalResult };
  }

  // Tier 3: bundled
  const bundled = getBundledTemplate(templateName);
  if (bundled != null) {
    const parsed = parseTemplateFrontmatter(bundled.content);
    if (parsed.success) {
      return {
        name: templateName,
        tier: "bundled",
        content: bundled.content,
        frontmatter: parsed.data,
      };
    }
  }

  return null;
}

/**
 * Lists all available templates across all three tiers.
 * Higher-precedence tiers shadow lower ones when names collide.
 * Results are sorted alphabetically by name.
 */
export async function listAllTemplates(projectDir: string | null): Promise<TemplateSummary[]> {
  const seen = new Set<string>();
  const results: TemplateSummary[] = [];

  // Helper to scan a directory for .md template files
  async function scanDir(dir: string, tier: "project" | "global"): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch (err: unknown) {
      // Missing directory is fine -- skip
      if (err != null && typeof err === "object" && "code" in err && (err as { code: string }).code === "ENOENT") {
        return;
      }
      throw err;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const name = entry.slice(0, -3);
      if (seen.has(name)) continue;

      const filePath = path.join(dir, entry);
      const parsed = await tryReadTemplate(filePath);
      if (parsed != null) {
        seen.add(name);
        results.push({
          name,
          description: parsed.frontmatter.description,
          tier,
        });
      }
    }
  }

  // Tier 1: project-local (highest precedence)
  if (projectDir != null) {
    await scanDir(path.join(projectDir, "templates"), "project");
  }

  // Tier 2: global
  await scanDir(getGlobalTemplatesDir(), "global");

  // Tier 3: bundled (lowest precedence)
  for (const entry of listBundledTemplates()) {
    if (!seen.has(entry.name)) {
      seen.add(entry.name);
      results.push({ name: entry.name, description: entry.description, tier: "bundled" });
    }
  }

  // Sort alphabetically by name
  results.sort((a, b) => a.name.localeCompare(b.name));

  return results;
}
