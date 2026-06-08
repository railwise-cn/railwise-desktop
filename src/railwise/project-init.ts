import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface RailwiseProjectInitOptions {
  parentDir: string;
  projectName: string;
  sourceRailwiseRoot?: string;
  surveyMcpEntry?: string;
}

export interface RailwiseProjectInitResult {
  projectRoot: string;
  createdFiles: string[];
}

function sanitizeProjectName(raw: string): string {
  return raw
    .trim()
    .replace(/[\\/:\0]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120);
}

export function findBundledRailwiseWorkspace(
  startDir = dirname(fileURLToPath(import.meta.url)),
): string | null {
  const envDir = process.env.RAILWISE_WORKSPACE?.trim();
  if (envDir) {
    const abs = resolve(envDir);
    if (existsSync(join(abs, ".mcp.json"))) return abs;
  }
  let cur = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = join(cur, "railwise");
    if (
      existsSync(join(candidate, "REASONIX.md")) &&
      existsSync(join(candidate, ".reasonix", "skills"))
    ) {
      return candidate;
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

function ensureParentDirectory(parentDir: string): string {
  const abs = resolve(parentDir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new Error(`parent directory does not exist: ${abs}`);
  }
  return abs;
}

function ensureEmptyProjectRoot(projectRoot: string): void {
  if (!existsSync(projectRoot)) return;
  if (!statSync(projectRoot).isDirectory()) {
    throw new Error(`project path already exists and is not a directory: ${projectRoot}`);
  }
  const entries = readdirSync(projectRoot);
  if (entries.length > 0) {
    throw new Error(`project directory already exists and is not empty: ${projectRoot}`);
  }
}

function writeProjectFile(root: string, rel: string, body: string, created: string[]): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body, "utf8");
  created.push(rel);
}

function copyProjectFile(source: string, root: string, rel: string, created: string[]): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  copyFileSync(source, abs);
  created.push(rel);
}

function recordProjectTreeFiles(root: string, relDir: string, created: string[]): void {
  const absDir = join(root, relDir);
  if (!existsSync(absDir)) return;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const rel = join(relDir, entry.name);
    if (entry.isDirectory()) {
      recordProjectTreeFiles(root, rel, created);
    } else if (entry.isFile()) {
      created.push(rel);
    }
  }
}

export function initRailwiseProject(
  options: RailwiseProjectInitOptions,
): RailwiseProjectInitResult {
  const parent = ensureParentDirectory(options.parentDir);
  const name = sanitizeProjectName(options.projectName);
  if (!name) throw new Error("project name is required");

  const sourceRailwiseRoot = options.sourceRailwiseRoot
    ? resolve(options.sourceRailwiseRoot)
    : findBundledRailwiseWorkspace();
  if (!sourceRailwiseRoot) throw new Error("bundled Railwise workspace was not found");
  if (!existsSync(join(sourceRailwiseRoot, "REASONIX.md"))) {
    throw new Error(`invalid Railwise source workspace: ${sourceRailwiseRoot}`);
  }

  const projectRoot = join(parent, name);
  ensureEmptyProjectRoot(projectRoot);
  mkdirSync(projectRoot, { recursive: true });

  const createdFiles: string[] = [];
  const surveyMcpEntry = resolve(
    options.surveyMcpEntry ?? join(sourceRailwiseRoot, "survey-mcp", "dist", "index.js"),
  );

  writeProjectFile(
    projectRoot,
    ".mcp.json",
    `${JSON.stringify(
      {
        mcpServers: {
          survey: {
            command: "node",
            args: [surveyMcpEntry],
          },
        },
      },
      null,
      2,
    )}\n`,
    createdFiles,
  );

  copyProjectFile(
    join(sourceRailwiseRoot, "REASONIX.md"),
    projectRoot,
    "REASONIX.md",
    createdFiles,
  );
  cpSync(join(sourceRailwiseRoot, ".reasonix"), join(projectRoot, ".reasonix"), {
    recursive: true,
  });
  recordProjectTreeFiles(projectRoot, ".reasonix", createdFiles);

  const claudeSkillsRoot = join(sourceRailwiseRoot, ".claude");
  if (existsSync(claudeSkillsRoot)) {
    cpSync(claudeSkillsRoot, join(projectRoot, ".claude"), {
      recursive: true,
    });
    recordProjectTreeFiles(projectRoot, ".claude", createdFiles);
  }

  const sampleRoot = join(sourceRailwiseRoot, "examples", "metro-protection");
  copyProjectFile(
    join(sampleRoot, "monitoring-settlement.csv"),
    projectRoot,
    "data/monitoring-settlement.csv",
    createdFiles,
  );
  copyProjectFile(join(sampleRoot, "bid-brief.md"), projectRoot, "bid-brief.md", createdFiles);
  copyProjectFile(join(sampleRoot, "sop-checklist.md"), projectRoot, "SOP.md", createdFiles);
  copyProjectFile(
    join(sampleRoot, "expected-monitoring-report.md"),
    projectRoot,
    "reports/expected-monitoring-report.md",
    createdFiles,
  );

  for (const fixture of [
    "cpiii-control-points.json",
    "shield-guidance.json",
    "inclinometer-readings.json",
  ]) {
    copyProjectFile(
      join(sampleRoot, "fixtures", fixture),
      projectRoot,
      join("data", fixture),
      createdFiles,
    );
  }

  writeProjectFile(
    projectRoot,
    "README.md",
    [
      `# ${name}`,
      "",
      "Railwise engineering project initialized from the bundled metro-protection packet.",
      "",
      "## Start",
      "",
      "- Open this folder as the Railwise workspace.",
      "- Use `/daily-report` for a monitoring daily report.",
      "- Use `/data-check` before final delivery.",
      "- Survey MCP is configured in `.mcp.json`.",
      "",
      "## Included Data",
      "",
      "- `data/monitoring-settlement.csv`",
      "- `data/cpiii-control-points.json`",
      "- `data/shield-guidance.json`",
      "- `data/inclinometer-readings.json`",
      "- `SOP.md`",
    ].join("\n"),
    createdFiles,
  );

  return { projectRoot, createdFiles: [...new Set(createdFiles)].sort() };
}
