import { describe, expect, it } from "vitest";
import { INTAKE_SKILL_MD, getIntakeSkillContent } from "./intake-skill.js";

describe("intake-skill", () => {
  describe("INTAKE_SKILL_MD sections", () => {
    it("contains When to Activate section", () => {
      expect(INTAKE_SKILL_MD).toContain("## When to Activate");
    });

    it("contains Clarification Flow section", () => {
      expect(INTAKE_SKILL_MD).toContain("## Clarification Flow");
    });

    it("contains Handoff Format section", () => {
      expect(INTAKE_SKILL_MD).toContain("## Handoff Format");
    });

    it("contains Guidelines section", () => {
      expect(INTAKE_SKILL_MD).toContain("## Guidelines");
    });
  });

  describe("INTAKE_SKILL_MD handoff references", () => {
    it("references sessions_send for orchestrator handoff", () => {
      expect(INTAKE_SKILL_MD).toContain("sessions_send");
    });

    it("references orchestrate payload type", () => {
      expect(INTAKE_SKILL_MD).toContain('"type"');
      expect(INTAKE_SKILL_MD).toContain('"orchestrate"');
    });

    it("references templateName for template matching", () => {
      expect(INTAKE_SKILL_MD).toContain("templateName");
    });

    it("references synthesize flag for workflow synthesis", () => {
      expect(INTAKE_SKILL_MD).toContain("synthesize");
    });

    it("references placementOverride for user override (PPL-03)", () => {
      expect(INTAKE_SKILL_MD).toContain("placementOverride");
    });
  });

  describe("getIntakeSkillContent", () => {
    it("returns same content as INTAKE_SKILL_MD constant", () => {
      expect(getIntakeSkillContent()).toBe(INTAKE_SKILL_MD);
    });
  });
});
