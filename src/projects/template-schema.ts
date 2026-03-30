import YAML from "yaml";
import { z } from "zod";
import type { ParseResult } from "./types.js";

/**
 * Schema for a single workflow template parameter definition.
 */
export const WorkflowTemplateParamSchema = z.object({
  type: z.enum(["string", "string[]", "boolean", "number"]),
  description: z.string().optional(),
  required: z.boolean().default(true),
  default: z.unknown().optional(),
});

/**
 * Schema for a single workflow template step.
 * Steps define the high-level phases of a workflow, with ordering via depends_on.
 */
export const WorkflowTemplateStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  owner: z.enum(["agent", "user", "mixed"]).default("agent"),
  description: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  depends_on: z.array(z.string()).default([]),
  verification_type: z.enum(["automatic", "human", "external", "mixed"]).default("automatic"),
  side_effect_class: z.enum(["none", "reversible", "irreversible"]).default("none"),
});

/**
 * Schema for workflow template frontmatter.
 * Used for both bundled templates and synthesized workflows (D-16/D-21: one schema for both).
 * Accommodates rigid/procedural templates (steps with fixed sequence) and
 * structural/flexible templates (steps as guidelines) per D-12.
 */
export const WorkflowTemplateFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  params: z.record(z.string(), WorkflowTemplateParamSchema).default({}),
  related_skills: z.array(z.string()).default([]),
  related_tools: z.array(z.string()).default([]),
  templates: z.array(z.string()).default([]),
  triggered_by: z.array(z.string()).default([]),
  repeatable: z.boolean().default(false),
  per_item: z.string().nullable().default(null),
  prerequisites: z.array(z.string()).default([]),
  steps: z.array(WorkflowTemplateStepSchema).default([]),
});

export type WorkflowTemplateParam = z.infer<typeof WorkflowTemplateParamSchema>;
export type WorkflowTemplateStep = z.infer<typeof WorkflowTemplateStepSchema>;
export type WorkflowTemplateFrontmatter = z.infer<typeof WorkflowTemplateFrontmatterSchema>;

/**
 * Extracts raw YAML content between opening and closing `---` fences.
 * Duplicated from frontmatter.ts to maintain module independence.
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
 * Parses template frontmatter from a markdown string and validates against
 * WorkflowTemplateFrontmatterSchema.
 *
 * Follows the same extractYamlBlock + Zod parse + error mapping pattern
 * as parseWorkflowFrontmatter in frontmatter.ts.
 */
export function parseTemplateFrontmatter(
  raw: string,
  filePath = "<inline>",
): ParseResult<WorkflowTemplateFrontmatter> {
  const block = extractYamlBlock(raw);
  if (block === undefined) {
    return {
      success: false,
      error: {
        filePath,
        message: "No frontmatter block found",
        issues: [],
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(block, { schema: "core" });
  } catch (err: unknown) {
    let line: number | undefined;
    let message = "Unknown YAML error";
    if (err instanceof Error) {
      message = err.message;
    }
    if (
      err != null &&
      typeof err === "object" &&
      "linePos" in err &&
      Array.isArray((err as Record<string, unknown>).linePos)
    ) {
      const linePos = (err as Record<string, unknown>).linePos as Array<{
        line: number;
      }>;
      if (linePos.length > 0) {
        line = linePos[0].line;
      }
    }
    return {
      success: false,
      error: {
        filePath,
        message: `YAML parse error: ${message}`,
        issues: [{ path: "", message, line }],
      },
    };
  }

  const data = parsed ?? {};

  const result = WorkflowTemplateFrontmatterSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return {
      success: false,
      error: {
        filePath,
        message: "Schema validation failed",
        issues,
      },
    };
  }

  return { success: true, data: result.data };
}
