#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE_CHECKS = [
  {
    binary: "projinfo",
    args: ["--version"],
    workflow: "PROJ CRS inspection",
  },
  {
    binary: "cct",
    args: ["+proj=noop"],
    stdin: "12 55 0 0 P1\n",
    workflow: "PROJ batch coordinate transform",
  },
  {
    binary: "ogrinfo",
    args: ["--version"],
    workflow: "GDAL/OGR vector inspection",
  },
  {
    binary: "ogr2ogr",
    args: ["--version"],
    workflow: "GDAL/OGR vector conversion",
  },
  {
    binary: "pdal",
    args: ["--version"],
    workflow: "PDAL point cloud processing",
  },
];

const USAGE = `Usage: node scripts/verify-engineering-engines.mjs [--json] [--require-engines] [--timeout-ms <ms>] [--report-dir <dir>]

Verifies Railwise engineering sidecar engines using the same environment variable contract as the desktop app:
  RAILWISE_ENGINE_<BINARY>, RAILWISE_ENGINE_DIR, then PATH.
`;

const parsed = parseArgs(process.argv.slice(2));
if (parsed.help) {
  console.log(USAGE.trim());
  process.exit(0);
}

const checkedAt = new Date().toISOString();
const results = ENGINE_CHECKS.map((check) => runEngineCheck(check, parsed.timeoutMs));
const summary = summarize(results);
const report = {
  schema: "railwise.engineeringEngines.verify.v1",
  checkedAt,
  engineDir: process.env.RAILWISE_ENGINE_DIR || null,
  requireEngines: parsed.requireEngines,
  results,
  summary,
};

if (parsed.reportDir) {
  writeAcceptanceReportPackage(report, parsed.reportDir);
}

if (parsed.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printHumanReport(report);
}

if (parsed.requireEngines && (summary.missing > 0 || summary.failed > 0)) {
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    help: false,
    json: false,
    reportDir: null,
    requireEngines: false,
    timeoutMs: 10_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--require-engines") {
      options.requireEngines = true;
      continue;
    }
    if (arg === "--report-dir") {
      const raw = argv[index + 1];
      if (!raw || raw.startsWith("--")) {
        throw new Error(`missing value for --report-dir\n${USAGE}`);
      }
      options.reportDir = raw;
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      const raw = argv[index + 1];
      const timeout = Number(raw);
      if (!Number.isFinite(timeout) || timeout <= 0) {
        throw new Error(`invalid --timeout-ms value: ${raw}`);
      }
      options.timeoutMs = timeout;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}\n${USAGE}`);
  }

  return options;
}

function runEngineCheck(check, timeoutMs) {
  const resolvedPath = resolveEngineBinary(check.binary);
  if (!resolvedPath) {
    return {
      binary: check.binary,
      workflow: check.workflow,
      available: false,
      success: false,
      path: null,
      args: check.args,
      exitCode: null,
      stdout: "",
      stderr: "engine binary not found",
    };
  }

  const run = spawnSync(resolvedPath, check.args, {
    encoding: "utf8",
    input: check.stdin,
    maxBuffer: 1_000_000,
    timeout: timeoutMs,
  });

  const stdout = truncate(run.stdout || "");
  const stderr = truncate(run.stderr || "");
  const failedByTimeout = Boolean(run.error && run.error.name === "Error" && run.error.message.includes("timed out"));

  return {
    binary: check.binary,
    workflow: check.workflow,
    available: true,
    success: run.status === 0 && !run.error,
    path: resolvedPath,
    args: check.args,
    exitCode: run.status,
    stdout,
    stderr: run.error ? truncate(`${stderr}\n${run.error.message}`.trim()) : stderr,
    timedOut: failedByTimeout,
  };
}

function resolveEngineBinary(binary) {
  const explicit = process.env[engineSpecificEnvVar(binary)];
  if (explicit && isRunnableFile(explicit)) {
    return resolve(explicit);
  }

  const engineDir = process.env.RAILWISE_ENGINE_DIR;
  if (engineDir) {
    for (const name of engineBinaryNames(binary)) {
      const candidate = join(engineDir, name);
      if (isRunnableFile(candidate)) {
        return resolve(candidate);
      }
    }
  }

  for (const dir of pathEntries()) {
    for (const name of engineBinaryNames(binary)) {
      const candidate = join(dir, name);
      if (isRunnableFile(candidate)) {
        return resolve(candidate);
      }
    }
  }

  return null;
}

function engineSpecificEnvVar(binary) {
  return `RAILWISE_ENGINE_${binary.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

function engineBinaryNames(binary) {
  if (process.platform !== "win32") {
    return [binary];
  }

  return unique([binary, `${binary}.exe`, `${binary}.cmd`, `${binary}.bat`]);
}

function pathEntries() {
  return (process.env.PATH || "")
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isRunnableFile(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function summarize(results) {
  return {
    available: results.filter((result) => result.available).length,
    success: results.filter((result) => result.success).length,
    missing: results.filter((result) => !result.available).length,
    failed: results.filter((result) => result.available && !result.success).length,
  };
}

function writeAcceptanceReportPackage(report, reportDir) {
  const outputDir = resolve(reportDir);
  mkdirSync(outputDir, { recursive: true });

  const files = [
    "engineering-engine-acceptance.md",
    "engineering-engine-acceptance.csv",
    "engineering-engine-acceptance.json",
  ];
  const acceptance = {
    schema: "railwise.engineeringEngines.acceptance.v1",
    generatedAt: report.checkedAt,
    acceptanceStatus: acceptanceStatus(report.summary),
    engineDir: report.engineDir,
    requireEngines: report.requireEngines,
    summary: report.summary,
    files,
    results: report.results.map((result) => ({
      ...result,
      status: engineResultStatus(result),
    })),
  };

  writeFileSync(join(outputDir, files[0]), buildAcceptanceMarkdown(acceptance));
  writeFileSync(join(outputDir, files[1]), buildAcceptanceCsv(acceptance.results));
  writeFileSync(join(outputDir, files[2]), `${JSON.stringify(acceptance, null, 2)}\n`);
}

function acceptanceStatus(summary) {
  return summary.missing === 0 && summary.failed === 0 ? "accepted" : "blocked";
}

function engineResultStatus(result) {
  if (!result.available) return "missing";
  return result.success ? "ok" : "failed";
}

function buildAcceptanceMarkdown(report) {
  const lines = [
    "# Railwise 工程专业引擎现场验收",
    "",
    `生成时间：${report.generatedAt}`,
    `验收结论：${report.acceptanceStatus}`,
    `引擎目录：${report.engineDir || "(not set)"}`,
    "",
    "## 汇总",
    "",
    `- 可用二进制：${report.summary.available}`,
    `- 成功烟测：${report.summary.success}`,
    `- 缺失二进制：${report.summary.missing}`,
    `- 失败烟测：${report.summary.failed}`,
    "",
    "## 明细",
    "",
    "| Binary | Workflow | Status | Exit | Path |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const result of report.results) {
    lines.push(
      `| ${markdownCell(result.binary)} | ${markdownCell(result.workflow)} | ${engineResultStatus(result)} | ${
        result.exitCode ?? ""
      } | ${markdownCell(result.path || "(not found)")} |`,
    );
  }

  lines.push("", "## 使用说明", "", "本报告用于现场交付前确认 PROJ、GDAL/OGR、PDAL 侧车引擎可被 Railwise 调用。");
  return `${lines.join("\n")}\n`;
}

function buildAcceptanceCsv(results) {
  return [
    ["binary", "workflow", "status", "path", "exit_code", "stdout", "stderr"],
    ...results.map((result) => [
      result.binary,
      result.workflow,
      engineResultStatus(result),
      result.path || "",
      result.exitCode ?? "",
      singleLine(result.stdout || ""),
      singleLine(result.stderr || ""),
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\n")
    .concat("\n");
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function csvCell(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function printHumanReport(report) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  console.log("Railwise engineering engine verification");
  console.log(`Project: ${root}`);
  console.log(`Checked: ${report.checkedAt}`);
  console.log(`Engine dir: ${report.engineDir || "(not set)"}`);
  console.log("");
  for (const result of report.results) {
    const state = result.success ? "OK" : result.available ? "FAIL" : "MISS";
    console.log(`[${state}] ${result.binary} - ${result.workflow}`);
    console.log(`      path: ${result.path || "(not found)"}`);
    if (result.stdout) {
      console.log(`      stdout: ${singleLine(result.stdout)}`);
    }
    if (result.stderr) {
      console.log(`      stderr: ${singleLine(result.stderr)}`);
    }
  }
  console.log("");
  console.log(
    `Summary: ${report.summary.success} success, ${report.summary.failed} failed, ${report.summary.missing} missing`,
  );
}

function singleLine(value) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value) {
  const limit = 20_000;
  return value.length > limit ? `${value.slice(0, limit)}\n[truncated]` : value;
}

function unique(values) {
  return [...new Set(values)];
}
