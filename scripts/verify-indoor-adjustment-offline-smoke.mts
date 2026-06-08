import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";

import {
  buildEngineeringDeliverables,
  buildEngineeringResultWorkbookXlsxExport,
  runEngineeringCalculation,
  type EngineeringToolId,
} from "../desktop/src/ui/engineering-workbench.tsx";

type SmokeArgs = {
  appPath: string | null;
  outPath: string | null;
  json: boolean;
  requireApp: boolean;
};

type ResourceCheck = {
  name: string;
  path: string;
  exists: boolean;
  required: boolean;
};

type AppBundleEvidence = {
  status: "not_provided" | "ok" | "fail";
  inspected: boolean;
  path: string | null;
  resourceRoot: string | null;
  checks: ResourceCheck[];
};

type OfflineCaseEvidence = {
  status: "ok" | "fail";
  toolId: EngineeringToolId;
  fixture: string;
  summary: string;
  rowCount: number;
  workbookFileName: string;
  workbookTextMarkers: string[];
  missingWorkbookTextMarkers: string[];
  draftSchema: string;
};

type OfflineSmokeEvidence = {
  schema: "railwise.engineering.indoorAdjustment.offlineDesktopSmoke.v1";
  generatedAt: string;
  appBundle: AppBundleEvidence;
  offlineFallback: {
    surveyIpc: "blocked_by_smoke";
    blockedCommand: "run_survey_adjustment";
    traverse: OfflineCaseEvidence;
    leveling: OfflineCaseEvidence;
  };
  conclusion: "pass" | "fail";
};

function parseArgs(argv: string[]): SmokeArgs {
  const args: SmokeArgs = { appPath: null, outPath: null, json: false, requireApp: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--app") {
      args.appPath = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--out") {
      args.outPath = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--require-app") {
      args.requireApp = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: tsx scripts/verify-indoor-adjustment-offline-smoke.mts [--app /path/Railwise.app] [--require-app] [--out evidence.json] [--json]",
          "",
          "Runs the PRD indoor adjustment offline fallback smoke and optionally inspects a packaged desktop app bundle.",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function inspectAppBundle(appPath: string | null, requireApp: boolean): AppBundleEvidence {
  if (!appPath) {
    return {
      status: requireApp ? "fail" : "not_provided",
      inspected: false,
      path: null,
      resourceRoot: null,
      checks: [],
    };
  }
  const absoluteAppPath = resolve(appPath);
  const resourceRoot = absoluteAppPath.endsWith(".app")
    ? join(absoluteAppPath, "Contents", "Resources")
    : absoluteAppPath;
  const nodeName = process.platform === "win32" ? "node.exe" : "node";
  const checks: ResourceCheck[] = [
    {
      name: "frontend_dist",
      path: join(resourceRoot, "dist"),
      exists: existsSync(join(resourceRoot, "dist")),
      required: true,
    },
    {
      name: "survey_adjustment_runner",
      path: join(resourceRoot, "railwise", "survey-mcp", "dist", "adjust-runner.js"),
      exists: existsSync(join(resourceRoot, "railwise", "survey-mcp", "dist", "adjust-runner.js")),
      required: true,
    },
    {
      name: "survey_mcp_package",
      path: join(resourceRoot, "railwise", "survey-mcp", "package.json"),
      exists: existsSync(join(resourceRoot, "railwise", "survey-mcp", "package.json")),
      required: true,
    },
    {
      name: "bundled_node_runtime",
      path: join(resourceRoot, nodeName),
      exists: existsSync(join(resourceRoot, nodeName)),
      required: false,
    },
  ];

  return {
    status: checks.some((check) => check.required && !check.exists) ? "fail" : "ok",
    inspected: true,
    path: absoluteAppPath,
    resourceRoot,
    checks,
  };
}

function workbookTextFromBase64(base64: string): string {
  const bytes = Buffer.from(base64, "base64");
  const entries: string[] = [];
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const signature = bytes.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const method = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(compressed) : compressed;
    entries.push(data.toString("utf8"));
    offset = dataStart + compressedSize;
  }
  return entries.join("\n");
}

function loadFixture(name: string): { title?: string; input: unknown } {
  return JSON.parse(readFileSync(resolve("tests/fixtures/engineering", name), "utf8")) as {
    title?: string;
    input: unknown;
  };
}

function runOfflineCase(
  toolId: EngineeringToolId,
  fixtureName: string,
  requiredMarkers: string[],
): OfflineCaseEvidence {
  const fixture = loadFixture(fixtureName);
  const result = runEngineeringCalculation(toolId, fixture.input);
  const inputText = JSON.stringify(fixture.input, null, 2);
  const deliverables = buildEngineeringDeliverables(result, {
    inputFormat: "json",
    inputText,
    sourceName: fixture.title ?? fixtureName,
    projectContext: {
      projectName: "RAILWISE PRD offline smoke",
      contractSection: "release-smoke",
      stationName: toolId,
    },
  });
  const workbook = buildEngineeringResultWorkbookXlsxExport(deliverables);
  const workbookText = workbookTextFromBase64(workbook.base64);
  const workbookTextMarkers = requiredMarkers.filter((marker) => workbookText.includes(marker));
  const missingWorkbookTextMarkers = requiredMarkers.filter((marker) => !workbookText.includes(marker));
  const draft = {
    schema: "railwise.engineeringWorkbench.localDraft.v1",
    projectContext: {
      projectName: "RAILWISE PRD offline smoke",
      contractSection: "release-smoke",
      stationName: toolId,
    },
    activeId: toolId,
    inputFormat: "json",
    inputText,
    savedAt: new Date().toISOString(),
  };

  return {
    status: result.status === "error" || missingWorkbookTextMarkers.length > 0 ? "fail" : "ok",
    toolId,
    fixture: fixtureName,
    summary: result.summary,
    rowCount: result.rows.length,
    workbookFileName: workbook.fileName,
    workbookTextMarkers,
    missingWorkbookTextMarkers,
    draftSchema: draft.schema,
  };
}

function buildEvidence(args: SmokeArgs): OfflineSmokeEvidence {
  const appBundle = inspectAppBundle(args.appPath, args.requireApp);
  const traverse = runOfflineCase("traverse_adjustment", "indoor-traverse-known-baseline.json", [
    "内业平差专项",
    "导线平差坐标",
    "P1",
  ]);
  const leveling = runOfflineCase("level_adjustment", "indoor-level-known-baseline.json", [
    "内业平差专项",
    "水准点高程成果表",
    "水准网示意图",
    "TP1",
  ]);
  const fail =
    appBundle.status === "fail" ||
    traverse.status === "fail" ||
    leveling.status === "fail";

  return {
    schema: "railwise.engineering.indoorAdjustment.offlineDesktopSmoke.v1",
    generatedAt: new Date().toISOString(),
    appBundle,
    offlineFallback: {
      surveyIpc: "blocked_by_smoke",
      blockedCommand: "run_survey_adjustment",
      traverse,
      leveling,
    },
    conclusion: fail ? "fail" : "pass",
  };
}

const args = parseArgs(process.argv.slice(2));
const evidence = buildEvidence(args);
const evidenceJson = JSON.stringify(evidence, null, 2);

if (args.outPath) {
  const absoluteOutPath = resolve(args.outPath);
  mkdirSync(dirname(absoluteOutPath), { recursive: true });
  writeFileSync(absoluteOutPath, `${evidenceJson}\n`);
}

if (args.json) {
  console.log(evidenceJson);
} else {
  console.log(
    [
      `Railwise indoor offline smoke: ${evidence.conclusion}`,
      `app bundle: ${evidence.appBundle.status}`,
      `traverse: ${evidence.offlineFallback.traverse.status}`,
      `leveling: ${evidence.offlineFallback.leveling.status}`,
    ].join("\n"),
  );
}

if (evidence.conclusion !== "pass") {
  process.exitCode = 1;
}
