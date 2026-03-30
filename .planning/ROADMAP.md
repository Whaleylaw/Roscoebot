# Roadmap: GSD-Style Orchestration Layer for Roscoebot

## Overview

This roadmap delivers an orchestration intelligence layer that turns natural language goals into structured, executable, verifiable project work. The build order follows component dependencies: schema foundation first, then decomposition (core value), verification and human gates, recovery and resumability, intake pipeline, and finally progress observability. Each phase delivers a coherent, independently verifiable capability that the next phase builds upon.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Schema & Workflow Foundation** - Workflow file format, extended task frontmatter, and directory structure
- [ ] **Phase 2: Orchestrator, Decomposition & Queue Integration** - Orchestrator agent setup, goal-to-task decomposition, dependency-aware queue placement
- [x] **Phase 3: Verification & Human-in-the-Loop** - Structured verification per task, side-effect classification, human approval gates
- [ ] **Phase 4: Recovery & Resumability** - Retry/decompose/reroute/escalate on failure, anti-loop budgets, cross-session resume
- [ ] **Phase 5: Intake Pipeline & Templates** - Project placement, workflow templates, workflow synthesis from natural language
- [ ] **Phase 6: Progress & Observability** - Workflow progress through existing board/queue surfaces, status querying

## Phase Details

### Phase 1: Schema & Workflow Foundation

**Goal**: Workflow files and extended task frontmatter exist as validated, first-class entities in the project directory structure
**Depends on**: Nothing (first phase)
**Requirements**: WF-01, WF-02, WF-03, WF-04, DEC-04, CAP-01
**Success Criteria** (what must be TRUE):

1. A workflows/ directory can be created inside any project directory and a WF-NNN.md file with valid YAML frontmatter can be written, read, and validated by the system
2. Workflow files transition through lifecycle states (draft, active, paused, completed, failed) and state changes persist correctly in frontmatter
3. Task frontmatter accepts the new orchestration fields (workflow, verification_type, side_effect_class, approval_required, estimated_size, execution_mode) without breaking existing task consumers
4. Tasks can declare domain-agnostic capability tags (code, research, ops, review, deploy) in frontmatter and these are preserved through create/read cycles

**Plans:** 3 plans

Plans:

- [x] 01-01-PLAN.md -- Schemas, types, and parser (WorkflowFrontmatterSchema, extended Task/Project schemas, parseWorkflowFrontmatter)
- [ ] 01-02-PLAN.md -- Templates, scaffold, and exports (generateWorkflowMd, nextWorkflowId, workflows/ dir, barrel exports)
- [x] 01-03-PLAN.md -- Capability registry (validateCapabilities, STANDARD_CAPABILITIES)

### Phase 2: Orchestrator, Decomposition & Queue Integration

**Goal**: An orchestrator agent receives a user goal and produces executable tasks with dependencies in the project queue, ready for agents to claim on heartbeat
**Depends on**: Phase 1
**Requirements**: DEC-01, DEC-02, DEC-03, QUE-01, QUE-02, QUE-03, QUE-04, CAP-02, CAP-03, ORC-01, ORC-02, ORC-03, ORC-04, ORC-05
**Success Criteria** (what must be TRUE):

1. A configured orchestration agent exists in agents.list[] with its own workspace, IDENTITY.md, SOUL.md, and AGENTS.md defining its operating instructions
2. The main agent can send a natural language goal to the orchestrator via sessions_send and the orchestrator produces a set of TASK-NNN.md files with objectives, context, action guidance, success criteria, and verification methods
3. Decomposed tasks appear in the project queue with correct dependencies, capabilities, and priority so that agents claim them on heartbeat without orchestrator-to-agent assignment
4. Task and queue state updates natively through the existing project system as agents claim and complete work
5. Capability matching routes tasks to agents with matching capability tags and new capability types can be added without code changes

**Plans:** 4 plans

Plans:

- [x] 02-01-PLAN.md -- Agent schema extension, generateTaskMd, orchestrator workspace templates
- [x] 02-02-PLAN.md -- QueueManager.addTasks batch method, validateTaskGraph, DecomposedTask type
- [x] 02-03-PLAN.md -- Atomic batch task creation pipeline (createTaskBatch)
- [ ] 02-04-PLAN.md -- Workflow status hook, orchestrateGoal pipeline function

### Phase 3: Verification & Human-in-the-Loop

**Goal**: Every completed task is verified before being marked done, with human approval gates for irreversible actions
**Depends on**: Phase 2
**Requirements**: VER-01, VER-02, VER-03, VER-04, VER-05, HIL-01, HIL-02, HIL-03, HIL-04
**Success Criteria** (what must be TRUE):

1. Each task has a verification_type (automatic, human, external, mixed) and appropriate verification runs when the task reports completion
2. Automatic verification checks success criteria (test passes, file exists, command output matches) and records evidence in the task checkpoint
3. Tasks classified as irreversible or approval_required pause execution and present the planned action and consequences to the user before proceeding
4. Tasks classified as side_effect_class "none" or "reversible" auto-proceed without human approval
5. A task is not marked "done" until its verification passes; failed verification keeps the task in a non-complete state

**Plans:** 4 plans

Plans:

- [x] 03-01-PLAN.md -- Schema extensions (success_criteria, review queue section, checkpoint verification, check runners)
- [x] 03-02-PLAN.md -- Verification engine and pre-complete hook gate logic
- [x] 03-03-PLAN.md -- CLI review approve/reject commands and gateway RPC methods
- [x] 03-04-PLAN.md -- Board UI Review column, verification evidence display, approve/reject buttons

### Phase 4: Recovery & Resumability

**Goal**: The system recovers gracefully from task failures and resumes interrupted workflows from where they left off
**Depends on**: Phase 3
**Requirements**: REC-01, REC-02, REC-03, REC-04, REC-05, RSM-01, RSM-02, RSM-03
**Success Criteria** (what must be TRUE):

1. On task failure, the orchestrator selects an appropriate recovery strategy: retry, decompose further, reroute to different capability, or escalate to user
2. Anti-loop budget is enforced per task (default 3 retries) and per workflow (token ceiling), and enforcement happens outside the agent context
3. An interrupted workflow resumes from the last completed task when the orchestrator restarts, not from scratch
4. Workflow state and task checkpoints persist across sessions so that the orchestrator can reconstruct execution context on resume

**Plans:** 4 plans

Plans:

- [ ] 04-01-PLAN.md -- Recovery types, strategy selection, checkpoint/schema extensions
- [ ] 04-02-PLAN.md -- Recovery manager, failTask entry point in task-lifecycle
- [ ] 04-03-PLAN.md -- Heartbeat scanner budget gate and backoff window
- [ ] 04-04-PLAN.md -- Workflow resume scanner, workflow-status-hook failure handling

### Phase 5: Intake Pipeline & Templates

**Goal**: Users describe goals in natural language and the system places work in the right project, selects or generates an appropriate workflow, and kicks off orchestration
**Depends on**: Phase 4
**Requirements**: PPL-01, PPL-02, PPL-03, TPL-01, TPL-02, TPL-03, SYN-01, SYN-02, SYN-03
**Success Criteria** (what must be TRUE):

1. The orchestrator determines whether a goal belongs in an existing project, a new project, or a sub-project, and the user can override that placement
2. Reusable workflow templates exist as markdown files covering at least three work types (code feature, research report, ops runbook) and the orchestrator matches goals to templates
3. When no template matches, the orchestrator generates a tailored workflow from the user's natural language goal, writes it to disk as a WF-NNN.md file before execution begins, and the generated workflow follows the same structure as templates
   **Plans**: TBD

### Phase 6: Progress & Observability

**Goal**: Users can see workflow progress and status through existing board/queue surfaces and status commands
**Depends on**: Phase 2
**Requirements**: PRG-01, PRG-02, PRG-03
**Success Criteria** (what must be TRUE):

1. Workflow progress is visible through existing board/queue/.index surfaces without requiring new UI
2. The orchestrator updates workflow file status as constituent tasks complete or fail
3. Users can query workflow status through existing project status commands and see task completion, blockers, and overall progress
   **Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6
(Phase 6 depends on Phase 2, not Phase 5, so it could theoretically run after Phase 2, but sequencing after Phase 5 keeps focus on the critical path first.)

| Phase                                              | Plans Complete | Status      | Completed |
| -------------------------------------------------- | -------------- | ----------- | --------- |
| 1. Schema & Workflow Foundation                    | 0/3            | Planning    | -         |
| 2. Orchestrator, Decomposition & Queue Integration | 0/4            | Planning    | -         |
| 3. Verification & Human-in-the-Loop                | 0/4            | Planning    | -         |
| 4. Recovery & Resumability                         | 0/4            | Planning    | -         |
| 5. Intake Pipeline & Templates                     | 0/TBD          | Not started | -         |
| 6. Progress & Observability                        | 0/TBD          | Not started | -         |
