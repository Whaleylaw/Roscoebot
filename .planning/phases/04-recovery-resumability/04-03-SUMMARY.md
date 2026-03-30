---
phase: 04-recovery-resumability
plan: 03
subsystem: projects
tags: [recovery, heartbeat, budget-gate, backoff, stale-claim, escalation]

requires:
  - phase: 04-recovery-resumability
    plan: 01
    provides: BACKOFF_MS, DEFAULT_MAX_RETRIES, selectRecoveryStrategy, CheckpointData recovery fields
  - phase: 04-recovery-resumability
    plan: 02
    provides: executeRecoveryStrategy, RecoveryContext, failTask entry point
provides:
  - Budget gate in heartbeat scanner preventing infinite retry loops
  - Backoff window check skipping tasks still in cooldown
  - Budget-exhausted escalation to blocked via executeRecoveryStrategy
  - Stale claim detection releasing abandoned tasks back to available
  - STALE_CLAIM_THRESHOLD_MS (30 min) exported constant
  - detectStaleClaims exported function for heartbeat orchestrator
affects: [04-04-resume-scanner, gateway-heartbeat-integration]

tech-stack:
  added: []
  patterns: [budget-gate-in-scanner, async-fire-and-forget-escalation, checkpoint-staleness-proxy]

key-files:
  created: []
  modified:
    - src/projects/heartbeat-scanner.ts
    - src/projects/heartbeat-scanner.test.ts

key-decisions:
  - "Budget-exhausted tasks are escalated to blocked via executeRecoveryStrategy (not silently skipped) to ensure user visibility"
  - "Escalation fired asynchronously (void + catch) to avoid blocking the scan loop"
  - "Stale claim detection uses checkpoint log timestamps as activity proxy; sessions_send liveness ping deferred to gateway integration"
  - "detectStaleClaims is a separate export (not called from scanAndClaimTask) since stale detection and task claiming are independent concerns"

patterns-established:
  - "Budget gate pattern: check recovery_attempts before claiming, escalate on exhaustion"
  - "Checkpoint staleness: most recent log[].timestamp as last activity indicator"
  - "Conservative skip: no checkpoint means task just claimed, don't release"

requirements-completed: [REC-04, REC-05, D-13]

duration: 3min
completed: 2026-03-30
---

# Phase 04 Plan 03: Heartbeat Scanner Budget Gate and Stale Claim Detection Summary

**Anti-loop budget gate with backoff window enforcement, budget-exhausted escalation to blocked, and stale claim detection releasing abandoned tasks after 30 minutes of checkpoint inactivity**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-30T01:19:33Z
- **Completed:** 2026-03-30T01:23:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added budget gate to filterClaimableTasks that skips tasks with recovery_attempts >= max_task_retries and escalates them to blocked via executeRecoveryStrategy
- Added backoff window check using BACKOFF_MS table and last_attempted_at timestamp
- Reads max_task_retries from PROJECT.md frontmatter with DEFAULT_MAX_RETRIES fallback
- Implemented detectStaleClaims function that scans claimed tasks for checkpoint inactivity > 30 min and releases them to available
- All 26 tests pass (14 existing + 6 budget gate + 5 stale claim + 1 integration)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add budget gate, backoff check, and budget-exhausted escalation** - `23cf44f9d` (feat)
2. **Task 2: Add stale claim detection (D-13)** - `d8d6774fc` (feat)

_Note: Both tasks used TDD (RED: failing tests, GREEN: implementation)_

## Files Created/Modified
- `src/projects/heartbeat-scanner.ts` - Budget gate in filterClaimableTasks, detectStaleClaims function, STALE_CLAIM_THRESHOLD_MS constant
- `src/projects/heartbeat-scanner.test.ts` - 11 new tests across budget gate and stale claim detection describe blocks

## Decisions Made
- Budget-exhausted tasks are escalated to blocked via executeRecoveryStrategy (not silently skipped) -- ensures user visibility into permanently failed tasks
- Escalation fires asynchronously with void + catch to avoid blocking the scan loop if recovery-manager is slow
- detectStaleClaims is a separate exported function (not embedded in scanAndClaimTask) since stale detection and task claiming are independent concerns -- the heartbeat orchestrator invokes both
- Stale claim threshold is 30 minutes per D-13; uses checkpoint log timestamps as activity proxy until sessions_send liveness ping is wired

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

- `src/projects/heartbeat-scanner.ts` - detectStaleClaims has TODO for sessions_send liveness ping before releasing. V1 uses checkpoint staleness as proxy. Will be wired when gateway integration is available.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Budget gate and stale claim detection are in place for Plan 04 (resume scanner)
- detectStaleClaims can be called by the heartbeat orchestrator alongside scanAndClaimTask
- All recovery chain components (types, manager, heartbeat gate) are now complete

---
*Phase: 04-recovery-resumability*
*Completed: 2026-03-30*
