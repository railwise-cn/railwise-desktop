import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const VERIFIER_SCRIPT = resolve("scripts/verify-engineering-engines.mjs");
const ENGINE_BINARIES = ["projinfo", "cct", "ogrinfo", "ogr2ogr", "pdal"] as const;

describe("engineering engine verifier", () => {
  let engineDir: string;
  let reportDir: string;

  beforeEach(() => {
    engineDir = mkdtempSync(join(tmpdir(), "railwise-engines-"));
    reportDir = mkdtempSync(join(tmpdir(), "railwise-engine-report-"));
    for (const binary of ENGINE_BINARIES) {
      writeFakeEngine(binary);
    }
  });

  afterEach(() => {
    rmSync(engineDir, { recursive: true, force: true });
    rmSync(reportDir, { recursive: true, force: true });
  });

  it("smoke-tests sidecar engineering engines from RAILWISE_ENGINE_DIR", () => {
    const run = spawnSync(process.execPath, [VERIFIER_SCRIPT, "--json", "--require-engines"], {
      cwd: resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        RAILWISE_ENGINE_DIR: engineDir,
      },
    });

    expect(run.status, run.stderr).toBe(0);

    const report = JSON.parse(run.stdout);
    expect(report.schema).toBe("railwise.engineeringEngines.verify.v1");
    expect(report.summary).toMatchObject({
      available: ENGINE_BINARIES.length,
      failed: 0,
      missing: 0,
      success: ENGINE_BINARIES.length,
    });

    const cct = report.results.find((result: { binary: string }) => result.binary === "cct");
    expect(cct).toMatchObject({
      available: true,
      binary: "cct",
      success: true,
    });
    expect(String(cct.stdout)).toContain("stdin:12 55 0 0 P1");
  });

  it("writes an acceptance report package for field handover", () => {
    const run = spawnSync(
      process.execPath,
      [VERIFIER_SCRIPT, "--report-dir", reportDir, "--require-engines"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        env: {
          ...process.env,
          RAILWISE_ENGINE_DIR: engineDir,
        },
      },
    );

    expect(run.status, run.stderr).toBe(0);

    const json = JSON.parse(
      readFileSync(join(reportDir, "engineering-engine-acceptance.json"), "utf8"),
    );
    expect(json.schema).toBe("railwise.engineeringEngines.acceptance.v1");
    expect(json.acceptanceStatus).toBe("accepted");
    expect(json.summary).toMatchObject({
      available: ENGINE_BINARIES.length,
      failed: 0,
      missing: 0,
      success: ENGINE_BINARIES.length,
    });
    expect(json.files).toEqual(
      expect.arrayContaining([
        "engineering-engine-acceptance.md",
        "engineering-engine-acceptance.csv",
        "engineering-engine-acceptance.json",
      ]),
    );

    const markdown = readFileSync(join(reportDir, "engineering-engine-acceptance.md"), "utf8");
    expect(markdown).toContain("# Railwise 工程专业引擎现场验收");
    expect(markdown).toContain("验收结论：accepted");
    expect(markdown).toContain("PROJ batch coordinate transform");

    const csv = readFileSync(join(reportDir, "engineering-engine-acceptance.csv"), "utf8");
    expect(csv).toContain("binary,workflow,status,path,exit_code");
    expect(csv).toContain("cct,PROJ batch coordinate transform,ok");
  });

  function writeFakeEngine(binary: (typeof ENGINE_BINARIES)[number]): void {
    const suffix = process.platform === "win32" ? ".cmd" : "";
    const path = join(engineDir, `${binary}${suffix}`);
    const body =
      process.platform === "win32"
        ? `@echo off\r\nif "%1"=="--version" echo fake ${binary} 1.0\r\nif not "%1"=="--version" more\r\n`
        : `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "fake ${binary} 1.0"; exit 0; fi\nprintf 'stdin:'\ncat\n`;

    writeFileSync(path, body);
    try {
      chmodSync(path, 0o755);
    } catch {
      // Windows chmod is best-effort for command shims.
    }
  }
});
