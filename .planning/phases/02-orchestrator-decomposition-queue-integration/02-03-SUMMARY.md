---
phase: 02-orchestrator-decomposition-queue-integration
plan: 03
subsystem: orchestrator
tags: [task-batch, rollback, queue, workflow-update, atomic-operations]

# Dependency graph
requires:
  - phase: 02-orchestrator-decomposition-queue-integration (plans 01, 02)
    provides: generateTaskMd, QueueManager.addTasks, validateTaskGraph, DecomposedTask type, writeFileAtomic
provides:
  - createTaskBatch function for atomic batch task file creation with queue + workflow update
  - CreateTaskBatchOpts and CreateTaskBatchResult types
  - Exported writeFileAtomic from scaffold.ts for reuse
affects: [02-04-orchestrateGoal, queue-heartbeat, agent-dispatch]

# Tech tracking
tech-stack:
  added: []
  patterns: [atomic-batch-creation-with-rollback, orphaned-queue-entries-accepted-pattern]

key-files:
  created: []
  modified:
    - src/projects/orchestrator.ts
    - src/projects/orchestrator.test.ts
    - src/projects/scaffold.ts
    - src/projects/index.ts

key-decisions:
  - "Orphaned queue entries accepted on post-queue/pre-workflow failure -- heartbeat scanner still finds valid task files"
  - "writeFileAtomic exported from scaffold.ts as public utility for reuse by orchestrator"
  - "Batch-local IDs remapped to real sequential TASK-NNN IDs during creation"

patterns-established:
  - "Atomic batch with rollback: create files, add queue entries, update workflow; delete files on any failure"
  - "Orphan acceptance: document and test known partial-failure states rather than adding rollback complexity"

requirements-completed: [QUE-03, QUE-04, ORC-03, DEC-01]

# Metrics
duration: 3min
completed: 2026-03-29
---

# Phase 02 Plan 03: Atomic Batch Task Creation Summary

**createTaskBatch pipeline with sequential ID generation, queue integration, workflow frontmatter update, and file-level rollback on failure**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T15:00:14Z
- **Completed:** 2026-03-29T15:03:31Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 4

## Accomplishments
- createTaskBatch atomically creates task files, adds queue entries, and updates workflow frontmatter
- Rollback deletes created task files on any step failure
- Batch-local dependency IDs remapped to real sequential TASK-NNN IDs
- Orphaned queue entries on post-queue failure documented and tested as accepted behavior
- writeFileAtomic exported from scaffold.ts for reuse

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for createTaskBatch** - `8cac360cc` (test)
2. **Task 1 GREEN: Implement createTaskBatch with rollback** - `8bc3511bc` (feat)

## Files Created/Modified
- `src/projects/orchestrator.ts` - Added createTaskBatch, getNextTaskNum, updateWorkflowTasks, types
- `src/projects/orchestrator.test.ts` - 10 new tests for batch creation, rollback, workflow update, orphan case
- `src/projects/scaffold.ts` - Exported writeFileAtomic (was module-private)
- `src/projects/index.ts` - Added createTaskBatch, writeFileAtomic, CreateTaskBatchOpts, CreateTaskBatchResult exports

## Decisions Made
- Orphaned queue entries accepted on post-queue/pre-workflow failure (heartbeat scanner still works; adding queue rollback adds disproportionate complexity)
- writeFileAtomic exported as public utility rather than duplicating in orchestrator
- Batch-local IDs (e.g. "batch-1") remapped to real IDs during creation via findIndex lookup

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed orphan test approach**
- **Found during:** Task 1 GREEN (test verification)
- **Issue:** chmod 0o444 on workflow file did not prevent writeFileAtomic from succeeding (temp+rename bypasses target permissions)
- **Fix:** Changed test to delete the workflow file entirely so updateWorkflowTasks fails on read (ENOENT)
- **Files modified:** src/projects/orchestrator.test.ts
- **Verification:** Test now correctly verifies orphan behavior -- task files cleaned up, queue entries remain
- **Committed in:** 8bc3511bc (part of GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test approach)
**Impact on plan:** Minimal -- test strategy adjusted, same behavior verified.

## Issues Encountered
None beyond the test approach fix documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- createTaskBatch ready for use by orchestrateGoal in Plan 04
- All queue, template, validation, and batch primitives now complete
- Plan 04 can compose the full orchestration pipeline

---
*Phase: 02-orchestrator-decomposition-queue-integration*
*Completed: 2026-03-29*
