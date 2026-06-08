import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok } from "../util.js";

const deformationDatum = z.object({
  date: z.string().describe("观测日期，格式 YYYY-MM-DD 或 YYYY-MM-DD HH:mm"),
  value: z.number().describe("累计变形量(mm)，正值表示沉降/收敛方向"),
});

const deformationRateShape = {
  pointId: z.string().optional().describe("监测点编号；单点 data 输入时必填"),
  data: z.array(deformationDatum).min(2).optional().describe("按时间顺序排列的监测数据序列"),
  alertThreshold: z.number().positive().optional().describe("报警控制值(mm)，若提供则输出预警分析"),
  rateThreshold: z.number().positive().optional().describe("速率控制值(mm/d)，若提供则判断速率是否超限"),
  predictionDays: z.number().int().positive().default(7).describe("向前预测天数，默认7天"),
  csvText: z.string().optional().describe("可选，中文 CSV/TSV。每行提供测点编号、观测日期、累计沉降/位移和预警阈值，输出多测点趋势分析"),
  csvDelimiter: z.enum(["auto", "comma", "tab", "semicolon"]).default("auto"),
};

type DeformationDatum = z.infer<typeof deformationDatum>;
type CsvDelimiterOption = "auto" | "comma" | "tab" | "semicolon";

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

function parseDeformationDateTime(value: string): number {
  const text = value.trim();
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

function runDeformationRateAnalysis(input: {
  pointId: string;
  data: DeformationDatum[];
  alertThreshold?: number;
  rateThreshold?: number;
  predictionDays: number;
}) {
  const timedData = input.data.map((row) => ({
    ...row,
    time: parseDeformationDateTime(row.date),
  }));
  const invalidDate = timedData.find((row) => !Number.isFinite(row.time));
  if (invalidDate) throw new Error(`deformation_rate 无法解析观测日期：${invalidDate.date}`);
  const data = timedData.sort((a, b) => a.time - b.time);
  const n = data.length;
  const t0 = data[0]!.time;
  const days = data.map((d) => (d.time - t0) / 86400000);
  const values = data.map((d) => d.value);

  const rates: Array<{ period: string; rate_mm_per_day: number; increment_mm: number; days: number }> = [];
  for (let i = 1; i < n; i++) {
    const dt = days[i]! - days[i - 1]!;
    const dv = values[i]! - values[i - 1]!;
    const rate = dt > 0 ? dv / dt : 0;
    rates.push({
      period: `${data[i - 1]!.date} → ${data[i]!.date}`,
      rate_mm_per_day: Number(rate.toFixed(4)),
      increment_mm: Number(dv.toFixed(4)),
      days: Number(dt.toFixed(2)),
    });
  }

  const totalDays = days[n - 1]! - days[0]!;
  const totalDeformation = values[n - 1]! - values[0]!;
  const avgRate = totalDays > 0 ? totalDeformation / totalDays : 0;
  const latestValue = values[n - 1]!;
  const latestRate = rates.length > 0 ? rates[rates.length - 1]!.rate_mm_per_day : 0;

  const meanX = days.reduce((s, v) => s + v, 0) / n;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  const ssxy = days.reduce((s, x, i) => s + (x - meanX) * (values[i]! - meanY), 0);
  const ssxx = days.reduce((s, x) => s + (x - meanX) * (x - meanX), 0);
  const b = ssxx > 0 ? ssxy / ssxx : 0;
  const a = meanY - b * meanX;

  const ssyy = values.reduce((s, y) => s + (y - meanY) * (y - meanY), 0);
  const r2 = ssyy > 0 && ssxx > 0 ? (ssxy * ssxy) / (ssxx * ssyy) : 0;

  const residuals = values.map((y, i) => y - (a + b * days[i]!));
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(n - 2, 1));

  const lastDay = days[n - 1]!;
  const predictions = Array.from({ length: input.predictionDays }, (_, i) => {
    const predDay = lastDay + i + 1;
    const predDate = new Date(t0 + predDay * 86400000);
    const predValue = a + b * predDay;
    return {
      date: predDate.toISOString().slice(0, 10),
      predicted_mm: Number(predValue.toFixed(4)),
      day_offset: Number(predDay.toFixed(1)),
    };
  });

  const last3Rates = rates.slice(-3).map((r) => Math.abs(r.rate_mm_per_day));
  const avgLast3Rate =
    last3Rates.length > 0 ? last3Rates.reduce((s, v) => s + v, 0) / last3Rates.length : 0;

  let stability: string;
  if (avgLast3Rate < 0.01) {
    stability = "✅ 已收敛：近期速率趋近于零，变形基本稳定";
  } else if (avgLast3Rate < 0.05) {
    stability = "🟢 趋于收敛：变形速率逐渐减小";
  } else if (Math.abs(latestRate) > Math.abs(avgRate) * 1.5) {
    stability = "🔴 加速变形：最新速率明显大于平均速率，需加密监测";
  } else if (avgLast3Rate < Math.abs(avgRate)) {
    stability = "🟡 减速变形：速率有所减小但尚未收敛，继续监测";
  } else {
    stability = "🟠 等速变形：速率基本稳定，关注发展趋势";
  }

  let alertAnalysis: Record<string, unknown> | undefined;
  if (input.alertThreshold) {
    const ratio = Math.abs(latestValue) / input.alertThreshold;
    const predMax = Math.max(...predictions.map((p) => Math.abs(p.predicted_mm)));
    const predRatio = predMax / input.alertThreshold;
    const daysToThreshold = b !== 0 ? (input.alertThreshold * Math.sign(b) - a) / b - lastDay : Infinity;

    alertAnalysis = {
      current_ratio_pct: Number((ratio * 100).toFixed(1)),
      predicted_max_ratio_pct: Number((predRatio * 100).toFixed(1)),
      estimated_days_to_threshold:
        daysToThreshold > 0 && isFinite(daysToThreshold)
          ? Number(daysToThreshold.toFixed(1))
          : "不会达到（趋势方向相反或速率为零）",
      alert_level:
        ratio >= 1.0 ? "🔴 已超阈值" : ratio >= 0.85 ? "🟠 接近阈值" : ratio >= 0.7 ? "🟡 需关注" : "🟢 正常",
    };
  }

  let rateAlert: string | undefined;
  if (input.rateThreshold) {
    rateAlert =
      Math.abs(latestRate) > input.rateThreshold
        ? `🔴 最新速率 ${Math.abs(latestRate).toFixed(4)} mm/d 超过限值 ${input.rateThreshold} mm/d`
        : `🟢 最新速率 ${Math.abs(latestRate).toFixed(4)} mm/d 在限值 ${input.rateThreshold} mm/d 内`;
  }
  const alertLevel = typeof alertAnalysis?.alert_level === "string" ? alertAnalysis.alert_level : "未设阈值";
  const rateStatus =
    input.rateThreshold === undefined ? "unchecked" : Math.abs(latestRate) > input.rateThreshold ? "alert" : "pass";
  const deformationSummary = {
    point_id: input.pointId,
    data_count: n,
    monitoring_duration_days: Number(totalDays.toFixed(1)),
    latest_value_mm: latestValue,
    total_deformation_mm: Number(totalDeformation.toFixed(4)),
    average_rate_mm_per_day: Number(avgRate.toFixed(4)),
    latest_rate_mm_per_day: latestRate,
    regression_slope_mm_per_day: Number(b.toFixed(4)),
    regression_r_squared: Number(r2.toFixed(4)),
    alert_level: alertLevel,
    rate_status: rateStatus,
  };
  const exportRows = [
    ...data.map((row, index) => ({
      row_type: "deformation_observation",
      point_id: input.pointId,
      sequence: index + 1,
      date: row.date,
      value_mm: row.value,
    })),
    ...rates.map((row) => ({
      row_type: "deformation_period_rate",
      point_id: input.pointId,
      period: row.period,
      increment_mm: row.increment_mm,
      days: row.days,
      rate_mm_per_day: row.rate_mm_per_day,
    })),
    ...predictions.map((row) => ({
      row_type: "deformation_prediction",
      point_id: input.pointId,
      date: row.date,
      predicted_mm: row.predicted_mm,
      day_offset: row.day_offset,
    })),
  ];

  return {
    point_id: input.pointId,
    data_count: n,
    monitoring_duration_days: Number(totalDays.toFixed(1)),
    latest_value_mm: latestValue,
    total_deformation_mm: Number(totalDeformation.toFixed(4)),
    average_rate_mm_per_day: Number(avgRate.toFixed(4)),
    latest_rate_mm_per_day: latestRate,
    rates,
    regression: {
      equation: `y = ${a.toFixed(4)} + ${b.toFixed(4)} × t`,
      slope_mm_per_day: Number(b.toFixed(4)),
      intercept_mm: Number(a.toFixed(4)),
      r_squared: Number(r2.toFixed(4)),
      rmse_mm: Number(rmse.toFixed(4)),
    },
    predictions,
    stability_assessment: stability,
    alert_analysis: alertAnalysis,
    rate_alert: rateAlert,
    deformation_summary: deformationSummary,
    export_rows: exportRows,
    message: `✅ ${input.pointId} 变形分析：累计 ${latestValue}mm，最新速率 ${latestRate}mm/d，${stability}`,
  };
}

type DeformationAnalysisResult = ReturnType<typeof runDeformationRateAnalysis>;

const DEFORMATION_CSV_ALIASES = new Map<string, "pointId" | "date" | "value" | "alertThreshold" | "rateThreshold">(
  [
    ["pointid", "pointId"],
    ["id", "pointId"],
    ["point", "pointId"],
    ["name", "pointId"],
    ["测点", "pointId"],
    ["测点编号", "pointId"],
    ["监测点", "pointId"],
    ["监测点编号", "pointId"],
    ["监测点号", "pointId"],
    ["点号", "pointId"],
    ["点名", "pointId"],
    ["date", "date"],
    ["time", "date"],
    ["datetime", "date"],
    ["观测日期", "date"],
    ["监测日期", "date"],
    ["测量日期", "date"],
    ["日期", "date"],
    ["时间", "date"],
    ["value", "value"],
    ["valuemm", "value"],
    ["累计变形", "value"],
    ["累计变形量", "value"],
    ["累计沉降", "value"],
    ["累计沉降量", "value"],
    ["累计位移", "value"],
    ["累计位移量", "value"],
    ["沉降值", "value"],
    ["位移值", "value"],
    ["变形值", "value"],
    ["读数", "value"],
    ["alertthreshold", "alertThreshold"],
    ["alertthresholdmm", "alertThreshold"],
    ["累计预警值", "alertThreshold"],
    ["累计预警", "alertThreshold"],
    ["报警控制值", "alertThreshold"],
    ["预警值", "alertThreshold"],
    ["限值", "alertThreshold"],
    ["ratethreshold", "rateThreshold"],
    ["ratethresholdmmperday", "rateThreshold"],
    ["速率预警值", "rateThreshold"],
    ["速率预警", "rateThreshold"],
    ["速率控制值", "rateThreshold"],
  ].map(([alias, key]) => [normalizeCsvHeader(alias), key as "pointId" | "date" | "value" | "alertThreshold" | "rateThreshold"]),
);

function parseDeformationCsv(
  text: string,
  delimiterOption: CsvDelimiterOption,
): {
  groups: Map<string, DeformationDatum[]>;
  parsedRowCount: number;
  parsedObservationCount: number;
  tableFormat: "long" | "wide";
  alertThreshold: number | null;
  rateThreshold: number | null;
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("deformation_rate CSV 至少需要表头和 1 行数据");
  const delimiter = detectCsvDelimiter(lines[0]!, delimiterOption);
  const rawHeaders = splitDelimitedLine(lines[0]!, delimiter);
  const headers = rawHeaders.map((header) =>
    DEFORMATION_CSV_ALIASES.get(normalizeCsvHeader(header)),
  );
  const hasLongValueColumn = headers.includes("pointId") && headers.includes("date") && headers.includes("value");
  if (!hasLongValueColumn && headers.includes("date")) {
    return parseWideDeformationCsv(lines, delimiter, rawHeaders, headers);
  }

  const groups = new Map<string, DeformationDatum[]>();
  let alertThreshold: number | null = null;
  let rateThreshold: number | null = null;
  let parsedObservationCount = 0;
  for (const line of lines.slice(1)) {
    const row: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((cell, index) => {
      const key = headers[index];
      if (key) row[key] = cell;
    });
    const pointId = row.pointId?.trim();
    const date = row.date?.trim();
    const value = parseNumericCell(row.value ?? "");
    const rowAlertThreshold = parseNumericCell(row.alertThreshold ?? "");
    const rowRateThreshold = parseNumericCell(row.rateThreshold ?? "");
    if (Number.isFinite(rowAlertThreshold) && rowAlertThreshold > 0 && alertThreshold === null) {
      alertThreshold = rowAlertThreshold;
    }
    if (Number.isFinite(rowRateThreshold) && rowRateThreshold > 0 && rateThreshold === null) {
      rateThreshold = rowRateThreshold;
    }
    if (!pointId || !date || !Number.isFinite(value)) continue;
    const existing = groups.get(pointId) ?? [];
    existing.push({ date, value });
    groups.set(pointId, existing);
    parsedObservationCount += 1;
  }
  const validPointCount = [...groups.values()].filter((items) => items.length >= 2).length;
  if (validPointCount === 0) throw new Error("deformation_rate CSV 未解析到至少 1 个拥有两期以上数据的测点");
  return {
    groups,
    parsedRowCount: lines.length - 1,
    parsedObservationCount,
    tableFormat: "long",
    alertThreshold,
    rateThreshold,
  };
}

function parseWideDeformationCsv(
  lines: string[],
  delimiter: string,
  rawHeaders: string[],
  headers: Array<"pointId" | "date" | "value" | "alertThreshold" | "rateThreshold" | undefined>,
): {
  groups: Map<string, DeformationDatum[]>;
  parsedRowCount: number;
  parsedObservationCount: number;
  tableFormat: "wide";
  alertThreshold: number | null;
  rateThreshold: number | null;
} {
  const dateIndex = headers.findIndex((header) => header === "date");
  if (dateIndex < 0) throw new Error("deformation_rate 宽表 CSV 需要观测日期列");
  const pointColumns = rawHeaders
    .map((header, index) => ({ index, pointId: normalizeWidePointHeader(header), mapped: headers[index] }))
    .filter(({ index, pointId, mapped }) => index !== dateIndex && !mapped && pointId.length > 0);
  if (pointColumns.length === 0) throw new Error("deformation_rate 宽表 CSV 未识别到测点数值列");

  const groups = new Map<string, DeformationDatum[]>();
  let alertThreshold: number | null = null;
  let rateThreshold: number | null = null;
  let parsedObservationCount = 0;
  for (const line of lines.slice(1)) {
    const cells = splitDelimitedLine(line, delimiter);
    const date = cells[dateIndex]?.trim();
    if (!date) continue;
    headers.forEach((header, index) => {
      if (header === "alertThreshold" && alertThreshold === null) {
        const value = parseNumericCell(cells[index] ?? "");
        if (Number.isFinite(value) && value > 0) alertThreshold = value;
      }
      if (header === "rateThreshold" && rateThreshold === null) {
        const value = parseNumericCell(cells[index] ?? "");
        if (Number.isFinite(value) && value > 0) rateThreshold = value;
      }
    });
    for (const column of pointColumns) {
      const value = parseNumericCell(cells[column.index] ?? "");
      if (!Number.isFinite(value)) continue;
      const existing = groups.get(column.pointId) ?? [];
      existing.push({ date, value });
      groups.set(column.pointId, existing);
      parsedObservationCount += 1;
    }
  }

  const validPointCount = [...groups.values()].filter((items) => items.length >= 2).length;
  if (validPointCount === 0) throw new Error("deformation_rate 宽表 CSV 未解析到至少 1 个拥有两期以上数据的测点");
  return {
    groups,
    parsedRowCount: lines.length - 1,
    parsedObservationCount,
    tableFormat: "wide",
    alertThreshold,
    rateThreshold,
  };
}

function normalizeWidePointHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[（(]\s*(mm|毫米)\s*[）)]/gi, "")
    .replace(/累计(沉降|位移|变形)(量|值)?/g, "")
    .replace(/本次(沉降|位移|变形)(量|值)?/g, "")
    .trim();
}

function isDeformationPointAlert(
  row: DeformationAnalysisResult,
  alertThreshold: number | undefined,
  rateThreshold: number | undefined,
): boolean {
  return (
    (alertThreshold !== undefined && Math.abs(row.latest_value_mm) >= alertThreshold) ||
    (rateThreshold !== undefined && Math.abs(row.latest_rate_mm_per_day) > rateThreshold)
  );
}

function detectCsvDelimiter(firstLine: string, delimiterOption: CsvDelimiterOption): string {
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

export function registerDeformation(server: McpServer): void {
  server.tool(
    "deformation_rate",
    "变形速率计算与趋势分析。根据监测点的时间-变形量序列，计算各期变形速率、累计变形量，并用线性回归进行趋势预测。城市轨道监测中判断变形是否收敛的核心分析工具。data-analyst 在分析自动化监测数据趋势时必须调用此工具。",
    deformationRateShape,
    async (args) => {
      if (args.csvText) {
        const parsed = parseDeformationCsv(args.csvText, args.csvDelimiter);
        const alertThreshold = parsed.alertThreshold ?? args.alertThreshold;
        const rateThreshold = parsed.rateThreshold ?? args.rateThreshold;
        const pointResults = [...parsed.groups.entries()]
          .filter(([, data]) => data.length >= 2)
          .map(([pointId, data]) =>
            runDeformationRateAnalysis({
              pointId,
              data,
              alertThreshold,
              rateThreshold,
              predictionDays: args.predictionDays,
            }),
          );
        const alertPoints = pointResults
          .filter((row) => isDeformationPointAlert(row, alertThreshold, rateThreshold))
          .map((row) => row.point_id);
        const worstPoint = pointResults.reduce((worst, row) =>
          Math.abs(row.latest_value_mm) > Math.abs(worst.latest_value_mm) ? row : worst,
        );
        const pointSummaryRows = pointResults.map((row) => ({
          row_type: "deformation_point_summary",
          point_id: row.point_id,
          data_count: row.data_count,
          latest_value_mm: row.latest_value_mm,
          total_deformation_mm: row.total_deformation_mm,
          average_rate_mm_per_day: row.average_rate_mm_per_day,
          latest_rate_mm_per_day: row.latest_rate_mm_per_day,
          regression_slope_mm_per_day: row.regression.slope_mm_per_day,
          regression_r_squared: row.regression.r_squared,
          is_alert: alertPoints.includes(row.point_id),
        }));
        return ok({
          mode: "multi_point_csv",
          input_format: "csv",
          table_format: parsed.tableFormat,
          parsed_row_count: parsed.parsedRowCount,
          parsed_observation_count: parsed.parsedObservationCount,
          point_count: pointResults.length,
          alert_threshold_mm: alertThreshold ?? null,
          rate_threshold_mm_per_day: rateThreshold ?? null,
          alert_points: alertPoints,
          max_abs_latest_value_mm: Number(Math.max(...pointResults.map((row) => Math.abs(row.latest_value_mm))).toFixed(4)),
          max_abs_latest_rate_mm_per_day: Number(
            Math.max(...pointResults.map((row) => Math.abs(row.latest_rate_mm_per_day))).toFixed(4),
          ),
          deformation_summary: {
            mode: "multi_point_csv",
            point_count: pointResults.length,
            alert_count: alertPoints.length,
            worst_point_id: worstPoint.point_id,
            max_abs_latest_value_mm: Number(
              Math.max(...pointResults.map((row) => Math.abs(row.latest_value_mm))).toFixed(4),
            ),
            max_abs_latest_rate_mm_per_day: Number(
              Math.max(...pointResults.map((row) => Math.abs(row.latest_rate_mm_per_day))).toFixed(4),
            ),
          },
          point_results: pointResults,
          export_rows: [...pointSummaryRows, ...pointResults.flatMap((row) => row.export_rows)],
        });
      }
      if (!args.pointId || !args.data) throw new Error("deformation_rate 需要提供 pointId+data 或 csvText 输入");
      return ok(
        runDeformationRateAnalysis({
          pointId: args.pointId,
          data: args.data,
          alertThreshold: args.alertThreshold,
          rateThreshold: args.rateThreshold,
          predictionDays: args.predictionDays,
        }),
      );
    },
  );

  server.tool(
    "deformation_comparison",
    "多测点变形对比分析。同时对比多个监测点的变形量和速率，找出最大变形点、异常点。用于编制监测日报/周报中的断面对比分析。",
    {
      points: z
        .array(
          z.object({
            id: z.string().describe("测点编号"),
            latestValue: z.number().describe("最新累计变形量(mm)"),
            previousValue: z.number().describe("上期累计变形量(mm)"),
            daysBetween: z.number().positive().describe("两期间隔天数"),
          }),
        )
        .min(1)
        .describe("各监测点数据"),
      alertThreshold: z.number().positive().optional().describe("统一报警控制值(mm)"),
      rateThreshold: z.number().positive().optional().describe("速率控制值(mm/d)"),
    },
    async (args) => {
      const analyzed = args.points.map((p) => {
        const increment = p.latestValue - p.previousValue;
        const rate = increment / p.daysBetween;
        const absVal = Math.abs(p.latestValue);

        let status = "🟢 正常";
        if (args.alertThreshold) {
          const ratio = absVal / args.alertThreshold;
          if (ratio >= 1.0) status = "🔴 超限";
          else if (ratio >= 0.85) status = "🟠 接近阈值";
          else if (ratio >= 0.7) status = "🟡 关注";
        }
        if (args.rateThreshold && Math.abs(rate) > args.rateThreshold) {
          status = "🔴 速率超限";
        }
        const isAlert = status.includes("超限") || status.includes("接近");

        return {
          point_id: p.id,
          latest_mm: p.latestValue,
          increment_mm: Number(increment.toFixed(4)),
          rate_mm_per_day: Number(rate.toFixed(4)),
          status,
          is_alert: isAlert,
        };
      });

      const sorted = [...analyzed].sort((a, b) => Math.abs(b.latest_mm) - Math.abs(a.latest_mm));
      const maxPoint = sorted[0]!;
      const alertCount = analyzed.filter((a) => a.is_alert).length;

      const avgDeformation = analyzed.reduce((s, a) => s + Math.abs(a.latest_mm), 0) / analyzed.length;
      const maxRate = analyzed.reduce(
        (max, a) => (Math.abs(a.rate_mm_per_day) > Math.abs(max.rate_mm_per_day) ? a : max),
        analyzed[0]!,
      );
      const comparisonSummary = {
        point_count: analyzed.length,
        alert_count: alertCount,
        max_deformation_point_id: maxPoint.point_id,
        max_abs_deformation_mm: Number(Math.abs(maxPoint.latest_mm).toFixed(4)),
        max_rate_point_id: maxRate.point_id,
        max_abs_rate_mm_per_day: Number(Math.abs(maxRate.rate_mm_per_day).toFixed(4)),
        average_abs_deformation_mm: Number(avgDeformation.toFixed(4)),
        quality_status: alertCount > 0 ? "review_alert_points" : "pass",
      };
      const exportRows = sorted.map((row, index) => ({
        row_type: "deformation_comparison_point",
        rank: index + 1,
        point_id: row.point_id,
        latest_mm: row.latest_mm,
        increment_mm: row.increment_mm,
        rate_mm_per_day: row.rate_mm_per_day,
        status: row.status,
        is_alert: row.is_alert,
      }));

      return ok({
        total_points: analyzed.length,
        alert_count: alertCount,
        max_deformation: { point_id: maxPoint.point_id, value_mm: maxPoint.latest_mm },
        max_rate: { point_id: maxRate.point_id, rate_mm_per_day: maxRate.rate_mm_per_day },
        average_deformation_mm: Number(avgDeformation.toFixed(4)),
        deformation_comparison_summary: comparisonSummary,
        details: sorted,
        export_rows: exportRows,
        message: `✅ ${analyzed.length}个测点对比：最大变形 ${maxPoint.point_id}(${maxPoint.latest_mm}mm)，最大速率 ${maxRate.point_id}(${maxRate.rate_mm_per_day}mm/d)，${alertCount}个测点预警`,
      });
    },
  );
}
