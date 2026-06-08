import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok } from "../util.js";

const LEVELING_LIMITS: Record<string, { k: number; unit: string; desc: string }> = {
  "1st": { k: 4, unit: "mm", desc: "一等水准" },
  "2nd": { k: 6, unit: "mm", desc: "二等水准（城市轨道交通监测基准网常用）" },
  "3rd": { k: 12, unit: "mm", desc: "三等水准" },
  "4th": { k: 20, unit: "mm", desc: "四等水准" },
  "city-2nd": { k: 8, unit: "mm", desc: "城市二等水准" },
};

const TRAVERSE_ANGULAR_LIMITS: Record<string, { k: number; desc: string }> = {
  DJ1: { k: 5, desc: "DJ1 经纬仪" },
  DJ2: { k: 10, desc: "DJ2 经纬仪（城市测量常用）" },
  DJ6: { k: 20, desc: "DJ6 经纬仪" },
};

// ============================================================
// Matrix utilities for least squares adjustment
// ============================================================
type Matrix = number[][];

const mat = {
  zeros: (r: number, c: number): Matrix =>
    Array.from({ length: r }, () => Array(c).fill(0) as number[]),

  transpose: (a: Matrix): Matrix => a[0]!.map((_, j) => a.map((row) => row[j]!)),

  mul: (a: Matrix, b: Matrix): Matrix =>
    a.map((row) => b[0]!.map((_, j) => row.reduce((sum, val, k) => sum + val * b[k]![j]!, 0))),

  mulVec: (a: Matrix, v: number[]): number[] =>
    a.map((row) => row.reduce((sum, val, k) => sum + val * v[k]!, 0)),

  invert: (src: Matrix): Matrix | null => {
    const n = src.length;
    const aug = src.map((row, i) => [
      ...row,
      ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
    ]);
    for (let col = 0; col < n; col++) {
      let pivotRow = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row]![col]!) > Math.abs(aug[pivotRow]![col]!)) pivotRow = row;
      }
      if (Math.abs(aug[pivotRow]![col]!) < 1e-15) return null;
      [aug[col], aug[pivotRow]] = [aug[pivotRow]!, aug[col]!];
      const pivot = aug[col]![col]!;
      for (let j = col; j < 2 * n; j++) aug[col]![j]! /= pivot;
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = aug[row]![col]!;
        for (let j = col; j < 2 * n; j++) aug[row]![j]! -= factor * aug[col]![j]!;
      }
    }
    return aug.map((row) => row.slice(n));
  },
};

const deg2rad = (d: number) => (d * Math.PI) / 180;
const rad2deg = (r: number) => (r * 180) / Math.PI;
const ARC_SECONDS_PER_RADIAN = 206264.80624709636;
const TRAVERSE_PRECISION_MODEL = "direction_distance_error_propagation";

type LevelingAdjustmentBenchmark = { id: string; height: number };
type LevelingAdjustmentObservation = { from: string; to: string; heightDiff: number; routeLength: number };
type ParsedLevelingAdjustmentCsv = {
  benchmarks: LevelingAdjustmentBenchmark[];
  observations: LevelingAdjustmentObservation[];
  order: keyof typeof LEVELING_LIMITS | null;
  parsedRowCount: number;
};
type TraverseAdjustmentPoint = { id: string; x: number; y: number };
type TraverseAdjustmentStation = { id: string; angle: number; distance: number };
type ParsedTraverseAdjustmentCsv = {
  startPoint: TraverseAdjustmentPoint;
  endPoint: TraverseAdjustmentPoint;
  startAzimuth: number;
  endAzimuth: number;
  stations: TraverseAdjustmentStation[];
  instrument: keyof typeof TRAVERSE_ANGULAR_LIMITS | null;
  parsedRowCount: number;
};
type PrdLevelAdjustArgs = {
  known_bms: Array<{ name: string; h: number; fixed?: boolean }>;
  segments: Array<{
    from: string;
    to: string;
    dh_m: number;
    length_km?: number;
    n_stations?: number;
    forward_dh_m?: number;
    backward_dh_m?: number;
    baseline_dh_m?: number;
    resurvey_dh_m?: number;
  }>;
  weight_mode: "length" | "stations";
  order?: keyof typeof LEVELING_LIMITS;
  reciprocal_tolerance_mm_per_sqrt_km?: number;
  closure_tolerance_mm_per_sqrt_km?: number;
  resurvey_diff_tolerance_mm_per_sqrt_km?: number;
};
type PrdTraverseAdjustArgs = {
  known_points: Array<{ name: string; x: number; y: number; fixed?: boolean }>;
  observations: Array<{
    from: string;
    to: string;
    hz_angle_deg: number;
    zenith_deg?: number;
    slope_dist_m?: number;
    horizontal_dist_m?: number;
    face_left_hz_deg?: number;
    face_right_hz_deg?: number;
    round_angles_deg?: number[];
    forward_dist_m?: number;
    backward_dist_m?: number;
  }>;
  params: {
    start_azimuth_deg: number;
    end_azimuth_deg: number;
    dir_mse_sec?: number;
    dist_fixed_mm?: number;
    ppm?: number;
    refraction?: number;
    ellipsoid_r?: number;
    height_projection?: boolean;
    two_c_face_tolerance_sec?: number;
    round_diff_tolerance_sec?: number;
    distance_reciprocal_tolerance_mm?: number;
    edge_relative_mse_tolerance_ratio?: number;
    relative_mse_tolerance_ratio?: number;
    model?: "normal" | "helmert" | "free";
  };
};

type TraversePointPrecision = {
  mxMm: number;
  myMm: number;
  pointMseMm: number;
  semiMajorMm: number;
  semiMinorMm: number;
  thetaDeg: number;
};

function normalizeCsvHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\s_\-./]/g, "")
    .toLowerCase();
}

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

function parseLevelingOrder(value: string | undefined): keyof typeof LEVELING_LIMITS | null {
  const normalized = normalizeCsvHeader(value ?? "");
  if (!normalized) return null;
  if (/^(1st|一等|1等)$/.test(normalized)) return "1st";
  if (/^(2nd|二等|2等)$/.test(normalized)) return "2nd";
  if (/^(3rd|三等|3等)$/.test(normalized)) return "3rd";
  if (/^(4th|四等|4等)$/.test(normalized)) return "4th";
  if (/^(city2nd|城市二等|城市2等)$/.test(normalized)) return "city-2nd";
  return null;
}

function parseTraverseInstrument(value: string | undefined): keyof typeof TRAVERSE_ANGULAR_LIMITS | null {
  const normalized = normalizeCsvHeader(value ?? "").toUpperCase();
  if (normalized === "DJ1") return "DJ1";
  if (normalized === "DJ2") return "DJ2";
  if (normalized === "DJ6") return "DJ6";
  return null;
}

function parseAngleCell(value: string): number {
  const trimmed = value.trim();
  const dashed = trimmed.match(/^(-?\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (dashed) {
    const sign = Number(dashed[1]) < 0 ? -1 : 1;
    const d = Math.abs(Number(dashed[1]));
    const m = Number(dashed[2]);
    const s = Number(dashed[3]);
    if (Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(s) && m < 60 && s < 60) {
      return sign * (d + m / 60 + s / 3600);
    }
  }
  const dms = trimmed.match(
    /^(-?\d+(?:\.\d+)?)(?:[°度:\s]+(\d+(?:\.\d+)?))?(?:['′分:\s]+(\d+(?:\.\d+)?))?(?:["″秒]?)$/,
  );
  if (dms) {
    const sign = Number(dms[1]) < 0 ? -1 : 1;
    const d = Math.abs(Number(dms[1]));
    const m = Number(dms[2] ?? 0);
    const s = Number(dms[3] ?? 0);
    if (Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(s) && m < 60 && s < 60) {
      return sign * (d + m / 60 + s / 3600);
    }
  }
  return parseNumericCell(value);
}

const LEVELING_ADJUSTMENT_CSV_ALIASES = new Map<
  string,
  "role" | "pointId" | "height" | "from" | "to" | "heightDiff" | "routeLength" | "order"
>(
  [
    ["role", "role"],
    ["type", "role"],
    ["类型", "role"],
    ["记录类型", "role"],
    ["id", "pointId"],
    ["pointid", "pointId"],
    ["点号", "pointId"],
    ["点名", "pointId"],
    ["编号", "pointId"],
    ["height", "height"],
    ["elevation", "height"],
    ["高程", "height"],
    ["已知高程", "height"],
    ["from", "from"],
    ["start", "from"],
    ["起点", "from"],
    ["后视", "from"],
    ["后视点", "from"],
    ["to", "to"],
    ["end", "to"],
    ["终点", "to"],
    ["前视", "to"],
    ["前视点", "to"],
    ["heightdiff", "heightDiff"],
    ["heightdifference", "heightDiff"],
    ["dh", "heightDiff"],
    ["高差", "heightDiff"],
    ["观测高差", "heightDiff"],
    ["routeLength", "routeLength"],
    ["routelengthkm", "routeLength"],
    ["distancekm", "routeLength"],
    ["测段距离", "routeLength"],
    ["测段距离km", "routeLength"],
    ["路线长度", "routeLength"],
    ["等级", "order"],
    ["order", "order"],
    ["levelingorder", "order"],
  ].map(([alias, key]) => [
    normalizeCsvHeader(alias),
    key as "role" | "pointId" | "height" | "from" | "to" | "heightDiff" | "routeLength" | "order",
  ]),
);

function parseLevelingAdjustmentCsv(
  text: string,
  delimiterOption: "auto" | "comma" | "tab" | "semicolon",
): ParsedLevelingAdjustmentCsv {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("calculator_leveling_adjustment CSV 至少需要表头和 1 行数据");
  const delimiter = detectCsvDelimiter(lines[0]!, delimiterOption);
  const headers = splitDelimitedLine(lines[0]!, delimiter).map((header) =>
    LEVELING_ADJUSTMENT_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  const benchmarks: LevelingAdjustmentBenchmark[] = [];
  const observations: LevelingAdjustmentObservation[] = [];
  let order: keyof typeof LEVELING_LIMITS | null = null;
  for (const line of lines.slice(1)) {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, index) => {
      const key = headers[index];
      if (key) row[key] = cell;
    });
    order = order ?? parseLevelingOrder(row.order);
    const role = row.role ?? "";
    const pointId = row.pointId?.trim();
    const height = parseNumericCell(row.height ?? "");
    if (pointId && Number.isFinite(height) && /已知|known|benchmark|bm|基准/i.test(role)) {
      benchmarks.push({ id: pointId, height });
      continue;
    }
    const from = row.from?.trim();
    const to = row.to?.trim();
    let heightDiff = parseNumericCell(row.heightDiff ?? "");
    if (Number.isFinite(heightDiff) && Math.abs(heightDiff) > 10) heightDiff /= 1000;
    const routeLength = parseNumericCell(row.routeLength ?? "");
    const looksLikeObservation = /观测|observation|obs|测段/i.test(role) || Boolean(from && to && Number.isFinite(heightDiff));
    if (looksLikeObservation && from && to && Number.isFinite(heightDiff) && Number.isFinite(routeLength) && routeLength > 0) {
      observations.push({ from, to, heightDiff, routeLength });
    }
  }
  if (benchmarks.length === 0) throw new Error("calculator_leveling_adjustment CSV 至少需要 1 个已知高程点");
  if (observations.length === 0) throw new Error("calculator_leveling_adjustment CSV 未解析到有效高差观测");
  return { benchmarks, observations, order, parsedRowCount: lines.length - 1 };
}

const TRAVERSE_ADJUSTMENT_CSV_ALIASES = new Map<
  string,
  "role" | "pointId" | "x" | "y" | "startAzimuth" | "endAzimuth" | "angle" | "distance" | "instrument"
>(
  [
    ["role", "role"],
    ["type", "role"],
    ["类型", "role"],
    ["记录类型", "role"],
    ["id", "pointId"],
    ["pointid", "pointId"],
    ["点号", "pointId"],
    ["点名", "pointId"],
    ["编号", "pointId"],
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
    ["startazimuth", "startAzimuth"],
    ["initialazimuth", "startAzimuth"],
    ["起始方位角", "startAzimuth"],
    ["起算方位角", "startAzimuth"],
    ["起始边方位角", "startAzimuth"],
    ["endazimuth", "endAzimuth"],
    ["closingazimuth", "endAzimuth"],
    ["终止方位角", "endAzimuth"],
    ["终边方位角", "endAzimuth"],
    ["闭合方位角", "endAzimuth"],
    ["angle", "angle"],
    ["observedangle", "angle"],
    ["turnangle", "angle"],
    ["观测角", "angle"],
    ["转折角", "angle"],
    ["左角", "angle"],
    ["distance", "distance"],
    ["distanceM", "distance"],
    ["边长", "distance"],
    ["边长m", "distance"],
    ["距离", "distance"],
    ["仪器", "instrument"],
    ["instrument", "instrument"],
    ["仪器等级", "instrument"],
  ].map(([alias, key]) => [
    normalizeCsvHeader(alias),
    key as "role" | "pointId" | "x" | "y" | "startAzimuth" | "endAzimuth" | "angle" | "distance" | "instrument",
  ]),
);

function parseTraverseAdjustmentCsv(
  text: string,
  delimiterOption: "auto" | "comma" | "tab" | "semicolon",
): ParsedTraverseAdjustmentCsv {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("calculator_traverse_adjustment CSV 至少需要表头和 1 行数据");
  const delimiter = detectCsvDelimiter(lines[0]!, delimiterOption);
  const headers = splitDelimitedLine(lines[0]!, delimiter).map((header) =>
    TRAVERSE_ADJUSTMENT_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  let startPoint: TraverseAdjustmentPoint | null = null;
  let endPoint: TraverseAdjustmentPoint | null = null;
  let startAzimuth = Number.NaN;
  let endAzimuth = Number.NaN;
  let instrument: keyof typeof TRAVERSE_ANGULAR_LIMITS | null = null;
  const stations: TraverseAdjustmentStation[] = [];
  for (const line of lines.slice(1)) {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, index) => {
      const key = headers[index];
      if (key) row[key] = cell;
    });
    instrument = instrument ?? parseTraverseInstrument(row.instrument);
    const role = row.role ?? "";
    const pointId = row.pointId?.trim();
    const x = parseNumericCell(row.x ?? "");
    const y = parseNumericCell(row.y ?? "");
    const rowStartAzimuth = parseAngleCell(row.startAzimuth ?? "");
    const rowEndAzimuth = parseAngleCell(row.endAzimuth ?? "");
    if (!Number.isFinite(startAzimuth) && Number.isFinite(rowStartAzimuth)) startAzimuth = rowStartAzimuth;
    if (!Number.isFinite(endAzimuth) && Number.isFinite(rowEndAzimuth)) endAzimuth = rowEndAzimuth;
    if (pointId && Number.isFinite(x) && Number.isFinite(y) && /起点|起始|起算|start/i.test(role)) {
      startPoint = { id: pointId, x, y };
      continue;
    }
    if (pointId && Number.isFinite(x) && Number.isFinite(y) && /终点|终止|闭合|end/i.test(role)) {
      endPoint = { id: pointId, x, y };
      continue;
    }
    const angle = parseAngleCell(row.angle ?? "");
    const distance = parseNumericCell(row.distance ?? "");
    const looksLikeStation = /测站|导线|station|leg/i.test(role) || (pointId && Number.isFinite(angle) && Number.isFinite(distance));
    if (looksLikeStation && pointId && Number.isFinite(angle) && Number.isFinite(distance) && distance > 0) {
      stations.push({ id: pointId, angle, distance });
    }
  }
  if (!startPoint) throw new Error("calculator_traverse_adjustment CSV 未解析到起点坐标");
  if (!endPoint) throw new Error("calculator_traverse_adjustment CSV 未解析到终点坐标");
  if (!Number.isFinite(startAzimuth)) throw new Error("calculator_traverse_adjustment CSV 未解析到起始方位角");
  if (!Number.isFinite(endAzimuth)) throw new Error("calculator_traverse_adjustment CSV 未解析到终止方位角");
  if (stations.length === 0) throw new Error("calculator_traverse_adjustment CSV 未解析到有效测站观测");
  return { startPoint, endPoint, startAzimuth, endAzimuth, stations, instrument, parsedRowCount: lines.length - 1 };
}

function levelQualityRow(
  checkItem: string,
  observedValue: number,
  toleranceValue: number,
  unit: string,
  failedAction: string,
): Record<string, unknown> {
  const withinTolerance = Math.abs(observedValue) <= Math.abs(toleranceValue);
  return {
    row_type: "level_quality_check",
    check_item: checkItem,
    observed_value: Number(observedValue.toFixed(3)),
    tolerance_value: Number(Math.abs(toleranceValue).toFixed(3)),
    unit,
    status: withinTolerance ? "合格" : "超限",
    within_tolerance: withinTolerance,
    action: withinTolerance ? "accept" : failedAction,
  };
}

function levelReciprocalQualityChecks(
  segments: PrdLevelAdjustArgs["segments"],
  order: keyof typeof LEVELING_LIMITS,
  reciprocalToleranceMmPerSqrtKm?: number,
): {
  rows: Array<Record<string, unknown>>;
  segmentRows: Array<Record<string, unknown>>;
  maxReciprocalHeightDiffMm: number | null;
  reciprocalHeightDiffToleranceMm: number | null;
  failedCount: number;
} {
  const baseTolerance = Math.abs(reciprocalToleranceMmPerSqrtKm ?? LEVELING_LIMITS[order]!.k);
  const segmentRows: Array<Record<string, unknown>> = [];
  segments.forEach((segment, index) => {
    if (
      !Number.isFinite(segment.forward_dh_m ?? Number.NaN) ||
      !Number.isFinite(segment.backward_dh_m ?? Number.NaN)
    ) {
      return;
    }
    const lengthKm = Math.max(segment.length_km ?? 1, 1e-9);
    const reciprocalHeightDiffMm = Number((Math.abs(segment.forward_dh_m! + segment.backward_dh_m!) * 1000).toFixed(3));
    const toleranceMm = Number((baseTolerance * Math.sqrt(lengthKm)).toFixed(3));
    const withinTolerance = reciprocalHeightDiffMm <= toleranceMm;
    segmentRows.push({
      row_type: "level_segment_summary",
      segment_id: `L${index + 1}`,
      from: segment.from,
      to: segment.to,
      dh_m: segment.dh_m,
      length_km: segment.length_km ?? null,
      n_stations: segment.n_stations ?? null,
      forward_dh_m: segment.forward_dh_m,
      backward_dh_m: segment.backward_dh_m,
      reciprocal_height_diff_mm: reciprocalHeightDiffMm,
      reciprocal_tolerance_mm: toleranceMm,
      reciprocal_ratio_pct: Number(((reciprocalHeightDiffMm / Math.max(toleranceMm, 1e-9)) * 100).toFixed(3)),
      order,
      status: withinTolerance ? "合格" : "超限",
      within_tolerance: withinTolerance,
    });
  });
  if (segmentRows.length === 0) {
    return {
      rows: [],
      segmentRows: [],
      maxReciprocalHeightDiffMm: null,
      reciprocalHeightDiffToleranceMm: null,
      failedCount: 0,
    };
  }
  const worstRow = segmentRows.reduce((worst, row) => {
    const rowRatio =
      Number(row.reciprocal_height_diff_mm ?? 0) / Math.max(Number(row.reciprocal_tolerance_mm ?? 1), 1e-9);
    const worstRatio =
      Number(worst.reciprocal_height_diff_mm ?? 0) / Math.max(Number(worst.reciprocal_tolerance_mm ?? 1), 1e-9);
    return rowRatio > worstRatio ? row : worst;
  }, segmentRows[0]!);
  const maxDiff = Number(worstRow.reciprocal_height_diff_mm ?? 0);
  const tolerance = Number(worstRow.reciprocal_tolerance_mm ?? 0);
  const rows = [levelQualityRow("往返高差较差", maxDiff, tolerance, "mm", "review_reciprocal_leveling")];
  return {
    rows,
    segmentRows,
    maxReciprocalHeightDiffMm: maxDiff,
    reciprocalHeightDiffToleranceMm: tolerance,
    failedCount: rows.filter((row) => row.status === "超限").length,
  };
}

function levelRouteClosureChecks(
  segments: PrdLevelAdjustArgs["segments"],
  knownMap: Map<string, number>,
  order: keyof typeof LEVELING_LIMITS,
  closureToleranceMmPerSqrtKm?: number,
): {
  rows: Array<Record<string, unknown>>;
  routeRows: Array<Record<string, unknown>>;
  maxRouteClosureMm: number | null;
  routeClosureToleranceMm: number | null;
  failedCount: number;
} {
  const baseTolerance = Math.abs(closureToleranceMmPerSqrtKm ?? LEVELING_LIMITS[order]!.k);
  const routeRows: Array<Record<string, unknown>> = [];
  let routeSegments: PrdLevelAdjustArgs["segments"] = [];

  const finalizeRoute = () => {
    if (routeSegments.length === 0) return;
    const first = routeSegments[0]!;
    const last = routeSegments[routeSegments.length - 1]!;
    if (knownMap.has(first.from) && knownMap.has(last.to)) {
      const observedDhM = routeSegments.reduce((sum, segment) => sum + segment.dh_m, 0);
      const knownDhM = knownMap.get(last.to)! - knownMap.get(first.from)!;
      const routeLengthKm = routeSegments.reduce((sum, segment) => sum + Math.max(segment.length_km ?? 1, 1e-9), 0);
      const closureMm = Number(((observedDhM - knownDhM) * 1000).toFixed(3));
      const toleranceMm = Number((baseTolerance * Math.sqrt(Math.max(routeLengthKm, 1e-9))).toFixed(3));
      const withinTolerance = Math.abs(closureMm) <= toleranceMm;
      routeRows.push({
        row_type: "level_route_closure",
        route_id: `R${routeRows.length + 1}`,
        from: first.from,
        to: last.to,
        segment_count: routeSegments.length,
        route_length_km: Number(routeLengthKm.toFixed(6)),
        observed_dh_m: Number(observedDhM.toFixed(6)),
        known_dh_m: Number(knownDhM.toFixed(6)),
        closure_mm: closureMm,
        tolerance_mm: toleranceMm,
        closure_ratio_pct: Number(((Math.abs(closureMm) / Math.max(toleranceMm, 1e-9)) * 100).toFixed(3)),
        order,
        status: withinTolerance ? "合格" : "超限",
        within_tolerance: withinTolerance,
      });
    }
    routeSegments = [];
  };

  for (const segment of segments) {
    const previous = routeSegments[routeSegments.length - 1];
    if (previous && previous.to !== segment.from) finalizeRoute();
    routeSegments.push(segment);
    if (knownMap.has(segment.to)) finalizeRoute();
  }
  finalizeRoute();

  if (routeRows.length === 0) {
    return {
      rows: [],
      routeRows: [],
      maxRouteClosureMm: null,
      routeClosureToleranceMm: null,
      failedCount: 0,
    };
  }
  const worstRow = routeRows.reduce((worst, row) => {
    const rowRatio = Math.abs(Number(row.closure_mm ?? 0)) / Math.max(Number(row.tolerance_mm ?? 1), 1e-9);
    const worstRatio = Math.abs(Number(worst.closure_mm ?? 0)) / Math.max(Number(worst.tolerance_mm ?? 1), 1e-9);
    return rowRatio > worstRatio ? row : worst;
  }, routeRows[0]!);
  const maxClosure = Math.abs(Number(worstRow.closure_mm ?? 0));
  const tolerance = Number(worstRow.tolerance_mm ?? 0);
  const rows = [levelQualityRow("路线闭合差", maxClosure, tolerance, "mm", "review_level_route_closure")];
  return {
    rows,
    routeRows,
    maxRouteClosureMm: maxClosure,
    routeClosureToleranceMm: tolerance,
    failedCount: rows.filter((row) => row.status === "超限").length,
  };
}

function levelResurveyQualityChecks(
  segments: PrdLevelAdjustArgs["segments"],
  order: keyof typeof LEVELING_LIMITS,
  resurveyDiffToleranceMmPerSqrtKm?: number,
): {
  rows: Array<Record<string, unknown>>;
  segmentRows: Array<Record<string, unknown>>;
  maxResurveyHeightDiffMm: number | null;
  resurveyHeightDiffToleranceMm: number | null;
  failedCount: number;
} {
  const baseTolerance = Math.abs(resurveyDiffToleranceMmPerSqrtKm ?? LEVELING_LIMITS[order]!.k);
  const segmentRows: Array<Record<string, unknown>> = [];
  segments.forEach((segment, index) => {
    if (
      !Number.isFinite(segment.baseline_dh_m ?? Number.NaN) ||
      !Number.isFinite((segment.resurvey_dh_m ?? segment.dh_m) ?? Number.NaN)
    ) {
      return;
    }
    const lengthKm = Math.max(segment.length_km ?? 1, 1e-9);
    const resurveyDhM = segment.resurvey_dh_m ?? segment.dh_m;
    const heightDiffMm = Number(((resurveyDhM - segment.baseline_dh_m!) * 1000).toFixed(3));
    const toleranceMm = Number((baseTolerance * Math.sqrt(lengthKm)).toFixed(3));
    const withinTolerance = Math.abs(heightDiffMm) <= toleranceMm;
    segmentRows.push({
      row_type: "level_resurvey_segment_check",
      segment_id: `L${index + 1}`,
      from: segment.from,
      to: segment.to,
      length_km: segment.length_km ?? null,
      n_stations: segment.n_stations ?? null,
      baseline_dh_m: segment.baseline_dh_m,
      resurvey_dh_m: resurveyDhM,
      height_diff_mm: heightDiffMm,
      tolerance_mm: toleranceMm,
      height_diff_ratio_pct: Number(((Math.abs(heightDiffMm) / Math.max(toleranceMm, 1e-9)) * 100).toFixed(3)),
      order,
      status: withinTolerance ? "合格" : "超限",
      within_tolerance: withinTolerance,
    });
  });
  if (segmentRows.length === 0) {
    return {
      rows: [],
      segmentRows: [],
      maxResurveyHeightDiffMm: null,
      resurveyHeightDiffToleranceMm: null,
      failedCount: 0,
    };
  }
  const worstRow = segmentRows.reduce((worst, row) => {
    const rowRatio = Math.abs(Number(row.height_diff_mm ?? 0)) / Math.max(Number(row.tolerance_mm ?? 1), 1e-9);
    const worstRatio = Math.abs(Number(worst.height_diff_mm ?? 0)) / Math.max(Number(worst.tolerance_mm ?? 1), 1e-9);
    return rowRatio > worstRatio ? row : worst;
  }, segmentRows[0]!);
  const maxDiff = Math.abs(Number(worstRow.height_diff_mm ?? 0));
  const tolerance = Number(worstRow.tolerance_mm ?? 0);
  const rows = [levelQualityRow("CP2/CP3复测高差之差", maxDiff, tolerance, "mm", "review_cp_level_resurvey")];
  return {
    rows,
    segmentRows,
    maxResurveyHeightDiffMm: maxDiff,
    resurveyHeightDiffToleranceMm: tolerance,
    failedCount: rows.filter((row) => row.status === "超限").length,
  };
}

export function calculatePrdLevelAdjust(args: PrdLevelAdjustArgs): Record<string, unknown> {
  const knownMap = new Map(args.known_bms.map((point) => [point.name, point.h]));
  const unknownNames = [
    ...new Set(args.segments.flatMap((segment) => [segment.from, segment.to]).filter((name) => !knownMap.has(name))),
  ];
  const unknownCount = unknownNames.length;
  const segmentCount = args.segments.length;
  if (args.known_bms.length === 0) throw new Error("level_adjust 至少需要 1 个已知水准点 known_bms");
  if (segmentCount === 0) throw new Error("level_adjust 至少需要 1 条水准测段 segments");
  if (unknownCount === 0) throw new Error("level_adjust 没有待定点，无需平差");
  if (segmentCount < unknownCount) {
    throw new Error(`level_adjust 观测数 ${segmentCount} 少于未知点数 ${unknownCount}，无法严密平差`);
  }
  const order = args.order ?? "2nd";
  const fieldQuality = levelReciprocalQualityChecks(
    args.segments,
    order,
    args.reciprocal_tolerance_mm_per_sqrt_km,
  );
  const routeClosureQuality = levelRouteClosureChecks(
    args.segments,
    knownMap,
    order,
    args.closure_tolerance_mm_per_sqrt_km,
  );
  const resurveyQuality = levelResurveyQualityChecks(
    args.segments,
    order,
    args.resurvey_diff_tolerance_mm_per_sqrt_km,
  );
  const fieldQualityFailedCount = fieldQuality.failedCount + routeClosureQuality.failedCount + resurveyQuality.failedCount;

  const indexOf = (name: string) => unknownNames.indexOf(name);
  const A = mat.zeros(segmentCount, unknownCount);
  const P = mat.zeros(segmentCount, segmentCount);
  const L: number[] = [];
  args.segments.forEach((segment, row) => {
    const fromIndex = indexOf(segment.from);
    const toIndex = indexOf(segment.to);
    if (fromIndex >= 0) A[row]![fromIndex] = -1;
    if (toIndex >= 0) A[row]![toIndex] = 1;
    const weightBase =
      args.weight_mode === "stations"
        ? Math.max(segment.n_stations ?? 1, 1)
        : Math.max(segment.length_km ?? 1, 1e-9);
    P[row]![row] = 1 / weightBase;
    const fromKnown = knownMap.get(segment.from) ?? 0;
    const toKnown = knownMap.get(segment.to) ?? 0;
    L.push(segment.dh_m - (toKnown - fromKnown));
  });

  const AT = mat.transpose(A);
  const ATP = mat.mul(AT, P);
  const N = mat.mul(ATP, A);
  const b = mat.mulVec(ATP, L);
  const Qxx = mat.invert(N);
  if (!Qxx) throw new Error("level_adjust 法方程矩阵奇异，请检查水准网是否连通");
  const X = mat.mulVec(Qxx, b);
  const AX = mat.mulVec(A, X);
  const V = AX.map((value, index) => value - L[index]!);
  const VTPV = V.reduce((sum, value, index) => sum + value * P[index]![index]! * value, 0);
  const redundancy = segmentCount - unknownCount;
  const sigma0 = redundancy > 0 ? Math.sqrt(VTPV / redundancy) : 0;
  const points = [
    ...args.known_bms.map((point) => ({
      name: point.name,
      h: Number(point.h.toFixed(4)),
      mh: 0,
      fixed: point.fixed ?? true,
    })),
    ...unknownNames.map((name, index) => ({
      name,
      h: Number((X[index] ?? 0).toFixed(4)),
      mh: Number((sigma0 * Math.sqrt(Math.abs(Qxx[index]![index]!)) * 1000).toFixed(3)),
      fixed: false,
    })),
  ];
  const adjustedHeightByName = new Map(points.map((point) => [point.name, point.h]));
  const segmentTable = args.segments.map((segment, index) => ({
    from: segment.from,
    to: segment.to,
    from_height_m: Number.isFinite(adjustedHeightByName.get(segment.from) ?? Number.NaN)
      ? Number((adjustedHeightByName.get(segment.from) ?? 0).toFixed(4))
      : null,
    to_height_m: Number.isFinite(adjustedHeightByName.get(segment.to) ?? Number.NaN)
      ? Number((adjustedHeightByName.get(segment.to) ?? 0).toFixed(4))
      : null,
    dh_m: segment.dh_m,
    observed_dh_m: segment.dh_m,
    adjusted_dh_m:
      Number.isFinite(adjustedHeightByName.get(segment.from) ?? Number.NaN) &&
      Number.isFinite(adjustedHeightByName.get(segment.to) ?? Number.NaN)
        ? Number(((adjustedHeightByName.get(segment.to) ?? 0) - (adjustedHeightByName.get(segment.from) ?? 0)).toFixed(6))
        : null,
    length_km: segment.length_km ?? null,
    n_stations: segment.n_stations ?? null,
    correction_mm: Number((V[index]! * 1000).toFixed(3)),
    residual_mm: Number((V[index]! * 1000).toFixed(3)),
    residual_per_km_mm:
      Number.isFinite(segment.length_km ?? Number.NaN) && Math.abs(segment.length_km ?? 0) > 1e-9
        ? Number(((V[index]! * 1000) / segment.length_km!).toFixed(3))
        : null,
    standardized_residual: sigma0 > 1e-12 ? Number(((V[index]! * Math.sqrt(P[index]![index]!)) / sigma0).toFixed(4)) : 0,
    weight: Number(P[index]![index]!.toFixed(6)),
  }));
  const maxResidualMm = segmentTable.reduce(
    (max, row) => Math.max(max, Math.abs(row.residual_mm)),
    0,
  );
  const minHeight = Math.min(...points.map((point) => point.h));
  const maxHeight = Math.max(...points.map((point) => point.h));
  const heightSpan = Math.max(maxHeight - minHeight, 1e-9);
  const networkNodes = points.map((point, index) => ({
    row_type: "level_network_node",
    point_name: point.name,
    adjusted_height_m: point.h,
    mh_mm: point.mh,
    fixed: point.fixed,
    diagram_x: Number((80 + index * 140).toFixed(3)),
    diagram_y: Number((180 - ((point.h - minHeight) / heightSpan) * 120).toFixed(3)),
  }));
  const networkNodeByName = new Map(networkNodes.map((node) => [node.point_name, node]));
  const networkSegments = segmentTable.map((segment, index) => {
    const fromNode = networkNodeByName.get(segment.from);
    const toNode = networkNodeByName.get(segment.to);
    return {
      row_type: "level_network_segment",
      segment_id: `L${index + 1}`,
      from: segment.from,
      to: segment.to,
      from_x: fromNode?.diagram_x ?? null,
      from_y: fromNode?.diagram_y ?? null,
      to_x: toNode?.diagram_x ?? null,
      to_y: toNode?.diagram_y ?? null,
      dh_m: segment.dh_m,
      residual_mm: segment.residual_mm,
      weight: segment.weight,
    };
  });
  const unitWeightMseMm = Number((sigma0 * 1000).toFixed(3));
  const exportRows = [
    ...fieldQuality.rows,
    ...routeClosureQuality.rows,
    ...resurveyQuality.rows,
    {
      row_type: "level_adjustment_summary",
      known_bm_count: args.known_bms.length,
      unknown_point_count: unknownCount,
      segment_count: segmentCount,
      redundancy,
      weight_mode: args.weight_mode,
      unit_weight_mse_mm: unitWeightMseMm,
      max_residual_mm: Number(maxResidualMm.toFixed(3)),
      max_reciprocal_height_diff_mm: fieldQuality.maxReciprocalHeightDiffMm,
      reciprocal_height_diff_tolerance_mm: fieldQuality.reciprocalHeightDiffToleranceMm,
      max_route_closure_mm: routeClosureQuality.maxRouteClosureMm,
      route_closure_tolerance_mm: routeClosureQuality.routeClosureToleranceMm,
      max_resurvey_height_diff_mm: resurveyQuality.maxResurveyHeightDiffMm,
      resurvey_height_diff_tolerance_mm: resurveyQuality.resurveyHeightDiffToleranceMm,
      field_quality_failed_count: fieldQualityFailedCount,
      quality_status: fieldQualityFailedCount > 0 ? "review" : "pass",
    },
    ...points.map((point) => ({
      row_type: "level_adjusted_height",
      point_name: point.name,
      adjusted_height_m: point.h,
      mh_mm: point.mh,
      fixed: point.fixed,
    })),
    ...fieldQuality.segmentRows,
    ...routeClosureQuality.routeRows,
    ...resurveyQuality.segmentRows,
    ...segmentTable.map((segment) => ({
      row_type: "level_adjust_segment_residual",
      from: segment.from,
      to: segment.to,
      dh_m: segment.dh_m,
      from_height_m: segment.from_height_m,
      to_height_m: segment.to_height_m,
      observed_dh_m: segment.observed_dh_m,
      adjusted_dh_m: segment.adjusted_dh_m,
      length_km: segment.length_km,
      n_stations: segment.n_stations,
      correction_mm: segment.correction_mm,
      residual_mm: segment.residual_mm,
      residual_per_km_mm: segment.residual_per_km_mm,
      standardized_residual: segment.standardized_residual,
      weight: segment.weight,
    })),
    ...networkNodes,
    ...networkSegments,
  ];

  return {
    method: "least_squares_level_adjustment",
    weight_mode: args.weight_mode,
    known_bm_count: args.known_bms.length,
    unknown_point_count: unknownCount,
    segment_count: segmentCount,
    redundancy,
    unit_weight_mse_mm: unitWeightMseMm,
    quality_status: fieldQualityFailedCount > 0 ? "review" : "pass",
    max_reciprocal_height_diff_mm: fieldQuality.maxReciprocalHeightDiffMm,
    reciprocal_height_diff_tolerance_mm: fieldQuality.reciprocalHeightDiffToleranceMm,
    max_route_closure_mm: routeClosureQuality.maxRouteClosureMm,
    route_closure_tolerance_mm: routeClosureQuality.routeClosureToleranceMm,
    max_resurvey_height_diff_mm: resurveyQuality.maxResurveyHeightDiffMm,
    resurvey_height_diff_tolerance_mm: resurveyQuality.resurveyHeightDiffToleranceMm,
    closures: {
      max_residual_mm: Number(maxResidualMm.toFixed(3)),
      max_reciprocal_height_diff_mm: fieldQuality.maxReciprocalHeightDiffMm,
      max_route_closure_mm: routeClosureQuality.maxRouteClosureMm,
      max_resurvey_height_diff_mm: resurveyQuality.maxResurveyHeightDiffMm,
    },
    points,
    segment_table: segmentTable,
    log: [
      "组建水准网间接平差误差方程 V=A·x-L",
      `权阵按 ${args.weight_mode === "length" ? "测段长度" : "测站数"} 取倒数`,
      "解算法方程 N=AᵀPA，输出高程中误差和测段残差",
    ],
    export_rows: exportRows,
  };
}

function horizontalDistanceFromTraverseObservation(observation: PrdTraverseAdjustArgs["observations"][number]): number {
  if (Number.isFinite(observation.horizontal_dist_m ?? Number.NaN)) return observation.horizontal_dist_m!;
  const slope = observation.slope_dist_m;
  if (!Number.isFinite(slope ?? Number.NaN)) throw new Error(`traverse_adjust 观测 ${observation.from}->${observation.to} 缺少距离`);
  if (!Number.isFinite(observation.zenith_deg ?? Number.NaN)) return slope!;
  return Math.abs(slope! * Math.sin(deg2rad(observation.zenith_deg!)));
}

function normalizedAngleDiffDeg(actual: number, expected: number): number {
  return Math.abs(((actual - expected + 540) % 360) - 180);
}

function maxTraverseRoundDiffSec(angles: number[]): number | null {
  const validAngles = angles.filter((angle) => Number.isFinite(angle));
  if (validAngles.length < 2) return null;
  let maxDiffDeg = 0;
  for (let left = 0; left < validAngles.length; left += 1) {
    for (let right = left + 1; right < validAngles.length; right += 1) {
      maxDiffDeg = Math.max(maxDiffDeg, normalizedAngleDiffDeg(validAngles[left]!, validAngles[right]!));
    }
  }
  return Number((maxDiffDeg * 3600).toFixed(3));
}

function traverseQualityRow(
  checkItem: string,
  observedValue: number,
  toleranceValue: number,
  unit: string,
  failedAction: string,
): Record<string, unknown> {
  const withinTolerance = Math.abs(observedValue) <= toleranceValue;
  return {
    row_type: "traverse_quality_check",
    check_item: checkItem,
    observed_value: Number(observedValue.toFixed(3)),
    tolerance_value: Number(toleranceValue.toFixed(3)),
    unit,
    status: withinTolerance ? "合格" : "超限",
    within_tolerance: withinTolerance,
    action: withinTolerance ? "accept" : failedAction,
  };
}

function traverseFieldQualityChecks(
  observations: PrdTraverseAdjustArgs["observations"],
  params: PrdTraverseAdjustArgs["params"],
): {
  rows: Array<Record<string, unknown>>;
  maxTwoCSec: number | null;
  maxRoundDiffSec: number | null;
  maxReciprocalDistanceDiffMm: number | null;
  failedCount: number;
} {
  const twoCToleranceSec = Math.abs(params.two_c_face_tolerance_sec ?? 20);
  const roundToleranceSec = Math.abs(params.round_diff_tolerance_sec ?? 12);
  const distanceToleranceMm = Math.abs(params.distance_reciprocal_tolerance_mm ?? 5);
  const twoCValues = observations
    .map((observation) =>
      Number.isFinite(observation.face_left_hz_deg ?? Number.NaN) &&
      Number.isFinite(observation.face_right_hz_deg ?? Number.NaN)
        ? Number((normalizedAngleDiffDeg(observation.face_right_hz_deg!, observation.face_left_hz_deg! + 180) * 3600).toFixed(3))
        : null,
    )
    .filter((value): value is number => value !== null);
  const roundValues = observations
    .map((observation) => maxTraverseRoundDiffSec(observation.round_angles_deg ?? []))
    .filter((value): value is number => value !== null);
  const distanceValues = observations
    .map((observation) =>
      Number.isFinite(observation.forward_dist_m ?? Number.NaN) &&
      Number.isFinite(observation.backward_dist_m ?? Number.NaN)
        ? Number((Math.abs(observation.forward_dist_m! - observation.backward_dist_m!) * 1000).toFixed(3))
        : null,
    )
    .filter((value): value is number => value !== null);
  const rows: Array<Record<string, unknown>> = [];
  const maxTwoCSec = twoCValues.length > 0 ? Math.max(...twoCValues) : null;
  const maxRound = roundValues.length > 0 ? Math.max(...roundValues) : null;
  const maxDistance = distanceValues.length > 0 ? Math.max(...distanceValues) : null;
  if (maxTwoCSec !== null) rows.push(traverseQualityRow("2C差", maxTwoCSec, twoCToleranceSec, "sec", "review_face_observations"));
  if (maxRound !== null) rows.push(traverseQualityRow("测回差", maxRound, roundToleranceSec, "sec", "review_round_observations"));
  if (maxDistance !== null) rows.push(traverseQualityRow("测距往返差", maxDistance, distanceToleranceMm, "mm", "review_reciprocal_distance"));
  return {
    rows,
    maxTwoCSec,
    maxRoundDiffSec: maxRound,
    maxReciprocalDistanceDiffMm: maxDistance,
    failedCount: rows.filter((row) => row.status === "超限").length,
  };
}

function traverseLeastSquaresDiagnostics(
  observations: PrdTraverseAdjustArgs["observations"],
  distances: number[],
  startPoint: { name: string; x: number; y: number },
  fixedEnd: { name: string; x: number; y: number },
  startAzimuthDeg: number,
  angularClosureDeg: number,
  params: PrdTraverseAdjustArgs["params"],
): {
  metrics: Record<string, unknown>;
  summary: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
} {
  const stationCount = observations.length;
  const conditionCount = 3;
  const observationCount = stationCount * 2;
  const model = "angle_distance_condition_lsq";
  const empty = {
    least_squares_model: model,
    least_squares_condition_count: 0,
    least_squares_observation_count: observationCount,
    least_squares_redundancy: 0,
    least_squares_status: "not_enough_observations",
  };
  if (stationCount === 0) return { metrics: empty, summary: empty, rows: [] };

  const directionMseSec = Math.max(1e-9, Math.abs(params.dir_mse_sec ?? 1));
  const distFixedMm = Math.max(0, Math.abs(params.dist_fixed_mm ?? 1));
  const ppm = Math.max(0, Math.abs(params.ppm ?? 1));
  const angleSigmaRad = directionMseSec / ARC_SECONDS_PER_RADIAN;
  const rawAzimuths: number[] = [];
  let azimuth = startAzimuthDeg;
  for (const observation of observations) {
    azimuth = (((azimuth + observation.hz_angle_deg + 180) % 360) + 360) % 360;
    rawAzimuths.push(azimuth);
  }
  const rawAzimuthRads = rawAzimuths.map(deg2rad);
  const rawDx = distances.map((distance, index) => distance * Math.sin(rawAzimuthRads[index] ?? 0));
  const rawDy = distances.map((distance, index) => distance * Math.cos(rawAzimuthRads[index] ?? 0));
  const rawFx = rawDx.reduce((sum, value) => sum + value, 0) - (fixedEnd.x - startPoint.x);
  const rawFy = rawDy.reduce((sum, value) => sum + value, 0) - (fixedEnd.y - startPoint.y);
  const conditionVector = [deg2rad(angularClosureDeg), rawFx, rawFy];
  const design = mat.zeros(conditionCount, observationCount);

  for (let angleIndex = 0; angleIndex < stationCount; angleIndex += 1) {
    design[0]![angleIndex] = 1;
    for (let legIndex = angleIndex; legIndex < stationCount; legIndex += 1) {
      const distance = distances[legIndex] ?? 0;
      const azimuthRad = rawAzimuthRads[legIndex] ?? 0;
      design[1]![angleIndex] += distance * Math.cos(azimuthRad);
      design[2]![angleIndex] -= distance * Math.sin(azimuthRad);
    }
  }
  for (let legIndex = 0; legIndex < stationCount; legIndex += 1) {
    const column = stationCount + legIndex;
    const azimuthRad = rawAzimuthRads[legIndex] ?? 0;
    design[1]![column] = Math.sin(azimuthRad);
    design[2]![column] = Math.cos(azimuthRad);
  }

  const sigmas = [
    ...Array.from({ length: stationCount }, () => angleSigmaRad),
    ...distances.map((distance) => Math.max(1e-9, Math.hypot(distFixedMm / 1000, (ppm * distance) / 1_000_000))),
  ];
  const variances = sigmas.map((sigma) => sigma * sigma);
  const conditionCovariance = mat.zeros(conditionCount, conditionCount);
  for (let row = 0; row < conditionCount; row += 1) {
    for (let column = 0; column < conditionCount; column += 1) {
      conditionCovariance[row]![column] = variances.reduce((sum, variance, observationIndex) => {
        return sum + (design[row]?.[observationIndex] ?? 0) * variance * (design[column]?.[observationIndex] ?? 0);
      }, 0);
    }
  }

  const inverse = mat.invert(conditionCovariance);
  const singular = {
    least_squares_model: model,
    least_squares_condition_count: conditionCount,
    least_squares_observation_count: observationCount,
    least_squares_redundancy: 0,
    least_squares_status: "singular_condition_matrix",
  };
  if (!inverse) return { metrics: singular, summary: singular, rows: [] };

  const multipliers = mat.mulVec(inverse, conditionVector);
  const corrections = variances.map((variance, observationIndex) => {
    const coefficient = design.reduce((sum, row, rowIndex) => {
      return sum + (row[observationIndex] ?? 0) * (multipliers[rowIndex] ?? 0);
    }, 0);
    return -variance * coefficient;
  });
  const weightedResidualSum = corrections.reduce((sum, correction, index) => {
    const variance = variances[index] ?? 1;
    return sum + (correction * correction) / variance;
  }, 0);
  const redundancy = conditionCount;
  const unitWeightStd = Math.sqrt(weightedResidualSum / redundancy);
  const maxAngleResidualSec = Math.max(
    0,
    ...corrections.slice(0, stationCount).map((correction) => Math.abs(correction * ARC_SECONDS_PER_RADIAN)),
  );
  const maxDistanceResidualMm = Math.max(
    0,
    ...corrections.slice(stationCount).map((correction) => Math.abs(correction * 1000)),
  );
  const maxStandardizedResidual = Math.max(
    0,
    ...corrections.map((correction, index) => Math.abs(correction / (sigmas[index] ?? 1))),
  );

  const rows: Array<Record<string, unknown>> = [];
  observations.forEach((observation, index) => {
    const correction = corrections[index] ?? 0;
    rows.push({
      row_type: "traverse_lsq_observation_residual",
      condition_model: model,
      observation_id: `A${index + 1}`,
      observation_type: "angle",
      edge_id: `T${index + 1}`,
      from: observation.from,
      to: observation.to,
      observed_hz_angle_deg: cleanFixedNumber(observation.hz_angle_deg, 8),
      residual_sec: cleanFixedNumber(correction * ARC_SECONDS_PER_RADIAN, 4),
      sigma_sec: cleanFixedNumber(directionMseSec, 4),
      standardized_residual: cleanFixedNumber(correction / angleSigmaRad, 4),
      adjusted_hz_angle_deg: cleanFixedNumber(observation.hz_angle_deg + rad2deg(correction), 8),
    });
  });
  observations.forEach((observation, index) => {
    const correction = corrections[stationCount + index] ?? 0;
    const sigmaM = sigmas[stationCount + index] ?? 1;
    rows.push({
      row_type: "traverse_lsq_observation_residual",
      condition_model: model,
      observation_id: `D${index + 1}`,
      observation_type: "distance",
      edge_id: `T${index + 1}`,
      from: observation.from,
      to: observation.to,
      observed_distance_m: cleanFixedNumber(distances[index] ?? 0, 6),
      residual_mm: cleanFixedNumber(correction * 1000, 4),
      sigma_mm: cleanFixedNumber(sigmaM * 1000, 4),
      standardized_residual: cleanFixedNumber(correction / sigmaM, 4),
      adjusted_distance_m: cleanFixedNumber((distances[index] ?? 0) + correction, 6),
    });
  });

  const metrics = {
    least_squares_model: model,
    least_squares_condition_count: conditionCount,
    least_squares_observation_count: observationCount,
    least_squares_redundancy: redundancy,
    least_squares_status: "computed",
    least_squares_unit_weight_std: cleanFixedNumber(unitWeightStd, 4),
    least_squares_weighted_residual_sum: cleanFixedNumber(weightedResidualSum, 4),
    least_squares_max_residual_mm: cleanFixedNumber(maxDistanceResidualMm, 4),
    least_squares_max_angle_residual_sec: cleanFixedNumber(maxAngleResidualSec, 4),
    least_squares_max_standardized_residual: cleanFixedNumber(maxStandardizedResidual, 4),
    least_squares_raw_fx_mm: cleanFixedNumber(rawFx * 1000, 4),
    least_squares_raw_fy_mm: cleanFixedNumber(rawFy * 1000, 4),
    least_squares_raw_coordinate_closure_mm: cleanFixedNumber(Math.hypot(rawFx, rawFy) * 1000, 4),
  };
  return { metrics, summary: metrics, rows };
}

function traverseLargeNetworkBandedCoordinateLeastSquares(
  observations: PrdTraverseAdjustArgs["observations"],
  distances: number[],
  startPoint: { name: string; x: number; y: number },
  fixedEnd: { name: string; x: number; y: number },
  startAzimuthDeg: number,
  initialPoints: Array<{ name: string; x: number; y: number }>,
  params: PrdTraverseAdjustArgs["params"],
  unknownNames: string[],
): {
  metrics: Record<string, unknown>;
  summary: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
} {
  const model = "distance_direction_indirect_lsq";
  const pointCount = unknownNames.length;
  const unknownCount = pointCount * 2;
  const observationCount = observations.length * 2;
  const endpointName = observations.at(-1)?.to ?? fixedEnd.name;
  const directionMseSec = Math.max(1e-9, Math.abs(params.dir_mse_sec ?? 1));
  const distFixedMm = Math.max(0, Math.abs(params.dist_fixed_mm ?? 1));
  const ppm = Math.max(0, Math.abs(params.ppm ?? 1));

  const initialCoordinates = new Map<string, { x: number; y: number }>();
  initialCoordinates.set(startPoint.name, { x: startPoint.x, y: startPoint.y });
  initialCoordinates.set(fixedEnd.name, { x: fixedEnd.x, y: fixedEnd.y });
  initialCoordinates.set(endpointName, { x: fixedEnd.x, y: fixedEnd.y });
  for (const point of initialPoints) {
    if (point.name && Number.isFinite(point.x) && Number.isFinite(point.y) && point.name !== endpointName) {
      initialCoordinates.set(point.name, { x: point.x, y: point.y });
    }
  }

  const unknownIndex = new Map<string, number>();
  unknownNames.forEach((name, index) => unknownIndex.set(name, index));
  const coordinateFor = (name: string): { x: number; y: number } => {
    if (name === startPoint.name) return { x: startPoint.x, y: startPoint.y };
    if (name === fixedEnd.name || name === endpointName) return { x: fixedEnd.x, y: fixedEnd.y };
    return initialCoordinates.get(name) ?? { x: startPoint.x, y: startPoint.y };
  };

  type Block2 = [[number, number], [number, number]];
  const zeroBlock = (): Block2 => [
    [0, 0],
    [0, 0],
  ];
  const addOuter = (block: Block2, left: [number, number], right: [number, number], weight: number) => {
    block[0][0] += weight * left[0] * right[0];
    block[0][1] += weight * left[0] * right[1];
    block[1][0] += weight * left[1] * right[0];
    block[1][1] += weight * left[1] * right[1];
  };
  const transposeBlock = (block: Block2): Block2 => [
    [block[0][0], block[1][0]],
    [block[0][1], block[1][1]],
  ];
  const subtractBlock = (left: Block2, right: Block2): Block2 => [
    [left[0][0] - right[0][0], left[0][1] - right[0][1]],
    [left[1][0] - right[1][0], left[1][1] - right[1][1]],
  ];
  const addBlock = (left: Block2, right: Block2): Block2 => [
    [left[0][0] + right[0][0], left[0][1] + right[0][1]],
    [left[1][0] + right[1][0], left[1][1] + right[1][1]],
  ];
  const mulBlock = (left: Block2, right: Block2): Block2 => [
    [
      left[0][0] * right[0][0] + left[0][1] * right[1][0],
      left[0][0] * right[0][1] + left[0][1] * right[1][1],
    ],
    [
      left[1][0] * right[0][0] + left[1][1] * right[1][0],
      left[1][0] * right[0][1] + left[1][1] * right[1][1],
    ],
  ];
  const invertBlock = (block: Block2): Block2 | null => {
    const det = block[0][0] * block[1][1] - block[0][1] * block[1][0];
    if (Math.abs(det) < 1e-24) return null;
    return [
      [block[1][1] / det, -block[0][1] / det],
      [-block[1][0] / det, block[0][0] / det],
    ];
  };

  const diag = Array.from({ length: pointCount }, zeroBlock);
  const upper = Array.from({ length: Math.max(0, pointCount - 1) }, zeroBlock);
  let weightedResidualSum = 0;
  let usedObservationCount = 0;
  const observedAzimuthsRad: number[] = [];
  let observedAzimuthDeg = startAzimuthDeg;
  for (const observation of observations) {
    observedAzimuthDeg = (((observedAzimuthDeg + observation.hz_angle_deg + 180) % 360) + 360) % 360;
    observedAzimuthsRad.push(deg2rad(observedAzimuthDeg));
  }

  const addNormalRow = (
    entries: Array<{ index: number; coeff: [number, number] }>,
    weight: number,
    residual: number,
  ) => {
    entries.forEach((entry) => addOuter(diag[entry.index]!, entry.coeff, entry.coeff, weight));
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
        const left = entries[leftIndex]!;
        const right = entries[rightIndex]!;
        if (Math.abs(left.index - right.index) !== 1) continue;
        const lower = left.index < right.index ? left : right;
        const higher = left.index < right.index ? right : left;
        addOuter(upper[lower.index]!, lower.coeff, higher.coeff, weight);
      }
    }
    weightedResidualSum += residual * residual * weight;
    usedObservationCount += 1;
  };

  observations.forEach((observation, index) => {
    const from = coordinateFor(observation.from);
    const to = coordinateFor(observation.to);
    const dxM = to.x - from.x;
    const dyM = to.y - from.y;
    const computedDistance = Math.hypot(dxM, dyM);
    if (computedDistance < 1e-9) return;
    const observedDistance = distances[index] ?? 0;
    const distanceSigmaM = Math.max(1e-9, Math.hypot(distFixedMm / 1000, (ppm * observedDistance) / 1_000_000));
    const distanceEntries: Array<{ index: number; coeff: [number, number] }> = [];
    const fromIndex = unknownIndex.get(observation.from);
    const toIndex = unknownIndex.get(observation.to);
    if (fromIndex !== undefined) distanceEntries.push({ index: fromIndex, coeff: [-dxM / computedDistance, -dyM / computedDistance] });
    if (toIndex !== undefined) distanceEntries.push({ index: toIndex, coeff: [dxM / computedDistance, dyM / computedDistance] });
    addNormalRow(distanceEntries, 1 / (distanceSigmaM * distanceSigmaM), observedDistance - computedDistance);

    const distanceSq = computedDistance * computedDistance;
    const directionSigmaRad = Math.max(1e-12, (directionMseSec / ARC_SECONDS_PER_RADIAN) * Math.sqrt(index + 1));
    const directionEntries: Array<{ index: number; coeff: [number, number] }> = [];
    if (fromIndex !== undefined) directionEntries.push({ index: fromIndex, coeff: [-dyM / distanceSq, dxM / distanceSq] });
    if (toIndex !== undefined) directionEntries.push({ index: toIndex, coeff: [dyM / distanceSq, -dxM / distanceSq] });
    const computedAzimuth = Math.atan2(dxM, dyM);
    const directionResidual = ((observedAzimuthsRad[index]! - computedAzimuth + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    addNormalRow(directionEntries, 1 / (directionSigmaRad * directionSigmaRad), directionResidual);
  });

  const invM: Block2[] = [];
  const cPrime: Block2[] = [];
  for (let index = 0; index < pointCount; index += 1) {
    const reduced =
      index === 0
        ? diag[index]!
        : subtractBlock(diag[index]!, mulBlock(transposeBlock(upper[index - 1]!), cPrime[index - 1]!));
    const inverse = invertBlock(reduced);
    if (!inverse) {
      const singular = {
        least_squares_coordinate_model: model,
        least_squares_coordinate_status: "singular_banded_normal_equation",
        least_squares_coordinate_unknown_count: unknownCount,
        least_squares_coordinate_observation_count: usedObservationCount,
        least_squares_coordinate_redundancy: Math.max(0, usedObservationCount - unknownCount),
      };
      return { metrics: singular, summary: singular, rows: [] };
    }
    invM[index] = inverse;
    if (index < pointCount - 1) cPrime[index] = mulBlock(inverse, upper[index]!);
  }

  const inverseDiag: Block2[] = Array.from({ length: pointCount }, zeroBlock);
  for (let index = pointCount - 1; index >= 0; index -= 1) {
    inverseDiag[index] =
      index === pointCount - 1
        ? invM[index]!
        : addBlock(invM[index]!, mulBlock(mulBlock(cPrime[index]!, inverseDiag[index + 1]!), transposeBlock(cPrime[index]!)));
  }

  const redundancy = usedObservationCount - unknownCount;
  const unitWeightStd = redundancy > 0 ? Math.sqrt(weightedResidualSum / redundancy) : 0;
  const covarianceScale = unitWeightStd > 0 ? unitWeightStd : 1;
  const rows = unknownNames.map((name, index) => {
    const coordinate = initialCoordinates.get(name) ?? { x: startPoint.x, y: startPoint.y };
    const block = inverseDiag[index]!;
    const qxxValue = Math.abs(block[0][0]);
    const qxyValue = block[0][1];
    const qyyValue = Math.abs(block[1][1]);
    const precision = traversePrecisionFromCovariance(
      covarianceScale * covarianceScale * qxxValue,
      covarianceScale * covarianceScale * qyyValue,
      covarianceScale * covarianceScale * qxyValue,
      0,
    );
    return {
      row_type: "traverse_lsq_adjusted_coordinate",
      coordinate_model: model,
      normal_equation: "banded N=A^T P A",
      point_name: name,
      coordinate_role: "unknown_adjusted",
      initial_x: cleanFixedNumber(coordinate.x, 4),
      initial_y: cleanFixedNumber(coordinate.y, 4),
      adjusted_x: cleanFixedNumber(coordinate.x, 4),
      adjusted_y: cleanFixedNumber(coordinate.y, 4),
      correction_dx_mm: 0,
      correction_dy_mm: 0,
      qxx_m2: cleanFixedNumber(qxxValue, 12),
      qxy_m2: cleanFixedNumber(qxyValue, 12),
      qyy_m2: cleanFixedNumber(qyyValue, 12),
      mx_mm: precision.mxMm,
      my_mm: precision.myMm,
      point_mse_mm: precision.pointMseMm,
      ellipse_a_mm: precision.semiMajorMm,
      ellipse_b_mm: precision.semiMinorMm,
      ellipse_theta_deg: precision.thetaDeg,
    };
  });
  const maxPointMseMm = rows.reduce((max, row) => {
    const value = typeof row.point_mse_mm === "number" ? row.point_mse_mm : 0;
    return Math.max(max, value);
  }, 0);
  const metrics = {
    least_squares_coordinate_model: model,
    least_squares_coordinate_status: "computed",
    least_squares_coordinate_solver: "banded_chain_qxx",
    least_squares_coordinate_unknown_count: unknownCount,
    least_squares_coordinate_point_count: pointCount,
    least_squares_coordinate_observation_count: usedObservationCount,
    least_squares_coordinate_redundancy: Math.max(0, redundancy),
    least_squares_coordinate_unit_weight_std: cleanFixedNumber(unitWeightStd, 4),
    least_squares_coordinate_weighted_residual_sum: cleanFixedNumber(weightedResidualSum, 4),
    least_squares_coordinate_max_point_mse_mm: cleanFixedNumber(maxPointMseMm, 4),
    least_squares_coordinate_max_correction_mm: 0,
  };
  return { metrics, summary: metrics, rows };
}

function traverseIndirectLeastSquaresCoordinateAdjustment(
  observations: PrdTraverseAdjustArgs["observations"],
  distances: number[],
  startPoint: { name: string; x: number; y: number },
  fixedEnd: { name: string; x: number; y: number },
  startAzimuthDeg: number,
  initialPoints: Array<{ name: string; x: number; y: number }>,
  params: PrdTraverseAdjustArgs["params"],
): {
  metrics: Record<string, unknown>;
  summary: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
} {
  const model = "distance_direction_indirect_lsq";
  const lastObservation = observations.at(-1);
  const endpointName = lastObservation?.to ?? fixedEnd.name;
  const unknownNames = observations
    .slice(0, -1)
    .map((observation) => observation.to)
    .filter((name, index, names) => name && name !== startPoint.name && name !== fixedEnd.name && names.indexOf(name) === index);
  const unknownCount = unknownNames.length * 2;
  const observationCount = observations.length * 2;
  const noUnknownMetrics = {
    least_squares_coordinate_model: model,
    least_squares_coordinate_status: "no_intermediate_unknown_points",
    least_squares_coordinate_unknown_count: unknownCount,
    least_squares_coordinate_observation_count: observationCount,
    least_squares_coordinate_redundancy: Math.max(0, observationCount - unknownCount),
  };
  if (!lastObservation || unknownCount === 0) return { metrics: noUnknownMetrics, summary: noUnknownMetrics, rows: [] };
  const maxDirectUnknownCount = 120;
  if (unknownCount > maxDirectUnknownCount) {
    return traverseLargeNetworkBandedCoordinateLeastSquares(
      observations,
      distances,
      startPoint,
      fixedEnd,
      startAzimuthDeg,
      initialPoints,
      params,
      unknownNames,
    );
  }

  const directionMseSec = Math.max(1e-9, Math.abs(params.dir_mse_sec ?? 1));
  const distFixedMm = Math.max(0, Math.abs(params.dist_fixed_mm ?? 1));
  const ppm = Math.max(0, Math.abs(params.ppm ?? 1));
  const observedAzimuthsRad: number[] = [];
  let observedAzimuthDeg = startAzimuthDeg;
  for (const observation of observations) {
    observedAzimuthDeg = (((observedAzimuthDeg + observation.hz_angle_deg + 180) % 360) + 360) % 360;
    observedAzimuthsRad.push(deg2rad(observedAzimuthDeg));
  }

  const initialCoordinates = new Map<string, { x: number; y: number }>();
  initialCoordinates.set(startPoint.name, { x: startPoint.x, y: startPoint.y });
  initialCoordinates.set(fixedEnd.name, { x: fixedEnd.x, y: fixedEnd.y });
  initialCoordinates.set(endpointName, { x: fixedEnd.x, y: fixedEnd.y });
  for (const point of initialPoints) {
    if (point.name && Number.isFinite(point.x) && Number.isFinite(point.y) && point.name !== endpointName) {
      initialCoordinates.set(point.name, { x: point.x, y: point.y });
    }
  }

  const unknownIndex = new Map<string, number>();
  unknownNames.forEach((name, index) => unknownIndex.set(name, index));
  const coordinates = new Map<string, { x: number; y: number }>();
  for (const [name, coordinate] of initialCoordinates.entries()) coordinates.set(name, { ...coordinate });
  for (const name of unknownNames) {
    if (!coordinates.has(name)) coordinates.set(name, { x: startPoint.x, y: startPoint.y });
  }

  const coordinateFor = (name: string): { x: number; y: number } => {
    if (name === startPoint.name) return { x: startPoint.x, y: startPoint.y };
    if (name === fixedEnd.name || name === endpointName) return { x: fixedEnd.x, y: fixedEnd.y };
    return coordinates.get(name) ?? { x: startPoint.x, y: startPoint.y };
  };
  const addDesign = (row: number[], pointName: string, dxCoefficient: number, dyCoefficient: number) => {
    const index = unknownIndex.get(pointName);
    if (index === undefined) return;
    row[index * 2] = (row[index * 2] ?? 0) + dxCoefficient;
    row[index * 2 + 1] = (row[index * 2 + 1] ?? 0) + dyCoefficient;
  };
  const buildNormal = (): {
    normal: Matrix;
    rhs: number[];
    usedObservationCount: number;
    weightedResidualSum: number;
  } => {
    const normal = mat.zeros(unknownCount, unknownCount);
    const rhs = Array.from({ length: unknownCount }, () => 0);
    let usedObservationCount = 0;
    let weightedResidualSum = 0;

    observations.forEach((observation, index) => {
      const from = coordinateFor(observation.from);
      const to = coordinateFor(observation.to);
      const dxM = to.x - from.x;
      const dyM = to.y - from.y;
      const computedDistance = Math.hypot(dxM, dyM);
      if (computedDistance < 1e-9) return;
      const observedDistance = distances[index] ?? 0;
      const distanceSigmaM = Math.max(1e-9, Math.hypot(distFixedMm / 1000, (ppm * observedDistance) / 1_000_000));
      const directionSigmaRad = Math.max(1e-12, (directionMseSec / ARC_SECONDS_PER_RADIAN) * Math.sqrt(index + 1));

      const distanceRow = Array.from({ length: unknownCount }, () => 0);
      addDesign(distanceRow, observation.from, -dxM / computedDistance, -dyM / computedDistance);
      addDesign(distanceRow, observation.to, dxM / computedDistance, dyM / computedDistance);
      const distanceL = observedDistance - computedDistance;
      const distanceWeight = 1 / (distanceSigmaM * distanceSigmaM);
      for (let row = 0; row < unknownCount; row += 1) {
        rhs[row]! += distanceWeight * (distanceRow[row] ?? 0) * distanceL;
        for (let column = 0; column < unknownCount; column += 1) {
          normal[row]![column]! += distanceWeight * (distanceRow[row] ?? 0) * (distanceRow[column] ?? 0);
        }
      }
      weightedResidualSum += (distanceL * distanceL) / (distanceSigmaM * distanceSigmaM);
      usedObservationCount += 1;

      const directionRow = Array.from({ length: unknownCount }, () => 0);
      const distanceSq = computedDistance * computedDistance;
      addDesign(directionRow, observation.from, -dyM / distanceSq, dxM / distanceSq);
      addDesign(directionRow, observation.to, dyM / distanceSq, -dxM / distanceSq);
      const computedAzimuth = Math.atan2(dxM, dyM);
      const directionL = ((observedAzimuthsRad[index]! - computedAzimuth + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const directionWeight = 1 / (directionSigmaRad * directionSigmaRad);
      for (let row = 0; row < unknownCount; row += 1) {
        rhs[row]! += directionWeight * (directionRow[row] ?? 0) * directionL;
        for (let column = 0; column < unknownCount; column += 1) {
          normal[row]![column]! += directionWeight * (directionRow[row] ?? 0) * (directionRow[column] ?? 0);
        }
      }
      weightedResidualSum += (directionL * directionL) / (directionSigmaRad * directionSigmaRad);
      usedObservationCount += 1;
    });

    return { normal, rhs, usedObservationCount, weightedResidualSum };
  };

  let normal: Matrix | null = null;
  let usedObservationCount = 0;
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const built = buildNormal();
    normal = built.normal;
    usedObservationCount = built.usedObservationCount;
    const inverse = mat.invert(built.normal);
    if (!inverse) {
      const singular = {
        least_squares_coordinate_model: model,
        least_squares_coordinate_status: "singular_normal_equation",
        least_squares_coordinate_unknown_count: unknownCount,
        least_squares_coordinate_observation_count: usedObservationCount,
        least_squares_coordinate_redundancy: Math.max(0, usedObservationCount - unknownCount),
      };
      return { metrics: singular, summary: singular, rows: [] };
    }
    const corrections = mat.mulVec(inverse, built.rhs);
    let maxCorrection = 0;
    for (const [name, index] of unknownIndex.entries()) {
      const coordinate = coordinates.get(name) ?? { x: startPoint.x, y: startPoint.y };
      const dxCorrection = corrections[index * 2] ?? 0;
      const dyCorrection = corrections[index * 2 + 1] ?? 0;
      coordinates.set(name, { x: coordinate.x + dxCorrection, y: coordinate.y + dyCorrection });
      maxCorrection = Math.max(maxCorrection, Math.abs(dxCorrection), Math.abs(dyCorrection));
    }
    if (maxCorrection < 1e-10) break;
  }

  const finalBuilt = buildNormal();
  normal = finalBuilt.normal;
  usedObservationCount = finalBuilt.usedObservationCount;
  const qxx = normal ? mat.invert(normal) : null;
  const redundancy = usedObservationCount - unknownCount;
  if (!qxx || redundancy <= 0) {
    const singular = {
      least_squares_coordinate_model: model,
      least_squares_coordinate_status: qxx ? "insufficient_redundancy" : "singular_normal_equation",
      least_squares_coordinate_unknown_count: unknownCount,
      least_squares_coordinate_observation_count: usedObservationCount,
      least_squares_coordinate_redundancy: Math.max(0, redundancy),
    };
    return { metrics: singular, summary: singular, rows: [] };
  }

  const unitWeightStd = Math.sqrt(finalBuilt.weightedResidualSum / redundancy);
  const rows = unknownNames.map((name) => {
    const index = unknownIndex.get(name) ?? 0;
    const coordinate = coordinates.get(name) ?? initialCoordinates.get(name) ?? { x: startPoint.x, y: startPoint.y };
    const initial = initialCoordinates.get(name) ?? coordinate;
    const qxxValue = qxx[index * 2]?.[index * 2] ?? 0;
    const qxyValue = qxx[index * 2]?.[index * 2 + 1] ?? 0;
    const qyyValue = qxx[index * 2 + 1]?.[index * 2 + 1] ?? 0;
    const precision = traversePrecisionFromCovariance(
      unitWeightStd * unitWeightStd * qxxValue,
      unitWeightStd * unitWeightStd * qyyValue,
      unitWeightStd * unitWeightStd * qxyValue,
      0,
    );
    return {
      row_type: "traverse_lsq_adjusted_coordinate",
      coordinate_model: model,
      normal_equation: "N=A^T P A",
      point_name: name,
      coordinate_role: "unknown_adjusted",
      initial_x: cleanFixedNumber(initial.x, 4),
      initial_y: cleanFixedNumber(initial.y, 4),
      adjusted_x: cleanFixedNumber(coordinate.x, 4),
      adjusted_y: cleanFixedNumber(coordinate.y, 4),
      correction_dx_mm: cleanFixedNumber((coordinate.x - initial.x) * 1000, 4),
      correction_dy_mm: cleanFixedNumber((coordinate.y - initial.y) * 1000, 4),
      qxx_m2: cleanFixedNumber(qxxValue, 12),
      qxy_m2: cleanFixedNumber(qxyValue, 12),
      qyy_m2: cleanFixedNumber(qyyValue, 12),
      mx_mm: precision.mxMm,
      my_mm: precision.myMm,
      point_mse_mm: precision.pointMseMm,
      ellipse_a_mm: precision.semiMajorMm,
      ellipse_b_mm: precision.semiMinorMm,
      ellipse_theta_deg: precision.thetaDeg,
    };
  });
  const maxPointMseMm = rows.reduce((max, row) => {
    const value = typeof row.point_mse_mm === "number" ? row.point_mse_mm : 0;
    return Math.max(max, value);
  }, 0);
  const maxCoordinateCorrectionMm = rows.reduce((max, row) => {
    const dxMm = typeof row.correction_dx_mm === "number" ? row.correction_dx_mm : 0;
    const dyMm = typeof row.correction_dy_mm === "number" ? row.correction_dy_mm : 0;
    return Math.max(max, Math.hypot(dxMm, dyMm));
  }, 0);
  const metrics = {
    least_squares_coordinate_model: model,
    least_squares_coordinate_status: "computed",
    least_squares_coordinate_unknown_count: unknownCount,
    least_squares_coordinate_point_count: unknownNames.length,
    least_squares_coordinate_observation_count: usedObservationCount,
    least_squares_coordinate_redundancy: redundancy,
    least_squares_coordinate_unit_weight_std: cleanFixedNumber(unitWeightStd, 4),
    least_squares_coordinate_weighted_residual_sum: cleanFixedNumber(finalBuilt.weightedResidualSum, 4),
    least_squares_coordinate_max_point_mse_mm: cleanFixedNumber(maxPointMseMm, 4),
    least_squares_coordinate_max_correction_mm: cleanFixedNumber(maxCoordinateCorrectionMm, 4),
  };
  return { metrics, summary: metrics, rows };
}

function traversePrecisionFromCovariance(
  varX: number,
  varY: number,
  covXY: number,
  fallbackThetaDeg: number,
): TraversePointPrecision {
  const cleanVarX = Math.max(varX, 0);
  const cleanVarY = Math.max(varY, 0);
  const trace = cleanVarX + cleanVarY;
  const halfDiff = (cleanVarX - cleanVarY) / 2;
  const radius = Math.sqrt(halfDiff * halfDiff + covXY * covXY);
  const majorVariance = Math.max(trace / 2 + radius, 0);
  const minorVariance = Math.max(trace / 2 - radius, 0);
  const theta =
    Math.abs(covXY) < 1e-18 && Math.abs(cleanVarX - cleanVarY) < 1e-18
      ? fallbackThetaDeg
      : rad2deg(0.5 * Math.atan2(2 * covXY, cleanVarX - cleanVarY));
  return {
    mxMm: Number((Math.sqrt(cleanVarX) * 1000).toFixed(3)),
    myMm: Number((Math.sqrt(cleanVarY) * 1000).toFixed(3)),
    pointMseMm: Number((Math.sqrt(cleanVarX + cleanVarY) * 1000).toFixed(3)),
    semiMajorMm: Number((Math.sqrt(majorVariance) * 1000).toFixed(3)),
    semiMinorMm: Number((Math.sqrt(minorVariance) * 1000).toFixed(3)),
    thetaDeg: Number((((theta % 180) + 180) % 180).toFixed(6)),
  };
}

function traversePointPrecisions(
  distances: number[],
  azimuths: number[],
  params: PrdTraverseAdjustArgs["params"],
  closureVarianceM2: number,
): TraversePointPrecision[] {
  const directionMseSec = Math.max(Math.abs(params.dir_mse_sec ?? 1), 0);
  const distanceFixedM = Math.max(Math.abs(params.dist_fixed_mm ?? 1), 0) / 1000;
  const ppm = Math.max(Math.abs(params.ppm ?? 1), 0);
  let cumulativeVarX = 0;
  let cumulativeVarY = 0;
  let cumulativeCovXY = 0;
  return distances.map((distance, index) => {
    const azimuthRad = deg2rad(azimuths[index] ?? 0);
    const sinA = Math.sin(azimuthRad);
    const cosA = Math.cos(azimuthRad);
    const distanceStdM = Math.hypot(distanceFixedM, (ppm * distance) / 1_000_000);
    const directionStdRad = (directionMseSec / ARC_SECONDS_PER_RADIAN) * Math.sqrt(index + 1);
    const distanceVariance = distanceStdM * distanceStdM;
    const directionVariance = directionStdRad * directionStdRad;
    cumulativeVarX += sinA * sinA * distanceVariance + distance * distance * cosA * cosA * directionVariance;
    cumulativeVarY += cosA * cosA * distanceVariance + distance * distance * sinA * sinA * directionVariance;
    cumulativeCovXY += sinA * cosA * distanceVariance - distance * distance * sinA * cosA * directionVariance;
    return traversePrecisionFromCovariance(
      cumulativeVarX + closureVarianceM2,
      cumulativeVarY + closureVarianceM2,
      cumulativeCovXY,
      azimuths[index] ?? 0,
    );
  });
}

function traverseDistanceStdM(distanceM: number, params: PrdTraverseAdjustArgs["params"]): number {
  const distanceFixedM = Math.max(Math.abs(params.dist_fixed_mm ?? 1), 0) / 1000;
  const ppm = Math.max(Math.abs(params.ppm ?? 1), 0);
  return Math.hypot(distanceFixedM, (ppm * Math.max(distanceM, 0)) / 1_000_000);
}

function traverseEdgePrecisionRows(
  observations: PrdTraverseAdjustArgs["observations"],
  distances: number[],
  params: PrdTraverseAdjustArgs["params"],
): Array<Record<string, unknown>> {
  const toleranceRatio = Math.max(
    Math.round(Math.abs(params.edge_relative_mse_tolerance_ratio ?? params.relative_mse_tolerance_ratio ?? 40000)),
    1,
  );
  return observations.map((observation, index) => {
    const distanceM = Math.max(distances[index] ?? 0, 0);
    const distanceStdM = traverseDistanceStdM(distanceM, params);
    const ratio = distanceStdM > 0 ? Math.round(distanceM / distanceStdM) : 0;
    const withinTolerance = ratio >= toleranceRatio;
    return {
      row_type: "traverse_edge_precision",
      edge_id: `T${index + 1}`,
      from: observation.from,
      to: observation.to,
      horizontal_distance_m: Number(distanceM.toFixed(4)),
      distance_mse_mm: Number((distanceStdM * 1000).toFixed(3)),
      relative_mse_ratio: ratio,
      relative_mse: ratio > 0 ? `1/${ratio}` : "",
      tolerance_ratio: toleranceRatio,
      status: withinTolerance ? "合格" : "待复核",
      within_tolerance: withinTolerance,
      action: withinTolerance ? "accept" : "review_distance_precision",
    };
  });
}

function cleanFixedNumber(value: number, digits: number): number {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function traverseCorrectionRows(
  observations: PrdTraverseAdjustArgs["observations"],
  distances: number[],
  dx: number[],
  dy: number[],
  fx: number,
  fy: number,
  totalDistance: number,
  angleCorrectionDeg: number,
): Array<Record<string, unknown>> {
  return observations.map((observation, index) => {
    const distanceRatio = totalDistance > 0 ? Math.max(distances[index] ?? 0, 0) / totalDistance : 0;
    const dxCorrectionM = -fx * distanceRatio;
    const dyCorrectionM = -fy * distanceRatio;
    return {
      row_type: "traverse_correction",
      edge_id: `T${index + 1}`,
      from: observation.from,
      to: observation.to,
      observed_hz_angle_deg: cleanFixedNumber(observation.hz_angle_deg, 6),
      angle_correction_sec: cleanFixedNumber(angleCorrectionDeg * 3600, 3),
      adjusted_hz_angle_deg: cleanFixedNumber(observation.hz_angle_deg + angleCorrectionDeg, 6),
      distance_weight_ratio: cleanFixedNumber(distanceRatio, 6),
      raw_dx_m: cleanFixedNumber(dx[index] ?? 0, 4),
      raw_dy_m: cleanFixedNumber(dy[index] ?? 0, 4),
      dx_correction_mm: cleanFixedNumber(dxCorrectionM * 1000, 3),
      dy_correction_mm: cleanFixedNumber(dyCorrectionM * 1000, 3),
      coordinate_correction_mm: cleanFixedNumber(Math.hypot(dxCorrectionM, dyCorrectionM) * 1000, 3),
      adjusted_dx_m: cleanFixedNumber((dx[index] ?? 0) + dxCorrectionM, 4),
      adjusted_dy_m: cleanFixedNumber((dy[index] ?? 0) + dyCorrectionM, 4),
    };
  });
}

function traverseControlCompatibilityRows(
  startPoint: { name: string; x: number; y: number },
  fixedEnd: { name: string; x: number; y: number },
  observedDxM: number,
  observedDyM: number,
  fxM: number,
  fyM: number,
  coordinateClosureMm: number,
  coordinateToleranceMm: number,
  angleClosureSec: number,
  angleToleranceSec: number,
  relativeClosure: string,
  withinTolerance: boolean,
): Array<Record<string, unknown>> {
  return [
    {
      row_type: "traverse_control_compatibility",
      control_pair: `${startPoint.name}-${fixedEnd.name}`,
      start_point: startPoint.name,
      end_point: fixedEnd.name,
      fixed_dx_m: cleanFixedNumber(fixedEnd.x - startPoint.x, 4),
      fixed_dy_m: cleanFixedNumber(fixedEnd.y - startPoint.y, 4),
      observed_dx_m: cleanFixedNumber(observedDxM, 4),
      observed_dy_m: cleanFixedNumber(observedDyM, 4),
      fx_mm: cleanFixedNumber(fxM * 1000, 3),
      fy_mm: cleanFixedNumber(fyM * 1000, 3),
      coordinate_closure_mm: cleanFixedNumber(coordinateClosureMm, 3),
      coordinate_tolerance_mm: cleanFixedNumber(coordinateToleranceMm, 3),
      angle_closure_sec: cleanFixedNumber(angleClosureSec, 3),
      angle_tolerance_sec: cleanFixedNumber(angleToleranceSec, 3),
      relative_closure: relativeClosure,
      status: withinTolerance ? "合格" : "超限",
      within_tolerance: withinTolerance,
      action: withinTolerance ? "accept" : "review_control_points",
    },
  ];
}

export function calculatePrdTraverseAdjust(args: PrdTraverseAdjustArgs): Record<string, unknown> {
  if (args.known_points.length < 2) throw new Error("traverse_adjust 至少需要起终两个已知点 known_points");
  if (args.observations.length === 0) throw new Error("traverse_adjust 至少需要 1 条导线观测 observations");
  const startName = args.observations[0]!.from;
  const startPoint = args.known_points.find((point) => point.name === startName) ?? args.known_points[0]!;
  const fixedEnd =
    args.known_points.find((point) => point.name !== startPoint.name && point.fixed !== false) ??
    args.known_points.find((point) => point.name !== startPoint.name);
  if (!fixedEnd) throw new Error("traverse_adjust 未找到终点已知坐标");

  const stationCount = args.observations.length;
  const sumAngles = args.observations.reduce((sum, observation) => sum + observation.hz_angle_deg, 0);
  const theoreticalSum =
    (((args.params.end_azimuth_deg - args.params.start_azimuth_deg + 180 * stationCount) % 360) + 360) % 360;
  const angularClosure = sumAngles - theoreticalSum;
  const normalizedAngularClosure =
    angularClosure > 180 ? angularClosure - 360 : angularClosure < -180 ? angularClosure + 360 : angularClosure;
  const angleCorrection = -normalizedAngularClosure / stationCount;
  const azimuths: number[] = [];
  let azimuth = args.params.start_azimuth_deg;
  for (const observation of args.observations) {
    azimuth = (((azimuth + observation.hz_angle_deg + angleCorrection + 180) % 360) + 360) % 360;
    azimuths.push(azimuth);
  }

  const distances = args.observations.map(horizontalDistanceFromTraverseObservation);
  const totalDistance = distances.reduce((sum, distance) => sum + distance, 0);
  const dx = distances.map((distance, index) => distance * Math.sin(deg2rad(azimuths[index]!)));
  const dy = distances.map((distance, index) => distance * Math.cos(deg2rad(azimuths[index]!)));
  const sumDx = dx.reduce((sum, value) => sum + value, 0);
  const sumDy = dy.reduce((sum, value) => sum + value, 0);
  const fx = sumDx - (fixedEnd.x - startPoint.x);
  const fy = sumDy - (fixedEnd.y - startPoint.y);
  const rawClosureDistance = Math.hypot(fx, fy);
  const closureDistance = rawClosureDistance < 1e-9 ? 0 : rawClosureDistance;
  const relativeClosure = closureDistance > 0 ? `1/${Math.round(totalDistance / closureDistance)}` : "∞";
  const closurePointMseM = closureDistance / Math.sqrt(Math.max(3 * stationCount, 1));
  const precisionStates = traversePointPrecisions(distances, azimuths, args.params, closurePointMseM * closurePointMseM);
  let cumulativeDistance = 0;
  let points = args.observations.map((observation, index) => {
    cumulativeDistance += distances[index]!;
    const ratio = totalDistance > 0 ? cumulativeDistance / totalDistance : 0;
    const x = startPoint.x + dx.slice(0, index + 1).reduce((sum, value) => sum + value, 0) - fx * ratio;
    const y = startPoint.y + dy.slice(0, index + 1).reduce((sum, value) => sum + value, 0) - fy * ratio;
    const precision = precisionStates[index]!;
    return {
      name: observation.to,
      x: Number(x.toFixed(4)),
      y: Number(y.toFixed(4)),
      mx: precision.mxMm,
      my: precision.myMm,
      point_mse: precision.pointMseMm,
      ellipse: {
        a: precision.semiMajorMm,
        b: precision.semiMinorMm,
        theta: precision.thetaDeg,
      },
    };
  });
  const angularClosureSec = Number((normalizedAngularClosure * 3600).toFixed(3));
  const coordinateClosureMm = Number((closureDistance * 1000).toFixed(3));
  let pointMseMm = Number((Math.max(0, ...precisionStates.map((precision) => precision.pointMseMm))).toFixed(3));
  const fieldQuality = traverseFieldQualityChecks(args.observations, args.params);
  const edgePrecisionRows = traverseEdgePrecisionRows(args.observations, distances, args.params);
  const correctionRows = traverseCorrectionRows(args.observations, distances, dx, dy, fx, fy, totalDistance, angleCorrection);
  const directionMseSec = args.params.dir_mse_sec ?? 1;
  const distFixedMm = args.params.dist_fixed_mm ?? 1;
  const ppm = args.params.ppm ?? 1;
  const refraction = args.params.refraction ?? 0.14;
  const ellipsoidR = args.params.ellipsoid_r ?? 6371000;
  const heightProjection = args.params.height_projection !== false;
  const angleToleranceSec = Number((Math.max(Math.abs(directionMseSec), 0) * Math.sqrt(stationCount)).toFixed(3));
  const coordinateToleranceMm = 10;
  const leastSquares = traverseLeastSquaresDiagnostics(
    args.observations,
    distances,
    startPoint,
    fixedEnd,
    args.params.start_azimuth_deg,
    normalizedAngularClosure,
    args.params,
  );
  const coordinateLeastSquares = traverseIndirectLeastSquaresCoordinateAdjustment(
    args.observations,
    distances,
    startPoint,
    fixedEnd,
    args.params.start_azimuth_deg,
    points,
    args.params,
  );
  const coordinateSolutionComputed = coordinateLeastSquares.metrics.least_squares_coordinate_status === "computed";
  const lsCoordinateRows = coordinateLeastSquares.rows.filter(
    (row) => row.row_type === "traverse_lsq_adjusted_coordinate" && typeof row.point_name === "string",
  );
  const lsCoordinateByName = new Map(lsCoordinateRows.map((row) => [String(row.point_name), row]));
  if (coordinateSolutionComputed && lsCoordinateByName.size > 0) {
    points = points.map((point) => {
      const row = lsCoordinateByName.get(point.name);
      if (!row) return point;
      const adjustedX = typeof row.adjusted_x === "number" && Number.isFinite(row.adjusted_x) ? row.adjusted_x : point.x;
      const adjustedY = typeof row.adjusted_y === "number" && Number.isFinite(row.adjusted_y) ? row.adjusted_y : point.y;
      const mxMm = typeof row.mx_mm === "number" && Number.isFinite(row.mx_mm) ? row.mx_mm : point.mx;
      const myMm = typeof row.my_mm === "number" && Number.isFinite(row.my_mm) ? row.my_mm : point.my;
      const pointMse = typeof row.point_mse_mm === "number" && Number.isFinite(row.point_mse_mm) ? row.point_mse_mm : point.point_mse;
      const ellipseA =
        typeof row.ellipse_a_mm === "number" && Number.isFinite(row.ellipse_a_mm) ? row.ellipse_a_mm : point.ellipse.a;
      const ellipseB =
        typeof row.ellipse_b_mm === "number" && Number.isFinite(row.ellipse_b_mm) ? row.ellipse_b_mm : point.ellipse.b;
      const ellipseTheta =
        typeof row.ellipse_theta_deg === "number" && Number.isFinite(row.ellipse_theta_deg)
          ? row.ellipse_theta_deg
          : point.ellipse.theta;
      return {
        ...point,
        x: cleanFixedNumber(adjustedX, 4),
        y: cleanFixedNumber(adjustedY, 4),
        mx: cleanFixedNumber(mxMm, 3),
        my: cleanFixedNumber(myMm, 3),
        point_mse: cleanFixedNumber(pointMse, 3),
        ellipse: {
          a: cleanFixedNumber(ellipseA, 3),
          b: cleanFixedNumber(ellipseB, 3),
          theta: cleanFixedNumber(ellipseTheta, 6),
        },
      };
    });
    pointMseMm = Number((Math.max(0, ...points.map((point) => point.point_mse))).toFixed(3));
  }
  const coordinateSolution = coordinateSolutionComputed
    ? "distance_direction_indirect_lsq"
    : "bowditch_closure_distribution";
  const deliveredMethod = coordinateSolutionComputed
    ? "least_squares_traverse_adjustment"
    : "traverse_bowditch_adjustment";
  const controlCompatibilityRows = traverseControlCompatibilityRows(
    startPoint,
    fixedEnd,
    sumDx,
    sumDy,
    fx,
    fy,
    coordinateClosureMm,
    coordinateToleranceMm,
    angularClosureSec,
    angleToleranceSec,
    relativeClosure,
    Math.abs(angularClosureSec) <= angleToleranceSec && coordinateClosureMm <= coordinateToleranceMm,
  );
  const minEdgeRelativeMseRatio = edgePrecisionRows.reduce((min, row) => {
    const ratio = typeof row.relative_mse_ratio === "number" ? row.relative_mse_ratio : Number.POSITIVE_INFINITY;
    return Math.min(min, ratio);
  }, Number.POSITIVE_INFINITY);
  const maxAngleCorrectionSec = correctionRows.reduce((max, row) => {
    const value = typeof row.angle_correction_sec === "number" ? Math.abs(row.angle_correction_sec) : 0;
    return Math.max(max, value);
  }, 0);
  const maxCoordinateCorrectionMm = correctionRows.reduce((max, row) => {
    const value = typeof row.coordinate_correction_mm === "number" ? Math.abs(row.coordinate_correction_mm) : 0;
    return Math.max(max, value);
  }, 0);
  const exportRows = [
    ...fieldQuality.rows,
    {
      row_type: "traverse_adjustment_summary",
      method: deliveredMethod,
      model: args.params.model ?? "normal",
      coordinate_solution: coordinateSolution,
      start_azimuth_deg: args.params.start_azimuth_deg,
      end_azimuth_deg: args.params.end_azimuth_deg,
      dir_mse_sec: directionMseSec,
      dist_fixed_mm: distFixedMm,
      ppm,
      refraction,
      ellipsoid_r: ellipsoidR,
      height_projection: heightProjection,
      precision_model: TRAVERSE_PRECISION_MODEL,
      quality_status: fieldQuality.failedCount > 0 ? "review" : "pass",
      observation_count: stationCount,
      total_distance_m: Number(totalDistance.toFixed(4)),
      angular_closure_sec: angularClosureSec,
      coordinate_closure_mm: coordinateClosureMm,
      relative_closure: relativeClosure,
      unit_weight_mse_mm: pointMseMm,
      max_two_c_sec: fieldQuality.maxTwoCSec,
      max_round_diff_sec: fieldQuality.maxRoundDiffSec,
      max_reciprocal_distance_diff_mm: fieldQuality.maxReciprocalDistanceDiffMm,
      min_edge_relative_mse_ratio: Number.isFinite(minEdgeRelativeMseRatio) ? minEdgeRelativeMseRatio : null,
      max_angle_correction_sec: Number(maxAngleCorrectionSec.toFixed(3)),
      max_coordinate_correction_mm: Number(maxCoordinateCorrectionMm.toFixed(3)),
      control_compatibility_status: typeof controlCompatibilityRows[0]?.status === "string" ? controlCompatibilityRows[0].status : "",
      ...leastSquares.summary,
      ...coordinateLeastSquares.summary,
    },
    ...leastSquares.rows,
    ...coordinateLeastSquares.rows,
    ...correctionRows,
    ...controlCompatibilityRows,
    ...points.map((point) => ({
      row_type: "traverse_adjusted_coordinate",
      point_name: point.name,
      x: point.x,
      y: point.y,
      mx_mm: point.mx,
      my_mm: point.my,
      point_mse_mm: point.point_mse,
    })),
    ...points.map((point) => ({
      row_type: "traverse_error_ellipse",
      point_name: point.name,
      center_x: point.x,
      center_y: point.y,
      semi_major_mm: point.ellipse.a,
      semi_minor_mm: point.ellipse.b,
      theta_deg: point.ellipse.theta,
      point_mse_mm: point.point_mse,
    })),
    ...edgePrecisionRows,
    ...args.observations.map((observation, index) => ({
      row_type: "traverse_adjusted_azimuth",
      from: observation.from,
      to: observation.to,
      azimuth_degrees: Number(azimuths[index]!.toFixed(6)),
      horizontal_distance_m: Number(distances[index]!.toFixed(4)),
    })),
  ];

  return {
    method: deliveredMethod,
    coordinate_solution: coordinateSolution,
    precision_model: TRAVERSE_PRECISION_MODEL,
    quality_status: fieldQuality.failedCount > 0 ? "review" : "pass",
    model: args.params.model ?? "normal",
    start_azimuth_deg: args.params.start_azimuth_deg,
    end_azimuth_deg: args.params.end_azimuth_deg,
    dir_mse_sec: directionMseSec,
    dist_fixed_mm: distFixedMm,
    ppm,
    refraction,
    ellipsoid_r: ellipsoidR,
    height_projection: heightProjection,
    point_count: points.length,
    observation_count: stationCount,
    total_distance_m: Number(totalDistance.toFixed(4)),
    max_two_c_sec: fieldQuality.maxTwoCSec,
    max_round_diff_sec: fieldQuality.maxRoundDiffSec,
    max_reciprocal_distance_diff_mm: fieldQuality.maxReciprocalDistanceDiffMm,
    min_edge_relative_mse_ratio: Number.isFinite(minEdgeRelativeMseRatio) ? minEdgeRelativeMseRatio : null,
    max_angle_correction_sec: Number(maxAngleCorrectionSec.toFixed(3)),
    max_coordinate_correction_mm: Number(maxCoordinateCorrectionMm.toFixed(3)),
    control_compatibility_status: typeof controlCompatibilityRows[0]?.status === "string" ? controlCompatibilityRows[0].status : "",
    ...leastSquares.metrics,
    ...coordinateLeastSquares.metrics,
    closures: {
      angle_sec: angularClosureSec,
      coord_mm: coordinateClosureMm,
      fx_mm: Number((fx * 1000).toFixed(3)),
      fy_mm: Number((fy * 1000).toFixed(3)),
      relative_closure: relativeClosure,
    },
    unit_weight_mse_mm: pointMseMm,
    points,
    log: [
      "按导线观测顺序计算方位角并平均分配角度闭合差",
      "坐标闭合差按边长比例分配",
      "按角度闭合、X闭合、Y闭合条件方程输出最小二乘观测残差诊断",
      "组建距离-方向间接平差法方程 N=A^T P A，输出坐标 Qxx 与点位精度",
      "输出平差坐标、改正数、点位中误差、边长相对中误差和误差椭圆参数",
    ],
    export_rows: exportRows,
  };
}

export function registerCalculator(server: McpServer): void {
  server.tool(
    "calculator_leveling_closure",
    "计算水准测量的高程闭合差是否在规范限差内。当需要判断外业水准数据是否合格时，必须调用此工具，绝不能自己口算或估算。",
    {
      measuredError: z.number().describe("现场实际测算出的高程闭合差，单位为毫米(mm)，允许负值"),
      routeLengthKm: z.number().positive().describe("水准路线的总长度，单位为公里(km)"),
      order: z
        .enum(["1st", "2nd", "3rd", "4th", "city-2nd"])
        .default("4th")
        .describe("测量等级：1st=一等, 2nd=二等, 3rd=三等, 4th=四等, city-2nd=城市二等"),
    },
    async (args) => {
      const spec = LEVELING_LIMITS[args.order]!;
      const limit = spec.k * Math.sqrt(args.routeLengthKm);
      const pass = Math.abs(args.measuredError) <= limit;
      const allowedLimitMm = Number(limit.toFixed(3));
      const ratioPct = Number(((Math.abs(args.measuredError) / limit) * 100).toFixed(1));
      const qualityStatus = pass ? "pass" : "fail";
      const exportRow = {
        row_type: "calculator_leveling_closure",
        order: args.order,
        order_desc: spec.desc,
        route_length_km: args.routeLengthKm,
        measured_error_mm: args.measuredError,
        allowed_limit_mm: allowedLimitMm,
        ratio_pct: ratioPct,
        quality_status: qualityStatus,
        is_passed: pass,
      };
      return ok({
        measured_error_mm: args.measuredError,
        allowed_limit_mm: allowedLimitMm,
        order_desc: spec.desc,
        formula: `±${spec.k}√L = ±${spec.k}×√${args.routeLengthKm} = ±${limit.toFixed(3)} mm`,
        is_passed: pass,
        ratio_pct: ratioPct,
        closure_summary: {
          check_type: "leveling_closure",
          order: args.order,
          order_desc: spec.desc,
          route_length_km: args.routeLengthKm,
          measured_error_mm: args.measuredError,
          allowed_limit_mm: allowedLimitMm,
          ratio_pct: ratioPct,
          quality_status: qualityStatus,
          is_passed: pass,
        },
        export_rows: [exportRow],
        message: pass
          ? `✅ 合格：实测闭合差 ${args.measuredError}mm，限差 ±${limit.toFixed(3)}mm，占限差比例 ${((Math.abs(args.measuredError) / limit) * 100).toFixed(1)}%`
          : `❌ 超限：实测闭合差 ${args.measuredError}mm，限差 ±${limit.toFixed(3)}mm，超出限差 ${(Math.abs(args.measuredError) - limit).toFixed(3)}mm，必须返工重测！`,
      });
    },
  );

  server.tool(
    "calculator_traverse_closure",
    "计算附合导线或闭合导线的角度闭合差是否满足规范限差。调用前请确认仪器等级和测站数量。",
    {
      measuredAngularError: z.number().describe("实测角度闭合差，单位为角秒(″)，允许负值"),
      stationCount: z.number().int().positive().describe("导线测站总数（转折点数量，不含起始点）"),
      instrument: z.enum(["DJ1", "DJ2", "DJ6"]).default("DJ2").describe("使用的经纬仪等级：DJ1/DJ2/DJ6"),
    },
    async (args) => {
      const spec = TRAVERSE_ANGULAR_LIMITS[args.instrument]!;
      const limit = spec.k * Math.sqrt(args.stationCount);
      const pass = Math.abs(args.measuredAngularError) <= limit;
      const allowedLimitArcsec = Number(limit.toFixed(1));
      const ratioPct = Number(((Math.abs(args.measuredAngularError) / limit) * 100).toFixed(1));
      const qualityStatus = pass ? "pass" : "fail";
      const exportRow = {
        row_type: "calculator_traverse_closure",
        instrument: args.instrument,
        instrument_desc: spec.desc,
        station_count: args.stationCount,
        measured_error_arcsec: args.measuredAngularError,
        allowed_limit_arcsec: allowedLimitArcsec,
        ratio_pct: ratioPct,
        quality_status: qualityStatus,
        is_passed: pass,
      };
      return ok({
        measured_error_arcsec: args.measuredAngularError,
        allowed_limit_arcsec: allowedLimitArcsec,
        instrument_desc: spec.desc,
        formula: `±${spec.k}″√n = ±${spec.k}×√${args.stationCount} = ±${limit.toFixed(1)}″`,
        is_passed: pass,
        ratio_pct: ratioPct,
        closure_summary: {
          check_type: "traverse_angular_closure",
          instrument: args.instrument,
          instrument_desc: spec.desc,
          station_count: args.stationCount,
          measured_error_arcsec: args.measuredAngularError,
          allowed_limit_arcsec: allowedLimitArcsec,
          ratio_pct: ratioPct,
          quality_status: qualityStatus,
          is_passed: pass,
        },
        export_rows: [exportRow],
        message: pass
          ? `✅ 合格：角度闭合差 ${args.measuredAngularError}″，限差 ±${limit.toFixed(1)}″`
          : `❌ 超限：角度闭合差 ${args.measuredAngularError}″，限差 ±${limit.toFixed(1)}″，超出 ${(Math.abs(args.measuredAngularError) - limit).toFixed(1)}″，必须返工重测！`,
      });
    },
  );

  server.tool(
    "calculator_alert_level",
    "根据监测点当前累计变化量和控制指标，计算预警等级。自动判断属于蓝色提示/黄色预警/红色报警/正常。",
    {
      cumulativeValue: z.number().describe("当前累计变化量绝对值，单位 mm（取绝对值传入）"),
      alertThreshold: z.number().positive().describe("规范规定的报警控制值（红线），单位 mm"),
      pointId: z.string().describe("测点编号，如 JC-01"),
    },
    async (args) => {
      const ratio = args.cumulativeValue / args.alertThreshold;
      let level: string;
      let color: string;
      let action: string;
      let levelCode: "red" | "orange" | "yellow" | "normal";
      if (ratio >= 1.0) {
        level = "红色报警";
        color = "🔴";
        action = "立即启动应急预案，暂停施工，通知各方负责人到场处置";
        levelCode = "red";
      } else if (ratio >= 0.85) {
        level = "橙色预警";
        color = "🟠";
        action = "通知项目负责人和监理，加密监测频率至每日2次，加强人工巡视";
        levelCode = "orange";
      } else if (ratio >= 0.7) {
        level = "黄色预警";
        color = "🟡";
        action = "加密监测频率，关注发展趋势，准备上报项目部";
        levelCode = "yellow";
      } else {
        level = "正常";
        color = "🟢";
        action = "按正常频率继续监测";
        levelCode = "normal";
      }
      const ratioPct = Number((ratio * 100).toFixed(1));
      const exportRow = {
        row_type: "calculator_alert_level",
        point_id: args.pointId,
        cumulative_value_mm: args.cumulativeValue,
        alert_threshold_mm: args.alertThreshold,
        ratio_pct: ratioPct,
        level,
        alert_level_code: levelCode,
        recommended_action: action,
      };
      return ok({
        point_id: args.pointId,
        cumulative_value_mm: args.cumulativeValue,
        alert_threshold_mm: args.alertThreshold,
        ratio_pct: ratioPct,
        level,
        alert_level_code: levelCode,
        color,
        action,
        alert_summary: {
          point_id: args.pointId,
          cumulative_value_mm: args.cumulativeValue,
          alert_threshold_mm: args.alertThreshold,
          ratio_pct: ratioPct,
          level,
          alert_level_code: levelCode,
          recommended_action: action,
        },
        export_rows: [exportRow],
        message: `${color} ${args.pointId}：累计变化量 ${args.cumulativeValue}mm，占控制值比例 ${(ratio * 100).toFixed(1)}%，${level}。建议措施：${action}`,
      });
    },
  );

  const levelAdjustToolSchema = {
    known_bms: z
      .array(
        z.object({
          name: z.string().describe("已知水准点名"),
          h: z.number().describe("已知高程，单位 m"),
          fixed: z.boolean().default(true).describe("是否固定点"),
        }),
      )
      .min(1),
    segments: z
      .array(
        z.object({
          from: z.string().describe("测段起点"),
          to: z.string().describe("测段终点"),
          dh_m: z.number().describe("观测高差，单位 m，from→to 为正"),
          length_km: z.number().positive().optional().describe("测段长度，单位 km"),
          n_stations: z.number().int().positive().optional().describe("测站数"),
          forward_dh_m: z.number().optional().describe("往测高差，单位 m，from→to 为正，用于往返较差检查"),
          backward_dh_m: z.number().optional().describe("返测高差，单位 m，通常按 to→from 方向记录，用于往返较差检查"),
          baseline_dh_m: z.number().optional().describe("CP2/CP3 复测基准高差，单位 m，用于检测复测高差之差"),
          resurvey_dh_m: z.number().optional().describe("CP2/CP3 本次复测高差，单位 m；未填时使用 dh_m"),
        }),
      )
      .min(1),
    weight_mode: z.enum(["length", "stations"]).default("length").describe("权阵模式：length=1/L，stations=1/n"),
    order: z
      .enum(["1st", "2nd", "3rd", "4th", "city-2nd"])
      .default("2nd")
      .describe("水准等级，用于往返高差较差限差 ±k√L"),
    reciprocal_tolerance_mm_per_sqrt_km: z
      .number()
      .positive()
      .optional()
      .describe("往返高差较差限差系数 k，单位 mm/√km；未填时按 order 取规范系数"),
    closure_tolerance_mm_per_sqrt_km: z
      .number()
      .positive()
      .optional()
      .describe("路线闭合差限差系数 k，单位 mm/√km；未填时按 order 取规范系数"),
    resurvey_diff_tolerance_mm_per_sqrt_km: z
      .number()
      .positive()
      .optional()
      .describe("CP2/CP3 复测高差之差限差系数 k，单位 mm/√km；未填时按 order 取规范系数"),
  };
  const levelAdjustDescription =
    "PRD 内业平差工作台：水准网间接平差。输入已知水准点和测段高差，输出高程成果、中误差、测段残差和可导出的成果行。";
  server.tool("level_adjust", levelAdjustDescription, levelAdjustToolSchema, async (args) =>
    ok(calculatePrdLevelAdjust(args)),
  );
  server.tool("survey_level_adjust", levelAdjustDescription, levelAdjustToolSchema, async (args) =>
    ok(calculatePrdLevelAdjust(args)),
  );

  const traverseAdjustToolSchema = {
    known_points: z
      .array(
        z.object({
          name: z.string().describe("已知点名"),
          x: z.number().describe("X/E 坐标，单位 m"),
          y: z.number().describe("Y/N 坐标，单位 m"),
          fixed: z.boolean().default(true).describe("是否固定点"),
        }),
      )
      .min(2),
    observations: z
      .array(
        z.object({
          from: z.string().describe("测站或上一点"),
          to: z.string().describe("目标点/下一导线点"),
          hz_angle_deg: z.number().describe("水平角/转折角，十进制度"),
          zenith_deg: z.number().optional().describe("天顶距，十进制度；提供时将斜距投影为平距"),
          slope_dist_m: z.number().positive().optional().describe("斜距，单位 m"),
          horizontal_dist_m: z.number().positive().optional().describe("水平距离，单位 m；优先于斜距"),
          face_left_hz_deg: z.number().optional().describe("盘左水平角/方向值，十进制度，用于 2C 差检查"),
          face_right_hz_deg: z.number().optional().describe("盘右水平角/方向值，十进制度，用于 2C 差检查"),
          round_angles_deg: z.array(z.number()).optional().describe("各测回水平角/方向值，十进制度，用于测回差检查"),
          forward_dist_m: z.number().positive().optional().describe("往测距离，单位 m，用于测距往返差检查"),
          backward_dist_m: z.number().positive().optional().describe("返测距离，单位 m，用于测距往返差检查"),
        }),
      )
      .min(1),
    params: z.object({
      start_azimuth_deg: z.number().describe("起算方位角，十进制度"),
      end_azimuth_deg: z.number().describe("终边/闭合方位角，十进制度"),
      dir_mse_sec: z.number().positive().default(1).describe("方向中误差，单位角秒"),
      dist_fixed_mm: z.number().positive().default(1).describe("测距固定误差，单位 mm"),
      ppm: z.number().default(1).describe("测距比例误差，ppm"),
      refraction: z.number().default(0.14).describe("折射系数"),
      ellipsoid_r: z.number().positive().default(6371000).describe("椭球半径，单位 m"),
      height_projection: z.boolean().default(true).describe("是否进行高程投影改正"),
      two_c_face_tolerance_sec: z.number().positive().default(20).describe("2C 差限差，单位角秒"),
      round_diff_tolerance_sec: z.number().positive().default(12).describe("测回差限差，单位角秒"),
      distance_reciprocal_tolerance_mm: z.number().positive().default(5).describe("测距往返差限差，单位 mm"),
      edge_relative_mse_tolerance_ratio: z
        .number()
        .positive()
        .default(40000)
        .describe("导线边长相对中误差限值分母，例如 40000 表示不低于 1/40000"),
      relative_mse_tolerance_ratio: z.number().positive().optional().describe("导线边长相对中误差限值分母别名"),
      model: z.enum(["normal", "helmert", "free"]).default("normal").describe("平差模型"),
    }),
  };
  const traverseAdjustDescription =
    "PRD 内业平差工作台：导线平面平差。输入已知点、导线角度/距离观测和起算参数，输出平差坐标、中误差、误差椭圆和可导出成果行。";
  server.tool("traverse_adjust", traverseAdjustDescription, traverseAdjustToolSchema, async (args) =>
    ok(calculatePrdTraverseAdjust(args)),
  );
  server.tool("survey_traverse_adjust", traverseAdjustDescription, traverseAdjustToolSchema, async (args) =>
    ok(calculatePrdTraverseAdjust(args)),
  );

  server.tool(
    "calculator_leveling_adjustment",
    "水准网严密平差（最小二乘法）。输入已知基准点高程和观测的高差数据，返回平差后高程、残差、单位权中误差及各点精度评定。处理完闭合差校核后需要严密计算时必须调用此工具。",
    {
      benchmarks: z
        .array(z.object({ id: z.string().describe("基准点编号"), height: z.number().describe("已知高程(m)") }))
        .min(1)
        .optional()
        .describe("已知高程的基准点列表（至少1个）"),
      observations: z
        .array(
          z.object({
            from: z.string().describe("后视点编号"),
            to: z.string().describe("前视点编号"),
            heightDiff: z.number().describe("观测高差(m)，from→to方向为正"),
            routeLength: z.number().positive().describe("该测段路线长度(km)"),
          }),
        )
        .min(1)
        .optional()
        .describe("所有观测高差数据"),
      order: z.enum(["1st", "2nd", "3rd", "4th", "city-2nd"]).default("4th").describe("测量等级，用于精度评定对比"),
      csvText: z.string().optional().describe("可选，中文 CSV/TSV。每行提供已知点高程或高差观测，自动解析后严密平差"),
      csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
    },
    async (args) => {
      const parsed = args.csvText ? parseLevelingAdjustmentCsv(args.csvText, args.csvDelimiter) : null;
      const benchmarks = parsed?.benchmarks ?? args.benchmarks;
      const observations = parsed?.observations ?? args.observations;
      const order = parsed?.order ?? args.order;
      if (!benchmarks?.length || !observations?.length) {
        throw new Error("calculator_leveling_adjustment 需要提供 benchmarks+observations 或 csvText 输入");
      }
      const knownMap = new Map(benchmarks.map((b) => [b.id, b.height]));
      const unknownIds = [
        ...new Set(observations.flatMap((o) => [o.from, o.to]).filter((id) => !knownMap.has(id))),
      ];
      const u = unknownIds.length;
      const n = observations.length;
      if (u === 0) return ok({ error: "所有点均为已知点，无需平差。" });
      if (n < u) return ok({ error: `观测数 ${n} 少于未知数 ${u}，无法进行平差。需要至少 ${u} 个观测值。` });

      const idxOf = (id: string) => unknownIds.indexOf(id);
      const A = mat.zeros(n, u);
      const P = mat.zeros(n, n);
      const L: number[] = [];
      for (let i = 0; i < n; i++) {
        const obs = observations[i]!;
        const fromIdx = idxOf(obs.from);
        const toIdx = idxOf(obs.to);
        if (fromIdx >= 0) A[i]![fromIdx] = -1;
        if (toIdx >= 0) A[i]![toIdx] = 1;
        P[i]![i] = 1 / obs.routeLength;
        const fromH = knownMap.get(obs.from) ?? 0;
        const toH = knownMap.get(obs.to) ?? 0;
        L.push(obs.heightDiff - (toH - fromH));
      }
      const AT = mat.transpose(A);
      const ATP = mat.mul(AT, P);
      const N = mat.mul(ATP, A);
      const b = mat.mulVec(ATP, L);
      const Qxx = mat.invert(N);
      if (!Qxx) return ok({ error: "法方程系数矩阵奇异，无法求解。请检查网形是否连通。" });
      const X = mat.mulVec(Qxx, b);
      const AX = mat.mulVec(A, X);
      const V = AX.map((v, i) => v - L[i]!);
      const VTPV = V.reduce((sum, v, i) => sum + v * P[i]![i]! * v, 0);
      const redundancy = n - u;
      const sigma0 = redundancy > 0 ? Math.sqrt(VTPV / redundancy) : 0;
      const adjusted = unknownIds.map((id, i) => {
        const approxH = knownMap.get(id) ?? 0;
        const correction = X[i]!;
        const height = approxH + correction;
        const rmse = sigma0 * Math.sqrt(Math.abs(Qxx[i]![i]!));
        return {
          point_id: id,
          adjusted_height_m: Number(height.toFixed(4)),
          correction_mm: Number((correction * 1000).toFixed(3)),
          rmse_mm: Number((rmse * 1000).toFixed(3)),
        };
      });
      const residuals = observations.map((obs, i) => ({
        from: obs.from,
        to: obs.to,
        observed_mm: Number((obs.heightDiff * 1000).toFixed(3)),
        residual_mm: Number((V[i]! * 1000).toFixed(3)),
      }));
      const spec = LEVELING_LIMITS[order]!;
      const maxRmse = Math.max(...adjusted.map((a) => a.rmse_mm));
      const unitWeightRmseMm = Number((sigma0 * 1000).toFixed(3));
      const qualityStatus = unitWeightRmseMm < spec.k ? "pass" : "review";
      const exportRows = [
        ...adjusted.map((point) => ({
          row_type: "leveling_adjusted_height",
          point_id: point.point_id,
          adjusted_height_m: point.adjusted_height_m,
          correction_mm: point.correction_mm,
          rmse_mm: point.rmse_mm,
        })),
        ...residuals.map((residual) => ({
          row_type: "leveling_observation_residual",
          from: residual.from,
          to: residual.to,
          observed_mm: residual.observed_mm,
          residual_mm: residual.residual_mm,
        })),
      ];
      return ok({
        method: "最小二乘法严密平差",
        input_format: parsed ? "csv" : "json",
        parsed_row_count: parsed?.parsedRowCount ?? null,
        known_points: benchmarks.length,
        unknown_points: u,
        observations: n,
        redundancy,
        unit_weight_rmse_mm: unitWeightRmseMm,
        order_desc: spec.desc,
        max_point_rmse_mm: maxRmse,
        leveling_adjustment_summary: {
          method: "least_squares_leveling_adjustment",
          order,
          order_desc: spec.desc,
          known_point_count: benchmarks.length,
          unknown_point_count: u,
          observation_count: n,
          redundancy,
          unit_weight_rmse_mm: unitWeightRmseMm,
          max_point_rmse_mm: maxRmse,
          quality_status: qualityStatus,
        },
        adjusted_heights: adjusted,
        residuals,
        export_rows: exportRows,
        assessment:
          sigma0 * 1000 < spec.k
            ? `✅ 单位权中误差 ${(sigma0 * 1000).toFixed(3)}mm < ${spec.k}mm（${spec.desc}限差系数），精度合格`
            : `⚠️ 单位权中误差 ${(sigma0 * 1000).toFixed(3)}mm ≥ ${spec.k}mm（${spec.desc}限差系数），建议检查观测质量`,
      });
    },
  );

  server.tool(
    "calculator_traverse_adjustment",
    "附合导线/闭合导线坐标平差计算。输入起始点坐标、起始方位角、各站观测角和边长，返回平差后坐标、闭合差分析及各点精度。处理导线测量数据时必须调用此工具。",
    {
      startPoint: z
        .object({
          id: z.string().describe("起始点编号"),
          x: z.number().describe("起始点X坐标（东方向/m）"),
          y: z.number().describe("起始点Y坐标（北方向/m）"),
        })
        .optional()
        .describe("起始已知点"),
      endPoint: z
        .object({
          id: z.string().describe("终止点编号"),
          x: z.number().describe("终止点X坐标（东方向/m）"),
          y: z.number().describe("终止点Y坐标（北方向/m）"),
        })
        .optional()
        .describe("终止已知点（附合导线需要；闭合导线与起始点相同）"),
      startAzimuth: z.number().optional().describe("起始边方位角（度，十进制）"),
      endAzimuth: z.number().optional().describe("终止边方位角（度，十进制）；闭合导线传起始方位角"),
      stations: z
        .array(
          z.object({
            id: z.string().describe("转折点编号"),
            angle: z.number().describe("观测的左角/转折角（度，十进制）"),
            distance: z.number().positive().describe("该站到下一站的边长(m)"),
          }),
        )
        .min(1)
        .optional()
        .describe("各导线测站观测数据（按测量顺序排列）"),
      instrument: z.enum(["DJ1", "DJ2", "DJ6"]).default("DJ2").describe("经纬仪等级"),
      csvText: z.string().optional().describe("可选，中文 CSV/TSV。每行提供起终点坐标或测站角度边长，自动解析后做导线平差"),
      csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
    },
    async (args) => {
      const parsed = args.csvText ? parseTraverseAdjustmentCsv(args.csvText, args.csvDelimiter) : null;
      const startPoint = parsed?.startPoint ?? args.startPoint;
      const endPoint = parsed?.endPoint ?? args.endPoint;
      const startAzimuth = parsed?.startAzimuth ?? args.startAzimuth;
      const endAzimuth = parsed?.endAzimuth ?? args.endAzimuth;
      const stations = parsed?.stations ?? args.stations;
      const instrument = parsed?.instrument ?? args.instrument;
      if (!startPoint || !endPoint || startAzimuth === undefined || endAzimuth === undefined || !stations?.length) {
        throw new Error("calculator_traverse_adjustment 需要提供 startPoint/endPoint/startAzimuth/endAzimuth/stations 或 csvText 输入");
      }
      const n = stations.length;
      const angSpec = TRAVERSE_ANGULAR_LIMITS[instrument]!;
      const sumAngles = stations.reduce((s, st) => s + st.angle, 0);
      const theoreticalSum = (((endAzimuth - startAzimuth + 180 * n) % 360) + 360) % 360;
      const angularClosure = sumAngles - theoreticalSum;
      const normalized =
        angularClosure > 180 ? angularClosure - 360 : angularClosure < -180 ? angularClosure + 360 : angularClosure;
      const closureSec = normalized * 3600;
      const angLimit = angSpec.k * Math.sqrt(n);
      if (Math.abs(closureSec) > angLimit)
        return ok({
          error: `角度闭合差 ${closureSec.toFixed(1)}″ 超出限差 ±${angLimit.toFixed(1)}″（${angSpec.desc}），请先返工重测角度。`,
          angular_closure_arcsec: Number(closureSec.toFixed(1)),
          angular_limit_arcsec: Number(angLimit.toFixed(1)),
        });
      const corr = -normalized / n;
      const azimuths: number[] = [];
      let az = startAzimuth;
      for (const st of stations) {
        az = (((az + st.angle + corr + 180) % 360) + 360) % 360;
        azimuths.push(az);
      }
      const totalDist = stations.reduce((s, st) => s + st.distance, 0);
      const dxArr = stations.map((st, i) => st.distance * Math.sin(deg2rad(azimuths[i]!)));
      const dyArr = stations.map((st, i) => st.distance * Math.cos(deg2rad(azimuths[i]!)));
      const sumDx = dxArr.reduce((a, b) => a + b, 0);
      const sumDy = dyArr.reduce((a, b) => a + b, 0);
      const fx = sumDx - (endPoint.x - startPoint.x);
      const fy = sumDy - (endPoint.y - startPoint.y);
      const closureDist = Math.sqrt(fx * fx + fy * fy);
      const relClosure = closureDist > 0 ? totalDist / closureDist : Infinity;
      const coords: Array<{ id: string; x: number; y: number }> = [];
      let cumDist = 0;
      for (let i = 0; i < n; i++) {
        cumDist += stations[i]!.distance;
        const ratio = cumDist / totalDist;
        const cx = startPoint.x + dxArr.slice(0, i + 1).reduce((a, b) => a + b, 0) - fx * ratio;
        const cy = startPoint.y + dyArr.slice(0, i + 1).reduce((a, b) => a + b, 0) - fy * ratio;
        coords.push({ id: stations[i]!.id, x: Number(cx.toFixed(4)), y: Number(cy.toFixed(4)) });
      }
      const pointRmse = closureDist / Math.sqrt(3 * n);
      const angularClosureResult = {
        measured_arcsec: Number(closureSec.toFixed(1)),
        limit_arcsec: Number(angLimit.toFixed(1)),
        correction_per_station_arcsec: Number((corr * 3600).toFixed(2)),
        is_passed: true,
      };
      const coordinateClosure = {
        fx_m: Number(fx.toFixed(4)),
        fy_m: Number(fy.toFixed(4)),
        closure_distance_m: Number(closureDist.toFixed(4)),
        relative_closure: `1/${Math.round(relClosure)}`,
        assessment:
          relClosure >= 10000
            ? "✅ 优秀（全长相对闭合差 < 1/10000）"
            : relClosure >= 4000
              ? "✅ 良好（全长相对闭合差 < 1/4000）"
              : relClosure >= 2000
                ? "⚠️ 一般（全长相对闭合差 < 1/2000），建议复查"
                : "❌ 不合格，需返工重测",
      };
      const pointRmseMm = Number((pointRmse * 1000).toFixed(2));
      const adjustedAzimuths = azimuths.map((a, i) => ({
        from: i === 0 ? startPoint.id : stations[i - 1]!.id,
        to: stations[i]!.id,
        azimuth: Number(a.toFixed(6)),
      }));
      const qualityStatus = relClosure >= 2000 ? "pass" : "review";
      const exportRows = [
        {
          row_type: "traverse_adjustment_summary",
          station_count: n,
          total_distance_m: Number(totalDist.toFixed(3)),
          angular_closure_arcsec: angularClosureResult.measured_arcsec,
          angular_limit_arcsec: angularClosureResult.limit_arcsec,
          coordinate_closure_distance_m: coordinateClosure.closure_distance_m,
          relative_closure: coordinateClosure.relative_closure,
          point_rmse_mm: pointRmseMm,
          quality_status: qualityStatus,
        },
        ...coords.map((point) => ({
          row_type: "traverse_adjusted_coordinate",
          point_id: point.id,
          x: point.x,
          y: point.y,
        })),
        ...adjustedAzimuths.map((azimuth) => ({
          row_type: "traverse_adjusted_azimuth",
          from: azimuth.from,
          to: azimuth.to,
          azimuth_degrees: azimuth.azimuth,
        })),
      ];
      return ok({
        method: "附合导线简易平差（角度等权分配，坐标按边长比例分配）",
        input_format: parsed ? "csv" : "json",
        parsed_row_count: parsed?.parsedRowCount ?? null,
        station_count: n,
        total_distance_m: Number(totalDist.toFixed(3)),
        angular_closure: angularClosureResult,
        coordinate_closure: coordinateClosure,
        traverse_adjustment_summary: {
          method: "traverse_bowditch_adjustment",
          instrument,
          station_count: n,
          total_distance_m: Number(totalDist.toFixed(3)),
          angular_closure_arcsec: angularClosureResult.measured_arcsec,
          angular_limit_arcsec: angularClosureResult.limit_arcsec,
          coordinate_closure_distance_m: coordinateClosure.closure_distance_m,
          relative_closure: coordinateClosure.relative_closure,
          point_rmse_mm: pointRmseMm,
          quality_status: qualityStatus,
        },
        adjusted_coordinates: coords,
        azimuths_deg: adjustedAzimuths,
        point_rmse_mm: pointRmseMm,
        export_rows: exportRows,
      });
    },
  );
}
