# Phase 4: Recovery & Resumability - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

The system recovers gracefully from task failures and resumes interrupted workflows from where they left off. This phase delivers the recovery strategy chain (retry/decompose/reroute/escalate), anti-loop budget enforcement in the heartbeat scanner, failure classification with agent-reported + system-override categories, stale claim detection via liveness pings, and cross-session workflow resume via workflow file scanning. It does NOT deliver intake/templates (Phase 5) or progress observability (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Recovery Strategy Selection

- **D-01:** Fixed priority chain: retry -> decompose -> reroute -> escalate. The orchestrator always tries strategies in this order, skipping steps that don't apply. Simple, predictable, easy to debug.
- **D-02:** Skip decompose only when at max depth. If the task is already at decomposition depth 2 (DEC-03 limit from Phase 2), decompose is skipped. Otherwise always attempt decomposition after retries exhaust.
- **D-03:** Same-agent retry first for reroute. Always retry with the same agent type before rerouting. Only reroute if a different capability set could handle the task and a different agent is available in agents.list[].
- **D-04:** Escalation = block + notify. When the recovery chain exhausts, move the task to the Blocked queue section with full failure evidence. The orchestrator sends a summary message to the user via the delegating agent. User manually unblocks or reassigns.

### Anti-Loop Budget Enforcement

- **D-05:** Heartbeat scanner gate. The heartbeat scanner checks retry count before claiming a task. If the budget is exhausted, it skips the task and triggers escalation. Enforcement lives in the scan loop — truly outside any agent's context window.
- **D-06:** Configurable per-project token ceiling. PROJECT.md frontmatter has a `recovery_token_budget` field (e.g., 500K tokens). The orchestrator tracks cumulative token usage across all recovery attempts for a workflow. Exceeding the budget triggers workflow-level escalation.
- **D-07:** Default 3 retries per task (REC-05). Configurable per-project via PROJECT.md frontmatter.
- **D-08:** Budget tracking in checkpoint sidecar. Extend CheckpointData with `recovery_attempts`, `last_attempted_at`, `cumulative_tokens`. The checkpoint is already the per-task state store and persists across sessions.

### Failure Classification

- **D-09:** Agent reports + system overrides. The agent includes a failure reason/category when reporting failure. The recovery system validates and can override (e.g., agent says "transient" but retry budget exhausted -> system escalates).
- **D-10:** Three failure categories: `transient` (retry-eligible: timeouts, rate limits, flaky checks), `permanent` (not retry-eligible: missing deps, impossible criteria, capability mismatch), `unknown` (default — treated as transient for first N attempts, then escalate).

### Cross-Session Resume

- **D-11:** Scan workflow files for discovery. On startup, the orchestrator scans all project `workflows/` directories for files with status "active" or "paused". State is reconstructed from workflow frontmatter + task files + checkpoints. No separate registry needed.
- **D-12:** Minimal context reconstruction. Read workflow file for task list, read each task's status and checkpoint. Derive: which tasks are done, which are claimable, which are blocked/failed. No attempt to rebuild the original decomposition reasoning.
- **D-13:** Liveness ping for stale claims. On the orchestrator's 30-minute heartbeat, if a task has been claimed with no checkpoint activity, the orchestrator sends a message to the claiming agent via sessions_send on the agent's active session. If the agent responds (confirms working or resumes from the wake-up), the claim is valid. If no response after a timeout, the task is released back to Available.

### Claude's Discretion

- Exact retry backoff timing (can follow delivery-queue-recovery pattern: 5s, 25s, 2m, 10m)
- Liveness ping timeout duration (how long to wait for agent response)
- Internal structure of the recovery metadata in CheckpointData
- How token usage is tracked per recovery attempt (which provider usage APIs to call)
- Decompose-on-failure prompt engineering (how to instruct the LLM to break a failed task into subtasks)
- Exact format of the escalation notification message sent to the user

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Recovery Infrastructure (patterns to adopt)

- `src/infra/retry.ts` -- retryAsync<T>() with exponential backoff, jitter, shouldRetry predicate. Reuse for task retry timing.
- `src/infra/retry-policy.ts` -- TELEGRAM_RETRY_DEFAULTS, pattern-based shouldRetry. Pattern for task retry policy.
- `src/infra/outbound/delivery-queue-recovery.ts` -- recoverPendingDeliveries() with permanent vs transient error routing, MAX_RETRIES, BACKOFF_MS array, maxRecoveryMs budget, PERMANENT_ERROR_PATTERNS regex. **Primary pattern to adopt for task recovery.**

### Checkpoint System (extend for recovery tracking)

- `src/projects/checkpoint.ts` -- CheckpointData with status, failed_approaches[], log[], verification section. Extend with recovery_attempts, last_attempted_at, cumulative_tokens.

### Task Lifecycle (modify failure path)

- `src/projects/task-lifecycle.ts` -- completeTask() with pre-complete hook gate. Add failure reporting path with classification.
- `src/hooks/bundled/verification-hook.ts` -- Verification failure returns task to Available. Integrate with recovery chain (retry count check before release).

### Heartbeat & Queue (add budget gate and stale detection)

- `src/projects/heartbeat-scanner.ts` -- scanAndClaimTask() with capability matching, priority sorting, checkpoint resume. Add retry budget gate and stale claim detection.
- `src/projects/queue-manager.ts` -- QueueSection type, lockedWriteOp(), moveTask(). Add programmatic moves to Blocked section.

### Workflow Status (extend for recovery state)

- `src/hooks/bundled/workflow-status-hook.ts` -- Task-complete hook that updates workflow status. Extend to handle recovery-triggered state changes and workflow-level budget tracking.

### Orchestrator Configuration

- `src/projects/schemas.ts` -- Task and workflow frontmatter schemas. Add recovery-related fields.
- `src/projects/types.ts` -- Inferred types from schemas.

### Inter-Agent Communication (for liveness pings)

- `src/gateway/server-methods/agents.ts` -- Agent management methods
- Gateway sessions_send infrastructure -- Used by orchestrator to ping agents for liveness checks (D-13)

### Prior Phase Context

- `.planning/phases/01-schema-workflow-foundation/01-CONTEXT.md` -- D-09: Recovery at individual task level, completed tasks never redone, heartbeat model
- `.planning/phases/02-orchestrator-decomposition-queue-integration/02-CONTEXT.md` -- D-10: Heartbeat polling, D-14: All tasks created at once, D-03: Adaptive depth (max 2 levels)
- `.planning/phases/03-verification-human-in-the-loop/03-CONTEXT.md` -- D-11: Verification failure returns to Available, D-12: Gate logic by verification type

### Requirements

- `.planning/REQUIREMENTS.md` -- REC-01 through REC-05, RSM-01 through RSM-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `retryAsync<T>()` in `retry.ts` -- Generic retry with exponential backoff, jitter, configurable delays. Reuse for task retry timing.
- `recoverPendingDeliveries()` in `delivery-queue-recovery.ts` -- Recovery pattern with permanent/transient routing, backoff array, budget control. Primary model for task recovery manager.
- `CheckpointData` in `checkpoint.ts` -- Already has `failed_approaches[]`, `status`, `verification` section. Natural home for recovery attempt tracking.
- `lockedWriteOp()` in `queue-manager.ts` -- Atomic queue mutations with file locking. Reuse for recovery-driven queue moves.
- `FileLock` in `file-lock.ts` -- Distributed file lock with stale detection. Already used by queue operations.

### Established Patterns

- Delivery queue uses PERMANENT_ERROR_PATTERNS regex array for error classification -- adopt same pattern for task failures
- Backoff progression: [5s, 25s, 2m, 10m] with MAX_RETRIES = 5 in delivery queue -- adapt for task recovery
- Budget control via maxRecoveryMs deadline per heartbeat cycle -- adopt for workflow token ceiling
- RecoverySummary type tracks recovered/failed/skipped/deferred counts -- adopt for recovery reporting
- Hook-driven lifecycle events (pre-complete, task-complete) for decoupled state updates

### Integration Points

- `heartbeat-scanner.ts` -- Add retry budget check before claiming, stale claim detection with liveness ping
- `queue-manager.ts` -- Add programmatic Blocked section moves (section exists but never receives tasks)
- `task-lifecycle.ts` -- Add failure reporting path alongside completion path
- `checkpoint.ts` -- Extend CheckpointData with recovery metadata fields
- `schemas.ts` -- Add recovery budget fields to PROJECT.md frontmatter schema
- `workflow-status-hook.ts` -- Extend for recovery-triggered workflow state changes

</code_context>

<specifics>
## Specific Ideas

- The liveness ping model is elegant: the orchestrator's heartbeat doubles as an agent wake-up mechanism. Sending a message via sessions_send to a stale agent either (1) confirms it's working, (2) wakes it up to resume from its checkpoint, or (3) gets no response confirming the agent is dead. This means the heartbeat is both a health check and a recovery action in one.
- The delivery-queue-recovery pattern in `src/infra/outbound/delivery-queue-recovery.ts` is the closest existing analog to what Phase 4 needs. It has permanent vs transient error routing, backoff arrays, budget control, and summary reporting. The task recovery manager should follow this pattern closely.
- The fixed priority chain (retry -> decompose -> reroute -> escalate) means each strategy is a clearly defined step with a skip condition. This maps well to a simple state machine or sequential check in the recovery manager.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

_Phase: 04-recovery-resumability_
_Context gathered: 2026-03-29_
