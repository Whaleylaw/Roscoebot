import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeRecoveryStrategy, type NotifyUserFn, type RecoveryContext } from "./recovery-manager.js";
import { QueueManager } from "./queue-manager.js";
import { generateProjectMd, generateQueueMd, generateTaskMd } from "./templates.js";
import { checkpointPath, createCheckpoint, writeCheckpoint, readCheckpoint } from "./checkpoint.js";

describe("executeRecoveryStrategy", () => {
	let tmpDir: string;

	async function setupProject(opts?: {
		maxTaskRetries?: number;
		parentTaskId?: string | null;
		taskId?: string;
	}): Promise<{ projectDir: string; taskId: string; ctx: RecoveryContext }> {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "recovery-mgr-test-"));
		const projectDir = tmpDir;
		await fs.mkdir(path.join(projectDir, "tasks"), { recursive: true });

		// Write PROJECT.md with optional max_task_retries override
		const projectContent = generateProjectMd({ name: "test-project" });
		let finalProjectContent = projectContent;
		if (opts?.maxTaskRetries !== undefined) {
			// Replace existing max_task_retries value (default is 3 from schema)
			finalProjectContent = projectContent.replace(
				/max_task_retries: \d+/,
				`max_task_retries: ${opts.maxTaskRetries}`,
			);
		}
		await fs.writeFile(path.join(projectDir, "PROJECT.md"), finalProjectContent, "utf-8");
		await fs.writeFile(path.join(projectDir, "queue.md"), generateQueueMd(), "utf-8");

		const taskId = opts?.taskId ?? "TASK-001";
		const taskContent = generateTaskMd(
			{
				id: taskId,
				title: `Test ${taskId}`,
				parent: opts?.parentTaskId ?? null,
			},
			{
				objective: "Test task",
				context: "Test",
				actionGuidance: "Test",
				successCriteria: "Test",
				verificationMethod: "Test",
			},
		);
		await fs.writeFile(path.join(projectDir, "tasks", `${taskId}.md`), taskContent, "utf-8");

		const qm = new QueueManager(projectDir);
		await qm.addTasks([{ taskId, metadata: {} }]);
		await qm.claimTask(taskId, "agent-1");

		// Create a checkpoint so the task has claimed state
		const taskFilePath = path.join(projectDir, "tasks", `${taskId}.md`);
		const cp = createCheckpoint({ agentId: "agent-1", taskId });
		await writeCheckpoint(checkpointPath(taskFilePath), cp);

		return {
			projectDir,
			taskId,
			ctx: {
				taskId,
				workflowId: null,
				projectDir,
				agentId: "agent-1",
				failureCategory: "transient",
				failureReason: "Connection timeout",
				sessionKey: "test-session",
			},
		};
	}

	afterEach(async () => {
		if (tmpDir) {
			await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
		}
	});

	it("retry action increments recovery_attempts, sets last_attempted_at, and moves task to available", async () => {
		const { projectDir, taskId, ctx } = await setupProject();

		const result = await executeRecoveryStrategy(ctx);

		expect(result.outcome).toBe("retry");

		// Verify checkpoint was updated
		const taskFilePath = path.join(projectDir, "tasks", `${taskId}.md`);
		const cp = await readCheckpoint(checkpointPath(taskFilePath));
		expect(cp).not.toBeNull();
		expect(cp!.recovery_attempts).toBe(1);
		expect(cp!.last_attempted_at).toBeTruthy();
		expect(cp!.failure_category).toBe("transient");
		expect(cp!.failure_reason).toBe("Connection timeout");

		// Verify task moved from claimed to available
		const qm = new QueueManager(projectDir);
		const queue = await qm.readQueue();
		expect(queue.available.some((e) => e.taskId === taskId)).toBe(true);
		expect(queue.claimed.some((e) => e.taskId === taskId)).toBe(false);
	});

	it("escalate action moves task to blocked, updates checkpoint, and calls notifyUser", async () => {
		// Set max retries to 0 and create deep parent chain (depth >= MAX_DECOMPOSITION_DEPTH=2)
		// so decompose and reroute are also skipped, landing on escalate
		const { projectDir, taskId, ctx } = await setupProject({
			maxTaskRetries: 0,
			taskId: "TASK-003",
			parentTaskId: "TASK-002",
		});
		// Create parent chain: TASK-003 -> TASK-002 -> TASK-001 (depth 2 >= MAX_DECOMPOSITION_DEPTH)
		const parent2 = generateTaskMd(
			{ id: "TASK-002", title: "Mid parent", parent: "TASK-001" },
			{ objective: "", context: "", actionGuidance: "", successCriteria: "", verificationMethod: "" },
		);
		await fs.writeFile(path.join(projectDir, "tasks", "TASK-002.md"), parent2, "utf-8");
		const parent1 = generateTaskMd(
			{ id: "TASK-001", title: "Root parent", parent: null },
			{ objective: "", context: "", actionGuidance: "", successCriteria: "", verificationMethod: "" },
		);
		await fs.writeFile(path.join(projectDir, "tasks", "TASK-001.md"), parent1, "utf-8");

		const notifyUser = vi.fn<NotifyUserFn>();
		const result = await executeRecoveryStrategy(
			{ ...ctx, failureCategory: "permanent" },
			{ notifyUser },
		);

		expect(result.outcome).toBe("escalate");

		// Verify checkpoint status is blocked
		const taskFilePath = path.join(projectDir, "tasks", `${taskId}.md`);
		const cp = await readCheckpoint(checkpointPath(taskFilePath));
		expect(cp).not.toBeNull();
		expect(cp!.status).toBe("blocked");
		expect(cp!.failure_category).toBe("permanent");
		expect(cp!.failure_reason).toBe("Connection timeout");
		expect(cp!.recovery_attempts).toBe(1);

		// Verify task moved from claimed to blocked
		const qm = new QueueManager(projectDir);
		const queue = await qm.readQueue();
		expect(queue.blocked.some((e) => e.taskId === taskId)).toBe(true);
		expect(queue.claimed.some((e) => e.taskId === taskId)).toBe(false);

		// Verify notifyUser was called
		expect(notifyUser).toHaveBeenCalledOnce();
		expect(notifyUser).toHaveBeenCalledWith(
			expect.objectContaining({
				taskId,
				failureCategory: "permanent",
				failureReason: "Connection timeout",
			}),
		);
	});

	it("permanent failure category skips retry even with budget remaining", async () => {
		const { ctx } = await setupProject({ maxTaskRetries: 5 });

		const notifyUser = vi.fn<NotifyUserFn>();
		const result = await executeRecoveryStrategy(
			{ ...ctx, failureCategory: "permanent" },
			{ notifyUser },
		);

		// Permanent failure should NOT retry -- it should decompose (depth 0 < 2)
		expect(result.outcome).not.toBe("retry");
		expect(result.outcome).toBe("decompose");
	});

	it("reads max_task_retries from PROJECT.md frontmatter", async () => {
		// Set max retries to 1 so second failure escalates
		const { projectDir, taskId, ctx } = await setupProject({ maxTaskRetries: 1 });

		// First failure should retry (0 < 1)
		const result1 = await executeRecoveryStrategy(ctx);
		expect(result1.outcome).toBe("retry");

		// Re-claim the task for second failure
		const qm = new QueueManager(projectDir);
		await qm.claimTask(taskId, "agent-1");

		// Verify checkpoint has recovery_attempts=1 from first failure
		const taskFilePath = path.join(projectDir, "tasks", `${taskId}.md`);
		const cpAfterFirst = await readCheckpoint(checkpointPath(taskFilePath));
		expect(cpAfterFirst!.recovery_attempts).toBe(1);

		// Second failure should not retry since we hit budget (1 >= 1)
		const notifyUser = vi.fn<NotifyUserFn>();
		const result2 = await executeRecoveryStrategy(ctx, { notifyUser });
		expect(result2.outcome).not.toBe("retry");
	});

	it("reads task frontmatter for decomposition depth (parent chain)", async () => {
		// Create a parent task first, then a child task
		const { projectDir, ctx } = await setupProject({ maxTaskRetries: 0 });

		// Create parent task
		const parentContent = generateTaskMd(
			{ id: "TASK-000", title: "Parent Task", parent: null },
			{
				objective: "Parent",
				context: "",
				actionGuidance: "",
				successCriteria: "",
				verificationMethod: "",
			},
		);
		await fs.writeFile(path.join(projectDir, "tasks", "TASK-000.md"), parentContent, "utf-8");

		// Create child task with parent
		const childId = "TASK-002";
		const childContent = generateTaskMd(
			{ id: childId, title: "Child Task", parent: "TASK-000" },
			{
				objective: "Child",
				context: "",
				actionGuidance: "",
				successCriteria: "",
				verificationMethod: "",
			},
		);
		await fs.writeFile(path.join(projectDir, "tasks", `${childId}.md`), childContent, "utf-8");

		// Add child to queue in claimed state
		const qm = new QueueManager(projectDir);
		await qm.addTasks([{ taskId: childId, metadata: {} }]);
		await qm.claimTask(childId, "agent-1");

		// Create checkpoint for child
		const childFilePath = path.join(projectDir, "tasks", `${childId}.md`);
		const cp = createCheckpoint({ agentId: "agent-1", taskId: childId });
		await writeCheckpoint(checkpointPath(childFilePath), cp);

		const notifyUser = vi.fn<NotifyUserFn>();
		const result = await executeRecoveryStrategy(
			{
				...ctx,
				taskId: childId,
				failureCategory: "permanent",
			},
			{ notifyUser },
		);

		// With parent at depth 1 and max decomposition depth 2, decompose should be selected
		// But decompose is stubbed so it moves to blocked
		expect(result.outcome).toBe("decompose");
	});

	it("notifyUser is called with taskId, failureReason, and failureCategory on escalation", async () => {
		// Use deep parent chain so escalate is selected (depth >= MAX_DECOMPOSITION_DEPTH)
		const { projectDir, ctx } = await setupProject({
			maxTaskRetries: 0,
			taskId: "TASK-003",
			parentTaskId: "TASK-002",
		});
		const parent2 = generateTaskMd(
			{ id: "TASK-002", title: "Mid parent", parent: "TASK-001" },
			{ objective: "", context: "", actionGuidance: "", successCriteria: "", verificationMethod: "" },
		);
		await fs.writeFile(path.join(projectDir, "tasks", "TASK-002.md"), parent2, "utf-8");
		const parent1 = generateTaskMd(
			{ id: "TASK-001", title: "Root parent", parent: null },
			{ objective: "", context: "", actionGuidance: "", successCriteria: "", verificationMethod: "" },
		);
		await fs.writeFile(path.join(projectDir, "tasks", "TASK-001.md"), parent1, "utf-8");

		const notifyUser = vi.fn<NotifyUserFn>();
		await executeRecoveryStrategy(
			{ ...ctx, taskId: "TASK-003", failureCategory: "permanent", failureReason: "Out of memory" },
			{ notifyUser },
		);

		expect(notifyUser).toHaveBeenCalledOnce();
		const call = notifyUser.mock.calls[0][0];
		expect(call.taskId).toBe("TASK-003");
		expect(call.failureReason).toBe("Out of memory");
		expect(call.failureCategory).toBe("permanent");
		expect(call.recoveryAttempts).toBe(1);
	});

	it("decompose and reroute stubs call notifyUser", async () => {
		// Create parent at depth 0 with max retries 0 so it tries decompose first
		const { ctx } = await setupProject({ maxTaskRetries: 0 });

		const notifyUser = vi.fn<NotifyUserFn>();
		// With transient failure, 0 retries allowed, depth 0 < 2, it should try decompose
		const result = await executeRecoveryStrategy(
			{ ...ctx, failureCategory: "transient" },
			{ notifyUser },
		);

		// Decompose stub should still call notifyUser
		expect(result.outcome).toBe("decompose");
		expect(notifyUser).toHaveBeenCalledOnce();
	});
});
