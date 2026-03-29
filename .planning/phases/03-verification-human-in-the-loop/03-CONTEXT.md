# Phase 3: Verification & Human-in-the-Loop - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Every completed task is verified before being marked done, with human approval gates for irreversible actions. This phase delivers the verification hook pipeline, automatic check execution, human approval flow via Review queue section and board/CLI interaction, evidence recording in checkpoint sidecars, and mixed/external verification routing. It does NOT deliver recovery policies (Phase 4), workflow templates (Phase 5), or progress observability (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Verification Execution Model

- **D-01:** Hook-driven inline verification. A new "project:task-pre-complete" hook fires when an agent reports task completion. The hook reads the task's verification_type and success_criteria, runs appropriate checks, and either allows the task to proceed to Done or blocks it.
- **D-02:** Automatic verification supports two check types: file existence checks (verify output files exist at specified paths) and command execution checks (run a shell command and check exit code / output pattern).
- **D-03:** Verification evidence is stored in the existing checkpoint sidecar (.TASK-NNN.checkpoint.json), extended with a "verification" section containing check results, evidence, and pass/fail status.
- **D-04:** Success criteria are expressed as structured YAML lists in task frontmatter: `success_criteria: [{type: 'file_exists', path: '...'}, {type: 'command', cmd: '...', expect: 0}]`. Machine-parseable, unambiguous for the verification hook.
- **D-05:** Verification runs synchronously within the pre-complete hook. File existence and command checks complete quickly. The task does not move to Done until verification passes. Simple and deterministic.

### Human Approval Flow

- **D-06:** Review is board-visible, not push-notification based. Tasks needing human approval move into a Review queue state that shows up on the kanban board. Users see pending reviews at a glance.
- **D-07:** "Review" becomes a 5th formal queue section alongside Available, Claimed, Done, and Blocked. Tasks needing approval move there and appear as a kanban board column.
- **D-08:** Users approve or reject via board interaction (drag task out of Review column to Done or Available/Blocked) or CLI command (e.g., `openclaw project review approve TASK-001`). Both paths update queue and checkpoint.
- **D-09:** Review tasks wait indefinitely for human action. No timeout, no auto-approval. The orchestrator heartbeat can surface reminders but never auto-approves irreversible actions.

### Task Completion Gating

- **D-10:** Agent reports completion via existing task-complete path. A new "project:task-pre-complete" hook intercepts BEFORE the task moves to Done. The agent does not decide if it's done — the verification system gates the transition.
- **D-11:** When automatic verification fails, the task returns to the Available queue section. The checkpoint records the verification failure and evidence. Any agent (or the same one) can re-claim it. Recovery policy (Phase 4) will later add retry budgets and escalation.
- **D-12:** The gate logic by verification_type:
  - `automatic`: Run checks inline. Pass → Done. Fail → Available with evidence.
  - `human`: Skip auto checks. Move to Review queue section.
  - `external`: Treat same as human — move to Review with a note about what external check is needed.
  - `mixed`: Run auto checks first. Pass → move to Review for human confirmation. Fail → Available immediately (no point asking human to review failing work).

### Mixed & External Verification

- **D-13:** Mixed verification sequences auto-first, then human. Automatic checks run in the pre-complete hook. If they pass, the task moves to Review for human confirmation. If auto fails, the task goes back to Available immediately.
- **D-14:** External verification is treated identically to human verification — task moves to Review. The review item includes a note about what external condition needs to be checked. Proper webhook/callback integration is deferred to a future phase.

### Claude's Discretion

- Exact schema shape for the verification section in checkpoint sidecar
- Hook registration details and event payload structure for "project:task-pre-complete"
- CLI command naming and flags for the review approve/reject command
- How the kanban board UI renders the Review column (styling, actions)
- Internal implementation of file existence and command execution check runners

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Verification Infrastructure (extend these)

- `src/projects/checkpoint.ts` — CheckpointData interface, createCheckpoint(), readCheckpoint(), writeCheckpoint(). Extend with verification section.
- `src/projects/schemas.ts` — Task frontmatter with verification_type, side_effect_class, approval_required fields. Add success_criteria structured schema.
- `src/projects/queue-manager.ts` — QueueSection type ("available" | "claimed" | "done" | "blocked"), lockedWriteOp(). Add "review" section.

### Hook System (register new hooks here)

- `src/hooks/internal-hooks.ts` — registerInternalHook(), triggerInternalHook(), InternalHookEventType. Add "project:task-pre-complete" event.
- `src/hooks/bundled/workflow-status-hook.ts` — Existing hook listening for "project:task-complete". Pattern to follow for verification hook.

### Task Lifecycle (modify completion path)

- `src/projects/templates.ts` — generateTaskMd() with frontmatter fields. Add success_criteria serialization.
- `src/projects/frontmatter.ts` — parseTaskFrontmatter(). Must parse new success_criteria structured field.
- `src/projects/types.ts` — Inferred types. Will include new SuccessCriterion type.

### Board & CLI (extend for Review)

- `src/gateway/server-methods/projects.ts` — Gateway RPC for project/task operations
- `src/cli/program/command-registry.ts` — CLI command registration pattern

### Prior Phase Context

- `.planning/phases/01-schema-workflow-foundation/01-CONTEXT.md` — Workflow format, task extension defaults (D-10: verification_type defaults to 'automatic')
- `.planning/phases/02-orchestrator-decomposition-queue-integration/02-CONTEXT.md` — Orchestrator lifecycle, task-complete hook (D-16), queue wiring (D-14, D-17)

### Requirements

- `.planning/REQUIREMENTS.md` — VER-01 through VER-05, HIL-01 through HIL-04

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `CheckpointData` in `checkpoint.ts` — Already has status "review", log[], notes. Extend with verification results.
- `lockedWriteOp()` in `queue-manager.ts` — Atomic queue mutations with file locking. Reuse for Review section operations.
- `writeFileAtomic()` in `scaffold.ts` — Atomic file writes for checkpoint updates.
- `registerInternalHook()` / `triggerInternalHook()` in `internal-hooks.ts` — Hook infrastructure for event-driven verification.
- `workflow-status-hook.ts` — Working example of a task lifecycle hook. Pattern to follow for verification hook.
- `serializeQueue()` / `readQueue()` in `queue-manager.ts` — Queue round-trip. Must handle new Review section.

### Established Patterns

- Hooks registered in `internal-hooks.ts`, bundled hooks in `src/hooks/bundled/`
- Queue sections are string-typed with markdown serialization (## Available, ## Claimed, etc.)
- Checkpoint sidecar files follow `.TASK-NNN.checkpoint.json` naming convention
- CLI commands registered via `command-registry.ts` with Commander.js
- Task frontmatter parsed with Zod schemas, types inferred via `z.infer<>`

### Integration Points

- `QueueSection` type — Add "review" to the union
- `serializeQueue()` / `readQueue()` — Handle Review section in markdown round-trip
- Task-complete code path — Insert pre-complete hook trigger before moving task to Done
- Kanban board UI — Add Review column rendering
- `src/projects/index.ts` — Export new verification symbols
- Gateway RPC — Add review approve/reject methods

</code_context>

<specifics>
## Specific Ideas

- The Review queue section doubles as a general-purpose review surface. Beyond verification gates, it can be used for any workflow that needs human eyes — code review, content approval, deployment sign-off. This makes it a reusable primitive, not just a verification mechanism.
- The user wants review visibility on the kanban board AND queryable by any agent. This means the review state should be discoverable via both UI (board column) and programmatic queries (CLI command, gateway RPC).
- Auto-first sequencing for mixed verification prevents humans from reviewing work that doesn't pass basic checks. This is an efficiency decision — don't waste human attention on clearly broken work.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 03-verification-human-in-the-loop_
_Context gathered: 2026-03-29_
