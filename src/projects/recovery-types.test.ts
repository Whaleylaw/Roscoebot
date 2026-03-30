import { describe, expect, it } from "vitest";
import {
  BACKOFF_MS,
  DEFAULT_MAX_RETRIES,
  MAX_DECOMPOSITION_DEPTH,
  selectRecoveryStrategy,
} from "./recovery-types.js";

describe("selectRecoveryStrategy", () => {
  it("returns retry with 5000ms backoff for transient failure at attempt 0", () => {
    const result = selectRecoveryStrategy({
      failureCategory: "transient",
      recoveryAttempts: 0,
      maxRetries: 3,
      decompositionDepth: 0,
      maxDecompositionDepth: 2,
      alternateAgentAvailable: false,
      taskCapabilities: [],
    });
    expect(result).toEqual({ action: "retry", backoffMs: 5000 });
  });

  it("returns retry for unknown failure at attempt 1", () => {
    const result = selectRecoveryStrategy({
      failureCategory: "unknown",
      recoveryAttempts: 1,
      maxRetries: 3,
      decompositionDepth: 0,
      maxDecompositionDepth: 2,
      alternateAgentAvailable: false,
      taskCapabilities: [],
    });
    expect(result.action).toBe("retry");
  });

  it("returns decompose when retries exhausted and depth allows", () => {
    const result = selectRecoveryStrategy({
      failureCategory: "transient",
      recoveryAttempts: 3,
      maxRetries: 3,
      decompositionDepth: 0,
      maxDecompositionDepth: 2,
      alternateAgentAvailable: false,
      taskCapabilities: [],
    });
    expect(result.action).toBe("decompose");
  });

  it("returns reroute when at max decomposition depth with alternate agent", () => {
    const result = selectRecoveryStrategy({
      failureCategory: "transient",
      recoveryAttempts: 3,
      maxRetries: 3,
      decompositionDepth: 2,
      maxDecompositionDepth: 2,
      alternateAgentAvailable: true,
      taskCapabilities: ["coding"],
    });
    expect(result).toEqual({ action: "reroute", targetCapabilities: ["coding"] });
  });

  it("returns escalate when all strategies exhausted", () => {
    const result = selectRecoveryStrategy({
      failureCategory: "transient",
      recoveryAttempts: 3,
      maxRetries: 3,
      decompositionDepth: 2,
      maxDecompositionDepth: 2,
      alternateAgentAvailable: false,
      taskCapabilities: [],
    });
    expect(result.action).toBe("escalate");
  });

  it("returns escalate for permanent failure (skips retry)", () => {
    const result = selectRecoveryStrategy({
      failureCategory: "permanent",
      recoveryAttempts: 0,
      maxRetries: 3,
      decompositionDepth: 2,
      maxDecompositionDepth: 2,
      alternateAgentAvailable: false,
      taskCapabilities: [],
    });
    expect(result.action).toBe("escalate");
  });

  it("BACKOFF_MS has 4 entries: [5000, 25000, 120000, 600000]", () => {
    expect(BACKOFF_MS).toEqual([5_000, 25_000, 120_000, 600_000]);
  });

  it("DEFAULT_MAX_RETRIES equals 3", () => {
    expect(DEFAULT_MAX_RETRIES).toBe(3);
  });

  it("MAX_DECOMPOSITION_DEPTH equals 2", () => {
    expect(MAX_DECOMPOSITION_DEPTH).toBe(2);
  });
});
