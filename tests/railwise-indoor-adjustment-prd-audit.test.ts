import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Railwise indoor adjustment PRD delivery audit", () => {
  it("tracks the PRD scope and remaining deliverables without earthwork drift", () => {
    const auditPath = resolve("docs/railwise-indoor-adjustment-prd-audit.md");
    expect(existsSync(auditPath)).toBe(true);

    const audit = readFileSync(auditPath, "utf8");
    expect(audit).toContain("# RAILWISE Desktop 内业平差工作台 PRD 交付审计");
    expect(audit).toContain("范围边界");
    expect(audit).toContain("当前完成度矩阵");
    expect(audit).toContain("下一步开发顺序");

    for (const requirement of [
      "WB-01",
      "WB-02",
      "WB-03",
      "WB-04",
      "WB-05",
      "TRV-01",
      "TRV-02",
      "TRV-03",
      "TRV-04",
      "TRV-05",
      "TRV-06",
      "LVL-01",
      "LVL-02",
      "LVL-03",
      "LVL-04",
      "LVL-05",
      "LVL-06",
      "DEF-01",
      "DEF-02",
      "DEF-03",
      "IO-01",
      "IO-02",
      "IO-03",
      "验收 1",
      "验收 2",
      "验收 3",
      "验收 4",
      "验收 5",
    ]) {
      expect(audit).toContain(requirement);
    }

    expect(audit).not.toMatch(/土方|earthwork|挖方|填方/iu);
  });

  it("ships benchmark fixtures for PRD traverse and leveling adjustment tools", () => {
    const traverseFixturePath = resolve(
      "tests/fixtures/engineering/indoor-traverse-known-baseline.json",
    );
    const levelFixturePath = resolve("tests/fixtures/engineering/indoor-level-known-baseline.json");
    expect(existsSync(traverseFixturePath)).toBe(true);
    expect(existsSync(levelFixturePath)).toBe(true);

    const traverseFixture = JSON.parse(readFileSync(traverseFixturePath, "utf8")) as Record<
      string,
      unknown
    >;
    const levelFixture = JSON.parse(readFileSync(levelFixturePath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(traverseFixture).toMatchObject({
      schema: "railwise.engineering.indoorAdjustmentBenchmark.v1",
      tool: "survey_traverse_adjust",
      expected: {
        method: "least_squares_traverse_adjustment",
        coordinate_closure_mm: 0,
      },
    });
    expect(levelFixture).toMatchObject({
      schema: "railwise.engineering.indoorAdjustmentBenchmark.v1",
      tool: "survey_level_adjust",
      expected: {
        method: "least_squares_level_adjustment",
        // biome-ignore lint/suspicious/noApproximativeNumericConstant: PRD fixture stores rounded millimeter evidence.
        unit_weight_mse_mm: 1.414,
      },
    });
  });

  it("ships the PRD indoor offline desktop smoke entrypoint", () => {
    const audit = readFileSync(resolve("docs/railwise-indoor-adjustment-prd-audit.md"), "utf8");
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(existsSync(resolve("scripts/verify-indoor-adjustment-offline-smoke.mts"))).toBe(true);
    expect(packageJson.scripts?.["verify:indoor-offline-smoke"]).toBe(
      "tsx scripts/verify-indoor-adjustment-offline-smoke.mts",
    );
    expect(audit).toContain("verify:indoor-offline-smoke");
  });

  it("ships the PRD DeepSeek AI adjustment report generation entrypoint", () => {
    const audit = readFileSync(resolve("docs/railwise-indoor-adjustment-prd-audit.md"), "utf8");
    const workbench = readFileSync(resolve("desktop/src/ui/engineering-workbench.tsx"), "utf8");
    const tauriMain = readFileSync(resolve("desktop/src-tauri/src/main.rs"), "utf8");

    expect(workbench).toContain("generate_indoor_adjustment_ai_report");
    expect(workbench).toContain("生成 DeepSeek 报告");
    expect(workbench).toContain("DeepSeek 报告生成失败，已保留本地草稿");
    expect(tauriMain).toContain("fn generate_indoor_adjustment_ai_report");
    expect(tauriMain).toContain("chat/completions");
    expect(audit).toContain("generate_indoor_adjustment_ai_report");
  });

  it("ships the PRD indoor adjustment Word/DOCX export entrypoint", () => {
    const audit = readFileSync(resolve("docs/railwise-indoor-adjustment-prd-audit.md"), "utf8");
    const workbench = readFileSync(resolve("desktop/src/ui/engineering-workbench.tsx"), "utf8");
    const uiTest = readFileSync(
      resolve("desktop/src/ui/engineering-workbench-ui.test.tsx"),
      "utf8",
    );

    expect(workbench).toContain("Railwise 内业平差报告 DOCX");
    expect(workbench).toContain("buildEngineeringReportDocxExport");
    expect(uiTest).toContain("exports a PRD indoor adjustment DOCX report");
    expect(audit).toContain("| IO-02 | 已完成 |");
    expect(audit).toContain("Railwise 内业平差报告 DOCX");
  });
});
