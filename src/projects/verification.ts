import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

/** Result of a single verification check. */
export type CheckResult = {
  type: "file_exists" | "command";
  target: string;
  passed: boolean;
  detail: string;
};

/** Evidence collected during a verification run. */
export type VerificationEvidence = {
  checks: CheckResult[];
  timestamp: string;
  verification_type: string;
};

/** Outcome of running all verification checks for a task. */
export type VerificationResult =
  | { passed: true; evidence: VerificationEvidence }
  | { passed: false; evidence: VerificationEvidence; reason: string };

/** Stored in checkpoint sidecar to track verification history. */
export type VerificationRecord = {
  last_run: string;
  passed: boolean;
  verification_type: string;
  checks: CheckResult[];
  human_review?: {
    status: "pending" | "approved" | "rejected";
    reviewer?: string;
    reviewed_at?: string;
    notes?: string;
  };
  history: Array<{ timestamp: string; passed: boolean; checks_summary: string }>;
};

/**
 * Check whether a file exists relative to the project directory.
 * Returns a CheckResult with passed=true if the file is accessible.
 */
export async function runFileExistsCheck(filePath: string, projectDir: string): Promise<CheckResult> {
  const resolved = path.resolve(projectDir, filePath);
  try {
    await access(resolved);
    return {
      type: "file_exists",
      target: filePath,
      passed: true,
      detail: `File exists: ${filePath}`,
    };
  } catch {
    return {
      type: "file_exists",
      target: filePath,
      passed: false,
      detail: `File not found: ${filePath}`,
    };
  }
}

/**
 * Run a shell command and check exit code + optional output pattern.
 * Times out after 30 seconds. Runs in the project directory.
 */
export async function runCommandCheck(
  cmd: string,
  expectedExit: number,
  outputPattern: string | undefined,
  projectDir: string,
): Promise<CheckResult> {
  try {
    const { stdout, exitCode } = await execCommand(cmd, projectDir);
    const exitOk = exitCode === expectedExit;

    if (!exitOk) {
      return {
        type: "command",
        target: cmd,
        passed: false,
        detail: `Exit code ${exitCode}, expected ${expectedExit}`,
      };
    }

    if (outputPattern !== undefined) {
      const patternOk = new RegExp(outputPattern).test(stdout);
      if (!patternOk) {
        return {
          type: "command",
          target: cmd,
          passed: false,
          detail: `Output pattern "${outputPattern}" did not match stdout`,
        };
      }
    }

    return {
      type: "command",
      target: cmd,
      passed: true,
      detail: `Command succeeded (exit ${exitCode})`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      type: "command",
      target: cmd,
      passed: false,
      detail: `Command error: ${message}`,
    };
  }
}

/** Execute a shell command with a 30-second timeout, returning stdout and exit code. */
function execCommand(
  cmd: string,
  cwd: string,
): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    execFile("sh", ["-c", cmd], { cwd, timeout: 30_000 }, (error, stdout) => {
      if (error) {
        // If it timed out or was killed, reject
        if (error.killed || error.signal === "SIGTERM") {
          reject(new Error(`Command timed out after 30s: ${cmd}`));
          return;
        }
        // Non-zero exit code -- resolve with exit code from error
        const code = typeof error.code === "number" ? error.code : 1;
        resolve({ stdout: stdout ?? "", exitCode: code });
        return;
      }
      resolve({ stdout: stdout ?? "", exitCode: 0 });
    });
  });
}
