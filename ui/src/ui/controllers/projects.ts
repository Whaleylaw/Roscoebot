import type { GatewayBrowserClient } from "../gateway.ts";

// Response types matching gateway RPC shapes
export type ProjectListEntry = {
  name: string;
  status: string;
  description?: string;
  owner?: string;
  tags: string[];
  columns: string[];
  dashboard: { widgets: string[] };
  created?: string;
  updated?: string;
  indexedAt: string;
};

export type BoardTaskEntry = {
  id: string;
  title: string;
  status: string;
  priority: string;
  claimed_by: string | null;
  depends_on: string[];
  workflow?: string | null;
};

export type BoardColumn = {
  name: string;
  tasks: BoardTaskEntry[];
};

export type BoardIndex = {
  columns: BoardColumn[];
  indexedAt: string;
};

export type QueueEntry = {
  taskId: string;
  metadata: Record<string, string>;
};

export type QueueIndex = {
  available: QueueEntry[];
  claimed: QueueEntry[];
  review: QueueEntry[];
  blocked: QueueEntry[];
  done: QueueEntry[];
  indexedAt: string;
};

/** Verification check result returned in checkpoint data. */
export type VerificationCheckResult = {
  type: string;
  target: string;
  passed: boolean;
  detail: string;
};

/** Verification info attached to checkpoint data. */
export type VerificationInfo = {
  last_run: string;
  passed: boolean;
  verification_type: string;
  checks: VerificationCheckResult[];
  human_review?: {
    status: string;
    reviewer?: string;
    reviewed_at?: string;
    notes?: string;
  };
};

/** Checkpoint data shape returned by the gateway peek RPC. */
export type CheckpointInfo = {
  status: string;
  claimed_by: string;
  claimed_at: string;
  last_step: string;
  next_action: string;
  progress_pct: number;
  files_modified: string[];
  log: Array<{ timestamp: string; agent: string; action: string }>;
  verification?: VerificationInfo;
};

/** State slice needed by loadTaskCheckpoint. */
export type CheckpointState = {
  client: GatewayBrowserClient | null;
  projectsCheckpoint: Record<string, unknown> | null;
  projectsCheckpointLoading: boolean;
};

// State shape for controller functions
export type ProjectsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  projectsLoading: boolean;
  projectsError: string | null;
  projectsList: ProjectListEntry[] | null;
  projectsBoards: Record<string, BoardIndex>;
  projectsQueues: Record<string, QueueIndex>;
  projectData: ProjectListEntry | null;
  projectBoard: BoardIndex | null;
  projectQueue: QueueIndex | null;
  projectDashboardLoading: boolean;
  projectDashboardError: string | null;
};

export async function loadProjects(state: ProjectsState): Promise<void> {
  if (!state.client || !state.connected) return;
  if (state.projectsLoading) return;

  state.projectsLoading = true;
  state.projectsError = null;

  try {
    const res = await state.client.request<{ projects: ProjectListEntry[] }>("projects.list", {});
    state.projectsList = res.projects ?? [];

    // Fetch boards and queues in parallel for task counts and agent counts
    const names = state.projectsList.map((p) => p.name);
    const [boards, queues] = await Promise.all([
      Promise.all(
        names.map(async (name) => {
          try {
            const b = await state.client!.request<{ board: BoardIndex }>("projects.board.get", {
              project: name,
            });
            return [name, b.board] as const;
          } catch {
            return null;
          }
        }),
      ),
      Promise.all(
        names.map(async (name) => {
          try {
            const q = await state.client!.request<{ queue: QueueIndex }>("projects.queue.get", {
              project: name,
            });
            return [name, q.queue] as const;
          } catch {
            return null;
          }
        }),
      ),
    ]);

    const boardMap: Record<string, BoardIndex> = {};
    for (const entry of boards) if (entry) boardMap[entry[0]] = entry[1];
    state.projectsBoards = boardMap;

    const queueMap: Record<string, QueueIndex> = {};
    for (const entry of queues) if (entry) queueMap[entry[0]] = entry[1];
    state.projectsQueues = queueMap;
  } catch (err) {
    state.projectsError = String(err);
  } finally {
    state.projectsLoading = false;
  }
}

export async function loadProjectDashboard(
  state: ProjectsState,
  projectName: string,
): Promise<void> {
  if (!state.client || !state.connected) return;
  if (state.projectDashboardLoading) return;

  state.projectDashboardLoading = true;
  state.projectDashboardError = null;

  try {
    const [projectRes, boardRes, queueRes] = await Promise.all([
      state.client.request<{ project: ProjectListEntry }>("projects.get", {
        project: projectName,
      }),
      state.client.request<{ board: BoardIndex }>("projects.board.get", {
        project: projectName,
      }),
      state.client.request<{ queue: QueueIndex }>("projects.queue.get", {
        project: projectName,
      }),
    ]);

    state.projectData = projectRes.project ?? null;
    state.projectBoard = boardRes.board ?? null;
    state.projectQueue = queueRes.queue ?? null;
  } catch (err) {
    state.projectDashboardError = String(err);
  } finally {
    state.projectDashboardLoading = false;
  }
}

/** Fetch checkpoint data for a single task (used by session peek panel). */
export async function loadTaskCheckpoint(
  state: CheckpointState,
  projectName: string,
  taskId: string,
): Promise<void> {
  if (!state.client) return;
  state.projectsCheckpointLoading = true;
  try {
    const result = await state.client.request<{ checkpoint: Record<string, unknown> | null }>(
      "projects.task.checkpoint.get",
      { project: projectName, taskId },
    );
    state.projectsCheckpoint = result.checkpoint ?? null;
  } catch {
    state.projectsCheckpoint = null;
  } finally {
    state.projectsCheckpointLoading = false;
  }
}

/** State slice needed by review actions. */
export type ReviewActionState = {
  client: GatewayBrowserClient | null;
};

/** Approve a task in review -- moves it to Done via gateway RPC. */
export async function reviewApprove(
  state: ReviewActionState,
  taskId: string,
  project: string,
  notes?: string,
): Promise<void> {
  if (!state.client) return;
  await state.client.request("projects.review.approve", {
    taskId,
    project,
    ...(notes ? { notes } : {}),
  });
}

/** Reject a task in review -- moves it back to Available via gateway RPC. */
export async function reviewReject(
  state: ReviewActionState,
  taskId: string,
  project: string,
  notes?: string,
): Promise<void> {
  if (!state.client) return;
  await state.client.request("projects.review.reject", {
    taskId,
    project,
    ...(notes ? { notes } : {}),
  });
}
