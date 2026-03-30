# Phase 6: Progress & Observability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 06-progress-observability
**Areas discussed:** Status command output, Index surface design, Gateway RPC methods, Board task grouping

---

## Status Command Output

| Option | Description | Selected |
|--------|-------------|----------|
| Inline workflow section | Add a 'Workflows' section to existing project status output showing each workflow's status, task progress, and any blockers | ✓ |
| Separate workflow command | New `openclaw project workflow-status` command with detailed per-workflow view | |
| Both | Summary table in project status + detailed view in a separate workflow-status subcommand | |

**User's choice:** Inline workflow section
**Notes:** Consistent with existing output pattern, minimal change.

### Follow-up: Detail level

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal | Just workflow ID/title, status, and progress ratio | |
| Include blockers | Add a 'Blockers' column showing count of blocked/review tasks per workflow | ✓ |
| You decide | Claude picks based on existing table patterns | |

**User's choice:** Include blockers

### Follow-up: JSON depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full details | JSON includes workflow ID, title, status, goal, task list with per-task status, progress counts, blockers | ✓ |
| Summary only | JSON mirrors the table: workflow ID, status, progress ratio, blocker count | |
| You decide | Claude picks based on existing --json patterns | |

**User's choice:** Full details

### Follow-up: Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Active only | Show active and paused workflows by default; completed/failed in --json only | ✓ |
| Show all | Show every workflow regardless of status | |
| You decide | Claude picks based on existing filtering patterns | |

**User's choice:** Active only

---

## Index Surface Design

| Option | Description | Selected |
|--------|-------------|----------|
| Workflow index files | Add .index/workflows/WF-NNN.json per workflow plus .index/workflows.json summary. SyncService watches workflows/ dir. | ✓ |
| Embed in project.json | Add a 'workflows' array to the existing project.json index | |
| You decide | Claude picks based on existing index architecture | |

**User's choice:** Workflow index files

### Follow-up: Index data

| Option | Description | Selected |
|--------|-------------|----------|
| Computed progress | Include frontmatter fields PLUS computed progress: total tasks, done count, blocked count, review count, claimed count | ✓ |
| Raw frontmatter only | Mirror workflow YAML frontmatter, consumers compute progress themselves | |
| You decide | Claude picks | |

**User's choice:** Computed progress

### Follow-up: Sync events

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add workflow events | Add 'workflow:changed' to SyncEvent union. Gateway WebSocket pushes to UI. | ✓ |
| No, piggyback on existing events | Workflow changes trigger existing task/queue events indirectly | |
| You decide | Claude picks | |

**User's choice:** Yes, add workflow events

---

## Gateway RPC Methods

| Option | Description | Selected |
|--------|-------------|----------|
| List + Get | projects.workflows.list and projects.workflows.get. Mirrors existing pattern. | ✓ |
| List + Get + Progress | Same plus a dedicated projects.workflows.progress endpoint | |
| You decide | Claude picks | |

**User's choice:** List + Get

### Follow-up: Data source

| Option | Description | Selected |
|--------|-------------|----------|
| Index files | Read from .index/workflows/ for fast responses. Consistent with existing pattern. | ✓ |
| Direct file reads | Read workflow/task markdown files directly, compute on the fly | |
| You decide | Claude picks | |

**User's choice:** Index files

---

## Board Task Grouping

| Option | Description | Selected |
|--------|-------------|----------|
| Workflow badge on tasks | Each task card shows a small [WF-NNN] tag if it belongs to a workflow. No grouping. | ✓ |
| Grouped by workflow | Tasks within a column visually grouped under workflow header. Swim-lane style. | |
| No board changes | Board stays as-is. Workflow progress only in status command and .index. | |

**User's choice:** Workflow badge on tasks

### Follow-up: Progress summary

| Option | Description | Selected |
|--------|-------------|----------|
| Badge only | Just the workflow tag on task cards. Progress summary in status command. | ✓ |
| Add progress header | Compact progress bar per active workflow above board columns | |
| You decide | Claude picks | |

**User's choice:** Badge only

---

## Claude's Discretion

- WorkflowIndex and WorkflowSummary type shapes
- generateWorkflowIndex() implementation details
- SyncService watcher registration for workflows/ directory
- Exact RPC handler implementation
- Badge rendering implementation
- Whether workflows.json summary includes aggregate stats

## Deferred Ideas

None -- discussion stayed within phase scope
