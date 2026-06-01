#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCalculator } from "./tools/calculator.js";
import { registerMonitoring } from "./tools/monitoring.js";
import { registerFormatParser } from "./tools/format-parser.js";
import { registerDeformation } from "./tools/deformation.js";
import { registerChart } from "./tools/chart.js";
import { registerStandard } from "./tools/standard.js";
import { registerReport } from "./tools/report.js";
import { registerExcel } from "./tools/excel.js";
import { registerEngineering } from "./tools/engineering.js";

const server = new McpServer({
  name: "survey",
  version: "1.0.0",
});

// 工程测绘算法工具集（Railwise 挂载后工具名前缀为 survey_）
registerCalculator(server); // survey_calculator_* —— 限差校核与严密平差
registerMonitoring(server); // survey_monitoring_csv —— 自动化监测数据清洗
registerFormatParser(server); // survey_format_parser —— GSI/DAT 外业文件解析
registerDeformation(server); // survey_deformation_rate / _comparison —— 变形速率与趋势
registerChart(server); // survey_chart_generator —— SVG 趋势图
registerStandard(server); // survey_standard_query / _list —— 规范条文检索
registerReport(server); // survey_report_export —— Markdown→Word
registerExcel(server); // survey_excel_export / _monitoring_table —— Excel 导出
registerEngineering(server); // survey_control_network / coord_transform / 桩位放样等工程计算

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr 不污染 stdio JSON-RPC 通道
  process.stderr.write("[survey-mcp] started, tools registered.\n");
}

main().catch((err) => {
  process.stderr.write(`[survey-mcp] fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
