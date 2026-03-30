# GSD-Style Orchestration Layer for Roscoebot

## What This Is

A workflow orchestration intelligence layer built on top of Roscoebot's existing project/task/queue/checkpoint system. It turns vague user goals into well-structured, executable, verifiable work — handling intake, decomposition, workflow selection/generation, agent dispatch, verification, and recovery. The existing project system remains the canonical source of truth; this layer adds orchestration discipline on top.

## Core Value

A user describes a goal in natural language and the system produces structured, executable, verifiable project work end-to-end — from intake through completion — without replacing the existing project system.

## Requirements

### Validated

- [x] First-class workflow files (workflows/WF-NNN.md) within projects, linked to tasks — Validated in Phase 01: Schema & Workflow Foundation
- [x] Task frontmatter extensions: workflow, verification_type, side_effect_class, approval_required, estimated_size, execution_mode — Validated in Phase 01: Schema & Workflow Foundation
- [x] Workflow templates: reusable markdown workflow starter patterns — Validated in Phase 01: Schema & Workflow Foundation
- [x] Task decomposition: break workflows into low-ambiguity, execution-ready tasks with deps and capabilities — Validated in Phase 02: Orchestrator, Decomposition & Queue Integration
- [x] Task authoring standard: objective, context, action guidance, success criteria, verification method, expected outputs — Validated in Phase 02: Orchestrator, Decomposition & Queue Integration
- [x] Queue/board state coherence: orchestration updates project/task/queue state natively — Validated in Phase 02: Orchestrator, Decomposition & Queue Integration
- [x] Orchestration agent type that the main agent can spawn for project/workflow coordination — Validated in Phase 02: Orchestrator, Decomposition & Queue Integration

- [x] Project placement logic: determine existing project vs new project vs sub-project — Validated in Phase 05: Intake Pipeline & Templates
- [x] Workflow selection: match requests to known markdown-based workflow templates — Validated in Phase 05: Intake Pipeline & Templates
- [x] Workflow synthesis: generate tailored workflows from freeform user goals when no template fits — Validated in Phase 05: Intake Pipeline & Templates

### Active

- [ ] Orchestration execution: coordinate task dispatch across workers/subagents, respect dependencies, parallel when safe
- [ ] Verification framework: structured verification types (automatic, human, external, mixed) with evidence recording
- [ ] Recovery policy: retry, decompose further, reroute, block, or escalate with anti-loop budget
- [ ] Checkpoint integration: leverage existing checkpoint system for interruption/resume across sessions
- [ ] Domain-agnostic design: support coding, research, planning, operations, and mixed workflows

### Out of Scope

- Replacing the existing project system — orchestration composes with it
- Building a parallel artifact framework that bypasses projects/tasks/queue
- Implementing every GSD command literally — borrow concepts, not implementation
- Full autonomous production rollout before validation
- Large UI rewrites — prefer existing board/queue surfaces
- Code-only assumptions — the system must work for non-coding work

## Context

Roscoebot already has a durable project system with: project CRUD commands, task frontmatter (id, title, status, priority, capabilities, depends_on, claimed_by, parent), queue management with heartbeat scanning, checkpoint sidecars for resume, .index-based JSON for board/queue/UI, and gateway WebSocket RPC exposure.

The gap is between a user expressing a meaningful objective and that objective becoming well-structured executable work. Today that translation is manual or loosely conversational. For large or ambiguous work, the system needs orchestration that can interpret intent, place work, generate workflows, decompose into tasks, coordinate agents, and enforce verification/recovery.

Key reference patterns informing this work:

- **GSD**: bounded execution units, explicit planning before execution, verification mentality, resumability
- **writing-plans**: decomposition into concrete handoff-ready steps, low-executor-context assumption
- **Eigent/workforce**: planner/coordinator distinction, task/subtask hierarchy, worker specialization, retry/decompose/escalate loop

### Existing system reference points

- `src/projects/` — project management module (types, schemas, frontmatter, queue, checkpoint, scaffold)
- `src/commands/projects.*.ts` — CLI commands
- `src/gateway/server-methods/projects.ts` — gateway RPC methods
- `src/agents/project-context-hook.ts` — agent bootstrap with PROJECT.md injection
- Projects live at `~/.openclaw/projects/{name}/` with PROJECT.md, queue.md, tasks/, .index/

## Constraints

- **Platform**: Must compose with existing project/task/queue/checkpoint primitives — no parallel storage
- **Schema**: Prefer thin schema additions over heavy new subsystems
- **Templates**: Markdown-based workflow templates (consistent with tasks/projects format)
- **Orchestrator**: Dedicated agent type spawned by main agent
- **Workflows**: First-class files (workflows/WF-NNN.md) within project directories
- **Domain**: Must be domain-agnostic from day one (coding, research, ops, mixed)
- **Language**: TypeScript (ESM), consistent with existing codebase

## Key Decisions

| Decision                              | Rationale                                                                                                      | Outcome    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- |
| First-class workflow files (Option B) | Explicit workflow entities enable better template support, clearer orchestration targets, and future promotion | -- Pending |
| Orchestration as dedicated agent type | Separates concerns, gives orchestrator its own context window, composable with main agent                      | -- Pending |
| Markdown workflow templates           | Consistent with existing project/task format, human-readable, agent-parseable                                  | -- Pending |
| End-to-end MVP proof point            | Proves the full loop (intake -> decompose -> execute -> verify) even if shallow                                | -- Pending |
| Domain-agnostic from day one          | Avoids code-only assumptions that would need rearchitecting later                                              | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):

1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-03-29 after Phase 05 completion_
