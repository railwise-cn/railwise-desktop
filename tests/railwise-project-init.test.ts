import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDotMcpJson } from "../src/mcp/dot-mcp-json.js";
import { initRailwiseProject } from "../src/railwise/project-init.js";
import { runRailwiseReadinessChecks } from "../src/railwise/readiness.js";

describe("initRailwiseProject", () => {
  let parentDir: string;

  beforeEach(() => {
    parentDir = mkdtempSync(join(tmpdir(), "railwise-init-"));
  });

  afterEach(() => {
    rmSync(parentDir, { recursive: true, force: true });
  });

  it("creates a usable Railwise engineering project packet", () => {
    const surveyMcpEntry = join(parentDir, "fake-survey-mcp", "dist", "index.js");
    mkdirSync(join(parentDir, "fake-survey-mcp", "dist"), { recursive: true });
    writeFileSync(surveyMcpEntry, "#!/usr/bin/env node\n", "utf8");

    const result = initRailwiseProject({
      parentDir,
      projectName: "metro-line-02-monitoring",
      surveyMcpEntry,
    });

    expect(result.projectRoot).toBe(join(parentDir, "metro-line-02-monitoring"));
    for (const file of [
      "README.md",
      "REASONIX.md",
      ".mcp.json",
      ".reasonix/skills/data-analyst.md",
      "data/monitoring-settlement.csv",
      "data/cpiii-control-points.json",
      "data/shield-guidance.json",
      "data/inclinometer-readings.json",
      "reports/expected-monitoring-report.md",
      "SOP.md",
      "bid-brief.md",
    ]) {
      expect(existsSync(join(result.projectRoot, file)), `missing ${file}`).toBe(true);
    }

    const mcp = loadDotMcpJson(result.projectRoot);
    expect(mcp?.survey?.command).toBe("node");
    expect(mcp?.survey?.args?.join(" ")).toContain("survey-mcp/dist/index.js");

    const readiness = runRailwiseReadinessChecks(result.projectRoot);
    expect(readiness.map((check) => [check.id, check.level])).toEqual([
      ["railwise-workspace", "ok"],
      ["railwise-survey-mcp", "ok"],
      ["railwise-skills", "ok"],
      ["railwise-chief-sop", "ok"],
    ]);
  });

  it("refuses to overwrite a non-empty project directory", () => {
    const first = initRailwiseProject({ parentDir, projectName: "existing-project" });
    expect(() => initRailwiseProject({ parentDir, projectName: "existing-project" })).toThrow(
      /already exists/i,
    );
    expect(readFileSync(join(first.projectRoot, "README.md"), "utf8")).toContain("Railwise");
  });
});
