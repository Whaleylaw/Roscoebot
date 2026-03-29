import { describe, expect, it } from "vitest";
import {
  STANDARD_CAPABILITIES,
  validateCapabilities,
} from "./capability-registry.js";

describe("STANDARD_CAPABILITIES", () => {
  it("contains exactly code, research, ops, review, deploy", () => {
    expect(STANDARD_CAPABILITIES).toEqual(["code", "research", "ops", "review", "deploy"]);
  });

  it("is a readonly tuple", () => {
    expect(STANDARD_CAPABILITIES.length).toBe(5);
  });
});

describe("validateCapabilities", () => {
  it("returns valid when task caps are subset of allowed", () => {
    const result = validateCapabilities(["code"], ["code", "research", "ops"]);
    expect(result).toEqual({ valid: true, unregistered: [] });
  });

  it("returns invalid with unregistered caps when task has unknown cap", () => {
    const result = validateCapabilities(["code", "deploy"], ["code", "research"]);
    expect(result).toEqual({ valid: false, unregistered: ["deploy"] });
  });

  it("returns valid when allowed_capabilities is empty (no restriction)", () => {
    const result = validateCapabilities(["code"], []);
    expect(result).toEqual({ valid: true, unregistered: [] });
  });

  it("returns valid when task capabilities is empty", () => {
    const result = validateCapabilities([], ["code", "research"]);
    expect(result).toEqual({ valid: true, unregistered: [] });
  });

  it("returns valid when both are empty", () => {
    const result = validateCapabilities([], []);
    expect(result).toEqual({ valid: true, unregistered: [] });
  });

  it("reports all unregistered caps", () => {
    const result = validateCapabilities(
      ["code", "research", "deploy"],
      ["code"],
    );
    expect(result).toEqual({ valid: false, unregistered: ["research", "deploy"] });
  });

  it("handles exact match (all task caps registered)", () => {
    const result = validateCapabilities(
      ["code", "research"],
      ["code", "research"],
    );
    expect(result).toEqual({ valid: true, unregistered: [] });
  });

  it("handles single unregistered cap among many valid", () => {
    const result = validateCapabilities(
      ["code", "research", "custom"],
      ["code", "research", "ops", "review", "deploy"],
    );
    expect(result).toEqual({ valid: false, unregistered: ["custom"] });
  });
});
