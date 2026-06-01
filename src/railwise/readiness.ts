import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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

const REQUIRED_SURVEY_TOOLS = [
  "survey_control_network",
  "survey_cpiii_adjustment",
  "survey_coord_transform",
  "survey_distance_calculator",
  "survey_angle_convert",
  "survey_inclinometer",
  "survey_cross_section",
  "survey_axial_force",
  "survey_water_level",
  "survey_pile_stakeout",
  "survey_shield_guidance",
] as const;

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

function looksLikeBundledRailwise(projectRoot: string): boolean {
  return (
    existsSync(join(projectRoot, "REASONIX.md")) &&
    existsSync(join(projectRoot, ".mcp.json")) &&
    existsSync(join(projectRoot, "survey-mcp", "package.json"))
  );
}

export function runRailwiseReadinessChecks(projectRoot: string): DoctorCheck[] {
  if (!looksLikeBundledRailwise(projectRoot)) return [];

  const out: DoctorCheck[] = [];
  const reasonix = join(projectRoot, "REASONIX.md");
  const mcp = loadDotMcpJson(projectRoot);
  const survey = mcp?.survey;
  const surveyArgs = Array.isArray(survey?.args) ? survey.args : [];
  const surveyDist = join(projectRoot, "survey-mcp", "dist", "index.js");
  const surveyPkg = join(projectRoot, "survey-mcp", "package.json");
  const store = new SkillStore({ projectRoot, disableBuiltins: true });
  const byName = new Map(store.list().map((skill) => [skill.name, skill]));
  const missingSkills = REQUIRED_REASONIX_SKILLS.filter((name) => !byName.has(name));
  const dataTools = new Set(byName.get("data-analyst")?.allowedTools ?? []);
  const missingTools = REQUIRED_SURVEY_TOOLS.filter((name) => !dataTools.has(name));

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
      survey?.command === "node" &&
        surveyArgs.includes("./survey-mcp/dist/index.js") &&
        existsSync(surveyDist)
        ? "ok"
        : "fail",
      existsSync(surveyPkg) && existsSync(surveyDist)
        ? `.mcp.json → node ./survey-mcp/dist/index.js (${surveyDist})`
        : "survey-mcp package or built dist/index.js is missing; run `npm run build:survey`",
    ),
  );
  out.push(
    check(
      "railwise-skills",
      "skills       ",
      missingSkills.length === 0 && missingTools.length === 0 ? "ok" : "fail",
      missingSkills.length === 0 && missingTools.length === 0
        ? `${reasonixSkillCount(projectRoot)} project skills · data-analyst can call ${REQUIRED_SURVEY_TOOLS.length} migrated survey tools`
        : `missing skills: ${missingSkills.join(", ") || "none"}; missing data-analyst tools: ${missingTools.join(", ") || "none"}`,
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
