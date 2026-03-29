import { html, nothing } from "lit";
import type {
  BoardIndex,
  BoardTaskEntry,
  CheckpointInfo,
  VerificationInfo,
} from "../controllers/projects.ts";

export type KanbanBoardProps = {
  board: BoardIndex | null;
  loading: boolean;
  error: string | null;
  expandedTaskId: string | null;
  checkpoint: CheckpointInfo | null;
  checkpointLoading: boolean;
  allTasks: BoardTaskEntry[];
  onTogglePeek: (taskId: string) => void;
  onReviewApprove?: (taskId: string) => void;
  onReviewReject?: (taskId: string) => void;
};

// Track which task is showing reject confirmation (module-level state for simplicity)
let rejectConfirmTaskId: string | null = null;

export function renderKanbanBoard(props: KanbanBoardProps) {
  if (props.loading) return renderBoardSkeleton();
  if (props.error) return html`<div class="projects-error">${props.error}</div>`;
  if (!props.board)
    return html`
      <div class="projects-board-column__empty">No tasks in this project</div>
    `;

  const columns = props.board.columns;
  if (columns.length === 0)
    return html`
      <div class="projects-board-column__empty">No columns configured</div>
    `;

  return html`
    <div class="projects-board">
      ${columns.map((col) => renderColumn(col, props))}
    </div>
  `;
}

function renderColumn(column: { name: string; tasks: BoardTaskEntry[] }, props: KanbanBoardProps) {
  const isReview = column.name === "Review";
  const columnClass = isReview
    ? "projects-board-column projects-board-column--review"
    : "projects-board-column";

  const emptyText = isReview ? "No tasks awaiting review" : "No tasks";

  return html`
    <div class="${columnClass}">
      <div class="projects-board-column__header">
        <span class="projects-board-column__name">${column.name}</span>
        <span class="projects-board-column__count">${column.tasks.length}</span>
      </div>
      <div class="projects-board-column__cards">
        ${
          column.tasks.length === 0
            ? html`
                <div class="projects-board-column__empty">${emptyText}</div>
              `
            : column.tasks.map((task) => renderCard(task, column.name, props))
        }
      </div>
    </div>
  `;
}

function renderCard(task: BoardTaskEntry, columnName: string, props: KanbanBoardProps) {
  const priorityClass = `projects-board-card--${task.priority || "low"}`;
  const isBlocked = hasUnfinishedDeps(task, props.allTasks);
  const isExpanded = props.expandedTaskId === task.id;
  const isInReview = columnName === "Review" || task.status === "review";

  return html`
    <div class="${`projects-board-card ${priorityClass}`}">
      <div class="projects-board-card__top">
        <span class="projects-board-card__id">${task.id}</span>
        ${
          isBlocked
            ? html`
                <span class="projects-board-card__blocked">
                  <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
                    <path
                      d="M8 1a4 4 0 0 0-4 4v2H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4zm2 6H6V5a2 2 0 1 1 4 0v2z"
                    />
                  </svg>
                  Blocked
                </span>
              `
            : nothing
        }
        ${isInReview ? html`<span class="projects-board-card__review-badge">${getReviewBadgeLabel(props)}</span>` : nothing}
      </div>
      <div class="projects-board-card__title">${task.title}</div>
      ${task.claimed_by ? html`<div class="projects-board-card__assignee">${task.claimed_by}</div>` : nothing}
      ${task.claimed_by ? renderAgentBar(task, props) : nothing}
    </div>
    ${isExpanded ? renderPeekPanel(task, isInReview, props) : nothing}
  `;
}

/** Determine review badge label based on verification_type from checkpoint data. */
function getReviewBadgeLabel(props: KanbanBoardProps): string {
  const vType = props.checkpoint?.verification?.verification_type;
  if (vType === "external") return "External Check";
  if (vType === "mixed") return "Auto Passed -- Needs Review";
  return "Needs Review";
}

function hasUnfinishedDeps(task: BoardTaskEntry, allTasks: BoardTaskEntry[]): boolean {
  if (!task.depends_on || task.depends_on.length === 0) return false;
  return task.depends_on.some((depId) => {
    const dep = allTasks.find((t) => t.id === depId);
    return dep && dep.status !== "Done" && dep.status !== "done";
  });
}

function renderAgentBar(task: BoardTaskEntry, props: KanbanBoardProps) {
  return html`
    <div class="projects-board-card__agent" @click=${() => props.onTogglePeek(task.id)}>
      <span class="projects-board-card__agent-dot"></span>
      <span class="projects-board-card__agent-name">${task.claimed_by}</span>
    </div>
  `;
}

function renderPeekPanel(task: BoardTaskEntry, isInReview: boolean, props: KanbanBoardProps) {
  if (props.checkpointLoading) {
    return html`
      <div class="projects-peek">
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
      </div>
    `;
  }
  const cp = props.checkpoint;
  if (!cp) return nothing;

  const logEntries = cp.log ?? [];
  const recentLog = logEntries.slice(-5).reverse();

  return html`
    <div class="projects-peek">
      <div class="projects-peek__field">
        <span class="projects-peek__label">Status</span>
        <span class="projects-peek__value">${cp.status}</span>
      </div>
      <div class="projects-peek__field">
        <span class="projects-peek__label">Progress</span>
        <div class="projects-peek__progress">
          <div class="projects-peek__progress-bar">
            <div class="projects-peek__progress-fill" style="width: ${cp.progress_pct}%"></div>
          </div>
          <span class="projects-peek__progress-pct">${cp.progress_pct}%</span>
        </div>
      </div>
      <div class="projects-peek__field">
        <span class="projects-peek__label">Current step</span>
        <span class="projects-peek__value">${cp.last_step}</span>
      </div>
      <div class="projects-peek__field">
        <span class="projects-peek__label">Next action</span>
        <span class="projects-peek__value">${cp.next_action}</span>
      </div>
      <div class="projects-peek__field">
        <span class="projects-peek__label">Files modified</span>
        <span class="projects-peek__value">${cp.files_modified?.length ?? 0} files modified</span>
      </div>
      ${renderVerificationEvidence(cp.verification)}
      ${isInReview ? renderReviewActions(task.id, props) : nothing}
      ${
        recentLog.length > 0
          ? html`
        <div class="projects-peek__log">
          <div class="projects-peek__log-title">Recent activity</div>
          ${recentLog.map(
            (entry) => html`
            <div class="projects-peek__log-entry">
              <span class="projects-peek__log-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span class="projects-peek__log-action">${entry.action}</span>
            </div>
          `,
          )}
        </div>
      `
          : nothing
      }
    </div>
  `;
}

/** Render verification evidence section in peek panel. */
function renderVerificationEvidence(verification: VerificationInfo | undefined) {
  if (!verification) {
    return html`
      <div class="projects-peek__verification">
        <div class="projects-peek__verification-status projects-peek__verification-status--pending">
          No verification checks configured for this task.
        </div>
      </div>
    `;
  }

  const checks = verification.checks ?? [];
  const failCount = checks.filter((c) => !c.passed).length;
  const totalCount = checks.length;
  const isPending =
    verification.human_review?.status === "pending" && verification.passed;

  let statusClass: string;
  let statusText: string;

  if (isPending) {
    statusClass = "projects-peek__verification-status--pending";
    statusText = "Awaiting human review";
  } else if (verification.passed) {
    statusClass = "projects-peek__verification-status--pass";
    statusText = "All checks passed";
  } else {
    statusClass = "projects-peek__verification-status--fail";
    statusText = `Verification failed -- ${failCount} of ${totalCount} checks did not pass`;
  }

  return html`
    <div class="projects-peek__verification">
      <div class="projects-peek__verification-status ${statusClass}">
        ${
          verification.passed && !isPending
            ? html`<svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>`
            : isPending
              ? html`<svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.75.75 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0z"/></svg>`
              : html`<svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/></svg>`
        }
        ${statusText}
      </div>
      ${
        checks.length > 0
          ? html`
        <div class="projects-peek__verification-checks">
          ${checks.map(
            (check) => html`
            <div class="projects-peek__check">
              <span class="${check.passed ? "projects-peek__check-icon--pass" : "projects-peek__check-icon--fail"}">
                ${
                  check.passed
                    ? html`<svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>`
                    : html`<svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/></svg>`
                }
              </span>
              <span>${check.type}</span>
              <span class="projects-peek__check-detail">${check.detail}</span>
            </div>
          `,
          )}
        </div>
      `
          : nothing
      }
    </div>
  `;
}

/** Render approve/reject action buttons for review tasks. */
function renderReviewActions(taskId: string, props: KanbanBoardProps) {
  const showRejectConfirm = rejectConfirmTaskId === taskId;

  if (showRejectConfirm) {
    return html`
      <div class="projects-peek__reject-confirm">
        <div class="projects-peek__reject-confirm-text">
          Reject this task? It will return to the Available queue for rework.
        </div>
        <div class="projects-peek__reject-confirm-actions">
          <button
            class="projects-review-btn--confirm-reject"
            @click=${() => {
              rejectConfirmTaskId = null;
              props.onReviewReject?.(taskId);
            }}
          >Yes, Reject</button>
          <button
            class="projects-review-btn--keep"
            @click=${() => {
              rejectConfirmTaskId = null;
              // Force re-render by toggling peek (close + reopen)
              props.onTogglePeek(taskId);
              props.onTogglePeek(taskId);
            }}
          >Keep Task</button>
        </div>
      </div>
    `;
  }

  return html`
    <div class="projects-peek__review-actions">
      <button
        class="projects-review-btn--approve"
        @click=${() => props.onReviewApprove?.(taskId)}
      >Approve Task</button>
      <button
        class="projects-review-btn--reject"
        @click=${() => {
          rejectConfirmTaskId = taskId;
          // Force re-render by toggling peek (close + reopen)
          props.onTogglePeek(taskId);
          props.onTogglePeek(taskId);
        }}
      >Reject Task</button>
    </div>
  `;
}

function renderBoardSkeleton() {
  return html`
    <div class="projects-board-skeleton">
      ${[1, 2, 3, 4].map(
        () => html`
        <div class="projects-board-skeleton__column">
          <div class="skeleton-line" style="width: 60%"></div>
          ${[1, 2, 3].map(
            () =>
              html`
                <div class="skeleton-block" style="height: 80px"></div>
              `,
          )}
        </div>
      `,
      )}
    </div>
  `;
}
