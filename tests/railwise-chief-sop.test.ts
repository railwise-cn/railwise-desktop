import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CHIEF = readFileSync(resolve("railwise/REASONIX.md"), "utf8");

describe("Railwise Chief SOP", () => {
  it("keeps raw data and external delivery behind mandatory quality gates", () => {
    const inspector = CHIEF.indexOf("run_skill qa-inspector");
    const analyst = CHIEF.indexOf("run_skill data-analyst");
    const writer = CHIEF.indexOf("run_skill writer");
    const reviewer = CHIEF.indexOf("run_skill qa-reviewer");

    expect(inspector).toBeGreaterThan(-1);
    expect(analyst).toBeGreaterThan(inspector);
    expect(writer).toBeGreaterThan(analyst);
    expect(reviewer).toBeGreaterThan(writer);
  });

  it("defines deterministic task routing for every migrated workflow skill", () => {
    for (const skill of [
      "ai-deps",
      "bid-prepare",
      "daily-report",
      "monthly-report",
      "data-check",
      "trend-analysis",
      "safety-check",
      "emergency-response",
      "payment-reminder",
      "rmslop",
      "spellcheck",
      "commit",
      "issues",
      "learn",
    ]) {
      expect(CHIEF, `missing Chief routing entry for ${skill}`).toContain(`run_skill ${skill}`);
    }
  });
});
