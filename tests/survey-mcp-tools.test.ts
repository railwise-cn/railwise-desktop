import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
      "control_network",
      "cpiii_adjustment",
      "coord_transform",
      "distance_calculator",
      "angle_convert",
      "inclinometer",
      "cross_section",
      "axial_force",
      "water_level",
      "pile_stakeout",
      "shield_guidance",
    ]) {
      expect(names.has(name), `missing MCP tool ${name}`).toBe(true);
    }
  });

  it("runs representative engineering calculations with structured numeric results", async () => {
    const distance = await callTool("distance_calculator", {
      from: { x: 0, y: 0, z: 10 },
      to: { x: 3, y: 4, z: 14 },
    });
    expect(distance.horizontal_distance_m).toBe(5);
    expect(distance.slope_distance_m).toBeCloseTo(6.4031, 4);

    const angle = await callTool("angle_convert", {
      value: "123°27′24″",
      from: "dms",
      to: "decimal",
    });
    expect(angle.decimal_degrees).toBeCloseTo(123.4567, 4);

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

    const water = await callTool("water_level", {
      points: [
        { id: "SLS-1", initialElevation: 5, currentElevation: 4.996 },
        { id: "SLS-2", initialElevation: 5, currentElevation: 5.002 },
      ],
      alertThresholdMm: 5,
    });
    expect(water.max_change_mm).toBe(4);
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

    const cpiii = await callTool("cpiii_adjustment", {
      toleranceMm: 2,
      points: [
        { id: "CP1", designX: 0, designY: 0, measuredX: 0.001, measuredY: 0.001 },
        { id: "CP2", designX: 0, designY: 0, measuredX: 0.003, measuredY: 0.004 },
      ],
    });
    expect(cpiii.failed_points).toEqual(["CP2"]);
    expect(cpiii.max_error_mm).toBe(5);

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
    expect(section.max_overbreak_mm).toBe(10);
    expect(section.max_underbreak_mm).toBe(-10);
    expect(section.area_difference_m2).toBe(0);

    const pile = await callTool("pile_stakeout", {
      station: { x: 0, y: 0 },
      backsight: { x: 0, y: 10 },
      pile: { id: "ZH-12", x: 10, y: 0 },
    });
    expect(pile.distance_m).toBe(10);
    expect(pile.backsight_azimuth_degrees).toBe(0);
    expect(pile.right_turn_angle_degrees).toBe(90);

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
