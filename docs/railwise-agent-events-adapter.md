# Railwise Agent Events 适配开发说明

更新时间：2026-06-08

## 目标

本次新增 `railwise-agent-events` 适配层，用于把 Railwise 现有运行事件转换成接近 AG-UI 的事件流结构。它不是一次性引入 CopilotKit 全量运行时，而是先把事件契约、工具调用、人工确认和结果卡片的统一渲染打通，后续再按需要接入 CopilotKit Headless UI 或 AG-UI runtime。

核心目标：

1. 保留 Railwise 当前 DeepSeek、MCP、工具注册表和本地会话体系。
2. 把 `IncomingEvent` 中的模型、工具、确认、状态和错误事件转换成统一 `RailwiseAgentEvent`。
3. 在工程分析工作台右侧提供“Agent 执行流”原型，统一渲染工具调用、人工确认和结果卡片。
4. 为后续接入 CopilotKit / AG-UI 留出清晰边界，不把桌面端直接绑到云端或重依赖运行时。

## 适配模块

模块位置：

- `desktop/src/railwise-agent-events.ts`
- 测试：`desktop/src/railwise-agent-events.test.ts`

主要导出：

- `RailwiseAgentEvent`
- `incomingEventToRailwiseAgentEvents(event)`
- `buildWorkbenchAgentFlowEvents(input)`

## 事件映射

| Railwise 事件 | Agent 事件 | 用途 |
| --- | --- | --- |
| `model.turn.started` | `RUN_STARTED` | 标记一次 Agent 回合开始，带模型和 runId。 |
| `user.message` | `TEXT_MESSAGE_CONTENT` | 用户消息进入统一消息流。 |
| `model.delta` | `TEXT_MESSAGE_CONTENT` | 模型内容、推理和状态片段进入统一消息流。 |
| `model.final` | `TEXT_MESSAGE_CONTENT` + `RUN_FINISHED` | 结束回合并保留最终文本。 |
| `tool.preparing` | `TOOL_CALL_START` | 工具调用开始。 |
| `tool.intent` | `TOOL_CALL_ARGS` | 工具参数卡片。 |
| `tool.result` | `TOOL_CALL_RESULT` + `STATE_DELTA` | 工具结果卡片和状态更新。 |
| `$confirm_required` | `HUMAN_INPUT_REQUIRED` | 命令或后台执行确认。 |
| `$path_access_required` | `HUMAN_INPUT_REQUIRED` | 文件路径访问确认。 |
| `$choice_required` | `HUMAN_INPUT_REQUIRED` | 多选或自定义输入。 |
| `$plan_required` | `HUMAN_INPUT_REQUIRED` | 执行计划确认。 |
| `$checkpoint_required` | `HUMAN_INPUT_REQUIRED` | 阶段成果确认。 |
| `$revision_required` | `HUMAN_INPUT_REQUIRED` | 修订确认。 |
| `status` / `warning` | `TEXT_MESSAGE_CONTENT` | 系统状态和告警。 |
| `$error` / `error` | `RUN_FINISHED` | 失败或可恢复异常。 |

## 工作台原型

UI 位置：

- `desktop/src/ui/agent-execution-flow.tsx`
- 样式：`desktop/src/styles.css`
- 接入点：`desktop/src/ui/engineering-workbench.tsx`
- 测试：`desktop/src/ui/agent-execution-flow.test.tsx`、`desktop/src/ui/engineering-workbench-ui.test.tsx`

当前工程分析工作台没有实时 Agent 流，所以原型使用工作台已有状态生成事件：

- 当前工具：`STATE_DELTA`
- 输入格式、来源和行数：`STATE_DELTA`
- 计算工具调用：`TOOL_CALL_START`
- 计算参数：`TOOL_CALL_ARGS`
- 字段/成果复核：`HUMAN_INPUT_REQUIRED`
- 计算摘要：`TOOL_CALL_RESULT`
- 专业引擎验收状态：`STATE_DELTA`
- 结束状态：`RUN_FINISHED`

这套 renderer 是统一入口，不区分“工具调用卡片”“人工确认卡片”“结果卡片”的业务来源。后续真实 Agent 事件只要符合 `RailwiseAgentEvent`，即可直接渲染。

## CopilotKit 融入建议

推荐路径是渐进接入：

1. 第一阶段：保持本地运行时，仅使用 `RailwiseAgentEvent` 作为内部 AG-UI 风格协议。
2. 第二阶段：把主聊天窗口、工程工作台和 MCP 调用流都接入同一个事件 store。
3. 第三阶段：试点 CopilotKit Headless hooks，用 Railwise 自己的 renderer 承接消息和工具卡片。
4. 第四阶段：按需评估 `@copilotkit/runtime`，但桌面端默认禁用遥测，并隔离 zod 3 / zod 4 依赖边界。

不建议当前直接替换 Railwise agent runtime。原因是 Railwise 已有本地会话、MCP、权限确认、工具注册和工程计算链，直接替换会带来较大迁移成本，也会影响桌面离线可用性。

## 下一步开发点

1. 新增全局 `AgentEventStore`，把聊天、MCP、工作台和子任务事件统一汇总。
2. 把 `applyIncoming` 中的 `IncomingEvent` 同步投影为 `RailwiseAgentEvent`，实现真实实时流。
3. 给 `HUMAN_INPUT_REQUIRED` 接入现有确认弹窗/按钮，让右侧卡片可以直接批准、拒绝或补充字段。
4. 给 `TOOL_CALL_RESULT` 增加结构化 payload，如表格、GeoJSON、DXF、Markdown 报告和工程成果包。
5. 为 CopilotKit 做一个小型 spike：只接 headless UI，不接 runtime，验证和 Railwise 本地事件流的兼容性。

## 验收标准

1. 新增事件适配单元测试覆盖模型、工具、人工确认和工作台事件。
2. 工程分析工作台右侧能稳定显示“Agent 执行流”。
3. 工具调用、人工确认、结果卡片均通过同一个 renderer 渲染。
4. 现有计算、导入、导出和专业引擎检测逻辑不被改动。
5. 桌面发布 workflow 在无 Apple 证书时不再因签名专属校验阻塞 macOS unsigned 包。
