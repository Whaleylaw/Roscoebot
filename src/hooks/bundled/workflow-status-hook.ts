import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import {
  type ProjectTaskCompleteHookContext,
  isProjectTaskCompleteEvent,
  registerInternalHook,
} from "../internal-hooks.js";
import { parseTaskFrontmatter, parseWorkflowFrontmatter } from "../../projects/frontmatter.js";
import { writeFileAtomic } from "../../projects/scaffold.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("hooks/workflow-status");

/**
 * Register a hook that updates workflow status when tasks complete.
 * Listens on "project:task-complete" events and reads task files
 * (source of truth) to determine whether the workflow is fully complete.
 */
export function registerWorkflowStatusHook(): void {
  registerInternalHook("project:task-complete", async (event) => {
    if (!isProjectTaskCompleteEvent(event)) return;

    const { workflowId, projectDir } = event.context as ProjectTaskCompleteHookContext;
    if (!workflowId) return;

    try {
      // Read workflow file
      const wfPath = path.join(projectDir, "workflows", `${workflowId}.md`);
      const wfContent = await fs.readFile(wfPath, "utf8");
      const wfResult = parseWorkflowFrontmatter(wfContent, wfPath);
      if (!wfResult.success) {
        log.warn("Failed to parse workflow frontmatter", { workflowId });
        return;
      }

      const wfData = wfResult.data;
      if (wfData.tasks.length === 0) return;

      // Check task file statuses -- tasks are the source of truth, not the queue
      let allDone = true;
      let anyFailed = false;
      const tasksDir = path.join(projectDir, "tasks");

      for (const taskId of wfData.tasks) {
        const taskPath = path.join(tasksDir, `${taskId}.md`);
        try {
          const taskContent = await fs.readFile(taskPath, "utf8");
          const taskResult = parseTaskFrontmatter(taskContent, taskPath);
          if (!taskResult.success) {
            allDone = false;
            continue;
          }
          if (taskResult.data.status === "blocked") {
            anyFailed = true;
            allDone = false;
          } else if (taskResult.data.status !== "done") {
            allDone = false;
          }
        } catch {
          // Missing task file means it is not done
          allDone = false;
        }
      }

      // Determine new workflow status
      let newStatus: string | null = null;
      if (allDone) {
        newStatus = "completed";
      } else if (anyFailed && wfData.status !== "active") {
        // Keep active -- do not change to failed unless recovery decides
        newStatus = null;
      } else if (wfData.status === "draft") {
        newStatus = "active";
      }

      if (!newStatus || newStatus === wfData.status) return;

      // Update workflow file frontmatter
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

      log.info("Updated workflow status", { workflowId, newStatus });
    } catch (err) {
      log.error("Workflow status hook failed", {
        workflowId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
