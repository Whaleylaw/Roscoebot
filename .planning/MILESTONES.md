# Milestones

## v1.0 Orchestration Layer (Shipped: 2026-03-30)

**Phases completed:** 6 phases, 23 plans, 46 tasks

**Key accomplishments:**

- Zod schemas for workflow frontmatter (WF-NNN), task orchestration fields, and project capability registry with parseWorkflowFrontmatter parser
- generateWorkflowMd template function, workflows/ directory in project scaffold, nextWorkflowId sequential ID generation, and barrel exports
- validateCapabilities function with project-level capability tag enforcement and STANDARD_CAPABILITIES constant (code, research, ops, review, deploy)
- AgentEntrySchema extended with orchestrator config fields, generateTaskMd producing 5-section DEC-02 task markdown, and orchestrator workspace templates with Decomposition Standards and Dispatch Policy
- QueueManager.addTasks for atomic batch entry creation plus validateTaskGraph with cycle detection, depth limits, capability registration, and agent matchability checks
- createTaskBatch pipeline with sequential ID generation, queue integration, workflow frontmatter update, and file-level rollback on failure
- Workflow status hook syncs workflow state on task completion; orchestrateGoal provides end-to-end validation-create-activate pipeline; parseOrchestratorPayload validates sessions_send structured payloads for ORC-02
- Zod-validated success criteria on tasks, review queue section, checkpoint verification storage, and file/command check runners with TDD
- Verification engine with four verification_type branches, side-effect gating, and completeTask() entry point that ensures verification cannot be bypassed
- CLI approve/reject commands and gateway RPC methods for human review of tasks in the Review queue section
- Kanban board Review column with warn-accent styling, verification evidence peek panel, and approve/reject buttons with inline reject confirmation
- Recovery strategy selection function with 4-step priority chain (retry, decompose, reroute, escalate), checkpoint recovery tracking fields, and project-level recovery budget schema
- Recovery chain executor with retry-to-available, escalate-to-blocked+notifyUser, and failTask as single entry point firing observability hooks after checkpoint state update
- Anti-loop budget gate with backoff window enforcement, budget-exhausted escalation to blocked, and stale claim detection releasing abandoned tasks after 30 minutes of checkpoint inactivity
- Cross-session workflow resume scanner with file-based state reconstruction, interrupted task detection via stale checkpoints, and workflow-status-hook extension for task-failed-triggered workflow failure
- Zod-validated workflow template schema with three bundled templates (code-feature, research-report, ops-runbook) as static markdown strings
- Three-tier template resolver with project > global > bundled precedence, plus save-as-template for converting synthesized workflows into reusable templates
- Project placement helpers format active project data for LLM reasoning and IntakePayload extends OrchestratorPayload with template, placement, synthesis, and artifact type fields
- Static intake skill markdown defining four-step clarification flow (understand, artifact type, placement, template match) with IntakePayload JSON handoff, plus barrel exports for all Phase 5 symbols
- Heuristic workflow synthesis with template-schema validation and NotifyUserFn factory wired to sessions_send for escalation delivery
- Workflow index generation with progress counts, SyncService watcher, and board task workflow field
- Workflow progress table in `project status` showing active/paused workflows with ID, title, status, done/total progress, and blocker count
- Gateway RPC workflow list/get endpoints, WebSocket workflow:changed broadcast, and blue [WF-NNN] badge on board task cards

---
