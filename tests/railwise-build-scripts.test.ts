import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("bundled Railwise engineering workspace build wiring", () => {
  it("builds survey-mcp as part of the root build before desktop resources are packaged", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.["build:survey"]).toBe("npm --prefix railwise/survey-mcp run build");
    expect(pkg.scripts?.build).toMatch(/^npm run build:survey && /);
  });

  it("runs the desktop frontend build during root verification", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.verify).toContain("npm --prefix desktop run build");
  });

  it("installs survey-mcp dependencies during checkout postinstall", () => {
    const postinstall = readFileSync("scripts/postinstall.mjs", "utf8");

    expect(postinstall).toContain("railwise/survey-mcp/package.json");
    expect(postinstall).toContain("npm --prefix railwise/survey-mcp ci --ignore-scripts");
  });
});
