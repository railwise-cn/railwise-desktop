import { useCallback, useEffect, useMemo, useState } from "react";
import { I } from "../icons";

type Primitive = string | number | boolean | null;

export type EngineeringStatus = "ok" | "warn" | "error";

export const ENGINEERING_TOOL_IDS = [
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
] as const;

export type EngineeringToolId = (typeof ENGINEERING_TOOL_IDS)[number];

export type EngineeringToolDefinition = {
  id: EngineeringToolId;
  title: string;
  category: string;
  description: string;
};

export type EngineeringResult = {
  toolId: EngineeringToolId;
  title: string;
  status: EngineeringStatus;
  summary: string;
  metrics: Record<string, Primitive>;
  rows: Array<Record<string, Primitive>>;
  recommendations: string[];
};

type Point3 = { x: number; y: number; z?: number };

export const ENGINEERING_ANALYSIS_TOOLS: EngineeringToolDefinition[] = [
  {
    id: "distance_azimuth",
    title: "距离方位计算",
    category: "坐标",
    description: "由两点坐标计算水平距离、坡距、高差与坐标方位角。",
  },
  {
    id: "angle_conversion",
    title: "角度格式换算",
    category: "坐标",
    description: "在十进制度、度分秒、弧度与百分度之间换算。",
  },
  {
    id: "coord_transform",
    title: "二维坐标转换",
    category: "坐标",
    description: "按平移、旋转与尺度参数执行二维 Helmert 转换。",
  },
  {
    id: "cpiii_deviation",
    title: "CPIII 偏差核查",
    category: "轨道控制",
    description: "比对设计与实测坐标，输出平面、高程偏差及超限点。",
  },
  {
    id: "control_network",
    title: "控制网平差复核",
    category: "轨道控制",
    description: "按权重汇总重复观测，计算残差与中误差估计。",
  },
  {
    id: "deformation_trend",
    title: "变形趋势分析",
    category: "监测",
    description: "分析多期监测值的累计变形、阶段变形和速率。",
  },
  {
    id: "inclinometer",
    title: "测斜位移分析",
    category: "监测",
    description: "汇总测斜孔深度位移，识别最大水平位移位置。",
  },
  {
    id: "axial_force",
    title: "轴力换算",
    category: "结构",
    description: "由应变差、弹性模量和截面积换算结构轴力。",
  },
  {
    id: "water_level",
    title: "水位变化分析",
    category: "监测",
    description: "计算水位高程变化、速率与预警阈值。",
  },
  {
    id: "pile_stakeout",
    title: "桩位放样计算",
    category: "放样",
    description: "由测站、后视与桩点坐标计算转角、距离和方位。",
  },
  {
    id: "shield_guidance",
    title: "盾构姿态复核",
    category: "施工控制",
    description: "比对盾构设计与实测姿态，判断横向、高程与方位偏差。",
  },
];

const TOOL_BY_ID = new Map(ENGINEERING_ANALYSIS_TOOLS.map((tool) => [tool.id, tool]));

const SAMPLE_INPUTS: Record<EngineeringToolId, unknown> = {
  distance_azimuth: {
    from: { x: 426318.234, y: 3389214.118, z: 12.452 },
    to: { x: 426356.908, y: 3389278.884, z: 13.316 },
  },
  angle_conversion: {
    dms: { degrees: 123, minutes: 27, seconds: 36.5 },
  },
  coord_transform: {
    params: { tx: 15.25, ty: -8.4, rotationDeg: 0.0125, scalePpm: 3.2 },
    source: [
      { id: "CP01", x: 426318.234, y: 3389214.118 },
      { id: "CP02", x: 426356.908, y: 3389278.884 },
      { id: "CP03", x: 426412.552, y: 3389340.271 },
    ],
  },
  cpiii_deviation: {
    toleranceHorizontalMm: 3,
    toleranceVerticalMm: 2,
    points: [
      {
        id: "CPIII-01",
        design: { x: 426318.234, y: 3389214.118, z: 12.452 },
        actual: { x: 426318.236, y: 3389214.117, z: 12.453 },
      },
      {
        id: "CPIII-02",
        design: { x: 426356.908, y: 3389278.884, z: 13.316 },
        actual: { x: 426356.913, y: 3389278.881, z: 13.319 },
      },
    ],
  },
  control_network: {
    observations: [
      { pointId: "CP01", x: 426318.234, y: 3389214.118, z: 12.452, weight: 1 },
      { pointId: "CP01", x: 426318.236, y: 3389214.117, z: 12.453, weight: 1.2 },
      { pointId: "CP02", x: 426356.908, y: 3389278.884, z: 13.316, weight: 1 },
      { pointId: "CP02", x: 426356.905, y: 3389278.886, z: 13.315, weight: 0.8 },
    ],
  },
  deformation_trend: {
    unit: "m",
    intervalDays: 7,
    toleranceCumulativeMm: 25,
    toleranceRateMmPerDay: 2,
    points: [
      { id: "JC1", values: [12.345, 12.352, 12.361, 12.381] },
      { id: "JC2", values: [10.21, 10.213, 10.216, 10.219] },
      { id: "JC3", values: [8.88, 8.879, 8.878, 8.877] },
    ],
  },
  inclinometer: {
    toleranceMm: 18,
    readings: [
      { depthM: 2, xMm: 2.4, yMm: -1.2 },
      { depthM: 4, xMm: 5.8, yMm: -2.1 },
      { depthM: 6, xMm: 11.2, yMm: -3.8 },
      { depthM: 8, xMm: 18.7, yMm: -4.2 },
    ],
  },
  axial_force: {
    elasticModulusMPa: 200000,
    areaMm2: 1000,
    baselineMicrostrain: 125,
    currentMicrostrain: 175,
    compressionPositive: true,
  },
  water_level: {
    toleranceChangeMm: 500,
    intervalDays: 3,
    wells: [
      { id: "W1", initialElevationM: 8.12, latestElevationM: 8.05 },
      { id: "W2", initialElevationM: 7.84, latestElevationM: 7.18 },
      { id: "W3", initialElevationM: 9.01, latestElevationM: 9.03 },
    ],
  },
  pile_stakeout: {
    station: { x: 426300.0, y: 3389200.0 },
    backsight: { x: 426280.0, y: 3389228.0 },
    pile: { x: 426356.908, y: 3389278.884 },
  },
  shield_guidance: {
    design: { x: 426356.908, y: 3389278.884, z: 13.316, azimuthDegrees: 62.5 },
    actual: { x: 426356.948, y: 3389278.866, z: 13.356, azimuthDegrees: 62.58 },
    horizontalToleranceMm: 50,
    verticalToleranceMm: 30,
    azimuthToleranceDeg: 0.05,
  },
};

function round(value: number, digits = 6): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function numberFrom(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function textFrom(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function objectFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pointFrom(value: unknown): Point3 {
  const obj = objectFrom(value);
  return {
    x: numberFrom(obj.x),
    y: numberFrom(obj.y),
    z: obj.z === undefined ? undefined : numberFrom(obj.z),
  };
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function deltaDegrees(actual: number, design: number): number {
  const diff = ((actual - design + 540) % 360) - 180;
  return round(diff, 9);
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function azimuthDegrees(from: Point3, to: Point3): number {
  return normalizeDegrees(radiansToDegrees(Math.atan2(to.x - from.x, to.y - from.y)));
}

function statusFromWarnings(warnings: string[]): EngineeringStatus {
  return warnings.length > 0 ? "warn" : "ok";
}

function resultFor(
  toolId: EngineeringToolId,
  status: EngineeringStatus,
  summary: string,
  metrics: Record<string, Primitive>,
  rows: Array<Record<string, Primitive>>,
  recommendations: string[],
): EngineeringResult {
  return {
    toolId,
    title: TOOL_BY_ID.get(toolId)?.title ?? toolId,
    status,
    summary,
    metrics,
    rows,
    recommendations,
  };
}

function calculateDistanceAzimuth(input: unknown): EngineeringResult {
  const obj = objectFrom(input);
  const from = pointFrom(obj.from);
  const to = pointFrom(obj.to);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = (to.z ?? 0) - (from.z ?? 0);
  const horizontal = Math.hypot(dx, dy);
  const slope = Math.hypot(horizontal, dz);
  const azimuth = azimuthDegrees(from, to);
  return resultFor(
    "distance_azimuth",
    "ok",
    `水平距离 ${round(horizontal, 4)} m，坐标方位角 ${round(azimuth, 6)} deg。`,
    {
      delta_x_m: round(dx, 4),
      delta_y_m: round(dy, 4),
      delta_z_m: round(dz, 4),
      horizontal_distance_m: round(horizontal, 6),
      slope_distance_m: round(slope, 6),
      azimuth_degrees: round(azimuth, 9),
    },
    [
      {
        from_x: round(from.x, 4),
        from_y: round(from.y, 4),
        to_x: round(to.x, 4),
        to_y: round(to.y, 4),
        horizontal_distance_m: round(horizontal, 6),
        azimuth_degrees: round(azimuth, 9),
      },
    ],
    ["用于放样或复核前，请确认坐标系、投影面和高程基准一致。"],
  );
}

function dmsText(degrees: number): string {
  const sign = degrees < 0 ? "-" : "";
  const abs = Math.abs(degrees);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  return `${sign}${d}°${m}'${round(s, 4)}"`;
}

function calculateAngleConversion(input: unknown): EngineeringResult {
  const obj = objectFrom(input);
  let decimal = numberFrom(obj.value, Number.NaN);
  const unit = textFrom(obj.unit, "degrees");
  const dms = objectFrom(obj.dms);
  if (Number.isFinite(numberFrom(dms.degrees, Number.NaN))) {
    const sign = numberFrom(dms.degrees) < 0 ? -1 : 1;
    decimal =
      numberFrom(dms.degrees) +
      sign * (Math.abs(numberFrom(dms.minutes)) / 60 + Math.abs(numberFrom(dms.seconds)) / 3600);
  } else if (unit === "radians") {
    decimal = radiansToDegrees(numberFrom(obj.value));
  } else if (unit === "grads") {
    decimal = numberFrom(obj.value) * 0.9;
  }
  if (!Number.isFinite(decimal)) {
    return resultFor(
      "angle_conversion",
      "error",
      "角度输入无效。",
      {},
      [],
      ["请输入 value + unit，或 dms: { degrees, minutes, seconds }。"],
    );
  }
  const radians = degreesToRadians(decimal);
  const grads = decimal / 0.9;
  return resultFor(
    "angle_conversion",
    "ok",
    `${round(decimal, 8)} deg = ${dmsText(decimal)}。`,
    {
      decimal_degrees: round(decimal, 9),
      radians: round(radians, 12),
      grads: round(grads, 9),
      dms: dmsText(decimal),
    },
    [{ decimal_degrees: round(decimal, 9), radians: round(radians, 12), grads: round(grads, 9) }],
    ["角度参与坐标转换前，请统一象限定义和正负方向。"],
  );
}

function calculateCoordTransform(input: unknown): EngineeringResult {
  const obj = objectFrom(input);
  const params = objectFrom(obj.params);
  const tx = numberFrom(params.tx);
  const ty = numberFrom(params.ty);
  const rotation = degreesToRadians(numberFrom(params.rotationDeg));
  const scale = 1 + numberFrom(params.scalePpm) / 1_000_000;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const rows = arrayFrom(obj.source).map((item, index) => {
    const point = objectFrom(item);
    const x = numberFrom(point.x);
    const y = numberFrom(point.y);
    const targetX = tx + scale * (cos * x - sin * y);
    const targetY = ty + scale * (sin * x + cos * y);
    return {
      id: textFrom(point.id, `P${index + 1}`),
      source_x: round(x, 4),
      source_y: round(y, 4),
      target_x: round(targetX, 4),
      target_y: round(targetY, 4),
    };
  });
  return resultFor(
    "coord_transform",
    rows.length > 0 ? "ok" : "error",
    rows.length > 0
      ? `已转换 ${rows.length} 个点，旋转 ${numberFrom(params.rotationDeg)} deg，尺度 ${numberFrom(params.scalePpm)} ppm。`
      : "未提供待转换点。",
    {
      tx_m: round(tx, 4),
      ty_m: round(ty, 4),
      rotation_degrees: round(numberFrom(params.rotationDeg), 9),
      scale_ppm: round(numberFrom(params.scalePpm), 4),
      point_count: rows.length,
    },
    rows,
    ["转换参数应来自同名控制点解算；生产使用前请复核残差。"],
  );
}

function calculateCpiiiDeviation(input: unknown): EngineeringResult {
  const obj = objectFrom(input);
  const hTol = numberFrom(obj.toleranceHorizontalMm, 3);
  const vTol = numberFrom(obj.toleranceVerticalMm, 2);
  const warnings: string[] = [];
  const rows = arrayFrom(obj.points).map((item, index) => {
    const point = objectFrom(item);
    const design = pointFrom(point.design);
    const actual = pointFrom(point.actual);
    const dx = (actual.x - design.x) * 1000;
    const dy = (actual.y - design.y) * 1000;
    const dz = ((actual.z ?? 0) - (design.z ?? 0)) * 1000;
    const planar = Math.hypot(dx, dy);
    const failed = planar > hTol || Math.abs(dz) > vTol;
    const id = textFrom(point.id, `CPIII-${index + 1}`);
    if (failed) warnings.push(id);
    return {
      id,
      dx_mm: round(dx, 3),
      dy_mm: round(dy, 3),
      dz_mm: round(dz, 3),
      planar_error_mm: round(planar, 3),
      status: failed ? "超限" : "合格",
    };
  });
  return resultFor(
    "cpiii_deviation",
    statusFromWarnings(warnings),
    warnings.length
      ? `${warnings.length} 个 CPIII 点偏差超限。`
      : `${rows.length} 个 CPIII 点均在限差内。`,
    {
      point_count: rows.length,
      failed_count: warnings.length,
      horizontal_tolerance_mm: hTol,
      vertical_tolerance_mm: vTol,
    },
    rows,
    warnings.length
      ? [`复测并检查超限点：${warnings.join("、")}。`, "确认棱镜常数、温压改正和坐标输入无误。"]
      : ["可进入下一步轨道控制复核。"],
  );
}

function calculateControlNetwork(input: unknown): EngineeringResult {
  const groups = new Map<
    string,
    Array<{ x: number; y: number; z: number; weight: number; raw: Record<string, unknown> }>
  >();
  for (const item of arrayFrom(objectFrom(input).observations)) {
    const obs = objectFrom(item);
    const pointId = textFrom(obs.pointId, "unknown");
    const weight = Math.max(0.0001, numberFrom(obs.weight, 1));
    const list = groups.get(pointId) ?? [];
    list.push({
      x: numberFrom(obs.x),
      y: numberFrom(obs.y),
      z: numberFrom(obs.z),
      weight,
      raw: obs,
    });
    groups.set(pointId, list);
  }
  const rows: Array<Record<string, Primitive>> = [];
  let residualSquares = 0;
  let residualCount = 0;
  for (const [pointId, obs] of groups) {
    const weightSum = obs.reduce((sum, item) => sum + item.weight, 0);
    const avgX = obs.reduce((sum, item) => sum + item.x * item.weight, 0) / weightSum;
    const avgY = obs.reduce((sum, item) => sum + item.y * item.weight, 0) / weightSum;
    const avgZ = obs.reduce((sum, item) => sum + item.z * item.weight, 0) / weightSum;
    for (const item of obs) {
      const residual = Math.hypot((item.x - avgX) * 1000, (item.y - avgY) * 1000);
      residualSquares += residual ** 2;
      residualCount += 1;
    }
    rows.push({
      point_id: pointId,
      observation_count: obs.length,
      adjusted_x: round(avgX, 4),
      adjusted_y: round(avgY, 4),
      adjusted_z: round(avgZ, 4),
      max_planar_residual_mm: round(
        Math.max(...obs.map((item) => Math.hypot((item.x - avgX) * 1000, (item.y - avgY) * 1000))),
        3,
      ),
    });
  }
  const rms = residualCount > 0 ? Math.sqrt(residualSquares / residualCount) : 0;
  return resultFor(
    "control_network",
    rows.length > 0 ? "ok" : "error",
    rows.length > 0 ? `完成 ${rows.length} 个控制点的加权均值复核。` : "未提供观测数据。",
    {
      point_count: rows.length,
      observation_count: residualCount,
      planar_residual_rms_mm: round(rms, 3),
    },
    rows,
    ["正式平差仍应使用完整观测方程；此处用于现场快速筛查重复观测一致性。"],
  );
}

function calculateDeformationTrend(input: unknown): EngineeringResult {
  const obj = objectFrom(input);
  const unitScale = textFrom(obj.unit, "m") === "mm" ? 1 : 1000;
  const intervalDays = Math.max(1, numberFrom(obj.intervalDays, 1));
  const cumTol = numberFrom(obj.toleranceCumulativeMm, 30);
  const rateTol = numberFrom(obj.toleranceRateMmPerDay, 2);
  const warnings: string[] = [];
  const rows = arrayFrom(obj.points).map((item, index) => {
    const point = objectFrom(item);
    const values = arrayFrom(point.values).map((v) => numberFrom(v, Number.NaN)).filter(Number.isFinite);
    const first = values[0] ?? 0;
    const last = values[values.length - 1] ?? first;
    const prev = values.length > 1 ? values[values.length - 2] ?? first : first;
    const cumulative = (last - first) * unitScale;
    const current = (last - prev) * unitScale;
    const rate = current / intervalDays;
    const id = textFrom(point.id, `JC${index + 1}`);
    const failed = Math.abs(cumulative) > cumTol || Math.abs(rate) > rateTol;
    if (failed) warnings.push(id);
    return {
      id,
      periods: values.length,
      first_value: round(first, 4),
      latest_value: round(last, 4),
      cumulative_mm: round(cumulative, 3),
      current_mm: round(current, 3),
      rate_mm_per_day: round(rate, 3),
      status: failed ? "预警" : "正常",
    };
  });
  const avgCum =
    rows.length > 0
      ? rows.reduce((sum, row) => sum + numberFrom(row.cumulative_mm), 0) / rows.length
      : 0;
  return resultFor(
    "deformation_trend",
    statusFromWarnings(warnings),
    warnings.length
      ? `${warnings.length} 个监测点达到预警条件。`
      : `${rows.length} 个监测点变形趋势正常。`,
    {
      point_count: rows.length,
      warning_count: warnings.length,
      average_cumulative_mm: round(avgCum, 3),
      cumulative_tolerance_mm: cumTol,
      rate_tolerance_mm_per_day: rateTol,
    },
    rows,
    warnings.length
      ? [`加密观测预警点：${warnings.join("、")}。`, "复核基准点稳定性，并结合施工工况判断趋势。"]
      : ["保持既定观测频率，继续跟踪趋势。"],
  );
}

function calculateInclinometer(input: unknown): EngineeringResult {
  const obj = objectFrom(input);
  const tol = numberFrom(obj.toleranceMm, 20);
  const rows = arrayFrom(obj.readings).map((item) => {
    const reading = objectFrom(item);
    const x = numberFrom(reading.xMm);
    const y = numberFrom(reading.yMm);
    const resultant = Math.hypot(x, y);
    return {
      depth_m: round(numberFrom(reading.depthM), 3),
      x_mm: round(x, 3),
      y_mm: round(y, 3),
      resultant_mm: round(resultant, 3),
      status: resultant > tol ? "预警" : "正常",
    };
  });
  const max = rows.reduce(
    (best, row) => (numberFrom(row.resultant_mm) > numberFrom(best.resultant_mm) ? row : best),
    rows[0] ?? { depth_m: 0, resultant_mm: 0 },
  );
  const warned = rows.filter((row) => numberFrom(row.resultant_mm) > tol);
  return resultFor(
    "inclinometer",
    warned.length > 0 ? "warn" : rows.length > 0 ? "ok" : "error",
    rows.length > 0
      ? `最大水平位移 ${max.resultant_mm} mm，位于 ${max.depth_m} m。`
      : "未提供测斜读数。",
    {
      reading_count: rows.length,
      max_depth_m: max.depth_m,
      max_resultant_mm: max.resultant_mm,
      tolerance_mm: tol,
      warning_count: warned.length,
    },
    rows,
    warned.length > 0
      ? ["对最大位移深度附近进行分层复核，并结合支护结构工况研判。"]
      : ["当前测斜位移未触发阈值。"],
  );
}

function calculateAxialForce(input: unknown): EngineeringResult {
  const obj = objectFrom(input);
  const e = numberFrom(obj.elasticModulusMPa, 200000);
  const area = numberFrom(obj.areaMm2, 1000);
  const delta = numberFrom(obj.currentMicrostrain) - numberFrom(obj.baselineMicrostrain);
  const force = (e * area * delta) / 1_000_000_000;
  const signed = obj.compressionPositive === false ? -force : force;
  return resultFor(
    "axial_force",
    "ok",
    `应变差 ${round(delta, 3)} με，对应轴力 ${round(signed, 3)} kN。`,
    {
      delta_microstrain: round(delta, 3),
      elastic_modulus_mpa: e,
      area_mm2: area,
      axial_force_kn: round(signed, 6),
    },
    [
      {
        baseline_microstrain: round(numberFrom(obj.baselineMicrostrain), 3),
        current_microstrain: round(numberFrom(obj.currentMicrostrain), 3),
        axial_force_kn: round(signed, 6),
      },
    ],
    ["现场采用前请确认截面面积、温度修正和拉压正负约定。"],
  );
}

function calculateWaterLevel(input: unknown): EngineeringResult {
  const obj = objectFrom(input);
  const tol = numberFrom(obj.toleranceChangeMm, 500);
  const intervalDays = Math.max(1, numberFrom(obj.intervalDays, 1));
  const warnings: string[] = [];
  const rows = arrayFrom(obj.wells).map((item, index) => {
    const well = objectFrom(item);
    const initial = numberFrom(well.initialElevationM);
    const latest = numberFrom(well.latestElevationM);
    const change = (latest - initial) * 1000;
    const rate = change / intervalDays;
    const id = textFrom(well.id, `W${index + 1}`);
    if (Math.abs(change) > tol) warnings.push(id);
    return {
      id,
      initial_elevation_m: round(initial, 4),
      latest_elevation_m: round(latest, 4),
      change_mm: round(change, 3),
      rate_mm_per_day: round(rate, 3),
      status: Math.abs(change) > tol ? "预警" : "正常",
    };
  });
  return resultFor(
    "water_level",
    statusFromWarnings(warnings),
    warnings.length ? `${warnings.length} 个水位点变化超限。` : `${rows.length} 个水位点变化正常。`,
    {
      well_count: rows.length,
      warning_count: warnings.length,
      change_tolerance_mm: tol,
    },
    rows,
    warnings.length
      ? [`检查水位异常点：${warnings.join("、")}，并复核降水运行记录。`]
      : ["水位变化未触发阈值。"],
  );
}

function calculatePileStakeout(input: unknown): EngineeringResult {
  const obj = objectFrom(input);
  const station = pointFrom(obj.station);
  const backsight = pointFrom(obj.backsight);
  const pile = pointFrom(obj.pile);
  const backsightAzimuth = azimuthDegrees(station, backsight);
  const pileAzimuth = azimuthDegrees(station, pile);
  const rightTurn = normalizeDegrees(pileAzimuth - backsightAzimuth);
  const distance = Math.hypot(pile.x - station.x, pile.y - station.y);
  return resultFor(
    "pile_stakeout",
    "ok",
    `右角 ${round(rightTurn, 6)} deg，放样距离 ${round(distance, 4)} m。`,
    {
      backsight_azimuth_degrees: round(backsightAzimuth, 9),
      pile_azimuth_degrees: round(pileAzimuth, 9),
      right_turn_degrees: round(rightTurn, 9),
      stakeout_distance_m: round(distance, 6),
    },
    [
      {
        station_x: round(station.x, 4),
        station_y: round(station.y, 4),
        pile_x: round(pile.x, 4),
        pile_y: round(pile.y, 4),
        right_turn_degrees: round(rightTurn, 9),
        stakeout_distance_m: round(distance, 6),
      },
    ],
    ["放样前请校核后视点、仪器高和棱镜高设置。"],
  );
}

function calculateShieldGuidance(input: unknown): EngineeringResult {
  const obj = objectFrom(input);
  const design = pointFrom(obj.design);
  const actual = pointFrom(obj.actual);
  const designObj = objectFrom(obj.design);
  const actualObj = objectFrom(obj.actual);
  const hTol = numberFrom(obj.horizontalToleranceMm, 50);
  const vTol = numberFrom(obj.verticalToleranceMm, 30);
  const aTol = numberFrom(obj.azimuthToleranceDeg, 0.05);
  const horizontal = Math.hypot(actual.x - design.x, actual.y - design.y) * 1000;
  const vertical = ((actual.z ?? 0) - (design.z ?? 0)) * 1000;
  const azimuthDelta = deltaDegrees(
    numberFrom(actualObj.azimuthDegrees),
    numberFrom(designObj.azimuthDegrees),
  );
  const warnings: string[] = [];
  if (horizontal > hTol) warnings.push("水平偏差");
  if (Math.abs(vertical) > vTol) warnings.push("高程偏差");
  if (Math.abs(azimuthDelta) > aTol) warnings.push("方位偏差");
  return resultFor(
    "shield_guidance",
    statusFromWarnings(warnings),
    warnings.length ? `盾构姿态存在 ${warnings.join("、")} 超限。` : "盾构姿态在限差内。",
    {
      horizontal_deviation_mm: round(horizontal, 3),
      vertical_deviation_mm: round(vertical, 3),
      azimuth_deviation_degrees: round(azimuthDelta, 9),
      horizontal_tolerance_mm: hTol,
      vertical_tolerance_mm: vTol,
      azimuth_tolerance_degrees: aTol,
    },
    [
      {
        horizontal_deviation_mm: round(horizontal, 3),
        vertical_deviation_mm: round(vertical, 3),
        azimuth_deviation_degrees: round(azimuthDelta, 9),
        status: warnings.length ? "预警" : "正常",
      },
    ],
    warnings.length
      ? ["建议结合推进姿态、管片姿态和纠偏量制定下一环修正策略。"]
      : ["维持当前推进参数，并持续跟踪趋势。"],
  );
}

export function loadEngineeringSampleInput(toolId: EngineeringToolId): unknown {
  return JSON.parse(JSON.stringify(SAMPLE_INPUTS[toolId]));
}

export function runEngineeringCalculation(toolId: EngineeringToolId, input: unknown): EngineeringResult {
  try {
    switch (toolId) {
      case "distance_azimuth":
        return calculateDistanceAzimuth(input);
      case "angle_conversion":
        return calculateAngleConversion(input);
      case "coord_transform":
        return calculateCoordTransform(input);
      case "cpiii_deviation":
        return calculateCpiiiDeviation(input);
      case "control_network":
        return calculateControlNetwork(input);
      case "deformation_trend":
        return calculateDeformationTrend(input);
      case "inclinometer":
        return calculateInclinometer(input);
      case "axial_force":
        return calculateAxialForce(input);
      case "water_level":
        return calculateWaterLevel(input);
      case "pile_stakeout":
        return calculatePileStakeout(input);
      case "shield_guidance":
        return calculateShieldGuidance(input);
    }
  } catch (error) {
    return resultFor(
      toolId,
      "error",
      `计算失败：${error instanceof Error ? error.message : String(error)}`,
      {},
      [],
      ["请检查 JSON 参数格式与字段名称。"],
    );
  }
}

function formatPrimitive(value: Primitive): string {
  if (value === null) return "";
  return String(value);
}

export function buildEngineeringReport(result: EngineeringResult): string {
  const lines: string[] = [];
  lines.push("# 工程分析工作台报告");
  lines.push("");
  lines.push(`## ${result.title}`);
  lines.push("");
  lines.push(`- 状态：${result.status}`);
  lines.push(`- 摘要：${result.summary}`);
  lines.push("");
  lines.push("## 指标");
  lines.push("");
  lines.push("| 指标 | 值 |");
  lines.push("| --- | ---: |");
  for (const [key, value] of Object.entries(result.metrics)) {
    lines.push(`| ${key} | ${formatPrimitive(value)} |`);
  }
  if (result.rows.length > 0) {
    const columns = Object.keys(result.rows[0] ?? {});
    lines.push("");
    lines.push("## 明细");
    lines.push("");
    lines.push(`| ${columns.join(" | ")} |`);
    lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
    for (const row of result.rows) {
      lines.push(`| ${columns.map((col) => formatPrimitive(row[col] ?? null)).join(" | ")} |`);
    }
  }
  lines.push("");
  lines.push("## 建议");
  lines.push("");
  for (const item of result.recommendations) lines.push(`- ${item}`);
  return lines.join("\n");
}

function statusLabel(status: EngineeringStatus): string {
  if (status === "ok") return "正常";
  if (status === "warn") return "预警";
  return "错误";
}

function prettyInput(toolId: EngineeringToolId): string {
  return JSON.stringify(loadEngineeringSampleInput(toolId), null, 2);
}

export function EngineeringWorkbench({ onClose }: { onClose: () => void }) {
  const [activeId, setActiveId] = useState<EngineeringToolId>("distance_azimuth");
  const [inputText, setInputText] = useState(() => prettyInput("distance_azimuth"));
  const [result, setResult] = useState<EngineeringResult>(() =>
    runEngineeringCalculation("distance_azimuth", loadEngineeringSampleInput("distance_azimuth")),
  );
  const [inputError, setInputError] = useState<string | null>(null);
  const activeTool = useMemo(() => TOOL_BY_ID.get(activeId) ?? ENGINEERING_ANALYSIS_TOOLS[0]!, [activeId]);
  const report = useMemo(() => buildEngineeringReport(result), [result]);
  const tableColumns = useMemo(() => Object.keys(result.rows[0] ?? {}), [result]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadSample = useCallback((toolId = activeId) => {
    const text = prettyInput(toolId);
    setInputText(text);
    setInputError(null);
    setResult(runEngineeringCalculation(toolId, JSON.parse(text)));
  }, [activeId]);

  const selectTool = useCallback(
    (toolId: EngineeringToolId) => {
      setActiveId(toolId);
      loadSample(toolId);
    },
    [loadSample],
  );

  const run = useCallback(() => {
    try {
      const parsed = JSON.parse(inputText) as unknown;
      setInputError(null);
      setResult(runEngineeringCalculation(activeId, parsed));
    } catch (error) {
      setInputError(error instanceof Error ? error.message : String(error));
    }
  }, [activeId, inputText]);

  const copyReport = useCallback(() => {
    void navigator.clipboard?.writeText(report).catch(() => undefined);
  }, [report]);

  const exportReport = useCallback(async () => {
    try {
      const [{ save }, { invoke }] = await Promise.all([
        import("@tauri-apps/plugin-dialog"),
        import("@tauri-apps/api/core"),
      ]);
      const path = await save({
        defaultPath: `engineering-report-${activeId}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (path) await invoke("write_text_file", { path, content: report });
    } catch {
      await navigator.clipboard?.writeText(report).catch(() => undefined);
    }
  }, [activeId, report]);

  return (
    <div className="ewb-mask" role="dialog" aria-modal="true" aria-label="工程分析工作台">
      <div className="ewb-modal">
        <header className="ewb-head">
          <div className="ewb-title">
            <span className="ico">
              <I.chart size={16} />
            </span>
            <span>工程分析工作台</span>
          </div>
          <div className="ewb-head-actions">
            <button type="button" className="ewb-btn" onClick={() => loadSample()}>
              <I.refresh size={13} />
              示例参数
            </button>
            <button type="button" className="ewb-btn primary" onClick={run}>
              <I.play size={13} />
              计算
            </button>
            <button type="button" className="ewb-icon-btn" title="关闭" aria-label="关闭" onClick={onClose}>
              <I.x size={14} />
            </button>
          </div>
        </header>

        <div className="ewb-shell">
          <nav className="ewb-nav" aria-label="工程分析工具">
            <div className="ewb-nav-label">工具</div>
            <div className="ewb-tool-list">
              {ENGINEERING_ANALYSIS_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className="ewb-tool-button"
                  data-active={tool.id === activeId}
                  onClick={() => selectTool(tool.id)}
                >
                  <span className="ewb-tool-category">{tool.category}</span>
                  <span className="ewb-tool-title">{tool.title}</span>
                </button>
              ))}
            </div>
          </nav>

          <main className="ewb-main">
            <section className="ewb-input-panel">
              <div className="ewb-section-head">
                <div>
                  <h2>{activeTool.title}</h2>
                  <p>{activeTool.description}</p>
                </div>
                <span className="ewb-status" data-status={result.status}>
                  {statusLabel(result.status)}
                </span>
              </div>
              <textarea
                className="ewb-editor"
                value={inputText}
                spellCheck={false}
                onChange={(event) => setInputText(event.currentTarget.value)}
              />
              {inputError ? <div className="ewb-error">JSON 解析失败：{inputError}</div> : null}
            </section>

            <section className="ewb-results">
              <div className="ewb-section-head">
                <div>
                  <h2>结果</h2>
                  <p>{result.summary}</p>
                </div>
                <div className="ewb-actions">
                  <button type="button" className="ewb-btn" onClick={copyReport}>
                    <I.copy size={13} />
                    复制报告
                  </button>
                  <button type="button" className="ewb-btn" onClick={() => void exportReport()}>
                    <I.download size={13} />
                    导出 .md
                  </button>
                </div>
              </div>

              <div className="ewb-metrics">
                {Object.entries(result.metrics).map(([key, value]) => (
                  <div className="ewb-metric" key={key}>
                    <span>{key}</span>
                    <strong>{formatPrimitive(value)}</strong>
                  </div>
                ))}
              </div>

              {result.rows.length > 0 ? (
                <div className="ewb-table-wrap">
                  <table className="ewb-table">
                    <thead>
                      <tr>
                        {tableColumns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, index) => (
                        <tr key={index}>
                          {tableColumns.map((column) => (
                            <td key={column}>{formatPrimitive(row[column] ?? null)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="ewb-empty">暂无明细数据</div>
              )}

              <pre className="ewb-report-pre">{report}</pre>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
