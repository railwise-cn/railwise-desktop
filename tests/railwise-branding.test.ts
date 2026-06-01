import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const USER_FACING_I18N = [
  "src/i18n/EN.ts",
  "src/i18n/de.ts",
  "src/i18n/ru.ts",
  "desktop/src/i18n/de.ts",
  "dashboard/src/i18n/de.ts",
];

describe("Railwise user-facing branding", () => {
  it("does not leave old Reasonix product names in primary localized UI copy", () => {
    const offenders = USER_FACING_I18N.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return text
        .split(/\r?\n/)
        .map((line, index) => ({ file, line, index: index + 1 }))
        .filter(({ line }) => line.includes("Reasonix"));
    });

    expect(offenders.map((item) => `${item.file}:${item.index}: ${item.line.trim()}`)).toEqual([]);
  });
});
