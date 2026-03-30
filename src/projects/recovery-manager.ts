/**
 * Recovery manager: executes recovery strategies for failed tasks.
 * Reads checkpoint state, calls selectRecoveryStrategy, and executes
 * the chosen action (retry, decompose, reroute, or escalate).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { checkpointPath, readCheckpoint, writeCheckpoint } from "./checkpoint.js";
import { parseProjectFrontmatter, parseTaskFrontmatter } from "./frontmatter.js";
import { QueueManager } from "./queue-manager.js";
import {
	DEFAULT_MAX_RETRIES,
	MAX_DECOMPOSITION_DEPTH,
	selectRecoveryStrategy,
	type FailTaskResult,
	type FailureCategory,
} from "./recovery-types.js";

const log = createSubsystemLogger("projects/recovery-manager");

/** Context passed to the recovery manager when a task fails. */
export type RecoveryContext = {
	taskId: string;
	workflowId: string | null;
	projectDir: string;
	agentId: string;
	failureCategory: FailureCategory;
	failureReason: string;
	sessionKey?: string;
};

/** Callback for notifying the user about escalation or blocking events. */
export type NotifyUserFn = (opts: {
	taskId: string;
	workflowId: string | null;
	failureCategory: FailureCategory;
	failureReason: string;
	recoveryAttempts: number;
	sessionKey?: string;
}) => Promise<void>;

/**
 * Default notify user stub -- log-only until wired to gateway sessions_send.
 * TODO: Wire to gateway server-methods/agents.ts sessions_send for real user notification.
 * The gateway's sessions_send delivers a message to the delegating agent's active session,
 * which then relays it to the user. This requires gateway RPC access not available in
 * the projects/ layer -- wire when integrating with gateway in Phase 5 or orchestrator setup.
 */
const defaultNotifyUser: NotifyUserFn = async (opts) => {
	log.warn("Escalation notification (stub -- sessions_send not yet wired)", {
		taskId: opts.taskId,
		workflowId: opts.workflowId,
		failureCategory: opts.failureCategory,
		failureReason: opts.failureReason,
		recoveryAttempts: opts.recoveryAttempts,
	});
};

/**
 * Compute the decomposition depth of a task by walking its parent chain.
 * Returns 0 for root tasks, 1 for children, 2 for grandchildren, etc.
 * Caps at 10 iterations to prevent infinite loops from corrupt data.
 */
export async function computeDecompositionDepth(
	taskId: string,
	projectDir: string,
): Promise<number> {
	let depth = 0;
	let currentId: string | null = taskId;
	const maxIterations = 10;

	for (let i = 0; i < maxIterations && currentId; i++) {
		const taskFilePath = path.join(projectDir, "tasks", `${currentId}.md`);
		let content: string;
		try {
			content = await readFile(taskFilePath, "utf-8");
		} catch {
			break;
		}

		const parsed = parseTaskFrontmatter(content, taskFilePath);
		if (!parsed.success) break;

		const parent = parsed.data.parent;
		if (!parent) break;

		depth++;
		currentId = parent;
	}

	return depth;
}

/**
 * Execute the selected recovery strategy for a failed task.
 *
 * Reads checkpoint and project config, calls selectRecoveryStrategy,
 * then executes the chosen action:
 * - retry: move task back to available with updated checkpoint
 * - decompose: (v1 stub) move to blocked + notify user
 * - reroute: (v1 stub) move to blocked + notify user
 * - escalate: move to blocked + notify user
 */
export async function executeRecoveryStrategy(
	ctx: RecoveryContext,
	deps?: { notifyUser?: NotifyUserFn },
): Promise<FailTaskResult> {
	const notifyUser = deps?.notifyUser ?? defaultNotifyUser;
	const taskFilePath = path.join(ctx.projectDir, "tasks", `${ctx.taskId}.md`);
	const cpPath = checkpointPath(taskFilePath);

	// Read checkpoint (default to recovery_attempts=0 if no checkpoint)
	const checkpoint = (await readCheckpoint(cpPath)) ?? {
		status: "in-progress" as const,
		claimed_by: ctx.agentId,
		claimed_at: new Date().toISOString(),
		last_step: "",
		next_action: "",
		progress_pct: 0,
		files_modified: [],
		failed_approaches: [],
		log: [],
		notes: "",
		recovery_attempts: 0,
		last_attempted_at: null,
		cumulative_tokens: 0,
		failure_category: null,
		failure_reason: null,
	};

	// Read PROJECT.md frontmatter for max_task_retries
	let maxRetries = DEFAULT_MAX_RETRIES;
	try {
		const projectContent = await readFile(path.join(ctx.projectDir, "PROJECT.md"), "utf-8");
		const projectParsed = parseProjectFrontmatter(projectContent, "PROJECT.md");
		if (projectParsed.success) {
			maxRetries = projectParsed.data.max_task_retries;
		}
	} catch {
		log.warn("Could not read PROJECT.md, using default max retries", {
			projectDir: ctx.projectDir,
			default: maxRetries,
		});
	}

	// Read task frontmatter for capabilities and compute decomposition depth
	let taskCapabilities: string[] = [];
	try {
		const taskContent = await readFile(taskFilePath, "utf-8");
		const taskParsed = parseTaskFrontmatter(taskContent, taskFilePath);
		if (taskParsed.success && taskParsed.data.capabilities) {
			taskCapabilities = taskParsed.data.capabilities;
		}
	} catch {
		// Proceed with empty capabilities
	}

	const decompositionDepth = await computeDecompositionDepth(ctx.taskId, ctx.projectDir);

	// TODO: Determine alternateAgentAvailable by reading agents.list from gateway config.
	// This requires gateway RPC access not available in the projects/ layer.
	// For v1, set to false so reroute is never selected.
	const alternateAgentAvailable = false;

	// Select recovery strategy via pure function
	const strategy = selectRecoveryStrategy({
		failureCategory: ctx.failureCategory,
		recoveryAttempts: checkpoint.recovery_attempts,
		maxRetries,
		decompositionDepth,
		maxDecompositionDepth: MAX_DECOMPOSITION_DEPTH,
		alternateAgentAvailable,
		taskCapabilities,
	});

	const qm = new QueueManager(ctx.projectDir);

	switch (strategy.action) {
		case "retry": {
			// Update checkpoint: increment attempts, record failure details
			checkpoint.recovery_attempts++;
			checkpoint.last_attempted_at = new Date().toISOString();
			checkpoint.failure_category = ctx.failureCategory;
			checkpoint.failure_reason = ctx.failureReason;
			checkpoint.status = "in-progress";
			await writeCheckpoint(cpPath, checkpoint);

			// Move task from claimed to available for re-pickup
			await qm.moveTask(ctx.taskId, "claimed", "available");

			log.info("Task queued for retry", {
				taskId: ctx.taskId,
				attempt: checkpoint.recovery_attempts,
				backoffMs: strategy.backoffMs,
			});

			return { outcome: "retry" };
		}

		case "decompose": {
			// v1 stub: decompose requires LLM-driven subtask generation (Phase 5 intake)
			// TODO: Wire to intake pipeline for LLM-driven decomposition in Phase 5.
			// For now, move to blocked and notify user.
			checkpoint.recovery_attempts++;
			checkpoint.failure_category = ctx.failureCategory;
			checkpoint.failure_reason = ctx.failureReason;
			checkpoint.status = "blocked";
			await writeCheckpoint(cpPath, checkpoint);

			await qm.moveTask(ctx.taskId, "claimed", "blocked");

			log.warn("Decompose-on-failure not yet wired; task moved to blocked", {
				taskId: ctx.taskId,
			});

			await notifyUser({
				taskId: ctx.taskId,
				workflowId: ctx.workflowId,
				failureCategory: ctx.failureCategory,
				failureReason: ctx.failureReason,
				recoveryAttempts: checkpoint.recovery_attempts,
				sessionKey: ctx.sessionKey,
			});

			return { outcome: "decompose" };
		}

		case "reroute": {
			// v1 stub: reroute requires gateway agents.list access for alternate agent lookup
			// TODO: Wire to gateway agent registry for reroute in Phase 5.
			// For now, move to blocked and notify user.
			checkpoint.recovery_attempts++;
			checkpoint.failure_category = ctx.failureCategory;
			checkpoint.failure_reason = ctx.failureReason;
			checkpoint.status = "blocked";
			await writeCheckpoint(cpPath, checkpoint);

			await qm.moveTask(ctx.taskId, "claimed", "blocked");

			log.warn("Reroute not yet wired; task moved to blocked", {
				taskId: ctx.taskId,
				targetCapabilities: strategy.targetCapabilities,
			});

			await notifyUser({
				taskId: ctx.taskId,
				workflowId: ctx.workflowId,
				failureCategory: ctx.failureCategory,
				failureReason: ctx.failureReason,
				recoveryAttempts: checkpoint.recovery_attempts,
				sessionKey: ctx.sessionKey,
			});

			return { outcome: "reroute" };
		}

		case "escalate": {
			// Update checkpoint: mark as blocked with failure details (D-04)
			checkpoint.recovery_attempts++;
			checkpoint.failure_category = ctx.failureCategory;
			checkpoint.failure_reason = ctx.failureReason;
			checkpoint.status = "blocked";
			await writeCheckpoint(cpPath, checkpoint);

			// Move task to blocked queue section
			await qm.moveTask(ctx.taskId, "claimed", "blocked");

			// Notify user about escalation (D-04)
			await notifyUser({
				taskId: ctx.taskId,
				workflowId: ctx.workflowId,
				failureCategory: ctx.failureCategory,
				failureReason: ctx.failureReason,
				recoveryAttempts: checkpoint.recovery_attempts,
				sessionKey: ctx.sessionKey,
			});

			log.info("Task escalated to user", {
				taskId: ctx.taskId,
				failureCategory: ctx.failureCategory,
				reason: strategy.reason,
			});

			return { outcome: "escalate" };
		}
	}
}
