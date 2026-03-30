import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BoardIndex,
  ProjectIndex,
  QueueIndex,
  WorkflowIndex,
  WorkflowSummary,
} from "../../projects/sync-types.js";
// Import the handler module and its setter
import { projectsHandlers, setProjectsService } from "./projects.js";
import type { GatewayRequestHandlerOptions, RespondFn } from "./types.js";

describe("projectsHandlers", () => {
  const mockListProjects = vi.fn<() => Promise<Array<{ name: string } & ProjectIndex>>>();
  const mockGetProject = vi.fn<(name: string) => Promise<ProjectIndex | null>>();
  const mockGetBoard = vi.fn<(name: string) => Promise<BoardIndex | null>>();
  const mockGetQueue = vi.fn<(name: string) => Promise<QueueIndex | null>>();
  const mockGetWorkflows = vi.fn<(name: string) => Promise<WorkflowSummary | null>>();
  const mockGetWorkflow =
    vi.fn<(name: string, workflowId: string) => Promise<WorkflowIndex | null>>();

  let respond: RespondFn;
  let respondCalls: Array<{ ok: boolean; payload?: unknown; error?: unknown }>;

  beforeEach(() => {
    respondCalls = [];
    respond = (ok, payload, error) => {
      respondCalls.push({ ok, payload, error });
    };
    // Set up the mock service
    setProjectsService({
      listProjects: mockListProjects,
      getProject: mockGetProject,
      getBoard: mockGetBoard,
      getQueue: mockGetQueue,
      getWorkflows: mockGetWorkflows,
      getWorkflow: mockGetWorkflow,
    } as never);
    vi.clearAllMocks();
  });

  afterEach(() => {
    setProjectsService(null as never);
  });

  function makeOpts(params: Record<string, unknown>): GatewayRequestHandlerOptions {
    return {
      req: {} as never,
      params,
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    };
  }

  describe("projects.list", () => {
    it("calls listProjects() and responds with { projects: [...] }", async () => {
      const projects = [
        { name: "alpha", status: "active", indexedAt: "2026-01-01T00:00:00Z" },
      ] as Array<{ name: string } & ProjectIndex>;
      mockListProjects.mockResolvedValueOnce(projects);

      await projectsHandlers["projects.list"]!(makeOpts({}));

      expect(mockListProjects).toHaveBeenCalledOnce();
      expect(respondCalls).toEqual([{ ok: true, payload: { projects }, error: undefined }]);
    });
  });

  describe("projects.get", () => {
    it("with valid params.project calls getProject() and responds with { project }", async () => {
      const project = {
        name: "alpha",
        status: "active",
        indexedAt: "2026-01-01T00:00:00Z",
      } as ProjectIndex;
      mockGetProject.mockResolvedValueOnce(project);

      await projectsHandlers["projects.get"]!(makeOpts({ project: "alpha" }));

      expect(mockGetProject).toHaveBeenCalledWith("alpha");
      expect(respondCalls).toEqual([{ ok: true, payload: { project }, error: undefined }]);
    });

    it("with missing params.project responds with error", async () => {
      await projectsHandlers["projects.get"]!(makeOpts({}));

      expect(respondCalls).toHaveLength(1);
      expect(respondCalls[0]!.ok).toBe(false);
      expect(respondCalls[0]!.error).toMatchObject({
        code: "INVALID_REQUEST",
        message: expect.stringContaining("missing required param: project"),
      });
    });

    it("when getProject() returns null responds with error", async () => {
      mockGetProject.mockResolvedValueOnce(null);

      await projectsHandlers["projects.get"]!(makeOpts({ project: "gone" }));

      expect(respondCalls).toHaveLength(1);
      expect(respondCalls[0]!.ok).toBe(false);
      expect(respondCalls[0]!.error).toMatchObject({
        code: "INVALID_REQUEST",
        message: "project not found: gone",
      });
    });
  });

  describe("projects.board.get", () => {
    it("with valid params.project calls getBoard() and responds with { board }", async () => {
      const board: BoardIndex = {
        columns: [{ name: "Backlog", tasks: [] }],
        indexedAt: "2026-01-01T00:00:00Z",
      };
      mockGetBoard.mockResolvedValueOnce(board);

      await projectsHandlers["projects.board.get"]!(makeOpts({ project: "alpha" }));

      expect(mockGetBoard).toHaveBeenCalledWith("alpha");
      expect(respondCalls).toEqual([{ ok: true, payload: { board }, error: undefined }]);
    });

    it("when getBoard() returns null responds with error", async () => {
      mockGetBoard.mockResolvedValueOnce(null);

      await projectsHandlers["projects.board.get"]!(makeOpts({ project: "gone" }));

      expect(respondCalls).toHaveLength(1);
      expect(respondCalls[0]!.ok).toBe(false);
      expect(respondCalls[0]!.error).toMatchObject({
        code: "INVALID_REQUEST",
        message: "project not found: gone",
      });
    });
  });

  describe("projects.queue.get", () => {
    it("with valid params.project calls getQueue() and responds with { queue }", async () => {
      const queue: QueueIndex = {
        available: [],
        claimed: [],
        blocked: [],
        done: [],
        indexedAt: "2026-01-01T00:00:00Z",
      };
      mockGetQueue.mockResolvedValueOnce(queue);

      await projectsHandlers["projects.queue.get"]!(makeOpts({ project: "alpha" }));

      expect(mockGetQueue).toHaveBeenCalledWith("alpha");
      expect(respondCalls).toEqual([{ ok: true, payload: { queue }, error: undefined }]);
    });

    it("when getQueue() returns null responds with error", async () => {
      mockGetQueue.mockResolvedValueOnce(null);

      await projectsHandlers["projects.queue.get"]!(makeOpts({ project: "gone" }));

      expect(respondCalls).toHaveLength(1);
      expect(respondCalls[0]!.ok).toBe(false);
      expect(respondCalls[0]!.error).toMatchObject({
        code: "INVALID_REQUEST",
        message: "project not found: gone",
      });
    });
  });

  describe("projects.workflows.list", () => {
    it("returns workflow summaries for valid project", async () => {
      const summary: WorkflowSummary = {
        workflows: [
          {
            id: "WF-001",
            title: "Setup",
            status: "active",
            progress: { total: 3, done: 1, claimed: 1, review: 0, blocked: 0, available: 1 },
          },
        ],
        indexedAt: "2026-01-01T00:00:00Z",
      };
      mockGetWorkflows.mockResolvedValueOnce(summary);

      await projectsHandlers["projects.workflows.list"]!(makeOpts({ project: "alpha" }));

      expect(mockGetWorkflows).toHaveBeenCalledWith("alpha");
      expect(respondCalls).toEqual([
        {
          ok: true,
          payload: { workflows: summary.workflows, indexedAt: summary.indexedAt },
          error: undefined,
        },
      ]);
    });

    it("returns error when project not found", async () => {
      mockGetWorkflows.mockResolvedValueOnce(null);

      await projectsHandlers["projects.workflows.list"]!(makeOpts({ project: "gone" }));

      expect(respondCalls).toHaveLength(1);
      expect(respondCalls[0]!.ok).toBe(false);
      expect(respondCalls[0]!.error).toMatchObject({
        code: "INVALID_REQUEST",
        message: "project not found: gone",
      });
    });

    it("returns UNAVAILABLE when projectsService is null", async () => {
      setProjectsService(null as never);

      await projectsHandlers["projects.workflows.list"]!(makeOpts({ project: "alpha" }));

      expect(respondCalls).toHaveLength(1);
      expect(respondCalls[0]!.ok).toBe(false);
      expect(respondCalls[0]!.error).toMatchObject({ code: "UNAVAILABLE" });
    });
  });

  describe("projects.workflows.get", () => {
    it("returns single workflow for valid project and workflowId", async () => {
      const workflow: WorkflowIndex = {
        id: "WF-001",
        title: "Setup",
        status: "active",
        goal: "Set up project",
        tasks: ["TASK-001", "TASK-002"],
        template: null,
        progress: { total: 2, done: 0, claimed: 1, review: 0, blocked: 0, available: 1 },
        indexedAt: "2026-01-01T00:00:00Z",
      };
      mockGetWorkflow.mockResolvedValueOnce(workflow);

      await projectsHandlers["projects.workflows.get"]!(
        makeOpts({ project: "alpha", workflowId: "WF-001" }),
      );

      expect(mockGetWorkflow).toHaveBeenCalledWith("alpha", "WF-001");
      expect(respondCalls).toEqual([{ ok: true, payload: { workflow }, error: undefined }]);
    });

    it("returns error when workflowId missing", async () => {
      await projectsHandlers["projects.workflows.get"]!(makeOpts({ project: "alpha" }));

      expect(respondCalls).toHaveLength(1);
      expect(respondCalls[0]!.ok).toBe(false);
      expect(respondCalls[0]!.error).toMatchObject({
        code: "INVALID_REQUEST",
        message: "missing required param: workflowId",
      });
    });

    it("returns error when workflow not found", async () => {
      mockGetWorkflow.mockResolvedValueOnce(null);

      await projectsHandlers["projects.workflows.get"]!(
        makeOpts({ project: "alpha", workflowId: "WF-999" }),
      );

      expect(respondCalls).toHaveLength(1);
      expect(respondCalls[0]!.ok).toBe(false);
      expect(respondCalls[0]!.error).toMatchObject({
        code: "INVALID_REQUEST",
        message: "workflow not found: WF-999",
      });
    });

    it("returns UNAVAILABLE when projectsService is null", async () => {
      setProjectsService(null as never);

      await projectsHandlers["projects.workflows.get"]!(
        makeOpts({ project: "alpha", workflowId: "WF-001" }),
      );

      expect(respondCalls).toHaveLength(1);
      expect(respondCalls[0]!.ok).toBe(false);
      expect(respondCalls[0]!.error).toMatchObject({ code: "UNAVAILABLE" });
    });
  });
});
