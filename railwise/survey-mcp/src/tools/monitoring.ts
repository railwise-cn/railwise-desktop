import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from "node:path";
import { ok, readTextFile } from "../util.js";

type MonitoringValue = {
  value: number;
  date?: string;
  time?: number;
  alertThreshold?: number;
  rateThreshold?: number;
};
type MonitoringPointResult = {
  point_id: string;
  total_readings: number;
  removed_outliers: number;
  baseline_date?: string;
  latest_date?: string;
  cumulative_mm: number;
  period_change_mm: number;
  rate_mm_per_day: number;
  alert_threshold_mm: number | null;
  rate_threshold_mm_per_day: number | null;
  exceeded_threshold: boolean;
  exceeded_rate_threshold: boolean;
  is_alert: boolean;
  ratio_pct: number | null;
  rate_ratio_pct: number | null;
  period_rows: Array<Record<string, string | number | null>>;
};

const monitoringSensorType = z.enum(["settlement", "inclinometer", "strain_gauge", "convergence", "gnss"]);
const monitoringCsvShape = {
  filePath: z.string().optional().describe("用户上传的 CSV、TXT 或 DAT 文件的绝对路径；与 csvText 二选一"),
  csvText: z.string().optional().describe("直接粘贴的 CSV/TSV 文本；与 filePath 二选一"),
  sourceName: z.string().default("pasted-monitoring.csv").describe("csvText 输入时的来源名称，用于结果标识"),
  csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto").describe("CSV 分隔符，默认自动识别"),
  sensorType: monitoringSensorType.describe(
    "传感器类型：settlement=沉降/静力水准, inclinometer=测斜仪, strain_gauge=应变计, convergence=收敛计, gnss=GNSS",
  ),
  alertThreshold: z
    .number()
    .positive()
    .optional()
    .describe("报警控制值（mm），用于自动标记超限测点，不传则不做超限判断"),
  rateThreshold: z.number().positive().optional().describe("速率报警控制值（mm/d），用于自动标记速率超限测点"),
  periodDays: z.number().int().positive().default(7).describe("统计周期天数，默认7天（本期=最近N天）"),
};

type MonitoringCsvInput = {
  filePath?: string;
  csvText?: string;
  sourceName: string;
  csvDelimiter: "auto" | "comma" | "tab" | "semicolon";
  sensorType: z.infer<typeof monitoringSensorType>;
  alertThreshold?: number;
  rateThreshold?: number;
  periodDays: number;
};

function detectCsvDelimiter(firstLine: string, delimiterOption: MonitoringCsvInput["csvDelimiter"]): string {
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

function parseMonitoringDateTime(value: string | undefined): number {
  const text = value?.trim();
  if (!text) return Number.NaN;
  const normalized = normalizeDateTimeText(text);
  const excelSerial = normalized.match(/^\d{4,6}(?:\.\d+)?$/);
  if (excelSerial) {
    const serial = Number(normalized);
    if (Number.isFinite(serial) && serial >= 20000 && serial <= 80000) {
      return Date.UTC(1899, 11, 30) + serial * 86400000;
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

function cleanWideHeaderSubject(header: string): string {
  return header
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/累计|本期|阶段|沉降|位移|变化|读数|高差|测值|监测值/gi, "")
    .replace(/预警值|报警值|控制值|阈值|限值|预警|报警|控制|阈|限|速率|日变化|rate|threshold|value|val|值/gi, "")
    .replace(/[_\-\s:：/\\]+$/g, "")
    .trim();
}

function pointIdFromWideHeader(header: string, index: number): string {
  const cleaned = cleanWideHeaderSubject(header);
  return cleaned || `P${index}`;
}

function thresholdPointIdFromWideHeader(header: string): string | null {
  const cleaned = cleanWideHeaderSubject(header);
  return cleaned || null;
}

function isRateThresholdHeader(header: string): boolean {
  return /速率|rate|变化率|日变化/i.test(header) && /预警|报警|控制|阈值|限值|threshold/i.test(header);
}

function isAlertThresholdHeader(header: string): boolean {
  return /预警|报警|控制|阈值|限值|threshold/i.test(header) && !isRateThresholdHeader(header);
}

function latestFinite(values: Array<number | undefined>): number | undefined {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value !== undefined && Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

function parseMonitoringTable(input: {
  header: string[];
  rows: string[][];
  idIdx: number;
  valIdx: number;
  dateIdx: number;
  alertThresholdIdx: number;
  rateThresholdIdx: number;
}): {
  pointGroups: Record<string, MonitoringValue[]>;
  tableFormat: "long" | "wide";
  parsedObservationCount: number;
} {
  const pointGroups: Record<string, MonitoringValue[]> = {};
  let parsedObservationCount = 0;

  const shouldParseAsLong = input.valIdx >= 0 && (input.idIdx >= 0 || input.dateIdx < 0);
  if (shouldParseAsLong) {
    for (const [rowIndex, row] of input.rows.entries()) {
      const id = input.idIdx >= 0 ? (row[input.idIdx] ?? "unknown") : `P${rowIndex}`;
      const v = parseNumericCell(row[input.valIdx] ?? "");
      if (!Number.isFinite(v)) continue;
      const date = input.dateIdx >= 0 ? row[input.dateIdx]?.trim() : undefined;
      const time = parseMonitoringDateTime(date);
      const alertThreshold = parseNumericCell(input.alertThresholdIdx >= 0 ? (row[input.alertThresholdIdx] ?? "") : "");
      const rateThreshold = parseNumericCell(input.rateThresholdIdx >= 0 ? (row[input.rateThresholdIdx] ?? "") : "");
      if (!pointGroups[id]) pointGroups[id] = [];
      pointGroups[id]!.push({
        value: v,
        ...(date ? { date } : {}),
        ...(Number.isFinite(time) ? { time } : {}),
        ...(Number.isFinite(alertThreshold) && alertThreshold > 0 ? { alertThreshold } : {}),
        ...(Number.isFinite(rateThreshold) && rateThreshold > 0 ? { rateThreshold } : {}),
      });
      parsedObservationCount += 1;
    }
    return { pointGroups, tableFormat: "long", parsedObservationCount };
  }

  if (input.dateIdx < 0) return { pointGroups, tableFormat: "long", parsedObservationCount };

  const pointColumns = input.header
    .map((header, index) => ({ header, index }))
    .filter(({ index }) => index !== input.dateIdx && index !== input.idIdx)
    .filter(({ header }) => !isAlertThresholdHeader(header) && !isRateThresholdHeader(header))
    .filter(({ index }) => input.rows.some((row) => Number.isFinite(parseNumericCell(row[index] ?? ""))));
  const alertThresholdByPoint = new Map<string, number>();
  const rateThresholdByPoint = new Map<string, number>();
  let globalAlertThresholdIdx = -1;
  let globalRateThresholdIdx = -1;
  for (const [index, header] of input.header.entries()) {
    if (isAlertThresholdHeader(header)) {
      const pointId = thresholdPointIdFromWideHeader(header);
      if (pointId) alertThresholdByPoint.set(pointId, index);
      else if (globalAlertThresholdIdx < 0) globalAlertThresholdIdx = index;
    }
    if (isRateThresholdHeader(header)) {
      const pointId = thresholdPointIdFromWideHeader(header);
      if (pointId) rateThresholdByPoint.set(pointId, index);
      else if (globalRateThresholdIdx < 0) globalRateThresholdIdx = index;
    }
  }

  for (const row of input.rows) {
    const date = row[input.dateIdx]?.trim();
    const time = parseMonitoringDateTime(date);
    for (const column of pointColumns) {
      const value = parseNumericCell(row[column.index] ?? "");
      if (!Number.isFinite(value)) continue;
      const pointId = pointIdFromWideHeader(column.header, column.index + 1);
      const alertThresholdIdx = alertThresholdByPoint.get(pointId) ?? globalAlertThresholdIdx;
      const rateThresholdIdx = rateThresholdByPoint.get(pointId) ?? globalRateThresholdIdx;
      const alertThreshold = parseNumericCell(alertThresholdIdx >= 0 ? (row[alertThresholdIdx] ?? "") : "");
      const rateThreshold = parseNumericCell(rateThresholdIdx >= 0 ? (row[rateThresholdIdx] ?? "") : "");
      if (!pointGroups[pointId]) pointGroups[pointId] = [];
      pointGroups[pointId]!.push({
        value,
        ...(date ? { date } : {}),
        ...(Number.isFinite(time) ? { time } : {}),
        ...(Number.isFinite(alertThreshold) && alertThreshold > 0 ? { alertThreshold } : {}),
        ...(Number.isFinite(rateThreshold) && rateThreshold > 0 ? { rateThreshold } : {}),
      });
      parsedObservationCount += 1;
    }
  }

  return { pointGroups, tableFormat: "wide", parsedObservationCount };
}

function analyzeMonitoringCsv(args: MonitoringCsvInput & { raw: string; source: string; inputFormat: "file" | "csv_text" }) {
  const lines = args.raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length < 2) return { error: "文件内容为空或仅有标题行，无有效数据。" };

  const delimiter = detectCsvDelimiter(lines[0]!, args.csvDelimiter);
  const header = splitDelimitedLine(lines[0]!, delimiter);
  const rows = lines.slice(1).map((line) => splitDelimitedLine(line, delimiter));

  const idIdx = header.findIndex((h) => /id|point|测点|编号/i.test(h));
  const valIdx = header.findIndex((h) => /value|val|读数|高差|沉降|位移|应变/i.test(h));
  const dateIdx = header.findIndex((h) => /date|time|datetime|观测日期|监测日期|日期|时间/i.test(h));
  const alertThresholdIdx = header.findIndex((h, index) => index !== valIdx && isAlertThresholdHeader(h));
  const rateThresholdIdx = header.findIndex((h) => isRateThresholdHeader(h));

  const parsedTable = parseMonitoringTable({ header, rows, idIdx, valIdx, dateIdx, alertThresholdIdx, rateThresholdIdx });

  if (parsedTable.parsedObservationCount === 0)
    return {
      error: `无法识别有效监测数值，请确认 CSV 为长表（测点编号+日期+数值列）或宽表（日期+多个测点数值列）。识别到的列：${header.join(", ")}`,
    };

  const pointGroups = parsedTable.pointGroups;
  const totalPoints = Object.keys(pointGroups).length;
  if (totalPoints === 0) return { error: "未能从文件中解析到有效的数值数据，请检查文件格式。" };

  const cutoff = args.periodDays;
  const results: MonitoringPointResult[] = Object.entries(pointGroups).map(([id, entries]) => {
    const vals = entries.map((entry) => entry.value);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const deviations = vals.map((v) => Math.abs(v - mean));
    const mad = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    const threshold3sigma = 3 * (mad * 1.4826);
    const cleaned = entries
      .filter((entry) => Math.abs(entry.value - mean) <= threshold3sigma)
      .sort((a, b) => {
        if (Number.isFinite(a.time ?? Number.NaN) && Number.isFinite(b.time ?? Number.NaN)) {
          return (a.time ?? 0) - (b.time ?? 0);
        }
        return 0;
      });

    const baseline = cleaned[0]?.value ?? 0;
    const current = cleaned[cleaned.length - 1]?.value ?? 0;
    const cumulative = current - baseline;

    const latestTime = cleaned[cleaned.length - 1]?.time;
    const recent =
      Number.isFinite(latestTime ?? Number.NaN)
        ? cleaned.filter(
            (entry) => Number.isFinite(entry.time ?? Number.NaN) && (latestTime ?? 0) - (entry.time ?? 0) <= cutoff * 86400000,
          )
        : cleaned.slice(-cutoff);
    const firstRecent = recent[0];
    const lastRecent = recent[recent.length - 1];
    const periodChange = firstRecent && lastRecent ? lastRecent.value - firstRecent.value : 0;
    const periodIntervalDays =
      firstRecent?.time !== undefined && lastRecent?.time !== undefined
        ? Math.max((lastRecent.time - firstRecent.time) / 86400000, 0)
        : cutoff;
    const rate = recent.length >= 2 && periodIntervalDays > 0 ? periodChange / periodIntervalDays : 0;

    const removedCount = vals.length - cleaned.length;
    const pointAlertThreshold = latestFinite(cleaned.map((entry) => entry.alertThreshold)) ?? args.alertThreshold;
    const pointRateThreshold = latestFinite(cleaned.map((entry) => entry.rateThreshold)) ?? args.rateThreshold;
    const exceeded = pointAlertThreshold ? Math.abs(cumulative) >= pointAlertThreshold : false;
    const exceededRate = pointRateThreshold ? Math.abs(rate) >= pointRateThreshold : false;
    const isAlert = exceeded || exceededRate;
    const ratioPct = pointAlertThreshold
      ? Number(((Math.abs(cumulative) / pointAlertThreshold) * 100).toFixed(1))
      : null;
    const rateRatioPct = pointRateThreshold ? Number(((Math.abs(rate) / pointRateThreshold) * 100).toFixed(1)) : null;
    const periodRows = cleaned.map((entry, index) => {
      const previous = cleaned[index - 1];
      const stageChange = previous ? entry.value - previous.value : 0;
      const intervalDays =
        previous?.time !== undefined && entry.time !== undefined ? Math.max((entry.time - previous.time) / 86400000, 0) : 0;
      const stageRate = previous && intervalDays > 0 ? stageChange / intervalDays : 0;
      return {
        row_type: "monitoring_period_observation",
        point_id: id,
        sequence: index + 1,
        date: entry.date ?? null,
        value_mm: Number(entry.value.toFixed(3)),
        cumulative_mm: Number((entry.value - baseline).toFixed(3)),
        stage_change_mm: Number(stageChange.toFixed(3)),
        stage_interval_days: Number(intervalDays.toFixed(4)),
        stage_rate_mm_per_day: Number(stageRate.toFixed(4)),
        alert_threshold_mm: pointAlertThreshold ?? null,
        rate_threshold_mm_per_day: pointRateThreshold ?? null,
      };
    });

    return {
      point_id: id,
      total_readings: vals.length,
      removed_outliers: removedCount,
      ...(cleaned[0]?.date ? { baseline_date: cleaned[0].date } : {}),
      ...(cleaned[cleaned.length - 1]?.date ? { latest_date: cleaned[cleaned.length - 1]!.date } : {}),
      cumulative_mm: Number(cumulative.toFixed(3)),
      period_change_mm: Number(periodChange.toFixed(3)),
      rate_mm_per_day: Number(rate.toFixed(4)),
      alert_threshold_mm: pointAlertThreshold ?? null,
      rate_threshold_mm_per_day: pointRateThreshold ?? null,
      exceeded_threshold: exceeded,
      exceeded_rate_threshold: exceededRate,
      is_alert: isAlert,
      ratio_pct: ratioPct,
      rate_ratio_pct: rateRatioPct,
      period_rows: periodRows,
    };
  });

  const exceeded = results.filter((r) => r.exceeded_threshold);
  const rateExceeded = results.filter((r) => r.exceeded_rate_threshold);
  const alertResults = results.filter((r) => r.is_alert);
  const maxCumulative = results.reduce((a, b) =>
    Math.abs(a.cumulative_mm) > Math.abs(b.cumulative_mm) ? a : b,
  );
  const removedOutlierCount = results.reduce((sum, row) => sum + row.removed_outliers, 0);
  const monitoringSummary = {
    input_format: args.inputFormat,
    table_format: parsedTable.tableFormat,
    source: args.source,
    sensor_type: args.sensorType,
    parsed_row_count: rows.length,
    parsed_observation_count: parsedTable.parsedObservationCount,
    point_count: totalPoints,
    period_days: args.periodDays,
    alert_threshold_mm: args.alertThreshold ?? null,
    rate_threshold_mm_per_day: args.rateThreshold ?? null,
    exceeded_count: exceeded.length,
    rate_exceeded_count: rateExceeded.length,
    alert_count: alertResults.length,
    max_cumulative_point: maxCumulative.point_id,
    max_abs_cumulative_mm: Number(Math.abs(maxCumulative.cumulative_mm).toFixed(3)),
    removed_outlier_count: removedOutlierCount,
    quality_status: alertResults.length > 0 ? "review_exceeded_points" : "pass",
  };
  const pointSummaryRows = results.map((row) => ({
    row_type: "monitoring_point_summary",
    point_id: row.point_id,
    total_readings: row.total_readings,
    removed_outliers: row.removed_outliers,
    baseline_date: row.baseline_date ?? null,
    latest_date: row.latest_date ?? null,
    cumulative_mm: row.cumulative_mm,
    period_change_mm: row.period_change_mm,
    rate_mm_per_day: row.rate_mm_per_day,
    alert_threshold_mm: row.alert_threshold_mm,
    rate_threshold_mm_per_day: row.rate_threshold_mm_per_day,
    ratio_pct: row.ratio_pct,
    rate_ratio_pct: row.rate_ratio_pct,
    exceeded_threshold: row.exceeded_threshold,
    exceeded_rate_threshold: row.exceeded_rate_threshold,
    is_alert: row.is_alert,
  }));
  const periodRows = results.flatMap((row) => row.period_rows);
  const exportRows = [...pointSummaryRows, ...periodRows];

  return {
    file: args.source,
    input_format: args.inputFormat,
    table_format: parsedTable.tableFormat,
    parsed_row_count: rows.length,
    parsed_observation_count: parsedTable.parsedObservationCount,
    sensor_type: args.sensorType,
    total_points: totalPoints,
    period_days: args.periodDays,
    alert_threshold_mm: args.alertThreshold ?? null,
    rate_threshold_mm_per_day: args.rateThreshold ?? null,
    exceeded_count: exceeded.length,
    rate_exceeded_count: rateExceeded.length,
    alert_count: alertResults.length,
    max_cumulative_point: maxCumulative.point_id,
    max_cumulative_mm: maxCumulative.cumulative_mm,
    exceeded_points: exceeded.map((r) => r.point_id),
    rate_exceeded_points: rateExceeded.map((r) => r.point_id),
    alert_points: alertResults.map((r) => r.point_id),
    monitoring_summary: monitoringSummary,
    summary: results.map(({ period_rows: _periodRows, ...row }) => row),
    period_rows: periodRows,
    export_rows: exportRows,
    data_quality_note: results.some((r) => r.removed_outliers > 0)
      ? `共剔除 ${removedOutlierCount} 个异常跳变点（采用 MAD 3σ 方法）`
      : "原始数据质量良好，无异常值剔除",
  };
}

export function registerMonitoring(server: McpServer): void {
  server.tool(
    "monitoring_csv",
    "处理自动化监测仪器（静力水准、全站仪机器人、测斜仪）的CSV/TXT/DAT数据。支持文件路径或直接粘贴 CSV 文本，返回本期变化量、累计变化量、速率和超限测点列表。data-analyst 必须调用此工具处理原始监测表。",
    monitoringCsvShape,
    async (args) => {
      if (args.csvText) {
        return ok(
          analyzeMonitoringCsv({
            raw: args.csvText,
            source: args.sourceName,
            inputFormat: "csv_text",
            sourceName: args.sourceName,
            csvDelimiter: args.csvDelimiter,
            sensorType: args.sensorType,
            alertThreshold: args.alertThreshold,
            rateThreshold: args.rateThreshold,
            periodDays: args.periodDays,
          }),
        );
      }
      if (!args.filePath) return ok({ error: "请提供 filePath 或 csvText 作为监测数据输入。" });

      const raw = await readTextFile(args.filePath);
      if (raw === null) return ok({ error: `文件不存在：${args.filePath}，请检查路径是否正确。` });

      const ext = path.extname(args.filePath).toLowerCase();
      if (![".csv", ".txt", ".dat"].includes(ext))
        return ok({ error: `暂不支持 ${ext} 格式，请转换为 CSV/TXT/DAT 文件后重试。` });

      return ok(
        analyzeMonitoringCsv({
          raw,
          source: path.basename(args.filePath),
          inputFormat: "file",
          sourceName: args.sourceName,
          csvDelimiter: args.csvDelimiter,
          sensorType: args.sensorType,
          alertThreshold: args.alertThreshold,
          rateThreshold: args.rateThreshold,
          periodDays: args.periodDays,
        }),
      );
    },
  );
}
