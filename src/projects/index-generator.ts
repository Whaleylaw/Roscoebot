import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parseProjectFrontmatter, parseTaskFrontmatter } from "./frontmatter.js";
import { parseQueue } from "./queue-parser.js";
import type { ParsedQueue } from "./queue-parser.js";
import { parseWorkflowFrontmatter } from "./frontmatter.js";
import type {
  BoardIndex,
  BoardTaskEntry,
  ProjectIndex,
  QueueIndex,
  SyncEvent,
  TaskIndex,
  WorkflowIndex,
  WorkflowProgressCounts,
  WorkflowSummary,
} from "./sync-types.js";
import type { ProjectFrontmatter, TaskFrontmatter, WorkflowFrontmatter } from "./types.js";

/**
 * Transform parsed project frontmatter into a JSON-serializable ProjectIndex.
 */
export function generateProjectIndex(frontmatter: ProjectFrontmatter): ProjectIndex {
  return {
    ...frontmatter,
    indexedAt: new Date().toISOString(),
  };
}

/**
 * Transform parsed task frontmatter into a JSON-serializable TaskIndex.
 */
export function generateTaskIndex(frontmatter: TaskFrontmatter): TaskIndex {
  return {
    ...frontmatter,
    indexedAt: new Date().toISOString(),
  };
}

/**
 * Group tasks by their `column` field into the provided column names.
 * Tasks with an unknown column fall back to the first column.
 */
export function generateBoardIndex(tasks: TaskFrontmatter[], columns: string[]): BoardIndex {
  // Initialize column map
  const columnMap = new Map<string, BoardTaskEntry[]>();
  for (const col of columns) {
    columnMap.set(col, []);
  }

  for (const task of tasks) {
    const targetColumn = columnMap.has(task.column) ? task.column : columns[0];
    const entry: BoardTaskEntry = {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      claimed_by: task.claimed_by,
      workflow: task.workflow ?? null,
    };
    columnMap.get(targetColumn)!.push(entry);
  }

  return {
    columns: columns.map((name) => ({
      name,
      tasks: columnMap.get(name)!,
    })),
    indexedAt: new Date().toISOString(),
  };
}

/**
 * Transform a parsed queue into a JSON-serializable QueueIndex.
 */
export function generateQueueIndex(parsed: ParsedQueue): QueueIndex {
  return {
    available: parsed.available,
    claimed: parsed.claimed,
    review: parsed.review,
    blocked: parsed.blocked,
    done: parsed.done,
    indexedAt: new Date().toISOString(),
  };
}

/**
 * Compute progress counts from a map of task statuses.
 */
function computeProgressCounts(taskStatuses: Map<string, string>): WorkflowProgressCounts {
  let done = 0;
  let claimed = 0;
  let review = 0;
  let blocked = 0;
  let available = 0;

  for (const status of taskStatuses.values()) {
    switch (status) {
      case "done":
        done++;
        break;
      case "in-progress":
        claimed++;
        break;
      case "review":
        review++;
        break;
      case "blocked":
        blocked++;
        break;
      default:
        available++;
        break;
    }
  }

  return { total: taskStatuses.size, done, claimed, review, blocked, available };
}

/**
 * Generate a WorkflowIndex from workflow frontmatter and task statuses.
 */
export function generateWorkflowIndex(
  frontmatter: WorkflowFrontmatter,
  taskStatuses: Map<string, string>,
): WorkflowIndex {
  const progress = computeProgressCounts(taskStatuses);
  // Use frontmatter.tasks.length for total, not taskStatuses.size,
  // so total matches the declared task list even if some statuses are missing
  progress.total = frontmatter.tasks.length;

  return {
    id: frontmatter.id,
    title: frontmatter.title,
    status: frontmatter.status,
    goal: frontmatter.goal,
    tasks: frontmatter.tasks,
    template: frontmatter.template ?? null,
    progress,
    indexedAt: new Date().toISOString(),
  };
}

/**
 * Generate a workflow summary from an array of WorkflowIndex objects.
 */
export function generateWorkflowSummary(workflows: WorkflowIndex[]): WorkflowSummary {
  return {
    workflows: workflows.map((wf) => ({
      id: wf.id,
      title: wf.title,
      status: wf.status,
      progress: wf.progress,
    })),
    indexedAt: new Date().toISOString(),
  };
}

/**
 * Write JSON data atomically via temp file + rename.
 * Ensures no half-written index files on crash (SYNC-05).
 */
export async function writeIndexFile(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}

/**
 * Full reindex for one project directory.
 * Reads PROJECT.md, all task files, and queue.md; writes all .index/ JSON files.
 * Returns an array of SyncEvent objects describing what was written.
 * Invalid frontmatter is skipped with a warning (D-09, PARSE-03).
 */
export async function generateAllIndexes(projectDir: string): Promise<SyncEvent[]> {
  const projectName = path.basename(projectDir);
  const events: SyncEvent[] = [];
  const indexDir = path.join(projectDir, ".index");
  const tasksIndexDir = path.join(indexDir, "tasks");

  // Ensure .index/ directories exist
  await fs.mkdir(tasksIndexDir, { recursive: true });

  // 1. Parse and write PROJECT.md index
  let columns: string[] = ["Backlog", "In Progress", "Review", "Done"];
  try {
    const projectContent = await fs.readFile(path.join(projectDir, "PROJECT.md"), "utf-8");
    const result = parseProjectFrontmatter(projectContent, "PROJECT.md");
    if (result.success) {
      columns = result.data.columns;
      const projectIndex = generateProjectIndex(result.data);
      await writeIndexFile(path.join(indexDir, "project.json"), projectIndex);
      events.push({ type: "project:changed", project: projectName });
    }
  } catch {
    // PROJECT.md missing or unreadable -- skip
  }

  // 2. Parse all task files
  const validTasks: TaskFrontmatter[] = [];
  const tasksDir = path.join(projectDir, "tasks");
  let taskFiles: string[] = [];
  try {
    const entries = await fs.readdir(tasksDir);
    taskFiles = entries.filter((f) => /^TASK-\d+\.md$/.test(f)).toSorted();
  } catch {
    // tasks/ missing -- no tasks to index
  }

  for (const taskFile of taskFiles) {
    const filePath = path.join(tasksDir, taskFile);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const result = parseTaskFrontmatter(content, taskFile);
      if (result.success) {
        validTasks.push(result.data);
        const taskIndex = generateTaskIndex(result.data);
        await writeIndexFile(path.join(tasksIndexDir, `${result.data.id}.json`), taskIndex);
        events.push({ type: "task:changed", project: projectName, taskId: result.data.id });
      }
      // Invalid frontmatter: skip silently (D-09)
    } catch {
      // Unreadable file: skip
    }
  }

  // 3. Generate and write board index from valid tasks
  const boardIndex = generateBoardIndex(validTasks, columns);
  await writeIndexFile(path.join(indexDir, "board.json"), boardIndex);

  // 4. Parse and write queue index
  try {
    const queueContent = await fs.readFile(path.join(projectDir, "queue.md"), "utf-8");
    const parsedQueue = parseQueue(queueContent, "queue.md");
    const queueIndex = generateQueueIndex(parsedQueue);
    await writeIndexFile(path.join(indexDir, "queue.json"), queueIndex);
    events.push({ type: "queue:changed", project: projectName });
  } catch {
    // queue.md missing or unreadable -- skip
  }

  // 5. Parse workflows/ and write workflow indexes
  try {
    const workflowsDir = path.join(projectDir, "workflows");
    const workflowFiles = (await fs.readdir(workflowsDir)).filter((f) => /^WF-\d+\.md$/.test(f));
    const workflowsIndexDir = path.join(indexDir, "workflows");
    await fs.mkdir(workflowsIndexDir, { recursive: true });

    const allWorkflowIndexes: WorkflowIndex[] = [];

    for (const wfFile of workflowFiles) {
      try {
        const wfContent = await fs.readFile(path.join(workflowsDir, wfFile), "utf-8");
        const wfResult = parseWorkflowFrontmatter(wfContent, wfFile);
        if (!wfResult.success) continue;

        const wfData = wfResult.data;
        const taskStatuses = new Map<string, string>();
        const tasksDir = path.join(projectDir, "tasks");

        for (const taskId of wfData.tasks) {
          try {
            const taskContent = await fs.readFile(path.join(tasksDir, `${taskId}.md`), "utf-8");
            const taskResult = parseTaskFrontmatter(taskContent, `${taskId}.md`);
            if (taskResult.success) {
              taskStatuses.set(taskId, taskResult.data.status);
            } else {
              taskStatuses.set(taskId, "unknown");
            }
          } catch {
            taskStatuses.set(taskId, "unknown");
          }
        }

        const wfIndex = generateWorkflowIndex(wfData, taskStatuses);
        await writeIndexFile(path.join(workflowsIndexDir, `${wfData.id}.json`), wfIndex);
        allWorkflowIndexes.push(wfIndex);
        events.push({ type: "workflow:changed", project: projectName, workflowId: wfData.id });
      } catch {
        // Individual workflow unreadable -- skip
      }
    }

    // Write summary
    const summary = generateWorkflowSummary(allWorkflowIndexes);
    await writeIndexFile(path.join(indexDir, "workflows.json"), summary);
  } catch {
    // workflows/ missing -- skip (consistent with tasks/ handling)
  }

  events.push({ type: "reindex:complete", project: projectName });
  return events;
}
