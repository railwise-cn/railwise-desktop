import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ok, writeTextFile } from "../util.js";

const PALETTE = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#0891b2",
  "#e11d48",
  "#65a30d",
  "#c026d3",
  "#ea580c",
];

const W = 800;
const H = 400;
const PAD = { top: 50, right: 30, bottom: 60, left: 70 };

type ChartPoint = { point_id: string; date: string; value: number };
type ExportRow = Record<string, unknown>;

function xml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function group(data: ChartPoint[]) {
  return data.reduce((m, d) => {
    const arr = m.get(d.point_id) ?? [];
    arr.push({ date: d.date, value: d.value });
    m.set(d.point_id, arr);
    return m;
  }, new Map<string, Array<{ date: string; value: number }>>());
}

function textCell(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function numericCell(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  if (Number.isFinite(parsed)) return parsed;
  const match = normalized.match(/[-+]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function firstText(row: ExportRow, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = textCell(row[field]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function firstNumber(row: ExportRow, fields: string[]): number | undefined {
  for (const field of fields) {
    const value = numericCell(row[field]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function defaultChartFields(rowType: string): {
  pointFields: string[];
  dateFields: string[];
  valueFields: string[];
} | null {
  switch (rowType) {
    case "monitoring_period_observation":
      return {
        pointFields: ["point_id"],
        dateFields: ["date", "observation_date"],
        valueFields: ["cumulative_mm", "value_mm", "stage_change_mm"],
      };
    case "deformation_observation":
      return {
        pointFields: ["point_id"],
        dateFields: ["date", "observation_date"],
        valueFields: ["value_mm", "cumulative_mm"],
      };
    case "water_level_period_observation":
      return {
        pointFields: ["well_id", "point_id"],
        dateFields: ["date", "observation_date"],
        valueFields: ["change_mm", "stage_change_mm"],
      };
    case "inclinometer_period_observation":
      return {
        pointFields: ["point_id", "borehole_id"],
        dateFields: ["date", "observation_date"],
        valueFields: ["cumulative_resultant_mm", "stage_resultant_mm"],
      };
    case "water_level_point_change":
      return {
        pointFields: ["point_id", "well_id"],
        dateFields: ["date", "observation_date"],
        valueFields: ["change_mm", "abs_change_mm"],
      };
    case "inclinometer_reading_difference":
      return {
        pointFields: ["point_id", "borehole_id"],
        dateFields: ["date", "observation_date"],
        valueFields: ["displacement_mm", "change_mm", "abs_change_mm"],
      };
    case "axial_force_period_observation":
      return {
        pointFields: ["sensor_id", "point_id"],
        dateFields: ["date", "observation_date"],
        valueFields: ["force_kn", "cumulative_change_kn", "stage_force_change_kn"],
      };
    default:
      return null;
  }
}

function pointIdFromRow(row: ExportRow, fields: string[]): string | undefined {
  const base = firstText(row, fields);
  if (!base) return undefined;
  const depth = numericCell(row.depth_m);
  return depth === undefined ? base : `${base}@${depth}m`;
}

function chartDataFromExportRows(
  rows: ExportRow[],
  options: {
    rowTypes?: string[];
    pointField?: string;
    dateField?: string;
    valueField?: string;
  },
): { data: ChartPoint[]; sourceRowCount: number; skippedRowCount: number; usedRowTypes: Record<string, number> } {
  const selectedTypes = options.rowTypes ? new Set(options.rowTypes) : undefined;
  const usedRowTypes: Record<string, number> = {};
  let sourceRowCount = 0;
  let skippedRowCount = 0;
  const data: ChartPoint[] = [];

  for (const row of rows) {
    const rowType = textCell(row.row_type) ?? "export_row";
    if (selectedTypes && !selectedTypes.has(rowType)) continue;

    const defaults = defaultChartFields(rowType);
    if (!defaults && !(options.pointField && options.dateField && options.valueField)) continue;

    sourceRowCount += 1;
    const pointFields = options.pointField ? [options.pointField] : (defaults?.pointFields ?? []);
    const dateFields = options.dateField ? [options.dateField] : (defaults?.dateFields ?? []);
    const valueFields = options.valueField ? [options.valueField] : (defaults?.valueFields ?? []);
    const pointId = pointIdFromRow(row, pointFields);
    const date = firstText(row, dateFields);
    const value = firstNumber(row, valueFields);

    if (!pointId || !date || value === undefined) {
      skippedRowCount += 1;
      continue;
    }

    usedRowTypes[rowType] = (usedRowTypes[rowType] ?? 0) + 1;
    data.push({ point_id: pointId, date, value });
  }

  return { data, sourceRowCount, skippedRowCount, usedRowTypes };
}

function thresholdLines(values: number[], threshold?: number): number[] {
  if (threshold === undefined) return [];
  const absThreshold = Math.abs(threshold);
  if (absThreshold === 0) return [0];
  return values.some((value) => value < 0) ? [absThreshold, -absThreshold] : [threshold];
}

function thresholdLabel(threshold: number, unit: string): string {
  if (threshold > 0) return `报警值 +${threshold}${unit}`;
  return `报警值 ${threshold}${unit}`;
}

export function registerChart(server: McpServer): void {
  server.tool(
    "chart_generator",
    "根据监测时序数据生成SVG趋势折线图，用于工程监测报告（日报/周报/月报）中的数据可视化。支持多测点系列、报警阈值线叠加。生成的SVG文件可直接在浏览器中查看或嵌入报告。",
    {
      data: z
        .array(
          z.object({
            point_id: z.string().describe("测点编号，如 JC-01"),
            date: z.string().describe("日期或序列标识，如 2024-01-15"),
            value: z.number().describe("监测值，单位mm"),
          }),
        )
        .min(1)
        .optional()
        .describe("监测时序数据数组"),
      sourceTool: z.string().optional().describe("结构化成果来源工具名，如 monitoring_csv、deformation_rate"),
      exportRows: z
        .array(z.record(z.unknown()))
        .optional()
        .describe("工具返回的 export_rows，对监测/变形类逐期观测记录可自动抽取趋势图数据"),
      rowTypes: z.array(z.string()).optional().describe("从 exportRows 中筛选的 row_type 列表，不传则自动识别可绘图记录"),
      pointField: z.string().optional().describe("自定义测点字段名，用于非标准 exportRows"),
      dateField: z.string().optional().describe("自定义日期字段名，用于非标准 exportRows"),
      valueField: z.string().optional().describe("自定义数值字段名，用于非标准 exportRows"),
      valueUnit: z.string().default("mm").describe("纵轴单位，默认 mm"),
      title: z.string().optional().describe("图表标题，如：地表沉降监测趋势图"),
      alertThreshold: z.number().optional().describe("报警阈值，单位与 valueUnit 一致，在图表上显示为红色水平虚线"),
      outputPath: z.string().optional().describe("SVG文件输出路径，默认为 ./chart_output.svg"),
    },
    async (args) => {
      const parsedExportRows = args.exportRows
        ? chartDataFromExportRows(args.exportRows, {
            rowTypes: args.rowTypes,
            pointField: args.pointField,
            dateField: args.dateField,
            valueField: args.valueField,
          })
        : { data: [] as ChartPoint[], sourceRowCount: 0, skippedRowCount: 0, usedRowTypes: {} as Record<string, number> };
      const data = [...(args.data ?? []), ...parsedExportRows.data];
      if (data.length === 0) {
        throw new Error("chart_generator 需要提供 data，或提供可识别的 exportRows 逐期观测记录");
      }
      const valueUnit = args.valueUnit.trim() || "mm";

      const series = group(data);
      const ids = [...series.keys()];

      series.forEach((arr) => arr.sort((a, b) => a.date.localeCompare(b.date)));

      const dates = [...new Set(data.map((d) => d.date))].sort();
      const values = data.map((d) => d.value);
      const thresholds = thresholdLines(values, args.alertThreshold);
      const raw = [...values, ...thresholds];

      const span = Math.max(Math.max(...raw) - Math.min(...raw), 0.1);
      const minY = Math.min(...raw) - span * 0.1;
      const maxY = Math.max(...raw) + span * 0.1;

      const cw = W - PAD.left - PAD.right;
      const ch = H - PAD.top - PAD.bottom;

      const sx = (i: number) => PAD.left + (i / Math.max(dates.length - 1, 1)) * cw;
      const sy = (v: number) => PAD.top + ch - ((v - minY) / (maxY - minY)) * ch;

      const ticks = 5;
      const step = Math.max(1, Math.ceil(dates.length / 10));

      const svg: string[] = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
        `<style>text{font-family:"Microsoft YaHei","PingFang SC",sans-serif}</style>`,
        `<rect width="${W}" height="${H}" fill="#fff"/>`,
      ];

      if (args.title) {
        svg.push(
          `<text x="${W / 2}" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#1f2937">${xml(args.title)}</text>`,
        );
      }

      Array.from({ length: ticks + 1 }, (_, i) => {
        const y = PAD.top + (i / ticks) * ch;
        const v = maxY - (i / ticks) * (maxY - minY);
        svg.push(
          `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#e5e7eb"/>`,
          `<text x="${PAD.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6b7280">${v.toFixed(2)}</text>`,
        );
      });

      dates.forEach((d, i) => {
        if (i % step !== 0) return;
        const x = sx(i);
        const label = d.length > 5 ? d.slice(5) : d;
        svg.push(
          `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + ch}" stroke="#e5e7eb"/>`,
          `<text x="${x}" y="${PAD.top + ch + 18}" text-anchor="end" font-size="10" fill="#6b7280" transform="rotate(-35 ${x} ${PAD.top + ch + 18})">${xml(label)}</text>`,
        );
      });

      svg.push(
        `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + ch}" stroke="#374151" stroke-width="1.5"/>`,
        `<line x1="${PAD.left}" y1="${PAD.top + ch}" x2="${W - PAD.right}" y2="${PAD.top + ch}" stroke="#374151" stroke-width="1.5"/>`,
      );

      svg.push(
        `<text x="18" y="${PAD.top + ch / 2}" text-anchor="middle" font-size="12" fill="#374151" transform="rotate(-90 18 ${PAD.top + ch / 2})">变化量 (${xml(valueUnit)})</text>`,
      );

      thresholds.forEach((threshold) => {
        const y = sy(threshold);
        svg.push(
          `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="6,4"/>`,
          `<text x="${W - PAD.right - 4}" y="${y - 6}" text-anchor="end" font-size="10" fill="#ef4444" font-weight="bold">${xml(thresholdLabel(threshold, valueUnit))}</text>`,
        );
      });

      ids.forEach((id, idx) => {
        const color = PALETTE[idx % PALETTE.length];
        const pts = series.get(id)!;
        const coords = pts.map((p) => `${sx(dates.indexOf(p.date))},${sy(p.value)}`).join(" ");

        svg.push(
          `<polyline points="${coords}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
        );

        pts.forEach((p) => {
          svg.push(
            `<circle cx="${sx(dates.indexOf(p.date))}" cy="${sy(p.value)}" r="3" fill="${color}" stroke="#fff" stroke-width="1"/>`,
          );
        });
      });

      const lx = W - PAD.right - 10;
      const ly = PAD.top + 10;
      const lw = 100;
      const lh = ids.length * 16 + 12;

      svg.push(
        `<rect x="${lx - lw}" y="${ly - 8}" width="${lw + 10}" height="${lh}" rx="4" fill="#fff" fill-opacity="0.92" stroke="#e5e7eb"/>`,
      );

      ids.forEach((id, idx) => {
        const color = PALETTE[idx % PALETTE.length];
        const y = ly + idx * 16 + 4;
        svg.push(
          `<line x1="${lx - lw + 8}" y1="${y}" x2="${lx - lw + 26}" y2="${y}" stroke="${color}" stroke-width="2"/>`,
          `<circle cx="${lx - lw + 17}" cy="${y}" r="2.5" fill="${color}"/>`,
          `<text x="${lx - lw + 32}" y="${y + 4}" font-size="10" fill="#374151">${xml(id)}</text>`,
        );
      });

      svg.push("</svg>");

      const out = svg.join("\n");
      const dest = args.outputPath ?? "chart_output.svg";

      await writeTextFile(dest, out);
      const chartSummary = {
        title: args.title ?? "",
        source_tool: args.sourceTool ?? null,
        input_data_count: args.data?.length ?? 0,
        export_row_source_count: parsedExportRows.sourceRowCount,
        skipped_export_row_count: parsedExportRows.skippedRowCount,
        used_row_type_counts: parsedExportRows.usedRowTypes,
        point_count: data.length,
        series_count: ids.length,
        date_start: dates[0] ?? "",
        date_end: dates[dates.length - 1] ?? "",
        min_value: Math.min(...values),
        max_value: Math.max(...values),
        min_value_mm: Math.min(...values),
        max_value_mm: Math.max(...values),
        value_unit: valueUnit,
        threshold_lines: thresholds.length,
        has_negative_values: values.some((value) => value < 0),
      };
      const exportRows = [
        ...data.map((row, index) => ({
          row_type: "chart_data_point",
          sequence: index + 1,
          point_id: row.point_id,
          date: row.date,
          value: row.value,
          value_unit: valueUnit,
          value_mm: row.value,
        })),
        ...thresholds.map((threshold, index) => ({
          row_type: "chart_threshold_line",
          sequence: index + 1,
          threshold: threshold,
          threshold_unit: valueUnit,
          threshold_mm: threshold,
          label: thresholdLabel(threshold, valueUnit),
        })),
      ];

      return ok({
        output_path: dest,
        width: W,
        height: H,
        point_count: data.length,
        series_count: ids.length,
        threshold_lines: thresholds.length,
        date_range: dates.length > 0 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : "",
        chart_summary: chartSummary,
        export_rows: exportRows,
        message: `✅ 趋势图已生成：${ids.length}条测点曲线，${data.length}个数据点，保存至 ${dest}`,
      });
    },
  );
}
