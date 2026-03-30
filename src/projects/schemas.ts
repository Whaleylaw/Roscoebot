import { z } from "zod";

/** Pattern for task IDs: TASK-001, TASK-042, etc. */
export const TASK_ID_PATTERN = /^TASK-\d+$/;

/** Pattern for workflow IDs: WF-001, WF-042, WF-1000, etc. */
export const WORKFLOW_ID_PATTERN = /^WF-\d+$/;

export const ProjectFrontmatterSchema = z.object({
  name: z.string(),
  status: z.enum(["active", "paused", "complete"]).default("active"),
  description: z.string().optional(),
  owner: z.string().optional(),
  tags: z.array(z.string()).default([]),
  columns: z.array(z.string()).default(["Backlog", "In Progress", "Review", "Done"]),
  dashboard: z
    .object({
      widgets: z
        .array(z.string())
        .default([
          "project-status",
          "task-counts",
          "active-agents",
          "sub-project-status",
          "recent-activity",
          "blockers",
        ]),
    })
    .default({
      widgets: [
        "project-status",
        "task-counts",
        "active-agents",
        "sub-project-status",
        "recent-activity",
        "blockers",
      ],
    }),
  created: z.string().optional(),
  updated: z.string().optional(),
  allowed_capabilities: z.array(z.string()).default([]),
  max_task_retries: z.number().int().min(0).default(3),
  recovery_token_budget: z.number().int().min(0).nullable().default(null),
});

export const SuccessCriterionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("file_exists"), path: z.string() }),
  z.object({
    type: z.literal("command"),
    cmd: z.string(),
    expect: z.number().default(0),
    output_pattern: z.string().optional(),
  }),
]);

export const TaskFrontmatterSchema = z.object({
  id: z.string().regex(TASK_ID_PATTERN),
  title: z.string(),
  status: z.enum(["backlog", "in-progress", "review", "done", "blocked"]).default("backlog"),
  column: z.string().default("Backlog"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  capabilities: z.array(z.string()).default([]),
  depends_on: z.array(z.string().regex(TASK_ID_PATTERN)).default([]),
  claimed_by: z.string().nullable().default(null),
  claimed_at: z.string().nullable().default(null),
  created: z.string().optional(),
  updated: z.string().optional(),
  parent: z.string().nullable().default(null),
  workflow: z.string().regex(WORKFLOW_ID_PATTERN).nullable().default(null),
  verification_type: z.enum(["automatic", "human", "external", "mixed"]).default("automatic"),
  side_effect_class: z.enum(["none", "reversible", "irreversible"]).default("none"),
  approval_required: z.boolean().default(false),
  estimated_size: z.enum(["small", "medium", "large"]).default("medium"),
  execution_mode: z.enum(["auto", "manual", "interactive"]).default("auto"),
  success_criteria: z.array(SuccessCriterionSchema).default([]),
});

export const WorkflowFrontmatterSchema = z.object({
  id: z.string().regex(WORKFLOW_ID_PATTERN),
  title: z.string(),
  status: z.enum(["draft", "active", "paused", "completed", "failed"]).default("draft"),
  goal: z.string(),
  goal_check: z.string().nullable().default(null),
  tasks: z.array(z.string().regex(TASK_ID_PATTERN)).default([]),
  template: z.string().nullable().default(null),
  created: z.string().optional(),
  updated: z.string().optional(),
});

export const QueueFrontmatterSchema = z.object({
  updated: z.string().optional(),
});
