/**
 * Workflow resume scanner for cross-session recovery (RSM-01/02/03).
 *
 * Reconstructs workflow and per-task state from files and checkpoints
 * without requiring decomposition reasoning rebuild (D-12). Surfaces
 * interrupted tasks (in-progress with stale checkpoint) for recovery.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { checkpointPath, readCheckpoint } from "./checkpoint.js";
import { parseTaskFrontmatter, parseWorkflowFrontmatter } from "./frontmatter.js";
import { STALE_CLAIM_THRESHOLD_MS } from "./heartbeat-scanner.js";

const log = createSubsystemLogger("projects/workflow-resume");

/** Per-task state reconstructed from task file + checkpoint sidecar. */
export type ResumedTaskState = {
  taskId: string;
  status: string;
  hasCheckpoint: boolean;
  recoveryAttempts: number;
  failureCategory: string | null;
  /** ISO timestamp of most recent checkpoint activity */
  lastActivity: string | null;
};

/** Workflow with reconstructed task state for cross-session resume. */
export type ResumedWorkflow = {
  workflowId: string;
  projectDir: string;
  status: "active" | "paused";
  title: string;
  goal: string;
  tasks: ResumedTaskState[];
  completedTasks: string[];
  claimableTasks: string[];
  blockedTasks: string[];
  failedTasks: string[];
  /** Tasks with status "in-progress" and stale/missing checkpoint */
  interruptedTasks: string[];
};

/**
 * Scan project directories for active/paused workflows and reconstruct
 * per-task state from files and checkpoints.
 *
 * Per D-11/D-12: reads only workflow file + task files + checkpoints.
 * No decomposition reasoning is rebuilt.
 */
export async function scanActiveWorkflows(projectDirs: string[]): Promise<ResumedWorkflow[]> {
  const results: ResumedWorkflow[] = [];

  for (const projectDir of projectDirs) {
    const workflowsDir = path.join(projectDir, "workflows");

    let entries: string[];
    try {
      entries = await fs.readdir(workflowsDir);
    } catch {
      // No workflows/ directory -- skip this project
      continue;
    }

    const mdFiles = entries.filter((f) => f.endsWith(".md") && f !== ".gitkeep");

    for (const mdFile of mdFiles) {
      const wfPath = path.join(workflowsDir, mdFile);

      let wfContent: string;
      try {
        wfContent = await fs.readFile(wfPath, "utf8");
      } catch {
        log.warn("Failed to read workflow file", { path: wfPath });
        continue;
      }

      const wfResult = parseWorkflowFrontmatter(wfContent, wfPath);
      if (!wfResult.success) {
        log.warn("Failed to parse workflow frontmatter", { path: wfPath });
        continue;
      }

      const wfData = wfResult.data;

      // Only include active or paused workflows
      if (wfData.status !== "active" && wfData.status !== "paused") {
        continue;
      }

      // Reconstruct per-task state
      const taskStates: ResumedTaskState[] = [];
      const statusMap = new Map<string, string>();

      for (const taskId of wfData.tasks) {
        const taskFilePath = path.join(projectDir, "tasks", `${taskId}.md`);

        let taskContent: string;
        try {
          taskContent = await fs.readFile(taskFilePath, "utf8");
        } catch {
          log.warn("Task file missing, skipping", { taskId, projectDir });
          continue;
        }

        const taskResult = parseTaskFrontmatter(taskContent, taskFilePath);
        if (!taskResult.success) {
          log.warn("Task frontmatter parse failed, skipping", { taskId });
          continue;
        }

        const taskData = taskResult.data;
        statusMap.set(taskId, taskData.status);

        // Read checkpoint for recovery state
        const cpPath = checkpointPath(taskFilePath);
        const cp = await readCheckpoint(cpPath);

        // Compute lastActivity from checkpoint log or claimed_at
        let lastActivity: string | null = null;
        if (cp) {
          if (cp.log.length > 0) {
            lastActivity = cp.log[cp.log.length - 1]!.timestamp;
          } else {
            lastActivity = cp.claimed_at;
          }
        }

        taskStates.push({
          taskId,
          status: taskData.status,
          hasCheckpoint: cp !== null,
          recoveryAttempts: cp?.recovery_attempts ?? 0,
          failureCategory: cp?.failure_category ?? null,
          lastActivity,
        });
      }

      // Classify tasks
      const completedTasks: string[] = [];
      const claimableTasks: string[] = [];
      const blockedTasks: string[] = [];
      const failedTasks: string[] = [];
      const interruptedTasks: string[] = [];
      const now = Date.now();

      for (const ts of taskStates) {
        if (ts.status === "done") {
          completedTasks.push(ts.taskId);
          continue;
        }

        if (ts.status === "blocked") {
          blockedTasks.push(ts.taskId);
        }

        // Failed = has failure_category and not done
        if (ts.failureCategory !== null) {
          failedTasks.push(ts.taskId);
        }

        if (ts.status === "backlog") {
          // Check if all depends_on are done
          const taskFilePath = path.join(projectDir, "tasks", `${ts.taskId}.md`);
          try {
            const taskContent = await fs.readFile(taskFilePath, "utf8");
            const taskResult = parseTaskFrontmatter(taskContent, taskFilePath);
            if (taskResult.success) {
              const deps = taskResult.data.depends_on;
              const allDepsDone =
                deps.length === 0 || deps.every((dep) => statusMap.get(dep) === "done");
              if (allDepsDone) {
                claimableTasks.push(ts.taskId);
              }
            }
          } catch {
            // Cannot re-read task file -- skip claimable classification
          }
        }

        if (ts.status === "in-progress") {
          // Interrupted if no checkpoint or stale checkpoint
          if (!ts.hasCheckpoint) {
            interruptedTasks.push(ts.taskId);
          } else if (ts.lastActivity) {
            const lastActivityMs = new Date(ts.lastActivity).getTime();
            if (now - lastActivityMs > STALE_CLAIM_THRESHOLD_MS) {
              interruptedTasks.push(ts.taskId);
            }
          } else {
            // Has checkpoint but no lastActivity -- treat as interrupted
            interruptedTasks.push(ts.taskId);
          }
        }
      }

      results.push({
        workflowId: wfData.id,
        projectDir,
        status: wfData.status as "active" | "paused",
        title: wfData.title,
        goal: wfData.goal,
        tasks: taskStates,
        completedTasks,
        claimableTasks,
        blockedTasks,
        failedTasks,
        interruptedTasks,
      });
    }
  }

  return results;
}
