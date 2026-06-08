import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSurveyTool } from "./support/survey-mcp-client.js";

const SAMPLE_ROOT = resolve("railwise/examples/metro-protection");

function sampleJson<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(SAMPLE_ROOT, file), "utf8")) as T;
}

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
      "fixtures/cpiii-control-points.json",
      "fixtures/shield-guidance.json",
      "fixtures/inclinometer-readings.json",
    ]) {
      expect(existsSync(resolve(SAMPLE_ROOT, file)), `missing sample file ${file}`).toBe(true);
    }

    const readme = readFileSync(resolve(SAMPLE_ROOT, "README.md"), "utf8");
    const checklist = readFileSync(resolve(SAMPLE_ROOT, "sop-checklist.md"), "utf8");
    for (const token of ["survey_chart_generator", "survey_excel_export", "Markdown", "Word"]) {
      expect(readme).toContain(token);
      expect(checklist).toContain(token);
    }
  });

  it("runs the sample through MCP data analysis and full deliverable export", async () => {
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

    const chartPath = join(outDir, "metro-protection-trend.svg");
    const chart = await runSurveyTool("chart_generator", {
      outputPath: chartPath,
      title: "宁波地铁保护区沉降趋势",
      sourceTool: "monitoring_csv",
      exportRows: monitoring.export_rows,
      alertThreshold: 30,
    });
    expect(chart).toMatchObject({
      output_path: chartPath,
      chart_summary: {
        source_tool: "monitoring_csv",
      },
    });
    expect(existsSync(chartPath)).toBe(true);

    const workbookPath = join(outDir, "metro-protection-results.xlsx");
    const workbook = await runSurveyTool("excel_export", {
      title: "宁波地铁保护区监测成果",
      outputPath: workbookPath,
      sourceTool: "monitoring_csv",
      summary: monitoring.monitoring_summary,
      exportRows: monitoring.export_rows,
    });
    expect(workbook).toMatchObject({
      output_path: workbookPath,
      format: "xlsx (Office Open XML SpreadsheetML)",
      export_summary: {
        source_tool: "monitoring_csv",
      },
    });
    expect(existsSync(workbookPath)).toBe(true);

    const reportMarkdown = readFileSync(
      resolve(SAMPLE_ROOT, "expected-monitoring-report.md"),
      "utf8",
    );
    const markdownPath = join(outDir, "metro-protection-report.md");
    const markdown = await runSurveyTool("report_export", {
      markdown: reportMarkdown,
      title: "宁波地铁保护区监测日报",
      outputPath: markdownPath,
      format: "markdown",
      sourceTool: "monitoring_csv",
      summary: monitoring.monitoring_summary,
      exportRows: monitoring.export_rows,
    });
    expect(markdown).toMatchObject({
      output_path: markdownPath,
      format: "markdown",
      report_summary: {
        source_tool: "monitoring_csv",
      },
    });
    expect(readFileSync(markdownPath, "utf8")).toContain("宁波地铁保护区监测日报");

    const docxPath = join(outDir, "metro-protection-report.docx");
    const exported = await runSurveyTool("report_export", {
      markdown: reportMarkdown,
      title: "宁波地铁保护区监测日报",
      outputPath: docxPath,
      sourceTool: "monitoring_csv",
      summary: monitoring.monitoring_summary,
      exportRows: monitoring.export_rows,
    });

    expect(exported.output_path).toBe(docxPath);
    expect(exported.format).toBe("docx (Office Open XML)");
    expect(existsSync(docxPath)).toBe(true);
  }, 30000);

  it("runs the rail transit engineering fixtures through their MCP calculators", async () => {
    const cpiii = await runSurveyTool(
      "cpiii_adjustment",
      sampleJson<Record<string, unknown>>("fixtures/cpiii-control-points.json"),
    );
    expect(cpiii).toMatchObject({
      mode: "cpiii_deviation_review",
      point_count: 4,
      failed_points: ["CP3-04"],
      max_error_mm: 3.302,
    });

    const shield = await runSurveyTool(
      "shield_guidance",
      sampleJson<Record<string, unknown>>("fixtures/shield-guidance.json"),
    );
    expect(shield).toMatchObject({
      mode: "single_pose",
      horizontal_deviation_mm: 34.99,
      vertical_deviation_mm: 36,
      vertical_status: "alert",
      azimuth_status: "pass",
    });

    const inclinometer = await runSurveyTool(
      "inclinometer",
      sampleJson<Record<string, unknown>>("fixtures/inclinometer-readings.json"),
    );
    expect(inclinometer).toMatchObject({
      mode: "reading_difference",
      max_depth_m: 18,
      max_displacement_mm: 19.801,
      is_alert: true,
    });
  });
});
