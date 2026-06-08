import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deflateRawSync } from "node:zlib";
import { ok, writeBinaryFile } from "../util.js";

// XLSX = ZIP of XML files (Office Open XML SpreadsheetML)

function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files: Array<{ name: string; data: Uint8Array }>) {
  const entries: Array<{
    name: Uint8Array;
    compressed: Uint8Array;
    crc: number;
    size: number;
    csize: number;
    offset: number;
  }> = [];
  const parts: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = new TextEncoder().encode(f.name);
    const crc = crc32(f.data);
    const compressed = new Uint8Array(deflateRawSync(f.data));
    const header = new Uint8Array(30 + nameBytes.length);
    const v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(8, 8, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, compressed.length, true);
    v.setUint32(22, f.data.length, true);
    v.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);

    entries.push({ name: nameBytes, compressed, crc, size: f.data.length, csize: compressed.length, offset });
    parts.push(header, compressed);
    offset += header.length + compressed.length;
  }

  const cdStart = offset;
  for (const e of entries) {
    const cd = new Uint8Array(46 + e.name.length);
    const v = new DataView(cd.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 20, true);
    v.setUint16(10, 8, true);
    v.setUint32(16, e.crc, true);
    v.setUint32(20, e.csize, true);
    v.setUint32(24, e.size, true);
    v.setUint16(28, e.name.length, true);
    v.setUint32(42, e.offset, true);
    cd.set(e.name, 46);
    parts.push(cd);
    offset += cd.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, offset - cdStart, true);
  ev.setUint32(16, cdStart, true);
  parts.push(eocd);

  let total = 0;
  for (const p of parts) total += p.length;
  const result = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    result.set(p, pos);
    pos += p.length;
  }
  return result;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Excel column letter: 0->A, 1->B, ..., 25->Z, 26->AA
function colLetter(idx: number): string {
  let s = "";
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

type CellValue = string | number | boolean | null | undefined;
type SheetData = {
  name: string;
  headers: string[];
  rows: CellValue[][];
  columnWidths?: number[];
  freezeRow?: number;
};
type ExportRow = Record<string, unknown>;

const ROW_TYPE_SHEET_NAMES: Record<string, string> = {
  standard_clause_result: "规范条文",
  monitoring_point_summary: "监测点汇总",
  monitoring_period_observation: "监测观测记录",
  deformation_point_summary: "变形测点汇总",
  deformation_observation: "变形观测记录",
  deformation_period_rate: "变形速率",
  deformation_prediction: "变形预测",
  deformation_comparison_point: "变形对比",
  coord_transformed_point: "坐标转换成果",
  field_coordinate_record: "外业坐标记录",
  field_observation_record: "外业观测记录",
  calculator_leveling_closure: "水准闭合计算",
  calculator_traverse_closure: "导线闭合计算",
  calculator_alert_level: "预警等级判定",
  leveling_adjusted_height: "水准平差高程",
  leveling_observation_residual: "水准观测残差",
  level_adjustment_summary: "水准网平差摘要",
  level_adjusted_height: "水准网平差高程",
  level_adjust_segment_residual: "水准网测段残差",
  level_network_node: "水准网节点示意",
  level_network_segment: "水准网测段示意",
  traverse_adjustment_summary: "导线平差摘要",
  traverse_adjusted_coordinate: "导线平差坐标",
  traverse_error_ellipse: "导线误差椭圆参数",
  traverse_adjusted_azimuth: "导线方位角",
  control_network_coordinate_point: "控制网坐标平差",
  control_network_traverse_point: "导线闭合点",
  leveling_route_point: "水准路线点",
  leveling_route_segment: "水准路线测段",
  gnss_point: "GNSS平差点",
  gnss_baseline_residual: "GNSS基线残差",
  cpiii_deviation_point: "CPIII偏差点",
  cpiii_adjusted_point: "CPIII平差点",
  cpiii_observation_residual: "CPIII观测残差",
  direction_face_pair_check: "方向观测盘位差",
  direction_zero_closure_check: "方向归零差",
  direction_round_summary: "方向测回统计",
  line_stakeout_point_result: "线路放样复核",
  track_geometry_review_point: "轨道几何复核",
  track_geometry_section_summary: "轨道几何区段统计",
  alignment_station_offset_point: "线路里程偏距",
  shield_guidance_ring_result: "盾构导向环号",
  cross_section_profile_deviation: "断面轮廓偏差",
  water_level_well_summary: "水位测点汇总",
  water_level_period_observation: "水位观测记录",
  water_level_point_change: "水位点位变化",
  inclinometer_depth_summary: "测斜深度汇总",
  inclinometer_period_observation: "测斜观测记录",
  inclinometer_reading_difference: "测斜读数差",
  axial_force_sensor_summary: "轴力测点汇总",
  axial_force_period_observation: "轴力观测记录",
  axial_force_reading_result: "轴力读数成果",
  survey_distance_segment: "测距批量反算",
  survey_distance_observation: "外业距离观测",
  survey_distance_result: "测距计算成果",
  angle_conversion_result: "角度批量换算",
  angle_group_summary: "角度分组统计",
  survey_angle_conversion: "角度换算成果",
  chart_data_point: "图表数据",
  chart_threshold_line: "图表阈值线",
};

function toCellValue(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function safeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*:[\]]/g, " ").trim() || "Sheet";
  return [...cleaned].slice(0, 31).join("");
}

function makeUniqueSheetName(name: string, used: Set<string>): string {
  const base = safeSheetName(name);
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    const suffix = `_${index}`;
    candidate = `${[...base].slice(0, Math.max(1, 31 - suffix.length)).join("")}${suffix}`;
    index++;
  }
  used.add(candidate);
  return candidate;
}

function withUniqueSheetNames(sheets: SheetData[]): SheetData[] {
  const used = new Set<string>();
  return sheets.map((sheet) => ({
    ...sheet,
    name: makeUniqueSheetName(sheet.name, used),
  }));
}

function rowTypeOf(row: ExportRow): string {
  const rowType = row.row_type;
  return typeof rowType === "string" && rowType.trim() ? rowType.trim() : "export_row";
}

function buildExportRowSheets(rows: ExportRow[]): { sheets: SheetData[]; rowTypeCounts: Record<string, number> } {
  const grouped = new Map<string, ExportRow[]>();
  for (const row of rows) {
    const rowType = rowTypeOf(row);
    const group = grouped.get(rowType) ?? [];
    group.push(row);
    grouped.set(rowType, group);
  }

  const rowTypeCounts: Record<string, number> = {};
  const sheets = [...grouped.entries()].map(([rowType, groupRows]) => {
    rowTypeCounts[rowType] = groupRows.length;
    const headers: string[] = [];
    for (const row of groupRows) {
      for (const key of Object.keys(row)) {
        if (!headers.includes(key)) headers.push(key);
      }
    }

    return {
      name: ROW_TYPE_SHEET_NAMES[rowType] ?? rowType,
      headers,
      rows: groupRows.map((row) => headers.map((header) => toCellValue(row[header]))),
      freezeRow: 1,
    };
  });

  return { sheets, rowTypeCounts };
}

function buildSummarySheet(summary: Record<string, unknown>): SheetData {
  return {
    name: "质量摘要",
    headers: ["字段", "值"],
    rows: Object.entries(summary).map(([key, value]) => [key, toCellValue(value)]),
    columnWidths: [24, 60],
    freezeRow: 1,
  };
}

function buildManifestSheet(input: {
  title: string;
  sourceTool?: string;
  generatedSheetCount: number;
  exportRowCount: number;
  summaryFieldCount: number;
  rowTypeCounts: Record<string, number>;
}): SheetData {
  const rowTypeText = Object.entries(input.rowTypeCounts)
    .map(([rowType, count]) => `${rowType}:${count}`)
    .join("，");

  return {
    name: "成果清单",
    headers: ["项目", "值"],
    rows: [
      ["成果标题", input.title],
      ["来源工具", input.sourceTool ?? ""],
      ["生成工作表数", input.generatedSheetCount],
      ["导出数据行数", input.exportRowCount],
      ["摘要字段数", input.summaryFieldCount],
      ["数据分组", rowTypeText],
    ],
    columnWidths: [20, 60],
    freezeRow: 1,
  };
}

function buildSharedStrings(sheets: SheetData[]): { xml: string; lookup: Map<string, number> } {
  const lookup = new Map<string, number>();
  let idx = 0;

  for (const sheet of sheets) {
    for (const h of sheet.headers) {
      if (!lookup.has(h)) lookup.set(h, idx++);
    }
    for (const row of sheet.rows) {
      for (const cell of row) {
        if (typeof cell === "string" && !lookup.has(cell)) lookup.set(cell, idx++);
      }
    }
  }

  const items = Array.from(lookup.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([s]) => `<si><t>${esc(s)}</t></si>`)
    .join("");

  return {
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${lookup.size}" uniqueCount="${lookup.size}">${items}</sst>`,
    lookup,
  };
}

function buildSheet(sheet: SheetData, strings: Map<string, number>): string {
  const cols = sheet.headers.length;
  const lastCol = colLetter(cols - 1);
  const lastRow = sheet.rows.length + 1;

  let colsXml = "";
  if (sheet.columnWidths && sheet.columnWidths.length > 0) {
    const colDefs = sheet.columnWidths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
      .join("");
    colsXml = `<cols>${colDefs}</cols>`;
  }

  const headerCells = sheet.headers
    .map((h, c) => {
      const ref = `${colLetter(c)}1`;
      const si = strings.get(h) ?? 0;
      return `<c r="${ref}" t="s" s="1"><v>${si}</v></c>`;
    })
    .join("");
  const headerRow = `<row r="1">${headerCells}</row>`;

  const dataRows = sheet.rows
    .map((row, ri) => {
      const r = ri + 2;
      const cells = row
        .map((cell, ci) => {
          const ref = `${colLetter(ci)}${r}`;
          if (cell === null || cell === undefined) return `<c r="${ref}"/>`;
          if (typeof cell === "number") return `<c r="${ref}" s="2"><v>${cell}</v></c>`;
          if (typeof cell === "boolean") return `<c r="${ref}"><v>${cell ? 1 : 0}</v></c>`;
          const si = strings.get(cell) ?? 0;
          return `<c r="${ref}" t="s"><v>${si}</v></c>`;
        })
        .join("");
      return `<row r="${r}">${cells}</row>`;
    })
    .join("\n");

  const freezeRow = sheet.freezeRow ?? 1;
  const pane =
    freezeRow > 0
      ? `<pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/>`
      : "";

  const autoFilter = `<autoFilter ref="A1:${lastCol}${lastRow}"/>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${colsXml}
  <sheetViews><sheetView tabSelected="1" workbookViewId="0">${pane}</sheetView></sheetViews>
  <sheetData>
${headerRow}
${dataRows}
  </sheetData>
  ${autoFilter}
</worksheet>`;
}

function buildStyles(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="0.000"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="11"/><name val="等线"/></font>
    <font><b/><sz val="11"/><name val="等线"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9E2F3"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border/>
    <border>
      <left style="thin"><color auto="1"/></left>
      <right style="thin"><color auto="1"/></right>
      <top style="thin"><color auto="1"/></top>
      <bottom style="thin"><color auto="1"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`;
}

function buildXlsx(sheets: SheetData[]): Uint8Array {
  const { xml: sst, lookup } = buildSharedStrings(sheets);

  const sheetXmls = sheets.map((s) => buildSheet(s, lookup));

  const sheetRefs = sheets
    .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetRefs}</sheets>
</workbook>`;

  const sheetRelEntries = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("");

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelEntries}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const sheetOverrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("\n  ");

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheetOverrides}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  const enc = (s: string) => new TextEncoder().encode(s);

  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: "[Content_Types].xml", data: enc(contentTypes) },
    { name: "_rels/.rels", data: enc(rels) },
    { name: "xl/workbook.xml", data: enc(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(wbRels) },
    { name: "xl/styles.xml", data: enc(buildStyles()) },
    { name: "xl/sharedStrings.xml", data: enc(sst) },
  ];

  for (let i = 0; i < sheetXmls.length; i++) {
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(sheetXmls[i]!) });
  }

  return zip(files);
}

const cellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export function registerExcel(server: McpServer): void {
  server.tool(
    "excel_export",
    "将监测数据导出为 .xlsx（Excel）文件。支持多 Sheet、表头冻结、自动筛选、数值格式化。用于导出轨道交通监测日报/周报数据表、变形汇总表、轴力统计表等。data-analyst 或 writer 需要输出 Excel 报表时必须调用此工具。",
    {
      sheets: z
        .array(
          z.object({
            name: z.string().describe("Sheet 名称，如 '沉降监测' '深层位移' '轴力统计'"),
            headers: z.array(z.string()).min(1).describe("列标题"),
            rows: z.array(z.array(cellValueSchema)).describe("数据行，每行元素数量与 headers 一致"),
            columnWidths: z
              .array(z.number().positive())
              .optional()
              .describe("各列宽度（字符数），不传则自动计算"),
            freezeRow: z.number().int().default(1).describe("冻结前N行，默认1（冻结表头）"),
          }),
        )
        .min(1)
        .optional()
        .describe("工作表列表，支持多个 Sheet"),
      sourceTool: z.string().optional().describe("结构化成果来源工具名，如 standard_query、deformation_rate"),
      summary: z.record(z.unknown()).optional().describe("工具返回的 summary 对象，将导出为质量摘要 Sheet"),
      exportRows: z
        .array(z.record(z.unknown()))
        .optional()
        .describe("工具返回的 export_rows 对象数组，将按 row_type 自动分组导出"),
      title: z.string().default("监测数据").describe("文件名（不含扩展名）"),
      outputPath: z.string().optional().describe("输出路径，默认 ./[title].xlsx"),
    },
    async (args) => {
      const exportRows = args.exportRows ?? [];
      const summaryFieldCount = args.summary ? Object.keys(args.summary).length : 0;
      const { sheets: exportRowSheets, rowTypeCounts } = buildExportRowSheets(exportRows);
      const deliverableSheets: SheetData[] =
        args.summary || exportRows.length > 0
          ? [
              buildManifestSheet({
                title: args.title,
                sourceTool: args.sourceTool,
                generatedSheetCount: 1 + (args.summary ? 1 : 0) + (args.sheets?.length ?? 0) + exportRowSheets.length,
                exportRowCount: exportRows.length,
                summaryFieldCount,
                rowTypeCounts,
              }),
              ...(args.summary ? [buildSummarySheet(args.summary)] : []),
            ]
          : [];
      const requestedSheets = args.sheets ?? [];
      const rawSheets = withUniqueSheetNames([...deliverableSheets, ...requestedSheets, ...exportRowSheets]);
      if (rawSheets.length === 0) throw new Error("excel_export 需要提供 sheets 或 exportRows");

      const sheetsData: SheetData[] = rawSheets.map((s) => {
        const widths =
          s.columnWidths ??
          s.headers.map((h, i) => {
            const headerLen = [...h].length + 4;
            const maxDataLen = s.rows.reduce((max, row) => {
              const cell = row[i];
              const len = cell === null || cell === undefined ? 0 : String(cell).length;
              return Math.max(max, len);
            }, 0);
            return Math.min(Math.max(headerLen, maxDataLen + 2), 50);
          });

        return {
          name: s.name,
          headers: s.headers,
          rows: s.rows,
          columnWidths: widths,
          freezeRow: s.freezeRow,
        };
      });

      const xlsxBytes = buildXlsx(sheetsData);
      const dest = args.outputPath ?? `./${args.title.replace(/[/\\:*?"<>|]/g, "_")}.xlsx`;
      await writeBinaryFile(dest, xlsxBytes);

      const totalRows = rawSheets.reduce((s, sh) => s + sh.rows.length, 0);
      const totalCols = rawSheets.reduce((s, sh) => s + sh.headers.length, 0);
      const generatedSheets = rawSheets.map((s) => s.name);

      return ok({
        output_path: dest,
        file_size_kb: Number((xlsxBytes.length / 1024).toFixed(1)),
        format: "xlsx (Office Open XML SpreadsheetML)",
        sheets: rawSheets.map((s) => ({ name: s.name, columns: s.headers.length, rows: s.rows.length })),
        total_rows: totalRows,
        total_columns: totalCols,
        export_summary: {
          source_tool: args.sourceTool ?? null,
          export_row_count: exportRows.length,
          summary_field_count: summaryFieldCount,
          generated_sheet_count: rawSheets.length,
          generated_sheets: generatedSheets,
          row_type_counts: rowTypeCounts,
        },
        message: `✅ Excel 报表已导出：${dest}（${(xlsxBytes.length / 1024).toFixed(1)} KB），${rawSheets.length}个工作表，共 ${totalRows} 行数据`,
      });
    },
  );

  server.tool(
    "excel_monitoring_table",
    "快速导出标准格式的监测数据汇总表。直接输入测点数据，自动生成带预警标识的规范化 Excel 报表。适用于沉降、位移、轴力、水位等各类监测项目的数据报表导出。",
    {
      projectName: z.string().describe("项目名称"),
      monitoringType: z
        .enum(["settlement", "displacement", "axial_force", "water_level", "inclinometer", "convergence"])
        .describe("监测类型"),
      date: z.string().describe("报表日期 YYYY-MM-DD"),
      points: z
        .array(
          z.object({
            id: z.string().describe("测点编号"),
            section: z.string().optional().describe("所属断面"),
            initialValue: z.number().optional().describe("初始值"),
            previousValue: z.number().optional().describe("上期值"),
            currentValue: z.number().describe("本期值"),
            cumulativeChange: z.number().describe("累计变化量"),
            periodChange: z.number().optional().describe("本期变化量"),
            rate: z.number().optional().describe("变化速率(/d)"),
          }),
        )
        .min(1)
        .describe("各测点数据"),
      alertThreshold: z.number().positive().optional().describe("报警控制值"),
      unit: z.string().default("mm").describe("单位"),
      outputPath: z.string().optional().describe("输出路径"),
    },
    async (args) => {
      const typeLabels: Record<string, string> = {
        settlement: "沉降监测",
        displacement: "水平位移",
        axial_force: "轴力监测",
        water_level: "水位监测",
        inclinometer: "深层水平位移",
        convergence: "收敛监测",
      };
      const typeLabel = typeLabels[args.monitoringType] ?? args.monitoringType;

      const headers = [
        "测点编号",
        ...(args.points.some((p) => p.section) ? ["所属断面"] : []),
        ...(args.points.some((p) => p.initialValue !== undefined) ? [`初始值(${args.unit})`] : []),
        ...(args.points.some((p) => p.previousValue !== undefined) ? [`上期值(${args.unit})`] : []),
        `本期值(${args.unit})`,
        `累计变化量(${args.unit})`,
        ...(args.points.some((p) => p.periodChange !== undefined) ? [`本期变化量(${args.unit})`] : []),
        ...(args.points.some((p) => p.rate !== undefined) ? [`变化速率(${args.unit}/d)`] : []),
        ...(args.alertThreshold ? [`控制值(${args.unit})`, "占控制值(%)", "预警状态"] : []),
      ];

      const rows: CellValue[][] = args.points.map((p) => {
        const ratio = args.alertThreshold ? Math.abs(p.cumulativeChange) / args.alertThreshold : 0;
        let alertStatus = "";
        if (args.alertThreshold) {
          if (ratio >= 1.0) alertStatus = "超限";
          else if (ratio >= 0.85) alertStatus = "橙色预警";
          else if (ratio >= 0.7) alertStatus = "黄色预警";
          else alertStatus = "正常";
        }

        return [
          p.id,
          ...(args.points.some((pt) => pt.section) ? [p.section ?? ""] : []),
          ...(args.points.some((pt) => pt.initialValue !== undefined) ? [p.initialValue ?? null] : []),
          ...(args.points.some((pt) => pt.previousValue !== undefined) ? [p.previousValue ?? null] : []),
          p.currentValue,
          p.cumulativeChange,
          ...(args.points.some((pt) => pt.periodChange !== undefined) ? [p.periodChange ?? null] : []),
          ...(args.points.some((pt) => pt.rate !== undefined) ? [p.rate ?? null] : []),
          ...(args.alertThreshold
            ? [args.alertThreshold, Number((ratio * 100).toFixed(1)), alertStatus]
            : []),
        ];
      });

      const cumulativeValues = args.points.map((p) => Math.abs(p.cumulativeChange));
      const maxIdx = cumulativeValues.indexOf(Math.max(...cumulativeValues));
      const avgCumulative = cumulativeValues.reduce((s, v) => s + v, 0) / cumulativeValues.length;
      const alertCount = args.alertThreshold
        ? args.points.filter((p) => Math.abs(p.cumulativeChange) >= args.alertThreshold! * 0.7).length
        : 0;

      const sheetData: SheetData = { name: typeLabel, headers, rows, freezeRow: 1 };

      const xlsxBytes = buildXlsx([sheetData]);
      const filename = `${args.projectName}_${typeLabel}_${args.date}`;
      const dest = args.outputPath ?? `./${filename.replace(/[/\\:*?"<>|]/g, "_")}.xlsx`;
      await writeBinaryFile(dest, xlsxBytes);

      return ok({
        output_path: dest,
        file_size_kb: Number((xlsxBytes.length / 1024).toFixed(1)),
        project: args.projectName,
        type: typeLabel,
        date: args.date,
        point_count: args.points.length,
        max_point: { id: args.points[maxIdx]!.id, value: args.points[maxIdx]!.cumulativeChange },
        avg_cumulative: Number(avgCumulative.toFixed(3)),
        alert_count: alertCount,
        message: `✅ ${typeLabel}报表已导出：${dest}，${args.points.length}个测点，最大变化 ${args.points[maxIdx]!.id}(${args.points[maxIdx]!.cumulativeChange}${args.unit})${alertCount > 0 ? `，${alertCount}个测点预警` : ""}`,
      });
    },
  );
}
