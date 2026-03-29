# Technology Stack

**Project:** GSD-Style Orchestration Layer for Roscoebot
**Researched:** 2026-03-28

## Approach: Minimal New Dependencies

The existing Roscoebot/OpenClaw codebase already has the core primitives needed for orchestration: Zod schemas, task frontmatter with `depends_on`, queue management with heartbeat scanning, ACP agent spawning, and checkpoint sidecars. The orchestration layer should be built primarily with custom code on top of existing infrastructure, adding only surgical library choices where hand-rolling would be error-prone.

**Guiding principle:** This is an orchestration _intelligence_ layer, not a workflow engine product. Keep the dependency surface small. The hard parts are the AI reasoning (intent parsing, decomposition, verification design), not the state machine plumbing.

## Recommended Stack

### Workflow State Machine: XState v5

| Technology | Version | Purpose                             | Why                                                                                                                                                      | Confidence |
| ---------- | ------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `xstate`   | ^5.29.0 | Workflow lifecycle state management | Actor model, zero deps, TypeScript-native, visual inspector for debugging, statecharts handle hierarchical/parallel states that workflow lifecycles need | HIGH       |

**Rationale:** XState v5 is the clear winner for workflow lifecycle state machines in TypeScript. It models workflow states (draft, active, paused, blocked, completing, done, failed) as statecharts with guards, actions, and hierarchical substates. The actor model maps directly to orchestration: each workflow run is an actor, task executions are child actors, and the orchestrator is a supervisor actor.

Key advantages over alternatives:

- **Actor model built-in** -- orchestrator spawns child actors for task execution, monitors completion/failure
- **Statecharts** -- hierarchical states model workflow phases (e.g., "active.executing", "active.waiting-for-approval")
- **Guards and actions** -- dependency checks, capability matching, and recovery logic expressed declaratively
- **Inspect API** -- visual debugging of workflow state transitions during development
- **Persistence** -- built-in snapshot/restore maps to existing checkpoint system
- **Zero dependencies** -- no transitive dependency bloat

**What XState is NOT for:** XState manages the state machine for a single workflow run. It does not handle task DAG resolution, scheduling across multiple workflows, or the AI reasoning layer. Those are separate concerns.

### Task DAG Resolution: Custom (~100 LOC)

| Technology              | Version | Purpose                                              | Why                                                                                                          | Confidence |
| ----------------------- | ------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------- |
| Custom topological sort | N/A     | Resolve task execution order from `depends_on` graph | The existing `depends_on` field is a simple adjacency list; Kahn's algorithm is ~60 lines; no library needed | HIGH       |

**Rationale:** The codebase already has `depends_on: string[]` in `TaskFrontmatterSchema` and `checkAllDepsDone()` in the heartbeat scanner. The orchestration layer needs:

1. Topological sort to determine execution order
2. Parallel-level grouping (tasks at the same depth can run concurrently)
3. Cycle detection (reject circular dependencies)

This is a well-known algorithm (Kahn's algorithm) that is ~60-100 lines of TypeScript. Pulling in a library like `graphology-dag` or `typescript-graph` for this would add unnecessary weight. The existing `depends_on` field is already the adjacency list representation.

**Implementation sketch:**

```typescript
interface TaskNode {
  id: string;
  dependsOn: string[];
}

function resolveExecutionLevels(tasks: TaskNode[]): string[][] {
  // Kahn's algorithm with level tracking
  // Returns: [["TASK-001", "TASK-002"], ["TASK-003"], ["TASK-004"]]
  // Each inner array = tasks that can execute in parallel
}
```

### Schema & Validation: Zod (already in codebase)

| Technology | Version           | Purpose                                                      | Why                                                                                              | Confidence |
| ---------- | ----------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------- |
| `zod`      | ^4.3.6 (existing) | Workflow definition schemas, orchestration config validation | Already the project's schema library; 14x faster in v4; extends existing `TaskFrontmatterSchema` | HIGH       |

**Rationale:** The codebase uses Zod throughout (`src/projects/schemas.ts`). Workflow schemas are extensions of the existing task/project schemas. New schemas needed:

- `WorkflowFrontmatterSchema` -- workflow metadata (id, status, template, tasks, created/updated)
- `WorkflowTemplateSchema` -- reusable workflow template definitions
- Extended `TaskFrontmatterSchema` -- add `workflow`, `verification_type`, `side_effect_class`, `approval_required`, `estimated_size`, `execution_mode` fields
- `OrchestrationConfigSchema` -- recovery policies, parallelism limits, timeout defaults

No new validation library needed.

### Agent Spawning: ACP (already in codebase)

| Technology                 | Version           | Purpose                            | Why                                                                            | Confidence |
| -------------------------- | ----------------- | ---------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| `@agentclientprotocol/sdk` | 0.16.1 (existing) | Spawn and coordinate worker agents | Already the project's agent protocol; orchestrator spawns task workers via ACP | HIGH       |

**Rationale:** The codebase already has ACP spawning infrastructure (`src/agents/acp-spawn.ts`). The orchestrator agent type will use ACP to:

- Spawn worker agents for task execution
- Monitor agent session state (heartbeat integration)
- Receive completion/failure signals
- Pass task context (frontmatter + body) to workers

No new agent framework needed. The orchestrator is an agent that coordinates other agents using the existing protocol.

### Workflow File Parsing: gray-matter (already in codebase) + YAML

| Technology                  | Version           | Purpose                                      | Why                                                                       | Confidence |
| --------------------------- | ----------------- | -------------------------------------------- | ------------------------------------------------------------------------- | ---------- |
| `yaml`                      | ^2.8.3 (existing) | Parse workflow frontmatter in markdown files | Already used; workflows follow same frontmatter pattern as tasks/projects | HIGH       |
| `gray-matter` or equivalent | (existing)        | Frontmatter extraction from markdown         | Already used for task parsing                                             | HIGH       |

**Rationale:** Workflows are markdown files (`workflows/WF-NNN.md`) with YAML frontmatter, identical pattern to tasks. Reuse the existing parsing infrastructure.

### Recovery & Retry: Custom with exponential backoff

| Technology         | Version | Purpose                                                      | Why                                                                         | Confidence |
| ------------------ | ------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------- |
| Custom retry logic | N/A     | Task retry with budget, decompose-further, escalate patterns | ~50 LOC; XState guards handle the decision tree; no library needed for this | HIGH       |

**Rationale:** Recovery is an XState concern. The workflow state machine has transitions for:

- `TASK_FAILED` -> guard checks retry budget -> retry / decompose / escalate / block
- Each recovery strategy is a state transition, not a standalone retry library

The anti-loop budget (max retries per task, max total retries per workflow) is configuration in the orchestration schema, enforced by XState guards.

## Supporting Libraries (already present, no new installs)

| Library  | Version | Purpose                                 | When to Use                               |
| -------- | ------- | --------------------------------------- | ----------------------------------------- |
| `uuid`   | ^13.0.0 | Generate workflow and execution run IDs | Workflow creation, task assignment        |
| `croner` | ^10.0.1 | Scheduled workflow triggers (future)    | If/when scheduled workflows are needed    |
| `ws`     | ^8.20.0 | WebSocket RPC for orchestration status  | Gateway integration for real-time updates |

## What NOT to Use

| Category           | Rejected                                               | Why Not                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workflow engine    | Temporal, Inngest, Trigger.dev                         | External infrastructure dependencies; we're adding orchestration to an existing system, not deploying a workflow platform. These require servers, databases, and operational overhead that contradicts "compose with existing primitives." |
| Workflow engine    | Restate                                                | Same as above -- durable execution engine that requires its own runtime. Overkill for coordinating markdown-based task files.                                                                                                              |
| AI agent framework | Mastra, VoltAgent, LangChain/LangGraph, Google ADK     | These are standalone AI agent frameworks. Roscoebot already IS an agent system with its own runtime, protocols, and tool infrastructure. Adopting another agent framework would create a parallel system.                                  |
| AI agent framework | OpenAI Agents SDK                                      | Same -- replaces rather than composes with existing agent infrastructure.                                                                                                                                                                  |
| Graph library      | graphology, typescript-graph, ts-edge                  | Over-engineered for simple `depends_on` DAG resolution. ts-edge is interesting but adds a new execution model that conflicts with the existing task/queue system.                                                                          |
| State machine      | typescript-fsm, robot3                                 | XState is the mature, well-typed choice with actor model support. These are simpler FSMs without the hierarchical states and actor spawning that orchestration needs.                                                                      |
| DAG library        | topological-sort, @graph-algorithm/topological-sorting | Simple toposort is trivially implementable; these add dependencies for ~30 lines of code.                                                                                                                                                  |

## Installation

```bash
# Single new dependency
pnpm add xstate@^5.29.0
```

Everything else is already in the project.

## Version Verification

| Package                  | Claimed Version | Verification                                       | Status                 |
| ------------------------ | --------------- | -------------------------------------------------- | ---------------------- |
| xstate                   | ^5.29.0         | npm shows 5.29.0 published 3 days ago (2026-03-25) | VERIFIED via WebSearch |
| zod                      | ^4.3.6          | Already in package.json                            | VERIFIED via codebase  |
| @agentclientprotocol/sdk | 0.16.1          | Already in package.json                            | VERIFIED via codebase  |
| @sinclair/typebox        | 0.34.48         | Already in package.json (for tool schemas)         | VERIFIED via codebase  |

## Architecture Fit

The stack recommendation follows a clear separation of concerns:

```
Layer               | Technology      | Responsibility
--------------------|-----------------|----------------------------------
AI Reasoning        | LLM (existing)  | Intent parsing, decomposition, workflow synthesis
State Management    | XState v5       | Workflow lifecycle, recovery transitions
Task Scheduling     | Custom DAG      | Execution order, parallel grouping
Schema/Validation   | Zod (existing)  | Workflow definitions, config validation
Agent Coordination  | ACP (existing)  | Worker spawning, monitoring, communication
Persistence         | Filesystem (existing) | Workflow files, checkpoints, task state
Real-time Updates   | WebSocket (existing)  | Gateway RPC for UI/status
```

## Sources

- [XState GitHub](https://github.com/statelyai/xstate) -- 27k+ stars, actively maintained, v5.29.0 as of March 2026
- [XState Documentation](https://stately.ai/docs/xstate) -- Actor model, persistence, TypeScript support
- [XState + Restate integration](https://www.restate.dev/blog/persistent-serverless-state-machines-with-xstate-and-restate) -- Validates XState for backend workflow use cases
- [Zod v4 release](https://www.infoq.com/news/2025/08/zod-v4-available/) -- 14x performance improvement, already adopted in codebase
- [Inngest](https://www.inngest.com/) -- Evaluated and rejected (external infrastructure)
- [Mastra](https://mastra.ai/) -- Evaluated and rejected (standalone agent framework)
- [ts-edge](https://github.com/cgoinglove/ts-edge) -- Evaluated and rejected (conflicts with existing execution model)

---

_Stack research: 2026-03-28_
