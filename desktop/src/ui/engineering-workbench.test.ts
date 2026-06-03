import { describe, expect, it } from "vitest";
import {
  ENGINEERING_ANALYSIS_TOOLS,
  type EngineeringToolId,
  buildEngineeringReport,
  loadEngineeringSampleInput,
  runEngineeringCalculation,
} from "./engineering-workbench";

describe("EngineeringAnalysisWorkbench calculations", () => {
  it("exposes a broad engineering toolset without the old survey workbench name", () => {
    const ids = new Set(ENGINEERING_ANALYSIS_TOOLS.map((tool) => tool.id));

    const expectedIds: EngineeringToolId[] = [
      "distance_azimuth",
      "angle_conversion",
      "coord_transform",
      "cpiii_deviation",
      "control_network",
      "deformation_trend",
      "inclinometer",
      "axial_force",
      "water_level",
      "pile_stakeout",
      "shield_guidance",
    ];

    for (const id of expectedIds) {
      expect(ids.has(id), `missing workbench tool ${id}`).toBe(true);
    }

    expect(ENGINEERING_ANALYSIS_TOOLS.map((tool) => tool.title).join(" ")).not.toContain(
      "测绘工作台",
    );
  });

  it("runs deterministic distance and shield guidance calculations", () => {
    const distance = runEngineeringCalculation("distance_azimuth", {
      from: { x: 0, y: 0, z: 10 },
      to: { x: 3, y: 4, z: 14 },
    });
    expect(distance.status).toBe("ok");
    expect(distance.metrics.horizontal_distance_m).toBe(5);
    expect(distance.metrics.slope_distance_m).toBeCloseTo(6.4031, 4);
    expect(distance.metrics.azimuth_degrees).toBeCloseTo(36.869898, 6);

    const shield = runEngineeringCalculation("shield_guidance", {
      design: { x: 0, y: 0, z: 0, azimuthDegrees: 10 },
      actual: { x: 0.04, y: 0, z: 0.04, azimuthDegrees: 10.08 },
      horizontalToleranceMm: 50,
      verticalToleranceMm: 30,
      azimuthToleranceDeg: 0.05,
    });
    expect(shield.status).toBe("warn");
    expect(shield.metrics.horizontal_deviation_mm).toBe(40);
    expect(shield.metrics.vertical_deviation_mm).toBe(40);
    expect(shield.metrics.azimuth_deviation_degrees).toBeCloseTo(0.08, 6);
  });

  it("generates a usable engineering report from sample data", () => {
    const result = runEngineeringCalculation(
      "deformation_trend",
      loadEngineeringSampleInput("deformation_trend"),
    );
    const report = buildEngineeringReport(result);

    expect(result.status).toBe("warn");
    expect(result.rows.length).toBeGreaterThan(1);
    expect(report).toContain("# 工程分析工作台报告");
    expect(report).toContain("变形趋势分析");
    expect(report).not.toContain("测绘工作台");
  });
});
