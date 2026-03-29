# Requirements: GSD-Style Orchestration Layer for Roscoebot

**Defined:** 2026-03-28
**Core Value:** A user describes a goal and the system produces structured, executable, verifiable project work end-to-end

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Workflow Foundation

- [x] **WF-01**: Workflow files (WF-NNN.md) exist as first-class entities within project directories with YAML frontmatter and markdown body
- [x] **WF-02**: Workflow files have a defined lifecycle: draft, active, paused, completed, failed
- [x] **WF-03**: Workflow frontmatter includes: id, title, status, goal, created, updated, tasks (list of TASK-IDs), template (optional source template)
- [ ] **WF-04**: Workflow directory (workflows/) is created within project directories alongside tasks/

### Decomposition

- [ ] **DEC-01**: Orchestrator can decompose a user goal into a set of executable tasks with dependencies, capabilities, and success criteria
- [ ] **DEC-02**: Decomposed tasks are low-ambiguity: each includes objective, context, action guidance, success criteria, and verification method
- [ ] **DEC-03**: Decomposition is shallow by default (2 levels max) with adaptive decompose-on-failure for deeper breakdown
- [x] **DEC-04**: Task frontmatter is extended with: workflow, verification_type, side_effect_class, approval_required, estimated_size, execution_mode

### Task Creation and Queue Integration

- [ ] **QUE-01**: Orchestrator creates tasks via the existing task system and places them in the project queue
- [ ] **QUE-02**: Tasks are created with correct dependencies, capabilities, and priority so the existing heartbeat scanner can claim them
- [ ] **QUE-03**: Agents pick up tasks from the queue on their heartbeats via existing capability matching, dependency satisfaction, and priority sorting — no orchestrator-to-agent assignment needed
- [ ] **QUE-04**: Task/queue state is updated natively through the existing project system as agents claim and complete work

### Progress and Status

- [ ] **PRG-01**: Workflow progress is visible through existing board/queue/.index surfaces
- [ ] **PRG-02**: Orchestrator updates workflow file status as tasks complete or fail
- [ ] **PRG-03**: Users can query workflow status through existing project status commands

### Verification

- [ ] **VER-01**: Each task has a verification_type: automatic, human, external, or mixed
- [ ] **VER-02**: Automatic verification checks defined success criteria (test passes, file exists, command output matches)
- [ ] **VER-03**: Human verification creates a checkpoint that pauses execution until user confirms
- [ ] **VER-04**: Verification evidence is recorded alongside task checkpoint (command output, file diffs, API responses, user confirmation)
- [ ] **VER-05**: A task is not marked "done" until verification passes; failed verification triggers recovery

### Recovery

- [ ] **REC-01**: On task failure, orchestrator can retry the task (same shape, new attempt)
- [ ] **REC-02**: On task failure, orchestrator can decompose the task further into smaller subtasks
- [ ] **REC-03**: On task failure, orchestrator can reroute to a different worker type with different capabilities
- [ ] **REC-04**: On task failure, orchestrator can block the task and escalate to the user
- [ ] **REC-05**: Anti-loop budget enforced per task (default 3 retries) and per workflow (token ceiling), enforced outside the agent

### Resumability

- [ ] **RSM-01**: Workflow state persists across sessions via workflow file + task checkpoints
- [ ] **RSM-02**: Interrupted workflows can resume from last completed task, not from scratch
- [ ] **RSM-03**: Orchestrator reads workflow file and checkpoint state on resume to reconstruct execution context

### Human-in-the-Loop

- [ ] **HIL-01**: Tasks are classified by side_effect_class: none, reversible, irreversible
- [ ] **HIL-02**: Tasks with side_effect_class "none" or "reversible" auto-proceed without human approval
- [ ] **HIL-03**: Tasks with side_effect_class "irreversible" or approval_required=true pause for human confirmation
- [ ] **HIL-04**: Human checkpoints present the task, its planned action, and potential consequences for informed approval

### Project Placement

- [ ] **PPL-01**: Orchestrator determines whether work belongs in an existing project, a new project, or a sub-project
- [ ] **PPL-02**: Project placement uses heuristics: keyword/capability match against active projects, scope similarity
- [ ] **PPL-03**: User can override automatic project placement

### Workflow Templates

- [ ] **TPL-01**: Reusable workflow templates exist as markdown files with parameterized frontmatter
- [ ] **TPL-02**: Templates cover common work types (code feature, research report, ops runbook)
- [ ] **TPL-03**: Orchestrator matches user goals to templates and configures them for the specific request

### Workflow Synthesis

- [ ] **SYN-01**: When no template matches, orchestrator generates a tailored workflow from the user's natural language goal
- [ ] **SYN-02**: Synthesized workflows follow the same structure as templates (frontmatter + tasks + dependencies)
- [ ] **SYN-03**: Generated workflows are written to disk before execution begins (not ephemeral)

### Capability Model

- [x] **CAP-01**: Tasks have capability tags (code, research, ops, review, deploy, etc.) that are domain-agnostic
- [ ] **CAP-02**: Orchestrator dispatches tasks to workers with matching capabilities
- [ ] **CAP-03**: Capability matching is extensible — new capability types can be added without code changes

### Orchestration Agent

- [ ] **ORC-01**: Orchestration agent configured as a persistent agent in agents.list[] with its own workspace, IDENTITY.md, SOUL.md, and AGENTS.md
- [ ] **ORC-02**: Main agent delegates work to orchestrator via sessions_send; orchestrator processes goals and coordinates work asynchronously
- [ ] **ORC-03**: Orchestrator coordinates work by creating tasks in the project queue; agents pick up tasks via existing heartbeat claiming
- [ ] **ORC-04**: Orchestrator's AGENTS.md defines its operating instructions: decomposition standards, dispatch policy, verification rules, recovery behavior
- [ ] **ORC-05**: Planning (decomposition, workflow authoring) separated from dispatch (task assignment, state management) within the orchestrator's instruction set

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Workflow

- **AWF-01**: Workflow composition — one workflow can invoke another as a sub-workflow
- **AWF-02**: Execution mode flexibility — tasks can be auto, manual, or interactive
- **AWF-03**: Workflow parameterization — templates accept typed parameters that customize task generation

### Advanced Recovery

- **ARC-01**: Adaptive decomposition depth — automatically determine optimal decomposition level based on task complexity
- **ARC-02**: Worker performance tracking — route tasks to workers with better success rates for similar capability types
- **ARC-03**: Predictive failure detection — flag tasks likely to fail based on historical patterns

### Observability

- **OBS-01**: Workflow execution timeline visualization
- **OBS-02**: Token usage tracking per workflow/task
- **OBS-03**: Decomposition quality metrics

## Out of Scope

| Feature                                         | Reason                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Parallel artifact/state system                  | Orchestration composes with existing project system; no separate state store   |
| Full durable execution runtime (Temporal-style) | Massive infra complexity; checkpoint-based resumability is sufficient          |
| Visual workflow builder / DAG editor            | UI complexity explosion; markdown files are the "editor"                       |
| Unstructured agent-to-agent negotiation         | Agents use sessions_send for coordination; no free-form negotiation or bidding |
| Deep decomposition chains (>3 levels)           | Research shows deep chains increase failure probability and lose coherence     |
| Custom DSL for workflow definition              | Markdown + frontmatter is the existing pattern; no new language                |
| Real-time multi-agent negotiation               | Adds latency and non-determinism; orchestrator assigns directly                |
| Workflow versioning / branching                 | Workflows are ephemeral coordination artifacts, not source code                |
| Autonomous production deployment                | Irreversible actions always require human gates                                |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase   | Status  |
| ----------- | ------- | ------- |
| WF-01       | Phase 1 | Complete |
| WF-02       | Phase 1 | Complete |
| WF-03       | Phase 1 | Complete |
| WF-04       | Phase 1 | Pending |
| DEC-01      | Phase 2 | Pending |
| DEC-02      | Phase 2 | Pending |
| DEC-03      | Phase 2 | Pending |
| DEC-04      | Phase 1 | Complete |
| QUE-01      | Phase 2 | Pending |
| QUE-02      | Phase 2 | Pending |
| QUE-03      | Phase 2 | Pending |
| QUE-04      | Phase 2 | Pending |
| PRG-01      | Phase 6 | Pending |
| PRG-02      | Phase 6 | Pending |
| PRG-03      | Phase 6 | Pending |
| VER-01      | Phase 3 | Pending |
| VER-02      | Phase 3 | Pending |
| VER-03      | Phase 3 | Pending |
| VER-04      | Phase 3 | Pending |
| VER-05      | Phase 3 | Pending |
| REC-01      | Phase 4 | Pending |
| REC-02      | Phase 4 | Pending |
| REC-03      | Phase 4 | Pending |
| REC-04      | Phase 4 | Pending |
| REC-05      | Phase 4 | Pending |
| RSM-01      | Phase 4 | Pending |
| RSM-02      | Phase 4 | Pending |
| RSM-03      | Phase 4 | Pending |
| HIL-01      | Phase 3 | Pending |
| HIL-02      | Phase 3 | Pending |
| HIL-03      | Phase 3 | Pending |
| HIL-04      | Phase 3 | Pending |
| PPL-01      | Phase 5 | Pending |
| PPL-02      | Phase 5 | Pending |
| PPL-03      | Phase 5 | Pending |
| TPL-01      | Phase 5 | Pending |
| TPL-02      | Phase 5 | Pending |
| TPL-03      | Phase 5 | Pending |
| SYN-01      | Phase 5 | Pending |
| SYN-02      | Phase 5 | Pending |
| SYN-03      | Phase 5 | Pending |
| CAP-01      | Phase 1 | Complete |
| CAP-02      | Phase 2 | Pending |
| CAP-03      | Phase 2 | Pending |
| ORC-01      | Phase 2 | Pending |
| ORC-02      | Phase 2 | Pending |
| ORC-03      | Phase 2 | Pending |
| ORC-04      | Phase 2 | Pending |
| ORC-05      | Phase 2 | Pending |

**Coverage:**

- v1 requirements: 49 total
- Mapped to phases: 49
- Unmapped: 0

---

_Requirements defined: 2026-03-28_
_Last updated: 2026-03-28 after roadmap creation_
