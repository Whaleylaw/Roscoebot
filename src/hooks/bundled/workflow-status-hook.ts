import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { parseTaskFrontmatter, parseWorkflowFrontmatter } from "../../projects/frontmatter.js";
import { writeFileAtomic } from "../../projects/scaffold.js";
import type { WorkflowFrontmatter } from "../../projects/types.js";
import {
  type ProjectTaskCompleteHookContext,
  isProjectTaskCompleteEvent,
  registerInternalHook,
} from "../internal-hooks.js";

const log = createSubsystemLogger("hooks/workflow-status");

/**
 * Shared helper: read workflow file and collect task statuses.
 * Returns null if the workflow cannot be read or parsed.
 */
async function readWorkflowTaskStatuses(
  workflowId: string,
  projectDir: string,
): Promise<{
  wfData: WorkflowFrontmatter;
  wfPath: string;
  wfContent: string;
  taskStatuses: Map<string, string>;
} | null> {
  const wfPath = path.join(projectDir, "workflows", `${workflowId}.md`);

  let wfContent: string;
  try {
    wfContent = await fs.readFile(wfPath, "utf8");
  } catch {
    log.warn("Failed to read workflow file", { workflowId });
    return null;
  }

  const wfResult = parseWorkflowFrontmatter(wfContent, wfPath);
  if (!wfResult.success) {
    log.warn("Failed to parse workflow frontmatter", { workflowId });
    return null;
  }

  const wfData = wfResult.data;
  if (wfData.tasks.length === 0) return null;

  const tasksDir = path.join(projectDir, "tasks");
  const taskStatuses = new Map<string, string>();

  for (const taskId of wfData.tasks) {
    const taskPath = path.join(tasksDir, `${taskId}.md`);
    try {
      const taskContent = await fs.readFile(taskPath, "utf8");
      const taskResult = parseTaskFrontmatter(taskContent, taskPath);
      if (taskResult.success) {
        taskStatuses.set(taskId, taskResult.data.status);
      } else {
        taskStatuses.set(taskId, "unknown");
      }
    } catch {
      // Missing task file -- treat as not done
      taskStatuses.set(taskId, "unknown");
    }
  }

  return { wfData, wfPath, wfContent, taskStatuses };
}

/**
 * Update a workflow file's status atomically.
 */
async function updateWorkflowStatus(
  wfPath: string,
  wfContent: string,
  wfData: WorkflowFrontmatter,
  newStatus: string,
): Promise<void> {
  const normalized = wfContent.replace(/\r\n/g, "\n");
  const fmEnd = normalized.indexOf("\n---", 3);
  if (fmEnd === -1) return;
  const body = normalized.slice(fmEnd + 4);

  const updatedFm = {
    ...wfData,
    status: newStatus,
    updated: new Date().toISOString().split("T")[0],
  };
  const yamlStr = YAML.stringify(updatedFm, { schema: "core" });
  const updatedContent = `---\n${yamlStr}---${body}`;
  await writeFileAtomic(wfPath, updatedContent);
}

/**
 * Register hooks that update workflow status when tasks complete or fail.
 *
 * Listens on:
 * - "project:task-complete": checks if all tasks done -> workflow "completed"
 * - "project:task-failed": checks if all tasks done/blocked -> workflow "failed"
 */
export function registerWorkflowStatusHook(): void {
  // Handle task completion
  registerInternalHook("project:task-complete", async (event) => {
    if (!isProjectTaskCompleteEvent(event)) return;

    const { workflowId, projectDir } = event.context as ProjectTaskCompleteHookContext;
    if (!workflowId) return;

    try {
      const state = await readWorkflowTaskStatuses(workflowId, projectDir);
      if (!state) return;

      const { wfData, wfPath, wfContent, taskStatuses } = state;

      // Check task statuses
      let allDone = true;
      for (const status of taskStatuses.values()) {
        if (status !== "done") {
          allDone = false;
          break;
        }
      }

      // Determine new workflow status
      let newStatus: string | null = null;
      if (allDone) {
        newStatus = "completed";
      } else if (wfData.status === "draft") {
        newStatus = "active";
      }

      if (!newStatus || newStatus === wfData.status) return;

      await updateWorkflowStatus(wfPath, wfContent, wfData, newStatus);
      log.info("Updated workflow status", { workflowId, newStatus });
    } catch (err) {
      log.error("Workflow status hook failed", {
        workflowId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Handle task failure -- check if all tasks are done/blocked -> workflow "failed"
  registerInternalHook("project:task-failed", async (event) => {
    const ctx = event.context as {
      taskId: string;
      workflowId: string | null;
      projectDir: string;
      recoveryOutcome?: string;
    };
    if (!ctx.workflowId) return;

    try {
      const state = await readWorkflowTaskStatuses(ctx.workflowId, ctx.projectDir);
      if (!state) return;

      const { wfData, wfPath, wfContent, taskStatuses } = state;

      // Check if all tasks are either "done" or "blocked" with at least one "blocked"
      let allDoneOrBlocked = true;
      let hasBlocked = false;

      for (const status of taskStatuses.values()) {
        if (status === "blocked") {
          hasBlocked = true;
        } else if (status !== "done") {
          allDoneOrBlocked = false;
          break;
        }
      }

      let newStatus: string | null = null;
      if (allDoneOrBlocked && hasBlocked) {
        newStatus = "failed";
      } else if (wfData.status === "draft") {
        // Task execution started
        newStatus = "active";
      }

      if (!newStatus || newStatus === wfData.status) return;

      await updateWorkflowStatus(wfPath, wfContent, wfData, newStatus);
      log.info("Updated workflow status after task failure", {
        workflowId: ctx.workflowId,
        newStatus,
      });
    } catch (err) {
      log.error("Workflow status hook (task-failed) failed", {
        workflowId: ctx.workflowId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
