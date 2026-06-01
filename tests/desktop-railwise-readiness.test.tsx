// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RailwiseReadinessItem } from "../desktop/src/protocol";
import { RailwiseReadinessPanel } from "../desktop/src/ui/railwise-readiness";

describe("RailwiseReadinessPanel", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders readiness counts, check details, refresh, and project initialization action", () => {
    const onRefresh = vi.fn();
    const onInitProject = vi.fn();
    const checks: RailwiseReadinessItem[] = [
      { id: "railwise-workspace", label: "railwise ws", level: "ok", detail: "workspace ready" },
      { id: "railwise-survey-mcp", label: "survey mcp", level: "warn", detail: "build needed" },
      { id: "railwise-chief-sop", label: "chief sop", level: "fail", detail: "missing qa gate" },
    ];

    render(
      <RailwiseReadinessPanel
        checks={checks}
        onRefresh={onRefresh}
        onInitProject={onInitProject}
      />,
    );

    expect(screen.getByText("Railwise readiness")).toBeTruthy();
    expect(screen.getByText("1 ok")).toBeTruthy();
    expect(screen.getByText("1 warn")).toBeTruthy();
    expect(screen.getByText("1 fail")).toBeTruthy();
    expect(screen.getByText("survey mcp")).toBeTruthy();
    expect(screen.getByText("build needed")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onInitProject).toHaveBeenCalledTimes(1);
  });
});
