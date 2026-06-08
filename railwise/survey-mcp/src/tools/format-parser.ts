import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from "node:path";
import { ok, readTextFile } from "../util.js";

const FIELDS: Record<number, string> = {
  11: "point_id",
  21: "hz_angle_deg",
  22: "v_angle_deg",
  31: "slope_dist_m",
  32: "horiz_dist_m",
  33: "height_diff_m",
  81: "easting_m",
  82: "northing_m",
  83: "elevation_m",
  87: "reflector_height_m",
  88: "instrument_height_m",
};

const ANGLES = new Set([21, 22]);
const METRIC = new Set([31, 32, 33, 81, 82, 83, 87, 88]);

const PATTERNS: [RegExp, string][] = [
  [/^(role|kind|type|rowtype|recordkind|类别|类型|行类型|记录类型)$/i, "record_kind"],
  [/^(point|id|name|pt|nr|编号|测点|点号)$/i, "point_id"],
  [/^(from|start|startpoint|startid|后视点|起点)$/i, "from"],
  [/^(to|end|endpoint|endid|前视点|终点)$/i, "to"],
  [/^(hz|h_angle|horizontal_angle|水平角|ha|hz_angle)$/i, "hz_angle_deg"],
  [/^(v_angle|vertical|zenith|天顶角|竖直角|va)$/i, "v_angle_deg"],
  [/^(slope|sd|slope_dist|斜距|slope_distance)$/i, "slope_dist_m"],
  [/^(hd|horiz_dist|horizontal_dist|平距|水平距)$/i, "horiz_dist_m"],
  [/^(dh|height_diff|高差)$/i, "height_diff_m"],
  [/^(lengthm|length_m|distancem|distance_m|测段长度|测段长度m|测段长|测段长m|长度m|距离m)$/i, "length_m"],
  [/^(lengthkm|length_km|distancekm|distance_km|测段长度km|测段长km|长度km|距离km)$/i, "length_km"],
  [/^(nstations|n_stations|stationcount|station_count|stations|测站数)$/i, "n_stations"],
  [/^(weightmode|weight_mode|定权方式|权)$/i, "weight_mode"],
  [/^(east|easting|e_coord|东坐标)$/i, "easting_m"],
  [/^(north|northing|n_coord|北坐标)$/i, "northing_m"],
  [/^(elev|elevation|height|h_coord|高程|高度)$/i, "elevation_m"],
  [/^(rh|reflector|target_height|棱镜高|觇标高)$/i, "reflector_height_m"],
  [/^(ih|instrument_height|仪器高)$/i, "instrument_height_m"],
];

function normalizeHeader(header: string): string {
  return header
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[\s_\-./]/g, "")
    .toLowerCase();
}

function normalizeHeaderWithUnits(header: string): string {
  return header
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/[\s_\-./（）()]/g, "")
    .toLowerCase();
}

function dms(data: string, wide: boolean) {
  const deg = parseInt(data.slice(0, 3), 10);
  const min = parseInt(data.slice(3, 5), 10);
  const sec = wide
    ? parseInt(data.slice(5, 7), 10) + parseInt(data.slice(7), 10) / Math.pow(10, data.length - 7)
    : parseInt(data.slice(5, 7), 10) + parseInt(data.slice(7), 10) / 10;
  return deg + min / 60 + sec / 3600;
}

function normalizeSignedNumericText(value: string): string {
  return value
    .trim()
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10))
    .replace(/[−－﹣–—]/g, "-")
    .replace(/[＋﹢]/g, "+")
    .replace(/[．。]/g, ".")
    .replace(/[,，]/g, "");
}

function parseNumericCell(value: string): number {
  const normalized = normalizeSignedNumericText(value);
  if (!normalized) return Number.NaN;
  const direct = Number(normalized);
  if (Number.isFinite(direct)) return direct;
  const match = normalized.match(/[-+]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

function detectDatDelimiter(firstLine: string): "," | "\t" | ";" | "whitespace" {
  if (firstLine.includes("\t")) return "\t";
  if (firstLine.includes(",")) return ",";
  if (firstLine.includes(";")) return ";";
  return "whitespace";
}

function splitDatLine(line: string, delimiter: "," | "\t" | ";" | "whitespace"): string[] {
  if (delimiter === "whitespace") return line.trim().split(/\s+/);

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

function normalizeDatRecordKind(value: string): string {
  const normalized = value.trim().replace(/[\s_\-./]/g, "").toLowerCase();
  if (/known|fixed|benchmark|control|coordinate|已知|固定|水准点|控制点/.test(normalized)) return "coordinate";
  if (/level|segment|observation|observe|测段|水准测段|观测/.test(normalized)) return "level_segment";
  if (/traverse|导线/.test(normalized)) return "traverse_observation";
  return value.trim();
}

function normalizeDatRecord(record: Record<string, string | number>): Record<string, string | number> {
  const normalized = { ...record };
  const kind = typeof normalized.record_kind === "string" ? normalized.record_kind : "";
  const pointId = typeof normalized.point_id === "string" ? normalized.point_id : "";
  const hasElevation = typeof normalized.elevation_m === "number" && Number.isFinite(normalized.elevation_m);
  const hasCoordinate =
    typeof normalized.easting_m === "number" &&
    Number.isFinite(normalized.easting_m) &&
    typeof normalized.northing_m === "number" &&
    Number.isFinite(normalized.northing_m);
  const hasLevelSegment =
    typeof normalized.from === "string" &&
    normalized.from.length > 0 &&
    typeof normalized.to === "string" &&
    normalized.to.length > 0 &&
    typeof normalized.height_diff_m === "number" &&
    Number.isFinite(normalized.height_diff_m);
  const hasTraverseObservation =
    (typeof normalized.hz_angle_deg === "number" && Number.isFinite(normalized.hz_angle_deg)) ||
    (typeof normalized.slope_dist_m === "number" && Number.isFinite(normalized.slope_dist_m)) ||
    (typeof normalized.horiz_dist_m === "number" && Number.isFinite(normalized.horiz_dist_m));

  if (!kind) {
    if (hasLevelSegment) normalized.record_kind = "level_segment";
    else if (pointId && (hasCoordinate || hasElevation)) normalized.record_kind = "coordinate";
    else if (hasTraverseObservation) normalized.record_kind = "traverse_observation";
  }
  if (normalized.record_kind === "level_segment" && !pointId && typeof normalized.from === "string" && typeof normalized.to === "string") {
    normalized.point_id = `${normalized.from}-${normalized.to}`;
  }
  if (typeof normalized.length_m === "number" && Number.isFinite(normalized.length_m) && typeof normalized.length_km !== "number") {
    normalized.horiz_dist_m = normalized.length_m;
    normalized.length_km = Number((normalized.length_m / 1000).toFixed(6));
    delete normalized.length_m;
  }
  if (typeof normalized.length_km === "number" && Number.isFinite(normalized.length_km) && typeof normalized.horiz_dist_m !== "number") {
    normalized.horiz_dist_m = Number((normalized.length_km * 1000).toFixed(4));
  }
  return normalized;
}

function word(raw: string, wide: boolean) {
  const clean = normalizeSignedNumericText(raw).replace(/^[*+]+/, "");
  const m = clean.match(/^(\d{2})([^+-]+)([+-])(.+)$/);
  if (!m) return null;

  const wi = parseInt(m[1]!, 10);
  const name = FIELDS[wi];
  if (!name) return null;

  if (wi === 11) return { name, value: m[4]!.replace(/^[0\s]+/, "") || "0" };

  const sign = m[3] === "-" ? -1 : 1;
  if (ANGLES.has(wi)) return { name, value: Number((sign * dms(m[4]!, wide)).toFixed(6)) };
  if (METRIC.has(wi))
    return { name, value: Number(((sign * parseInt(m[4]!, 10)) / (wide ? 10000 : 1000)).toFixed(4)) };
  return null;
}

function gsi(content: string, wide: boolean) {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return null;

  const starred = lines.some((l) => l.startsWith("*"));
  const groups = starred
    ? lines.reduce<string[][]>((acc, line) => {
        if (line.startsWith("*")) {
          acc.push([line]);
          return acc;
        }
        const last = acc[acc.length - 1];
        if (last) last.push(line);
        return acc;
      }, [])
    : lines.map((l) => [l]);

  const records = groups
    .map((group) =>
      group
        .flatMap((line) => line.split(/\s+/))
        .reduce<Record<string, string | number>>((obs, w) => {
          const parsed = word(w, wide);
          if (parsed) obs[parsed.name] = parsed.value;
          return obs;
        }, {}),
    )
    .filter((obs) => Object.keys(obs).length > 0);

  if (records.length === 0) return null;
  return { format: wide ? "gsi-16" : "gsi-8", records };
}

function dat(content: string) {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("!"));
  if (lines.length < 2) return null;

  const first = lines[0]!;
  const delimiter = detectDatDelimiter(first);
  const cells = splitDatLine(first, delimiter);
  if (!cells.some((c) => /[a-zA-Z\u4e00-\u9fff]/.test(c))) return null;

  const mapping = cells.map((h) => PATTERNS.find(([re]) => re.test(normalizeHeader(h)) || re.test(normalizeHeaderWithUnits(h)))?.[1] ?? null);
  if (!mapping.some(Boolean)) return null;

  const records = lines
    .slice(1)
    .map((line) => {
      const record = splitDatLine(line, delimiter)
        .map((c) => c.trim())
        .reduce<Record<string, string | number>>((obs, val, i) => {
          const col = mapping[i];
          if (!col || !val) return obs;
          if (["point_id", "record_kind", "from", "to", "weight_mode"].includes(col)) {
            obs[col] = col === "record_kind" ? normalizeDatRecordKind(val) : val;
            return obs;
          }
          const num = parseNumericCell(val);
          if (!isNaN(num)) obs[col] = num;
          return obs;
        }, {});
      return normalizeDatRecord(record);
    })
    .filter((obs) => Object.keys(obs).length > 0);

  if (records.length === 0) return null;
  return { format: "dat", records };
}

function detect(content: string) {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return null;

  const surveyCloud = surveyCloudJson(content);
  if (surveyCloud) return surveyCloud;
  const dini = diniM5(content);
  if (dini) return dini;
  const cpiii = cpiiiBundle(content);
  if (cpiii) return cpiii;
  const tpt = cpiiiTpt(content);
  if (tpt) return tpt;
  const suc = cpiiiSuc(content);
  if (suc) return suc;

  const probe = lines[0]!.replace(/^\*/, "").trim().split(/\s+/)[0] ?? "";
  const m = probe.match(/^(\d{2})([^+-]+)([+-])(.+)$/);
  if (m) return gsi(content, m[4]!.length > 8);
  return dat(content);
}

type ParserFormat =
  | "gsi-8"
  | "gsi-16"
  | "dat-auto"
  | "survey-cloud-json"
  | "dini-m5"
  | "cpiii-tpt"
  | "cpiii-suc"
  | "cpiii-bundle";
type ParsedRecord = Record<string, string | number>;
type ParsedFormatResult = { format: string; records: ParsedRecord[] };
type DiniM5Line = {
  pointId?: string;
  from?: string;
  to?: string;
  elevationM?: number;
  heightDiffM?: number;
  backsightM?: number;
  foresightM?: number;
  distanceM?: number;
  nStations?: number;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textFromRecord(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function numberFromRecord(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = parseNumericCell(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function recordsFromUnknown(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainRecord);
}

function diniM5TokenParts(token: string): { key: string; value: string } | null {
  const clean = token.replace(/^For\s+/i, "").trim();
  if (!clean || /^M5$/i.test(clean)) return null;
  const match = clean.match(/^([A-Za-z]+[0-9]*)(?:\s*[:=]\s*|\s+)(.+)$/);
  if (!match) return null;
  return {
    key: match[1]!.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
    value: match[2]!.trim(),
  };
}

function diniM5PointId(value: string): string {
  return value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ");
}

function parseDiniM5Line(line: string): DiniM5Line | null {
  if (!/(?:^|\s)(?:For\s+)?M5\|/i.test(line)) return null;
  const parsed: DiniM5Line = {};
  for (const token of line.split("|")) {
    const parts = diniM5TokenParts(token);
    if (!parts) continue;
    const key = parts.key;
    const value = parts.value;
    const numeric = parseNumericCell(value);
    if (/^PI\d*$|^PN$|^PNT$|^POINT$|^POINTID$/.test(key)) {
      parsed.pointId = diniM5PointId(value);
    } else if (/^FROM$|^START$/.test(key)) {
      parsed.from = diniM5PointId(value);
    } else if (/^TO$|^END$/.test(key)) {
      parsed.to = diniM5PointId(value);
    } else if (/^Z$|^H$|^EL$|^ELEV$|^HEIGHT$/.test(key) && Number.isFinite(numeric)) {
      parsed.elevationM = numeric;
    } else if (/^DH$|^DZ$|^HDIFF$|^HEIGHTDIFF$/.test(key) && Number.isFinite(numeric)) {
      parsed.heightDiffM = numeric;
    } else if (/^RB$|^BS$|^BACKSIGHT$/.test(key) && Number.isFinite(numeric)) {
      parsed.backsightM = numeric;
    } else if (/^RF$|^FS$|^FORESIGHT$/.test(key) && Number.isFinite(numeric)) {
      parsed.foresightM = numeric;
    } else if (/^HD$|^E$|^DIST$|^DISTANCE$|^DB$|^DF$/.test(key) && Number.isFinite(numeric)) {
      parsed.distanceM = numeric;
    } else if (/^N$|^ST$|^STATION$|^STATIONS$/.test(key) && Number.isFinite(numeric)) {
      parsed.nStations = Math.max(Math.round(numeric), 1);
    }
  }
  return Object.keys(parsed).length > 0 ? parsed : null;
}

function diniM5(content: string): ParsedFormatResult | null {
  if (!/(?:^|\n)\s*(?:For\s+)?M5\|/i.test(content)) return null;
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const parsedLines = lines.map(parseDiniM5Line).filter((line): line is DiniM5Line => line !== null);
  if (parsedLines.length === 0) return null;

  const records: ParsedRecord[] = [];
  let backsight: { pointId: string; readingM: number; distanceM?: number } | null = null;
  let currentPoint = "";
  let firstBenchmark = "";
  const addSegment = (from: string, to: string, heightDiffM: number, lengthM?: number, nStations?: number) => {
    if (!from || !to || !Number.isFinite(heightDiffM)) return;
    records.push({
      record_kind: "level_segment",
      point_id: `${from}-${to}`,
      from,
      to,
      height_diff_m: Number(heightDiffM.toFixed(4)),
      ...(Number.isFinite(lengthM ?? Number.NaN)
        ? {
            horiz_dist_m: Number((lengthM ?? 0).toFixed(4)),
            length_km: Number(((lengthM ?? 0) / 1000).toFixed(6)),
          }
        : {}),
      n_stations: Math.max(Math.round(nStations ?? 1), 1),
    });
    currentPoint = to;
  };

  for (const line of parsedLines) {
    if (line.pointId && Number.isFinite(line.elevationM ?? Number.NaN)) {
      records.push({
        record_kind: "coordinate",
        point_id: line.pointId,
        elevation_m: Number((line.elevationM ?? 0).toFixed(4)),
      });
      firstBenchmark ||= line.pointId;
      currentPoint ||= line.pointId;
    }

    if (line.pointId && Number.isFinite(line.heightDiffM ?? Number.NaN)) {
      const from = line.from ?? currentPoint ?? firstBenchmark;
      const to = line.to ?? line.pointId;
      addSegment(from, to, line.heightDiffM ?? 0, line.distanceM, line.nStations);
      continue;
    }

    if (line.pointId && Number.isFinite(line.backsightM ?? Number.NaN)) {
      backsight = {
        pointId: line.pointId,
        readingM: line.backsightM ?? 0,
        ...(Number.isFinite(line.distanceM ?? Number.NaN) ? { distanceM: line.distanceM } : {}),
      };
      currentPoint ||= line.pointId;
      continue;
    }

    if (line.pointId && Number.isFinite(line.foresightM ?? Number.NaN) && backsight) {
      const lengthM =
        Number.isFinite(backsight.distanceM ?? Number.NaN) || Number.isFinite(line.distanceM ?? Number.NaN)
          ? (backsight.distanceM ?? 0) + (line.distanceM ?? 0)
          : undefined;
      addSegment(backsight.pointId, line.pointId, backsight.readingM - (line.foresightM ?? 0), lengthM, line.nStations);
      backsight = null;
    }
  }

  return records.length > 0 ? { format: "dini-m5", records } : null;
}

function normalizedKind(record: Record<string, unknown>): string {
  return (
    textFromRecord(record, ["record_kind", "recordKind", "row_type", "rowType", "type", "kind"]) ?? ""
  )
    .replace(/[\s_\-./]/g, "")
    .toLowerCase();
}

function hasAnyNumber(record: Record<string, unknown>, keys: string[]): boolean {
  return numberFromRecord(record, keys) !== null;
}

function isCoordinateLikeRecord(record: Record<string, unknown>): boolean {
  const kind = normalizedKind(record);
  if (kind.includes("coordinate") || kind.includes("knownpoint") || kind.includes("controlpoint")) return true;
  return (
    textFromRecord(record, ["point_id", "pointId", "name", "id", "point", "pt"]) !== null &&
    (hasAnyNumber(record, ["easting_m", "easting", "east", "x"]) ||
      hasAnyNumber(record, ["northing_m", "northing", "north", "y"]) ||
      hasAnyNumber(record, ["elevation_m", "elevation", "height", "h", "z"]))
  );
}

function isLevelLikeRecord(record: Record<string, unknown>): boolean {
  const kind = normalizedKind(record);
  if (kind.includes("traverse")) return false;
  if (kind.includes("observation") && !kind.includes("level")) return false;
  if (kind.includes("level")) return true;
  return (
    textFromRecord(record, ["from", "start", "startPoint"]) !== null &&
    textFromRecord(record, ["to", "end", "endPoint"]) !== null &&
    hasAnyNumber(record, ["height_diff_m", "heightDiff", "dh_m", "dh"])
  );
}

function isTraverseLikeRecord(record: Record<string, unknown>): boolean {
  const kind = normalizedKind(record);
  if (kind.includes("traverse")) return true;
  if (kind.includes("observation") && !kind.includes("level")) return true;
  return (
    textFromRecord(record, ["to", "target", "target_id", "targetId", "point_id", "pointId", "name"]) !== null &&
    (hasAnyNumber(record, ["hz_angle_deg", "hzAngleDeg", "hz", "horizontal_angle", "horizontalAngle"]) ||
      hasAnyNumber(record, ["v_angle_deg", "zenith_deg", "zenithDeg", "zenith", "vertical_angle"]) ||
      hasAnyNumber(record, ["slope_dist_m", "slopeDistance", "slope_dist", "sd"]) ||
      hasAnyNumber(record, ["horiz_dist_m", "horizontalDistance", "horiz_dist", "hd", "distance_m", "distance"]))
  );
}

function surveyCloudJson(content: string): ParsedFormatResult | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const root = Array.isArray(parsed) ? { points: parsed } : isPlainRecord(parsed) ? parsed : null;
  if (!root) return null;

  const directRecords = [...recordsFromUnknown(root.records), ...recordsFromUnknown(root.export_rows), ...recordsFromUnknown(root.exportRows)];
  const pointRows = [
    ...recordsFromUnknown(root.known_points),
    ...recordsFromUnknown(root.knownPoints),
    ...recordsFromUnknown(root.control_points),
    ...recordsFromUnknown(root.controlPoints),
    ...recordsFromUnknown(root.points),
    ...recordsFromUnknown(root.coordinates),
    ...directRecords.filter(isCoordinateLikeRecord),
  ];
  const observationRows = [
    ...recordsFromUnknown(root.observations),
    ...recordsFromUnknown(root.field_observations),
    ...recordsFromUnknown(root.fieldObservations),
    ...recordsFromUnknown(root.traverse_observations),
    ...recordsFromUnknown(root.traverseObservations),
    ...directRecords.filter((record) => isTraverseLikeRecord(record) && !isLevelLikeRecord(record)),
  ];
  const levelRows = [
    ...recordsFromUnknown(root.level_segments),
    ...recordsFromUnknown(root.levelSegments),
    ...recordsFromUnknown(root.segments),
    ...recordsFromUnknown(root.levelingSegments),
    ...directRecords.filter(isLevelLikeRecord),
  ];

  const records: ParsedRecord[] = [];
  for (const row of pointRows) {
    const pointId = textFromRecord(row, ["point_id", "pointId", "name", "id", "point", "pt"]);
    const easting = numberFromRecord(row, ["easting_m", "easting", "east", "x"]);
    const northing = numberFromRecord(row, ["northing_m", "northing", "north", "y"]);
    const elevation = numberFromRecord(row, ["elevation_m", "elevation", "height", "h", "z"]);
    if (!pointId || ((easting === null || northing === null) && elevation === null)) continue;
    records.push({
      record_kind: "coordinate",
      point_id: pointId,
      ...(easting !== null && northing !== null
        ? {
            easting_m: Number(easting.toFixed(4)),
            northing_m: Number(northing.toFixed(4)),
          }
        : {}),
      ...(elevation !== null ? { elevation_m: Number(elevation.toFixed(4)) } : {}),
    });
  }

  for (const row of observationRows) {
    const from = textFromRecord(row, ["from", "station", "station_id", "stationId"]);
    const to = textFromRecord(row, ["to", "target", "target_id", "targetId", "point_id", "pointId", "name"]);
    const pointId = to || (from ? `${from}-OBS` : null);
    const hzAngle = numberFromRecord(row, ["hz_angle_deg", "hzAngleDeg", "hz", "horizontal_angle", "horizontalAngle"]);
    const verticalAngle = numberFromRecord(row, ["v_angle_deg", "zenith_deg", "zenithDeg", "zenith", "vertical_angle"]);
    const slopeDistance = numberFromRecord(row, ["slope_dist_m", "slopeDistance", "slope_dist", "sd"]);
    const horizontalDistance = numberFromRecord(row, ["horiz_dist_m", "horizontalDistance", "horiz_dist", "hd", "distance_m", "distance"]);
    const heightDiff = numberFromRecord(row, ["height_diff_m", "heightDiff", "dh_m", "dh"]);
    if (!pointId) continue;
    const record: ParsedRecord = { record_kind: "traverse_observation", point_id: pointId };
    if (from) record.from = from;
    if (to) record.to = to;
    if (hzAngle !== null) record.hz_angle_deg = Number(hzAngle.toFixed(6));
    if (verticalAngle !== null) record.v_angle_deg = Number(verticalAngle.toFixed(6));
    if (slopeDistance !== null) record.slope_dist_m = Number(slopeDistance.toFixed(4));
    if (horizontalDistance !== null) record.horiz_dist_m = Number(horizontalDistance.toFixed(4));
    if (heightDiff !== null) record.height_diff_m = Number(heightDiff.toFixed(4));
    if (Object.keys(record).length > 1) records.push(record);
  }

  for (const row of levelRows) {
    const from = textFromRecord(row, ["from", "start", "startPoint"]);
    const to = textFromRecord(row, ["to", "end", "endPoint"]);
    const heightDiff = numberFromRecord(row, ["height_diff_m", "heightDiff", "dh_m", "dh"]);
    const lengthM = numberFromRecord(row, ["length_m", "lengthM"]);
    const lengthKm = numberFromRecord(row, ["length_km", "lengthKm"]);
    const stationCount = numberFromRecord(row, ["n_stations", "nStations", "stations", "station_count", "stationCount", "测站数"]);
    if (!from || !to || heightDiff === null) continue;
    records.push({
      record_kind: "level_segment",
      point_id: `${from}-${to}`,
      from,
      to,
      height_diff_m: Number(heightDiff.toFixed(4)),
      ...(stationCount !== null ? { n_stations: Math.round(stationCount) } : {}),
      ...(lengthM !== null
        ? { horiz_dist_m: Number(lengthM.toFixed(4)), length_km: Number((lengthM / 1000).toFixed(6)) }
        : lengthKm !== null
          ? { horiz_dist_m: Number((lengthKm * 1000).toFixed(4)), length_km: Number(lengthKm.toFixed(6)) }
          : {}),
    });
  }

  return records.length > 0 ? { format: "survey-cloud-json", records } : null;
}

type CpiiiBundleSection = {
  kind: "tpt" | "suc";
  lines: string[];
};

function cpiiiBundleSections(content: string): CpiiiBundleSection[] {
  const sections: CpiiiBundleSection[] = [];
  let current: CpiiiBundleSection | null = null;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/(?:CPIII|CP3|CPⅢ)[_\s-]*TPT/i.test(trimmed)) {
      current = { kind: "tpt", lines: [line] };
      sections.push(current);
      continue;
    }
    if (/(?:CPIII|CP3|CPⅢ)[_\s-]*SUC/i.test(trimmed)) {
      current = { kind: "suc", lines: [line] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return sections;
}

function cpiiiBundle(content: string): ParsedFormatResult | null {
  const sections = cpiiiBundleSections(content);
  const hasTpt = sections.some((section) => section.kind === "tpt");
  const hasSuc = sections.some((section) => section.kind === "suc");
  if (!hasTpt || !hasSuc) return null;

  const records = sections.flatMap((section) => {
    const sectionText = section.lines.join("\n");
    const parsed = section.kind === "tpt" ? cpiiiTpt(sectionText) : cpiiiSuc(sectionText);
    return parsed?.records ?? [];
  });
  return records.length > 0 ? { format: "cpiii-bundle", records } : null;
}

function cpiiiTpt(content: string): ParsedFormatResult | null {
  if (!/(?:CPIII|CP3|CPⅢ)[_\s-]*TPT/i.test(content)) return null;
  const parsed = dat(content);
  if (!parsed) return null;
  const records = parsed.records.filter(
    (record) =>
      typeof record.point_id === "string" &&
      typeof record.easting_m === "number" &&
      Number.isFinite(record.easting_m) &&
      typeof record.northing_m === "number" &&
      Number.isFinite(record.northing_m),
  ).map((record) => ({ record_kind: "coordinate", ...record }));
  return records.length > 0 ? { format: "cpiii-tpt", records } : null;
}

function cpiiiSuc(content: string): ParsedFormatResult | null {
  if (!/(?:CPIII|CP3|CPⅢ)[_\s-]*SUC/i.test(content)) return null;

  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("!"));
  if (lines.length < 2) return null;

  const delimiter = detectDatDelimiter(lines[0]!);
  const headers = splitDatLine(lines[0]!, delimiter).map(normalizeHeader);
  const records = lines
    .slice(1)
    .map((line) => {
      const cells = splitDatLine(line, delimiter);
      const row = headers.reduce<Record<string, string>>((acc, header, index) => {
        const value = cells[index]?.trim();
        if (header && value) acc[header] = value;
        return acc;
      }, {});
      const from = row.from ?? row.station ?? row.start ?? row.起点 ?? "";
      const to = row.to ?? row.target ?? row.end ?? row.终点 ?? "";
      const hzAngle = numberFromRecord(row, ["hzangledeg", "hzangle", "hz", "horizontalangle", "水平角"]);
      const verticalAngle = numberFromRecord(row, ["zenithdeg", "zenith", "vangledeg", "verticalangle", "天顶角", "竖直角"]);
      const horizontalDistance = numberFromRecord(row, ["horizdistm", "horizdist", "horizontaldistance", "distance", "平距"]);
      const heightDiff = numberFromRecord(row, ["dhm", "dh", "heightdiffm", "heightdiff", "高差"]);
      const lengthM = numberFromRecord(row, ["lengthm", "length", "测段长"]);
      const lengthKm = numberFromRecord(row, ["lengthkm", "线路长", "长度km"]);
      const stationCount = numberFromRecord(row, ["nstations", "stations", "stationcount", "测站数"]);
      const pointId = from && to ? `${from}-${to}` : to || from;
      if (!pointId) return null;
      const record: ParsedRecord = {
        record_kind: hzAngle !== null || verticalAngle !== null ? "traverse_observation" : "level_segment",
        point_id: pointId,
      };
      if (from) record.from = from;
      if (to) record.to = to;
      if (hzAngle !== null) record.hz_angle_deg = Number(hzAngle.toFixed(6));
      if (verticalAngle !== null) record.v_angle_deg = Number(verticalAngle.toFixed(6));
      if (horizontalDistance !== null) record.horiz_dist_m = Number(horizontalDistance.toFixed(4));
      if (heightDiff !== null) record.height_diff_m = Number(heightDiff.toFixed(4));
      if (stationCount !== null) record.n_stations = Math.round(stationCount);
      if (record.horiz_dist_m === undefined && lengthM !== null) {
        record.horiz_dist_m = Number(lengthM.toFixed(4));
        record.length_km = Number((lengthM / 1000).toFixed(6));
      }
      if (record.horiz_dist_m === undefined && lengthKm !== null) {
        record.horiz_dist_m = Number((lengthKm * 1000).toFixed(4));
        record.length_km = Number(lengthKm.toFixed(6));
      }
      return Object.keys(record).length > 1 ? record : null;
    })
    .filter((record): record is ParsedRecord => record !== null);

  return records.length > 0 ? { format: "cpiii-suc", records } : null;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvTable(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
}

function coordinateSummary(records: ParsedRecord[]) {
  const coordinateRecords = records.filter(
    (record) =>
      typeof record.easting_m === "number" &&
      Number.isFinite(record.easting_m) &&
      typeof record.northing_m === "number" &&
      Number.isFinite(record.northing_m),
  );
  if (coordinateRecords.length === 0) return {};

  const eastings = coordinateRecords.map((record) => record.easting_m as number);
  const northings = coordinateRecords.map((record) => record.northing_m as number);
  const elevations = coordinateRecords
    .map((record) => record.elevation_m)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const distanceCalculatorSegments = coordinateRecords.slice(1).map((record, index) => {
    const previous = coordinateRecords[index]!;
    return {
      id: `${String(previous.point_id ?? `P${index + 1}`)}-${String(record.point_id ?? `P${index + 2}`)}`,
      from: {
        x: previous.easting_m as number,
        y: previous.northing_m as number,
        ...(typeof previous.elevation_m === "number" && Number.isFinite(previous.elevation_m)
          ? { z: previous.elevation_m }
          : {}),
      },
      to: {
        x: record.easting_m as number,
        y: record.northing_m as number,
        ...(typeof record.elevation_m === "number" && Number.isFinite(record.elevation_m) ? { z: record.elevation_m } : {}),
      },
    };
  });
  const distanceCalculatorCsv =
    distanceCalculatorSegments.length > 0
      ? csvTable(
          ["边号", "起点X", "起点Y", "起点高程", "终点X", "终点Y", "终点高程"],
          distanceCalculatorSegments.map((segment) => [
            segment.id,
            segment.from.x,
            segment.from.y,
            segment.from.z ?? "",
            segment.to.x,
            segment.to.y,
            segment.to.z ?? "",
          ]),
        )
      : undefined;

  return {
    coordinate_point_count: coordinateRecords.length,
    distance_calculator_segment_count: distanceCalculatorSegments.length,
    control_network_observations: coordinateRecords.map((record, index) => ({
      pointId: String(record.point_id ?? `P${index + 1}`),
      x: record.easting_m as number,
      y: record.northing_m as number,
      weight: 1,
    })),
    coord_transform_points: coordinateRecords.map((record, index) => ({
      id: String(record.point_id ?? `P${index + 1}`),
      x: record.easting_m as number,
      y: record.northing_m as number,
      ...(typeof record.elevation_m === "number" && Number.isFinite(record.elevation_m)
        ? { z: record.elevation_m }
        : {}),
    })),
    coordinate_bounds: {
      min_easting_m: Math.min(...eastings),
      max_easting_m: Math.max(...eastings),
      min_northing_m: Math.min(...northings),
      max_northing_m: Math.max(...northings),
      ...(elevations.length > 0
        ? {
            min_elevation_m: Math.min(...elevations),
            max_elevation_m: Math.max(...elevations),
          }
        : {}),
    },
    coordinate_records: coordinateRecords,
    distance_calculator_segments: distanceCalculatorSegments,
    ...(distanceCalculatorCsv ? { distance_calculator_csv: distanceCalculatorCsv } : {}),
  };
}

function observationSummary(records: ParsedRecord[]) {
  const angleRows = records.flatMap((record, index) => {
    const pointId = String(record.point_id ?? `P${index + 1}`);
    const rows: Array<{ id: string; groupId: string; value: number; from: "decimal" }> = [];
    if (typeof record.hz_angle_deg === "number" && Number.isFinite(record.hz_angle_deg)) {
      rows.push({ id: `${pointId}-HZ`, groupId: "水平角", value: record.hz_angle_deg, from: "decimal" });
    }
    if (typeof record.v_angle_deg === "number" && Number.isFinite(record.v_angle_deg)) {
      rows.push({ id: `${pointId}-V`, groupId: "竖直角", value: record.v_angle_deg, from: "decimal" });
    }
    return rows;
  });
  const distanceObservationRecords = records
    .filter(
      (record) =>
        (typeof record.horiz_dist_m === "number" && Number.isFinite(record.horiz_dist_m)) ||
        (typeof record.slope_dist_m === "number" && Number.isFinite(record.slope_dist_m)) ||
        (typeof record.height_diff_m === "number" && Number.isFinite(record.height_diff_m)),
    )
    .map((record, index) => ({
      point_id: String(record.point_id ?? `P${index + 1}`),
      horiz_dist_m: typeof record.horiz_dist_m === "number" ? record.horiz_dist_m : null,
      slope_dist_m: typeof record.slope_dist_m === "number" ? record.slope_dist_m : null,
      height_diff_m: typeof record.height_diff_m === "number" ? record.height_diff_m : null,
      v_angle_deg: typeof record.v_angle_deg === "number" ? record.v_angle_deg : null,
    }));
  const angleConvertCsv =
    angleRows.length > 0
      ? csvTable(
          ["角度编号", "方向组", "角度值", "输入格式"],
          angleRows.map((row) => [row.id, row.groupId, row.value, row.from]),
        )
      : undefined;
  const distanceObservationCsv =
    distanceObservationRecords.length > 0
      ? csvTable(
          ["观测编号", "斜距(m)", "水平距(m)", "竖直角(°)", "高差(m)"],
          distanceObservationRecords.map((row) => [
            row.point_id,
            row.slope_dist_m ?? "",
            row.horiz_dist_m ?? "",
            row.v_angle_deg ?? "",
            row.height_diff_m ?? "",
          ]),
        )
      : undefined;

  return {
    angle_observation_count: angleRows.length,
    distance_observation_count: distanceObservationRecords.length,
    angle_convert_rows: angleRows,
    distance_observation_records: distanceObservationRecords,
    ...(angleConvertCsv ? { angle_convert_csv: angleConvertCsv } : {}),
    ...(distanceObservationCsv ? { distance_observation_csv: distanceObservationCsv } : {}),
  };
}

function parserExportRows(records: ParsedRecord[]): Array<Record<string, string | number | null>> {
  return records.map((record, index) => {
    const hasCoordinate =
      typeof record.easting_m === "number" &&
      Number.isFinite(record.easting_m) &&
      typeof record.northing_m === "number" &&
      Number.isFinite(record.northing_m);
    const recordKind = typeof record.record_kind === "string" ? record.record_kind : hasCoordinate ? "coordinate" : "field_observation";
    const isCoordinateRecord = hasCoordinate || recordKind === "coordinate";
    return {
      row_type: isCoordinateRecord ? "field_coordinate_record" : "field_observation_record",
      record_kind: recordKind,
      record_index: index + 1,
      point_id: String(record.point_id ?? `P${index + 1}`),
      from: typeof record.from === "string" ? record.from : null,
      to: typeof record.to === "string" ? record.to : null,
      hz_angle_deg: typeof record.hz_angle_deg === "number" ? record.hz_angle_deg : null,
      v_angle_deg: typeof record.v_angle_deg === "number" ? record.v_angle_deg : null,
      slope_dist_m: typeof record.slope_dist_m === "number" ? record.slope_dist_m : null,
      horiz_dist_m: typeof record.horiz_dist_m === "number" ? record.horiz_dist_m : null,
      length_km: typeof record.length_km === "number" ? record.length_km : null,
      n_stations: typeof record.n_stations === "number" ? record.n_stations : null,
      height_diff_m: typeof record.height_diff_m === "number" ? record.height_diff_m : null,
      easting_m: typeof record.easting_m === "number" ? record.easting_m : null,
      northing_m: typeof record.northing_m === "number" ? record.northing_m : null,
      elevation_m: typeof record.elevation_m === "number" ? record.elevation_m : null,
      reflector_height_m: typeof record.reflector_height_m === "number" ? record.reflector_height_m : null,
      instrument_height_m: typeof record.instrument_height_m === "number" ? record.instrument_height_m : null,
    };
  });
}

function levelSummary(records: ParsedRecord[]) {
  const knownBms = records
    .filter(
      (record) =>
        record.record_kind === "coordinate" &&
        typeof record.point_id === "string" &&
        typeof record.elevation_m === "number" &&
        Number.isFinite(record.elevation_m),
    )
    .map((record) => ({
      name: record.point_id as string,
      h: record.elevation_m as number,
      fixed: true,
    }));
  const segments = records
    .filter(
      (record) =>
        record.record_kind === "level_segment" &&
        typeof record.from === "string" &&
        typeof record.to === "string" &&
        typeof record.height_diff_m === "number" &&
        Number.isFinite(record.height_diff_m),
    )
    .map((record) => ({
      from: record.from as string,
      to: record.to as string,
      dh_m: record.height_diff_m as number,
      ...(typeof record.length_km === "number" && Number.isFinite(record.length_km) ? { length_km: record.length_km } : {}),
      ...(typeof record.n_stations === "number" && Number.isFinite(record.n_stations)
        ? { n_stations: Math.round(record.n_stations) }
        : {}),
    }));

  return {
    level_benchmark_count: knownBms.length,
    level_segment_count: segments.length,
    ...(knownBms.length > 0 && segments.length > 0
      ? {
          level_adjustment_input: {
            known_bms: knownBms,
            segments,
            weight_mode: "length",
          },
        }
      : {}),
  };
}

function traverseSummary(records: ParsedRecord[]) {
  const knownPoints = records
    .filter(
      (record) =>
        typeof record.point_id === "string" &&
        typeof record.easting_m === "number" &&
        Number.isFinite(record.easting_m) &&
        typeof record.northing_m === "number" &&
        Number.isFinite(record.northing_m),
    )
    .map((record) => ({
      name: record.point_id as string,
      x: record.easting_m as number,
      y: record.northing_m as number,
      fixed: true,
    }));
  const defaultStation = knownPoints[0]?.name ?? "STA";
  const observationRecords = records.filter(
    (record) =>
      typeof record.point_id === "string" &&
      typeof record.hz_angle_deg === "number" &&
      Number.isFinite(record.hz_angle_deg) &&
      ((typeof record.horiz_dist_m === "number" && Number.isFinite(record.horiz_dist_m)) ||
        (typeof record.slope_dist_m === "number" && Number.isFinite(record.slope_dist_m))),
  );
  const observations = observationRecords.map((record, index) => {
    const previous = observationRecords[index - 1];
    return {
      from: typeof record.from === "string" && record.from ? record.from : previous?.point_id ? String(previous.point_id) : defaultStation,
      to: typeof record.to === "string" && record.to ? record.to : String(record.point_id),
      hz_angle_deg: record.hz_angle_deg as number,
      ...(typeof record.horiz_dist_m === "number" && Number.isFinite(record.horiz_dist_m)
        ? { horizontal_dist_m: record.horiz_dist_m }
        : {}),
      ...(typeof record.slope_dist_m === "number" && Number.isFinite(record.slope_dist_m)
        ? { slope_dist_m: record.slope_dist_m }
        : {}),
      ...(typeof record.v_angle_deg === "number" && Number.isFinite(record.v_angle_deg) ? { zenith_deg: record.v_angle_deg } : {}),
    };
  });

  return {
    traverse_known_point_count: knownPoints.length,
    traverse_observation_count: observations.length,
    ...(knownPoints.length >= 2 && observations.length > 0
      ? {
          traverse_adjustment_input: {
            known_points: knownPoints,
            observations,
            params: {
              start_azimuth_deg: 0,
              end_azimuth_deg: 0,
              dir_mse_sec: 2,
              dist_fixed_mm: 1,
              ppm: 1,
              refraction: 0.14,
              ellipsoid_r: 6371000,
              height_projection: true,
              model: "normal",
            },
          },
        }
      : {}),
  };
}

function importPreflight(
  records: ParsedRecord[],
  levelInfo: ReturnType<typeof levelSummary>,
  traverseInfo: ReturnType<typeof traverseSummary>,
) {
  const recognizedFields = Array.from(
    new Set(records.flatMap((record) => Object.keys(record)).filter((field) => field !== "length_m")),
  ).sort();
  const explicitTraverseCandidateCount = records.filter((record) => record.record_kind === "traverse_observation").length;
  const traverseReady = traverseInfo.traverse_known_point_count >= 2 && traverseInfo.traverse_observation_count > 0;
  const levelReady = levelInfo.level_benchmark_count > 0 && levelInfo.level_segment_count > 0;
  if (traverseReady || (explicitTraverseCandidateCount > 0 && !levelReady && traverseInfo.traverse_known_point_count > 0)) {
    const requiredFieldsPresent: string[] = [];
    const missingRequiredFields: string[] = [];
    if (traverseInfo.traverse_known_point_count >= 2) requiredFieldsPresent.push("known_points");
    else missingRequiredFields.push("known_points");
    if (traverseInfo.traverse_observation_count > 0) {
      requiredFieldsPresent.push("observations", "from", "to", "hz_angle_deg", "distance");
    } else {
      missingRequiredFields.push("observations");
      if (explicitTraverseCandidateCount > 0) missingRequiredFields.push("hz_angle_deg", "distance");
    }
    return {
      target_workflow: "traverse_adjust",
      ready_for_adjustment: traverseReady,
      required_fields_present: requiredFieldsPresent,
      missing_required_fields: missingRequiredFields,
      recognized_fields: recognizedFields,
      quality_status: traverseReady ? "ready" : "review_missing_fields",
    };
  }

  const levelCandidateCount = records.filter(
    (record) =>
      record.record_kind === "level_segment" ||
      (typeof record.from === "string" && typeof record.to === "string"),
  ).length;
  const hasNonLevelSurveyObservation = records.some(
    (record) =>
      record.record_kind === "traverse_observation" ||
      typeof record.hz_angle_deg === "number" ||
      typeof record.v_angle_deg === "number" ||
      typeof record.slope_dist_m === "number",
  );
  const looksLikeLevel =
    (levelInfo.level_benchmark_count > 0 || !hasNonLevelSurveyObservation) &&
    (levelInfo.level_segment_count > 0 || levelCandidateCount > 0);
  if (!looksLikeLevel) {
    return {
      target_workflow: "field_parser",
      ready_for_adjustment: false,
      required_fields_present: [],
      missing_required_fields: [],
      recognized_fields: recognizedFields,
      quality_status: "parsed",
    };
  }

  const requiredFieldsPresent: string[] = [];
  const missingRequiredFields: string[] = [];
  if (levelInfo.level_benchmark_count > 0) requiredFieldsPresent.push("known_bms");
  else missingRequiredFields.push("known_bms");
  if (levelInfo.level_segment_count > 0) {
    requiredFieldsPresent.push("segments", "from", "to", "dh_m");
  } else {
    missingRequiredFields.push("segments");
    if (levelCandidateCount > 0) missingRequiredFields.push("dh_m");
  }

  const ready = levelInfo.level_benchmark_count > 0 && levelInfo.level_segment_count > 0;
  return {
    target_workflow: "level_adjust",
    ready_for_adjustment: ready,
    required_fields_present: requiredFieldsPresent,
    missing_required_fields: missingRequiredFields,
    recognized_fields: recognizedFields,
    quality_status: ready ? "ready" : "review_missing_fields",
  };
}

function parseByFormat(raw: string, format: ParserFormat): ParsedFormatResult | null {
  if (format === "gsi-8") return gsi(raw, false);
  if (format === "gsi-16") return gsi(raw, true);
  if (format === "survey-cloud-json") return surveyCloudJson(raw);
  if (format === "dini-m5") return diniM5(raw);
  if (format === "cpiii-bundle") return cpiiiBundle(raw);
  if (format === "cpiii-tpt") return cpiiiTpt(raw);
  if (format === "cpiii-suc") return cpiiiSuc(raw);
  return detect(raw);
}

export function registerFormatParser(server: McpServer): void {
  server.tool(
    "format_parser",
    "解析徕卡全站仪 GSI-8/GSI-16、天宝 DiNi03 M5 DAT、通用 DAT/坐标文本、测量云 APP JSON、CPⅢ TPT/SUC 格式的外业观测数据。支持文件路径或直接粘贴原始文本，将仪器数据转换为结构化 JSON，供平差计算和报告生成使用。",
    {
      filePath: z.string().optional().describe("外业数据文件的绝对路径；与 rawText 二选一"),
      rawText: z.string().optional().describe("直接粘贴的 GSI、DAT 或坐标成果文本；与 filePath 二选一"),
      sourceName: z.string().default("pasted-field-data.txt").describe("rawText 输入时的来源名称，用于结果标识"),
      format: z
        .enum(["gsi-8", "gsi-16", "dat-auto", "survey-cloud-json", "dini-m5", "cpiii-tpt", "cpiii-suc", "cpiii-bundle"])
        .default("dat-auto")
        .describe("文件格式：gsi-8=Leica GSI-8, gsi-16=Leica GSI-16, dini-m5=Trimble DiNi03 M5 DAT, dat-auto=自动检测, survey-cloud-json=测量云 APP JSON, cpiii-tpt/cpiii-suc/cpiii-bundle=CPⅢ 外业交换"),
    },
    async (args) => {
      const raw = args.rawText ?? (args.filePath ? await readTextFile(args.filePath) : null);
      if (raw === null) {
        return ok(args.filePath ? { error: `文件不存在：${args.filePath}` } : { error: "请提供 filePath 或 rawText 作为外业数据输入" });
      }
      if (raw.trim().length === 0) return ok({ error: "文件内容为空" });

      const result = parseByFormat(raw, args.format);

      if (!result)
        return ok({ error: "无法识别文件格式，请确认为 GSI、DAT、测量云 JSON 或 CPⅢ TPT/SUC 格式，或手动指定 format 参数。" });

      const file = args.rawText ? args.sourceName : path.basename(args.filePath ?? args.sourceName);
      const inputFormat = args.rawText ? "raw_text" : "file";
      const coordinateInfo = coordinateSummary(result.records) as Record<string, unknown>;
      const observationInfo = observationSummary(result.records);
      const levelInfo = levelSummary(result.records);
      const traverseInfo = traverseSummary(result.records);
      const preflight = importPreflight(result.records, levelInfo, traverseInfo);
      const coordinatePointCount =
        typeof coordinateInfo.coordinate_point_count === "number" ? coordinateInfo.coordinate_point_count : 0;
      return ok({
        format: result.format,
        file,
        input_format: inputFormat,
        total_records: result.records.length,
        parser_summary: {
          format: result.format,
          source: file,
          input_format: inputFormat,
          total_records: result.records.length,
          coordinate_point_count: coordinatePointCount,
          distance_calculator_segment_count:
            typeof coordinateInfo.distance_calculator_segment_count === "number"
              ? coordinateInfo.distance_calculator_segment_count
              : 0,
          level_benchmark_count: levelInfo.level_benchmark_count,
          level_segment_count: levelInfo.level_segment_count,
          traverse_known_point_count: traverseInfo.traverse_known_point_count,
          traverse_observation_count: traverseInfo.traverse_observation_count,
          angle_observation_count: observationInfo.angle_observation_count,
          distance_observation_count: observationInfo.distance_observation_count,
          quality_status: preflight.quality_status === "review_missing_fields" ? "review" : "parsed",
        },
        ...coordinateInfo,
        ...observationInfo,
        ...levelInfo,
        ...traverseInfo,
        import_preflight: preflight,
        export_rows: parserExportRows(result.records),
        records: result.records,
      });
    },
  );
}
