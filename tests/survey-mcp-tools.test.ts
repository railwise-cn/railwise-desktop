import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SURVEY_ROOT = resolve("railwise/survey-mcp");

type RpcResponse = {
  id?: number;
  result?: {
    isError?: boolean;
    tools?: Array<{ name: string; description?: string }>;
    content?: Array<{ type: "text"; text: string }>;
  };
  error?: unknown;
};

let child: ChildProcessWithoutNullStreams;
let nextId = 1;
const pending = new Map<number, (response: RpcResponse) => void>();

function send(method: string, params: Record<string, unknown> = {}): Promise<RpcResponse> {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolveResponse) => pending.set(id, resolveResponse));
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await send("tools/call", { name, arguments: args });
  expect(response.error).toBeUndefined();
  const text = response.result?.content?.[0]?.text;
  expect(text).toBeTruthy();
  return JSON.parse(text!) as Record<string, unknown>;
}

async function callToolExpectError(name: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await send("tools/call", { name, arguments: args });
  expect(response.error ?? response.result?.isError).toBeTruthy();
  return response.error ?? response.result?.content?.[0]?.text;
}

function readZipEntries(zipPath: string): Map<string, string> {
  const bytes = readFileSync(zipPath);
  const entries = new Map<string, string>();
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = bytes.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const method = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = bytes.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(compressed) : compressed;
    entries.set(name, data.toString("utf8"));
    offset = dataStart + compressedSize;
  }

  return entries;
}

beforeAll(async () => {
  const build = spawnSync("npm", ["--prefix", "railwise/survey-mcp", "run", "build"], {
    cwd: resolve("."),
    encoding: "utf8",
  });
  expect(build.status, build.stderr || build.stdout).toBe(0);

  child = spawn("node", ["dist/index.js"], { cwd: SURVEY_ROOT, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buf += chunk;
    let idx = buf.indexOf("\n");
    while (idx >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) {
        const response = JSON.parse(line) as RpcResponse;
        if (typeof response.id === "number") pending.get(response.id)?.(response);
      }
      idx = buf.indexOf("\n");
    }
  });

  await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "survey-mcp-test", version: "0.0.0" },
  });
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`,
  );
});

afterAll(() => {
  child?.kill("SIGTERM");
});

describe("survey-mcp engineering tools", () => {
  it("registers the complete migrated engineering calculation toolset", async () => {
    const response = await send("tools/list");
    const names = new Set(response.result?.tools?.map((tool) => tool.name));

    for (const name of [
      "monitoring_csv",
      "format_parser",
      "chart_generator",
      "standard_query",
      "excel_export",
      "report_export",
      "deformation_rate",
      "control_network",
      "cpiii_adjustment",
      "coord_transform",
      "calculator_leveling_closure",
      "calculator_traverse_closure",
      "calculator_alert_level",
      "calculator_leveling_adjustment",
      "calculator_traverse_adjustment",
      "level_adjust",
      "traverse_adjust",
      "survey_level_adjust",
      "survey_traverse_adjust",
      "distance_calculator",
      "angle_convert",
      "deformation_comparison",
      "inclinometer",
      "cross_section",
      "axial_force",
      "water_level",
      "track_geometry_review",
      "line_stakeout",
      "alignment_station_offset",
      "shield_guidance",
    ]) {
      expect(names.has(name), `missing MCP tool ${name}`).toBe(true);
    }
  });

  it("runs PRD indoor adjustment through the standalone desktop runner", () => {
    const run = spawnSync("node", ["dist/adjust-runner.js"], {
      cwd: SURVEY_ROOT,
      input: JSON.stringify({
        tool: "traverse_adjust",
        input: {
          known_points: [
            { name: "S", x: 0, y: 0, fixed: true },
            { name: "E", x: 100, y: 0, fixed: true },
          ],
          observations: [{ from: "S", to: "P1", hz_angle_deg: 270, slope_dist_m: 100 }],
          params: {
            start_azimuth_deg: 0,
            end_azimuth_deg: 90,
            model: "normal",
          },
        },
      }),
      encoding: "utf8",
    });

    expect(run.status, run.stderr || run.stdout).toBe(0);
    const parsed = JSON.parse(run.stdout) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      method: "traverse_bowditch_adjustment",
      observation_count: 1,
      closures: {
        coord_mm: 0,
      },
    });
    expect(parsed.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row_type: "traverse_error_ellipse", point_name: "P1" }),
      ]),
    );
  });

  it("exposes PRD-named indoor adjustment tools for traverse and leveling workbench flows", async () => {
    const leveling = await callTool("survey_level_adjust", {
      known_bms: [{ name: "BM1", h: 100, fixed: true }],
      segments: [
        { from: "BM1", to: "TP1", dh_m: 1.234, length_km: 1, n_stations: 8 },
        { from: "BM1", to: "TP1", dh_m: 1.236, length_km: 1, n_stations: 8 },
      ],
      weight_mode: "length",
    });

    expect(leveling).toMatchObject({
      method: "least_squares_level_adjustment",
      weight_mode: "length",
      known_bm_count: 1,
      unknown_point_count: 1,
      segment_count: 2,
      redundancy: 1,
      unit_weight_mse_mm: Number(Math.SQRT2.toFixed(3)),
      closures: {
        max_residual_mm: 1,
      },
    });
    expect(leveling.points as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "TP1",
          h: 101.235,
          mh: 1,
        }),
      ]),
    );
    expect(leveling.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "level_adjusted_height",
          point_name: "TP1",
          adjusted_height_m: 101.235,
        }),
        expect.objectContaining({
          row_type: "level_adjust_segment_residual",
          from: "BM1",
          to: "TP1",
          from_height_m: 100,
          to_height_m: 101.235,
          observed_dh_m: expect.any(Number),
          adjusted_dh_m: expect.any(Number),
          correction_mm: expect.any(Number),
          length_km: 1,
          n_stations: 8,
          residual_mm: -1,
          weight: 1,
          residual_per_km_mm: expect.any(Number),
          standardized_residual: expect.any(Number),
        }),
        expect.objectContaining({
          row_type: "level_network_node",
          point_name: "TP1",
          adjusted_height_m: 101.235,
          mh_mm: 1,
        }),
        expect.objectContaining({
          row_type: "level_network_segment",
          from: "BM1",
          to: "TP1",
          residual_mm: -1,
        }),
      ]),
    );

    const traverse = await callTool("survey_traverse_adjust", {
      known_points: [
        { name: "S", x: 0, y: 0, fixed: true },
        { name: "E", x: 100, y: 0, fixed: true },
      ],
      observations: [{ from: "S", to: "P1", hz_angle_deg: 270, slope_dist_m: 100 }],
      params: {
        start_azimuth_deg: 0,
        end_azimuth_deg: 90,
        dir_mse_sec: 2,
        dist_fixed_mm: 1,
        ppm: 1,
        model: "normal",
      },
    });

    expect(traverse).toMatchObject({
      method: "traverse_bowditch_adjustment",
      model: "normal",
      point_count: 1,
      observation_count: 1,
      start_azimuth_deg: 0,
      end_azimuth_deg: 90,
      dir_mse_sec: 2,
      dist_fixed_mm: 1,
      ppm: 1,
      refraction: 0.14,
      ellipsoid_r: 6371000,
      height_projection: true,
      closures: {
        angle_sec: 0,
        coord_mm: 0,
        relative_closure: "∞",
      },
      precision_model: "direction_distance_error_propagation",
      unit_weight_mse_mm: 1.396,
    });
    expect(traverse.points as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "P1",
          x: 100,
          y: 0,
          point_mse: 1.396,
        }),
      ]),
    );
    expect(traverse.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "traverse_adjusted_coordinate",
          point_name: "P1",
          x: 100,
          y: 0,
        }),
        expect.objectContaining({
          row_type: "traverse_error_ellipse",
          point_name: "P1",
          center_x: 100,
          center_y: 0,
          semi_major_mm: 1.005,
          semi_minor_mm: 0.97,
        }),
        expect.objectContaining({
          row_type: "traverse_edge_precision",
          from: "S",
          to: "P1",
          horizontal_distance_m: 100,
          distance_mse_mm: 1.005,
          relative_mse_ratio: 99504,
          relative_mse: "1/99504",
          status: "合格",
        }),
        expect.objectContaining({
          row_type: "traverse_correction",
          from: "S",
          to: "P1",
          observed_hz_angle_deg: 270,
          angle_correction_sec: 0,
          adjusted_hz_angle_deg: 270,
          dx_correction_mm: 0,
          dy_correction_mm: 0,
          coordinate_correction_mm: 0,
        }),
        expect.objectContaining({
          row_type: "traverse_control_compatibility",
          start_point: "S",
          end_point: "E",
          fixed_dx_m: 100,
          fixed_dy_m: 0,
          observed_dx_m: 100,
          observed_dy_m: 0,
          fx_mm: 0,
          fy_mm: 0,
          coordinate_closure_mm: 0,
          angle_closure_sec: 0,
          status: "合格",
        }),
        expect.objectContaining({
          row_type: "traverse_adjustment_summary",
          start_azimuth_deg: 0,
          end_azimuth_deg: 90,
          dir_mse_sec: 2,
          dist_fixed_mm: 1,
          ppm: 1,
          refraction: 0.14,
          ellipsoid_r: 6371000,
          height_projection: true,
          coordinate_closure_mm: 0,
        }),
      ]),
    );
  });

  it("checks PRD leveling reciprocal height differences without blocking MCP adjustment", async () => {
    const leveling = await callTool("level_adjust", {
      known_bms: [{ name: "BM1", h: 100, fixed: true }],
      segments: [
        {
          from: "BM1",
          to: "TP1",
          dh_m: 1.234,
          length_km: 1,
          n_stations: 8,
          forward_dh_m: 1.234,
          backward_dh_m: -1.247,
        },
        {
          from: "BM1",
          to: "TP1",
          dh_m: 1.236,
          length_km: 1,
          n_stations: 8,
          forward_dh_m: 1.236,
          backward_dh_m: -1.237,
        },
      ],
      weight_mode: "length",
      order: "2nd",
      reciprocal_tolerance_mm_per_sqrt_km: 6,
    });

    expect(leveling).toMatchObject({
      method: "least_squares_level_adjustment",
      quality_status: "review",
      max_reciprocal_height_diff_mm: 13,
      reciprocal_height_diff_tolerance_mm: 6,
    });
    expect(leveling.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "level_quality_check",
          check_item: "往返高差较差",
          observed_value: 13,
          tolerance_value: 6,
          unit: "mm",
          status: "超限",
          action: "review_reciprocal_leveling",
        }),
        expect.objectContaining({
          row_type: "level_adjusted_height",
          point_name: "TP1",
          adjusted_height_m: 101.235,
        }),
      ]),
    );
  });

  it("checks PRD leveling route closure without blocking MCP adjustment", async () => {
    const leveling = await callTool("level_adjust", {
      known_bms: [
        { name: "BM1", h: 100, fixed: true },
        { name: "BM2", h: 102, fixed: true },
      ],
      segments: [
        { from: "BM1", to: "TP1", dh_m: 1, length_km: 0.5, n_stations: 4 },
        { from: "TP1", to: "BM2", dh_m: 1.007, length_km: 0.5, n_stations: 4 },
      ],
      weight_mode: "length",
      order: "2nd",
    });

    expect(leveling).toMatchObject({
      method: "least_squares_level_adjustment",
      quality_status: "review",
      max_route_closure_mm: 7,
      route_closure_tolerance_mm: 6,
    });
    expect(leveling.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "level_quality_check",
          check_item: "路线闭合差",
          observed_value: 7,
          tolerance_value: 6,
          unit: "mm",
          status: "超限",
          action: "review_level_route_closure",
        }),
        expect.objectContaining({
          row_type: "level_route_closure",
          route_id: "R1",
          from: "BM1",
          to: "BM2",
          observed_dh_m: 2.007,
          known_dh_m: 2,
          closure_mm: 7,
          tolerance_mm: 6,
          closure_ratio_pct: 116.667,
          status: "超限",
        }),
        expect.objectContaining({
          row_type: "level_adjusted_height",
          point_name: "TP1",
        }),
      ]),
    );
  });

  it("checks PRD CP2 CP3 leveling resurvey height differences without blocking MCP adjustment", async () => {
    const leveling = await callTool("level_adjust", {
      known_bms: [{ name: "BM1", h: 100, fixed: true }],
      segments: [
        {
          from: "BM1",
          to: "TP1",
          dh_m: 1.01,
          length_km: 1,
          n_stations: 8,
          baseline_dh_m: 1,
          resurvey_dh_m: 1.01,
        },
        {
          from: "BM1",
          to: "TP1",
          dh_m: 1.012,
          length_km: 1,
          n_stations: 8,
          baseline_dh_m: 1,
          resurvey_dh_m: 1.012,
        },
      ],
      weight_mode: "length",
      order: "2nd",
      resurvey_diff_tolerance_mm_per_sqrt_km: 6,
    });

    expect(leveling).toMatchObject({
      method: "least_squares_level_adjustment",
      quality_status: "review",
      max_resurvey_height_diff_mm: 12,
      resurvey_height_diff_tolerance_mm: 6,
    });
    expect(leveling.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "level_quality_check",
          check_item: "CP2/CP3复测高差之差",
          observed_value: 12,
          tolerance_value: 6,
          unit: "mm",
          status: "超限",
          action: "review_cp_level_resurvey",
        }),
        expect.objectContaining({
          row_type: "level_resurvey_segment_check",
          segment_id: "L2",
          from: "BM1",
          to: "TP1",
          baseline_dh_m: 1,
          resurvey_dh_m: 1.012,
          height_diff_mm: 12,
          tolerance_mm: 6,
          height_diff_ratio_pct: 200,
          status: "超限",
        }),
        expect.objectContaining({
          row_type: "level_adjusted_height",
          point_name: "TP1",
          adjusted_height_m: 101.011,
        }),
      ]),
    );
  });

  it("propagates traverse direction and distance precision even when closure is zero", async () => {
    const traverse = await callTool("traverse_adjust", {
      known_points: [
        { name: "S", x: 0, y: 0, fixed: true },
        { name: "E", x: 100, y: 0, fixed: true },
      ],
      observations: [{ from: "S", to: "P1", hz_angle_deg: 270, slope_dist_m: 100 }],
      params: {
        start_azimuth_deg: 0,
        end_azimuth_deg: 90,
        dir_mse_sec: 2,
        dist_fixed_mm: 1,
        ppm: 1,
        model: "normal",
      },
    });

    expect(traverse).toMatchObject({
      method: "traverse_bowditch_adjustment",
      precision_model: "direction_distance_error_propagation",
      closures: {
        coord_mm: 0,
      },
    });
    expect(traverse.unit_weight_mse_mm as number).toBeGreaterThan(1);
    const point = (traverse.points as Array<Record<string, unknown>>)[0]!;
    expect(point).toMatchObject({
      name: "P1",
      x: 100,
      y: 0,
    });
    expect(point.point_mse as number).toBeGreaterThan(1);
    const ellipse = point.ellipse as Record<string, number>;
    expect(ellipse.a).toBeGreaterThan(0);
    expect(ellipse.b).toBeGreaterThan(0);
    expect(ellipse.a).toBeGreaterThanOrEqual(ellipse.b);
    expect(traverse.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "traverse_error_ellipse",
          point_name: "P1",
          semi_major_mm: expect.any(Number),
          semi_minor_mm: expect.any(Number),
        }),
      ]),
    );
  });

  it("returns PRD least-squares diagnostics for traverse adjustment observations", async () => {
    const traverse = await callTool("traverse_adjust", {
      known_points: [
        { name: "S", x: 0, y: 0, fixed: true },
        { name: "E", x: 200, y: 0, fixed: true },
      ],
      observations: [
        { from: "S", to: "P1", hz_angle_deg: 270, slope_dist_m: 100 },
        { from: "P1", to: "P2", hz_angle_deg: 180.0002, slope_dist_m: 100.02 },
      ],
      params: {
        start_azimuth_deg: 0,
        end_azimuth_deg: 90,
        dir_mse_sec: 2,
        dist_fixed_mm: 1,
        ppm: 1,
        model: "normal",
      },
    });

    expect(traverse).toMatchObject({
      least_squares_model: "angle_distance_condition_lsq",
      least_squares_condition_count: 3,
      least_squares_observation_count: 4,
      least_squares_redundancy: 3,
    });
    expect(traverse.least_squares_unit_weight_std).toEqual(expect.any(Number));
    expect(Number(traverse.least_squares_unit_weight_std)).toBeGreaterThan(0);
    expect(Number(traverse.least_squares_max_residual_mm)).toBeGreaterThan(0);
    expect(Number(traverse.least_squares_max_angle_residual_sec)).toBeGreaterThan(0);
    expect(traverse.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "traverse_lsq_observation_residual",
          observation_id: "A1",
          observation_type: "angle",
          from: "S",
          to: "P1",
          residual_sec: expect.any(Number),
          sigma_sec: 2,
          condition_model: "angle_distance_condition_lsq",
        }),
        expect.objectContaining({
          row_type: "traverse_lsq_observation_residual",
          observation_id: "D2",
          observation_type: "distance",
          from: "P1",
          to: "P2",
          residual_mm: expect.any(Number),
          sigma_mm: expect.any(Number),
          condition_model: "angle_distance_condition_lsq",
        }),
      ]),
    );
  });

  it("returns PRD indirect least-squares coordinate Qxx results for traverse adjustment", async () => {
    const traverse = await callTool("traverse_adjust", {
      known_points: [
        { name: "S", x: 0, y: 0, fixed: true },
        { name: "E", x: 200, y: 0, fixed: true },
      ],
      observations: [
        { from: "S", to: "P1", hz_angle_deg: 270, slope_dist_m: 100 },
        { from: "P1", to: "P2", hz_angle_deg: 180.0002, slope_dist_m: 100.02 },
      ],
      params: {
        start_azimuth_deg: 0,
        end_azimuth_deg: 90,
        dir_mse_sec: 2,
        dist_fixed_mm: 1,
        ppm: 1,
        model: "normal",
      },
    });

    expect(traverse).toMatchObject({
      least_squares_coordinate_model: "distance_direction_indirect_lsq",
      least_squares_coordinate_status: "computed",
      least_squares_coordinate_unknown_count: 2,
      least_squares_coordinate_observation_count: 4,
      least_squares_coordinate_redundancy: 2,
    });
    expect(Number(traverse.least_squares_coordinate_unit_weight_std)).toBeGreaterThan(0);
    expect(Number(traverse.least_squares_coordinate_max_point_mse_mm)).toBeGreaterThan(0);

    const qxxRow = (traverse.export_rows as Array<Record<string, unknown>>).find(
      (row) => row.row_type === "traverse_lsq_adjusted_coordinate" && row.point_name === "P1",
    );
    expect(qxxRow).toMatchObject({
      row_type: "traverse_lsq_adjusted_coordinate",
      coordinate_model: "distance_direction_indirect_lsq",
      normal_equation: "N=A^T P A",
      point_name: "P1",
      coordinate_role: "unknown_adjusted",
      adjusted_x: expect.any(Number),
      adjusted_y: expect.any(Number),
      qxx_m2: expect.any(Number),
      qxy_m2: expect.any(Number),
      qyy_m2: expect.any(Number),
      mx_mm: expect.any(Number),
      my_mm: expect.any(Number),
      point_mse_mm: expect.any(Number),
      ellipse_a_mm: expect.any(Number),
      ellipse_b_mm: expect.any(Number),
    });
    expect(Number(qxxRow?.point_mse_mm)).toBeGreaterThan(0);
  });

  it("delivers PRD survey traverse coordinates from indirect least-squares adjustment", async () => {
    const traverse = await callTool("survey_traverse_adjust", {
      known_points: [
        { name: "S", x: 0, y: 0, fixed: true },
        { name: "E", x: 200, y: 0, fixed: true },
      ],
      observations: [
        { from: "S", to: "P1", hz_angle_deg: 270, slope_dist_m: 100 },
        { from: "P1", to: "P2", hz_angle_deg: 180.0002, slope_dist_m: 100.02 },
      ],
      params: {
        start_azimuth_deg: 0,
        end_azimuth_deg: 90,
        dir_mse_sec: 2,
        dist_fixed_mm: 1,
        ppm: 1,
        model: "normal",
      },
    });

    const rows = traverse.export_rows as Array<Record<string, unknown>>;
    const lsCoordinateRow = rows.find(
      (row) => row.row_type === "traverse_lsq_adjusted_coordinate" && row.point_name === "P1",
    );
    const deliveredPoint = (traverse.points as Array<Record<string, unknown>>).find(
      (point) => point.name === "P1",
    );
    const deliveredCoordinateRow = rows.find(
      (row) => row.row_type === "traverse_adjusted_coordinate" && row.point_name === "P1",
    );

    expect(traverse).toMatchObject({
      method: "least_squares_traverse_adjustment",
      coordinate_solution: "distance_direction_indirect_lsq",
      least_squares_coordinate_status: "computed",
    });
    expect(lsCoordinateRow).toBeTruthy();
    expect(deliveredPoint).toMatchObject({
      x: lsCoordinateRow?.adjusted_x,
      y: lsCoordinateRow?.adjusted_y,
      point_mse: lsCoordinateRow?.point_mse_mm,
    });
    expect(deliveredCoordinateRow).toMatchObject({
      x: lsCoordinateRow?.adjusted_x,
      y: lsCoordinateRow?.adjusted_y,
      point_mse_mm: lsCoordinateRow?.point_mse_mm,
    });
  });

  it("returns large-network PRD least-squares coordinate rows without deferring Qxx", async () => {
    const traverse = await callTool("traverse_adjust", {
      known_points: [
        { name: "P0", x: 0, y: 0, fixed: true },
        { name: "P240", x: 0, y: 0, fixed: true },
      ],
      observations: Array.from({ length: 240 }, (_, index) => ({
        from: `P${index}`,
        to: `P${index + 1}`,
        hz_angle_deg: 0,
        horizontal_dist_m: 10,
      })),
      params: {
        start_azimuth_deg: 0,
        end_azimuth_deg: 0,
        dir_mse_sec: 2,
        dist_fixed_mm: 1,
        ppm: 1,
        model: "normal",
      },
    });

    expect(traverse).toMatchObject({
      least_squares_coordinate_model: "distance_direction_indirect_lsq",
      least_squares_coordinate_status: "computed",
      least_squares_coordinate_unknown_count: 478,
    });
    expect(traverse.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "traverse_lsq_adjusted_coordinate",
          point_name: "P120",
          coordinate_model: "distance_direction_indirect_lsq",
          qxx_m2: expect.any(Number),
          point_mse_mm: expect.any(Number),
        }),
      ]),
    );
  });

  it("checks PRD traverse 2C round and reciprocal distance differences without blocking MCP adjustment", async () => {
    const traverse = await callTool("traverse_adjust", {
      known_points: [
        { name: "S", x: 0, y: 0, fixed: true },
        { name: "E", x: 100, y: 0, fixed: true },
      ],
      observations: [
        {
          from: "S",
          to: "P1",
          hz_angle_deg: 270,
          slope_dist_m: 100,
          face_left_hz_deg: 10,
          face_right_hz_deg: 190.01,
          round_angles_deg: [270, 270.001],
          forward_dist_m: 100,
          backward_dist_m: 100.012,
        },
      ],
      params: {
        start_azimuth_deg: 0,
        end_azimuth_deg: 90,
        dir_mse_sec: 2,
        dist_fixed_mm: 1,
        ppm: 1,
        model: "normal",
        two_c_face_tolerance_sec: 20,
        round_diff_tolerance_sec: 12,
        distance_reciprocal_tolerance_mm: 5,
      },
    });

    expect(traverse).toMatchObject({
      method: "traverse_bowditch_adjustment",
      quality_status: "review",
      max_two_c_sec: 36,
      max_round_diff_sec: 3.6,
      max_reciprocal_distance_diff_mm: 12,
    });
    expect(traverse.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "traverse_quality_check",
          check_item: "2C差",
          observed_value: 36,
          tolerance_value: 20,
          status: "超限",
        }),
        expect.objectContaining({
          row_type: "traverse_quality_check",
          check_item: "测回差",
          observed_value: 3.6,
          status: "合格",
        }),
        expect.objectContaining({
          row_type: "traverse_quality_check",
          check_item: "测距往返差",
          observed_value: 12,
          tolerance_value: 5,
          status: "超限",
        }),
        expect.objectContaining({
          row_type: "traverse_adjusted_coordinate",
          point_name: "P1",
          x: 100,
          y: 0,
        }),
      ]),
    );
  });

  it("returns auditable summaries and export rows for survey calculator checks", async () => {
    const levelingClosure = await callTool("calculator_leveling_closure", {
      measuredError: 6,
      routeLengthKm: 4,
      order: "2nd",
    });
    expect(levelingClosure).toMatchObject({
      measured_error_mm: 6,
      allowed_limit_mm: 12,
      ratio_pct: 50,
      is_passed: true,
      closure_summary: {
        check_type: "leveling_closure",
        order: "2nd",
        measured_error_mm: 6,
        allowed_limit_mm: 12,
        ratio_pct: 50,
        quality_status: "pass",
      },
    });
    expect((levelingClosure.export_rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      row_type: "calculator_leveling_closure",
      measured_error_mm: 6,
      allowed_limit_mm: 12,
      is_passed: true,
    });

    const traverseClosure = await callTool("calculator_traverse_closure", {
      measuredAngularError: 12,
      stationCount: 4,
      instrument: "DJ2",
    });
    expect(traverseClosure).toMatchObject({
      measured_error_arcsec: 12,
      allowed_limit_arcsec: 20,
      is_passed: true,
      closure_summary: {
        check_type: "traverse_angular_closure",
        instrument: "DJ2",
        station_count: 4,
        measured_error_arcsec: 12,
        allowed_limit_arcsec: 20,
        ratio_pct: 60,
        quality_status: "pass",
      },
    });
    expect((traverseClosure.export_rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      row_type: "calculator_traverse_closure",
      instrument: "DJ2",
      measured_error_arcsec: 12,
      allowed_limit_arcsec: 20,
      is_passed: true,
    });

    const alertLevel = await callTool("calculator_alert_level", {
      cumulativeValue: 17,
      alertThreshold: 20,
      pointId: "JC-01",
    });
    expect(alertLevel).toMatchObject({
      point_id: "JC-01",
      cumulative_value_mm: 17,
      alert_threshold_mm: 20,
      ratio_pct: 85,
      level: "橙色预警",
      alert_level_code: "orange",
      alert_summary: {
        point_id: "JC-01",
        ratio_pct: 85,
        level: "橙色预警",
        alert_level_code: "orange",
        recommended_action: "通知项目负责人和监理，加密监测频率至每日2次，加强人工巡视",
      },
    });
    expect((alertLevel.export_rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      row_type: "calculator_alert_level",
      point_id: "JC-01",
      ratio_pct: 85,
      alert_level_code: "orange",
    });

    const levelingAdjustment = await callTool("calculator_leveling_adjustment", {
      benchmarks: [{ id: "BM1", height: 100 }],
      observations: [
        { from: "BM1", to: "P1", heightDiff: 1.234, routeLength: 1 },
        { from: "BM1", to: "P1", heightDiff: 1.236, routeLength: 1 },
      ],
      order: "2nd",
    });
    const expectedLevelingUnitWeightRmseMm = Number(Math.SQRT2.toFixed(3));
    expect(levelingAdjustment).toMatchObject({
      method: "最小二乘法严密平差",
      known_points: 1,
      unknown_points: 1,
      observations: 2,
      redundancy: 1,
      unit_weight_rmse_mm: expectedLevelingUnitWeightRmseMm,
      max_point_rmse_mm: 1,
      leveling_adjustment_summary: {
        method: "least_squares_leveling_adjustment",
        known_point_count: 1,
        unknown_point_count: 1,
        observation_count: 2,
        redundancy: 1,
        unit_weight_rmse_mm: expectedLevelingUnitWeightRmseMm,
        max_point_rmse_mm: 1,
        quality_status: "pass",
      },
    });
    expect(levelingAdjustment.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "leveling_adjusted_height",
          point_id: "P1",
          adjusted_height_m: 101.235,
          correction_mm: 101_235,
          rmse_mm: 1,
        }),
        expect.objectContaining({
          row_type: "leveling_observation_residual",
          from: "BM1",
          to: "P1",
          observed_mm: 1234,
          residual_mm: 1,
        }),
      ]),
    );

    const levelingAdjustmentCsv = await callTool("calculator_leveling_adjustment", {
      csvText: [
        "类型,点号,高程,起点,终点,高差(m),测段距离(km),等级",
        "已知,BM1,100,,,,,2nd",
        "观测,L1,,BM1,P1,1.234,1,",
        "观测,L2,,BM1,P1,1.236,1,",
      ].join("\n"),
    });
    expect(levelingAdjustmentCsv).toMatchObject({
      method: "最小二乘法严密平差",
      input_format: "csv",
      parsed_row_count: 3,
      known_points: 1,
      unknown_points: 1,
      observations: 2,
      redundancy: 1,
      unit_weight_rmse_mm: expectedLevelingUnitWeightRmseMm,
      max_point_rmse_mm: 1,
      leveling_adjustment_summary: {
        method: "least_squares_leveling_adjustment",
        order: "2nd",
        known_point_count: 1,
        unknown_point_count: 1,
        observation_count: 2,
        redundancy: 1,
        unit_weight_rmse_mm: expectedLevelingUnitWeightRmseMm,
        max_point_rmse_mm: 1,
        quality_status: "pass",
      },
    });
    expect(levelingAdjustmentCsv.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "leveling_adjusted_height",
          point_id: "P1",
          adjusted_height_m: 101.235,
          rmse_mm: 1,
        }),
        expect.objectContaining({
          row_type: "leveling_observation_residual",
          from: "BM1",
          to: "P1",
          residual_mm: 1,
        }),
      ]),
    );

    const levelingNegativeCsv = await callTool("calculator_leveling_adjustment", {
      csvText: [
        "类型,点号,高程,起点,终点,高差(m),测段距离(km),等级",
        "已知,BM1,100,,,,,2nd",
        "观测,L1,,BM1,P1,－1.234,1,",
        "观测,L2,,BM1,P1,−1.236,1,",
      ].join("\n"),
    });
    expect(levelingNegativeCsv).toMatchObject({
      input_format: "csv",
      parsed_row_count: 3,
      known_points: 1,
      unknown_points: 1,
      observations: 2,
      max_point_rmse_mm: 1,
    });
    expect(levelingNegativeCsv.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "leveling_adjusted_height",
          point_id: "P1",
          adjusted_height_m: 98.765,
          rmse_mm: 1,
        }),
        expect.objectContaining({
          row_type: "leveling_observation_residual",
          from: "BM1",
          to: "P1",
          observed_mm: -1234,
          residual_mm: -1,
        }),
      ]),
    );

    const traverseAdjustment = await callTool("calculator_traverse_adjustment", {
      startPoint: { id: "S", x: 0, y: 0 },
      endPoint: { id: "E", x: 100, y: 0 },
      startAzimuth: 0,
      endAzimuth: 90,
      instrument: "DJ2",
      stations: [{ id: "P1", angle: 270, distance: 100 }],
    });
    expect(traverseAdjustment).toMatchObject({
      method: "附合导线简易平差（角度等权分配，坐标按边长比例分配）",
      station_count: 1,
      total_distance_m: 100,
      point_rmse_mm: 0,
      traverse_adjustment_summary: {
        method: "traverse_bowditch_adjustment",
        station_count: 1,
        total_distance_m: 100,
        angular_closure_arcsec: 0,
        angular_limit_arcsec: 10,
        coordinate_closure_distance_m: 0,
        point_rmse_mm: 0,
        quality_status: "pass",
      },
    });
    expect(traverseAdjustment.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "traverse_adjusted_coordinate",
          point_id: "P1",
          x: 100,
          y: 0,
        }),
        expect.objectContaining({
          row_type: "traverse_adjusted_azimuth",
          from: "S",
          to: "P1",
          azimuth_degrees: 90,
        }),
      ]),
    );

    const traverseAdjustmentCsv = await callTool("calculator_traverse_adjustment", {
      csvText: [
        "类型,点号,东坐标,北坐标,起始方位角,终止方位角,观测角,边长,仪器",
        "起点,S,0,0,0,,,,DJ2",
        "终点,E,100,0,,90,,,",
        "测站,P1,,,,,270,100,",
      ].join("\n"),
    });
    expect(traverseAdjustmentCsv).toMatchObject({
      method: "附合导线简易平差（角度等权分配，坐标按边长比例分配）",
      input_format: "csv",
      parsed_row_count: 3,
      station_count: 1,
      total_distance_m: 100,
      point_rmse_mm: 0,
      traverse_adjustment_summary: {
        method: "traverse_bowditch_adjustment",
        instrument: "DJ2",
        station_count: 1,
        total_distance_m: 100,
        angular_closure_arcsec: 0,
        angular_limit_arcsec: 10,
        coordinate_closure_distance_m: 0,
        point_rmse_mm: 0,
        quality_status: "pass",
      },
    });
    expect(traverseAdjustmentCsv.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "traverse_adjusted_coordinate",
          point_id: "P1",
          x: 100,
          y: 0,
        }),
        expect.objectContaining({
          row_type: "traverse_adjusted_azimuth",
          from: "S",
          to: "P1",
          azimuth_degrees: 90,
        }),
      ]),
    );
  });

  it("runs representative engineering calculations with structured numeric results", async () => {
    const distance = await callTool("distance_calculator", {
      from: { x: 0, y: 0, z: 10 },
      to: { x: 3, y: 4, z: 14 },
    });
    expect(distance.horizontal_distance_m).toBe(5);
    expect(distance.slope_distance_m).toBeCloseTo(6.4031, 4);
    expect(distance).toMatchObject({
      delta_x_m: 3,
      delta_y_m: 4,
      elevation_difference_m: 4,
      azimuth_degrees: 36.869898,
      back_azimuth_degrees: 216.869898,
      grade_percent: 80,
      vertical_angle_degrees: 38.659808,
      midpoint: { x: 1.5, y: 2, z: 12 },
      survey_distance_summary: {
        horizontal_distance_m: 5,
        slope_distance_m: 6.4031,
        azimuth_degrees: 36.869898,
        back_azimuth_degrees: 216.869898,
        grade_percent: 80,
      },
    });
    expect((distance.export_rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      row_type: "survey_distance_result",
      delta_x_m: 3,
      delta_y_m: 4,
      horizontal_distance_m: 5,
      azimuth_degrees: 36.869898,
      back_azimuth_degrees: 216.869898,
    });

    const distanceBatch = await callTool("distance_calculator", {
      csvText: [
        "边号,起点X,起点Y,起点高程,终点X,终点Y,终点高程,实测平距(m),距离限差(mm)",
        "S1,0,0,10,3,4,14,5.002,5",
        "S2,10,10,0,13,14,0,5.010,5",
      ].join("\n"),
    });
    expect(distanceBatch).toMatchObject({
      mode: "distance_batch_csv",
      input_format: "csv",
      parsed_row_count: 2,
      segment_count: 2,
      failed_count: 1,
      failed_segments: ["S2"],
      total_horizontal_distance_m: 10,
      max_abs_distance_residual_mm: 10,
      quality_status: "alert",
      survey_distance_summary: {
        segment_count: 2,
        failed_count: 1,
        total_horizontal_distance_m: 10,
        max_abs_distance_residual_mm: 10,
        quality_status: "alert",
      },
    });
    expect(distanceBatch.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "survey_distance_segment",
        segment_id: "S1",
        from_x_m: 0,
        from_y_m: 0,
        from_z_m: 10,
        to_x_m: 3,
        to_y_m: 4,
        to_z_m: 14,
        delta_x_m: 3,
        delta_y_m: 4,
        elevation_difference_m: 4,
        horizontal_distance_m: 5,
        slope_distance_m: 6.4031,
        azimuth_degrees: 36.869898,
        back_azimuth_degrees: 216.869898,
        grade_percent: 80,
        vertical_angle_degrees: 38.659808,
        observed_horizontal_distance_m: 5.002,
        distance_residual_mm: 2,
        distance_tolerance_mm: 5,
        is_passed: true,
      },
      {
        row_type: "survey_distance_segment",
        segment_id: "S2",
        from_x_m: 10,
        from_y_m: 10,
        from_z_m: 0,
        to_x_m: 13,
        to_y_m: 14,
        to_z_m: 0,
        delta_x_m: 3,
        delta_y_m: 4,
        elevation_difference_m: 0,
        horizontal_distance_m: 5,
        slope_distance_m: 5,
        azimuth_degrees: 36.869898,
        back_azimuth_degrees: 216.869898,
        grade_percent: 0,
        vertical_angle_degrees: 0,
        observed_horizontal_distance_m: 5.01,
        distance_residual_mm: 10,
        distance_tolerance_mm: 5,
        is_passed: false,
      },
    ]);

    const angle = await callTool("angle_convert", {
      value: "123°27′24″",
      from: "dms",
      to: "decimal",
    });
    expect(angle.decimal_degrees).toBeCloseTo(123.4567, 4);
    expect(angle).toMatchObject({
      normalized_degrees_0_360: 123.4566666667,
      normalized_degrees_minus180_180: 123.4566666667,
      total_arcseconds: 444_444,
      dms_parts: {
        sign: 1,
        degrees: 123,
        minutes: 27,
        seconds: 24,
      },
      conversion_summary: {
        from: "dms",
        to: "decimal",
        converted: 123.4566666667,
      },
    });
    expect((angle.export_rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      row_type: "survey_angle_conversion",
      input: "123°27′24″",
      decimal_degrees: 123.4566666667,
      dms: "123°27′24″",
      converted: 123.4566666667,
    });

    const negativeUnicodeAngle = await callTool("angle_convert", {
      value: "−12°30′00″",
      from: "dms",
      to: "decimal",
    });
    expect(negativeUnicodeAngle).toMatchObject({
      decimal_degrees: -12.5,
      normalized_degrees_0_360: 347.5,
      normalized_degrees_minus180_180: -12.5,
      dms: "-12°30′0″",
      dms_parts: {
        sign: -1,
        degrees: 12,
        minutes: 30,
        seconds: 0,
      },
      conversion_summary: {
        from: "dms",
        to: "decimal",
        converted: -12.5,
      },
    });
    expect((negativeUnicodeAngle.export_rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      row_type: "survey_angle_conversion",
      input: "−12°30′00″",
      decimal_degrees: -12.5,
      dms: "-12°30′0″",
      converted: -12.5,
    });

    const angleBatch = await callTool("angle_convert", {
      csvText: [
        "角度编号,方向组,角度值,输入格式,设计角,限差(″)",
        "A1,R1,123°27′24″,dms,123°27′25″,2",
        "A2,R1,90-00-03,dms,90°00′00″,2",
      ].join("\n"),
    });
    expect(angleBatch).toMatchObject({
      mode: "angle_batch_csv",
      input_format: "csv",
      parsed_row_count: 2,
      angle_count: 2,
      group_count: 1,
      failed_count: 1,
      failed_angles: ["A2"],
      max_abs_residual_arcsec: 3,
      quality_status: "alert",
      angle_conversion_summary: {
        angle_count: 2,
        group_count: 1,
        failed_count: 1,
        max_abs_residual_arcsec: 3,
        quality_status: "alert",
      },
    });
    expect(angleBatch.group_summaries as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "angle_group_summary",
        group_id: "R1",
        angle_count: 2,
        failed_count: 1,
        mean_angle_degrees: 106.72875,
        max_abs_residual_arcsec: 3,
        quality_status: "alert",
      },
    ]);
    expect(angleBatch.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "angle_conversion_result",
          angle_id: "A1",
          group_id: "R1",
          decimal_degrees: 123.4566666667,
          dms: "123°27′24″",
          target_degrees: 123.4569444444,
          residual_arcsec: -1,
          tolerance_arcsec: 2,
          is_passed: true,
        }),
        expect.objectContaining({
          row_type: "angle_conversion_result",
          angle_id: "A2",
          residual_arcsec: 3,
          is_passed: false,
        }),
        expect.objectContaining({ row_type: "angle_group_summary", group_id: "R1" }),
      ]),
    );

    const coord = await callTool("coord_transform", {
      mode: "helmert2d",
      x: 10,
      y: 20,
      dx: 1000,
      dy: 2000,
      rotationArcsec: 0,
      scalePpm: 0,
    });
    expect(coord.target_x).toBe(1010);
    expect(coord.target_y).toBe(2020);

    const estimatedCoord = await callTool("coord_transform", {
      mode: "helmert2d",
      controlPoints: [
        { id: "K1", sourceX: 0, sourceY: 0, targetX: 1000, targetY: 2000 },
        { id: "K2", sourceX: 100, sourceY: 0, targetX: 1100, targetY: 2000 },
        { id: "K3", sourceX: 0, sourceY: 100, targetX: 1000, targetY: 2100 },
      ],
      points: [{ id: "P1", x: 10, y: 20 }],
    });
    expect(estimatedCoord).toMatchObject({
      mode: "helmert2d_estimated",
      control_point_count: 3,
      dx: 1000,
      dy: 2000,
      rotation_arcsec: 0,
      scale_ppm: 0,
      rmse_mm: 0,
    });
    expect((estimatedCoord.transformed_points as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: "P1",
      source_x: 10,
      source_y: 20,
      target_x: 1010,
      target_y: 2020,
    });

    const coordCsv = await callTool("coord_transform", {
      csvText: [
        "类型,点号,源X(m),源Y(m),目标X(m),目标Y(m)",
        "公共点,K1,0,0,1000,2000",
        "公共点,K2,100,0,1100,2000",
        "公共点,K3,0,100,1000,2100",
        "待转换点,P1,10,20,,",
        "待转换点,P2,-5,30,,",
      ].join("\n"),
    });
    expect(coordCsv).toMatchObject({
      mode: "helmert2d_estimated",
      input_format: "csv",
      parsed_control_point_count: 3,
      parsed_transform_point_count: 2,
      control_point_count: 3,
      dx: 1000,
      dy: 2000,
      rmse_mm: 0,
      transformation_summary: {
        control_point_count: 3,
        transformed_point_count: 2,
        rmse_mm: 0,
        max_control_residual_mm: 0,
        quality_status: "fit_exact",
      },
      result_bounds: {
        min_target_x: 995,
        max_target_x: 1010,
        min_target_y: 2020,
        max_target_y: 2030,
      },
    });
    expect(coordCsv.transformed_points as Array<Record<string, unknown>>).toEqual([
      { id: "P1", source_x: 10, source_y: 20, target_x: 1010, target_y: 2020 },
      { id: "P2", source_x: -5, source_y: 30, target_x: 995, target_y: 2030 },
    ]);
    expect(coordCsv.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "coord_transformed_point",
        point_id: "P1",
        source_x_m: 10,
        source_y_m: 20,
        target_x_m: 1010,
        target_y_m: 2020,
        delta_x_m: 1000,
        delta_y_m: 2000,
      },
      {
        row_type: "coord_transformed_point",
        point_id: "P2",
        source_x_m: -5,
        source_y_m: 30,
        target_x_m: 995,
        target_y_m: 2030,
        delta_x_m: 1000,
        delta_y_m: 2000,
      },
    ]);

    const coordKnownBatch = await callTool("coord_transform", {
      mode: "helmert2d",
      dx: 1000,
      dy: 2000,
      rotationArcsec: 0,
      scalePpm: 0,
      points: [
        { id: "P1", x: 10, y: 20 },
        { id: "P2", x: -5, y: 30 },
      ],
    });
    expect(coordKnownBatch).toMatchObject({
      mode: "helmert2d_known_batch",
      input_format: "json",
      transformed_point_count: 2,
      dx: 1000,
      dy: 2000,
      rotation_arcsec: 0,
      scale_ppm: 0,
      transformation_summary: {
        method: "known_helmert2d_parameters",
        transformed_point_count: 2,
        quality_status: "computed",
      },
      result_bounds: {
        min_target_x: 995,
        max_target_x: 1010,
        min_target_y: 2020,
        max_target_y: 2030,
      },
    });
    expect(coordKnownBatch.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "coord_transformed_point",
        point_id: "P1",
        source_x_m: 10,
        source_y_m: 20,
        target_x_m: 1010,
        target_y_m: 2020,
        delta_x_m: 1000,
        delta_y_m: 2000,
      },
      {
        row_type: "coord_transformed_point",
        point_id: "P2",
        source_x_m: -5,
        source_y_m: 30,
        target_x_m: 995,
        target_y_m: 2030,
        delta_x_m: 1000,
        delta_y_m: 2000,
      },
    ]);

    const coordKnownCsvBatch = await callTool("coord_transform", {
      csvText: ["类型,点号,源X(m),源Y(m)", "待转换点,P1,10,20", "待转换点,P2,-5,30"].join("\n"),
      dx: 1000,
      dy: 2000,
    });
    expect(coordKnownCsvBatch).toMatchObject({
      mode: "helmert2d_known_batch",
      input_format: "csv",
      parsed_control_point_count: 0,
      parsed_transform_point_count: 2,
      transformed_point_count: 2,
    });
    expect(
      (coordKnownCsvBatch.transformed_points as Array<Record<string, unknown>>)[1],
    ).toMatchObject({
      id: "P2",
      source_x: -5,
      source_y: 30,
      target_x: 995,
      target_y: 2030,
    });

    const axial = await callTool("axial_force", {
      gaugeFactor: 1,
      elasticModulusMpa: 200000,
      areaMm2: 1000,
      readings: [
        { id: "ZL-1", initialMicrostrain: 100, currentMicrostrain: 150 },
        { id: "ZL-2", initialMicrostrain: 80, currentMicrostrain: 70 },
      ],
      designForceKn: 20000,
    });
    expect(axial.max_abs_force_kn).toBeCloseTo(10, 3);
    expect(axial.axial_force_reading_summary).toMatchObject({
      reading_count: 2,
      alert_count: 0,
      max_abs_force_kn: 10,
      max_point_id: "ZL-1",
      design_force_kn: 20000,
      quality_status: "pass",
      worst_point: {
        point_id: "ZL-1",
        force_kn: 10,
        ratio_pct: 0.05,
        is_alert: false,
      },
    });
    expect(axial.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "axial_force_reading_result",
        point_id: "ZL-1",
        delta_microstrain: 50,
        stress_mpa: 10,
        force_kn: 10,
        ratio_pct: 0.05,
        status: "pass",
        is_alert: false,
      },
      {
        row_type: "axial_force_reading_result",
        point_id: "ZL-2",
        delta_microstrain: -10,
        stress_mpa: -2,
        force_kn: -2,
        ratio_pct: 0.01,
        status: "pass",
        is_alert: false,
      },
    ]);

    const axialTrend = await callTool("axial_force", {
      alertThresholdKn: 150,
      rateThresholdKnPerDay: 20,
      observations: [
        { sensorId: "ZL-1", date: "2026-06-01", forceKn: 0 },
        { sensorId: "ZL-1", date: "2026-06-04", forceKn: 80 },
        { sensorId: "ZL-1", date: "2026-06-07", forceKn: 170 },
        { sensorId: "ZL-2", date: "2026-06-01", forceKn: 0 },
        { sensorId: "ZL-2", date: "2026-06-07", forceKn: 30 },
      ],
    });
    expect(axialTrend).toMatchObject({
      mode: "observation_series",
      sensor_count: 2,
      observation_count: 5,
      max_abs_force_kn: 170,
      max_abs_rate_kn_per_day: 30,
      alert_sensors: ["ZL-1"],
    });
    expect((axialTrend.sensor_summaries as Array<Record<string, unknown>>)[0]).toMatchObject({
      sensor_id: "ZL-1",
      force_kn: 170,
      current_force_change_kn: 90,
      current_rate_kn_per_day: 30,
      is_alert: true,
    });

    const axialCsv = await callTool("axial_force", {
      csvText: [
        "测点编号,观测日期,轴力(kN),轴力预警值(kN),速率预警值(kN/d)",
        "ZL-1,2026-06-01,0,150,20",
        "ZL-1,2026-06-04,80,150,20",
        "ZL-1,2026-06-07,170,150,20",
        "ZL-2,2026-06-01,0,150,20",
        "ZL-2,2026-06-07,30,150,20",
      ].join("\n"),
    });
    expect(axialCsv).toMatchObject({
      mode: "observation_series",
      input_format: "csv",
      table_format: "long",
      parsed_row_count: 5,
      parsed_observation_count: 5,
      sensor_count: 2,
      observation_count: 5,
      max_abs_force_kn: 170,
      max_abs_rate_kn_per_day: 30,
      alert_threshold_kn: 150,
      rate_threshold_kn_per_day: 20,
      alert_sensors: ["ZL-1"],
    });
    expect((axialCsv.sensor_summaries as Array<Record<string, unknown>>)[0]).toMatchObject({
      sensor_id: "ZL-1",
      force_kn: 170,
      current_force_change_kn: 90,
      current_rate_kn_per_day: 30,
      is_alert: true,
    });

    const axialWideCsv = await callTool("axial_force", {
      csvText: [
        "观测日期,ZL-1(kN),ZL-2(kN),轴力预警值(kN),速率预警值(kN/d)",
        "2026-06-01,0,0,150,20",
        "2026-06-04,80,10,150,20",
        "2026-06-07,170,30,150,20",
      ].join("\n"),
    });
    expect(axialWideCsv).toMatchObject({
      mode: "observation_series",
      input_format: "csv",
      table_format: "wide",
      parsed_row_count: 3,
      parsed_observation_count: 6,
      sensor_count: 2,
      observation_count: 6,
      max_abs_force_kn: 170,
      max_abs_rate_kn_per_day: 30,
      alert_threshold_kn: 150,
      rate_threshold_kn_per_day: 20,
      alert_sensors: ["ZL-1"],
    });
    expect((axialWideCsv.sensor_summaries as Array<Record<string, unknown>>)[0]).toMatchObject({
      sensor_id: "ZL-1",
      force_kn: 170,
      current_force_change_kn: 90,
      current_rate_kn_per_day: 30,
      is_alert: true,
    });
    expect(axialWideCsv.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "axial_force_sensor_summary",
          sensor_id: "ZL-1",
          status: "alert",
        }),
        expect.objectContaining({
          row_type: "axial_force_period_observation",
          sensor_id: "ZL-2",
          date: "2026-06-07",
          force_kn: 30,
          stage_rate_kn_per_day: 6.667,
        }),
      ]),
    );

    const water = await callTool("water_level", {
      points: [
        { id: "SLS-1", initialElevation: 5, currentElevation: 4.996 },
        { id: "SLS-2", initialElevation: 5, currentElevation: 5.002 },
      ],
      alertThresholdMm: 5,
    });
    expect(water.max_change_mm).toBe(4);

    expect(water.water_level_point_summary).toMatchObject({
      point_count: 2,
      alert_count: 0,
      max_abs_change_mm: 4,
      alert_threshold_mm: 5,
      quality_status: "pass",
      worst_point: {
        point_id: "SLS-1",
        change_mm: -4,
        abs_change_mm: 4,
        is_alert: false,
      },
    });
    expect(water.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "water_level_point_change",
        point_id: "SLS-1",
        change_mm: -4,
        abs_change_mm: 4,
        alert_threshold_mm: 5,
        status: "pass",
        is_alert: false,
      },
      {
        row_type: "water_level_point_change",
        point_id: "SLS-2",
        change_mm: 2,
        abs_change_mm: 2,
        alert_threshold_mm: 5,
        status: "pass",
        is_alert: false,
      },
    ]);

    const waterTrend = await callTool("water_level", {
      alertThresholdMm: 500,
      rateThresholdMmPerDay: 100,
      observations: [
        { wellId: "W-1", date: "2026-06-01", elevation: 8 },
        { wellId: "W-1", date: "2026-06-04", elevation: 7.65 },
        { wellId: "W-1", date: "2026-06-07", elevation: 7.25 },
        { wellId: "W-2", date: "2026-06-01", elevation: 6.2 },
        { wellId: "W-2", date: "2026-06-07", elevation: 6.17 },
      ],
    });
    expect(waterTrend).toMatchObject({
      mode: "observation_series",
      well_count: 2,
      observation_count: 5,
      max_abs_change_mm: 750,
      max_abs_rate_mm_per_day: 133.333,
      alert_wells: ["W-1"],
    });
    expect((waterTrend.well_summaries as Array<Record<string, unknown>>)[0]).toMatchObject({
      well_id: "W-1",
      change_mm: -750,
      current_change_mm: -400,
      current_rate_mm_per_day: -133.333,
      is_alert: true,
    });

    const waterCsv = await callTool("water_level", {
      csvText: [
        "井号,观测日期,地下水位(m),累计预警值(mm),速率预警值(mm/d)",
        "W-1,2026-06-01,8,500,100",
        "W-1,2026-06-04,7.65,500,100",
        "W-1,2026-06-07,7.25,500,100",
        "W-2,2026-06-01,6.2,500,100",
        "W-2,2026-06-07,6.17,500,100",
      ].join("\n"),
    });
    expect(waterCsv).toMatchObject({
      mode: "observation_series",
      input_format: "csv",
      table_format: "long",
      parsed_row_count: 5,
      parsed_observation_count: 5,
      well_count: 2,
      observation_count: 5,
      max_abs_change_mm: 750,
      max_abs_rate_mm_per_day: 133.333,
      alert_threshold_mm: 500,
      rate_threshold_mm_per_day: 100,
      alert_wells: ["W-1"],
    });
    expect((waterCsv.well_summaries as Array<Record<string, unknown>>)[0]).toMatchObject({
      well_id: "W-1",
      change_mm: -750,
      current_change_mm: -400,
      current_rate_mm_per_day: -133.333,
      is_alert: true,
    });

    const waterWideCsv = await callTool("water_level", {
      csvText: [
        "观测日期,W-1(m),W-2(m),累计预警值(mm),速率预警值(mm/d)",
        "2026-06-01,8,6.2,500,100",
        "2026-06-04,7.65,6.19,500,100",
        "2026-06-07,7.25,6.17,500,100",
      ].join("\n"),
    });
    expect(waterWideCsv).toMatchObject({
      mode: "observation_series",
      input_format: "csv",
      table_format: "wide",
      parsed_row_count: 3,
      parsed_observation_count: 6,
      well_count: 2,
      observation_count: 6,
      max_abs_change_mm: 750,
      max_abs_rate_mm_per_day: 133.333,
      alert_threshold_mm: 500,
      rate_threshold_mm_per_day: 100,
      alert_wells: ["W-1"],
    });
    expect((waterWideCsv.well_summaries as Array<Record<string, unknown>>)[0]).toMatchObject({
      well_id: "W-1",
      change_mm: -750,
      current_change_mm: -400,
      current_rate_mm_per_day: -133.333,
      is_alert: true,
    });
    expect(waterWideCsv.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "water_level_well_summary",
          well_id: "W-1",
          status: "alert",
        }),
        expect.objectContaining({
          row_type: "water_level_period_observation",
          well_id: "W-2",
          date: "2026-06-07",
          elevation_m: 6.17,
          stage_rate_mm_per_day: -6.667,
        }),
      ]),
    );

    const deformation = await callTool("deformation_rate", {
      pointId: "JC-ORDER",
      data: [
        { date: "2026-06-07", value: 9 },
        { date: "2026-06-01", value: 0 },
        { date: "2026-06-04", value: 3 },
      ],
      alertThreshold: 20,
      rateThreshold: 1.5,
      predictionDays: 2,
    });
    expect(deformation).toMatchObject({
      point_id: "JC-ORDER",
      data_count: 3,
      monitoring_duration_days: 6,
      latest_value_mm: 9,
      latest_rate_mm_per_day: 2,
      deformation_summary: {
        point_id: "JC-ORDER",
        data_count: 3,
        monitoring_duration_days: 6,
        latest_value_mm: 9,
        total_deformation_mm: 9,
        average_rate_mm_per_day: 1.5,
        latest_rate_mm_per_day: 2,
        regression_slope_mm_per_day: 1.5,
        regression_r_squared: 0.9643,
        alert_level: "🟢 正常",
        rate_status: "alert",
      },
    });
    expect((deformation.rates as Array<Record<string, unknown>>).map((row) => row.period)).toEqual([
      "2026-06-01 → 2026-06-04",
      "2026-06-04 → 2026-06-07",
    ]);
    expect(String(deformation.rate_alert)).toContain("超过限值");
    expect(deformation.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "deformation_observation",
          point_id: "JC-ORDER",
          date: "2026-06-07",
          value_mm: 9,
        }),
        expect.objectContaining({
          row_type: "deformation_period_rate",
          point_id: "JC-ORDER",
          period: "2026-06-04 → 2026-06-07",
          increment_mm: 6,
          rate_mm_per_day: 2,
        }),
        expect.objectContaining({
          row_type: "deformation_prediction",
          point_id: "JC-ORDER",
          date: "2026-06-08",
          predicted_mm: 10,
        }),
      ]),
    );

    const deformationCsv = await callTool("deformation_rate", {
      csvText: [
        "测点编号,观测日期,累计沉降(mm),累计预警值(mm),速率预警值(mm/d)",
        "JC-1,2026-06-01,0,8,1.5",
        "JC-1,2026-06-04,3,8,1.5",
        "JC-1,2026-06-07,9,8,1.5",
        "JC-2,2026-06-01,0,8,1.5",
        "JC-2,2026-06-04,1,8,1.5",
        "JC-2,2026-06-07,1.2,8,1.5",
      ].join("\n"),
      predictionDays: 2,
    });
    expect(deformationCsv).toMatchObject({
      mode: "multi_point_csv",
      input_format: "csv",
      table_format: "long",
      parsed_row_count: 6,
      parsed_observation_count: 6,
      point_count: 2,
      alert_points: ["JC-1"],
      max_abs_latest_value_mm: 9,
      max_abs_latest_rate_mm_per_day: 2,
      deformation_summary: {
        mode: "multi_point_csv",
        point_count: 2,
        alert_count: 1,
        worst_point_id: "JC-1",
        max_abs_latest_value_mm: 9,
        max_abs_latest_rate_mm_per_day: 2,
      },
    });
    const deformationCsvRows = deformationCsv.point_results as Array<Record<string, unknown>>;
    expect(deformationCsvRows[0]).toMatchObject({
      point_id: "JC-1",
      latest_value_mm: 9,
      latest_rate_mm_per_day: 2,
    });
    expect(String(deformationCsvRows[0]?.rate_alert)).toContain("超过限值");
    expect(deformationCsvRows[1]).toMatchObject({
      point_id: "JC-2",
      latest_value_mm: 1.2,
      latest_rate_mm_per_day: 0.0667,
    });
    expect(deformationCsv.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "deformation_point_summary",
          point_id: "JC-1",
          latest_value_mm: 9,
          latest_rate_mm_per_day: 2,
          is_alert: true,
        }),
        expect.objectContaining({
          row_type: "deformation_point_summary",
          point_id: "JC-2",
          latest_value_mm: 1.2,
          latest_rate_mm_per_day: 0.0667,
          is_alert: false,
        }),
      ]),
    );

    const deformationWideCsv = await callTool("deformation_rate", {
      csvText: [
        "观测日期,JC-1(mm),JC-2(mm),累计预警值(mm),速率预警值(mm/d)",
        "2026-06-01,0,0,8,1.5",
        "2026-06-04,3,1,8,1.5",
        "2026-06-07,9,1.2,8,1.5",
      ].join("\n"),
      predictionDays: 2,
    });
    expect(deformationWideCsv).toMatchObject({
      mode: "multi_point_csv",
      input_format: "csv",
      table_format: "wide",
      parsed_row_count: 3,
      parsed_observation_count: 6,
      point_count: 2,
      alert_threshold_mm: 8,
      rate_threshold_mm_per_day: 1.5,
      alert_points: ["JC-1"],
      max_abs_latest_value_mm: 9,
      max_abs_latest_rate_mm_per_day: 2,
      deformation_summary: {
        mode: "multi_point_csv",
        point_count: 2,
        alert_count: 1,
        worst_point_id: "JC-1",
      },
    });
    expect(deformationWideCsv.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "deformation_point_summary",
          point_id: "JC-1",
          latest_value_mm: 9,
          latest_rate_mm_per_day: 2,
          is_alert: true,
        }),
        expect.objectContaining({
          row_type: "deformation_observation",
          point_id: "JC-2",
          date: "2026-06-07",
          value_mm: 1.2,
        }),
        expect.objectContaining({
          row_type: "deformation_period_rate",
          point_id: "JC-1",
          period: "2026-06-04 → 2026-06-07",
          rate_mm_per_day: 2,
        }),
      ]),
    );

    const deformationUnicodeMinusCsv = await callTool("deformation_rate", {
      csvText: [
        "测点编号,观测日期,累计沉降(mm),累计预警值(mm),速率预警值(mm/d)",
        "JC-NEG,2026-06-01,0,30,5",
        "JC-NEG,2026-06-04,−18,30,5",
        "JC-NEG,2026-06-07,－36,30,5",
      ].join("\n"),
      predictionDays: 1,
    });
    expect(deformationUnicodeMinusCsv).toMatchObject({
      mode: "multi_point_csv",
      table_format: "long",
      parsed_observation_count: 3,
      point_count: 1,
      alert_points: ["JC-NEG"],
      max_abs_latest_value_mm: 36,
      max_abs_latest_rate_mm_per_day: 6,
    });
    expect(deformationUnicodeMinusCsv.point_results as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          point_id: "JC-NEG",
          latest_value_mm: -36,
          total_deformation_mm: -36,
          latest_rate_mm_per_day: -6,
        }),
      ]),
    );
    expect(deformationUnicodeMinusCsv.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "deformation_point_summary",
          point_id: "JC-NEG",
          latest_value_mm: -36,
          latest_rate_mm_per_day: -6,
          is_alert: true,
        }),
        expect.objectContaining({
          row_type: "deformation_observation",
          point_id: "JC-NEG",
          date: "2026-06-04",
          value_mm: -18,
        }),
        expect.objectContaining({
          row_type: "deformation_period_rate",
          point_id: "JC-NEG",
          period: "2026-06-04 → 2026-06-07",
          increment_mm: -18,
          rate_mm_per_day: -6,
        }),
      ]),
    );

    const deformationComparison = await callTool("deformation_comparison", {
      alertThreshold: 8,
      rateThreshold: 1.5,
      points: [
        { id: "JC-1", latestValue: 9, previousValue: 3, daysBetween: 3 },
        { id: "JC-2", latestValue: 1.2, previousValue: 1, daysBetween: 3 },
      ],
    });
    expect(deformationComparison).toMatchObject({
      total_points: 2,
      alert_count: 1,
      max_deformation: { point_id: "JC-1", value_mm: 9 },
      max_rate: { point_id: "JC-1", rate_mm_per_day: 2 },
      deformation_comparison_summary: {
        point_count: 2,
        alert_count: 1,
        max_deformation_point_id: "JC-1",
        max_abs_deformation_mm: 9,
        max_rate_point_id: "JC-1",
        max_abs_rate_mm_per_day: 2,
        quality_status: "review_alert_points",
      },
    });
    expect(deformationComparison.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "deformation_comparison_point",
          point_id: "JC-1",
          latest_mm: 9,
          increment_mm: 6,
          rate_mm_per_day: 2,
          is_alert: true,
        }),
        expect.objectContaining({
          row_type: "deformation_comparison_point",
          point_id: "JC-2",
          latest_mm: 1.2,
          increment_mm: 0.2,
          rate_mm_per_day: 0.0667,
          is_alert: false,
        }),
      ]),
    );
  });

  it("computes monitoring CSV period changes by observation date instead of file order", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "railwise-monitoring-"));
    const csvPath = join(tempRoot, "settlement.csv");
    writeFileSync(
      csvPath,
      [
        "测点编号,观测日期,累计沉降(mm)",
        "JC-1,2026-06-01,0",
        "JC-1,2026-06-10,30",
        "JC-1,2026-06-04,10",
        "JC-2,2026-06-01,0",
        "JC-2,2026-06-10,8",
      ].join("\n"),
      "utf8",
    );

    try {
      const monitoring = await callTool("monitoring_csv", {
        filePath: csvPath,
        sensorType: "settlement",
        alertThreshold: 25,
        periodDays: 6,
      });

      expect(monitoring).toMatchObject({
        total_points: 2,
        exceeded_count: 1,
        max_cumulative_point: "JC-1",
        max_cumulative_mm: 30,
        monitoring_summary: {
          input_format: "file",
          sensor_type: "settlement",
          point_count: 2,
          exceeded_count: 1,
          max_cumulative_point: "JC-1",
          max_abs_cumulative_mm: 30,
          quality_status: "review_exceeded_points",
        },
      });
      expect((monitoring.summary as Array<Record<string, unknown>>)[0]).toMatchObject({
        point_id: "JC-1",
        baseline_date: "2026-06-01",
        latest_date: "2026-06-10",
        cumulative_mm: 30,
        period_change_mm: 20,
        rate_mm_per_day: 3.3333,
        exceeded_threshold: true,
      });
      expect(monitoring.export_rows as Array<Record<string, unknown>>).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            row_type: "monitoring_point_summary",
            point_id: "JC-1",
            baseline_date: "2026-06-01",
            latest_date: "2026-06-10",
            cumulative_mm: 30,
            period_change_mm: 20,
            rate_mm_per_day: 3.3333,
            exceeded_threshold: true,
          }),
          expect.objectContaining({
            row_type: "monitoring_point_summary",
            point_id: "JC-2",
            cumulative_mm: 8,
            exceeded_threshold: false,
          }),
          expect.objectContaining({
            row_type: "monitoring_period_observation",
            point_id: "JC-1",
            date: "2026-06-04",
            value_mm: 10,
            cumulative_mm: 10,
            stage_change_mm: 10,
            stage_rate_mm_per_day: 3.3333,
          }),
          expect.objectContaining({
            row_type: "monitoring_period_observation",
            point_id: "JC-1",
            date: "2026-06-10",
            value_mm: 30,
            cumulative_mm: 30,
            stage_change_mm: 20,
            stage_rate_mm_per_day: 3.3333,
          }),
        ]),
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }

    const pastedMonitoring = await callTool("monitoring_csv", {
      csvText: [
        "测点编号,观测日期,累计沉降(mm)",
        "JC-1,2026-06-01,0",
        "JC-1,2026-06-10,30",
        "JC-1,2026-06-04,10",
        "JC-2,2026-06-01,0",
        "JC-2,2026-06-10,8",
      ].join("\n"),
      sourceName: "pasted-settlement.csv",
      sensorType: "settlement",
      alertThreshold: 25,
      periodDays: 6,
    });

    expect(pastedMonitoring).toMatchObject({
      input_format: "csv_text",
      file: "pasted-settlement.csv",
      parsed_row_count: 5,
      total_points: 2,
      exceeded_count: 1,
      max_cumulative_point: "JC-1",
      max_cumulative_mm: 30,
      monitoring_summary: {
        input_format: "csv_text",
        source: "pasted-settlement.csv",
        point_count: 2,
        exceeded_count: 1,
        max_cumulative_point: "JC-1",
        max_abs_cumulative_mm: 30,
      },
    });
    expect((pastedMonitoring.summary as Array<Record<string, unknown>>)[0]).toMatchObject({
      point_id: "JC-1",
      baseline_date: "2026-06-01",
      latest_date: "2026-06-10",
      cumulative_mm: 30,
      period_change_mm: 20,
      rate_mm_per_day: 3.3333,
      exceeded_threshold: true,
    });
    expect((pastedMonitoring.export_rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      row_type: "monitoring_point_summary",
      point_id: "JC-1",
      cumulative_mm: 30,
      exceeded_threshold: true,
    });
    expect(pastedMonitoring.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "monitoring_period_observation",
          point_id: "JC-2",
          date: "2026-06-10",
          value_mm: 8,
          cumulative_mm: 8,
          stage_change_mm: 8,
          stage_rate_mm_per_day: 0.8889,
        }),
      ]),
    );
  });

  it("expands wide monitoring tables into point period observations", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "railwise-monitoring-wide-"));
    const svgPath = join(tempRoot, "wide-monitoring.svg");

    try {
      const monitoring = await callTool("monitoring_csv", {
        csvText: [
          "观测日期,JC-1(mm),JC-2(mm)",
          "2026-06-01,0,0",
          "2026-06-04,10,2",
          "2026-06-10,30,8",
        ].join("\n"),
        sourceName: "wide-settlement.csv",
        sensorType: "settlement",
        alertThreshold: 25,
        periodDays: 6,
      });

      expect(monitoring).toMatchObject({
        input_format: "csv_text",
        table_format: "wide",
        parsed_row_count: 3,
        parsed_observation_count: 6,
        total_points: 2,
        exceeded_count: 1,
        max_cumulative_point: "JC-1",
        max_cumulative_mm: 30,
        monitoring_summary: {
          table_format: "wide",
          parsed_row_count: 3,
          parsed_observation_count: 6,
          point_count: 2,
          exceeded_count: 1,
          quality_status: "review_exceeded_points",
        },
      });
      expect(monitoring.export_rows as Array<Record<string, unknown>>).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            row_type: "monitoring_point_summary",
            point_id: "JC-1",
            cumulative_mm: 30,
            exceeded_threshold: true,
          }),
          expect.objectContaining({
            row_type: "monitoring_period_observation",
            point_id: "JC-2",
            date: "2026-06-10",
            value_mm: 8,
            cumulative_mm: 8,
            stage_change_mm: 6,
          }),
        ]),
      );

      const chart = await callTool("chart_generator", {
        outputPath: svgPath,
        title: "宽表沉降趋势",
        sourceTool: "monitoring_csv",
        exportRows: monitoring.export_rows,
        alertThreshold: 25,
      });
      expect(chart).toMatchObject({
        point_count: 6,
        series_count: 2,
        chart_summary: {
          source_tool: "monitoring_csv",
          used_row_type_counts: {
            monitoring_period_observation: 6,
          },
        },
      });
      const svg = readFileSync(svgPath, "utf8");
      expect(svg).toContain("宽表沉降趋势");
      expect(svg).toContain("JC-1");
      expect(svg).toContain("JC-2");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("matches wide monitoring threshold columns to each point", async () => {
    const monitoring = await callTool("monitoring_csv", {
      csvText: [
        "观测日期,JC-1累计沉降(mm),JC-1累计预警值(mm),JC-1速率预警值(mm/d),JC-2累计沉降(mm),JC-2累计预警值(mm),JC-2速率预警值(mm/d)",
        "2026-06-01,0,50,5,0,12,3",
        "2026-06-04,18,50,5,8,12,3",
        "2026-06-07,36,50,5,14,12,3",
      ].join("\n"),
      sourceName: "wide-point-thresholds.csv",
      sensorType: "settlement",
      periodDays: 3,
    });

    expect(monitoring).toMatchObject({
      input_format: "csv_text",
      table_format: "wide",
      parsed_row_count: 3,
      parsed_observation_count: 6,
      total_points: 2,
      exceeded_count: 1,
      rate_exceeded_count: 1,
      alert_count: 2,
      exceeded_points: ["JC-2"],
      rate_exceeded_points: ["JC-1"],
      alert_points: ["JC-1", "JC-2"],
    });
    expect(monitoring.summary as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          point_id: "JC-1",
          cumulative_mm: 36,
          rate_mm_per_day: 6,
          alert_threshold_mm: 50,
          rate_threshold_mm_per_day: 5,
          exceeded_threshold: false,
          exceeded_rate_threshold: true,
          is_alert: true,
        }),
        expect.objectContaining({
          point_id: "JC-2",
          cumulative_mm: 14,
          rate_mm_per_day: 2,
          alert_threshold_mm: 12,
          rate_threshold_mm_per_day: 3,
          exceeded_threshold: true,
          exceeded_rate_threshold: false,
          is_alert: true,
        }),
      ]),
    );
    expect(monitoring.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "monitoring_period_observation",
          point_id: "JC-1",
          date: "2026-06-07",
          alert_threshold_mm: 50,
          rate_threshold_mm_per_day: 5,
        }),
        expect.objectContaining({
          row_type: "monitoring_period_observation",
          point_id: "JC-2",
          date: "2026-06-07",
          alert_threshold_mm: 12,
          rate_threshold_mm_per_day: 3,
        }),
      ]),
    );
  });

  it("uses monitoring table threshold columns for cumulative and rate alerts", async () => {
    const monitoring = await callTool("monitoring_csv", {
      csvText: [
        "测点编号,观测日期,累计沉降(mm),累计预警值(mm),速率预警值(mm/d)",
        "JC-1,2026-06-01,0,50,5",
        "JC-1,2026-06-04,10,50,5",
        "JC-1,2026-06-07,30,50,5",
        "JC-2,2026-06-01,0,50,5",
        "JC-2,2026-06-04,2,50,5",
        "JC-2,2026-06-07,4,50,5",
      ].join("\n"),
      sourceName: "threshold-settlement.csv",
      sensorType: "settlement",
      periodDays: 3,
    });

    expect(monitoring).toMatchObject({
      table_format: "long",
      parsed_observation_count: 6,
      exceeded_count: 0,
      rate_exceeded_count: 1,
      alert_count: 1,
      exceeded_points: [],
      rate_exceeded_points: ["JC-1"],
      alert_points: ["JC-1"],
      monitoring_summary: {
        alert_threshold_mm: null,
        rate_threshold_mm_per_day: null,
        exceeded_count: 0,
        rate_exceeded_count: 1,
        alert_count: 1,
        quality_status: "review_exceeded_points",
      },
    });
    expect(monitoring.summary as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          point_id: "JC-1",
          cumulative_mm: 30,
          rate_mm_per_day: 6.6667,
          alert_threshold_mm: 50,
          rate_threshold_mm_per_day: 5,
          exceeded_threshold: false,
          exceeded_rate_threshold: true,
          is_alert: true,
          ratio_pct: 60,
          rate_ratio_pct: 133.3,
        }),
        expect.objectContaining({
          point_id: "JC-2",
          cumulative_mm: 4,
          exceeded_threshold: false,
          exceeded_rate_threshold: false,
          is_alert: false,
        }),
      ]),
    );
    expect(monitoring.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "monitoring_point_summary",
          point_id: "JC-1",
          alert_threshold_mm: 50,
          rate_threshold_mm_per_day: 5,
          exceeded_rate_threshold: true,
          is_alert: true,
        }),
        expect.objectContaining({
          row_type: "monitoring_period_observation",
          point_id: "JC-1",
          date: "2026-06-07",
          alert_threshold_mm: 50,
          rate_threshold_mm_per_day: 5,
        }),
      ]),
    );
  });

  it("uses the monitoring rate threshold argument when the table has no threshold column", async () => {
    const monitoring = await callTool("monitoring_csv", {
      csvText: [
        "测点编号,观测日期,累计沉降(mm)",
        "JC-1,2026-06-01,0",
        "JC-1,2026-06-04,18",
        "JC-1,2026-06-07,36",
        "JC-2,2026-06-01,0",
        "JC-2,2026-06-04,3",
        "JC-2,2026-06-07,6",
      ].join("\n"),
      sourceName: "argument-rate-threshold.csv",
      sensorType: "settlement",
      rateThreshold: 5,
      periodDays: 3,
    });

    expect(monitoring).toMatchObject({
      table_format: "long",
      parsed_observation_count: 6,
      exceeded_count: 0,
      rate_exceeded_count: 1,
      alert_count: 1,
      rate_exceeded_points: ["JC-1"],
      alert_points: ["JC-1"],
      monitoring_summary: {
        rate_threshold_mm_per_day: 5,
        rate_exceeded_count: 1,
        quality_status: "review_exceeded_points",
      },
    });
    expect(monitoring.summary as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          point_id: "JC-1",
          rate_mm_per_day: 6,
          rate_threshold_mm_per_day: 5,
          exceeded_rate_threshold: true,
          is_alert: true,
          rate_ratio_pct: 120,
        }),
        expect.objectContaining({
          point_id: "JC-2",
          rate_mm_per_day: 1,
          rate_threshold_mm_per_day: 5,
          exceeded_rate_threshold: false,
          is_alert: false,
        }),
      ]),
    );
    expect(monitoring.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "monitoring_period_observation",
          point_id: "JC-1",
          date: "2026-06-07",
          rate_threshold_mm_per_day: 5,
        }),
      ]),
    );
  });

  it("parses Chinese monitoring dates before calculating period rates", async () => {
    const monitoring = await callTool("monitoring_csv", {
      csvText: [
        "测点编号,观测日期,累计沉降(mm)",
        "JC-1,2026年6月1日,0",
        "JC-1,2026年6月4日,18",
        "JC-1,2026年6月7日,36",
      ].join("\n"),
      sourceName: "chinese-date-settlement.csv",
      sensorType: "settlement",
      rateThreshold: 5,
      periodDays: 7,
    });

    expect(monitoring).toMatchObject({
      table_format: "long",
      parsed_observation_count: 3,
      rate_exceeded_count: 1,
      alert_points: ["JC-1"],
    });
    expect(monitoring.summary as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          point_id: "JC-1",
          baseline_date: "2026年6月1日",
          latest_date: "2026年6月7日",
          cumulative_mm: 36,
          period_change_mm: 36,
          rate_mm_per_day: 6,
          rate_threshold_mm_per_day: 5,
          exceeded_rate_threshold: true,
        }),
      ]),
    );
    expect(monitoring.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "monitoring_period_observation",
          point_id: "JC-1",
          date: "2026年6月4日",
          stage_interval_days: 3,
          stage_rate_mm_per_day: 6,
        }),
        expect.objectContaining({
          row_type: "monitoring_period_observation",
          point_id: "JC-1",
          date: "2026年6月7日",
          stage_interval_days: 3,
          stage_rate_mm_per_day: 6,
        }),
      ]),
    );
  });

  it("parses Excel serial monitoring dates before calculating period rates", async () => {
    const monitoring = await callTool("monitoring_csv", {
      csvText: [
        "测点编号,观测日期,累计沉降(mm)",
        "JC-1,46174,0",
        "JC-1,46177,18",
        "JC-1,46180,36",
      ].join("\n"),
      sourceName: "excel-serial-date-settlement.csv",
      sensorType: "settlement",
      rateThreshold: 5,
      periodDays: 7,
    });

    expect(monitoring).toMatchObject({
      table_format: "long",
      parsed_observation_count: 3,
      rate_exceeded_count: 1,
      alert_points: ["JC-1"],
    });
    expect(monitoring.summary as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          point_id: "JC-1",
          baseline_date: "46174",
          latest_date: "46180",
          cumulative_mm: 36,
          period_change_mm: 36,
          rate_mm_per_day: 6,
          rate_threshold_mm_per_day: 5,
          exceeded_rate_threshold: true,
        }),
      ]),
    );
    expect(monitoring.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "monitoring_period_observation",
          point_id: "JC-1",
          date: "46177",
          stage_interval_days: 3,
          stage_rate_mm_per_day: 6,
        }),
        expect.objectContaining({
          row_type: "monitoring_period_observation",
          point_id: "JC-1",
          date: "46180",
          stage_interval_days: 3,
          stage_rate_mm_per_day: 6,
        }),
      ]),
    );
  });

  it("parses full-width Chinese monitoring and deformation dates before calculating rates", async () => {
    const monitoring = await callTool("monitoring_csv", {
      csvText: [
        "测点编号,观测日期,累计沉降(mm),速率预警值(mm/d)",
        "JC-FDATE,２０２６年６月１日,0,5",
        "JC-FDATE,２０２６年６月４日,18,5",
        "JC-FDATE,２０２６年６月７日,36,5",
      ].join("\n"),
      sourceName: "fullwidth-date-settlement.csv",
      sensorType: "settlement",
      periodDays: 7,
    });

    expect(monitoring).toMatchObject({
      table_format: "long",
      parsed_observation_count: 3,
      rate_exceeded_count: 1,
      alert_points: ["JC-FDATE"],
    });
    expect(monitoring.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "monitoring_period_observation",
          point_id: "JC-FDATE",
          date: "２０２６年６月４日",
          stage_interval_days: 3,
          stage_rate_mm_per_day: 6,
        }),
        expect.objectContaining({
          row_type: "monitoring_period_observation",
          point_id: "JC-FDATE",
          date: "２０２６年６月７日",
          stage_interval_days: 3,
          stage_rate_mm_per_day: 6,
        }),
      ]),
    );

    const deformation = await callTool("deformation_rate", {
      csvText: [
        "测点编号,观测日期,累计沉降(mm),速率预警值(mm/d)",
        "JC-FDATE,２０２６年６月１日,0,5",
        "JC-FDATE,２０２６年６月４日,18,5",
        "JC-FDATE,２０２６年６月７日,36,5",
      ].join("\n"),
      predictionDays: 1,
    });

    expect(deformation).toMatchObject({
      mode: "multi_point_csv",
      table_format: "long",
      parsed_observation_count: 3,
      point_count: 1,
      alert_points: ["JC-FDATE"],
      max_abs_latest_rate_mm_per_day: 6,
    });
    expect(deformation.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "deformation_period_rate",
          point_id: "JC-FDATE",
          period: "２０２６年６月４日 → ２０２６年６月７日",
          days: 3,
          rate_mm_per_day: 6,
        }),
      ]),
    );
  });

  it("parses full-width Chinese dates in water-level, inclinometer, and axial-force series", async () => {
    const waterLevel = await callTool("water_level", {
      csvText: [
        "井号,观测日期,地下水位(m),累计预警值(mm),速率预警值(mm/d)",
        "SW-F,２０２６年６月１日,10,500,120",
        "SW-F,２０２６年６月４日,10.3,500,120",
        "SW-F,２０２６年６月７日,10.75,500,120",
      ].join("\n"),
    });

    expect(waterLevel).toMatchObject({
      mode: "observation_series",
      input_format: "csv",
      table_format: "long",
      parsed_observation_count: 3,
      alert_wells: ["SW-F"],
      max_abs_rate_mm_per_day: 150,
    });
    expect((waterLevel.well_summaries as Array<Record<string, unknown>>)[0]).toMatchObject({
      well_id: "SW-F",
      latest_date: "２０２６年６月７日",
      current_change_mm: 450,
      current_rate_mm_per_day: 150,
      is_alert: true,
    });

    const inclinometer = await callTool("inclinometer", {
      csvText: [
        "测斜孔号,观测日期,深度(m),X向位移(mm),Y向位移(mm),累计预警值(mm),速率预警值(mm/d)",
        "CX-F,２０２６年６月１日,6,0,0,20,3",
        "CX-F,２０２６年６月４日,6,12,0,20,3",
        "CX-F,２０２６年６月７日,6,24,0,20,3",
      ].join("\n"),
    });

    expect(inclinometer).toMatchObject({
      mode: "observation_series",
      input_format: "csv",
      table_format: "long",
      parsed_observation_count: 3,
      alert_depths: ["CX-F@6"],
      max_rate_mm_per_day: 4,
    });
    expect((inclinometer.depth_summaries as Array<Record<string, unknown>>)[0]).toMatchObject({
      borehole_id: "CX-F",
      latest_date: "２０２６年６月７日",
      current_stage_resultant_mm: 12,
      current_rate_mm_per_day: 4,
      is_alert: true,
    });

    const axialForce = await callTool("axial_force", {
      csvText: [
        "测点编号,观测日期,轴力(kN),轴力预警值(kN),速率预警值(kN/d)",
        "ZL-F,２０２６年６月１日,100,800,80",
        "ZL-F,２０２６年６月４日,400,800,80",
        "ZL-F,２０２６年６月７日,850,800,80",
      ].join("\n"),
    });

    expect(axialForce).toMatchObject({
      mode: "observation_series",
      input_format: "csv",
      table_format: "long",
      parsed_observation_count: 3,
      alert_sensors: ["ZL-F"],
      max_abs_rate_kn_per_day: 150,
    });
    expect((axialForce.sensor_summaries as Array<Record<string, unknown>>)[0]).toMatchObject({
      sensor_id: "ZL-F",
      latest_date: "２０２６年６月７日",
      current_force_change_kn: 450,
      current_rate_kn_per_day: 150,
      is_alert: true,
    });
  });

  it("preserves Unicode and full-width minus signs in monitoring values", async () => {
    const monitoring = await callTool("monitoring_csv", {
      csvText: [
        "测点编号,观测日期,累计沉降(mm)",
        "JC-1,2026-06-01,0",
        "JC-1,2026-06-04,−18",
        "JC-1,2026-06-07,－36",
      ].join("\n"),
      sourceName: "unicode-minus-settlement.csv",
      sensorType: "settlement",
      alertThreshold: 30,
      rateThreshold: 5,
      periodDays: 7,
    });

    expect(monitoring).toMatchObject({
      table_format: "long",
      parsed_observation_count: 3,
      exceeded_count: 1,
      rate_exceeded_count: 1,
      alert_points: ["JC-1"],
      max_cumulative_mm: -36,
    });
    expect(monitoring.summary as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          point_id: "JC-1",
          cumulative_mm: -36,
          period_change_mm: -36,
          rate_mm_per_day: -6,
          exceeded_threshold: true,
          exceeded_rate_threshold: true,
        }),
      ]),
    );
    expect(monitoring.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "monitoring_period_observation",
          point_id: "JC-1",
          date: "2026-06-04",
          value_mm: -18,
          cumulative_mm: -18,
          stage_change_mm: -18,
          stage_rate_mm_per_day: -6,
        }),
        expect.objectContaining({
          row_type: "monitoring_period_observation",
          point_id: "JC-1",
          date: "2026-06-07",
          value_mm: -36,
          cumulative_mm: -36,
          stage_change_mm: -18,
          stage_rate_mm_per_day: -6,
        }),
      ]),
    );
  });

  it("parses monitoring, deformation, and leveling values with full-width digits and unit suffixes", async () => {
    const monitoring = await callTool("monitoring_csv", {
      csvText: [
        "测点编号,观测日期,累计沉降(mm),累计预警值(mm),速率预警值(mm/d)",
        "JC-F,2026-06-01,０ mm,３０ mm,５ mm/d",
        "JC-F,2026-06-04,１８．０ mm,３０ mm,５ mm/d",
        "JC-F,2026-06-07,３６．０ mm,３０ mm,５ mm/d",
      ].join("\n"),
      sourceName: "fullwidth-monitoring.csv",
      sensorType: "settlement",
      periodDays: 7,
    });

    expect(monitoring).toMatchObject({
      table_format: "long",
      parsed_observation_count: 3,
      exceeded_count: 1,
      rate_exceeded_count: 1,
      alert_points: ["JC-F"],
      max_cumulative_mm: 36,
    });
    expect(monitoring.summary as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          point_id: "JC-F",
          cumulative_mm: 36,
          rate_mm_per_day: 6,
          alert_threshold_mm: 30,
          rate_threshold_mm_per_day: 5,
          is_alert: true,
        }),
      ]),
    );

    const deformation = await callTool("deformation_rate", {
      csvText: [
        "测点编号,观测日期,累计沉降(mm),累计预警值(mm),速率预警值(mm/d)",
        "JC-F,2026-06-01,０ mm,３０ mm,５ mm/d",
        "JC-F,2026-06-04,１８．０ mm,３０ mm,５ mm/d",
        "JC-F,2026-06-07,３６．０ mm,３０ mm,５ mm/d",
      ].join("\n"),
      predictionDays: 1,
    });

    expect(deformation).toMatchObject({
      mode: "multi_point_csv",
      table_format: "long",
      parsed_observation_count: 3,
      point_count: 1,
      alert_points: ["JC-F"],
      max_abs_latest_value_mm: 36,
      max_abs_latest_rate_mm_per_day: 6,
    });
    expect(deformation.point_results as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          point_id: "JC-F",
          latest_value_mm: 36,
          latest_rate_mm_per_day: 6,
        }),
      ]),
    );

    const levelingAdjustment = await callTool("calculator_leveling_adjustment", {
      csvText: [
        "类型,点号,高程,起点,终点,高差(m),测段距离(km),等级",
        "已知,BM1,１００．０００ m,,,,,2nd",
        "观测,L1,,BM1,P1,１．２３４ m,１ km,",
        "观测,L2,,BM1,P1,１．２３６ m,１ km,",
      ].join("\n"),
    });

    expect(levelingAdjustment).toMatchObject({
      input_format: "csv",
      parsed_row_count: 3,
      known_points: 1,
      unknown_points: 1,
      observations: 2,
      max_point_rmse_mm: 1,
    });
    expect(levelingAdjustment.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "leveling_adjusted_height",
          point_id: "P1",
          adjusted_height_m: 101.235,
          rmse_mm: 1,
        }),
      ]),
    );
  });

  it("draws symmetric threshold lines for negative monitoring trend charts", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "railwise-chart-"));
    const svgPath = join(tempRoot, "settlement.svg");

    try {
      const chart = await callTool("chart_generator", {
        outputPath: svgPath,
        title: "沉降趋势",
        alertThreshold: 30,
        data: [
          { point_id: "JC-1", date: "2026-06-01", value: 0 },
          { point_id: "JC-1", date: "2026-06-04", value: -18 },
          { point_id: "JC-1", date: "2026-06-07", value: -36 },
        ],
      });

      expect(chart).toMatchObject({
        output_path: svgPath,
        threshold_lines: 2,
        chart_summary: {
          title: "沉降趋势",
          point_count: 3,
          series_count: 1,
          date_start: "2026-06-01",
          date_end: "2026-06-07",
          min_value_mm: -36,
          max_value_mm: 0,
          threshold_lines: 2,
          has_negative_values: true,
        },
      });
      expect(chart.export_rows as Array<Record<string, unknown>>).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            row_type: "chart_data_point",
            point_id: "JC-1",
            date: "2026-06-07",
            value_mm: -36,
          }),
          expect.objectContaining({
            row_type: "chart_threshold_line",
            threshold_mm: 30,
            label: "报警值 +30mm",
          }),
          expect.objectContaining({
            row_type: "chart_threshold_line",
            threshold_mm: -30,
            label: "报警值 -30mm",
          }),
        ]),
      );
      const svg = readFileSync(svgPath, "utf8");
      expect(svg).toContain("报警值 +30mm");
      expect(svg).toContain("报警值 -30mm");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("draws monitoring CSV export rows directly as an engineering trend chart", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "railwise-chart-export-rows-"));
    const svgPath = join(tempRoot, "monitoring.svg");

    try {
      const monitoring = await callTool("monitoring_csv", {
        csvText: [
          "测点编号,观测日期,累计沉降(mm)",
          "JC-1,2026-06-01,0",
          "JC-1,2026-06-10,30",
          "JC-1,2026-06-04,10",
          "JC-2,2026-06-01,0",
          "JC-2,2026-06-10,8",
        ].join("\n"),
        sourceName: "track-monitoring.csv",
        sensorType: "settlement",
        alertThreshold: 25,
        periodDays: 6,
      });
      const chart = await callTool("chart_generator", {
        outputPath: svgPath,
        title: "轨道交通沉降趋势",
        sourceTool: "monitoring_csv",
        exportRows: monitoring.export_rows,
        alertThreshold: 25,
      });

      expect(chart).toMatchObject({
        output_path: svgPath,
        point_count: 5,
        series_count: 2,
        threshold_lines: 1,
        date_range: "2026-06-01 ~ 2026-06-10",
        chart_summary: {
          title: "轨道交通沉降趋势",
          source_tool: "monitoring_csv",
          input_data_count: 0,
          export_row_source_count: 5,
          skipped_export_row_count: 0,
          used_row_type_counts: {
            monitoring_period_observation: 5,
          },
          point_count: 5,
          series_count: 2,
          date_start: "2026-06-01",
          date_end: "2026-06-10",
          min_value_mm: 0,
          max_value_mm: 30,
          value_unit: "mm",
          threshold_lines: 1,
          has_negative_values: false,
        },
      });
      expect(chart.export_rows as Array<Record<string, unknown>>).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            row_type: "chart_data_point",
            point_id: "JC-1",
            date: "2026-06-10",
            value_mm: 30,
          }),
          expect.objectContaining({
            row_type: "chart_data_point",
            point_id: "JC-2",
            date: "2026-06-10",
            value_mm: 8,
          }),
          expect.objectContaining({
            row_type: "chart_threshold_line",
            threshold_mm: 25,
            label: "报警值 +25mm",
          }),
        ]),
      );
      const svg = readFileSync(svgPath, "utf8");
      expect(svg).toContain("轨道交通沉降趋势");
      expect(svg).toContain("JC-1");
      expect(svg).toContain("JC-2");
      expect(svg).toContain("报警值 +25mm");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("draws axial-force export rows directly as a kN trend chart", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "railwise-chart-axial-"));
    const svgPath = join(tempRoot, "axial-force.svg");

    try {
      const axialForce = await callTool("axial_force", {
        alertThresholdKn: 800,
        rateThresholdKnPerDay: 80,
        observations: [
          { sensorId: "ZL-1", date: "2026-06-01", forceKn: 100 },
          { sensorId: "ZL-1", date: "2026-06-04", forceKn: 400 },
          { sensorId: "ZL-1", date: "2026-06-07", forceKn: 850 },
        ],
      });
      const chart = await callTool("chart_generator", {
        outputPath: svgPath,
        title: "轨道交通轴力趋势",
        sourceTool: "axial_force",
        exportRows: axialForce.export_rows,
        alertThreshold: 800,
        valueUnit: "kN",
      });

      expect(chart).toMatchObject({
        output_path: svgPath,
        point_count: 3,
        series_count: 1,
        threshold_lines: 1,
        date_range: "2026-06-01 ~ 2026-06-07",
        chart_summary: {
          title: "轨道交通轴力趋势",
          source_tool: "axial_force",
          input_data_count: 0,
          export_row_source_count: 3,
          skipped_export_row_count: 0,
          used_row_type_counts: {
            axial_force_period_observation: 3,
          },
          point_count: 3,
          series_count: 1,
          date_start: "2026-06-01",
          date_end: "2026-06-07",
          min_value: 100,
          max_value: 850,
          value_unit: "kN",
          threshold_lines: 1,
          has_negative_values: false,
        },
      });
      expect(chart.export_rows as Array<Record<string, unknown>>).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            row_type: "chart_data_point",
            point_id: "ZL-1",
            date: "2026-06-07",
            value: 850,
            value_unit: "kN",
          }),
          expect.objectContaining({
            row_type: "chart_threshold_line",
            threshold: 800,
            threshold_unit: "kN",
            label: "报警值 +800kN",
          }),
        ]),
      );
      const svg = readFileSync(svgPath, "utf8");
      expect(svg).toContain("轨道交通轴力趋势");
      expect(svg).toContain("变化量 (kN)");
      expect(svg).toContain("报警值 +800kN");
      expect(svg).toContain("ZL-1");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("returns summary and export rows for standard clause queries", async () => {
    const standard = await callTool("standard_query", {
      keywords: ["水准", "闭合差"],
      standardCode: "GB 50026",
      mandatoryOnly: true,
    });

    expect(standard.standard_query_summary).toMatchObject({
      query: "水准、闭合差",
      standard_filter: "GB 50026",
      mandatory_only: true,
      total_matches: 2,
      returned: 2,
      mandatory_returned: 2,
      top_result: {
        code: "GB 50026",
        section: "4.3.1",
        relevance: 5,
      },
    });
    expect(standard.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "standard_clause_result",
        code: "GB 50026",
        title: "工程测量标准",
        section: "4.3.1",
        mandatory: true,
        relevance: 5,
        content:
          "高程控制网等级：一等水准闭合差限差±4√L mm，二等±6√L mm（城市轨道交通基准网常用），三等±12√L mm，四等±20√L mm（L为路线长度/km）。",
      },
      {
        row_type: "standard_clause_result",
        code: "GB 50026",
        title: "工程测量标准",
        section: "5.1.1",
        mandatory: true,
        relevance: 5,
        content:
          "导线测量的角度闭合差限差：DJ1仪器±5″√n，DJ2仪器±10″√n，DJ6仪器±20″√n（n为测站数）。全长相对闭合差：一级导线不大于1/40000，二级不大于1/20000，三级不大于1/10000。",
      },
    ]);
  });

  it("exports tool summary and export rows into an engineering workbook deliverable", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "railwise-excel-export-"));
    const xlsxPath = join(tempRoot, "standard-query-deliverable.xlsx");

    try {
      const standard = await callTool("standard_query", {
        keywords: ["水准", "闭合差"],
        standardCode: "GB 50026",
        mandatoryOnly: true,
      });
      const workbook = await callTool("excel_export", {
        title: "规范查询成果",
        outputPath: xlsxPath,
        sourceTool: "standard_query",
        summary: standard.standard_query_summary,
        exportRows: standard.export_rows,
      });

      expect(workbook).toMatchObject({
        output_path: xlsxPath,
        format: "xlsx (Office Open XML SpreadsheetML)",
        total_rows: 15,
        export_summary: {
          source_tool: "standard_query",
          export_row_count: 2,
          summary_field_count: 7,
          generated_sheet_count: 3,
          generated_sheets: ["成果清单", "质量摘要", "规范条文"],
          row_type_counts: {
            standard_clause_result: 2,
          },
        },
      });
      expect(workbook.sheets as Array<Record<string, unknown>>).toEqual([
        { name: "成果清单", columns: 2, rows: 6 },
        { name: "质量摘要", columns: 2, rows: 7 },
        { name: "规范条文", columns: 7, rows: 2 },
      ]);

      const entries = readZipEntries(xlsxPath);
      expect(entries.get("xl/workbook.xml")).toContain('sheet name="成果清单"');
      expect(entries.get("xl/workbook.xml")).toContain('sheet name="质量摘要"');
      expect(entries.get("xl/workbook.xml")).toContain('sheet name="规范条文"');
      const sharedStrings = entries.get("xl/sharedStrings.xml") ?? "";
      expect(sharedStrings).toContain("standard_query");
      expect(sharedStrings).toContain("standard_clause_result");
      expect(sharedStrings).toContain("GB 50026");
      expect(sharedStrings).toContain("水准、闭合差");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("exports monitoring CSV summaries and period observations into readable workbook sheets", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "railwise-monitoring-excel-"));
    const xlsxPath = join(tempRoot, "monitoring-deliverable.xlsx");

    try {
      const monitoring = await callTool("monitoring_csv", {
        csvText: [
          "测点编号,观测日期,累计沉降(mm)",
          "JC-1,2026-06-01,0",
          "JC-1,2026-06-10,30",
          "JC-1,2026-06-04,10",
          "JC-2,2026-06-01,0",
          "JC-2,2026-06-10,8",
        ].join("\n"),
        sourceName: "track-monitoring.csv",
        sensorType: "settlement",
        alertThreshold: 25,
        periodDays: 6,
      });

      const workbook = await callTool("excel_export", {
        title: "轨道交通监测成果",
        outputPath: xlsxPath,
        sourceTool: "monitoring_csv",
        summary: monitoring.monitoring_summary,
        exportRows: monitoring.export_rows,
      });

      expect(workbook).toMatchObject({
        output_path: xlsxPath,
        total_rows: 30,
        export_summary: {
          source_tool: "monitoring_csv",
          export_row_count: 7,
          summary_field_count: 17,
          generated_sheet_count: 4,
          generated_sheets: ["成果清单", "质量摘要", "监测点汇总", "监测观测记录"],
          row_type_counts: {
            monitoring_point_summary: 2,
            monitoring_period_observation: 5,
          },
        },
      });
      expect(workbook.sheets as Array<Record<string, unknown>>).toEqual([
        { name: "成果清单", columns: 2, rows: 6 },
        { name: "质量摘要", columns: 2, rows: 17 },
        { name: "监测点汇总", columns: 16, rows: 2 },
        { name: "监测观测记录", columns: 11, rows: 5 },
      ]);

      const entries = readZipEntries(xlsxPath);
      expect(entries.get("xl/workbook.xml")).toContain('sheet name="监测点汇总"');
      expect(entries.get("xl/workbook.xml")).toContain('sheet name="监测观测记录"');
      const sharedStrings = entries.get("xl/sharedStrings.xml") ?? "";
      expect(sharedStrings).toContain("monitoring_csv");
      expect(sharedStrings).toContain("monitoring_point_summary");
      expect(sharedStrings).toContain("monitoring_period_observation");
      expect(sharedStrings).toContain("track-monitoring.csv");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("exports tool summary and export rows into a Word report deliverable", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "railwise-report-export-"));
    const docxPath = join(tempRoot, "standard-query-report.docx");

    try {
      const standard = await callTool("standard_query", {
        keywords: ["水准", "闭合差"],
        standardCode: "GB 50026",
        mandatoryOnly: true,
      });
      const report = await callTool("report_export", {
        title: "规范查询成果",
        outputPath: docxPath,
        sourceTool: "standard_query",
        summary: standard.standard_query_summary,
        exportRows: standard.export_rows,
      });

      expect(report).toMatchObject({
        output_path: docxPath,
        format: "docx (Office Open XML)",
        report_summary: {
          source_tool: "standard_query",
          summary_field_count: 7,
          export_row_count: 2,
          row_type_counts: {
            standard_clause_result: 2,
          },
          generated_sections: ["成果概览", "质量摘要", "成果数据"],
        },
      });

      const entries = readZipEntries(docxPath);
      const document = entries.get("word/document.xml") ?? "";
      expect(document).toContain("规范查询成果");
      expect(document).toContain("成果概览");
      expect(document).toContain("<w:tbl");
      expect(document).toContain("规范条文");
      expect(document).toContain("standard_query");
      expect(document).toContain("standard_clause_result");
      expect(document).toContain("GB 50026");
      expect(document).toContain("高程控制网等级");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("exports structured tool results into a Markdown report deliverable", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "railwise-report-md-"));
    const markdownPath = join(tempRoot, "standard-query-report.md");

    try {
      const standard = await callTool("standard_query", {
        keywords: ["水准", "闭合差"],
        standardCode: "GB 50026",
        mandatoryOnly: true,
      });
      const report = await callTool("report_export", {
        title: "规范查询成果",
        outputPath: markdownPath,
        format: "markdown",
        sourceTool: "standard_query",
        summary: standard.standard_query_summary,
        exportRows: standard.export_rows,
      });

      expect(report).toMatchObject({
        output_path: markdownPath,
        format: "markdown",
        report_summary: {
          source_tool: "standard_query",
          summary_field_count: 7,
          export_row_count: 2,
          row_type_counts: {
            standard_clause_result: 2,
          },
          generated_sections: ["成果概览", "质量摘要", "成果数据"],
        },
      });

      const markdown = readFileSync(markdownPath, "utf8");
      expect(markdown).toContain("# 规范查询成果");
      expect(markdown).toContain("## 成果概览");
      expect(markdown).toContain("## 质量摘要");
      expect(markdown).toContain("## 成果数据");
      expect(markdown).toContain("standard_query");
      expect(markdown).toContain("standard_clause_result");
      expect(markdown).toContain("GB 50026");
      expect(markdown).toContain("| 字段 | 值 |");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("parses DAT field tables with Chinese unit suffix headers", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "railwise-dat-"));
    const datPath = join(tempRoot, "field-points.dat");
    writeFileSync(
      datPath,
      [
        "点号,东坐标(m),北坐标(m),高程(m),水平距(m)",
        "K1,500000.123,3200000.456,12.345,35.2",
        "K2,500010.123,3200010.456,12.678,36.4",
      ].join("\n"),
      "utf8",
    );

    try {
      const parsed = await callTool("format_parser", {
        filePath: datPath,
        format: "dat-auto",
      });

      expect(parsed).toMatchObject({
        format: "dat",
        total_records: 2,
        parser_summary: {
          format: "dat",
          input_format: "file",
          total_records: 2,
          coordinate_point_count: 2,
          quality_status: "parsed",
        },
      });
      expect((parsed.records as Array<Record<string, unknown>>)[0]).toMatchObject({
        point_id: "K1",
        easting_m: 500000.123,
        northing_m: 3200000.456,
        elevation_m: 12.345,
        horiz_dist_m: 35.2,
      });
      expect(parsed.export_rows as Array<Record<string, unknown>>).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            row_type: "field_coordinate_record",
            point_id: "K1",
            easting_m: 500000.123,
            northing_m: 3200000.456,
            elevation_m: 12.345,
          }),
          expect.objectContaining({
            row_type: "field_coordinate_record",
            point_id: "K2",
            easting_m: 500010.123,
            northing_m: 3200010.456,
            elevation_m: 12.678,
          }),
        ]),
      );
      expect(parsed).toMatchObject({
        distance_calculator_segment_count: 1,
        parser_summary: {
          distance_calculator_segment_count: 1,
          angle_observation_count: 0,
          distance_observation_count: 2,
        },
      });
      expect(parsed.distance_calculator_csv).toContain(
        "边号,起点X,起点Y,起点高程,终点X,终点Y,终点高程",
      );
      const derivedDistance = await callTool("distance_calculator", {
        csvText: parsed.distance_calculator_csv as string,
      });
      expect(derivedDistance).toMatchObject({
        mode: "distance_batch_csv",
        segment_count: 1,
        failed_count: 0,
        total_horizontal_distance_m: 14.1421,
        survey_distance_summary: {
          segment_count: 1,
          total_horizontal_distance_m: 14.1421,
          quality_status: "pass",
        },
      });
      expect((derivedDistance.export_rows as Array<Record<string, unknown>>)[0]).toMatchObject({
        row_type: "survey_distance_segment",
        segment_id: "K1-K2",
        horizontal_distance_m: 14.1421,
        elevation_difference_m: 0.333,
      });

      const pastedCoordinates = await callTool("format_parser", {
        rawText: [
          "点号 东坐标(m) 北坐标(m) 高程(m)",
          "K1 500000.123 3200000.456 12.345",
          "K2 500010.123 3200010.456 12.678",
        ].join("\n"),
        sourceName: "pasted-total-station.txt",
        format: "dat-auto",
      });

      expect(pastedCoordinates).toMatchObject({
        format: "dat",
        file: "pasted-total-station.txt",
        input_format: "raw_text",
        total_records: 2,
        coordinate_point_count: 2,
        parser_summary: {
          format: "dat",
          source: "pasted-total-station.txt",
          input_format: "raw_text",
          total_records: 2,
          coordinate_point_count: 2,
          quality_status: "parsed",
        },
        control_network_observations: [
          { pointId: "K1", x: 500000.123, y: 3200000.456, weight: 1 },
          { pointId: "K2", x: 500010.123, y: 3200010.456, weight: 1 },
        ],
        coord_transform_points: [
          { id: "K1", x: 500000.123, y: 3200000.456, z: 12.345 },
          { id: "K2", x: 500010.123, y: 3200010.456, z: 12.678 },
        ],
        coordinate_bounds: {
          min_easting_m: 500000.123,
          max_easting_m: 500010.123,
          min_northing_m: 3200000.456,
          max_northing_m: 3200010.456,
          min_elevation_m: 12.345,
          max_elevation_m: 12.678,
        },
      });
      expect(
        (pastedCoordinates.coordinate_records as Array<Record<string, unknown>>)[1],
      ).toMatchObject({
        point_id: "K2",
        easting_m: 500010.123,
        northing_m: 3200010.456,
        elevation_m: 12.678,
      });
      expect((pastedCoordinates.export_rows as Array<Record<string, unknown>>)[1]).toMatchObject({
        row_type: "field_coordinate_record",
        point_id: "K2",
        easting_m: 500010.123,
        northing_m: 3200010.456,
        elevation_m: 12.678,
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("parses field polar observations into angle-convert ready CSV", async () => {
    const parsed = await callTool("format_parser", {
      rawText: [
        "点号,水平角,竖直角,斜距(m),水平距(m),高差(m)",
        "GJ-1,123.4567,88.5,35.120,35.108,0.987",
        "GJ-2,124.0000,89.0,36.000,35.995,0.500",
      ].join("\n"),
      sourceName: "polar-observations.dat",
      format: "dat-auto",
    });

    expect(parsed).toMatchObject({
      format: "dat",
      file: "polar-observations.dat",
      total_records: 2,
      parser_summary: {
        coordinate_point_count: 0,
        distance_calculator_segment_count: 0,
        angle_observation_count: 4,
        distance_observation_count: 2,
        quality_status: "parsed",
      },
    });
    expect(parsed.angle_convert_rows as Array<Record<string, unknown>>).toEqual([
      { id: "GJ-1-HZ", groupId: "水平角", value: 123.4567, from: "decimal" },
      { id: "GJ-1-V", groupId: "竖直角", value: 88.5, from: "decimal" },
      { id: "GJ-2-HZ", groupId: "水平角", value: 124, from: "decimal" },
      { id: "GJ-2-V", groupId: "竖直角", value: 89, from: "decimal" },
    ]);
    expect(parsed.angle_convert_csv).toContain("角度编号,方向组,角度值,输入格式");
    expect(parsed.distance_observation_records as Array<Record<string, unknown>>).toEqual([
      {
        point_id: "GJ-1",
        horiz_dist_m: 35.108,
        slope_dist_m: 35.12,
        height_diff_m: 0.987,
        v_angle_deg: 88.5,
      },
      {
        point_id: "GJ-2",
        horiz_dist_m: 35.995,
        slope_dist_m: 36,
        height_diff_m: 0.5,
        v_angle_deg: 89,
      },
    ]);
    expect(parsed.distance_observation_csv).toContain(
      "观测编号,斜距(m),水平距(m),竖直角(°),高差(m)",
    );

    const distanceObservation = await callTool("distance_calculator", {
      csvText: parsed.distance_observation_csv as string,
    });
    expect(distanceObservation).toMatchObject({
      mode: "distance_observation_csv",
      input_format: "csv",
      observation_count: 2,
      failed_count: 0,
      survey_distance_summary: {
        observation_count: 2,
        quality_status: "pass",
      },
    });
    expect(distanceObservation.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "survey_distance_observation",
          observation_id: "GJ-1",
          slope_distance_m: 35.12,
          observed_horizontal_distance_m: 35.108,
          zenith_angle_degrees: 88.5,
          calculated_horizontal_distance_m: 35.107965,
          horizontal_distance_residual_mm: 0.035,
        }),
        expect.objectContaining({
          row_type: "survey_distance_observation",
          observation_id: "GJ-2",
          calculated_horizontal_distance_m: 35.994517,
          horizontal_distance_residual_mm: 0.483,
        }),
      ]),
    );

    const angleBatch = await callTool("angle_convert", {
      csvText: parsed.angle_convert_csv as string,
    });
    expect(angleBatch).toMatchObject({
      mode: "angle_batch_csv",
      angle_count: 4,
      group_count: 2,
      failed_count: 0,
      quality_status: "pass",
    });
    expect(angleBatch.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "angle_conversion_result",
          angle_id: "GJ-1-HZ",
          group_id: "水平角",
          decimal_degrees: 123.4567,
          is_passed: null,
        }),
        expect.objectContaining({
          row_type: "angle_conversion_result",
          angle_id: "GJ-2-V",
          group_id: "竖直角",
          decimal_degrees: 89,
          is_passed: null,
        }),
      ]),
    );
  });

  it("parses PRD IO-01 Survey Cloud JSON and CPIII TPT/SUC field imports", async () => {
    const surveyCloud = await callTool("format_parser", {
      rawText: JSON.stringify({
        project: "Rail transit control network",
        known_points: [
          { name: "CP0", x: 500000.123, y: 3200000.456, h: 12.345, fixed: true },
          {
            name: "CP1",
            easting: 500035.231,
            northing: 3200020.112,
            elevation: 12.688,
            fixed: true,
          },
        ],
        observations: [
          {
            station: "CP0",
            target: "CP1",
            hz_angle_deg: 123.4567,
            zenith_deg: 89.5,
            slope_dist_m: 40.512,
            horiz_dist_m: 40.51,
          },
        ],
        level_segments: [{ from: "BM1", to: "BM2", dh_m: 0.012, length_km: 0.35 }],
      }),
      sourceName: "survey-cloud-job.json",
      format: "dat-auto",
    });

    expect(surveyCloud).toMatchObject({
      format: "survey-cloud-json",
      file: "survey-cloud-job.json",
      total_records: 4,
      coordinate_point_count: 2,
      parser_summary: {
        format: "survey-cloud-json",
        coordinate_point_count: 2,
        angle_observation_count: 2,
        distance_observation_count: 2,
        quality_status: "parsed",
      },
    });
    expect(surveyCloud.records as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          record_kind: "coordinate",
          point_id: "CP0",
          easting_m: 500000.123,
          northing_m: 3200000.456,
          elevation_m: 12.345,
        }),
        expect.objectContaining({
          record_kind: "traverse_observation",
          from: "CP0",
          to: "CP1",
          point_id: "CP1",
          hz_angle_deg: 123.4567,
          v_angle_deg: 89.5,
          slope_dist_m: 40.512,
          horiz_dist_m: 40.51,
        }),
        expect.objectContaining({
          record_kind: "level_segment",
          from: "BM1",
          to: "BM2",
          point_id: "BM1-BM2",
          height_diff_m: 0.012,
          horiz_dist_m: 350,
          length_km: 0.35,
        }),
      ]),
    );
    expect(surveyCloud.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "field_coordinate_record",
          point_id: "CP0",
          easting_m: 500000.123,
          northing_m: 3200000.456,
        }),
        expect.objectContaining({
          row_type: "field_observation_record",
          record_kind: "level_segment",
          point_id: "BM1-BM2",
          from: "BM1",
          to: "BM2",
          height_diff_m: 0.012,
          horiz_dist_m: 350,
          length_km: 0.35,
        }),
      ]),
    );

    const cpiiiTpt = await callTool("format_parser", {
      rawText: [
        "# CPIII_TPT",
        "point,easting,northing,elevation,fixed",
        "CP3-01,501000.100,3201000.200,15.300,1",
        "CP3-02,501035.400,3201025.600,15.420,1",
      ].join("\n"),
      sourceName: "cp3-control.TPT",
      format: "dat-auto",
    });

    expect(cpiiiTpt).toMatchObject({
      format: "cpiii-tpt",
      total_records: 2,
      coordinate_point_count: 2,
      parser_summary: {
        format: "cpiii-tpt",
        coordinate_point_count: 2,
        distance_calculator_segment_count: 1,
        quality_status: "parsed",
      },
      control_network_observations: [
        { pointId: "CP3-01", x: 501000.1, y: 3201000.2, weight: 1 },
        { pointId: "CP3-02", x: 501035.4, y: 3201025.6, weight: 1 },
      ],
    });
    expect((cpiiiTpt.export_rows as Array<Record<string, unknown>>)[1]).toMatchObject({
      row_type: "field_coordinate_record",
      record_kind: "coordinate",
      point_id: "CP3-02",
      easting_m: 501035.4,
      northing_m: 3201025.6,
      elevation_m: 15.42,
    });

    const cpiiiSuc = await callTool("format_parser", {
      rawText: [
        "# CPIII_SUC",
        "type,from,to,hz_angle_deg,zenith_deg,horiz_dist_m,dh_m,length_km",
        "OBS,CP3-01,CP3-02,45.1234,89.8765,43.612,,",
        "LVL,BM31,BM32,,,,0.006,0.28",
      ].join("\n"),
      sourceName: "cp3-observation.SUC",
      format: "dat-auto",
    });

    expect(cpiiiSuc).toMatchObject({
      format: "cpiii-suc",
      total_records: 2,
      parser_summary: {
        format: "cpiii-suc",
        coordinate_point_count: 0,
        angle_observation_count: 2,
        distance_observation_count: 2,
        quality_status: "parsed",
      },
    });
    expect(cpiiiSuc.records as Array<Record<string, unknown>>).toEqual([
      expect.objectContaining({
        record_kind: "traverse_observation",
        from: "CP3-01",
        to: "CP3-02",
        point_id: "CP3-01-CP3-02",
        hz_angle_deg: 45.1234,
        v_angle_deg: 89.8765,
        horiz_dist_m: 43.612,
      }),
      expect.objectContaining({
        record_kind: "level_segment",
        from: "BM31",
        to: "BM32",
        point_id: "BM31-BM32",
        height_diff_m: 0.006,
        horiz_dist_m: 280,
        length_km: 0.28,
      }),
    ]);
  });

  it("merges PRD CPIII TPT and SUC field bundles into traverse adjustment input", async () => {
    const parsed = await callTool("format_parser", {
      rawText: [
        "# CPIII_TPT",
        "point,easting,northing,elevation,fixed",
        "CP3-01,501000.100,3201000.200,15.300,1",
        "CP3-02,501035.400,3201025.600,15.420,1",
        "# CPIII_SUC",
        "type,from,to,hz_angle_deg,zenith_deg,horiz_dist_m",
        "OBS,CP3-01,CP3-03,45.1234,89.8765,43.612",
      ].join("\n"),
      sourceName: "cp3-field-bundle.txt",
      format: "dat-auto",
    });

    expect(parsed).toMatchObject({
      format: "cpiii-bundle",
      file: "cp3-field-bundle.txt",
      total_records: 3,
      parser_summary: {
        format: "cpiii-bundle",
        traverse_known_point_count: 2,
        traverse_observation_count: 1,
        quality_status: "parsed",
      },
      import_preflight: {
        target_workflow: "traverse_adjust",
        ready_for_adjustment: true,
        missing_required_fields: [],
        quality_status: "ready",
      },
      traverse_adjustment_input: {
        known_points: [
          { name: "CP3-01", x: 501000.1, y: 3201000.2, fixed: true },
          { name: "CP3-02", x: 501035.4, y: 3201025.6, fixed: true },
        ],
        observations: [
          {
            from: "CP3-01",
            to: "CP3-03",
            hz_angle_deg: 45.1234,
            horizontal_dist_m: 43.612,
            zenith_deg: 89.8765,
          },
        ],
      },
    });

    const adjusted = await callTool(
      "survey_traverse_adjust",
      parsed.traverse_adjustment_input as Record<string, unknown>,
    );
    expect(adjusted).toMatchObject({
      method: "traverse_bowditch_adjustment",
      point_count: 1,
      observation_count: 1,
      points: [expect.objectContaining({ name: "CP3-03" })],
    });
  });

  it("parses PRD LVL-01 Trimble DiNi03 M5 DAT leveling records into adjustment-ready segments", async () => {
    const parsed = await callTool("format_parser", {
      rawText: [
        "For M5|Adr 0001|PI1 BM1|Z 100.00000 m|",
        "For M5|Adr 0002|PI1 BM1|Rb 1.45678 m|HD 30.000 m|",
        "For M5|Adr 0003|PI1 TP1|Rf 0.22278 m|HD 30.000 m|",
        "For M5|Adr 0004|PI1 TP1|Rb 1.30000 m|HD 25.000 m|",
        "For M5|Adr 0005|PI1 BM2|Rf 0.06600 m|HD 25.000 m|",
      ].join("\n"),
      sourceName: "dini03-level.dat",
      format: "dat-auto",
    });

    expect(parsed).toMatchObject({
      format: "dini-m5",
      file: "dini03-level.dat",
      total_records: 3,
      parser_summary: {
        format: "dini-m5",
        total_records: 3,
        level_segment_count: 2,
        level_benchmark_count: 1,
        distance_observation_count: 2,
        quality_status: "parsed",
      },
      level_adjustment_input: {
        known_bms: [{ name: "BM1", h: 100, fixed: true }],
        segments: [
          { from: "BM1", to: "TP1", dh_m: 1.234, length_km: 0.06, n_stations: 1 },
          { from: "TP1", to: "BM2", dh_m: 1.234, length_km: 0.05, n_stations: 1 },
        ],
        weight_mode: "length",
      },
    });
    expect(parsed.records as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          record_kind: "coordinate",
          point_id: "BM1",
          elevation_m: 100,
        }),
        expect.objectContaining({
          record_kind: "level_segment",
          from: "BM1",
          to: "TP1",
          height_diff_m: 1.234,
          horiz_dist_m: 60,
          length_km: 0.06,
          n_stations: 1,
        }),
      ]),
    );
    expect(parsed.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "field_coordinate_record",
          record_kind: "coordinate",
          point_id: "BM1",
          elevation_m: 100,
        }),
        expect.objectContaining({
          row_type: "field_observation_record",
          record_kind: "level_segment",
          point_id: "BM1-TP1",
          from: "BM1",
          to: "TP1",
          height_diff_m: 1.234,
          length_km: 0.06,
          n_stations: 1,
        }),
      ]),
    );

    const adjusted = await callTool(
      "level_adjust",
      parsed.level_adjustment_input as Record<string, unknown>,
    );
    expect(adjusted).toMatchObject({
      method: "least_squares_level_adjustment",
      segment_count: 2,
      unknown_point_count: 2,
    });
    expect(adjusted.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "level_adjusted_height",
          point_name: "BM2",
          adjusted_height_m: 102.468,
        }),
      ]),
    );
  });

  it("parses PRD TRV-01 Leica GSI traverse records into adjustment-ready input", async () => {
    const parsed = await callTool("format_parser", {
      rawText: [
        "*110001+0000000S 810000+00000000 820000+00000000",
        "*110002+0000000E 810000+00100000 820000+00000000",
        "*110003+000000P1 210000+27000000 320000+00100000",
      ].join("\n"),
      sourceName: "traverse-field.gsi",
      format: "gsi-8",
    });

    expect(parsed).toMatchObject({
      format: "gsi-8",
      file: "traverse-field.gsi",
      total_records: 3,
      parser_summary: {
        format: "gsi-8",
        total_records: 3,
        traverse_known_point_count: 2,
        traverse_observation_count: 1,
        quality_status: "parsed",
      },
      import_preflight: {
        target_workflow: "traverse_adjust",
        ready_for_adjustment: true,
        required_fields_present: [
          "known_points",
          "observations",
          "from",
          "to",
          "hz_angle_deg",
          "distance",
        ],
        missing_required_fields: [],
        recognized_fields: expect.arrayContaining([
          "point_id",
          "easting_m",
          "northing_m",
          "hz_angle_deg",
          "horiz_dist_m",
        ]),
        quality_status: "ready",
      },
      traverse_adjustment_input: {
        known_points: [
          { name: "S", x: 0, y: 0, fixed: true },
          { name: "E", x: 100, y: 0, fixed: true },
        ],
        observations: [{ from: "S", to: "P1", hz_angle_deg: 270, horizontal_dist_m: 100 }],
        params: {
          start_azimuth_deg: 0,
          end_azimuth_deg: 0,
          model: "normal",
        },
      },
    });

    const adjusted = await callTool(
      "survey_traverse_adjust",
      parsed.traverse_adjustment_input as Record<string, unknown>,
    );
    expect(adjusted).toMatchObject({
      method: "traverse_bowditch_adjustment",
      point_count: 1,
      observation_count: 1,
      points: [expect.objectContaining({ name: "P1" })],
    });
  });

  it("normalizes mixed benchmark and segment DAT tables into PRD leveling adjustment input", async () => {
    const parsed = await callTool("format_parser", {
      rawText: [
        "类型,点号,高程(m),起点,终点,高差(m),测段长度(m),测站数,定权方式",
        "已知,BM1,100,,,,,,length",
        "测段,,,BM1,TP1,1.234,60,1,",
        "测段,,,TP1,BM2,1.234,50,1,",
      ].join("\n"),
      sourceName: "level-mixed-table.dat",
      format: "dat-auto",
    });

    expect(parsed).toMatchObject({
      format: "dat",
      file: "level-mixed-table.dat",
      total_records: 3,
      parser_summary: {
        format: "dat",
        total_records: 3,
        level_benchmark_count: 1,
        level_segment_count: 2,
        quality_status: "parsed",
      },
      import_preflight: {
        target_workflow: "level_adjust",
        ready_for_adjustment: true,
        required_fields_present: ["known_bms", "segments", "from", "to", "dh_m"],
        missing_required_fields: [],
        recognized_fields: expect.arrayContaining([
          "record_kind",
          "point_id",
          "elevation_m",
          "from",
          "to",
          "height_diff_m",
          "length_km",
          "n_stations",
        ]),
        quality_status: "ready",
      },
      level_adjustment_input: {
        known_bms: [{ name: "BM1", h: 100, fixed: true }],
        segments: [
          { from: "BM1", to: "TP1", dh_m: 1.234, length_km: 0.06, n_stations: 1 },
          { from: "TP1", to: "BM2", dh_m: 1.234, length_km: 0.05, n_stations: 1 },
        ],
        weight_mode: "length",
      },
    });
    expect(parsed.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "field_coordinate_record",
          record_kind: "coordinate",
          point_id: "BM1",
          elevation_m: 100,
        }),
        expect.objectContaining({
          row_type: "field_observation_record",
          record_kind: "level_segment",
          point_id: "BM1-TP1",
          from: "BM1",
          to: "TP1",
          height_diff_m: 1.234,
          horiz_dist_m: 60,
          length_km: 0.06,
          n_stations: 1,
        }),
      ]),
    );

    const adjusted = await callTool(
      "level_adjust",
      parsed.level_adjustment_input as Record<string, unknown>,
    );
    expect(adjusted).toMatchObject({
      method: "least_squares_level_adjustment",
      segment_count: 2,
      unknown_point_count: 2,
    });
  });

  it("reports import preflight gaps for incomplete PRD leveling DAT field tables", async () => {
    const parsed = await callTool("format_parser", {
      rawText: [
        "类型,点号,高程(m),起点,终点,测段长度(m)",
        "已知,BM1,100,,,",
        "测段,,,BM1,TP1,60",
      ].join("\n"),
      sourceName: "level-incomplete-table.dat",
      format: "dat-auto",
    });

    expect(parsed).toMatchObject({
      format: "dat",
      total_records: 2,
      parser_summary: {
        level_benchmark_count: 1,
        level_segment_count: 0,
        quality_status: "review",
      },
      import_preflight: {
        target_workflow: "level_adjust",
        ready_for_adjustment: false,
        required_fields_present: ["known_bms"],
        missing_required_fields: ["segments", "dh_m"],
        recognized_fields: expect.arrayContaining([
          "record_kind",
          "point_id",
          "elevation_m",
          "from",
          "to",
          "length_km",
        ]),
        quality_status: "review_missing_fields",
      },
    });
    expect(parsed).not.toHaveProperty("level_adjustment_input");
  });

  it("parses PRD IO-03 Survey Cloud records arrays as adjustment-ready field data", async () => {
    const parsed = await callTool("format_parser", {
      rawText: JSON.stringify({
        project: "Rail transit indoor adjustment exchange",
        records: [
          {
            record_kind: "coordinate",
            point_id: "CP0",
            easting_m: 500000.12345,
            northing_m: 3200000.54321,
            elevation_m: 12.34567,
            fixed: true,
          },
          {
            record_kind: "coordinate",
            point_id: "BM1",
            elevation_m: 20.1256,
            fixed: true,
          },
          {
            record_kind: "traverse_observation",
            from: "CP0",
            to: "CP1",
            hz_angle_deg: 102.1234567,
            slope_dist_m: 45.67924,
            horiz_dist_m: 45.67891,
            height_diff_m: "0.01234",
          },
          {
            record_kind: "level_segment",
            from: "BM1",
            to: "BM2",
            height_diff_m: -0.03456,
            length_m: 350,
            n_stations: 4,
          },
        ],
      }),
      sourceName: "survey-cloud-records.json",
      format: "survey-cloud-json",
    });

    expect(parsed).toMatchObject({
      format: "survey-cloud-json",
      file: "survey-cloud-records.json",
      total_records: 4,
      coordinate_point_count: 1,
      parser_summary: {
        format: "survey-cloud-json",
        total_records: 4,
        angle_observation_count: 1,
        distance_observation_count: 2,
        quality_status: "parsed",
      },
    });
    expect(parsed.records as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          record_kind: "coordinate",
          point_id: "CP0",
          easting_m: 500000.1235,
          northing_m: 3200000.5432,
          elevation_m: 12.3457,
        }),
        expect.objectContaining({
          record_kind: "coordinate",
          point_id: "BM1",
          elevation_m: 20.1256,
        }),
        expect.objectContaining({
          record_kind: "traverse_observation",
          point_id: "CP1",
          from: "CP0",
          to: "CP1",
          hz_angle_deg: 102.123457,
          slope_dist_m: 45.6792,
          horiz_dist_m: 45.6789,
          height_diff_m: 0.0123,
        }),
        expect.objectContaining({
          record_kind: "level_segment",
          point_id: "BM1-BM2",
          from: "BM1",
          to: "BM2",
          height_diff_m: -0.0346,
          horiz_dist_m: 350,
          length_km: 0.35,
          n_stations: 4,
        }),
      ]),
    );
    expect(parsed.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "field_coordinate_record",
          record_kind: "coordinate",
          point_id: "BM1",
          elevation_m: 20.1256,
        }),
        expect.objectContaining({
          row_type: "field_observation_record",
          record_kind: "level_segment",
          point_id: "BM1-BM2",
          from: "BM1",
          to: "BM2",
          height_diff_m: -0.0346,
          horiz_dist_m: 350,
          length_km: 0.35,
          n_stations: 4,
        }),
      ]),
    );
  });

  it("parses PRD IO-03 Survey Cloud export_rows arrays as adjustment-ready field data", async () => {
    const parsed = await callTool("format_parser", {
      rawText: JSON.stringify({
        project: "Rail transit parser export rows",
        export_rows: [
          {
            row_type: "field_coordinate_record",
            record_kind: "coordinate",
            point_id: "CP0",
            easting_m: 500000,
            northing_m: 3200000,
            elevation_m: 12.3,
          },
          {
            row_type: "field_observation_record",
            record_kind: "traverse_observation",
            from: "CP0",
            to: "CP1",
            point_id: "CP1",
            hz_angle_deg: 101.25,
            horiz_dist_m: 45.5,
          },
          {
            row_type: "field_observation_record",
            record_kind: "level_segment",
            from: "BM1",
            to: "BM2",
            point_id: "BM1-BM2",
            height_diff_m: 0.012,
            length_km: 0.25,
            n_stations: 5,
          },
        ],
      }),
      sourceName: "survey-cloud-export-rows.json",
      format: "survey-cloud-json",
    });

    expect(parsed).toMatchObject({
      format: "survey-cloud-json",
      file: "survey-cloud-export-rows.json",
      total_records: 3,
      coordinate_point_count: 1,
      parser_summary: {
        format: "survey-cloud-json",
        total_records: 3,
        angle_observation_count: 1,
        distance_observation_count: 2,
        quality_status: "parsed",
      },
    });
    expect(parsed.records as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          record_kind: "coordinate",
          point_id: "CP0",
          easting_m: 500000,
          northing_m: 3200000,
          elevation_m: 12.3,
        }),
        expect.objectContaining({
          record_kind: "traverse_observation",
          point_id: "CP1",
          from: "CP0",
          to: "CP1",
          hz_angle_deg: 101.25,
          horiz_dist_m: 45.5,
        }),
        expect.objectContaining({
          record_kind: "level_segment",
          point_id: "BM1-BM2",
          from: "BM1",
          to: "BM2",
          height_diff_m: 0.012,
          horiz_dist_m: 250,
          length_km: 0.25,
          n_stations: 5,
        }),
      ]),
    );
  });

  it("exports field distance observations into named workbook and report sections", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "railwise-field-distance-export-"));
    const xlsxPath = join(tempRoot, "field-distance-observations.xlsx");
    const markdownPath = join(tempRoot, "field-distance-observations.md");

    try {
      const parsed = await callTool("format_parser", {
        rawText: [
          "点号,水平角,竖直角,斜距(m),水平距(m),高差(m)",
          "GJ-1,123.4567,88.5,35.120,35.108,0.987",
          "GJ-2,124.0000,89.0,36.000,35.995,0.500",
        ].join("\n"),
        sourceName: "polar-observations.dat",
        format: "dat-auto",
      });
      const distanceObservation = await callTool("distance_calculator", {
        csvText: parsed.distance_observation_csv as string,
      });

      const workbook = await callTool("excel_export", {
        title: "外业距离观测复核",
        outputPath: xlsxPath,
        sourceTool: "distance_calculator",
        summary: distanceObservation.survey_distance_summary,
        exportRows: distanceObservation.export_rows,
      });
      expect(workbook).toMatchObject({
        export_summary: {
          row_type_counts: {
            survey_distance_observation: 2,
          },
          generated_sheets: expect.arrayContaining(["外业距离观测"]),
        },
      });
      expect(workbook.sheets as Array<Record<string, unknown>>).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "外业距离观测", rows: 2 })]),
      );

      const report = await callTool("report_export", {
        title: "外业距离观测复核",
        outputPath: markdownPath,
        format: "markdown",
        sourceTool: "distance_calculator",
        summary: distanceObservation.survey_distance_summary,
        exportRows: distanceObservation.export_rows,
      });
      expect(report).toMatchObject({
        report_summary: {
          row_type_counts: {
            survey_distance_observation: 2,
          },
        },
      });
      const markdown = readFileSync(markdownPath, "utf8");
      expect(markdown).toContain("### 外业距离观测");
      expect(markdown).toContain("survey_distance_observation");
      expect(markdown).toContain("GJ-1");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("parses DAT field observations with Unicode and full-width signed numbers", async () => {
    const parsed = await callTool("format_parser", {
      rawText: [
        "点号,水平角,竖直角,斜距(m),水平距(m),高差(m)",
        "GJ-1,123.4567,88.5,35.120,35.108,－0.987",
        "GJ-2,124.0000,89.0,36.000,35.995,−0.500",
      ].join("\n"),
      sourceName: "polar-observations-signed.dat",
      format: "dat-auto",
    });

    expect(parsed.distance_observation_records as Array<Record<string, unknown>>).toEqual([
      expect.objectContaining({
        point_id: "GJ-1",
        height_diff_m: -0.987,
      }),
      expect.objectContaining({
        point_id: "GJ-2",
        height_diff_m: -0.5,
      }),
    ]);
    expect(parsed.distance_observation_csv).toContain("GJ-1,35.12,35.108,88.5,-0.987");
    expect(parsed.distance_observation_csv).toContain("GJ-2,36,35.995,89,-0.5");
    expect(parsed.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "field_observation_record",
          point_id: "GJ-1",
          height_diff_m: -0.987,
        }),
        expect.objectContaining({
          row_type: "field_observation_record",
          point_id: "GJ-2",
          height_diff_m: -0.5,
        }),
      ]),
    );
  });

  it("parses quoted DAT rows with thousands separators and unit suffix values", async () => {
    const parsed = await callTool("format_parser", {
      rawText: [
        "点号,东坐标(m),北坐标(m),高程(m),水平距(m)",
        '"K1,右线","500,000.123","3,200,000.456","12.345 m","35.2 m"',
      ].join("\n"),
      sourceName: "quoted-total-station.dat",
      format: "dat-auto",
    });

    expect(parsed).toMatchObject({
      format: "dat",
      total_records: 1,
      coordinate_point_count: 1,
      parser_summary: {
        coordinate_point_count: 1,
        distance_observation_count: 1,
        quality_status: "parsed",
      },
    });
    expect((parsed.records as Array<Record<string, unknown>>)[0]).toMatchObject({
      point_id: "K1,右线",
      easting_m: 500000.123,
      northing_m: 3200000.456,
      elevation_m: 12.345,
      horiz_dist_m: 35.2,
    });
    expect((parsed.export_rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      row_type: "field_coordinate_record",
      point_id: "K1,右线",
      easting_m: 500000.123,
      northing_m: 3200000.456,
      elevation_m: 12.345,
      horiz_dist_m: 35.2,
    });
  });

  it("imports Chinese control-network repeated coordinate observations from CSV", async () => {
    const control = await callTool("control_network", {
      csvText: [
        "点号,东坐标(m),北坐标(m),权",
        "K1,100,200,1",
        "K1,100.002,199.998,1",
        "K2,101,201,2",
        "K2,101.001,201.001,1",
      ].join("\n"),
    });
    const sqrt2Mm = Number(Math.SQRT2.toFixed(3));

    expect(control).toMatchObject({
      mode: "coordinate_observations",
      input_format: "csv",
      parsed_row_count: 4,
      point_count: 2,
      observation_count: 4,
      max_point_rmse_mm: sqrt2Mm,
      max_residual_mm: sqrt2Mm,
      quality_status: "review_residuals",
      precision_summary: {
        point_count: 2,
        observation_count: 4,
        max_point_rmse_mm: sqrt2Mm,
        max_residual_mm: sqrt2Mm,
      },
    });
    expect((control.adjusted as Array<Record<string, unknown>>)[0]).toMatchObject({
      point_id: "K1",
      adjusted_x: 100.001,
      adjusted_y: 199.999,
      observation_count: 2,
      weight_sum: 2,
      max_residual_mm: sqrt2Mm,
    });
    expect((control.adjusted as Array<Record<string, unknown>>)[1]).toMatchObject({
      point_id: "K2",
      adjusted_x: 101.000333,
      adjusted_y: 201.000333,
      observation_count: 2,
      weight_sum: 3,
      max_residual_mm: 0.943,
    });
    expect(control.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "control_network_coordinate_point",
        point_id: "K1",
        adjusted_x_m: 100.001,
        adjusted_y_m: 199.999,
        observation_count: 2,
        weight_sum: 2,
        rmse_mm: sqrt2Mm,
        max_residual_mm: sqrt2Mm,
      },
      {
        row_type: "control_network_coordinate_point",
        point_id: "K2",
        adjusted_x_m: 101.000333,
        adjusted_y_m: 201.000333,
        observation_count: 2,
        weight_sum: 3,
        rmse_mm: 0.746,
        max_residual_mm: 0.943,
      },
    ]);
  });

  it("parses core survey calculation CSV values with full-width digits and unit suffixes", async () => {
    const control = await callTool("control_network", {
      csvText: [
        "点号,东坐标(m),北坐标(m),权",
        "KF-1,１００．０００ m,２００．０００ m,１",
        "KF-1,１００．００２ m,１９９．９９８ m,１",
      ].join("\n"),
    });

    const sqrt2Mm = Number(Math.SQRT2.toFixed(3));
    expect(control).toMatchObject({
      mode: "coordinate_observations",
      input_format: "csv",
      parsed_row_count: 2,
      point_count: 1,
      observation_count: 2,
      max_point_rmse_mm: sqrt2Mm,
    });
    expect((control.adjusted as Array<Record<string, unknown>>)[0]).toMatchObject({
      point_id: "KF-1",
      adjusted_x: 100.001,
      adjusted_y: 199.999,
      max_residual_mm: sqrt2Mm,
    });

    const cpiii = await callTool("cpiii_adjustment", {
      csvText: [
        "点号,设计东坐标,设计北坐标,设计高程,dE(mm),dN(mm),dH(mm),平面限差(mm),高程限差(mm)",
        "CPF-1,１，０００．０００ m,２，０００．０００ m,１０．０００ m,３ mm,－４ mm,２ mm,５ mm,３ mm",
      ].join("\n"),
    });

    expect(cpiii).toMatchObject({
      input_format: "csv",
      parsed_row_count: 1,
      tolerance_mm: 5,
      vertical_tolerance_mm: 3,
      point_count: 1,
      failed_points: [],
      max_error_mm: 5,
      max_vertical_error_mm: 2,
    });
    expect((cpiii.export_rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      point_id: "CPF-1",
      design_x_m: 1000,
      design_y_m: 2000,
      measured_x_m: 1000.003,
      measured_y_m: 1999.996,
      dx_mm: 3,
      dy_mm: -4,
      dz_mm: 2,
      is_passed: true,
    });
  });

  it("auto-detects semicolon-delimited CSV for core survey and monitoring calculations", async () => {
    const control = await callTool("control_network", {
      csvText: [
        "点号;东坐标(m);北坐标(m);权",
        "KS-1;100.000;200.000;1",
        "KS-1;100.002;199.998;1",
      ].join("\n"),
    });

    const sqrt2Mm = Number(Math.SQRT2.toFixed(3));
    expect(control).toMatchObject({
      mode: "coordinate_observations",
      input_format: "csv",
      parsed_row_count: 2,
      point_count: 1,
      observation_count: 2,
      max_point_rmse_mm: sqrt2Mm,
    });

    const cpiii = await callTool("cpiii_adjustment", {
      csvText: [
        "点号;设计东坐标;设计北坐标;设计高程;dE(mm);dN(mm);dH(mm);平面限差(mm);高程限差(mm)",
        "CPS-1;1000;2000;10;3;-4;2;5;3",
      ].join("\n"),
    });

    expect(cpiii).toMatchObject({
      input_format: "csv",
      parsed_row_count: 1,
      point_count: 1,
      failed_points: [],
      max_error_mm: 5,
      max_vertical_error_mm: 2,
    });

    const deformation = await callTool("deformation_rate", {
      csvText: [
        "测点编号;观测日期;累计沉降(mm);累计预警值(mm);速率预警值(mm/d)",
        "JCS-1;2026-06-01;0;30;5",
        "JCS-1;2026-06-04;18;30;5",
        "JCS-1;2026-06-07;36;30;5",
      ].join("\n"),
      predictionDays: 1,
    });

    expect(deformation).toMatchObject({
      mode: "multi_point_csv",
      table_format: "long",
      parsed_observation_count: 3,
      alert_points: ["JCS-1"],
      max_abs_latest_rate_mm_per_day: 6,
    });

    const levelingAdjustment = await callTool("calculator_leveling_adjustment", {
      csvText: [
        "类型;点号;高程;起点;终点;高差(m);测段距离(km);等级",
        "已知;BM1;100;;;;;2nd",
        "观测;L1;;BM1;P1;1.234;1;",
        "观测;L2;;BM1;P1;1.236;1;",
      ].join("\n"),
    });

    expect(levelingAdjustment).toMatchObject({
      input_format: "csv",
      parsed_row_count: 3,
      known_points: 1,
      unknown_points: 1,
      observations: 2,
      max_point_rmse_mm: 1,
    });
  });

  it("imports Chinese control-network traverse closure rows from CSV", async () => {
    const traverse = await callTool("control_network", {
      csvText: [
        "类型,点号,东坐标(m),北坐标(m),边长(m),方位角(°),闭合差限差(mm)",
        "起点,K0,0,0,,,30",
        "导线,K1,,,50,0,",
        "导线,K2,,,50,90,",
        "导线,K3,,,50,0,",
        "导线,K4,,,49.98,90,",
        "终点,K4,100,100,,,",
      ].join("\n"),
    });

    expect(traverse).toMatchObject({
      mode: "traverse_closure",
      input_format: "csv",
      parsed_row_count: 6,
      leg_count: 4,
      total_distance_m: 199.98,
      closure_dx_mm: -20,
      closure_dy_mm: 0,
      closure_error_mm: 20,
      is_passed: true,
    });
    expect((traverse.adjusted_points as Array<Record<string, unknown>>).at(-1)).toMatchObject({
      point_id: "K4",
      adjusted_x: 100,
      adjusted_y: 100,
      correction_x_mm: 20,
      correction_y_mm: 0,
    });
  });

  it("adjusts an attached leveling route from control-network CSV height differences", async () => {
    const leveling = await callTool("control_network", {
      csvText: [
        "role,id,z,observationType,from,to,value,distanceKm",
        "known,BM1,100,,,,,",
        "known,BM2,101,,,,,",
        "observation,L1,,height_difference,BM1,TP1,0.302,0.50",
        "observation,L2,,height_difference,TP1,TP2,0.401,1.00",
        "observation,L3,,height_difference,TP2,BM2,0.301,0.50",
      ].join("\n"),
    });

    expect(leveling).toMatchObject({
      mode: "leveling_route_closure",
      input_format: "csv",
      parsed_row_count: 5,
      segment_count: 3,
      start_point: "BM1",
      end_point: "BM2",
      observed_height_difference_m: 1.004,
      known_height_difference_m: 1,
      closure_error_mm: 4,
      total_leveling_distance_km: 2,
      closure_per_sqrt_km_mm: 2.828,
      is_passed: true,
    });
    expect((leveling.segment_details as Array<Record<string, unknown>>)[0]).toMatchObject({
      row_type: "leveling_route_segment",
      observation_id: "L1",
      from: "BM1",
      to: "TP1",
      correction_mm: -1,
      adjusted_height_difference_m: 0.301,
    });
    expect((leveling.segment_details as Array<Record<string, unknown>>)[1]).toMatchObject({
      observation_id: "L2",
      correction_mm: -2,
      adjusted_height_difference_m: 0.399,
    });
    expect(
      (leveling.adjusted_points as Array<Record<string, unknown>>).find(
        (row) => row.point_id === "TP1",
      ),
    ).toMatchObject({
      adjusted_z_m: 100.301,
    });
    expect(
      (leveling.adjusted_points as Array<Record<string, unknown>>).find(
        (row) => row.point_id === "TP2",
      ),
    ).toMatchObject({
      adjusted_z_m: 100.7,
    });
    expect(leveling.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "leveling_route_segment",
          observation_id: "L3",
          correction_mm: -1,
          adjusted_height_difference_m: 0.3,
        }),
        expect.objectContaining({
          row_type: "leveling_route_point",
          point_id: "BM2",
          adjusted_z_m: 101,
        }),
      ]),
    );
  });

  it("matches shipped PRD indoor adjustment benchmark fixtures", async () => {
    const fixture = <T>(name: string): T =>
      JSON.parse(readFileSync(resolve("tests/fixtures/engineering", name), "utf8")) as T;
    const traverseFixture = fixture<{
      tool: "survey_traverse_adjust";
      input: Record<string, unknown>;
      expected: {
        method: string;
        observation_count: number;
        total_distance_m: number;
        coordinate_closure_mm: number;
        adjusted_points: Record<string, { x: number; y: number; point_mse_mm: number }>;
        error_ellipses: Record<string, { semi_major_mm: number; semi_minor_mm: number }>;
      };
    }>("indoor-traverse-known-baseline.json");
    const levelFixture = fixture<{
      tool: "survey_level_adjust";
      input: Record<string, unknown>;
      expected: {
        method: string;
        weight_mode: string;
        redundancy: number;
        unit_weight_mse_mm: number;
        adjusted_heights: Record<string, { h: number; mh: number }>;
        segment_residuals_mm: number[];
      };
    }>("indoor-level-known-baseline.json");

    const traverse = await callTool(traverseFixture.tool, traverseFixture.input);

    expect(traverse).toMatchObject({
      method: traverseFixture.expected.method,
      observation_count: traverseFixture.expected.observation_count,
      total_distance_m: traverseFixture.expected.total_distance_m,
      closures: expect.objectContaining({
        coord_mm: traverseFixture.expected.coordinate_closure_mm,
      }),
    });
    for (const [pointName, expectedPoint] of Object.entries(
      traverseFixture.expected.adjusted_points,
    )) {
      const point = (traverse.points as Array<Record<string, unknown>>).find(
        (row) => row.name === pointName,
      );
      expect(point, pointName).toBeTruthy();
      expect(point?.x, pointName).toBeCloseTo(expectedPoint.x, 4);
      expect(point?.y, pointName).toBeCloseTo(expectedPoint.y, 4);
      expect(point?.point_mse, pointName).toBeCloseTo(expectedPoint.point_mse_mm, 3);
    }
    for (const [pointName, expectedEllipse] of Object.entries(
      traverseFixture.expected.error_ellipses,
    )) {
      const ellipse = (traverse.export_rows as Array<Record<string, unknown>>).find(
        (row) => row.row_type === "traverse_error_ellipse" && row.point_name === pointName,
      );
      expect(ellipse, pointName).toBeTruthy();
      expect(ellipse?.semi_major_mm, pointName).toBeCloseTo(expectedEllipse.semi_major_mm, 3);
      expect(ellipse?.semi_minor_mm, pointName).toBeCloseTo(expectedEllipse.semi_minor_mm, 3);
    }

    const leveling = await callTool(levelFixture.tool, levelFixture.input);

    expect(leveling).toMatchObject({
      method: levelFixture.expected.method,
      weight_mode: levelFixture.expected.weight_mode,
      redundancy: levelFixture.expected.redundancy,
      unit_weight_mse_mm: levelFixture.expected.unit_weight_mse_mm,
    });
    for (const [pointName, expectedPoint] of Object.entries(
      levelFixture.expected.adjusted_heights,
    )) {
      const point = (leveling.points as Array<Record<string, unknown>>).find(
        (row) => row.name === pointName,
      );
      expect(point, pointName).toBeTruthy();
      expect(point?.h, pointName).toBeCloseTo(expectedPoint.h, 4);
      expect(point?.mh, pointName).toBeCloseTo(expectedPoint.mh, 3);
    }
    const residualRows = (leveling.export_rows as Array<Record<string, unknown>>).filter(
      (row) => row.row_type === "level_adjust_segment_residual",
    );
    expect(residualRows).toHaveLength(levelFixture.expected.segment_residuals_mm.length);
    for (const [index, expectedResidual] of levelFixture.expected.segment_residuals_mm.entries()) {
      expect(residualRows[index]?.residual_mm, `level residual ${index + 1}`).toBeCloseTo(
        expectedResidual,
        3,
      );
    }
  });

  it("adjusts GNSS baseline vectors from control-network CSV field books", async () => {
    const gnss = await callTool("control_network", {
      csvText: [
        "类型,点号,东坐标,北坐标,高程,观测类型,起点,终点,ΔX(m),ΔY(m),ΔZ(m),σX(mm),σY(mm),σZ(mm)",
        "已知,A,0,0,0,,,,,,,,,",
        "已知,B,100,0,5,,,,,,,,,",
        "待定,P,49.8,40.2,3.7,,,,,,,,,",
        "观测,BL-A-P,,,,GNSS基线,A,P,50.001,40.000,4.000,2,3,4",
        "观测,BL-B-P,,,,GNSS基线,B,P,-50.000,40.002,-1.000,2,3,4",
      ].join("\n"),
    });

    expect(gnss).toMatchObject({
      mode: "gnss_baseline_adjustment",
      input_format: "csv",
      parsed_row_count: 5,
      known_point_count: 2,
      adjusted_point_count: 1,
      baseline_count: 2,
      observation_component_count: 6,
      max_abs_component_residual_mm: 1,
    });
    expect((gnss.adjusted_points as Array<Record<string, unknown>>)[0]).toMatchObject({
      row_type: "gnss_point",
      point_id: "P",
      adjusted_x: 50.0005,
      adjusted_y: 40.001,
      adjusted_z: 4,
    });
    expect((gnss.baseline_residuals as Array<Record<string, unknown>>)[0]).toMatchObject({
      row_type: "gnss_baseline_residual",
      observation_id: "BL-A-P",
      from: "A",
      to: "P",
      residual_dx_mm: 0.5,
      residual_dy_mm: -1,
      residual_dz_mm: 0,
      sigma_x_mm: 2,
      sigma_y_mm: 3,
      sigma_z_mm: 4,
    });
    expect(gnss.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "gnss_point",
          point_id: "P",
          adjusted_x: 50.0005,
        }),
        expect.objectContaining({
          row_type: "gnss_baseline_residual",
          observation_id: "BL-B-P",
          residual_dy_mm: 1,
        }),
      ]),
    );
  });

  it("checks direction-round field book quality from control-network CSV", async () => {
    const direction = await callTool("control_network", {
      csvText: [
        "类型,点号,观测类型,测站,照准点,方向组,测回号,盘位,观测顺序,方向读数,测角中误差",
        "观测,D-A-B-L1,方向,A,B,A-R1,1,盘左,1,0°00′00″,2",
        "观测,D-A-P-L1,方向,A,P1,A-R1,1,盘左,2,323°07′48.367″,2",
        "观测,D-A-B-L2,方向,A,B,A-R1,1,盘左,3,0°00′01″,2",
        "观测,D-A-B-R1,方向,A,B,A-R1,1,盘右,4,180°00′02″,2",
        "观测,D-A-P-R1,方向,A,P1,A-R1,1,盘右,5,143°07′50.367″,2",
        "观测,D-A-B-R2,方向,A,B,A-R1,1,盘右,6,180°00′03″,2",
      ].join("\n"),
    });

    expect(direction).toMatchObject({
      mode: "direction_round_quality",
      input_format: "csv",
      parsed_row_count: 6,
      direction_group_count: 1,
      direction_observation_count: 6,
      direction_face_pair_count: 2,
      direction_zero_closure_count: 2,
      max_face_difference_arcsec: 2,
      max_zero_closure_arcsec: 1,
      quality_status: "pass",
      direction_quality_summary: {
        group_count: 1,
        observation_count: 6,
        face_pair_count: 2,
        zero_closure_count: 2,
        max_face_difference_arcsec: 2,
        max_zero_closure_arcsec: 1,
        quality_status: "pass",
      },
    });
    expect(direction.face_pair_checks as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "direction_face_pair_check",
          group_id: "A-R1",
          from: "A",
          to: "P1",
          difference_arcsec: 2,
          quality_status: "pass",
        }),
      ]),
    );
    expect(direction.zero_closure_checks as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "direction_zero_closure_check",
          group_id: "A-R1",
          from: "A",
          to: "B",
          face: "left",
          zero_closure_arcsec: 1,
          quality_status: "pass",
        }),
      ]),
    );
    expect(direction.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row_type: "direction_round_summary", group_id: "A-R1" }),
        expect.objectContaining({ row_type: "direction_face_pair_check", to: "P1" }),
        expect.objectContaining({ row_type: "direction_zero_closure_check", face: "right" }),
      ]),
    );
  });

  it("returns summary and export rows for control-network traverse closure", async () => {
    const traverse = await callTool("control_network", {
      traverse: {
        start: { id: "K0", x: 0, y: 0 },
        end: { id: "K4", x: 100, y: 100 },
        closureToleranceMm: 30,
        legs: [
          { to: "K1", distance: 50, azimuthDegrees: 0 },
          { to: "K2", distance: 50, azimuthDegrees: 90 },
          { to: "K3", distance: 50, azimuthDegrees: 0 },
          { to: "K4", distance: 49.98, azimuthDegrees: 90 },
        ],
      },
    });

    expect(traverse.traverse_closure_summary).toMatchObject({
      leg_count: 4,
      point_count: 5,
      total_distance_m: 199.98,
      closure_dx_mm: -20,
      closure_dy_mm: 0,
      closure_error_mm: 20,
      closure_tolerance_mm: 30,
      relative_closure_ratio: 9999,
      quality_status: "pass",
      is_passed: true,
    });
    expect(traverse.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "control_network_traverse_point",
        point_id: "K0",
        raw_x_m: 0,
        raw_y_m: 0,
        adjusted_x_m: 0,
        adjusted_y_m: 0,
        cumulative_distance_m: 0,
        correction_x_mm: 0,
        correction_y_mm: 0,
      },
      {
        row_type: "control_network_traverse_point",
        point_id: "K1",
        raw_x_m: 0,
        raw_y_m: 50,
        adjusted_x_m: 0.005001,
        adjusted_y_m: 50,
        cumulative_distance_m: 50,
        correction_x_mm: 5.001,
        correction_y_mm: 0,
      },
      {
        row_type: "control_network_traverse_point",
        point_id: "K2",
        raw_x_m: 50,
        raw_y_m: 50,
        adjusted_x_m: 50.010001,
        adjusted_y_m: 50,
        cumulative_distance_m: 100,
        correction_x_mm: 10.001,
        correction_y_mm: 0,
      },
      {
        row_type: "control_network_traverse_point",
        point_id: "K3",
        raw_x_m: 50,
        raw_y_m: 100,
        adjusted_x_m: 50.015002,
        adjusted_y_m: 100,
        cumulative_distance_m: 150,
        correction_x_mm: 15.002,
        correction_y_mm: 0,
      },
      {
        row_type: "control_network_traverse_point",
        point_id: "K4",
        raw_x_m: 99.98,
        raw_y_m: 100,
        adjusted_x_m: 100,
        adjusted_y_m: 100,
        cumulative_distance_m: 199.98,
        correction_x_mm: 20,
        correction_y_mm: 0,
      },
    ]);
  });

  it("runs each engineering specialty tool against deterministic field-style fixtures", async () => {
    const control = await callTool("control_network", {
      observations: [
        { pointId: "K1", x: 100, y: 200, weight: 1 },
        { pointId: "K1", x: 100.002, y: 199.998, weight: 1 },
        { pointId: "K2", x: 101, y: 201, weight: 2 },
        { pointId: "K2", x: 101.001, y: 201.001, weight: 1 },
      ],
    });
    expect(control.point_count).toBe(2);
    expect((control.adjusted as Array<Record<string, unknown>>)[0]).toMatchObject({
      point_id: "K1",
      adjusted_x: 100.001,
      adjusted_y: 199.999,
    });

    const traverse = await callTool("control_network", {
      traverse: {
        start: { id: "K0", x: 0, y: 0 },
        end: { id: "K4", x: 100, y: 100 },
        closureToleranceMm: 30,
        legs: [
          { to: "K1", distance: 50, azimuthDegrees: 0 },
          { to: "K2", distance: 50, azimuthDegrees: 90 },
          { to: "K3", distance: 50, azimuthDegrees: 0 },
          { to: "K4", distance: 49.98, azimuthDegrees: 90 },
        ],
      },
    });
    expect(traverse).toMatchObject({
      mode: "traverse_closure",
      leg_count: 4,
      total_distance_m: 199.98,
      closure_dx_mm: -20,
      closure_dy_mm: 0,
      closure_error_mm: 20,
      is_passed: true,
    });
    const adjustedTraversePoints = traverse.adjusted_points as Array<Record<string, unknown>>;
    expect(adjustedTraversePoints.at(-1)).toMatchObject({
      point_id: "K4",
      adjusted_x: 100,
      adjusted_y: 100,
      correction_x_mm: 20,
      correction_y_mm: 0,
    });

    const cpiii = await callTool("cpiii_adjustment", {
      toleranceMm: 2,
      verticalToleranceMm: 3,
      points: [
        {
          id: "CP1",
          designX: 0,
          designY: 0,
          designZ: 10,
          measuredX: 0.001,
          measuredY: 0.001,
          measuredZ: 10.002,
        },
        {
          id: "CP2",
          designX: 0,
          designY: 0,
          designZ: 10,
          measuredX: 0.003,
          measuredY: 0.004,
          measuredZ: 10.001,
        },
        {
          id: "CP3",
          designX: 0,
          designY: 0,
          designZ: 10,
          measuredX: 0.001,
          measuredY: 0.001,
          measuredZ: 10.004,
        },
      ],
    });
    expect(cpiii.failed_points).toEqual(["CP2", "CP3"]);
    expect(cpiii.planar_failed_points).toEqual(["CP2"]);
    expect(cpiii.vertical_failed_points).toEqual(["CP3"]);
    expect(cpiii.max_error_mm).toBe(5);
    expect(cpiii.max_vertical_error_mm).toBe(4);
    expect(cpiii.deviation_summary).toMatchObject({
      point_count: 3,
      failed_count: 2,
      planar_failed_count: 1,
      vertical_failed_count: 1,
      max_planar_error_mm: 5,
      max_vertical_error_mm: 4,
      rms_planar_error_mm: 3.109,
      rms_vertical_error_mm: 2.646,
      quality_status: "review_failed_points",
    });
    expect((cpiii.details as Array<Record<string, unknown>>)[2]).toMatchObject({
      point_id: "CP3",
      dz_mm: 4,
      vertical_error_mm: 4,
      is_planar_passed: true,
      is_vertical_passed: false,
      is_passed: false,
    });
    const sqrt2Mm = Number(Math.SQRT2.toFixed(3));
    expect(cpiii.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "cpiii_deviation_point",
        point_id: "CP1",
        design_x_m: 0,
        design_y_m: 0,
        measured_x_m: 0.001,
        measured_y_m: 0.001,
        dx_mm: 1,
        dy_mm: 1,
        planar_error_mm: sqrt2Mm,
        planar_tolerance_mm: 2,
        is_planar_passed: true,
        design_z_m: 10,
        measured_z_m: 10.002,
        dz_mm: 2,
        vertical_error_mm: 2,
        vertical_tolerance_mm: 3,
        is_vertical_passed: true,
        is_passed: true,
      },
      {
        row_type: "cpiii_deviation_point",
        point_id: "CP2",
        design_x_m: 0,
        design_y_m: 0,
        measured_x_m: 0.003,
        measured_y_m: 0.004,
        dx_mm: 3,
        dy_mm: 4,
        planar_error_mm: 5,
        planar_tolerance_mm: 2,
        is_planar_passed: false,
        design_z_m: 10,
        measured_z_m: 10.001,
        dz_mm: 1,
        vertical_error_mm: 1,
        vertical_tolerance_mm: 3,
        is_vertical_passed: true,
        is_passed: false,
      },
      {
        row_type: "cpiii_deviation_point",
        point_id: "CP3",
        design_x_m: 0,
        design_y_m: 0,
        measured_x_m: 0.001,
        measured_y_m: 0.001,
        dx_mm: 1,
        dy_mm: 1,
        planar_error_mm: sqrt2Mm,
        planar_tolerance_mm: 2,
        is_planar_passed: true,
        design_z_m: 10,
        measured_z_m: 10.004,
        dz_mm: 4,
        vertical_error_mm: 4,
        vertical_tolerance_mm: 3,
        is_vertical_passed: false,
        is_passed: false,
      },
    ]);

    const cpiiiCsv = await callTool("cpiii_adjustment", {
      csvText: [
        "点号,设计X(m),设计Y(m),设计高程(m),实测X(m),实测Y(m),实测高程(m),平面限差(mm),高程限差(mm)",
        "CP1,0,0,10,0.001,0.001,10.002,2,3",
        "CP2,0,0,10,0.003,0.004,10.001,2,3",
        "CP3,0,0,10,0.001,0.001,10.004,2,3",
      ].join("\n"),
    });
    expect(cpiiiCsv).toMatchObject({
      input_format: "csv",
      parsed_row_count: 3,
      tolerance_mm: 2,
      vertical_tolerance_mm: 3,
      point_count: 3,
      failed_points: ["CP2", "CP3"],
      planar_failed_points: ["CP2"],
      vertical_failed_points: ["CP3"],
      max_error_mm: 5,
      max_vertical_error_mm: 4,
    });

    const cpiiiEastNorthDeltaCsv = await callTool("cpiii_adjustment", {
      csvText: [
        "点号,左右线,行别,里程,设计东坐标,设计北坐标,设计高程,dE(mm),dN(mm),dH(mm),平面限差(mm),高程限差(mm),复测日期",
        "CP1,上行,右线,DK12+345,1000,2000,10,1,1,1,3,3,2026-06-01",
        "CP2,上行,右线,DK12+360,1001,2001,20,－4,−5,—4,3,3,2026-06-01",
      ].join("\n"),
    });
    expect(cpiiiEastNorthDeltaCsv).toMatchObject({
      input_format: "csv",
      parsed_row_count: 2,
      tolerance_mm: 3,
      vertical_tolerance_mm: 3,
      point_count: 2,
      failed_points: ["CP2"],
      planar_failed_points: ["CP2"],
      vertical_failed_points: ["CP2"],
      max_error_mm: 6.403,
      max_vertical_error_mm: 4,
    });
    expect(cpiiiEastNorthDeltaCsv.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          point_id: "CP1",
          measured_x_m: 1000.001,
          measured_y_m: 2000.001,
          dx_mm: 1,
          dy_mm: 1,
          dz_mm: 1,
          is_passed: true,
        }),
        expect.objectContaining({
          point_id: "CP2",
          measured_x_m: 1000.996,
          measured_y_m: 2000.995,
          dx_mm: -4,
          dy_mm: -5,
          dz_mm: -4,
          is_passed: false,
        }),
      ]),
    );

    const cpiiiRepeatedCsv = await callTool("cpiii_adjustment", {
      csvText: [
        "CPIII点号,复测日期,设计X,设计Y,设计高程,ΔX(mm),ΔY(mm),ΔH(mm),平面限差(mm),高程限差(mm)",
        "CP1,2026-06-01,0,0,10,1,1,1,3,3",
        "CP1,2026-06-02,0,0,10,3,1,3,3,3",
        "CP1,2026-06-03,0,0,10,2,2,2,3,3",
        "CP2,2026-06-01,1,1,20,6,0,4,3,3",
        "CP2,2026-06-02,1,1,20,6,2,4,3,3",
      ].join("\n"),
    });
    expect(cpiiiRepeatedCsv).toMatchObject({
      mode: "cpiii_repeated_observation_adjustment",
      input_format: "csv",
      parsed_row_count: 5,
      tolerance_mm: 3,
      vertical_tolerance_mm: 3,
      point_count: 2,
      observation_count: 5,
      failed_points: ["CP2"],
      planar_failed_points: ["CP2"],
      vertical_failed_points: ["CP2"],
      max_error_mm: 6.083,
      max_vertical_error_mm: 4,
      max_repeat_planar_residual_mm: 1.054,
      repeat_observation_summary: {
        adjusted_point_count: 2,
        observation_count: 5,
        max_repeat_planar_residual_mm: 1.054,
        quality_status: "review_failed_points",
      },
    });
    expect(cpiiiRepeatedCsv.adjusted_points as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "cpiii_adjusted_point",
          point_id: "CP1",
          adjusted_measured_x_m: 0.002,
          adjusted_measured_y_m: 0.001333,
          adjusted_measured_z_m: 10.002,
          planar_error_mm: 2.404,
          observation_count: 3,
          is_passed: true,
        }),
        expect.objectContaining({
          row_type: "cpiii_adjusted_point",
          point_id: "CP2",
          planar_error_mm: 6.083,
          vertical_error_mm: 4,
          observation_count: 2,
          is_passed: false,
        }),
      ]),
    );
    expect(cpiiiRepeatedCsv.observation_residuals as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "cpiii_observation_residual",
          point_id: "CP1",
          epoch: "2026-06-01",
          residual_x_mm: -1,
          planar_residual_mm: 1.054,
          residual_z_mm: -1,
        }),
      ]),
    );

    const inclinometer = await callTool("inclinometer", {
      readings: [
        { depth: 1, initialX: 0, currentX: 2, initialY: 0, currentY: 0 },
        { depth: 5, initialX: 0, currentX: 6, initialY: 0, currentY: 8 },
      ],
      alertThresholdMm: 8,
    });
    expect(inclinometer.max_depth_m).toBe(5);
    expect(inclinometer.max_displacement_mm).toBe(10);
    expect(inclinometer.is_alert).toBe(true);
    expect(inclinometer.inclinometer_reading_summary).toMatchObject({
      reading_count: 2,
      alert_count: 1,
      max_displacement_mm: 10,
      max_depth_m: 5,
      alert_threshold_mm: 8,
      quality_status: "alert",
      worst_depth: {
        depth_m: 5,
        resultant_mm: 10,
        is_alert: true,
      },
    });
    expect(inclinometer.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "inclinometer_reading_difference",
        depth_m: 1,
        dx_mm: 2,
        dy_mm: 0,
        resultant_mm: 2,
        alert_threshold_mm: 8,
        status: "pass",
        is_alert: false,
      },
      {
        row_type: "inclinometer_reading_difference",
        depth_m: 5,
        dx_mm: 6,
        dy_mm: 8,
        resultant_mm: 10,
        alert_threshold_mm: 8,
        status: "alert",
        is_alert: true,
      },
    ]);

    const inclinometerSeries = await callTool("inclinometer", {
      alertThresholdMm: 20,
      rateThresholdMmPerDay: 3,
      observations: [
        { boreholeId: "CX-1", date: "2026-06-01", depth: 6, xMm: 0, yMm: 0 },
        { boreholeId: "CX-1", date: "2026-06-04", depth: 6, xMm: 12, yMm: 0 },
        { boreholeId: "CX-1", date: "2026-06-07", depth: 6, xMm: 24, yMm: 0 },
        { boreholeId: "CX-1", date: "2026-06-01", depth: 2, xMm: 0, yMm: 0 },
        { boreholeId: "CX-1", date: "2026-06-07", depth: 2, xMm: 5, yMm: 0 },
      ],
    });
    expect(inclinometerSeries).toMatchObject({
      mode: "observation_series",
      borehole_count: 1,
      reading_count: 5,
      max_displacement_mm: 24,
      max_depth_m: 6,
      max_rate_mm_per_day: 4,
      alert_depths: ["CX-1@6"],
    });
    expect((inclinometerSeries.depth_summaries as Array<Record<string, unknown>>)[0]).toMatchObject(
      {
        borehole_id: "CX-1",
        depth_m: 6,
        cumulative_resultant_mm: 24,
        current_stage_resultant_mm: 12,
        current_rate_mm_per_day: 4,
        is_alert: true,
      },
    );

    const inclinometerCsv = await callTool("inclinometer", {
      csvText: [
        "测斜孔号,观测日期,深度(m),X向位移(mm),Y向位移(mm),累计预警值(mm),速率预警值(mm/d)",
        "CX-1,2026-06-01,6,0,0,20,3",
        "CX-1,2026-06-04,6,12,0,20,3",
        "CX-1,2026-06-07,6,24,0,20,3",
        "CX-1,2026-06-01,2,0,0,20,3",
        "CX-1,2026-06-07,2,5,0,20,3",
      ].join("\n"),
    });
    expect(inclinometerCsv).toMatchObject({
      mode: "observation_series",
      input_format: "csv",
      table_format: "long",
      parsed_row_count: 5,
      parsed_observation_count: 5,
      borehole_count: 1,
      reading_count: 5,
      max_displacement_mm: 24,
      max_depth_m: 6,
      max_rate_mm_per_day: 4,
      alert_threshold_mm: 20,
      rate_threshold_mm_per_day: 3,
      alert_depths: ["CX-1@6"],
    });
    expect((inclinometerCsv.depth_summaries as Array<Record<string, unknown>>)[0]).toMatchObject({
      borehole_id: "CX-1",
      depth_m: 6,
      cumulative_resultant_mm: 24,
      current_stage_resultant_mm: 12,
      current_rate_mm_per_day: 4,
      is_alert: true,
    });

    const inclinometerWideCsv = await callTool("inclinometer", {
      csvText: [
        "观测日期,CX-1 2m X向位移(mm),CX-1 2m Y向位移(mm),CX-1 6m X向位移(mm),CX-1 6m Y向位移(mm),累计预警值(mm),速率预警值(mm/d)",
        "2026-06-01,0,0,0,0,20,3",
        "2026-06-04,2,0,12,0,20,3",
        "2026-06-07,5,0,24,0,20,3",
      ].join("\n"),
    });
    expect(inclinometerWideCsv).toMatchObject({
      mode: "observation_series",
      input_format: "csv",
      table_format: "wide",
      parsed_row_count: 3,
      parsed_observation_count: 6,
      borehole_count: 1,
      reading_count: 6,
      max_displacement_mm: 24,
      max_depth_m: 6,
      max_rate_mm_per_day: 4,
      alert_threshold_mm: 20,
      rate_threshold_mm_per_day: 3,
      alert_depths: ["CX-1@6"],
    });
    expect(
      (inclinometerWideCsv.depth_summaries as Array<Record<string, unknown>>)[0],
    ).toMatchObject({
      borehole_id: "CX-1",
      depth_m: 6,
      cumulative_resultant_mm: 24,
      current_stage_resultant_mm: 12,
      current_rate_mm_per_day: 4,
      is_alert: true,
    });
    expect(inclinometerWideCsv.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "inclinometer_depth_summary",
          borehole_id: "CX-1",
          depth_m: 6,
          status: "alert",
        }),
        expect.objectContaining({
          row_type: "inclinometer_period_observation",
          borehole_id: "CX-1",
          depth_m: 2,
          date: "2026-06-07",
          x_mm: 5,
          stage_rate_mm_per_day: 1,
        }),
      ]),
    );

    const section = await callTool("cross_section", {
      design: [
        { offset: 0, elevation: 10 },
        { offset: 10, elevation: 10 },
      ],
      measured: [
        { offset: 0, elevation: 10.01 },
        { offset: 10, elevation: 9.99 },
      ],
    });
    expect(section.mode).toBe("section_profile_deviation");
    expect(section.max_positive_deviation_mm).toBe(10);
    expect(section.max_negative_deviation_mm).toBe(-10);
    for (const legacyField of [
      `max_o${"ver"}break_mm`,
      `max_u${"nder"}break_mm`,
      `signed_deviation_${"area"}_m2`,
      `positive_deviation_${"area"}_m2`,
      `negative_deviation_${"area"}_m2`,
    ]) {
      expect(section).not.toHaveProperty(legacyField);
    }
    expect(section.section_deviation_summary).toMatchObject({
      sample_count: 2,
      tolerance_mm: null,
      max_positive_deviation_mm: 10,
      max_negative_deviation_mm: -10,
      max_abs_deviation_mm: 10,
      mean_deviation_mm: 0,
      rms_deviation_mm: 10,
      quality_status: "未设限差",
      worst_offset_m: 0,
      worst_deviation_mm: 10,
    });
    expect((section.export_rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      row_type: "cross_section_profile_deviation",
      offset_m: 0,
      design_elevation_m: 10,
      measured_elevation_m: 10.01,
      deviation_mm: 10,
      status: "unchecked",
    });

    const sectionCsv = await callTool("cross_section", {
      csvText: [
        "类型,断面编号,偏距(m),高程(m),限差(mm)",
        "设计,DK12+345,-2,10,15",
        "设计,DK12+345,0,10,15",
        "设计,DK12+345,2,10,15",
        "实测,DK12+345,-2,10.006,15",
        "实测,DK12+345,0,10.018,15",
        "实测,DK12+345,2,9.994,15",
      ].join("\n"),
    });
    expect(sectionCsv).toMatchObject({
      mode: "section_profile_deviation_csv",
      input_format: "csv",
      parsed_row_count: 6,
      section_id: "DK12+345",
      sample_count: 3,
      tolerance_mm: 15,
      max_positive_deviation_mm: 18,
      max_negative_deviation_mm: -6,
      max_abs_deviation_mm: 18,
      failed_count: 1,
      failed_offsets_m: [0],
      quality_status: "超限",
      section_deviation_summary: {
        section_id: "DK12+345",
        sample_count: 3,
        failed_count: 1,
        pass_rate_pct: 66.667,
        max_abs_deviation_mm: 18,
        worst_offset_m: 0,
        worst_deviation_mm: 18,
      },
    });
    expect((sectionCsv.samples as Array<Record<string, unknown>>)[1]).toMatchObject({
      offset_m: 0,
      design_elevation_m: 10,
      measured_elevation_m: 10.018,
      deviation_mm: 18,
      is_passed: false,
    });
    expect((sectionCsv.export_rows as Array<Record<string, unknown>>)[1]).toMatchObject({
      row_type: "cross_section_profile_deviation",
      section_id: "DK12+345",
      offset_m: 0,
      deviation_mm: 18,
      tolerance_mm: 15,
      status: "alert",
      is_passed: false,
    });

    const stakeout = await callTool("line_stakeout", {
      station: { x: 0, y: 0 },
      backsight: { x: 0, y: 10 },
      stakeoutPoint: { id: "ZH-12", x: 10, y: 0 },
    });
    expect(stakeout.distance_m).toBe(10);
    expect(stakeout.backsight_azimuth_degrees).toBe(0);
    expect(stakeout.right_turn_angle_degrees).toBe(90);

    const stakeoutRecheck = await callTool("line_stakeout", {
      station: { x: 0, y: 0 },
      backsight: { x: 0, y: 10 },
      stakeoutPoint: { id: "ZH-13", x: 1000, y: 500 },
      measuredPoint: { x: 1000.012, y: 499.984 },
      toleranceMm: 20,
    });
    expect(stakeoutRecheck).toMatchObject({
      point_id: "ZH-13",
      recheck_dx_mm: 12,
      recheck_dy_mm: -16,
      planar_error_mm: 20,
      tolerance_mm: 20,
      is_passed: true,
    });

    const stakeoutCsv = await callTool("line_stakeout", {
      csvText: [
        "点号,测站X(m),测站Y(m),后视X(m),后视Y(m),设计X(m),设计Y(m),复测X(m),复测Y(m),限差(mm)",
        "ZH-13,0,0,0,10,1000,500,1000.012,499.984,20",
        "ZH-14,0,0,0,10,10,0,10.04,0,30",
      ].join("\n"),
    });
    expect(stakeoutCsv).toMatchObject({
      mode: "batch_recheck",
      input_format: "csv",
      parsed_row_count: 2,
      point_count: 2,
      failed_count: 1,
      failed_points: ["ZH-14"],
      max_planar_error_mm: 40,
    });
    const stakeoutCsvRows = stakeoutCsv.details as Array<Record<string, unknown>>;
    expect(stakeoutCsvRows[0]).toMatchObject({
      point_id: "ZH-13",
      distance_m: 1118.034,
      backsight_azimuth_degrees: 0,
      target_azimuth_degrees: 63.434949,
      right_turn_angle_degrees: 63.434949,
      recheck_dx_mm: 12,
      recheck_dy_mm: -16,
      planar_error_mm: 20,
      is_passed: true,
    });
    expect(stakeoutCsvRows[1]).toMatchObject({
      point_id: "ZH-14",
      distance_m: 10,
      right_turn_angle_degrees: 90,
      recheck_dx_mm: 40,
      recheck_dy_mm: 0,
      planar_error_mm: 40,
      tolerance_mm: 30,
      is_passed: false,
    });

    const trackGeometry = await callTool("track_geometry_review", {
      sectionLengthM: 10,
      designGaugeMm: 1435,
      designCantMm: 0,
      toleranceGaugeMm: 2,
      toleranceCantMm: 3,
      toleranceTwistMm: 3,
      toleranceAlignmentMm: 4,
      toleranceElevationMm: 4,
      toleranceGaugeChangeRateMmPerM: 0.2,
      toleranceCantChangeRateMmPerM: 0.5,
      points: [
        {
          id: "TG-1",
          track: "上行",
          stationM: 1000,
          measuredGaugeMm: 1435,
          measuredCantMm: 0,
          twistMm: 0,
          leftAlignmentDeviationMm: 1,
          rightAlignmentDeviationMm: -1,
          leftElevationDeviationMm: 0,
          rightElevationDeviationMm: 0,
        },
        {
          id: "TG-2",
          track: "上行",
          stationM: 1005,
          measuredGaugeMm: 1436,
          measuredCantMm: 1,
          twistMm: 2,
          leftAlignmentDeviationMm: 2,
          rightAlignmentDeviationMm: -2,
          leftElevationDeviationMm: 1,
          rightElevationDeviationMm: -1,
        },
        {
          id: "TG-3",
          track: "上行",
          stationM: 1010,
          measuredGaugeMm: 1440,
          measuredCantMm: 5,
          twistMm: 5,
          leftAlignmentDeviationMm: 6,
          rightAlignmentDeviationMm: -1,
          leftElevationDeviationMm: 0,
          rightElevationDeviationMm: -5,
        },
      ],
    });
    expect(trackGeometry).toMatchObject({
      mode: "track_geometry_review",
      point_count: 3,
      track_count: 1,
      failed_count: 1,
      failed_points: ["TG-3"],
      gauge_change_rate_failed_count: 1,
      cant_change_rate_failed_count: 1,
      max_abs_gauge_deviation_mm: 5,
      max_abs_cant_deviation_mm: 5,
      max_abs_twist_mm: 5,
      max_abs_gauge_change_rate_mm_per_m: 0.8,
      max_abs_cant_change_rate_mm_per_m: 0.8,
      max_abs_left_alignment_deviation_mm: 6,
      max_abs_right_elevation_deviation_mm: 5,
      section_count: 2,
      failed_item_counts: {
        轨距: 1,
        "水平/超高": 1,
        扭曲: 1,
        轨向: 1,
        高低: 1,
        轨距变化率: 1,
        水平变化率: 1,
      },
      track_quality_summary: {
        point_count: 3,
        passed_count: 2,
        failed_count: 1,
        pass_rate_pct: 66.7,
        max_section_track_quality_index_mm: 15,
        worst_section: {
          track: "上行",
          section_index: 2,
          failed_count: 1,
          track_quality_index_mm: 15,
        },
      },
    });
    const trackRows = trackGeometry.details as Array<Record<string, unknown>>;
    expect(trackRows[0]).toMatchObject({
      point_id: "TG-1",
      station_name: "K1+000.000",
      gauge_deviation_mm: 0,
      cant_deviation_mm: 0,
      status: "pass",
      is_passed: true,
    });
    expect(trackRows[2]).toMatchObject({
      point_id: "TG-3",
      station_name: "K1+010.000",
      gauge_deviation_mm: 5,
      cant_deviation_mm: 5,
      gauge_change_rate_mm_per_m: 0.8,
      cant_change_rate_mm_per_m: 0.8,
      left_lateral_adjustment_mm: -6,
      right_vertical_adjustment_mm: 5,
      status: "alert",
      is_passed: false,
    });
    expect(String(trackRows[2]?.failed_items)).toContain("轨距");
    expect(String(trackRows[2]?.failed_items)).toContain("水平/超高");
    expect(String(trackRows[2]?.failed_items)).toContain("扭曲");
    expect(String(trackRows[2]?.failed_items)).toContain("轨向");
    expect(String(trackRows[2]?.failed_items)).toContain("高低");
    expect(String(trackRows[2]?.failed_items)).toContain("轨距变化率");
    expect(String(trackRows[2]?.failed_items)).toContain("水平变化率");
    expect((trackGeometry.export_rows as Array<Record<string, unknown>>)[2]).toMatchObject({
      row_type: "track_geometry_review_point",
      point_id: "TG-3",
      track: "上行",
      station_name: "K1+010.000",
      gauge_deviation_mm: 5,
      cant_deviation_mm: 5,
      twist_mm: 5,
      failed_items: "轨距、水平/超高、扭曲、轨向、高低、轨距变化率、水平变化率",
      status: "alert",
      recommended_action: "adjust_track_geometry_and_remeasure",
      left_lateral_adjustment_mm: -6,
      right_vertical_adjustment_mm: 5,
    });
    expect(trackGeometry.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "track_geometry_section_summary",
          track: "上行",
          section_index: 2,
          start_station_m: 1010,
          end_station_m: 1010,
          point_count: 1,
          failed_count: 1,
          track_quality_index_mm: 15,
          status: "review",
        }),
      ]),
    );

    const trackGeometryCsv = await callTool("track_geometry_review", {
      sectionLengthM: 10,
      csvText: [
        "点号,线路,里程,设计轨距(mm),轨距(mm),设计水平(mm),水平(mm),三角坑(mm),轨距限差(mm),水平限差(mm),三角坑限差(mm),方向限差(mm),高低限差(mm),轨距变化率限差(mm/m),水平变化率限差(mm/m),左股方向(mm),右股方向(mm),左股高低(mm),右股高低(mm)",
        "TG-1,上行,K1+000,1435,1435,0,0,0,2,3,3,4,4,0.2,0.5,1,-1,0,0",
        "TG-2,上行,K1+005,1435,1436,0,1,2,2,3,3,4,4,0.2,0.5,2,-2,1,-1",
        "TG-3,上行,K1+010,1435,1440,0,5,5,2,3,3,4,4,0.2,0.5,6,-1,0,-5",
      ].join("\n"),
    });
    expect(trackGeometryCsv).toMatchObject({
      mode: "track_geometry_review",
      input_format: "csv",
      parsed_row_count: 3,
      failed_points: ["TG-3"],
      max_abs_gauge_change_rate_mm_per_m: 0.8,
      max_abs_cant_change_rate_mm_per_m: 0.8,
    });
    const csvRows = trackGeometryCsv.details as Array<Record<string, unknown>>;
    expect(csvRows[2]).toMatchObject({
      point_id: "TG-3",
      station_m: 1010,
      station_name: "K1+010.000",
      gauge_deviation_mm: 5,
      cant_deviation_mm: 5,
      status: "alert",
      is_passed: false,
    });

    const trackInspectionCsv = await callTool("track_geometry_review", {
      sectionLengthM: 10,
      csvText: [
        "测点,线别,测点里程,轨距偏差(mm),水平偏差(mm),三角坑(mm),左轨向(mm),右轨向(mm),左高低(mm),右高低(mm),轨距允许偏差(mm),水平允许偏差(mm),三角坑允许偏差(mm),轨向允许偏差(mm),高低允许偏差(mm),轨距变化率限差(mm/m),水平变化率限差(mm/m)",
        "TG-A,下行,DK1+000,0,0,0,1,-1,0,0,2,3,3,4,4,0.2,0.5",
        "TG-B,下行,DK1+005,1,1,2,2,-2,1,-1,2,3,3,4,4,0.2,0.5",
        "TG-C,下行,DK1+010,5,5,5,6,-1,0,-5,2,3,3,4,4,0.2,0.5",
      ].join("\n"),
    });
    expect(trackInspectionCsv).toMatchObject({
      mode: "track_geometry_review",
      input_format: "csv",
      parsed_row_count: 3,
      failed_points: ["TG-C"],
      failed_item_counts: {
        轨距: 1,
        "水平/超高": 1,
        扭曲: 1,
        轨向: 1,
        高低: 1,
        轨距变化率: 1,
        水平变化率: 1,
      },
      max_abs_gauge_deviation_mm: 5,
      max_abs_cant_deviation_mm: 5,
      max_abs_gauge_change_rate_mm_per_m: 0.8,
      max_abs_cant_change_rate_mm_per_m: 0.8,
    });
    expect((trackInspectionCsv.details as Array<Record<string, unknown>>)[2]).toMatchObject({
      point_id: "TG-C",
      track: "下行",
      station_m: 1010,
      station_name: "K1+010.000",
      gauge_deviation_mm: 5,
      cant_deviation_mm: 5,
      measured_gauge_mm: 1440,
      measured_cant_mm: 5,
      left_lateral_adjustment_mm: -6,
      right_vertical_adjustment_mm: 5,
      status: "alert",
    });

    const alignment = await callTool("alignment_station_offset", {
      alignment: {
        startStationM: 1000,
        elements: [
          {
            id: "L1",
            type: "line",
            start: { x: 0, y: 0 },
            end: { x: 100, y: 0 },
          },
          {
            id: "R1",
            type: "arc",
            center: { x: 100, y: 50 },
            start: { x: 100, y: 0 },
            end: { x: 150, y: 50 },
            direction: "ccw",
          },
        ],
      },
      observations: [
        { id: "ZX-1", x: 50, y: 2, designOffsetM: 2, toleranceMm: 5 },
        { id: "ZX-2", x: 120, y: 10, designOffsetM: 0, toleranceMm: 5 },
      ],
    });
    expect(alignment).toMatchObject({
      element_count: 2,
      point_count: 2,
      projected_count: 2,
      left_count: 2,
      right_count: 0,
      failed_points: ["ZX-2"],
      max_abs_lateral_deviation_mm: 5_278.64,
      rms_lateral_deviation_mm: 3_732.562,
      alignment_quality_summary: {
        point_count: 2,
        projected_count: 2,
        failed_count: 1,
        pass_rate_pct: 50,
        left_count: 2,
        right_count: 0,
        max_abs_lateral_deviation_mm: 5_278.64,
        rms_lateral_deviation_mm: 3_732.562,
        worst_point: {
          point_id: "ZX-2",
          station_name: "K1+123.182",
          lateral_deviation_mm: 5_278.64,
          is_passed: false,
        },
      },
    });
    expect((alignment.details as Array<Record<string, unknown>>)[0]).toMatchObject({
      point_id: "ZX-1",
      element_id: "L1",
      station_m: 1050,
      station_name: "K1+050.000",
      signed_offset_m: 2,
      lateral_deviation_mm: 0,
      tangent_azimuth_degrees: 90,
      is_passed: true,
    });
    expect((alignment.details as Array<Record<string, unknown>>)[1]).toMatchObject({
      point_id: "ZX-2",
      element_id: "R1",
      station_m: 1123.1824,
      station_name: "K1+123.182",
      signed_offset_m: 5.2786,
      lateral_deviation_mm: 5278.64,
      tangent_azimuth_degrees: 63.4349,
      is_passed: false,
    });
    expect((alignment.export_rows as Array<Record<string, unknown>>)[1]).toMatchObject({
      row_type: "alignment_station_offset_point",
      point_id: "ZX-2",
      element_id: "R1",
      element_type: "arc",
      station_m: 1123.1824,
      station_name: "K1+123.182",
      signed_offset_m: 5.2786,
      side: "left",
      design_offset_m: 0,
      lateral_deviation_mm: 5278.64,
      tolerance_mm: 5,
      is_passed: false,
    });

    const alignmentCsv = await callTool("alignment_station_offset", {
      csvText: [
        "类型,点号,里程,东坐标(m),北坐标(m),设计偏距(m),限差(mm)",
        "中线,A,K1+000,0,0,,",
        "中线,B,K1+100,100,0,,",
        "测点,ZX-1,,50,2,2,5",
        "测点,ZX-2,,60,8,2,5",
      ].join("\n"),
    });
    expect(alignmentCsv).toMatchObject({
      mode: "alignment_station_offset",
      input_format: "csv",
      parsed_alignment_point_count: 2,
      parsed_observation_count: 2,
      element_count: 1,
      point_count: 2,
      projected_count: 2,
      left_count: 2,
      right_count: 0,
      failed_points: ["ZX-2"],
      max_abs_lateral_deviation_mm: 6000,
      rms_lateral_deviation_mm: 4242.641,
      alignment_quality_summary: {
        point_count: 2,
        projected_count: 2,
        failed_count: 1,
        pass_rate_pct: 50,
        worst_point: {
          point_id: "ZX-2",
          station_name: "K1+060.000",
          lateral_deviation_mm: 6000,
        },
      },
    });
    const alignmentCsvRows = alignmentCsv.details as Array<Record<string, unknown>>;
    expect(alignmentCsvRows[0]).toMatchObject({
      point_id: "ZX-1",
      station_m: 1050,
      station_name: "K1+050.000",
      signed_offset_m: 2,
      lateral_deviation_mm: 0,
      is_passed: true,
    });
    expect(alignmentCsvRows[1]).toMatchObject({
      point_id: "ZX-2",
      station_m: 1060,
      station_name: "K1+060.000",
      signed_offset_m: 8,
      lateral_deviation_mm: 6000,
      is_passed: false,
    });
    expect((alignmentCsv.export_rows as Array<Record<string, unknown>>)[1]).toMatchObject({
      row_type: "alignment_station_offset_point",
      point_id: "ZX-2",
      station_m: 1060,
      station_name: "K1+060.000",
      side: "left",
      design_offset_m: 2,
      lateral_deviation_mm: 6000,
      tolerance_mm: 5,
      is_passed: false,
    });

    const alignmentOffsetMmCsv = await callTool("alignment_station_offset", {
      csvText: [
        "数据类型,测点编号,测点里程,东坐标(m),北坐标(m),设计偏距(mm),偏距限差(mm)",
        "中线,A,K1+000,0,0,,",
        "中线,B,K1+100,100,0,,",
        "实测点,P1,,50,2,2000,5",
        "实测点,P2,,60,8,2000,5",
      ].join("\n"),
    });
    expect(alignmentOffsetMmCsv).toMatchObject({
      mode: "alignment_station_offset",
      input_format: "csv",
      parsed_alignment_point_count: 2,
      parsed_observation_count: 2,
      failed_points: ["P2"],
      max_abs_lateral_deviation_mm: 6000,
    });
    expect((alignmentOffsetMmCsv.export_rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      point_id: "P1",
      station_m: 1050,
      signed_offset_m: 2,
      design_offset_m: 2,
      lateral_deviation_mm: 0,
      is_passed: true,
    });
    expect((alignmentOffsetMmCsv.export_rows as Array<Record<string, unknown>>)[1]).toMatchObject({
      point_id: "P2",
      station_m: 1060,
      signed_offset_m: 8,
      design_offset_m: 2,
      lateral_deviation_mm: 6000,
      is_passed: false,
    });

    const alignmentGeoJson = await callTool("alignment_station_offset", {
      geojsonText: JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { role: "alignment", id: "Main", startStationM: 1000 },
            geometry: {
              type: "LineString",
              coordinates: [
                [0, 0],
                [100, 0],
              ],
            },
          },
          {
            type: "Feature",
            properties: { role: "observation", id: "GJ-1", designOffsetM: 2, toleranceMm: 5 },
            geometry: { type: "Point", coordinates: [50, 2] },
          },
          {
            type: "Feature",
            properties: { role: "observation", id: "GJ-2", designOffsetM: 2, toleranceMm: 5 },
            geometry: { type: "Point", coordinates: [60, 8] },
          },
        ],
      }),
    });
    expect(alignmentGeoJson).toMatchObject({
      mode: "alignment_station_offset",
      input_format: "geojson",
      parsed_alignment_point_count: 2,
      parsed_observation_count: 2,
      element_count: 1,
      failed_points: ["GJ-2"],
      max_abs_lateral_deviation_mm: 6000,
    });
    expect((alignmentGeoJson.details as Array<Record<string, unknown>>)[0]).toMatchObject({
      point_id: "GJ-1",
      station_m: 1050,
      signed_offset_m: 2,
      lateral_deviation_mm: 0,
      is_passed: true,
    });
    expect((alignmentGeoJson.export_rows as Array<Record<string, unknown>>)[1]).toMatchObject({
      point_id: "GJ-2",
      station_m: 1060,
      signed_offset_m: 8,
      design_offset_m: 2,
      lateral_deviation_mm: 6000,
      tolerance_mm: 5,
      is_passed: false,
    });

    const alignmentLandXml = await callTool("alignment_station_offset", {
      landxmlText: [
        '<?xml version="1.0"?>',
        "<LandXML>",
        '  <Alignments><Alignment name="Main" staStart="1000"><CoordGeom>',
        "    <Line><Start>0 0</Start><End>100 0</End></Line>",
        "  </CoordGeom></Alignment></Alignments>",
        '  <CgPoints><CgPoint name="L1" code="observation" desc="designOffsetM=0;toleranceMm=6000">40 5 0</CgPoint></CgPoints>',
        "</LandXML>",
      ].join("\n"),
    });
    expect(alignmentLandXml).toMatchObject({
      mode: "alignment_station_offset",
      input_format: "landxml",
      parsed_alignment_point_count: 2,
      parsed_observation_count: 1,
      element_count: 1,
      failed_points: [],
      max_abs_lateral_deviation_mm: 5000,
    });
    expect((alignmentLandXml.details as Array<Record<string, unknown>>)[0]).toMatchObject({
      point_id: "L1",
      station_m: 1040,
      station_name: "K1+040.000",
      signed_offset_m: 5,
      lateral_deviation_mm: 5000,
      tolerance_mm: 6000,
      is_passed: true,
    });

    const alignmentLandXmlCurve = await callTool("alignment_station_offset", {
      landxmlText: [
        "<LandXML>",
        '  <Alignments><Alignment name="CurveMain" staStart="1000"><CoordGeom>',
        '    <Curve rot="ccw" radius="100" length="157.079633">',
        "      <Start>0 0</Start>",
        "      <Center>0 100</Center>",
        "      <End>100 100</End>",
        "    </Curve>",
        "  </CoordGeom></Alignment></Alignments>",
        '  <CgPoints><CgPoint name="C1" code="observation" desc="designOffsetM=0;toleranceMm=1000">70.710678 29.289322 0</CgPoint></CgPoints>',
        "</LandXML>",
      ].join("\n"),
    });
    expect(alignmentLandXmlCurve).toMatchObject({
      mode: "alignment_station_offset",
      input_format: "landxml",
      parsed_alignment_point_count: 0,
      parsed_observation_count: 1,
      element_count: 1,
      failed_points: [],
      max_abs_lateral_deviation_mm: 0,
    });
    expect((alignmentLandXmlCurve.details as Array<Record<string, unknown>>)[0]).toMatchObject({
      point_id: "C1",
      element_type: "arc",
      station_m: 1078.5398,
      station_name: "K1+078.540",
      signed_offset_m: 0,
      lateral_deviation_mm: 0,
      tolerance_mm: 1000,
      is_passed: true,
    });

    const alignmentDxf = await callTool("alignment_station_offset", {
      dxfText: [
        "0",
        "SECTION",
        "2",
        "ENTITIES",
        "0",
        "LINE",
        "8",
        "ALIGNMENT",
        "10",
        "0",
        "20",
        "0",
        "11",
        "100",
        "21",
        "0",
        "0",
        "POINT",
        "8",
        "OBSERVATION",
        "2",
        "D1",
        "10",
        "40",
        "20",
        "0.005",
        "0",
        "ENDSEC",
        "0",
        "EOF",
      ].join("\n"),
    });
    expect(alignmentDxf).toMatchObject({
      mode: "alignment_station_offset",
      input_format: "dxf",
      parsed_alignment_point_count: 2,
      parsed_observation_count: 1,
      element_count: 1,
      failed_points: [],
      max_abs_lateral_deviation_mm: 5,
    });
    expect((alignmentDxf.details as Array<Record<string, unknown>>)[0]).toMatchObject({
      point_id: "D1",
      station_m: 40,
      signed_offset_m: 0.005,
      lateral_deviation_mm: 5,
      tolerance_mm: 20,
      is_passed: true,
    });

    const shield = await callTool("shield_guidance", {
      design: { x: 0, y: 0, z: 0, azimuthDegrees: 10 },
      actual: { x: 0.04, y: 0, z: 0.04, azimuthDegrees: 10.08 },
      horizontalToleranceMm: 50,
      verticalToleranceMm: 30,
      azimuthToleranceDeg: 0.05,
    });
    expect(shield.horizontal_status).toBe("pass");
    expect(shield.vertical_status).toBe("alert");
    expect(shield.azimuth_status).toBe("alert");

    const shieldTrend = await callTool("shield_guidance", {
      horizontalToleranceMm: 50,
      verticalToleranceMm: 30,
      azimuthToleranceDeg: 0.05,
      rings: [
        {
          ringNo: 101,
          design: { x: 0, y: 0, z: 0, azimuthDegrees: 10 },
          actual: { x: 0.02, y: 0, z: 0.01, azimuthDegrees: 10.01 },
        },
        {
          ringNo: 102,
          design: { x: 1, y: 0, z: 0, azimuthDegrees: 10 },
          actual: { x: 1.04, y: 0, z: 0.02, azimuthDegrees: 10.03 },
        },
        {
          ringNo: 103,
          design: { x: 2, y: 0, z: 0, azimuthDegrees: 10 },
          actual: { x: 2.07, y: 0, z: -0.04, azimuthDegrees: 10.08 },
        },
      ],
    });
    expect(shieldTrend).toMatchObject({
      mode: "ring_trend",
      ring_count: 3,
      max_horizontal_deviation_mm: 70,
      max_vertical_deviation_mm: 40,
      max_azimuth_deviation_degrees: 0.08,
      alert_rings: [103],
      horizontal_trend_mm_per_ring: 25,
      vertical_trend_mm_per_ring: 15,
    });
    expect((shieldTrend.ring_details as Array<Record<string, unknown>>)[2]).toMatchObject({
      ring_no: 103,
      horizontal_status: "alert",
      vertical_status: "alert",
      azimuth_status: "alert",
    });

    const shieldCsv = await callTool("shield_guidance", {
      csvText: [
        "环号,设计X(m),设计Y(m),设计Z(m),设计方位角(°),实测X(m),实测Y(m),实测Z(m),实测方位角(°),水平限差(mm),高程限差(mm),方位限差(°)",
        "101,0,0,0,10,0.02,0,0.01,10.01,50,30,0.05",
        "102,1,0,0,10,1.04,0,0.02,10.03,50,30,0.05",
        "103,2,0,0,10,2.07,0,-0.04,10.08,50,30,0.05",
      ].join("\n"),
    });
    expect(shieldCsv).toMatchObject({
      mode: "ring_trend",
      input_format: "csv",
      parsed_row_count: 3,
      ring_count: 3,
      max_horizontal_deviation_mm: 70,
      max_vertical_deviation_mm: 40,
      max_azimuth_deviation_degrees: 0.08,
      alert_rings: [103],
      horizontal_trend_mm_per_ring: 25,
      vertical_trend_mm_per_ring: 15,
    });
    expect((shieldCsv.ring_details as Array<Record<string, unknown>>)[2]).toMatchObject({
      ring_no: 103,
      horizontal_status: "alert",
      vertical_status: "alert",
      azimuth_status: "alert",
    });

    const shieldDeviationCsv = await callTool("shield_guidance", {
      csvText: [
        "盾构环号,设计X(m),设计Y(m),设计Z(m),设计方位角(°),水平偏差(mm),高程偏差(mm),方位角偏差(°),水平限差(mm),高程限差(mm),方位限差(°)",
        "101,0,0,0,10,20,10,0.01,50,30,0.05",
        "102,1,0,0,10,40,20,0.03,50,30,0.05",
        "103,2,0,0,10,70,-40,0.08,50,30,0.05",
      ].join("\n"),
    });
    expect(shieldDeviationCsv).toMatchObject({
      mode: "ring_trend",
      input_format: "csv",
      parsed_row_count: 3,
      ring_count: 3,
      max_horizontal_deviation_mm: 70,
      max_vertical_deviation_mm: 40,
      max_azimuth_deviation_degrees: 0.08,
      alert_rings: [103],
      horizontal_trend_mm_per_ring: 25,
      vertical_trend_mm_per_ring: 15,
    });
    expect((shieldDeviationCsv.ring_details as Array<Record<string, unknown>>)[2]).toMatchObject({
      ring_no: 103,
      dx_mm: 70,
      dy_mm: 0,
      vertical_deviation_mm: -40,
      azimuth_deviation_degrees: 0.08,
      horizontal_status: "alert",
      vertical_status: "alert",
      azimuth_status: "alert",
    });
    expect((shieldDeviationCsv.export_rows as Array<Record<string, unknown>>)[2]).toMatchObject({
      row_type: "shield_guidance_ring_result",
      ring_no: 103,
      horizontal_deviation_mm: 70,
      vertical_deviation_mm: -40,
      status: "alert",
    });
  });

  it("returns summary and export rows for inclinometer observation series", async () => {
    const inclinometer = await callTool("inclinometer", {
      alertThresholdMm: 20,
      rateThresholdMmPerDay: 3,
      observations: [
        { boreholeId: "CX-1", date: "2026-06-01", depth: 6, xMm: 0, yMm: 0 },
        { boreholeId: "CX-1", date: "2026-06-04", depth: 6, xMm: 12, yMm: 0 },
        { boreholeId: "CX-1", date: "2026-06-07", depth: 6, xMm: 24, yMm: 0 },
        { boreholeId: "CX-1", date: "2026-06-01", depth: 2, xMm: 0, yMm: 0 },
        { boreholeId: "CX-1", date: "2026-06-07", depth: 2, xMm: 5, yMm: 0 },
      ],
    });

    expect(inclinometer.inclinometer_summary).toMatchObject({
      borehole_count: 1,
      depth_count: 2,
      reading_count: 5,
      alert_depth_count: 1,
      max_displacement_mm: 24,
      max_rate_mm_per_day: 4,
      quality_status: "alert",
      worst_depth: {
        borehole_id: "CX-1",
        depth_m: 6,
        cumulative_resultant_mm: 24,
        current_rate_mm_per_day: 4,
      },
    });
    expect(inclinometer.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "inclinometer_depth_summary",
        borehole_id: "CX-1",
        depth_m: 6,
        observation_count: 3,
        baseline_date: "2026-06-01",
        latest_date: "2026-06-07",
        cumulative_resultant_mm: 24,
        current_stage_resultant_mm: 12,
        current_rate_mm_per_day: 4,
        alert_threshold_mm: 20,
        rate_threshold_mm_per_day: 3,
        status: "alert",
      },
      {
        row_type: "inclinometer_depth_summary",
        borehole_id: "CX-1",
        depth_m: 2,
        observation_count: 2,
        baseline_date: "2026-06-01",
        latest_date: "2026-06-07",
        cumulative_resultant_mm: 5,
        current_stage_resultant_mm: 5,
        current_rate_mm_per_day: 0.833,
        alert_threshold_mm: 20,
        rate_threshold_mm_per_day: 3,
        status: "pass",
      },
      {
        row_type: "inclinometer_period_observation",
        borehole_id: "CX-1",
        depth_m: 6,
        date: "2026-06-01",
        x_mm: 0,
        y_mm: 0,
        cumulative_resultant_mm: 0,
        stage_resultant_mm: 0,
        stage_rate_mm_per_day: 0,
      },
      {
        row_type: "inclinometer_period_observation",
        borehole_id: "CX-1",
        depth_m: 6,
        date: "2026-06-04",
        x_mm: 12,
        y_mm: 0,
        cumulative_resultant_mm: 12,
        stage_resultant_mm: 12,
        stage_rate_mm_per_day: 4,
      },
      {
        row_type: "inclinometer_period_observation",
        borehole_id: "CX-1",
        depth_m: 6,
        date: "2026-06-07",
        x_mm: 24,
        y_mm: 0,
        cumulative_resultant_mm: 24,
        stage_resultant_mm: 12,
        stage_rate_mm_per_day: 4,
      },
      {
        row_type: "inclinometer_period_observation",
        borehole_id: "CX-1",
        depth_m: 2,
        date: "2026-06-01",
        x_mm: 0,
        y_mm: 0,
        cumulative_resultant_mm: 0,
        stage_resultant_mm: 0,
        stage_rate_mm_per_day: 0,
      },
      {
        row_type: "inclinometer_period_observation",
        borehole_id: "CX-1",
        depth_m: 2,
        date: "2026-06-07",
        x_mm: 5,
        y_mm: 0,
        cumulative_resultant_mm: 5,
        stage_resultant_mm: 5,
        stage_rate_mm_per_day: 0.833,
      },
    ]);
  });

  it("returns summary and export rows for line stakeout batch rechecks", async () => {
    const stakeout = await callTool("line_stakeout", {
      csvText: [
        "点号,测站X(m),测站Y(m),后视X(m),后视Y(m),设计X(m),设计Y(m),复测X(m),复测Y(m),限差(mm)",
        "ZH-13,0,0,0,10,1000,500,1000.012,499.984,20",
        "ZH-14,0,0,0,10,10,0,10.04,0,30",
      ].join("\n"),
    });

    expect(stakeout.line_stakeout_summary).toMatchObject({
      point_count: 2,
      failed_count: 1,
      pass_rate_pct: 50,
      max_planar_error_mm: 40,
      max_abs_dx_mm: 40,
      max_abs_dy_mm: 16,
      quality_status: "alert",
      worst_point: {
        point_id: "ZH-14",
        planar_error_mm: 40,
        is_passed: false,
      },
    });
    expect(stakeout.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "line_stakeout_point_result",
        point_id: "ZH-13",
        distance_m: 1118.034,
        backsight_azimuth_degrees: 0,
        target_azimuth_degrees: 63.434949,
        right_turn_angle_degrees: 63.434949,
        recheck_dx_mm: 12,
        recheck_dy_mm: -16,
        planar_error_mm: 20,
        tolerance_mm: 20,
        status: "pass",
        is_passed: true,
      },
      {
        row_type: "line_stakeout_point_result",
        point_id: "ZH-14",
        distance_m: 10,
        backsight_azimuth_degrees: 0,
        target_azimuth_degrees: 90,
        right_turn_angle_degrees: 90,
        recheck_dx_mm: 40,
        recheck_dy_mm: 0,
        planar_error_mm: 40,
        tolerance_mm: 30,
        status: "alert",
        is_passed: false,
      },
    ]);
  });

  it("returns summary and export rows for shield guidance ring trends", async () => {
    const shield = await callTool("shield_guidance", {
      horizontalToleranceMm: 50,
      verticalToleranceMm: 30,
      azimuthToleranceDeg: 0.05,
      rings: [
        {
          ringNo: 101,
          design: { x: 0, y: 0, z: 0, azimuthDegrees: 10 },
          actual: { x: 0.02, y: 0, z: 0.01, azimuthDegrees: 10.01 },
        },
        {
          ringNo: 102,
          design: { x: 1, y: 0, z: 0, azimuthDegrees: 10 },
          actual: { x: 1.04, y: 0, z: 0.02, azimuthDegrees: 10.03 },
        },
        {
          ringNo: 103,
          design: { x: 2, y: 0, z: 0, azimuthDegrees: 10 },
          actual: { x: 2.07, y: 0, z: -0.04, azimuthDegrees: 10.08 },
        },
      ],
    });

    expect(shield.shield_guidance_summary).toMatchObject({
      ring_count: 3,
      alert_ring_count: 1,
      max_horizontal_deviation_mm: 70,
      max_vertical_deviation_mm: 40,
      max_azimuth_deviation_degrees: 0.08,
      horizontal_trend_mm_per_ring: 25,
      vertical_trend_mm_per_ring: 15,
      quality_status: "alert",
      worst_ring: {
        ring_no: 103,
        horizontal_deviation_mm: 70,
        vertical_deviation_mm: -40,
        azimuth_deviation_degrees: 0.08,
      },
    });
    expect(shield.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "shield_guidance_ring_result",
        ring_no: 101,
        dx_mm: 20,
        dy_mm: 0,
        horizontal_deviation_mm: 20,
        vertical_deviation_mm: 10,
        azimuth_deviation_degrees: 0.01,
        horizontal_status: "pass",
        vertical_status: "pass",
        azimuth_status: "pass",
        status: "pass",
      },
      {
        row_type: "shield_guidance_ring_result",
        ring_no: 102,
        dx_mm: 40,
        dy_mm: 0,
        horizontal_deviation_mm: 40,
        vertical_deviation_mm: 20,
        azimuth_deviation_degrees: 0.03,
        horizontal_status: "pass",
        vertical_status: "pass",
        azimuth_status: "pass",
        status: "pass",
      },
      {
        row_type: "shield_guidance_ring_result",
        ring_no: 103,
        dx_mm: 70,
        dy_mm: 0,
        horizontal_deviation_mm: 70,
        vertical_deviation_mm: -40,
        azimuth_deviation_degrees: 0.08,
        horizontal_status: "alert",
        vertical_status: "alert",
        azimuth_status: "alert",
        status: "alert",
      },
    ]);
  });

  it("returns summary and export rows for water-level observation series", async () => {
    const waterLevel = await callTool("water_level", {
      alertThresholdMm: 500,
      rateThresholdMmPerDay: 120,
      observations: [
        { wellId: "SW-1", date: "2026-06-01", elevation: 10 },
        { wellId: "SW-1", date: "2026-06-04", elevation: 10.3 },
        { wellId: "SW-1", date: "2026-06-07", elevation: 10.75 },
      ],
    });

    expect(waterLevel.water_level_summary).toMatchObject({
      well_count: 1,
      observation_count: 3,
      alert_well_count: 1,
      max_abs_change_mm: 750,
      max_abs_rate_mm_per_day: 150,
      quality_status: "alert",
      worst_well: {
        well_id: "SW-1",
        change_mm: 750,
        current_rate_mm_per_day: 150,
      },
    });
    expect(waterLevel.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "water_level_well_summary",
        well_id: "SW-1",
        observation_count: 3,
        baseline_date: "2026-06-01",
        latest_date: "2026-06-07",
        baseline_elevation_m: 10,
        latest_elevation_m: 10.75,
        change_mm: 750,
        current_change_mm: 450,
        current_rate_mm_per_day: 150,
        alert_threshold_mm: 500,
        rate_threshold_mm_per_day: 120,
        status: "alert",
      },
      {
        row_type: "water_level_period_observation",
        well_id: "SW-1",
        date: "2026-06-01",
        elevation_m: 10,
        change_mm: 0,
        stage_change_mm: 0,
        stage_rate_mm_per_day: 0,
      },
      {
        row_type: "water_level_period_observation",
        well_id: "SW-1",
        date: "2026-06-04",
        elevation_m: 10.3,
        change_mm: 300,
        stage_change_mm: 300,
        stage_rate_mm_per_day: 100,
      },
      {
        row_type: "water_level_period_observation",
        well_id: "SW-1",
        date: "2026-06-07",
        elevation_m: 10.75,
        change_mm: 750,
        stage_change_mm: 450,
        stage_rate_mm_per_day: 150,
      },
    ]);
  });

  it("returns summary and export rows for axial-force observation series", async () => {
    const axialForce = await callTool("axial_force", {
      alertThresholdKn: 800,
      rateThresholdKnPerDay: 80,
      observations: [
        { sensorId: "ZL-1", date: "2026-06-01", forceKn: 100 },
        { sensorId: "ZL-1", date: "2026-06-04", forceKn: 400 },
        { sensorId: "ZL-1", date: "2026-06-07", forceKn: 850 },
      ],
    });

    expect(axialForce.axial_force_summary).toMatchObject({
      sensor_count: 1,
      observation_count: 3,
      alert_sensor_count: 1,
      max_abs_force_kn: 850,
      max_abs_rate_kn_per_day: 150,
      quality_status: "alert",
      worst_sensor: {
        sensor_id: "ZL-1",
        force_kn: 850,
        current_rate_kn_per_day: 150,
      },
    });
    expect(axialForce.export_rows as Array<Record<string, unknown>>).toEqual([
      {
        row_type: "axial_force_sensor_summary",
        sensor_id: "ZL-1",
        observation_count: 3,
        baseline_date: "2026-06-01",
        latest_date: "2026-06-07",
        baseline_force_kn: 100,
        force_kn: 850,
        current_force_change_kn: 450,
        current_rate_kn_per_day: 150,
        alert_threshold_kn: 800,
        rate_threshold_kn_per_day: 80,
        status: "alert",
      },
      {
        row_type: "axial_force_period_observation",
        sensor_id: "ZL-1",
        date: "2026-06-01",
        force_kn: 100,
        cumulative_change_kn: 0,
        stage_force_change_kn: 0,
        stage_rate_kn_per_day: 0,
      },
      {
        row_type: "axial_force_period_observation",
        sensor_id: "ZL-1",
        date: "2026-06-04",
        force_kn: 400,
        cumulative_change_kn: 300,
        stage_force_change_kn: 300,
        stage_rate_kn_per_day: 100,
      },
      {
        row_type: "axial_force_period_observation",
        sensor_id: "ZL-1",
        date: "2026-06-07",
        force_kn: 850,
        cumulative_change_kn: 750,
        stage_force_change_kn: 450,
        stage_rate_kn_per_day: 150,
      },
    ]);
  });

  it("parses CPIII east-north-height delta columns with Unicode minus signs", async () => {
    const cpiii = await callTool("cpiii_adjustment", {
      csvText: [
        "点号,左右线,行别,里程,设计东坐标,设计北坐标,设计高程,dE(mm),dN(mm),dH(mm),平面限差(mm),高程限差(mm),复测日期",
        "CP1,上行,右线,DK12+345,1000,2000,10,1,1,1,3,3,2026-06-01",
        "CP2,上行,右线,DK12+360,1001,2001,20,－4,−5,—4,3,3,2026-06-01",
      ].join("\n"),
    });

    expect(cpiii).toMatchObject({
      input_format: "csv",
      parsed_row_count: 2,
      point_count: 2,
      failed_points: ["CP2"],
      planar_failed_points: ["CP2"],
      vertical_failed_points: ["CP2"],
      max_error_mm: 6.403,
      max_vertical_error_mm: 4,
    });
    expect(cpiii.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          point_id: "CP2",
          measured_x_m: 1000.996,
          measured_y_m: 2000.995,
          dx_mm: -4,
          dy_mm: -5,
          dz_mm: -4,
          is_passed: false,
        }),
      ]),
    );
  });

  it("parses deformation CSV Chinese and Excel serial dates before calculating rates", async () => {
    const chineseDate = await callTool("deformation_rate", {
      csvText: [
        "测点编号,观测日期,累计沉降(mm),速率预警值(mm/d)",
        "JC-DATE,2026年6月1日,0,5",
        "JC-DATE,2026年6月4日,18,5",
        "JC-DATE,2026年6月7日,36,5",
      ].join("\n"),
      predictionDays: 1,
    });

    expect(chineseDate).toMatchObject({
      mode: "multi_point_csv",
      table_format: "long",
      parsed_observation_count: 3,
      point_count: 1,
      alert_points: ["JC-DATE"],
      max_abs_latest_rate_mm_per_day: 6,
    });
    expect(chineseDate.point_results as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          point_id: "JC-DATE",
          monitoring_duration_days: 6,
          latest_value_mm: 36,
          latest_rate_mm_per_day: 6,
        }),
      ]),
    );

    const excelSerialDate = await callTool("deformation_rate", {
      csvText: [
        "测点编号,观测日期,累计沉降(mm),速率预警值(mm/d)",
        "JC-EXCEL,46174,0,5",
        "JC-EXCEL,46177,18,5",
        "JC-EXCEL,46180,36,5",
      ].join("\n"),
      predictionDays: 1,
    });

    expect(excelSerialDate).toMatchObject({
      mode: "multi_point_csv",
      table_format: "long",
      parsed_observation_count: 3,
      point_count: 1,
      alert_points: ["JC-EXCEL"],
      max_abs_latest_rate_mm_per_day: 6,
    });
    expect(excelSerialDate.export_rows as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row_type: "deformation_period_rate",
          point_id: "JC-EXCEL",
          period: "46177 → 46180",
          increment_mm: 18,
          days: 3,
          rate_mm_per_day: 6,
        }),
      ]),
    );
  });

  it("rejects impossible DMS angle fields instead of silently producing invalid survey angles", async () => {
    const error = await callToolExpectError("angle_convert", {
      value: "12°99′0″",
      from: "dms",
      to: "decimal",
    });

    expect(JSON.stringify(error)).toContain("分秒");
  });

  it("runs shipped metro-protection engineering fixtures as credible field examples", async () => {
    const fixtureRoot = resolve("railwise/examples/metro-protection/fixtures");
    const fixture = <T>(name: string): T =>
      JSON.parse(readFileSync(resolve(fixtureRoot, name), "utf8")) as T;

    const cpiii = await callTool(
      "cpiii_adjustment",
      fixture<Record<string, unknown>>("cpiii-control-points.json"),
    );
    expect(cpiii.failed_points).toEqual(["CP3-04"]);
    expect(cpiii.max_error_mm).toBeGreaterThan(2);

    const shield = await callTool(
      "shield_guidance",
      fixture<Record<string, unknown>>("shield-guidance.json"),
    );
    expect(shield.horizontal_status).toBe("pass");
    expect(shield.vertical_status).toBe("alert");
    expect(shield.azimuth_status).toBe("pass");

    const inclinometer = await callTool(
      "inclinometer",
      fixture<Record<string, unknown>>("inclinometer-readings.json"),
    );
    expect(inclinometer.max_depth_m).toBe(18);
    expect(inclinometer.is_alert).toBe(true);
  });
});
