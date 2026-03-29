import type { z } from "zod";
import type {
  ProjectFrontmatterSchema,
  QueueFrontmatterSchema,
  SuccessCriterionSchema,
  TaskFrontmatterSchema,
  WorkflowFrontmatterSchema,
} from "./schemas.js";

export type SuccessCriterion = z.infer<typeof SuccessCriterionSchema>;
export type ProjectFrontmatter = z.infer<typeof ProjectFrontmatterSchema>;
export type TaskFrontmatter = z.infer<typeof TaskFrontmatterSchema>;
export type QueueFrontmatter = z.infer<typeof QueueFrontmatterSchema>;
export type WorkflowFrontmatter = z.infer<typeof WorkflowFrontmatterSchema>;

export type ParseError = {
  filePath: string;
  message: string;
  issues: Array<{ path: string; message: string; line?: number }>;
};

export type ParseResult<T> = { success: true; data: T } | { success: false; error: ParseError };

/** Body sections for a generated task markdown file (DEC-02 standard). */
export type TaskMdBody = {
  objective: string;
  context: string;
  actionGuidance: string;
  successCriteria: string;
  verificationMethod: string;
};
