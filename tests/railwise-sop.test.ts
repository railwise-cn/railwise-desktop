import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tools.js";
import { registerSkillTools } from "../src/tools/skills.js";

const RAILWISE_ROOT = resolve("railwise");

function skillBody(name: string): string {
  return readFileSync(resolve(RAILWISE_ROOT, ".reasonix/skills", `${name}.md`), "utf8");
}

describe("Railwise engineering SOP", () => {
  it("routes bid preparation through architect, commercial, writer, and qa-reviewer", () => {
    const body = skillBody("bid-prepare");

    expect(body).toContain("run_skill architect");
    expect(body).toContain("run_skill commercial");
    expect(body).toContain("run_skill writer");
    expect(body).toContain("run_skill qa-reviewer");
    expect(body.indexOf("run_skill writer")).toBeLessThan(body.indexOf("run_skill qa-reviewer"));
  });

  it("keeps daily reports behind the mandatory external-delivery QA gate", () => {
    const body = skillBody("daily-report");

    expect(body).toContain("run_skill data-analyst");
    expect(body).toContain("run_skill writer");
    expect(body).toContain("run_skill qa-reviewer");
  });

  it("can inline the full bid-preparation SOP as a runnable skill entry", async () => {
    const registry = new ToolRegistry();
    registerSkillTools(registry, {
      projectRoot: RAILWISE_ROOT,
      disableBuiltins: true,
      subagentRunner: async (skill, task) =>
        JSON.stringify({ success: true, skill: skill.name, task }),
    });

    const out = await registry.dispatch("run_skill", {
      name: "bid-prepare",
      arguments: "宁波地铁保护区监测投标，技术标和商务标均需输出",
    });

    expect(out).toContain("# Skill: bid-prepare");
    expect(out).toContain("run_skill architect");
    expect(out).toContain("run_skill commercial");
    expect(out).toContain("run_skill writer");
    expect(out).toContain("run_skill qa-reviewer");
    expect(out).toContain("Arguments: 宁波地铁保护区监测投标");
  });
});
