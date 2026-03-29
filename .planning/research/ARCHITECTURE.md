# Architecture Research

**Domain:** AI agent workflow orchestration layer (brownfield, on top of existing project/task/queue/checkpoint system)
**Researched:** 2026-03-28
**Confidence:** MEDIUM-HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Intake & Placement                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Goal Parser  │  │ Project      │  │ Workflow     │           │
│  │              │  │ Placer       │  │ Selector     │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         └─────────────────┼─────────────────┘                   │
├───────────────────────────┼─────────────────────────────────────┤
│                    Orchestration Core                             │
│  ┌──────────────┐  ┌──────┴───────┐  ┌──────────────┐           │
│  │ Decomposition│  │ DAG          │  │ Verification │           │
│  │ Engine       │──│ Scheduler    │──│ Framework    │           │
│  └──────────────┘  └──────┬───────┘  └──────────────┘           │
│                           │                                      │
│  ┌──────────────┐  ┌──────┴───────┐  ┌──────────────┐           │
│  │ Recovery     │  │ Dispatch     │  │ Workflow     │           │
│  │ Policy       │──│ Controller   │──│ State Machine│           │
│  └──────────────┘  └──────┬───────┘  └──────────────┘           │
├───────────────────────────┼─────────────────────────────────────┤
│                  Existing Project Substrate                       │
│  ┌──────────┐  ┌──────────┤  ┌──────────┐  ┌──────────┐         │
│  │ Tasks/   │  │ queue.md │  │Checkpoint│  │ .index/  │         │
│  │ TASK-NNN │  │          │  │ sidecars  │  │ JSON     │         │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │
│  ┌──────────┐  ┌──────────┐                                      │
│  │PROJECT.md│  │Heartbeat │                                      │
│  │          │  │ Scanner  │                                      │
│  └──────────┘  └──────────┘                                      │
└─────────────────────────────────────────────────────────────────┘
```

The architecture is a three-layer cake. The top layer handles user intent (parsing goals, placing them into projects, selecting or synthesizing workflows). The middle layer is the orchestration core that decomposes workflows into tasks, schedules execution respecting the dependency DAG, dispatches to workers, verifies results, and handles recovery. The bottom layer is the existing project substrate -- tasks, queue, checkpoints, indexes -- which remains the single source of truth for all state.

### Component Responsibilities

| Component              | Responsibility                                           | Integration Point                                        |
| ---------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Goal Parser            | Extract structured intent from natural language          | Produces a goal spec consumed by Project Placer          |
| Project Placer         | Determine existing project vs new project vs sub-project | Reads existing project index; creates via ProjectManager |
| Workflow Selector      | Match goal to workflow template or trigger synthesis     | Reads `workflows/` templates; outputs WF-NNN.md          |
| Decomposition Engine   | Break workflow steps into executable TASK-NNN.md files   | Writes task files + queue entries via QueueManager       |
| DAG Scheduler          | Topological ordering, parallel-when-safe dispatch        | Reads `depends_on` from task frontmatter                 |
| Dispatch Controller    | Assign tasks to agents by capability match               | Uses existing heartbeat scanner's capability matching    |
| Verification Framework | Validate task completion per verification_type           | Reads checkpoint + task outputs; writes evidence         |
| Recovery Policy        | Retry / decompose further / reroute / escalate           | Modifies task status; may re-queue or create sub-tasks   |
| Workflow State Machine | Track workflow-level progress across its tasks           | Reads/writes WF-NNN.md frontmatter                       |

## Recommended Project Structure

```
src/orchestration/                  # New orchestration module
├── intake/                         # Goal parsing and project placement
│   ├── goal-parser.ts              # Extract structured intent from NL
│   ├── project-placer.ts           # Existing vs new project decision
│   └── types.ts                    # GoalSpec, PlacementResult types
├── workflows/                      # Workflow file management
│   ├── workflow-schema.ts          # WF frontmatter schema (zod)
│   ├── workflow-selector.ts        # Template matching logic
│   ├── workflow-synthesizer.ts     # Generate workflow from goal when no template fits
│   ├── workflow-state.ts           # Workflow state machine (pending→active→done)
│   └── types.ts                    # WorkflowFrontmatter, WorkflowStep types
├── decomposition/                  # Task decomposition from workflow steps
│   ├── decomposer.ts              # Workflow steps → TASK-NNN.md files
│   ├── task-author.ts             # Structured task content generator
│   └── dependency-graph.ts         # Build and validate DAG from depends_on
├── scheduler/                      # DAG-aware task scheduling
│   ├── dag-scheduler.ts           # Topological sort, ready-set computation
│   ├── dispatch-controller.ts     # Agent assignment and parallel dispatch
│   └── execution-tracker.ts       # Track in-flight tasks, completion events
├── verification/                   # Task and workflow verification
│   ├── verification-runner.ts     # Route to correct verifier by type
│   ├── verifiers/                 # Per-type verifiers
│   │   ├── automatic.ts           # LLM or script-based checks
│   │   ├── human.ts               # Queue for human review
│   │   └── external.ts            # External service checks
│   └── evidence.ts                # Evidence recording format
├── recovery/                       # Failure handling
│   ├── recovery-policy.ts         # Retry/decompose/reroute/escalate logic
│   ├── budget-tracker.ts          # Anti-loop retry budgets
│   └── escalation.ts              # Human escalation path
├── orchestrator-agent.ts          # Orchestrator agent type entry point
└── index.ts                       # Public barrel exports

~/.openclaw/projects/{name}/
├── PROJECT.md                     # (existing)
├── queue.md                       # (existing)
├── tasks/
│   ├── TASK-001.md                # (existing format, extended frontmatter)
│   ├── TASK-001.checkpoint.json   # (existing)
│   └── ...
├── workflows/                     # NEW: first-class workflow files
│   ├── WF-001.md                  # Workflow definition + state
│   └── WF-002.md
└── .index/                        # (existing, extended with workflow index)
    ├── project.json
    ├── board.json
    ├── queue.json
    └── workflows.json             # NEW: workflow index
```

### Structure Rationale

- **src/orchestration/:** Isolated module boundary. Does not pollute existing `src/projects/` or `src/agents/`. Clean import surface for gateway RPC methods and agent tools.
- **intake/ separate from decomposition/:** Intake is about understanding what the user wants and where it goes. Decomposition is about translating a workflow into tasks. Different concerns, different change rates.
- **scheduler/ separate from decomposition/:** Decomposition produces the DAG. Scheduling consumes it. Decomposition happens once per workflow; scheduling is ongoing as tasks complete.
- **workflows/ in project dir:** Consistent with existing markdown-on-disk pattern (PROJECT.md, tasks/). Human-readable. Agent-parseable. No new storage layer.

## Architectural Patterns

### Pattern 1: Orchestrator-as-Dedicated-Agent

**What:** The orchestrator is a specialized agent type spawned by the main agent via ACP (Agent Communication Protocol). It gets its own context window, system prompt, and tool set tailored for coordination rather than execution.

**When to use:** Always, for any workflow involving more than a single task. The orchestrator owns the workflow lifecycle; worker agents own individual task execution.

**Trade-offs:** Extra context window cost (orchestrator + N workers vs single agent), but clean separation means the orchestrator never fills its context with execution details it does not need. Anthropic's research system showed 90% improvement with this pattern.

**Integration with existing system:** The existing `acp-spawn.ts` already supports spawning subagents with tasks, labels, and agent IDs. The orchestrator agent type would be registered as a new agent scope (alongside the existing agent types), spawned via the same ACP infrastructure.

```typescript
// Orchestrator spawns a worker for a specific task
const result = await spawnAcp({
  task: `Execute task TASK-003 in project ${projectName}`,
  agentId: workerAgentId,
  label: `worker:${taskId}`,
  mode: "run",
});
```

### Pattern 2: Workflow-as-State-Machine on Markdown

**What:** Each WF-NNN.md file has frontmatter tracking the workflow's lifecycle state, and the body contains the workflow steps. State transitions are atomic writes to the file. The workflow state machine is: `pending -> active -> verifying -> done | failed | blocked`.

**When to use:** Every workflow. The state machine is the single source of truth for whether the orchestrator should advance, wait, retry, or escalate.

**Trade-offs:** Markdown-on-disk is slower than a database but consistent with the existing project system. File locking (already solved for queue.md) prevents concurrent corruption. The trade-off is appropriate because workflow state changes are infrequent (task-completion granularity, not per-token).

```markdown
---
id: WF-001
title: "Implement user authentication"
status: active # pending | active | verifying | done | failed | blocked
created: 2026-03-28
updated: 2026-03-28
tasks: [TASK-001, TASK-002, TASK-003, TASK-004]
current_step: 2
total_steps: 4
recovery_budget: 3 # remaining retries before escalation
---

## Steps

1. **Design auth schema** -> TASK-001 (done)
2. **Implement login endpoint** -> TASK-002 (in-progress)
3. **Add session middleware** -> TASK-003 (backlog, depends: TASK-002)
4. **Write integration tests** -> TASK-004 (backlog, depends: TASK-003)
```

### Pattern 3: DAG Scheduling via Existing depends_on

**What:** The task DAG is expressed entirely through the existing `depends_on` field in task frontmatter. The scheduler computes the "ready set" (tasks whose dependencies are all `done`) and dispatches them in parallel. No new DAG storage needed.

**When to use:** All multi-task workflows. Even linear sequences are expressed as a chain of depends_on.

**Trade-offs:** Reading N task files to compute the ready set is O(N) disk reads per scheduling cycle. For projects with <100 tasks this is negligible (<10ms). For larger projects, the .index/board.json can serve as a cache of task statuses, reducing to a single file read.

**Implementation approach:**

```typescript
// Compute which tasks are ready to dispatch
function computeReadySet(workflowTasks: TaskFrontmatter[]): TaskFrontmatter[] {
  const doneIds = new Set(workflowTasks.filter((t) => t.status === "done").map((t) => t.id));
  return workflowTasks.filter(
    (t) => t.status === "backlog" && t.depends_on.every((dep) => doneIds.has(dep)),
  );
}
```

### Pattern 4: Verification-as-Evidence-Chain

**What:** Each task has a `verification_type` in frontmatter (automatic, human, external, mixed). On task completion, the verification framework runs the appropriate verifier and records structured evidence in the checkpoint sidecar's `log` array.

**When to use:** Every task completion. Verification is not optional -- it is the signal that allows the DAG scheduler to advance.

**Trade-offs:** Automatic verification requires LLM calls (cost). Human verification blocks the workflow until a human responds. The trade-off is controlled by the workflow author choosing the verification_type per task.

```typescript
interface VerificationEvidence {
  type: "automatic" | "human" | "external";
  passed: boolean;
  timestamp: string;
  details: string;
  artifacts?: string[]; // paths to output files
}
```

### Pattern 5: Recovery with Anti-Loop Budget

**What:** When a task fails verification, the recovery policy checks the workflow's `recovery_budget`. If budget remains: retry (re-queue), decompose further (split into sub-tasks), or reroute (different agent/capability). If budget exhausted: block the workflow and escalate to human.

**When to use:** Every task failure. The budget prevents infinite retry loops -- a critical production safety mechanism.

**Trade-offs:** Fixed budgets may be too conservative for some tasks and too generous for others. Start with per-workflow budgets (simple), evolve to per-task budgets if needed.

## Data Flow

### Goal-to-Execution Flow

```
User Goal (natural language)
    |
    v
[Goal Parser] -> GoalSpec { intent, domain, constraints, size_hint }
    |
    v
[Project Placer] -> ProjectRef { project_dir, is_new, is_sub_project }
    |                    |
    |                    v (if new project)
    |               [ProjectManager.create()]
    |
    v
[Workflow Selector] -> WorkflowRef { wf_id, template_used, steps[] }
    |                       |
    |                       v (if no template fits)
    |                  [Workflow Synthesizer] -> WF-NNN.md
    |
    v
[Decomposition Engine]
    |-- writes tasks/TASK-NNN.md (with frontmatter: depends_on, capabilities, verification_type)
    |-- updates queue.md via QueueManager (adds to Available)
    |-- writes WF-NNN.md (links tasks to steps)
    |
    v
[DAG Scheduler]
    |-- computes ready set from depends_on graph
    |-- dispatches ready tasks via Dispatch Controller
    |
    v
[Worker Agent (via ACP spawn)]
    |-- claims task via heartbeat scanner
    |-- executes task, updates checkpoint
    |-- signals completion
    |
    v
[Verification Framework]
    |-- runs verifier matching task's verification_type
    |-- records evidence in checkpoint
    |-- if PASS: marks task done, triggers scheduler re-evaluation
    |-- if FAIL: triggers Recovery Policy
    |
    v
[Recovery Policy]
    |-- checks budget
    |-- retry | decompose | reroute | escalate
    |-- updates task/queue state accordingly
    |
    v
[Workflow State Machine]
    |-- when all tasks done + verified: workflow -> done
    |-- updates WF-NNN.md frontmatter
```

### State Management

All state lives on disk in the existing project directory structure:

| State                        | Location                          | Read by                               | Written by                          |
| ---------------------------- | --------------------------------- | ------------------------------------- | ----------------------------------- |
| Workflow definition + status | `workflows/WF-NNN.md` frontmatter | Scheduler, State Machine, Gateway RPC | Intake, State Machine, Recovery     |
| Task definition + status     | `tasks/TASK-NNN.md` frontmatter   | Scanner, Scheduler, Verifier          | Decomposer, Worker, Verifier        |
| Task execution progress      | `tasks/TASK-NNN.checkpoint.json`  | Scanner (resume), Verifier            | Worker agent, Verifier              |
| Queue position               | `queue.md`                        | Scanner, Scheduler                    | Decomposer, Dispatcher, Recovery    |
| Indexes (cache)              | `.index/*.json`                   | Gateway RPC, UI                       | ProjectSyncService (on file change) |

The ProjectSyncService (chokidar watcher) already handles index regeneration on file changes. Adding `workflows/` to its watch glob and a `workflows.json` index generator is the only sync-layer change needed.

### Key Data Flows

1. **Claim-Execute-Verify loop:** Heartbeat scanner claims task -> worker executes -> checkpoint updated -> verification runs -> task marked done -> scheduler re-evaluates DAG -> next tasks dispatched. This loop is the core execution engine.

2. **Recovery re-entry:** Failed verification -> recovery policy -> re-queue task (or create sub-tasks) -> they re-enter the Available queue -> heartbeat scanner picks them up. The recovery path re-uses the same claim-execute-verify loop.

3. **Context injection:** The existing `project-context-hook.ts` injects PROJECT.md into agent bootstrap. For the orchestrator agent, extend this to also inject the active WF-NNN.md and a summary of task statuses. For worker agents, inject only the specific TASK-NNN.md content.

## Integration Points

### Existing System Integration

| Boundary                        | Communication                                                                                         | Notes                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Orchestrator <-> Project System | Direct import of `src/projects/` (QueueManager, checkpoint, frontmatter, schemas)                     | No RPC needed; same process                              |
| Orchestrator <-> Agent System   | ACP spawn (`src/agents/acp-spawn.ts`) for worker dispatch                                             | Workers are standard agents with project context         |
| Orchestrator <-> Gateway        | New RPC methods in `server-methods/` (e.g., `workflows.list`, `workflows.get`, `orchestration.start`) | Follows existing pattern in `server-methods/projects.ts` |
| Orchestrator <-> Sync Service   | Add `workflows/` to ProjectSyncService watch; add `generateWorkflowIndex()`                           | Minimal change to existing sync-service.ts               |
| Orchestrator <-> Config         | Orchestrator agent type registered in config schema (`config/types.agents.ts`)                        | New agent scope, not new config subsystem                |
| Worker <-> Orchestrator         | Indirect: worker writes checkpoint -> sync service emits event -> orchestrator reacts                 | No direct coupling between worker and orchestrator       |

### New Gateway RPC Methods

| Method                 | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `workflows.list`       | List workflows in a project                                 |
| `workflows.get`        | Get a single workflow with task status summary              |
| `orchestration.start`  | Accept a goal, trigger the intake -> decomposition pipeline |
| `orchestration.status` | Get orchestration state for a workflow                      |

### New Frontmatter Extensions

Task frontmatter additions (extend existing `TaskFrontmatterSchema`):

```typescript
// Added to TaskFrontmatterSchema
workflow: z.string().nullable().default(null),           // WF-001
verification_type: z.enum(["automatic", "human", "external", "mixed"]).default("automatic"),
side_effect_class: z.enum(["none", "reversible", "irreversible"]).default("none"),
approval_required: z.boolean().default(false),
estimated_size: z.enum(["xs", "s", "m", "l", "xl"]).default("m"),
execution_mode: z.enum(["agent", "human", "tool"]).default("agent"),
```

These are all optional with defaults, so existing tasks remain valid without changes.

## Build Order (Dependency-Driven)

The components have clear build-order dependencies:

```
Phase 1: Workflow Schema + Files          (foundation -- everything else references workflows)
   |
   v
Phase 2: Decomposition Engine             (needs workflow schema to produce tasks)
   |
   v
Phase 3: DAG Scheduler + Dispatch         (needs tasks with depends_on to schedule)
   |
   v
Phase 4: Verification Framework           (needs completed tasks to verify)
   |
   v
Phase 5: Recovery Policy                  (needs verification results to trigger recovery)
   |
   v
Phase 6: Intake Pipeline                  (needs all downstream components to be end-to-end)
   |
   v
Phase 7: Orchestrator Agent Type          (wraps everything as a spawnable agent)
```

**Why this order:**

- Workflow schema first because every component references WF-NNN.md files
- Decomposition before scheduling because the scheduler needs tasks to exist
- Verification before recovery because recovery is triggered by verification failure
- Intake last (before final agent wiring) because it needs to call decomposition which needs scheduling which needs verification -- the full downstream chain must exist
- Orchestrator agent type wraps everything and is the integration surface

**Alternative: MVP shortcut.** Build phases 1-3 first as a manually-triggered pipeline (CLI command creates workflow + tasks + dispatches). This proves the core loop without intake intelligence or recovery. Then layer on verification (4), recovery (5), intake (6), and agent wiring (7).

## Anti-Patterns

### Anti-Pattern 1: Orchestrator Executes Tasks Directly

**What people do:** The orchestrator agent tries to both coordinate and execute tasks in its own context window.
**Why it's wrong:** Context pollution. The orchestrator's context fills with execution details (code, file contents, error traces) that are irrelevant to coordination. Anthropic's research showed dedicated subagents outperform single-agent execution by 90%.
**Do this instead:** Orchestrator only reads task status and verification results. Workers handle execution in their own context windows via ACP spawn.

### Anti-Pattern 2: Parallel State Store

**What people do:** Create a separate database or state store for orchestration alongside the existing markdown files.
**Why it's wrong:** Two sources of truth for task status inevitably drift. State reconciliation code is a permanent maintenance burden.
**Do this instead:** Use the existing project substrate (tasks/, queue.md, checkpoints) as the only state store. The orchestration layer reads from and writes to the same files.

### Anti-Pattern 3: Eager Full Decomposition

**What people do:** Decompose the entire workflow into all tasks upfront before executing any.
**Why it's wrong:** Later tasks often depend on the output of earlier tasks for accurate specification. A task like "fix the bug found in step 3" cannot be meaningfully authored before step 3 executes.
**Do this instead:** Decompose in waves. Create the first batch of tasks (those with no dependencies). As they complete, decompose the next wave with the benefit of their outputs. The workflow file tracks which steps have been decomposed.

### Anti-Pattern 4: No Retry Budget

**What people do:** Allow unlimited retries on failed tasks.
**Why it's wrong:** Infinite retry loops burn tokens and never converge. If a task fails 3 times with the same approach, retrying a 4th time with the same agent and prompt will not produce a different result.
**Do this instead:** Fixed recovery budget per workflow (default: 3). Each retry, decomposition, or reroute decrements the budget. Budget exhausted = escalate to human.

### Anti-Pattern 5: Tight Coupling Between Orchestrator and Worker

**What people do:** Orchestrator directly calls worker functions or shares in-memory state.
**Why it's wrong:** Workers must be replaceable (different agent, different model, different capability set). Direct coupling prevents this.
**Do this instead:** Communicate through the filesystem. Orchestrator writes task file + queue entry. Worker claims via scanner. Worker writes checkpoint. Orchestrator reads checkpoint. The filesystem is the message bus.

## Scaling Considerations

| Scale                   | Architecture Adjustments                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1-5 concurrent tasks    | Single orchestrator, sequential DAG evaluation. Current heartbeat scanner is sufficient.                               |
| 5-20 concurrent tasks   | Batch DAG evaluation (compute full ready set). Parallel ACP spawns. Index cache for status reads.                      |
| 20-100 concurrent tasks | Move DAG state to .index/dag.json (computed, not authoritative). Add workflow-level queue for multi-workflow projects. |
| 100+ concurrent tasks   | This is unlikely for a single project. If needed, partition into sub-projects with independent orchestrators.          |

### Scaling Priorities

1. **First bottleneck: Task file reads during scheduling.** Computing the ready set requires reading every task's frontmatter in the workflow. Mitigate by using `.index/board.json` as a cache (already generated by ProjectSyncService on file changes).

2. **Second bottleneck: Queue lock contention.** Multiple orchestrators or workers claiming/completing tasks compete for queue.md's file lock. The existing 3-retry exponential backoff handles moderate contention. For higher contention, batch queue operations (claim multiple tasks in one lock acquisition).

## Sources

- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) -- orchestrator-worker separation, task delegation, scaling effort
- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents) -- composable patterns, orchestrator-worker
- [Microsoft: AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) -- DAG patterns, state management
- [LangGraph multi-agent orchestration](https://latenode.com/blog/ai-frameworks-technical-infrastructure/langgraph-multi-agent-orchestration/langgraph-multi-agent-orchestration-complete-framework-guide-architecture-analysis-2025) -- StateGraph, checkpointing, conditional branching
- [Task Decomposition Agent Pattern](https://www.agentpatterns.tech/en/agent-patterns/task-decomposition-agent) -- decomposition strategies, DAG representation
- [Vellum: Agentic Workflows in 2026](https://vellum.ai/blog/agentic-workflows-emerging-architectures-and-design-patterns) -- state machine patterns, production considerations
- [arXiv: Orchestration of Multi-Agent Systems](https://arxiv.org/html/2601.13671v1) -- checkpoint/resume, state management
- Existing codebase: `src/projects/` (heartbeat-scanner, checkpoint, queue-manager, schemas, scaffold, sync-service), `src/agents/acp-spawn.ts`, `src/agents/project-context-hook.ts`, `src/gateway/server-methods/projects.ts`

---

_Architecture research for: AI agent workflow orchestration layer_
_Researched: 2026-03-28_
