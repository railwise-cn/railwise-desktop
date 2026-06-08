# RAILWISE 改装 → DeepSeek-Reasonix 迁移方案

> 目标：把 `RAILWISE-CLI`（基于 opencode 的改装）里的多智能体工程班子、工作流命令、技能库、工程算法工具，
> 移植到 `DeepSeek-Reasonix` 上实现。
>
> 已确定的三条前提：
> 1. **工具走独立 MCP Server**，不改 Railwise 本体源码。
> 2. **模型全部统一到 DeepSeek 两档**（`flash` / `pro`），放弃多厂商分配。
> 3. 本文档为方案文档，含目录结构与可直接照抄的示例。

---

## 1. 两个项目的能力映射总表

| 你的改装产物 | RAILWISE 位置 | Railwise 等价物 | 迁移难度 |
|---|---|---|---|
| 技能库（Claude 格式 SKILL.md） | `.railwise/skill/*/` | `.claude/skills/*/SKILL.md` 或 `.reasonix/skills/` | ⭐ 直接复制 |
| 多智能体角色 | `.railwise/agent/*.md` | `runAs: subagent` 的 skill | ⭐⭐ 改 frontmatter |
| 自定义 Slash 命令 | `.railwise/command/*.md` | `inline` skill（`/skill <名>` 调用） | ⭐⭐ 改写 |
| 工程算法工具 | `.railwise/tool/*.ts` | 独立 **MCP Server** | ⭐⭐⭐ 重新封装 |
| 多厂商模型分配 | agent frontmatter `model:` | DeepSeek `flash`/`pro` 两档 | — 降维取舍 |

---

## 2. 资产清点（需要迁移的内容）

### 2.1 工程智能体（保留 7 个核心，丢弃 4 个 opencode 残留）

**保留并迁移**（你的工程班子）：

| 角色 | 原 Role Name | 建议档位 | 是否子代理 |
|---|---|---|---|
| 项目总控 | `chief_manager` | 主 system prompt（不是子代理） | 主控 |
| 技术方案架构师 | `solution_architect` | pro | subagent |
| 数据平差分析 | `data_analyst` | pro | subagent |
| 报告编制 | `technical_writer` | flash | subagent |
| 规范终审质检 | `qa_reviewer` | pro | subagent |
| 外业数据首检 | `qa_inspector` | flash | subagent |
| 商务合约 | `commercial_specialist` | flash | subagent |

**丢弃**（opencode 自带的 GitHub/翻译模板，与工程业务无关）：
`docs.md`、`duplicate-pr.md`、`translator.md`、`triage.md`。

### 2.2 工作流命令 → 全部转 skill

`ai-deps`、`bid-prepare`、`commit`、`daily-report`、`data-check`、`emergency-response`、
`issues`、`learn`、`monthly-report`、`payment-reminder`、`rmslop`、`safety-check`、
`spellcheck`、`trend-analysis`。

> 工程相关的优先迁：`bid-prepare`、`daily-report`、`monthly-report`、`data-check`、
> `trend-analysis`、`safety-check`、`emergency-response`、`payment-reminder`。
> `commit` / `issues` / `learn` / `rmslop` / `spellcheck` 视需要。

### 2.3 技能库 → 直接复制

`bidding-knowledge`、`monitoring-design`、`report-writing`、`standard-reference`、
`data-analysis`、`docx-generation`、`excel-operations`、`humanizer`、
`canvas-design`、`frontend-design`、`bun-file-io`。

> 注意：`bun-file-io` 依赖 Bun 运行时语义，迁到 Node 环境的 Railwise 时需复核内容。

### 2.4 工程算法工具 → 打包成一个 MCP Server

真正有价值、必须 MCP 化的纯计算工具（不含 `.test.ts` 与 GitHub 残留）：

| 工具 | 用途 |
|---|---|
| `control_network` | 控制网最小二乘平差 |
| `cpiii_adjustment` | CPIII 平差 |
| `coord_transform` | 坐标转换 |
| `deformation_rate` | 变形速率与趋势分析 |
| `inclinometer` | 测斜数据处理 |
| `cross_section` | 断面分析 |
| `axial_force` | 支撑轴力 |
| `water_level` | 静力水准 |
| `survey_calculator` / `distance_calculator` / `angle_convert` | 测量基础计算 |
| `line_stakeout` | 线路放样复核 |
| `shield_guidance` | 盾构导向 |
| `standard_query` | 规范条文查询 |
| `monitoring_csv` / `format_parser` | 数据解析 |
| `chart_generator` / `excel_export` / `report_export` | 图表与导出 |

> 丢弃：`github-pr-search`、`github-triage`（opencode 残留）。

---

## 3. 目标目录结构

```
<你的工程项目根>/
├── .reasonix/
│   ├── config.json                 # 挂载 MCP server + 模型默认档
│   └── skills/                      # Railwise 原生 skill（命令转过来的）
│       ├── chief-orchestration.md   # 项目总控（inline，钉入主流程）
│       ├── architect.md             # runAs: subagent, model: pro
│       ├── data-analyst.md          # runAs: subagent, model: pro
│       ├── writer.md                # runAs: subagent, model: flash
│       ├── qa-reviewer.md           # runAs: subagent, model: pro
│       ├── qa-inspector.md          # runAs: subagent, model: flash
│       ├── commercial.md            # runAs: subagent, model: flash
│       ├── bid-prepare.md           # 命令 → inline skill
│       ├── daily-report.md
│       ├── monthly-report.md
│       ├── trend-analysis.md
│       ├── safety-check.md
│       └── ...
│   └── REASONIX.md                  # 项目级长期记忆（= 原 AGENTS.md 角色总览）
├── .claude/
│   └── skills/                      # 直接复制过来的 Claude 格式技能库
│       ├── bidding-knowledge/SKILL.md
│       ├── monitoring-design/SKILL.md
│       ├── report-writing/SKILL.md
│       └── standard-reference/SKILL.md
└── ...

<独立仓库> railwise-survey-mcp/        # 新建：工程算法 MCP Server
├── package.json                      # @modelcontextprotocol/sdk + zod
├── tsconfig.json
└── src/
    ├── index.ts                      # MCP server 入口，注册所有工具
    └── tools/                        # 从 .railwise/tool/*.ts 抽出的纯算法
        ├── control-network.ts
        ├── deformation-rate.ts
        └── ...
```

---

## 4. 具体迁移步骤

### 步骤 A：技能库直接复制（最快，先做这个验证链路）

Railwise 原生读取 `.claude/skills/<name>/SKILL.md`（见源码 `src/skills.ts`）。

```bash
# 在工程项目根目录下
mkdir -p .claude/skills
cp -R /path/to/RAILWISE-CLI-main/.railwise/skill/* .claude/skills/
```

复制后在 Railwise 里 `/skill list` 应能看到它们。**只需确认每个 SKILL.md 的
frontmatter 含非空 `description:`**（Railwise 用它建索引，缺了会被拒绝加载）。

### 步骤 B：智能体角色 → subagent skill

把 `.railwise/agent/<role>.md` 的正文（System Prompt）原样搬进 Railwise skill，
只改 frontmatter。

**原 RAILWISE 格式**（`qa_reviewer.md`）：
```yaml
---
description: 总工办质检员……拥有最高否决权
model: kimi/kimi-k2.5      # ← 多厂商，Railwise 不支持
color: "#E74C3C"           # ← Railwise 无此字段
---
你是一位拥有20年从业经验的资深轨道交通、铁路、工程测量与监测质检总工……
```

**转成 Railwise skill**（`.reasonix/skills/qa-reviewer.md`）：
```yaml
---
description: 总工办质检员，对工程方案/报告/标书做规范合规性终审，拥有最高否决权。在任何对外交付前必须调用。
runAs: subagent
model: pro
allowed-tools: read_file, search_files, search_content, standard_query
---
你是一位拥有20年从业经验的资深轨道交通、铁路、工程测量与监测质检总工。你的职责是对所有提交给你的
工程测量方案、监测报告、投标技术文件进行最严苛的合规性与质量审查……

（System Prompt 正文从原 agent .md 原样粘贴）
```

字段映射规则：
- `model: kimi/...` / `model: anthropic/...` → 统一改成 `model: flash` 或 `model: pro`
- `color:` → 删除（Railwise 不支持）
- 新增 `runAs: subagent` → 让它作为隔离子代理被调度
- 新增 `allowed-tools:` → 限定该角色能用的工具（含 MCP 工具名，见步骤 D）

### 步骤 C：项目总控（chief_manager）→ 主 system prompt + 调度说明

`chief_manager` 是"大脑"，不该做成子代理（子代理是隔离的、只回最终答案）。两种实现：

1. **写入 `REASONIX.md`**（项目级记忆，会钉进前缀）—— 把 chief 的 SOP、各子代理职责、
   强制工作流（"编制类任务必须经 qa-reviewer 终审"）写进去，让主循环始终遵守。
2. 让主模型用 `run_skill` / `spawn_subagent` 调起各角色 skill。

`REASONIX.md` 里加入类似：
```markdown
## 工程项目调度 SOP（Chief 规则）

你是项目总负责人。绝不自己编造技术数据/平差结果/规范条文，必须委派：
- 方案 → run_skill architect
- 数据 → run_skill data-analyst
- 报告 → run_skill writer
- 外业原始数据 → 先 run_skill qa-inspector
- 任何对外交付前 → 必须 run_skill qa-reviewer 终审，未过不得交付

开始执行前先输出【任务拆解与执行计划 WBS】。
```

### 步骤 D：工程算法工具 → 独立 MCP Server（核心工作）

RAILWISE 工具用的是 opencode 的 `tool({ description, args, execute })` API，
其中 `tool.schema` 本质是 zod。迁到标准 MCP SDK 几乎是机械转换：**算法主体不动，
只换外壳**。

**1) 新建工程，安装依赖**
```bash
mkdir railwise-survey-mcp && cd railwise-survey-mcp
npm init -y
npm i @modelcontextprotocol/sdk zod
npm i -D typescript tsx @types/node
```

**2) 转换单个工具**（以 `deformation_rate` 为例）

原 RAILWISE（`.railwise/tool/deformation_rate.ts`）：
```ts
import { tool } from "nb-railwise/tool"
export const deformation_rate = tool({
  description: "变形速率计算与趋势分析……",
  args: {
    pointId: tool.schema.string().describe("监测点编号"),
    data: tool.schema.array(tool.schema.object({
      date: tool.schema.string(), value: tool.schema.number(),
    })).min(2),
    alertThreshold: tool.schema.number().positive().optional(),
    predictionDays: tool.schema.number().int().positive().default(7),
  },
  async execute(args) { /* …算法主体… */ return result },
})
```

转成 MCP（`src/tools/deformation-rate.ts`）—— **args schema 和 execute 主体直接复用**：
```ts
import { z } from "zod";
export const deformationRateSchema = {
  pointId: z.string().describe("监测点编号"),
  data: z.array(z.object({
    date: z.string(), value: z.number(),
  })).min(2),
  alertThreshold: z.number().positive().optional(),
  predictionDays: z.number().int().positive().default(7),
};
// execute 主体从原文件原样搬过来
export async function runDeformationRate(args: { /* 推断类型 */ }) {
  /* …把原 execute 的算法逻辑整段复制… */
}
```

**3) 注册到 MCP server**（`src/index.ts`）
```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { deformationRateSchema, runDeformationRate } from "./tools/deformation-rate.js";
// …import 其余工具

const server = new McpServer({ name: "railwise-survey", version: "1.0.0" });

server.tool(
  "deformation_rate",
  "变形速率计算与趋势分析。根据监测点时间-变形量序列，计算各期速率、累计变形量并做线性回归趋势预测。",
  deformationRateSchema,
  async (args) => {
    const result = await runDeformationRate(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);
// …注册其余工具

await server.connect(new StdioServerTransport());
```

> 转换要点：
> - `tool.schema.X` → `z.X`（几乎一一对应）
> - `execute(args)` 返回值用 `{ content: [{ type: "text", text: ... }] }` 包裹
> - 纯计算逻辑（矩阵库、平差、回归）**完全不用改**
> - `chart_generator` / `excel_export` 等若依赖 Bun 专有 API，需换成 Node 等价实现

**4) 在 Railwise 挂载**（`.reasonix/config.json`）
```jsonc
{
  "model": "flash",
  "mcpServers": {
    "survey": {
      "command": "npx",
      "args": ["-y", "tsx", "/abs/path/railwise-survey-mcp/src/index.ts"]
    }
  }
}
```
挂载后工具名会带 server 前缀，形如 `survey_deformation_rate`，
在 skill 的 `allowed-tools` 里就用这个全名。

### 步骤 E：命令 → inline skill

`.railwise/command/*.md`（带 `$ARGUMENTS`）转成 Railwise inline skill，调用方式变成
`/skill <名> <参数>`。

原 `daily-report.md`：
```yaml
---
description: 快速生成监测日报/周报……
model: anthropic/claude-sonnet-4-20250514
---
你是睿威智测的工程报告助手……
$ARGUMENTS
```

转成 `.reasonix/skills/daily-report.md`：
```yaml
---
description: 快速生成监测日报/周报。输入数据文件路径或粘贴原始数据即可。
---
你是睿威智测（Railwise）的工程报告助手。用户将提供监测数据，按以下流程完成报告编制：
1. 有 CSV/TXT 路径 → 调用 survey_monitoring_csv 处理
2. 直接粘贴表格 → 用 survey_deformation_rate 分析趋势
3. run_skill writer 按标准日报/周报格式撰写
4. 输出符合工程规范的 Markdown 报告
```
> Railwise skill body 末尾不需要 `$ARGUMENTS` 占位符——用户调用时跟在 `/skill` 后的
> 文本会自动作为输入。

---

## 5. 模型档位重新分配（多厂商 → DeepSeek 两档）

| 角色/场景 | 原模型 | 新档位 | 理由 |
|---|---|---|---|
| qa_reviewer / qa_inspector | kimi | `pro` / `flash` | 终审需强推理；首检偏规则可用 flash |
| data_analyst | deepseek-reasoner | `pro` | 平差/趋势需推理 |
| solution_architect | claude-sonnet | `pro` | 方案设计需强推理 |
| technical_writer | claude-sonnet | `flash` | 套模板排版，flash 足够 |
| commercial | glm | `flash` | 商务文本生成 |
| chief（主控） | claude | `auto`（默认） | 难 turn 自动升 pro |

> Railwise 的 `auto` 预设本身就是 flash 起步、难任务自动升 pro，
> 与你"省钱、能挂着跑"的诉求天然契合。

---

## 6. 迁移执行清单（建议顺序）

- [ ] **A. 复制技能库** 到 `.claude/skills/`，`/skill list` 验证链路通
- [ ] **B. 搭 MCP Server 骨架**，先迁 1~2 个工具（如 `deformation_rate`、`control_network`）跑通
- [ ] **C. 批量迁移其余算法工具**，逐个核对 zod schema 与 Bun 依赖
- [ ] **D. 7 个 agent → subagent skill**，改 frontmatter + 重设档位
- [ ] **E. chief 规则写入 `REASONIX.md`**
- [ ] **F. 工作流命令 → inline skill**
- [ ] **G. 端到端验证**：跑一遍"准备地铁监测投标材料"的完整 SOP

---

## 7. 已知风险 / 取舍

1. **多厂商分配丢失**：每个 agent 用不同家模型的能力没有了，全统一 DeepSeek。已确认接受。
2. **子代理是隔离循环**：只回传最终答案，不能像 opencode 那样灵活共享上下文；
   复杂跨角色协作要靠 chief 在主循环里串联。
3. **Bun → Node 依赖差异**：`bun-file-io`、以及用 Bun API 的导出类工具需改写。
4. **工具调用前缀**：MCP 工具名带 server 前缀（`survey_xxx`），skill 的 `allowed-tools`
   和 prompt 里要用全名。
5. **无可视化 color / 自定义 slash 命令**：是 UI 层能力，Railwise 不提供，属可接受损失。
```
