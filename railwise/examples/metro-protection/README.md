# 宁波地铁保护区监测样例

这个样例用于验证 Railwise 工程测绘工作区的完整链路：

1. `data-check` / `qa-inspector` 做原始数据首检。
2. `data-analyst` 调用 `survey_monitoring_csv` 和 `survey_deformation_rate` 做监测分析。
3. `writer` 生成日报正文。
4. `qa-reviewer` 做对外交付前终审。
5. `survey_report_export` 导出正式 Word 文件。

样例数据为地铁保护区沉降监测，`JC2` 在第 5 期累计变化达到 36 mm，超过 30 mm 控制值。
