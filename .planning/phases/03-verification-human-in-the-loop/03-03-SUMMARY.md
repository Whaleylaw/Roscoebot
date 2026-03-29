---
phase: 03-verification-human-in-the-loop
plan: 03
subsystem: cli, gateway
tags: [review, approve, reject, queue, checkpoint, human-in-the-loop, rpc]

requires:
  - phase: 03-01
    provides: "review queue section, VerificationRecord with human_review, QueueManager.moveTask"
provides:
  - "CLI commands: openclaw projects review approve/reject"
  - "Gateway RPC: projects.review.approve, projects.review.reject"
  - "Human review evidence recording in checkpoint sidecar"
affects: [03-04, ui-board-review]

tech-stack:
  added: []
  patterns: [review-approve-reject-pattern, gateway-rpc-lazy-import]

key-files:
  created:
    - src/commands/projects.review.ts
    - src/commands/projects.review.test.ts
  modified:
    - src/cli/program/register.projects.ts
    - src/gateway/server-methods/projects.ts
    - src/gateway/server-projects.ts

key-decisions:
  - "Reject strips agent/claimed metadata via second queue pass after moveTask (no QueueManager API change needed)"
  - "Gateway RPC uses lazy import of command module for consistent startup cost"

patterns-established:
  - "Review command pattern: move task in queue, update checkpoint with human_review evidence, fire hook"

requirements-completed: [HIL-04]

duration: 6min
completed: 2026-03-29
---

# Phase 03 Plan 03: CLI Review Commands & Gateway RPC Summary

**CLI approve/reject commands and gateway RPC methods for human review of tasks in the Review queue section**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-29T20:53:10Z
- **Completed:** 2026-03-29T20:58:46Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Implemented `projectsReviewApproveCommand` and `projectsReviewRejectCommand` with full checkpoint evidence recording
- Registered CLI subcommands: `openclaw projects review approve/reject TASK-ID --project DIR`
- Added gateway RPC handlers (`projects.review.approve`, `projects.review.reject`) for UI board consumption
- 10 tests covering approve, reject, error cases, hook firing, and metadata stripping

## Task Commits

Each task was committed atomically:

1. **Task 1: Create review approve/reject command implementation** - `089bd0ba5` (feat, TDD)
2. **Task 2: Register CLI subcommands and add gateway RPC methods** - `7cb556902` (feat)

_TDD RED commit: `6f1a5a189` (test)_

## Files Created/Modified
- `src/commands/projects.review.ts` - Review approve/reject command implementations with checkpoint evidence and hook firing
- `src/commands/projects.review.test.ts` - 10 tests covering approve, reject, error, hook, and metadata behaviors
- `src/cli/program/register.projects.ts` - Added review subcommand group with approve/reject under projects
- `src/gateway/server-methods/projects.ts` - Added projects.review.approve and projects.review.reject RPC handlers
- `src/gateway/server-projects.ts` - Added resolveProjectDir method for RPC directory resolution

## Decisions Made
- Reject strips agent/claimed metadata via a second queue read-write pass after moveTask, avoiding changes to QueueManager's public API
- Gateway RPC handlers use lazy import of the command module (consistent with existing CLI pattern)
- Used INVALID_REQUEST error code for runtime errors in RPC handlers since no INTERNAL code exists

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added resolveProjectDir to ProjectGatewayService**
- **Found during:** Task 2 (Gateway RPC methods)
- **Issue:** Gateway RPC handlers need to resolve project name to directory path; no such method existed
- **Fix:** Added `resolveProjectDir(name)` method that checks directory existence and returns path or null
- **Files modified:** src/gateway/server-projects.ts
- **Verification:** TypeScript compiles, method used by both RPC handlers
- **Committed in:** 7cb556902 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for gateway RPC to function. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all data paths are wired to real queue/checkpoint operations.

## Next Phase Readiness
- Review approve/reject commands ready for Plan 04 board UI integration
- Gateway RPC methods available for WebSocket consumption by control UI
- Human review evidence pattern established for checkpoint sidecar

---
*Phase: 03-verification-human-in-the-loop*
*Completed: 2026-03-29*
