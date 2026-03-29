import { ErrorCodes, errorShape } from "../protocol/schema/error-codes.js";
import type { ProjectGatewayService } from "../server-projects.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";

let projectsService: ProjectGatewayService | null = null;

/** Set the active ProjectGatewayService instance for RPC handlers. */
export function setProjectsService(svc: ProjectGatewayService): void {
  projectsService = svc;
}

/**
 * Validate that params.project is a non-empty string.
 * On failure, sends an error response and returns null.
 */
function validateProjectParam(params: Record<string, unknown>, respond: RespondFn): string | null {
  if (typeof params.project === "string" && params.project.trim()) {
    return params.project.trim();
  }
  respond(
    false,
    undefined,
    errorShape(ErrorCodes.INVALID_REQUEST, "missing required param: project"),
  );
  return null;
}

export const projectsHandlers: GatewayRequestHandlers = {
  "projects.list": async ({ respond }) => {
    if (!projectsService) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "projects service not started"));
      return;
    }
    const projects = await projectsService.listProjects();
    respond(true, { projects });
  },

  "projects.get": async ({ params, respond }) => {
    if (!projectsService) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "projects service not started"));
      return;
    }
    const name = validateProjectParam(params, respond);
    if (!name) return;
    const project = await projectsService.getProject(name);
    if (!project) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `project not found: ${name}`),
      );
      return;
    }
    respond(true, { project });
  },

  "projects.board.get": async ({ params, respond }) => {
    if (!projectsService) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "projects service not started"));
      return;
    }
    const name = validateProjectParam(params, respond);
    if (!name) return;
    const board = await projectsService.getBoard(name);
    if (!board) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `project not found: ${name}`),
      );
      return;
    }
    respond(true, { board });
  },

  "projects.queue.get": async ({ params, respond }) => {
    if (!projectsService) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "projects service not started"));
      return;
    }
    const name = validateProjectParam(params, respond);
    if (!name) return;
    const queue = await projectsService.getQueue(name);
    if (!queue) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `project not found: ${name}`),
      );
      return;
    }
    respond(true, { queue });
  },

  "projects.review.approve": async ({ params, respond }) => {
    if (!projectsService) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "projects service not started"));
      return;
    }
    const name = validateProjectParam(params, respond);
    if (!name) return;
    const taskId =
      typeof params.taskId === "string" && params.taskId.trim() ? params.taskId.trim() : null;
    if (!taskId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "missing required param: taskId"),
      );
      return;
    }
    try {
      const { projectsReviewApproveCommand } = await import("../../commands/projects.review.js");
      const projectDir = await projectsService.resolveProjectDir(name);
      if (!projectDir) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `project not found: ${name}`),
        );
        return;
      }
      await projectsReviewApproveCommand({
        taskId,
        projectDir,
        notes: typeof params.notes === "string" ? params.notes : undefined,
        reviewer: typeof params.reviewer === "string" ? params.reviewer : undefined,
      });
      respond(true, { ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, message));
    }
  },

  "projects.review.reject": async ({ params, respond }) => {
    if (!projectsService) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "projects service not started"));
      return;
    }
    const name = validateProjectParam(params, respond);
    if (!name) return;
    const taskId =
      typeof params.taskId === "string" && params.taskId.trim() ? params.taskId.trim() : null;
    if (!taskId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "missing required param: taskId"),
      );
      return;
    }
    try {
      const { projectsReviewRejectCommand } = await import("../../commands/projects.review.js");
      const projectDir = await projectsService.resolveProjectDir(name);
      if (!projectDir) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `project not found: ${name}`),
        );
        return;
      }
      await projectsReviewRejectCommand({
        taskId,
        projectDir,
        notes: typeof params.notes === "string" ? params.notes : undefined,
        reviewer: typeof params.reviewer === "string" ? params.reviewer : undefined,
      });
      respond(true, { ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, message));
    }
  },

  "projects.task.checkpoint.get": async ({ params, respond }) => {
    if (!projectsService) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "projects service not started"));
      return;
    }
    const name = validateProjectParam(params, respond);
    if (!name) return;
    const taskId =
      typeof params.taskId === "string" && params.taskId.trim() ? params.taskId.trim() : null;
    if (!taskId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "missing required param: taskId"),
      );
      return;
    }
    const checkpoint = await projectsService.getTaskCheckpoint(name, taskId);
    respond(true, { checkpoint });
  },
};
