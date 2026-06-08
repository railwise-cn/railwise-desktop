import { describe, expect, it } from "vitest";

import type { IncomingEvent } from "./protocol";
import {
  buildWorkbenchAgentFlowEvents,
  incomingEventToRailwiseAgentEvents,
} from "./railwise-agent-events";

const ts = "2026-06-08T01:30:00.000Z";

describe("railwise-agent-events", () => {
  it("maps model and tool lifecycle events into AG-UI style events", () => {
    const started = incomingEventToRailwiseAgentEvents({
      type: "model.turn.started",
      id: 1,
      ts,
      turn: 7,
      model: "deepseek-v4-pro",
      reasoningEffort: "high",
      prefixHash: "prefix-1",
    } satisfies IncomingEvent);

    expect(started).toEqual([
      expect.objectContaining({
        type: "RUN_STARTED",
        runId: "turn-7",
        agentId: "railwise",
        model: "deepseek-v4-pro",
      }),
    ]);

    const args = incomingEventToRailwiseAgentEvents({
      type: "tool.intent",
      id: 2,
      ts,
      turn: 7,
      callId: "tool-call-1",
      name: "run_engineering_calculation",
      args: '{"toolId":"level_adjustment"}',
    } satisfies IncomingEvent);

    expect(args).toEqual([
      expect.objectContaining({
        type: "TOOL_CALL_ARGS",
        toolCallId: "tool-call-1",
        toolName: "run_engineering_calculation",
        argsText: '{"toolId":"level_adjustment"}',
      }),
    ]);

    const result = incomingEventToRailwiseAgentEvents({
      type: "tool.result",
      id: 3,
      ts,
      turn: 7,
      callId: "tool-call-1",
      ok: true,
      output: "平差计算完成",
    } satisfies IncomingEvent);

    expect(result).toEqual([
      expect.objectContaining({
        type: "TOOL_CALL_RESULT",
        toolCallId: "tool-call-1",
        ok: true,
        resultText: "平差计算完成",
      }),
      expect.objectContaining({
        type: "STATE_DELTA",
        path: "tools.tool-call-1.ok",
        value: true,
      }),
    ]);
  });

  it("maps approval-like events into human input requests", () => {
    const confirmation = incomingEventToRailwiseAgentEvents({
      type: "$confirm_required",
      id: 12,
      kind: "run_command",
      command: "python adjust.py observations.csv",
    } satisfies IncomingEvent);
    const choice = incomingEventToRailwiseAgentEvents({
      type: "$choice_required",
      id: 13,
      question: "选择导入字段",
      options: [
        { id: "a", title: "测站" },
        { id: "b", title: "后视" },
      ],
      allowCustom: false,
    } satisfies IncomingEvent);
    const plan = incomingEventToRailwiseAgentEvents({
      type: "$plan_required",
      id: 14,
      plan: "1. 导入观测\n2. 计算闭合差",
      summary: "平差流程",
    } satisfies IncomingEvent);

    expect(confirmation[0]).toEqual(
      expect.objectContaining({
        type: "HUMAN_INPUT_REQUIRED",
        requestId: "confirm-12",
        requestKind: "confirmation",
        title: "确认执行命令",
      }),
    );
    expect(choice[0]).toEqual(
      expect.objectContaining({
        type: "HUMAN_INPUT_REQUIRED",
        requestId: "choice-13",
        requestKind: "choice",
        title: "选择导入字段",
        options: ["测站", "后视"],
      }),
    );
    expect(plan[0]).toEqual(
      expect.objectContaining({
        type: "HUMAN_INPUT_REQUIRED",
        requestId: "plan-14",
        requestKind: "plan",
        title: "平差流程",
      }),
    );
  });

  it("builds a workbench flow with tool call, human review and result cards", () => {
    const events = buildWorkbenchAgentFlowEvents({
      toolId: "level_adjustment",
      toolTitle: "水准内业平差",
      inputFormat: "csv",
      rowCount: 18,
      resultStatus: "warn",
      resultSummary: "闭合差接近限差",
      resultRows: 8,
      warnings: ["缺少测段等级字段，已按默认等级处理"],
      inputError: null,
      engineAcceptanceStatus: "可用于计算",
      engineReadyCount: 3,
      engineTotalCount: 3,
    });

    expect(events.map((event) => event.type)).toEqual([
      "RUN_STARTED",
      "STATE_DELTA",
      "STATE_DELTA",
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "HUMAN_INPUT_REQUIRED",
      "TOOL_CALL_RESULT",
      "STATE_DELTA",
      "RUN_FINISHED",
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "HUMAN_INPUT_REQUIRED",
        requestKind: "confirmation",
        title: "导入字段需要复核",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "TOOL_CALL_RESULT",
        ok: true,
        resultText: "闭合差接近限差",
      }),
    );
  });
});
