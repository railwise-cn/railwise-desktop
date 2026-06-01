import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSurveyTool } from "./support/survey-mcp-client.js";

const SAMPLE_ROOT = resolve("railwise/examples/metro-protection");

describe("Railwise metro-protection end-to-end sample", () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "railwise-e2e-"));
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it("ships a complete sample packet for exercising the engineering SOP", () => {
    for (const file of [
      "README.md",
      "bid-brief.md",
      "monitoring-settlement.csv",
      "expected-monitoring-report.md",
      "sop-checklist.md",
    ]) {
      expect(existsSync(resolve(SAMPLE_ROOT, file)), `missing sample file ${file}`).toBe(true);
    }
  });

  it("runs the sample through MCP data analysis and report export", async () => {
    const monitoring = await runSurveyTool("monitoring_csv", {
      filePath: resolve(SAMPLE_ROOT, "monitoring-settlement.csv"),
      sensorType: "settlement",
      alertThreshold: 30,
      periodDays: 3,
    });

    expect(monitoring.total_points).toBe(4);
    expect(monitoring.exceeded_count).toBe(1);
    expect(monitoring.max_cumulative_point).toBe("JC2");

    const trend = await runSurveyTool("deformation_rate", {
      pointId: "JC2",
      data: [
        { date: "2026-05-24", value: 0 },
        { date: "2026-05-25", value: 9 },
        { date: "2026-05-26", value: 18 },
        { date: "2026-05-27", value: 29 },
        { date: "2026-05-28", value: 36 },
      ],
      alertThreshold: 30,
      rateThreshold: 4,
      predictionDays: 3,
    });

    expect(trend.alert_analysis).toMatchObject({ alert_level: "🔴 已超阈值" });
    expect(String(trend.rate_alert)).toContain("超过限值");

    const docxPath = join(outDir, "metro-protection-report.docx");
    const exported = await runSurveyTool("report_export", {
      markdown: "# 宁波地铁保护区监测日报\n\n- JC2 已超阈值，建议加密观测。",
      title: "宁波地铁保护区监测日报",
      outputPath: docxPath,
    });

    expect(exported.output_path).toBe(docxPath);
    expect(existsSync(docxPath)).toBe(true);
  });
});
