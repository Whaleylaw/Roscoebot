# Phase 4: Recovery & Resumability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 04-recovery-resumability
**Areas discussed:** Recovery strategy selection, Anti-loop budget enforcement, Failure classification, Cross-session resume

---

## Recovery Strategy Selection

### How should the orchestrator pick a recovery strategy on task failure?

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed priority chain | Always try in order: retry -> decompose -> reroute -> escalate. Skip steps that don't apply. Simple, predictable, easy to debug. | Y |
| Failure-type routing | Classification drives strategy directly: transient -> retry, complexity -> decompose, capability mismatch -> reroute, permanent -> escalate. | |
| Orchestrator judgment | LLM reads failure evidence and decides. Most flexible but least predictable. | |

**User's choice:** Fixed priority chain
**Notes:** None

### When should 'decompose' be skipped in the chain?

| Option | Description | Selected |
|--------|-------------|----------|
| At max depth only | Skip decompose if task is already at decomposition depth 2 (DEC-03 limit). | Y |
| Small tasks skip decompose | Skip for estimated_size 'small' tasks. Only decompose 'medium' and 'large'. | |
| You decide | Claude determines skip criteria based on task metadata. | |

**User's choice:** At max depth only
**Notes:** None

### When should 'reroute' be skipped in the chain?

| Option | Description | Selected |
|--------|-------------|----------|
| No alternative agents | Skip if no other agent in agents.list[] has required capabilities. | |
| Same-agent retry first | Always retry with same agent type first. Only reroute if different capability set could handle. | Y |
| You decide | Claude determines reroute eligibility from failure context. | |

**User's choice:** Same-agent retry first
**Notes:** None

### What does escalation look like when the chain exhausts?

| Option | Description | Selected |
|--------|-------------|----------|
| Block + notify | Move to Blocked queue section with evidence. Orchestrator sends summary to user via delegating agent. | Y |
| Block silently | Move to Blocked with evidence. User discovers on board or via status query. | |
| Review queue | Move to Review section (reuse Phase 3 infrastructure). | |

**User's choice:** Block + notify
**Notes:** None

---

## Anti-Loop Budget Enforcement

### Where should anti-loop budget enforcement live?

| Option | Description | Selected |
|--------|-------------|----------|
| Heartbeat scanner gate | Scanner checks retry count before claiming. Budget exhausted -> skip + escalate. Truly outside agent context. | Y |
| Pre-claim hook | New 'project:task-pre-claim' hook fires before claiming. Budget check in hook. | |
| Recovery manager | Standalone module runs on orchestrator heartbeat. Scans failed tasks, checks budgets, routes to recovery. | |

**User's choice:** Heartbeat scanner gate
**Notes:** None

### How should the token ceiling per workflow work?

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable per-project default | PROJECT.md frontmatter has recovery_token_budget. Orchestrator tracks cumulative usage. | Y |
| Fixed global default | Hardcoded default (e.g., 1M tokens). Simpler but less flexible. | |
| Defer token ceiling to v2 | Implement retry count now. Token ceiling harder to track. Defer to v2. | |

**User's choice:** Configurable per-project default
**Notes:** None

### Where should retry count and token usage be tracked?

| Option | Description | Selected |
|--------|-------------|----------|
| Checkpoint sidecar | Extend CheckpointData with recovery_attempts, last_attempted_at, cumulative_tokens. | Y |
| Task frontmatter | Add retry_count and token_used to frontmatter. More visible but frequent mutations. | |
| Separate recovery state file | New .TASK-NNN.recovery.json sidecar. Isolated but another file per task. | |

**User's choice:** Checkpoint sidecar
**Notes:** None

---

## Failure Classification

### Who classifies the failure?

| Option | Description | Selected |
|--------|-------------|----------|
| Agent reports + system overrides | Agent includes failure category. System validates and can override (e.g., budget exhausted). | Y |
| System-only classification | Recovery system examines checkpoint evidence independently. | |
| Agent-only classification | Agents classify own failures. System trusts classification. | |

**User's choice:** Agent reports + system overrides
**Notes:** None

### What failure categories should the system recognize?

| Option | Description | Selected |
|--------|-------------|----------|
| 3 categories | transient, permanent, unknown. Unknown treated as transient for first N attempts, then escalate. | Y |
| 2 categories | retriable and non-retriable. Simpler. | |
| 4+ categories | transient, permanent, complexity, capability-mismatch. More granular routing. | |

**User's choice:** 3 categories
**Notes:** None

---

## Cross-Session Resume

### How should the orchestrator discover interrupted workflows on startup?

| Option | Description | Selected |
|--------|-------------|----------|
| Scan workflow files | Scan workflows/ for status 'active' or 'paused'. Reconstruct from frontmatter + tasks + checkpoints. | Y |
| Workflow registry file | .active-workflows.json registry. Faster but another file to sync. | |
| Queue-driven discovery | Discover workflows through their tasks in the queue. | |

**User's choice:** Scan workflow files
**Notes:** None

### How much context should the orchestrator reconstruct on resume?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: tasks + status | Derive which tasks are done/claimable/blocked. No rebuilding of decomposition reasoning. | Y |
| Full: include failure history | Also rebuild recovery history from checkpoints. More context but heavier startup. | |
| Incremental: diff since last heartbeat | Only process tasks changed since last timestamp. Fastest but fragile. | |

**User's choice:** Minimal: tasks + status
**Notes:** None

### What about partially-claimed tasks when an agent dies mid-execution?

| Option | Description | Selected |
|--------|-------------|----------|
| Timeout-based release | Release after configurable timeout with no checkpoint update. | |
| Agent liveness check | Check if claiming agent is still alive. Release only confirmed-dead claims. | |
| Manual release only | User must manually unblock via CLI. | |

**User's choice:** Other (custom)
**Notes:** The orchestrator's heartbeat (30 min) doubles as a liveness check. If a task is claimed with no activity, the orchestrator sends a message to the agent via sessions_send on the agent's active session. If the agent responds (confirms working or wakes up to resume), the claim is valid. If no response, the task is released back to Available. This elegantly combines health check and recovery action -- the message itself can wake a sleeping agent.

---

## Claude's Discretion

- Retry backoff timing
- Liveness ping timeout duration
- Internal recovery metadata structure in CheckpointData
- Token usage tracking per recovery attempt
- Decompose-on-failure prompt engineering
- Escalation notification message format

## Deferred Ideas

None -- discussion stayed within phase scope
