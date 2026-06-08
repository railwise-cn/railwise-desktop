# RAILWISE Desktop 内业平差工作台 PRD 交付审计

更新时间：2026-06-07

## 范围边界

本审计只对应《RAILWISE Desktop（DeepSeek 版）内业平差工作台 PRD》v1.0。后续开发以轨道、交通、铁路、工程测量、监测和内业平差为主线，当前交付口径不扩大到非轨道交通测量监测方向。

工作台名称和可见入口统一为“内业平差工作台”。旧的泛化命名只允许作为内部历史类型名或隐藏交付流程遗留，不作为本 PRD 的用户验收口径。

## 当前完成度矩阵

| PRD 项 | 当前状态 | 证据/说明 | 下一步 |
| --- | --- | --- | --- |
| WB-01 | 已完成 | 侧栏入口文案为“内业平差工作台”，打开懒加载工作台组件。 | 保留入口回归测试。 |
| WB-02 | 已完成 | 工作台已提供“导线内业”“水准内业”“CP2/CP3 水准复测”流程。 | 用 PRD 验收用例做端到端覆盖。 |
| WB-03 | 已完成 | 顶部已有工程名称、标段、测站，并进入本地草稿与成果包。 | 在成果包验收中继续核对字段。 |
| WB-04 | 已完成 | localStorage 与 Tauri draft catalog 均有 UI 测试覆盖。 | 验证真实桌面数据目录写入。 |
| WB-05 | 部分完成 | 已有“云同步包”导出；尚不是自动云端同步闭环。 | 明确是同步包交付，或补桌面端/云端同步动作。 |
| TRV-01 | 已完成 | 已支持 JSON、GSI、DAT、CPⅢ导入路由和字段预检；GSI 导入到导线平差和 XLSX 导出已有 UI 验收链。 | 继续增加更多外业样本。 |
| TRV-02 | 已完成 | 2C、测回差、往返距差、闭合差等检查不阻塞计算。 | 继续补现场异常样例。 |
| TRV-03 | 已完成 | 起算方位、终边方位、方向中误差、测距误差、ppm、模型等可编辑。 | 增加参数变更后的成果差异断言。 |
| TRV-04 | 已完成 | `survey_traverse_adjust` 已注册，桌面 IPC 可调用，本地失败可前端回退；已补导线已知基准 fixture 校核坐标、闭合差、中误差和误差椭圆。 | 后续可追加现场实测样本。 |
| TRV-05 | 已完成 | 坐标表、中误差、误差椭圆、XLSX、科傻、平差易、清华山维、HO、OU1、DXF 已有覆盖；导入外业数据后导出 XLSX 的链路已补验收测试。 | 后续可追加现场实测样本。 |
| TRV-06 | 已完成 | 已有 AI 平差报告草稿、Markdown 导出、DeepSeek 提示词复制；工作台新增“生成 DeepSeek 报告”入口，Tauri 命令 `generate_indoor_adjustment_ai_report` 会调用 DeepSeek chat/completions，失败时保留本地草稿并显示降级证据。 | 发版/演示环境需配置有效 DeepSeek key 后做一次真实联网生成留证。 |
| LVL-01 | 已完成 | 水准测段录入、DAT/GSI/JSON 导入和字段修正已覆盖。 | 增加更多仪器样本。 |
| LVL-02 | 已完成 | 测段长度、高差、往返差、闭合差和等级限差已有检查。 | 补工程等级组合回归。 |
| LVL-03 | 已完成 | `survey_level_adjust` 已注册，支持长度/测站数定权；已补水准已知基准 fixture 校核高程、中误差和测段残差。 | 后续可追加现场实测样本。 |
| LVL-04 | 已完成 | 水准网 SVG、节点定位表和拖拽写回编辑器已有测试。 | 验证移动端/小窗口布局。 |
| LVL-05 | 已完成 | 高程表、中误差、XLSX、交换格式和 DXF 已有覆盖；录入测段到内业平差 XLSX 的 UI 链路已补验收测试，工作簿包含水准点高程成果表和水准网示意图成果。 | 后续可追加现场实测样本。 |
| LVL-06 | 已完成 | CP2/CP3 水准复测高差之差检查已接入水准流程。 | 补更多复测图表样例。 |
| DEF-01 | 已完成 | 变形分析、趋势、报告链路保留。 | 跑全量回归确认无回退。 |
| DEF-02 | 已完成 | 监测类工具已有多级阈值字段和预警统计；旧变形分析 CSV 若只给“累计控制值/速率控制值”，会按 PRD 派生 50% 预警线和 80% 报警线，并在结果指标中保留控制值、预警值、报警值证据。 | 持续用现场监测日报样本做回归。 |
| DEF-03 | 已完成 | 平差成果可设为变形初始值/转入变形分析。 | 补连续两期平差成果对比用例。 |
| IO-01 | 已完成 | 格式解析器支持 GSI、DAT、测量云 JSON、CPⅢ TPT/SUC。 | 增加现场坏数据批量样例。 |
| IO-02 | 已完成 | Excel、DXF、科傻、平差易、清华山维、HO、OU1 已有导出；结果区已提供 DOCX 按钮，内业平差成果使用“Railwise 内业平差报告 DOCX”专用过滤器导出 Word 文档。 | 后续如业主要求可增加模板化 Word 样式。 |
| IO-03 | 已完成 | 统一中间层可把 parser JSON/export_rows 导入桌面平差流程。 | 固化 schema 文档。 |

## 验收标准对照

| 验收项 | 当前判断 | 证据/缺口 |
| --- | --- | --- |
| 验收 1 | 已完成 | 已补 GSI 导线外业导入、字段预检、导线平差、误差椭圆、XLSX 导出和 workbook 内容核验；仍建议后续增加测量云 JSON 现场样本。 |
| 验收 2 | 已完成 | 水准录入、汇总检查、平差、高程成果、中误差、水准网示意图和拖拽定位已有 UI 覆盖。 |
| 验收 3 | 部分完成 | 已补 UI smoke 和 `npm run verify:indoor-offline-smoke`：`run_survey_adjustment` IPC 失败时，导线/水准仍可本地计算、保存工程草稿并导出 XLSX；实际 `.app` 包资源检查需发版时传 `--app /path/Railwise.app --require-app` 执行。 |
| 验收 4 | 已完成 | 变形相关链路保留；已补 PRD DEF-02 控制值模式回归：累计控制值/速率控制值自动派生 50% 预警线、80% 报警线，并输出“正常/预警/报警”状态。每次发版前仍需跑核心 workbench 全量测试。 |
| 验收 5 | 已完成 | `survey_traverse_adjust` 与 `survey_level_adjust` 有单测和桌面 runner 测试；已新增 `tests/fixtures/engineering/indoor-traverse-known-baseline.json`、`indoor-level-known-baseline.json`，并用 `tests/survey-mcp-tools.test.ts` 校核坐标/高程/中误差/残差。 |

## 下一步开发顺序

1. 发版时运行真实 `.app` 包断网 smoke：`npm run verify:indoor-offline-smoke -- --app /path/Railwise.app --require-app --out evidence.json`，归档证据 JSON。
2. 配置有效 DeepSeek key 后运行一次真实联网 AI 平差报告生成，归档报告生成证据。
3. 收口同步能力：若本期只交付“云同步包”，在 UI 和文档明确；若需要自动同步，补连接状态、重试、冲突处理和同步日志。
4. 如后续拿到现场实测数据，追加到 `tests/fixtures/engineering/` 作为更强基准样本。

## 常用验证命令

```bash
npm run test -- tests/survey-mcp-tools.test.ts -t "PRD indoor adjustment|survey_traverse_adjust|survey_level_adjust|PRD IO-01" --pool=forks --maxWorkers=1 --testTimeout=60000 --hookTimeout=60000
npm run verify:indoor-offline-smoke -- --json
npm run verify:indoor-offline-smoke -- --app /path/Railwise.app --require-app --out evidence.json
npm run test -- desktop/src/ui/engineering-workbench-ui.test.tsx -t "DeepSeek AI adjustment report|falls back to the local PRD AI adjustment report" --pool=forks --maxWorkers=1 --testTimeout=120000 --hookTimeout=120000
npm run test -- desktop/src/ui/engineering-workbench-ui.test.tsx -t "exports a PRD indoor adjustment DOCX report" --pool=forks --maxWorkers=1 --testTimeout=120000 --hookTimeout=120000
npm run test -- desktop/src/ui/engineering-workbench.test.ts -t "derives PRD DEF-02 deformation warning" --pool=forks --maxWorkers=1 --testTimeout=120000 --hookTimeout=120000
npm run test -- desktop/src/ui/engineering-workbench.test.ts --pool=forks --maxWorkers=1 --testTimeout=120000 --hookTimeout=120000
npm run test -- desktop/src/ui/engineering-workbench-ui.test.tsx --pool=forks --maxWorkers=1 --testTimeout=120000 --hookTimeout=120000
npm run build
```
