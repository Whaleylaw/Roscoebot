import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { WorkflowTemplateFrontmatterSchema } from "./template-schema.js";
import { writeFileAtomic } from "./scaffold.js";

/** Options for saving a synthesized workflow as a reusable template. */
export type SaveAsTemplateOpts = {
  name: string;
  description: string;
  tier: "project" | "global";
  projectDir: string | null;
  sourceContent: string;
  overwrite?: boolean;
};

/** Result of a save-as-template operation. */
export type SaveAsTemplateResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Workflow-instance fields that should be stripped when converting
 * a synthesized workflow to a reusable template.
 */
const STRIP_FIELDS = new Set([
  "id",
  "status",
  "tasks",
  "created",
  "updated",
  "goal",
  "goal_check",
  "template",
]);

/**
 * Extracts raw YAML content between opening and closing `---` fences.
 * Duplicated for module independence (same pattern as template-schema.ts).
 */
function extractYamlBlock(content: string): string | undefined {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("---")) {
    return undefined;
  }
  const endIndex = normalized.indexOf("\n---", 3);
  if (endIndex === -1) {
    return undefined;
  }
  return normalized.slice(4, endIndex);
}

/**
 * Extracts the markdown body after the frontmatter fences.
 */
function extractBody(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("---")) {
    return normalized;
  }
  const endIndex = normalized.indexOf("\n---", 3);
  if (endIndex === -1) {
    return normalized;
  }
  // Skip past the closing "---\n"
  return normalized.slice(endIndex + 4).trimStart();
}

/**
 * Saves a synthesized workflow as a reusable template by stripping
 * project-specific values and writing to the appropriate tier directory.
 *
 * Per D-22: invoked after a synthesized workflow completes successfully.
 * The agent offers to save and the user confirms.
 */
export async function saveAsTemplate(opts: SaveAsTemplateOpts): Promise<SaveAsTemplateResult> {
  // Validate tier/projectDir combination
  if (opts.tier === "project" && opts.projectDir == null) {
    return { ok: false, error: "projectDir required for project-tier template" };
  }

  // Determine target directory
  const targetDir =
    opts.tier === "project"
      ? path.join(opts.projectDir!, "templates")
      : path.join(os.homedir(), ".openclaw", "templates");

  // Ensure target directory exists
  await fs.mkdir(targetDir, { recursive: true });

  const targetPath = path.join(targetDir, `${opts.name}.md`);

  // Check for existing file unless overwrite is set
  if (!opts.overwrite) {
    try {
      await fs.access(targetPath);
      return { ok: false, error: `Template already exists: ${targetPath}` };
    } catch {
      // File does not exist -- good, proceed
    }
  }

  // Parse source frontmatter
  const yamlBlock = extractYamlBlock(opts.sourceContent);
  let sourceData: Record<string, unknown> = {};
  if (yamlBlock !== undefined) {
    try {
      const parsed = YAML.parse(yamlBlock, { schema: "core" });
      if (parsed != null && typeof parsed === "object") {
        sourceData = parsed as Record<string, unknown>;
      }
    } catch {
      // If YAML parse fails, continue with empty source data
    }
  }

  // Build template frontmatter: keep template-relevant fields, strip instance fields
  const templateData: Record<string, unknown> = {};

  // Override name and description from opts
  templateData.name = opts.name;
  templateData.description = opts.description;

  // Carry over template-relevant fields from source
  for (const [key, value] of Object.entries(sourceData)) {
    if (STRIP_FIELDS.has(key)) continue;
    if (key === "name" || key === "description") continue; // already set from opts
    templateData[key] = value;
  }

  // Validate through schema
  const validation = WorkflowTemplateFrontmatterSchema.safeParse(templateData);
  if (!validation.success) {
    const issues = validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { ok: false, error: `Template validation failed: ${issues}` };
  }

  // Serialize
  const body = extractBody(opts.sourceContent);
  const yamlStr = YAML.stringify(validation.data, { schema: "core" });
  const content = `---\n${yamlStr}---\n\n${body}`;

  // Write atomically
  await writeFileAtomic(targetPath, content);

  return { ok: true, path: targetPath };
}
