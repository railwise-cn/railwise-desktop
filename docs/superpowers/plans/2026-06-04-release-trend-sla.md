# Release Trend SLA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a release trend and external receipt SLA export on top of the multi-version archive dashboard.

**Architecture:** Keep the core as pure TypeScript functions in `desktop/src/ui/engineering-workbench.tsx`, fed by `archiveReleasePortfolioDashboard.v1`. The UI only imports/exports the generated artifact and previews summary rows; tests exercise the pure function.

**Tech Stack:** React, TypeScript, Vitest, existing CSV/JSON/HTML helpers.

---

### Task 1: Trend And SLA Artifact

**Files:**
- Modify: `desktop/src/ui/engineering-workbench.test.ts`
- Modify: `desktop/src/ui/engineering-workbench.tsx`
- Modify: `docs/engineering-analysis-workbench-research.md`
- Modify: `docs/engineering-engine-sidecars.md`

- [x] **Step 1: Write the failing test**

Add a Vitest case that builds a three-release `archiveReleasePortfolioDashboard`, calls `buildEngineeringBatchArchiveReleaseTrendSlaReport`, and expects:
- schema `railwise.engineering.batch.archiveReleaseTrendSlaReport.v1`
- adapter SLA rows for owner/supervision/DMS
- overdue count for a rejected or missing receipt older than the SLA threshold
- trend CSV, adapter SLA CSV, JSON, and HTML outputs

- [x] **Step 2: Run the focused test to verify RED**

Run: `npx vitest run desktop/src/ui/engineering-workbench.test.ts --testNamePattern "release trend SLA"`

Expected: FAIL because `buildEngineeringBatchArchiveReleaseTrendSlaReport` is not exported.

- [x] **Step 3: Implement the pure artifact**

Add types and `buildEngineeringBatchArchiveReleaseTrendSlaReport(dashboard, options)` in `desktop/src/ui/engineering-workbench.tsx`. It should calculate version trend rows, adapter SLA rows, overdue status, HTML, CSV, JSON, and a stable fingerprint.

- [x] **Step 4: Add UI import/export controls**

Add state and buttons in the batch archive controls:
- `趋势 SLA`
- `趋势 HTML`
- `趋势 JSON`
- `趋势 CSV`
- `SLA CSV`

Preview adapter rows with overdue or non-accepted status in the batch panel.

- [x] **Step 5: Verify**

Run:
- `npx vitest run desktop/src/App.test.ts desktop/src/ui/engineering-workbench.test.ts tests/engineering-engine-verifier.test.ts tests/engineering-archive-verifier.test.ts`
- `npm run lint`
- `npm --prefix desktop run build`
- `git diff --check`
- `npm run verify:engineering-engines -- --json`
