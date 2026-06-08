# 工程专业引擎部署约定

更新时间：2026-06-04

工程分析工作台通过白名单调用 PROJ、GDAL/OGR、PDAL 命令行工具。运行时只接受固定二进制名：`projinfo`、`cct`、`ogrinfo`、`ogr2ogr`、`pdal`，不接受前端传入任意路径。

## 发现顺序

1. 单工具环境变量：`RAILWISE_ENGINE_PROJINFO`、`RAILWISE_ENGINE_CCT`、`RAILWISE_ENGINE_OGRINFO`、`RAILWISE_ENGINE_OGR2OGR`、`RAILWISE_ENGINE_PDAL`。
2. 统一目录环境变量：`RAILWISE_ENGINE_DIR`，目录下放置对应二进制名。
3. 应用可执行文件同级目录，用于 Tauri `externalBin` sidecar 场景。
4. 应用可执行文件同级 `engines/` 或 `bin/` 目录。
5. macOS bundle 资源目录：`Contents/Resources/engines/`、`Contents/Resources/bin/`、`Contents/Resources/`。
6. 系统 `PATH`。

## 打包建议

Tauri v2 支持通过 `bundle.externalBin` 嵌入外部二进制，也支持通过 `bundle.resources` 嵌入额外文件。工程引擎体积通常较大，建议按平台单独打包：

- 开发/内测：优先使用 `RAILWISE_ENGINE_DIR=/path/to/engines`，便于替换版本。
- macOS App：可把工具放在 `Contents/Resources/engines/`，也可按 Tauri sidecar 规则放在主可执行文件同级目录。
- Windows/Linux：可使用统一 `engines/` 目录或 Tauri sidecar 目录；如果工具依赖动态库，需要一起放入可解析的运行目录。

## 现场验收

仓库提供独立验证入口：

```bash
npm run verify:engineering-engines
```

该命令会按桌面应用同一套环境变量约定检查 `projinfo`、`cct`、`ogrinfo`、`ogr2ogr`、`pdal`，并补充系统 `PATH` 检测，对 PROJ/GDAL/PDAL 的基础命令做 smoke test。默认只输出诊断结果，不因缺失引擎失败；打包、内测或客户现场需要强制验收时使用：

```bash
RAILWISE_ENGINE_DIR=/path/to/engines npm run verify:engineering-engines -- --require-engines
```

CI 或自动化系统可读取 JSON：

```bash
npm run verify:engineering-engines -- --json --require-engines
```

现场交付、内测打包或客户电脑验收时，可同时生成可归档三件套：

```bash
RAILWISE_ENGINE_DIR=/path/to/engines npm run verify:engineering-engines -- --require-engines --report-dir ./engine-acceptance
```

输出目录会包含：

- `engineering-engine-acceptance.md`：人工可读的现场验收报告，记录结论、引擎目录、汇总和逐二进制烟测结果。
- `engineering-engine-acceptance.csv`：台账/外部系统可导入明细，字段包含 `binary`、`workflow`、`status`、`path`、`exit_code`、`stdout`、`stderr`。
- `engineering-engine-acceptance.json`：机器可读 `railwise.engineeringEngines.acceptance.v1` 报告，包含 `acceptanceStatus=accepted/blocked`、summary、逐项结果和本次报告文件清单。

如果启用 `--require-engines` 且存在缺失或失败项，命令会返回非 0，但仍会先写入验收包，便于现场把 blocked 报告直接作为整改依据。

## 归档 ZIP 抽检

批处理面板导出的“归档 ZIP”可用独立脚本复核，不依赖桌面应用启动：

```bash
npm run verify:engineering-archive -- /path/to/工程批次-归档交付包.zip
```

该命令会解析 ZIP 中央目录和本地文件头，检查：

- `manifest.json`、`checksums.csv`、`batch/external-upload-manifest.json`、`batch/external-upload-manifest.csv` 等必备入口是否存在。
- `manifest.json` 是否为 `railwise.engineering.batch.archiveManifest.v1`，并且记录的文件路径、字节数和 CRC32 与 ZIP 实际内容一致。
- `checksums.csv` 中每个文件的字节数、CRC32 和 FNV 指纹是否与 ZIP 实际内容一致。
- `railwise.engineering.batch.externalUploadManifest.v1` 是否包含外部系统入库字段、归档目录名、压缩包名、目录规则、文件清单和归档抽检签发文件。
- `railwise.engineering.batch.externalSystemUploadAdapters.v1` 是否包含业主档案管理系统、监理资料台账和通用文档管理系统三类字段适配，并且 `external-system-upload-rows.csv` 可提供规范化上传行；签发 HTML/JSON/CSV 也会作为“归档抽检签发记录”展开为 file 级上传行。
- `railwise.engineering.batch.archiveInspectionReport.v1` 是否包含必备文件检查、文件校验摘要、外部系统适配三类章节，并且抽检报告本身也进入最终校验清单。
- `railwise.engineering.batch.archiveInspectionSignoff.v1` 是否包含签发状态、签发人、批注行、签发指纹，并且 `archiveInspectionFingerprint` 与抽检报告一致。
- `railwise.engineering.batch.archiveReleaseRecord.v1` 是否包含发布版本、发布状态、发布构件清单和发布指纹，并且外部上传 manifest、抽检报告、抽检签发记录指纹与当前 ZIP 内文件一致。

归档 ZIP 内与外部系统对接相关的文件：

- `batch/external-upload-manifest.json`：Railwise 标准入库字段、目录规则、文件清单和文件校验摘要。
- `batch/external-upload-manifest.csv`：Railwise 标准字段的轻量 CSV，可直接给表单或低代码平台读取。
- `batch/external-system-upload-adapters.json`：三类外部系统的字段映射配置，包含目标系统字段、来源字段、必填标记和说明。
- `batch/external-system-upload-rows.csv`：按 `adapter_id / target_system / record_type / file_path / external_field_key / value` 展开的规范化上传行，适合接口网关、ETL 或人工台账导入。
- `batch/archive-release-record.json`：机器可读的归档包版本发布记录，绑定批次、审计、外部上传、抽检报告和签发指纹。
- `batch/archive-release-record.csv`：台账友好的发布构件清单，可用于版本移交、升级审批和交付包回溯。
- `batch/archive-release-portfolio-dashboard.json`：可选的多版本归档看板，绑定版本时间线、外部回执趋势和看板指纹。
- `batch/archive-release-portfolio-timeline.csv`：可选的多版本发布时间线台账。
- `batch/archive-release-portfolio-adapter-trend.csv`：可选的多版本外部系统回执趋势台账。
- `batch/archive-release-cross-project-baseline.md` / `.csv` / `.json`：可选的跨项目发布基线对比成果，用于总包、监理或业主横向审计多个项目/标段。
- `audit/archive-inspection-report.html`：给项目经理、监理或业主查看/打印的归档包抽检报告。
- `audit/archive-inspection-report.json`：机器可读的抽检报告，记录必备文件状态、校验摘要、外部系统适配摘要和报告指纹。
- `audit/archive-inspection-signoff.html`：可打印签署的归档抽检签发记录，绑定抽检报告指纹。
- `audit/archive-inspection-signoff.json`：机器可读的签发记录，记录签发状态、批注意见、责任人、期限和签发指纹。
- `audit/archive-inspection-signoff.csv`：台账友好的批注意见表，可给资料员或外部系统导入整改任务。

批处理操作区也提供“抽检 HTML”和“抽检 JSON”独立导出入口，可在正式生成归档 ZIP 前先做人工预审、监理抽检或外部档案系统预入库校验。抽检报告确认后，可继续使用“签发 HTML / 签发 JSON / 签发 CSV”导出 `railwise.engineering.batch.archiveInspectionSignoff.v1`，该记录会绑定当前 `archiveInspectionFingerprint`，写入签发人、签发结论、签发日期、批注意见、责任人、整改期限、待办/阻断批注统计和签发指纹；再使用“发布 JSON / 发布 CSV”导出 `railwise.engineering.batch.archiveReleaseRecord.v1`，记录默认 `AR-YYYYMMDD-批次指纹` 发布版本、发布状态、发布人、上一版发布指纹和发布构件清单。正式“归档 ZIP”也会写入同一套签发 HTML/JSON/CSV 和发布记录 JSON/CSV，并把三份签发文件同步纳入 `external-upload-manifest.json` 与 `external-system-upload-rows.csv`，由 `verify:engineering-archive` 校验 schema、签发指纹、CSV 批注行、抽检指纹绑定、发布记录指纹绑定和外部上传覆盖情况。后续换版时，使用“导入旧发布”读取上一版 `archive-release-record.json`，工作台会生成 `railwise.engineering.batch.archiveReleaseComparison.v1` 和 `railwise.engineering.batch.archiveReleaseExternalSystemSyncUpdate.v1`；“版本对比 JSON/CSV”用于审批新增、删除、变化和未变发布构件，“同步 JSON/CSV”用于把当前版本号、上一版本号、发布指纹、发布状态和变化构件数回写业主档案系统、监理资料台账、通用 DMS 或项目自定义 adapter。外部系统完成版本同步后，应至少返回 `adapter_id`、`external_record_id`、`receipt_status`、`receipt_message` 和 `received_at`；工作台使用“导入同步回执”生成 `railwise.engineering.batch.archiveReleaseExternalSystemSyncReceiptReconciliation.v1`，并通过“同步回执 JSON/CSV”归档 accepted、rejected、pending、skipped、missing_receipt、unmatched_receipt 与需跟踪处理动作。多个历史发布记录和同步回执 JSON 可通过“导入多版本”混合导入，生成 `railwise.engineering.batch.archiveReleasePortfolioDashboard.v1`；“看板 JSON / 时间线 CSV / 回执趋势 CSV”用于审计跨版本变化、外部系统回执趋势和未闭环版本。随后可设置 `SLA h` 并生成 `railwise.engineering.batch.archiveReleaseTrendSlaReport.v1`；“趋势 HTML / 趋势 JSON / 趋势 CSV / SLA CSV”分别提供 SVG 趋势图、机器可读审计、版本趋势台账和逐 adapter 超期明细。若不同外部系统有不同响应时限，可用“保存 SLA / 导入 SLA / 导出 SLA”维护 `railwise.engineering.batch.archiveReleaseSlaRuleTemplate.v1`，模板行包含 `adapterId`、`targetSystem`、`slaHours`、`escalationRole`、`overdueSeverity` 和 `actionTemplate`，趋势 SLA 报告会按 adapter 优先套用模板规则。生成趋势 SLA 报告后，可继续使用“SLA 整改 / 整改 MD / 整改 JSON / 整改 CSV / 销项模板”生成 `railwise.engineering.batch.archiveReleaseSlaRectificationLedger.v1`，把超期 adapter 回执转成带截止时间、严重级别、升级角色和外部记录号的整改台账，并给资料员或外部系统提供销项回填 CSV 模板。整改处理完成后，使用“导入销项”读取 CSV/TSV/JSON 回执，字段可包含 `issue_id`、`release_version`、`adapter_id`、`closure_status`、`closed_at`、`closed_by`、`closure_note` 和 `external_record_id`；系统生成 `railwise.engineering.batch.archiveReleaseSlaRectificationClosureUpdate.v1`，并可用“销项 MD / 销项 CSV / 销项 JSON”导出闭环结果、未回执/未匹配统计和更新后的 SLA 整改台账指纹。日常巡检时可继续使用“SLA 提醒”生成 `railwise.engineering.batch.archiveReleaseSlaAuditReminder.v1`，自动把未闭环整改、超期整改、缺销项回执和未匹配销项回执分成 critical/warning/notice；“提醒 MD / 提醒 CSV / 提醒 JSON”可移交给资料负责人、外部系统管理员或项目经理作为每日审计清单。

若需要把一次性审计清单转成可执行排班，可继续使用“定时策略”生成 `railwise.engineering.batch.archiveReleaseSlaReminderSchedule.v1`；“策略 MD / 策略 CSV / 策略 JSON”会记录巡检天数、工作日/周末策略、重复间隔、渠道、升级窗口、发生时间和来源提醒指纹，便于接项目群、邮件、待办系统或外部接口网关。

不同项目固定巡检节奏不一致时，先用“导出策略”生成 `railwise.engineering.batch.archiveReleaseSlaReminderScheduleTemplate.v1`，在 JSON 中调整策略名称、时区、巡检天数、每日发送小时、周末策略、每条提醒最大次数、分级重复间隔和渠道后，通过“导入策略”保存；“保存策略”会把当前策略模板写入本机配置。后续“定时策略”会自动使用保存模板，并在 `archiveReleaseSlaReminderSchedule.scheduleTemplateFingerprint` 中记录模板版本。

当定时提醒、通知审计、HTTP 发送、失败重放和通知回执更新需要作为正式资料移交时，使用“提醒入库”生成 `railwise.engineering.batch.archiveReleaseSlaReminderArchiveIngest.v1`；“入库 MD / 入库 CSV / 入库 JSON”会列出每份提醒证据的文件路径、资料角色、schema、业务指纹、入库状态、责任人、截止时间和处理动作。正式“归档 ZIP”会把 `batch/archive-release-sla-reminder-ingest.md/csv/json` 写入 manifest、校验清单、外部上传 manifest、外部系统上传行和发布记录；若只需要把这一组三份提醒入库证据交给外部档案系统，可使用“专项计划 JSON / 专项计划 CSV / 专项回执模板”导出独立的 `railwise.engineering.batch.externalSystemImportPlan.v1`，其中 request 只覆盖 `batch/archive-release-sla-reminder-ingest.*`，继续沿用当前的 adapter 字段映射、HTTP endpoint、payload JSON 和回执模板格式。HTTP 模式下可直接使用“专项提交 HTTP”，系统会真实提交这三份入库清单证据并生成通用 HTTP 审计、专项 HTTP 重放队列、专项回执更新和更新后的入库清单；若仍存在 `pending/rejected/http_error/network_error/missing_attempt`，使用“重放 HTTP”只重放专项失败请求，系统会合并回原 HTTP 审计、刷新专项回执更新和“SLA 提醒归档入库”卡片，并自动追加 `railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemHttpReplayHistory.v1` 多轮重放历史，可用“专项重放 CSV / 专项重放 JSON”导出当前剩余队列，也可用“重放历史 MD / 重放历史 CSV / 重放历史 JSON”导出每轮重放前后队列、回执更新和最终状态。离线入库时，用“导入专项回执”读取 CSV/TSV/JSON 回执，系统会按文件汇总已入库、待处理、拒绝和缺回执，并把外部入库状态、计划指纹、回执指纹和逐文件处理动作回写到“SLA 提醒归档入库”卡片以及入库 MD/CSV/JSON 中。“专项回执 MD / 专项回执 CSV / 专项回执 JSON”可作为资料员向业主档案系统或监理资料台账归档的专项回执证据；若专项回执或专项重放后仍存在拒绝、待处理、缺回执或混合状态，系统会同步生成 `railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemImportRectificationLedger.v1`，把三个入库清单文件转成资料级整改任务，并可用“专项整改 MD / 专项整改 CSV / 专项整改 JSON”导出 issue、file_path、整改类型、优先级、截止日期、adapter、外部记录号、回执说明、来源状态和处理动作。整改处理完成后，用“导入专项销项”读取 CSV/TSV/JSON 销项回执，字段可包含 `issue_id`、`file_path`、`closure_status`、`closed_at`、`closed_by`、`closure_note` 和 `external_record_id`；如果现场平台表头使用“平台专项问题号、平台资料路径、平台处理状态、平台档案号”等非标准命名，可先用“导出专项销项字段 / 导入专项销项字段”维护 `railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemImportRectificationClosureTemplate.v1`，后续导入会自动复用字段别名并在 `archiveReleaseSlaReminderExternalSystemImportRectificationClosureUpdate.source.fieldTemplateFingerprint` 中留下模板版本证据；系统生成 `railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemImportRectificationClosureUpdate.v1`，按 issue 或 file_path 回写已闭环、继续打开、未回执和未匹配，并可用“专项销项 MD / 专项销项 CSV / 专项销项 JSON”导出闭环证据和更新后的专项整改台账指纹。外部平台完成异步终态后，用“导入最终回执”读取 CSV/TSV/JSON 最终回执，系统会按 `request_id` 或 `adapter_id + file_path` 匹配专项计划，解析 `final_status`、确认时间、确认人、外部记录号和平台校验码，生成 `railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemFinalReceiptConfirmation.v1`，并把最终 accepted/pending/rejected/missing/unmatched 状态回写到“SLA 提醒归档入库”清单；“最终回执 MD / 最终回执 CSV / 最终回执 JSON”可作为平台最终终态证据交付。后续生成正式“归档 ZIP”时，系统也会把 `batch/archive-release-sla-reminder-external-import-http-replay-queue.md/csv/json`、`batch/archive-release-sla-reminder-external-import-http-replay-history.md/csv/json`、`batch/archive-release-sla-reminder-external-import-receipt-update.md/csv/json`、`batch/archive-release-sla-reminder-external-import-final-receipt-confirmation.md/csv/json`、`batch/archive-release-sla-reminder-external-import-rectification-ledger.md/csv/json` 和 `batch/archive-release-sla-reminder-external-import-rectification-closure-update.md/csv/json` 写入 manifest、checksums、external upload manifest、external-system upload rows 和发布记录，`verify:engineering-archive` 会校验专项重放队列的 schema、CSV 行数、来源提交指纹、上传覆盖和发布记录指纹，校验多轮重放历史链的 schema、CSV 行数、轮次数、计划指纹、历史指纹、上传覆盖和发布记录指纹，校验专项回执更新的 schema、CSV 行数、更新后入库清单指纹、上传覆盖和发布记录指纹，校验最终回执确认的 schema、CSV 行数、来源专项回执指纹、来源重放历史指纹、更新后入库清单指纹、上传覆盖、发布记录指纹和最终确认指纹，校验专项整改台账的 schema、CSV 行数、来源专项回执指纹、更新后入库清单指纹、上传覆盖、发布记录指纹和整改台账指纹，并校验专项销项回执的 schema、CSV 行数、更新后台账指纹、上传覆盖、发布记录指纹和闭环指纹。

若最终回执平台表头使用“平台请求流水号、平台系统编码、平台资料相对路径、平台终态码、平台哈希码”等自定义字段，可先用“导入最终字段 / 导出最终字段”维护 `railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemFinalReceiptFieldTemplate.v1`；后续“导入最终回执”会自动复用保存模板，并在 `archiveReleaseSlaReminderExternalSystemFinalReceiptConfirmation.source.fieldTemplateFingerprint` 中记录模板版本。

导入最终回执后，工作台会同步生成 `railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemFinalReceiptCrossPlatformReview.v1`，按 `batch/archive-release-sla-reminder-ingest.md/csv/json` 三份资料对比各外部 adapter 的最终状态、外部记录号和平台校验码；“终态复核 MD / 终态复核 CSV / 终态复核 JSON”可作为交付前阻断复核证据。正式“归档 ZIP”会把 `batch/archive-release-sla-reminder-external-import-final-receipt-cross-platform-review.md/csv/json` 写入 manifest、checksums、external upload manifest、external-system upload rows 和发布记录；`verify:engineering-archive` 会校验来源最终回执指纹、问题计数、复核状态、上传覆盖、发布记录指纹和复核指纹。

终态复核生成后，工作台会继续派生 `railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemFinalReceiptBatchSignoff.v1`；若复核通过且已填写经办人，可作为“最终签发 MD / 最终签发 CSV / 最终签发 JSON”交付，若仍有状态、校验码或缺回执阻断项，则签发状态保持 `blocked`。正式“归档 ZIP”会把 `batch/archive-release-sla-reminder-external-import-final-receipt-batch-signoff.md/csv/json` 写入 manifest、checksums、external upload manifest、external-system upload rows 和发布记录；`verify:engineering-archive` 会校验来源最终回执指纹、来源终态复核指纹、签发计数、签发状态、上传覆盖、发布记录指纹和签发指纹。

最终签发上传到外部系统后，可用“导入签发回传”读取 CSV/TSV/JSON 回传，字段可包含 `file_path` 或 `signoff_file_path`、`external_record_id`、`receipt_status`、`receipt_message`、`received_at` 和 `synced_release_version`；系统生成 `railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemFinalReceiptSignoffExternalSyncReceipt.v1`，按签发文件合并 accepted、rejected、pending、skipped、missing_receipt 和 unmatched_receipt 状态，并可用“签发回传 MD / 签发回传 CSV / 签发回传 JSON”导出。正式“归档 ZIP”会把 `batch/archive-release-sla-reminder-external-import-final-receipt-signoff-external-sync-receipt.md/csv/json` 写入 manifest、checksums、external upload manifest、external-system upload rows 和发布记录；`verify:engineering-archive` 会校验来源签发指纹、文件/状态计数、上传覆盖、发布记录指纹和回执指纹。

排班确认后，可继续使用“通知审计”生成 `railwise.engineering.batch.archiveReleaseSlaNotificationExecutionAudit.v1`；“通知 MD / 通知 CSV / 通知 JSON”会把每条排班按渠道展开为执行记录，字段包括发送状态、确认状态、执行人、执行时间、外部消息号、失败原因、确认时间、消息标题和消息正文。若项目已配置通知网关，在“通知 Endpoint”填写项目群/企业微信机器人/邮件网关 URL，选择 Webhook、企业微信或邮件网关模式后使用“发送通知”，系统会生成 `railwise.engineering.batch.archiveReleaseSlaNotificationHttpDeliveryPlan.v1` 和 `railwise.engineering.batch.archiveReleaseSlaNotificationHttpDeliveryAudit.v1`，沿用 HTTP 鉴权、超时、重试配置提交真实请求，并把返回的外部消息号、确认状态、失败原因和确认时间回写成新的通知执行审计指纹。不同网关字段不一致时，先用“导出发送字段”生成 `railwise.engineering.batch.archiveReleaseSlaNotificationHttpDeliveryFieldTemplate.v1`，在 JSON 中调整 payload 字段名和响应字段别名后通过“导入发送字段”保存；后续发送计划和发送审计会记录 `fieldTemplateFingerprint`，并支持 `成功/已确认` 等中文状态。“发送 MD / 发送 CSV / 发送 JSON”用于归档真实发送证据。若仍存在待处理、发送失败、HTTP 错误、网络错误、超时或未执行请求，系统会自动生成 `railwise.engineering.batch.archiveReleaseSlaNotificationHttpReplayQueue.v1`；使用“重放通知”只重发这些请求，并用“重放 CSV / 重放 JSON”导出队列，重放完成后会合并回原发送审计并刷新最终通知执行审计。当前审计表也可作为项目群、邮件或接口网关的离线执行台账；外部系统返回 CSV/TSV/JSON 后，使用“导入通知回执”生成 `railwise.engineering.batch.archiveReleaseSlaNotificationExecutionReceiptUpdate.v1`，按 `execution_id` 或 `occurrence_id + channel` 回填 `sent/failed/skipped`、`acknowledged/rejected/not_required`、外部消息号和失败原因，并更新最终通知审计指纹；“回执 MD / 回执 CSV / 回执 JSON”用于归档回执闭环证据。完成排班、通知、发送、重放或回执闭环后，可使用“提醒入库”生成 `railwise.engineering.batch.archiveReleaseSlaReminderArchiveIngest.v1`，把策略、通知审计、HTTP 发送、回执 CSV、重放队列和回执更新整理成带 `file_path`、schema、指纹、入库状态、责任人和处理动作的资料清单；“入库 MD / 入库 CSV / 入库 JSON”可直接交业主档案系统、监理资料台账或项目 DMS 做预入库和责任闭环复核。若随后生成正式“归档 ZIP”，系统会把同一清单自动写入 `batch/archive-release-sla-reminder-ingest.md/csv/json`，并同步进入 `manifest.json`、`checksums.csv`、`external-upload-manifest.json`、`external-system-upload-rows.csv` 和发布记录，避免提醒入库证据脱离正式归档包。

多个项目或标段的多版本看板 JSON 可通过“导入基线”生成 `railwise.engineering.batch.archiveReleaseCrossProjectBaselineComparison.v1`；“基线 MD / 基线 CSV / 基线 JSON”用于横向排序 critical/warning/stable 项目、未闭环回执、缺回执、成果变化和处理建议，方便总包、监理或业主做跨项目发布移交基线审计。

基线生成后，可使用“自动复核”生成 `railwise.engineering.batch.archiveReleaseCrossProjectAutoReview.v1`；系统会按基线风险把项目归为 `accepted/needs_follow_up/blocked`，输出复核严重级别、问题数、责任角色、截止日期、处理动作和整体交付判定 `ready/conditional/blocked`。“复核 MD / 复核 CSV / 复核 JSON”用于移交前的总包/监理/业主横向复核；正式“归档 ZIP”会把 `batch/archive-release-cross-project-auto-review.md/csv/json` 写入 manifest、checksums、external upload manifest、external-system upload rows 和发布记录，`verify:engineering-archive` 会校验来源基线指纹、项目/结论/问题计数、交付判定、上传覆盖、发布记录指纹和复核指纹。

生成归档包前，可使用“移交模板”生成 `railwise.engineering.batch.archiveTransferWorkflowTemplate.v1`。模板会把当前归档资料按业主、监理、施工单位和第三方检测/复核方拆分为流程行，明确接收方、目标系统、移交阶段、文件路径、资料类型、必交状态、外部系统/人工交付方式、签收要求、回执字段和截止日期；“流程 CSV”用于资料移交执行台账，“签收 CSV”用于外部系统或线下签收后回填 `signoff_status/signed_at/external_record_id/receipt_status/remarks`。正式“归档 ZIP”会把 `batch/archive-transfer-workflow-template.md/csv/json` 和 `batch/archive-transfer-signature-template.csv` 写入 manifest、checksums、external upload manifest、external-system upload rows 和发布记录，`verify:engineering-archive` 会校验模板 schema、流程/签收 CSV 行数、接收方角色、上传覆盖、发布记录指纹和模板指纹。

外部系统或线下盖章完成后，可用“导入签收”读取签收 CSV/TSV/JSON，系统会按 `receiver_id + file_path` 匹配移交流程模板，归一化签收状态和外部回执状态，生成 `railwise.engineering.batch.archiveTransferSignatureReceiptUpdate.v1`。“签收 MD / 签收更新 CSV / 签收 JSON”会列出已更新、已签收、已退回、待处理、缺回执和未匹配行；导入后当前移交流程模板会刷新为带签收状态、外部记录号和备注的更新版。正式“归档 ZIP”会把 `batch/archive-transfer-signature-receipt-update.md/csv/json` 写入 manifest、checksums、external upload manifest、external-system upload rows 和发布记录，`verify:engineering-archive` 会校验更新计数、更新后模板指纹、上传覆盖、发布记录指纹和回执更新指纹。

若外部平台签收回执表头使用“平台接收方编码、平台资料路径、平台签收结论、平台档案号、平台处理意见”等自定义字段，可先用“导出签收字段 / 导入签收字段”维护 `railwise.engineering.batch.archiveTransferSignatureReceiptFieldTemplate.v1`；后续“导入签收”会自动复用保存模板，并在 `archiveTransferSignatureReceiptUpdate.source.fieldTemplateFingerprint` 中记录模板版本。

签收导入后，如果存在退回签收、待签、缺回执或未匹配回执，工作台会自动生成 `railwise.engineering.batch.archiveTransferRectificationLedger.v1`，并按接收方汇总阻断、跟踪和未闭环数量；“派单 MD / 派单 CSV / 派单 JSON”可交给业主、监理、施工单位或第三方复核方逐项处理。整改完成后，用“导入销项”读取 CSV/TSV/JSON，字段可包含 `issue_id`、`receiver_id`、`file_path`、`closure_status`、`closed_at`、`closed_by`、`closure_note` 和 `external_record_id`；若平台表头使用“平台移交问题号、平台接收方编码、平台资料路径、平台处理状态、平台完成时间、平台档案号”等命名，可先用“导出销项字段 / 导入销项字段”维护 `railwise.engineering.batch.archiveTransferRectificationClosureTemplate.v1`。系统生成 `railwise.engineering.batch.archiveTransferRectificationClosureUpdate.v1`，回写已闭环、仍打开、未回执和未匹配销项，并刷新更新后的整改台账指纹；`archiveTransferRectificationClosureUpdate.source.fieldTemplateFingerprint` 会记录本次销项解析使用的字段模板版本。每次导入销项还会追加 `railwise.engineering.batch.archiveTransferRectificationReissueHistory.v1`，记录本轮来源台账、销项指纹、更新后台账、仍需重派数量和按接收方累计重派汇总；“历史 MD / 历史 CSV / 历史 JSON”可作为多轮重派、再次催办和最终验收的追溯证据。整改全部闭环后，可继续使用“终态签发”生成 `railwise.engineering.batch.archiveTransferFinalSignoff.v1`，把最终整改台账和重派历史链绑定到接收方级签发状态；“签发 MD / 签发 CSV / 签发 JSON”会记录签发人、签发时间、最终未闭环数、重派轮次、签发状态和签发指纹，若仍存在未闭环问题或带备注签发，会保留 `blocked` 或 `signed_with_actions` 状态作为正式验收前的阻断证据。终态签发上传到外部系统后，可用“导入签发回传”读取 CSV/TSV/JSON 回传，字段可包含 `file_path` 或 `signoff_file_path`、`external_record_id`、`receipt_status`、`receipt_message`、`received_at` 和 `synced_release_version`；系统生成 `railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncReceipt.v1`，按三份签发文件合并 accepted、rejected、pending、skipped、missing_receipt 和 unmatched_receipt 状态，并可用“回传 MD / 回传 CSV / 回传 JSON”导出。若回传存在拒绝、待处理、缺回执或未匹配，工作台会自动生成 `railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationLedger.v1`；“回传整改 MD / 回传整改 CSV / 回传整改 JSON”可用于平台问题派单，“导入回传销项”会读取 `issue_id` 或 `file_path` 回写闭环状态并生成 `railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate.v1`。每次导入回传销项还会追加 `railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationReissueHistory.v1`，记录本轮来源台账、销项指纹、更新后台账、仍未闭环文件、累计重派和最终台账指纹；支持“回传销项 MD / CSV / JSON”和“回传历史 MD / CSV / JSON”作为最终入库前证据。

导出“归档 ZIP”时，如果工作台当前已有多版本归档看板、跨项目发布基线、跨项目归档自动复核、资料移交流程模板、资料移交签收回执更新、资料移交整改派单、资料移交整改销项、资料移交整改重派历史链、资料移交终态签发、资料移交终态签发外部回传回执、资料移交终态签发回传整改台账、回传整改销项回执或资料移交终态签发回传整改重派历史链，ZIP 会自动把这些成果写入 `batch/archive-release-portfolio-*`、`batch/archive-release-cross-project-baseline.*`、`batch/archive-release-cross-project-auto-review.*` 与 `batch/archive-transfer-*`，并同步纳入 `manifest.json`、`checksums.csv`、`external-upload-manifest.json`、`external-system-upload-rows.csv` 和 `archive-release-record.json` 的可选发布 artifact 行。`verify:engineering-archive -- --require-clean` 会在这些文件存在时校验 schema、CSV 行数、来源回执/台账/签发指纹、更新后台账指纹、重派轮次、终态签发状态、终态签发外部回传状态、回传整改计数、回传销项未回执/未匹配计数、回传整改历史最终台账、接收方计数、业务指纹、外部上传覆盖和发布记录指纹绑定，保证它们可作为正式移交、外部系统入库和后续换版追踪依据。

SLA 整改销项中，“销项模板”导出的是给外部系统回填的 CSV；“导出销项字段 / 导入销项字段”管理的是 `railwise.engineering.batch.archiveReleaseSlaRectificationClosureTemplate.v1` 字段别名模板。现场可把“平台SLA问题号、平台版本号、平台系统编号、平台处理状态、平台完成日期、平台处理人、平台处理说明、平台外部记录号”等平台表头写进模板并保存，后续“导入销项”会自动复用模板，并在 `archiveReleaseSlaRectificationClosureUpdate.source.fieldTemplateFingerprint` 中留下模板版本证据。

外部系统字段不匹配三类内置 adapter 时，可在批处理操作区使用“导出适配”生成 `railwise.engineering.batch.externalSystemUploadAdapterTemplate.v1` 模板，修改 `adapterId`、目标系统、归档包级字段和文件级字段后通过“导入适配”保存。后续归档 ZIP、抽检报告和 `verify:engineering-archive` 会按当前模板校验 adapter 定义、`adapterIds` 和上传行是否一致。

外部系统入库执行流程：

1. 选择“入库模式”：离线模式生成可给人工台账、ETL 或低代码平台使用的 CSV；HTTP 模式可填写 Endpoint，生成带 `endpointUrl` 和 payload JSON 的请求计划。
2. 使用“预检 JSON”或“预检 CSV”导出 `railwise.engineering.batch.externalSystemAdapterPreflight.v1`，先检查 adapter 模板的来源字段是否存在、必填值是否为空；存在 `missing_source` 或 `empty_required_value` 时应先修正模板或批次资料。
3. 使用“计划 JSON”或“计划 CSV”导出 `railwise.engineering.batch.externalSystemImportPlan.v1`，每条 request 都有稳定 `request_id`、adapter、recordType、filePath、payload 和请求指纹。
4. HTTP 模式下可配置 Endpoint、鉴权方式、Token/API Key、超时毫秒和重试次数；可用“保存鉴权 / 导入鉴权 / 导出鉴权”复用 `railwise.engineering.batch.externalSystemHttpAuthTemplate.v1`，模板只保存 Endpoint、鉴权方式、Header、超时和重试策略，不保存 Token/API Key 原文，导入后需要现场重新输入密钥。随后使用“提交 HTTP”逐条 POST 到 adapter endpoint，生成 `railwise.engineering.batch.externalSystemHttpSubmissionAudit.v1`；审计记录脱敏 `executionConfig`、HTTP 状态码、耗时、每次尝试的响应指纹、业务回执状态、外部记录号和处理要求，并可用“HTTP MD / HTTP CSV / HTTP JSON”导出。网络错误、超时和 429/5xx 会按配置重试；导出的审计不包含 token/API key 原文。审计同时生成兼容回执合并的 `receiptCsv`，工作台会自动进入回执合并、台账回写和整改台账流程。若审计中仍存在 pending、业务拒绝、HTTP 错误、网络错误或未执行请求，系统会生成 `railwise.engineering.batch.externalSystemHttpReplayQueue.v1`；可用“重放 HTTP”只重放这些请求，并用“重放 CSV / 重放 JSON”导出队列，重放结果会合并回原 HTTP 审计链路。
5. 离线模式下使用“回执模板”导出外部系统应回填的 CSV 模板，字段包括 `request_id`、`external_record_id`、`receipt_status`、`receipt_message` 和 `received_at`。
6. 外部系统返回回执后，使用“导入回执”合并为 `railwise.engineering.batch.externalSystemImportReceiptReconciliation.v1`；工作台会统计成功、拒绝、待处理、缺回执和未匹配记录，并可用“回执 CSV”导出核对结果。HTTP 提交审计、HTTP 失败重放合并和离线导入回执还会同步生成 `railwise.engineering.batch.externalSystemSignoffReceiptReconciliation.v1`，专门筛出 `audit/archive-inspection-signoff.html/json/csv` 三份签发文件，展示“签发文件回执”摘要，并通过“签发回执 MD / 签发回执 CSV / 签发回执 JSON”导出已入库、拒绝、待处理、跳过、缺回执、未匹配和需跟踪清单。
7. 使用“台账 CSV”导出 `railwise.engineering.batch.externalSystemImportLedgerUpdate.v1` 对应的归档入库台账状态，用 `imported/blocked/pending/skipped/missing_receipt/unmatched_receipt` 回写项目资料或外部档案系统状态。
8. 导入回执或 HTTP 提交审计生成回执后，系统会自动生成 `railwise.engineering.batch.externalSystemImportRectificationLedger.v1`；使用“整改 MD / 整改 CSV / 整改 JSON”导出 rejected、pending、missing_receipt 和 unmatched_receipt 对应的整改任务，资料员可按 request、adapter、file_path、优先级和处理要求重新提交、追踪平台处理或核对批次版本。签发文件专项回执中的拒绝、待处理、缺回执和未匹配记录沿用同一 request id 进入整改台账，签发回执负责归档/签发专项汇总，整改台账负责责任人、优先级、截止日期和销项闭环。
9. 整改任务处理完成后，可先用“导出销项模板”生成 `railwise.engineering.batch.externalSystemImportRectificationClosureTemplate.v1`，按业主档案门户、监理台账或低代码平台实际表头补充别名后再用“导入销项模板”保存；随后使用“导入销项”导入 CSV/TSV/JSON 销项回执，字段可包含 `issue_id`、`request_id`、`closure_status`、`closed_at`、`closed_by`、`closure_note` 和 `external_record_id`，也可使用模板中的平台别名。系统会生成 `railwise.engineering.batch.externalSystemImportRectificationClosureUpdate.v1`，并可用“销项 MD / 销项 CSV / 销项 JSON”导出闭环结果、字段模板指纹和更新后的整改台账指纹。

交付验收或 CI 强制失败模式：

```bash
npm run verify:engineering-archive -- /path/to/工程批次-归档交付包.zip --require-clean
```

自动化系统可读取 JSON 报告：

```bash
npm run verify:engineering-archive -- /path/to/工程批次-归档交付包.zip --json --require-clean
```

验收通过时 `success=true` 且 `summary.errors=0`。如 ZIP 传输后被篡改、文件缺失、校验清单不匹配或外部上传字段缺失，`--require-clean` 会返回非 0，报告中的 `errors` 会列出具体文件路径和错误类型。

## 端到端样例

`tests/fixtures/engineering/` 提供最小样例：

- `alignment-station-offset.csv`
- `alignment-station-offset.geojson`
- `alignment-station-offset.landxml`
- `alignment-station-offset-curve.landxml`
- `alignment-station-offset-spiral.landxml`
- `alignment-station-offset-profile.landxml`
- `alignment-station-offset-paracurve.landxml`
- `alignment-station-offset-circcurve.landxml`
- `alignment-station-offset.dxf`
- `control-network-observations.csv`
- `control-network-gross-error.csv`
- `control-network-leveling.csv`
- `control-network-gnss-baselines.csv`
- `control-network-gnss-covariance.csv`
- `control-network-direction-sets.csv`
- `control-network-direction-rounds.csv`
- `control-network-free-network.csv`
- `control-network-free-constrained.csv`
- `control-network-free-unstable-datum.csv`
- `proj-cct-output.txt`
- `pdal-icp-metadata.json`

这些样例用于验证导入、控制网二维距离/方位角平差、观测粗差诊断、粗差候选剔除后二次平差成果、全站仪方向组平差、方向测回半测回差/归零差质控、测回汇总报表、二维自由网内约束平差、自由网稳定控制点约束转换、稳定点候选不稳诊断、候选点剔除后二次约束成果、一维高差网平差、三维 GNSS 基线平差、GNSS 3x3 协方差权阵、LandXML 平面圆曲线/缓和曲线/纵断面 PVI/ParaCurve/CircCurve 线路里程偏距复核、PROJ stdout 解析和 PDAL metadata 摘要，不依赖本机安装外部引擎。
