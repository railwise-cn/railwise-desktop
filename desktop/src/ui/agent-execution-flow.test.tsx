/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RailwiseAgentEvent } from "../railwise-agent-events";
import { AgentExecutionFlowPanel } from "./agent-execution-flow";

describe("AgentExecutionFlowPanel", () => {
  it("renders tool calls, human confirmation and result events through one renderer", () => {
    const events: RailwiseAgentEvent[] = [
      {
        type: "TOOL_CALL_START",
        eventId: "tool-start",
        runId: "workbench-current",
        timestamp: "2026-06-08T01:40:00.000Z",
        toolCallId: "calc-distance",
        toolName: "engineering.distance_azimuth.calculate",
        label: "距离方位计算",
      },
      {
        type: "HUMAN_INPUT_REQUIRED",
        eventId: "review",
        runId: "workbench-current",
        timestamp: "2026-06-08T01:40:01.000Z",
        requestId: "review-current",
        requestKind: "confirmation",
        title: "成果提交前复核",
        detail: "复核限差、基准和成果表后再提交。",
      },
      {
        type: "TOOL_CALL_RESULT",
        eventId: "tool-result",
        runId: "workbench-current",
        timestamp: "2026-06-08T01:40:02.000Z",
        toolCallId: "calc-distance",
        ok: true,
        resultText: "计算完成，生成 2 行成果。",
      },
    ];

    render(<AgentExecutionFlowPanel events={events} />);

    const panel = screen.getByLabelText("Agent 执行流");
    expect(within(panel).getByText("Agent 执行流")).toBeTruthy();
    expect(within(panel).getByText("工具调用")).toBeTruthy();
    expect(within(panel).getByText("人工确认")).toBeTruthy();
    expect(within(panel).getByText("结果卡片")).toBeTruthy();
    expect(within(panel).getByText("engineering.distance_azimuth.calculate")).toBeTruthy();
    expect(within(panel).getByText("成果提交前复核")).toBeTruthy();
    expect(within(panel).getByText("计算完成，生成 2 行成果。")).toBeTruthy();
  });
});
