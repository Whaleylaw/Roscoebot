import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckpointData } from "../projects/checkpoint.js";
import {
	clearInternalHooks,
	registerInternalHook,
	type InternalHookEvent,
} from "../hooks/internal-hooks.js";
import {
	projectsReviewApproveCommand,
	projectsReviewRejectCommand,
} from "./projects.review.js";

/**
 * Build a minimal project directory with a task in the review queue section,
 * a task markdown file, and a checkpoint sidecar.
 */
async function setupProjectDir(
	tmpDir: string,
	taskId = "TASK-001",
): Promise<{ projectDir: string; taskFile: string; checkpointFile: string }> {
	const projectDir = path.join(tmpDir, "test-project");
	const tasksDir = path.join(projectDir, "tasks");
	await fs.mkdir(tasksDir, { recursive: true });

	// queue.md with the task in the review section
	const queueContent = `---
project: test-project
updated: "2026-03-29"
---

## Available

## Claimed

## Review

- ${taskId} [agent: agent-1, claimed: 2026-03-29T00:00:00Z]

## Done

## Blocked
`;
	await fs.writeFile(path.join(projectDir, "queue.md"), queueContent, "utf-8");

	// Task markdown file
	const taskFile = path.join(tasksDir, `${taskId}.md`);
	const taskContent = `---
id: ${taskId}
title: "Test task"
status: review
priority: medium
workflow: WF-001
---

# ${taskId}
Test task body.
`;
	await fs.writeFile(taskFile, taskContent, "utf-8");

	// Checkpoint sidecar
	const checkpointFile = path.join(tasksDir, `${taskId}.checkpoint.json`);
	const checkpoint: CheckpointData = {
		status: "review",
		claimed_by: "agent-1",
		claimed_at: "2026-03-29T00:00:00Z",
		last_step: "verification",
		next_action: "await review",
		progress_pct: 100,
		files_modified: [],
		failed_approaches: [],
		log: [{ timestamp: "2026-03-29T00:00:00Z", agent: "agent-1", action: "Claimed task" }],
		notes: "",
		verification: {
			last_run: "2026-03-29T00:00:00Z",
			passed: true,
			verification_type: "automatic",
			checks: [{ type: "file_exists", target: "output.txt", passed: true, detail: "File exists" }],
			history: [
				{
					timestamp: "2026-03-29T00:00:00Z",
					passed: true,
					checks_summary: "1/1 checks passed",
				},
			],
		},
	};
	await fs.writeFile(checkpointFile, JSON.stringify(checkpoint, null, "\t"), "utf-8");

	return { projectDir, taskFile, checkpointFile };
}

describe("projectsReviewApproveCommand", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-review-test-"));
		clearInternalHooks();
	});

	afterEach(async () => {
		clearInternalHooks();
		vi.restoreAllMocks();
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("moves task from review to done in queue", async () => {
		const { projectDir } = await setupProjectDir(tmpDir);

		await projectsReviewApproveCommand({
			taskId: "TASK-001",
			projectDir,
		});

		const queueContent = await fs.readFile(path.join(projectDir, "queue.md"), "utf-8");
		expect(queueContent).not.toMatch(/## Review\n\n- TASK-001/);
		expect(queueContent).toMatch(/## Done\n\n- TASK-001/);
	});

	it("updates checkpoint verification.human_review to approved", async () => {
		const { projectDir, checkpointFile } = await setupProjectDir(tmpDir);

		await projectsReviewApproveCommand({
			taskId: "TASK-001",
			projectDir,
		});

		const checkpoint = JSON.parse(await fs.readFile(checkpointFile, "utf-8")) as CheckpointData;
		expect(checkpoint.verification?.human_review?.status).toBe("approved");
		expect(checkpoint.verification?.human_review?.reviewed_at).toBeTruthy();
	});

	it("updates checkpoint status to done", async () => {
		const { projectDir, checkpointFile } = await setupProjectDir(tmpDir);

		await projectsReviewApproveCommand({
			taskId: "TASK-001",
			projectDir,
		});

		const checkpoint = JSON.parse(await fs.readFile(checkpointFile, "utf-8")) as CheckpointData;
		expect(checkpoint.status).toBe("done");
	});

	it("fires project:task-complete hook event", async () => {
		const { projectDir } = await setupProjectDir(tmpDir);

		const events: InternalHookEvent[] = [];
		registerInternalHook("project:task-complete", async (event) => {
			events.push(event);
		});

		await projectsReviewApproveCommand({
			taskId: "TASK-001",
			projectDir,
		});

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("project");
		expect(events[0].action).toBe("task-complete");
		expect(events[0].context).toMatchObject({
			taskId: "TASK-001",
			projectDir,
		});
	});

	it("stores notes in checkpoint when --notes provided", async () => {
		const { projectDir, checkpointFile } = await setupProjectDir(tmpDir);

		await projectsReviewApproveCommand({
			taskId: "TASK-001",
			projectDir,
			notes: "LGTM",
		});

		const checkpoint = JSON.parse(await fs.readFile(checkpointFile, "utf-8")) as CheckpointData;
		expect(checkpoint.verification?.human_review?.notes).toBe("LGTM");
	});

	it("throws when task not in review section", async () => {
		const { projectDir } = await setupProjectDir(tmpDir);

		// Move task out of review manually
		const queueContent = `---
project: test-project
updated: "2026-03-29"
---

## Available

- TASK-001

## Claimed

## Review

## Done

## Blocked
`;
		await fs.writeFile(path.join(projectDir, "queue.md"), queueContent, "utf-8");

		await expect(
			projectsReviewApproveCommand({ taskId: "TASK-001", projectDir }),
		).rejects.toThrow(/not found in Review/);
	});
});

describe("projectsReviewRejectCommand", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-review-test-"));
		clearInternalHooks();
	});

	afterEach(async () => {
		clearInternalHooks();
		vi.restoreAllMocks();
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("moves task from review to available in queue", async () => {
		const { projectDir } = await setupProjectDir(tmpDir);

		await projectsReviewRejectCommand({
			taskId: "TASK-001",
			projectDir,
		});

		const queueContent = await fs.readFile(path.join(projectDir, "queue.md"), "utf-8");
		expect(queueContent).not.toMatch(/## Review\n\n- TASK-001/);
		expect(queueContent).toMatch(/## Available\n\n- TASK-001/);
	});

	it("updates checkpoint verification.human_review to rejected", async () => {
		const { projectDir, checkpointFile } = await setupProjectDir(tmpDir);

		await projectsReviewRejectCommand({
			taskId: "TASK-001",
			projectDir,
		});

		const checkpoint = JSON.parse(await fs.readFile(checkpointFile, "utf-8")) as CheckpointData;
		expect(checkpoint.verification?.human_review?.status).toBe("rejected");
		expect(checkpoint.verification?.human_review?.reviewed_at).toBeTruthy();
	});

	it("strips agent/claimed metadata from queue entry on reject", async () => {
		const { projectDir } = await setupProjectDir(tmpDir);

		await projectsReviewRejectCommand({
			taskId: "TASK-001",
			projectDir,
		});

		const queueContent = await fs.readFile(path.join(projectDir, "queue.md"), "utf-8");
		// The entry in Available should not have agent or claimed metadata
		expect(queueContent).not.toMatch(/agent:/);
		expect(queueContent).not.toMatch(/claimed:/);
	});

	it("throws when task not in review section", async () => {
		const { projectDir } = await setupProjectDir(tmpDir);

		const queueContent = `---
project: test-project
updated: "2026-03-29"
---

## Available

- TASK-001

## Claimed

## Review

## Done

## Blocked
`;
		await fs.writeFile(path.join(projectDir, "queue.md"), queueContent, "utf-8");

		await expect(
			projectsReviewRejectCommand({ taskId: "TASK-001", projectDir }),
		).rejects.toThrow(/not found in Review/);
	});
});
