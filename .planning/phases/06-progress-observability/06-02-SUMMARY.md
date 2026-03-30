---
phase: 06-progress-observability
plan: 02
subsystem: cli
tags: [workflow, status, table, progress, cli-output]

requires:
  - phase: 01-schema-workflow-foundation
    provides: parseWorkflowFrontmatter, parseTaskFrontmatter, WorkflowFrontmatter type
provides:
  - Workflow progress section in project status text output (active/paused filter)
  - Full workflow details in project status JSON output (all statuses, task breakdown)
affects: [06-progress-observability]

tech-stack:
  added: []
  patterns:
    - "Workflow file scan with WF-NNN.md pattern matching"
    - "Per-task status aggregation into progress counts"

key-files:
  created: []
  modified:
    - src/commands/projects.status.ts
    - src/commands/projects.status.test.ts

key-decisions:
  - "Workflow section only renders when workflow files exist (not just workflows/ dir), since scaffold always creates the dir"
  - "in-progress task status maps to claimed count in progress object for consistency with queue terminology"

patterns-established:
  - "Workflow progress aggregation: done/claimed/review/blocked/available counts from task file statuses"

requirements-completed: [PRG-03]

duration: 3min
completed: 2026-03-30
---

# Phase 06 Plan 02: Workflow Status in Project Status Command Summary

**Workflow progress table in `project status` showing active/paused workflows with ID, title, status, done/total progress, and blocker count**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-30T14:16:26Z
- **Completed:** 2026-03-30T14:19:22Z
- **Tasks:** 1 (TDD: RED + GREEN + format)
- **Files modified:** 2

## Accomplishments
- Extended project status command with workflow reading via parseWorkflowFrontmatter
- Text output shows Workflows table with Workflow/Title/Status/Progress/Blocked columns for active/paused workflows
- JSON output includes all workflows (including completed/failed) with per-task status map and progress counts
- Graceful handling of missing workflows dir and unreadable workflow/task files

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Add failing workflow status tests** - `9d2f42a3c` (test)
2. **Task 1 (GREEN): Implement workflow progress section** - `402032e91` (feat)
3. **Task 1 (FORMAT): Apply oxfmt formatting** - `fafc241b0` (chore)

## Files Created/Modified
- `src/commands/projects.status.ts` - Added workflow file reading, progress aggregation, text table output, and JSON workflow data
- `src/commands/projects.status.test.ts` - Added 6 tests covering text output, JSON output, filtering, edge cases

## Decisions Made
- Workflow section only renders when actual WF-NNN.md files exist (not just an empty workflows/ directory), since ProjectManager.create always scaffolds the directory
- Task status "in-progress" maps to "claimed" in progress counts, consistent with queue terminology used elsewhere

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adjusted hasWorkflowsDir guard to also check workflows.length**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** ProjectManager.create always creates workflows/ dir, so hasWorkflowsDir alone would show "No active workflows" for every project even with no workflow files
- **Fix:** Changed condition to `hasWorkflowsDir && workflows.length > 0`
- **Files modified:** src/commands/projects.status.ts
- **Verification:** Test "shows nothing extra when no workflows/ directory exists" passes
- **Committed in:** 402032e91

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor guard condition adjustment for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Workflow progress data now available in both text and JSON output for plan 03 (gateway RPC exposure)
- Progress counts structure (done/claimed/review/blocked/available) established for UI consumption

---
*Phase: 06-progress-observability*
*Completed: 2026-03-30*
