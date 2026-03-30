---
phase: 04-recovery-resumability
plan: 01
subsystem: projects
tags: [recovery, types, strategy, checkpoint, zod, backoff]

requires:
  - phase: 02-orchestrator-decomposition-queue-integration
    provides: orchestrator with MAX_DECOMPOSITION_DEPTH, task decomposition pipeline
provides:
  - FailureCategory, RecoveryStrategy, FailTaskOpts, FailTaskResult types
  - selectRecoveryStrategy pure function implementing D-01 fixed priority chain
  - BACKOFF_MS, DEFAULT_MAX_RETRIES, MAX_DECOMPOSITION_DEPTH exported constants
  - CheckpointData extended with recovery tracking fields (backward compatible)
  - ProjectFrontmatterSchema with max_task_retries and recovery_token_budget
affects: [04-02-recovery-manager, 04-03-heartbeat-gate, 04-04-resume-scanner]

tech-stack:
  added: []
  patterns: [fixed-priority-recovery-chain, backward-compatible-checkpoint-defaults]

key-files:
  created:
    - src/projects/recovery-types.ts
    - src/projects/recovery-types.test.ts
  modified:
    - src/projects/checkpoint.ts
    - src/projects/schemas.ts

key-decisions:
  - "BACKOFF_MS values [5s, 25s, 2m, 10m] match delivery-queue-recovery pattern for consistency"
  - "readCheckpoint applies defaults via spread for backward compat with old checkpoint files"
  - "MAX_DECOMPOSITION_DEPTH exported from recovery-types (value 2) to avoid importing from orchestrator"

patterns-established:
  - "Recovery strategy chain: retry->decompose->reroute->escalate with skip conditions"
  - "Checkpoint backward compat: spread defaults before parsed data"

requirements-completed: [REC-01, REC-02, REC-03, REC-04, REC-05, RSM-01]

duration: 2min
completed: 2026-03-30
---

# Phase 04 Plan 01: Recovery Type Foundations Summary

**Recovery strategy selection function with 4-step priority chain (retry, decompose, reroute, escalate), checkpoint recovery tracking fields, and project-level recovery budget schema**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-30T01:03:40Z
- **Completed:** 2026-03-30T01:06:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created pure selectRecoveryStrategy function implementing D-01 fixed priority chain with correct skip conditions for each strategy
- Extended CheckpointData with 5 recovery tracking fields (recovery_attempts, last_attempted_at, cumulative_tokens, failure_category, failure_reason)
- Extended ProjectFrontmatterSchema with max_task_retries (default 3) and recovery_token_budget (default null)
- All 70 existing + new tests pass, backward compatibility maintained

## Task Commits

Each task was committed atomically:

1. **Task 1: Create recovery-types.ts with strategy selection and types** - `29dc8647d` (feat)
2. **Task 2: Extend CheckpointData and ProjectFrontmatterSchema with recovery fields** - `c6d0673b3` (feat)

_Note: Task 1 used TDD (RED+GREEN combined commit since module didn't exist yet)_

## Files Created/Modified
- `src/projects/recovery-types.ts` - FailureCategory, RecoveryStrategy types, selectRecoveryStrategy function, BACKOFF_MS/DEFAULT_MAX_RETRIES/MAX_DECOMPOSITION_DEPTH constants
- `src/projects/recovery-types.test.ts` - 9 tests covering all 4 strategy paths, constants, and edge cases
- `src/projects/checkpoint.ts` - CheckpointData extended with 5 recovery fields, backward-compatible readCheckpoint
- `src/projects/schemas.ts` - ProjectFrontmatterSchema with max_task_retries and recovery_token_budget

## Decisions Made
- BACKOFF_MS values [5s, 25s, 2m, 10m] match delivery-queue-recovery pattern for consistency across the codebase
- readCheckpoint uses spread-based defaults for backward compat (old checkpoint files without recovery fields still parse correctly)
- MAX_DECOMPOSITION_DEPTH re-exported from recovery-types.ts (same value as orchestrator.ts) so recovery-manager and heartbeat can reference it without importing orchestrator internals

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All recovery types and schema extensions are in place for Plan 02 (recovery-manager)
- selectRecoveryStrategy is ready to be called from failTask and heartbeat gate
- CheckpointData recovery fields are ready for the recovery manager to read/write

---
*Phase: 04-recovery-resumability*
*Completed: 2026-03-30*
