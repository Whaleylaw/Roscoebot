import fs from "node:fs/promises";
import path from "node:path";
import {
	createInternalHookEvent,
	triggerInternalHook,
} from "../hooks/internal-hooks.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { checkpointPath, readCheckpoint, writeCheckpoint } from "../projects/checkpoint.js";
import { parseTaskFrontmatter } from "../projects/frontmatter.js";
import { parseQueue } from "../projects/queue-parser.js";
import { QueueManager, serializeQueue } from "../projects/queue-manager.js";
import type { VerificationRecord } from "../projects/verification.js";

const log = createSubsystemLogger("commands/projects-review");

export type ReviewApproveOpts = {
	taskId: string;
	projectDir: string;
	notes?: string;
	reviewer?: string;
	json?: boolean;
};

export type ReviewRejectOpts = {
	taskId: string;
	projectDir: string;
	notes?: string;
	reviewer?: string;
	json?: boolean;
};

/**
 * Approve a task currently in the Review queue section.
 * Moves it to Done, records human_review evidence in the checkpoint,
 * and fires a project:task-complete internal hook.
 */
export async function projectsReviewApproveCommand(opts: ReviewApproveOpts): Promise<void> {
	const { taskId, projectDir, notes, reviewer } = opts;

	log.info(`Approving task ${taskId} in ${projectDir}`);

	// Move task from review to done via QueueManager
	const qm = new QueueManager(projectDir);
	await qm.moveTask(taskId, "review", "done");

	// Update checkpoint with human_review evidence
	const taskFile = path.join(projectDir, "tasks", `${taskId}.md`);
	const cpPath = checkpointPath(taskFile);
	const checkpoint = await readCheckpoint(cpPath);

	if (checkpoint) {
		const now = new Date().toISOString();

		checkpoint.status = "done";

		// Initialize verification record if missing
		if (!checkpoint.verification) {
			checkpoint.verification = {
				last_run: now,
				passed: true,
				verification_type: "human",
				checks: [],
				history: [],
			};
		}

		checkpoint.verification.human_review = {
			status: "approved",
			reviewed_at: now,
			reviewer,
			notes,
		};

		checkpoint.verification.history.push({
			timestamp: now,
			passed: true,
			checks_summary: "Human approved",
		});

		await writeCheckpoint(cpPath, checkpoint);
	}

	// Read task frontmatter to get workflowId for hook event
	let workflowId: string | null = null;
	try {
		const taskContent = await fs.readFile(taskFile, "utf-8");
		const parsed = parseTaskFrontmatter(taskContent, taskFile);
		if (parsed.success) {
			workflowId = parsed.data.workflow ?? null;
		}
	} catch {
		// Task file may not exist; proceed without workflowId
	}

	// Fire project:task-complete hook
	await triggerInternalHook(
		createInternalHookEvent("project", "task-complete", "", {
			taskId,
			workflowId,
			projectDir,
		}),
	);

	if (opts.json) {
		console.log(JSON.stringify({ ok: true, taskId, action: "approved" }));
	} else {
		console.log(`Approved task ${taskId} -- moved to Done`);
	}
}

/**
 * Reject a task currently in the Review queue section.
 * Moves it back to Available (stripping agent/claimed metadata),
 * and records human_review rejection evidence in the checkpoint.
 */
export async function projectsReviewRejectCommand(opts: ReviewRejectOpts): Promise<void> {
	const { taskId, projectDir, notes, reviewer } = opts;

	log.info(`Rejecting task ${taskId} in ${projectDir}`);

	// Move task from review to available, stripping agent metadata.
	// We use moveTask for the atomic queue operation, then do a second
	// pass to strip agent/claimed metadata from the entry.
	const qm = new QueueManager(projectDir);
	await qm.moveTask(taskId, "review", "available");

	// Strip agent/claimed metadata from the newly available entry
	const queuePath = path.join(projectDir, "queue.md");
	const rawQueue = await fs.readFile(queuePath, "utf-8");
	const parsed = parseQueue(rawQueue, queuePath);
	const entry = parsed.available.find((e) => e.taskId === taskId);
	if (entry) {
		const { agent: _a, claimed: _c, ...cleanMeta } = entry.metadata;
		entry.metadata = cleanMeta;
		await fs.writeFile(queuePath, serializeQueue(parsed), "utf-8");
	}

	// Update checkpoint with human_review evidence
	const taskFile = path.join(projectDir, "tasks", `${taskId}.md`);
	const cpPath = checkpointPath(taskFile);
	const checkpoint = await readCheckpoint(cpPath);

	if (checkpoint) {
		const now = new Date().toISOString();

		// Initialize verification record if missing
		if (!checkpoint.verification) {
			checkpoint.verification = {
				last_run: now,
				passed: false,
				verification_type: "human",
				checks: [],
				history: [],
			};
		}

		checkpoint.verification.human_review = {
			status: "rejected",
			reviewed_at: now,
			reviewer,
			notes,
		};

		checkpoint.verification.history.push({
			timestamp: now,
			passed: false,
			checks_summary: "Human rejected",
		});

		await writeCheckpoint(cpPath, checkpoint);
	}

	if (opts.json) {
		console.log(JSON.stringify({ ok: true, taskId, action: "rejected" }));
	} else {
		console.log(`Rejected task ${taskId} -- moved back to Available`);
	}
}
