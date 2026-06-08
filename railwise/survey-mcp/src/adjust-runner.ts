#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { calculatePrdLevelAdjust, calculatePrdTraverseAdjust } from "./tools/calculator.js";

type AdjustmentRunnerRequest = {
  tool?: string;
  input?: unknown;
};

function normalizeToolName(tool: string): "level_adjust" | "traverse_adjust" | null {
  const normalized = tool.trim().replace(/^survey_/, "");
  if (normalized === "level_adjust") return "level_adjust";
  if (normalized === "traverse_adjust") return "traverse_adjust";
  return null;
}

function main(): void {
  const raw = readFileSync(0, "utf8").trim();
  if (!raw) throw new Error("adjust-runner 需要 stdin JSON 输入");
  const request = JSON.parse(raw) as AdjustmentRunnerRequest;
  const tool = normalizeToolName(String(request.tool ?? ""));
  if (!tool) throw new Error(`不支持的平差工具：${request.tool ?? ""}`);
  const input = request.input;
  const result =
    tool === "level_adjust"
      ? calculatePrdLevelAdjust(input as Parameters<typeof calculatePrdLevelAdjust>[0])
      : calculatePrdTraverseAdjust(input as Parameters<typeof calculatePrdTraverseAdjust>[0]);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
