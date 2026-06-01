import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok } from "../util.js";

const point2 = z.object({ x: z.number(), y: z.number() });
const point3 = point2.extend({ z: z.number().optional() });

const rad2deg = (v: number) => (v * 180) / Math.PI;
const deg2rad = (v: number) => (v * Math.PI) / 180;
const round = (v: number, digits = 4) => Number(v.toFixed(digits));
const hypot2 = (dx: number, dy: number) => Math.hypot(dx, dy);

function azimuthDegrees(dx: number, dy: number): number {
  return round((rad2deg(Math.atan2(dx, dy)) + 360) % 360, 6);
}

function parseDms(value: string | number): number {
  if (typeof value === "number") return value;
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(-?\d+(?:\.\d+)?)(?:[°度:\s]+(\d+(?:\.\d+)?))?(?:['′分:\s]+(\d+(?:\.\d+)?))?(?:["″秒]?)$/,
  );
  if (!match) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
    throw new Error(`无法解析角度值：${value}`);
  }
  const sign = Number(match[1]) < 0 ? -1 : 1;
  const d = Math.abs(Number(match[1]));
  const m = Number(match[2] ?? 0);
  const s = Number(match[3] ?? 0);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(s) || m >= 60 || s >= 60) {
    throw new Error(`DMS 分秒字段超出范围：${value}`);
  }
  return sign * (d + m / 60 + s / 3600);
}

function parseFiniteAngle(value: string | number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`角度值必须为有限数字：${value}`);
  return numeric;
}

function interpolate(points: Array<{ offset: number; elevation: number }>, offset: number): number {
  const sorted = [...points].sort((a, b) => a.offset - b.offset);
  if (offset <= sorted[0]!.offset) return sorted[0]!.elevation;
  if (offset >= sorted[sorted.length - 1]!.offset) return sorted[sorted.length - 1]!.elevation;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const next = sorted[i]!;
    if (offset <= next.offset) {
      const t = (offset - prev.offset) / (next.offset - prev.offset);
      return prev.elevation + t * (next.elevation - prev.elevation);
    }
  }
  return sorted[sorted.length - 1]!.elevation;
}

export function registerEngineering(server: McpServer): void {
  server.tool(
    "distance_calculator",
    "测量基础距离计算。输入两点坐标，返回平距、高差、斜距和方位角。",
    {
      from: point3.describe("起点坐标，x/y 单位为 m，z 可选"),
      to: point3.describe("终点坐标，x/y 单位为 m，z 可选"),
    },
    async (args) => {
      const dx = args.to.x - args.from.x;
      const dy = args.to.y - args.from.y;
      const dz = (args.to.z ?? 0) - (args.from.z ?? 0);
      const horizontal = hypot2(dx, dy);
      return ok({
        delta_x_m: round(dx),
        delta_y_m: round(dy),
        elevation_difference_m: round(dz),
        horizontal_distance_m: round(horizontal),
        slope_distance_m: round(Math.hypot(horizontal, dz)),
        azimuth_degrees: azimuthDegrees(dx, dy),
      });
    },
  );

  server.tool(
    "angle_convert",
    "角度格式转换。支持十进制度、度分秒、弧度和百分度之间互转。",
    {
      value: z.union([z.number(), z.string()]).describe("角度值。DMS 可写为 123°27′24″ 或 123:27:24"),
      from: z.enum(["decimal", "dms", "radian", "grad"]).default("decimal"),
      to: z.enum(["decimal", "dms", "radian", "grad"]).default("decimal"),
    },
    async (args) => {
      const decimal =
        args.from === "dms"
          ? parseDms(args.value)
          : args.from === "radian"
            ? rad2deg(parseFiniteAngle(args.value))
            : args.from === "grad"
              ? parseFiniteAngle(args.value) * 0.9
              : parseFiniteAngle(args.value);
      const sign = decimal < 0 ? -1 : 1;
      const abs = Math.abs(decimal);
      const d = Math.floor(abs);
      const minFloat = (abs - d) * 60;
      const m = Math.floor(minFloat);
      const s = (minFloat - m) * 60;
      const dms = `${sign < 0 ? "-" : ""}${d}°${m}′${round(s, 4)}″`;
      const converted =
        args.to === "dms"
          ? dms
          : args.to === "radian"
            ? round(deg2rad(decimal), 10)
            : args.to === "grad"
              ? round(decimal / 0.9, 10)
              : round(decimal, 10);
      return ok({
        input: args.value,
        decimal_degrees: round(decimal, 10),
        dms,
        radians: round(deg2rad(decimal), 10),
        grads: round(decimal / 0.9, 10),
        converted,
      });
    },
  );

  server.tool(
    "coord_transform",
    "二维坐标转换。支持平移、旋转和尺度改正的 Helmert 近似转换，适用于工程局部坐标换算。",
    {
      mode: z.enum(["helmert2d"]).default("helmert2d"),
      x: z.number().describe("源坐标 X(m)"),
      y: z.number().describe("源坐标 Y(m)"),
      dx: z.number().default(0).describe("X 平移量(m)"),
      dy: z.number().default(0).describe("Y 平移量(m)"),
      rotationArcsec: z.number().default(0).describe("旋转角，单位角秒"),
      scalePpm: z.number().default(0).describe("尺度改正，单位 ppm"),
    },
    async (args) => {
      const theta = deg2rad(args.rotationArcsec / 3600);
      const scale = 1 + args.scalePpm / 1_000_000;
      const tx = args.dx + scale * (args.x * Math.cos(theta) - args.y * Math.sin(theta));
      const ty = args.dy + scale * (args.x * Math.sin(theta) + args.y * Math.cos(theta));
      return ok({
        mode: args.mode,
        source_x: args.x,
        source_y: args.y,
        target_x: round(tx, 6),
        target_y: round(ty, 6),
        rotation_degrees: round(args.rotationArcsec / 3600, 10),
        scale_factor: round(scale, 10),
      });
    },
  );

  server.tool(
    "control_network",
    "控制网坐标观测平差简表。对同名点多次坐标观测做加权平均，输出残差和中误差评定。",
    {
      observations: z
        .array(
          z.object({
            pointId: z.string(),
            x: z.number(),
            y: z.number(),
            weight: z.number().positive().default(1),
          }),
        )
        .min(2),
    },
    async (args) => {
      const groups = new Map<string, typeof args.observations>();
      for (const obs of args.observations) groups.set(obs.pointId, [...(groups.get(obs.pointId) ?? []), obs]);
      const adjusted = [...groups.entries()].map(([pointId, obs]) => {
        const sw = obs.reduce((sum, item) => sum + item.weight, 0);
        const x = obs.reduce((sum, item) => sum + item.x * item.weight, 0) / sw;
        const y = obs.reduce((sum, item) => sum + item.y * item.weight, 0) / sw;
        const residuals = obs.map((item) => ({
          vx_mm: round((item.x - x) * 1000, 3),
          vy_mm: round((item.y - y) * 1000, 3),
        }));
        const rmse = Math.sqrt(
          residuals.reduce((sum, item) => sum + item.vx_mm ** 2 + item.vy_mm ** 2, 0) /
            Math.max(residuals.length * 2 - 2, 1),
        );
        return { point_id: pointId, adjusted_x: round(x, 6), adjusted_y: round(y, 6), rmse_mm: round(rmse, 3), residuals };
      });
      return ok({ point_count: adjusted.length, adjusted });
    },
  );

  server.tool(
    "cpiii_adjustment",
    "CPIII 控制点复测偏差评定。输入设计坐标与实测坐标，输出平面偏差、超限点和复测建议。",
    {
      points: z
        .array(
          z.object({
            id: z.string(),
            designX: z.number(),
            designY: z.number(),
            measuredX: z.number(),
            measuredY: z.number(),
          }),
        )
        .min(1),
      toleranceMm: z.number().positive().default(2),
    },
    async (args) => {
      const details = args.points.map((p) => {
        const dx = (p.measuredX - p.designX) * 1000;
        const dy = (p.measuredY - p.designY) * 1000;
        const planar = Math.hypot(dx, dy);
        return {
          point_id: p.id,
          dx_mm: round(dx, 3),
          dy_mm: round(dy, 3),
          planar_error_mm: round(planar, 3),
          is_passed: planar <= args.toleranceMm,
        };
      });
      return ok({
        tolerance_mm: args.toleranceMm,
        point_count: details.length,
        failed_points: details.filter((p) => !p.is_passed).map((p) => p.point_id),
        max_error_mm: round(Math.max(...details.map((p) => p.planar_error_mm)), 3),
        details,
      });
    },
  );

  server.tool(
    "inclinometer",
    "测斜数据处理。按深度计算水平位移增量、累计位移和最大位移位置。",
    {
      readings: z
        .array(
          z.object({
            depth: z.number(),
            initialX: z.number(),
            currentX: z.number(),
            initialY: z.number().default(0),
            currentY: z.number().default(0),
          }),
        )
        .min(1),
      alertThresholdMm: z.number().positive().optional(),
    },
    async (args) => {
      const details = args.readings.map((r) => {
        const dx = r.currentX - r.initialX;
        const dy = r.currentY - r.initialY;
        const resultant = Math.hypot(dx, dy);
        return { depth_m: r.depth, dx_mm: round(dx, 3), dy_mm: round(dy, 3), resultant_mm: round(resultant, 3) };
      });
      const max = details.reduce((a, b) => (b.resultant_mm > a.resultant_mm ? b : a), details[0]!);
      return ok({
        max_depth_m: max.depth_m,
        max_displacement_mm: max.resultant_mm,
        alert_threshold_mm: args.alertThresholdMm ?? null,
        is_alert: args.alertThresholdMm ? max.resultant_mm >= args.alertThresholdMm : false,
        details,
      });
    },
  );

  server.tool(
    "cross_section",
    "断面分析。对设计断面和实测断面进行插值对比，输出最大超挖/欠挖及面积差。",
    {
      design: z.array(z.object({ offset: z.number(), elevation: z.number() })).min(2),
      measured: z.array(z.object({ offset: z.number(), elevation: z.number() })).min(2),
    },
    async (args) => {
      const offsets = [...new Set([...args.design, ...args.measured].map((p) => p.offset))].sort((a, b) => a - b);
      const rows = offsets.map((offset) => {
        const designElevation = interpolate(args.design, offset);
        const measuredElevation = interpolate(args.measured, offset);
        const diff = measuredElevation - designElevation;
        return { offset_m: offset, design_elevation_m: round(designElevation, 4), measured_elevation_m: round(measuredElevation, 4), diff_mm: round(diff * 1000, 2) };
      });
      let area = 0;
      for (let i = 1; i < rows.length; i++) {
        const width = rows[i]!.offset_m - rows[i - 1]!.offset_m;
        area += (width * (rows[i]!.diff_mm + rows[i - 1]!.diff_mm)) / 2 / 1000;
      }
      return ok({
        max_overbreak_mm: round(Math.max(...rows.map((r) => r.diff_mm)), 2),
        max_underbreak_mm: round(Math.min(...rows.map((r) => r.diff_mm)), 2),
        area_difference_m2: round(area, 4),
        samples: rows,
      });
    },
  );

  server.tool(
    "axial_force",
    "支撑轴力计算。根据应变计初读数、当前读数、弹性模量和截面积计算轴力。",
    {
      gaugeFactor: z.number().positive().default(1),
      elasticModulusMpa: z.number().positive(),
      areaMm2: z.number().positive(),
      designForceKn: z.number().positive().optional(),
      readings: z
        .array(
          z.object({
            id: z.string(),
            initialMicrostrain: z.number(),
            currentMicrostrain: z.number(),
          }),
        )
        .min(1),
    },
    async (args) => {
      const details = args.readings.map((r) => {
        const delta = (r.currentMicrostrain - r.initialMicrostrain) / args.gaugeFactor;
        const stress = args.elasticModulusMpa * delta * 1e-6;
        const force = (stress * args.areaMm2) / 1000;
        const ratio = args.designForceKn ? Math.abs(force) / args.designForceKn : null;
        return {
          id: r.id,
          delta_microstrain: round(delta, 3),
          stress_mpa: round(stress, 4),
          force_kn: round(force, 4),
          ratio_pct: ratio === null ? null : round(ratio * 100, 2),
          is_alert: ratio === null ? false : ratio >= 0.8,
        };
      });
      const max = details.reduce((a, b) => (Math.abs(b.force_kn) > Math.abs(a.force_kn) ? b : a), details[0]!);
      return ok({ max_abs_force_kn: round(Math.abs(max.force_kn), 4), max_point_id: max.id, details });
    },
  );

  server.tool(
    "water_level",
    "静力水准/水位监测处理。计算各测点高程变化量、最大变化点和预警状态。",
    {
      points: z
        .array(
          z.object({
            id: z.string(),
            initialElevation: z.number(),
            currentElevation: z.number(),
          }),
        )
        .min(1),
      alertThresholdMm: z.number().positive().optional(),
    },
    async (args) => {
      const details = args.points.map((p) => {
        const change = (p.currentElevation - p.initialElevation) * 1000;
        return {
          id: p.id,
          change_mm: round(change, 3),
          abs_change_mm: round(Math.abs(change), 3),
          is_alert: args.alertThresholdMm ? Math.abs(change) >= args.alertThresholdMm : false,
        };
      });
      const max = details.reduce((a, b) => (b.abs_change_mm > a.abs_change_mm ? b : a), details[0]!);
      return ok({
        max_point_id: max.id,
        max_change_mm: max.abs_change_mm,
        alert_threshold_mm: args.alertThresholdMm ?? null,
        alert_points: details.filter((p) => p.is_alert).map((p) => p.id),
        details,
      });
    },
  );

  server.tool(
    "pile_stakeout",
    "桩位放样计算。根据测站、后视点和设计桩位计算放样距离、方位角和转角。",
    {
      station: point2.describe("测站坐标"),
      backsight: point2.describe("后视点坐标"),
      pile: point2.extend({ id: z.string().optional() }).describe("设计桩位坐标"),
    },
    async (args) => {
      const backAz = azimuthDegrees(args.backsight.x - args.station.x, args.backsight.y - args.station.y);
      const pileAz = azimuthDegrees(args.pile.x - args.station.x, args.pile.y - args.station.y);
      const turn = (pileAz - backAz + 360) % 360;
      return ok({
        pile_id: args.pile.id ?? null,
        distance_m: round(hypot2(args.pile.x - args.station.x, args.pile.y - args.station.y), 4),
        backsight_azimuth_degrees: backAz,
        pile_azimuth_degrees: pileAz,
        right_turn_angle_degrees: round(turn, 6),
      });
    },
  );

  server.tool(
    "shield_guidance",
    "盾构导向偏差计算。对比设计轴线位置和盾构机实测姿态，输出平面、竖向和方位偏差。",
    {
      design: point2.extend({ z: z.number(), azimuthDegrees: z.number() }),
      actual: point2.extend({ z: z.number(), azimuthDegrees: z.number() }),
      horizontalToleranceMm: z.number().positive().default(50),
      verticalToleranceMm: z.number().positive().default(30),
      azimuthToleranceDeg: z.number().positive().default(0.05),
    },
    async (args) => {
      const dx = (args.actual.x - args.design.x) * 1000;
      const dy = (args.actual.y - args.design.y) * 1000;
      const dz = (args.actual.z - args.design.z) * 1000;
      const horizontal = Math.hypot(dx, dy);
      let da = args.actual.azimuthDegrees - args.design.azimuthDegrees;
      if (da > 180) da -= 360;
      if (da < -180) da += 360;
      return ok({
        dx_mm: round(dx, 2),
        dy_mm: round(dy, 2),
        horizontal_deviation_mm: round(horizontal, 2),
        vertical_deviation_mm: round(dz, 2),
        azimuth_deviation_degrees: round(da, 6),
        horizontal_status: horizontal <= args.horizontalToleranceMm ? "pass" : "alert",
        vertical_status: Math.abs(dz) <= args.verticalToleranceMm ? "pass" : "alert",
        azimuth_status: Math.abs(da) <= args.azimuthToleranceDeg ? "pass" : "alert",
      });
    },
  );
}
