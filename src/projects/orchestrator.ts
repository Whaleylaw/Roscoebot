import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { validateCapabilities } from "./capability-registry.js";
import { matchCapabilities } from "./capability-matcher.js";
import { parseWorkflowFrontmatter } from "./frontmatter.js";
import { QueueManager } from "./queue-manager.js";
import { writeFileAtomic } from "./scaffold.js";
import { generateTaskMd } from "./templates.js";

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
        errors.push(
          `Task ${task.id}: unregistered capabilities: ${unregistered.join(", ")}`,
        );
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
export async function createTaskBatch(
  opts: CreateTaskBatchOpts,
): Promise<CreateTaskBatchResult> {
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
