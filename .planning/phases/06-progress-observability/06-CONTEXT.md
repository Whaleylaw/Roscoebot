# Phase 6: Progress & Observability - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can see workflow progress and status through existing board/queue/.index surfaces and status commands. This phase delivers workflow index generation, status command workflow output, gateway RPC workflow endpoints, and board task workflow badges. It does NOT deliver new UI pages, workflow execution timeline visualization (v2 OBS-01), token tracking (v2 OBS-02), or decomposition metrics (v2 OBS-03).

</domain>

<decisions>
## Implementation Decisions

### Status Command Output

- **D-01:** Inline workflow section in existing `project status` command. Add a "Workflows" table showing workflow ID/title, status, progress ratio (N/M done), and blocker count. No separate workflow-status command.
- **D-02:** Active and paused workflows only in default text output. Completed/failed workflows are filtered out of the table but included in `--json` output.
- **D-03:** `--json` output includes full workflow details: workflow ID, title, status, goal, task list with per-task status, progress counts (done/claimed/review/blocked/available), and blocker details.

### Index Surface Design

- **D-04:** Workflow index files follow the existing task index pattern. `.index/workflows/WF-NNN.json` per workflow plus `.index/workflows.json` summary file. SyncService watches workflows/ directory for changes and regenerates indexes.
- **D-05:** Individual workflow index files include computed progress alongside frontmatter: total tasks, done count, blocked count, review count, claimed count, available count. One read gives the full picture without joining task files.
- **D-06:** `workflow:changed` SyncEvent added to the discriminated union in `sync-types.ts`. SyncService emits it when workflow files change. Gateway WebSocket pushes to connected UI clients.

### Gateway RPC Methods

- **D-07:** Two new RPC methods: `projects.workflows.list` (all workflows with summary progress for a project) and `projects.workflows.get` (single workflow with full task breakdown). Follow existing `projects.board.get` / `projects.queue.get` handler pattern.
- **D-08:** RPC methods read from `.index/workflows/` files for fast responses. Index is kept fresh by SyncService, consistent with how other gateway project endpoints read from .index.

### Board Task Display

- **D-09:** Workflow badge on task cards. Each task that belongs to a workflow shows a `[WF-NNN]` tag on its board card. No task grouping by workflow, no swim lanes, no progress header.
- **D-10:** Board stays task-focused. Workflow progress summary lives in the status command and .index files, not on the board.

### Claude's Discretion

- WorkflowIndex and WorkflowSummary type shapes (fields, naming)
- generateWorkflowIndex() implementation details
- SyncService watcher registration for workflows/ directory
- Exact RPC handler implementation within the established pattern
- Badge rendering implementation within existing board card components
- Whether workflows.json summary is a flat list or includes aggregate stats

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Index System (extend these)

- `src/projects/index-generator.ts` -- generateProjectIndex, generateTaskIndex, generateBoardIndex, generateQueueIndex. Add generateWorkflowIndex.
- `src/projects/sync-types.ts` -- SyncEvent union, ProjectIndex, TaskIndex, BoardIndex, QueueIndex types. Add WorkflowIndex, WorkflowSummary, workflow:changed event.
- `src/projects/sync-service.ts` -- SyncService with file watchers and index regeneration. Add workflows/ watcher and workflow index generation.

### Status Command (extend this)

- `src/commands/projects.status.ts` -- projectsStatusCommand with text/JSON output. Add workflow section to both outputs.

### Gateway RPC (extend these)

- `src/gateway/server-methods/projects.ts` -- projectsHandlers with list/get/board/queue/review methods. Add workflows.list and workflows.get.
- `src/gateway/server-projects.ts` -- ProjectGatewayService interface. Add getWorkflows/getWorkflow methods.

### Workflow System (read from these)

- `src/projects/frontmatter.ts` -- parseWorkflowFrontmatter for reading workflow files
- `src/projects/types.ts` -- WorkflowFrontmatter type
- `src/projects/schemas.ts` -- WorkflowFrontmatterSchema
- `src/hooks/bundled/workflow-status-hook.ts` -- readWorkflowTaskStatuses shared helper (already reads workflow + task statuses)

### Board UI (extend these)

- `ui/src/ui/views/projects-board.ts` -- Board rendering with task cards. Add workflow badge to card rendering.
- `src/projects/index-generator.ts` -- BoardTaskEntry type. May need workflow field added.

### Prior Phase Context

- `.planning/phases/02-orchestrator-decomposition-queue-integration/02-CONTEXT.md` -- D-16 (event hook for workflow status), D-10 (heartbeat monitoring), D-14 (batch task creation with workflow linkage)
- `.planning/phases/03-verification-human-in-the-loop/03-CONTEXT.md` -- D-07 (Review queue section), D-06 (board-visible review)

### Requirements

- `.planning/REQUIREMENTS.md` -- PRG-01, PRG-02, PRG-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `readWorkflowTaskStatuses()` in `workflow-status-hook.ts` -- Already reads a workflow file and collects all linked task statuses. Reuse for computing workflow progress in index generation.
- `generateQueueIndex()` / `generateBoardIndex()` in `index-generator.ts` -- Pattern to follow for `generateWorkflowIndex()`.
- `renderTable()` in `src/terminal/table.ts` -- Used by existing status command for task counts and active agents. Reuse for workflow table.
- `projectsHandlers` in `server-methods/projects.ts` -- Follow existing handler pattern (service null check, param validation, delegate to service).
- `BoardTaskEntry` in `sync-types.ts` -- May need a `workflow` field added for board badge rendering.

### Established Patterns

- Index files generated by `index-generator.ts`, triggered by `SyncService` on file changes
- SyncEvent discriminated union for event-driven UI updates via WebSocket
- Gateway RPC handlers delegate to `ProjectGatewayService` methods
- Status command uses `renderTable()` with columns/rows pattern, supports `--json` via `runtime.writeJson()`
- Board UI built with Lit web components in `ui/src/ui/views/`

### Integration Points

- `SyncEvent` type union -- Add `workflow:changed` variant
- `SyncService` -- Add watcher for workflows/ directory, add workflow index regeneration
- `index-generator.ts` -- Add `generateWorkflowIndex()` and `WorkflowIndex` type
- `sync-types.ts` -- Add `WorkflowIndex` and `WorkflowSummary` types
- `projects.status.ts` -- Add workflow table section and JSON workflow data
- `server-methods/projects.ts` -- Add `projects.workflows.list` and `projects.workflows.get` handlers
- `server-projects.ts` -- Add workflow methods to `ProjectGatewayService`
- Board UI task card component -- Add workflow badge rendering
- `BoardTaskEntry` -- Add optional `workflow` field

</code_context>

<specifics>
## Specific Ideas

- The inline workflow table in status command mirrors the existing task counts table pattern -- consistent user experience.
- Computed progress in workflow index files means UI and RPC consumers get a complete picture in one read, without needing to join across task indexes.
- Workflow badge `[WF-NNN]` on board cards is the lightest possible board change that satisfies PRG-01's "visible through existing board surfaces" requirement.
- The `readWorkflowTaskStatuses()` helper already does the heavy lifting of reading a workflow and collecting task statuses -- index generation can build on this.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 06-progress-observability*
*Context gathered: 2026-03-30*
