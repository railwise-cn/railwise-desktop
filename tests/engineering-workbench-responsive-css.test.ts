import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("desktop/src/styles.css", "utf8");

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`).exec(css);
  return match?.groups?.body ?? "";
}

describe("engineering workbench responsive layout", () => {
  it("keeps the result export actions inside the result panel instead of overlapping the input panel", () => {
    expect(cssRule(".ewb-main")).toContain("grid-auto-rows: max-content");
    expect(cssRule(".ewb-input-panel,\n.ewb-results")).toContain("align-self: start");
    expect(cssRule(".ewb-results > .ewb-section-head")).toContain("flex-direction: column");
    expect(cssRule(".ewb-results > .ewb-section-head .ewb-actions")).toContain("width: 100%");
    expect(cssRule(".ewb-results > .ewb-section-head .ewb-btn")).toContain("flex: 1 1");
  });

  it("collapses the workbench content before indoor adjustment panels become cramped", () => {
    expect(css).toContain("@media (max-width: 1280px)");
    expect(css).toMatch(
      /@media \(max-width: 1280px\)[\s\S]*?\.ewb-main\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(css).toMatch(
      /@media \(max-width: 1280px\)[\s\S]*?\.ewb-indoor-table-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(css).toMatch(
      /@media \(max-width: 1280px\)[\s\S]*?\.ewb-indoor-workflow\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
  });
});
