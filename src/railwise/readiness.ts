import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { DoctorCheck } from "../cli/commands/doctor.js";
import { loadDotMcpJson } from "../mcp/dot-mcp-json.js";
import { SkillStore } from "../skills.js";

const REQUIRED_REASONIX_SKILLS = [
  "architect",
  "commercial",
  "data-analyst",
  "qa-inspector",
  "qa-reviewer",
  "writer",
  "bid-prepare",
  "daily-report",
  "monthly-report",
  "data-check",
  "trend-analysis",
  "safety-check",
  "emergency-response",
  "payment-reminder",
  "ai-deps",
  "commit",
  "issues",
  "learn",
  "rmslop",
  "spellcheck",
] as const;

const REQUIRED_CLAUDE_SKILLS = [
  "bidding-knowledge",
  "monitoring-design",
  "report-writing",
  "standard-reference",
  "data-analysis",
  "docx-generation",
  "excel-operations",
  "humanizer",
  "canvas-design",
  "frontend-design",
  "bun-file-io",
] as const;

const REQUIRED_SURVEY_TOOLS = [
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
  "survey_deformation_comparison",
  "survey_control_network",
  "survey_cpiii_adjustment",
  "survey_coord_transform",
  "survey_distance_calculator",
  "survey_angle_convert",
  "survey_inclinometer",
  "survey_cross_section",
  "survey_axial_force",
  "survey_water_level",
  "survey_line_stakeout",
  "survey_track_geometry_review",
  "survey_alignment_station_offset",
  "survey_shield_guidance",
] as const;

const REQUIRED_WRITER_TOOLS = ["survey_report_export", "survey_excel_export"] as const;
const REQUIRED_STANDARD_QUERY_SKILLS = ["architect", "qa-reviewer"] as const;

function check(
  id: string,
  label: string,
  level: DoctorCheck["level"],
  detail: string,
): DoctorCheck {
  return { id, label, level, detail };
}

function reasonixSkillCount(projectRoot: string): number {
  const dir = join(projectRoot, ".reasonix", "skills");
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith(".md"),
  ).length;
}

function claudeSkillCount(projectRoot: string): number {
  const dir = join(projectRoot, ".claude", "skills");
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "SKILL.md")),
  ).length;
}

function looksLikeBundledRailwise(projectRoot: string): boolean {
  return (
    existsSync(join(projectRoot, "REASONIX.md")) &&
    existsSync(join(projectRoot, ".mcp.json")) &&
    existsSync(join(projectRoot, ".reasonix", "skills"))
  );
}

function resolveSurveyEntry(
  projectRoot: string,
  survey: unknown,
): { entry: string; abs: string } | null {
  if (!survey || typeof survey !== "object") return null;
  const raw = survey as { args?: unknown; cwd?: unknown };
  const args = Array.isArray(raw.args)
    ? raw.args.filter((arg): arg is string => typeof arg === "string")
    : [];
  const entry = args.find((arg) => arg.replace(/\\/g, "/").endsWith("survey-mcp/dist/index.js"));
  if (!entry) return null;
  if (isAbsolute(entry)) return { entry, abs: entry };
  const cwd =
    typeof raw.cwd === "string" && raw.cwd.trim() ? resolve(projectRoot, raw.cwd) : projectRoot;
  return { entry, abs: resolve(cwd, entry) };
}

export function runRailwiseReadinessChecks(projectRoot: string): DoctorCheck[] {
  if (!looksLikeBundledRailwise(projectRoot)) return [];

  const out: DoctorCheck[] = [];
  const reasonix = join(projectRoot, "REASONIX.md");
  const mcp = loadDotMcpJson(projectRoot);
  const survey = mcp?.survey;
  const surveyEntry = resolveSurveyEntry(projectRoot, survey);
  const surveyDist = surveyEntry?.abs ?? join(projectRoot, "survey-mcp", "dist", "index.js");
  const surveyPkg = join(projectRoot, "survey-mcp", "package.json");
  const store = new SkillStore({ projectRoot, disableBuiltins: true });
  const byName = new Map(store.list().map((skill) => [skill.name, skill]));
  const missingSkills = REQUIRED_REASONIX_SKILLS.filter((name) => !byName.has(name));
  const missingClaudeSkills = REQUIRED_CLAUDE_SKILLS.filter((name) => !byName.has(name));
  const dataTools = new Set(byName.get("data-analyst")?.allowedTools ?? []);
  const missingTools = REQUIRED_SURVEY_TOOLS.filter((name) => !dataTools.has(name));
  const writerTools = new Set(byName.get("writer")?.allowedTools ?? []);
  const missingWriterTools = REQUIRED_WRITER_TOOLS.filter((name) => !writerTools.has(name));
  const missingStandardQuerySkills = REQUIRED_STANDARD_QUERY_SKILLS.filter(
    (name) => !(byName.get(name)?.allowedTools ?? []).includes("survey_standard_query"),
  );

  let chiefText = "";
  try {
    chiefText = readFileSync(reasonix, "utf8");
  } catch {
    /* handled below */
  }

  out.push(
    check(
      "railwise-workspace",
      "railwise ws  ",
      chiefText.includes("Chief SOP") && existsSync(join(projectRoot, ".reasonix", "skills"))
        ? "ok"
        : "fail",
      `${projectRoot} · bundled engineering workspace`,
    ),
  );
  out.push(
    check(
      "railwise-survey-mcp",
      "survey mcp   ",
      survey?.command === "node" && surveyEntry !== null && existsSync(surveyDist) ? "ok" : "fail",
      (existsSync(surveyPkg) || surveyEntry !== null) && existsSync(surveyDist)
        ? `.mcp.json → node ${surveyEntry?.entry ?? "./survey-mcp/dist/index.js"} (${surveyDist})`
        : "survey-mcp package or built dist/index.js is missing; run `npm run build:survey`",
    ),
  );
  out.push(
    check(
      "railwise-skills",
      "skills       ",
      missingSkills.length === 0 &&
        missingClaudeSkills.length === 0 &&
        missingTools.length === 0 &&
        missingWriterTools.length === 0 &&
        missingStandardQuerySkills.length === 0
        ? "ok"
        : "fail",
      missingSkills.length === 0 &&
        missingClaudeSkills.length === 0 &&
        missingTools.length === 0 &&
        missingWriterTools.length === 0 &&
        missingStandardQuerySkills.length === 0
        ? `${reasonixSkillCount(projectRoot)} reasonix skills · ${claudeSkillCount(projectRoot)} copied Claude skills · data-analyst can call ${REQUIRED_SURVEY_TOOLS.length} migrated survey tools · formal deliverables: Markdown/Word reports, Excel workbooks, SVG charts · review gates can query standards`
        : `missing reasonix skills: ${missingSkills.join(", ") || "none"}; missing Claude skills: ${missingClaudeSkills.join(", ") || "none"}; missing data-analyst tools: ${missingTools.join(", ") || "none"}; missing writer tools: ${missingWriterTools.join(", ") || "none"}; missing standard-query gates: ${missingStandardQuerySkills.join(", ") || "none"}`,
    ),
  );
  out.push(
    check(
      "railwise-chief-sop",
      "chief sop    ",
      chiefText.includes("qa-inspector") &&
        chiefText.includes("qa-reviewer") &&
        chiefText.includes("WBS")
        ? "ok"
        : "fail",
      "REASONIX.md enforces WBS planning, qa-inspector first-pass checks, and qa-reviewer final gate",
    ),
  );

  return out;
}
