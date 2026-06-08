import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deflateRawSync } from "node:zlib";
import { ok, writeBinaryFile, writeTextFile } from "../util.js";

// ============================================================
// Minimal ZIP builder (DOCX = ZIP of XML files)
// ============================================================

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

// ============================================================
// Markdown → DOCX XML conversion
// ============================================================

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type ExportRow = Record<string, unknown>;

const ROW_TYPE_SECTION_NAMES: Record<string, string> = {
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

function reportValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function reportSectionName(rowType: string): string {
  return ROW_TYPE_SECTION_NAMES[rowType] ?? rowType;
}

function groupExportRows(rows: ExportRow[]): { grouped: Map<string, ExportRow[]>; rowTypeCounts: Record<string, number> } {
  const grouped = new Map<string, ExportRow[]>();
  for (const row of rows) {
    const rawRowType = row.row_type;
    const rowType = typeof rawRowType === "string" && rawRowType.trim() ? rawRowType.trim() : "export_row";
    const group = grouped.get(rowType) ?? [];
    group.push(row);
    grouped.set(rowType, group);
  }

  const rowTypeCounts: Record<string, number> = {};
  for (const [rowType, groupRows] of grouped) rowTypeCounts[rowType] = groupRows.length;
  return { grouped, rowTypeCounts };
}

function tableCell(value: unknown): string {
  return reportValue(value).replace(/\r?\n/g, " ").replace(/\|/g, "｜");
}

function markdownTable(headers: string[], rows: unknown[][]): string[] {
  return [
    `| ${headers.map(tableCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(tableCell).join(" | ")} |`),
  ];
}

function tableHeaders(rows: ExportRow[]): string[] {
  const headers: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }
  return headers;
}

function buildStructuredReportMarkdown(input: {
  title: string;
  sourceTool?: string;
  summary?: Record<string, unknown>;
  exportRows: ExportRow[];
}): { markdown: string; generatedSections: string[]; rowTypeCounts: Record<string, number> } {
  const { grouped, rowTypeCounts } = groupExportRows(input.exportRows);
  const generatedSections: string[] = ["成果概览"];
  const lines = [
    `# ${input.title}`,
    "",
    "## 成果概览",
    `- 来源工具：${input.sourceTool ?? "未指定"}`,
    `- 摘要字段数：${input.summary ? Object.keys(input.summary).length : 0}`,
    `- 导出数据行数：${input.exportRows.length}`,
    `- 数据分组：${Object.entries(rowTypeCounts)
      .map(([rowType, count]) => `${rowType}:${count}`)
      .join("，")}`,
  ];

  if (input.summary) {
    generatedSections.push("质量摘要");
    lines.push("", "## 质量摘要");
    lines.push(...markdownTable(["字段", "值"], Object.entries(input.summary)));
  }

  if (input.exportRows.length > 0) {
    generatedSections.push("成果数据");
    lines.push("", "## 成果数据");
    for (const [rowType, rows] of grouped) {
      const headers = tableHeaders(rows);
      lines.push("", `### ${reportSectionName(rowType)}`);
      lines.push(...markdownTable(headers, rows.slice(0, 30).map((row) => headers.map((header) => row[header]))));
      if (rows.length > 30) lines.push(`- 其余 ${rows.length - 30} 行请查看配套 Excel 成果表。`);
    }
  }

  return { markdown: lines.join("\n"), generatedSections, rowTypeCounts };
}

function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|", 1);
}

function isMarkdownTableSeparator(line: string): boolean {
  if (!isMarkdownTableRow(line)) return false;
  return splitMarkdownTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function paragraphXml(text: string, options: { bold?: boolean; center?: boolean } = {}): string {
  const alignment = options.center ? '<w:jc w:val="center"/>' : "";
  const runProperties = options.bold ? "<w:rPr><w:b/></w:rPr>" : "";
  return `<w:p><w:pPr>${alignment}</w:pPr><w:r>${runProperties}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function tableCellXml(text: string, isHeader: boolean): string {
  const fill = isHeader ? '<w:shd w:fill="D9E2F3"/>' : "";
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/></w:tcBorders>${fill}</w:tcPr>${paragraphXml(text, { bold: isHeader, center: isHeader })}</w:tc>`;
}

function tableXml(rows: string[][]): string {
  const body = rows
    .map((row, rowIndex) => `<w:tr>${row.map((cell) => tableCellXml(cell, rowIndex === 0)).join("")}</w:tr>`)
    .join("");
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblLook w:firstRow="1" w:noHBand="0" w:noVBand="1"/></w:tblPr>${body}</w:tbl>`;
}

function md2paragraphs(markdown: string) {
  const lines = markdown.split("\n");
  const paragraphs: string[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!;
    const trimmed = line.trimEnd();

    if (
      isMarkdownTableRow(trimmed) &&
      lineIndex + 1 < lines.length &&
      isMarkdownTableSeparator(lines[lineIndex + 1] ?? "")
    ) {
      const tableRows = [splitMarkdownTableRow(trimmed)];
      lineIndex += 2;
      while (lineIndex < lines.length && isMarkdownTableRow(lines[lineIndex] ?? "")) {
        tableRows.push(splitMarkdownTableRow(lines[lineIndex]!));
        lineIndex += 1;
      }
      lineIndex -= 1;
      paragraphs.push(tableXml(tableRows));
      continue;
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      const level = trimmed.match(/^(#{1,6})/)?.[1]?.length ?? 1;
      const text = trimmed.replace(/^#{1,6}\s+/, "");
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`,
      );
      continue;
    }

    if (/^[-*]\s/.test(trimmed)) {
      const text = trimmed.replace(/^[-*]\s+/, "");
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`,
      );
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const text = trimmed.replace(/^\d+\.\s+/, "");
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`,
      );
      continue;
    }

    if (/^>\s/.test(trimmed)) {
      const text = trimmed.replace(/^>\s*/, "");
      paragraphs.push(
        `<w:p><w:pPr><w:ind w:left="720"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`,
      );
      continue;
    }

    if (/^---$/.test(trimmed) || /^\*\*\*$/.test(trimmed)) {
      paragraphs.push(
        `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>`,
      );
      continue;
    }

    if (trimmed === "") {
      paragraphs.push(`<w:p/>`);
      continue;
    }

    let runs = "";
    const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
    for (const part of parts) {
      if (part.startsWith("**") && part.endsWith("**")) {
        const inner = part.slice(2, -2);
        runs += `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(inner)}</w:t></w:r>`;
      } else if (part.length > 0) {
        runs += `<w:r><w:t xml:space="preserve">${esc(part)}</w:t></w:r>`;
      }
    }
    paragraphs.push(`<w:p>${runs}</w:p>`);
  }

  return paragraphs.join("\n");
}

function buildDocx(markdown: string, _title: string) {
  const body = md2paragraphs(markdown);

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
${body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="SimSun" w:hAnsi="SimSun" w:eastAsia="SimSun"/><w:sz w:val="21"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="SimHei" w:hAnsi="SimHei" w:eastAsia="SimHei"/><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="SimHei" w:hAnsi="SimHei" w:eastAsia="SimHei"/><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="SimHei" w:hAnsi="SimHei" w:eastAsia="SimHei"/><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/>
    <w:pPr><w:ind w:left="720"/></w:pPr>
  </w:style>
</w:styles>`;

  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

  const enc = (s: string) => new TextEncoder().encode(s);

  return zip([
    { name: "[Content_Types].xml", data: enc(contentTypes) },
    { name: "_rels/.rels", data: enc(rels) },
    { name: "word/_rels/document.xml.rels", data: enc(wordRels) },
    { name: "word/document.xml", data: enc(document) },
    { name: "word/styles.xml", data: enc(styles) },
    { name: "word/numbering.xml", data: enc(numbering) },
  ]);
}

export function registerReport(server: McpServer): void {
  server.tool(
    "report_export",
    "将 Markdown 或结构化工程成果导出为 .docx（Word）或 .md（Markdown）报告。writer 完成报告编制后，调用此工具导出正式成果文件，可直接提交给业主或监理。支持标题层级、加粗、列表、引用块、表格。",
    {
      markdown: z.string().optional().describe("Markdown 格式的报告正文"),
      sourceTool: z.string().optional().describe("结构化成果来源工具名，如 standard_query、deformation_rate"),
      summary: z.record(z.unknown()).optional().describe("工具返回的 summary 对象，将自动写入质量摘要"),
      exportRows: z
        .array(z.record(z.unknown()))
        .optional()
        .describe("工具返回的 export_rows 对象数组，将自动写入成果数据"),
      title: z.string().default("监测报告").describe("文档标题（用于文件名）"),
      format: z.enum(["docx", "markdown"]).optional().describe("输出格式；不传时根据 outputPath 扩展名推断，默认 docx"),
      outputPath: z.string().optional().describe("输出文件路径，支持 .docx 或 .md；默认为 ./[title].docx"),
    },
    async (args) => {
      const exportRows = args.exportRows ?? [];
      const hasStructuredInput = Boolean(args.summary) || exportRows.length > 0;
      if (!args.markdown && !hasStructuredInput) throw new Error("report_export 需要提供 markdown 或 summary/exportRows");

      const structured = hasStructuredInput
        ? buildStructuredReportMarkdown({
            title: args.title,
            sourceTool: args.sourceTool,
            summary: args.summary,
            exportRows,
          })
        : { markdown: "", generatedSections: [] as string[], rowTypeCounts: {} as Record<string, number> };
      const reportMarkdown = [args.markdown?.trim(), structured.markdown].filter(Boolean).join("\n\n");
      const requestedFormat = args.format ?? (args.outputPath?.toLowerCase().endsWith(".md") ? "markdown" : "docx");
      const dest =
        args.outputPath ??
        `./${args.title.replace(/[/\\:*?"<>|]/g, "_")}.${requestedFormat === "markdown" ? "md" : "docx"}`;

      const stats = {
        paragraphs: (reportMarkdown.match(/\n/g)?.length ?? 0) + 1,
        chars: reportMarkdown.length,
        headings: (reportMarkdown.match(/^#{1,6}\s/gm) ?? []).length,
        lists: (reportMarkdown.match(/^(?:[-*]\s|\d+\.\s)/gm) ?? []).length,
      };

      if (requestedFormat === "markdown") {
        await writeTextFile(dest, reportMarkdown);
        const sizeBytes = new TextEncoder().encode(reportMarkdown).length;
        return ok({
          output_path: dest,
          file_size_kb: Number((sizeBytes / 1024).toFixed(1)),
          format: "markdown",
          content_stats: stats,
          report_summary: {
            source_tool: args.sourceTool ?? null,
            summary_field_count: args.summary ? Object.keys(args.summary).length : 0,
            export_row_count: exportRows.length,
            row_type_counts: structured.rowTypeCounts,
            generated_sections: structured.generatedSections,
          },
          message: `✅ 报告已导出为 Markdown 文件：${dest}（${(sizeBytes / 1024).toFixed(1)} KB），包含 ${stats.headings} 个标题、${stats.paragraphs} 个段落。`,
        });
      }

      const docxBytes = buildDocx(reportMarkdown, args.title);
      await writeBinaryFile(dest, docxBytes);

      return ok({
        output_path: dest,
        file_size_kb: Number((docxBytes.length / 1024).toFixed(1)),
        format: "docx (Office Open XML)",
        content_stats: stats,
        report_summary: {
          source_tool: args.sourceTool ?? null,
          summary_field_count: args.summary ? Object.keys(args.summary).length : 0,
          export_row_count: exportRows.length,
          row_type_counts: structured.rowTypeCounts,
          generated_sections: structured.generatedSections,
        },
        message: `✅ 报告已导出为 Word 文件：${dest}（${(docxBytes.length / 1024).toFixed(1)} KB），包含 ${stats.headings} 个标题、${stats.paragraphs} 个段落。`,
      });
    },
  );
}
