# Feature Landscape

**Domain:** AI Agent Workflow Orchestration Layer (brownfield, layered on existing project/task/queue/checkpoint system)
**Researched:** 2026-03-28

## Table Stakes

Features users expect from any orchestration layer. Missing = the system adds no value over manual task creation.

| Feature                        | Why Expected                                                                                                                            | Complexity | Notes                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goal-to-tasks decomposition    | Core value prop: turn vague intent into executable work. Without this, the orchestration layer is just a wrapper                        | High       | Must produce low-ambiguity, single-action-cycle tasks with clear success criteria. Shallow decomposition (2 levels max) preferred over deep chains     |
| Workflow file lifecycle        | Orchestration needs a first-class entity linking goals to tasks. Without workflow files, coordination is scattered across task metadata | Medium     | `workflows/WF-NNN.md` within project dirs. Statuses: draft, active, paused, completed, failed                                                          |
| Dependency-aware task dispatch | Tasks have `depends_on` already; orchestration must respect this. Parallel dispatch when deps allow, serial when required               | Medium     | Existing task frontmatter supports deps. Orchestrator reads dep graph, dispatches in topological order                                                 |
| Verification framework         | Without verification, orchestration is "fire and forget." Every serious agent system includes validation gates                          | High       | Types: automatic (test passes, file exists), human (approval checkpoint), external (API check), mixed. Evidence must be recorded                       |
| Recovery on failure            | Tasks fail. Without retry/escalate/decompose-further, the system stops at first failure and requires manual intervention                | High       | Policy per task: retry (with budget), decompose-further, reroute to different capability, block-and-escalate. Anti-loop budget (max 3 retries default) |
| Session resumability           | Long workflows span sessions. Without checkpoint-based resume, interrupted work restarts from scratch                                   | Medium     | Leverage existing checkpoint system. Persist workflow state, current task pointer, completed evidence. Resume = re-read checkpoint + continue          |
| Workflow status and progress   | Users need to know what's happening. Without status visibility, orchestration is a black box                                            | Low        | Expose workflow progress through existing board/queue/.index surfaces. No new UI needed                                                                |
| Project placement logic        | System must decide: new project, existing project, or sub-project. Wrong placement = organizational chaos                               | Medium     | Heuristics: keyword/capability match against active projects, scope similarity, explicit user override                                                 |

## Differentiators

Features that set this apart from manual task management or simpler agent systems. Not expected, but high-value.

| Feature                                | Value Proposition                                                                                                                                      | Complexity | Notes                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| Workflow templates (reusable)          | Pre-built patterns for common work types (code feature, research report, ops runbook) reduce decomposition cost and improve consistency                | Medium     | Markdown-based templates in `workflows/templates/`. Parameterized with frontmatter variables. Template selection by goal-matching                           |
| Workflow synthesis from freeform goals | When no template fits, generate a tailored workflow from natural language. This is the "magic" that distinguishes orchestration from a template engine | High       | LLM-driven: analyze goal, infer task structure, generate workflow + tasks. Quality depends on decomposition prompt engineering                              |
| Confidence-based human-in-the-loop     | Rather than binary "always ask" or "never ask," route to human based on task risk classification (side_effect_class, approval_required)                | Medium     | Side-effect classes: none, reversible, irreversible. Auto-approve none/reversible; pause-and-ask for irreversible. Configurable thresholds                  |
| Domain-agnostic capability model       | Same orchestration works for coding, research, ops, and mixed workflows. Most agent systems are code-only                                              | Medium     | Capability tags on tasks (code, research, ops, review, deploy). Orchestrator dispatches to workers with matching capabilities. Not hard-coded to any domain |
| Adaptive decomposition depth           | Decompose shallowly first; if a task fails, automatically break it down further before retrying                                                        | High       | "Decompose-on-failure" is a recovery strategy. Prevents over-decomposition upfront while handling complexity when needed                                    |
| Execution mode flexibility             | Tasks can be automatic (agent-executed), manual (human-executed with agent tracking), or interactive (agent proposes, human confirms each step)        | Low        | Frontmatter `execution_mode: auto                                                                                                                           | manual | interactive`. Orchestrator adjusts dispatch and verification accordingly |
| Workflow composition                   | One workflow can invoke another as a sub-workflow, enabling reuse and nesting                                                                          | Medium     | Sub-workflow reference in task frontmatter. Orchestrator tracks parent/child workflow relationships                                                         |
| Evidence-based completion              | Tasks produce evidence artifacts (test output, file diffs, API responses) that are recorded and queryable, not just status flags                       | Medium     | Evidence stored alongside task checkpoint. Enables audit trail and post-mortem analysis                                                                     |

## Anti-Features

Features to explicitly NOT build. These are traps that add complexity without proportional value, or conflict with the project's constraints.

| Anti-Feature                                    | Why Avoid                                                                                                                                                                | What to Do Instead                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parallel artifact/state system                  | PROJECT.md specifies "no parallel storage." Building a separate state store fragments the source of truth                                                                | Compose with existing project/task/queue/checkpoint primitives. Workflow state lives in workflow files + task frontmatter                           |
| Full durable execution runtime (Temporal-style) | Massive infrastructure complexity for a layer that sits on top of an existing system. OpenAI Codex uses Temporal but they run cloud sandboxes; this is a local CLI agent | Use checkpoint-based resumability (already exists). Idempotency keys on side-effecting tasks. "Good enough" durability without a runtime dependency |
| Visual workflow builder / DAG editor            | UI complexity explosion. The system uses markdown files and CLI; a visual editor is a separate product                                                                   | Markdown workflow files are the "editor." Board/queue views show progress. Template selection is the guided experience                              |
| Agent-to-agent chat protocol                    | AutoGen-style conversational multi-agent adds complexity and unpredictability. Conversation is not coordination                                                          | Structured task dispatch with typed inputs/outputs. Orchestrator communicates via task assignments, not free-form chat                              |
| Autonomous production deployment                | PROJECT.md lists "full autonomous production rollout" as out of scope. Side-effecting actions on production systems need human gates                                     | approval_required + side_effect_class gating. Irreversible actions always pause for human confirmation                                              |
| Deep decomposition chains (>3 levels)           | Research shows deep chains increase failure probability and lose coherence. Each level compounds ambiguity                                                               | Shallow decomposition (2 levels default, 3 max). Use adaptive decomposition-on-failure rather than preemptive deep planning                         |
| Custom DSL for workflow definition              | Adding a new language increases learning curve and tooling burden. Markdown + frontmatter is the existing pattern                                                        | YAML frontmatter for structured data + markdown body for context/instructions. Consistent with tasks and PROJECT.md                                 |
| Real-time multi-agent negotiation               | Agents bidding on tasks, negotiating assignments. Adds latency and non-determinism                                                                                       | Orchestrator assigns tasks based on capability match and availability. No negotiation, no bidding                                                   |
| Workflow versioning / branching                 | Git-style workflow versioning adds massive complexity. Workflows are ephemeral coordination artifacts, not source code                                                   | Workflows are created, run, complete/fail. New goal = new workflow. No version history needed                                                       |

## Feature Dependencies

```
Goal-to-tasks decomposition → Workflow file lifecycle (tasks belong to a workflow)
Workflow file lifecycle → Dependency-aware task dispatch (dispatch reads workflow's tasks)
Dependency-aware task dispatch → Verification framework (dispatch triggers verification on completion)
Verification framework → Recovery on failure (failed verification triggers recovery)
Recovery on failure → Adaptive decomposition depth (decompose-further is a recovery strategy)
Session resumability → Workflow file lifecycle (resume reads workflow state)
Project placement logic → Workflow file lifecycle (workflow placed into correct project)
Workflow templates → Workflow synthesis (synthesis is the fallback when no template matches)
Confidence-based HITL → Verification framework (HITL is a verification type)
Evidence-based completion → Verification framework (evidence is verification output)
Execution mode flexibility → Dependency-aware task dispatch (dispatch respects execution mode)
Workflow composition → Workflow file lifecycle (sub-workflows are workflow instances)
```

## MVP Recommendation

Build in this order to get end-to-end value fastest:

### Phase 1: Foundation (must ship together)

1. **Workflow file lifecycle** -- the structural backbone; everything hangs off this
2. **Goal-to-tasks decomposition** -- the core value prop; without this, workflows are empty shells
3. **Dependency-aware task dispatch** -- makes decomposed tasks actually execute

### Phase 2: Reliability

4. **Verification framework** -- proves tasks actually succeeded
5. **Recovery on failure** -- handles the inevitable failures
6. **Session resumability** -- workflows survive interruption

### Phase 3: Intelligence

7. **Workflow templates** -- accelerate common patterns
8. **Workflow synthesis** -- handle novel goals
9. **Project placement logic** -- automatic organization

### Phase 4: Polish

10. **Confidence-based HITL** -- smart human involvement
11. **Domain-agnostic capability model** -- multi-domain dispatch
12. **Evidence-based completion** -- audit trail

Defer: Workflow composition (Phase 5+), Adaptive decomposition depth (Phase 5+), Execution mode flexibility (can be added incrementally to any phase).

## Complexity Budget

| Complexity | Count | Features                                                                                                                                                                                        |
| ---------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low        | 2     | Workflow status/progress, Execution mode flexibility                                                                                                                                            |
| Medium     | 8     | Workflow file lifecycle, Dependency-aware dispatch, Session resumability, Project placement, Workflow templates, Confidence-based HITL, Domain-agnostic capabilities, Evidence-based completion |
| High       | 4     | Goal-to-tasks decomposition, Verification framework, Recovery on failure, Workflow synthesis                                                                                                    |

Total estimated effort is front-loaded: the three hardest features (decomposition, verification, recovery) are all table stakes. This is inherent to the domain -- orchestration without reliability is worse than no orchestration.

## Sources

- [Task Decomposition Agent Pattern](https://www.agentpatterns.tech/en/agent-patterns/task-decomposition-agent)
- [Deep Dive into Agent Task Decomposition Techniques](https://sparkco.ai/blog/deep-dive-into-agent-task-decomposition-techniques)
- [Agents Need Durable Workflows and Strong Guarantees](https://stack.convex.dev/durable-workflows-and-strong-guarantees)
- [Multi-agent workflows often fail (GitHub Blog)](https://github.blog/ai-and-ml/generative-ai/multi-agent-workflows-often-fail-heres-how-to-engineer-ones-that-dont/)
- [Error Handling in Agentic Systems](https://agentsarcade.com/blog/error-handling-agentic-systems-retries-rollbacks-graceful-failure)
- [Human-in-the-Loop AI Agents (StackAI)](https://www.stackai.com/insights/human-in-the-loop-ai-agents-how-to-design-approval-workflows-for-safe-and-scalable-automation)
- [Human-in-the-loop patterns (Cloudflare)](https://developers.cloudflare.com/agents/guides/human-in-the-loop/)
- [Checkpoints Are Not Durable Execution (Diagrid)](https://www.diagrid.io/blog/checkpoints-are-not-durable-execution-why-langgraph-crewai-google-adk-and-others-fall-short-for-production-agent-workflows)
- [Durable Execution for AI Agents (inference.sh)](https://inference.sh/blog/agent-runtime/durable-execution)
- [20 Agentic AI Workflow Patterns (Skywork)](https://skywork.ai/blog/agentic-ai-examples-workflow-patterns-2025/)
- [2026 Guide to Agentic Workflow Architectures (StackAI)](https://www.stackai.com/blog/the-2026-guide-to-agentic-workflow-architectures)
- [Multi-Agent Coordination Strategies (Galileo)](https://galileo.ai/blog/multi-agent-coordination-strategies)
- [AI Agent Orchestration Frameworks Comparison (o-mega)](https://o-mega.ai/articles/langgraph-vs-crewai-vs-autogen-top-10-agent-frameworks-2026)
