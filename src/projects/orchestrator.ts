import { validateCapabilities } from "./capability-registry.js";
import { matchCapabilities } from "./capability-matcher.js";

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
