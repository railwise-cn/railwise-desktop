import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeMcpConfig } from "../src/config.js";
import { loadDotMcpJson } from "../src/mcp/dot-mcp-json.js";
import { SkillStore } from "../src/skills.js";

const RAILWISE_ROOT = resolve("railwise");

describe("bundled Railwise engineering workspace", () => {
  it("loads engineering skills, copied Claude skills, and builtins from the bundled workspace", () => {
    const store = new SkillStore({ projectRoot: RAILWISE_ROOT });
    const skills = store.list();
    const byName = new Map(skills.map((skill) => [skill.name, skill]));

    expect(skills.length).toBeGreaterThanOrEqual(37);
    expect(skills.filter((skill) => skill.scope === "project").length).toBeGreaterThanOrEqual(31);
    for (const name of [
      "architect",
      "data-analyst",
      "writer",
      "qa-reviewer",
      "qa-inspector",
      "commercial",
      "bid-prepare",
      "daily-report",
      "monthly-report",
      "trend-analysis",
      "bidding-knowledge",
      "monitoring-design",
      "report-writing",
      "standard-reference",
    ]) {
      expect(byName.get(name), `missing bundled skill ${name}`).toBeDefined();
    }
  });

  it("loads the lower-priority migrated workflow commands as inline project skills", () => {
    const store = new SkillStore({ projectRoot: RAILWISE_ROOT, disableBuiltins: true });
    const byName = new Map(store.list().map((skill) => [skill.name, skill]));

    for (const name of ["ai-deps", "commit", "issues", "learn", "rmslop", "spellcheck"]) {
      const skill = byName.get(name);

      expect(skill, `missing migrated workflow skill ${name}`).toBeDefined();
      expect(skill?.scope).toBe("project");
      expect(skill?.runAs).toBe("inline");
      expect(skill?.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("maps the six engineering subagents to the intended DeepSeek flash/pro tiers", () => {
    const store = new SkillStore({ projectRoot: RAILWISE_ROOT, disableBuiltins: true });

    expect(store.read("architect")?.model).toBe("deepseek-v4-pro");
    expect(store.read("data-analyst")?.model).toBe("deepseek-v4-pro");
    expect(store.read("qa-reviewer")?.model).toBe("deepseek-v4-pro");
    expect(store.read("qa-inspector")?.model).toBe("deepseek-v4-flash");
    expect(store.read("writer")?.model).toBe("deepseek-v4-flash");
    expect(store.read("commercial")?.model).toBe("deepseek-v4-flash");
  });

  it("allows the data analyst subagent to call the full migrated survey MCP toolset", () => {
    const store = new SkillStore({ projectRoot: RAILWISE_ROOT, disableBuiltins: true });
    const tools = new Set(store.read("data-analyst")?.allowedTools ?? []);

    for (const name of [
      "survey_level_adjust",
      "survey_traverse_adjust",
      "survey_calculator_leveling_adjustment",
      "survey_calculator_traverse_adjustment",
      "survey_calculator_alert_level",
      "survey_calculator_leveling_closure",
      "survey_calculator_traverse_closure",
      "survey_monitoring_csv",
      "survey_format_parser",
      "survey_chart_generator",
      "survey_deformation_rate",
      "survey_control_network",
      "survey_cpiii_adjustment",
      "survey_coord_transform",
      "survey_distance_calculator",
      "survey_angle_convert",
      "survey_deformation_comparison",
      "survey_inclinometer",
      "survey_cross_section",
      "survey_axial_force",
      "survey_water_level",
      "survey_line_stakeout",
      "survey_track_geometry_review",
      "survey_alignment_station_offset",
      "survey_shield_guidance",
    ]) {
      expect(tools.has(name), `data-analyst cannot call ${name}`).toBe(true);
    }
  });

  it("allows the writer subagent to export report and workbook deliverables", () => {
    const store = new SkillStore({ projectRoot: RAILWISE_ROOT, disableBuiltins: true });
    const tools = new Set(store.read("writer")?.allowedTools ?? []);

    for (const name of ["survey_report_export", "survey_excel_export"]) {
      expect(tools.has(name), `writer cannot call ${name}`).toBe(true);
    }
  });

  it("allows design and final-review gates to query engineering standards", () => {
    const store = new SkillStore({ projectRoot: RAILWISE_ROOT, disableBuiltins: true });

    for (const name of ["architect", "qa-reviewer"]) {
      const tools = new Set(store.read(name)?.allowedTools ?? []);
      expect(tools.has("survey_standard_query"), `${name} cannot call survey_standard_query`).toBe(
        true,
      );
    }
  });

  it("merges the project .mcp.json survey server and points it at the built artifact", () => {
    const project = loadDotMcpJson(RAILWISE_ROOT);
    const specs = normalizeMcpConfig({ mcpServers: project });
    const survey = specs.find((spec) => spec.name === "survey");

    expect(survey).toBeDefined();
    expect(survey?.command).toBe("node");
    expect(survey?.args).toEqual(["./survey-mcp/dist/index.js"]);
    expect(existsSync(resolve(RAILWISE_ROOT, "survey-mcp/dist/index.js"))).toBe(true);
  });
});
