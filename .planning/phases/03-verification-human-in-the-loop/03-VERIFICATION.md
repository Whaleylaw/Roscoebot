---
phase: 03-verification-human-in-the-loop
verified: 2026-03-29T23:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
human_verification:
  - test: "Visual inspection of Review column in board UI"
    expected: "Review column shows warn accent, task cards show Needs Review badge, peek panel shows verification evidence, Approve/Reject buttons work end-to-end"
    why_human: "Visual rendering and interactive RPC flow (approve moves task to Done, reject shows inline confirmation) cannot be verified programmatically without running the gateway and browser"
---

# Phase 3: Verification & Human-in-the-Loop Verification Report

**Phase Goal:** Every completed task is verified before being marked done, with human approval gates for irreversible actions
**Verified:** 2026-03-29T23:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Each task has a verification_type and appropriate verification runs when the task reports completion | ✓ VERIFIED | `TaskFrontmatterSchema` in `src/projects/schemas.ts:68` declares `verification_type: z.enum(["automatic","human","external","mixed"])`. `handleTaskPreComplete()` in `src/hooks/bundled/verification-hook.ts` branches on all four values |
| 2 | Automatic verification checks success criteria and records evidence in the task checkpoint | ✓ VERIFIED | `runVerification()` in `src/projects/verification.ts:124` runs all `SuccessCriterion` entries and returns a `VerificationResult` with `evidence`. `handleTaskPreComplete()` calls `buildVerificationRecord()` and writes to checkpoint via `writeCheckpoint()` |
| 3 | Tasks classified as irreversible or approval_required pause for human confirmation before proceeding | ✓ VERIFIED | `handleTaskPreComplete()` lines 143-155: `sideEffectClass === "irreversible" || approvalRequired` routes to `moveTask(taskId, "claimed", "review")` with `human_review: { status: "pending" }` |
| 4 | Tasks classified as side_effect_class "none" or "reversible" auto-proceed without human approval | ✓ VERIFIED | `handleTaskPreComplete()` line 143: `needsHumanGate` is false when `sideEffectClass` is neither "irreversible" nor `approvalRequired` is true; task moves directly to "done" |
| 5 | A task is not marked "done" until its verification passes; failed verification keeps the task in a non-complete state | ✓ VERIFIED | `handleTaskPreComplete()` lines 134-140: failed `runVerification()` calls `moveTask(taskId, "claimed", "available")` and returns `{ outcome: "available" }`. `completeTask()` in `src/projects/task-lifecycle.ts:55` fires `project:task-complete` only when `outcome === "done"` |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/projects/schemas.ts` | SuccessCriterionSchema and success_criteria field on TaskFrontmatterSchema | ✓ VERIFIED | `SuccessCriterionSchema` discriminated union at line 44; `success_criteria: z.array(SuccessCriterionSchema).default([])` at line 73 |
| `src/projects/verification.ts` | VerificationResult, VerificationEvidence, CheckResult types and check runner functions | ✓ VERIFIED | All four types exported; `runFileExistsCheck`, `runCommandCheck`, `runVerification` all exported and substantive (179 lines, real implementations with fs.access and execFile) |
| `src/projects/queue-parser.ts` | ParsedQueue with review field | ✓ VERIFIED | `review: QueueEntry[]` in ParsedQueue interface at line 14 |
| `src/projects/queue-manager.ts` | QueueSection including review | ✓ VERIFIED | `QueueSection = "available" \| "claimed" \| "review" \| "done" \| "blocked"` at line 33; `SECTION_HEADINGS` includes `review: "Review"`; serialization sections array includes "review" |
| `src/projects/checkpoint.ts` | CheckpointData has optional verification field | ✓ VERIFIED | `verification?: VerificationRecord` at line 20, imported from `./verification.js` |
| `src/hooks/bundled/verification-hook.ts` | registerVerificationHook() and handleTaskPreComplete() | ✓ VERIFIED | Both exported; `handleTaskPreComplete` is 100+ lines covering all four verification_type branches and side-effect gating |
| `src/hooks/internal-hooks.ts` | ProjectTaskPreCompleteHookContext type and guard | ✓ VERIFIED | `ProjectTaskPreCompleteHookContext` at line 494; `isProjectTaskPreCompleteEvent` at line 507 |
| `src/projects/task-lifecycle.ts` | completeTask() entry point calling handleTaskPreComplete | ✓ VERIFIED | `completeTask()` calls `handleTaskPreComplete()` at line 46; fires `project:task-complete` only on `outcome === "done"` at line 55 |
| `src/commands/projects.review.ts` | projectsReviewApproveCommand and projectsReviewRejectCommand | ✓ VERIFIED | Both exported; approve moves "review"->"done", updates checkpoint with `status: "approved"`, fires `project:task-complete`; reject moves "review"->"available", strips agent metadata, writes `status: "rejected"` |
| `src/cli/program/register.projects.ts` | CLI review approve/reject subcommands | ✓ VERIFIED | `projects.command("review")` at line 77; `review.command("approve")` and `review.command("reject")` with lazy imports to `../../commands/projects.review.js` |
| `src/gateway/server-methods/projects.ts` | Gateway RPC handlers for review approve/reject | ✓ VERIFIED | `projects.review.approve` handler at line 95; `projects.review.reject` handler at line 136; both lazy-import `projectsReviewApproveCommand`/`projectsReviewRejectCommand` and call `resolveProjectDir` |
| `ui/src/ui/views/projects-board.ts` | Review column with accent, review badges, verification evidence, approve/reject buttons | ✓ VERIFIED | `projects-board-column--review` class applied at line 49; `projects-board-card__review-badge` at line 97; `renderVerificationEvidence()` at line 213; `renderReviewActions()` at line 284 with "Approve Task", "Reject Task", inline rejection confirmation |
| `ui/src/ui/views/projects.ts` | Parent component wiring onReviewApprove/onReviewReject callbacks | ✓ VERIFIED | `onReviewApprove` and `onReviewReject` in `ProjectsProps` at lines 40-41; passed to `renderProjectDashboard` at lines 65-66 |
| `ui/src/styles/projects.css` | CSS classes for review column accent, review badge, verification evidence, action buttons | ✓ VERIFIED | `.projects-board-column--review`, `.projects-board-card__review-badge`, `.projects-peek__verification`, `.projects-review-btn--approve`, `.projects-review-btn--reject`, `.projects-peek__reject-confirm` all present |
| `ui/src/ui/controllers/projects.ts` | QueueIndex with review field, reviewApprove/reviewReject methods | ✓ VERIFIED | `QueueIndex.review: QueueEntry[]` at line 44; `reviewApprove()` at line 222 calls `projects.review.approve` RPC; `reviewReject()` at line 237 calls `projects.review.reject` RPC |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/projects/schemas.ts` | `src/projects/types.ts` | z.infer exports TaskFrontmatter with success_criteria | ✓ WIRED | `SuccessCriterionSchema` exported from schemas.ts; `src/projects/index.ts` re-exports `SuccessCriterionSchema` |
| `src/projects/queue-manager.ts` | `src/projects/queue-parser.ts` | serializeQueue/parseQueue round-trip with review section | ✓ WIRED | `serializeQueue` emits `## Review` heading; `parseQueue` returns `review: parseSectionEntries(...)` |
| `src/hooks/bundled/verification-hook.ts` | `src/projects/verification.ts` | calls runVerification() with task frontmatter | ✓ WIRED | `import { runVerification }` at line 13; called at lines 112 and 131 |
| `src/hooks/bundled/verification-hook.ts` | `src/projects/queue-manager.ts` | moves task via QueueManager.moveTask() | ✓ WIRED | `new QueueManager(projectDir)` at line 68; `qm.moveTask()` called for all three outcome paths |
| `src/hooks/bundled/verification-hook.ts` | `src/projects/checkpoint.ts` | writes verification evidence to checkpoint sidecar | ✓ WIRED | `writeCheckpoint(cpPath, { ...baseCp, verification: record })` in all branches |
| `src/projects/task-lifecycle.ts` | `src/hooks/bundled/verification-hook.ts` | calls handleTaskPreComplete() as the gating function | ✓ WIRED | `import { handleTaskPreComplete }` at line 1; called at line 46 |
| `src/projects/task-lifecycle.ts` | `src/hooks/internal-hooks.ts` | fires project:task-complete after successful Done transition | ✓ WIRED | `triggerInternalHook(createInternalHookEvent("project", "task-complete", ...))` at line 57, inside `if (result.outcome === "done")` |
| `src/cli/program/register.projects.ts` | `src/commands/projects.review.ts` | lazy import in CLI action handler | ✓ WIRED | `await import("../../commands/projects.review.js")` in both approve and reject action handlers |
| `src/commands/projects.review.ts` | `src/projects/queue-manager.ts` | QueueManager.moveTask from review to done/available | ✓ WIRED | `qm.moveTask(taskId, "review", "done")` and `qm.moveTask(taskId, "review", "available")` |
| `src/commands/projects.review.ts` | `src/projects/checkpoint.ts` | writes human_review evidence to checkpoint | ✓ WIRED | `writeCheckpoint(cpPath, checkpoint)` after setting `checkpoint.verification.human_review` |
| `ui/src/ui/views/projects-board.ts` | `ui/src/ui/controllers/projects.ts` | calls controller review methods on button click | ✓ WIRED | `props.onReviewApprove?.(taskId)` and `props.onReviewReject?.(taskId)` in `renderReviewActions()` |
| `ui/src/ui/controllers/projects.ts` | gateway RPC | sends projects.review.approve/reject | ✓ WIRED | `state.client.request("projects.review.approve", ...)` and `state.client.request("projects.review.reject", ...)` |
| `ui/src/ui/views/projects.ts` | `ui/src/ui/views/projects-board.ts` | passes onReviewApprove/onReviewReject in KanbanBoardProps | ✓ WIRED | Props passed through `renderProjectDashboard` -> board render call; `ui/src/ui/app-render.ts` wires `onReviewApprove`/`onReviewReject` to `reviewApprove`/`reviewReject` controller functions |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `projects-board.ts` | `props.checkpoint.verification` | Gateway `projects.board.get` / checkpoint peek RPC -> controller -> prop | `VerificationRecord` written by `handleTaskPreComplete` / `projectsReviewApproveCommand` to real `.checkpoint.json` sidecar files | ✓ FLOWING |
| `projects-board.ts` | `column.tasks` (Review column) | `QueueIndex.review` from gateway `projects.queue.get` -> `QueueManager` -> `ParsedQueue.review` | Real queue.md `## Review` section parsed by `parseQueue()` | ✓ FLOWING |
| `verification-hook.ts` | `parseResult.data` (task frontmatter) | `fs.readFile(taskFilePath)` -> `parseTaskFrontmatter()` | Real task .md files on disk | ✓ FLOWING |
| `task-lifecycle.ts` | `result.outcome` | `handleTaskPreComplete()` return value | Derived from real queue moves and checkpoint writes | ✓ FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED (requires running gateway server and browser for UI flow; CLI commands require real project directory setup). Static analysis confirms all code paths are wired to real queue/checkpoint operations, not mocked returns.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| VER-01 | 03-01-PLAN.md | Each task has a verification_type: automatic, human, external, or mixed | ✓ SATISFIED | `TaskFrontmatterSchema.verification_type` in schemas.ts:68 |
| VER-02 | 03-02-PLAN.md | Automatic verification checks defined success criteria | ✓ SATISFIED | `runVerification()` in verification.ts runs `SuccessCriterion` checks; called from `handleTaskPreComplete()` on `verification_type="automatic"` |
| VER-03 | 03-02-PLAN.md | Human verification creates a checkpoint that pauses execution | ✓ SATISFIED | `handleTaskPreComplete()`: `verification_type="human"` moves to "review" with `human_review: { status: "pending" }` |
| VER-04 | 03-01-PLAN.md, 03-04-PLAN.md | Verification evidence recorded alongside task checkpoint | ✓ SATISFIED | `VerificationRecord` with `checks[]` and `history[]` written to checkpoint sidecar; displayed in peek panel via `renderVerificationEvidence()` |
| VER-05 | 03-02-PLAN.md | A task is not marked "done" until verification passes | ✓ SATISFIED | `completeTask()` only fires `project:task-complete` on `outcome === "done"`; failed verification routes to "available" |
| HIL-01 | 03-01-PLAN.md | Tasks classified by side_effect_class: none, reversible, irreversible | ✓ SATISFIED | `TaskFrontmatterSchema.side_effect_class: z.enum(["none","reversible","irreversible"])` at schemas.ts:70 |
| HIL-02 | 03-02-PLAN.md | Tasks with side_effect_class "none" or "reversible" auto-proceed without human approval | ✓ SATISFIED | `handleTaskPreComplete()`: `needsHumanGate = sideEffectClass === "irreversible" || approvalRequired`; false for none/reversible -> moves directly to "done" |
| HIL-03 | 03-02-PLAN.md | Tasks with side_effect_class "irreversible" or approval_required=true pause for human confirmation | ✓ SATISFIED | `needsHumanGate = true` routes to "review" with pending human_review |
| HIL-04 | 03-03-PLAN.md, 03-04-PLAN.md | Human checkpoints present task, planned action, and potential consequences for informed approval | ✓ SATISFIED | CLI: `projectsReviewApproveCommand`/`projectsReviewRejectCommand` record `reviewer`, `notes`, `reviewed_at`. UI: peek panel renders verification evidence, approve/reject buttons with inline confirmation |

All 9 Phase 3 requirements (VER-01 through VER-05, HIL-01 through HIL-04) satisfied.

**Note:** The prompt specified verifying VER-01, VER-04, HIL-01, HIL-04 as the focal requirement IDs. All four are fully satisfied. The other five Phase 3 requirements (VER-02, VER-03, VER-05, HIL-02, HIL-03) are also verified as they are delivered by the same plan set.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `ui/src/ui/views/projects-board.ts` | 23 | `let rejectConfirmTaskId: string \| null = null` (module-level mutable state) | ℹ️ Info | Multiple board instances would share reject confirmation state; noted in Summary as "future improvement" for loading/feedback states. Not a correctness blocker for the phase goal. |

No stubs detected. All data paths flow to real queue/checkpoint operations.

### Human Verification Required

#### 1. Board UI Review Column End-to-End Flow

**Test:** Start the gateway, open the board UI, create a task with `verification_type: human`, move it to the review queue section, open the board, click the task to expand the peek panel, and click "Approve Task"
**Expected:** Review column shows with yellow warn-accent header border, card shows "Needs Review" badge, peek panel shows "Awaiting human review" status, "Approve Task" button moves task to Done column, "Reject Task" shows inline confirmation with "Yes, Reject" / "Keep Task" buttons
**Why human:** Visual rendering correctness (CSS accent, badge color, SVG icons), RPC round-trip behavior after button click, and SPA deep-route navigation cannot be verified programmatically

### Gaps Summary

No gaps found. All phase goals are achieved.

---

## Summary

Phase 3 (Verification & Human-in-the-Loop) is fully implemented. All five observable truths are verified:

1. **Verification types** — `TaskFrontmatterSchema` declares all four `verification_type` values; `handleTaskPreComplete()` branches on each.
2. **Automatic check execution** — `runVerification()` runs `SuccessCriterion` entries (file_exists and command), returns evidence-rich `VerificationResult`, stored in checkpoint sidecar.
3. **Irreversible action gating** — `side_effect_class=irreversible` or `approval_required=true` routes completed tasks to "review" queue, not "done", with `human_review.status="pending"`.
4. **None/reversible auto-proceed** — `needsHumanGate` logic correctly bypasses human gate for low-risk tasks.
5. **Done gate** — `completeTask()` is the single entry point; `project:task-complete` hook only fires when `handleTaskPreComplete()` returns `outcome="done"`.

The CLI (`openclaw projects review approve/reject`), gateway RPC (`projects.review.approve/reject`), and board UI (Review column, peek panel evidence, approve/reject buttons) are all wired end-to-end. Nine Phase 3 requirements are satisfied.

One item requires human visual verification: the Review column UI rendering and interactive approve/reject flow in the browser.

---

_Verified: 2026-03-29T23:00:00Z_
_Verifier: Claude (gsd-verifier)_
