---
phase: 04-recovery-resumability
plan: 02
subsystem: projects
tags: [recovery, manager, failTask, retry, escalate, checkpoint, queue, notifyUser]

requires:
  - phase: 04-recovery-resumability
    plan: 01
    provides: selectRecoveryStrategy, recovery types, CheckpointData recovery fields, ProjectFrontmatterSchema max_task_retries
provides:
  - executeRecoveryStrategy function that executes selected recovery action
  - RecoveryContext and NotifyUserFn exported types
  - computeDecompositionDepth helper for parent chain depth
  - failTask entry point in task-lifecycle.ts parallel to completeTask
  - project:task-failed hook event with recoveryOutcome context
affects: [04-03-heartbeat-gate, 04-04-resume-scanner]

tech-stack:
  added: []
  patterns: [recovery-chain-executor, notify-user-stub-for-gateway-wiring, hook-after-state-update]

key-files:
  created:
    - src/projects/recovery-manager.ts
    - src/projects/recovery-manager.test.ts
  modified:
    - src/projects/task-lifecycle.ts
    - src/projects/task-lifecycle.test.ts

key-decisions:
  - "notifyUser is an injectable dependency (NotifyUserFn) with log-only default stub, to be wired to gateway sessions_send in Phase 5"
  - "Decompose and reroute strategies are v1 stubs that move to blocked and notify user (require LLM decomposition and gateway agent registry respectively)"
  - "Hook fires AFTER executeRecoveryStrategy so handlers see updated checkpoint state including recovery_attempts and status"
  - "alternateAgentAvailable hardcoded to false for v1 (reroute requires gateway config access)"

patterns-established:
  - "Recovery execution: read checkpoint + project config, select strategy, execute action, update state"
  - "failTask as single entry point for failure: recovery first, then observability hook"
  - "Injectable notifyUser for testability and future gateway wiring"

requirements-completed: [REC-01, REC-02, REC-03, REC-04, REC-05]

duration: 8min
completed: 2026-03-30
---

# Phase 04 Plan 02: Recovery Manager and failTask Entry Point Summary

**Recovery chain executor with retry-to-available, escalate-to-blocked+notifyUser, and failTask as single entry point firing observability hooks after checkpoint state update**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-30T01:08:24Z
- **Completed:** 2026-03-30T01:16:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Implemented executeRecoveryStrategy that reads checkpoint and project config, calls selectRecoveryStrategy, and executes the chosen action
- Retry action increments recovery_attempts, updates checkpoint, and moves task from claimed to available
- Escalate action updates checkpoint to blocked status and calls notifyUser stub (D-04)
- Decompose and reroute are v1 stubs that move to blocked and call notifyUser (acknowledged limitation)
- Added failTask to task-lifecycle.ts as single entry point parallel to completeTask
- failTask fires project:task-failed hook AFTER recovery execution so handlers see updated state
- All 16 tests pass (7 recovery-manager + 9 task-lifecycle including 4 new failTask tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create recovery-manager.ts with executeRecoveryStrategy** - `a0edc16fa` (test + feat, TDD RED then GREEN)
2. **Task 2: Add failTask entry point to task-lifecycle.ts** - `55c9e8ce8` (feat)

_Note: Task 1 had a separate RED commit (a8e565fb0) for failing tests before GREEN implementation_

## Files Created/Modified
- `src/projects/recovery-manager.ts` - executeRecoveryStrategy, RecoveryContext, NotifyUserFn, computeDecompositionDepth
- `src/projects/recovery-manager.test.ts` - 7 tests covering retry, escalate, permanent skip, max_task_retries, decomposition depth, notifyUser calls
- `src/projects/task-lifecycle.ts` - failTask function, FailTaskOpts/FailTaskResult types
- `src/projects/task-lifecycle.test.ts` - 4 new tests for failTask delegation, hook ordering, recoveryOutcome in context

## Decisions Made
- notifyUser is injectable (NotifyUserFn type) with a log-only default stub for testing and future gateway wiring
- Decompose/reroute are v1 stubs that effectively escalate (move to blocked + notify) with TODO markers for Phase 5
- Hook fires AFTER recovery execution to ensure handlers see updated checkpoint state (recovery_attempts, failure_category, status)
- alternateAgentAvailable hardcoded to false for v1 since reroute requires gateway agent registry access

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test expectations for strategy chain priority**
- **Found during:** Task 1 (recovery-manager tests)
- **Issue:** Tests expected escalate outcome with maxRetries=0 but decompose was selected first (depth 0 < MAX_DECOMPOSITION_DEPTH=2)
- **Fix:** Updated escalate tests to set up deep parent chains (depth >= 2) so decompose is also skipped
- **Files modified:** src/projects/recovery-manager.test.ts
- **Verification:** All 7 tests pass
- **Committed in:** a0edc16fa (part of Task 1 commit)

**2. [Rule 1 - Bug] Fixed PROJECT.md frontmatter injection in tests**
- **Found during:** Task 1 (max_task_retries test)
- **Issue:** Test prepended max_task_retries to frontmatter but schema already generated default value, causing YAML to use last occurrence (3)
- **Fix:** Changed to regex replace of existing max_task_retries value instead of prepend
- **Files modified:** src/projects/recovery-manager.test.ts
- **Verification:** max_task_retries test passes correctly
- **Committed in:** a0edc16fa (part of Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs in tests)
**Impact on plan:** Both fixes necessary for test correctness. No scope creep.

## Issues Encountered

None beyond the test adjustments documented above.

## Known Stubs

- `src/projects/recovery-manager.ts:53` - defaultNotifyUser is a log-only stub. TODO: Wire to gateway sessions_send in Phase 5.
- `src/projects/recovery-manager.ts:148` - alternateAgentAvailable hardcoded to false. TODO: Read from gateway agent registry.
- `src/projects/recovery-manager.ts:165-178` - Decompose action is a stub that moves to blocked instead of performing LLM decomposition. TODO: Wire to Phase 5 intake.
- `src/projects/recovery-manager.ts:180-197` - Reroute action is a stub that moves to blocked instead of re-routing. TODO: Wire to gateway agent registry.

All stubs are intentional v1 limitations documented in the plan and do not prevent the plan's goals from being achieved.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- executeRecoveryStrategy and failTask are in place for Plan 03 (heartbeat gate) and Plan 04 (resume scanner)
- failTask can be called from gateway RPC and agent dispatch
- notifyUser stub ready for gateway integration wiring

---
*Phase: 04-recovery-resumability*
*Completed: 2026-03-30*
