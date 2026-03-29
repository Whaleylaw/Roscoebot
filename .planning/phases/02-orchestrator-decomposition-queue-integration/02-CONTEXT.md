# Phase 2: Orchestrator, Decomposition & Queue Integration - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

An orchestrator agent receives a user goal (via sessions_send from any user-facing agent), decomposes it into executable tasks with dependencies, validates the decomposition, and places tasks in the project queue for agents to claim via heartbeat. This phase delivers the orchestrator agent configuration, decomposition logic, task creation pipeline, queue wiring, and capability dispatch. It does NOT deliver verification (Phase 3), recovery (Phase 4), or intake/templates (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Decomposition Strategy

- **D-01:** LLM-driven decomposition. The orchestrator uses its own LLM reasoning to break goals into tasks. No template-matching layer — if the user wants a specific workflow template, they state that in their goal prompt.
- **D-02:** Adaptive depth. The orchestrator judges decomposition depth per-goal based on complexity. Simple goals get flat task lists, complex goals get 2-level hierarchy. Max 2 levels per DEC-03, with decompose-on-failure for deeper breakdown.
- **D-03:** Clarification loop before decomposition. The orchestrator should ask clarifying questions before committing to a task breakdown. Tiered model: ask the delegating agent first (it may have enough context to answer), escalate to the user if the agent can't answer confidently.
- **D-04:** Adaptive clarification rounds. No hard cap on clarification rounds — the orchestrator judges whether remaining ambiguity is critical enough to keep asking. AGENTS.md guidance should say "prefer action over analysis paralysis."
- **D-05:** Full spec per task. Every decomposed task gets all 5 DEC-02 fields filled: objective, context, action guidance, success criteria, and verification method. Higher upfront cost, fewer execution failures.
- **D-06:** Validate before writing. Orchestrator runs sanity checks on its task graph before committing: no circular deps, all capabilities exist in project registry, task count within reasonable bounds, all referenced deps exist.
- **D-07:** Approve unless high-stakes. Auto-proceed for tasks with side_effect_class "none". Present proposed breakdown for user approval when any task is "irreversible" or has approval_required=true.

### Orchestrator Lifecycle

- **D-08:** Pre-configured in repo defaults. Ship orchestrator workspace files (IDENTITY.md, SOUL.md, AGENTS.md) as part of the repo/package. Always present after install, no initialization step.
- **D-09:** sessions_send with structured payload. Main agent sends a structured message (goal, project context, constraints) via sessions_send. Orchestrator processes asynchronously in its own session.
- **D-10:** Heartbeat polling for monitoring. Orchestrator heartbeats on the standard interval (~30min). Reads workflow file + task states, updates workflow status, triggers recovery if needed. Consistent with existing heartbeat pattern.
- **D-11:** Sections in one AGENTS.md. Single orchestrator agent with clearly separated instruction sections: "## Decomposition Standards" and "## Dispatch Policy". One agent, two hats.
- **D-12:** Shared agent, project-scoped sessions. One orchestrator agent definition but separate sessions per project. Same instructions, isolated state per project.
- **D-13:** Static AGENTS.md + project context hook. AGENTS.md is static (decomposition standards, dispatch policy, recovery rules). Project-specific context injected via existing project-context-hook.ts at session start.

### Task Creation & Queue Wiring

- **D-14:** All tasks created at once. Create all TASK-NNN.md files and queue entries in one batch. Tasks with unmet deps sit in Available but aren't claimable — heartbeat scanner already filters by dependency satisfaction.
- **D-15:** Direct ProjectManager/QueueManager. Orchestrator imports and uses existing scaffold and queue modules directly. Same process, atomic file operations via existing locking.
- **D-16:** Event hook for workflow status updates. Task completion triggers a hook that updates the parent workflow file's status. Decoupled from both the completing agent and the orchestrator. Fast propagation without multiple writers.
- **D-17:** Existing queue sections only. No new queue sections. Tasks with unmet deps go to Available (heartbeat skips them). Blocked section used for manual blocks only.
- **D-18:** Single atomic batch operation. Create all task files, add queue entries, and update workflow frontmatter tasks[] list in one atomic batch. If any step fails, roll back.

### Capability Dispatch

- **D-19:** agents.list[] for discovery. Read agent capabilities from existing agents.list[] config. Orchestrator doesn't assign — it creates tasks with capability tags, agents self-select via heartbeat.
- **D-20:** Project-level registry only. Each project defines valid capabilities in PROJECT.md. Adding a new capability = editing PROJECT.md. No global registry, consistent with Phase 1 decisions (D-14/D-16 from Phase 1 context).
- **D-21:** Block creation for unmatched capabilities. Refuse to create tasks with capabilities no current agent can fulfill. Orchestrator offers alternatives: remove capability, split task, or suggest adding an agent. Part of the clarification loop.
- **D-22:** Flat string matching. Capabilities are flat strings matched via ANY-match (existing matchCapabilities()). No hierarchy, wildcards, or proficiency levels.

### Claude's Discretion

- Internal decomposition prompt engineering (how to instruct the LLM to produce good task breakdowns)
- Exact structure of the structured payload sent via sessions_send
- Hook implementation details for D-16 (which hook type, event shape)
- AGENTS.md section organization beyond the two required sections
- Validation bounds (max task count, allowed dep graph complexity)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Project System (extend these)

- `src/projects/schemas.ts` — Zod schemas including WorkflowFrontmatterSchema and extended Task/Project schemas (Phase 1 output)
- `src/projects/types.ts` — Inferred types including WorkflowFrontmatter
- `src/projects/frontmatter.ts` — YAML extraction + Zod validation, parseWorkflowFrontmatter
- `src/projects/templates.ts` — generateWorkflowMd for workflow file creation
- `src/projects/scaffold.ts` — ProjectManager with atomic writes, nextWorkflowId, ensureWorkflowsDir
- `src/projects/queue-manager.ts` — QueueManager with file locking, section management (Available/Claimed/Done/Blocked)
- `src/projects/heartbeat-scanner.ts` — scanAndClaimTask with capability matching, priority sorting, checkpoint resume
- `src/projects/capability-matcher.ts` — matchCapabilities() ANY-match on string arrays
- `src/projects/capability-registry.ts` — validateCapabilities() with STANDARD_CAPABILITIES (Phase 1 output)
- `src/projects/index.ts` — Barrel exports for the projects module

### Agent System (configure orchestrator here)

- `src/agents/workspace.ts` — Agent workspace resolution, IDENTITY.md/SOUL.md/AGENTS.md file constants
- `src/agents/project-context-hook.ts` — Project context injection at session start
- `src/gateway/server-methods/agents.ts` — Gateway agent management methods

### Inter-Agent Communication

- `src/gateway/server.sessions-send.test.ts` — sessions_send test patterns
- `src/gateway/server-methods/agent-timestamp.ts` — Agent timestamp tracking

### Hooks System

- `src/hooks/` — Hook infrastructure for event-driven workflow status updates (D-16)

### Phase 1 Context

- `.planning/phases/01-schema-workflow-foundation/01-CONTEXT.md` — Prior decisions on workflow format, lifecycle, task extensions, capability design

### Requirements

- `.planning/REQUIREMENTS.md` — DEC-01 through DEC-03, QUE-01 through QUE-04, CAP-02, CAP-03, ORC-01 through ORC-05

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `ProjectManager` in `scaffold.ts` — Atomic file writes, directory creation, nextTaskId()/nextWorkflowId(). Extend with batch task creation.
- `QueueManager` in `queue-manager.ts` — Queue read/write with file locking. Use addTask() for queue placement.
- `scanAndClaimTask()` in `heartbeat-scanner.ts` — Already filters by capability match and dependency satisfaction. No changes needed for orchestrator-created tasks.
- `matchCapabilities()` in `capability-matcher.ts` — ANY-match on string arrays. Reuse for dispatch validation.
- `validateCapabilities()` in `capability-registry.ts` — Project-level registry validation. Use during decomposition validation (D-06).
- `parseWorkflowFrontmatter()` in `frontmatter.ts` — Validate workflow files the orchestrator creates.
- `generateWorkflowMd()` in `templates.ts` — Generate workflow file content.

### Established Patterns

- Agent workspaces at `~/.openclaw/workspace-{profile}/` with standard file set (IDENTITY.md, SOUL.md, AGENTS.md, etc.)
- agents.list[] in config defines available agents with capabilities
- sessions_send for inter-agent communication (structured payloads)
- Heartbeat scanner runs periodically, scans queue, claims tasks matching agent capabilities
- File locking via withFileLock() for concurrent queue access
- Project context hook injects PROJECT.md content at agent session start

### Integration Points

- `agents.list[]` config — Add orchestrator agent entry with its capabilities
- Orchestrator workspace — Ship default IDENTITY.md, SOUL.md, AGENTS.md
- `src/projects/scaffold.ts` — Add batch task creation method
- `src/projects/queue-manager.ts` — May need batch queue entry addition
- `src/hooks/` — New hook for task-completion → workflow-status-update (D-16)
- `src/projects/index.ts` — Export new orchestration symbols

</code_context>

<specifics>
## Specific Ideas

- The clarification loop mirrors GSD's discuss-phase pattern: the orchestrator gathers context before committing to a decomposition, similar to how discuss-phase gathers context before planning.
- The orchestrator should be encouraged to ask questions, not just execute. This is a key design philosophy — the system should clarify ambiguity rather than guessing.
- The tiered clarification model (agent first, then user) means the delegating agent acts as a buffer. If the main agent already discussed requirements with the user, it can answer the orchestrator's questions without bothering the user again.
- Blocking on unmatched capabilities with alternatives is an important UX choice — the system should never silently create tasks that no one can execute.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 02-orchestrator-decomposition-queue-integration_
_Context gathered: 2026-03-29_
