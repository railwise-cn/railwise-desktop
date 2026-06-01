import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runDoctorChecks } from "../src/cli/commands/doctor.js";
import { runRailwiseReadinessChecks } from "../src/railwise/readiness.js";

const RAILWISE_ROOT = resolve("railwise");

describe("Railwise engineering readiness", () => {
  it("summarizes the bundled engineering workspace as ready-to-use", () => {
    const checks = runRailwiseReadinessChecks(RAILWISE_ROOT);
    const byId = new Map(checks.map((check) => [check.id, check]));

    expect(byId.get("railwise-workspace")).toMatchObject({ level: "ok" });
    expect(byId.get("railwise-survey-mcp")).toMatchObject({ level: "ok" });
    expect(byId.get("railwise-skills")).toMatchObject({ level: "ok" });
    expect(byId.get("railwise-chief-sop")).toMatchObject({ level: "ok" });
    expect(byId.get("railwise-survey-mcp")?.detail).toContain("dist/index.js");
    expect(byId.get("railwise-skills")?.detail).toContain("20 project skills");
  });

  it("adds Railwise readiness rows to doctor output for the bundled workspace", async () => {
    const checks = await runDoctorChecks(RAILWISE_ROOT);
    const ids = new Set(checks.map((check) => check.id));

    expect(ids.has("railwise-workspace")).toBe(true);
    expect(ids.has("railwise-survey-mcp")).toBe(true);
    expect(ids.has("railwise-skills")).toBe(true);
    expect(ids.has("railwise-chief-sop")).toBe(true);
  });

  it("documents the stable migration checkpoint", () => {
    expect(existsSync(resolve("docs/railwise-engineering-readiness.md"))).toBe(true);
  });
});
