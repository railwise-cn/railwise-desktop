import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const USER_FACING_BRAND_FILES = [
  "package.json",
  "src/cli/ui/feedback.ts",
  "src/cli/ui/slash/handlers/basic.ts",
  "src/cli/ssh-remote.ts",
  "src/cli/cpu-prof.ts",
  "src/skills.ts",
  "src/mcp/reconnect.ts",
  "desktop/src/App.tsx",
  "desktop/src/ui/about.tsx",
  "dashboard/src/App.tsx",
  "dashboard/src/ui/about.tsx",
  "dashboard/src/lib/tauri-bridge.ts",
  "desktop/src-tauri/src/rpc.rs",
  "desktop/src-tauri/tauri.conf.json",
  "desktop/src-tauri/capabilities/default.json",
  "desktop/src-tauri/gen/schemas/capabilities.json",
  "desktop/src-tauri/nsis/English.nsh",
  "desktop/src-tauri/nsis/SimpChinese.nsh",
  "desktop/SIGNING.md",
  "README.md",
  "README.zh-CN.md",
  "README.ja-JP.md",
  "packages/dsnix/package.json",
  "packages/dsnix/README.md",
  "railwise/survey-mcp/package.json",
  ...optionalFile("docs/railwise-branding-compatibility.md"),
  ...filesUnder("src/i18n", /\.(ts)$/),
  ...filesUnder("desktop/src/i18n", /\.(ts)$/),
  ...filesUnder("dashboard/src/i18n", /\.(ts)$/),
  ...filesUnder("docs/src", /\.(jsx|css)$/),
  ...filesUnder("docs", /\.(html|js|md|svg|txt|xml)$/).filter(
    (file) => !file.startsWith("docs/design/"),
  ),
];

const USER_FACING_BRAND_PATHS = [...filesUnder("docs/brand", /\.(ico|png|svg)$/)];

const LEGACY_BRAND_PATTERN =
  /\bDeepSeek-Reasonix\b|\bDeepSeek Reasonix\b|\bReasonix\b|\breasonix\b/;

const INTERNAL_COMPATIBILITY_PATTERNS = [
  /~\/\.reasonix\b/,
  /%USERPROFILE%\\\.reasonix\\/,
  /<project>\/\.reasonix\b/,
  /(^|[\s"'`({[\]/])\.reasonix(\/|\b)/,
  /\.reasonix\//,
  /\bREASONIX\.md\b/,
  /\bREASONIX_MEMORY\b/,
  /\breasonix\.lang\b/,
  /\breasonix\.version\b/,
  /\breasonix\.(scroll|currency|theme|themeStyle|fontScale|fontFamily|customFontFamily|sideCollapsed|ctxCollapsed)\b/,
  /\breasonix-(mode|token)\b/,
  /\breasonix\.config\.json\b/,
  /legacy `reasonix`/,
  /legacy Reasonix/,
  /ReasonixConfig/,
  /reasonix-desktop/,
  /dev\.reasonix\.desktop/,
  /x-reasonix-token/i,
];

describe("Railwise user-facing branding", () => {
  it("does not leave old Reasonix product names in user-facing copy and metadata", () => {
    const offenders = USER_FACING_BRAND_FILES.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return text
        .split(/\r?\n/)
        .map((line, index) => ({ file, line, index: index + 1 }))
        .filter(({ line }) => LEGACY_BRAND_PATTERN.test(line))
        .filter(
          ({ line }) => !INTERNAL_COMPATIBILITY_PATTERNS.some((pattern) => pattern.test(line)),
        );
    });

    expect(offenders.map((item) => `${item.file}:${item.index}: ${item.line.trim()}`)).toEqual([]);
  });

  it("does not leave old Reasonix names in public brand asset filenames", () => {
    const offenders = USER_FACING_BRAND_PATHS.filter((file) => /reasonix/i.test(file));

    expect(offenders).toEqual([]);
  });

  it("documents the compatibility boundary for legacy reasonix storage names", () => {
    expect(existsSync("docs/railwise-branding-compatibility.md")).toBe(true);
    const policy = readFileSync("docs/railwise-branding-compatibility.md", "utf8");

    expect(policy).toContain("Public Brand");
    expect(policy).toContain("~/.reasonix/");
    expect(policy).toContain("ReasonixConfig");
    expect(policy).toContain("dev.reasonix.desktop");
    expect(policy).toContain("x-reasonix-token");
  });
});

function filesUnder(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path, pattern);
    if (!entry.isFile()) return [];
    if (!pattern.test(path)) return [];
    if (statSync(path).size === 0) return [];
    return [path];
  });
}

function optionalFile(file: string): string[] {
  return existsSync(file) ? [file] : [];
}
