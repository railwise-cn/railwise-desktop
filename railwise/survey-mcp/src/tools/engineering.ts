import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok } from "../util.js";

const point2 = z.object({ x: z.number(), y: z.number() });
const point3 = point2.extend({ z: z.number().optional() });
const namedPoint2 = point2.extend({ id: z.string() });
const controlObservation = z.object({
  pointId: z.string(),
  x: z.number(),
  y: z.number(),
  weight: z.number().positive().default(1),
});
const traverseSchema = z.object({
  start: namedPoint2.describe("起算控制点坐标"),
  end: namedPoint2.describe("附合终点坐标"),
  closureToleranceMm: z.number().positive().default(50).describe("坐标闭合差限差，单位 mm"),
  legs: z
    .array(
      z.object({
        to: z.string().describe("本边终点点号"),
        distance: z.number().positive().describe("水平距离，单位 m"),
        azimuthDegrees: z.number().describe("坐标方位角，单位十进制度，北起顺时针"),
      }),
    )
    .min(1),
});
const controlNetworkShape = {
  observations: z.array(controlObservation).min(2).optional(),
  traverse: traverseSchema.optional(),
  csvText: z.string().optional(),
  csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
};
const controlNetworkSchema = z.object(controlNetworkShape);
const shieldPose = point2.extend({ z: z.number(), azimuthDegrees: z.number() });
const shieldRing = z.object({
  ringNo: z.number(),
  design: shieldPose,
  actual: shieldPose,
});
const shieldGuidanceShape = {
  design: shieldPose.optional(),
  actual: shieldPose.optional(),
  rings: z.array(shieldRing).min(1).optional(),
  horizontalToleranceMm: z.number().positive().default(50),
  verticalToleranceMm: z.number().positive().default(30),
  azimuthToleranceDeg: z.number().positive().default(0.05),
  csvText: z.string().optional().describe("可选，中文 CSV/TSV。每行提供环号、设计姿态、实测姿态和限差，批量输出盾构姿态趋势复核"),
  csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
};
const shieldGuidanceSchema = z.object(shieldGuidanceShape);
const coordControlPoint = z.object({
  id: z.string(),
  sourceX: z.number(),
  sourceY: z.number(),
  targetX: z.number(),
  targetY: z.number(),
});
const coordTransformPoint = z.object({
  id: z.string().optional(),
  x: z.number(),
  y: z.number(),
});
const coordTransformShape = {
  mode: z.enum(["helmert2d"]).default("helmert2d"),
  x: z.number().optional().describe("源坐标 X(m)，已知参数单点转换时使用"),
  y: z.number().optional().describe("源坐标 Y(m)，已知参数单点转换时使用"),
  dx: z.number().default(0).describe("X 平移量(m)"),
  dy: z.number().default(0).describe("Y 平移量(m)"),
  rotationArcsec: z.number().default(0).describe("旋转角，单位角秒"),
  scalePpm: z.number().default(0).describe("尺度改正，单位 ppm"),
  controlPoints: z.array(coordControlPoint).min(2).optional().describe("公共点，用于反算二维 Helmert 参数"),
  points: z.array(coordTransformPoint).default([]).describe("待转换点。提供 controlPoints 时按估计参数批量转换"),
  csvText: z.string().optional().describe("可选，中文 CSV/TSV。公共点行提供源坐标和目标坐标，待转换点行只需源坐标"),
  csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
};
const coordTransformSchema = z.object(coordTransformShape);
const cpiiiPoint = z.object({
  id: z.string(),
  observationId: z.string().optional(),
  epoch: z.string().optional(),
  designX: z.number(),
  designY: z.number(),
  designZ: z.number().optional(),
  measuredX: z.number(),
  measuredY: z.number(),
  measuredZ: z.number().optional(),
  weight: z.number().positive().default(1),
});
const cpiiiAdjustmentShape = {
  points: z.array(cpiiiPoint).min(1).optional(),
  toleranceMm: z.number().positive().default(2),
  verticalToleranceMm: z.number().positive().optional(),
  csvText: z.string().optional(),
  csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
};
const cpiiiAdjustmentSchema = z.object(cpiiiAdjustmentShape);
const waterLevelPoint = z.object({
  id: z.string(),
  initialElevation: z.number(),
  currentElevation: z.number(),
});
const waterLevelObservation = z.object({
  wellId: z.string(),
  date: z.string(),
  elevation: z.number(),
});
const waterLevelShape = {
  points: z.array(waterLevelPoint).min(1).optional(),
  observations: z.array(waterLevelObservation).min(2).optional(),
  alertThresholdMm: z.number().positive().optional(),
  rateThresholdMmPerDay: z.number().positive().optional(),
  csvText: z.string().optional().describe("可选，中文 CSV/TSV。每行提供井号、观测日期、水位高程和预警阈值，输出多期水位变化趋势"),
  csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
};
const waterLevelSchema = z.object(waterLevelShape);
const inclinometerReading = z.object({
  depth: z.number(),
  initialX: z.number(),
  currentX: z.number(),
  initialY: z.number().default(0),
  currentY: z.number().default(0),
});
const inclinometerObservation = z.object({
  boreholeId: z.string(),
  date: z.string(),
  depth: z.number(),
  xMm: z.number(),
  yMm: z.number().default(0),
});
const inclinometerShape = {
  readings: z.array(inclinometerReading).min(1).optional(),
  observations: z.array(inclinometerObservation).min(2).optional(),
  alertThresholdMm: z.number().positive().optional(),
  rateThresholdMmPerDay: z.number().positive().optional(),
  csvText: z.string().optional().describe("可选，中文 CSV/TSV。每行提供测斜孔号、日期、深度、X/Y 位移和预警阈值，输出多期测斜趋势"),
  csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
};
const inclinometerSchema = z.object(inclinometerShape);
const axialForceReading = z.object({
  id: z.string(),
  initialMicrostrain: z.number(),
  currentMicrostrain: z.number(),
});
const axialForceObservation = z.object({
  sensorId: z.string(),
  date: z.string(),
  forceKn: z.number(),
});
const axialForceShape = {
  gaugeFactor: z.number().positive().default(1),
  elasticModulusMpa: z.number().positive().optional(),
  areaMm2: z.number().positive().optional(),
  designForceKn: z.number().positive().optional(),
  readings: z.array(axialForceReading).min(1).optional(),
  observations: z.array(axialForceObservation).min(2).optional(),
  alertThresholdKn: z.number().positive().optional(),
  rateThresholdKnPerDay: z.number().positive().optional(),
  csvText: z.string().optional().describe("可选，中文 CSV/TSV。每行提供传感器、日期、轴力值和预警阈值，输出多期轴力趋势"),
  csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
};
const axialForceSchema = z.object(axialForceShape);
const sectionProfilePoint = z.object({
  offset: z.number().describe("断面横向偏距，单位 m"),
  elevation: z.number().describe("设计或实测高程，单位 m"),
});
const crossSectionShape = {
  design: z.array(sectionProfilePoint).min(2).optional().describe("设计断面点，offset/elevation 单位为 m"),
  measured: z.array(sectionProfilePoint).min(2).optional().describe("实测断面点，offset/elevation 单位为 m"),
  toleranceMm: z.number().positive().optional().describe("断面高程偏差限差，单位 mm"),
  csvText: z.string().optional().describe("可选，中文 CSV/TSV。支持设计/实测分行，或每行同时给设计高程与实测高程"),
  csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
};
const crossSectionSchema = z.object(crossSectionShape);
const trackGeometryPoint = z.object({
  id: z.string().optional(),
  pointId: z.string().optional(),
  track: z.string().optional(),
  stationM: z.number(),
  designGaugeMm: z.number().optional(),
  standardGaugeMm: z.number().optional(),
  measuredGaugeMm: z.number().optional(),
  actualGaugeMm: z.number().optional(),
  gaugeMm: z.number().optional(),
  gaugeDeviationMm: z.number().optional(),
  designCantMm: z.number().optional(),
  designCrossLevelMm: z.number().optional(),
  measuredCantMm: z.number().optional(),
  actualCantMm: z.number().optional(),
  cantMm: z.number().optional(),
  crossLevelMm: z.number().optional(),
  cantDeviationMm: z.number().optional(),
  crossLevelDeviationMm: z.number().optional(),
  levelDeviationMm: z.number().optional(),
  twistMm: z.number().optional(),
  leftAlignmentDeviationMm: z.number().optional(),
  rightAlignmentDeviationMm: z.number().optional(),
  leftElevationDeviationMm: z.number().optional(),
  rightElevationDeviationMm: z.number().optional(),
  leftLateralAdjustmentMm: z.number().optional(),
  rightLateralAdjustmentMm: z.number().optional(),
  leftVerticalAdjustmentMm: z.number().optional(),
  rightVerticalAdjustmentMm: z.number().optional(),
  toleranceGaugeMm: z.number().positive().optional(),
  toleranceCantMm: z.number().positive().optional(),
  toleranceTwistMm: z.number().positive().optional(),
  toleranceAlignmentMm: z.number().positive().optional(),
  toleranceElevationMm: z.number().positive().optional(),
  toleranceGaugeChangeRateMmPerM: z.number().positive().optional(),
  toleranceCantChangeRateMmPerM: z.number().positive().optional(),
});
const trackGeometryShape = {
  points: z.array(trackGeometryPoint).min(1).optional(),
  trackPoints: z.array(trackGeometryPoint).min(1).optional(),
  designGaugeMm: z.number().default(1435),
  standardGaugeMm: z.number().optional(),
  designCantMm: z.number().default(0),
  designCrossLevelMm: z.number().optional(),
  toleranceGaugeMm: z.number().positive().default(2),
  toleranceCantMm: z.number().positive().default(3),
  toleranceTwistMm: z.number().positive().default(3),
  toleranceAlignmentMm: z.number().positive().default(4),
  toleranceElevationMm: z.number().positive().default(4),
  toleranceGaugeChangeRateMmPerM: z.number().positive().optional(),
  toleranceCantChangeRateMmPerM: z.number().positive().optional(),
  sectionLengthM: z.number().positive().optional(),
  csvText: z.string().optional(),
  csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
};
const trackGeometrySchema = z.object(trackGeometryShape);
const alignmentLineElement = z.object({
  id: z.string().optional(),
  type: z.literal("line"),
  start: point2,
  end: point2,
  startStationM: z.number().optional(),
});
const alignmentArcElement = z.object({
  id: z.string().optional(),
  type: z.literal("arc"),
  center: point2,
  start: point2,
  end: point2,
  direction: z.enum(["cw", "ccw"]).default("ccw"),
  startStationM: z.number().optional(),
});
const alignmentElement = z.discriminatedUnion("type", [alignmentLineElement, alignmentArcElement]);
const alignmentObservation = point2.extend({
  id: z.string(),
  designOffsetM: z.number().default(0),
  toleranceMm: z.number().positive().default(20),
});
const alignmentSchema = z.object({
  startStationM: z.number().default(0),
  elements: z.array(alignmentElement).min(1).optional(),
  points: z.array(point2.extend({ id: z.string().optional(), stationM: z.number().optional() })).min(2).optional(),
});
const alignmentStationOffsetShape = {
  alignment: alignmentSchema.optional().describe("线路定义。可提供 elements[] 直线/圆曲线，或 points[] 折线中线点"),
  observations: z.array(alignmentObservation).min(1).optional().describe("待复核点，x/y 单位为 m，designOffsetM 左正右负，toleranceMm 单位 mm"),
  csvText: z.string().optional().describe("可选，中文 CSV/TSV。类型列填 中线/测点，中线行提供里程和坐标，测点行提供实测坐标、设计偏距和限差"),
  geojsonText: z
    .string()
    .optional()
    .describe("可选，GeoJSON FeatureCollection。LineString/MultiLineString 作为线路中线，Point 作为中线点或观测点"),
  landxmlText: z
    .string()
    .optional()
    .describe("可选，LandXML 文本。支持 Alignment/CoordGeom/Line 与 CgPoint observation 解析"),
  dxfText: z.string().optional().describe("可选，DXF 文本。支持 LINE/LWPOLYLINE 中线和 POINT 观测点解析"),
  csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
};
const alignmentStationOffsetSchema = z.object(alignmentStationOffsetShape);
const lineStakeoutPoint = point2.extend({ id: z.string().optional() });
const lineStakeoutShape = {
  station: point2.optional().describe("测站坐标"),
  backsight: point2.optional().describe("后视点坐标"),
  stakeoutPoint: lineStakeoutPoint.optional().describe("设计放样点坐标"),
  measuredPoint: point2.optional().describe("可选，现场复测坐标。提供后输出设计-实测偏差与限差判定"),
  toleranceMm: z.number().positive().default(30).describe("放样复核平面限差，单位 mm"),
  csvText: z.string().optional().describe("可选，中文 CSV/TSV。每行提供测站、后视、设计点、复测点和限差，批量输出放样复核成果"),
  csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
};
const lineStakeoutSchema = z.object(lineStakeoutShape);

const rad2deg = (v: number) => (v * 180) / Math.PI;
const deg2rad = (v: number) => (v * Math.PI) / 180;
const round = (v: number, digits = 4) => Number(v.toFixed(digits));
const hypot2 = (dx: number, dy: number) => Math.hypot(dx, dy);

function azimuthDegrees(dx: number, dy: number): number {
  return round((rad2deg(Math.atan2(dx, dy)) + 360) % 360, 6);
}

function normalizeDegrees360(value: number): number {
  return round(((value % 360) + 360) % 360, 10);
}

function normalizeDegrees180(value: number): number {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return round(normalized, 10);
}

function dmsParts(decimalDegrees: number): { sign: 1 | -1; degrees: number; minutes: number; seconds: number } {
  const sign = decimalDegrees < 0 ? -1 : 1;
  let remainingSeconds = Math.abs(decimalDegrees) * 3600;
  let degrees = Math.floor(remainingSeconds / 3600);
  remainingSeconds -= degrees * 3600;
  let minutes = Math.floor(remainingSeconds / 60);
  let seconds = round(remainingSeconds - minutes * 60, 4);
  if (seconds >= 60) {
    seconds = 0;
    minutes += 1;
  }
  if (minutes >= 60) {
    minutes = 0;
    degrees += 1;
  }
  return { sign, degrees, minutes, seconds };
}

function formatDmsParts(parts: { sign: 1 | -1; degrees: number; minutes: number; seconds: number }): string {
  return `${parts.sign < 0 ? "-" : ""}${parts.degrees}°${parts.minutes}′${parts.seconds}″`;
}

function normalizeSignedAngleText(value: string): string {
  return value
    .trim()
    .replace(/[−－﹣–—]/g, "-")
    .replace(/[＋﹢]/g, "+");
}

function parseDms(value: string | number): number {
  if (typeof value === "number") return value;
  const trimmed = normalizeSignedAngleText(value);
  const dashed = trimmed.match(/^(-?\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (dashed) {
    const sign = Number(dashed[1]) < 0 ? -1 : 1;
    const d = Math.abs(Number(dashed[1]));
    const m = Number(dashed[2]);
    const s = Number(dashed[3]);
    if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(s) || m >= 60 || s >= 60) {
      throw new Error(`DMS 分秒字段超出范围：${value}`);
    }
    return sign * (d + m / 60 + s / 3600);
  }
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
  const numeric = typeof value === "string" ? Number(normalizeSignedAngleText(value)) : Number(value);
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

type ControlNetworkInput = z.infer<typeof controlNetworkSchema>;
type ControlObservationInput = z.infer<typeof controlObservation>;
type TraverseInput = z.infer<typeof traverseSchema>;
type LevelingKnownPoint = { id: string; z: number };
type LevelingObservation = { id: string; from: string; to: string; value: number; distanceKm?: number };
type LevelingRouteInput = {
  knownPoints: LevelingKnownPoint[];
  observations: LevelingObservation[];
  closureToleranceMm?: number;
};
type GnssPoint = { id: string; x: number; y: number; z: number };
type GnssBaselineObservation = {
  id: string;
  from: string;
  to: string;
  dx: number;
  dy: number;
  dz: number;
  sigmaXMm?: number;
  sigmaYMm?: number;
  sigmaZMm?: number;
};
type GnssBaselineInput = {
  knownPoints: GnssPoint[];
  approximatePoints: GnssPoint[];
  observations: GnssBaselineObservation[];
};
type DirectionObservation = {
  id: string;
  groupId: string;
  roundId?: string;
  from: string;
  to: string;
  face?: "left" | "right";
  sequence: number;
  observedDegrees: number;
  sigmaArcSec?: number;
};
type DirectionRoundInput = {
  observations: DirectionObservation[];
  faceToleranceArcSec?: number;
  zeroClosureToleranceArcSec?: number;
};
type ParsedControlNetworkCsv =
  | { mode: "coordinate_observations"; observations: ControlObservationInput[]; parsedRowCount: number }
  | { mode: "traverse_closure"; traverse: TraverseInput; parsedRowCount: number }
  | { mode: "leveling_route_closure"; levelingRoute: LevelingRouteInput; parsedRowCount: number }
  | { mode: "gnss_baseline_adjustment"; gnssBaseline: GnssBaselineInput; parsedRowCount: number }
  | { mode: "direction_round_quality"; directionRound: DirectionRoundInput; parsedRowCount: number };
type CoordTransformInput = z.infer<typeof coordTransformSchema>;
type CoordControlPointInput = z.infer<typeof coordControlPoint>;
type CoordTransformPointInput = z.infer<typeof coordTransformPoint>;
type ParsedCoordTransformCsv = {
  controlPoints: CoordControlPointInput[];
  points: CoordTransformPointInput[];
  parsedRowCount: number;
};
type LineStakeoutInput = z.infer<typeof lineStakeoutSchema>;
type LineStakeoutPointInput = z.infer<typeof lineStakeoutPoint>;
type ParsedLineStakeoutRow = {
  pointId: string;
  station: { x: number; y: number };
  backsight: { x: number; y: number };
  stakeoutPoint: LineStakeoutPointInput;
  measuredPoint?: { x: number; y: number };
  toleranceMm: number;
};
type ShieldGuidanceInput = z.infer<typeof shieldGuidanceSchema>;
type ShieldRingInput = z.infer<typeof shieldRing>;
type ShieldTolerances = {
  horizontalToleranceMm: number;
  verticalToleranceMm: number;
  azimuthToleranceDeg: number;
};
type WaterLevelInput = z.infer<typeof waterLevelSchema>;
type WaterLevelObservationInput = z.infer<typeof waterLevelObservation>;
type AxialForceInput = z.infer<typeof axialForceSchema>;
type AxialForceObservationInput = z.infer<typeof axialForceObservation>;
type InclinometerInput = z.infer<typeof inclinometerSchema>;
type InclinometerObservationInput = z.infer<typeof inclinometerObservation>;
type CrossSectionInput = z.infer<typeof crossSectionSchema>;
type SectionProfilePointInput = z.infer<typeof sectionProfilePoint>;
type ParsedCrossSectionCsv = {
  design: SectionProfilePointInput[];
  measured: SectionProfilePointInput[];
  parsedRowCount: number;
  sectionId: string | null;
  toleranceMm: number | null;
};

type ControlNetworkCsvKey =
  | "role"
  | "pointId"
  | "x"
  | "y"
  | "z"
  | "weight"
  | "distance"
  | "distanceKm"
  | "azimuthDegrees"
  | "closureToleranceMm"
  | "observationType"
  | "from"
  | "to"
  | "value"
  | "dx"
  | "dy"
  | "dz"
  | "sigmaXMm"
  | "sigmaYMm"
  | "sigmaZMm"
  | "groupId"
  | "roundId"
  | "face"
  | "sequence"
  | "directionReading"
  | "sigmaArcSec"
  | "faceToleranceArcSec"
  | "zeroClosureToleranceArcSec";

const CONTROL_NETWORK_CSV_ALIASES = new Map<string, ControlNetworkCsvKey>(
  [
    ["role", "role"],
    ["type", "role"],
    ["类型", "role"],
    ["记录类型", "role"],
    ["pointid", "pointId"],
    ["id", "pointId"],
    ["点号", "pointId"],
    ["点名", "pointId"],
    ["编号", "pointId"],
    ["观测号", "pointId"],
    ["x", "x"],
    ["east", "x"],
    ["easting", "x"],
    ["东坐标", "x"],
    ["坐标x", "x"],
    ["y", "y"],
    ["north", "y"],
    ["northing", "y"],
    ["北坐标", "y"],
    ["坐标y", "y"],
    ["z", "z"],
    ["height", "z"],
    ["elevation", "z"],
    ["高程", "z"],
    ["标高", "z"],
    ["weight", "weight"],
    ["权", "weight"],
    ["权重", "weight"],
    ["距离", "distance"],
    ["边长", "distance"],
    ["水平距离", "distance"],
    ["distance", "distance"],
    ["distancekm", "distanceKm"],
    ["levelingdistancekm", "distanceKm"],
    ["测段距离km", "distanceKm"],
    ["距离km", "distanceKm"],
    ["azimuth", "azimuthDegrees"],
    ["azimuthdegrees", "azimuthDegrees"],
    ["方位角", "azimuthDegrees"],
    ["坐标方位角", "azimuthDegrees"],
    ["closuretolerancemm", "closureToleranceMm"],
    ["闭合差限差", "closureToleranceMm"],
    ["限差", "closureToleranceMm"],
    ["observationtype", "observationType"],
    ["obstype", "observationType"],
    ["观测类型", "observationType"],
    ["观测值类型", "observationType"],
    ["from", "from"],
    ["fromid", "from"],
    ["start", "from"],
    ["station", "from"],
    ["setup", "from"],
    ["测站", "from"],
    ["设站", "from"],
    ["后视点", "from"],
    ["后视", "from"],
    ["起点", "from"],
    ["to", "to"],
    ["toid", "to"],
    ["end", "to"],
    ["target", "to"],
    ["sight", "to"],
    ["照准点", "to"],
    ["照准目标", "to"],
    ["目标点", "to"],
    ["前视点", "to"],
    ["前视", "to"],
    ["终点", "to"],
    ["value", "value"],
    ["observed", "value"],
    ["heightdifference", "value"],
    ["heightdifferencem", "value"],
    ["dh", "value"],
    ["高差", "value"],
    ["高差m", "value"],
    ["观测高差", "value"],
    ["dx", "dx"],
    ["deltax", "dx"],
    ["Δx", "dx"],
    ["δx", "dx"],
    ["Δxm", "dx"],
    ["基线dx", "dx"],
    ["dy", "dy"],
    ["deltay", "dy"],
    ["Δy", "dy"],
    ["δy", "dy"],
    ["Δym", "dy"],
    ["基线dy", "dy"],
    ["dz", "dz"],
    ["deltaz", "dz"],
    ["Δz", "dz"],
    ["δz", "dz"],
    ["Δzm", "dz"],
    ["基线dz", "dz"],
    ["sigmax", "sigmaXMm"],
    ["sigmaxmm", "sigmaXMm"],
    ["σx", "sigmaXMm"],
    ["σxmm", "sigmaXMm"],
    ["x中误差", "sigmaXMm"],
    ["sigmay", "sigmaYMm"],
    ["sigmaymm", "sigmaYMm"],
    ["σy", "sigmaYMm"],
    ["σymm", "sigmaYMm"],
    ["y中误差", "sigmaYMm"],
    ["sigmaz", "sigmaZMm"],
    ["sigmazmm", "sigmaZMm"],
    ["σz", "sigmaZMm"],
    ["σzmm", "sigmaZMm"],
    ["z中误差", "sigmaZMm"],
    ["group", "groupId"],
    ["groupid", "groupId"],
    ["setid", "groupId"],
    ["directionset", "groupId"],
    ["directiongroup", "groupId"],
    ["setupid", "groupId"],
    ["方向组", "groupId"],
    ["测站组", "groupId"],
    ["round", "roundId"],
    ["roundid", "roundId"],
    ["session", "roundId"],
    ["测回", "roundId"],
    ["测回号", "roundId"],
    ["face", "face"],
    ["position", "face"],
    ["盘位", "face"],
    ["sequence", "sequence"],
    ["order", "sequence"],
    ["观测顺序", "sequence"],
    ["序号", "sequence"],
    ["direction", "directionReading"],
    ["directionreading", "directionReading"],
    ["directiondegrees", "directionReading"],
    ["方向读数", "directionReading"],
    ["水平角读数", "directionReading"],
    ["水平度盘读数", "directionReading"],
    ["sigmadirection", "sigmaArcSec"],
    ["sigmaarcsec", "sigmaArcSec"],
    ["测角中误差", "sigmaArcSec"],
    ["方向中误差", "sigmaArcSec"],
    ["角度中误差", "sigmaArcSec"],
    ["facetolerancearcsec", "faceToleranceArcSec"],
    ["半测回差限差", "faceToleranceArcSec"],
    ["盘左盘右差限差", "faceToleranceArcSec"],
    ["zeroclosuretolerancearcsec", "zeroClosureToleranceArcSec"],
    ["归零差限差", "zeroClosureToleranceArcSec"],
  ].map(([alias, key]) => [normalizeCsvHeader(alias), key as ControlNetworkCsvKey]),
);

function detectCsvDelimiter(firstLine: string, delimiterOption: "auto" | "comma" | "tab" | "semicolon"): string {
  if (delimiterOption === "tab") return "\t";
  if (delimiterOption === "comma") return ",";
  if (delimiterOption === "semicolon") return ";";
  const candidates = [
    { delimiter: "\t", count: (firstLine.match(/\t/g) ?? []).length },
    { delimiter: ",", count: (firstLine.match(/,/g) ?? []).length },
    { delimiter: ";", count: (firstLine.match(/;/g) ?? []).length },
  ];
  return candidates.sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

const CROSS_SECTION_CSV_ALIASES = new Map<
  string,
  "role" | "sectionId" | "offset" | "elevation" | "designElevation" | "measuredElevation" | "toleranceMm"
>(
  [
    ["role", "role"],
    ["type", "role"],
    ["recordtype", "role"],
    ["类型", "role"],
    ["记录类型", "role"],
    ["数据类型", "role"],
    ["sectionid", "sectionId"],
    ["section", "sectionId"],
    ["profile", "sectionId"],
    ["断面", "sectionId"],
    ["断面编号", "sectionId"],
    ["断面号", "sectionId"],
    ["断面里程", "sectionId"],
    ["里程", "sectionId"],
    ["station", "sectionId"],
    ["chainage", "sectionId"],
    ["offset", "offset"],
    ["offsetm", "offset"],
    ["偏距", "offset"],
    ["横距", "offset"],
    ["横向偏距", "offset"],
    ["断面偏距", "offset"],
    ["elevation", "elevation"],
    ["elevationm", "elevation"],
    ["高程", "elevation"],
    ["标高", "elevation"],
    ["设计高程", "designElevation"],
    ["设计标高", "designElevation"],
    ["designelevation", "designElevation"],
    ["designelevationm", "designElevation"],
    ["实测高程", "measuredElevation"],
    ["实测标高", "measuredElevation"],
    ["测量高程", "measuredElevation"],
    ["measuredelevation", "measuredElevation"],
    ["measuredelevationm", "measuredElevation"],
    ["actualelevation", "measuredElevation"],
    ["actualelevationm", "measuredElevation"],
    ["tolerancemm", "toleranceMm"],
    ["限差", "toleranceMm"],
    ["断面限差", "toleranceMm"],
    ["高程限差", "toleranceMm"],
    ["偏差限差", "toleranceMm"],
  ].map(([alias, key]) => [
    normalizeCsvHeader(alias),
    key as "role" | "sectionId" | "offset" | "elevation" | "designElevation" | "measuredElevation" | "toleranceMm",
  ]),
);

function normalizeSectionRole(value: string): "design" | "measured" | null {
  const normalized = normalizeCsvHeader(value);
  if (/^(design|reference|standard|baseline)$/.test(normalized) || /设计|标准|基准/.test(value)) return "design";
  if (/^(measured|measure|actual|survey|observed)$/.test(normalized) || /实测|测量|观测|现状/.test(value)) {
    return "measured";
  }
  return null;
}

function parseCrossSectionCsv(text: string, delimiterOption: CrossSectionInput["csvDelimiter"]): ParsedCrossSectionCsv {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("cross_section CSV 至少需要表头和 1 行数据");
  const delimiter = detectCsvDelimiter(lines[0]!, delimiterOption);
  const headers = splitDelimitedLine(lines[0]!, delimiter).map((header) =>
    CROSS_SECTION_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  const design: SectionProfilePointInput[] = [];
  const measured: SectionProfilePointInput[] = [];
  let sectionId: string | null = null;
  let toleranceMm: number | null = null;

  for (const line of lines.slice(1)) {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, index) => {
      const key = headers[index];
      if (key) row[key] = cell;
    });
    const offset = parseNumericCell(row.offset ?? "");
    if (!Number.isFinite(offset)) continue;
    const rowSectionId = row.sectionId?.trim();
    if (rowSectionId && sectionId === null) sectionId = rowSectionId;
    const rowTolerance = parseNumericCell(row.toleranceMm ?? "");
    if (Number.isFinite(rowTolerance) && rowTolerance > 0 && toleranceMm === null) toleranceMm = rowTolerance;

    const designElevation = parseNumericCell(row.designElevation ?? "");
    const measuredElevation = parseNumericCell(row.measuredElevation ?? "");
    if (Number.isFinite(designElevation) && Number.isFinite(measuredElevation)) {
      design.push({ offset, elevation: designElevation });
      measured.push({ offset, elevation: measuredElevation });
      continue;
    }

    const elevation = parseNumericCell(row.elevation ?? "");
    const role = normalizeSectionRole(row.role ?? "");
    if (!Number.isFinite(elevation) || role === null) continue;
    if (role === "design") design.push({ offset, elevation });
    if (role === "measured") measured.push({ offset, elevation });
  }

  if (design.length < 2 || measured.length < 2) {
    throw new Error("cross_section CSV 未解析到足够的设计断面和实测断面点");
  }
  return { design, measured, parsedRowCount: lines.length - 1, sectionId, toleranceMm };
}

function runCrossSectionAnalysis(input: {
  design: SectionProfilePointInput[];
  measured: SectionProfilePointInput[];
  toleranceMm?: number;
  sectionId?: string | null;
  inputFormat?: "json" | "csv";
  parsedRowCount?: number;
}) {
  const offsets = [...new Set([...input.design, ...input.measured].map((p) => p.offset))].sort((a, b) => a - b);
  const samples = offsets.map((offset) => {
    const designElevation = interpolate(input.design, offset);
    const measuredElevation = interpolate(input.measured, offset);
    const deviationMm = round((measuredElevation - designElevation) * 1000, 2);
    return {
      offset_m: offset,
      design_elevation_m: round(designElevation, 4),
      measured_elevation_m: round(measuredElevation, 4),
      deviation_mm: deviationMm,
      diff_mm: deviationMm,
      tolerance_mm: input.toleranceMm ?? null,
      is_passed: input.toleranceMm === undefined ? null : Math.abs(deviationMm) <= input.toleranceMm,
      status: input.toleranceMm === undefined ? "unchecked" : Math.abs(deviationMm) <= input.toleranceMm ? "pass" : "alert",
    };
  });

  const deviations = samples.map((row) => row.deviation_mm);
  const absDeviations = deviations.map((value) => Math.abs(value));
  const failedSamples =
    input.toleranceMm === undefined ? [] : samples.filter((row) => Math.abs(row.deviation_mm) > input.toleranceMm!);
  const meanDeviation = deviations.reduce((sum, value) => sum + value, 0) / deviations.length;
  const rmsDeviation = Math.sqrt(deviations.reduce((sum, value) => sum + value * value, 0) / deviations.length);
  const maxPositiveDeviation = Math.max(...deviations);
  const maxNegativeDeviation = Math.min(...deviations);
  const maxAbsDeviation = Math.max(...absDeviations);
  const worstSample = samples.reduce((worst, row) =>
    Math.abs(row.deviation_mm) > Math.abs(worst.deviation_mm) ? row : worst,
  );
  const qualityStatus = input.toleranceMm === undefined ? "未设限差" : failedSamples.length > 0 ? "超限" : "合格";
  const passedCount = input.toleranceMm === undefined ? null : samples.length - failedSamples.length;
  const passRatePct = passedCount === null ? null : round((passedCount / samples.length) * 100, 3);
  const exportRows = samples.map((row) => ({
    row_type: "cross_section_profile_deviation",
    section_id: input.sectionId ?? null,
    offset_m: row.offset_m,
    design_elevation_m: row.design_elevation_m,
    measured_elevation_m: row.measured_elevation_m,
    deviation_mm: row.deviation_mm,
    tolerance_mm: row.tolerance_mm,
    status: row.status,
    is_passed: row.is_passed,
  }));

  return {
    mode: input.inputFormat === "csv" ? "section_profile_deviation_csv" : "section_profile_deviation",
    input_format: input.inputFormat ?? "json",
    ...(input.parsedRowCount !== undefined ? { parsed_row_count: input.parsedRowCount } : {}),
    section_id: input.sectionId ?? null,
    sample_count: samples.length,
    tolerance_mm: input.toleranceMm ?? null,
    max_positive_deviation_mm: round(maxPositiveDeviation, 2),
    max_negative_deviation_mm: round(maxNegativeDeviation, 2),
    max_abs_deviation_mm: round(maxAbsDeviation, 2),
    mean_deviation_mm: round(meanDeviation, 2),
    rms_deviation_mm: round(rmsDeviation, 3),
    failed_count: failedSamples.length,
    failed_offsets_m: failedSamples.map((row) => row.offset_m),
    quality_status: qualityStatus,
    section_deviation_summary: {
      section_id: input.sectionId ?? null,
      sample_count: samples.length,
      tolerance_mm: input.toleranceMm ?? null,
      failed_count: failedSamples.length,
      pass_rate_pct: passRatePct,
      max_positive_deviation_mm: round(maxPositiveDeviation, 2),
      max_negative_deviation_mm: round(maxNegativeDeviation, 2),
      max_abs_deviation_mm: round(maxAbsDeviation, 2),
      mean_deviation_mm: round(meanDeviation, 2),
      rms_deviation_mm: round(rmsDeviation, 3),
      quality_status: qualityStatus,
      worst_offset_m: worstSample.offset_m,
      worst_deviation_mm: worstSample.deviation_mm,
    },
    export_rows: exportRows,
    samples,
  };
}

function parseDirectionFace(value: string | undefined): "left" | "right" | undefined {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  if (/^(left|l|盘左|左|正镜)$/i.test(normalized)) return "left";
  if (/^(right|r|盘右|右|倒镜)$/i.test(normalized)) return "right";
  return undefined;
}

function directionMeanDegrees(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sin = values.reduce((sum, value) => sum + Math.sin(deg2rad(value)), 0);
  const cos = values.reduce((sum, value) => sum + Math.cos(deg2rad(value)), 0);
  return normalizeDegrees360(rad2deg(Math.atan2(sin / values.length, cos / values.length)));
}

function directionDifferenceArcSec(aDegrees: number, bDegrees: number): number {
  return round(normalizeDegrees180(aDegrees - bDegrees) * 3600, 3);
}

function parseDirectionObservations(rows: Array<Record<string, string>>): DirectionRoundInput {
  const observations = rows.flatMap((row, index): DirectionObservation[] => {
    const role = (row.role ?? "").trim();
    const observationType = (row.observationType ?? "").trim();
    const looksLikeObservation =
      /观测|observation|obs/i.test(role) || /方向|direction|angle/i.test(observationType) || Boolean(row.directionReading);
    if (!looksLikeObservation) return [];
    const from = row.from?.trim();
    const to = row.to?.trim();
    const groupId = row.groupId?.trim();
    const directionReading = row.directionReading?.trim();
    if (!from || !to || !groupId || !directionReading) return [];
    const sequence = parseNumericCell(row.sequence ?? "");
    const sigmaArcSec = parseNumericCell(row.sigmaArcSec ?? "");
    const face = parseDirectionFace(row.face);
    return [
      {
        id: row.pointId?.trim() || `D${index + 1}`,
        groupId,
        ...(row.roundId?.trim() ? { roundId: row.roundId.trim() } : {}),
        from,
        to,
        ...(face ? { face } : {}),
        sequence: Number.isFinite(sequence) ? sequence : index + 1,
        observedDegrees: normalizeDegrees360(parseDms(directionReading)),
        ...(Number.isFinite(sigmaArcSec) && sigmaArcSec > 0 ? { sigmaArcSec } : {}),
      },
    ];
  });
  const faceToleranceArcSec = rows
    .map((row) => parseNumericCell(row.faceToleranceArcSec ?? ""))
    .find((value) => Number.isFinite(value) && value > 0);
  const zeroClosureToleranceArcSec = rows
    .map((row) => parseNumericCell(row.zeroClosureToleranceArcSec ?? ""))
    .find((value) => Number.isFinite(value) && value > 0);
  if (observations.length === 0) throw new Error("control_network 方向组 CSV 未解析到有效方向观测");
  return {
    observations,
    ...(faceToleranceArcSec !== undefined ? { faceToleranceArcSec } : {}),
    ...(zeroClosureToleranceArcSec !== undefined ? { zeroClosureToleranceArcSec } : {}),
  };
}

function parseControlNetworkCsv(text: string, delimiterOption: ControlNetworkInput["csvDelimiter"]): ParsedControlNetworkCsv {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("control_network CSV 至少需要表头和 1 行数据");
  const delimiter = detectCsvDelimiter(lines[0]!, delimiterOption);
  const headers = splitDelimitedLine(lines[0]!, delimiter).map((header) =>
    CONTROL_NETWORK_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  const rows = lines.slice(1).map((line) => {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, index) => {
      const key = headers[index];
      if (key) row[key] = cell;
    });
    return row;
  });

  const hasDirectionFields = rows.some((row) => {
    const observationType = (row.observationType ?? "").trim();
    return /方向|direction|angle/i.test(observationType) || Boolean(row.groupId && row.directionReading);
  });

  if (hasDirectionFields) {
    return {
      mode: "direction_round_quality",
      parsedRowCount: rows.length,
      directionRound: parseDirectionObservations(rows),
    };
  }

  const hasGnssBaselineFields = rows.some((row) => {
    const observationType = (row.observationType ?? "").trim();
    return (
      /gnss|baseline|基线/i.test(observationType) ||
      [row.dx, row.dy, row.dz].some((value) => Number.isFinite(parseNumericCell(value ?? "")))
    );
  });

  if (hasGnssBaselineFields) {
    const knownPoints = rows.flatMap((row): GnssPoint[] => {
      const role = (row.role ?? "").trim();
      if (!/已知|known|fixed|control/i.test(role)) return [];
      const id = row.pointId?.trim();
      const x = parseNumericCell(row.x ?? "");
      const y = parseNumericCell(row.y ?? "");
      const z = parseNumericCell(row.z ?? "");
      if (!id || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return [];
      return [{ id, x, y, z }];
    });
    const approximatePoints = rows.flatMap((row): GnssPoint[] => {
      const role = (row.role ?? "").trim();
      if (!/待定|unknown|approx|approximate/i.test(role)) return [];
      const id = row.pointId?.trim();
      const x = parseNumericCell(row.x ?? "");
      const y = parseNumericCell(row.y ?? "");
      const z = parseNumericCell(row.z ?? "");
      if (!id || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return [];
      return [{ id, x, y, z }];
    });
    const observations = rows.flatMap((row): GnssBaselineObservation[] => {
      const role = (row.role ?? "").trim();
      const observationType = (row.observationType ?? "").trim();
      const looksLikeObservation = /观测|observation|obs/i.test(role) || /gnss|baseline|基线/i.test(observationType);
      if (!looksLikeObservation) return [];
      const id = row.pointId?.trim() || `BL${rows.indexOf(row) + 1}`;
      const from = row.from?.trim();
      const to = row.to?.trim();
      const dx = parseNumericCell(row.dx ?? "");
      const dy = parseNumericCell(row.dy ?? "");
      const dz = parseNumericCell(row.dz ?? "");
      const sigmaXMm = parseNumericCell(row.sigmaXMm ?? "");
      const sigmaYMm = parseNumericCell(row.sigmaYMm ?? "");
      const sigmaZMm = parseNumericCell(row.sigmaZMm ?? "");
      if (!from || !to || !Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) return [];
      return [
        {
          id,
          from,
          to,
          dx,
          dy,
          dz,
          ...(Number.isFinite(sigmaXMm) && sigmaXMm > 0 ? { sigmaXMm } : {}),
          ...(Number.isFinite(sigmaYMm) && sigmaYMm > 0 ? { sigmaYMm } : {}),
          ...(Number.isFinite(sigmaZMm) && sigmaZMm > 0 ? { sigmaZMm } : {}),
        },
      ];
    });
    if (knownPoints.length === 0) throw new Error("control_network GNSS 基线 CSV 至少需要 1 个已知三维点");
    if (observations.length === 0) throw new Error("control_network GNSS 基线 CSV 未解析到有效基线观测");
    return {
      mode: "gnss_baseline_adjustment",
      parsedRowCount: rows.length,
      gnssBaseline: { knownPoints, approximatePoints, observations },
    };
  }

  const hasLevelingFields = rows.some((row) => {
    const role = (row.role ?? "").trim();
    const observationType = (row.observationType ?? "").trim();
    return (
      /水准|高差|height|level/i.test(observationType) ||
      (/观测|observation|obs/i.test(role) && Boolean(row.from && row.to && row.value))
    );
  });

  if (hasLevelingFields) {
    const knownPoints = rows.flatMap((row): LevelingKnownPoint[] => {
      const role = (row.role ?? "").trim();
      if (!/已知|known|benchmark|bm/i.test(role)) return [];
      const id = row.pointId?.trim();
      const z = parseNumericCell(row.z ?? "");
      if (!id || !Number.isFinite(z)) return [];
      return [{ id, z }];
    });
    const observations = rows.flatMap((row): LevelingObservation[] => {
      const role = (row.role ?? "").trim();
      const observationType = (row.observationType ?? "").trim();
      if (!(/观测|observation|obs/i.test(role) || /水准|高差|height|level/i.test(observationType))) return [];
      const id = row.pointId?.trim() || `L${rows.indexOf(row) + 1}`;
      const from = row.from?.trim();
      const to = row.to?.trim();
      let value = parseNumericCell(row.value ?? "");
      if (Number.isFinite(value) && Math.abs(value) > 10) value /= 1000;
      const distanceKm =
        Number.isFinite(parseNumericCell(row.distanceKm ?? ""))
          ? parseNumericCell(row.distanceKm ?? "")
          : Number.isFinite(parseNumericCell(row.distance ?? ""))
            ? parseNumericCell(row.distance ?? "") / 1000
            : Number.NaN;
      if (!from || !to || !Number.isFinite(value)) return [];
      return [
        {
          id,
          from,
          to,
          value,
          ...(Number.isFinite(distanceKm) && distanceKm > 0 ? { distanceKm } : {}),
        },
      ];
    });
    const closureToleranceMm = rows
      .map((row) => parseNumericCell(row.closureToleranceMm ?? ""))
      .find((value) => Number.isFinite(value) && value > 0);
    if (knownPoints.length < 2) throw new Error("control_network 水准路线 CSV 至少需要 2 个已知高程点");
    if (observations.length === 0) throw new Error("control_network 水准路线 CSV 未解析到有效高差观测");
    return {
      mode: "leveling_route_closure",
      parsedRowCount: rows.length,
      levelingRoute: {
        knownPoints,
        observations,
        ...(closureToleranceMm !== undefined ? { closureToleranceMm } : {}),
      },
    };
  }

  const hasTraverseFields = rows.some((row) => {
    const role = (row.role ?? "").trim();
    return (
      Number.isFinite(parseNumericCell(row.distance ?? "")) ||
      Number.isFinite(parseNumericCell(row.azimuthDegrees ?? "")) ||
      /起点|终点|导线|边|start|end|leg/i.test(role)
    );
  });

  if (!hasTraverseFields) {
    const observations = rows.flatMap((row): ControlObservationInput[] => {
      const pointId = row.pointId?.trim();
      const x = parseNumericCell(row.x ?? "");
      const y = parseNumericCell(row.y ?? "");
      const weight = parseNumericCell(row.weight ?? "");
      if (!pointId || !Number.isFinite(x) || !Number.isFinite(y)) return [];
      return [{ pointId, x, y, weight: Number.isFinite(weight) && weight > 0 ? weight : 1 }];
    });
    if (observations.length < 2) throw new Error("control_network CSV 未解析到足够的同名点坐标观测");
    return { mode: "coordinate_observations", observations, parsedRowCount: rows.length };
  }

  const startRow =
    rows.find((row) => /起点|起算|start/i.test(row.role ?? "")) ??
    rows.find((row) => Number.isFinite(parseNumericCell(row.x ?? "")) && Number.isFinite(parseNumericCell(row.y ?? "")));
  const endRow =
    rows.find((row) => /终点|闭合|end/i.test(row.role ?? "")) ??
    [...rows]
      .reverse()
      .find((row) => Number.isFinite(parseNumericCell(row.x ?? "")) && Number.isFinite(parseNumericCell(row.y ?? "")));
  if (!startRow || !endRow) throw new Error("control_network 导线 CSV 需要起点和终点坐标");

  const startX = parseNumericCell(startRow.x ?? "");
  const startY = parseNumericCell(startRow.y ?? "");
  const endX = parseNumericCell(endRow.x ?? "");
  const endY = parseNumericCell(endRow.y ?? "");
  const tolerance =
    rows.map((row) => parseNumericCell(row.closureToleranceMm ?? "")).find((value) => Number.isFinite(value) && value > 0) ??
    50;
  const legs = rows.flatMap((row): TraverseInput["legs"] => {
    const distance = parseNumericCell(row.distance ?? "");
    const azimuth = parseNumericCell(row.azimuthDegrees ?? "");
    const to = row.pointId?.trim();
    if (!to || !Number.isFinite(distance) || distance <= 0 || !Number.isFinite(azimuth)) return [];
    return [{ to, distance, azimuthDegrees: azimuth }];
  });
  if (!Number.isFinite(startX) || !Number.isFinite(startY) || !Number.isFinite(endX) || !Number.isFinite(endY)) {
    throw new Error("control_network 导线 CSV 起点/终点坐标不是有效数字");
  }
  if (legs.length === 0) throw new Error("control_network 导线 CSV 未解析到有效边长和方位角");

  return {
    mode: "traverse_closure",
    parsedRowCount: rows.length,
    traverse: {
      start: { id: startRow.pointId?.trim() || "START", x: startX, y: startY },
      end: { id: endRow.pointId?.trim() || legs.at(-1)?.to || "END", x: endX, y: endY },
      closureToleranceMm: tolerance,
      legs,
    },
  };
}

function controlNetworkInput(input: ControlNetworkInput): ParsedControlNetworkCsv & { inputFormat: "json" | "csv" } {
  if (input.traverse) return { mode: "traverse_closure", traverse: input.traverse, parsedRowCount: 0, inputFormat: "json" };
  if (input.observations) {
    return {
      mode: "coordinate_observations",
      observations: input.observations,
      parsedRowCount: 0,
      inputFormat: "json",
    };
  }
  if (input.csvText) return { ...parseControlNetworkCsv(input.csvText, input.csvDelimiter), inputFormat: "csv" };
  throw new Error("control_network 需要提供 observations、traverse 或 csvText 输入");
}

const COORD_TRANSFORM_CSV_ALIASES = new Map<
  string,
  "role" | "id" | "sourceX" | "sourceY" | "targetX" | "targetY"
>(
  [
    ["role", "role"],
    ["type", "role"],
    ["类型", "role"],
    ["记录类型", "role"],
    ["id", "id"],
    ["pointid", "id"],
    ["点号", "id"],
    ["点名", "id"],
    ["编号", "id"],
    ["sourcex", "sourceX"],
    ["sourceeast", "sourceX"],
    ["源x", "sourceX"],
    ["源坐标x", "sourceX"],
    ["源东坐标", "sourceX"],
    ["原x", "sourceX"],
    ["原始x", "sourceX"],
    ["x", "sourceX"],
    ["sourcey", "sourceY"],
    ["sourcenorth", "sourceY"],
    ["源y", "sourceY"],
    ["源坐标y", "sourceY"],
    ["源北坐标", "sourceY"],
    ["原y", "sourceY"],
    ["原始y", "sourceY"],
    ["y", "sourceY"],
    ["targetx", "targetX"],
    ["targeteast", "targetX"],
    ["目标x", "targetX"],
    ["目标坐标x", "targetX"],
    ["目标东坐标", "targetX"],
    ["转换后x", "targetX"],
    ["targety", "targetY"],
    ["targetnorth", "targetY"],
    ["目标y", "targetY"],
    ["目标坐标y", "targetY"],
    ["目标北坐标", "targetY"],
    ["转换后y", "targetY"],
  ].map(([alias, key]) => [
    normalizeCsvHeader(alias),
    key as "role" | "id" | "sourceX" | "sourceY" | "targetX" | "targetY",
  ]),
);

function parseCoordTransformCsv(text: string, delimiterOption: CoordTransformInput["csvDelimiter"]): ParsedCoordTransformCsv {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("coord_transform CSV 至少需要表头和 1 行数据");
  const delimiter = detectCsvDelimiter(lines[0]!, delimiterOption);
  const headers = splitDelimitedLine(lines[0]!, delimiter).map((header) =>
    COORD_TRANSFORM_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  const controlPoints: CoordControlPointInput[] = [];
  const points: CoordTransformPointInput[] = [];
  for (const line of lines.slice(1)) {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, index) => {
      const key = headers[index];
      if (key) row[key] = cell;
    });
    const id = row.id?.trim();
    const sourceX = parseNumericCell(row.sourceX ?? "");
    const sourceY = parseNumericCell(row.sourceY ?? "");
    const targetX = parseNumericCell(row.targetX ?? "");
    const targetY = parseNumericCell(row.targetY ?? "");
    if (!id || !Number.isFinite(sourceX) || !Number.isFinite(sourceY)) continue;
    const role = (row.role ?? "").trim();
    const hasTarget = Number.isFinite(targetX) && Number.isFinite(targetY);
    const isControl = hasTarget || /公共|控制|已知|common|control/i.test(role);
    if (isControl && hasTarget) {
      controlPoints.push({ id, sourceX, sourceY, targetX, targetY });
      continue;
    }
    if (!hasTarget || /待转换|转换点|未知|transform|point/i.test(role)) {
      points.push({ id, x: sourceX, y: sourceY });
    }
  }
  if (controlPoints.length > 0 && controlPoints.length < 2) throw new Error("coord_transform CSV 公共点少于 2 个，不能反算参数");
  if (controlPoints.length === 0 && points.length === 0) throw new Error("coord_transform CSV 未解析到有效公共点或待转换点");
  return { controlPoints, points, parsedRowCount: lines.length - 1 };
}

function coordTransformInput(input: CoordTransformInput): CoordTransformInput & {
  inputFormat: "json" | "csv";
  parsedControlPointCount: number | null;
  parsedTransformPointCount: number | null;
} {
  if (input.csvText) {
    const parsed = parseCoordTransformCsv(input.csvText, input.csvDelimiter);
    return {
      ...input,
      controlPoints: parsed.controlPoints.length >= 2 ? parsed.controlPoints : undefined,
      points: parsed.points,
      inputFormat: "csv",
      parsedControlPointCount: parsed.controlPoints.length,
      parsedTransformPointCount: parsed.points.length,
    };
  }
  return {
    ...input,
    inputFormat: "json",
    parsedControlPointCount: null,
    parsedTransformPointCount: null,
  };
}

const LINE_STAKEOUT_CSV_ALIASES = new Map<
  string,
  | "pointId"
  | "stationX"
  | "stationY"
  | "backsightX"
  | "backsightY"
  | "designX"
  | "designY"
  | "measuredX"
  | "measuredY"
  | "toleranceMm"
>(
  [
    ["id", "pointId"],
    ["pointid", "pointId"],
    ["点号", "pointId"],
    ["点名", "pointId"],
    ["编号", "pointId"],
    ["放样点号", "pointId"],
    ["目标点号", "pointId"],
    ["stationx", "stationX"],
    ["stationeast", "stationX"],
    ["测站x", "stationX"],
    ["测站东坐标", "stationX"],
    ["测站坐标x", "stationX"],
    ["stationy", "stationY"],
    ["stationnorth", "stationY"],
    ["测站y", "stationY"],
    ["测站北坐标", "stationY"],
    ["测站坐标y", "stationY"],
    ["backsightx", "backsightX"],
    ["backsighteast", "backsightX"],
    ["后视x", "backsightX"],
    ["后视东坐标", "backsightX"],
    ["后视坐标x", "backsightX"],
    ["backsighty", "backsightY"],
    ["backsightnorth", "backsightY"],
    ["后视y", "backsightY"],
    ["后视北坐标", "backsightY"],
    ["后视坐标y", "backsightY"],
    ["designx", "designX"],
    ["targetx", "designX"],
    ["stakeoutx", "designX"],
    ["设计x", "designX"],
    ["设计东坐标", "designX"],
    ["设计坐标x", "designX"],
    ["放样x", "designX"],
    ["目标x", "designX"],
    ["designy", "designY"],
    ["targety", "designY"],
    ["stakeouty", "designY"],
    ["设计y", "designY"],
    ["设计北坐标", "designY"],
    ["设计坐标y", "designY"],
    ["放样y", "designY"],
    ["目标y", "designY"],
    ["measuredx", "measuredX"],
    ["actualx", "measuredX"],
    ["checkx", "measuredX"],
    ["复测x", "measuredX"],
    ["实测x", "measuredX"],
    ["复测东坐标", "measuredX"],
    ["实测东坐标", "measuredX"],
    ["measuredy", "measuredY"],
    ["actualy", "measuredY"],
    ["checky", "measuredY"],
    ["复测y", "measuredY"],
    ["实测y", "measuredY"],
    ["复测北坐标", "measuredY"],
    ["实测北坐标", "measuredY"],
    ["tolerancemm", "toleranceMm"],
    ["tolerance", "toleranceMm"],
    ["限差", "toleranceMm"],
    ["平面限差", "toleranceMm"],
    ["点位限差", "toleranceMm"],
  ].map(([alias, key]) => [
    normalizeCsvHeader(alias),
    key as
      | "pointId"
      | "stationX"
      | "stationY"
      | "backsightX"
      | "backsightY"
      | "designX"
      | "designY"
      | "measuredX"
      | "measuredY"
      | "toleranceMm",
  ]),
);

function parseLineStakeoutCsv(text: string, delimiterOption: LineStakeoutInput["csvDelimiter"]): {
  rows: ParsedLineStakeoutRow[];
  parsedRowCount: number;
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("line_stakeout CSV 至少需要表头和 1 行数据");
  const delimiter = detectCsvDelimiter(lines[0]!, delimiterOption);
  const headers = splitDelimitedLine(lines[0]!, delimiter).map((header) =>
    LINE_STAKEOUT_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  const rows = lines.slice(1).flatMap((line, index): ParsedLineStakeoutRow[] => {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, cellIndex) => {
      const key = headers[cellIndex];
      if (key) row[key] = cell;
    });
    const stationX = parseNumericCell(row.stationX ?? "");
    const stationY = parseNumericCell(row.stationY ?? "");
    const backsightX = parseNumericCell(row.backsightX ?? "");
    const backsightY = parseNumericCell(row.backsightY ?? "");
    const designX = parseNumericCell(row.designX ?? "");
    const designY = parseNumericCell(row.designY ?? "");
    if (
      !Number.isFinite(stationX) ||
      !Number.isFinite(stationY) ||
      !Number.isFinite(backsightX) ||
      !Number.isFinite(backsightY) ||
      !Number.isFinite(designX) ||
      !Number.isFinite(designY)
    ) {
      return [];
    }
    const measuredX = parseNumericCell(row.measuredX ?? "");
    const measuredY = parseNumericCell(row.measuredY ?? "");
    const tolerance = parseNumericCell(row.toleranceMm ?? "");
    return [
      {
        pointId: row.pointId?.trim() || `P${index + 1}`,
        station: { x: stationX, y: stationY },
        backsight: { x: backsightX, y: backsightY },
        stakeoutPoint: { id: row.pointId?.trim() || `P${index + 1}`, x: designX, y: designY },
        ...(Number.isFinite(measuredX) && Number.isFinite(measuredY)
          ? { measuredPoint: { x: measuredX, y: measuredY } }
          : {}),
        toleranceMm: Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 30,
      },
    ];
  });
  if (rows.length === 0) throw new Error("line_stakeout CSV 未解析到有效放样点");
  return { rows, parsedRowCount: lines.length - 1 };
}

function lineStakeoutResult(
  station: { x: number; y: number },
  backsight: { x: number; y: number },
  stakeoutPoint: LineStakeoutPointInput,
  measuredPoint: { x: number; y: number } | undefined,
  toleranceMm: number,
): Record<string, unknown> {
  const backAz = azimuthDegrees(backsight.x - station.x, backsight.y - station.y);
  const targetAz = azimuthDegrees(stakeoutPoint.x - station.x, stakeoutPoint.y - station.y);
  const turn = (targetAz - backAz + 360) % 360;
  const recheckDxMm = measuredPoint ? (measuredPoint.x - stakeoutPoint.x) * 1000 : Number.NaN;
  const recheckDyMm = measuredPoint ? (measuredPoint.y - stakeoutPoint.y) * 1000 : Number.NaN;
  const planarErrorMm = Math.hypot(recheckDxMm, recheckDyMm);
  return {
    point_id: stakeoutPoint.id ?? null,
    distance_m: round(hypot2(stakeoutPoint.x - station.x, stakeoutPoint.y - station.y), 4),
    backsight_azimuth_degrees: backAz,
    target_azimuth_degrees: targetAz,
    right_turn_angle_degrees: round(turn, 6),
    ...(measuredPoint
      ? {
          recheck_dx_mm: round(recheckDxMm, 3),
          recheck_dy_mm: round(recheckDyMm, 3),
          planar_error_mm: round(planarErrorMm, 3),
          tolerance_mm: toleranceMm,
          is_passed: planarErrorMm <= toleranceMm,
        }
      : {}),
  };
}

function runLineStakeoutBatch(rows: ParsedLineStakeoutRow[], parsedRowCount: number): Record<string, unknown> {
  const details = rows.map((row) =>
    lineStakeoutResult(row.station, row.backsight, row.stakeoutPoint, row.measuredPoint, row.toleranceMm),
  );
  const failedDetails = details.filter((row) => row.is_passed === false);
  const planarErrors = details.flatMap((row) =>
    typeof row.planar_error_mm === "number" && Number.isFinite(row.planar_error_mm) ? [row.planar_error_mm] : [],
  );
  const rowsWithPlanarError = details.filter(
    (row) => typeof row.planar_error_mm === "number" && Number.isFinite(row.planar_error_mm),
  );
  const worstPoint = rowsWithPlanarError.reduce(
    (max, row) => ((row.planar_error_mm as number) > (max.planar_error_mm as number) ? row : max),
    rowsWithPlanarError[0] ?? details[0]!,
  );
  const lineStakeoutSummary = {
    point_count: details.length,
    failed_count: failedDetails.length,
    pass_rate_pct: details.length > 0 ? round(((details.length - failedDetails.length) / details.length) * 100, 3) : 0,
    max_planar_error_mm: planarErrors.length > 0 ? round(Math.max(...planarErrors), 3) : null,
    max_abs_dx_mm: round(
      Math.max(
        0,
        ...details.flatMap((row) =>
          typeof row.recheck_dx_mm === "number" && Number.isFinite(row.recheck_dx_mm)
            ? [Math.abs(row.recheck_dx_mm)]
            : [],
        ),
      ),
      3,
    ),
    max_abs_dy_mm: round(
      Math.max(
        0,
        ...details.flatMap((row) =>
          typeof row.recheck_dy_mm === "number" && Number.isFinite(row.recheck_dy_mm)
            ? [Math.abs(row.recheck_dy_mm)]
            : [],
        ),
      ),
      3,
    ),
    quality_status:
      rowsWithPlanarError.length === 0 ? "unchecked" : failedDetails.length > 0 ? "alert" : "pass",
    worst_point:
      rowsWithPlanarError.length > 0
        ? {
            point_id: worstPoint.point_id,
            planar_error_mm: worstPoint.planar_error_mm,
            is_passed: worstPoint.is_passed,
          }
        : null,
  };
  const exportRows = details.map((row) => ({
    row_type: "line_stakeout_point_result",
    point_id: row.point_id,
    distance_m: row.distance_m,
    backsight_azimuth_degrees: row.backsight_azimuth_degrees,
    target_azimuth_degrees: row.target_azimuth_degrees,
    right_turn_angle_degrees: row.right_turn_angle_degrees,
    ...(typeof row.recheck_dx_mm === "number" && Number.isFinite(row.recheck_dx_mm)
      ? { recheck_dx_mm: row.recheck_dx_mm }
      : {}),
    ...(typeof row.recheck_dy_mm === "number" && Number.isFinite(row.recheck_dy_mm)
      ? { recheck_dy_mm: row.recheck_dy_mm }
      : {}),
    ...(typeof row.planar_error_mm === "number" && Number.isFinite(row.planar_error_mm)
      ? { planar_error_mm: row.planar_error_mm }
      : {}),
    ...(typeof row.tolerance_mm === "number" && Number.isFinite(row.tolerance_mm)
      ? { tolerance_mm: row.tolerance_mm }
      : {}),
    status: row.is_passed === false ? "alert" : row.is_passed === true ? "pass" : "unchecked",
    ...(typeof row.is_passed === "boolean" ? { is_passed: row.is_passed } : {}),
  }));
  return {
    mode: "batch_recheck",
    input_format: "csv",
    parsed_row_count: parsedRowCount,
    point_count: details.length,
    failed_count: failedDetails.length,
    failed_points: failedDetails.map((row) => row.point_id),
    max_planar_error_mm: planarErrors.length > 0 ? round(Math.max(...planarErrors), 3) : null,
    line_stakeout_summary: lineStakeoutSummary,
    details,
    export_rows: exportRows,
  };
}

const SHIELD_GUIDANCE_CSV_ALIASES = new Map<
  string,
  | "ringNo"
  | "designX"
  | "designY"
  | "designZ"
  | "designAzimuthDegrees"
  | "actualX"
  | "actualY"
  | "actualZ"
  | "actualAzimuthDegrees"
  | "dxMm"
  | "dyMm"
  | "horizontalDeviationMm"
  | "verticalDeviationMm"
  | "azimuthDeviationDegrees"
  | "horizontalToleranceMm"
  | "verticalToleranceMm"
  | "azimuthToleranceDeg"
>(
  [
    ["ringno", "ringNo"],
    ["ring", "ringNo"],
    ["ringnumber", "ringNo"],
    ["环号", "ringNo"],
    ["盾构环号", "ringNo"],
    ["管片环号", "ringNo"],
    ["设计x", "designX"],
    ["设计东坐标", "designX"],
    ["设计坐标x", "designX"],
    ["设计y", "designY"],
    ["设计北坐标", "designY"],
    ["设计坐标y", "designY"],
    ["设计z", "designZ"],
    ["设计高程", "designZ"],
    ["设计标高", "designZ"],
    ["设计方位角", "designAzimuthDegrees"],
    ["设计方位", "designAzimuthDegrees"],
    ["设计姿态角", "designAzimuthDegrees"],
    ["designazimuthdegrees", "designAzimuthDegrees"],
    ["designazimuth", "designAzimuthDegrees"],
    ["实测x", "actualX"],
    ["实际x", "actualX"],
    ["实测东坐标", "actualX"],
    ["实测坐标x", "actualX"],
    ["actualx", "actualX"],
    ["实测y", "actualY"],
    ["实际y", "actualY"],
    ["实测北坐标", "actualY"],
    ["实测坐标y", "actualY"],
    ["actualy", "actualY"],
    ["实测z", "actualZ"],
    ["实际z", "actualZ"],
    ["实测高程", "actualZ"],
    ["实际高程", "actualZ"],
    ["实测标高", "actualZ"],
    ["actualz", "actualZ"],
    ["实测方位角", "actualAzimuthDegrees"],
    ["实际方位角", "actualAzimuthDegrees"],
    ["实测方位", "actualAzimuthDegrees"],
    ["actualazimuthdegrees", "actualAzimuthDegrees"],
    ["actualazimuth", "actualAzimuthDegrees"],
    ["dx", "dxMm"],
    ["deltax", "dxMm"],
    ["x偏差", "dxMm"],
    ["东向偏差", "dxMm"],
    ["纵向偏差", "dxMm"],
    ["dy", "dyMm"],
    ["deltay", "dyMm"],
    ["y偏差", "dyMm"],
    ["北向偏差", "dyMm"],
    ["横向偏差", "dyMm"],
    ["水平偏差", "horizontalDeviationMm"],
    ["平面偏差", "horizontalDeviationMm"],
    ["水平偏差值", "horizontalDeviationMm"],
    ["平面偏差值", "horizontalDeviationMm"],
    ["高程偏差", "verticalDeviationMm"],
    ["竖向偏差", "verticalDeviationMm"],
    ["垂直偏差", "verticalDeviationMm"],
    ["高程偏差值", "verticalDeviationMm"],
    ["方位偏差", "azimuthDeviationDegrees"],
    ["方位角偏差", "azimuthDeviationDegrees"],
    ["姿态偏差", "azimuthDeviationDegrees"],
    ["方位偏差值", "azimuthDeviationDegrees"],
    ["水平限差", "horizontalToleranceMm"],
    ["横向限差", "horizontalToleranceMm"],
    ["平面限差", "horizontalToleranceMm"],
    ["horizontaltolerancemm", "horizontalToleranceMm"],
    ["高程限差", "verticalToleranceMm"],
    ["竖向限差", "verticalToleranceMm"],
    ["verticaltolerancemm", "verticalToleranceMm"],
    ["方位限差", "azimuthToleranceDeg"],
    ["方位角限差", "azimuthToleranceDeg"],
    ["azimuthtolerancedeg", "azimuthToleranceDeg"],
  ].map(([alias, key]) => [
    normalizeCsvHeader(alias),
    key as
      | "ringNo"
      | "designX"
      | "designY"
      | "designZ"
      | "designAzimuthDegrees"
      | "actualX"
      | "actualY"
      | "actualZ"
      | "actualAzimuthDegrees"
      | "dxMm"
      | "dyMm"
      | "horizontalDeviationMm"
      | "verticalDeviationMm"
      | "azimuthDeviationDegrees"
      | "horizontalToleranceMm"
      | "verticalToleranceMm"
      | "azimuthToleranceDeg",
  ]),
);

function parseShieldGuidanceCsv(
  text: string,
  delimiterOption: ShieldGuidanceInput["csvDelimiter"],
): {
  rings: ShieldRingInput[];
  parsedRowCount: number;
  tolerances: Partial<ShieldTolerances>;
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("shield_guidance CSV 至少需要表头和 1 行数据");
  const delimiter = detectCsvDelimiter(lines[0]!, delimiterOption);
  const headers = splitDelimitedLine(lines[0]!, delimiter).map((header) =>
    SHIELD_GUIDANCE_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  const rings: ShieldRingInput[] = [];
  const tolerances: Partial<ShieldTolerances> = {};
  for (const line of lines.slice(1)) {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, index) => {
      const key = headers[index];
      if (key) row[key] = cell;
    });
    const ringNo = parseNumericCell(row.ringNo ?? "");
    const designX = parseNumericCell(row.designX ?? "");
    const designY = parseNumericCell(row.designY ?? "");
    const designZ = parseNumericCell(row.designZ ?? "");
    const designAzimuthDegrees = parseNumericCell(row.designAzimuthDegrees ?? "");
    const actualX = parseNumericCell(row.actualX ?? "");
    const actualY = parseNumericCell(row.actualY ?? "");
    const actualZ = parseNumericCell(row.actualZ ?? "");
    const actualAzimuthDegrees = parseNumericCell(row.actualAzimuthDegrees ?? "");
    const dxMm = parseNumericCell(row.dxMm ?? "");
    const dyMm = parseNumericCell(row.dyMm ?? "");
    const horizontalDeviationMm = parseNumericCell(row.horizontalDeviationMm ?? "");
    const verticalDeviationMm = parseNumericCell(row.verticalDeviationMm ?? "");
    const azimuthDeviationDegrees = parseNumericCell(row.azimuthDeviationDegrees ?? "");
    const horizontalToleranceMm = parseNumericCell(row.horizontalToleranceMm ?? "");
    const verticalToleranceMm = parseNumericCell(row.verticalToleranceMm ?? "");
    const azimuthToleranceDeg = parseNumericCell(row.azimuthToleranceDeg ?? "");
    if (Number.isFinite(horizontalToleranceMm) && horizontalToleranceMm > 0 && tolerances.horizontalToleranceMm === undefined) {
      tolerances.horizontalToleranceMm = horizontalToleranceMm;
    }
    if (Number.isFinite(verticalToleranceMm) && verticalToleranceMm > 0 && tolerances.verticalToleranceMm === undefined) {
      tolerances.verticalToleranceMm = verticalToleranceMm;
    }
    if (Number.isFinite(azimuthToleranceDeg) && azimuthToleranceDeg > 0 && tolerances.azimuthToleranceDeg === undefined) {
      tolerances.azimuthToleranceDeg = azimuthToleranceDeg;
    }
    if (
      !Number.isFinite(ringNo) ||
      !Number.isFinite(designX) ||
      !Number.isFinite(designY) ||
      !Number.isFinite(designZ) ||
      !Number.isFinite(designAzimuthDegrees)
    ) {
      continue;
    }
    const resolvedActualX = Number.isFinite(actualX)
      ? actualX
      : Number.isFinite(dxMm)
        ? designX + dxMm / 1000
        : Number.isFinite(horizontalDeviationMm)
          ? designX + horizontalDeviationMm / 1000
          : Number.NaN;
    const resolvedActualY = Number.isFinite(actualY)
      ? actualY
      : Number.isFinite(dyMm) || Number.isFinite(dxMm) || Number.isFinite(horizontalDeviationMm)
        ? designY + (Number.isFinite(dyMm) ? dyMm / 1000 : 0)
        : Number.NaN;
    const resolvedActualZ = Number.isFinite(actualZ)
      ? actualZ
      : Number.isFinite(verticalDeviationMm)
        ? designZ + verticalDeviationMm / 1000
        : Number.NaN;
    const resolvedActualAzimuthDegrees = Number.isFinite(actualAzimuthDegrees)
      ? actualAzimuthDegrees
      : Number.isFinite(azimuthDeviationDegrees)
        ? designAzimuthDegrees + azimuthDeviationDegrees
        : Number.NaN;
    if (
      !Number.isFinite(resolvedActualX) ||
      !Number.isFinite(resolvedActualY) ||
      !Number.isFinite(resolvedActualZ) ||
      !Number.isFinite(resolvedActualAzimuthDegrees)
    ) {
      continue;
    }
    rings.push({
      ringNo,
      design: { x: designX, y: designY, z: designZ, azimuthDegrees: designAzimuthDegrees },
      actual: {
        x: resolvedActualX,
        y: resolvedActualY,
        z: resolvedActualZ,
        azimuthDegrees: resolvedActualAzimuthDegrees,
      },
    });
  }
  if (rings.length === 0) throw new Error("shield_guidance CSV 未解析到有效盾构环姿态记录");
  return { rings: rings.sort((left, right) => left.ringNo - right.ringNo), parsedRowCount: lines.length - 1, tolerances };
}

const WATER_LEVEL_CSV_ALIASES = new Map<
  string,
  "wellId" | "date" | "elevationM" | "elevationMm" | "depthM" | "referenceElevationM" | "alertThresholdMm" | "rateThresholdMmPerDay"
>(
  [
    ["wellid", "wellId"],
    ["well", "wellId"],
    ["id", "wellId"],
    ["井号", "wellId"],
    ["水位井", "wellId"],
    ["观测井", "wellId"],
    ["测井编号", "wellId"],
    ["date", "date"],
    ["观测日期", "date"],
    ["日期", "date"],
    ["时间", "date"],
    ["elevationm", "elevationM"],
    ["levelm", "elevationM"],
    ["waterlevelm", "elevationM"],
    ["groundwaterlevelm", "elevationM"],
    ["水位高程", "elevationM"],
    ["地下水位", "elevationM"],
    ["本次水位", "elevationM"],
    ["本期水位", "elevationM"],
    ["水位", "elevationM"],
    ["elevationmm", "elevationMm"],
    ["levelmm", "elevationMm"],
    ["waterlevelmm", "elevationMm"],
    ["groundwaterlevelmm", "elevationMm"],
    ["水位高程mm", "elevationMm"],
    ["地下水位mm", "elevationMm"],
    ["水位mm", "elevationMm"],
    ["depthm", "depthM"],
    ["waterdepthm", "depthM"],
    ["水位埋深", "depthM"],
    ["水位深度", "depthM"],
    ["地下水位埋深", "depthM"],
    ["referenceelevationm", "referenceElevationM"],
    ["wellheadelevationm", "referenceElevationM"],
    ["井口高程", "referenceElevationM"],
    ["管口高程", "referenceElevationM"],
    ["基准高程", "referenceElevationM"],
    ["累计预警值", "alertThresholdMm"],
    ["累计预警", "alertThresholdMm"],
    ["水位累计预警值", "alertThresholdMm"],
    ["水位预警值", "alertThresholdMm"],
    ["预警值", "alertThresholdMm"],
    ["alertthresholdmm", "alertThresholdMm"],
    ["速率预警值", "rateThresholdMmPerDay"],
    ["速率预警", "rateThresholdMmPerDay"],
    ["水位速率预警值", "rateThresholdMmPerDay"],
    ["变化速率预警值", "rateThresholdMmPerDay"],
    ["ratethresholdmmperday", "rateThresholdMmPerDay"],
  ].map(([alias, key]) => [
    normalizeCsvHeader(alias),
    key as "wellId" | "date" | "elevationM" | "elevationMm" | "depthM" | "referenceElevationM" | "alertThresholdMm" | "rateThresholdMmPerDay",
  ]),
);

function parseWaterLevelCsv(text: string, delimiterOption: WaterLevelInput["csvDelimiter"]): {
  observations: WaterLevelObservationInput[];
  parsedRowCount: number;
  parsedObservationCount: number;
  tableFormat: "long" | "wide";
  alertThresholdMm: number | null;
  rateThresholdMmPerDay: number | null;
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("water_level CSV 至少需要表头和 1 行数据");
  const delimiter = detectCsvDelimiter(lines[0]!, delimiterOption);
  const rawHeaders = splitDelimitedLine(lines[0]!, delimiter);
  const headers = rawHeaders.map((header) =>
    WATER_LEVEL_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  if (!headers.includes("elevationM") && !headers.includes("elevationMm") && !headers.includes("depthM") && headers.includes("date")) {
    return parseWideWaterLevelCsv(lines, delimiter, rawHeaders, headers);
  }
  let alertThresholdMm: number | null = null;
  let rateThresholdMmPerDay: number | null = null;
  const observations: WaterLevelObservationInput[] = [];
  for (const line of lines.slice(1)) {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, index) => {
      const key = headers[index];
      if (key) row[key] = cell;
    });
    const wellId = row.wellId?.trim();
    const date = row.date?.trim();
    const elevationM = parseNumericCell(row.elevationM ?? "");
    const elevationMm = parseNumericCell(row.elevationMm ?? "");
    const depthM = parseNumericCell(row.depthM ?? "");
    const referenceElevationM = parseNumericCell(row.referenceElevationM ?? "");
    const rowAlertThresholdMm = parseNumericCell(row.alertThresholdMm ?? "");
    const rowRateThresholdMmPerDay = parseNumericCell(row.rateThresholdMmPerDay ?? "");
    if (Number.isFinite(rowAlertThresholdMm) && rowAlertThresholdMm > 0 && alertThresholdMm === null) {
      alertThresholdMm = rowAlertThresholdMm;
    }
    if (Number.isFinite(rowRateThresholdMmPerDay) && rowRateThresholdMmPerDay > 0 && rateThresholdMmPerDay === null) {
      rateThresholdMmPerDay = rowRateThresholdMmPerDay;
    }
    const elevation = Number.isFinite(elevationM)
      ? elevationM
      : Number.isFinite(elevationMm)
        ? elevationMm / 1000
        : Number.isFinite(referenceElevationM) && Number.isFinite(depthM)
          ? referenceElevationM - depthM
          : Number.NaN;
    if (!wellId || !date || !Number.isFinite(elevation)) continue;
    observations.push({ wellId, date, elevation });
  }
  if (observations.length < 2) throw new Error("water_level CSV 未解析到足够的水位观测记录");
  return {
    observations,
    parsedRowCount: lines.length - 1,
    parsedObservationCount: observations.length,
    tableFormat: "long",
    alertThresholdMm,
    rateThresholdMmPerDay,
  };
}

function parseWideWaterLevelCsv(
  lines: string[],
  delimiter: string,
  rawHeaders: string[],
  headers: Array<
    | "wellId"
    | "date"
    | "elevationM"
    | "elevationMm"
    | "depthM"
    | "referenceElevationM"
    | "alertThresholdMm"
    | "rateThresholdMmPerDay"
    | undefined
  >,
): {
  observations: WaterLevelObservationInput[];
  parsedRowCount: number;
  parsedObservationCount: number;
  tableFormat: "wide";
  alertThresholdMm: number | null;
  rateThresholdMmPerDay: number | null;
} {
  const dateIndex = headers.findIndex((header) => header === "date");
  if (dateIndex < 0) throw new Error("water_level 宽表 CSV 需要观测日期列");
  const pointColumns = rawHeaders
    .map((header, index) => ({
      index,
      wellId: normalizeWaterLevelWidePointHeader(header),
      mapped: headers[index],
    }))
    .filter(({ index, wellId, mapped }) => index !== dateIndex && !mapped && wellId.length > 0);
  if (pointColumns.length === 0) throw new Error("water_level 宽表 CSV 未识别到水位井数值列");

  let alertThresholdMm: number | null = null;
  let rateThresholdMmPerDay: number | null = null;
  const observations: WaterLevelObservationInput[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitDelimitedLine(line, delimiter);
    const date = cells[dateIndex]?.trim();
    if (!date) continue;
    headers.forEach((header, index) => {
      if (header === "alertThresholdMm" && alertThresholdMm === null) {
        const value = parseNumericCell(cells[index] ?? "");
        if (Number.isFinite(value) && value > 0) alertThresholdMm = value;
      }
      if (header === "rateThresholdMmPerDay" && rateThresholdMmPerDay === null) {
        const value = parseNumericCell(cells[index] ?? "");
        if (Number.isFinite(value) && value > 0) rateThresholdMmPerDay = value;
      }
    });
    for (const column of pointColumns) {
      const elevation = parseNumericCell(cells[column.index] ?? "");
      if (!Number.isFinite(elevation)) continue;
      observations.push({ wellId: column.wellId, date, elevation });
    }
  }
  if (observations.length < 2) throw new Error("water_level 宽表 CSV 未解析到足够的水位观测记录");
  return {
    observations,
    parsedRowCount: lines.length - 1,
    parsedObservationCount: observations.length,
    tableFormat: "wide",
    alertThresholdMm,
    rateThresholdMmPerDay,
  };
}

function normalizeWaterLevelWidePointHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[（(]\s*(m|米)\s*[）)]/gi, "")
    .replace(/地下水位|水位高程|本次水位|本期水位|水位|高程/g, "")
    .trim();
}

const AXIAL_FORCE_CSV_ALIASES = new Map<
  string,
  "sensorId" | "date" | "forceKn" | "alertThresholdKn" | "rateThresholdKnPerDay"
>(
  [
    ["sensorid", "sensorId"],
    ["id", "sensorId"],
    ["gaugeid", "sensorId"],
    ["meterid", "sensorId"],
    ["传感器", "sensorId"],
    ["传感器编号", "sensorId"],
    ["轴力计编号", "sensorId"],
    ["测点", "sensorId"],
    ["测点编号", "sensorId"],
    ["date", "date"],
    ["观测日期", "date"],
    ["日期", "date"],
    ["时间", "date"],
    ["forcekn", "forceKn"],
    ["axialforcekn", "forceKn"],
    ["currentforcekn", "forceKn"],
    ["valuekn", "forceKn"],
    ["轴力", "forceKn"],
    ["轴力值", "forceKn"],
    ["本次轴力", "forceKn"],
    ["本次轴力值", "forceKn"],
    ["本期轴力", "forceKn"],
    ["本期轴力值", "forceKn"],
    ["当前轴力", "forceKn"],
    ["当前轴力值", "forceKn"],
    ["支撑轴力", "forceKn"],
    ["支撑轴力值", "forceKn"],
    ["轴力预警值", "alertThresholdKn"],
    ["轴力控制值", "alertThresholdKn"],
    ["轴力限值", "alertThresholdKn"],
    ["预警值", "alertThresholdKn"],
    ["alertthresholdkn", "alertThresholdKn"],
    ["速率预警值", "rateThresholdKnPerDay"],
    ["轴力速率预警值", "rateThresholdKnPerDay"],
    ["变化速率预警值", "rateThresholdKnPerDay"],
    ["ratethresholdknperday", "rateThresholdKnPerDay"],
  ].map(([alias, key]) => [
    normalizeCsvHeader(alias),
    key as "sensorId" | "date" | "forceKn" | "alertThresholdKn" | "rateThresholdKnPerDay",
  ]),
);

function parseAxialForceCsv(text: string, delimiterOption: AxialForceInput["csvDelimiter"]): {
  observations: AxialForceObservationInput[];
  parsedRowCount: number;
  parsedObservationCount: number;
  tableFormat: "long" | "wide";
  alertThresholdKn: number | null;
  rateThresholdKnPerDay: number | null;
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("axial_force CSV 至少需要表头和 1 行数据");
  const delimiter = detectCsvDelimiter(lines[0]!, delimiterOption);
  const rawHeaders = splitDelimitedLine(lines[0]!, delimiter);
  const headers = rawHeaders.map((header) =>
    AXIAL_FORCE_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  if (!headers.includes("forceKn") && headers.includes("date")) {
    return parseWideAxialForceCsv(lines, delimiter, rawHeaders, headers);
  }
  let alertThresholdKn: number | null = null;
  let rateThresholdKnPerDay: number | null = null;
  const observations: AxialForceObservationInput[] = [];
  for (const line of lines.slice(1)) {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, index) => {
      const key = headers[index];
      if (key) row[key] = cell;
    });
    const sensorId = row.sensorId?.trim();
    const date = row.date?.trim();
    const forceKn = parseNumericCell(row.forceKn ?? "");
    const rowAlertThresholdKn = parseNumericCell(row.alertThresholdKn ?? "");
    const rowRateThresholdKnPerDay = parseNumericCell(row.rateThresholdKnPerDay ?? "");
    if (Number.isFinite(rowAlertThresholdKn) && rowAlertThresholdKn > 0 && alertThresholdKn === null) {
      alertThresholdKn = rowAlertThresholdKn;
    }
    if (Number.isFinite(rowRateThresholdKnPerDay) && rowRateThresholdKnPerDay > 0 && rateThresholdKnPerDay === null) {
      rateThresholdKnPerDay = rowRateThresholdKnPerDay;
    }
    if (!sensorId || !date || !Number.isFinite(forceKn)) continue;
    observations.push({ sensorId, date, forceKn });
  }
  if (observations.length < 2) throw new Error("axial_force CSV 未解析到足够的轴力观测记录");
  return {
    observations,
    parsedRowCount: lines.length - 1,
    parsedObservationCount: observations.length,
    tableFormat: "long",
    alertThresholdKn,
    rateThresholdKnPerDay,
  };
}

function parseWideAxialForceCsv(
  lines: string[],
  delimiter: string,
  rawHeaders: string[],
  headers: Array<"sensorId" | "date" | "forceKn" | "alertThresholdKn" | "rateThresholdKnPerDay" | undefined>,
): {
  observations: AxialForceObservationInput[];
  parsedRowCount: number;
  parsedObservationCount: number;
  tableFormat: "wide";
  alertThresholdKn: number | null;
  rateThresholdKnPerDay: number | null;
} {
  const dateIndex = headers.findIndex((header) => header === "date");
  if (dateIndex < 0) throw new Error("axial_force 宽表 CSV 需要观测日期列");
  const sensorColumns = rawHeaders
    .map((header, index) => ({
      index,
      sensorId: normalizeAxialForceWideSensorHeader(header),
      mapped: headers[index],
    }))
    .filter(({ index, sensorId, mapped }) => index !== dateIndex && !mapped && sensorId.length > 0);
  if (sensorColumns.length === 0) throw new Error("axial_force 宽表 CSV 未识别到轴力传感器数值列");

  let alertThresholdKn: number | null = null;
  let rateThresholdKnPerDay: number | null = null;
  const observations: AxialForceObservationInput[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitDelimitedLine(line, delimiter);
    const date = cells[dateIndex]?.trim();
    if (!date) continue;
    headers.forEach((header, index) => {
      if (header === "alertThresholdKn" && alertThresholdKn === null) {
        const value = parseNumericCell(cells[index] ?? "");
        if (Number.isFinite(value) && value > 0) alertThresholdKn = value;
      }
      if (header === "rateThresholdKnPerDay" && rateThresholdKnPerDay === null) {
        const value = parseNumericCell(cells[index] ?? "");
        if (Number.isFinite(value) && value > 0) rateThresholdKnPerDay = value;
      }
    });
    for (const column of sensorColumns) {
      const forceKn = parseNumericCell(cells[column.index] ?? "");
      if (!Number.isFinite(forceKn)) continue;
      observations.push({ sensorId: column.sensorId, date, forceKn });
    }
  }
  if (observations.length < 2) throw new Error("axial_force 宽表 CSV 未解析到足够的轴力观测记录");
  return {
    observations,
    parsedRowCount: lines.length - 1,
    parsedObservationCount: observations.length,
    tableFormat: "wide",
    alertThresholdKn,
    rateThresholdKnPerDay,
  };
}

function normalizeAxialForceWideSensorHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[（(]\s*(kN|KN|千牛)\s*[）)]/g, "")
    .replace(/本次轴力值|本期轴力值|当前轴力值|支撑轴力值|本次轴力|本期轴力|当前轴力|支撑轴力|轴力值|轴力/g, "")
    .trim();
}

const INCLINOMETER_CSV_ALIASES = new Map<
  string,
  "boreholeId" | "date" | "depth" | "xMm" | "yMm" | "alertThresholdMm" | "rateThresholdMmPerDay"
>(
  [
    ["boreholeid", "boreholeId"],
    ["holeid", "boreholeId"],
    ["inclinometerid", "boreholeId"],
    ["id", "boreholeId"],
    ["孔号", "boreholeId"],
    ["测斜孔", "boreholeId"],
    ["测斜孔号", "boreholeId"],
    ["测孔编号", "boreholeId"],
    ["date", "date"],
    ["观测日期", "date"],
    ["日期", "date"],
    ["时间", "date"],
    ["depthm", "depth"],
    ["depth", "depth"],
    ["深度", "depth"],
    ["深度m", "depth"],
    ["埋深", "depth"],
    ["埋深m", "depth"],
    ["测点深度", "depth"],
    ["测点深度m", "depth"],
    ["xmm", "xMm"],
    ["x", "xMm"],
    ["xdisplacementmm", "xMm"],
    ["x向位移", "xMm"],
    ["x向位移mm", "xMm"],
    ["x位移", "xMm"],
    ["x位移mm", "xMm"],
    ["水平位移x", "xMm"],
    ["水平位移xmm", "xMm"],
    ["ymm", "yMm"],
    ["y", "yMm"],
    ["ydisplacementmm", "yMm"],
    ["y向位移", "yMm"],
    ["y向位移mm", "yMm"],
    ["y位移", "yMm"],
    ["y位移mm", "yMm"],
    ["水平位移y", "yMm"],
    ["水平位移ymm", "yMm"],
    ["累计预警值", "alertThresholdMm"],
    ["累计预警", "alertThresholdMm"],
    ["测斜预警值", "alertThresholdMm"],
    ["位移预警值", "alertThresholdMm"],
    ["预警值", "alertThresholdMm"],
    ["alertthresholdmm", "alertThresholdMm"],
    ["速率预警值", "rateThresholdMmPerDay"],
    ["测斜速率预警值", "rateThresholdMmPerDay"],
    ["位移速率预警值", "rateThresholdMmPerDay"],
    ["变化速率预警值", "rateThresholdMmPerDay"],
    ["ratethresholdmmperday", "rateThresholdMmPerDay"],
  ].map(([alias, key]) => [
    normalizeCsvHeader(alias),
    key as "boreholeId" | "date" | "depth" | "xMm" | "yMm" | "alertThresholdMm" | "rateThresholdMmPerDay",
  ]),
);

function parseInclinometerCsv(text: string, delimiterOption: InclinometerInput["csvDelimiter"]): {
  observations: InclinometerObservationInput[];
  parsedRowCount: number;
  parsedObservationCount: number;
  tableFormat: "long" | "wide";
  alertThresholdMm: number | null;
  rateThresholdMmPerDay: number | null;
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("inclinometer CSV 至少需要表头和 1 行数据");
  const delimiter = detectCsvDelimiter(lines[0]!, delimiterOption);
  const rawHeaders = splitDelimitedLine(lines[0]!, delimiter);
  const headers = rawHeaders.map((header) =>
    INCLINOMETER_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  if (!headers.includes("xMm") && headers.includes("date")) {
    return parseWideInclinometerCsv(lines, delimiter, rawHeaders, headers);
  }
  let alertThresholdMm: number | null = null;
  let rateThresholdMmPerDay: number | null = null;
  const observations: InclinometerObservationInput[] = [];
  for (const line of lines.slice(1)) {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, index) => {
      const key = headers[index];
      if (key) row[key] = cell;
    });
    const boreholeId = row.boreholeId?.trim();
    const date = row.date?.trim();
    const depth = parseNumericCell(row.depth ?? "");
    const xMm = parseNumericCell(row.xMm ?? "");
    const yMm = parseNumericCell(row.yMm ?? "");
    const rowAlertThresholdMm = parseNumericCell(row.alertThresholdMm ?? "");
    const rowRateThresholdMmPerDay = parseNumericCell(row.rateThresholdMmPerDay ?? "");
    if (Number.isFinite(rowAlertThresholdMm) && rowAlertThresholdMm > 0 && alertThresholdMm === null) {
      alertThresholdMm = rowAlertThresholdMm;
    }
    if (Number.isFinite(rowRateThresholdMmPerDay) && rowRateThresholdMmPerDay > 0 && rateThresholdMmPerDay === null) {
      rateThresholdMmPerDay = rowRateThresholdMmPerDay;
    }
    if (!boreholeId || !date || !Number.isFinite(depth) || !Number.isFinite(xMm)) continue;
    observations.push({ boreholeId, date, depth, xMm, yMm: Number.isFinite(yMm) ? yMm : 0 });
  }
  if (observations.length < 2) throw new Error("inclinometer CSV 未解析到足够的测斜观测记录");
  return {
    observations,
    parsedRowCount: lines.length - 1,
    parsedObservationCount: observations.length,
    tableFormat: "long",
    alertThresholdMm,
    rateThresholdMmPerDay,
  };
}

function parseWideInclinometerCsv(
  lines: string[],
  delimiter: string,
  rawHeaders: string[],
  headers: Array<"boreholeId" | "date" | "depth" | "xMm" | "yMm" | "alertThresholdMm" | "rateThresholdMmPerDay" | undefined>,
): {
  observations: InclinometerObservationInput[];
  parsedRowCount: number;
  parsedObservationCount: number;
  tableFormat: "wide";
  alertThresholdMm: number | null;
  rateThresholdMmPerDay: number | null;
} {
  const dateIndex = headers.findIndex((header) => header === "date");
  if (dateIndex < 0) throw new Error("inclinometer 宽表 CSV 需要观测日期列");
  const displacementColumns = rawHeaders
    .map((header, index) => ({
      index,
      column: parseInclinometerWideDisplacementHeader(header),
      mapped: headers[index],
    }))
    .filter(({ index, column, mapped }) => index !== dateIndex && !mapped && column !== null);
  if (displacementColumns.length === 0) throw new Error("inclinometer 宽表 CSV 未识别到测斜位移数值列");

  let alertThresholdMm: number | null = null;
  let rateThresholdMmPerDay: number | null = null;
  const observations: InclinometerObservationInput[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitDelimitedLine(line, delimiter);
    const date = cells[dateIndex]?.trim();
    if (!date) continue;
    headers.forEach((header, index) => {
      if (header === "alertThresholdMm" && alertThresholdMm === null) {
        const value = parseNumericCell(cells[index] ?? "");
        if (Number.isFinite(value) && value > 0) alertThresholdMm = value;
      }
      if (header === "rateThresholdMmPerDay" && rateThresholdMmPerDay === null) {
        const value = parseNumericCell(cells[index] ?? "");
        if (Number.isFinite(value) && value > 0) rateThresholdMmPerDay = value;
      }
    });

    const rowObservations = new Map<string, { boreholeId: string; date: string; depth: number; xMm?: number; yMm?: number }>();
    for (const { index, column } of displacementColumns) {
      if (!column) continue;
      const value = parseNumericCell(cells[index] ?? "");
      if (!Number.isFinite(value)) continue;
      const key = `${column.boreholeId}::${column.depth}`;
      const existing = rowObservations.get(key) ?? {
        boreholeId: column.boreholeId,
        date,
        depth: column.depth,
      };
      if (column.axis === "x") existing.xMm = value;
      if (column.axis === "y") existing.yMm = value;
      rowObservations.set(key, existing);
    }
    for (const row of rowObservations.values()) {
      if (Number.isFinite(row.xMm)) {
        observations.push({
          boreholeId: row.boreholeId,
          date: row.date,
          depth: row.depth,
          xMm: row.xMm!,
          yMm: Number.isFinite(row.yMm) ? row.yMm! : 0,
        });
      }
    }
  }
  if (observations.length < 2) throw new Error("inclinometer 宽表 CSV 未解析到足够的测斜观测记录");
  return {
    observations,
    parsedRowCount: lines.length - 1,
    parsedObservationCount: observations.length,
    tableFormat: "wide",
    alertThresholdMm,
    rateThresholdMmPerDay,
  };
}

function parseInclinometerWideDisplacementHeader(
  value: string,
): { boreholeId: string; depth: number; axis: "x" | "y" } | null {
  let normalized = value
    .replace(/^\uFEFF/, "")
    .replace(/[（(]\s*(mm|毫米)\s*[）)]/gi, "")
    .trim();
  const axisMatch = normalized.match(/(?:^|[\s_@:/\-])([xy])(?:\s*向)?(?:\s*位移)?\s*$/i);
  const axis = axisMatch ? (axisMatch[1]!.toLowerCase() as "x" | "y") : "x";
  if (axisMatch) {
    normalized = `${normalized.slice(0, axisMatch.index)}${normalized.slice(axisMatch.index! + axisMatch[0].length)}`.trim();
  }
  const depthMatches = [...normalized.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:m|米)/gi)];
  const depthMatch = depthMatches.at(-1);
  if (!depthMatch) return null;
  const depth = Number(depthMatch[1]);
  if (!Number.isFinite(depth)) return null;
  normalized = `${normalized.slice(0, depthMatch.index)}${normalized.slice(depthMatch.index! + depthMatch[0].length)}`.trim();
  const boreholeId = normalized
    .replace(/测斜孔号|测斜孔|孔号|测孔编号|孔编号|测点编号|点号|深度|埋深|测点深度|水平位移|累计位移|本次位移|本期位移|位移/g, "")
    .replace(/[\s_@:/\-]+$/g, "")
    .replace(/^[\s_@:/\-]+/g, "")
    .trim();
  if (!boreholeId) return null;
  return { boreholeId, depth, axis };
}

function runControlObservationAdjustment(
  observations: ControlObservationInput[],
  metadata?: { inputFormat?: "json" | "csv"; parsedRowCount?: number | null },
): Record<string, unknown> {
  const groups = new Map<string, typeof observations>();
  for (const obs of observations) groups.set(obs.pointId, [...(groups.get(obs.pointId) ?? []), obs]);
  const adjusted = [...groups.entries()].map(([pointId, obs]) => {
    const sw = obs.reduce((sum, item) => sum + item.weight, 0);
    const x = obs.reduce((sum, item) => sum + item.x * item.weight, 0) / sw;
    const y = obs.reduce((sum, item) => sum + item.y * item.weight, 0) / sw;
    const residuals = obs.map((item) => ({
      vx_mm: round((item.x - x) * 1000, 3),
      vy_mm: round((item.y - y) * 1000, 3),
    }));
    const residualsWithPlanar = residuals.map((item) => ({
      ...item,
      planar_residual_mm: round(Math.hypot(item.vx_mm, item.vy_mm), 3),
    }));
    const rmse = Math.sqrt(
      residualsWithPlanar.reduce((sum, item) => sum + item.vx_mm ** 2 + item.vy_mm ** 2, 0) /
        Math.max(residualsWithPlanar.length * 2 - 2, 1),
    );
    const maxResidual = residualsWithPlanar.reduce((max, item) => Math.max(max, item.planar_residual_mm), 0);
    return {
      point_id: pointId,
      adjusted_x: round(x, 6),
      adjusted_y: round(y, 6),
      observation_count: obs.length,
      weight_sum: round(sw, 6),
      rmse_mm: round(rmse, 3),
      max_residual_mm: round(maxResidual, 3),
      residuals: residualsWithPlanar,
    };
  });
  const observationCount = observations.length;
  const maxPointRmse = adjusted.reduce((max, point) => Math.max(max, point.rmse_mm), 0);
  const maxResidual = adjusted.reduce((max, point) => Math.max(max, point.max_residual_mm), 0);
  return {
    mode: "coordinate_observations",
    input_format: metadata?.inputFormat ?? "json",
    parsed_row_count: metadata?.parsedRowCount ?? null,
    point_count: adjusted.length,
    observation_count: observationCount,
    max_point_rmse_mm: round(maxPointRmse, 3),
    max_residual_mm: round(maxResidual, 3),
    quality_status: round(maxResidual, 3) === 0 ? "fit_exact" : "review_residuals",
    precision_summary: {
      point_count: adjusted.length,
      observation_count: observationCount,
      max_point_rmse_mm: round(maxPointRmse, 3),
      max_residual_mm: round(maxResidual, 3),
    },
    adjusted,
    export_rows: adjusted.map((point) => ({
      row_type: "control_network_coordinate_point",
      point_id: point.point_id,
      adjusted_x_m: point.adjusted_x,
      adjusted_y_m: point.adjusted_y,
      observation_count: point.observation_count,
      weight_sum: point.weight_sum,
      rmse_mm: point.rmse_mm,
      max_residual_mm: point.max_residual_mm,
    })),
  };
}

function runDirectionRoundQuality(
  input: DirectionRoundInput,
  metadata?: { inputFormat?: "json" | "csv"; parsedRowCount?: number | null },
): Record<string, unknown> {
  const faceToleranceArcSec = input.faceToleranceArcSec ?? 8;
  const zeroClosureToleranceArcSec = input.zeroClosureToleranceArcSec ?? 8;
  const groupKey = (obs: DirectionObservation) => `${obs.groupId}\u0000${obs.from}\u0000${obs.roundId ?? ""}`;
  const targetKey = (obs: DirectionObservation) => `${groupKey(obs)}\u0000${obs.to}`;
  const targetGroups = new Map<string, DirectionObservation[]>();
  for (const obs of input.observations) targetGroups.set(targetKey(obs), [...(targetGroups.get(targetKey(obs)) ?? []), obs]);

  const facePairChecks = [...targetGroups.values()]
    .map((observations) => {
      const first = observations[0]!;
      const left = observations.filter((obs) => obs.face === "left").map((obs) => obs.observedDegrees);
      const right = observations.filter((obs) => obs.face === "right").map((obs) => normalizeDegrees360(obs.observedDegrees - 180));
      if (left.length === 0 || right.length === 0) return null;
      const leftMean = directionMeanDegrees(left);
      const rightReducedMean = directionMeanDegrees(right);
      const differenceArcSec = directionDifferenceArcSec(rightReducedMean, leftMean);
      return {
        row_type: "direction_face_pair_check",
        group_id: first.groupId,
        round_id: first.roundId ?? null,
        from: first.from,
        to: first.to,
        left_observation_count: left.length,
        right_observation_count: right.length,
        left_mean_degrees: round(leftMean, 10),
        right_reduced_mean_degrees: round(rightReducedMean, 10),
        difference_arcsec: differenceArcSec,
        abs_difference_arcsec: round(Math.abs(differenceArcSec), 3),
        tolerance_arcsec: faceToleranceArcSec,
        quality_status: Math.abs(differenceArcSec) <= faceToleranceArcSec ? "pass" : "alert",
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => `${a.group_id}-${a.from}-${a.to}`.localeCompare(`${b.group_id}-${b.from}-${b.to}`));

  const roundFaceGroups = new Map<string, DirectionObservation[]>();
  for (const obs of input.observations) {
    if (!obs.face) continue;
    const key = `${groupKey(obs)}\u0000${obs.face}`;
    roundFaceGroups.set(key, [...(roundFaceGroups.get(key) ?? []), obs]);
  }
  const zeroClosureChecks = [...roundFaceGroups.values()]
    .map((observations) => {
      const sorted = [...observations].sort((a, b) => a.sequence - b.sequence);
      const first = sorted[0];
      if (!first) return null;
      const closing = [...sorted].reverse().find((obs) => obs.to === first.to && obs.id !== first.id);
      if (!closing) return null;
      const zeroClosureArcSec = directionDifferenceArcSec(closing.observedDegrees, first.observedDegrees);
      return {
        row_type: "direction_zero_closure_check",
        group_id: first.groupId,
        round_id: first.roundId ?? null,
        from: first.from,
        to: first.to,
        face: first.face,
        opening_observation_id: first.id,
        closing_observation_id: closing.id,
        opening_degrees: round(first.observedDegrees, 10),
        closing_degrees: round(closing.observedDegrees, 10),
        zero_closure_arcsec: zeroClosureArcSec,
        abs_zero_closure_arcsec: round(Math.abs(zeroClosureArcSec), 3),
        tolerance_arcsec: zeroClosureToleranceArcSec,
        quality_status: Math.abs(zeroClosureArcSec) <= zeroClosureToleranceArcSec ? "pass" : "alert",
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => `${a.group_id}-${a.from}-${a.face}`.localeCompare(`${b.group_id}-${b.from}-${b.face}`));

  const observationGroups = new Map<string, DirectionObservation[]>();
  for (const obs of input.observations) observationGroups.set(groupKey(obs), [...(observationGroups.get(groupKey(obs)) ?? []), obs]);
  const roundSummaries = [...observationGroups.values()]
    .map((observations) => {
      const first = observations[0]!;
      const faceRows = facePairChecks.filter(
        (row) => row.group_id === first.groupId && row.from === first.from && row.round_id === (first.roundId ?? null),
      );
      const zeroRows = zeroClosureChecks.filter(
        (row) => row.group_id === first.groupId && row.from === first.from && row.round_id === (first.roundId ?? null),
      );
      const maxFace = Math.max(0, ...faceRows.map((row) => Number(row.abs_difference_arcsec)));
      const maxZero = Math.max(0, ...zeroRows.map((row) => Number(row.abs_zero_closure_arcsec)));
      return {
        row_type: "direction_round_summary",
        group_id: first.groupId,
        round_id: first.roundId ?? null,
        from: first.from,
        target_count: new Set(observations.map((obs) => obs.to)).size,
        observation_count: observations.length,
        face_pair_count: faceRows.length,
        zero_closure_count: zeroRows.length,
        max_face_difference_arcsec: round(maxFace, 3),
        max_zero_closure_arcsec: round(maxZero, 3),
        face_tolerance_arcsec: faceToleranceArcSec,
        zero_closure_tolerance_arcsec: zeroClosureToleranceArcSec,
        quality_status: faceRows.some((row) => row.quality_status === "alert") || zeroRows.some((row) => row.quality_status === "alert")
          ? "alert"
          : "pass",
      };
    })
    .sort((a, b) => `${a.group_id}-${a.from}`.localeCompare(`${b.group_id}-${b.from}`));

  const maxFaceDifferenceArcSec = Math.max(0, ...facePairChecks.map((row) => Number(row.abs_difference_arcsec)));
  const maxZeroClosureArcSec = Math.max(0, ...zeroClosureChecks.map((row) => Number(row.abs_zero_closure_arcsec)));
  const qualityStatus =
    facePairChecks.some((row) => row.quality_status === "alert") || zeroClosureChecks.some((row) => row.quality_status === "alert")
      ? "alert"
      : "pass";
  const summary = {
    group_count: new Set(input.observations.map((obs) => obs.groupId)).size,
    observation_count: input.observations.length,
    face_pair_count: facePairChecks.length,
    zero_closure_count: zeroClosureChecks.length,
    max_face_difference_arcsec: round(maxFaceDifferenceArcSec, 3),
    max_zero_closure_arcsec: round(maxZeroClosureArcSec, 3),
    face_tolerance_arcsec: faceToleranceArcSec,
    zero_closure_tolerance_arcsec: zeroClosureToleranceArcSec,
    quality_status: qualityStatus,
  };

  return {
    mode: "direction_round_quality",
    input_format: metadata?.inputFormat ?? "json",
    parsed_row_count: metadata?.parsedRowCount ?? null,
    direction_group_count: summary.group_count,
    direction_observation_count: summary.observation_count,
    direction_face_pair_count: summary.face_pair_count,
    direction_zero_closure_count: summary.zero_closure_count,
    max_face_difference_arcsec: summary.max_face_difference_arcsec,
    max_zero_closure_arcsec: summary.max_zero_closure_arcsec,
    quality_status: qualityStatus,
    direction_quality_summary: summary,
    face_pair_checks: facePairChecks,
    zero_closure_checks: zeroClosureChecks,
    round_summaries: roundSummaries,
    export_rows: [...roundSummaries, ...facePairChecks, ...zeroClosureChecks],
  };
}

function runLevelingRouteClosureAdjustment(
  route: LevelingRouteInput,
  metadata?: { inputFormat?: "json" | "csv"; parsedRowCount?: number | null },
): Record<string, unknown> {
  const knownPoints = new Map(route.knownPoints.map((point) => [point.id, point]));
  const observations = route.observations;
  if (observations.length === 0) throw new Error("control_network 水准路线需要至少 1 段高差观测");
  for (let index = 1; index < observations.length; index += 1) {
    if (observations[index - 1]?.to !== observations[index]?.from) {
      throw new Error("control_network 水准路线观测链不连续");
    }
  }
  const startPoint = knownPoints.get(observations[0]?.from ?? "");
  const endPoint = knownPoints.get(observations.at(-1)?.to ?? "");
  if (!startPoint || !endPoint) throw new Error("control_network 水准路线起终点必须是已知高程点");

  const distributionLengths = observations.map((obs) => (obs.distanceKm !== undefined && obs.distanceKm > 0 ? obs.distanceKm : 1));
  const distributionTotal = distributionLengths.reduce((sum, value) => sum + value, 0);
  const observedHeightDifference = observations.reduce((sum, obs) => sum + obs.value, 0);
  const knownHeightDifference = endPoint.z - startPoint.z;
  const closureErrorM = observedHeightDifference - knownHeightDifference;
  const closureErrorMm = closureErrorM * 1000;
  const totalLevelingDistanceKm = observations.reduce((sum, obs) => sum + (obs.distanceKm ?? 0), 0);
  const closureToleranceMm =
    route.closureToleranceMm ??
    (totalLevelingDistanceKm > 0 ? 12 * Math.sqrt(totalLevelingDistanceKm) : Number.POSITIVE_INFINITY);
  const isPassed = Math.abs(closureErrorMm) <= closureToleranceMm;
  let currentHeight = startPoint.z;
  const adjustedPoints: Array<Record<string, unknown>> = [
    {
      row_type: "leveling_route_point",
      point_id: startPoint.id,
      adjusted_z_m: round(currentHeight, 6),
      point_role: "known_start",
    },
  ];
  const segmentDetails = observations.map((obs, index) => {
    const distributionLength = distributionLengths[index] ?? 1;
    const correctionM = -closureErrorM * (distributionLength / distributionTotal);
    const adjustedHeightDifference = obs.value + correctionM;
    currentHeight += adjustedHeightDifference;
    adjustedPoints.push({
      row_type: "leveling_route_point",
      point_id: obs.to,
      adjusted_z_m: round(currentHeight, 6),
      point_role: obs.to === endPoint.id ? "known_end" : "turning_point",
    });
    return {
      row_type: "leveling_route_segment",
      sequence: index + 1,
      observation_id: obs.id,
      from: obs.from,
      to: obs.to,
      observed_height_difference_m: round(obs.value, 6),
      distance_km: obs.distanceKm === undefined ? null : round(obs.distanceKm, 6),
      distribution_length: round(distributionLength, 6),
      correction_mm: round(correctionM * 1000, 4),
      adjusted_height_difference_m: round(adjustedHeightDifference, 6),
      adjusted_to_z_m: round(currentHeight, 6),
    };
  });
  const closurePerSqrtKmMm =
    totalLevelingDistanceKm > 0 ? Math.abs(closureErrorMm) / Math.sqrt(totalLevelingDistanceKm) : null;
  const summary = {
    segment_count: observations.length,
    start_point: startPoint.id,
    end_point: endPoint.id,
    observed_height_difference_m: round(observedHeightDifference, 6),
    known_height_difference_m: round(knownHeightDifference, 6),
    closure_error_mm: round(closureErrorMm, 4),
    total_leveling_distance_km: round(totalLevelingDistanceKm, 6),
    closure_per_sqrt_km_mm: closurePerSqrtKmMm === null ? null : round(closurePerSqrtKmMm, 3),
    closure_tolerance_mm: Number.isFinite(closureToleranceMm) ? round(closureToleranceMm, 3) : null,
    quality_status: isPassed ? "pass" : "alert",
    is_passed: isPassed,
  };
  return {
    mode: "leveling_route_closure",
    input_format: metadata?.inputFormat ?? "json",
    parsed_row_count: metadata?.parsedRowCount ?? null,
    ...summary,
    adjusted_point_count: adjustedPoints.length,
    leveling_route_summary: summary,
    segment_details: segmentDetails,
    adjusted_points: adjustedPoints,
    export_rows: [...segmentDetails, ...adjustedPoints],
  };
}

function gnssComponentWeight(sigmaMm?: number): number {
  return sigmaMm !== undefined && sigmaMm > 0 ? 1 / sigmaMm ** 2 : 1;
}

function runGnssBaselineAdjustment(
  input: GnssBaselineInput,
  metadata?: { inputFormat?: "json" | "csv"; parsedRowCount?: number | null },
): Record<string, unknown> {
  const knownPoints = new Map(input.knownPoints.map((point) => [point.id, point]));
  const approximatePoints = new Map(input.approximatePoints.map((point) => [point.id, point]));
  type Candidate = {
    id: string;
    observationId: string;
    from: string;
    to: string;
    x: number;
    y: number;
    z: number;
    sigmaXMm?: number;
    sigmaYMm?: number;
    sigmaZMm?: number;
  };
  const candidates: Candidate[] = [];
  for (const obs of input.observations) {
    const fromKnown = knownPoints.get(obs.from);
    const toKnown = knownPoints.get(obs.to);
    if (fromKnown && !toKnown) {
      candidates.push({
        id: obs.to,
        observationId: obs.id,
        from: obs.from,
        to: obs.to,
        x: fromKnown.x + obs.dx,
        y: fromKnown.y + obs.dy,
        z: fromKnown.z + obs.dz,
        ...(obs.sigmaXMm !== undefined ? { sigmaXMm: obs.sigmaXMm } : {}),
        ...(obs.sigmaYMm !== undefined ? { sigmaYMm: obs.sigmaYMm } : {}),
        ...(obs.sigmaZMm !== undefined ? { sigmaZMm: obs.sigmaZMm } : {}),
      });
      continue;
    }
    if (toKnown && !fromKnown) {
      candidates.push({
        id: obs.from,
        observationId: obs.id,
        from: obs.from,
        to: obs.to,
        x: toKnown.x - obs.dx,
        y: toKnown.y - obs.dy,
        z: toKnown.z - obs.dz,
        ...(obs.sigmaXMm !== undefined ? { sigmaXMm: obs.sigmaXMm } : {}),
        ...(obs.sigmaYMm !== undefined ? { sigmaYMm: obs.sigmaYMm } : {}),
        ...(obs.sigmaZMm !== undefined ? { sigmaZMm: obs.sigmaZMm } : {}),
      });
    }
  }
  if (candidates.length === 0) throw new Error("control_network GNSS 基线需要至少一条连接已知点和待定点的基线");
  const grouped = new Map<string, Candidate[]>();
  for (const candidate of candidates) grouped.set(candidate.id, [...(grouped.get(candidate.id) ?? []), candidate]);
  const adjustedPoints = [...grouped.entries()].map(([pointId, pointCandidates]) => {
    const weighted = (field: "x" | "y" | "z", sigmaField: "sigmaXMm" | "sigmaYMm" | "sigmaZMm") => {
      const totalWeight = pointCandidates.reduce((sum, item) => sum + gnssComponentWeight(item[sigmaField]), 0);
      return pointCandidates.reduce((sum, item) => sum + item[field] * gnssComponentWeight(item[sigmaField]), 0) / totalWeight;
    };
    const approximate = approximatePoints.get(pointId);
    return {
      row_type: "gnss_point",
      point_id: pointId,
      adjusted_x: round(weighted("x", "sigmaXMm"), 6),
      adjusted_y: round(weighted("y", "sigmaYMm"), 6),
      adjusted_z: round(weighted("z", "sigmaZMm"), 6),
      approximate_x: approximate ? round(approximate.x, 6) : null,
      approximate_y: approximate ? round(approximate.y, 6) : null,
      approximate_z: approximate ? round(approximate.z, 6) : null,
      baseline_count: pointCandidates.length,
    };
  });
  const adjustedById = new Map(adjustedPoints.map((point) => [String(point.point_id), point]));
  const coordinateFor = (id: string): { x: number; y: number; z: number } | null => {
    const known = knownPoints.get(id);
    if (known) return known;
    const adjusted = adjustedById.get(id);
    if (!adjusted) return null;
    return {
      x: Number(adjusted.adjusted_x),
      y: Number(adjusted.adjusted_y),
      z: Number(adjusted.adjusted_z),
    };
  };
  const baselineResiduals = input.observations.flatMap((obs) => {
    const from = coordinateFor(obs.from);
    const to = coordinateFor(obs.to);
    if (!from || !to) return [];
    const computedDx = to.x - from.x;
    const computedDy = to.y - from.y;
    const computedDz = to.z - from.z;
    return [
      {
        row_type: "gnss_baseline_residual",
        observation_id: obs.id,
        from: obs.from,
        to: obs.to,
        observed_dx_m: round(obs.dx, 6),
        observed_dy_m: round(obs.dy, 6),
        observed_dz_m: round(obs.dz, 6),
        computed_dx_m: round(computedDx, 6),
        computed_dy_m: round(computedDy, 6),
        computed_dz_m: round(computedDz, 6),
        residual_dx_mm: round((obs.dx - computedDx) * 1000, 3),
        residual_dy_mm: round((obs.dy - computedDy) * 1000, 3),
        residual_dz_mm: round((obs.dz - computedDz) * 1000, 3),
        sigma_x_mm: obs.sigmaXMm ?? null,
        sigma_y_mm: obs.sigmaYMm ?? null,
        sigma_z_mm: obs.sigmaZMm ?? null,
        covariance_model: obs.sigmaXMm || obs.sigmaYMm || obs.sigmaZMm ? "diagonal_sigma" : "unit_weight",
      },
    ];
  });
  const componentResiduals = baselineResiduals.flatMap((row) => [
    Math.abs(Number(row.residual_dx_mm)),
    Math.abs(Number(row.residual_dy_mm)),
    Math.abs(Number(row.residual_dz_mm)),
  ]);
  const maxAbsComponentResidualMm = Math.max(0, ...componentResiduals);
  const summary = {
    known_point_count: input.knownPoints.length,
    adjusted_point_count: adjustedPoints.length,
    baseline_count: input.observations.length,
    observation_component_count: input.observations.length * 3,
    max_abs_component_residual_mm: round(maxAbsComponentResidualMm, 3),
  };
  return {
    mode: "gnss_baseline_adjustment",
    input_format: metadata?.inputFormat ?? "json",
    parsed_row_count: metadata?.parsedRowCount ?? null,
    ...summary,
    gnss_baseline_summary: summary,
    adjusted_points: adjustedPoints,
    baseline_residuals: baselineResiduals,
    export_rows: [...adjustedPoints, ...baselineResiduals],
  };
}

function runTraverseClosureAdjustment(
  traverse: TraverseInput,
  metadata?: { inputFormat?: "json" | "csv"; parsedRowCount?: number | null },
): Record<string, unknown> {
  let rawX = traverse.start.x;
  let rawY = traverse.start.y;
  let cumulativeDistance = 0;
  const rawPoints = [
    {
      point_id: traverse.start.id,
      raw_x: rawX,
      raw_y: rawY,
      cumulative_distance_m: 0,
    },
  ];
  for (const leg of traverse.legs) {
    const azimuth = deg2rad(leg.azimuthDegrees);
    rawX += leg.distance * Math.sin(azimuth);
    rawY += leg.distance * Math.cos(azimuth);
    cumulativeDistance += leg.distance;
    rawPoints.push({
      point_id: leg.to,
      raw_x: rawX,
      raw_y: rawY,
      cumulative_distance_m: cumulativeDistance,
    });
  }

  const closureDxM = rawX - traverse.end.x;
  const closureDyM = rawY - traverse.end.y;
  const closureErrorMm = Math.hypot(closureDxM, closureDyM) * 1000;
  const adjustedPoints = rawPoints.map((point) => {
    const ratio = cumulativeDistance > 0 ? point.cumulative_distance_m / cumulativeDistance : 0;
    const correctionXM = -closureDxM * ratio;
    const correctionYM = -closureDyM * ratio;
    return {
      point_id: point.point_id,
      raw_x: round(point.raw_x, 6),
      raw_y: round(point.raw_y, 6),
      adjusted_x: round(point.raw_x + correctionXM, 6),
      adjusted_y: round(point.raw_y + correctionYM, 6),
      cumulative_distance_m: round(point.cumulative_distance_m, 4),
      correction_x_mm: round(correctionXM * 1000, 3),
      correction_y_mm: round(correctionYM * 1000, 3),
    };
  });
  const closureSummary = {
    leg_count: traverse.legs.length,
    point_count: adjustedPoints.length,
    total_distance_m: round(cumulativeDistance, 4),
    closure_dx_mm: round(closureDxM * 1000, 3),
    closure_dy_mm: round(closureDyM * 1000, 3),
    closure_error_mm: round(closureErrorMm, 3),
    relative_closure_ratio: closureErrorMm > 0 ? round(cumulativeDistance / (closureErrorMm / 1000), 0) : null,
    closure_tolerance_mm: traverse.closureToleranceMm,
    quality_status: closureErrorMm <= traverse.closureToleranceMm ? "pass" : "alert",
    is_passed: closureErrorMm <= traverse.closureToleranceMm,
  };
  const exportRows = adjustedPoints.map((point) => ({
    row_type: "control_network_traverse_point",
    point_id: point.point_id,
    raw_x_m: point.raw_x,
    raw_y_m: point.raw_y,
    adjusted_x_m: point.adjusted_x,
    adjusted_y_m: point.adjusted_y,
    cumulative_distance_m: point.cumulative_distance_m,
    correction_x_mm: point.correction_x_mm,
    correction_y_mm: point.correction_y_mm,
  }));

  return {
    mode: "traverse_closure",
    input_format: metadata?.inputFormat ?? "json",
    parsed_row_count: metadata?.parsedRowCount ?? null,
    leg_count: traverse.legs.length,
    total_distance_m: round(cumulativeDistance, 4),
    raw_end_x: round(rawX, 6),
    raw_end_y: round(rawY, 6),
    known_end_x: traverse.end.x,
    known_end_y: traverse.end.y,
    closure_dx_mm: round(closureDxM * 1000, 3),
    closure_dy_mm: round(closureDyM * 1000, 3),
    closure_error_mm: round(closureErrorMm, 3),
    relative_closure_ratio: closureErrorMm > 0 ? round(cumulativeDistance / (closureErrorMm / 1000), 0) : null,
    closure_tolerance_mm: traverse.closureToleranceMm,
    is_passed: closureErrorMm <= traverse.closureToleranceMm,
    traverse_closure_summary: closureSummary,
    adjusted_points: adjustedPoints,
    export_rows: exportRows,
  };
}

function shieldDeviation(
  design: z.infer<typeof shieldPose>,
  actual: z.infer<typeof shieldPose>,
  tolerances: { horizontalToleranceMm: number; verticalToleranceMm: number; azimuthToleranceDeg: number },
): Record<string, unknown> & {
  horizontal_deviation_mm: number;
  vertical_deviation_mm: number;
  azimuth_deviation_degrees: number;
  horizontal_status: "pass" | "alert";
  vertical_status: "pass" | "alert";
  azimuth_status: "pass" | "alert";
} {
  const dx = (actual.x - design.x) * 1000;
  const dy = (actual.y - design.y) * 1000;
  const dz = (actual.z - design.z) * 1000;
  const horizontal = Math.hypot(dx, dy);
  let da = actual.azimuthDegrees - design.azimuthDegrees;
  if (da > 180) da -= 360;
  if (da < -180) da += 360;
  const horizontalDeviation = round(horizontal, 2);
  const verticalDeviation = round(dz, 2);
  const azimuthDeviation = round(da, 6);
  return {
    dx_mm: round(dx, 2),
    dy_mm: round(dy, 2),
    horizontal_deviation_mm: horizontalDeviation,
    vertical_deviation_mm: verticalDeviation,
    azimuth_deviation_degrees: azimuthDeviation,
    horizontal_status: horizontal <= tolerances.horizontalToleranceMm ? "pass" : "alert",
    vertical_status: Math.abs(dz) <= tolerances.verticalToleranceMm ? "pass" : "alert",
    azimuth_status: Math.abs(da) <= tolerances.azimuthToleranceDeg ? "pass" : "alert",
  };
}

function slopeByRing(rows: Array<{ ring_no: number; value: number }>): number {
  if (rows.length < 2) return 0;
  const avgRing = rows.reduce((sum, row) => sum + row.ring_no, 0) / rows.length;
  const avgValue = rows.reduce((sum, row) => sum + row.value, 0) / rows.length;
  const numerator = rows.reduce((sum, row) => sum + (row.ring_no - avgRing) * (row.value - avgValue), 0);
  const denominator = rows.reduce((sum, row) => sum + (row.ring_no - avgRing) ** 2, 0);
  return denominator > 0 ? round(numerator / denominator, 3) : 0;
}

function runShieldGuidanceRingTrend(
  rings: ShieldRingInput[],
  tolerances: ShieldTolerances,
  metadata?: { inputFormat?: "json" | "csv"; parsedRowCount?: number | null },
): Record<string, unknown> {
  const ringDetails = rings.map((ring) => ({
    ring_no: ring.ringNo,
    ...shieldDeviation(ring.design, ring.actual, tolerances),
  }));
  const alertRings = ringDetails
    .filter(
      (ring) =>
        ring.horizontal_status === "alert" ||
        ring.vertical_status === "alert" ||
        ring.azimuth_status === "alert",
    )
    .map((ring) => ring.ring_no);
  const horizontalTrend = slopeByRing(
    ringDetails.map((ring) => ({ ring_no: ring.ring_no, value: ring.horizontal_deviation_mm })),
  );
  const verticalTrend = slopeByRing(
    ringDetails.map((ring) => ({ ring_no: ring.ring_no, value: Math.abs(ring.vertical_deviation_mm) })),
  );
  const worstRing = ringDetails.reduce((max, ring) => {
    const score = Math.max(
      ring.horizontal_deviation_mm,
      Math.abs(ring.vertical_deviation_mm),
      Math.abs(ring.azimuth_deviation_degrees) * 1000,
    );
    const maxScore = Math.max(
      max.horizontal_deviation_mm,
      Math.abs(max.vertical_deviation_mm),
      Math.abs(max.azimuth_deviation_degrees) * 1000,
    );
    return score > maxScore ? ring : max;
  }, ringDetails[0]!);
  const maxHorizontalDeviationMm = round(Math.max(...ringDetails.map((ring) => ring.horizontal_deviation_mm)), 2);
  const maxVerticalDeviationMm = round(Math.max(...ringDetails.map((ring) => Math.abs(ring.vertical_deviation_mm))), 2);
  const maxAzimuthDeviationDegrees = round(
    Math.max(...ringDetails.map((ring) => Math.abs(ring.azimuth_deviation_degrees))),
    6,
  );
  const shieldGuidanceSummary = {
    ring_count: ringDetails.length,
    alert_ring_count: alertRings.length,
    max_horizontal_deviation_mm: maxHorizontalDeviationMm,
    max_vertical_deviation_mm: maxVerticalDeviationMm,
    max_azimuth_deviation_degrees: maxAzimuthDeviationDegrees,
    horizontal_trend_mm_per_ring: horizontalTrend,
    vertical_trend_mm_per_ring: verticalTrend,
    quality_status: alertRings.length > 0 ? "alert" : "pass",
    worst_ring: {
      ring_no: worstRing.ring_no,
      horizontal_deviation_mm: worstRing.horizontal_deviation_mm,
      vertical_deviation_mm: worstRing.vertical_deviation_mm,
      azimuth_deviation_degrees: worstRing.azimuth_deviation_degrees,
    },
  };
  const exportRows = ringDetails.map((ring) => ({
    row_type: "shield_guidance_ring_result",
    ...ring,
    status:
      ring.horizontal_status === "alert" || ring.vertical_status === "alert" || ring.azimuth_status === "alert"
        ? "alert"
        : "pass",
  }));
  return {
    mode: "ring_trend",
    input_format: metadata?.inputFormat ?? "json",
    parsed_row_count: metadata?.parsedRowCount ?? null,
    ring_count: ringDetails.length,
    max_horizontal_deviation_mm: maxHorizontalDeviationMm,
    max_vertical_deviation_mm: maxVerticalDeviationMm,
    max_azimuth_deviation_degrees: maxAzimuthDeviationDegrees,
    alert_rings: alertRings,
    horizontal_trend_mm_per_ring: horizontalTrend,
    vertical_trend_mm_per_ring: verticalTrend,
    shield_guidance_summary: shieldGuidanceSummary,
    ring_details: ringDetails,
    export_rows: exportRows,
  };
}

type AlignmentElement = z.infer<typeof alignmentElement>;
type Alignment = z.infer<typeof alignmentSchema>;
type AlignmentObservation = z.infer<typeof alignmentObservation>;
type AlignmentStationOffsetInput = z.infer<typeof alignmentStationOffsetSchema>;
type StationedAlignmentElement = AlignmentElement & {
  elementId: string;
  startStationM: number;
  endStationM: number;
  lengthM: number;
};
type AlignmentProjection = {
  elementId: string;
  elementType: "line" | "arc";
  stationM: number;
  offsetM: number;
  distanceM: number;
  tangentAzimuthDegrees: number;
};

type ParsedAlignmentCsv = {
  alignment: Alignment;
  observations: AlignmentObservation[];
  alignmentPointCount: number;
  observationCount: number;
};
type ParsedAlignmentInput = ParsedAlignmentCsv & {
  inputFormat: "csv" | "geojson" | "landxml" | "dxf";
};

function normalizeRadians(value: number): number {
  const tau = Math.PI * 2;
  return ((value % tau) + tau) % tau;
}

function angularSweep(start: number, end: number, direction: "cw" | "ccw"): number {
  return direction === "ccw"
    ? normalizeRadians(end - start)
    : normalizeRadians(start - end);
}

function angularAlong(start: number, angle: number, direction: "cw" | "ccw"): number {
  return direction === "ccw"
    ? normalizeRadians(angle - start)
    : normalizeRadians(start - angle);
}

function formatStationName(stationM: number): string {
  const sign = stationM < 0 ? "-" : "";
  const abs = Math.abs(stationM);
  const km = Math.floor(abs / 1000);
  const meters = abs - km * 1000;
  return `${sign}K${km}+${meters.toFixed(3).padStart(7, "0")}`;
}

type TrackGeometryInput = z.infer<typeof trackGeometrySchema>;
type TrackGeometryPointInput = z.infer<typeof trackGeometryPoint>;
type NormalizedTrackGeometryPoint = {
  pointId: string;
  track: string;
  stationM: number;
  designGaugeMm: number;
  measuredGaugeMm: number;
  designCantMm: number;
  measuredCantMm: number;
  explicitTwistMm: number | null;
  leftAlignmentDeviationMm: number | null;
  rightAlignmentDeviationMm: number | null;
  leftElevationDeviationMm: number | null;
  rightElevationDeviationMm: number | null;
  leftLateralAdjustmentMm: number | null;
  rightLateralAdjustmentMm: number | null;
  leftVerticalAdjustmentMm: number | null;
  rightVerticalAdjustmentMm: number | null;
  toleranceGaugeMm: number;
  toleranceCantMm: number;
  toleranceTwistMm: number;
  toleranceAlignmentMm: number;
  toleranceElevationMm: number;
  toleranceGaugeChangeRateMmPerM: number | null;
  toleranceCantChangeRateMmPerM: number | null;
};

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = finiteOrNull(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function normalizeCsvHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\s_\-./]/g, "")
    .toLowerCase();
}

const TRACK_GEOMETRY_CSV_ALIASES = new Map<string, keyof TrackGeometryPointInput>(
  [
    ["id", "id"],
    ["pointid", "pointId"],
    ["点号", "id"],
    ["点名", "id"],
    ["测点", "id"],
    ["测点编号", "id"],
    ["track", "track"],
    ["line", "track"],
    ["线路", "track"],
    ["线别", "track"],
    ["股道", "track"],
    ["上下行", "track"],
    ["stationm", "stationM"],
    ["station", "stationM"],
    ["chainage", "stationM"],
    ["里程", "stationM"],
    ["桩号", "stationM"],
    ["测点里程", "stationM"],
    ["公里标", "stationM"],
    ["设计轨距", "designGaugeMm"],
    ["标准轨距", "standardGaugeMm"],
    ["实测轨距", "measuredGaugeMm"],
    ["实测轨距值", "measuredGaugeMm"],
    ["轨距实测值", "measuredGaugeMm"],
    ["轨距", "measuredGaugeMm"],
    ["轨距偏差", "gaugeDeviationMm"],
    ["轨距偏差值", "gaugeDeviationMm"],
    ["轨距差", "gaugeDeviationMm"],
    ["设计水平", "designCantMm"],
    ["设计超高", "designCantMm"],
    ["实测水平", "measuredCantMm"],
    ["实测水平值", "measuredCantMm"],
    ["水平实测值", "measuredCantMm"],
    ["水平", "measuredCantMm"],
    ["实测超高", "measuredCantMm"],
    ["超高", "measuredCantMm"],
    ["水平偏差", "cantDeviationMm"],
    ["水平偏差值", "cantDeviationMm"],
    ["超高偏差", "cantDeviationMm"],
    ["三角坑", "twistMm"],
    ["扭曲", "twistMm"],
    ["轨距限差", "toleranceGaugeMm"],
    ["轨距允许偏差", "toleranceGaugeMm"],
    ["水平限差", "toleranceCantMm"],
    ["水平允许偏差", "toleranceCantMm"],
    ["超高限差", "toleranceCantMm"],
    ["超高允许偏差", "toleranceCantMm"],
    ["三角坑限差", "toleranceTwistMm"],
    ["三角坑允许偏差", "toleranceTwistMm"],
    ["扭曲限差", "toleranceTwistMm"],
    ["扭曲允许偏差", "toleranceTwistMm"],
    ["方向限差", "toleranceAlignmentMm"],
    ["轨向限差", "toleranceAlignmentMm"],
    ["轨向允许偏差", "toleranceAlignmentMm"],
    ["方向允许偏差", "toleranceAlignmentMm"],
    ["高低限差", "toleranceElevationMm"],
    ["高低允许偏差", "toleranceElevationMm"],
    ["轨距变化率限差", "toleranceGaugeChangeRateMmPerM"],
    ["轨距递变率限差", "toleranceGaugeChangeRateMmPerM"],
    ["水平变化率限差", "toleranceCantChangeRateMmPerM"],
    ["超高变化率限差", "toleranceCantChangeRateMmPerM"],
    ["左股方向", "leftAlignmentDeviationMm"],
    ["左股轨向", "leftAlignmentDeviationMm"],
    ["左轨向", "leftAlignmentDeviationMm"],
    ["左股横向偏差", "leftAlignmentDeviationMm"],
    ["左股方向偏差", "leftAlignmentDeviationMm"],
    ["左股轨向偏差", "leftAlignmentDeviationMm"],
    ["右股方向", "rightAlignmentDeviationMm"],
    ["右股轨向", "rightAlignmentDeviationMm"],
    ["右轨向", "rightAlignmentDeviationMm"],
    ["右股横向偏差", "rightAlignmentDeviationMm"],
    ["右股方向偏差", "rightAlignmentDeviationMm"],
    ["右股轨向偏差", "rightAlignmentDeviationMm"],
    ["左股高低", "leftElevationDeviationMm"],
    ["左高低", "leftElevationDeviationMm"],
    ["左股高低偏差", "leftElevationDeviationMm"],
    ["右股高低", "rightElevationDeviationMm"],
    ["右高低", "rightElevationDeviationMm"],
    ["右股高低偏差", "rightElevationDeviationMm"],
    ["左股方向调整量", "leftLateralAdjustmentMm"],
    ["右股方向调整量", "rightLateralAdjustmentMm"],
    ["左股高低调整量", "leftVerticalAdjustmentMm"],
    ["右股高低调整量", "rightVerticalAdjustmentMm"],
  ].map(([alias, key]) => [normalizeCsvHeader(alias), key as keyof TrackGeometryPointInput]),
);

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseStationCell(value: string): number {
  const normalized = value.trim().replace(/\s/g, "").toUpperCase();
  const stationMatch = normalized.match(/^[A-Z]*K?(-?\d+)\+(\d+(?:\.\d+)?)$/);
  if (stationMatch) {
    const km = Number(stationMatch[1]);
    const meters = Number(stationMatch[2]);
    if (Number.isFinite(km) && Number.isFinite(meters)) return km * 1000 + Math.sign(km || 1) * meters;
  }
  return parseNumericCell(value);
}

function parseNumericCell(value: string): number {
  const normalized = value
    .trim()
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10))
    .replace(/[−－﹣–—]/g, "-")
    .replace(/[＋﹢]/g, "+")
    .replace(/[．。]/g, ".")
    .replace(/[,，]/g, "");
  if (!normalized) return Number.NaN;
  const direct = Number(normalized);
  if (Number.isFinite(direct)) return direct;
  const match = normalized.match(/[-+]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTrackGeometryCsv(text: string, delimiterOption: TrackGeometryInput["csvDelimiter"]): TrackGeometryPointInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const firstLine = lines[0]!;
  const delimiter = detectCsvDelimiter(firstLine, delimiterOption);
  const headers = splitDelimitedLine(firstLine, delimiter).map((header) =>
    TRACK_GEOMETRY_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  return lines.slice(1).map((line) => {
    const row: Partial<TrackGeometryPointInput> = {};
    const cells = splitDelimitedLine(line, delimiter);
    cells.forEach((cell, index) => {
      const key = headers[index];
      if (!key) return;
      if (key === "id" || key === "pointId" || key === "track") {
        row[key] = cell;
        return;
      }
      const numeric = key === "stationM" ? parseStationCell(cell) : parseNumericCell(cell);
      if (Number.isFinite(numeric)) {
        (row as Record<string, unknown>)[key] = numeric;
      }
    });
    return row as TrackGeometryPointInput;
  });
}

function trackGeometrySourcePoints(input: TrackGeometryInput): {
  points: TrackGeometryPointInput[];
  inputFormat: "json" | "csv";
  parsedRowCount: number | null;
} {
  if (input.points?.length) return { points: input.points, inputFormat: "json", parsedRowCount: null };
  if (input.trackPoints?.length) return { points: input.trackPoints, inputFormat: "json", parsedRowCount: null };
  if (input.csvText) {
    const points = parseTrackGeometryCsv(input.csvText, input.csvDelimiter);
    return { points, inputFormat: "csv", parsedRowCount: points.length };
  }
  return { points: [], inputFormat: "json", parsedRowCount: null };
}

type CpiiiAdjustmentInput = z.infer<typeof cpiiiAdjustmentSchema>;
type CpiiiPointInput = z.infer<typeof cpiiiPoint>;
type ParsedCpiiiCsv = {
  points: CpiiiPointInput[];
  toleranceMm: number | null;
  verticalToleranceMm: number | null;
};

const CPIII_CSV_ALIASES = new Map<
  string,
  | "id"
  | "observationId"
  | "epoch"
  | "designX"
  | "designY"
  | "designZ"
  | "measuredX"
  | "measuredY"
  | "measuredZ"
  | "dxMm"
  | "dyMm"
  | "dzMm"
  | "weight"
  | "toleranceMm"
  | "verticalToleranceMm"
>(
  [
    ["id", "id"],
    ["pointid", "id"],
    ["点号", "id"],
    ["点名", "id"],
    ["编号", "id"],
    ["cpiii点号", "id"],
    ["observationid", "observationId"],
    ["obsid", "observationId"],
    ["观测号", "observationId"],
    ["记录号", "observationId"],
    ["epoch", "epoch"],
    ["date", "epoch"],
    ["surveydate", "epoch"],
    ["复测日期", "epoch"],
    ["观测日期", "epoch"],
    ["期次", "epoch"],
    ["设计x", "designX"],
    ["设计东坐标", "designX"],
    ["设计坐标x", "designX"],
    ["设计y", "designY"],
    ["设计北坐标", "designY"],
    ["设计坐标y", "designY"],
    ["设计z", "designZ"],
    ["设计高程", "designZ"],
    ["设计标高", "designZ"],
    ["实测x", "measuredX"],
    ["测量x", "measuredX"],
    ["实测东坐标", "measuredX"],
    ["实测坐标x", "measuredX"],
    ["实测y", "measuredY"],
    ["测量y", "measuredY"],
    ["实测北坐标", "measuredY"],
    ["实测坐标y", "measuredY"],
    ["实测z", "measuredZ"],
    ["实测高程", "measuredZ"],
    ["测量高程", "measuredZ"],
    ["实测标高", "measuredZ"],
    ["dx", "dxMm"],
    ["de", "dxMm"],
    ["deltax", "dxMm"],
    ["deltae", "dxMm"],
    ["Δx", "dxMm"],
    ["Δe", "dxMm"],
    ["δx", "dxMm"],
    ["δe", "dxMm"],
    ["x偏差", "dxMm"],
    ["x偏差mm", "dxMm"],
    ["e偏差", "dxMm"],
    ["东坐标较差", "dxMm"],
    ["较差e", "dxMm"],
    ["dy", "dyMm"],
    ["dn", "dyMm"],
    ["deltay", "dyMm"],
    ["deltan", "dyMm"],
    ["Δy", "dyMm"],
    ["Δn", "dyMm"],
    ["δy", "dyMm"],
    ["δn", "dyMm"],
    ["y偏差", "dyMm"],
    ["y偏差mm", "dyMm"],
    ["n偏差", "dyMm"],
    ["北坐标较差", "dyMm"],
    ["较差n", "dyMm"],
    ["dh", "dzMm"],
    ["dz", "dzMm"],
    ["deltah", "dzMm"],
    ["deltaz", "dzMm"],
    ["Δh", "dzMm"],
    ["Δz", "dzMm"],
    ["δh", "dzMm"],
    ["δz", "dzMm"],
    ["高程偏差", "dzMm"],
    ["高程偏差mm", "dzMm"],
    ["weight", "weight"],
    ["权", "weight"],
    ["权重", "weight"],
    ["平面限差", "toleranceMm"],
    ["水平限差", "toleranceMm"],
    ["点位限差", "toleranceMm"],
    ["限差", "toleranceMm"],
    ["高程限差", "verticalToleranceMm"],
    ["竖向限差", "verticalToleranceMm"],
  ].map(([alias, key]) => [
    normalizeCsvHeader(alias),
    key as
      | "id"
      | "observationId"
      | "epoch"
      | "designX"
      | "designY"
      | "designZ"
      | "measuredX"
      | "measuredY"
      | "measuredZ"
      | "dxMm"
      | "dyMm"
      | "dzMm"
      | "weight"
      | "toleranceMm"
      | "verticalToleranceMm",
  ]),
);

function parseCpiiiCsv(text: string, delimiterOption: CpiiiAdjustmentInput["csvDelimiter"]): ParsedCpiiiCsv {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return { points: [], toleranceMm: null, verticalToleranceMm: null };
  const firstLine = lines[0]!;
  const delimiter = detectCsvDelimiter(firstLine, delimiterOption);
  const headers = splitDelimitedLine(firstLine, delimiter).map((header) =>
    CPIII_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  let toleranceMm: number | null = null;
  let verticalToleranceMm: number | null = null;
  const points: CpiiiPointInput[] = [];
  for (const line of lines.slice(1)) {
    const row: Partial<CpiiiPointInput> & {
      dxMm?: number;
      dyMm?: number;
      dzMm?: number;
      toleranceMm?: number;
      verticalToleranceMm?: number;
    } = {};
    splitDelimitedLine(line, delimiter).forEach((cell, index) => {
      const key = headers[index];
      if (!key) return;
      if (key === "id") {
        row.id = cell;
        return;
      }
      if (key === "observationId" || key === "epoch") {
        if (key === "observationId") row.observationId = cell;
        if (key === "epoch") row.epoch = cell;
        return;
      }
      const numeric = parseNumericCell(cell);
      if (Number.isFinite(numeric)) row[key] = numeric;
    });
    if (typeof row.toleranceMm === "number" && toleranceMm === null) toleranceMm = row.toleranceMm;
    if (typeof row.verticalToleranceMm === "number" && verticalToleranceMm === null) {
      verticalToleranceMm = row.verticalToleranceMm;
    }
    const measuredX = Number.isFinite(row.measuredX)
      ? (row.measuredX as number)
      : Number.isFinite(row.dxMm) && Number.isFinite(row.designX)
        ? (row.designX as number) + (row.dxMm as number) / 1000
        : Number.NaN;
    const measuredY = Number.isFinite(row.measuredY)
      ? (row.measuredY as number)
      : Number.isFinite(row.dyMm) && Number.isFinite(row.designY)
        ? (row.designY as number) + (row.dyMm as number) / 1000
        : Number.NaN;
    const measuredZ = Number.isFinite(row.measuredZ)
      ? (row.measuredZ as number)
      : Number.isFinite(row.dzMm) && Number.isFinite(row.designZ)
        ? (row.designZ as number) + (row.dzMm as number) / 1000
        : Number.NaN;
    if (
      row.id &&
      Number.isFinite(row.designX) &&
      Number.isFinite(row.designY) &&
      Number.isFinite(measuredX) &&
      Number.isFinite(measuredY)
    ) {
      points.push({
        id: row.id,
        ...(row.observationId?.trim() ? { observationId: row.observationId.trim() } : {}),
        ...(row.epoch?.trim() ? { epoch: row.epoch.trim() } : {}),
        designX: row.designX as number,
        designY: row.designY as number,
        ...(Number.isFinite(row.designZ) ? { designZ: row.designZ as number } : {}),
        measuredX,
        measuredY,
        ...(Number.isFinite(measuredZ) ? { measuredZ } : {}),
        weight: Number.isFinite(row.weight) && (row.weight as number) > 0 ? (row.weight as number) : 1,
      });
    }
  }
  return { points, toleranceMm, verticalToleranceMm };
}

function cpiiiAdjustmentInput(input: CpiiiAdjustmentInput): {
  points: CpiiiPointInput[];
  toleranceMm: number;
  verticalToleranceMm: number | undefined;
  inputFormat: "json" | "csv";
  parsedRowCount: number | null;
} {
  if (input.points?.length) {
    return {
      points: input.points,
      toleranceMm: input.toleranceMm,
      verticalToleranceMm: input.verticalToleranceMm,
      inputFormat: "json",
      parsedRowCount: null,
    };
  }
  if (input.csvText) {
    const parsed = parseCpiiiCsv(input.csvText, input.csvDelimiter);
    return {
      points: parsed.points,
      toleranceMm: parsed.toleranceMm ?? input.toleranceMm,
      verticalToleranceMm: parsed.verticalToleranceMm ?? input.verticalToleranceMm,
      inputFormat: "csv",
      parsedRowCount: parsed.points.length,
    };
  }
  throw new Error("cpiii_adjustment 需要提供 points 或 csvText");
}

function weightedMean<T>(items: T[], valueOf: (item: T) => number, weightOf: (item: T) => number): number {
  const finite = items
    .map((item) => ({ value: valueOf(item), weight: weightOf(item) }))
    .filter((item) => Number.isFinite(item.value) && Number.isFinite(item.weight) && item.weight > 0);
  const weightSum = finite.reduce((sum, item) => sum + item.weight, 0);
  if (weightSum <= 0) return Number.NaN;
  return finite.reduce((sum, item) => sum + item.value * item.weight, 0) / weightSum;
}

function runCpiiiRepeatedObservationAdjustment(
  points: CpiiiPointInput[],
  toleranceMm: number,
  verticalToleranceMm: number | undefined,
  metadata?: { inputFormat?: "json" | "csv"; parsedRowCount?: number | null },
): Record<string, unknown> {
  const verticalTolerance = verticalToleranceMm ?? toleranceMm;
  const groups = new Map<string, CpiiiPointInput[]>();
  for (const point of points) groups.set(point.id, [...(groups.get(point.id) ?? []), point]);

  const adjustedPoints = [...groups.entries()]
    .map(([pointId, observations]) => {
      const designX = observations.find((obs) => Number.isFinite(obs.designX))?.designX ?? Number.NaN;
      const designY = observations.find((obs) => Number.isFinite(obs.designY))?.designY ?? Number.NaN;
      const designZ = observations.find((obs) => Number.isFinite(obs.designZ ?? Number.NaN))?.designZ;
      const weightOf = (obs: CpiiiPointInput) => obs.weight ?? 1;
      const measuredX = weightedMean(observations, (obs) => obs.measuredX, weightOf);
      const measuredY = weightedMean(observations, (obs) => obs.measuredY, weightOf);
      const measuredZ = weightedMean(observations, (obs) => obs.measuredZ ?? Number.NaN, weightOf);
      const dxMm = (measuredX - designX) * 1000;
      const dyMm = (measuredY - designY) * 1000;
      const planarErrorMm = Math.hypot(dxMm, dyMm);
      const hasVertical = Number.isFinite(designZ ?? Number.NaN) && Number.isFinite(measuredZ);
      const dzMm = hasVertical ? (measuredZ - (designZ ?? 0)) * 1000 : Number.NaN;
      const verticalErrorMm = Math.abs(dzMm);
      const residuals = observations.map((obs, index) => {
        const residualX = (obs.measuredX - measuredX) * 1000;
        const residualY = (obs.measuredY - measuredY) * 1000;
        const residualZ =
          hasVertical && Number.isFinite(obs.measuredZ ?? Number.NaN) ? ((obs.measuredZ ?? 0) - measuredZ) * 1000 : Number.NaN;
        return {
          row_type: "cpiii_observation_residual",
          point_id: pointId,
          observation_id: obs.observationId ?? `${pointId}-${index + 1}`,
          epoch: obs.epoch ?? null,
          measured_x_m: round(obs.measuredX, 6),
          measured_y_m: round(obs.measuredY, 6),
          ...(Number.isFinite(obs.measuredZ ?? Number.NaN) ? { measured_z_m: round(obs.measuredZ ?? 0, 6) } : {}),
          residual_x_mm: round(residualX, 3),
          residual_y_mm: round(residualY, 3),
          planar_residual_mm: round(Math.hypot(residualX, residualY), 3),
          ...(Number.isFinite(residualZ) ? { residual_z_mm: round(residualZ, 3) } : {}),
        };
      });
      const planarResiduals = residuals.map((row) => Number(row.planar_residual_mm));
      const verticalResiduals = residuals.flatMap((row) =>
        "residual_z_mm" in row && typeof row.residual_z_mm === "number" ? [row.residual_z_mm] : [],
      );
      const isPlanarPassed = planarErrorMm <= toleranceMm;
      const isVerticalPassed = hasVertical ? verticalErrorMm <= verticalTolerance : true;
      return {
        row_type: "cpiii_adjusted_point",
        point_id: pointId,
        design_x_m: round(designX, 6),
        design_y_m: round(designY, 6),
        adjusted_measured_x_m: round(measuredX, 6),
        adjusted_measured_y_m: round(measuredY, 6),
        dx_mm: round(dxMm, 3),
        dy_mm: round(dyMm, 3),
        planar_error_mm: round(planarErrorMm, 3),
        planar_tolerance_mm: toleranceMm,
        is_planar_passed: isPlanarPassed,
        ...(hasVertical
          ? {
              design_z_m: round(designZ ?? 0, 6),
              adjusted_measured_z_m: round(measuredZ, 6),
              dz_mm: round(dzMm, 3),
              vertical_error_mm: round(verticalErrorMm, 3),
              vertical_tolerance_mm: verticalTolerance,
              is_vertical_passed: isVerticalPassed,
            }
          : {}),
        observation_count: observations.length,
        weight_sum: round(observations.reduce((sum, obs) => sum + (obs.weight ?? 1), 0), 6),
        rmse_planar_residual_mm: rms(planarResiduals),
        max_planar_residual_mm: absMax(planarResiduals),
        ...(verticalResiduals.length > 0
          ? {
              rmse_vertical_residual_mm: rms(verticalResiduals),
              max_vertical_residual_mm: absMax(verticalResiduals),
            }
          : {}),
        is_passed: isPlanarPassed && isVerticalPassed,
        residuals,
      };
    })
    .sort((a, b) => a.point_id.localeCompare(b.point_id));

  const observationResiduals = adjustedPoints.flatMap((point) => point.residuals);
  const failedPoints = adjustedPoints.filter((point) => !point.is_passed).map((point) => point.point_id);
  const planarFailed = adjustedPoints.filter((point) => !point.is_planar_passed).map((point) => point.point_id);
  const verticalFailed = adjustedPoints
    .filter((point) => "is_vertical_passed" in point && !point.is_vertical_passed)
    .map((point) => point.point_id);
  const maxPlanarError = absMax(adjustedPoints.map((point) => point.planar_error_mm));
  const verticalErrors = adjustedPoints.flatMap((point) =>
    "vertical_error_mm" in point && typeof point.vertical_error_mm === "number" ? [point.vertical_error_mm] : [],
  );
  const maxVerticalError = verticalErrors.length > 0 ? absMax(verticalErrors) : null;
  const maxRepeatPlanarResidual = absMax(observationResiduals.map((row) => row.planar_residual_mm));
  const repeatVerticalResiduals = observationResiduals.flatMap((row) =>
    "residual_z_mm" in row && typeof row.residual_z_mm === "number" ? [row.residual_z_mm] : [],
  );
  const maxRepeatVerticalResidual = repeatVerticalResiduals.length > 0 ? absMax(repeatVerticalResiduals) : null;
  const qualityStatus =
    failedPoints.length > 0 ? "review_failed_points" : maxRepeatPlanarResidual > toleranceMm ? "review_repeat_scatter" : "all_passed";
  const adjustedPointRows = adjustedPoints.map(({ residuals: _residuals, ...point }) => point);
  const summary = {
    adjusted_point_count: adjustedPointRows.length,
    observation_count: points.length,
    failed_count: failedPoints.length,
    planar_failed_count: planarFailed.length,
    vertical_failed_count: verticalFailed.length,
    max_planar_error_mm: maxPlanarError,
    ...(maxVerticalError !== null ? { max_vertical_error_mm: maxVerticalError } : {}),
    max_repeat_planar_residual_mm: maxRepeatPlanarResidual,
    ...(maxRepeatVerticalResidual !== null ? { max_repeat_vertical_residual_mm: maxRepeatVerticalResidual } : {}),
    quality_status: qualityStatus,
  };
  return {
    mode: "cpiii_repeated_observation_adjustment",
    input_format: metadata?.inputFormat ?? "json",
    parsed_row_count: metadata?.parsedRowCount ?? null,
    tolerance_mm: toleranceMm,
    vertical_tolerance_mm: verticalTolerance,
    point_count: adjustedPointRows.length,
    observation_count: points.length,
    failed_points: failedPoints,
    planar_failed_points: planarFailed,
    vertical_failed_points: verticalFailed,
    max_error_mm: maxPlanarError,
    ...(maxVerticalError !== null ? { max_vertical_error_mm: maxVerticalError } : {}),
    max_repeat_planar_residual_mm: maxRepeatPlanarResidual,
    ...(maxRepeatVerticalResidual !== null ? { max_repeat_vertical_residual_mm: maxRepeatVerticalResidual } : {}),
    repeat_observation_summary: summary,
    deviation_summary: summary,
    adjusted_points: adjustedPointRows,
    observation_residuals: observationResiduals,
    details: adjustedPointRows,
    export_rows: [...adjustedPointRows, ...observationResiduals],
  };
}

function runCpiiiAdjustment(
  points: CpiiiPointInput[],
  toleranceMm: number,
  verticalToleranceMm: number | undefined,
  metadata?: { inputFormat?: "json" | "csv"; parsedRowCount?: number | null },
): Record<string, unknown> {
  if (points.length === 0) throw new Error("cpiii_adjustment 没有可计算的 CPIII 点");
  if (new Set(points.map((point) => point.id)).size < points.length) {
    return runCpiiiRepeatedObservationAdjustment(points, toleranceMm, verticalToleranceMm, metadata);
  }
  const details = points.map((p) => {
    const dx = (p.measuredX - p.designX) * 1000;
    const dy = (p.measuredY - p.designY) * 1000;
    const planar = Math.hypot(dx, dy);
    const hasVertical = Number.isFinite(p.designZ ?? Number.NaN) && Number.isFinite(p.measuredZ ?? Number.NaN);
    const dz = hasVertical ? ((p.measuredZ ?? 0) - (p.designZ ?? 0)) * 1000 : Number.NaN;
    const vertical = Math.abs(dz);
    const verticalTolerance = verticalToleranceMm ?? toleranceMm;
    const isPlanarPassed = planar <= toleranceMm;
    const isVerticalPassed = hasVertical ? vertical <= verticalTolerance : true;
    return {
      point_id: p.id,
      dx_mm: round(dx, 3),
      dy_mm: round(dy, 3),
      planar_error_mm: round(planar, 3),
      is_planar_passed: isPlanarPassed,
      ...(hasVertical
        ? {
            dz_mm: round(dz, 3),
            vertical_error_mm: round(vertical, 3),
            is_vertical_passed: isVerticalPassed,
          }
        : {}),
      is_passed: isPlanarPassed && isVerticalPassed,
    };
  });
  const planarFailed = details.filter((p) => !p.is_planar_passed).map((p) => p.point_id);
  const verticalFailed = details
    .filter((p) => "is_vertical_passed" in p && !p.is_vertical_passed)
    .map((p) => p.point_id);
  const verticalErrors = details.flatMap((p) =>
    "vertical_error_mm" in p && typeof p.vertical_error_mm === "number" ? [p.vertical_error_mm] : [],
  );
  const planarErrors = details.map((p) => p.planar_error_mm);
  const failedPoints = details.filter((p) => !p.is_passed).map((p) => p.point_id);
  const maxPlanarError = Math.max(...planarErrors);
  const maxVerticalError = verticalErrors.length > 0 ? Math.max(...verticalErrors) : null;
  const rmsPlanar = Math.sqrt(planarErrors.reduce((sum, value) => sum + value ** 2, 0) / planarErrors.length);
  const rmsVertical =
    verticalErrors.length > 0
      ? Math.sqrt(verticalErrors.reduce((sum, value) => sum + value ** 2, 0) / verticalErrors.length)
      : null;
  const verticalTolerance = verticalToleranceMm ?? toleranceMm;
  const exportRows = details.map((detail, index) => {
    const source = points[index]!;
    return {
      row_type: "cpiii_deviation_point",
      point_id: detail.point_id,
      design_x_m: source.designX,
      design_y_m: source.designY,
      measured_x_m: source.measuredX,
      measured_y_m: source.measuredY,
      dx_mm: detail.dx_mm,
      dy_mm: detail.dy_mm,
      planar_error_mm: detail.planar_error_mm,
      planar_tolerance_mm: toleranceMm,
      is_planar_passed: detail.is_planar_passed,
      ...(Number.isFinite(source.designZ ?? Number.NaN) && Number.isFinite(source.measuredZ ?? Number.NaN)
        ? {
            design_z_m: source.designZ,
            measured_z_m: source.measuredZ,
            dz_mm: "dz_mm" in detail ? detail.dz_mm : null,
            vertical_error_mm: "vertical_error_mm" in detail ? detail.vertical_error_mm : null,
            vertical_tolerance_mm: verticalTolerance,
            is_vertical_passed: "is_vertical_passed" in detail ? detail.is_vertical_passed : true,
          }
        : {}),
      is_passed: detail.is_passed,
    };
  });
  return {
    mode: "cpiii_deviation_review",
    input_format: metadata?.inputFormat ?? "json",
    parsed_row_count: metadata?.parsedRowCount ?? null,
    tolerance_mm: toleranceMm,
    vertical_tolerance_mm: verticalTolerance,
    point_count: details.length,
    failed_points: failedPoints,
    planar_failed_points: planarFailed,
    vertical_failed_points: verticalFailed,
    max_error_mm: round(maxPlanarError, 3),
    ...(maxVerticalError !== null ? { max_vertical_error_mm: round(maxVerticalError, 3) } : {}),
    deviation_summary: {
      point_count: details.length,
      failed_count: failedPoints.length,
      planar_failed_count: planarFailed.length,
      vertical_failed_count: verticalFailed.length,
      max_planar_error_mm: round(maxPlanarError, 3),
      ...(maxVerticalError !== null ? { max_vertical_error_mm: round(maxVerticalError, 3) } : {}),
      rms_planar_error_mm: round(rmsPlanar, 3),
      ...(rmsVertical !== null ? { rms_vertical_error_mm: round(rmsVertical, 3) } : {}),
      quality_status: failedPoints.length > 0 ? "review_failed_points" : "all_passed",
    },
    details,
    export_rows: exportRows,
  };
}

function normalizedTrackGeometryPoints(input: TrackGeometryInput, sourcePoints: TrackGeometryPointInput[]): NormalizedTrackGeometryPoint[] {
  const defaultDesignGaugeMm = input.standardGaugeMm ?? input.designGaugeMm;
  const defaultDesignCantMm = input.designCrossLevelMm ?? input.designCantMm;
  return sourcePoints
    .map((point, index) => {
      if (!Number.isFinite(point.stationM)) return null;
      const designGaugeMm = point.standardGaugeMm ?? point.designGaugeMm ?? defaultDesignGaugeMm;
      const rawMeasuredGaugeMm = firstFinite(point.measuredGaugeMm, point.actualGaugeMm, point.gaugeMm);
      const gaugeDeviationMm = firstFinite(point.gaugeDeviationMm);
      const measuredGaugeMm =
        rawMeasuredGaugeMm !== null
          ? Math.abs(rawMeasuredGaugeMm) < 100
            ? designGaugeMm + rawMeasuredGaugeMm
            : rawMeasuredGaugeMm
          : gaugeDeviationMm !== null
            ? designGaugeMm + gaugeDeviationMm
            : Number.NaN;
      const designCantMm = point.designCrossLevelMm ?? point.designCantMm ?? defaultDesignCantMm;
      const rawMeasuredCantMm = firstFinite(point.measuredCantMm, point.actualCantMm, point.cantMm, point.crossLevelMm);
      const cantDeviationMm = firstFinite(point.cantDeviationMm, point.crossLevelDeviationMm, point.levelDeviationMm);
      const measuredCantMm =
        rawMeasuredCantMm !== null
          ? rawMeasuredCantMm
          : cantDeviationMm !== null
            ? designCantMm + cantDeviationMm
            : Number.NaN;
      if (!Number.isFinite(measuredGaugeMm) || !Number.isFinite(measuredCantMm)) return null;
      return {
        pointId: point.pointId ?? point.id ?? `TG${index + 1}`,
        track: point.track ?? "未分组",
        stationM: point.stationM,
        designGaugeMm,
        measuredGaugeMm,
        designCantMm,
        measuredCantMm,
        explicitTwistMm: firstFinite(point.twistMm),
        leftAlignmentDeviationMm: firstFinite(point.leftAlignmentDeviationMm),
        rightAlignmentDeviationMm: firstFinite(point.rightAlignmentDeviationMm),
        leftElevationDeviationMm: firstFinite(point.leftElevationDeviationMm),
        rightElevationDeviationMm: firstFinite(point.rightElevationDeviationMm),
        leftLateralAdjustmentMm: firstFinite(point.leftLateralAdjustmentMm),
        rightLateralAdjustmentMm: firstFinite(point.rightLateralAdjustmentMm),
        leftVerticalAdjustmentMm: firstFinite(point.leftVerticalAdjustmentMm),
        rightVerticalAdjustmentMm: firstFinite(point.rightVerticalAdjustmentMm),
        toleranceGaugeMm: point.toleranceGaugeMm ?? input.toleranceGaugeMm,
        toleranceCantMm: point.toleranceCantMm ?? input.toleranceCantMm,
        toleranceTwistMm: point.toleranceTwistMm ?? input.toleranceTwistMm,
        toleranceAlignmentMm: point.toleranceAlignmentMm ?? input.toleranceAlignmentMm,
        toleranceElevationMm: point.toleranceElevationMm ?? input.toleranceElevationMm,
        toleranceGaugeChangeRateMmPerM: point.toleranceGaugeChangeRateMmPerM ?? input.toleranceGaugeChangeRateMmPerM ?? null,
        toleranceCantChangeRateMmPerM: point.toleranceCantChangeRateMmPerM ?? input.toleranceCantChangeRateMmPerM ?? null,
      };
    })
    .filter((point): point is NormalizedTrackGeometryPoint => point !== null)
    .sort((a, b) => a.track.localeCompare(b.track) || a.stationM - b.stationM);
}

function absMax(values: Array<number | null | undefined>): number {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length > 0 ? round(Math.max(...finite.map((value) => Math.abs(value))), 3) : 0;
}

function rms(values: Array<number | null | undefined>): number {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (finite.length === 0) return 0;
  return round(Math.sqrt(finite.reduce((sum, value) => sum + value ** 2, 0) / finite.length), 3);
}

function adjustmentFrom(explicitAdjustmentMm: number | null, deviationMm: number | null): number | null {
  if (explicitAdjustmentMm !== null) return round(explicitAdjustmentMm, 3);
  if (deviationMm === null) return null;
  return round(-deviationMm, 3);
}

function runTrackGeometryReview(input: TrackGeometryInput): Record<string, unknown> {
  const source = trackGeometrySourcePoints(input);
  const points = normalizedTrackGeometryPoints(input, source.points);
  if (points.length === 0) throw new Error("track_geometry_review 需要提供可计算的 points 或 trackPoints");
  const previousByTrack = new Map<string, NormalizedTrackGeometryPoint>();
  const details = points.map((point) => {
    const previous = previousByTrack.get(point.track);
    const gaugeDeviationMm = point.measuredGaugeMm - point.designGaugeMm;
    const cantDeviationMm = point.measuredCantMm - point.designCantMm;
    const stationIntervalM = previous ? point.stationM - previous.stationM : null;
    const hasStationInterval = stationIntervalM !== null && Math.abs(stationIntervalM) > 1e-9;
    const gaugeChangeMm = previous ? point.measuredGaugeMm - previous.measuredGaugeMm : null;
    const cantChangeMm = previous ? point.measuredCantMm - previous.measuredCantMm : null;
    const gaugeChangeRateMmPerM = gaugeChangeMm !== null && hasStationInterval ? gaugeChangeMm / stationIntervalM : null;
    const cantChangeRateMmPerM = cantChangeMm !== null && hasStationInterval ? cantChangeMm / stationIntervalM : null;
    const twistMm = point.explicitTwistMm ?? (previous ? point.measuredCantMm - previous.measuredCantMm : 0);
    const lateralValues = [point.leftAlignmentDeviationMm, point.rightAlignmentDeviationMm].filter(
      (value): value is number => value !== null,
    );
    const verticalValues = [point.leftElevationDeviationMm, point.rightElevationDeviationMm].filter(
      (value): value is number => value !== null,
    );
    const failedItems = [
      Math.abs(gaugeDeviationMm) > point.toleranceGaugeMm ? "轨距" : "",
      Math.abs(cantDeviationMm) > point.toleranceCantMm ? "水平/超高" : "",
      Math.abs(twistMm) > point.toleranceTwistMm ? "扭曲" : "",
      lateralValues.some((value) => Math.abs(value) > point.toleranceAlignmentMm) ? "轨向" : "",
      verticalValues.some((value) => Math.abs(value) > point.toleranceElevationMm) ? "高低" : "",
      gaugeChangeRateMmPerM !== null &&
      point.toleranceGaugeChangeRateMmPerM !== null &&
      Math.abs(gaugeChangeRateMmPerM) > point.toleranceGaugeChangeRateMmPerM
        ? "轨距变化率"
        : "",
      cantChangeRateMmPerM !== null &&
      point.toleranceCantChangeRateMmPerM !== null &&
      Math.abs(cantChangeRateMmPerM) > point.toleranceCantChangeRateMmPerM
        ? "水平变化率"
        : "",
    ].filter(Boolean);
    previousByTrack.set(point.track, point);
    return {
      point_id: point.pointId,
      track: point.track,
      station_m: round(point.stationM, 3),
      station_name: formatStationName(point.stationM),
      design_gauge_mm: round(point.designGaugeMm, 3),
      measured_gauge_mm: round(point.measuredGaugeMm, 3),
      gauge_deviation_mm: round(gaugeDeviationMm, 3),
      design_cant_mm: round(point.designCantMm, 3),
      measured_cant_mm: round(point.measuredCantMm, 3),
      cant_deviation_mm: round(cantDeviationMm, 3),
      previous_station_m: previous ? round(previous.stationM, 3) : null,
      station_interval_m: stationIntervalM === null ? null : round(stationIntervalM, 3),
      gauge_change_mm: gaugeChangeMm === null ? null : round(gaugeChangeMm, 3),
      gauge_change_rate_mm_per_m: gaugeChangeRateMmPerM === null ? null : round(gaugeChangeRateMmPerM, 6),
      cant_change_mm: cantChangeMm === null ? null : round(cantChangeMm, 3),
      cant_change_rate_mm_per_m: cantChangeRateMmPerM === null ? null : round(cantChangeRateMmPerM, 6),
      twist_mm: round(twistMm, 3),
      twist_source: point.explicitTwistMm === null ? "derived" : "explicit",
      left_alignment_deviation_mm:
        point.leftAlignmentDeviationMm === null ? null : round(point.leftAlignmentDeviationMm, 3),
      right_alignment_deviation_mm:
        point.rightAlignmentDeviationMm === null ? null : round(point.rightAlignmentDeviationMm, 3),
      left_elevation_deviation_mm:
        point.leftElevationDeviationMm === null ? null : round(point.leftElevationDeviationMm, 3),
      right_elevation_deviation_mm:
        point.rightElevationDeviationMm === null ? null : round(point.rightElevationDeviationMm, 3),
      left_lateral_adjustment_mm: adjustmentFrom(point.leftLateralAdjustmentMm, point.leftAlignmentDeviationMm),
      right_lateral_adjustment_mm: adjustmentFrom(point.rightLateralAdjustmentMm, point.rightAlignmentDeviationMm),
      left_vertical_adjustment_mm: adjustmentFrom(point.leftVerticalAdjustmentMm, point.leftElevationDeviationMm),
      right_vertical_adjustment_mm: adjustmentFrom(point.rightVerticalAdjustmentMm, point.rightElevationDeviationMm),
      tolerance_gauge_mm: round(point.toleranceGaugeMm, 3),
      tolerance_cant_mm: round(point.toleranceCantMm, 3),
      tolerance_twist_mm: round(point.toleranceTwistMm, 3),
      tolerance_alignment_mm: round(point.toleranceAlignmentMm, 3),
      tolerance_elevation_mm: round(point.toleranceElevationMm, 3),
      tolerance_gauge_change_rate_mm_per_m:
        point.toleranceGaugeChangeRateMmPerM === null ? null : round(point.toleranceGaugeChangeRateMmPerM, 6),
      tolerance_cant_change_rate_mm_per_m:
        point.toleranceCantChangeRateMmPerM === null ? null : round(point.toleranceCantChangeRateMmPerM, 6),
      failed_items: failedItems.join("、"),
      status: failedItems.length > 0 ? "alert" : "pass",
      is_passed: failedItems.length === 0,
      recommended_action:
        failedItems.length > 0 ? "adjust_track_geometry_and_remeasure" : "accept_track_geometry_point",
    };
  });

  const sectionSummaries: Array<Record<string, unknown>> = [];
  if (input.sectionLengthM && input.sectionLengthM > 0) {
    const firstStationByTrack = new Map<string, number>();
    for (const row of details) {
      const track = String(row.track);
      firstStationByTrack.set(track, Math.min(firstStationByTrack.get(track) ?? row.station_m, row.station_m));
    }
    const groups = new Map<string, typeof details>();
    for (const row of details) {
      const firstStation = firstStationByTrack.get(String(row.track));
      if (firstStation === undefined) continue;
      const sectionIndex = Math.floor((row.station_m - firstStation) / input.sectionLengthM);
      const key = `${row.track}::${sectionIndex}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const [key, rows] of groups) {
      const [track, indexText] = key.split("::");
      const stations = rows.map((row) => row.station_m);
      const failedCount = rows.filter((row) => !row.is_passed).length;
      sectionSummaries.push({
        track,
        section_index: Number(indexText) + 1,
        start_station_m: round(Math.min(...stations), 3),
        end_station_m: round(Math.max(...stations), 3),
        section_length_m: input.sectionLengthM,
        point_count: rows.length,
        failed_count: failedCount,
        gauge_rms_mm: rms(rows.map((row) => row.gauge_deviation_mm)),
        cant_rms_mm: rms(rows.map((row) => row.cant_deviation_mm)),
        twist_rms_mm: rms(rows.map((row) => row.twist_mm)),
        track_quality_index_mm: round(
          rms(rows.map((row) => row.gauge_deviation_mm)) +
            rms(rows.map((row) => row.cant_deviation_mm)) +
            rms(rows.map((row) => row.twist_mm)),
          3,
        ),
        status: failedCount > 0 ? "review" : "pass",
      });
    }
  }

  const failedDetails = details.filter((row) => !row.is_passed);
  const failedItemLabels = ["轨距", "水平/超高", "扭曲", "轨向", "高低", "轨距变化率", "水平变化率"];
  const failedItemCounts = Object.fromEntries(
    failedItemLabels.map((label) => [
      label,
      details.filter((row) => String(row.failed_items).split("、").filter(Boolean).includes(label)).length,
    ]),
  );
  const worstSection =
    sectionSummaries.length > 0
      ? sectionSummaries.reduce((worst, row) =>
          Number(row.track_quality_index_mm ?? 0) > Number(worst.track_quality_index_mm ?? 0) ? row : worst,
        )
      : null;
  const passedCount = details.length - failedDetails.length;
  const passRatePct = details.length > 0 ? round((passedCount / details.length) * 100, 1) : 0;
  return {
    mode: "track_geometry_review",
    input_format: source.inputFormat,
    parsed_row_count: source.parsedRowCount,
    point_count: details.length,
    track_count: new Set(details.map((row) => row.track)).size,
    section_count: sectionSummaries.length,
    failed_count: failedDetails.length,
    failed_points: failedDetails.map((row) => row.point_id),
    failed_item_counts: failedItemCounts,
    gauge_change_rate_failed_count: details.filter((row) => row.failed_items.includes("轨距变化率")).length,
    cant_change_rate_failed_count: details.filter((row) => row.failed_items.includes("水平变化率")).length,
    max_abs_gauge_deviation_mm: absMax(details.map((row) => row.gauge_deviation_mm)),
    max_abs_cant_deviation_mm: absMax(details.map((row) => row.cant_deviation_mm)),
    max_abs_gauge_change_mm: absMax(details.map((row) => row.gauge_change_mm)),
    max_abs_cant_change_mm: absMax(details.map((row) => row.cant_change_mm)),
    max_abs_gauge_change_rate_mm_per_m: absMax(details.map((row) => row.gauge_change_rate_mm_per_m)),
    max_abs_cant_change_rate_mm_per_m: absMax(details.map((row) => row.cant_change_rate_mm_per_m)),
    max_abs_twist_mm: absMax(details.map((row) => row.twist_mm)),
    max_abs_left_alignment_deviation_mm: absMax(details.map((row) => row.left_alignment_deviation_mm)),
    max_abs_right_alignment_deviation_mm: absMax(details.map((row) => row.right_alignment_deviation_mm)),
    max_abs_left_elevation_deviation_mm: absMax(details.map((row) => row.left_elevation_deviation_mm)),
    max_abs_right_elevation_deviation_mm: absMax(details.map((row) => row.right_elevation_deviation_mm)),
    track_quality_summary: {
      point_count: details.length,
      passed_count: passedCount,
      failed_count: failedDetails.length,
      pass_rate_pct: passRatePct,
      max_section_track_quality_index_mm:
        sectionSummaries.length > 0
          ? round(Math.max(...sectionSummaries.map((row) => Number(row.track_quality_index_mm ?? 0))), 3)
          : 0,
      worst_section: worstSection,
    },
    section_summaries: sectionSummaries,
    details,
    export_rows: [
      ...details.map((row) => ({
        row_type: "track_geometry_review_point",
        point_id: row.point_id,
        track: row.track,
        station_m: row.station_m,
        station_name: row.station_name,
        gauge_deviation_mm: row.gauge_deviation_mm,
        cant_deviation_mm: row.cant_deviation_mm,
        twist_mm: row.twist_mm,
        gauge_change_rate_mm_per_m: row.gauge_change_rate_mm_per_m,
        cant_change_rate_mm_per_m: row.cant_change_rate_mm_per_m,
        left_alignment_deviation_mm: row.left_alignment_deviation_mm,
        right_alignment_deviation_mm: row.right_alignment_deviation_mm,
        left_elevation_deviation_mm: row.left_elevation_deviation_mm,
        right_elevation_deviation_mm: row.right_elevation_deviation_mm,
        left_lateral_adjustment_mm: row.left_lateral_adjustment_mm,
        right_lateral_adjustment_mm: row.right_lateral_adjustment_mm,
        left_vertical_adjustment_mm: row.left_vertical_adjustment_mm,
        right_vertical_adjustment_mm: row.right_vertical_adjustment_mm,
        failed_items: row.failed_items,
        status: row.status,
        recommended_action: row.recommended_action,
      })),
      ...sectionSummaries.map((row) => ({
        row_type: "track_geometry_section_summary",
        ...row,
      })),
    ],
  };
}

function alignmentElementLength(element: AlignmentElement): number {
  if (element.type === "line") return hypot2(element.end.x - element.start.x, element.end.y - element.start.y);
  const startRadius = hypot2(element.start.x - element.center.x, element.start.y - element.center.y);
  const endRadius = hypot2(element.end.x - element.center.x, element.end.y - element.center.y);
  const radius = (startRadius + endRadius) / 2;
  if (radius <= 1e-9) throw new Error(`线路圆曲线 ${element.id ?? ""} 半径必须大于 0`);
  const startAngle = Math.atan2(element.start.y - element.center.y, element.start.x - element.center.x);
  const endAngle = Math.atan2(element.end.y - element.center.y, element.end.x - element.center.x);
  return radius * angularSweep(startAngle, endAngle, element.direction);
}

function lineElementsFromPoints(alignment: Alignment): AlignmentElement[] {
  const points = alignment.points ?? [];
  return points.slice(0, -1).map((point, index) => ({
    id: point.id && points[index + 1]?.id ? `${point.id}-${points[index + 1]?.id}` : `L${index + 1}`,
    type: "line" as const,
    start: point,
    end: points[index + 1]!,
    startStationM: index === 0 ? (point.stationM ?? alignment.startStationM) : point.stationM,
  }));
}

function buildStationedAlignment(alignment: Alignment): StationedAlignmentElement[] {
  const elements = alignment.elements ?? lineElementsFromPoints(alignment);
  let station = alignment.startStationM;
  return elements.map((element, index) => {
    const startStationM = element.startStationM ?? station;
    const lengthM = alignmentElementLength(element);
    const stationed = {
      ...element,
      elementId: element.id ?? `${element.type === "line" ? "L" : "R"}${index + 1}`,
      startStationM,
      endStationM: startStationM + lengthM,
      lengthM,
    };
    station = stationed.endStationM;
    return stationed;
  });
}

function projectOnLine(element: StationedAlignmentElement & z.infer<typeof alignmentLineElement>, point: { x: number; y: number }): AlignmentProjection | null {
  const dx = element.end.x - element.start.x;
  const dy = element.end.y - element.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-12) return null;
  const t = Math.max(0, Math.min(1, ((point.x - element.start.x) * dx + (point.y - element.start.y) * dy) / lengthSquared));
  const projected = { x: element.start.x + t * dx, y: element.start.y + t * dy };
  const length = Math.sqrt(lengthSquared);
  const offsetM = (dx * (point.y - projected.y) - dy * (point.x - projected.x)) / length;
  return {
    elementId: element.elementId,
    elementType: "line",
    stationM: element.startStationM + t * element.lengthM,
    offsetM,
    distanceM: hypot2(point.x - projected.x, point.y - projected.y),
    tangentAzimuthDegrees: azimuthDegrees(dx, dy),
  };
}

function projectOnArc(element: StationedAlignmentElement & z.infer<typeof alignmentArcElement>, point: { x: number; y: number }): AlignmentProjection | null {
  const radius = hypot2(element.start.x - element.center.x, element.start.y - element.center.y);
  if (radius <= 1e-9) return null;
  const startAngle = Math.atan2(element.start.y - element.center.y, element.start.x - element.center.x);
  const endAngle = Math.atan2(element.end.y - element.center.y, element.end.x - element.center.x);
  const pointAngle = Math.atan2(point.y - element.center.y, point.x - element.center.x);
  const sweep = angularSweep(startAngle, endAngle, element.direction);
  const pointAlong = angularAlong(startAngle, pointAngle, element.direction);
  const clampedAlong = pointAlong <= sweep ? pointAlong : pointAlong - sweep < Math.PI ? sweep : 0;
  const projectedAngle = element.direction === "ccw" ? startAngle + clampedAlong : startAngle - clampedAlong;
  const projected = {
    x: element.center.x + Math.cos(projectedAngle) * radius,
    y: element.center.y + Math.sin(projectedAngle) * radius,
  };
  const tangent =
    element.direction === "ccw"
      ? { dx: -Math.sin(projectedAngle), dy: Math.cos(projectedAngle) }
      : { dx: Math.sin(projectedAngle), dy: -Math.cos(projectedAngle) };
  const offsetM = tangent.dx * (point.y - projected.y) - tangent.dy * (point.x - projected.x);
  return {
    elementId: element.elementId,
    elementType: "arc",
    stationM: element.startStationM + clampedAlong * radius,
    offsetM,
    distanceM: hypot2(point.x - projected.x, point.y - projected.y),
    tangentAzimuthDegrees: azimuthDegrees(tangent.dx, tangent.dy),
  };
}

function projectOnAlignment(elements: StationedAlignmentElement[], point: { x: number; y: number }): AlignmentProjection | null {
  let best: AlignmentProjection | null = null;
  for (const element of elements) {
    const projected = element.type === "line" ? projectOnLine(element, point) : projectOnArc(element, point);
    if (projected && (!best || projected.distanceM < best.distanceM)) best = projected;
  }
  return best;
}

const ALIGNMENT_CSV_ALIASES = new Map<
  string,
  "role" | "id" | "stationM" | "x" | "y" | "designOffsetM" | "designOffsetMm" | "toleranceMm"
>(
  [
    ["role", "role"],
    ["type", "role"],
    ["类型", "role"],
    ["行类型", "role"],
    ["记录类型", "role"],
    ["数据类型", "role"],
    ["id", "id"],
    ["pointid", "id"],
    ["点号", "id"],
    ["点名", "id"],
    ["编号", "id"],
    ["测点编号", "id"],
    ["stationm", "stationM"],
    ["station", "stationM"],
    ["chainage", "stationM"],
    ["里程", "stationM"],
    ["测点里程", "stationM"],
    ["x", "x"],
    ["easting", "x"],
    ["east", "x"],
    ["东坐标", "x"],
    ["坐标x", "x"],
    ["x坐标", "x"],
    ["y", "y"],
    ["northing", "y"],
    ["north", "y"],
    ["北坐标", "y"],
    ["坐标y", "y"],
    ["y坐标", "y"],
    ["designoffsetm", "designOffsetM"],
    ["designoffset", "designOffsetM"],
    ["设计偏距", "designOffsetM"],
    ["理论偏距", "designOffsetM"],
    ["偏距", "designOffsetM"],
    ["designoffsetmm", "designOffsetMm"],
    ["设计偏距mm", "designOffsetMm"],
    ["理论偏距mm", "designOffsetMm"],
    ["偏距mm", "designOffsetMm"],
    ["tolerancemm", "toleranceMm"],
    ["tolerance", "toleranceMm"],
    ["限差", "toleranceMm"],
    ["平面限差", "toleranceMm"],
    ["偏距限差", "toleranceMm"],
  ].map(([alias, key]) => [
    normalizeCsvHeader(alias),
    key as "role" | "id" | "stationM" | "x" | "y" | "designOffsetM" | "designOffsetMm" | "toleranceMm",
  ]),
);

function parseAlignmentStationOffsetCsv(text: string, delimiterOption: TrackGeometryInput["csvDelimiter"]): ParsedAlignmentCsv {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { alignment: { startStationM: 0, points: [] }, observations: [], alignmentPointCount: 0, observationCount: 0 };
  }
  const firstLine = lines[0]!;
  const delimiter = detectCsvDelimiter(firstLine, delimiterOption);
  const headers = splitDelimitedLine(firstLine, delimiter).map((header) => {
    const mapped = ALIGNMENT_CSV_ALIASES.get(normalizeCsvHeader(header));
    return mapped === "designOffsetM" && /mm|毫米/i.test(header) ? "designOffsetMm" : mapped;
  });
  const alignmentPoints: Array<{ id?: string; stationM?: number; x: number; y: number }> = [];
  const observations: AlignmentObservation[] = [];
  for (const line of lines.slice(1)) {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, index) => {
      const key = headers[index];
      if (key) row[key] = cell;
    });
    const role = (row.role ?? "").trim();
    const x = parseNumericCell(row.x ?? "");
    const y = parseNumericCell(row.y ?? "");
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const stationM = row.stationM ? parseStationCell(row.stationM) : Number.NaN;
    const isAlignment =
      /中线|线路|路线|alignment|center/i.test(role) ||
      (Number.isFinite(stationM) && !/测点|观测|实测|point|obs/i.test(role));
    if (isAlignment) {
      alignmentPoints.push({
        id: row.id?.trim() || undefined,
        ...(Number.isFinite(stationM) ? { stationM } : {}),
        x,
        y,
      });
      continue;
    }
    const designOffsetM = parseNumericCell(row.designOffsetM ?? "");
    const designOffsetMm = parseNumericCell(row.designOffsetMm ?? "");
    observations.push({
      id: row.id?.trim() || `P${observations.length + 1}`,
      x,
      y,
      designOffsetM: Number.isFinite(designOffsetM)
        ? designOffsetM
        : Number.isFinite(designOffsetMm)
          ? designOffsetMm / 1000
          : 0,
      toleranceMm: Number.isFinite(parseNumericCell(row.toleranceMm ?? ""))
        ? parseNumericCell(row.toleranceMm ?? "")
        : 20,
    });
  }
  const startStationM = alignmentPoints[0]?.stationM ?? 0;
  return {
    alignment: { startStationM, points: alignmentPoints },
    observations,
    alignmentPointCount: alignmentPoints.length,
    observationCount: observations.length,
  };
}

function geoJsonNumber(value: unknown, station = false): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = station ? parseStationCell(value) : parseNumericCell(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function geoJsonText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function geoJsonPropertyNumber(
  properties: Record<string, unknown>,
  names: string[],
  station = false,
): number | null {
  const normalized = new Map(Object.entries(properties).map(([key, value]) => [normalizeCsvHeader(key), value]));
  for (const name of names) {
    const value = normalized.get(normalizeCsvHeader(name));
    const numeric = geoJsonNumber(value, station);
    if (numeric !== null) return numeric;
  }
  return null;
}

function geoJsonPropertyText(properties: Record<string, unknown>, names: string[]): string {
  const normalized = new Map(Object.entries(properties).map(([key, value]) => [normalizeCsvHeader(key), value]));
  for (const name of names) {
    const text = geoJsonText(normalized.get(normalizeCsvHeader(name)));
    if (text) return text;
  }
  return "";
}

function geoJsonPoint(value: unknown): { x: number; y: number } | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = geoJsonNumber(value[0]);
  const y = geoJsonNumber(value[1]);
  return x === null || y === null ? null : { x, y };
}

function geoJsonLinePoints(value: unknown): Array<{ x: number; y: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const point = geoJsonPoint(item);
    return point ? [point] : [];
  });
}

function geoJsonFeatures(parsed: unknown): Array<Record<string, unknown>> {
  if (!isRecord(parsed)) return [];
  const type = geoJsonText(parsed.type).toLowerCase();
  if (type === "featurecollection" && Array.isArray(parsed.features)) {
    return parsed.features.filter(isRecord);
  }
  if (type === "feature") return [parsed];
  if (isRecord(parsed.geometry)) return [{ type: "Feature", properties: {}, geometry: parsed.geometry }];
  return [{ type: "Feature", properties: {}, geometry: parsed }];
}

function isAlignmentGeoJsonPoint(properties: Record<string, unknown>): boolean {
  const role = geoJsonPropertyText(properties, ["role", "type", "kind", "source"]);
  if (/中线|线路|路线|alignment|center|centerline|route/i.test(role)) return true;
  if (/测点|观测|实测|observation|observed|survey|point|obs/i.test(role)) return false;
  return geoJsonPropertyNumber(properties, ["stationM", "station", "chainage", "里程"], true) !== null;
}

function parseAlignmentStationOffsetGeoJson(text: string): ParsedAlignmentCsv {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`alignment_station_offset GeoJSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
  const alignmentPoints: Array<{ id?: string; stationM?: number; x: number; y: number }> = [];
  const observations: AlignmentObservation[] = [];
  for (const [featureIndex, feature] of geoJsonFeatures(parsed).entries()) {
    const properties = isRecord(feature.properties) ? feature.properties : {};
    const geometry = isRecord(feature.geometry) ? feature.geometry : feature;
    const geometryType = geoJsonText(geometry.type).toLowerCase();
    const id =
      geoJsonPropertyText(properties, ["id", "pointId", "name", "点号", "点名"]) ||
      `GJ-${featureIndex + 1}`;
    if (geometryType === "linestring") {
      const startStationM =
        geoJsonPropertyNumber(properties, ["startStationM", "stationM", "station", "chainage", "起点里程", "里程"], true) ??
        (alignmentPoints[0]?.stationM ?? 0);
      const points = geoJsonLinePoints(geometry.coordinates);
      points.forEach((point, pointIndex) => {
        alignmentPoints.push({
          id: `${id}-${pointIndex + 1}`,
          ...(pointIndex === 0 ? { stationM: startStationM } : {}),
          ...point,
        });
      });
      continue;
    }
    if (geometryType === "multilinestring" && Array.isArray(geometry.coordinates)) {
      const startStationM =
        geoJsonPropertyNumber(properties, ["startStationM", "stationM", "station", "chainage", "起点里程", "里程"], true) ??
        (alignmentPoints[0]?.stationM ?? 0);
      geometry.coordinates.forEach((line, lineIndex) => {
        geoJsonLinePoints(line).forEach((point, pointIndex) => {
          alignmentPoints.push({
            id: `${id}-${lineIndex + 1}-${pointIndex + 1}`,
            ...(alignmentPoints.length === 0 && pointIndex === 0 ? { stationM: startStationM } : {}),
            ...point,
          });
        });
      });
      continue;
    }
    if (geometryType !== "point") continue;
    const point = geoJsonPoint(geometry.coordinates);
    if (!point) continue;
    const stationM = geoJsonPropertyNumber(properties, ["stationM", "station", "chainage", "里程"], true);
    if (isAlignmentGeoJsonPoint(properties)) {
      alignmentPoints.push({
        id,
        ...(stationM !== null ? { stationM } : {}),
        ...point,
      });
      continue;
    }
    observations.push({
      id,
      ...point,
      designOffsetM: geoJsonPropertyNumber(properties, ["designOffsetM", "designOffset", "offset", "设计偏距", "理论偏距"]) ?? 0,
      toleranceMm: geoJsonPropertyNumber(properties, ["toleranceMm", "tolerance", "限差", "偏距限差"]) ?? 20,
    });
  }
  return {
    alignment: { startStationM: alignmentPoints[0]?.stationM ?? 0, points: alignmentPoints },
    observations,
    alignmentPointCount: alignmentPoints.length,
    observationCount: observations.length,
  };
}

function xmlAttribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1]?.trim() ?? "";
}

function xmlBlocks(text: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi");
  return text.match(pattern) ?? [];
}

function firstXmlChildText(block: string, tagName: string): string {
  const match = block.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function landXmlPoint(text: string): { x: number; y: number } | null {
  const parts = text.trim().split(/\s+/).map((part) => parseNumericCell(part));
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  return { x: parts[0]!, y: parts[1]! };
}

function landXmlDescNumber(desc: string, name: string): number | null {
  const match = desc.match(new RegExp(`${name}\\s*=\\s*([^;\\s]+)`, "i"));
  if (!match) return null;
  const numeric = parseNumericCell(match[1] ?? "");
  return Number.isFinite(numeric) ? numeric : null;
}

function parseAlignmentStationOffsetLandXml(text: string): ParsedAlignmentCsv {
  const alignmentPoints: Array<{ id?: string; stationM?: number; x: number; y: number }> = [];
  const alignmentElements: AlignmentElement[] = [];
  const observations: AlignmentObservation[] = [];
  const alignmentBlocks = xmlBlocks(text, "Alignment");
  for (const [alignmentIndex, alignmentBlock] of alignmentBlocks.entries()) {
    const alignmentStart = alignmentBlock.match(/<Alignment\b[^>]*>/i)?.[0] ?? "";
    const alignmentName = xmlAttribute(alignmentStart, "name") || `Alignment-${alignmentIndex + 1}`;
    const startStationM = parseStationCell(xmlAttribute(alignmentStart, "staStart") || "0");
    const geometryBlocks = alignmentBlock.match(/<(Line|Curve)\b[^>]*>[\s\S]*?<\/\1>/gi) ?? [];
    let hasElementInAlignment = false;
    let lineIndex = 0;
    let curveIndex = 0;
    for (const geometryBlock of geometryBlocks) {
      const geometryTag = geometryBlock.match(/^<(\w+)\b[^>]*>/i)?.[1]?.toLowerCase() ?? "";
      if (geometryTag === "line") {
        lineIndex += 1;
        const start = landXmlPoint(firstXmlChildText(geometryBlock, "Start"));
        const end = landXmlPoint(firstXmlChildText(geometryBlock, "End"));
        if (!start || !end) continue;
        const elementId = `${alignmentName}-L${lineIndex}`;
        const elementStartStationM =
          !hasElementInAlignment && Number.isFinite(startStationM) ? startStationM : undefined;
        alignmentElements.push({
          id: elementId,
          type: "line",
          start,
          end,
          ...(elementStartStationM !== undefined ? { startStationM: elementStartStationM } : {}),
        });
        hasElementInAlignment = true;
        alignmentPoints.push({
          id: `${elementId}-S`,
          ...(alignmentPoints.length === 0 && Number.isFinite(startStationM) ? { stationM: startStationM } : {}),
          ...start,
        });
        alignmentPoints.push({
          id: `${elementId}-E`,
          ...end,
        });
        continue;
      }
      if (geometryTag === "curve") {
        curveIndex += 1;
        const startTag = geometryBlock.match(/<Curve\b[^>]*>/i)?.[0] ?? "";
        const start = landXmlPoint(firstXmlChildText(geometryBlock, "Start"));
        const center = landXmlPoint(firstXmlChildText(geometryBlock, "Center"));
        const end = landXmlPoint(firstXmlChildText(geometryBlock, "End"));
        if (!start || !center || !end) continue;
        const rot = xmlAttribute(startTag, "rot").toLowerCase();
        const direction: "cw" | "ccw" = /ccw|counter|left/i.test(rot)
          ? "ccw"
          : /cw|clockwise|right/i.test(rot)
            ? "cw"
            : "ccw";
        const elementStartStationM =
          !hasElementInAlignment && Number.isFinite(startStationM) ? startStationM : undefined;
        alignmentElements.push({
          id: `${alignmentName}-R${curveIndex}`,
          type: "arc",
          start,
          center,
          end,
          direction,
          ...(elementStartStationM !== undefined ? { startStationM: elementStartStationM } : {}),
        });
        hasElementInAlignment = true;
      }
    }
  }
  for (const cgPointBlock of xmlBlocks(text, "CgPoint")) {
    const startTag = cgPointBlock.match(/<CgPoint\b[^>]*>/i)?.[0] ?? "";
    const code = xmlAttribute(startTag, "code");
    const desc = xmlAttribute(startTag, "desc");
    const point = landXmlPoint(cgPointBlock.replace(/<CgPoint\b[^>]*>/i, "").replace(/<\/CgPoint>/i, ""));
    if (!point) continue;
    const id = xmlAttribute(startTag, "name") || xmlAttribute(startTag, "oID") || `P${observations.length + 1}`;
    const stationM = landXmlDescNumber(desc, "stationM") ?? landXmlDescNumber(desc, "chainage");
    const role = `${code} ${desc}`;
    if (/中线|线路|路线|alignment|center|centerline/i.test(role) || stationM !== null) {
      alignmentPoints.push({
        id,
        ...(stationM !== null ? { stationM } : {}),
        ...point,
      });
      continue;
    }
    observations.push({
      id,
      ...point,
      designOffsetM: landXmlDescNumber(desc, "designOffsetM") ?? landXmlDescNumber(desc, "designOffset") ?? 0,
      toleranceMm: landXmlDescNumber(desc, "toleranceMm") ?? landXmlDescNumber(desc, "tolerance") ?? 20,
    });
  }
  const startStationM = alignmentPoints[0]?.stationM ?? alignmentElements[0]?.startStationM ?? 0;
  const alignment: Alignment =
    alignmentElements.length > 0
      ? {
          startStationM,
          elements: alignmentElements,
          ...(alignmentPoints.length >= 2 ? { points: alignmentPoints } : {}),
        }
      : { startStationM, points: alignmentPoints };
  return {
    alignment,
    observations,
    alignmentPointCount: alignmentPoints.length,
    observationCount: observations.length,
  };
}

function dxfGroups(entity: Array<[string, string]>): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const [code, value] of entity) {
    groups[code] = [...(groups[code] ?? []), value];
  }
  return groups;
}

function dxfNumber(groups: Record<string, string[]>, code: string, index = 0): number {
  const numeric = parseNumericCell(groups[code]?.[index] ?? "");
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function addDxfAlignmentPoint(
  points: Array<{ id?: string; stationM?: number; x: number; y: number }>,
  point: { x: number; y: number },
  id: string,
): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  points.push({
    id,
    ...(points.length === 0 ? { stationM: 0 } : {}),
    ...point,
  });
}

function parseAlignmentStationOffsetDxf(text: string): ParsedAlignmentCsv {
  const pairs: Array<[string, string]> = [];
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim());
  for (let index = 0; index < lines.length - 1; index += 2) {
    pairs.push([lines[index] ?? "", lines[index + 1] ?? ""]);
  }
  const entities: Array<{ type: string; groups: Record<string, string[]> }> = [];
  let currentType = "";
  let currentGroups: Array<[string, string]> = [];
  const flush = () => {
    if (currentType) entities.push({ type: currentType, groups: dxfGroups(currentGroups) });
    currentGroups = [];
  };
  for (const [code, value] of pairs) {
    const entityType = value.toUpperCase();
    if (code === "0") {
      if (["LINE", "POINT", "LWPOLYLINE"].includes(entityType)) {
        flush();
        currentType = entityType;
        continue;
      }
      if (currentType) flush();
      currentType = "";
      continue;
    }
    if (currentType) currentGroups.push([code, value]);
  }
  flush();

  const alignmentPoints: Array<{ id?: string; stationM?: number; x: number; y: number }> = [];
  const observations: AlignmentObservation[] = [];
  for (const [entityIndex, entity] of entities.entries()) {
    const layer = (entity.groups["8"]?.[0] ?? "").toLowerCase();
    const isObservation = /obs|observation|实测|观测|测点/.test(layer);
    const isAlignment = /align|center|route|中线|线路|路线/.test(layer) || !isObservation;
    if (entity.type === "LINE" && isAlignment) {
      const start = { x: dxfNumber(entity.groups, "10"), y: dxfNumber(entity.groups, "20") };
      const end = { x: dxfNumber(entity.groups, "11"), y: dxfNumber(entity.groups, "21") };
      addDxfAlignmentPoint(alignmentPoints, start, `DXF-L${entityIndex + 1}-S`);
      addDxfAlignmentPoint(alignmentPoints, end, `DXF-L${entityIndex + 1}-E`);
      continue;
    }
    if (entity.type === "LWPOLYLINE" && isAlignment) {
      const xs = entity.groups["10"] ?? [];
      const ys = entity.groups["20"] ?? [];
      for (let index = 0; index < Math.min(xs.length, ys.length); index += 1) {
        addDxfAlignmentPoint(
          alignmentPoints,
          { x: parseNumericCell(xs[index] ?? ""), y: parseNumericCell(ys[index] ?? "") },
          `DXF-P${entityIndex + 1}-${index + 1}`,
        );
      }
      continue;
    }
    if (entity.type !== "POINT") continue;
    const point = { x: dxfNumber(entity.groups, "10"), y: dxfNumber(entity.groups, "20") };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const id = entity.groups["2"]?.[0] ?? entity.groups["5"]?.[0] ?? `D${observations.length + 1}`;
    if (isAlignment) {
      addDxfAlignmentPoint(alignmentPoints, point, id);
      continue;
    }
    observations.push({
      id,
      ...point,
      designOffsetM: 0,
      toleranceMm: 20,
    });
  }
  return {
    alignment: { startStationM: alignmentPoints[0]?.stationM ?? 0, points: alignmentPoints },
    observations,
    alignmentPointCount: alignmentPoints.length,
    observationCount: observations.length,
  };
}

function alignmentStationOffsetInput(input: AlignmentStationOffsetInput): {
  alignment: Alignment;
  observations: AlignmentObservation[];
  inputFormat: "json" | "csv" | "geojson" | "landxml" | "dxf";
  parsedAlignmentPointCount: number | null;
  parsedObservationCount: number | null;
} {
  if (input.alignment && input.observations?.length) {
    return {
      alignment: input.alignment,
      observations: input.observations,
      inputFormat: "json",
      parsedAlignmentPointCount: null,
      parsedObservationCount: null,
    };
  }
  if (input.geojsonText) {
    const parsed: ParsedAlignmentInput = {
      ...parseAlignmentStationOffsetGeoJson(input.geojsonText),
      inputFormat: "geojson",
    };
    return {
      alignment: parsed.alignment,
      observations: parsed.observations,
      inputFormat: parsed.inputFormat,
      parsedAlignmentPointCount: parsed.alignmentPointCount,
      parsedObservationCount: parsed.observationCount,
    };
  }
  if (input.landxmlText) {
    const parsed: ParsedAlignmentInput = {
      ...parseAlignmentStationOffsetLandXml(input.landxmlText),
      inputFormat: "landxml",
    };
    return {
      alignment: parsed.alignment,
      observations: parsed.observations,
      inputFormat: parsed.inputFormat,
      parsedAlignmentPointCount: parsed.alignmentPointCount,
      parsedObservationCount: parsed.observationCount,
    };
  }
  if (input.dxfText) {
    const parsed: ParsedAlignmentInput = {
      ...parseAlignmentStationOffsetDxf(input.dxfText),
      inputFormat: "dxf",
    };
    return {
      alignment: parsed.alignment,
      observations: parsed.observations,
      inputFormat: parsed.inputFormat,
      parsedAlignmentPointCount: parsed.alignmentPointCount,
      parsedObservationCount: parsed.observationCount,
    };
  }
  if (input.csvText) {
    const parsed = parseAlignmentStationOffsetCsv(input.csvText, input.csvDelimiter);
    return {
      alignment: parsed.alignment,
      observations: parsed.observations,
      inputFormat: "csv",
      parsedAlignmentPointCount: parsed.alignmentPointCount,
      parsedObservationCount: parsed.observationCount,
    };
  }
  throw new Error("alignment_station_offset 需要提供 alignment+observations、csvText、geojsonText、landxmlText 或 dxfText");
}

function runAlignmentStationOffset(
  alignment: Alignment,
  observations: AlignmentObservation[],
  metadata?: {
    inputFormat?: "json" | "csv" | "geojson" | "landxml" | "dxf";
    parsedAlignmentPointCount?: number | null;
    parsedObservationCount?: number | null;
  },
): Record<string, unknown> {
  const elements = buildStationedAlignment(alignment);
  if (elements.length === 0) throw new Error("alignment_station_offset 需要提供 alignment.elements 或 alignment.points");
  const details = observations.map((observation) => {
    const projected = projectOnAlignment(elements, observation);
    if (!projected) {
      return {
        point_id: observation.id,
        is_projected: false,
        is_passed: false,
      };
    }
    const lateralDeviationMm = (projected.offsetM - observation.designOffsetM) * 1000;
    const isPassed = Math.abs(lateralDeviationMm) <= observation.toleranceMm;
    return {
      point_id: observation.id,
      is_projected: true,
      element_id: projected.elementId,
      element_type: projected.elementType,
      station_m: round(projected.stationM, 4),
      station_name: formatStationName(projected.stationM),
      signed_offset_m: round(projected.offsetM, 4),
      side: projected.offsetM >= 0 ? "left" : "right",
      design_offset_m: round(observation.designOffsetM, 4),
      lateral_deviation_mm: round(lateralDeviationMm, 3),
      nearest_distance_m: round(projected.distanceM, 4),
      tangent_azimuth_degrees: round(projected.tangentAzimuthDegrees, 4),
      tolerance_mm: observation.toleranceMm,
      is_passed: isPassed,
    };
  });
  const projectedDetails = details.filter((detail) => detail.is_projected);
  const lateralDeviations = projectedDetails.flatMap((detail) =>
    typeof detail.lateral_deviation_mm === "number" ? [detail.lateral_deviation_mm] : [],
  );
  const failedPoints = details.filter((detail) => !detail.is_passed).map((detail) => detail.point_id);
  const leftCount = projectedDetails.filter((detail) => detail.side === "left").length;
  const rightCount = projectedDetails.filter((detail) => detail.side === "right").length;
  const maxAbsDeviation = Math.max(0, ...lateralDeviations.map((deviation) => Math.abs(deviation)));
  const rmsLateralDeviation =
    lateralDeviations.length === 0
      ? 0
      : Math.sqrt(lateralDeviations.reduce((sum, deviation) => sum + deviation ** 2, 0) / lateralDeviations.length);
  let worstPoint: Record<string, unknown> | null = null;
  let worstAbsDeviation = -1;
  for (const detail of projectedDetails) {
    if (typeof detail.lateral_deviation_mm !== "number") continue;
    const absDeviation = Math.abs(detail.lateral_deviation_mm);
    if (absDeviation > worstAbsDeviation) {
      worstAbsDeviation = absDeviation;
      worstPoint = {
        point_id: detail.point_id,
        station_name: detail.station_name,
        lateral_deviation_mm: detail.lateral_deviation_mm,
        is_passed: detail.is_passed,
      };
    }
  }
  const passRatePct = observations.length === 0 ? 0 : ((observations.length - failedPoints.length) / observations.length) * 100;
  const exportRows = details.map((detail) => {
    if (!detail.is_projected) {
      return {
        row_type: "alignment_station_offset_point",
        point_id: detail.point_id,
        is_projected: false,
        is_passed: false,
      };
    }
    return {
      row_type: "alignment_station_offset_point",
      point_id: detail.point_id,
      is_projected: true,
      element_id: detail.element_id,
      element_type: detail.element_type,
      station_m: detail.station_m,
      station_name: detail.station_name,
      signed_offset_m: detail.signed_offset_m,
      side: detail.side,
      design_offset_m: detail.design_offset_m,
      lateral_deviation_mm: detail.lateral_deviation_mm,
      nearest_distance_m: detail.nearest_distance_m,
      tangent_azimuth_degrees: detail.tangent_azimuth_degrees,
      tolerance_mm: detail.tolerance_mm,
      is_passed: detail.is_passed,
    };
  });
  return {
    mode: "alignment_station_offset",
    input_format: metadata?.inputFormat ?? "json",
    parsed_alignment_point_count: metadata?.parsedAlignmentPointCount ?? null,
    parsed_observation_count: metadata?.parsedObservationCount ?? null,
    element_count: elements.length,
    point_count: observations.length,
    projected_count: projectedDetails.length,
    left_count: leftCount,
    right_count: rightCount,
    failed_points: failedPoints,
    failed_count: failedPoints.length,
    max_abs_lateral_deviation_mm: round(maxAbsDeviation, 3),
    rms_lateral_deviation_mm: round(rmsLateralDeviation, 3),
    alignment_quality_summary: {
      point_count: observations.length,
      projected_count: projectedDetails.length,
      failed_count: failedPoints.length,
      pass_rate_pct: round(passRatePct, 3),
      left_count: leftCount,
      right_count: rightCount,
      max_abs_lateral_deviation_mm: round(maxAbsDeviation, 3),
      rms_lateral_deviation_mm: round(rmsLateralDeviation, 3),
      worst_point: worstPoint,
    },
    export_rows: exportRows,
    details,
  };
}

function transformKnownHelmert2dPoint(
  point: CoordTransformPointInput,
  parameters: { dx: number; dy: number; rotationArcsec: number; scalePpm: number },
) {
  const theta = deg2rad(parameters.rotationArcsec / 3600);
  const scale = 1 + parameters.scalePpm / 1_000_000;
  const targetX = parameters.dx + scale * (point.x * Math.cos(theta) - point.y * Math.sin(theta));
  const targetY = parameters.dy + scale * (point.x * Math.sin(theta) + point.y * Math.cos(theta));
  return {
    ...(point.id ? { id: point.id } : {}),
    source_x: point.x,
    source_y: point.y,
    target_x: round(targetX, 6),
    target_y: round(targetY, 6),
  };
}

function coordTransformExportRow(point: {
  id?: string;
  source_x: number;
  source_y: number;
  target_x: number;
  target_y: number;
}) {
  return {
    row_type: "coord_transformed_point",
    point_id: point.id ?? null,
    source_x_m: point.source_x,
    source_y_m: point.source_y,
    target_x_m: point.target_x,
    target_y_m: point.target_y,
    delta_x_m: round(point.target_x - point.source_x, 6),
    delta_y_m: round(point.target_y - point.source_y, 6),
  };
}

function runKnownHelmert2dBatch(
  points: CoordTransformPointInput[],
  parameters: { dx: number; dy: number; rotationArcsec: number; scalePpm: number },
  metadata?: { inputFormat?: "json" | "csv"; parsedControlPointCount?: number | null; parsedTransformPointCount?: number | null },
): Record<string, unknown> {
  const transformedPoints = points.map((point) => transformKnownHelmert2dPoint(point, parameters));
  const targetXs = transformedPoints.map((point) => point.target_x);
  const targetYs = transformedPoints.map((point) => point.target_y);
  return {
    mode: "helmert2d_known_batch",
    input_format: metadata?.inputFormat ?? "json",
    parsed_control_point_count: metadata?.parsedControlPointCount ?? null,
    parsed_transform_point_count: metadata?.parsedTransformPointCount ?? null,
    transformed_point_count: transformedPoints.length,
    dx: round(parameters.dx, 6),
    dy: round(parameters.dy, 6),
    rotation_degrees: round(parameters.rotationArcsec / 3600, 10),
    rotation_arcsec: round(parameters.rotationArcsec, 6),
    scale_factor: round(1 + parameters.scalePpm / 1_000_000, 10),
    scale_ppm: round(parameters.scalePpm, 6),
    result_bounds:
      transformedPoints.length > 0
        ? {
            min_target_x: Math.min(...targetXs),
            max_target_x: Math.max(...targetXs),
            min_target_y: Math.min(...targetYs),
            max_target_y: Math.max(...targetYs),
          }
        : null,
    transformed_points: transformedPoints,
    transformation_summary: {
      method: "known_helmert2d_parameters",
      transformed_point_count: transformedPoints.length,
      quality_status: "computed",
    },
    export_rows: transformedPoints.map(coordTransformExportRow),
  };
}

function estimateHelmert2d(
  controlPoints: CoordControlPointInput[],
  points: CoordTransformPointInput[],
  metadata?: {
    inputFormat?: "json" | "csv";
    parsedControlPointCount?: number | null;
    parsedTransformPointCount?: number | null;
  },
): Record<string, unknown> {
  if (controlPoints.length < 2) throw new Error("二维 Helmert 参数反算至少需要 2 个公共点");
  const sourceMeanX = controlPoints.reduce((sum, point) => sum + point.sourceX, 0) / controlPoints.length;
  const sourceMeanY = controlPoints.reduce((sum, point) => sum + point.sourceY, 0) / controlPoints.length;
  const targetMeanX = controlPoints.reduce((sum, point) => sum + point.targetX, 0) / controlPoints.length;
  const targetMeanY = controlPoints.reduce((sum, point) => sum + point.targetY, 0) / controlPoints.length;
  let numeratorA = 0;
  let numeratorB = 0;
  let denominator = 0;
  for (const point of controlPoints) {
    const sx = point.sourceX - sourceMeanX;
    const sy = point.sourceY - sourceMeanY;
    const tx = point.targetX - targetMeanX;
    const ty = point.targetY - targetMeanY;
    numeratorA += sx * tx + sy * ty;
    numeratorB += sx * ty - sy * tx;
    denominator += sx ** 2 + sy ** 2;
  }
  if (denominator <= 0) throw new Error("公共点源坐标不能全部重合");
  const a = numeratorA / denominator;
  const b = numeratorB / denominator;
  const dx = targetMeanX - (a * sourceMeanX - b * sourceMeanY);
  const dy = targetMeanY - (b * sourceMeanX + a * sourceMeanY);
  const transform = (x: number, y: number) => ({
    x: dx + a * x - b * y,
    y: dy + b * x + a * y,
  });
  const residuals = controlPoints.map((point) => {
    const fitted = transform(point.sourceX, point.sourceY);
    const vxMm = round((fitted.x - point.targetX) * 1000, 3);
    const vyMm = round((fitted.y - point.targetY) * 1000, 3);
    return {
      id: point.id,
      vx_mm: vxMm,
      vy_mm: vyMm,
      planar_residual_mm: round(Math.hypot(vxMm, vyMm), 3),
    };
  });
  const rmseMm = Math.sqrt(
    residuals.reduce((sum, residual) => sum + residual.vx_mm ** 2 + residual.vy_mm ** 2, 0) /
      Math.max(controlPoints.length * 2 - 4, 1),
  );
  const scale = Math.hypot(a, b);
  const rotationDegrees = rad2deg(Math.atan2(b, a));
  const transformedPoints = points.map((point) => {
    const target = transform(point.x, point.y);
    const targetX = round(target.x, 6);
    const targetY = round(target.y, 6);
    return {
      ...(point.id ? { id: point.id } : {}),
      source_x: point.x,
      source_y: point.y,
      target_x: targetX,
      target_y: targetY,
    };
  });
  const targetXs = transformedPoints.map((point) => point.target_x);
  const targetYs = transformedPoints.map((point) => point.target_y);
  const maxControlResidualMm = residuals.reduce((max, item) => Math.max(max, item.planar_residual_mm), 0);
  const resultBounds =
    transformedPoints.length > 0
      ? {
          min_target_x: Math.min(...targetXs),
          max_target_x: Math.max(...targetXs),
          min_target_y: Math.min(...targetYs),
          max_target_y: Math.max(...targetYs),
        }
      : null;
  return {
    mode: "helmert2d_estimated",
    input_format: metadata?.inputFormat ?? "json",
    parsed_control_point_count: metadata?.parsedControlPointCount ?? null,
    parsed_transform_point_count: metadata?.parsedTransformPointCount ?? null,
    control_point_count: controlPoints.length,
    dx: round(dx, 6),
    dy: round(dy, 6),
    rotation_degrees: round(rotationDegrees, 10),
    rotation_arcsec: round(rotationDegrees * 3600, 6),
    scale_factor: round(scale, 10),
    scale_ppm: round((scale - 1) * 1_000_000, 6),
    rmse_mm: round(rmseMm, 3),
    transformation_summary: {
      control_point_count: controlPoints.length,
      transformed_point_count: transformedPoints.length,
      rmse_mm: round(rmseMm, 3),
      max_control_residual_mm: round(maxControlResidualMm, 3),
      quality_status: round(maxControlResidualMm, 3) === 0 ? "fit_exact" : "review_residuals",
    },
    result_bounds: resultBounds,
    residuals,
    transformed_points: transformedPoints,
    export_rows: transformedPoints.map(coordTransformExportRow),
  };
}

function utcDateTime(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return Number.NaN;
  }
  const time = Date.UTC(year, month - 1, day, hour, minute, second);
  const parsed = new Date(time);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return Number.NaN;
  }
  return time;
}

function normalizeDateTimeText(value: string): string {
  return value
    .trim()
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10))
    .replace(/[－﹣–—]/g, "-")
    .replace(/[／]/g, "/")
    .replace(/[．。]/g, ".")
    .replace(/[：]/g, ":")
    .replace(/\s+/g, " ");
}

function parseEngineeringDateTime(value: string): number {
  const normalized = normalizeDateTimeText(value);
  if (!normalized) return Number.NaN;
  const excelSerial = normalized.match(/^\d{4,6}(?:\.\d+)?$/);
  if (excelSerial) {
    const serial = Number(normalized);
    if (Number.isFinite(serial) && serial >= 20000 && serial <= 80000) {
      return Date.UTC(1899, 11, 30) + serial * 86_400_000;
    }
  }
  const standard = normalized.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2})[:：](\d{1,2})(?::(\d{1,2}))?)?$/,
  );
  if (standard) {
    return utcDateTime(
      Number(standard[1]),
      Number(standard[2]),
      Number(standard[3]),
      Number(standard[4] ?? 0),
      Number(standard[5] ?? 0),
      Number(standard[6] ?? 0),
    );
  }
  const chinese = normalized.match(
    /^(\d{4})年(\d{1,2})月(\d{1,2})日?(?:\s*(\d{1,2})[:：](\d{1,2})(?::(\d{1,2}))?)?$/,
  );
  if (chinese) {
    return utcDateTime(
      Number(chinese[1]),
      Number(chinese[2]),
      Number(chinese[3]),
      Number(chinese[4] ?? 0),
      Number(chinese[5] ?? 0),
      Number(chinese[6] ?? 0),
    );
  }
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function daysBetween(from: string, to: string): number {
  const start = parseEngineeringDateTime(from);
  const end = parseEngineeringDateTime(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return (end - start) / 86_400_000;
}

function sortByEngineeringDate<T extends { date: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => parseEngineeringDateTime(a.date) - parseEngineeringDateTime(b.date));
}

function runWaterLevelObservationSeries(
  observations: WaterLevelObservationInput[],
  alertThresholdMm?: number,
  rateThresholdMmPerDay?: number,
  metadata?: {
    inputFormat?: "json" | "csv";
    parsedRowCount?: number | null;
    parsedObservationCount?: number | null;
    tableFormat?: "long" | "wide" | null;
  },
): Record<string, unknown> {
  const groups = new Map<string, WaterLevelObservationInput[]>();
  for (const observation of observations) {
    groups.set(observation.wellId, [...(groups.get(observation.wellId) ?? []), observation]);
  }
  const periodDetails: Array<Record<string, unknown>> = [];
  const wellSummaries = [...groups.entries()].map(([wellId, rows]) => {
    const sorted = sortByEngineeringDate(rows);
    const baseline = sorted[0]!;
    const latest = sorted[sorted.length - 1]!;
    let currentChangeMm = 0;
    let currentRateMmPerDay = 0;
    sorted.forEach((row, index) => {
      const previous = sorted[index - 1];
      const stageChangeMm = previous ? (row.elevation - previous.elevation) * 1000 : 0;
      const intervalDays = previous ? daysBetween(previous.date, row.date) : 0;
      const stageRateMmPerDay = intervalDays > 0 ? stageChangeMm / intervalDays : 0;
      if (index === sorted.length - 1) {
        currentChangeMm = stageChangeMm;
        currentRateMmPerDay = stageRateMmPerDay;
      }
      periodDetails.push({
        well_id: wellId,
        date: row.date,
        elevation_m: row.elevation,
        change_mm: round((row.elevation - baseline.elevation) * 1000, 3),
        stage_change_mm: round(stageChangeMm, 3),
        stage_rate_mm_per_day: round(stageRateMmPerDay, 3),
      });
    });
    const changeMm = (latest.elevation - baseline.elevation) * 1000;
    const isAlert =
      (alertThresholdMm !== undefined && Math.abs(changeMm) >= alertThresholdMm) ||
      (rateThresholdMmPerDay !== undefined && Math.abs(currentRateMmPerDay) >= rateThresholdMmPerDay);
    return {
      well_id: wellId,
      observation_count: sorted.length,
      baseline_date: baseline.date,
      latest_date: latest.date,
      baseline_elevation_m: baseline.elevation,
      latest_elevation_m: latest.elevation,
      change_mm: round(changeMm, 3),
      current_change_mm: round(currentChangeMm, 3),
      current_rate_mm_per_day: round(currentRateMmPerDay, 3),
      is_alert: isAlert,
    };
  });
  const alertWellCount = wellSummaries.filter((well) => well.is_alert).length;
  const worstWell = wellSummaries.reduce(
    (max, well) => (Math.abs(well.change_mm) > Math.abs(max.change_mm) ? well : max),
    wellSummaries[0]!,
  );
  const waterLevelSummary = {
    well_count: wellSummaries.length,
    observation_count: observations.length,
    alert_well_count: alertWellCount,
    max_abs_change_mm: round(Math.max(...wellSummaries.map((well) => Math.abs(well.change_mm))), 3),
    max_abs_rate_mm_per_day: round(
      Math.max(...wellSummaries.map((well) => Math.abs(well.current_rate_mm_per_day))),
      3,
    ),
    alert_threshold_mm: alertThresholdMm ?? null,
    rate_threshold_mm_per_day: rateThresholdMmPerDay ?? null,
    quality_status: alertWellCount > 0 ? "alert" : "pass",
    worst_well: {
      well_id: worstWell.well_id,
      change_mm: worstWell.change_mm,
      current_rate_mm_per_day: worstWell.current_rate_mm_per_day,
      is_alert: worstWell.is_alert,
    },
  };
  const exportRows = [
    ...wellSummaries.map((well) => ({
      row_type: "water_level_well_summary",
      well_id: well.well_id,
      observation_count: well.observation_count,
      baseline_date: well.baseline_date,
      latest_date: well.latest_date,
      baseline_elevation_m: well.baseline_elevation_m,
      latest_elevation_m: well.latest_elevation_m,
      change_mm: well.change_mm,
      current_change_mm: well.current_change_mm,
      current_rate_mm_per_day: well.current_rate_mm_per_day,
      alert_threshold_mm: alertThresholdMm ?? null,
      rate_threshold_mm_per_day: rateThresholdMmPerDay ?? null,
      status: well.is_alert ? "alert" : "pass",
    })),
    ...periodDetails.map((row) => ({
      row_type: "water_level_period_observation",
      ...row,
    })),
  ];
  return {
    mode: "observation_series",
    input_format: metadata?.inputFormat ?? "json",
    table_format: metadata?.tableFormat ?? null,
    parsed_row_count: metadata?.parsedRowCount ?? null,
    parsed_observation_count: metadata?.parsedObservationCount ?? observations.length,
    well_count: waterLevelSummary.well_count,
    observation_count: observations.length,
    max_abs_change_mm: waterLevelSummary.max_abs_change_mm,
    max_abs_rate_mm_per_day: waterLevelSummary.max_abs_rate_mm_per_day,
    alert_threshold_mm: alertThresholdMm ?? null,
    rate_threshold_mm_per_day: rateThresholdMmPerDay ?? null,
    alert_wells: wellSummaries.filter((well) => well.is_alert).map((well) => well.well_id),
    water_level_summary: waterLevelSummary,
    well_summaries: wellSummaries,
    period_details: periodDetails,
    export_rows: exportRows,
  };
}

function runInclinometerObservationSeries(
  observations: InclinometerObservationInput[],
  alertThresholdMm?: number,
  rateThresholdMmPerDay?: number,
  metadata?: {
    inputFormat?: "json" | "csv";
    parsedRowCount?: number | null;
    parsedObservationCount?: number | null;
    tableFormat?: "long" | "wide" | null;
  },
): Record<string, unknown> {
  const groups = new Map<string, InclinometerObservationInput[]>();
  for (const observation of observations) {
    const key = `${observation.boreholeId}::${observation.depth}`;
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }
  const periodDetails: Array<Record<string, unknown>> = [];
  const depthSummaries = [...groups.values()]
    .map((rows) => {
      const sorted = sortByEngineeringDate(rows);
      const baseline = sorted[0]!;
      const latest = sorted[sorted.length - 1]!;
      let currentStageResultantMm = 0;
      let currentRateMmPerDay = 0;
      sorted.forEach((row, index) => {
        const previous = sorted[index - 1];
        const dxFromBaseline = row.xMm - baseline.xMm;
        const dyFromBaseline = row.yMm - baseline.yMm;
        const cumulativeResultant = Math.hypot(dxFromBaseline, dyFromBaseline);
        const stageDx = previous ? row.xMm - previous.xMm : 0;
        const stageDy = previous ? row.yMm - previous.yMm : 0;
        const stageResultant = Math.hypot(stageDx, stageDy);
        const intervalDays = previous ? daysBetween(previous.date, row.date) : 0;
        const stageRate = intervalDays > 0 ? stageResultant / intervalDays : 0;
        if (index === sorted.length - 1) {
          currentStageResultantMm = stageResultant;
          currentRateMmPerDay = stageRate;
        }
        periodDetails.push({
          borehole_id: row.boreholeId,
          depth_m: row.depth,
          date: row.date,
          x_mm: row.xMm,
          y_mm: row.yMm,
          cumulative_resultant_mm: round(cumulativeResultant, 3),
          stage_resultant_mm: round(stageResultant, 3),
          stage_rate_mm_per_day: round(stageRate, 3),
        });
      });
      const latestDx = latest.xMm - baseline.xMm;
      const latestDy = latest.yMm - baseline.yMm;
      const cumulativeResultantMm = Math.hypot(latestDx, latestDy);
      const isAlert =
        (alertThresholdMm !== undefined && cumulativeResultantMm >= alertThresholdMm) ||
        (rateThresholdMmPerDay !== undefined && Math.abs(currentRateMmPerDay) >= rateThresholdMmPerDay);
      return {
        borehole_id: latest.boreholeId,
        depth_m: latest.depth,
        observation_count: sorted.length,
        baseline_date: baseline.date,
        latest_date: latest.date,
        cumulative_resultant_mm: round(cumulativeResultantMm, 3),
        current_stage_resultant_mm: round(currentStageResultantMm, 3),
        current_rate_mm_per_day: round(currentRateMmPerDay, 3),
        is_alert: isAlert,
      };
    })
    .sort((a, b) => a.borehole_id.localeCompare(b.borehole_id) || b.cumulative_resultant_mm - a.cumulative_resultant_mm);
  const maxSummary = depthSummaries.reduce(
    (max, row) => (row.cumulative_resultant_mm > max.cumulative_resultant_mm ? row : max),
    depthSummaries[0]!,
  );
  const alertDepthCount = depthSummaries.filter((row) => row.is_alert).length;
  const inclinometerSummary = {
    borehole_count: new Set(observations.map((observation) => observation.boreholeId)).size,
    depth_count: depthSummaries.length,
    reading_count: observations.length,
    alert_depth_count: alertDepthCount,
    max_displacement_mm: maxSummary.cumulative_resultant_mm,
    max_depth_m: maxSummary.depth_m,
    max_rate_mm_per_day: round(Math.max(...depthSummaries.map((row) => Math.abs(row.current_rate_mm_per_day))), 3),
    alert_threshold_mm: alertThresholdMm ?? null,
    rate_threshold_mm_per_day: rateThresholdMmPerDay ?? null,
    quality_status: alertDepthCount > 0 ? "alert" : "pass",
    worst_depth: {
      borehole_id: maxSummary.borehole_id,
      depth_m: maxSummary.depth_m,
      cumulative_resultant_mm: maxSummary.cumulative_resultant_mm,
      current_rate_mm_per_day: maxSummary.current_rate_mm_per_day,
      is_alert: maxSummary.is_alert,
    },
  };
  const exportRows = [
    ...depthSummaries.map((row) => ({
      row_type: "inclinometer_depth_summary",
      borehole_id: row.borehole_id,
      depth_m: row.depth_m,
      observation_count: row.observation_count,
      baseline_date: row.baseline_date,
      latest_date: row.latest_date,
      cumulative_resultant_mm: row.cumulative_resultant_mm,
      current_stage_resultant_mm: row.current_stage_resultant_mm,
      current_rate_mm_per_day: row.current_rate_mm_per_day,
      alert_threshold_mm: alertThresholdMm ?? null,
      rate_threshold_mm_per_day: rateThresholdMmPerDay ?? null,
      status: row.is_alert ? "alert" : "pass",
    })),
    ...periodDetails.map((row) => ({
      row_type: "inclinometer_period_observation",
      ...row,
    })),
  ];
  return {
    mode: "observation_series",
    input_format: metadata?.inputFormat ?? "json",
    table_format: metadata?.tableFormat ?? null,
    parsed_row_count: metadata?.parsedRowCount ?? null,
    parsed_observation_count: metadata?.parsedObservationCount ?? observations.length,
    borehole_count: inclinometerSummary.borehole_count,
    reading_count: observations.length,
    max_displacement_mm: maxSummary.cumulative_resultant_mm,
    max_depth_m: maxSummary.depth_m,
    max_rate_mm_per_day: inclinometerSummary.max_rate_mm_per_day,
    alert_threshold_mm: alertThresholdMm ?? null,
    rate_threshold_mm_per_day: rateThresholdMmPerDay ?? null,
    alert_depths: depthSummaries.filter((row) => row.is_alert).map((row) => `${row.borehole_id}@${row.depth_m}`),
    inclinometer_summary: inclinometerSummary,
    depth_summaries: depthSummaries,
    period_details: periodDetails,
    export_rows: exportRows,
  };
}

function runAxialForceObservationSeries(
  observations: AxialForceObservationInput[],
  alertThresholdKn?: number,
  rateThresholdKnPerDay?: number,
  metadata?: {
    inputFormat?: "json" | "csv";
    parsedRowCount?: number | null;
    parsedObservationCount?: number | null;
    tableFormat?: "long" | "wide" | null;
  },
): Record<string, unknown> {
  const groups = new Map<string, AxialForceObservationInput[]>();
  for (const observation of observations) {
    groups.set(observation.sensorId, [...(groups.get(observation.sensorId) ?? []), observation]);
  }
  const periodDetails: Array<Record<string, unknown>> = [];
  const sensorSummaries = [...groups.entries()]
    .map(([sensorId, rows]) => {
      const sorted = sortByEngineeringDate(rows);
      const baseline = sorted[0]!;
      const latest = sorted[sorted.length - 1]!;
      let currentForceChangeKn = 0;
      let currentRateKnPerDay = 0;
      sorted.forEach((row, index) => {
        const previous = sorted[index - 1];
        const stageForceChangeKn = previous ? row.forceKn - previous.forceKn : 0;
        const intervalDays = previous ? daysBetween(previous.date, row.date) : 0;
        const stageRateKnPerDay = intervalDays > 0 ? stageForceChangeKn / intervalDays : 0;
        if (index === sorted.length - 1) {
          currentForceChangeKn = stageForceChangeKn;
          currentRateKnPerDay = stageRateKnPerDay;
        }
        periodDetails.push({
          sensor_id: sensorId,
          date: row.date,
          force_kn: row.forceKn,
          cumulative_change_kn: round(row.forceKn - baseline.forceKn, 3),
          stage_force_change_kn: round(stageForceChangeKn, 3),
          stage_rate_kn_per_day: round(stageRateKnPerDay, 3),
        });
      });
      const isAlert =
        (alertThresholdKn !== undefined && Math.abs(latest.forceKn) >= alertThresholdKn) ||
        (rateThresholdKnPerDay !== undefined && Math.abs(currentRateKnPerDay) >= rateThresholdKnPerDay);
      return {
        sensor_id: sensorId,
        observation_count: sorted.length,
        baseline_date: baseline.date,
        latest_date: latest.date,
        baseline_force_kn: baseline.forceKn,
        force_kn: latest.forceKn,
        current_force_change_kn: round(currentForceChangeKn, 3),
        current_rate_kn_per_day: round(currentRateKnPerDay, 3),
        is_alert: isAlert,
      };
    })
    .sort((a, b) => Math.abs(b.force_kn) - Math.abs(a.force_kn));
  const alertSensorCount = sensorSummaries.filter((sensor) => sensor.is_alert).length;
  const worstSensor = sensorSummaries.reduce(
    (max, sensor) => (Math.abs(sensor.force_kn) > Math.abs(max.force_kn) ? sensor : max),
    sensorSummaries[0]!,
  );
  const axialForceSummary = {
    sensor_count: sensorSummaries.length,
    observation_count: observations.length,
    alert_sensor_count: alertSensorCount,
    max_abs_force_kn: round(Math.max(...sensorSummaries.map((sensor) => Math.abs(sensor.force_kn))), 3),
    max_abs_rate_kn_per_day: round(
      Math.max(...sensorSummaries.map((sensor) => Math.abs(sensor.current_rate_kn_per_day))),
      3,
    ),
    alert_threshold_kn: alertThresholdKn ?? null,
    rate_threshold_kn_per_day: rateThresholdKnPerDay ?? null,
    quality_status: alertSensorCount > 0 ? "alert" : "pass",
    worst_sensor: {
      sensor_id: worstSensor.sensor_id,
      force_kn: worstSensor.force_kn,
      current_rate_kn_per_day: worstSensor.current_rate_kn_per_day,
      is_alert: worstSensor.is_alert,
    },
  };
  const exportRows = [
    ...sensorSummaries.map((sensor) => ({
      row_type: "axial_force_sensor_summary",
      sensor_id: sensor.sensor_id,
      observation_count: sensor.observation_count,
      baseline_date: sensor.baseline_date,
      latest_date: sensor.latest_date,
      baseline_force_kn: sensor.baseline_force_kn,
      force_kn: sensor.force_kn,
      current_force_change_kn: sensor.current_force_change_kn,
      current_rate_kn_per_day: sensor.current_rate_kn_per_day,
      alert_threshold_kn: alertThresholdKn ?? null,
      rate_threshold_kn_per_day: rateThresholdKnPerDay ?? null,
      status: sensor.is_alert ? "alert" : "pass",
    })),
    ...periodDetails.map((row) => ({
      row_type: "axial_force_period_observation",
      ...row,
    })),
  ];
  return {
    mode: "observation_series",
    input_format: metadata?.inputFormat ?? "json",
    table_format: metadata?.tableFormat ?? null,
    parsed_row_count: metadata?.parsedRowCount ?? null,
    parsed_observation_count: metadata?.parsedObservationCount ?? observations.length,
    sensor_count: axialForceSummary.sensor_count,
    observation_count: observations.length,
    max_abs_force_kn: axialForceSummary.max_abs_force_kn,
    max_abs_rate_kn_per_day: axialForceSummary.max_abs_rate_kn_per_day,
    alert_threshold_kn: alertThresholdKn ?? null,
    rate_threshold_kn_per_day: rateThresholdKnPerDay ?? null,
    alert_sensors: sensorSummaries.filter((sensor) => sensor.is_alert).map((sensor) => sensor.sensor_id),
    axial_force_summary: axialForceSummary,
    sensor_summaries: sensorSummaries,
    period_details: periodDetails,
    export_rows: exportRows,
  };
}

type DistanceSegmentInput = {
  id: string;
  from: { x: number; y: number; z?: number };
  to: { x: number; y: number; z?: number };
  observedHorizontalDistanceM?: number;
  toleranceMm?: number;
};

type DistanceObservationInput = {
  id: string;
  slopeDistanceM?: number;
  observedHorizontalDistanceM?: number;
  zenithAngleDegrees?: number;
  verticalAngleDegrees?: number;
  observedHeightDiffM?: number;
  toleranceMm?: number;
  heightToleranceMm?: number;
};

const DISTANCE_CALCULATOR_CSV_ALIASES = new Map<
  string,
  "id" | "fromX" | "fromY" | "fromZ" | "toX" | "toY" | "toZ" | "observedHorizontalDistanceM" | "toleranceMm"
>(
  [
    ["id", "id"],
    ["segmentid", "id"],
    ["lineid", "id"],
    ["边号", "id"],
    ["边名", "id"],
    ["编号", "id"],
    ["fromx", "fromX"],
    ["startx", "fromX"],
    ["起点x", "fromX"],
    ["起点东坐标", "fromX"],
    ["起点坐标x", "fromX"],
    ["fromy", "fromY"],
    ["starty", "fromY"],
    ["起点y", "fromY"],
    ["起点北坐标", "fromY"],
    ["起点坐标y", "fromY"],
    ["fromz", "fromZ"],
    ["startz", "fromZ"],
    ["起点z", "fromZ"],
    ["起点高程", "fromZ"],
    ["起点标高", "fromZ"],
    ["tox", "toX"],
    ["endx", "toX"],
    ["终点x", "toX"],
    ["终点东坐标", "toX"],
    ["终点坐标x", "toX"],
    ["toy", "toY"],
    ["endy", "toY"],
    ["终点y", "toY"],
    ["终点北坐标", "toY"],
    ["终点坐标y", "toY"],
    ["toz", "toZ"],
    ["endz", "toZ"],
    ["终点z", "toZ"],
    ["终点高程", "toZ"],
    ["终点标高", "toZ"],
    ["observedhorizontaldistance", "observedHorizontalDistanceM"],
    ["observeddistance", "observedHorizontalDistanceM"],
    ["measureddistance", "observedHorizontalDistanceM"],
    ["实测平距", "observedHorizontalDistanceM"],
    ["实测平距m", "observedHorizontalDistanceM"],
    ["实测距离", "observedHorizontalDistanceM"],
    ["观测距离", "observedHorizontalDistanceM"],
    ["距离限差", "toleranceMm"],
    ["距离限差mm", "toleranceMm"],
    ["限差", "toleranceMm"],
    ["限差mm", "toleranceMm"],
  ].map(([alias, key]) => [
    normalizeCsvHeader(alias),
    key as "id" | "fromX" | "fromY" | "fromZ" | "toX" | "toY" | "toZ" | "observedHorizontalDistanceM" | "toleranceMm",
  ]),
);

const DISTANCE_OBSERVATION_CSV_ALIASES = new Map<
  string,
  | "id"
  | "slopeDistanceM"
  | "observedHorizontalDistanceM"
  | "zenithAngleDegrees"
  | "verticalAngleDegrees"
  | "observedHeightDiffM"
  | "toleranceMm"
  | "heightToleranceMm"
>(
  [
    ["id", "id"],
    ["observationid", "id"],
    ["pointid", "id"],
    ["观测编号", "id"],
    ["观测号", "id"],
    ["点号", "id"],
    ["编号", "id"],
    ["slopedistance", "slopeDistanceM"],
    ["slopedistancem", "slopeDistanceM"],
    ["slope", "slopeDistanceM"],
    ["sd", "slopeDistanceM"],
    ["斜距", "slopeDistanceM"],
    ["斜距m", "slopeDistanceM"],
    ["horizontaldistance", "observedHorizontalDistanceM"],
    ["horizontaldistancem", "observedHorizontalDistanceM"],
    ["horizdist", "observedHorizontalDistanceM"],
    ["hd", "observedHorizontalDistanceM"],
    ["水平距", "observedHorizontalDistanceM"],
    ["水平距m", "observedHorizontalDistanceM"],
    ["平距", "observedHorizontalDistanceM"],
    ["平距m", "observedHorizontalDistanceM"],
    ["zenithangle", "zenithAngleDegrees"],
    ["zenithangledegrees", "zenithAngleDegrees"],
    ["verticalangle", "zenithAngleDegrees"],
    ["vangle", "zenithAngleDegrees"],
    ["va", "zenithAngleDegrees"],
    ["天顶角", "zenithAngleDegrees"],
    ["竖直角", "zenithAngleDegrees"],
    ["竖直角°", "zenithAngleDegrees"],
    ["elevationangle", "verticalAngleDegrees"],
    ["elevationangledegrees", "verticalAngleDegrees"],
    ["altitudeangle", "verticalAngleDegrees"],
    ["高度角", "verticalAngleDegrees"],
    ["仰角", "verticalAngleDegrees"],
    ["heightdiff", "observedHeightDiffM"],
    ["heightdifferencem", "observedHeightDiffM"],
    ["dh", "observedHeightDiffM"],
    ["高差", "observedHeightDiffM"],
    ["高差m", "observedHeightDiffM"],
    ["tolerance", "toleranceMm"],
    ["tolerancemm", "toleranceMm"],
    ["水平距限差", "toleranceMm"],
    ["水平距限差mm", "toleranceMm"],
    ["距离限差", "toleranceMm"],
    ["距离限差mm", "toleranceMm"],
    ["heighttolerance", "heightToleranceMm"],
    ["heighttolerancemm", "heightToleranceMm"],
    ["高差限差", "heightToleranceMm"],
    ["高差限差mm", "heightToleranceMm"],
  ].map(([alias, key]) => [
    normalizeCsvHeader(alias),
    key as
      | "id"
      | "slopeDistanceM"
      | "observedHorizontalDistanceM"
      | "zenithAngleDegrees"
      | "verticalAngleDegrees"
      | "observedHeightDiffM"
      | "toleranceMm"
      | "heightToleranceMm",
  ]),
);

function parseDistanceCalculatorCsv(
  text: string,
  delimiterOption: "auto" | "comma" | "tab" | "semicolon",
): DistanceSegmentInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("distance_calculator CSV 至少需要表头和 1 行数据");
  const delimiter = detectCsvDelimiter(lines[0]!, delimiterOption);
  const headers = splitDelimitedLine(lines[0]!, delimiter).map((header) =>
    DISTANCE_CALCULATOR_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  const segments = lines.slice(1).flatMap((line, index): DistanceSegmentInput[] => {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, cellIndex) => {
      const key = headers[cellIndex];
      if (key) row[key] = cell;
    });
    const fromX = parseNumericCell(row.fromX ?? "");
    const fromY = parseNumericCell(row.fromY ?? "");
    const fromZ = parseNumericCell(row.fromZ ?? "");
    const toX = parseNumericCell(row.toX ?? "");
    const toY = parseNumericCell(row.toY ?? "");
    const toZ = parseNumericCell(row.toZ ?? "");
    const observedHorizontalDistanceM = parseNumericCell(row.observedHorizontalDistanceM ?? "");
    const toleranceMm = parseNumericCell(row.toleranceMm ?? "");
    if (!Number.isFinite(fromX) || !Number.isFinite(fromY) || !Number.isFinite(toX) || !Number.isFinite(toY)) return [];
    return [
      {
        id: row.id?.trim() || `S${index + 1}`,
        from: { x: fromX, y: fromY, ...(Number.isFinite(fromZ) ? { z: fromZ } : {}) },
        to: { x: toX, y: toY, ...(Number.isFinite(toZ) ? { z: toZ } : {}) },
        ...(Number.isFinite(observedHorizontalDistanceM) ? { observedHorizontalDistanceM } : {}),
        ...(Number.isFinite(toleranceMm) && toleranceMm > 0 ? { toleranceMm } : {}),
      },
    ];
  });
  if (segments.length === 0) throw new Error("distance_calculator CSV 未解析到有效边段坐标");
  return segments;
}

function parseDistanceObservationCsv(
  text: string,
  delimiterOption: "auto" | "comma" | "tab" | "semicolon",
): DistanceObservationInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("distance_calculator 观测 CSV 至少需要表头和 1 行数据");
  const delimiter = detectCsvDelimiter(lines[0]!, delimiterOption);
  const headers = splitDelimitedLine(lines[0]!, delimiter).map((header) =>
    DISTANCE_OBSERVATION_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  const observations = lines.slice(1).flatMap((line, index): DistanceObservationInput[] => {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, cellIndex) => {
      const key = headers[cellIndex];
      if (key) row[key] = cell;
    });
    const slopeDistanceM = parseNumericCell(row.slopeDistanceM ?? "");
    const observedHorizontalDistanceM = parseNumericCell(row.observedHorizontalDistanceM ?? "");
    const zenithAngleDegrees = parseNumericCell(row.zenithAngleDegrees ?? "");
    const verticalAngleDegrees = parseNumericCell(row.verticalAngleDegrees ?? "");
    const observedHeightDiffM = parseNumericCell(row.observedHeightDiffM ?? "");
    const toleranceMm = parseNumericCell(row.toleranceMm ?? "");
    const heightToleranceMm = parseNumericCell(row.heightToleranceMm ?? "");
    const hasDistance = Number.isFinite(slopeDistanceM) || Number.isFinite(observedHorizontalDistanceM);
    const hasAngleOrHeight =
      Number.isFinite(zenithAngleDegrees) ||
      Number.isFinite(verticalAngleDegrees) ||
      Number.isFinite(observedHeightDiffM);
    if (!hasDistance || !hasAngleOrHeight) return [];
    return [
      {
        id: row.id?.trim() || `D${index + 1}`,
        ...(Number.isFinite(slopeDistanceM) ? { slopeDistanceM } : {}),
        ...(Number.isFinite(observedHorizontalDistanceM) ? { observedHorizontalDistanceM } : {}),
        ...(Number.isFinite(zenithAngleDegrees) ? { zenithAngleDegrees } : {}),
        ...(Number.isFinite(verticalAngleDegrees) ? { verticalAngleDegrees } : {}),
        ...(Number.isFinite(observedHeightDiffM) ? { observedHeightDiffM } : {}),
        ...(Number.isFinite(toleranceMm) && toleranceMm > 0 ? { toleranceMm } : {}),
        ...(Number.isFinite(heightToleranceMm) && heightToleranceMm > 0 ? { heightToleranceMm } : {}),
      },
    ];
  });
  if (observations.length === 0) throw new Error("distance_calculator 观测 CSV 未解析到有效距离观测");
  return observations;
}

function calculateSurveyDistance(from: { x: number; y: number; z?: number }, to: { x: number; y: number; z?: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = (to.z ?? 0) - (from.z ?? 0);
  const horizontal = hypot2(dx, dy);
  const slopeDistance = Math.hypot(horizontal, dz);
  const azimuth = azimuthDegrees(dx, dy);
  const backAzimuth = normalizeDegrees360(azimuth + 180);
  const gradePercent = horizontal === 0 ? null : round((dz / horizontal) * 100, 6);
  const verticalAngle = horizontal === 0 && dz === 0 ? 0 : round(rad2deg(Math.atan2(dz, horizontal)), 6);
  return {
    dx,
    dy,
    dz,
    horizontal,
    slopeDistance,
    azimuth,
    backAzimuth,
    gradePercent,
    verticalAngle,
    midpoint: {
      x: round((from.x + to.x) / 2, 6),
      y: round((from.y + to.y) / 2, 6),
      z: round(((from.z ?? 0) + (to.z ?? 0)) / 2, 6),
    },
  };
}

function distanceExportRow(
  from: { x: number; y: number; z?: number },
  to: { x: number; y: number; z?: number },
  values: ReturnType<typeof calculateSurveyDistance>,
) {
  return {
    from_x_m: round(from.x, 6),
    from_y_m: round(from.y, 6),
    from_z_m: round(from.z ?? 0, 6),
    to_x_m: round(to.x, 6),
    to_y_m: round(to.y, 6),
    to_z_m: round(to.z ?? 0, 6),
    delta_x_m: round(values.dx),
    delta_y_m: round(values.dy),
    elevation_difference_m: round(values.dz),
    horizontal_distance_m: round(values.horizontal),
    slope_distance_m: round(values.slopeDistance),
    azimuth_degrees: values.azimuth,
    back_azimuth_degrees: values.backAzimuth,
    grade_percent: values.gradePercent,
    vertical_angle_degrees: values.verticalAngle,
  };
}

function runDistanceBatchCsv(segments: DistanceSegmentInput[], parsedRowCount: number): Record<string, unknown> {
  const rows = segments.map((segment) => {
    const values = calculateSurveyDistance(segment.from, segment.to);
    const distanceResidualMm =
      segment.observedHorizontalDistanceM === undefined
        ? null
        : round((segment.observedHorizontalDistanceM - values.horizontal) * 1000, 3);
    const isPassed =
      distanceResidualMm === null || segment.toleranceMm === undefined
        ? null
        : Math.abs(distanceResidualMm) <= segment.toleranceMm;
    return {
      row_type: "survey_distance_segment",
      segment_id: segment.id,
      ...distanceExportRow(segment.from, segment.to, values),
      observed_horizontal_distance_m:
        segment.observedHorizontalDistanceM === undefined ? null : round(segment.observedHorizontalDistanceM, 6),
      distance_residual_mm: distanceResidualMm,
      distance_tolerance_mm: segment.toleranceMm ?? null,
      is_passed: isPassed,
    };
  });
  const residuals = rows.flatMap((row) =>
    typeof row.distance_residual_mm === "number" ? [Math.abs(row.distance_residual_mm)] : [],
  );
  const failedSegments = rows
    .filter((row) => row.is_passed === false)
    .map((row) => row.segment_id);
  const totalHorizontalDistance = rows.reduce((sum, row) => sum + Number(row.horizontal_distance_m), 0);
  const summary = {
    segment_count: rows.length,
    failed_count: failedSegments.length,
    total_horizontal_distance_m: round(totalHorizontalDistance, 4),
    max_abs_distance_residual_mm: residuals.length > 0 ? round(Math.max(...residuals), 3) : null,
    quality_status: failedSegments.length > 0 ? "alert" : "pass",
  };
  return {
    mode: "distance_batch_csv",
    input_format: "csv",
    parsed_row_count: parsedRowCount,
    segment_count: rows.length,
    failed_count: failedSegments.length,
    failed_segments: failedSegments,
    total_horizontal_distance_m: summary.total_horizontal_distance_m,
    max_abs_distance_residual_mm: summary.max_abs_distance_residual_mm,
    quality_status: summary.quality_status,
    survey_distance_summary: summary,
    segments: rows,
    export_rows: rows,
  };
}

function distanceObservationComputedValues(observation: DistanceObservationInput): {
  slopeDistanceM: number | null;
  calculatedHorizontalDistanceM: number | null;
  calculatedHeightDiffM: number | null;
  zenithAngleDegrees: number | null;
} {
  const slope = observation.slopeDistanceM;
  const horizontal = observation.observedHorizontalDistanceM;
  const heightDiff = observation.observedHeightDiffM;
  if (slope !== undefined && observation.zenithAngleDegrees !== undefined) {
    const zenithRadians = deg2rad(observation.zenithAngleDegrees);
    return {
      slopeDistanceM: slope,
      calculatedHorizontalDistanceM: slope * Math.sin(zenithRadians),
      calculatedHeightDiffM: slope * Math.cos(zenithRadians),
      zenithAngleDegrees: observation.zenithAngleDegrees,
    };
  }
  if (slope !== undefined && observation.verticalAngleDegrees !== undefined) {
    const verticalRadians = deg2rad(observation.verticalAngleDegrees);
    return {
      slopeDistanceM: slope,
      calculatedHorizontalDistanceM: slope * Math.cos(verticalRadians),
      calculatedHeightDiffM: slope * Math.sin(verticalRadians),
      zenithAngleDegrees: 90 - observation.verticalAngleDegrees,
    };
  }
  if (horizontal !== undefined && heightDiff !== undefined) {
    const calculatedSlope = Math.hypot(horizontal, heightDiff);
    return {
      slopeDistanceM: calculatedSlope,
      calculatedHorizontalDistanceM: horizontal,
      calculatedHeightDiffM: heightDiff,
      zenithAngleDegrees: rad2deg(Math.atan2(horizontal, heightDiff)),
    };
  }
  return {
    slopeDistanceM: slope ?? null,
    calculatedHorizontalDistanceM: horizontal ?? null,
    calculatedHeightDiffM: heightDiff ?? null,
    zenithAngleDegrees: observation.zenithAngleDegrees ?? null,
  };
}

function runDistanceObservationCsv(observations: DistanceObservationInput[], parsedRowCount: number): Record<string, unknown> {
  const rows = observations.map((observation) => {
    const computed = distanceObservationComputedValues(observation);
    const horizontalResidualMm =
      observation.observedHorizontalDistanceM === undefined || computed.calculatedHorizontalDistanceM === null
        ? null
        : round((observation.observedHorizontalDistanceM - computed.calculatedHorizontalDistanceM) * 1000, 3);
    const heightResidualMm =
      observation.observedHeightDiffM === undefined || computed.calculatedHeightDiffM === null
        ? null
        : round((observation.observedHeightDiffM - computed.calculatedHeightDiffM) * 1000, 3);
    const horizontalPassed =
      horizontalResidualMm === null || observation.toleranceMm === undefined
        ? null
        : Math.abs(horizontalResidualMm) <= observation.toleranceMm;
    const heightPassed =
      heightResidualMm === null || observation.heightToleranceMm === undefined
        ? null
        : Math.abs(heightResidualMm) <= observation.heightToleranceMm;
    const isPassed = horizontalPassed === false || heightPassed === false ? false : null;
    return {
      row_type: "survey_distance_observation",
      observation_id: observation.id,
      slope_distance_m: observation.slopeDistanceM === undefined ? null : round(observation.slopeDistanceM, 6),
      observed_horizontal_distance_m:
        observation.observedHorizontalDistanceM === undefined ? null : round(observation.observedHorizontalDistanceM, 6),
      observed_height_diff_m: observation.observedHeightDiffM === undefined ? null : round(observation.observedHeightDiffM, 6),
      zenith_angle_degrees: computed.zenithAngleDegrees === null ? null : round(computed.zenithAngleDegrees, 9),
      calculated_slope_distance_m: computed.slopeDistanceM === null ? null : round(computed.slopeDistanceM, 6),
      calculated_horizontal_distance_m:
        computed.calculatedHorizontalDistanceM === null ? null : round(computed.calculatedHorizontalDistanceM, 6),
      calculated_height_diff_m: computed.calculatedHeightDiffM === null ? null : round(computed.calculatedHeightDiffM, 6),
      horizontal_distance_residual_mm: horizontalResidualMm,
      height_diff_residual_mm: heightResidualMm,
      distance_tolerance_mm: observation.toleranceMm ?? null,
      height_tolerance_mm: observation.heightToleranceMm ?? null,
      is_passed: isPassed,
    };
  });
  const failedRows = rows.filter((row) => row.is_passed === false);
  const horizontalResiduals = rows.flatMap((row) =>
    typeof row.horizontal_distance_residual_mm === "number" ? [Math.abs(row.horizontal_distance_residual_mm)] : [],
  );
  const heightResiduals = rows.flatMap((row) =>
    typeof row.height_diff_residual_mm === "number" ? [Math.abs(row.height_diff_residual_mm)] : [],
  );
  const summary = {
    observation_count: rows.length,
    failed_count: failedRows.length,
    max_abs_horizontal_distance_residual_mm:
      horizontalResiduals.length > 0 ? round(Math.max(...horizontalResiduals), 3) : null,
    max_abs_height_diff_residual_mm: heightResiduals.length > 0 ? round(Math.max(...heightResiduals), 3) : null,
    quality_status: failedRows.length > 0 ? "alert" : "pass",
  };
  return {
    mode: "distance_observation_csv",
    input_format: "csv",
    parsed_row_count: parsedRowCount,
    observation_count: rows.length,
    failed_count: failedRows.length,
    failed_observations: failedRows.map((row) => row.observation_id),
    quality_status: summary.quality_status,
    survey_distance_summary: summary,
    observations: rows,
    export_rows: rows,
  };
}

type AngleFormat = "decimal" | "dms" | "radian" | "grad";
type AngleBatchInput = {
  id: string;
  groupId: string;
  value: string;
  from: AngleFormat;
  targetValue?: string;
  targetFrom?: AngleFormat;
  toleranceArcSec?: number;
};

const ANGLE_CONVERT_CSV_ALIASES = new Map<
  string,
  "id" | "groupId" | "value" | "from" | "targetValue" | "targetFrom" | "toleranceArcSec"
>(
  [
    ["id", "id"],
    ["angleid", "id"],
    ["observationid", "id"],
    ["角度编号", "id"],
    ["观测号", "id"],
    ["编号", "id"],
    ["点号", "id"],
    ["group", "groupId"],
    ["groupid", "groupId"],
    ["directionset", "groupId"],
    ["方向组", "groupId"],
    ["测回", "groupId"],
    ["测回号", "groupId"],
    ["value", "value"],
    ["angle", "value"],
    ["direction", "value"],
    ["角度值", "value"],
    ["观测角", "value"],
    ["方向读数", "value"],
    ["水平角", "value"],
    ["from", "from"],
    ["format", "from"],
    ["inputformat", "from"],
    ["输入格式", "from"],
    ["格式", "from"],
    ["target", "targetValue"],
    ["design", "targetValue"],
    ["designangle", "targetValue"],
    ["targetangle", "targetValue"],
    ["设计角", "targetValue"],
    ["设计方向", "targetValue"],
    ["目标角", "targetValue"],
    ["targetformat", "targetFrom"],
    ["designformat", "targetFrom"],
    ["设计角格式", "targetFrom"],
    ["目标角格式", "targetFrom"],
    ["tolerance", "toleranceArcSec"],
    ["tolerancearcsec", "toleranceArcSec"],
    ["限差", "toleranceArcSec"],
    ["角度限差", "toleranceArcSec"],
    ["方向限差", "toleranceArcSec"],
  ].map(([alias, key]) => [
    normalizeCsvHeader(alias),
    key as "id" | "groupId" | "value" | "from" | "targetValue" | "targetFrom" | "toleranceArcSec",
  ]),
);

function parseAngleFormat(value: string | undefined, fallback: AngleFormat): AngleFormat {
  const normalized = normalizeCsvHeader(value ?? "");
  if (!normalized) return fallback;
  if (/^(dms|度分秒)$/.test(normalized)) return "dms";
  if (/^(decimal|degree|degrees|deg|十进制度|度)$/.test(normalized)) return "decimal";
  if (/^(radian|radians|rad|弧度)$/.test(normalized)) return "radian";
  if (/^(grad|grads|gon|百分度)$/.test(normalized)) return "grad";
  return fallback;
}

function inferAngleFormat(value: string, fallback: AngleFormat): AngleFormat {
  const trimmed = normalizeSignedAngleText(value);
  if (/[°度′'分″"秒:]/.test(trimmed) || /^-?\d+(?:\.\d+)?-\d+(?:\.\d+)?-\d+(?:\.\d+)?$/.test(trimmed)) {
    return "dms";
  }
  return fallback;
}

function angleToDecimal(value: string | number, format: AngleFormat): number {
  return format === "dms"
    ? parseDms(value)
    : format === "radian"
      ? rad2deg(parseFiniteAngle(value))
      : format === "grad"
        ? parseFiniteAngle(value) * 0.9
        : parseFiniteAngle(value);
}

function parseAngleConvertCsv(
  text: string,
  delimiterOption: "auto" | "comma" | "tab" | "semicolon",
): AngleBatchInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("angle_convert CSV 至少需要表头和 1 行数据");
  const delimiter = detectCsvDelimiter(lines[0]!, delimiterOption);
  const headers = splitDelimitedLine(lines[0]!, delimiter).map((header) =>
    ANGLE_CONVERT_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  const rows = lines.slice(1).flatMap((line, index): AngleBatchInput[] => {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, cellIndex) => {
      const key = headers[cellIndex];
      if (key) row[key] = cell;
    });
    const value = row.value?.trim();
    if (!value) return [];
    const from = parseAngleFormat(row.from, inferAngleFormat(value, "decimal"));
    const targetValue = row.targetValue?.trim();
    const toleranceArcSec = parseNumericCell(row.toleranceArcSec ?? "");
    return [
      {
        id: row.id?.trim() || `A${index + 1}`,
        groupId: row.groupId?.trim() || "未分组",
        value,
        from,
        ...(targetValue ? { targetValue } : {}),
        ...(targetValue
          ? { targetFrom: parseAngleFormat(row.targetFrom, inferAngleFormat(targetValue, from)) }
          : {}),
        ...(Number.isFinite(toleranceArcSec) && toleranceArcSec > 0 ? { toleranceArcSec } : {}),
      },
    ];
  });
  if (rows.length === 0) throw new Error("angle_convert CSV 未解析到有效角度记录");
  return rows;
}

function angleConversionRow(row: AngleBatchInput) {
  const decimal = angleToDecimal(row.value, row.from);
  const dms = formatDmsParts(dmsParts(decimal));
  const targetDegrees =
    row.targetValue === undefined || row.targetFrom === undefined ? null : angleToDecimal(row.targetValue, row.targetFrom);
  const residualArcSec = targetDegrees === null ? null : directionDifferenceArcSec(decimal, targetDegrees);
  const isPassed =
    residualArcSec === null || row.toleranceArcSec === undefined ? null : Math.abs(residualArcSec) <= row.toleranceArcSec;
  return {
    row_type: "angle_conversion_result",
    angle_id: row.id,
    group_id: row.groupId,
    input: row.value,
    from: row.from,
    decimal_degrees: round(decimal, 10),
    normalized_degrees_0_360: normalizeDegrees360(decimal),
    normalized_degrees_minus180_180: normalizeDegrees180(decimal),
    total_arcseconds: round(decimal * 3600, 6),
    dms,
    radians: round(deg2rad(decimal), 10),
    grads: round(decimal / 0.9, 10),
    target_degrees: targetDegrees === null ? null : round(targetDegrees, 10),
    residual_arcsec: residualArcSec,
    tolerance_arcsec: row.toleranceArcSec ?? null,
    is_passed: isPassed,
  };
}

function runAngleBatchCsv(rows: AngleBatchInput[], parsedRowCount: number): Record<string, unknown> {
  const angleRows = rows.map(angleConversionRow);
  const failedAngles = angleRows.filter((row) => row.is_passed === false).map((row) => row.angle_id);
  const residuals = angleRows.flatMap((row) =>
    typeof row.residual_arcsec === "number" ? [Math.abs(row.residual_arcsec)] : [],
  );
  const groupIds = [...new Set(angleRows.map((row) => row.group_id))].sort((a, b) => a.localeCompare(b));
  const groupSummaries = groupIds.map((groupId) => {
    const groupRows = angleRows.filter((row) => row.group_id === groupId);
    const groupResiduals = groupRows.flatMap((row) =>
      typeof row.residual_arcsec === "number" ? [Math.abs(row.residual_arcsec)] : [],
    );
    const failedCount = groupRows.filter((row) => row.is_passed === false).length;
    return {
      row_type: "angle_group_summary",
      group_id: groupId,
      angle_count: groupRows.length,
      failed_count: failedCount,
      mean_angle_degrees: round(directionMeanDegrees(groupRows.map((row) => Number(row.decimal_degrees))), 6),
      max_abs_residual_arcsec: groupResiduals.length > 0 ? round(Math.max(...groupResiduals), 3) : null,
      quality_status: failedCount > 0 ? "alert" : "pass",
    };
  });
  const maxAbsResidual = residuals.length > 0 ? round(Math.max(...residuals), 3) : null;
  const qualityStatus = failedAngles.length > 0 ? "alert" : "pass";
  const summary = {
    angle_count: angleRows.length,
    group_count: groupSummaries.length,
    failed_count: failedAngles.length,
    max_abs_residual_arcsec: maxAbsResidual,
    quality_status: qualityStatus,
  };
  return {
    mode: "angle_batch_csv",
    input_format: "csv",
    parsed_row_count: parsedRowCount,
    angle_count: angleRows.length,
    group_count: groupSummaries.length,
    failed_count: failedAngles.length,
    failed_angles: failedAngles,
    max_abs_residual_arcsec: maxAbsResidual,
    quality_status: qualityStatus,
    angle_conversion_summary: summary,
    group_summaries: groupSummaries,
    angle_rows: angleRows,
    export_rows: [...angleRows, ...groupSummaries],
  };
}

export function registerEngineering(server: McpServer): void {
  server.tool(
    "distance_calculator",
    "测量基础距离计算。输入两点坐标或中文 CSV 边段表，返回平距、高差、斜距、方位角和距离残差复核。",
    {
      from: point3.optional().describe("起点坐标，x/y 单位为 m，z 可选"),
      to: point3.optional().describe("终点坐标，x/y 单位为 m，z 可选"),
      csvText: z.string().optional().describe("可选，中文 CSV/TSV。每行提供起终点坐标、实测距离和限差，批量输出边段反算成果"),
      csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
    },
    async (args) => {
      if (args.csvText) {
        try {
          const segments = parseDistanceCalculatorCsv(args.csvText, args.csvDelimiter);
          return ok(runDistanceBatchCsv(segments, segments.length));
        } catch {
          const observations = parseDistanceObservationCsv(args.csvText, args.csvDelimiter);
          return ok(runDistanceObservationCsv(observations, observations.length));
        }
      }
      if (!args.from || !args.to) throw new Error("distance_calculator 需要提供 from+to 或 csvText 输入");
      const values = calculateSurveyDistance(args.from, args.to);
      const exportRow = {
        row_type: "survey_distance_result",
        ...distanceExportRow(args.from, args.to, values),
      };
      return ok({
        delta_x_m: round(values.dx),
        delta_y_m: round(values.dy),
        elevation_difference_m: round(values.dz),
        horizontal_distance_m: round(values.horizontal),
        slope_distance_m: round(values.slopeDistance),
        azimuth_degrees: values.azimuth,
        back_azimuth_degrees: values.backAzimuth,
        grade_percent: values.gradePercent,
        vertical_angle_degrees: values.verticalAngle,
        midpoint: values.midpoint,
        survey_distance_summary: {
          horizontal_distance_m: round(values.horizontal),
          slope_distance_m: round(values.slopeDistance),
          azimuth_degrees: values.azimuth,
          back_azimuth_degrees: values.backAzimuth,
          grade_percent: values.gradePercent,
          vertical_angle_degrees: values.verticalAngle,
        },
        export_rows: [exportRow],
      });
    },
  );

  server.tool(
    "angle_convert",
    "角度格式转换。支持十进制度、度分秒、弧度和百分度之间互转；也支持中文 CSV 批量角度残差复核。",
    {
      value: z.union([z.number(), z.string()]).optional().describe("角度值。DMS 可写为 123°27′24″、123:27:24 或 123-27-24"),
      from: z.enum(["decimal", "dms", "radian", "grad"]).default("decimal"),
      to: z.enum(["decimal", "dms", "radian", "grad"]).default("decimal"),
      csvText: z.string().optional().describe("可选，中文 CSV/TSV。每行提供角度值、输入格式、设计角和限差，批量输出角度复核成果"),
      csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
    },
    async (args) => {
      if (args.csvText) {
        const rows = parseAngleConvertCsv(args.csvText, args.csvDelimiter);
        return ok(runAngleBatchCsv(rows, rows.length));
      }
      if (args.value === undefined) throw new Error("angle_convert 需要提供 value 或 csvText 输入");
      const decimal =
        args.from === "dms"
          ? parseDms(args.value)
          : args.from === "radian"
            ? rad2deg(parseFiniteAngle(args.value))
            : args.from === "grad"
              ? parseFiniteAngle(args.value) * 0.9
              : parseFiniteAngle(args.value);
      const parts = dmsParts(decimal);
      const dms = formatDmsParts(parts);
      const converted =
        args.to === "dms"
          ? dms
          : args.to === "radian"
            ? round(deg2rad(decimal), 10)
            : args.to === "grad"
              ? round(decimal / 0.9, 10)
              : round(decimal, 10);
      const exportRow = {
        row_type: "survey_angle_conversion",
        input: args.value,
        from: args.from,
        to: args.to,
        decimal_degrees: round(decimal, 10),
        normalized_degrees_0_360: normalizeDegrees360(decimal),
        normalized_degrees_minus180_180: normalizeDegrees180(decimal),
        total_arcseconds: round(decimal * 3600, 6),
        dms,
        radians: round(deg2rad(decimal), 10),
        grads: round(decimal / 0.9, 10),
        converted,
      };
      return ok({
        input: args.value,
        decimal_degrees: round(decimal, 10),
        normalized_degrees_0_360: normalizeDegrees360(decimal),
        normalized_degrees_minus180_180: normalizeDegrees180(decimal),
        total_arcseconds: round(decimal * 3600, 6),
        dms,
        dms_parts: parts,
        radians: round(deg2rad(decimal), 10),
        grads: round(decimal / 0.9, 10),
        converted,
        conversion_summary: {
          from: args.from,
          to: args.to,
          converted,
          decimal_degrees: round(decimal, 10),
          dms,
        },
        export_rows: [exportRow],
      });
    },
  );

  server.tool(
    "coord_transform",
    "二维坐标转换。支持平移、旋转和尺度改正的 Helmert 近似转换，适用于工程局部坐标换算。",
    coordTransformShape,
    async (args) => {
      const parsed = coordTransformInput(args);
      if (parsed.controlPoints) {
        return ok(
          estimateHelmert2d(parsed.controlPoints, parsed.points, {
            inputFormat: parsed.inputFormat,
            parsedControlPointCount: parsed.parsedControlPointCount,
            parsedTransformPointCount: parsed.parsedTransformPointCount,
          }),
        );
      }
      if (parsed.points.length > 0) {
        return ok(
          runKnownHelmert2dBatch(
            parsed.points,
            {
              dx: parsed.dx,
              dy: parsed.dy,
              rotationArcsec: parsed.rotationArcsec,
              scalePpm: parsed.scalePpm,
            },
            {
              inputFormat: parsed.inputFormat,
              parsedControlPointCount: parsed.parsedControlPointCount,
              parsedTransformPointCount: parsed.points.length,
            },
          ),
        );
      }
      if (!Number.isFinite(parsed.x ?? Number.NaN) || !Number.isFinite(parsed.y ?? Number.NaN)) {
        throw new Error("coord_transform 需要提供 x/y 或 controlPoints");
      }
      const sourceX = parsed.x ?? 0;
      const sourceY = parsed.y ?? 0;
      const transformed = transformKnownHelmert2dPoint(
        { x: sourceX, y: sourceY },
        { dx: parsed.dx, dy: parsed.dy, rotationArcsec: parsed.rotationArcsec, scalePpm: parsed.scalePpm },
      );
      return ok({
        mode: parsed.mode,
        input_format: parsed.inputFormat,
        source_x: sourceX,
        source_y: sourceY,
        target_x: transformed.target_x,
        target_y: transformed.target_y,
        rotation_degrees: round(parsed.rotationArcsec / 3600, 10),
        scale_factor: round(1 + parsed.scalePpm / 1_000_000, 10),
        export_rows: [coordTransformExportRow(transformed)],
      });
    },
  );

  server.tool(
    "control_network",
    "控制网坐标观测平差简表。支持同名点多次坐标观测加权平均、附合导线闭合差、水准路线、GNSS 基线和方向组外业记录质检。",
    controlNetworkShape,
    async (args) => {
      const parsed = controlNetworkInput(args);
      if (parsed.mode === "traverse_closure") {
        return ok(
          runTraverseClosureAdjustment(parsed.traverse, {
            inputFormat: parsed.inputFormat,
            parsedRowCount: parsed.inputFormat === "csv" ? parsed.parsedRowCount : null,
          }),
        );
      }
      if (parsed.mode === "leveling_route_closure") {
        return ok(
          runLevelingRouteClosureAdjustment(parsed.levelingRoute, {
            inputFormat: parsed.inputFormat,
            parsedRowCount: parsed.inputFormat === "csv" ? parsed.parsedRowCount : null,
          }),
        );
      }
      if (parsed.mode === "gnss_baseline_adjustment") {
        return ok(
          runGnssBaselineAdjustment(parsed.gnssBaseline, {
            inputFormat: parsed.inputFormat,
            parsedRowCount: parsed.inputFormat === "csv" ? parsed.parsedRowCount : null,
          }),
        );
      }
      if (parsed.mode === "direction_round_quality") {
        return ok(
          runDirectionRoundQuality(parsed.directionRound, {
            inputFormat: parsed.inputFormat,
            parsedRowCount: parsed.inputFormat === "csv" ? parsed.parsedRowCount : null,
          }),
        );
      }
      return ok(
        runControlObservationAdjustment(parsed.observations, {
          inputFormat: parsed.inputFormat,
          parsedRowCount: parsed.inputFormat === "csv" ? parsed.parsedRowCount : null,
        }),
      );
    },
  );

  server.tool(
    "cpiii_adjustment",
    "CPIII 控制点复测偏差评定。输入设计坐标与实测坐标，输出平面/高程偏差、超限点和复测建议。",
    cpiiiAdjustmentShape,
    async (args) => {
      const parsed = cpiiiAdjustmentInput(args);
      return ok(
        runCpiiiAdjustment(parsed.points, parsed.toleranceMm, parsed.verticalToleranceMm, {
          inputFormat: parsed.inputFormat,
          parsedRowCount: parsed.parsedRowCount,
        }),
      );
    },
  );

  server.tool(
    "inclinometer",
    "测斜数据处理。支持初值/现值差分，或按孔号、深度、日期的多期观测计算累计位移、当前速率和超限深度。",
    inclinometerShape,
    async (args) => {
      if (args.csvText) {
        const parsed = parseInclinometerCsv(args.csvText, args.csvDelimiter);
        return ok(
          runInclinometerObservationSeries(
            parsed.observations,
            parsed.alertThresholdMm ?? args.alertThresholdMm,
            parsed.rateThresholdMmPerDay ?? args.rateThresholdMmPerDay,
            {
              inputFormat: "csv",
              parsedRowCount: parsed.parsedRowCount,
              parsedObservationCount: parsed.parsedObservationCount,
              tableFormat: parsed.tableFormat,
            },
          ),
        );
      }
      if (args.observations) {
        return ok(runInclinometerObservationSeries(args.observations, args.alertThresholdMm, args.rateThresholdMmPerDay));
      }
      if (!args.readings) throw new Error("inclinometer 需要提供 readings、observations 或 csvText 输入");
      const details = args.readings.map((r) => {
        const dx = r.currentX - r.initialX;
        const dy = r.currentY - r.initialY;
        const resultant = Math.hypot(dx, dy);
        return { depth_m: r.depth, dx_mm: round(dx, 3), dy_mm: round(dy, 3), resultant_mm: round(resultant, 3) };
      });
      const max = details.reduce((a, b) => (b.resultant_mm > a.resultant_mm ? b : a), details[0]!);
      const alertThresholdMm = args.alertThresholdMm ?? null;
      const exportRows = details.map((row) => {
        const isAlert = alertThresholdMm !== null ? row.resultant_mm >= alertThresholdMm : false;
        return {
          row_type: "inclinometer_reading_difference",
          depth_m: row.depth_m,
          dx_mm: row.dx_mm,
          dy_mm: row.dy_mm,
          resultant_mm: row.resultant_mm,
          alert_threshold_mm: alertThresholdMm,
          status: isAlert ? "alert" : "pass",
          is_alert: isAlert,
        };
      });
      const alertCount = exportRows.filter((row) => row.is_alert).length;
      return ok({
        mode: "reading_difference",
        max_depth_m: max.depth_m,
        max_displacement_mm: max.resultant_mm,
        alert_threshold_mm: args.alertThresholdMm ?? null,
        is_alert: args.alertThresholdMm ? max.resultant_mm >= args.alertThresholdMm : false,
        inclinometer_reading_summary: {
          reading_count: details.length,
          alert_count: alertCount,
          max_displacement_mm: max.resultant_mm,
          max_depth_m: max.depth_m,
          alert_threshold_mm: alertThresholdMm,
          quality_status: alertCount > 0 ? "alert" : "pass",
          worst_depth: {
            depth_m: max.depth_m,
            resultant_mm: max.resultant_mm,
            is_alert: alertThresholdMm !== null ? max.resultant_mm >= alertThresholdMm : false,
          },
        },
        details,
        export_rows: exportRows,
      });
    },
  );

  server.tool(
    "cross_section",
    "铁路/轨道交通断面偏差复核。对设计断面和实测断面进行插值对比，输出高程偏差、限差判定和超限偏距。",
    crossSectionShape,
    async (args) => {
      if (args.csvText) {
        const parsed = parseCrossSectionCsv(args.csvText, args.csvDelimiter);
        return ok(
          runCrossSectionAnalysis({
            design: parsed.design,
            measured: parsed.measured,
            toleranceMm: parsed.toleranceMm ?? args.toleranceMm,
            sectionId: parsed.sectionId,
            inputFormat: "csv",
            parsedRowCount: parsed.parsedRowCount,
          }),
        );
      }
      if (!args.design || !args.measured) throw new Error("cross_section 需要提供 design+measured 或 csvText 输入");
      return ok(
        runCrossSectionAnalysis({
          design: args.design,
          measured: args.measured,
          toleranceMm: args.toleranceMm,
          inputFormat: "json",
        }),
      );
    },
  );

  server.tool(
    "axial_force",
    "轴力监测计算。支持应变计初读数/当前读数换算，或按传感器多期轴力观测计算当前变化、速率和预警状态。",
    axialForceShape,
    async (args) => {
      if (args.csvText) {
        const parsed = parseAxialForceCsv(args.csvText, args.csvDelimiter);
        return ok(
          runAxialForceObservationSeries(
            parsed.observations,
            parsed.alertThresholdKn ?? args.alertThresholdKn,
            parsed.rateThresholdKnPerDay ?? args.rateThresholdKnPerDay,
            {
              inputFormat: "csv",
              parsedRowCount: parsed.parsedRowCount,
              parsedObservationCount: parsed.parsedObservationCount,
              tableFormat: parsed.tableFormat,
            },
          ),
        );
      }
      if (args.observations) {
        return ok(runAxialForceObservationSeries(args.observations, args.alertThresholdKn, args.rateThresholdKnPerDay));
      }
      if (
        !args.readings ||
        !Number.isFinite(args.elasticModulusMpa ?? Number.NaN) ||
        !Number.isFinite(args.areaMm2 ?? Number.NaN)
      ) {
        throw new Error("axial_force 需要提供 readings+elasticModulusMpa+areaMm2、observations 或 csvText 输入");
      }
      const elasticModulusMpa = args.elasticModulusMpa ?? 0;
      const areaMm2 = args.areaMm2 ?? 0;
      const details = args.readings.map((r) => {
        const delta = (r.currentMicrostrain - r.initialMicrostrain) / args.gaugeFactor;
        const stress = elasticModulusMpa * delta * 1e-6;
        const force = (stress * areaMm2) / 1000;
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
      const exportRows = details.map((row) => ({
        row_type: "axial_force_reading_result",
        point_id: row.id,
        delta_microstrain: row.delta_microstrain,
        stress_mpa: row.stress_mpa,
        force_kn: row.force_kn,
        ratio_pct: row.ratio_pct,
        status: row.is_alert ? "alert" : "pass",
        is_alert: row.is_alert,
      }));
      const alertCount = details.filter((row) => row.is_alert).length;
      return ok({
        max_abs_force_kn: round(Math.abs(max.force_kn), 4),
        max_point_id: max.id,
        axial_force_reading_summary: {
          reading_count: details.length,
          alert_count: alertCount,
          max_abs_force_kn: round(Math.abs(max.force_kn), 4),
          max_point_id: max.id,
          design_force_kn: args.designForceKn ?? null,
          quality_status: alertCount > 0 ? "alert" : "pass",
          worst_point: {
            point_id: max.id,
            force_kn: max.force_kn,
            ratio_pct: max.ratio_pct,
            is_alert: max.is_alert,
          },
        },
        details,
        export_rows: exportRows,
      });
    },
  );

  server.tool(
    "water_level",
    "静力水准/水位监测处理。支持初值/现值差分，或按井号多期观测计算累计变化、当前速率和预警状态。",
    waterLevelShape,
    async (args) => {
      if (args.csvText) {
        const parsed = parseWaterLevelCsv(args.csvText, args.csvDelimiter);
        return ok(
          runWaterLevelObservationSeries(
            parsed.observations,
            parsed.alertThresholdMm ?? args.alertThresholdMm,
            parsed.rateThresholdMmPerDay ?? args.rateThresholdMmPerDay,
            {
              inputFormat: "csv",
              parsedRowCount: parsed.parsedRowCount,
              parsedObservationCount: parsed.parsedObservationCount,
              tableFormat: parsed.tableFormat,
            },
          ),
        );
      }
      if (args.observations) {
        return ok(
          runWaterLevelObservationSeries(args.observations, args.alertThresholdMm, args.rateThresholdMmPerDay),
        );
      }
      if (!args.points) throw new Error("water_level 需要提供 points、observations 或 csvText 输入");
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
      const alertThresholdMm = args.alertThresholdMm ?? null;
      const exportRows = details.map((row) => ({
        row_type: "water_level_point_change",
        point_id: row.id,
        change_mm: row.change_mm,
        abs_change_mm: row.abs_change_mm,
        alert_threshold_mm: alertThresholdMm,
        status: row.is_alert ? "alert" : "pass",
        is_alert: row.is_alert,
      }));
      const alertCount = details.filter((row) => row.is_alert).length;
      return ok({
        max_point_id: max.id,
        max_change_mm: max.abs_change_mm,
        alert_threshold_mm: args.alertThresholdMm ?? null,
        alert_points: details.filter((p) => p.is_alert).map((p) => p.id),
        water_level_point_summary: {
          point_count: details.length,
          alert_count: alertCount,
          max_abs_change_mm: max.abs_change_mm,
          alert_threshold_mm: alertThresholdMm,
          quality_status: alertCount > 0 ? "alert" : "pass",
          worst_point: {
            point_id: max.id,
            change_mm: max.change_mm,
            abs_change_mm: max.abs_change_mm,
            is_alert: max.is_alert,
          },
        },
        details,
        export_rows: exportRows,
      });
    },
  );

  server.tool(
    "line_stakeout",
    "线路放样计算。根据测站、后视点和设计放样点计算放样距离、方位角和转角。",
    lineStakeoutShape,
    async (args) => {
      if (args.csvText) {
        const parsed = parseLineStakeoutCsv(args.csvText, args.csvDelimiter);
        return ok(runLineStakeoutBatch(parsed.rows, parsed.parsedRowCount));
      }
      if (!args.station || !args.backsight || !args.stakeoutPoint) {
        throw new Error("line_stakeout 需要提供 station/backsight/stakeoutPoint 或 csvText");
      }
      return ok(lineStakeoutResult(args.station, args.backsight, args.stakeoutPoint, args.measuredPoint, args.toleranceMm));
    },
  );

  server.tool(
    "track_geometry_review",
    "轨道精调复核。按轨道几何点计算轨距、水平/超高、三角坑/扭曲、轨向、高低、相邻变化率和调整量建议，输出超限点与区段汇总。",
    trackGeometryShape,
    async (args) => ok(runTrackGeometryReview(args)),
  );

  server.tool(
    "alignment_station_offset",
    "线路里程偏距计算。根据铁路/轨道交通线路中线直线或圆曲线元素，将实测点投影到线路，输出里程、左右偏距、切向方位角和限差判定。",
    alignmentStationOffsetShape,
    async (args) => {
      const parsed = alignmentStationOffsetInput(args);
      return ok(
        runAlignmentStationOffset(parsed.alignment, parsed.observations, {
          inputFormat: parsed.inputFormat,
          parsedAlignmentPointCount: parsed.parsedAlignmentPointCount,
          parsedObservationCount: parsed.parsedObservationCount,
        }),
      );
    },
  );

  server.tool(
    "shield_guidance",
    "盾构导向偏差计算。对比设计轴线位置和盾构机实测姿态，输出平面、竖向和方位偏差；支持连续环号趋势复核。",
    shieldGuidanceShape,
    async (args) => {
      if (args.csvText) {
        const parsed = parseShieldGuidanceCsv(args.csvText, args.csvDelimiter);
        return ok(
          runShieldGuidanceRingTrend(
            parsed.rings,
            {
              horizontalToleranceMm: parsed.tolerances.horizontalToleranceMm ?? args.horizontalToleranceMm,
              verticalToleranceMm: parsed.tolerances.verticalToleranceMm ?? args.verticalToleranceMm,
              azimuthToleranceDeg: parsed.tolerances.azimuthToleranceDeg ?? args.azimuthToleranceDeg,
            },
            { inputFormat: "csv", parsedRowCount: parsed.parsedRowCount },
          ),
        );
      }
      const tolerances = {
        horizontalToleranceMm: args.horizontalToleranceMm,
        verticalToleranceMm: args.verticalToleranceMm,
        azimuthToleranceDeg: args.azimuthToleranceDeg,
      };
      if (args.rings) return ok(runShieldGuidanceRingTrend(args.rings, tolerances));
      if (args.design && args.actual) return ok({ mode: "single_pose", ...shieldDeviation(args.design, args.actual, tolerances) });
      throw new Error("shield_guidance 需要提供 design/actual、rings 或 csvText 输入");
    },
  );
}
