# IO-02 Adjustment Workbook Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PRD indoor traverse and leveling XLSX exports carry explicit adjustment deliverable evidence, including workbook kind and adjustment exchange readback validation.

**Architecture:** Extend the existing workbook builder in `desktop/src/ui/engineering-workbench.tsx`; do not add a separate Excel pipeline. The builder already groups `result.rows` by `row_type`, so this slice adds metadata rows and one exchange-readback sheet only for traverse/level adjustment deliverables.

**Tech Stack:** TypeScript, React workbench helpers, custom SpreadsheetML XLSX ZIP builder, Vitest.

---

### Task 1: Workbook Evidence Test

**Files:**
- Modify: `desktop/src/ui/engineering-workbench.test.ts`

- [x] **Step 1: Write the failing test**

Add a test near the existing adjustment exchange deliverable coverage:

```ts
const traverseWorkbook = buildEngineeringResultWorkbookXlsxExport(traverseDeliverables);
const workbookEntries = readBase64ZipEntries(traverseWorkbook.base64);
expect(traverseWorkbook.rowTypeCounts).toMatchObject({
  traverse_adjusted_coordinate: 1,
  traverse_error_ellipse: 1,
  traverse_adjustment_exchange_readback: 6,
});
expect(workbookEntries.get("xl/workbook.xml")).toContain('sheet name="平差交换回读"');
expect(workbookEntries.get("xl/worksheets/sheet1.xml")).toContain("内业平差专项");
expect(Array.from(workbookEntries.values()).join("\n")).toContain("traverse_adjustment");
expect(Array.from(workbookEntries.values()).join("\n")).toContain("validationFingerprint");
```

- [x] **Step 2: Verify RED**

Run:

```bash
npx vitest run desktop/src/ui/engineering-workbench.test.ts -t "builds PRD adjustment exchange deliverables"
```

Expected: fail because workbook metadata and exchange-readback rows are not present.

### Task 2: Workbook Builder Implementation

**Files:**
- Modify: `desktop/src/ui/engineering-workbench.tsx`

- [x] **Step 1: Add adjustment workbook metadata rows**

In `workbookSheetsFromEngineeringResult`, when `result.toolId` is `traverse_adjustment` or `level_adjustment`, append these rows to the `成果清单` sheet:

```ts
["成果类型", "内业平差专项"],
["专项工具", result.toolId === "traverse_adjustment" ? "导线内业" : "水准内业"],
```

- [x] **Step 2: Add exchange readback sheet rows**

In `buildEngineeringResultWorkbookXlsxExport`, parse `deliverables.adjustmentExchangeFiles` and append one sheet named `平差交换回读` with headers:

```ts
[
  "格式",
  "标题",
  "扩展名",
  "回读状态",
  "输入格式",
  "回读行数",
  "结果行数",
  "警告数",
  "指标",
  "validationFingerprint",
]
```

Each row should come from `file.readbackValidation`, using `JSON.stringify(file.readbackValidation.metrics)` for the metrics cell.

- [x] **Step 3: Count exchange readback rows**

Include `traverse_adjustment_exchange_readback` or `level_adjustment_exchange_readback` in `rowTypeCounts` when the sheet is added.

### Task 3: Verification

**Files:**
- Verify changed workbench files.

- [x] **Step 1: Run targeted and regression tests**

Run:

```bash
npx vitest run desktop/src/ui/engineering-workbench.test.ts -t "builds PRD adjustment exchange deliverables"
npx vitest run desktop/src/ui/engineering-workbench.test.ts desktop/src/ui/engineering-workbench-ui.test.tsx
npx vitest run tests/survey-mcp-tools.test.ts
```

- [x] **Step 2: Run build and scope checks**

Run:

```bash
git diff --check
rg -n "$RAILWISE_FORBIDDEN_SCOPE_PATTERN" desktop/src/ui/engineering-workbench.tsx desktop/src/ui/engineering-workbench.test.ts desktop/src/styles.css
npm --prefix desktop run build
npm run build
```

Expected: tests and builds pass; scope scan has no matches.
