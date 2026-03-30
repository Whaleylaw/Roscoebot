# GSD-Style Orchestration Layer for Roscoebot

## What This Is

A workflow orchestration intelligence layer built on top of Roscoebot's existing project/task/queue/checkpoint system. It turns vague user goals into well-structured, executable, verifiable work — handling intake, decomposition, workflow selection/generation, agent dispatch, verification, and recovery. The existing project system remains the canonical source of truth; this layer adds orchestration discipline on top.

## Core Value

A user describes a goal in natural language and the system produces structured, executable, verifiable project work end-to-end — from intake through completion — without replacing the existing project system.

## Current State

Shipped v1.0 Orchestration Layer with ~19,500 LOC TypeScript across 114 files.

- **Workflow foundation**: First-class WF-NNN.md files with Zod-validated frontmatter, lifecycle management, and capability registry
- **Orchestrator agent**: Dedicated agent type with decomposition, dispatch, and verification policies — spawnable via sessions_send
- **Verification engine**: Four verification types (automatic, human, external, mixed) with side-effect gating and evidence recording
- **Recovery system**: Retry/decompose/reroute/escalate chain with anti-loop budgets, backoff windows, and stale claim detection
- **Intake pipeline**: Natural language goal parsing, project placement, template matching, workflow synthesis
- **Progress observability**: Workflow indexes, CLI status command, gateway RPC endpoints, board UI workflow badges

## Requirements

### Validated (v1.0)

- [x] First-class workflow files (WF-NNN.md) with lifecycle, frontmatter, templates — Phase 01
- [x] Task frontmatter extensions (workflow, verification_type, side_effect_class, etc.) — Phase 01
- [x] Task decomposition with dependency graphs, capability matching, success criteria — Phase 02
- [x] Queue integration with heartbeat-based claiming and state coherence — Phase 02
- [x] Orchestration agent type with workspace, identity, and dispatch policies — Phase 02
- [x] Verification framework with four types and evidence recording — Phase 03
- [x] Human-in-the-loop gates for irreversible actions — Phase 03
- [x] Recovery chain (retry, decompose, reroute, escalate) with anti-loop budgets — Phase 04
- [x] Cross-session workflow resumability via checkpoint reconstruction — Phase 04
- [x] Intake pipeline with project placement, template matching, workflow synthesis — Phase 05
- [x] Progress observability through CLI, gateway RPC, and board UI — Phase 06

### Active

- [ ] Sub-project UI: proper nesting in project list, detail view, and data loading
- [ ] UI project/workflow/task creation: buttons/forms for creating these without prompting an agent
- [ ] Workflow display in project overview: how workflows appear alongside tasks in the project detail view

### Out of Scope

- Replacing the existing project system — orchestration composes with it
- Building a parallel artifact framework that bypasses projects/tasks/queue
- Full autonomous production rollout before validation
- Visual workflow builder / DAG editor — markdown files are the editor
- Deep decomposition chains (>3 levels) — research shows diminishing returns

## Key Decisions

| Decision | Rationale | Outcome |
| --- | --- | --- |
| First-class workflow files (Option B) | Explicit workflow entities enable better template support, clearer orchestration targets | ✓ Good |
| Orchestration as dedicated agent type | Separates concerns, gives orchestrator its own context window, composable with main agent | ✓ Good |
| Markdown workflow templates | Consistent with existing project/task format, human-readable, agent-parseable | ✓ Good |
| Domain-agnostic from day one | Avoids code-only assumptions; capability tags are extensible | ✓ Good |
| Queue-based dispatch (not direct assignment) | Agents claim tasks via heartbeat; orchestrator creates work, doesn't assign it | ✓ Good |
| Verification before done | completeTask() gates on verification; cannot be bypassed | ✓ Good |
| Recovery chain with budget | 4-step priority chain prevents infinite loops; budget enforced externally | ✓ Good |
| Static intake skill (not LLM-generated) | Deterministic heuristic decomposition; LLM synthesis deferred to runtime | ✓ Good |

## Constraints

- **Platform**: Must compose with existing project/task/queue/checkpoint primitives — no parallel storage
- **Schema**: Prefer thin schema additions over heavy new subsystems
- **Templates**: Markdown-based workflow templates (consistent with tasks/projects format)
- **Orchestrator**: Dedicated agent type spawned by main agent
- **Workflows**: First-class files (workflows/WF-NNN.md) within project directories
- **Domain**: Must be domain-agnostic from day one (coding, research, ops, mixed)
- **Language**: TypeScript (ESM), consistent with existing codebase

## Context

### Existing system reference points

- `src/projects/` — project management module (types, schemas, frontmatter, queue, checkpoint, scaffold, orchestrator, verification, recovery, templates, intake)
- `src/commands/projects.*.ts` — CLI commands (status with workflow section, approve, reject)
- `src/gateway/server-methods/projects.ts` — gateway RPC methods (including workflows.list, workflows.get)
- `src/gateway/server-projects.ts` — ProjectGatewayService with workflow index reading and WebSocket broadcast
- `src/hooks/bundled/` — workflow-status-hook, verification-hook, internal-hooks
- `src/agents/orchestrator-templates.ts` — orchestrator workspace bootstrapping
- `ui/src/ui/views/projects-board.ts` — board UI with review column and workflow badges
- Projects live at `~/.openclaw/projects/{name}/` with PROJECT.md, queue.md, tasks/, workflows/, .index/

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**

1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone:**

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-03-30 after v1.0 milestone completion_
