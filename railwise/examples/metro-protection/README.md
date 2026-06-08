# 宁波地铁保护区监测样例

这个样例用于验证 Railwise 工程测量与监测工作区的完整链路：

1. `data-check` / `qa-inspector` 做原始数据首检。
2. `data-analyst` 调用 `survey_monitoring_csv` 和 `survey_deformation_rate` 做监测分析。
3. `data-analyst` 调用 `survey_chart_generator` 生成沉降趋势图。
4. `data-analyst` 调用 `survey_excel_export` 导出监测汇总、观测明细和质量摘要工作簿。
5. `writer` 生成日报正文。
6. `qa-reviewer` 做对外交付前终审。
7. `survey_report_export` 导出 Markdown 和 Word 报告。

样例数据为地铁保护区沉降监测，`JC2` 在第 5 期累计变化达到 36 mm，超过 30 mm 控制值。

验收成果应至少包括：监测分析 JSON 摘要、趋势图 SVG、Excel 成果表、Markdown 报告和 Word 报告。
