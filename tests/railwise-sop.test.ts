import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tools.js";
import { registerSkillTools } from "../src/tools/skills.js";

const RAILWISE_ROOT = resolve("railwise");
const OLD_SURVEY_TOOL_NAMES = [
  "monitoring_csv",
  "format_parser",
  "chart_generator",
  "standard_query",
  "deformation_rate",
  "deformation_comparison",
  "control_network",
  "cpiii_adjustment",
  "coord_transform",
  "distance_calculator",
  "angle_convert",
  "inclinometer",
  "cross_section",
  "axial_force",
  "water_level",
  "line_stakeout",
  "track_geometry_review",
  "alignment_station_offset",
  "shield_guidance",
  "calculator_leveling_adjustment",
  "calculator_traverse_adjustment",
  "calculator_alert_level",
  "calculator_leveling_closure",
  "calculator_traverse_closure",
  "report_export",
  "excel_export",
] as const;

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

  it("documents Markdown, Word, and Excel as formal deliverable exports in chief SOP", () => {
    const body = readFileSync(resolve(RAILWISE_ROOT, "REASONIX.md"), "utf8");

    expect(body).toContain("survey_report_export");
    expect(body).toContain("Markdown");
    expect(body).toContain("Word");
    expect(body).toContain("survey_excel_export");
    expect(body).toContain("Excel");
  });

  it("keeps daily and monthly report workflows connected to formal deliverable tools", () => {
    const daily = skillBody("daily-report");
    const monthly = skillBody("monthly-report");

    for (const body of [daily, monthly]) {
      expect(body).toContain("survey_report_export");
      expect(body).toContain("Markdown");
      expect(body).toContain("Word");
      expect(body).toContain("survey_excel_export");
      expect(body).toContain("Excel");
    }

    expect(monthly).toContain("survey_chart_generator");
    expect(monthly).toContain("SVG");
  });

  it("keeps the writer skill aligned with Markdown, Word, and Excel deliverables", () => {
    const writer = skillBody("writer");

    expect(writer).toContain("survey_report_export");
    expect(writer).toContain("Markdown/Word");
    expect(writer).toContain("survey_excel_export");
    expect(writer).toContain("Excel");
  });

  it("keeps commercial pricing scoped to survey and monitoring workload", () => {
    const commercial = skillBody("commercial");

    expect(commercial).toContain("测量");
    expect(commercial).toContain("监测");
    expect(commercial).toContain("工作量");
    expect(commercial).toContain("测点数量");
    expect(commercial).not.toContain("工程量清单");
  });

  it("uses fully prefixed survey MCP tool names in Railwise-facing docs", () => {
    const docs = [
      readFileSync(resolve(RAILWISE_ROOT, "REASONIX.md"), "utf8"),
      readFileSync(resolve("docs/engineering-analysis-workbench-research.md"), "utf8"),
    ].join("\n");

    const codeTokens = [...docs.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    for (const oldName of OLD_SURVEY_TOOL_NAMES) {
      expect(codeTokens).not.toContain(oldName);
    }
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
