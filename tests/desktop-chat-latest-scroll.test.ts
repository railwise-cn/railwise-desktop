import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("desktop/src/App.tsx", "utf8");
const css = readFileSync("desktop/src/styles.css", "utf8");

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`).exec(css);
  return match?.groups?.body ?? "";
}

describe("desktop chat latest scroll", () => {
  it("forces the real scroller to the latest message and clears stale restored offsets", () => {
    expect(appSource).toContain("LATEST_THREAD_BOTTOM_GAP_PX");
    expect(appSource).toContain("forceThreadScrollerToLatest");
    expect(appSource).toContain("localStorage.removeItem(`reasonix.scroll.${session}`)");
    expect(appSource).toContain("el.scrollHeight - el.clientHeight");
    expect(appSource).toContain("requestAnimationFrame");
  });

  it("adds a bottom spacer so the latest message is readable above the composer", () => {
    expect(appSource).toContain('Footer: () => <div className="thread-bottom-spacer"');
    expect(cssRule(".thread")).toContain("--thread-latest-bottom-gap");
    expect(cssRule(".thread-bottom-spacer")).toContain("height: var(--thread-latest-bottom-gap");
    expect(cssRule(".thread-jump-bottom")).toContain("bottom: calc(var(--thread-latest-bottom-gap");
  });
});
