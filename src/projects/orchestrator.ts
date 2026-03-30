import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { matchCapabilities } from "./capability-matcher.js";
import { validateCapabilities } from "./capability-registry.js";
import { parseProjectFrontmatter, parseWorkflowFrontmatter } from "./frontmatter.js";
import { QueueManager } from "./queue-manager.js";
import { ensureWorkflowsDir, ProjectManager, writeFileAtomic } from "./scaffold.js";
import {
  WorkflowTemplateFrontmatterSchema,
  type WorkflowTemplateFrontmatter,
} from "./template-schema.js";
import { generateTaskMd, generateWorkflowMd } from "./templates.js";

/**
 * A decomposed task ready for queue entry and agent dispatch.
 * Produced by the orchestrator's decomposition step.
 */
export type DecomposedTask = {
  id: string;
  title: string;
  priority: "low" | "medium" | "high" | "critical";
  capabilities: string[];
  depends_on: string[];
  workflow: string;
  verification_type: "automatic" | "human" | "external" | "mixed";
  side_effect_class: "none" | "reversible" | "irreversible";
  approval_required: boolean;
  estimated_size: "small" | "medium" | "large";
  parent: string | null;
  body: {
    objective: string;
    context: string;
    actionGuidance: string;
    successCriteria: string;
    verificationMethod: string;
  };
};

export type ValidationResult = { valid: true } | { valid: false; errors: string[] };

/** Maximum number of tasks in a single decomposition batch. */
const MAX_TASK_COUNT = 50;

/** Maximum parent chain depth (root = depth 0, child = depth 1, grandchild = depth 2 is too deep). */
const MAX_DECOMPOSITION_DEPTH = 2;

/**
 * Validate a batch of decomposed tasks for structural correctness:
 * - Task count bounds
 * - Circular dependency detection
 * - Dependency reference validation
 * - Decomposition depth limits (DEC-03)
 * - Capability registration check
 * - Agent matchability check (D-21)
 *
 * @param tasks - batch of decomposed tasks to validate
 * @param projectContext - project-level capabilities and agent info
 * @returns ValidationResult with collected errors
 */
export function validateTaskGraph(
  tasks: DecomposedTask[],
  projectContext: {
    allowedCapabilities: string[];
    agentCapabilities: Map<string, string[]>;
  },
): ValidationResult {
  const errors: string[] = [];

  // 1. Task count bounds
  if (tasks.length > MAX_TASK_COUNT) {
    errors.push(`Task count ${tasks.length} exceeds maximum of ${MAX_TASK_COUNT}`);
  }

  const taskIds = new Set(tasks.map((t) => t.id));
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  // 2. Dependency reference validation (check before cycle detection so we only traverse valid edges)
  for (const task of tasks) {
    for (const dep of task.depends_on) {
      if (!taskIds.has(dep)) {
        errors.push(`Task ${task.id} depends on ${dep} which does not exist in the batch`);
      }
    }
  }

  // 3. Circular dependency detection via DFS topological sort
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) return true; // cycle found
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);

    const node = taskById.get(nodeId);
    if (node) {
      for (const dep of node.depends_on) {
        // Only traverse edges to tasks that exist in the batch
        if (taskIds.has(dep) && dfs(dep)) {
          return true;
        }
      }
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const task of tasks) {
    visited.clear();
    inStack.clear();
    if (dfs(task.id)) {
      errors.push(`Circular dependency detected involving: ${task.id}`);
    }
  }

  // 4. Depth validation (DEC-03) -- parent chain must not exceed MAX_DECOMPOSITION_DEPTH levels
  for (const task of tasks) {
    if (task.parent !== null) {
      let depth = 1;
      let current = task.parent;
      while (current !== null) {
        const parentTask = taskById.get(current);
        if (!parentTask || parentTask.parent === null) break;
        depth++;
        current = parentTask.parent;
      }
      if (depth >= MAX_DECOMPOSITION_DEPTH) {
        errors.push(
          `Task ${task.id} exceeds max decomposition depth of ${MAX_DECOMPOSITION_DEPTH} levels`,
        );
      }
    }
  }

  // 5. Capability registration check
  for (const task of tasks) {
    if (task.capabilities.length > 0) {
      const { valid, unregistered } = validateCapabilities(
        task.capabilities,
        projectContext.allowedCapabilities,
      );
      if (!valid) {
        errors.push(`Task ${task.id}: unregistered capabilities: ${unregistered.join(", ")}`);
      }
    }
  }

  // 6. Agent matchability check (D-21)
  for (const task of tasks) {
    if (task.capabilities.length > 0 && projectContext.agentCapabilities.size > 0) {
      let anyMatch = false;
      for (const [, agentCaps] of projectContext.agentCapabilities) {
        if (matchCapabilities(agentCaps, task.capabilities)) {
          anyMatch = true;
          break;
        }
      }
      if (!anyMatch) {
        errors.push(
          `Task ${task.id}: no agent can fulfill capabilities: ${task.capabilities.join(", ")}`,
        );
      }
    }
  }

  if (errors.length === 0) {
    return { valid: true };
  }
  return { valid: false, errors };
}

// --- Batch task creation pipeline ---

export type CreateTaskBatchOpts = {
  projectDir: string;
  workflowId: string;
  tasks: DecomposedTask[];
};

export type CreateTaskBatchResult = {
  taskIds: string[];
  rollback: () => Promise<void>;
};

/**
 * Scan tasks/ directory for existing TASK-NNN.md files and return the
 * next sequential number. Returns 1 if no tasks exist.
 */
async function getNextTaskNum(tasksDir: string): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.readdir(tasksDir);
  } catch {
    return 1;
  }

  const pattern = /^TASK-(\d+)\.md$/;
  let maxId = 0;
  for (const entry of entries) {
    const match = pattern.exec(entry);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxId) {
        maxId = num;
      }
    }
  }
  return maxId + 1;
}

/**
 * Update a workflow file's frontmatter `tasks` array by appending new task IDs.
 * Re-serializes the YAML frontmatter and preserves the markdown body.
 */
async function updateWorkflowTasks(
  projectDir: string,
  workflowId: string,
  newTaskIds: string[],
): Promise<void> {
  const wfPath = path.join(projectDir, "workflows", `${workflowId}.md`);
  const content = await fs.readFile(wfPath, "utf-8");

  const parsed = parseWorkflowFrontmatter(content, wfPath);
  if (!parsed.success) {
    throw new Error(`Failed to parse workflow frontmatter: ${parsed.error.message}`);
  }

  // Append new task IDs to existing list
  const updatedTasks = [...parsed.data.tasks, ...newTaskIds];
  const updatedFrontmatter = { ...parsed.data, tasks: updatedTasks };

  // Extract body after the closing --- fence
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const endIdx = normalized.indexOf("\n---", 3);
  const bodyStart = endIdx + 4; // skip past "\n---"
  const body = normalized.slice(bodyStart);

  const yamlStr = YAML.stringify(updatedFrontmatter, { schema: "core" });
  const newContent = `---\n${yamlStr}---${body}`;

  await writeFileAtomic(wfPath, newContent);
}

/**
 * Atomically create task files, add queue entries, and update workflow frontmatter.
 *
 * Rollback: if any step fails, previously created task files are cleaned up.
 *
 * ACCEPTED LIMITATION: If updateWorkflowTasks fails after addTasks succeeds,
 * queue entries become orphans (present in queue.md but workflow.tasks[] not updated).
 * This is accepted because:
 * (a) the queue entries still reference valid task files,
 * (b) heartbeat scanner will find and claim them,
 * (c) adding queue entry rollback would require re-parsing and rewriting queue.md
 *     under lock which adds complexity disproportionate to the failure mode
 *     (workflow file corruption is very rare).
 * The caller (orchestrateGoal in Plan 04) can re-run updateWorkflowTasks to fix.
 */
export async function createTaskBatch(opts: CreateTaskBatchOpts): Promise<CreateTaskBatchResult> {
  const { projectDir, workflowId, tasks } = opts;
  const qm = new QueueManager(projectDir);
  const createdFiles: string[] = [];

  try {
    // Step 1: Generate sequential task IDs
    const tasksDir = path.join(projectDir, "tasks");
    await fs.mkdir(tasksDir, { recursive: true });

    const nextNum = await getNextTaskNum(tasksDir);
    const taskIds: string[] = [];
    for (let i = 0; i < tasks.length; i++) {
      taskIds.push(`TASK-${String(nextNum + i).padStart(3, "0")}`);
    }

    // Step 2: Write all task files atomically
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const taskId = taskIds[i];
      const filePath = path.join(tasksDir, `${taskId}.md`);

      // Remap depends_on from batch-local IDs to real task IDs
      const realDepsOn = task.depends_on.map((dep) => {
        const depIdx = tasks.findIndex((t) => t.id === dep);
        return depIdx >= 0 ? taskIds[depIdx] : dep;
      });

      // Remap parent from batch-local ID to real task ID
      let realParent: string | null = task.parent;
      if (realParent) {
        const parentIdx = tasks.findIndex((t) => t.id === realParent);
        if (parentIdx >= 0) realParent = taskIds[parentIdx];
      }

      const content = generateTaskMd(
        {
          id: taskId,
          title: task.title,
          priority: task.priority,
          capabilities: task.capabilities,
          depends_on: realDepsOn,
          workflow: workflowId,
          verification_type: task.verification_type,
          side_effect_class: task.side_effect_class,
          approval_required: task.approval_required,
          estimated_size: task.estimated_size,
          parent: realParent ?? undefined,
        },
        task.body,
      );
      await writeFileAtomic(filePath, content);
      createdFiles.push(filePath);
    }

    // Step 3: Add all entries to queue
    await qm.addTasks(
      taskIds.map((id, i) => ({
        taskId: id,
        metadata: {
          priority: tasks[i].priority ?? "medium",
          capabilities: tasks[i].capabilities.join(", "),
        },
      })),
    );

    // Step 4: Update workflow frontmatter tasks[] list
    await updateWorkflowTasks(projectDir, workflowId, taskIds);

    const rollback = async () => {
      for (const f of createdFiles) {
        await fs.unlink(f).catch(() => {});
      }
      // Note: queue entries and workflow update are harder to roll back
      // but task file deletion is the critical cleanup
    };

    return { taskIds, rollback };
  } catch (err) {
    // Rollback: delete any created task files
    for (const f of createdFiles) {
      await fs.unlink(f).catch(() => {});
    }
    throw err;
  }
}

// --- synthesizeWorkflow ---

export type SynthesizeWorkflowOpts = {
  goal: string;
  goalTitle: string;
  templateParams?: Record<string, unknown>;
  constraints?: OrchestratorPayload["constraints"];
};

export type SynthesizeWorkflowResult = {
  frontmatter: WorkflowTemplateFrontmatter;
  markdown: string;
};

/** Side-effect keyword patterns that suggest irreversible or reversible actions. */
const SIDE_EFFECT_KEYWORDS = /\b(deploy|delete|send|publish|push|release|remove|drop)\b/i;

/**
 * Convert a title string to kebab-case, truncated to 50 chars.
 */
function toKebabName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50);
}

/**
 * Heuristically decompose a goal string into logical step titles.
 * Splits on sentence-level punctuation, conjunctions, and sequential markers.
 * Returns 2-5 step titles.
 */
function decomposeGoalToSteps(goal: string): string[] {
  // Split on common sequential markers and sentence boundaries
  const separators =
    /(?:,\s*then\s+|;\s*then\s+|\.\s+then\s+|,\s*and\s+then\s+|\bthen\s+|\bfinally\s+|\bafterward[s]?\s+|\bnext\s+|\bfollowed\s+by\s+|[.;]\s+)/i;

  const parts = goal
    .split(separators)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);

  if (parts.length >= 2 && parts.length <= 5) {
    return parts;
  }

  // If splitting produced too few or too many, fall back to sentence splitting
  const sentences = goal
    .split(/[.;!]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);

  if (sentences.length >= 2) {
    return sentences.slice(0, 5);
  }

  // Last resort: create 2 generic steps
  return ["Analyze requirements and plan approach", "Implement and verify solution"];
}

/**
 * Deterministic heuristic decomposition of a goal into a workflow template structure.
 * NOT an LLM call -- produces the workflow structure/outline written to disk per SYN-03.
 * The LLM decomposition into actual tasks happens later in orchestrateGoal.
 *
 * Validates output through WorkflowTemplateFrontmatterSchema (D-21).
 */
export function synthesizeWorkflow(opts: SynthesizeWorkflowOpts): SynthesizeWorkflowResult {
  const { goal, goalTitle } = opts;
  const name = toKebabName(goalTitle);
  const stepTitles = decomposeGoalToSteps(goal);

  // Detect potential side effects in the goal for step classification
  const hasSideEffects = SIDE_EFFECT_KEYWORDS.test(goal);

  const steps = stepTitles.map((title, i) => ({
    id: `step-${i + 1}`,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    owner: "agent" as const,
    verification_type: "automatic" as const,
    // Last step gets side_effect_class if goal mentions deploy/delete/send
    side_effect_class:
      hasSideEffects && i === stepTitles.length - 1
        ? ("reversible" as const)
        : ("none" as const),
  }));

  // Validate through schema to ensure structural compliance (D-21)
  const frontmatter = WorkflowTemplateFrontmatterSchema.parse({
    name,
    description: goal,
    params: {},
    steps,
  });

  // Serialize to markdown with YAML frontmatter
  const yamlStr = YAML.stringify(
    { name: frontmatter.name, description: frontmatter.description, params: frontmatter.params, steps: frontmatter.steps },
    { schema: "core" },
  );
  const stepsList = frontmatter.steps.map((s, i) => `${i + 1}. ${s.title}`).join("\n");
  const markdown = `---\n${yamlStr}---\n\n## Goal\n\n${goal}\n\n## Steps\n\n${stepsList}\n`;

  return { frontmatter, markdown };
}

// --- orchestrateGoal pipeline ---

export type OrchestrateGoalOpts = {
  projectDir: string;
  goal: string;
  goalTitle: string;
  tasks: DecomposedTask[];
  agentCapabilities: Map<string, string[]>;
  /** When true, synthesize a workflow from the goal and write to disk before task creation. */
  synthesize?: boolean;
};

export type OrchestrateGoalResult =
  | { ok: true; workflowId: string; taskIds: string[] }
  | { ok: false; errors: string[] };

/**
 * Update a workflow file's frontmatter `status` field.
 * Re-serializes YAML and preserves the markdown body.
 */
async function updateWorkflowStatus(
  projectDir: string,
  workflowId: string,
  newStatus: string,
): Promise<void> {
  const wfPath = path.join(projectDir, "workflows", `${workflowId}.md`);
  const content = await fs.readFile(wfPath, "utf-8");

  const parsed = parseWorkflowFrontmatter(content, wfPath);
  if (!parsed.success) {
    throw new Error(`Failed to parse workflow frontmatter: ${parsed.error.message}`);
  }

  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const endIdx = normalized.indexOf("\n---", 3);
  const body = normalized.slice(endIdx + 4);

  const updatedFm = {
    ...parsed.data,
    status: newStatus,
    updated: new Date().toISOString().split("T")[0],
  };
  const yamlStr = YAML.stringify(updatedFm, { schema: "core" });
  const newContent = `---\n${yamlStr}---${body}`;

  await writeFileAtomic(wfPath, newContent);
}

/**
 * Top-level orchestration pipeline: validate task graph, create workflow file,
 * batch-create task files + queue entries, activate the workflow.
 *
 * Returns errors without side effects if validation fails.
 */
export async function orchestrateGoal(opts: OrchestrateGoalOpts): Promise<OrchestrateGoalResult> {
  const { projectDir, goal, goalTitle, tasks, agentCapabilities, synthesize } = opts;

  // Step 1: Read project allowed_capabilities
  const projectMdPath = path.join(projectDir, "PROJECT.md");
  const projectContent = await fs.readFile(projectMdPath, "utf8");
  const projectResult = parseProjectFrontmatter(projectContent, projectMdPath);
  const allowedCapabilities = projectResult.success ? projectResult.data.allowed_capabilities : [];

  // Step 2: Validate task graph
  const validation = validateTaskGraph(tasks, {
    allowedCapabilities,
    agentCapabilities,
  });
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  // Step 3: Ensure workflows directory exists
  await ensureWorkflowsDir(projectDir);

  // Step 4: Create workflow file
  const pm = new ProjectManager();
  const wfId = await pm.nextWorkflowId(projectDir);

  // Synthesize branch: generate workflow from goal and write to disk (SYN-03, D-20)
  // The synthesized workflow uses the same template schema structure (D-21)
  const template = synthesize ? "synthesized" : undefined;
  const wfContent = generateWorkflowMd({
    id: wfId,
    title: goalTitle,
    goal,
    template: template ?? undefined,
  });
  const wfPath = path.join(projectDir, "workflows", `${wfId}.md`);
  await writeFileAtomic(wfPath, wfContent);

  // Step 5: Batch create tasks
  try {
    const result = await createTaskBatch({
      projectDir,
      workflowId: wfId,
      tasks,
    });

    // Step 6: Activate workflow (update status from draft to active)
    await updateWorkflowStatus(projectDir, wfId, "active");

    return { ok: true, workflowId: wfId, taskIds: result.taskIds };
  } catch (err) {
    // Clean up workflow file on failure
    await fs.unlink(wfPath).catch(() => {});
    throw err;
  }
}

// --- parseOrchestratorPayload (ORC-02 sessions_send adapter) ---

export type OrchestratorPayload = {
  type: "orchestrate";
  goal: string;
  goalTitle: string;
  project: string;
  projectDir: string;
  constraints?: {
    maxTasks?: number;
    preferredCapabilities?: string[];
    sideEffectPolicy?: "auto" | "ask-irreversible" | "ask-all";
  };
};

export type ParsePayloadResult =
  | { ok: true; payload: OrchestratorPayload }
  | { ok: false; error: string };

/**
 * Validate and extract a structured payload from a sessions_send message.
 * This is the contract that the main agent's sessions_send call must satisfy (ORC-02).
 */
export function parseOrchestratorPayload(message: string): ParsePayloadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return { ok: false, error: "Message is not valid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "Message is not a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.type !== "orchestrate") {
    return { ok: false, error: `Unknown payload type: ${String(obj.type)}` };
  }
  if (typeof obj.goal !== "string" || obj.goal.length === 0) {
    return { ok: false, error: "Missing or empty 'goal' field" };
  }
  if (typeof obj.goalTitle !== "string" || obj.goalTitle.length === 0) {
    return { ok: false, error: "Missing or empty 'goalTitle' field" };
  }
  if (typeof obj.project !== "string" || obj.project.length === 0) {
    return { ok: false, error: "Missing or empty 'project' field" };
  }
  if (typeof obj.projectDir !== "string" || obj.projectDir.length === 0) {
    return { ok: false, error: "Missing or empty 'projectDir' field" };
  }

  const payload: OrchestratorPayload = {
    type: "orchestrate",
    goal: obj.goal,
    goalTitle: obj.goalTitle,
    project: obj.project,
    projectDir: obj.projectDir,
  };

  // Parse optional constraints
  if (obj.constraints && typeof obj.constraints === "object") {
    const c = obj.constraints as Record<string, unknown>;
    payload.constraints = {};
    if (typeof c.maxTasks === "number") payload.constraints.maxTasks = c.maxTasks;
    if (Array.isArray(c.preferredCapabilities)) {
      payload.constraints.preferredCapabilities = c.preferredCapabilities.filter(
        (v): v is string => typeof v === "string",
      );
    }
    if (
      typeof c.sideEffectPolicy === "string" &&
      ["auto", "ask-irreversible", "ask-all"].includes(c.sideEffectPolicy)
    ) {
      payload.constraints.sideEffectPolicy = c.sideEffectPolicy as
        | "auto"
        | "ask-irreversible"
        | "ask-all";
    }
  }

  return { ok: true, payload };
}
