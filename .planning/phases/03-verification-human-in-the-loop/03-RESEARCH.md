# Phase 3: Verification & Human-in-the-Loop - Research

**Researched:** 2026-03-29
**Domain:** Task verification pipeline, human approval gating, queue section extension
**Confidence:** HIGH

## Summary

Phase 3 adds a verification gate between task completion and the Done state, plus a human approval flow via a new Review queue section. The existing codebase already has significant scaffolding for this: `CheckpointData.status` already includes `"review"`, `TaskFrontmatterSchema.status` already includes `"review"`, and the project board columns default to `["Backlog", "In Progress", "Review", "Done"]`. The main work is: (1) adding `success_criteria` to the task schema, (2) creating a `project:task-pre-complete` hook with verification runners, (3) extending `QueueSection` to include `"review"`, (4) building the verification evidence schema for checkpoint sidecars, and (5) adding CLI review approve/reject commands and gateway RPC methods.

The hook system (`internal-hooks.ts`) supports `type:action` event registration with `registerInternalHook("project:task-pre-complete", handler)`. The existing `workflow-status-hook.ts` is a direct pattern to follow. The queue manager's `lockedWriteOp()` handles concurrent queue mutations atomically. File existence checks use `fs.access()`, and command execution checks use `node:child_process` (used extensively in `src/infra/`).

**Primary recommendation:** Implement verification as a single bundled hook (`src/hooks/bundled/verification-hook.ts`) that intercepts task completion, runs check functions, and routes to Done or Review based on `verification_type`. Extend the checkpoint sidecar with a `verification` field rather than creating a separate file.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Hook-driven inline verification. A new "project:task-pre-complete" hook fires when an agent reports task completion. The hook reads the task's verification_type and success_criteria, runs appropriate checks, and either allows the task to proceed to Done or blocks it.
- **D-02:** Automatic verification supports two check types: file existence checks (verify output files exist at specified paths) and command execution checks (run a shell command and check exit code / output pattern).
- **D-03:** Verification evidence is stored in the existing checkpoint sidecar (.TASK-NNN.checkpoint.json), extended with a "verification" section containing check results, evidence, and pass/fail status.
- **D-04:** Success criteria are expressed as structured YAML lists in task frontmatter: `success_criteria: [{type: 'file_exists', path: '...'}, {type: 'command', cmd: '...', expect: 0}]`. Machine-parseable, unambiguous for the verification hook.
- **D-05:** Verification runs synchronously within the pre-complete hook. File existence and command checks complete quickly. The task does not move to Done until verification passes. Simple and deterministic.
- **D-06:** Review is board-visible, not push-notification based. Tasks needing human approval move into a Review queue state that shows up on the kanban board.
- **D-07:** "Review" becomes a 5th formal queue section alongside Available, Claimed, Done, and Blocked. Tasks needing approval move there and appear as a kanban board column.
- **D-08:** Users approve or reject via board interaction (drag task out of Review column to Done or Available/Blocked) or CLI command (e.g., `openclaw project review approve TASK-001`). Both paths update queue and checkpoint.
- **D-09:** Review tasks wait indefinitely for human action. No timeout, no auto-approval.
- **D-10:** Agent reports completion via existing task-complete path. A new "project:task-pre-complete" hook intercepts BEFORE the task moves to Done.
- **D-11:** When automatic verification fails, the task returns to the Available queue section. The checkpoint records the verification failure and evidence.
- **D-12:** Gate logic by verification_type: automatic (run checks, pass->Done, fail->Available), human (skip auto, move to Review), external (same as human), mixed (auto first, pass->Review, fail->Available).
- **D-13:** Mixed verification sequences auto-first, then human.
- **D-14:** External verification treated identically to human -- task moves to Review.

### Claude's Discretion

- Exact schema shape for the verification section in checkpoint sidecar
- Hook registration details and event payload structure for "project:task-pre-complete"
- CLI command naming and flags for the review approve/reject command
- How the kanban board UI renders the Review column (styling, actions)
- Internal implementation of file existence and command execution check runners

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                                               | Research Support                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| VER-01 | Each task has a verification_type: automatic, human, external, or mixed                                   | Already in TaskFrontmatterSchema; success_criteria schema addition needed        |
| VER-02 | Automatic verification checks defined success criteria (test passes, file exists, command output matches) | Verification hook with file_exists and command check runners                     |
| VER-03 | Human verification creates a checkpoint that pauses execution until user confirms                         | Review queue section + checkpoint status="review" (both partially exist)         |
| VER-04 | Verification evidence is recorded alongside task checkpoint                                               | Checkpoint sidecar extended with verification section                            |
| VER-05 | A task is not marked "done" until verification passes; failed verification triggers recovery              | Pre-complete hook gates Done transition; recovery deferred to Phase 4            |
| HIL-01 | Tasks are classified by side_effect_class: none, reversible, irreversible                                 | Already in TaskFrontmatterSchema                                                 |
| HIL-02 | Tasks with side_effect_class "none" or "reversible" auto-proceed without human approval                   | Verification hook checks side_effect_class + approval_required to determine flow |
| HIL-03 | Tasks with side_effect_class "irreversible" or approval_required=true pause for human confirmation        | Route to Review queue section                                                    |
| HIL-04 | Human checkpoints present task, planned action, and potential consequences                                | Review item in checkpoint includes task context and verification evidence        |

</phase_requirements>

## Standard Stack

### Core

No new external dependencies required. All functionality builds on existing project infrastructure.

| Library              | Version           | Purpose                                   | Why Standard                                                |
| -------------------- | ----------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `node:child_process` | Node 22+ built-in | Command execution for verification checks | Standard Node API, already used extensively in `src/infra/` |
| `node:fs/promises`   | Node 22+ built-in | File existence checks                     | Already used throughout `src/projects/`                     |
| `zod`                | ^4.3.6 (existing) | success_criteria schema validation        | Already used for all frontmatter schemas                    |
| `yaml`               | ^2.8.3 (existing) | YAML serialization of success_criteria    | Already used in queue-parser, templates, frontmatter        |

### Supporting

| Library     | Version            | Purpose                            | When to Use                                     |
| ----------- | ------------------ | ---------------------------------- | ----------------------------------------------- |
| `commander` | ^14.0.3 (existing) | CLI review subcommand registration | Adding `project review approve/reject` commands |
| `lit`       | ^3.3.2 (existing)  | Review column UI rendering         | Board UI extension                              |

**Installation:** No new packages needed. All dependencies already present in the project.

## Architecture Patterns

### Recommended File Structure

```
src/projects/
  verification.ts           # SuccessCriterion type, check runners (file_exists, command)
  verification.test.ts      # Unit tests for check runners
src/hooks/bundled/
  verification-hook.ts      # Pre-complete hook: reads task, runs checks, gates transition
  verification-hook.test.ts # Hook integration tests
src/cli/program/
  register.projects.ts      # Extended with "review" subcommand group
src/commands/
  projects.review.ts        # Review approve/reject command implementation
```

### Pattern 1: Pre-Complete Hook Event

**What:** New `project:task-pre-complete` hook event type that fires before a task moves to Done, allowing verification to intercept.

**When to use:** Every task completion attempt.

**Key design:** The pre-complete hook MUST fire before `project:task-complete`. The existing `task-complete` event continues to fire only after verification passes and the task actually moves to Done. This means the code path that currently triggers `project:task-complete` needs to be modified to first trigger `project:task-pre-complete`, check the result, and only then proceed.

**Important:** The current hook system is fire-and-forget (handlers return void, errors are caught and logged). For pre-complete gating, the hook needs to communicate pass/fail back to the caller. Two approaches:

1. **Event mutation pattern**: The hook handler mutates a field on the event object (e.g., `event.context.verified = false` to block). The caller checks this after `await triggerInternalHook(event)`.
2. **Dedicated function**: A dedicated `runPreCompleteVerification()` function that is called directly from the task-complete code path, separate from the general hook system.

**Recommendation:** Use approach 2 -- a dedicated verification function called from the task-complete path. The general hook system's error-swallowing behavior is wrong for verification gating. The function reads the task frontmatter, runs checks, and returns a discriminated result. Register a listener on `project:task-pre-complete` for observability/logging only.

```typescript
// src/projects/verification.ts
export type VerificationResult =
  | { passed: true; evidence: VerificationEvidence }
  | { passed: false; evidence: VerificationEvidence; reason: string };

export type VerificationEvidence = {
  checks: CheckResult[];
  timestamp: string;
  verification_type: string;
};

export type CheckResult = {
  type: "file_exists" | "command";
  target: string; // path or command
  passed: boolean;
  detail: string; // "file found at ..." or "exit code 0, stdout: ..."
};
```

### Pattern 2: Queue Section Extension

**What:** Add `"review"` to the `QueueSection` type union and update serialization/parsing.

**Existing scaffolding already present:**

- `CheckpointData.status` already includes `"review"`
- `TaskFrontmatterSchema.status` already includes `"review"`
- Board columns default already includes `"Review"`
- The queue parser uses case-insensitive heading matching (`splitSections`)

**What needs changing:**

- `QueueSection` type: `"available" | "claimed" | "done" | "blocked"` becomes `"available" | "claimed" | "review" | "done" | "blocked"`
- `SECTION_HEADINGS` record: add `review: "Review"`
- `serializeQueue()`: add "review" to the canonical section order
- `ParsedQueue` interface: add `review: QueueEntry[]`
- `parseQueue()`: populate `parsed.review` from the "review" section

### Pattern 3: Checkpoint Verification Extension

**What:** Extend `CheckpointData` with a `verification` field.

```typescript
// Extend CheckpointData interface
export interface CheckpointData {
  // ... existing fields ...
  verification?: {
    last_run: string; // ISO timestamp
    passed: boolean;
    verification_type: string; // "automatic" | "human" | "external" | "mixed"
    checks: Array<{
      type: "file_exists" | "command";
      target: string;
      passed: boolean;
      detail: string;
    }>;
    human_review?: {
      status: "pending" | "approved" | "rejected";
      reviewer?: string;
      reviewed_at?: string;
      notes?: string;
    };
    history: Array<{
      timestamp: string;
      passed: boolean;
      checks_summary: string;
    }>;
  };
}
```

**Why optional:** Backward compatibility. Existing checkpoints without verification continue to work. The verification section is only populated when the pre-complete hook runs.

### Pattern 4: Success Criteria Schema

**What:** Add `success_criteria` to `TaskFrontmatterSchema`.

```typescript
const SuccessCriterionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("file_exists"),
    path: z.string(),
  }),
  z.object({
    type: z.literal("command"),
    cmd: z.string(),
    expect: z.number().default(0),
    output_pattern: z.string().optional(),
  }),
]);

// In TaskFrontmatterSchema:
success_criteria: z.array(SuccessCriterionSchema).default([]),
```

**Note on discriminated unions:** CLAUDE.md warns against `Type.Union` in tool input schemas (google-antigravity guardrail), but this is for Zod schemas in task frontmatter, not tool input schemas. Zod discriminated unions are the standard pattern in this codebase.

### Pattern 5: Task Completion Interception

**What:** The code path that moves a task from Claimed to Done must be intercepted.

**Current flow** (inferred from codebase):

1. Agent reports task complete
2. `project:task-complete` hook fires
3. Task moves in queue: Claimed -> Done

**New flow:**

1. Agent reports task complete
2. Read task frontmatter for `verification_type` and `success_criteria`
3. Run verification based on type (D-12 gate logic)
4. If auto-checks pass and no human review needed: move to Done, fire `project:task-complete`
5. If auto-checks pass and human review needed: move to Review, update checkpoint
6. If auto-checks fail: move to Available, update checkpoint with failure evidence
7. If human verification: move to Review directly

### Anti-Patterns to Avoid

- **Creating a separate verification file alongside checkpoint:** Store verification evidence in the checkpoint sidecar itself (D-03). One file per task for state, not two.
- **Using the hook system for gating decisions:** The hook system swallows errors and is fire-and-forget. Verification gating must use a direct function call that returns a result.
- **Auto-approving after timeout:** D-09 explicitly states no timeout, no auto-approval. Review tasks wait indefinitely.
- **Running untrusted commands without bounds:** Command execution checks should have a timeout (e.g., 30 seconds) to prevent verification from hanging indefinitely on a stuck command.

## Don't Hand-Roll

| Problem                  | Don't Build         | Use Instead                                                 | Why                                                           |
| ------------------------ | ------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Atomic queue mutations   | Custom file locking | `QueueManager.lockedWriteOp()`                              | Already handles locking, validation, and re-read verification |
| Atomic file writes       | Manual tmp+rename   | `writeFileAtomic()` from `scaffold.ts`                      | Already implemented with UUID tmp names                       |
| YAML frontmatter parsing | Custom parser       | `parseTaskFrontmatter()` from `frontmatter.ts`              | Handles edge cases, validates with Zod                        |
| Checkpoint read/write    | Custom JSON I/O     | `readCheckpoint()`/`writeCheckpoint()` from `checkpoint.ts` | Atomic writes, graceful degradation on corruption             |
| CLI command structure    | Raw Commander setup | Follow `register.projects.ts` pattern with lazy imports     | Consistent with codebase conventions                          |

## Common Pitfalls

### Pitfall 1: Hook Error Swallowing Breaks Verification Gate

**What goes wrong:** Using `triggerInternalHook()` for verification and expecting it to gate task completion. The hook system catches errors and logs them but continues execution.
**Why it happens:** The hook system is designed for side effects (logging, status updates), not gating decisions.
**How to avoid:** Use a dedicated `runVerification()` function for the gating decision. Only use the hook system for observability events.
**Warning signs:** Tasks moving to Done despite failing verification checks.

### Pitfall 2: Queue Section Addition Breaks Existing Parsers

**What goes wrong:** Adding "review" to `QueueSection` but not updating all serialization/parsing code paths, causing queues with Review sections to lose entries on round-trip.
**Why it happens:** `serializeQueue()` has a hardcoded sections array, `ParsedQueue` interface needs the new field, `parseQueue()` needs to populate it.
**How to avoid:** Update ALL of: `QueueSection` type, `SECTION_HEADINGS`, `serializeQueue()` sections array, `ParsedQueue` interface, `parseQueue()` return value. Write a round-trip test.
**Warning signs:** Review section entries disappearing after queue write.

### Pitfall 3: Command Execution Check Hangs

**What goes wrong:** A verification command hangs indefinitely, blocking the entire pre-complete hook.
**Why it happens:** No timeout on `child_process.exec()`.
**How to avoid:** Use `execFile` with a `timeout` option (recommend 30s). Kill the process on timeout and record a failure.
**Warning signs:** Task completion hanging indefinitely.

### Pitfall 4: Success Criteria Schema Breaks Existing Tasks

**What goes wrong:** Adding `success_criteria` as a required field causes existing tasks without it to fail validation.
**Why it happens:** Zod schema validation is strict by default.
**How to avoid:** Use `.default([])` on the success_criteria field, same pattern as `depends_on`, `capabilities`, etc.
**Warning signs:** Existing task files failing to parse after schema update.

### Pitfall 5: Race Between Verification and Queue State

**What goes wrong:** Two agents try to complete the same task simultaneously, causing duplicate verification runs or queue corruption.
**Why it happens:** Verification reads task state, runs checks, then mutates queue -- not atomic.
**How to avoid:** The queue mutation itself (moving to Done/Review/Available) goes through `QueueManager.lockedWriteOp()` which is already locked. The verification function should be called within the locked operation scope, or the queue move should verify the task is still in the expected section before mutating.
**Warning signs:** Duplicate verification log entries, task appearing in multiple queue sections.

## Code Examples

### Adding Review to QueueSection

```typescript
// src/projects/queue-manager.ts
export type QueueSection = "available" | "claimed" | "review" | "done" | "blocked";

const SECTION_HEADINGS: Record<QueueSection, string> = {
  available: "Available",
  claimed: "Claimed",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

// In serializeQueue():
const sections: QueueSection[] = ["available", "claimed", "review", "done", "blocked"];
```

### Success Criteria Schema

```typescript
// src/projects/schemas.ts
export const SuccessCriterionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("file_exists"),
    path: z.string(),
  }),
  z.object({
    type: z.literal("command"),
    cmd: z.string(),
    expect: z.number().default(0),
    output_pattern: z.string().optional(),
  }),
]);

// Add to TaskFrontmatterSchema:
success_criteria: z.array(SuccessCriterionSchema).default([]),
```

### Verification Check Runner

```typescript
// src/projects/verification.ts
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 30_000;

export async function runFileExistsCheck(
  filePath: string,
  projectDir: string,
): Promise<CheckResult> {
  const resolved = path.resolve(projectDir, filePath);
  try {
    await access(resolved);
    return {
      type: "file_exists",
      target: filePath,
      passed: true,
      detail: `File exists: ${filePath}`,
    };
  } catch {
    return {
      type: "file_exists",
      target: filePath,
      passed: false,
      detail: `File not found: ${filePath}`,
    };
  }
}

export async function runCommandCheck(
  cmd: string,
  expectedExit: number,
  outputPattern: string | undefined,
  projectDir: string,
): Promise<CheckResult> {
  try {
    const { stdout, stderr } = await execFileAsync("sh", ["-c", cmd], {
      cwd: projectDir,
      timeout: COMMAND_TIMEOUT_MS,
    });
    const exitOk = true; // execFile throws on non-zero exit
    const patternOk = outputPattern ? new RegExp(outputPattern).test(stdout) : true;
    const passed = exitOk && patternOk;
    return {
      type: "command",
      target: cmd,
      passed,
      detail: passed
        ? `Exit 0${outputPattern ? `, output matched /${outputPattern}/` : ""}`
        : `Output did not match /${outputPattern}/`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { type: "command", target: cmd, passed: false, detail: `Command failed: ${message}` };
  }
}
```

### Verification Hook Pattern

```typescript
// src/hooks/bundled/verification-hook.ts
// Follow workflow-status-hook.ts pattern
import { registerInternalHook } from "../internal-hooks.js";

export function registerVerificationHook(): void {
  // Observability only -- the actual gating is done by runPreCompleteVerification()
  registerInternalHook("project:task-pre-complete", async (event) => {
    // Log verification attempt for debugging
  });
}
```

### CLI Review Command

```typescript
// Following register.projects.ts pattern
projects
  .command("review")
  .description("Manage task reviews")
  .command("approve")
  .argument("<task-id>", "Task ID (e.g., TASK-001)")
  .option("--project <name>", "Project name")
  .option("--notes <text>", "Approval notes")
  .action(async (taskId, opts) => {
    /* ... */
  });
```

## Validation Architecture

### Test Framework

| Property           | Value                                            |
| ------------------ | ------------------------------------------------ |
| Framework          | Vitest 4.1.0 (forks pool)                        |
| Config file        | `vitest.config.ts`                               |
| Quick run command  | `pnpm test -- src/projects/verification.test.ts` |
| Full suite command | `pnpm test`                                      |

### Phase Requirements to Test Map

| Req ID | Behavior                                                          | Test Type | Automated Command                                                            | File Exists?    |
| ------ | ----------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------- | --------------- |
| VER-01 | Task has verification_type (already in schema) + success_criteria | unit      | `pnpm test -- src/projects/schemas.test.ts -t "success_criteria"`            | Extend existing |
| VER-02 | Auto verification runs file_exists and command checks             | unit      | `pnpm test -- src/projects/verification.test.ts`                             | Wave 0          |
| VER-03 | Human verification moves task to Review queue                     | unit      | `pnpm test -- src/hooks/bundled/verification-hook.test.ts -t "human"`        | Wave 0          |
| VER-04 | Evidence recorded in checkpoint                                   | unit      | `pnpm test -- src/projects/verification.test.ts -t "evidence"`               | Wave 0          |
| VER-05 | Task not Done until verification passes                           | unit      | `pnpm test -- src/hooks/bundled/verification-hook.test.ts -t "gate"`         | Wave 0          |
| HIL-01 | side_effect_class classification (already in schema)              | unit      | `pnpm test -- src/projects/schemas.test.ts`                                  | Existing passes |
| HIL-02 | none/reversible auto-proceed                                      | unit      | `pnpm test -- src/hooks/bundled/verification-hook.test.ts -t "auto-proceed"` | Wave 0          |
| HIL-03 | irreversible/approval_required pause                              | unit      | `pnpm test -- src/hooks/bundled/verification-hook.test.ts -t "pause"`        | Wave 0          |
| HIL-04 | Review presents task context                                      | unit      | `pnpm test -- src/projects/verification.test.ts -t "review context"`         | Wave 0          |

### Sampling Rate

- **Per task commit:** `pnpm test -- src/projects/verification.test.ts src/hooks/bundled/verification-hook.test.ts`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/projects/verification.ts` + `src/projects/verification.test.ts` -- check runners and evidence types
- [ ] `src/hooks/bundled/verification-hook.test.ts` -- extend existing test file or create new for pre-complete hook
- [ ] `src/projects/queue-manager.test.ts` -- extend with Review section round-trip tests

## Open Questions

1. **Where is the task-complete trigger point?**
   - What we know: `project:task-complete` hook is registered by `workflow-status-hook.ts`. The hook fires with `{ taskId, workflowId, projectDir }` context.
   - What's unclear: The exact code path that triggers this event. It is not visible in `src/projects/` -- likely in gateway server methods or agent execution code. The planner needs to identify where to insert the pre-complete interception.
   - Recommendation: Search for `triggerInternalHook` calls with `project` type in the gateway/agent code during planning. The pre-complete hook must be inserted BEFORE the existing task-complete trigger.

2. **Command execution security boundary**
   - What we know: The codebase has extensive exec approval infrastructure (`src/infra/exec-approvals*`, `exec-safety*`).
   - What's unclear: Whether verification command checks should go through the exec approval system or bypass it (since they are defined by the orchestrator, not user input).
   - Recommendation: Verification commands are system-defined (in task frontmatter written by the orchestrator), not user-supplied at runtime. Use `execFile` directly with timeout, but document this as a future hardening opportunity.

## Project Constraints (from CLAUDE.md)

- TypeScript ESM, strict typing, no `any`
- Formatting/linting via Oxlint and Oxfmt (`pnpm check`)
- Tests: Vitest with forks pool only, colocated `*.test.ts`
- File naming: `kebab-case`
- Prefer `type` over `interface`
- Use `createSubsystemLogger()` for logging
- CLI progress via `src/cli/progress.ts`
- Keep files under ~700 LOC
- Use `scripts/committer` for commits
- `pnpm build` required if change can affect build output

## Sources

### Primary (HIGH confidence)

- `src/projects/checkpoint.ts` -- CheckpointData interface (status already includes "review")
- `src/projects/schemas.ts` -- TaskFrontmatterSchema (verification_type, side_effect_class, approval_required already present; status includes "review")
- `src/projects/queue-manager.ts` -- QueueSection type, lockedWriteOp(), serializeQueue()
- `src/projects/queue-parser.ts` -- ParsedQueue interface, parseQueue(), splitSections()
- `src/hooks/internal-hooks.ts` -- registerInternalHook(), triggerInternalHook(), ProjectTaskCompleteHookEvent
- `src/hooks/bundled/workflow-status-hook.ts` -- Pattern for bundled hook registration
- `src/projects/templates.ts` -- generateTaskMd(), TaskFrontmatterSchema.parse() usage
- `src/projects/frontmatter.ts` -- parseTaskFrontmatter()
- `src/projects/heartbeat-scanner.ts` -- scanAndClaimTask(), checkpoint creation pattern
- `src/cli/program/register.projects.ts` -- CLI command registration pattern
- `src/gateway/server-methods/projects.ts` -- Gateway RPC handler pattern

### Secondary (MEDIUM confidence)

- `src/infra/exec-*` -- Execution safety infrastructure (63 files, pattern established but integration point for verification unclear)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- all dependencies already present, no new packages
- Architecture: HIGH -- patterns directly observable in existing hook, queue, and checkpoint code
- Pitfalls: HIGH -- identified from code analysis of hook error handling, queue serialization, and execution patterns

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable domain, internal codebase)
