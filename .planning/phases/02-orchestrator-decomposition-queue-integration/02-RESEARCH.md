# Phase 2: Orchestrator, Decomposition & Queue Integration - Research

**Researched:** 2026-03-29
**Domain:** Agent orchestration, task decomposition, queue integration within existing OpenClaw project system
**Confidence:** HIGH

## Summary

Phase 2 builds the orchestrator agent that receives user goals (via sessions_send), decomposes them into executable tasks, validates the task graph, and places tasks in the project queue for agents to claim on heartbeat. The implementation composes entirely with existing primitives: ProjectManager, QueueManager, heartbeat-scanner, capability-matcher, and the internal hooks system. The core work is: (1) orchestrator agent configuration files, (2) a `generateTaskMd` template helper, (3) batch task creation + queue entry addition, (4) decomposition validation logic, (5) a task-completion hook for workflow status propagation, and (6) schema additions to `AgentEntrySchema` for `project` and `capabilities` fields.

The existing codebase provides strong foundations. The queue system already handles file locking, section management, and serialization. The heartbeat scanner already filters by capabilities and dependency satisfaction. The hooks system supports registering handlers on `type:action` keys. The main gaps are: QueueManager lacks an `addTask` method, there's no `generateTaskMd` helper, `AgentEntrySchema` lacks `project` and `capabilities` fields, and there's no batch operation that atomically creates multiple tasks + queue entries + workflow frontmatter updates.

**Primary recommendation:** Extend existing modules (scaffold.ts, queue-manager.ts, templates.ts, schemas.ts for config) with targeted additions. Create a new `src/projects/orchestrator.ts` module that coordinates the decomposition-to-queue pipeline. Ship orchestrator workspace files as static templates.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** LLM-driven decomposition. No template-matching layer.
- **D-02:** Adaptive depth. Orchestrator judges decomposition depth per-goal. Simple goals get flat task lists, complex goals get 2-level hierarchy. Max 2 levels per DEC-03.
- **D-03:** Clarification loop before decomposition. Tiered model: ask delegating agent first, escalate to user.
- **D-04:** Adaptive clarification rounds. No hard cap.
- **D-05:** Full spec per task. All 5 DEC-02 fields filled.
- **D-06:** Validate before writing. Sanity checks on task graph before committing.
- **D-07:** Approve unless high-stakes. Auto-proceed for side_effect_class "none". Present for user approval when "irreversible" or approval_required=true.
- **D-08:** Pre-configured in repo defaults. Ship workspace files as part of repo/package.
- **D-09:** sessions_send with structured payload. Main agent sends structured message via sessions_send.
- **D-10:** Heartbeat polling for monitoring.
- **D-11:** Sections in one AGENTS.md. Single orchestrator agent with "## Decomposition Standards" and "## Dispatch Policy" sections.
- **D-12:** Shared agent, project-scoped sessions. One orchestrator agent definition, separate sessions per project.
- **D-13:** Static AGENTS.md + project context hook. Project-specific context injected via existing project-context-hook.ts.
- **D-14:** All tasks created at once. One batch, tasks with unmet deps sit in Available.
- **D-15:** Direct ProjectManager/QueueManager. Same process, atomic file operations.
- **D-16:** Event hook for workflow status updates. Task completion triggers hook updating parent workflow.
- **D-17:** Existing queue sections only. No new queue sections.
- **D-18:** Single atomic batch operation. Create all task files, add queue entries, update workflow frontmatter in one batch. Roll back on failure.
- **D-19:** agents.list[] for discovery. Orchestrator reads capabilities from config, doesn't assign agents.
- **D-20:** Project-level registry only. Capabilities defined in PROJECT.md.
- **D-21:** Block creation for unmatched capabilities. Refuse to create tasks with capabilities no agent can fulfill.
- **D-22:** Flat string matching. ANY-match via existing matchCapabilities().

### Claude's Discretion

- Internal decomposition prompt engineering
- Exact structure of structured payload sent via sessions_send
- Hook implementation details for D-16 (which hook type, event shape)
- AGENTS.md section organization beyond the two required sections
- Validation bounds (max task count, allowed dep graph complexity)

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                                       | Research Support                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| DEC-01 | Orchestrator decomposes user goal into executable tasks with deps, capabilities, success criteria | Orchestrator AGENTS.md decomposition instructions + LLM reasoning; generateTaskMd template; validation logic |
| DEC-02 | Each task includes objective, context, action guidance, success criteria, verification method     | generateTaskMd template enforces all 5 sections in task markdown body                                        |
| DEC-03 | Decomposition is shallow (2 levels max) with adaptive decompose-on-failure                        | AGENTS.md instruction set limits depth; `parent` field in TaskFrontmatterSchema already supports hierarchy   |
| QUE-01 | Orchestrator creates tasks via existing task system and places in queue                           | New batch method on ProjectManager + QueueManager.addTask()                                                  |
| QUE-02 | Tasks created with correct deps, capabilities, priority for heartbeat claiming                    | TaskFrontmatterSchema already has depends_on, capabilities, priority fields                                  |
| QUE-03 | Agents pick up tasks from queue via heartbeat capability matching                                 | scanAndClaimTask already handles this -- no changes needed                                                   |
| QUE-04 | Task/queue state updates natively through existing project system                                 | Existing QueueManager.claimTask/moveTask + checkpoint system                                                 |
| CAP-02 | Orchestrator dispatches tasks to workers with matching capabilities                               | validateCapabilities() for pre-creation check; matchCapabilities() at heartbeat                              |
| CAP-03 | Capability matching extensible -- new types without code changes                                  | Already works: flat strings in PROJECT.md allowed_capabilities, no hardcoded enum                            |
| ORC-01 | Orchestrator configured in agents.list[] with workspace files                                     | New agent entry in default config + shipped IDENTITY.md, SOUL.md, AGENTS.md                                  |
| ORC-02 | Main agent delegates via sessions_send; orchestrator processes asynchronously                     | Existing sessions_send tool; structured payload format                                                       |
| ORC-03 | Orchestrator coordinates by creating tasks in queue; agents claim via heartbeat                   | Batch creation pipeline: tasks -> queue entries -> workflow update                                           |
| ORC-04 | Orchestrator AGENTS.md defines operating instructions                                             | Static AGENTS.md with decomposition standards and dispatch policy sections                                   |
| ORC-05 | Planning separated from dispatch within instruction set                                           | Two AGENTS.md sections: "## Decomposition Standards" and "## Dispatch Policy"                                |

</phase_requirements>

## Standard Stack

### Core

| Library          | Version  | Purpose                                                    | Why Standard                                 |
| ---------------- | -------- | ---------------------------------------------------------- | -------------------------------------------- |
| zod              | ^4.3.6   | Schema validation for config extensions (AgentEntrySchema) | Already used throughout config layer         |
| yaml             | ^2.8.3   | YAML frontmatter generation/parsing for task files         | Already used in templates.ts, frontmatter.ts |
| node:fs/promises | built-in | Atomic file writes for task creation                       | Already used in scaffold.ts                  |
| node:crypto      | built-in | UUID generation for atomic write temp files                | Already used in scaffold.ts                  |

### Supporting

| Library                   | Version  | Purpose                                    | When to Use                  |
| ------------------------- | -------- | ------------------------------------------ | ---------------------------- |
| withFileLock (plugin-sdk) | existing | Queue file locking during batch operations | Already used by QueueManager |

### Alternatives Considered

None -- all work extends existing modules with existing dependencies.

## Architecture Patterns

### Recommended Project Structure

```
src/projects/
  orchestrator.ts           # NEW: Batch task creation + validation pipeline
  orchestrator.test.ts      # NEW: Unit tests for orchestrator module
  templates.ts              # EXTEND: Add generateTaskMd()
  queue-manager.ts          # EXTEND: Add addTask() / addTasks()
  scaffold.ts               # EXTEND: Add batch task creation helpers
  schemas.ts                # NO CHANGE (task/workflow schemas already complete from Phase 1)
  capability-registry.ts    # REUSE: validateCapabilities() for pre-creation check
  capability-matcher.ts     # REUSE: matchCapabilities() for agent discovery
  heartbeat-scanner.ts      # NO CHANGE (already works with orchestrator-created tasks)

src/config/
  zod-schema.agent-runtime.ts  # EXTEND: Add project, capabilities fields to AgentEntrySchema

src/hooks/
  bundled/                     # NEW: task-completion hook for workflow status updates

docs/reference/templates/      # NEW: orchestrator workspace files (IDENTITY.md, SOUL.md, AGENTS.md)
```

### Pattern 1: Batch Task Creation Pipeline

**What:** Atomic creation of multiple task files + queue entries + workflow frontmatter update
**When to use:** Orchestrator committing a decomposition to disk
**Example:**

```typescript
// Source: Extending existing scaffold.ts + queue-manager.ts patterns
export async function createTaskBatch(opts: {
  projectDir: string;
  workflowId: string;
  tasks: Array<{
    frontmatter: Omit<TaskFrontmatter, "id" | "created" | "updated">;
    body: string;
  }>;
}): Promise<{ taskIds: string[]; rollback: () => Promise<void> }> {
  const pm = new ProjectManager();
  const qm = new QueueManager(opts.projectDir);
  const taskIds: string[] = [];
  const createdFiles: string[] = [];

  try {
    // 1. Generate sequential task IDs
    let nextId = await pm.nextTaskId(opts.projectDir);
    for (const task of opts.tasks) {
      const taskId = nextId;
      // ... increment nextId
      taskIds.push(taskId);
    }

    // 2. Write all task files atomically
    for (let i = 0; i < opts.tasks.length; i++) {
      const filePath = path.join(opts.projectDir, "tasks", `${taskIds[i]}.md`);
      const content = generateTaskMd(
        {
          ...opts.tasks[i].frontmatter,
          id: taskIds[i],
          workflow: opts.workflowId,
        },
        opts.tasks[i].body,
      );
      await writeFileAtomic(filePath, content);
      createdFiles.push(filePath);
    }

    // 3. Add all entries to queue (locked write)
    await qm.addTasks(
      taskIds.map((id, i) => ({
        taskId: id,
        metadata: {
          priority: opts.tasks[i].frontmatter.priority ?? "medium",
          capabilities: opts.tasks[i].frontmatter.capabilities?.join(", ") ?? "",
        },
      })),
    );

    // 4. Update workflow frontmatter tasks[] list
    await updateWorkflowTasks(opts.projectDir, opts.workflowId, taskIds);

    return {
      taskIds,
      rollback: async () => {
        /* cleanup */
      },
    };
  } catch (err) {
    // Rollback: delete created files, remove queue entries
    for (const f of createdFiles) {
      await fs.unlink(f).catch(() => {});
    }
    throw err;
  }
}
```

### Pattern 2: Task Graph Validation (D-06)

**What:** Pre-commit validation of the decomposed task graph
**When to use:** Before writing any files, orchestrator validates the graph
**Example:**

```typescript
export type ValidationResult = { valid: true } | { valid: false; errors: string[] };

export function validateTaskGraph(
  tasks: DecomposedTask[],
  projectContext: {
    allowedCapabilities: string[];
    agentCapabilities: Map<string, string[]>; // agentId -> capabilities
  },
): ValidationResult {
  const errors: string[] = [];
  const taskIds = new Set(tasks.map((t) => t.id));

  // 1. No circular dependencies
  // (topological sort -- if cycle detected, error)

  // 2. All dep references exist within the batch
  for (const task of tasks) {
    for (const dep of task.depends_on) {
      if (!taskIds.has(dep)) {
        errors.push(`Task ${task.id} depends on ${dep} which is not in the batch`);
      }
    }
  }

  // 3. All capabilities registered in project
  for (const task of tasks) {
    const { valid, unregistered } = validateCapabilities(
      task.capabilities,
      projectContext.allowedCapabilities,
    );
    if (!valid) {
      errors.push(`Task ${task.id}: unregistered capabilities: ${unregistered.join(", ")}`);
    }
  }

  // 4. All capabilities matchable by at least one agent (D-21)
  for (const task of tasks) {
    if (task.capabilities.length === 0) continue;
    const anyAgentMatches = [...projectContext.agentCapabilities.values()].some((agentCaps) =>
      matchCapabilities(agentCaps, task.capabilities),
    );
    if (!anyAgentMatches) {
      errors.push(
        `Task ${task.id}: no agent can fulfill capabilities: ${task.capabilities.join(", ")}`,
      );
    }
  }

  // 5. Reasonable bounds
  if (tasks.length > 50) {
    errors.push(`Task count ${tasks.length} exceeds recommended maximum of 50`);
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
```

### Pattern 3: Task Completion Hook (D-16)

**What:** Internal hook triggered when a task moves to Done, updating parent workflow status
**When to use:** Registered at gateway startup, fires on queue state changes
**Example:**

```typescript
// src/hooks/bundled/workflow-status/handler.ts
import { registerInternalHook } from "../../internal-hooks.js";

export type TaskCompletionHookContext = {
  taskId: string;
  workflowId: string | null;
  projectDir: string;
  newStatus: "done" | "blocked";
};

export function registerWorkflowStatusHook(): void {
  registerInternalHook("command:task-complete", async (event) => {
    const ctx = event.context as TaskCompletionHookContext;
    if (!ctx.workflowId) return;

    // Read all tasks for this workflow
    // If all done -> workflow status = 'completed'
    // If any blocked/failed -> workflow status stays 'active'
    // Update workflow frontmatter
  });
}
```

### Pattern 4: Structured Payload via sessions_send

**What:** Main agent sends a structured goal description to the orchestrator
**When to use:** When user triggers orchestrated work
**Example:**

```typescript
// Structured payload format for sessions_send message
const orchestratorPayload = {
  type: "orchestrate",
  goal: "Implement user authentication with OAuth2",
  project: "my-project",
  constraints: {
    maxTasks: 20,
    preferredCapabilities: ["code"],
    sideEffectPolicy: "ask-irreversible",
  },
  context: {
    existingTasks: ["TASK-001", "TASK-002"],
    projectDescription: "...",
  },
};

// Sent as JSON string via sessions_send message field
await sessions_send({
  agentId: "orchestrator",
  message: JSON.stringify(orchestratorPayload),
});
```

### Anti-Patterns to Avoid

- **Direct agent assignment:** The orchestrator creates tasks with capability tags; it never assigns specific agents. Heartbeat scanner handles dispatch.
- **Deep decomposition chains:** Max 2 levels per DEC-03. Deeper breakdown only via decompose-on-failure (Phase 4 recovery).
- **Custom queue sections:** Use existing Available/Claimed/Done/Blocked only (D-17). Tasks with unmet deps sit in Available but are filtered by heartbeat scanner.
- **Separate state store:** All state lives in the existing project system (markdown files + queue.md). No parallel storage.
- **Prototype mutation for extending classes:** Use explicit method additions or composition, not prototype patching.

## Don't Hand-Roll

| Problem                | Don't Build                 | Use Instead                                          | Why                                                              |
| ---------------------- | --------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| File locking           | Custom lock mechanism       | `withFileLock()` from plugin-sdk                     | Already handles retries, stale locks, exponential backoff        |
| Queue serialization    | Custom markdown writer      | `serializeQueue()` from queue-manager.ts             | Already handles all 4 sections, frontmatter, round-trip fidelity |
| YAML frontmatter       | Manual string concatenation | `yaml.stringify()` with `{ schema: "core" }`         | Avoids YAML 1.1 quirks (e.g., "no" as boolean)                   |
| Capability matching    | Custom matching logic       | `matchCapabilities()` from capability-matcher.ts     | Already implements ANY-match semantics                           |
| Capability validation  | Custom validation           | `validateCapabilities()` from capability-registry.ts | Already handles empty-means-no-restriction semantics             |
| Atomic file writes     | Manual fs.writeFile         | `writeFileAtomic()` pattern from scaffold.ts         | tmp+rename prevents partial reads                                |
| Task ID generation     | Custom counter              | `ProjectManager.nextTaskId()`                        | Handles scanning existing files, zero-padding                    |
| Workflow ID generation | Custom counter              | `ProjectManager.nextWorkflowId()`                    | Same pattern as task IDs                                         |
| Hook registration      | Custom event emitter        | `registerInternalHook()` from internal-hooks.ts      | Global singleton pattern, error isolation per handler            |

**Key insight:** Phase 2's power comes from composing existing primitives, not building new infrastructure. Every critical piece (locking, serialization, matching, validation, hooks) already exists.

## Common Pitfalls

### Pitfall 1: Race Condition on Task ID Generation

**What goes wrong:** Two concurrent decompositions for the same project both call `nextTaskId()` and get the same ID.
**Why it happens:** `nextTaskId()` reads the filesystem but doesn't hold a lock. Between reading and writing, another process can create a file with the same ID.
**How to avoid:** The batch creation operation must hold the queue lock (or a project-level lock) during the entire read-IDs -> write-files -> update-queue cycle. Since QueueManager already uses `withFileLock`, extend its locking scope to cover task file creation.
**Warning signs:** Duplicate TASK-NNN.md files, queue entries with duplicate IDs.

### Pitfall 2: Partial Batch Creation on Failure

**What goes wrong:** Some task files are written but the queue update fails, leaving orphaned task files that no agent will ever claim.
**Why it happens:** Multi-step operations (write files -> update queue -> update workflow) can fail midway.
**How to avoid:** Implement rollback logic (D-18). Track created files, delete them on failure. The queue is the source of truth for claimability, so orphaned files without queue entries are inert but confusing.
**Warning signs:** Task files in tasks/ directory that don't appear in queue.md.

### Pitfall 3: Circular Dependencies in Task Graph

**What goes wrong:** Task A depends on Task B which depends on Task A. No task becomes claimable.
**Why it happens:** LLM decomposition can produce circular dependency chains, especially with complex goals.
**How to avoid:** Validation step (D-06) must run topological sort before committing. Simple DFS cycle detection on the dependency graph.
**Warning signs:** Tasks permanently stuck in Available with unmet dependencies.

### Pitfall 4: Unmatched Capabilities Creating Dead Tasks

**What goes wrong:** Orchestrator creates tasks with capabilities that no configured agent can fulfill. Tasks sit in the queue forever.
**Why it happens:** LLM might invent capability names not registered in the project or not matching any agent.
**How to avoid:** D-21 validation: check every task's capabilities against both the project registry (PROJECT.md allowed_capabilities) AND the current agent pool (agents.list[] capabilities). Block creation and offer alternatives.
**Warning signs:** Tasks in Available that never get claimed despite active agents.

### Pitfall 5: AgentEntrySchema Extension Breaking Existing Configs

**What goes wrong:** Adding `project` and `capabilities` fields to AgentEntrySchema with `.strict()` causes existing configs to reject.
**Why it happens:** The schema uses `.strict()` which rejects unknown keys. New optional fields are fine, but any schema change needs to be backward compatible.
**How to avoid:** Add fields as `z.string().optional()` and `z.array(z.string()).optional()`. This is safe with `.strict()` since optional fields are allowed to be absent.
**Warning signs:** Config loading failures after upgrade.

### Pitfall 6: Hook Event Type Collision

**What goes wrong:** Using an existing hook event type:action combination (like "command:new") for the task completion hook clobbers existing behavior.
**Why it happens:** The internal hooks system dispatches to all handlers registered for a type:action key.
**How to avoid:** Use a unique event key. The existing types are "command", "session", "agent", "gateway", "message". For task completion, either extend InternalHookEventType (requires touching the type union) or use a sub-action like "command:task-complete". However, the cleaner approach is adding a "project" event type.
**Warning signs:** Unexpected side effects when tasks complete.

## Code Examples

### generateTaskMd -- New Template Helper

```typescript
// Source: Extending existing templates.ts pattern
import YAML from "yaml";
import { TaskFrontmatterSchema } from "./schemas.js";

export function generateTaskMd(
  opts: {
    id: string;
    title: string;
    priority?: "low" | "medium" | "high" | "critical";
    capabilities?: string[];
    depends_on?: string[];
    workflow?: string;
    verification_type?: "automatic" | "human" | "external" | "mixed";
    side_effect_class?: "none" | "reversible" | "irreversible";
    approval_required?: boolean;
    estimated_size?: "small" | "medium" | "large";
    parent?: string;
  },
  body: {
    objective: string;
    context: string;
    actionGuidance: string;
    successCriteria: string;
    verificationMethod: string;
  },
): string {
  const today = new Date().toISOString().split("T")[0];
  const data = TaskFrontmatterSchema.parse({
    id: opts.id,
    title: opts.title,
    status: "backlog",
    column: "Backlog",
    priority: opts.priority ?? "medium",
    capabilities: opts.capabilities ?? [],
    depends_on: opts.depends_on ?? [],
    workflow: opts.workflow ?? null,
    verification_type: opts.verification_type ?? "automatic",
    side_effect_class: opts.side_effect_class ?? "none",
    approval_required: opts.approval_required ?? false,
    estimated_size: opts.estimated_size ?? "medium",
    parent: opts.parent ?? null,
    created: today,
    updated: today,
  });

  const yaml = YAML.stringify(data, { schema: "core" });
  return [
    `---`,
    yaml.trimEnd(),
    `---`,
    ``,
    `## Objective`,
    ``,
    body.objective,
    ``,
    `## Context`,
    ``,
    body.context,
    ``,
    `## Action Guidance`,
    ``,
    body.actionGuidance,
    ``,
    `## Success Criteria`,
    ``,
    body.successCriteria,
    ``,
    `## Verification`,
    ``,
    body.verificationMethod,
    ``,
  ].join("\n");
}
```

### QueueManager.addTasks -- Batch Queue Entry Addition

```typescript
// Source: Extending existing queue-manager.ts pattern
async addTasks(entries: QueueEntry[]): Promise<void> {
  if (entries.length === 0) return;

  await this.lockedWriteOp(
    (parsed) => ({
      ...parsed,
      available: [...parsed.available, ...entries],
    }),
    (reRead) => {
      for (const entry of entries) {
        if (!reRead.available.some((e) => e.taskId === entry.taskId)) {
          throw new QueueValidationError(
            `Post-write validation failed: ${entry.taskId} not found in Available`,
          );
        }
      }
    },
  );
}
```

### AgentEntrySchema Extension

```typescript
// Source: Extending src/config/zod-schema.agent-runtime.ts
export const AgentEntrySchema = z
  .object({
    // ... existing fields ...
    project: z.string().optional(), // NEW: project name for context injection
    capabilities: z.array(z.string()).optional(), // NEW: agent capability tags for heartbeat matching
  })
  .strict();
```

### Orchestrator AGENTS.md Structure

```markdown
# Orchestrator Agent

You are an orchestration agent. Your job is to receive goals from other agents,
decompose them into well-structured executable tasks, validate the task graph,
and place tasks in the project queue for other agents to claim.

## Decomposition Standards

- Break goals into low-ambiguity tasks. Each task MUST include all 5 fields:
  1. **Objective** -- what this task achieves
  2. **Context** -- what the executing agent needs to know
  3. **Action Guidance** -- recommended approach
  4. **Success Criteria** -- how to know the task is done
  5. **Verification Method** -- how to verify success

- Decomposition depth: max 2 levels. Simple goals get flat task lists.
  Complex goals get parent tasks with subtasks.

- Before decomposing, ask clarifying questions if the goal is ambiguous.
  Ask the delegating agent first. Escalate to the user only if the agent
  cannot answer confidently.

- Validate before writing:
  - No circular dependencies
  - All capabilities exist in the project registry
  - At least one agent can fulfill each capability
  - Task count is reasonable (warn above 20, hard limit 50)

## Dispatch Policy

- Create tasks with capability tags. Never assign specific agents.
- Tasks go to the Available queue section. Agents self-select via heartbeat.
- For tasks with side_effect_class "irreversible" or approval_required=true,
  present the plan to the user for approval before creating tasks.
- For side_effect_class "none", auto-proceed.
```

## State of the Art

| Old Approach          | Current Approach                     | When Changed  | Impact                                       |
| --------------------- | ------------------------------------ | ------------- | -------------------------------------------- |
| No orchestration      | Orchestrator agent via sessions_send | Phase 2 (new) | Enables structured goal decomposition        |
| Manual task creation  | Batch automated creation             | Phase 2 (new) | Atomic multi-task + queue + workflow updates |
| No capability routing | Capability-based heartbeat claiming  | Phase 1       | Tasks automatically route to capable agents  |

## Validation Architecture

### Test Framework

| Property           | Value                                               |
| ------------------ | --------------------------------------------------- |
| Framework          | vitest ^4.1.0                                       |
| Config file        | `vitest.config.ts`                                  |
| Quick run command  | `pnpm test -- src/projects/orchestrator.test.ts -x` |
| Full suite command | `pnpm test`                                         |

### Phase Requirements to Test Map

| Req ID | Behavior                                           | Test Type   | Automated Command                                                             | File Exists?      |
| ------ | -------------------------------------------------- | ----------- | ----------------------------------------------------------------------------- | ----------------- |
| DEC-01 | Decomposed tasks have deps, capabilities, criteria | unit        | `pnpm test -- src/projects/orchestrator.test.ts -t "validates task graph" -x` | Wave 0            |
| DEC-02 | Each task has all 5 body sections                  | unit        | `pnpm test -- src/projects/templates.test.ts -t "generateTaskMd" -x`          | Wave 0            |
| DEC-03 | Max 2 levels, parent field support                 | unit        | `pnpm test -- src/projects/orchestrator.test.ts -t "depth" -x`                | Wave 0            |
| QUE-01 | Tasks created and placed in queue                  | unit        | `pnpm test -- src/projects/orchestrator.test.ts -t "batch creation" -x`       | Wave 0            |
| QUE-02 | Correct deps/capabilities/priority in queue        | unit        | `pnpm test -- src/projects/queue-manager.test.ts -t "addTasks" -x`            | Wave 0            |
| QUE-03 | Heartbeat claims orchestrator-created tasks        | unit        | `pnpm test -- src/projects/heartbeat-scanner.test.ts -x`                      | Existing          |
| QUE-04 | Queue state updates via existing system            | unit        | `pnpm test -- src/projects/queue-manager.test.ts -x`                          | Existing          |
| CAP-02 | Tasks dispatched by capability match               | unit        | `pnpm test -- src/projects/capability-matcher.test.ts -x`                     | Existing          |
| CAP-03 | New capabilities without code changes              | unit        | `pnpm test -- src/projects/capability-registry.test.ts -x`                    | Existing          |
| ORC-01 | Orchestrator agent config with workspace files     | unit        | `pnpm test -- src/config/schema.test.ts -t "agent" -x`                        | Existing (extend) |
| ORC-02 | sessions_send integration                          | integration | Manual: verify sessions_send to orchestrator agent                            | Manual            |
| ORC-03 | Tasks in queue, agents claim via heartbeat         | unit        | `pnpm test -- src/projects/orchestrator.test.ts -t "end-to-end" -x`           | Wave 0            |
| ORC-04 | AGENTS.md defines operating instructions           | manual      | Verify workspace file content                                                 | Manual            |
| ORC-05 | Planning/dispatch separation in instruction set    | manual      | Verify AGENTS.md sections                                                     | Manual            |

### Sampling Rate

- **Per task commit:** `pnpm test -- src/projects/ -x`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/projects/orchestrator.test.ts` -- covers DEC-01, DEC-03, QUE-01, ORC-03
- [ ] Extend `src/projects/templates.test.ts` -- covers DEC-02 (generateTaskMd)
- [ ] Extend `src/projects/queue-manager.test.ts` -- covers QUE-02 (addTasks)
- [ ] `src/hooks/bundled/workflow-status/handler.test.ts` -- covers D-16 hook

## Open Questions

1. **Hook event type for task completion**
   - What we know: The internal hooks system supports type:action keys. Existing types are "command", "session", "agent", "gateway", "message".
   - What's unclear: Should we add a new "project" event type to InternalHookEventType, or use a compound key like "command:task-complete"?
   - Recommendation: Add "project" as a new InternalHookEventType. It's cleaner and avoids overloading the "command" type. The type union is a simple string literal union that's easy to extend.

2. **Batch atomicity scope**
   - What we know: QueueManager uses withFileLock for queue.md. Task file writes are atomic individually (tmp+rename). But no single lock covers both operations.
   - What's unclear: Whether to use the queue lock for the entire batch (files + queue + workflow) or use separate locks.
   - Recommendation: Use the queue lock as the batch lock. Hold it for the entire operation. This is simple and the lock timeout (60s stale) is generous enough for batch writes. Alternative: dedicated project-level lock file.

3. **Where to trigger the task-completion hook**
   - What we know: Tasks move to Done via QueueManager.moveTask(). The heartbeat scanner reads queue state.
   - What's unclear: Who calls moveTask when a task completes? The executing agent presumably updates its checkpoint, but the queue state change needs to happen somewhere.
   - Recommendation: The executing agent (or its heartbeat) calls moveTask. The hook fires inside moveTask when the destination is "done". This keeps the trigger close to the state change.

## Project Constraints (from CLAUDE.md)

- **Language:** TypeScript (strict ESM). Prefer strict typing; avoid `any`.
- **Formatting:** Oxlint and Oxfmt. Run `pnpm check` before pushing.
- **Testing:** Vitest with V8 coverage. Run `pnpm test` before pushing.
- **File naming:** kebab-case for source files, `.test.ts` suffix for tests.
- **Naming:** `camelCase` for functions, `PascalCase` for types, `UPPER_SNAKE_CASE` for constants.
- **Error handling:** Return `{ ok: false, error: string }` for expected failures. Throw custom Error subclasses for unexpected.
- **Build gate:** If change affects build output or module boundaries, `pnpm build` MUST pass.
- **Commit:** Use `scripts/committer "<msg>" <file...>`.
- **No `@ts-nocheck`**, no disabling `no-explicit-any`.
- **Dynamic import guardrail:** Don't mix static and dynamic imports for same module.
- **GSD workflow:** Use GSD entry points for repo changes.
- **Node 22+** required.
- **Max ~700 LOC** per file guideline.

## Sources

### Primary (HIGH confidence)

- `src/projects/schemas.ts` -- Task/Workflow/Project schemas (read directly)
- `src/projects/scaffold.ts` -- ProjectManager with nextTaskId/nextWorkflowId (read directly)
- `src/projects/queue-manager.ts` -- QueueManager with file locking (read directly)
- `src/projects/heartbeat-scanner.ts` -- scanAndClaimTask with capability filtering (read directly)
- `src/projects/capability-matcher.ts` -- matchCapabilities ANY-match (read directly)
- `src/projects/capability-registry.ts` -- validateCapabilities project-level (read directly)
- `src/projects/templates.ts` -- generateWorkflowMd/generateProjectMd/generateQueueMd (read directly)
- `src/projects/frontmatter.ts` -- YAML parsing + Zod validation (read directly)
- `src/hooks/internal-hooks.ts` -- Hook registration/trigger system (read directly)
- `src/agents/workspace.ts` -- Agent workspace resolution, bootstrap files (read directly)
- `src/agents/project-context-hook.ts` -- Project context injection (read directly)
- `src/agents/tools/sessions-send-tool.ts` -- sessions_send implementation (read directly)
- `src/config/zod-schema.agent-runtime.ts` -- AgentEntrySchema (read directly)
- `src/projects/checkpoint.ts` -- CheckpointData type and helpers (read directly)
- `src/projects/queue-parser.ts` -- Queue parsing and QueueEntry type (read directly)

### Secondary (MEDIUM confidence)

- Phase 1 CONTEXT.md decisions (locked decisions on workflow format, capabilities)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- all dependencies already in use, no new libraries
- Architecture: HIGH -- extends existing patterns, no new infrastructure
- Pitfalls: HIGH -- identified from reading actual code (race conditions, partial writes, schema strictness)

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (30 days -- stable internal codebase)
