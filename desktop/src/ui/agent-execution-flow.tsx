import { I } from "../icons";
import type { RailwiseAgentEvent } from "../railwise-agent-events";

type AgentExecutionFlowPanelProps = {
  events: RailwiseAgentEvent[];
};

type AgentFlowViewModel = {
  title: string;
  subtitle: string;
  detail?: string;
  tone: "neutral" | "tool" | "human" | "ok" | "warn" | "error";
  Icon: typeof I.play;
};

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function shortText(value: string, maxLength = 280): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function eventToViewModel(event: RailwiseAgentEvent): AgentFlowViewModel {
  switch (event.type) {
    case "RUN_STARTED":
      return {
        title: "任务开始",
        subtitle: event.title || event.agentId,
        detail: event.model ? `模型 ${event.model}` : undefined,
        tone: "neutral",
        Icon: I.play,
      };
    case "TEXT_MESSAGE_CONTENT":
      return {
        title: event.channel === "status" ? "状态更新" : "Agent 消息",
        subtitle: event.role,
        detail: event.content,
        tone: event.channel === "reasoning" ? "warn" : "neutral",
        Icon: event.role === "user" ? I.pencil : I.bot,
      };
    case "TOOL_CALL_START":
      return {
        title: "工具调用",
        subtitle: event.toolName,
        detail: event.label,
        tone: "tool",
        Icon: I.terminal,
      };
    case "TOOL_CALL_ARGS":
      return {
        title: "参数",
        subtitle: event.toolName,
        detail: event.argsText,
        tone: "tool",
        Icon: I.list,
      };
    case "TOOL_CALL_RESULT":
      return {
        title: "结果卡片",
        subtitle: event.ok ? "已生成成果" : "需要处理",
        detail: event.resultText,
        tone: event.ok ? "ok" : "error",
        Icon: event.ok ? I.check : I.warning,
      };
    case "HUMAN_INPUT_REQUIRED":
      return {
        title: "人工确认",
        subtitle: event.title,
        detail: [event.detail, event.options?.length ? `选项：${event.options.join(" / ")}` : null]
          .filter(Boolean)
          .join("\n"),
        tone: "human",
        Icon: I.shield,
      };
    case "STATE_DELTA":
      return {
        title: "状态",
        subtitle: event.label || event.path,
        detail: stringifyValue(event.value),
        tone: "neutral",
        Icon: I.database,
      };
    case "RUN_FINISHED":
      return {
        title: event.ok ? "完成" : "未完成",
        subtitle: event.title || (event.ok ? "执行完成" : "执行异常"),
        detail: event.summary,
        tone: event.ok ? "ok" : "error",
        Icon: event.ok ? I.check : I.warning,
      };
    default:
      return {
        title: "事件",
        subtitle: (event as { type: string }).type,
        detail: stringifyValue(event),
        tone: "neutral",
        Icon: I.bot,
      };
  }
}

export function AgentExecutionFlowPanel({ events }: AgentExecutionFlowPanelProps) {
  return (
    <section className="agent-flow-panel" aria-label="Agent 执行流">
      <div className="agent-flow-head">
        <div>
          <span>Agent 执行流</span>
          <strong>工具、确认、结果统一渲染</strong>
        </div>
        <span className="agent-flow-count">{events.length} 事件</span>
      </div>
      <div className="agent-flow-list">
        {events.map((event) => {
          const view = eventToViewModel(event);
          const Icon = view.Icon;
          return (
            <article className="agent-flow-card" data-tone={view.tone} key={event.eventId}>
              <div className="agent-flow-icon" aria-hidden="true">
                <Icon size={14} />
              </div>
              <div className="agent-flow-body">
                <div className="agent-flow-card-head">
                  <strong>{view.title}</strong>
                  <span>{view.subtitle}</span>
                </div>
                {view.detail ? <pre>{shortText(view.detail)}</pre> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
