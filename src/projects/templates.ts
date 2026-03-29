import YAML from "yaml";
import { ProjectFrontmatterSchema, QueueFrontmatterSchema, WorkflowFrontmatterSchema } from "./schemas.js";

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
