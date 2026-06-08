import type { IncomingEvent } from "./protocol";

type AgentEventBase = {
  eventId: string;
  runId: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
};

export type RailwiseAgentEvent =
  | (AgentEventBase & {
      type: "RUN_STARTED";
      agentId: string;
      model?: string;
      title?: string;
    })
  | (AgentEventBase & {
      type: "TEXT_MESSAGE_CONTENT";
      messageId: string;
      role: "assistant" | "user" | "system";
      channel: "content" | "reasoning" | "status";
      content: string;
    })
  | (AgentEventBase & {
      type: "TOOL_CALL_START";
      toolCallId: string;
      toolName: string;
      label?: string;
    })
  | (AgentEventBase & {
      type: "TOOL_CALL_ARGS";
      toolCallId: string;
      toolName: string;
      argsText: string;
    })
  | (AgentEventBase & {
      type: "TOOL_CALL_RESULT";
      toolCallId: string;
      ok: boolean;
      resultText: string;
    })
  | (AgentEventBase & {
      type: "HUMAN_INPUT_REQUIRED";
      requestId: string;
      requestKind: "confirmation" | "path-access" | "choice" | "plan" | "checkpoint" | "revision";
      title: string;
      detail?: string;
      options?: string[];
    })
  | (AgentEventBase & {
      type: "STATE_DELTA";
      path: string;
      value: unknown;
      label?: string;
    })
  | (AgentEventBase & {
      type: "RUN_FINISHED";
      ok: boolean;
      title?: string;
      summary?: string;
    });

export type WorkbenchAgentFlowInput = {
  toolId: string;
  toolTitle: string;
  inputFormat: string;
  sourceName?: string | null;
  rowCount?: number | null;
  resultStatus: "ok" | "warn" | "error";
  resultSummary: string;
  resultRows: number;
  warnings: string[];
  inputError: string | null;
  engineAcceptanceStatus?: string | null;
  engineReadyCount?: number | null;
  engineTotalCount?: number | null;
};

function turnRunId(turn?: number): string {
  return typeof turn === "number" ? `turn-${turn}` : "railwise-session";
}

function eventId(event: IncomingEvent, suffix: string = event.type): string {
  const rawId = "id" in event && typeof event.id === "number" ? event.id : suffix;
  return `railwise:${rawId}:${suffix}`;
}

function compactText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function workbenchTimestamp(): string {
  return new Date().toISOString();
}

export function incomingEventToRailwiseAgentEvents(event: IncomingEvent): RailwiseAgentEvent[] {
  switch (event.type) {
    case "model.turn.started":
      return [
        {
          type: "RUN_STARTED",
          eventId: eventId(event),
          runId: turnRunId(event.turn),
          timestamp: event.ts,
          agentId: "railwise",
          model: event.model,
          title: "Railwise Agent",
          metadata: {
            reasoningEffort: event.reasoningEffort,
            prefixHash: event.prefixHash,
          },
        },
      ];
    case "user.message":
      return [
        {
          type: "TEXT_MESSAGE_CONTENT",
          eventId: eventId(event),
          runId: turnRunId(event.turn),
          timestamp: event.ts,
          messageId: `user-${event.id}`,
          role: "user",
          channel: "content",
          content: event.text,
        },
      ];
    case "model.delta":
      return event.channel === "tool_args"
        ? []
        : [
            {
              type: "TEXT_MESSAGE_CONTENT",
              eventId: eventId(event),
              runId: turnRunId(event.turn),
              timestamp: event.ts,
              messageId: `assistant-delta-${event.id}`,
              role: "assistant",
              channel: event.channel,
              content: event.text,
            },
          ];
    case "model.final": {
      const events: RailwiseAgentEvent[] = [];
      if (event.reasoningContent) {
        events.push({
          type: "TEXT_MESSAGE_CONTENT",
          eventId: eventId(event, "model.final.reasoning"),
          runId: turnRunId(event.turn),
          timestamp: event.ts,
          messageId: `assistant-final-reasoning-${event.id}`,
          role: "assistant",
          channel: "reasoning",
          content: event.reasoningContent,
        });
      }
      if (event.content) {
        events.push({
          type: "TEXT_MESSAGE_CONTENT",
          eventId: eventId(event, "model.final.content"),
          runId: turnRunId(event.turn),
          timestamp: event.ts,
          messageId: `assistant-final-${event.id}`,
          role: "assistant",
          channel: "content",
          content: event.content,
        });
      }
      events.push({
        type: "RUN_FINISHED",
        eventId: eventId(event, "model.final.done"),
        runId: turnRunId(event.turn),
        timestamp: event.ts,
        ok: true,
        title: "Agent 完成",
        summary: event.content || event.reasoningContent || "模型回合已完成",
        metadata: {
          usage: event.usage,
          costUsd: event.costUsd,
        },
      });
      return events;
    }
    case "tool.preparing":
      return [
        {
          type: "TOOL_CALL_START",
          eventId: eventId(event),
          runId: turnRunId(event.turn),
          timestamp: event.ts,
          toolCallId: event.callId,
          toolName: event.name,
        },
      ];
    case "tool.intent":
      return [
        {
          type: "TOOL_CALL_ARGS",
          eventId: eventId(event),
          runId: turnRunId(event.turn),
          timestamp: event.ts,
          toolCallId: event.callId,
          toolName: event.name,
          argsText: event.args,
        },
      ];
    case "tool.result":
      return [
        {
          type: "TOOL_CALL_RESULT",
          eventId: eventId(event),
          runId: turnRunId(event.turn),
          timestamp: event.ts,
          toolCallId: event.callId,
          ok: event.ok,
          resultText: event.output,
        },
        {
          type: "STATE_DELTA",
          eventId: eventId(event, "tool.result.state"),
          runId: turnRunId(event.turn),
          timestamp: event.ts,
          path: `tools.${event.callId}.ok`,
          value: event.ok,
          label: "工具结果状态",
        },
      ];
    case "$confirm_required":
      return [
        {
          type: "HUMAN_INPUT_REQUIRED",
          eventId: eventId(event),
          runId: "railwise-session",
          requestId: `confirm-${event.id}`,
          requestKind: "confirmation",
          title: event.kind === "run_background" ? "确认后台执行" : "确认执行命令",
          detail: event.prompt ? compactText(event.prompt) : event.command,
          options: ["允许一次", "拒绝", "始终允许同类命令"],
          metadata: {
            command: event.command,
            kind: event.kind,
          },
        },
      ];
    case "$path_access_required":
      return [
        {
          type: "HUMAN_INPUT_REQUIRED",
          eventId: eventId(event),
          runId: "railwise-session",
          requestId: `path-${event.id}`,
          requestKind: "path-access",
          title: event.intent === "write" ? "确认写入路径" : "确认读取路径",
          detail: event.prompt ? compactText(event.prompt) : `${event.toolName}: ${event.path}`,
          options: ["允许一次", "拒绝"],
          metadata: {
            path: event.path,
            toolName: event.toolName,
            sandboxRoot: event.sandboxRoot,
          },
        },
      ];
    case "$choice_required":
      return [
        {
          type: "HUMAN_INPUT_REQUIRED",
          eventId: eventId(event),
          runId: "railwise-session",
          requestId: `choice-${event.id}`,
          requestKind: "choice",
          title: event.question,
          detail: event.allowCustom ? "可选择一个选项，也可以手动输入。" : undefined,
          options: event.options.map((option) => option.title),
          metadata: {
            options: event.options,
            allowCustom: event.allowCustom,
          },
        },
      ];
    case "$plan_required":
      return [
        {
          type: "HUMAN_INPUT_REQUIRED",
          eventId: eventId(event),
          runId: "railwise-session",
          requestId: `plan-${event.id}`,
          requestKind: "plan",
          title: event.summary || "确认执行计划",
          detail: event.plan,
          options: ["批准", "要求调整", "取消"],
          metadata: {
            steps: event.steps,
          },
        },
      ];
    case "$checkpoint_required":
      return [
        {
          type: "HUMAN_INPUT_REQUIRED",
          eventId: eventId(event),
          runId: "railwise-session",
          requestId: `checkpoint-${event.id}`,
          requestKind: "checkpoint",
          title: event.title || "确认阶段成果",
          detail: event.notes || event.result,
          options: ["继续", "要求修订", "停止"],
          metadata: {
            stepId: event.stepId,
            completed: event.completed,
            total: event.total,
          },
        },
      ];
    case "$revision_required":
      return [
        {
          type: "HUMAN_INPUT_REQUIRED",
          eventId: eventId(event),
          runId: "railwise-session",
          requestId: `revision-${event.id}`,
          requestKind: "revision",
          title: event.summary || "确认修订",
          detail: event.reason,
          options: ["接受修订", "拒绝修订", "取消"],
          metadata: {
            remainingSteps: event.remainingSteps,
          },
        },
      ];
    case "status":
      return [
        {
          type: "TEXT_MESSAGE_CONTENT",
          eventId: eventId(event),
          runId: turnRunId(event.turn),
          timestamp: event.ts,
          messageId: `status-${event.id}`,
          role: "system",
          channel: "status",
          content: event.text,
        },
      ];
    case "warning":
      return [
        {
          type: "TEXT_MESSAGE_CONTENT",
          eventId: eventId(event),
          runId: turnRunId(event.turn),
          timestamp: event.ts,
          messageId: `warning-${event.id}`,
          role: "system",
          channel: "status",
          content: event.text,
          metadata: {
            severity: event.severity,
          },
        },
      ];
    case "$error":
      return [
        {
          type: "RUN_FINISHED",
          eventId: eventId(event),
          runId: "railwise-session",
          ok: false,
          title: "协议错误",
          summary: event.message,
        },
      ];
    case "error":
      return [
        {
          type: "RUN_FINISHED",
          eventId: eventId(event),
          runId: turnRunId(event.turn),
          timestamp: event.ts,
          ok: false,
          title: event.recoverable ? "可恢复错误" : "执行失败",
          summary: event.message,
        },
      ];
    default:
      return [];
  }
}

export function buildWorkbenchAgentFlowEvents(input: WorkbenchAgentFlowInput): RailwiseAgentEvent[] {
  const timestamp = workbenchTimestamp();
  const runId = "workbench-current";
  const toolCallId = `workbench:${input.toolId}:calculate`;
  const toolName = `engineering.${input.toolId}.calculate`;
  const ok = input.resultStatus !== "error" && !input.inputError;
  const reviewTitle = input.inputError
    ? "输入需要修复"
    : input.warnings.length > 0
      ? "导入字段需要复核"
      : "成果提交前复核";
  const reviewDetail =
    input.inputError ||
    input.warnings[0] ||
    "复核限差、基准和成果表后再提交。";

  const events: RailwiseAgentEvent[] = [
    {
      type: "RUN_STARTED",
      eventId: "workbench:run:start",
      runId,
      timestamp,
      agentId: "railwise-engineering",
      title: "工程分析工作台",
    },
    {
      type: "STATE_DELTA",
      eventId: "workbench:state:tool",
      runId,
      timestamp,
      path: "workbench.activeTool",
      value: input.toolId,
      label: input.toolTitle,
    },
    {
      type: "STATE_DELTA",
      eventId: "workbench:state:input",
      runId,
      timestamp,
      path: "workbench.input",
      value: {
        format: input.inputFormat,
        sourceName: input.sourceName ?? null,
        rowCount: input.rowCount ?? null,
      },
      label: "输入数据",
    },
    {
      type: "TOOL_CALL_START",
      eventId: "workbench:tool:start",
      runId,
      timestamp,
      toolCallId,
      toolName,
      label: input.toolTitle,
    },
    {
      type: "TOOL_CALL_ARGS",
      eventId: "workbench:tool:args",
      runId,
      timestamp,
      toolCallId,
      toolName,
      argsText: compactText({
        toolId: input.toolId,
        inputFormat: input.inputFormat,
        rowCount: input.rowCount ?? null,
        sourceName: input.sourceName ?? null,
      }),
    },
    {
      type: "HUMAN_INPUT_REQUIRED",
      eventId: "workbench:review",
      runId,
      timestamp,
      requestId: "workbench-review-current",
      requestKind: "confirmation",
      title: reviewTitle,
      detail: reviewDetail,
      options: ["确认成果可用", "继续复核"],
    },
    {
      type: "TOOL_CALL_RESULT",
      eventId: "workbench:tool:result",
      runId,
      timestamp,
      toolCallId,
      ok,
      resultText: input.resultSummary || `生成 ${input.resultRows} 行成果。`,
    },
  ];

  if (input.engineAcceptanceStatus) {
    events.push({
      type: "STATE_DELTA",
      eventId: "workbench:state:engine",
      runId,
      timestamp,
      path: "workbench.engineAcceptance",
      value: {
        status: input.engineAcceptanceStatus,
        readyCount: input.engineReadyCount ?? null,
        totalCount: input.engineTotalCount ?? null,
      },
      label: `专业引擎：${input.engineAcceptanceStatus}`,
    });
  }

  events.push({
    type: "RUN_FINISHED",
    eventId: "workbench:run:finish",
    runId,
    timestamp,
    ok,
    title: ok ? "计算完成" : "计算未完成",
    summary: ok ? `已生成 ${input.resultRows} 行成果。` : reviewDetail,
  });

  return events;
}
