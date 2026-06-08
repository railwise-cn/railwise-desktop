import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Railwise indoor adjustment offline desktop smoke", () => {
  it("exposes an executable release smoke that records local fallback evidence", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["verify:indoor-offline-smoke"]).toBe(
      "tsx scripts/verify-indoor-adjustment-offline-smoke.mts",
    );
    expect(existsSync(resolve("scripts/verify-indoor-adjustment-offline-smoke.mts"))).toBe(true);

    const tempDir = mkdtempSync(join(tmpdir(), "railwise-indoor-offline-smoke-"));
    const evidencePath = join(tempDir, "offline-smoke.json");
    try {
      const run = spawnSync(
        "npx",
        [
          "tsx",
          "scripts/verify-indoor-adjustment-offline-smoke.mts",
          "--out",
          evidencePath,
          "--json",
        ],
        { cwd: resolve("."), encoding: "utf8" },
      );
      expect(run.status, run.stderr || run.stdout).toBe(0);
      expect(run.stdout).toContain("railwise.engineering.indoorAdjustment.offlineDesktopSmoke.v1");

      const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
        schema?: string;
        appBundle?: { status?: string };
        offlineFallback?: {
          surveyIpc?: string;
          traverse?: { status?: string; workbookTextMarkers?: string[] };
          leveling?: { status?: string; workbookTextMarkers?: string[] };
        };
      };
      expect(evidence).toMatchObject({
        schema: "railwise.engineering.indoorAdjustment.offlineDesktopSmoke.v1",
        appBundle: { status: "not_provided" },
        offlineFallback: {
          surveyIpc: "blocked_by_smoke",
          traverse: { status: "ok" },
          leveling: { status: "ok" },
        },
      });
      expect(evidence.offlineFallback?.traverse?.workbookTextMarkers).toEqual(
        expect.arrayContaining(["内业平差专项", "导线平差坐标", "P1"]),
      );
      expect(evidence.offlineFallback?.leveling?.workbookTextMarkers).toEqual(
        expect.arrayContaining(["内业平差专项", "水准点高程成果表", "水准网示意图", "TP1"]),
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
