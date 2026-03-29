# Project Research Summary

**Project:** GSD-Style Orchestration Layer for Roscoebot
**Domain:** AI Agent Workflow Orchestration (brownfield, layered on existing project/task/queue/checkpoint system)
**Researched:** 2026-03-28
**Confidence:** HIGH

## Executive Summary

This project adds an orchestration intelligence layer to an existing, well-structured agent system. The codebase already has all necessary primitives: Zod schemas, `depends_on` dependency tracking in task frontmatter, queue management with heartbeat scanning, ACP agent spawning, and checkpoint sidecars. The orchestration layer's job is to coordinate these primitives with AI-driven intent parsing and workflow management -- not to replace them with a new workflow engine. The recommended approach is a minimal-dependency build: XState v5 for workflow state machines, a ~100-line custom Kahn's algorithm for DAG resolution, and all existing libraries for everything else.

The core architecture follows the orchestrator-worker separation pattern validated by Anthropic's own multi-agent research system (90% improvement over single-agent execution). An orchestrator agent type handles coordination; worker agents handle execution in separate context windows. All state lives on disk in the existing project directory structure -- no parallel state store. Workflow files (`workflows/WF-NNN.md`) introduce a new entity type but remain declarative plans during execution; ground-truth execution state stays exclusively in task frontmatter and `queue.md`.

The dominant risks are behavioral, not technical. Infinite retry loops, over-decomposition, and god-agent accumulation are the three failure modes most likely to derail the project. All three have known mitigations (hard token/step budgets, decomposition guardrails, narrow orchestrator responsibility scope) that must be enforced in the architectural foundation before any feature work begins. The recovery policy and anti-loop budget infrastructure must exist before retry logic ships -- not as a later optimization.

## Key Findings

### Recommended Stack

The stack is almost entirely composed of libraries already in the project. The single new dependency is XState v5 (`pnpm add xstate@^5.29.0`), which provides a TypeScript-native actor model and statechart support for workflow lifecycle management. Every other need is covered: Zod for schema validation, `@agentclientprotocol/sdk` for agent spawning, `yaml` + gray-matter for frontmatter parsing, and `uuid`/`ws` for IDs and WebSocket status. Workflow engine products (Temporal, Inngest, Trigger.dev) and standalone agent frameworks (Mastra, LangChain, OpenAI Agents SDK) were evaluated and rejected -- they require external infrastructure or replace rather than compose with the existing agent system.

**Core technologies:**

- **XState v5 (^5.29.0):** Workflow lifecycle state machine -- actor model maps workflow runs to actors, XState's snapshot/restore maps to existing checkpoints. Only new dependency.
- **Custom ~100-line DAG resolver:** Kahn's algorithm for topological sort and parallel-level grouping from existing `depends_on` field. No library warranted.
- **Zod (^4.3.6, existing):** Extended schemas for `WorkflowFrontmatterSchema`, `WorkflowTemplateSchema`, and new optional task frontmatter fields.
- **ACP `@agentclientprotocol/sdk` (0.16.1, existing):** Orchestrator spawns worker agents via existing `acp-spawn.ts`. No new agent framework.
- **Filesystem (existing):** Single source of truth for all state. The filesystem is the message bus between orchestrator and workers.

### Expected Features

All four research areas agree on the MVP feature dependency chain: workflow lifecycle comes first (structural backbone), goal decomposition second (core value), and dependency-aware dispatch third (makes decomposed tasks execute). These three must ship together for the system to deliver any value. Verification and recovery are Phase 2 reliability work; everything else is Phase 3 and beyond.

**Must have (table stakes):**

- **Goal-to-tasks decomposition** -- the core value prop; without this, the orchestration layer is an empty wrapper
- **Workflow file lifecycle** -- first-class `WF-NNN.md` files linking goals to tasks; backbone for all coordination
- **Dependency-aware task dispatch** -- topological ordering of existing `depends_on` DAG; parallel when safe
- **Verification framework** -- automatic/human/external per task; without this, orchestration is fire-and-forget
- **Recovery on failure** -- retry/decompose/reroute/escalate with hard anti-loop budget; table stakes for production
- **Session resumability** -- checkpoint-based resume; long workflows span sessions

**Should have (differentiators):**

- **Workflow templates** -- pre-built patterns for common work types reduce decomposition cost
- **Confidence-based human-in-the-loop** -- route to human based on `side_effect_class`, not binary always/never
- **Domain-agnostic capability model** -- coding, research, ops all work through same orchestration core
- **Evidence-based completion** -- structured evidence artifacts in checkpoint sidecars, not just status flags

**Defer (v2+):**

- **Workflow composition** (sub-workflow invocation) -- adds coordination complexity before the core is proven
- **Adaptive decomposition depth** (decompose-on-failure) -- useful but complex; flat retry first
- **Execution mode flexibility** (agent/manual/interactive per task) -- can be added incrementally post-MVP

### Architecture Approach

The architecture is a three-layer cake isolating concerns cleanly: an intake layer (goal parsing, project placement, workflow selection/synthesis), an orchestration core (decomposition engine, DAG scheduler, dispatch controller, verification framework, recovery policy, workflow state machine), and the existing project substrate (tasks, queue, checkpoints, indexes) which remains the single source of truth. The new `src/orchestration/` module is further subdivided into `intake/`, `workflows/`, `decomposition/`, `scheduler/`, `verification/`, and `recovery/` sub-directories, with the orchestrator agent type as the thin entry point that delegates to each.

**Major components:**

1. **Goal Parser + Project Placer** (intake) -- extract structured intent from natural language, determine project placement
2. **Workflow Selector + Synthesizer** (intake) -- match goal to template or generate `WF-NNN.md` from scratch
3. **Decomposition Engine** (decomposition) -- workflow steps to `TASK-NNN.md` files with frontmatter and queue entries
4. **DAG Scheduler + Dispatch Controller** (scheduler) -- topological sort of `depends_on`, parallel dispatch via ACP
5. **Verification Framework** (verification) -- automatic/human/external verifiers, evidence recorded in checkpoint sidecars
6. **Recovery Policy + Budget Tracker** (recovery) -- retry/decompose/reroute/escalate with hard anti-loop budget
7. **Workflow State Machine** (XState actor) -- lifecycle tracking in `WF-NNN.md` frontmatter
8. **Orchestrator Agent Type** (entry point) -- thin coordinator; delegates everything; never executes tasks directly

**Critical data flow rule:** Orchestrator reads task status via filesystem (`.index/board.json` cache or direct task reads). Workers communicate completion by writing checkpoints. The filesystem is the message bus -- no direct orchestrator-to-worker coupling.

### Critical Pitfalls

1. **Schema bloat on `TaskFrontmatterSchema`** -- adding all six new orchestration frontmatter fields at once breaks every existing task consumer. Prevention: add fields one phase at a time, all optional with safe defaults, consuming code lands in the same phase.

2. **Orchestrator becomes a god agent** -- accumulating intake, decomposition, dispatch, verification, and recovery in one context window. The existing `attempt.ts` (3,234 LOC) is the cautionary tale. Prevention: narrow orchestrator responsibility to coordination only; specialized sub-operations handle each concern separately.

3. **Infinite retry/decompose loops** -- token explosion from same-tool retry loops, decompose-retry oscillation, and semantic re-planning loops. The most common production failure in agent orchestration. Prevention: hard step budget per task (max 3), decomposition depth limit (max 2 levels), progress detection (halt if no new artifacts across N steps), token ceiling enforced outside the agent.

4. **Decomposition quality failure** -- tasks too vague to execute or too granular to be worth coordination overhead. Prevention: enforce structured task authoring (objective, context, action, success criteria, verification method), 2-10 task guardrails per level, mandatory testable success criterion per task.

5. **Workflow files becoming a parallel state system** -- `WF-NNN.md` files drifting out of sync with `queue.md` and task frontmatter. Prevention: workflow files are read-only during execution; workflow status is derived from constituent task states at read time, never independently tracked.

## Implications for Roadmap

Based on the combined research, the component build-order dependencies drive a clear 7-phase structure. Architecture research produced an explicit dependency graph; features research validated the same phasing from a user-value perspective; pitfalls research identified which phase must introduce which guardrails.

### Phase 1: Schema and Workflow File Foundation

**Rationale:** Every other component references `WF-NNN.md` files and the extended task frontmatter. Getting schema design right here prevents cascading breakage downstream (Pitfall 1 -- schema bloat). The workflow-as-read-only-plan constraint must be established before any execution code touches these files (Pitfall 6 -- parallel state system).

**Delivers:** `WorkflowFrontmatterSchema`, `TaskFrontmatterSchema` extension (incremental, 2-3 fields max), `workflows/WF-NNN.md` file format, `workflows.json` index added to ProjectSyncService watch, Zod validation for all new types.

**Addresses:** Workflow file lifecycle (table stakes), extended task frontmatter fields.

**Avoids:** Schema bloat (#1), unparseable templates (#8), workflow state duplication (#6). All structured data in YAML frontmatter only -- no parsing of markdown body for execution logic.

**Research flag:** Standard patterns (Zod schema extension is well-documented in existing codebase). Skip phase research.

### Phase 2: Decomposition Engine and DAG Scheduler

**Rationale:** Decomposition produces the task DAG. Scheduling consumes it. These two components must exist before any end-to-end workflow can execute. Decomposition quality guardrails (Pitfall 4) and queue bypass prevention (Pitfall 7) must be enforced here.

**Delivers:** `decomposer.ts` (workflow steps to `TASK-NNN.md` files + queue entries), `task-author.ts` (structured task content with mandatory success criteria), `dependency-graph.ts` (Kahn's algorithm, cycle detection), `dag-scheduler.ts` (topological sort, ready-set computation), `dispatch-controller.ts` (ACP spawn to worker agents).

**Addresses:** Goal-to-tasks decomposition (table stakes), dependency-aware dispatch (table stakes).

**Avoids:** Decomposition quality failure (#4) via 2-10 task guardrails and mandatory testable success criteria. Queue bypass (#7) -- orchestrator writes to queue via QueueManager, workers still claim via `scanAndClaimTask`. File lock contention (#11) -- benchmark under 4+ concurrent agents before shipping.

**Research flag:** Needs phase research -- ACP spawn integration with orchestrator agent type, subagent registry interaction risk (#12).

### Phase 3: Verification Framework

**Rationale:** Verification is the signal that gates DAG advancement. Without it, task completion is unconfirmed and the scheduler cannot safely dispatch successor tasks. Verification tiering by `side_effect_class` must be designed from the start (Pitfall 5 -- overhead exceeds value).

**Delivers:** `verification-runner.ts` (route by `verification_type`), `automatic.ts` / `human.ts` / `external.ts` verifiers, `evidence.ts` (structured evidence recording in checkpoint sidecars), anti-loop budget infrastructure (prerequisite for Phase 4 recovery).

**Addresses:** Verification framework (table stakes), evidence-based completion (differentiator).

**Avoids:** Verification overhead (#5) -- tier by `side_effect_class` (none = automatic only, reversible = automatic + optional spot-check, irreversible = mandatory human). Default automatic; human is opt-in. 30-second time budget per automatic verification.

**Research flag:** Standard patterns for automatic verification (LLM-based pass/fail). Human verification queue mechanism needs design during planning.

### Phase 4: Recovery Policy

**Rationale:** Recovery depends on verification results to trigger. The anti-loop budget infrastructure from Phase 3 must exist before any retry logic ships. Recovery is a reliability requirement, not a polish feature -- production orchestration without it collapses at first task failure.

**Delivers:** `recovery-policy.ts` (retry/decompose/reroute/escalate decision tree via XState guards), `budget-tracker.ts` (per-workflow retry budget, hard ceiling enforced outside agent), `escalation.ts` (human escalation path), checkpoint bloat prevention (cap `failed_approaches` at 5, `log` at 50 with summarization).

**Addresses:** Recovery on failure (table stakes), session resumability (leverages existing checkpoint resume + workflow state).

**Avoids:** Infinite retry loops (#3) -- hard budget: max 3 retries, max 2 decomposition levels, progress detection (halt if no new artifacts in N steps). Checkpoint sidecar explosion (#10) -- FIFO eviction on checkpoint arrays.

**Research flag:** Standard patterns for retry budgets and exponential backoff. XState guards for decision tree is well-documented.

### Phase 5: Intake Pipeline

**Rationale:** Intake requires all downstream components to be end-to-end functional before it can be validated. Goal Parser, Project Placer, and Workflow Selector/Synthesizer each call into decomposition, which calls scheduling, which calls verification. Building intake last ensures its outputs are exercised by a working system rather than stubs.

**Delivers:** `goal-parser.ts` (GoalSpec extraction from natural language), `project-placer.ts` (existing vs new project decision), `workflow-selector.ts` (template matching), `workflow-synthesizer.ts` (generate `WF-NNN.md` from goal when no template fits), workflow templates for at least one domain (coding).

**Addresses:** Project placement logic (table stakes), workflow templates (differentiator), workflow synthesis (differentiator).

**Avoids:** Domain-ignorant design (#9) -- ship coding domain deeply first, validate extension points by designing for a second domain (research or ops) in this phase without implementing it.

**Research flag:** Needs phase research -- LLM prompt engineering for goal parsing and workflow synthesis, project placement heuristics.

### Phase 6: XState Workflow State Machine Integration

**Rationale:** XState wraps the workflow lifecycle in a formal statechart (pending -> active -> verifying -> done | failed | blocked). While components in Phases 1-5 manage state via file writes, XState makes the orchestrator's decision logic explicit, inspectable, and safe from partial-update corruption. Installing it after the core loop is proven avoids over-engineering early phases.

**Delivers:** XState actor for workflow lifecycle, snapshot/restore mapping to existing checkpoint system, visual inspector integration for debugging, orchestrator agent type finalized as thin coordinator wrapping XState actor.

**Addresses:** Session resumability (XState snapshot = checkpoint persistence).

**Uses:** XState v5 (the only new dependency). Maps directly to existing checkpoint infrastructure.

**Research flag:** Standard patterns (XState v5 actor model is well-documented). Skip phase research.

### Phase 7: Gateway RPC and Observability

**Rationale:** Exposes orchestration to external consumers (UI, Telegram bot, web client) via the existing gateway RPC pattern. New methods follow the same pattern as `server-methods/projects.ts`. This is integration polish, not core functionality.

**Delivers:** `workflows.list`, `workflows.get`, `orchestration.start`, `orchestration.status` RPC methods, confidence-based HITL routing (differentiator), domain-agnostic capability model for multi-domain dispatch (differentiator), workflow status surfaced through existing board/queue indexes.

**Addresses:** Workflow status and progress (table stakes), confidence-based HITL (differentiator), domain-agnostic capability model (differentiator).

**Research flag:** Standard patterns (gateway RPC pattern already established in codebase). Skip phase research.

### Phase Ordering Rationale

- **Schema first:** Every component references `WF-NNN.md` files. Getting the schema right before writing consumers prevents cascading schema migration work.
- **Decomposition before scheduling:** The scheduler needs tasks to exist with `depends_on` fields. Tasks come from the decomposer.
- **Verification before recovery:** Recovery is triggered by verification failure. The budget infrastructure (Phase 3) must be wired before retry logic (Phase 4) ships.
- **Intake last in core loop:** Intake calls decomposition which calls scheduling which calls verification. The full chain must exist for intake to be testable.
- **XState after core loop:** Wrapping the working system in XState statecharts is a correctness and debuggability improvement, not a prerequisite. Avoids over-engineering phases that are proven in simpler form first.
- **Gateway/observability last:** External-facing surfaces have no impact on correctness. They are multipliers on a working system.

### Research Flags

Phases needing deeper research during planning:

- **Phase 2 (Decomposition + Dispatch):** ACP spawn integration details for the orchestrator agent type, subagent registry interaction risk under concurrent spawning. Direct code inspection of `subagent-registry.ts` (1,806 LOC, known fragile) required.
- **Phase 5 (Intake):** LLM prompt engineering for goal parsing, workflow synthesis, and template matching quality. No established codebase patterns to follow here.

Phases with standard patterns (skip phase research):

- **Phase 1 (Schema):** Zod schema extension follows existing `TaskFrontmatterSchema` pattern exactly.
- **Phase 3 (Verification):** Automatic LLM-based pass/fail verification is well-documented. Human queue mechanism is simple.
- **Phase 4 (Recovery):** Retry budget enforcement and XState guard patterns are well-documented.
- **Phase 6 (XState):** XState v5 actor model and snapshot/restore are thoroughly documented.
- **Phase 7 (Gateway):** Follows existing `server-methods/projects.ts` pattern directly.

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                                                           |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH       | XState verified at v5.29.0 (published 2026-03-25). All other deps confirmed in codebase. Explicit rejection rationale for all alternatives.                                     |
| Features     | HIGH       | Multiple industry sources agree on table-stakes features. MVP ordering aligns with architectural dependencies. Anti-features grounded in PROJECT.md constraints.                |
| Architecture | HIGH       | Grounded in direct codebase inspection (`src/projects/`, `src/agents/`, `src/gateway/`) plus Anthropic's own published multi-agent research. Component boundaries are explicit. |
| Pitfalls     | HIGH       | Critical pitfalls sourced from both external research (GitHub Blog, Azure, Composio) and direct codebase inspection (CONCERNS.md, subagent-registry.ts analysis).               |

**Overall confidence:** HIGH

### Gaps to Address

- **Subagent registry concurrency:** `subagent-registry.ts` is flagged in CONCERNS.md as fragile under concurrent registration. The exact failure modes for orchestrated parallel dispatch need hands-on investigation during Phase 2 planning before parallel dispatch ships.
- **Decomposition prompt engineering:** Research identifies quality guardrails (2-10 tasks per level, mandatory success criteria) but the prompt design itself requires iteration during Phase 5. No source provides a definitive decomposition prompt template.
- **Workflow synthesis quality threshold:** When no template matches and the synthesizer generates a `WF-NNN.md` from scratch, what quality bar determines "good enough to dispatch"? This needs a validation heuristic defined during Phase 5 planning.
- **`queue.md` lock contention under parallelism:** Research recommends benchmarking 4+ concurrent agents before shipping parallel dispatch (Phase 2). Actual lock behavior under orchestrated concurrency is uncharted -- the existing 3-retry backoff may need tuning.

## Sources

### Primary (HIGH confidence)

- Existing codebase: `src/projects/schemas.ts`, `src/projects/queue-manager.ts`, `src/projects/heartbeat-scanner.ts`, `src/projects/checkpoint.ts`, `src/agents/acp-spawn.ts`, `src/agents/project-context-hook.ts`, `src/gateway/server-methods/projects.ts`, `src/agents/subagent-registry.ts`, `.planning/codebase/CONCERNS.md`
- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)
- [XState GitHub](https://github.com/statelyai/xstate) -- v5.29.0 published 2026-03-25, verified via WebSearch
- [Microsoft Azure: AI Agent Design Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)

### Secondary (MEDIUM confidence)

- [GitHub Blog: Multi-agent workflows often fail](https://github.blog/ai-and-ml/generative-ai/multi-agent-workflows-often-fail-heres-how-to-engineer-ones-that-dont/)
- [Agent Patterns: Infinite Loop](https://www.agentpatterns.tech/en/failures/infinite-loop)
- [Task Decomposition Agent Pattern](https://www.agentpatterns.tech/en/agent-patterns/task-decomposition-agent)
- [Durable Execution for AI Agents (inference.sh)](https://inference.sh/blog/agent-runtime/durable-execution)
- [Vellum: Agentic Workflows in 2026](https://vellum.ai/blog/agentic-workflows-emerging-architectures-and-design-patterns)
- [LangGraph multi-agent orchestration](https://latenode.com/blog/ai-frameworks-technical-infrastructure/langgraph-multi-agent-orchestration/langgraph-multi-agent-orchestration-complete-framework-guide-architecture-analysis-2025)

### Tertiary (MEDIUM-LOW confidence)

- [Composio: Why AI Pilots Fail](https://composio.dev/blog/why-ai-agent-pilots-fail-2026-integration-roadmap) -- 40%+ agent project failure rate, accuracy compounding
- [Deloitte: AI Agent Orchestration Predictions](https://www.deloitte.com/us/en/insights/industry/technology/technology-media-and-telecom-predictions/2026/ai-agent-orchestration.html) -- market context only
- [Checkpoints Are Not Durable Execution (Diagrid)](https://www.diagrid.io/blog/checkpoints-are-not-durable-execution-why-langgraph-crewai-google-adk-and-others-fall-short-for-production-agent-workflows) -- informed decision to use checkpoint-based (not durable execution) resumability

---

_Research completed: 2026-03-28_
_Ready for roadmap: yes_
