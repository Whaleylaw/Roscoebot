import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerProjectsCommand(program: Command) {
  const projects = program
    .command("projects")
    .description("Manage projects (create, list, status, validate, reindex)");

  projects
    .command("create")
    .argument("[name]", "Project name")
    .option("--name <name>", "Project name (alternative to positional)")
    .option("--description <desc>", "Project description")
    .option("--owner <owner>", "Project owner")
    .option("--parent <parent>", "Create as sub-project of this parent")
    .option("--json", "Output JSON", false)
    .description("Create a new project")
    .action(async (positionalName, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { projectsCreateCommand } = await import("../../commands/projects.create.js");
        await projectsCreateCommand({
          name: (positionalName as string | undefined) ?? (opts.name as string | undefined),
          description: opts.description as string | undefined,
          owner: opts.owner as string | undefined,
          parent: opts.parent as string | undefined,
          json: Boolean(opts.json),
        });
      });
    });

  projects
    .command("list")
    .option("--json", "Output JSON", false)
    .description("List all projects")
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { projectsListCommand } = await import("../../commands/projects.list.js");
        await projectsListCommand({ json: Boolean(opts.json) });
      });
    });

  projects
    .command("status")
    .argument("<name>", "Project name")
    .option("--json", "Output JSON", false)
    .description("Show project status")
    .action(async (name, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { projectsStatusCommand } = await import("../../commands/projects.status.js");
        await projectsStatusCommand({ name: name as string, json: Boolean(opts.json) });
      });
    });

  projects
    .command("validate")
    .option("--json", "Output JSON", false)
    .description("Validate all projects for errors")
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { projectsValidateCommand } = await import("../../commands/projects.validate.js");
        await projectsValidateCommand({ json: Boolean(opts.json) });
      });
    });

  projects
    .command("reindex")
    .option("--json", "Output JSON", false)
    .description("Rebuild project index files")
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { projectsReindexCommand } = await import("../../commands/projects.reindex.js");
        await projectsReindexCommand({ json: Boolean(opts.json) });
      });
    });

  const review = projects
    .command("review")
    .description("Manage task reviews (approve or reject tasks awaiting review)");

  review
    .command("approve")
    .argument("<task-id>", "Task ID (e.g., TASK-001)")
    .option("--project <dir>", "Project directory path")
    .option("--notes <text>", "Approval notes")
    .option("--reviewer <name>", "Reviewer name")
    .option("--json", "Output JSON", false)
    .description("Approve a task in review")
    .action(async (taskId, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { projectsReviewApproveCommand } = await import("../../commands/projects.review.js");
        await projectsReviewApproveCommand({
          taskId: taskId as string,
          projectDir: opts.project as string,
          notes: opts.notes as string | undefined,
          reviewer: opts.reviewer as string | undefined,
          json: Boolean(opts.json),
        });
      });
    });

  review
    .command("reject")
    .argument("<task-id>", "Task ID (e.g., TASK-001)")
    .option("--project <dir>", "Project directory path")
    .option("--notes <text>", "Rejection reason")
    .option("--reviewer <name>", "Reviewer name")
    .option("--json", "Output JSON", false)
    .description("Reject a task in review")
    .action(async (taskId, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { projectsReviewRejectCommand } = await import("../../commands/projects.review.js");
        await projectsReviewRejectCommand({
          taskId: taskId as string,
          projectDir: opts.project as string,
          notes: opts.notes as string | undefined,
          reviewer: opts.reviewer as string | undefined,
          json: Boolean(opts.json),
        });
      });
    });
}
