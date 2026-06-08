# IO-01 Field Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PRD IO-01 field-data import coverage for Survey Cloud APP JSON and CPIII TPT/SUC files so the indoor adjustment workbench and survey MCP parser can consume real railway survey inputs.

**Architecture:** Extend the existing `survey_format_parser` instead of creating a parallel parser. New formats must normalize into the current `ParsedRecord` shape so downstream summaries, coordinate conversion rows, distance calculator CSV, and export rows keep working.

**Tech Stack:** TypeScript, Vitest, MCP stdio tool runner, existing Railwise desktop workbench parser helpers.

---

### Task 1: MCP Parser Format Coverage

**Files:**
- Modify: `railwise/survey-mcp/src/tools/format-parser.ts`
- Test: `tests/survey-mcp-tools.test.ts`

- [x] **Step 1: Write failing tests for Survey Cloud JSON and CPIII TPT/SUC**

Add tests that call `format_parser` with `format: "dat-auto"` and raw examples for:
- Survey Cloud JSON containing `known_points`, `observations`, and `level_segments`.
- CPIII TPT text containing point coordinates.
- CPIII SUC text containing observation/segment values.

Expected behavior:
- `format` reports `survey-cloud-json`, `cpiii-tpt`, or `cpiii-suc`.
- `records` normalize to `point_id`, `easting_m`, `northing_m`, `elevation_m`, `hz_angle_deg`, `horiz_dist_m`, and `height_diff_m` where present.
- `parser_summary` reports coordinate and observation counts.
- `export_rows` uses existing `field_coordinate_record` / `field_observation_record` row types.

- [x] **Step 2: Verify RED**

Run:
```bash
npx vitest run tests/survey-mcp-tools.test.ts -t "parses PRD IO-01"
```

Expected: tests fail because the new formats are not recognized.

- [x] **Step 3: Implement minimal parser support**

Add parser helpers in `format-parser.ts`:
- `surveyCloudJson(content)`
- `cpiiiTpt(content)`
- `cpiiiSuc(content)`

Keep the output as `ParsedRecord[]` and route them through `detect()`.

- [x] **Step 4: Verify GREEN**

Run:
```bash
npx vitest run tests/survey-mcp-tools.test.ts -t "parses PRD IO-01"
```

Expected: new parser tests pass.

### Task 2: Desktop Workbench Import Recognition

**Files:**
- Modify: `desktop/src/ui/engineering-workbench.tsx`
- Test: `desktop/src/ui/engineering-workbench.test.ts`

- [x] **Step 1: Write failing tests for desktop import summaries**

Add tests against existing workbench parser helpers so PRD IO-01 files produce:
- Recognized format labels for Survey Cloud JSON and CPIII.
- Normalized rows available for downstream adjustment/calculation tables.

- [x] **Step 2: Verify RED**

Run:
```bash
npx vitest run desktop/src/ui/engineering-workbench.test.ts -t "PRD IO-01"
```

Expected: desktop parser tests fail until workbench import handling is wired.

- [x] **Step 3: Wire desktop import handling**

Update desktop import detection only where the current workbench reads imported file text. Reuse MCP-compatible field names and do not introduce soil/earthwork-specific formats.

- [x] **Step 4: Verify GREEN and regression**

Run:
```bash
npx vitest run desktop/src/ui/engineering-workbench.test.ts -t "PRD IO-01"
npx vitest run tests/survey-mcp-tools.test.ts -t "parses PRD IO-01"
```

Expected: targeted parser tests pass.

### Task 3: Final Verification

**Files:**
- Verify changed files and relevant test suites.

- [x] **Step 1: Run parser and workbench tests**

Run:
```bash
npx vitest run tests/survey-mcp-tools.test.ts
npx vitest run desktop/src/ui/engineering-workbench.test.ts
```

- [x] **Step 2: Run build and scope scan**

Run:
```bash
git diff --check
npm --prefix desktop run build
npm run build
rg --hidden -n "土方|土石方|方量|挖方|填方|开挖|earthwork|earthworks|excavation|基坑|foundation_pit|pit_monitoring|岩土|geotechnical" . --glob '!node_modules/**' --glob '!dist/**' --glob '!build/**' --glob '!.git/**' --glob '!target/**' --glob '!desktop/src-tauri/target/**' --glob '!docs/superpowers/**'
```

Expected: tests and builds pass; scope scan has no matches in active source outside allowed docs/history.
