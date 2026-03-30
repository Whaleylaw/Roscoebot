---
phase: 06-progress-observability
plan: 01
subsystem: projects
tags: [workflow-index, sync-service, progress-counts, json-index]

requires:
  - phase: 01-schema-workflow-foundation
    provides: WorkflowFrontmatter schema, parseWorkflowFrontmatter, TaskFrontmatter.workflow field
  - phase: 02-orchestrator-decomposition-queue-integration
    provides: SyncService, index-generator, sync-types infrastructure
provides:
  - WorkflowProgressCounts, WorkflowIndex, WorkflowSummary types
  - generateWorkflowIndex and generateWorkflowSummary functions
  - SyncService workflows/ watcher with incremental index regeneration
  - BoardTaskEntry.workflow field in board index
  - workflow:changed SyncEvent variant
affects: [06-02, 06-03, status-command, gateway-rpc, board-ui]

tech-stack:
  added: []
  patterns: [workflow progress counting via task status map, incremental workflow index regeneration]

key-files:
  created: []
  modified:
    - src/projects/sync-types.ts
    - src/projects/index-generator.ts
    - src/projects/index-generator.test.ts
    - src/projects/sync-service.ts
    - src/projects/sync-service.test.ts

key-decisions:
  - "Progress total uses frontmatter.tasks.length (not taskStatuses.size) so total matches declared task list"
  - "Workflow index files at .index/workflows/WF-NNN.json, summary at .index/workflows.json"
  - "regenerateWorkflowSummary reads all individual WF-*.json files to rebuild summary (consistent with board pattern)"

patterns-established:
  - "Workflow progress counting: done/claimed/review/blocked/available from task status map"
  - "Incremental workflow index: processUpdate handles workflows/ branch alongside tasks/ branch"

requirements-completed: [PRG-01, PRG-02]

duration: 4min
completed: 2026-03-30
---

# Phase 06 Plan 01: Workflow Index Infrastructure Summary

**Workflow index generation with progress counts, SyncService watcher, and board task workflow field**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-30T14:16:23Z
- **Completed:** 2026-03-30T14:20:51Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- WorkflowProgressCounts, WorkflowIndex, WorkflowSummary types added to sync-types.ts with workflow:changed SyncEvent variant
- generateWorkflowIndex computes done/claimed/review/blocked/available counts from task statuses
- generateAllIndexes extended to read workflows/ directory and write .index/workflows/ JSON files on full reindex
- SyncService processUpdate handles workflows/WF-NNN.md changes incrementally (create, update, delete)
- BoardTaskEntry now includes workflow field populated from TaskFrontmatter

## Task Commits

Each task was committed atomically:

1. **Task 1: Add workflow types and generateWorkflowIndex/generateWorkflowSummary** - `cf807a87e` (feat)
2. **Task 2: Wire SyncService to watch workflows/ and regenerate workflow indexes incrementally** - `6da744350` (feat)

## Files Created/Modified
- `src/projects/sync-types.ts` - Added WorkflowProgressCounts, WorkflowIndex, WorkflowSummary types, workflow:changed event, BoardTaskEntry.workflow
- `src/projects/index-generator.ts` - Added generateWorkflowIndex, generateWorkflowSummary, extended generateAllIndexes with workflow step
- `src/projects/index-generator.test.ts` - Added 12 workflow-related tests (progress counts, summary, board workflow field, generateAllIndexes)
- `src/projects/sync-service.ts` - Added workflows/ handler in processUpdate, regenerateWorkflowSummary method
- `src/projects/sync-service.test.ts` - Added 4 workflow incremental indexing tests

## Decisions Made
- Progress total uses frontmatter.tasks.length so total matches the declared task list even if some statuses are missing
- Workflow index files stored at .index/workflows/WF-NNN.json with summary at .index/workflows.json (mirrors tasks/ pattern)
- regenerateWorkflowSummary reads all individual WF-*.json files from the workflows index directory to rebuild summary

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Workflow index data layer complete, ready for Plan 02 (status command and RPC endpoints) to consume
- .index/workflows/ JSON files provide the data source for progress display

## Self-Check: PASSED

---
*Phase: 06-progress-observability*
*Completed: 2026-03-30*
