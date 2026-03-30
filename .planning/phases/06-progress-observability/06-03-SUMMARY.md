---
phase: 06-progress-observability
plan: 03
subsystem: gateway
tags: [rpc, websocket, workflow-badge, board-ui, gateway-methods]

requires:
  - phase: 06-progress-observability
    provides: WorkflowIndex, WorkflowSummary types, workflow:changed SyncEvent, .index/workflows/ JSON files
provides:
  - projects.workflows.list and projects.workflows.get RPC handlers
  - WebSocket projects.workflows.changed broadcast on workflow file changes
  - BoardTaskEntry.workflow field in UI controller type
  - [WF-NNN] blue badge on board task cards
affects: [ui-board, gateway-rpc, workflow-observability]

tech-stack:
  added: []
  patterns: [RPC handler delegation to ProjectGatewayService, workflow badge rendering via Lit html template]

key-files:
  created: []
  modified:
    - src/gateway/server-projects.ts
    - src/gateway/server-methods/projects.ts
    - src/gateway/server-methods/projects.test.ts
    - ui/src/ui/controllers/projects.ts
    - ui/src/ui/views/projects-board.ts
    - ui/src/styles/projects.css

key-decisions:
  - "Workflow RPC handlers follow same pattern as board/queue handlers (validate project, delegate to service, null = not found)"
  - "workflows.list returns flattened {workflows, indexedAt} instead of nested summary object for simpler UI consumption"

patterns-established:
  - "Workflow RPC: projects.workflows.list and projects.workflows.get follow existing projects.board.get/projects.queue.get pattern"
  - "Workflow badge: blue info color distinguishes from red (blocked), yellow (review), green (agent) badges"

requirements-completed: [PRG-01, PRG-03]

duration: 3min
completed: 2026-03-30
---

# Phase 06 Plan 03: Gateway RPC Workflow Endpoints and Board Badge Summary

**Gateway RPC workflow list/get endpoints, WebSocket workflow:changed broadcast, and blue [WF-NNN] badge on board task cards**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-30T14:23:25Z
- **Completed:** 2026-03-30T14:26:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Two RPC handlers (projects.workflows.list, projects.workflows.get) expose workflow progress data to the UI
- WebSocket broadcasts projects.workflows.changed when workflow files change via SyncService
- Board task cards render [WF-NNN] blue badge when task belongs to a workflow
- 7 new tests covering all handler success/error/unavailable paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Gateway RPC workflow methods and WebSocket broadcast** - `c559c2e78` (feat)
2. **Task 2: Add workflow badge to board UI task cards** - `c76a2c2b4` (feat)

## Files Created/Modified
- `src/gateway/server-projects.ts` - Added getWorkflows, getWorkflow methods and workflow:changed broadcast case
- `src/gateway/server-methods/projects.ts` - Added projects.workflows.list and projects.workflows.get RPC handlers
- `src/gateway/server-methods/projects.test.ts` - Added 7 tests for workflow list/get handlers
- `ui/src/ui/controllers/projects.ts` - Added workflow field to BoardTaskEntry type
- `ui/src/ui/views/projects-board.ts` - Added workflow badge rendering in card top section
- `ui/src/styles/projects.css` - Added .projects-board-card__workflow-badge styles (blue, monospace)

## Decisions Made
- Workflow RPC handlers follow same pattern as board/queue handlers for consistency
- workflows.list returns flattened {workflows, indexedAt} for simpler UI consumption

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 06 complete: all 3 plans delivered (index infrastructure, status command, gateway RPC + board UI)
- Workflow progress observable via CLI status command, gateway RPC, and board UI badges

## Self-Check: PASSED

---
*Phase: 06-progress-observability*
*Completed: 2026-03-30*
