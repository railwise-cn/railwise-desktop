import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getSurveyStandardClauses } from "../railwise/survey-mcp/src/tools/standard";

describe("survey MCP standard library scope", () => {
  it("keeps built-in clauses focused on rail transit survey and monitoring standards", () => {
    const clauses = getSurveyStandardClauses();
    const text = clauses
      .flatMap((clause) => [clause.code, clause.title, clause.content, ...clause.keywords])
      .join("\n");

    expect(new Set(clauses.map((clause) => clause.code))).toEqual(
      new Set(["GB 50911", "JGJ 8", "GB 50026"]),
    );
    const bannedTerms = [
      "GB 50497",
      `建筑${"基"}${"坑"}`,
      `${"基"}${"坑"}`,
      `${"开"}${"挖"}`,
      `${"土"}${"方"}`,
      `${"方"}${"量"}`,
      `${"挖"}${"方"}`,
      `${"填"}${"方"}`,
      `${"土"}${"石"}${"方"}`,
      `earth${"work"}`,
      `earth${"works"}`,
      `excav${"ation"}`,
    ];
    for (const term of bannedTerms) {
      expect(text).not.toContain(term);
    }
  });

  it("keeps the engineering workbench scope on rail transit survey and monitoring", () => {
    const researchDoc = readFileSync(
      new URL("../docs/engineering-analysis-workbench-research.md", import.meta.url),
      "utf8",
    );

    expect(researchDoc).toContain("轨道、交通、铁路、工程测量和监测");
    expect(researchDoc).toContain("非轨道交通测量监测类能力");
    expect(researchDoc).not.toContain("工程量类");
    expect(researchDoc).not.toContain("土方");
    expect(researchDoc).not.toContain("基坑");
    expect(researchDoc).not.toContain("岩土");
  });
});
