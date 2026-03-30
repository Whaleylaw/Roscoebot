import type { QueueEntry } from "./queue-parser.js";
import type { ProjectFrontmatter, TaskFrontmatter } from "./types.js";

/**
 * Discriminated union of sync events emitted when project files change.
 * Downstream consumers (Gateway WebSocket, UI) match on `type` to handle updates.
 */
export type SyncEvent =
  | { type: "project:changed"; project: string }
  | { type: "task:changed"; project: string; taskId: string }
  | { type: "task:deleted"; project: string; taskId: string }
  | { type: "queue:changed"; project: string }
  | { type: "workflow:changed"; project: string; workflowId: string }
  | { type: "reindex:complete"; project: string };

/** JSON shape written to `.index/project.json`. */
export type ProjectIndex = ProjectFrontmatter & {
  indexedAt: string;
};

/** JSON shape written to `.index/tasks/TASK-NNN.json`. */
export type TaskIndex = TaskFrontmatter & {
  indexedAt: string;
};

/** Single task entry within a board column. */
export interface BoardTaskEntry {
  id: string;
  title: string;
  status: string;
  priority: string;
  claimed_by: string | null;
  workflow?: string | null;
}

/** Progress counts for a workflow's task statuses. */
export interface WorkflowProgressCounts {
  total: number;
  done: number;
  claimed: number;
  review: number;
  blocked: number;
  available: number;
}

/** JSON shape written to `.index/workflows/WF-NNN.json`. */
export interface WorkflowIndex {
  id: string;
  title: string;
  status: string;
  goal: string;
  tasks: string[];
  template: string | null;
  progress: WorkflowProgressCounts;
  indexedAt: string;
}

/** JSON shape written to `.index/workflows.json`. */
export interface WorkflowSummary {
  workflows: Array<{
    id: string;
    title: string;
    status: string;
    progress: WorkflowProgressCounts;
  }>;
  indexedAt: string;
}

/** JSON shape written to `.index/board.json`. */
export interface BoardIndex {
  columns: Array<{
    name: string;
    tasks: BoardTaskEntry[];
  }>;
  indexedAt: string;
}

/** JSON shape written to `.index/queue.json`. */
export interface QueueIndex {
  available: QueueEntry[];
  claimed: QueueEntry[];
  review: QueueEntry[];
  blocked: QueueEntry[];
  done: QueueEntry[];
  indexedAt: string;
}
