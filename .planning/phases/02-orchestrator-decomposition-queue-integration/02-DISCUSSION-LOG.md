# Phase 2: Orchestrator, Decomposition & Queue Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 02-orchestrator-decomposition-queue-integration
**Areas discussed:** Decomposition strategy, Orchestrator lifecycle, Task creation & queue wiring, Capability dispatch model

---

## Decomposition Strategy

### Q1: How should the orchestrator decompose goals into tasks?

| Option                                 | Description                                                          | Selected |
| -------------------------------------- | -------------------------------------------------------------------- | -------- |
| LLM-driven                             | Orchestrator prompts LLM with goal + project context. Most flexible. | ✓        |
| Template-first, LLM fallback           | Match to workflow template first, LLM if no match. More predictable. |          |
| Hybrid: LLM always, templates as hints | LLM always decomposes but receives templates as reference.           |          |

**User's choice:** LLM-driven
**Notes:** User clarified the flow: user prompts a user-facing agent → agent sends to orchestrator via sessions_send → orchestrator (also LLM-backed) decomposes. If the user wants a specific workflow, they say so in their prompt. The orchestrator should be encouraged to ask clarifying questions before decomposing, similar to GSD's discuss-phase pattern.

### Q2: How deep should decomposition go by default?

| Option                  | Description                                             | Selected |
| ----------------------- | ------------------------------------------------------- | -------- |
| Shallow: flat task list | Single level, decompose-on-failure for deeper.          |          |
| Always 2 levels         | Goal/subtask hierarchy always.                          |          |
| Adaptive from the start | Orchestrator judges depth per-goal based on complexity. | ✓        |

**User's choice:** Adaptive from the start

### Q3: Clarification loop — same channel or agent-to-agent?

| Option                                | Description                                         | Selected |
| ------------------------------------- | --------------------------------------------------- | -------- |
| Back to user via originating channel  | Relay questions through user-facing agent.          |          |
| Agent-to-agent only                   | Delegating agent answers from its own context.      |          |
| Tiered: agent first, escalate to user | Agent tries to answer; escalates to user if unsure. | ✓        |

**User's choice:** Tiered: agent first, escalate to user

### Q4: How prescriptive should each task be?

| Option                                | Description                                      | Selected |
| ------------------------------------- | ------------------------------------------------ | -------- |
| Full spec per task                    | All 5 DEC-02 fields filled. Higher upfront cost. | ✓        |
| Minimal: objective + success criteria | Faster decomposition, agents figure out more.    |          |
| Scaled by estimated_size              | Match effort to complexity.                      |          |

**User's choice:** Full spec per task

### Q5: Should orchestrator validate its own decomposition?

| Option                          | Description                                                            | Selected |
| ------------------------------- | ---------------------------------------------------------------------- | -------- |
| Yes, validate before writing    | Sanity checks: no circular deps, capabilities exist, reasonable count. | ✓        |
| No, trust the LLM output        | Write as generated, recovery handles mistakes.                         |          |
| Validate structure, not content | Check deps and caps, don't second-guess objectives.                    |          |

**User's choice:** Yes, validate before writing

### Q6: How many clarification rounds before proceeding?

| Option                    | Description                                                | Selected |
| ------------------------- | ---------------------------------------------------------- | -------- |
| 1 round max               | Ask once, proceed with best judgment.                      |          |
| Up to 3 rounds            | Cap the back-and-forth.                                    |          |
| Adaptive (Claude decides) | Judge whether ambiguity is critical enough to keep asking. | ✓        |

**User's choice:** Adaptive (Claude decides)

### Q7: Present task breakdown for approval before committing?

| Option                      | Description                                                                     | Selected |
| --------------------------- | ------------------------------------------------------------------------------- | -------- |
| Always present for approval | Show user proposed tasks before writing. Safer, slower.                         |          |
| Go unless high-stakes       | Auto-proceed for none side-effects. Present for irreversible/approval_required. | ✓        |
| Always auto-proceed         | Trust decomposition, recovery handles mistakes.                                 |          |

**User's choice:** Go unless high-stakes

---

## Orchestrator Lifecycle

### Q1: How should the orchestrator agent be bootstrapped?

| Option                          | Description                                                   | Selected |
| ------------------------------- | ------------------------------------------------------------- | -------- |
| Auto-created on first use       | Create workspace + files from bundled defaults on first need. |          |
| CLI command to initialize       | User runs explicit init command.                              |          |
| Pre-configured in repo defaults | Ship workspace files as part of repo/package. Always present. | ✓        |

**User's choice:** Pre-configured in repo defaults

### Q2: How does the main agent hand off a goal?

| Option                                | Description                                                    | Selected |
| ------------------------------------- | -------------------------------------------------------------- | -------- |
| sessions_send with structured payload | Structured message via sessions_send. Async, existing infra.   | ✓        |
| Direct function call                  | In-process import and call. Simpler but no own context window. |          |
| Gateway RPC method                    | New endpoint. More decoupled, adds API surface.                |          |

**User's choice:** sessions_send with structured payload

### Q3: How does the orchestrator monitor workflow progress?

| Option                       | Description                                                          | Selected |
| ---------------------------- | -------------------------------------------------------------------- | -------- |
| Heartbeat polling            | Standard interval, reads states, updates workflow. Existing pattern. | ✓        |
| Event-driven notifications   | Task completion triggers notification. Faster but new wiring.        |          |
| Heartbeat + fast-path events | Both. Best responsiveness, most complex.                             |          |

**User's choice:** Heartbeat polling

### Q4: Planning vs dispatch separation (ORC-05)?

| Option                      | Description                                                           | Selected |
| --------------------------- | --------------------------------------------------------------------- | -------- |
| Sections in one AGENTS.md   | Single agent, separated instruction sections. One agent, two hats.    | ✓        |
| Two sub-agents              | Planner + dispatcher sub-agents. Cleaner but coordination complexity. |          |
| Two modes of the same agent | Explicit mode switching: planning mode then monitoring mode.          |          |

**User's choice:** Sections in one AGENTS.md

### Q5: One global orchestrator or one per project?

| Option                             | Description                                                             | Selected |
| ---------------------------------- | ----------------------------------------------------------------------- | -------- |
| One per project                    | Each project gets own instance. Clean isolation.                        |          |
| One global orchestrator            | Single orchestrator, all projects. Simple but cross-contamination risk. |          |
| Shared but project-scoped sessions | One agent definition, separate sessions per project.                    | ✓        |

**User's choice:** Shared but project-scoped sessions

### Q6: Static or dynamic AGENTS.md?

| Option                        | Description                                                            | Selected |
| ----------------------------- | ---------------------------------------------------------------------- | -------- |
| Static + project context hook | Static AGENTS.md, context via project-context-hook.ts. Stable + fresh. | ✓        |
| Fully static                  | Everything in AGENTS.md including project conventions.                 |          |
| Dynamically generated         | Regenerated per session based on project type.                         |          |

**User's choice:** Static + project context hook

---

## Task Creation & Queue Wiring

### Q1: All tasks at once or incrementally?

| Option                              | Description                              | Selected |
| ----------------------------------- | ---------------------------------------- | -------- |
| All at once, deps control ordering  | Batch create, deps control claimability. | ✓        |
| Incremental: create next when ready | Only create tasks when deps complete.    |          |
| Hybrid: wave by wave                | Create tasks per dependency wave.        |          |

**User's choice:** All at once, deps control ordering

### Q2: Direct module use or gateway RPC?

| Option                             | Description                                         | Selected |
| ---------------------------------- | --------------------------------------------------- | -------- |
| Direct ProjectManager/QueueManager | Import and use directly. Simplest, reuses all code. | ✓        |
| Gateway RPC                        | Call gateway methods. More decoupled.               |          |
| New orchestration-specific module  | Thin wrapper with batch semantics.                  |          |

**User's choice:** Direct ProjectManager/QueueManager

### Q3: Who updates workflow status on task completion?

| Option                     | Description                                                     | Selected |
| -------------------------- | --------------------------------------------------------------- | -------- |
| Orchestrator on heartbeat  | Single owner of workflow state. Consistent with D-05.           |          |
| Agent updates both         | Agent updates task + workflow. Multiple writers, needs locking. |          |
| Event hook triggers update | Hook fires on task completion, updates workflow. Decoupled.     | ✓        |

**User's choice:** Event hook triggers workflow update

### Q4: New queue sections needed?

| Option                       | Description                                                         | Selected |
| ---------------------------- | ------------------------------------------------------------------- | -------- |
| Existing sections only       | Available/Claimed/Done/Blocked sufficient. Deps handled by scanner. | ✓        |
| Add 'Waiting' section        | Distinguish ready-but-unclaimed from waiting-on-deps.               |          |
| Add 'Pending Review' section | Review before Done. Phase 3 scope bleed.                            |          |

**User's choice:** Existing sections only

### Q5: Atomic batch creation?

| Option                  | Description                                                                     | Selected |
| ----------------------- | ------------------------------------------------------------------------------- | -------- |
| Single atomic operation | Task files + queue entries + workflow update in one batch. Rollback on failure. | ✓        |
| Two-phase               | Tasks first, workflow separately. Heartbeat repairs drift.                      |          |
| Eventually consistent   | Independent creation, self-healing reconciliation.                              |          |

**User's choice:** Single atomic operation

---

## Capability Dispatch Model

### Q1: How does the orchestrator know which agents exist?

| Option                    | Description                                                  | Selected |
| ------------------------- | ------------------------------------------------------------ | -------- |
| agents.list[] config      | Read from existing config. Agents self-select via heartbeat. | ✓        |
| Runtime agent registry    | Track online agents in real-time.                            |          |
| Capability manifest files | Per-workspace capabilities.json.                             |          |

**User's choice:** agents.list[] config

### Q2: Global or project-level capability registry?

| Option                    | Description                                                     | Selected |
| ------------------------- | --------------------------------------------------------------- | -------- |
| Project-level only        | PROJECT.md defines valid capabilities. Consistent with Phase 1. | ✓        |
| Global + project override | Global defaults plus project additions.                         |          |
| No registry at dispatch   | Registry validates at creation only, string match at dispatch.  |          |

**User's choice:** Project-level only

### Q3: What happens with unmatched capabilities?

| Option                     | Description                                           | Selected |
| -------------------------- | ----------------------------------------------------- | -------- |
| Warn at creation, allow it | Log warning, task sits until agent comes online.      |          |
| Block creation             | Refuse to create. Forces user to add agent or adjust. | ✓        |
| Create + notify user       | Create but send notification about the gap.           |          |

**User's choice:** Block creation

### Q4: How to handle the block?

| Option                  | Description                                                                     | Selected |
| ----------------------- | ------------------------------------------------------------------------------- | -------- |
| Offer alternatives      | Present options: remove cap, split task, add agent. Part of clarification loop. | ✓        |
| Just block and report   | Hard stop with error message.                                                   |          |
| Auto-fallback to manual | Set execution_mode to manual if no agent has capability.                        |          |

**User's choice:** Offer alternatives

### Q5: Capability matching complexity?

| Option                      | Description                                                     | Selected |
| --------------------------- | --------------------------------------------------------------- | -------- |
| Flat string matching        | Simple ANY-match. Consistent with existing matchCapabilities(). | ✓        |
| Hierarchical with wildcards | Subcapabilities, wildcard matching.                             |          |
| Tags + proficiency levels   | Capability levels for smarter routing.                          |          |

**User's choice:** Flat string matching

---

## Claude's Discretion

- Internal decomposition prompt engineering
- Exact structured payload shape for sessions_send
- Hook implementation details for workflow status updates
- AGENTS.md section organization beyond required sections
- Validation bounds (max task count, dep graph complexity)

## Deferred Ideas

None — discussion stayed within phase scope
