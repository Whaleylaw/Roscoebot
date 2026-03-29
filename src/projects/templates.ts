import YAML from "yaml";
import {
  ProjectFrontmatterSchema,
  QueueFrontmatterSchema,
  TaskFrontmatterSchema,
  WorkflowFrontmatterSchema,
} from "./schemas.js";
import type { TaskMdBody } from "./types.js";

/**
 * Generate PROJECT.md content with valid YAML frontmatter and defaults
 * filled by the Zod schema (columns, dashboard widgets, status).
 */
export function generateProjectMd(opts: {
  name: string;
  description?: string;
  owner?: string;
}): string {
  const today = new Date().toISOString().split("T")[0];
  const data = ProjectFrontmatterSchema.parse({
    name: opts.name,
    description: opts.description,
    owner: opts.owner,
    created: today,
    updated: today,
  });

  const yaml = YAML.stringify(data, { schema: "core" });
  const desc = opts.description ?? "";
  return `---\n${yaml}---\n\n# ${opts.name}\n\n${desc}\n`;
}

/**
 * Generate queue.md content with frontmatter and four empty section headings:
 * Available, Claimed, Done, Blocked.
 */
export function generateQueueMd(): string {
  const today = new Date().toISOString().split("T")[0];
  const data = QueueFrontmatterSchema.parse({ updated: today });

  const yaml = YAML.stringify(data, { schema: "core" });
  return `---\n${yaml}---\n\n## Available\n\n## Claimed\n\n## Done\n\n## Blocked\n`;
}

/**
 * Generate WF-NNN.md content with valid YAML frontmatter and structured body.
 * Body sections: ## Goal, ## Steps, ## Notes (per D-02).
 */
export function generateWorkflowMd(opts: {
  id: string;
  title: string;
  goal: string;
  tasks?: string[];
  template?: string;
  goalCheck?: string;
}): string {
  const today = new Date().toISOString().split("T")[0];
  const data = WorkflowFrontmatterSchema.parse({
    id: opts.id,
    title: opts.title,
    goal: opts.goal,
    tasks: opts.tasks ?? [],
    template: opts.template ?? null,
    goal_check: opts.goalCheck ?? null,
    created: today,
    updated: today,
  });

  const yaml = YAML.stringify(data, { schema: "core" });
  return `---\n${yaml}---\n\n## Goal\n\n${opts.goal}\n\n## Steps\n\n## Notes\n`;
}

/**
 * Generate TASK-NNN.md content with valid YAML frontmatter and 5 DEC-02 body sections:
 * Objective, Context, Action Guidance, Success Criteria, Verification.
 */
export function generateTaskMd(
  opts: {
    id: string;
    title: string;
    priority?: "low" | "medium" | "high" | "critical";
    capabilities?: string[];
    depends_on?: string[];
    workflow?: string;
    verification_type?: "automatic" | "human" | "external" | "mixed";
    side_effect_class?: "none" | "reversible" | "irreversible";
    approval_required?: boolean;
    estimated_size?: "small" | "medium" | "large";
    parent?: string;
    success_criteria?: Array<{
      type: string;
      path?: string;
      cmd?: string;
      expect?: number;
      output_pattern?: string;
    }>;
  },
  body: TaskMdBody,
): string {
  const today = new Date().toISOString().split("T")[0];
  const data = TaskFrontmatterSchema.parse({
    id: opts.id,
    title: opts.title,
    status: "backlog",
    column: "Backlog",
    priority: opts.priority ?? "medium",
    capabilities: opts.capabilities ?? [],
    depends_on: opts.depends_on ?? [],
    workflow: opts.workflow ?? null,
    verification_type: opts.verification_type ?? "automatic",
    side_effect_class: opts.side_effect_class ?? "none",
    approval_required: opts.approval_required ?? false,
    estimated_size: opts.estimated_size ?? "medium",
    parent: opts.parent ?? null,
    success_criteria: opts.success_criteria ?? [],
    created: today,
    updated: today,
  });

  const yaml = YAML.stringify(data, { schema: "core" });
  return [
    `---\n${yaml}---`,
    "",
    "## Objective",
    "",
    body.objective,
    "",
    "## Context",
    "",
    body.context,
    "",
    "## Action Guidance",
    "",
    body.actionGuidance,
    "",
    "## Success Criteria",
    "",
    body.successCriteria,
    "",
    "## Verification",
    "",
    body.verificationMethod,
    "",
  ].join("\n");
}
