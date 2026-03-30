# Phase 4: Recovery & Resumability - Research

**Researched:** 2026-03-29
**Domain:** Task failure recovery, anti-loop budgets, cross-session workflow resume
**Confidence:** HIGH

## Summary

Phase 4 adds a recovery strategy chain (retry, decompose, reroute, escalate), anti-loop budget enforcement in the heartbeat scanner, failure classification, stale claim detection via liveness pings, and cross-session workflow resume. All decisions are locked in CONTEXT.md -- the implementation follows the delivery-queue-recovery pattern already proven in the codebase.

The existing infrastructure is remarkably well-suited. `delivery-queue-recovery.ts` provides the exact pattern for permanent vs transient error routing, backoff arrays, budget control, and recovery summaries. `CheckpointData` already stores `failed_approaches[]` and `status`, needing only recovery metadata extensions. `QueueManager.moveTask()` already supports moving to the Blocked section. The heartbeat scanner needs a budget gate before claiming and stale-claim detection, both straightforward additions.

**Primary recommendation:** Build a `RecoveryManager` class in `src/projects/recovery-manager.ts` following the `recoverPendingDeliveries` pattern. Add a `failTask()` entry point to `task-lifecycle.ts` parallel to `completeTask()`. Extend `CheckpointData` with recovery fields. Add startup workflow scanner for resume.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Fixed priority chain: retry -> decompose -> reroute -> escalate. Always this order, skipping steps that don't apply.
- D-02: Skip decompose only when at max depth. If task is at decomposition depth 2 (DEC-03 limit), decompose is skipped.
- D-03: Same-agent retry first for reroute. Always retry with same agent type before rerouting.
- D-04: Escalation = block + notify. Move task to Blocked queue section with full failure evidence. Send summary via delegating agent.
- D-05: Heartbeat scanner gate. Heartbeat scanner checks retry count before claiming. Budget exhausted -> skip task, trigger escalation.
- D-06: Configurable per-project token ceiling. PROJECT.md frontmatter `recovery_token_budget` field. Cumulative token tracking across recovery attempts.
- D-07: Default 3 retries per task. Configurable per-project via PROJECT.md frontmatter.
- D-08: Budget tracking in checkpoint sidecar. Extend CheckpointData with `recovery_attempts`, `last_attempted_at`, `cumulative_tokens`.
- D-09: Agent reports + system overrides. Agent includes failure reason/category. Recovery system validates and can override.
- D-10: Three failure categories: `transient`, `permanent`, `unknown`. Unknown treated as transient for first N attempts, then escalate.
- D-11: Scan workflow files for discovery. On startup, scan all project `workflows/` directories for files with status "active" or "paused".
- D-12: Minimal context reconstruction. Read workflow file for task list, read each task's status and checkpoint. Derive claimable/blocked/failed.
- D-13: Liveness ping for stale claims. On orchestrator's 30-minute heartbeat, ping agents via sessions_send. No response after timeout -> release task.

### Claude's Discretion
- Exact retry backoff timing (can follow delivery-queue-recovery pattern: 5s, 25s, 2m, 10m)
- Liveness ping timeout duration (how long to wait for agent response)
- Internal structure of the recovery metadata in CheckpointData
- How token usage is tracked per recovery attempt
- Decompose-on-failure prompt engineering
- Exact format of escalation notification message

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REC-01 | On task failure, orchestrator can retry the task (same shape, new attempt) | Recovery chain step 1: retry. Checkpoint tracks `recovery_attempts` count. Backoff timing from delivery-queue-recovery pattern. |
| REC-02 | On task failure, orchestrator can decompose the task further into smaller subtasks | Recovery chain step 2: decompose. Reuses `createTaskBatch()` from orchestrator.ts. Skip when at max depth (DEC-03). |
| REC-03 | On task failure, orchestrator can reroute to a different worker type | Recovery chain step 3: reroute. Same-agent retry first (D-03), then check `agents.list[]` for different capability matches. |
| REC-04 | On task failure, orchestrator can block the task and escalate to user | Recovery chain step 4: escalate. `QueueManager.moveTask(taskId, "claimed", "blocked")`. Send notification via sessions_send. |
| REC-05 | Anti-loop budget enforced per task (3 retries) and per workflow (token ceiling) | Heartbeat scanner gate (D-05). Checkpoint stores `recovery_attempts` and `cumulative_tokens`. PROJECT.md frontmatter for config. |
| RSM-01 | Workflow state persists across sessions via workflow file + task checkpoints | Already true: workflow files have YAML frontmatter status, checkpoints are JSON sidecars. No new persistence needed. |
| RSM-02 | Interrupted workflows can resume from last completed task, not from scratch | Startup scanner reads workflow files with status "active"/"paused", reconstructs which tasks are done/claimable/blocked. |
| RSM-03 | Orchestrator reads workflow file and checkpoint state on resume to reconstruct context | D-12: Minimal reconstruction -- read workflow task list, check each task status + checkpoint. No decomposition reasoning rebuild. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^4.3.6 | Schema validation for recovery fields in PROJECT.md frontmatter | Already used for all frontmatter schemas |
| yaml | ^2.8.3 | Parse/serialize frontmatter with recovery fields | Already used throughout projects/ |

### Supporting
No new dependencies needed. Phase 4 builds entirely on existing infrastructure:
- `src/infra/retry.ts` (retryAsync, backoff computation)
- `src/infra/outbound/delivery-queue-recovery.ts` (pattern reference)
- `src/projects/checkpoint.ts` (extend CheckpointData)
- `src/projects/queue-manager.ts` (moveTask to blocked)
- `src/projects/heartbeat-scanner.ts` (add budget gate)
- `src/projects/task-lifecycle.ts` (add failTask path)

**Installation:** No new packages to install.

## Architecture Patterns

### Recommended Project Structure
```
src/projects/
  recovery-manager.ts        # Recovery chain: retry/decompose/reroute/escalate
  recovery-manager.test.ts   # Tests for recovery chain
  checkpoint.ts              # MODIFIED: extend CheckpointData with recovery fields
  heartbeat-scanner.ts       # MODIFIED: add budget gate, stale claim detection
  task-lifecycle.ts          # MODIFIED: add failTask() entry point
  schemas.ts                 # MODIFIED: add recovery fields to ProjectFrontmatterSchema
  workflow-resume.ts         # Startup workflow scanner for cross-session resume
  workflow-resume.test.ts    # Tests for resume scanner
src/hooks/bundled/
  workflow-status-hook.ts    # MODIFIED: handle recovery-triggered state changes
```

### Pattern 1: Recovery Chain (Fixed Priority)
**What:** Sequential strategy evaluation: retry -> decompose -> reroute -> escalate
**When to use:** Every task failure flows through this chain
**Example:**
```typescript
// Source: Derived from delivery-queue-recovery.ts pattern
export type FailureCategory = "transient" | "permanent" | "unknown";

export type RecoveryStrategy =
  | { action: "retry"; backoffMs: number }
  | { action: "decompose"; parentTaskId: string }
  | { action: "reroute"; targetCapabilities: string[] }
  | { action: "escalate"; reason: string };

export function selectRecoveryStrategy(opts: {
  failureCategory: FailureCategory;
  recoveryAttempts: number;
  maxRetries: number;
  decompositionDepth: number;
  maxDecompositionDepth: number;
  availableAgentCapabilities: Map<string, string[]>;
  taskCapabilities: string[];
}): RecoveryStrategy {
  // Step 1: Retry (transient or unknown with budget remaining)
  if (opts.recoveryAttempts < opts.maxRetries &&
      opts.failureCategory !== "permanent") {
    return {
      action: "retry",
      backoffMs: computeBackoffMs(opts.recoveryAttempts + 1),
    };
  }

  // Step 2: Decompose (skip if at max depth)
  if (opts.decompositionDepth < opts.maxDecompositionDepth) {
    return { action: "decompose", parentTaskId: "..." };
  }

  // Step 3: Reroute (different capability agent available)
  // ... check agents.list[]

  // Step 4: Escalate
  return { action: "escalate", reason: "Recovery chain exhausted" };
}
```

### Pattern 2: Heartbeat Scanner Budget Gate
**What:** Check retry budget before claiming a task in the heartbeat scanner
**When to use:** Every scan cycle, before claiming any task
**Example:**
```typescript
// In filterClaimableTasks, after capability and dependency checks:
const cpPath = checkpointPath(taskFilePath);
const checkpoint = await readCheckpoint(cpPath);
if (checkpoint && checkpoint.recovery_attempts >= maxRetries) {
  // Budget exhausted -- skip this task, trigger escalation
  log.warn("Task retry budget exhausted, skipping", { taskId });
  continue;
}
```

### Pattern 3: Failure Reporting (Parallel to completeTask)
**What:** `failTask()` entry point in task-lifecycle.ts for reporting task failures
**When to use:** When an agent reports task failure or system detects failure
**Example:**
```typescript
export type FailTaskOpts = {
  taskId: string;
  workflowId: string | null;
  projectDir: string;
  agentId: string;
  failureCategory: FailureCategory;
  failureReason: string;
  sessionKey?: string;
};

export type FailTaskResult = {
  outcome: "retry" | "decompose" | "reroute" | "escalate";
};
```

### Pattern 4: Workflow Resume Scanner
**What:** On startup, scan project workflows/ for active/paused workflows, reconstruct state
**When to use:** Orchestrator startup / gateway restart
**Example:**
```typescript
export type ResumedWorkflow = {
  workflowId: string;
  projectDir: string;
  status: "active" | "paused";
  tasks: Array<{
    taskId: string;
    status: string;
    hasCheckpoint: boolean;
    recoveryAttempts: number;
  }>;
  claimableTasks: string[];
  blockedTasks: string[];
  completedTasks: string[];
};

export async function scanActiveWorkflows(
  projectDirs: string[],
): Promise<ResumedWorkflow[]> {
  // For each project, read workflows/*.md
  // Filter by status: "active" or "paused"
  // For each workflow, read task statuses and checkpoints
  // Return structured resume state
}
```

### Anti-Patterns to Avoid
- **Rebuilding decomposition reasoning on resume:** D-12 says minimal reconstruction only. Read statuses, don't try to understand why tasks were created.
- **Agent-side retry loops:** Recovery enforcement must be outside the agent context (D-05). Never let the agent decide its own retry count.
- **Modifying delivery-queue-recovery.ts:** That file is for message delivery. Create a separate recovery manager that follows its pattern.
- **Coupling recovery to verification:** Keep failure reporting (`failTask`) separate from verification failure (`handleTaskPreComplete` returning "available"). They are different paths -- verification failure is "try again", recovery failure is "agent gave up."

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential backoff | Custom delay calculation | `computeBackoffMs()` from delivery-queue-recovery.ts or `retryAsync` from retry.ts | Edge cases around jitter, overflow, cap |
| File locking for queue ops | Manual lock files | `QueueManager.lockedWriteOp()` via `moveTask()` | Already handles lock timeout, stale detection, validation |
| Atomic file writes | `fs.writeFile` directly | `writeCheckpoint()` / `writeFileAtomic()` | Temp file + rename prevents partial reads |
| Frontmatter parsing | String manipulation | `parseWorkflowFrontmatter()` / `parseTaskFrontmatter()` | Zod validation, YAML core schema, error handling |
| Task graph validation | Ad-hoc checks | `validateTaskGraph()` from orchestrator.ts | Cycle detection, depth limits, capability matching |

**Key insight:** This phase is primarily about wiring existing primitives together in the right order with new metadata fields. The hard problems (locking, atomic writes, backoff, validation) are already solved.

## Common Pitfalls

### Pitfall 1: Race Between Recovery and Agent Claiming
**What goes wrong:** Heartbeat scanner claims a task that is simultaneously being processed by the recovery chain (e.g., being moved to blocked or being decomposed).
**Why it happens:** File-based queue has no transactional guarantees across multiple operations.
**How to avoid:** Recovery operations should use `lockedWriteOp` through the QueueManager. The recovery chain should fully complete (including queue move) before the task becomes visible to the scanner again.
**Warning signs:** Task appears in both Available and Blocked sections.

### Pitfall 2: Checkpoint State Drift
**What goes wrong:** CheckpointData has `recovery_attempts: 2` but the queue shows the task in Available with no indication of prior failures.
**Why it happens:** Checkpoint and queue are separate files. If a crash occurs between writing checkpoint and moving the queue entry, they diverge.
**How to avoid:** Always update checkpoint BEFORE moving the queue entry. On resume, trust checkpoint data (it's the more detailed record). If checkpoint says budget exhausted but task is in Available, escalate.
**Warning signs:** Tasks getting retried more than `maxRetries` times.

### Pitfall 3: Infinite Decompose Loop
**What goes wrong:** A failed task is decomposed into subtasks that also fail and get decomposed, creating exponential task growth.
**Why it happens:** Decomposition depth check uses wrong reference (counts from root instead of parent chain).
**How to avoid:** D-02 is clear: skip decompose when at max depth (DEC-03 limit of 2). Use the existing `MAX_DECOMPOSITION_DEPTH` constant from orchestrator.ts. Test with depth-2 tasks to confirm they skip decompose.
**Warning signs:** Task count growing rapidly within a workflow.

### Pitfall 4: Stale Claim False Positives
**What goes wrong:** Agent is legitimately working but the liveness ping times out (agent is in a long LLM call, network delay).
**Why it happens:** Ping timeout too short, or agent is in a non-interruptible operation.
**How to avoid:** Set liveness ping timeout generously (e.g., 5 minutes). Check checkpoint `last_step` timestamp -- if updated recently, trust the checkpoint over the ping response. Only release if checkpoint is also stale.
**Warning signs:** Tasks being released and re-claimed in a loop.

### Pitfall 5: Token Budget Tracking Without Provider Data
**What goes wrong:** `cumulative_tokens` field stays at 0 because no one writes to it.
**Why it happens:** Token usage data comes from provider responses, which are not directly accessible to the recovery system.
**How to avoid:** For v1, track recovery_attempts count as the primary budget mechanism (D-07 default 3 retries). Token tracking is a secondary signal -- use checkpoint log entries or agent-reported usage. Don't block on perfect token counting.
**Warning signs:** Token ceiling never triggers despite many retries.

## Code Examples

### Extending CheckpointData (D-08)
```typescript
// Source: checkpoint.ts (extend existing interface)
export interface CheckpointData {
  // ... existing fields ...
  recovery_attempts: number;
  last_attempted_at: string | null;
  cumulative_tokens: number;
  failure_category: "transient" | "permanent" | "unknown" | null;
  failure_reason: string | null;
}
```

### Extending ProjectFrontmatterSchema (D-06, D-07)
```typescript
// Source: schemas.ts (extend existing schema)
export const ProjectFrontmatterSchema = z.object({
  // ... existing fields ...
  max_task_retries: z.number().int().min(0).default(3),
  recovery_token_budget: z.number().int().min(0).nullable().default(null),
});
```

### failTask Entry Point
```typescript
// Source: task-lifecycle.ts (new function parallel to completeTask)
export async function failTask(opts: FailTaskOpts): Promise<FailTaskResult> {
  // 1. Read checkpoint, increment recovery_attempts
  // 2. Update failure_category and failure_reason
  // 3. Write checkpoint
  // 4. Call selectRecoveryStrategy()
  // 5. Execute the selected strategy:
  //    - retry: move task back to Available (after backoff)
  //    - decompose: call createTaskBatch with subtasks
  //    - reroute: update task capabilities, move to Available
  //    - escalate: move to Blocked, send notification
  // 6. Fire "project:task-failed" hook for observability
  // 7. Return outcome
}
```

### Heartbeat Budget Gate
```typescript
// Source: heartbeat-scanner.ts (modify filterClaimableTasks)
// After capability and dependency checks, before adding to claimable:
const cpPath = checkpointPath(taskFilePath);
const cp = await readCheckpoint(cpPath);
if (cp) {
  const maxRetries = projectMaxRetries ?? 3; // from PROJECT.md
  if (cp.recovery_attempts >= maxRetries) {
    // Don't claim -- budget exhausted, will be escalated
    continue;
  }
  // Check backoff eligibility
  if (cp.last_attempted_at) {
    const backoffMs = computeBackoffMs(cp.recovery_attempts);
    const eligibleAt = new Date(cp.last_attempted_at).getTime() + backoffMs;
    if (Date.now() < eligibleAt) {
      continue; // Still in backoff window
    }
  }
}
```

### Workflow Resume Scanner
```typescript
// Source: workflow-resume.ts (new file)
import fs from "node:fs/promises";
import path from "node:path";
import { parseWorkflowFrontmatter, parseTaskFrontmatter } from "./frontmatter.js";
import { readCheckpoint, checkpointPath } from "./checkpoint.js";

export async function scanActiveWorkflows(
  projectDirs: string[],
): Promise<ResumedWorkflow[]> {
  const results: ResumedWorkflow[] = [];

  for (const projectDir of projectDirs) {
    const wfDir = path.join(projectDir, "workflows");
    let entries: string[];
    try {
      entries = await fs.readdir(wfDir);
    } catch {
      continue; // No workflows dir
    }

    for (const entry of entries.filter((e) => e.endsWith(".md"))) {
      const wfPath = path.join(wfDir, entry);
      const content = await fs.readFile(wfPath, "utf8");
      const result = parseWorkflowFrontmatter(content, wfPath);
      if (!result.success) continue;
      if (result.data.status !== "active" && result.data.status !== "paused") continue;

      // Reconstruct task states
      const tasks = [];
      for (const taskId of result.data.tasks) {
        const taskPath = path.join(projectDir, "tasks", `${taskId}.md`);
        // ... read task status and checkpoint
      }

      results.push({ workflowId: result.data.id, projectDir, /* ... */ });
    }
  }

  return results;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual retry by re-running commands | Checkpoint-based auto-recovery | Phase 4 | Agents don't need to manually track retries |
| Lost work on gateway restart | Workflow file scanning on startup | Phase 4 | Workflows resume from last completed task |
| Verification failure = back to available (infinite loop possible) | Budget-gated retry with escalation | Phase 4 | Tasks that keep failing get escalated, not retried forever |

## Open Questions

1. **Token usage tracking API**
   - What we know: Provider usage data exists in session/turn responses. The Pi agent runtime likely tracks token counts.
   - What's unclear: Exact API to read cumulative token usage for a specific task's execution attempts. May require reading session logs.
   - Recommendation: For v1, use `recovery_attempts` count as primary budget. Track `cumulative_tokens` as best-effort (agent can report it in failure message). Token ceiling becomes a soft limit documented for future refinement.

2. **Gateway sessions_send for liveness ping**
   - What we know: `sessions_send` exists in gateway server methods. Used by orchestrator to send messages to agents.
   - What's unclear: Exact response mechanism -- does `sessions_send` return a response, or is it fire-and-forget? How to detect "no response" timeout.
   - Recommendation: Implementation should check current `sessions_send` contract. If fire-and-forget, the liveness check can rely on checkpoint timestamp updates instead (if checkpoint updated within N minutes, agent is alive).

3. **Decompose-on-failure prompt content**
   - What we know: Orchestrator already has decomposition prompts in its AGENTS.md / templates.
   - What's unclear: What additional context to include when decomposing a failed task (failure reason, failed approaches, etc.).
   - Recommendation: Include the task's `failed_approaches[]` from checkpoint and the `failure_reason` in the decomposition prompt. Let Claude's discretion handle the exact wording.

## Project Constraints (from CLAUDE.md)

- TypeScript ESM, strict typing, no `any`
- Tests colocated as `*.test.ts`, Vitest with forks pool
- Use `writeFileAtomic` / `writeCheckpoint` for atomic file operations
- Use `createSubsystemLogger` for logging
- Use `lockedWriteOp` through QueueManager for queue mutations
- Follow existing naming: `kebab-case` files, `camelCase` functions, `PascalCase` types
- Zod for schema validation, YAML with `{ schema: "core" }` for frontmatter
- No new dependencies unless core needs them
- Tests must clean up (timers, env, globals, mocks, temp dirs) for `--isolate=false`
- Run `pnpm test -- <path>` for targeted tests, `pnpm test` for full suite
- Keep files under ~700 LOC

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test -- src/projects/recovery-manager.test.ts -x` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REC-01 | Retry strategy selected on transient failure | unit | `pnpm test -- src/projects/recovery-manager.test.ts -t "retry" -x` | Wave 0 |
| REC-02 | Decompose strategy selected when retries exhausted + depth allows | unit | `pnpm test -- src/projects/recovery-manager.test.ts -t "decompose" -x` | Wave 0 |
| REC-03 | Reroute strategy selected when different agent available | unit | `pnpm test -- src/projects/recovery-manager.test.ts -t "reroute" -x` | Wave 0 |
| REC-04 | Escalate when recovery chain exhausted + task moved to Blocked | unit | `pnpm test -- src/projects/recovery-manager.test.ts -t "escalate" -x` | Wave 0 |
| REC-05 | Budget gate prevents claiming budget-exhausted tasks | unit | `pnpm test -- src/projects/heartbeat-scanner.test.ts -t "budget" -x` | Wave 0 |
| RSM-01 | Workflow state persists via file + checkpoint | unit | `pnpm test -- src/projects/workflow-resume.test.ts -t "persist" -x` | Wave 0 |
| RSM-02 | Resume from last completed task, not from scratch | unit | `pnpm test -- src/projects/workflow-resume.test.ts -t "resume" -x` | Wave 0 |
| RSM-03 | Reconstruct execution context from workflow + checkpoints | unit | `pnpm test -- src/projects/workflow-resume.test.ts -t "reconstruct" -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test -- src/projects/recovery-manager.test.ts src/projects/workflow-resume.test.ts src/projects/heartbeat-scanner.test.ts -x`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- [ ] `src/projects/recovery-manager.test.ts` -- covers REC-01 through REC-04
- [ ] `src/projects/workflow-resume.test.ts` -- covers RSM-01 through RSM-03
- [ ] Extend `src/projects/heartbeat-scanner.test.ts` -- covers REC-05 (budget gate)
- [ ] Extend `src/projects/task-lifecycle.test.ts` -- covers failTask() entry point

*(Existing test infrastructure covers checkpoint, queue-manager, schemas, frontmatter parsing. No framework install needed.)*

## Sources

### Primary (HIGH confidence)
- `src/infra/outbound/delivery-queue-recovery.ts` -- Recovery pattern with permanent/transient routing, backoff, budget
- `src/projects/checkpoint.ts` -- CheckpointData interface, read/write/atomic operations
- `src/projects/heartbeat-scanner.ts` -- scanAndClaimTask, filterClaimableTasks, findActiveCheckpoint
- `src/projects/queue-manager.ts` -- QueueManager with lockedWriteOp, moveTask, claimTask
- `src/projects/task-lifecycle.ts` -- completeTask flow with hooks
- `src/projects/orchestrator.ts` -- validateTaskGraph, createTaskBatch, orchestrateGoal
- `src/projects/schemas.ts` -- ProjectFrontmatterSchema, TaskFrontmatterSchema, WorkflowFrontmatterSchema
- `src/hooks/bundled/verification-hook.ts` -- handleTaskPreComplete with verification gate
- `src/hooks/bundled/workflow-status-hook.ts` -- Workflow status update on task completion
- `src/hooks/internal-hooks.ts` -- Hook registration and event system
- `src/infra/retry.ts` -- retryAsync with exponential backoff
- `.planning/phases/04-recovery-resumability/04-CONTEXT.md` -- All locked decisions

### Secondary (MEDIUM confidence)
- Gateway sessions_send mechanism for liveness pings (inferred from grep results, not deeply inspected)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing code verified
- Architecture: HIGH - patterns directly follow existing delivery-queue-recovery.ts and checkpoint.ts
- Pitfalls: HIGH - identified from direct code analysis of race conditions and state drift
- Recovery chain: HIGH - locked decisions are specific and unambiguous
- Resume scanner: HIGH - workflow frontmatter + task files already contain all needed state
- Liveness ping: MEDIUM - sessions_send contract not fully verified; checkpoint-based fallback available

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable domain, all infrastructure already exists)
