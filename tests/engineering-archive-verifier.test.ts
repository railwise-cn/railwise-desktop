import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type EngineeringBatchArchiveZipExportContext,
  type EngineeringBatchPackageItem,
  buildEngineeringArchiveAcceptanceFinalRegistration,
  buildEngineeringArchiveAcceptanceRemediationRecheckUpdate,
  buildEngineeringBatchArchiveReleaseCrossProjectAutoReview,
  buildEngineeringBatchArchiveReleaseCrossProjectBaselineComparison,
  buildEngineeringBatchArchiveReleasePortfolioDashboard,
  buildEngineeringBatchArchiveReleaseRecordExport,
  buildEngineeringBatchArchiveReleaseSlaReminderArchiveIngest,
  buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemFinalReceiptBatchSignoff,
  buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemFinalReceiptConfirmation,
  buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemFinalReceiptCrossPlatformReview,
  buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemFinalReceiptSignoffExternalSyncReceipt,
  buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemHttpReplayHistory,
  buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemHttpReplayUpdate,
  buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemImportPlan,
  buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemImportReceiptUpdate,
  buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemImportRectificationClosureUpdate,
  buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemImportRectificationLedger,
  buildEngineeringBatchArchiveTransferFinalAcceptanceArchiveDashboard,
  buildEngineeringBatchArchiveTransferFinalAcceptanceCrossProjectBaseline,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskClosureUpdate,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackage,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalReceiptReview,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalSignoff,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskLedger,
  buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskReissueHistory,
  buildEngineeringBatchArchiveTransferFinalAcceptanceRectificationAggregation,
  buildEngineeringBatchArchiveTransferFinalAcceptanceRectificationClosureUpdate,
  buildEngineeringBatchArchiveTransferFinalAcceptanceRegistrationCrossPlatformReview,
  buildEngineeringBatchArchiveTransferFinalAcceptanceRegistrationReceiptReview,
  buildEngineeringBatchArchiveTransferFinalAcceptanceTrendReport,
  buildEngineeringBatchArchiveTransferFinalSignoff,
  buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncReceipt,
  buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationClosureUpdate,
  buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation,
  buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff,
  buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt,
  buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate,
  buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationFinalAcceptanceRegistration,
  buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger,
  buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory,
  buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationLedger,
  buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationReissueHistory,
  buildEngineeringBatchArchiveTransferRectificationClosureUpdate,
  buildEngineeringBatchArchiveTransferRectificationLedger,
  buildEngineeringBatchArchiveTransferRectificationReissueHistory,
  buildEngineeringBatchArchiveTransferSignatureReceiptUpdate,
  buildEngineeringBatchArchiveTransferWorkflowTemplateExport,
  buildEngineeringBatchArchiveZipExport,
  buildEngineeringBatchExternalSystemHttpReplayQueue,
  buildEngineeringBatchExternalSystemHttpSubmissionAudit,
  buildEngineeringBatchExternalSystemImportReceiptReconciliation,
  buildEngineeringDeliverables,
  buildEngineeringEngineCommandPlan,
  buildEngineeringEnginePreflightReport,
  buildEngineeringEngineReview,
  loadEngineeringSampleInput,
  runEngineeringCalculation,
  verifyEngineeringArchiveZipImport,
} from "../desktop/src/ui/engineering-workbench";

const VERIFIER_SCRIPT = resolve("scripts/verify-engineering-archive.mjs");

describe("engineering archive verifier", () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "railwise-archive-"));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("accepts a real engineering archive ZIP with manifest, checksums, and upload fields", () => {
    const archivePath = writeArchive("valid.zip");
    const run = spawnSync(
      process.execPath,
      [VERIFIER_SCRIPT, archivePath, "--json", "--require-clean"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        maxBuffer: 5_000_000,
      },
    );

    expect(run.status, `${run.stderr}\n${run.stdout}`).toBe(0);

    const report = JSON.parse(run.stdout);
    expect(report.schema).toBe("railwise.engineeringArchive.verify.v1");
    expect(report.success).toBe(true);
    expect(report.summary.errors).toBe(0);
    expect(report.summary.requiredEntriesMissing).toBe(0);
    expect(report.summary.checksumRowsChecked).toBeGreaterThan(30);
    expect(report.archiveManifest.schema).toBe("railwise.engineering.batch.archiveManifest.v1");
    expect(report.externalUploadManifest.schema).toBe(
      "railwise.engineering.batch.externalUploadManifest.v1",
    );
    expect(report.externalSystemUploadAdapters.schema).toBe(
      "railwise.engineering.batch.externalSystemUploadAdapters.v1",
    );
    expect(report.externalSystemUploadAdapters.adapterIds).toEqual([
      "owner_archive_dms",
      "supervision_document_register",
      "generic_document_management",
    ]);
    expect(report.archiveInspectionReport.schema).toBe(
      "railwise.engineering.batch.archiveInspectionReport.v1",
    );
    expect(report.archiveInspectionReport.summary.readyRequiredEntryCount).toBeGreaterThan(5);
    expect(report.archiveInspectionReport.sections).toContain("必备文件检查");
    expect(report.archiveInspectionSignoff.schema).toBe(
      "railwise.engineering.batch.archiveInspectionSignoff.v1",
    );
    expect(report.archiveInspectionSignoff.archiveInspectionFingerprint).toBe(
      report.archiveInspectionReport.archiveInspectionFingerprint,
    );
    expect(report.archiveInspectionSignoff.signatureStatus).toBe("signed");
    expect(report.archiveInspectionSignoff.signoffFingerprint).toMatch(/^fnv1a32:/);
    expect(report.archiveReleaseRecord.schema).toBe(
      "railwise.engineering.batch.archiveReleaseRecord.v1",
    );
    expect(report.archiveReleaseRecord.releaseStatus).toBe("released");
    expect(report.archiveReleaseRecord.releaseVersion).toMatch(/^AR-20260603-/);
    expect(report.archiveReleaseRecord.archiveInspectionFingerprint).toBe(
      report.archiveInspectionReport.archiveInspectionFingerprint,
    );
    expect(report.archiveReleaseRecord.archiveInspectionSignoffFingerprint).toBe(
      report.archiveInspectionSignoff.signoffFingerprint,
    );
    expect(report.archiveReleaseRecord.externalUploadManifestFingerprint).toBe(
      report.externalUploadManifest.manifestFingerprint,
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_inspection_signoff",
        artifactPath: "audit/archive-inspection-signoff.json",
      }),
    );
    expect(report.acceptanceReview.schema).toBe("railwise.engineeringArchive.acceptanceReview.v1");
    expect(report.acceptanceReview.handoverDecision).toBe("accept");
    expect(report.acceptanceReview.acceptanceStatusLabel).toBe("可接收");
    expect(report.acceptanceReview.blockingIssueCount).toBe(0);
    expect(report.acceptanceReview.actionIssueCount).toBe(0);
    expect(report.acceptanceReview.nextActions).toEqual([
      "按发布版本、发布指纹和清单指纹完成归档接收登记。",
    ]);
    expect(report.acceptanceReview.rows).toContainEqual(
      expect.objectContaining({
        gateId: "release_record",
        evidencePath: "batch/archive-release-record.json",
        evidenceStatus: "verified",
        action: "该关口已具备交付条件，移交时按指纹核对原始文件。",
      }),
    );
    expect(report.externalUploadManifest.archiveFolderName).toBe("20260603-验收批次-工程复核归档");
    expect(report.externalUploadManifest.files.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining([
        "audit/archive-inspection-signoff.html",
        "audit/archive-inspection-signoff.json",
        "audit/archive-inspection-signoff.csv",
      ]),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "audit/archive-inspection-signoff.json",
        sourceFieldKey: "documentType",
        value: "归档抽检签发记录",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "audit/archive-inspection-signoff.html",
        sourceFieldKey: "path",
        value: "audit/archive-inspection-signoff.html",
      }),
    );
    expect(report.externalUploadFields).toContain("audit_fingerprint");
    expect(report.externalUploadFields).toContain("archive_package_name");
  });

  it("verifies structured engine review artifacts in archive ZIP manifests and upload coverage", () => {
    const input = loadEngineeringSampleInput("distance_azimuth");
    const result = runEngineeringCalculation("distance_azimuth", input);
    const plan = buildEngineeringEngineCommandPlan("proj_transform_points", {
      operation: "+proj=utm +zone=32 +ellps=GRS80",
      pointsText: "12 55 0 0 P1",
    });
    const engineReview = buildEngineeringEngineReview(plan, {
      binary: "cct",
      args: plan.args,
      success: true,
      exit_code: 0,
      stdout: "691875.6321 6098907.8250 0.0000 0.0000 P1 control",
      stderr: "",
      generatedAt: "2026-06-03T06:20:00.000Z",
    });
    const deliverables = buildEngineeringDeliverables(result, {
      inputFormat: "json",
      inputText: JSON.stringify(input, null, 2),
      sourceName: "distance-engine.json",
      exportedAt: "2026-06-03T06:00:00.000Z",
      engineReviews: [engineReview],
    });
    const archive = buildEngineeringBatchArchiveZipExport(
      [{ id: "distance-engine-run", deliverables }],
      {
        batchName: "引擎证据批次",
        exportedAt: "2026-06-03T06:30:00.000Z",
        preparedBy: "王工",
        reviewSignoff: {
          reviewer: "李工",
          conclusion: "approved",
          remarks: "引擎审查证据归档验收样例。",
          signedAt: "2026-06-03T06:30:00.000Z",
        },
      },
    );
    const archivePath = join(workDir, "engine-review.zip");
    writeFileSync(archivePath, Buffer.from(archive.base64, "base64"));

    const run = spawnSync(
      process.execPath,
      [VERIFIER_SCRIPT, archivePath, "--json", "--require-clean"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        maxBuffer: 5_000_000,
      },
    );

    expect(run.status, `${run.stderr}\n${run.stdout}`).toBe(0);
    const report = JSON.parse(run.stdout);
    expect(report.summary.engineReviewCatalogPresent).toBe(true);
    expect(report.summary.engineReviewRowsChecked).toBe(1);
    expect(report.engineReviewCatalog).toMatchObject({
      schema: "railwise.engineering.batch.engineReviewCatalog.v1",
      reviewCount: 1,
      totalRowCount: 1,
    });
    expect(report.externalUploadManifest.files.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining([
        "batch/engine-review-catalog.json",
        "runs/distance-engine-run/engine-reviews.json",
        "runs/distance-engine-run/engine-review-catalog.json",
      ]),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "runs/distance-engine-run/engine-reviews.json",
        sourceFieldKey: "documentType",
        value: "专业引擎审查成果",
      }),
    );
  });

  it("verifies archived engineering engine preflight evidence and upload coverage", () => {
    const preflight = buildEngineeringEnginePreflightReport(
      [
        {
          id: "proj",
          label: "PROJ",
          available: true,
          installHint: "brew install proj",
          binaries: [
            {
              name: "projinfo",
              available: true,
              path: "/opt/railwise/bin/projinfo",
              version: "Rel. 9.4.0",
            },
            { name: "cct", available: true, path: "/opt/railwise/bin/cct", version: "Rel. 9.4.0" },
          ],
        },
        {
          id: "gdal",
          label: "GDAL / OGR",
          available: false,
          installHint: "brew install gdal",
          binaries: [
            { name: "ogrinfo", available: false },
            { name: "ogr2ogr", available: false },
          ],
        },
        {
          id: "pdal",
          label: "PDAL",
          available: true,
          installHint: "brew install pdal",
          binaries: [
            {
              name: "pdal",
              available: true,
              path: "/opt/railwise/bin/pdal",
              version: "PDAL 2.6.3",
            },
          ],
        },
      ],
      { batchName: "引擎预检验收批次", generatedAt: "2026-06-03T06:15:00.000Z" },
    );
    const archivePath = writeArchive("engine-preflight.zip", undefined, {
      batchName: "引擎预检验收批次",
      enginePreflight: preflight,
    });

    const run = spawnSync(
      process.execPath,
      [VERIFIER_SCRIPT, archivePath, "--json", "--require-clean"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        maxBuffer: 5_000_000,
      },
    );

    expect(run.status, `${run.stderr}\n${run.stdout}`).toBe(0);
    const report = JSON.parse(run.stdout);
    expect(report.summary.enginePreflightPresent).toBe(true);
    expect(report.summary.enginePreflightRowsChecked).toBe(5);
    expect(report.summary.enginePreflightMissingBinaryCount).toBe(2);
    expect(report.enginePreflight).toMatchObject({
      schema: "railwise.engineering.enginePreflight.v1",
      batchName: "引擎预检验收批次",
      binaryCount: 5,
      missingBinaryCount: 2,
    });
    expect(report.externalUploadManifest.files.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining([
        "batch/engine-preflight.md",
        "batch/engine-preflight.csv",
        "batch/engine-preflight.json",
      ]),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/engine-preflight.json",
        sourceFieldKey: "documentType",
        value: "专业引擎环境预检报告",
      }),
    );
  });

  it("verifies archived professional engine acceptance packages and upload coverage", () => {
    const input = loadEngineeringSampleInput("distance_azimuth");
    const result = runEngineeringCalculation("distance_azimuth", input);
    const plan = buildEngineeringEngineCommandPlan("proj_transform_points", {
      operation: "+proj=utm +zone=32 +ellps=GRS80",
      pointsText: "12 55 0 0 P1",
    });
    const engineReview = buildEngineeringEngineReview(plan, {
      binary: "cct",
      args: plan.args,
      success: true,
      exit_code: 0,
      stdout: "691875.6321 6098907.8250 0.0000 0.0000 P1 control",
      stderr: "",
      generatedAt: "2026-06-03T06:20:00.000Z",
    });
    const enginePreflight = buildEngineeringEnginePreflightReport(
      [
        {
          id: "proj",
          label: "PROJ",
          available: true,
          installHint: "brew install proj",
          binaries: [
            {
              name: "projinfo",
              available: true,
              path: "/opt/railwise/bin/projinfo",
              version: "Rel. 9.4.0",
            },
            { name: "cct", available: true, path: "/opt/railwise/bin/cct", version: "Rel. 9.4.0" },
          ],
        },
        {
          id: "gdal",
          label: "GDAL / OGR",
          available: true,
          installHint: "brew install gdal",
          binaries: [
            {
              name: "ogrinfo",
              available: true,
              path: "/opt/railwise/bin/ogrinfo",
              version: "GDAL 3.8.5",
            },
            {
              name: "ogr2ogr",
              available: true,
              path: "/opt/railwise/bin/ogr2ogr",
              version: "GDAL 3.8.5",
            },
          ],
        },
        {
          id: "pdal",
          label: "PDAL",
          available: true,
          installHint: "brew install pdal",
          binaries: [
            {
              name: "pdal",
              available: true,
              path: "/opt/railwise/bin/pdal",
              version: "PDAL 2.6.3",
            },
          ],
        },
      ],
      { batchName: "引擎工作台验收批次", generatedAt: "2026-06-03T06:15:00.000Z" },
    );
    const deliverables = buildEngineeringDeliverables(result, {
      inputFormat: "json",
      inputText: JSON.stringify(input, null, 2),
      sourceName: "distance-engine-acceptance.json",
      exportedAt: "2026-06-03T06:00:00.000Z",
      engineReviews: [engineReview],
    });
    const archive = buildEngineeringBatchArchiveZipExport(
      [{ id: "distance-engine-acceptance-run", deliverables }],
      {
        batchName: "引擎工作台验收批次",
        exportedAt: "2026-06-03T06:30:00.000Z",
        preparedBy: "王工",
        enginePreflight,
        reviewSignoff: {
          reviewer: "李工",
          conclusion: "approved",
          remarks: "引擎工作台验收证据归档样例。",
          signedAt: "2026-06-03T06:30:00.000Z",
        },
      },
    );
    const archivePath = join(workDir, "engine-acceptance.zip");
    writeFileSync(archivePath, Buffer.from(archive.base64, "base64"));

    const run = spawnSync(
      process.execPath,
      [VERIFIER_SCRIPT, archivePath, "--json", "--require-clean"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        maxBuffer: 5_000_000,
      },
    );

    expect(run.status, `${run.stderr}\n${run.stdout}`).toBe(0);
    const report = JSON.parse(run.stdout);
    expect(report.summary.engineAcceptancePresent).toBe(true);
    expect(report.summary.engineAcceptanceStatus).toBe("pending_review");
    expect(report.engineAcceptance).toMatchObject({
      schema: "railwise.engineering.engineAcceptance.v1",
      batchName: "引擎工作台验收批次",
      acceptanceStatus: "pending_review",
      binaryCount: 5,
      availableBinaryCount: 5,
      missingBinaryCount: 0,
      reviewCount: 1,
    });
    expect(report.externalUploadManifest.files.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining([
        "batch/engine-acceptance.md",
        "batch/engine-acceptance.csv",
        "batch/engine-acceptance.json",
      ]),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/engine-acceptance.json",
        sourceFieldKey: "documentType",
        value: "专业引擎工作台验收",
      }),
    );
  });

  it("accepts archives that use a project-specific external system adapter template", () => {
    const archivePath = writeArchive("custom-adapter.zip", undefined, {
      externalSystemUploadAdapters: [
        {
          adapterId: "owner_custom_archive_portal",
          targetSystem: "业主自定义档案门户",
          title: "业主自定义字段适配",
          description: "按项目档案门户字段输出上传行。",
          fieldMappings: [
            {
              recordType: "archive",
              externalFieldKey: "portal_batch_name",
              externalFieldLabel: "门户批次名称",
              sourceFieldKey: "batch_name",
              required: true,
              description: "项目门户批次检索字段。",
            },
            {
              recordType: "file",
              externalFieldKey: "portal_file_path",
              externalFieldLabel: "门户文件路径",
              sourceFieldKey: "path",
              required: true,
              description: "ZIP 内相对路径。",
            },
          ],
        },
      ],
    });
    const run = spawnSync(
      process.execPath,
      [VERIFIER_SCRIPT, archivePath, "--json", "--require-clean"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        maxBuffer: 5_000_000,
      },
    );

    expect(run.status, `${run.stderr}\n${run.stdout}`).toBe(0);

    const report = JSON.parse(run.stdout);
    expect(report.success).toBe(true);
    expect(report.externalSystemUploadAdapters.adapterIds).toEqual(["owner_custom_archive_portal"]);
    expect(report.summary.externalSystemAdapters).toBe(1);
  });

  it("prints archive acceptance decision in the human-readable report", () => {
    const archivePath = writeArchive("human-report.zip");
    const run = spawnSync(process.execPath, [VERIFIER_SCRIPT, archivePath, "--require-clean"], {
      cwd: resolve("."),
      encoding: "utf8",
      maxBuffer: 5_000_000,
    });

    expect(run.status, `${run.stderr}\n${run.stdout}`).toBe(0);
    expect(run.stdout).toContain("Acceptance: 可接收 (accept)");
    expect(run.stdout).toContain("Next action: 按发布版本、发布指纹和清单指纹完成归档接收登记。");
  });

  it("verifies archived release portfolio dashboards and cross-project baselines", () => {
    const archivePath = writeArchive("release-monitoring.zip", undefined, {}, true);
    const run = spawnSync(
      process.execPath,
      [VERIFIER_SCRIPT, archivePath, "--json", "--require-clean"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        maxBuffer: 5_000_000,
      },
    );

    expect(run.status, `${run.stderr}\n${run.stdout}`).toBe(0);

    const report = JSON.parse(run.stdout);
    expect(report.success).toBe(true);
    expect(report.archiveReleasePortfolioDashboard.schema).toBe(
      "railwise.engineering.batch.archiveReleasePortfolioDashboard.v1",
    );
    expect(report.archiveReleasePortfolioDashboard.dashboardFingerprint).toMatch(/^fnv1a32:/);
    expect(report.archiveReleaseCrossProjectBaselineComparison.schema).toBe(
      "railwise.engineering.batch.archiveReleaseCrossProjectBaselineComparison.v1",
    );
    expect(report.archiveReleaseCrossProjectBaselineComparison.comparisonFingerprint).toMatch(
      /^fnv1a32:/,
    );
    expect(report.archiveReleaseCrossProjectAutoReview.schema).toBe(
      "railwise.engineering.batch.archiveReleaseCrossProjectAutoReview.v1",
    );
    expect(report.archiveReleaseCrossProjectAutoReview.sourceComparisonFingerprint).toBe(
      report.archiveReleaseCrossProjectBaselineComparison.comparisonFingerprint,
    );
    expect(report.archiveReleaseCrossProjectAutoReview.reviewFingerprint).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferWorkflowTemplate.schema).toBe(
      "railwise.engineering.batch.archiveTransferWorkflowTemplate.v1",
    );
    expect(report.archiveTransferWorkflowTemplate.receiverCount).toBe(4);
    expect(report.archiveTransferWorkflowTemplate.workflowRowCount).toBeGreaterThan(0);
    expect(report.archiveTransferWorkflowTemplate.signatureTemplateRowCount).toBeGreaterThan(0);
    expect(report.archiveTransferWorkflowTemplate.templateFingerprint).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferSignatureReceiptUpdate.schema).toBe(
      "railwise.engineering.batch.archiveTransferSignatureReceiptUpdate.v1",
    );
    expect(report.archiveTransferSignatureReceiptUpdate.updatedTemplateFingerprint).toBe(
      report.archiveTransferWorkflowTemplate.templateFingerprint,
    );
    expect(report.archiveTransferSignatureReceiptUpdate.sourceTemplateFingerprint).toMatch(
      /^fnv1a32:/,
    );
    expect(report.archiveTransferSignatureReceiptUpdate.updateFingerprint).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferRectificationLedger.schema).toBe(
      "railwise.engineering.batch.archiveTransferRectificationLedger.v1",
    );
    expect(report.archiveTransferRectificationLedger.sourceReceiptUpdateFingerprint).toBe(
      report.archiveTransferSignatureReceiptUpdate.updateFingerprint,
    );
    expect(report.archiveTransferRectificationLedger.ledgerFingerprint).toBe(
      report.archiveTransferRectificationClosureUpdate.updatedLedgerFingerprint,
    );
    expect(report.archiveTransferRectificationClosureUpdate.schema).toBe(
      "railwise.engineering.batch.archiveTransferRectificationClosureUpdate.v1",
    );
    expect(report.archiveTransferRectificationClosureUpdate.sourceLedgerFingerprint).toMatch(
      /^fnv1a32:/,
    );
    expect(report.archiveTransferRectificationClosureUpdate.updateFingerprint).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferRectificationReissueHistory.schema).toBe(
      "railwise.engineering.batch.archiveTransferRectificationReissueHistory.v1",
    );
    expect(report.archiveTransferRectificationReissueHistory.roundCount).toBe(1);
    expect(report.archiveTransferRectificationReissueHistory.finalLedgerFingerprint).toBe(
      report.archiveTransferRectificationLedger.ledgerFingerprint,
    );
    expect(report.archiveTransferRectificationReissueHistory.historyFingerprint).toMatch(
      /^fnv1a32:/,
    );
    expect(report.archiveTransferFinalSignoff.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalSignoff.v1",
    );
    expect(report.archiveTransferFinalSignoff.sourceLedgerFingerprint).toBe(
      report.archiveTransferRectificationLedger.ledgerFingerprint,
    );
    expect(report.archiveTransferFinalSignoff.sourceReissueHistoryFingerprint).toBe(
      report.archiveTransferRectificationReissueHistory.historyFingerprint,
    );
    expect(report.archiveTransferFinalSignoff.signoffFingerprint).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferFinalSignoffExternalSyncReceipt.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncReceipt.v1",
    );
    expect(report.archiveTransferFinalSignoffExternalSyncReceipt.sourceSignoffFingerprint).toBe(
      report.archiveTransferFinalSignoff.signoffFingerprint,
    );
    expect(report.archiveTransferFinalSignoffExternalSyncReceipt.sourceLedgerFingerprint).toBe(
      report.archiveTransferRectificationLedger.ledgerFingerprint,
    );
    expect(report.archiveTransferFinalSignoffExternalSyncReceipt.receiptFingerprint).toMatch(
      /^fnv1a32:/,
    );
    expect(report.archiveTransferFinalSignoffExternalSyncRectificationLedger.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationLedger.v1",
    );
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationLedger.sourceReceiptFingerprint,
    ).toBe(report.archiveTransferFinalSignoffExternalSyncReceipt.receiptFingerprint);
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationLedger.sourceSignoffFingerprint,
    ).toBe(report.archiveTransferFinalSignoff.signoffFingerprint);
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationLedger.sourceLedgerFingerprint,
    ).toBe(report.archiveTransferRectificationLedger.ledgerFingerprint);
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationLedger.rectificationFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate.v1",
    );
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate
        .updatedLedgerFingerprint,
    ).toBe(
      report.archiveTransferFinalSignoffExternalSyncRectificationLedger.rectificationFingerprint,
    );
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate.updateFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferFinalSignoffExternalSyncRectificationReissueHistory.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationReissueHistory.v1",
    );
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationReissueHistory
        .sourceReceiptFingerprint,
    ).toBe(report.archiveTransferFinalSignoffExternalSyncReceipt.receiptFingerprint);
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationReissueHistory
        .sourceSignoffFingerprint,
    ).toBe(report.archiveTransferFinalSignoff.signoffFingerprint);
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationReissueHistory
        .finalLedgerFingerprint,
    ).toBe(
      report.archiveTransferFinalSignoffExternalSyncRectificationLedger.rectificationFingerprint,
    );
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationReissueHistory.rows[0]
        .closureUpdateFingerprint,
    ).toBe(
      report.archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate.updateFingerprint,
    );
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationReissueHistory.historyFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation.schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation.v1",
    );
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation
        .sourceHistoryFingerprint,
    ).toBe(
      report.archiveTransferFinalSignoffExternalSyncRectificationReissueHistory.historyFingerprint,
    );
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation
        .finalLedgerFingerprint,
    ).toBe(
      report.archiveTransferFinalSignoffExternalSyncRectificationLedger.rectificationFingerprint,
    );
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation
        .confirmationFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff
        .schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff.v1",
    );
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff
        .sourceConfirmationFingerprint,
    ).toBe(
      report.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation
        .confirmationFingerprint,
    );
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff
        .signatureStatus,
    ).toBe("signed");
    expect(
      report.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff
        .signoffFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt
        .schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt.v1",
    );
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt
        .sourceSignoffFingerprint,
    ).toBe(
      report.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff
        .signoffFingerprint,
    );
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt
        .acceptedCount,
    ).toBe(
      report.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff
        .fileCount,
    );
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt
        .receiptFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger
        .schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger.v1",
    );
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger
        .sourceReceiptFingerprint,
    ).toBe(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt
        .receiptFingerprint,
    );
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger
        .issueCount,
    ).toBe(0);
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger
        .followUpCount,
    ).toBe(0);
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger
        .rectificationFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate
        .schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate.v1",
    );
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate
        .sourceLedgerFingerprint,
    ).toBe(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger
        .rectificationFingerprint,
    );
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate
        .updatedLedgerFingerprint,
    ).toBe(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger
        .rectificationFingerprint,
    );
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate
        .closedCount,
    ).toBe(0);
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate
        .stillOpenCount,
    ).toBe(0);
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate
        .updateFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory
        .schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory.v1",
    );
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory
        .finalLedgerFingerprint,
    ).toBe(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger
        .rectificationFingerprint,
    );
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory
        .rows[0].closureUpdateFingerprint,
    ).toBe(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate
        .updateFingerprint,
    );
    expect(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory
        .historyFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferFinalAcceptanceRegistration.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationFinalAcceptanceRegistration.v1",
    );
    expect(report.archiveTransferFinalAcceptanceRegistration.registrationStatus).toBe("registered");
    expect(report.archiveTransferFinalAcceptanceRegistration.sourceHistoryFingerprint).toBe(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory
        .historyFingerprint,
    );
    expect(report.archiveTransferFinalAcceptanceRegistration.finalLedgerFingerprint).toBe(
      report
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory
        .finalLedgerFingerprint,
    );
    expect(report.archiveTransferFinalAcceptanceRegistration.signedReceipt.signatureStatus).toBe(
      "signed",
    );
    expect(report.archiveTransferFinalAcceptanceRegistration.registrationFingerprint).toMatch(
      /^fnv1a32:/,
    );
    expect(report.archiveTransferFinalAcceptanceRegistrationReceiptReview.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceRegistrationReceiptReview.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceRegistrationReceiptReview.sourceRegistrationFingerprint,
    ).toBe(report.archiveTransferFinalAcceptanceRegistration.registrationFingerprint);
    expect(report.archiveTransferFinalAcceptanceRegistrationReceiptReview.reviewStatus).toBe(
      "accepted",
    );
    expect(
      report.archiveTransferFinalAcceptanceRegistrationReceiptReview.reviewFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferFinalAcceptanceRegistrationCrossPlatformReview.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceRegistrationCrossPlatformReview.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceRegistrationCrossPlatformReview
        .sourceRegistrationFingerprint,
    ).toBe(report.archiveTransferFinalAcceptanceRegistration.registrationFingerprint);
    expect(
      report.archiveTransferFinalAcceptanceRegistrationCrossPlatformReview
        .sourceReceiptReviewFingerprints,
    ).toContain(report.archiveTransferFinalAcceptanceRegistrationReceiptReview.reviewFingerprint);
    expect(report.archiveTransferFinalAcceptanceRegistrationCrossPlatformReview.reviewStatus).toBe(
      "passed",
    );
    expect(report.archiveTransferFinalAcceptanceRegistrationCrossPlatformReview.platformCount).toBe(
      2,
    );
    expect(
      report.archiveTransferFinalAcceptanceRegistrationCrossPlatformReview.reviewFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferFinalAcceptanceArchiveDashboard.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceArchiveDashboard.v1",
    );
    expect(report.archiveTransferFinalAcceptanceArchiveDashboard.registrationFingerprint).toBe(
      report.archiveTransferFinalAcceptanceRegistration.registrationFingerprint,
    );
    expect(report.archiveTransferFinalAcceptanceArchiveDashboard.receiptReviewFingerprint).toBe(
      report.archiveTransferFinalAcceptanceRegistrationReceiptReview.reviewFingerprint,
    );
    expect(
      report.archiveTransferFinalAcceptanceArchiveDashboard.crossPlatformReviewFingerprint,
    ).toBe(report.archiveTransferFinalAcceptanceRegistrationCrossPlatformReview.reviewFingerprint);
    expect(report.archiveTransferFinalAcceptanceArchiveDashboard.dashboardStatus).toBe(
      "ready_for_archive",
    );
    expect(report.archiveTransferFinalAcceptanceArchiveDashboard.dashboardFingerprint).toMatch(
      /^fnv1a32:/,
    );
    expect(report.archiveTransferFinalAcceptanceCrossProjectBaseline.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceCrossProjectBaseline.v1",
    );
    expect(report.archiveTransferFinalAcceptanceCrossProjectBaseline.projectCount).toBe(1);
    expect(report.archiveTransferFinalAcceptanceCrossProjectBaseline.stableProjectCount).toBe(1);
    expect(report.archiveTransferFinalAcceptanceCrossProjectBaseline.rows).toContainEqual(
      expect.objectContaining({
        projectName: "verifier 一标段",
        baselineRisk: "stable",
        sourceDashboardFingerprint:
          report.archiveTransferFinalAcceptanceArchiveDashboard.dashboardFingerprint,
      }),
    );
    expect(report.archiveTransferFinalAcceptanceCrossProjectBaseline.baselineFingerprint).toMatch(
      /^fnv1a32:/,
    );
    expect(report.archiveTransferFinalAcceptanceTrendReport.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceTrendReport.v1",
    );
    expect(report.archiveTransferFinalAcceptanceTrendReport.baselineCount).toBe(1);
    expect(report.archiveTransferFinalAcceptanceTrendReport.latestProjectCount).toBe(
      report.archiveTransferFinalAcceptanceCrossProjectBaseline.projectCount,
    );
    expect(report.archiveTransferFinalAcceptanceTrendReport.sourceBaselineFingerprints).toContain(
      report.archiveTransferFinalAcceptanceCrossProjectBaseline.baselineFingerprint,
    );
    expect(report.archiveTransferFinalAcceptanceTrendReport.baselineTrendRows).toContainEqual(
      expect.objectContaining({
        baselineFingerprint:
          report.archiveTransferFinalAcceptanceCrossProjectBaseline.baselineFingerprint,
      }),
    );
    expect(report.archiveTransferFinalAcceptanceTrendReport.projectTrendRows).toContainEqual(
      expect.objectContaining({
        projectName: "verifier 一标段",
        latestBaselineRisk: "stable",
        riskTrend: "stable",
      }),
    );
    expect(report.archiveTransferFinalAcceptanceTrendReport.trendFingerprint).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferFinalAcceptanceRectificationAggregation.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceRectificationAggregation.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceRectificationAggregation.sourceTrendFingerprint,
    ).toBe(report.archiveTransferFinalAcceptanceTrendReport.trendFingerprint);
    expect(report.archiveTransferFinalAcceptanceRectificationAggregation.aggregationStatus).toBe(
      "ready",
    );
    expect(report.archiveTransferFinalAcceptanceRectificationAggregation.issueCount).toBe(0);
    expect(
      report.archiveTransferFinalAcceptanceRectificationAggregation.aggregationFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferFinalAcceptanceRectificationClosureUpdate.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceRectificationClosureUpdate.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceRectificationClosureUpdate.sourceAggregationFingerprint,
    ).toBe(report.archiveTransferFinalAcceptanceRectificationAggregation.aggregationFingerprint);
    expect(
      report.archiveTransferFinalAcceptanceRectificationClosureUpdate.updatedAggregationFingerprint,
    ).toBe(
      report.archiveTransferFinalAcceptanceRectificationClosureUpdate.updatedAggregation
        .aggregationFingerprint,
    );
    expect(report.archiveTransferFinalAcceptanceRectificationClosureUpdate.closedCount).toBe(0);
    expect(report.archiveTransferFinalAcceptanceRectificationClosureUpdate.stillOpenCount).toBe(0);
    expect(report.archiveTransferFinalAcceptanceRectificationClosureUpdate.missingUpdateCount).toBe(
      0,
    );
    expect(
      report.archiveTransferFinalAcceptanceRectificationClosureUpdate.unmatchedUpdateCount,
    ).toBe(0);
    expect(
      report.archiveTransferFinalAcceptanceRectificationClosureUpdate.updateFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferFinalAcceptanceIngestRiskLedger.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskLedger.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskLedger
        .sourceRectificationClosureUpdateFingerprint,
    ).toBe(report.archiveTransferFinalAcceptanceRectificationClosureUpdate.updateFingerprint);
    expect(report.archiveTransferFinalAcceptanceIngestRiskLedger.riskCount).toBe(0);
    expect(report.archiveTransferFinalAcceptanceIngestRiskLedger.ledgerFingerprint).toMatch(
      /^fnv1a32:/,
    );
    expect(report.archiveTransferFinalAcceptanceIngestRiskClosureUpdate.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskClosureUpdate.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskClosureUpdate.sourceRiskLedgerFingerprint,
    ).toBe(report.archiveTransferFinalAcceptanceIngestRiskLedger.ledgerFingerprint);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskClosureUpdate.updatedRiskLedgerFingerprint,
    ).toBe(
      report.archiveTransferFinalAcceptanceIngestRiskClosureUpdate.updatedRiskLedger
        .ledgerFingerprint,
    );
    expect(report.archiveTransferFinalAcceptanceIngestRiskClosureUpdate.closedCount).toBe(0);
    expect(report.archiveTransferFinalAcceptanceIngestRiskClosureUpdate.stillOpenCount).toBe(0);
    expect(report.archiveTransferFinalAcceptanceIngestRiskClosureUpdate.missingUpdateCount).toBe(0);
    expect(report.archiveTransferFinalAcceptanceIngestRiskClosureUpdate.unmatchedUpdateCount).toBe(
      0,
    );
    expect(report.archiveTransferFinalAcceptanceIngestRiskClosureUpdate.updateFingerprint).toMatch(
      /^fnv1a32:/,
    );
    expect(report.archiveTransferFinalAcceptanceIngestRiskReissueHistory.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskReissueHistory.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskReissueHistory.initialRiskLedgerFingerprint,
    ).toBe(report.archiveTransferFinalAcceptanceIngestRiskLedger.ledgerFingerprint);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskReissueHistory.finalRiskLedgerFingerprint,
    ).toBe(
      report.archiveTransferFinalAcceptanceIngestRiskClosureUpdate.updatedRiskLedger
        .ledgerFingerprint,
    );
    expect(report.archiveTransferFinalAcceptanceIngestRiskReissueHistory.roundCount).toBe(1);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskReissueHistory.historyFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferFinalAcceptanceIngestRiskFinalSignoff.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalSignoff.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalSignoff.sourceHistoryFingerprint,
    ).toBe(report.archiveTransferFinalAcceptanceIngestRiskReissueHistory.historyFingerprint);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalSignoff.finalRiskLedgerFingerprint,
    ).toBe(
      report.archiveTransferFinalAcceptanceIngestRiskReissueHistory.finalRiskLedgerFingerprint,
    );
    expect(report.archiveTransferFinalAcceptanceIngestRiskFinalSignoff.signoffStatus).toBe(
      "signed",
    );
    expect(report.archiveTransferFinalAcceptanceIngestRiskFinalSignoff.signoffFingerprint).toMatch(
      /^fnv1a32:/,
    );
    expect(report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview.sourceSignoffFingerprint,
    ).toBe(report.archiveTransferFinalAcceptanceIngestRiskFinalSignoff.signoffFingerprint);
    expect(report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview.reviewStatus).toBe(
      "accepted",
    );
    expect(report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview.acceptedCount).toBe(1);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview.reviewFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview.schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview
        .sourceSignoffFingerprint,
    ).toBe(report.archiveTransferFinalAcceptanceIngestRiskFinalSignoff.signoffFingerprint);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview.reviewStatus,
    ).toBe("passed");
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview.platformCount,
    ).toBe(2);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview
        .reviewFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate
        .sourceCrossPlatformReviewFingerprint,
    ).toBe(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview
        .reviewFingerprint,
    );
    expect(report.archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate.gateStatus).toBe(
      "passed",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate.failedCriteria,
    ).toEqual([]);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate.gateFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage
        .sourceCrossPlatformReviewFingerprint,
    ).toBe(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview
        .reviewFingerprint,
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage.evidenceCount,
    ).toBe(2);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage.rawSourceCount,
    ).toBe(2);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage.acceptedCount,
    ).toBe(2);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage.rows,
    ).toContainEqual(
      expect.objectContaining({
        sourceName: "verifier-ingest-risk-final-dms-receipt.csv",
        reviewFingerprint:
          report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview
            .sourceReceiptReviewFingerprints[1],
        sourceText: expect.stringContaining("入库风险终态签发已同步入库"),
      }),
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage.packageFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.schema).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.sourceGateFingerprint,
    ).toBe(report.archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate.gateFingerprint);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage
        .sourceReceiptEvidencePackageFingerprint,
    ).toBe(
      report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage.packageFingerprint,
    );
    expect(report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.proofStatus).toBe(
      "ready_for_handover",
    );
    expect(report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.handoverDecision).toBe(
      "handover_ready",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.requiredArtifactCount,
    ).toBe(4);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.readyArtifactCount,
    ).toBe(4);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.blockedArtifactCount,
    ).toBe(0);
    expect(report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_ingest_risk_final_receipt_evidence_package",
        sourceFingerprint:
          report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage
            .packageFingerprint,
        handoverStatus: "ready",
      }),
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.proofFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution.schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution
        .sourceProofFingerprint,
    ).toBe(report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.proofFingerprint);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution.fileCount,
    ).toBe(3);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution.sentCount,
    ).toBe(3);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution
        .distributionFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt.schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt
        .sourceDistributionFingerprint,
    ).toBe(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution
        .distributionFingerprint,
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt
        .acceptedCount,
    ).toBe(3);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt
        .followUpCount,
    ).toBe(0);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt
        .receiptFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview
        .schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview.v1",
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview
        .sourceDistributionFingerprint,
    ).toBe(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution
        .distributionFingerprint,
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview
        .sourceReceiptFingerprints,
    ).toContain(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt
        .receiptFingerprint,
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview
        .reviewStatus,
    ).toBe("needs_review");
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview
        .platformCount,
    ).toBe(2);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview
        .missingPlatformNames,
    ).toEqual(["业主档案门户"]);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview
        .statusMismatchCount,
    ).toBe(1);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview
        .checksumMismatchCount,
    ).toBe(1);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview
        .reviewFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate
        .schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate
        .sourceDistributionFingerprint,
    ).toBe(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution
        .distributionFingerprint,
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate
        .sourceCrossPlatformReviewFingerprint,
    ).toBe(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview
        .reviewFingerprint,
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate
        .sourceReceiptFingerprints,
    ).toContain(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt
        .receiptFingerprint,
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate
        .gateStatus,
    ).toBe("blocked");
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate
        .releaseStatus,
    ).toBe("blocked_by_proof_receipt");
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate
        .failedCriteria,
    ).toEqual(
      expect.arrayContaining(["required_platform_receipts", "no_blocking_cross_platform_issues"]),
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate
        .passedCriteria,
    ).toContain("proof_package_distributed");
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate
        .gateFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff
        .schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff.v1",
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff
        .sourceReleaseGateFingerprint,
    ).toBe(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate
        .gateFingerprint,
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff
        .sourceCrossPlatformReviewFingerprint,
    ).toBe(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview
        .reviewFingerprint,
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff
        .signatureStatus,
    ).toBe("blocked");
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff
        .releaseStatus,
    ).toBe("blocked_by_proof_receipt");
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff
        .fileCount,
    ).toBe(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview
        .rows.length,
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff
        .blockingFileCount,
    ).toBeGreaterThan(0);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff
        .signoffFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt
        .schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt.v1",
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt
        .sourceSignoffFingerprint,
    ).toBe(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff
        .signoffFingerprint,
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt
        .sourceReleaseGateFingerprint,
    ).toBe(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate
        .gateFingerprint,
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt
        .fileCount,
    ).toBe(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff
        .fileCount,
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt
        .acceptedCount,
    ).toBe(1);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt
        .pendingCount,
    ).toBe(1);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt
        .unmatchedReceiptCount,
    ).toBe(1);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt
        .invalidAcceptedCount,
    ).toBe(1);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt
        .receiptFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_release_portfolio_dashboard",
        artifactPath: "batch/archive-release-portfolio-dashboard.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_release_cross_project_baseline",
        artifactPath: "batch/archive-release-cross-project-baseline.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_release_cross_project_auto_review",
        artifactPath: "batch/archive-release-cross-project-auto-review.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_workflow_template",
        artifactPath: "batch/archive-transfer-workflow-template.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_signature_receipt_update",
        artifactPath: "batch/archive-transfer-signature-receipt-update.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_rectification_ledger",
        artifactPath: "batch/archive-transfer-rectification-ledger.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_rectification_closure_update",
        artifactPath: "batch/archive-transfer-rectification-closure-update.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_rectification_reissue_history",
        artifactPath: "batch/archive-transfer-rectification-reissue-history.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_signoff",
        artifactPath: "batch/archive-transfer-final-signoff.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_signoff_external_sync_receipt",
        artifactPath: "batch/archive-transfer-final-signoff-external-sync-receipt.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_registration",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration.json",
        fingerprint: report.archiveTransferFinalAcceptanceRegistration.registrationFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_registration_receipt_review",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-receipt-review.json",
        fingerprint:
          report.archiveTransferFinalAcceptanceRegistrationReceiptReview.reviewFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_registration_cross_platform_review",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-cross-platform-review.json",
        fingerprint:
          report.archiveTransferFinalAcceptanceRegistrationCrossPlatformReview.reviewFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_archive_dashboard",
        artifactPath: "batch/archive-transfer-final-acceptance-archive-dashboard.json",
        fingerprint: report.archiveTransferFinalAcceptanceArchiveDashboard.dashboardFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_cross_project_baseline",
        artifactPath: "batch/archive-transfer-final-acceptance-cross-project-baseline.json",
        fingerprint: report.archiveTransferFinalAcceptanceCrossProjectBaseline.baselineFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_trend_report",
        artifactPath: "batch/archive-transfer-final-acceptance-trend-report.json",
        fingerprint: report.archiveTransferFinalAcceptanceTrendReport.trendFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_rectification_aggregation",
        artifactPath: "batch/archive-transfer-final-acceptance-rectification-aggregation.json",
        fingerprint:
          report.archiveTransferFinalAcceptanceRectificationAggregation.aggregationFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_rectification_closure_update",
        artifactPath: "batch/archive-transfer-final-acceptance-rectification-closure-update.json",
        fingerprint:
          report.archiveTransferFinalAcceptanceRectificationClosureUpdate.updateFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_ingest_risk_ledger",
        artifactPath: "batch/archive-transfer-final-acceptance-ingest-risk-ledger.json",
        fingerprint: report.archiveTransferFinalAcceptanceIngestRiskLedger.ledgerFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_ingest_risk_closure_update",
        artifactPath: "batch/archive-transfer-final-acceptance-ingest-risk-closure-update.json",
        fingerprint: report.archiveTransferFinalAcceptanceIngestRiskClosureUpdate.updateFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_ingest_risk_reissue_history",
        artifactPath: "batch/archive-transfer-final-acceptance-ingest-risk-reissue-history.json",
        fingerprint:
          report.archiveTransferFinalAcceptanceIngestRiskReissueHistory.historyFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_ingest_risk_final_signoff",
        artifactPath: "batch/archive-transfer-final-acceptance-ingest-risk-final-signoff.json",
        fingerprint: report.archiveTransferFinalAcceptanceIngestRiskFinalSignoff.signoffFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_ingest_risk_final_receipt_review",
        artifactPath:
          "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-review.json",
        fingerprint:
          report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview.reviewFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_acceptance_ingest_risk_final_receipt_cross_platform_review",
        artifactPath:
          "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-cross-platform-review.json",
        fingerprint:
          report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview
            .reviewFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_ingest_risk_final_consistency_gate",
        artifactPath:
          "batch/archive-transfer-final-acceptance-ingest-risk-final-consistency-gate.json",
        fingerprint:
          report.archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate.gateFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_ingest_risk_final_receipt_evidence_package",
        artifactPath:
          "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-evidence-package.json",
        fingerprint:
          report.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage
            .packageFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_acceptance_ingest_risk_final_proof_package",
        artifactPath:
          "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package.json",
        fingerprint:
          report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.proofFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution",
        artifactPath:
          "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution.json",
        fingerprint:
          report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution
            .distributionFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution_receipt",
        artifactPath:
          "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-receipt.json",
        fingerprint:
          report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt
            .receiptFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution_cross_platform_review",
        artifactPath:
          "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-cross-platform-review.json",
        fingerprint:
          report
            .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview
            .reviewFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution_release_gate",
        artifactPath:
          "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate.json",
        fingerprint:
          report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate
            .gateFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution_release_gate_batch_signoff",
        artifactPath:
          "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff.json",
        fingerprint:
          report
            .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff
            .signoffFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution_release_gate_batch_signoff_external_sync_receipt",
        artifactPath:
          "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff-external-sync-receipt.json",
        fingerprint:
          report
            .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt
            .receiptFingerprint,
      }),
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison.schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison.v1",
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison
        .sourceCurrentProofFingerprint,
    ).toBe(report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.proofFingerprint);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison
        .sourcePreviousDistributionFingerprint,
    ).not.toBe(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution
        .distributionFingerprint,
    );
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison
        .redistributionFileCount,
    ).toBe(3);
    expect(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison
        .comparisonFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_acceptance_ingest_risk_final_proof_package_version_comparison",
        artifactPath:
          "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-version-comparison.json",
        fingerprint:
          report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison
            .comparisonFingerprint,
      }),
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger
        .schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger.v1",
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger
        .sourceComparisonFingerprint,
    ).toBe(
      report.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison
        .comparisonFingerprint,
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger
        .issueCount,
    ).toBe(3);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger
        .redistributionIssueCount,
    ).toBe(3);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate
        .schema,
    ).toBe(
      "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate.v1",
    );
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate
        .closedCount,
    ).toBe(1);
    expect(
      report
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate
        .stillOpenCount,
    ).toBe(2);
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution_rectification_ledger",
        artifactPath:
          "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-ledger.json",
        fingerprint:
          report
            .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger
            .ledgerFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution_rectification_closure_update",
        artifactPath:
          "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-closure-update.json",
        fingerprint:
          report
            .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate
            .updateFingerprint,
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_release_sla_reminder_external_import_receipt_update",
        artifactPath: "batch/archive-release-sla-reminder-external-import-receipt-update.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_release_sla_reminder_external_import_final_receipt_confirmation",
        artifactPath:
          "batch/archive-release-sla-reminder-external-import-final-receipt-confirmation.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_release_sla_reminder_external_import_final_receipt_cross_platform_review",
        artifactPath:
          "batch/archive-release-sla-reminder-external-import-final-receipt-cross-platform-review.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_release_sla_reminder_external_import_final_receipt_batch_signoff",
        artifactPath:
          "batch/archive-release-sla-reminder-external-import-final-receipt-batch-signoff.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_release_sla_reminder_external_import_final_receipt_signoff_external_sync_receipt",
        artifactPath:
          "batch/archive-release-sla-reminder-external-import-final-receipt-signoff-external-sync-receipt.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_release_sla_reminder_external_import_rectification_ledger",
        artifactPath:
          "batch/archive-release-sla-reminder-external-import-rectification-ledger.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_release_sla_reminder_external_import_rectification_closure_update",
        artifactPath:
          "batch/archive-release-sla-reminder-external-import-rectification-closure-update.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_release_sla_reminder_external_import_http_replay_queue",
        artifactPath: "batch/archive-release-sla-reminder-external-import-http-replay-queue.json",
      }),
    );
    expect(report.externalUploadManifest.files.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining([
        "batch/archive-release-portfolio-dashboard.json",
        "batch/archive-release-portfolio-timeline.csv",
        "batch/archive-release-portfolio-adapter-trend.csv",
        "batch/archive-release-cross-project-baseline.md",
        "batch/archive-release-cross-project-baseline.csv",
        "batch/archive-release-cross-project-baseline.json",
        "batch/archive-release-cross-project-auto-review.md",
        "batch/archive-release-cross-project-auto-review.csv",
        "batch/archive-release-cross-project-auto-review.json",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-cross-platform-review.md",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-cross-platform-review.csv",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-cross-platform-review.json",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate.md",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate.csv",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate.json",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff.md",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff.csv",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff.json",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff-external-sync-receipt.md",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff-external-sync-receipt.csv",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff-external-sync-receipt.json",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-version-comparison.md",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-version-comparison.csv",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-version-comparison-files.csv",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-version-comparison.json",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-ledger.md",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-ledger.csv",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-ledger.json",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-closure-update.md",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-closure-update.csv",
        "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-closure-update.json",
        "batch/archive-transfer-workflow-template.md",
        "batch/archive-transfer-workflow-template.csv",
        "batch/archive-transfer-signature-template.csv",
        "batch/archive-transfer-workflow-template.json",
        "batch/archive-transfer-signature-receipt-update.md",
        "batch/archive-transfer-signature-receipt-update.csv",
        "batch/archive-transfer-signature-receipt-update.json",
        "batch/archive-release-sla-reminder-ingest.json",
        "batch/archive-release-sla-reminder-external-import-http-replay-queue.json",
        "batch/archive-release-sla-reminder-external-import-receipt-update.json",
        "batch/archive-release-sla-reminder-external-import-final-receipt-confirmation.json",
        "batch/archive-release-sla-reminder-external-import-final-receipt-cross-platform-review.json",
        "batch/archive-release-sla-reminder-external-import-final-receipt-batch-signoff.json",
        "batch/archive-release-sla-reminder-external-import-final-receipt-signoff-external-sync-receipt.json",
        "batch/archive-release-sla-reminder-external-import-rectification-ledger.json",
        "batch/archive-release-sla-reminder-external-import-rectification-closure-update.json",
        "batch/archive-transfer-final-acceptance-trend-report.md",
        "batch/archive-transfer-final-acceptance-baseline-trend.csv",
        "batch/archive-transfer-final-acceptance-project-trend.csv",
        "batch/archive-transfer-final-acceptance-trend-report.json",
        "batch/archive-transfer-final-acceptance-rectification-aggregation.md",
        "batch/archive-transfer-final-acceptance-rectification-aggregation.csv",
        "batch/archive-transfer-final-acceptance-rectification-aggregation.json",
        "batch/archive-transfer-final-acceptance-rectification-closure-update.md",
        "batch/archive-transfer-final-acceptance-rectification-closure-update.csv",
        "batch/archive-transfer-final-acceptance-rectification-closure-update.json",
        "batch/archive-transfer-final-acceptance-ingest-risk-ledger.md",
        "batch/archive-transfer-final-acceptance-ingest-risk-ledger.csv",
        "batch/archive-transfer-final-acceptance-ingest-risk-ledger.json",
        "batch/archive-transfer-final-acceptance-ingest-risk-closure-update.md",
        "batch/archive-transfer-final-acceptance-ingest-risk-closure-update.csv",
        "batch/archive-transfer-final-acceptance-ingest-risk-closure-update.json",
        "batch/archive-transfer-final-acceptance-ingest-risk-reissue-history.md",
        "batch/archive-transfer-final-acceptance-ingest-risk-reissue-history.csv",
        "batch/archive-transfer-final-acceptance-ingest-risk-reissue-history.json",
      ]),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-release-sla-reminder-external-import-http-replay-queue.json",
        sourceFieldKey: "documentType",
        value: "SLA 提醒专项 HTTP 重放队列",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-release-sla-reminder-external-import-receipt-update.json",
        sourceFieldKey: "documentType",
        value: "SLA 提醒专项入库回执更新",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-release-sla-reminder-external-import-final-receipt-confirmation.json",
        sourceFieldKey: "documentType",
        value: "SLA 提醒专项外部平台最终回执确认",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-release-sla-reminder-external-import-final-receipt-cross-platform-review.json",
        sourceFieldKey: "documentType",
        value: "SLA 提醒专项最终回执跨平台终态复核",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-release-sla-reminder-external-import-final-receipt-batch-signoff.json",
        sourceFieldKey: "documentType",
        value: "SLA 提醒专项最终确认批量签发",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-release-cross-project-auto-review.json",
        sourceFieldKey: "documentType",
        value: "跨项目归档自动复核",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-workflow-template.json",
        sourceFieldKey: "documentType",
        value: "资料移交流程模板",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-signature-template.csv",
        sourceFieldKey: "documentType",
        value: "资料移交流程模板",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-signature-receipt-update.json",
        sourceFieldKey: "documentType",
        value: "资料移交签收回执更新",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-release-sla-reminder-external-import-final-receipt-signoff-external-sync-receipt.json",
        sourceFieldKey: "documentType",
        value: "SLA 提醒专项最终签发外部回传回执",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-release-sla-reminder-external-import-http-replay-history.json",
        sourceFieldKey: "documentType",
        value: "SLA 提醒专项 HTTP 重放历史链",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-release-sla-reminder-external-import-rectification-ledger.json",
        sourceFieldKey: "documentType",
        value: "SLA 提醒专项入库整改台账",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-release-sla-reminder-external-import-rectification-closure-update.json",
        sourceFieldKey: "documentType",
        value: "SLA 提醒专项入库整改销项回执",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-rectification-reissue-history.json",
        sourceFieldKey: "documentType",
        value: "资料移交整改重派历史链",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-final-signoff.json",
        sourceFieldKey: "documentType",
        value: "资料移交终态签发",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-final-signoff-external-sync-receipt.json",
        sourceFieldKey: "documentType",
        value: "资料移交终态签发外部回传回执",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_signoff_external_sync_rectification_ledger",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-ledger.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_signoff_external_sync_rectification_closure_update",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-closure-update.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_transfer_final_signoff_external_sync_rectification_reissue_history",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-reissue-history.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_signoff_external_sync_rectification_final_confirmation",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_receipt",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-receipt.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_ledger",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-ledger.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_closure_update",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-closure-update.json",
      }),
    );
    expect(report.archiveReleaseRecord.rows).toContainEqual(
      expect.objectContaining({
        artifactKey:
          "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_reissue_history",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-reissue-history.json",
      }),
    );
    expect(report.archiveReleaseDeliveryReadiness.schema).toBe(
      "railwise.engineering.batch.archiveReleaseDeliveryReadiness.v1",
    );
    expect(report.archiveReleaseDeliveryReadiness.releaseFingerprint).toBe(
      report.archiveReleaseRecord.releaseFingerprint,
    );
    expect(report.archiveReleaseDeliveryReadiness.externalUploadManifestFingerprint).toBe(
      report.externalUploadManifest.manifestFingerprint,
    );
    expect(report.archiveReleaseDeliveryReadiness.overallStatus).toBe("ready_for_handover");
    expect(report.archiveReleaseDeliveryReadiness.rows).toContainEqual(
      expect.objectContaining({
        checkpointId: "archive_transfer_final_confirmation",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation.json",
      }),
    );
    expect(report.archiveReleaseDeliveryReadiness.rows).toContainEqual(
      expect.objectContaining({
        checkpointId: "archive_transfer_final_confirmation_batch_signoff",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff.json",
        readinessStatus: "ready",
      }),
    );
    expect(report.archiveReleaseDeliveryReadiness.rows).toContainEqual(
      expect.objectContaining({
        checkpointId:
          "archive_transfer_final_confirmation_batch_signoff_external_sync_rectification_closure_update",
        artifactPath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-closure-update.json",
        sourceFingerprint:
          report
            .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate
            .updateFingerprint,
        readinessStatus: "ready",
      }),
    );
    expect(report.acceptanceReview.handoverDecision).toBe("accept");
    expect(report.acceptanceReview.acceptanceStatusLabel).toBe("可接收");
    expect(report.acceptanceReview.actionIssueCount).toBe(0);
    expect(report.acceptanceReview.nextActions).toContain(
      "按发布版本、发布指纹和清单指纹完成归档接收登记。",
    );
    expect(report.acceptanceReview.rows).toContainEqual(
      expect.objectContaining({
        gateId: "archive_transfer_final_confirmation",
        evidencePath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation.json",
        evidenceStatus: "verified",
        remediationPath: "",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-final-signoff-external-sync-rectification-ledger.json",
        sourceFieldKey: "documentType",
        value: "资料移交终态签发回传整改台账",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-closure-update.json",
        sourceFieldKey: "documentType",
        value: "资料移交终态签发回传整改销项回执",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-reissue-history.json",
        sourceFieldKey: "documentType",
        value: "资料移交终态签发回传整改重派历史链",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation.json",
        sourceFieldKey: "documentType",
        value: "资料移交终态签发回传整改最终确认",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff.json",
        sourceFieldKey: "documentType",
        value: "资料移交终态签发回传整改最终确认批量签发",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-receipt.json",
        sourceFieldKey: "documentType",
        value: "资料移交终态签发回传整改最终签发外部回传回执",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-ledger.json",
        sourceFieldKey: "documentType",
        value: "资料移交终态签发回传整改最终签发回传整改台账",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-closure-update.json",
        sourceFieldKey: "documentType",
        value: "资料移交终态签发回传整改最终签发回传整改销项",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-reissue-history.json",
        sourceFieldKey: "documentType",
        value: "资料移交终态签发回传整改最终签发回传整改重派历史链",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration.json",
        sourceFieldKey: "documentType",
        value: "资料移交最终接收登记",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath:
          "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-receipt-review.json",
        sourceFieldKey: "documentType",
        value: "资料移交最终接收登记回执复核",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-final-acceptance-archive-dashboard.json",
        sourceFieldKey: "documentType",
        value: "资料移交最终接收归档看板",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-final-acceptance-cross-project-baseline.json",
        sourceFieldKey: "documentType",
        value: "资料移交最终接收跨项目基线",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-final-acceptance-trend-report.json",
        sourceFieldKey: "documentType",
        value: "资料移交最终接收趋势统计",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-final-acceptance-rectification-aggregation.json",
        sourceFieldKey: "documentType",
        value: "资料移交最终接收异常整改聚合",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-final-acceptance-rectification-closure-update.json",
        sourceFieldKey: "documentType",
        value: "资料移交最终接收异常整改销项",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-final-acceptance-ingest-risk-ledger.json",
        sourceFieldKey: "documentType",
        value: "资料移交最终接收入库风险台账",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-final-acceptance-ingest-risk-closure-update.json",
        sourceFieldKey: "documentType",
        value: "资料移交最终接收入库风险销项",
      }),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-transfer-final-acceptance-ingest-risk-reissue-history.json",
        sourceFieldKey: "documentType",
        value: "资料移交最终接收入库风险重派历史链",
      }),
    );
    expect(report.summary.releasePortfolioDashboardPresent).toBe(true);
    expect(report.summary.releaseCrossProjectBaselinePresent).toBe(true);
    expect(report.summary.releaseCrossProjectAutoReviewPresent).toBe(true);
    expect(report.summary.archiveTransferWorkflowTemplatePresent).toBe(true);
    expect(report.summary.archiveTransferSignatureReceiptUpdatePresent).toBe(true);
    expect(report.summary.archiveTransferRectificationLedgerPresent).toBe(true);
    expect(report.summary.archiveTransferRectificationClosureUpdatePresent).toBe(true);
    expect(report.summary.archiveTransferRectificationReissueHistoryPresent).toBe(true);
    expect(report.summary.archiveTransferFinalSignoffPresent).toBe(true);
    expect(report.summary.archiveTransferFinalSignoffExternalSyncReceiptPresent).toBe(true);
    expect(report.summary.archiveTransferFinalSignoffExternalSyncRectificationLedgerPresent).toBe(
      true,
    );
    expect(
      report.summary.archiveTransferFinalSignoffExternalSyncRectificationClosureUpdatePresent,
    ).toBe(true);
    expect(
      report.summary.archiveTransferFinalSignoffExternalSyncRectificationReissueHistoryPresent,
    ).toBe(true);
    expect(
      report.summary.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationPresent,
    ).toBe(true);
    expect(
      report.summary
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffPresent,
    ).toBe(true);
    expect(
      report.summary
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceiptPresent,
    ).toBe(true);
    expect(
      report.summary
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedgerPresent,
    ).toBe(true);
    expect(
      report.summary
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdatePresent,
    ).toBe(true);
    expect(
      report.summary
        .archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistoryPresent,
    ).toBe(true);
    expect(report.summary.archiveTransferFinalAcceptanceRegistrationPresent).toBe(true);
    expect(report.summary.archiveTransferFinalAcceptanceRegistrationReceiptReviewPresent).toBe(
      true,
    );
    expect(
      report.summary.archiveTransferFinalAcceptanceRegistrationCrossPlatformReviewPresent,
    ).toBe(true);
    expect(report.summary.archiveTransferFinalAcceptanceArchiveDashboardPresent).toBe(true);
    expect(report.summary.archiveTransferFinalAcceptanceCrossProjectBaselinePresent).toBe(true);
    expect(report.summary.archiveTransferFinalAcceptanceTrendReportPresent).toBe(true);
    expect(report.summary.archiveTransferFinalAcceptanceRectificationAggregationPresent).toBe(true);
    expect(report.summary.archiveTransferFinalAcceptanceRectificationClosureUpdatePresent).toBe(
      true,
    );
    expect(report.summary.archiveTransferFinalAcceptanceIngestRiskLedgerPresent).toBe(true);
    expect(report.summary.archiveTransferFinalAcceptanceIngestRiskClosureUpdatePresent).toBe(true);
    expect(report.summary.archiveTransferFinalAcceptanceIngestRiskReissueHistoryPresent).toBe(true);
    expect(report.summary.archiveTransferFinalAcceptanceIngestRiskFinalSignoffPresent).toBe(true);
    expect(report.summary.archiveTransferFinalAcceptanceIngestRiskFinalReceiptReviewPresent).toBe(
      true,
    );
    expect(
      report.summary.archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReviewPresent,
    ).toBe(true);
    expect(report.summary.archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGatePresent).toBe(
      true,
    );
    expect(
      report.summary.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackagePresent,
    ).toBe(true);
    expect(report.summary.archiveTransferFinalAcceptanceIngestRiskFinalProofPackagePresent).toBe(
      true,
    );
    expect(
      report.summary.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionPresent,
    ).toBe(true);
    expect(
      report.summary
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceiptPresent,
    ).toBe(true);
    expect(
      report.summary
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReviewPresent,
    ).toBe(true);
    expect(
      report.summary
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGatePresent,
    ).toBe(true);
    expect(
      report.summary
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffPresent,
    ).toBe(true);
    expect(
      report.summary
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceiptPresent,
    ).toBe(true);
    expect(
      report.summary
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparisonPresent,
    ).toBe(true);
    expect(
      report.summary
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedgerPresent,
    ).toBe(true);
    expect(
      report.summary
        .archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdatePresent,
    ).toBe(true);
    expect(report.summary.archiveReleaseDeliveryReadinessPresent).toBe(true);
    expect(report.summary.releaseSlaReminderExternalImportHttpReplayQueuePresent).toBe(true);
    expect(report.summary.releaseSlaReminderExternalImportHttpReplayHistoryPresent).toBe(true);
    expect(report.summary.releaseSlaReminderExternalImportReceiptUpdatePresent).toBe(true);
    expect(report.summary.releaseSlaReminderExternalImportFinalReceiptConfirmationPresent).toBe(
      true,
    );
    expect(
      report.summary.releaseSlaReminderExternalImportFinalReceiptCrossPlatformReviewPresent,
    ).toBe(true);
    expect(report.summary.releaseSlaReminderExternalImportFinalReceiptBatchSignoffPresent).toBe(
      true,
    );
    expect(
      report.summary.releaseSlaReminderExternalImportFinalReceiptSignoffExternalSyncReceiptPresent,
    ).toBe(true);
    expect(report.summary.releaseSlaReminderExternalImportRectificationLedgerPresent).toBe(true);
    expect(report.summary.releaseSlaReminderExternalImportRectificationClosureUpdatePresent).toBe(
      true,
    );
  });

  it("verifies a full acceptance recheck and final registration archive chain", () => {
    const input = loadEngineeringSampleInput("distance_azimuth");
    const result = runEngineeringCalculation("distance_azimuth", input);
    const deliverables = buildEngineeringDeliverables(result, {
      inputFormat: "json",
      inputText: JSON.stringify(input, null, 2),
      sourceName: "final-registration-distance-azimuth.json",
      exportedAt: "2026-06-05T08:40:00.000Z",
    });
    const archiveItems: EngineeringBatchPackageItem[] = [{ id: "distance-run", deliverables }];
    const originalArchive = buildEngineeringBatchArchiveZipExport(archiveItems, {
      batchName: "最终接收登记链路样例",
      exportedAt: "2026-06-05T09:00:00.000Z",
    });
    const recheckedArchive = buildEngineeringBatchArchiveZipExport(archiveItems, {
      batchName: "最终接收登记链路样例",
      exportedAt: "2026-06-05T10:00:00.000Z",
      preparedBy: "资料员A",
      archiveReleaseBy: "资料员A",
      archiveInspectionSignoff: {
        conclusion: "approved",
        reviewer: "资料员A",
        signedAt: "2026-06-05T09:50:00.000Z",
      },
    });
    const originalReview = verifyEngineeringArchiveZipImport(
      new Uint8Array(Buffer.from(originalArchive.base64, "base64")),
      {
        archiveName: "final-registration-original.zip",
        checkedAt: "2026-06-05T09:05:00.000Z",
      },
    );
    const recheckedReview = verifyEngineeringArchiveZipImport(
      new Uint8Array(Buffer.from(recheckedArchive.base64, "base64")),
      {
        archiveName: "final-registration-rechecked.zip",
        checkedAt: "2026-06-05T10:05:00.000Z",
      },
    );
    expect(originalReview.acceptanceReview.handoverDecision).not.toBe("accept");
    expect(recheckedReview.acceptanceReview.handoverDecision).toBe("accept");

    const recheckUpdate = buildEngineeringArchiveAcceptanceRemediationRecheckUpdate(
      originalArchive.archiveAcceptanceRemediationRecheckPackage!,
      recheckedReview.acceptanceReview,
      {
        generatedAt: "2026-06-05T10:10:00.000Z",
        recheckedArchivePath: "/archives/final-registration-rechecked.zip",
      },
    );
    const finalRegistration = buildEngineeringArchiveAcceptanceFinalRegistration(
      recheckUpdate,
      recheckedReview.acceptanceReview,
      {
        generatedAt: "2026-06-05T10:15:00.000Z",
        acceptedBy: "档案管理员A",
        receiverName: "业主档案室",
      },
    );
    const finalArchive = buildEngineeringBatchArchiveZipExport(archiveItems, {
      batchName: "最终接收登记链路样例",
      exportedAt: "2026-06-05T10:20:00.000Z",
      preparedBy: "资料员A",
      archiveReleaseBy: "资料员A",
      archiveInspectionSignoff: {
        conclusion: "approved",
        reviewer: "资料员A",
        signedAt: "2026-06-05T10:18:00.000Z",
      },
      archiveAcceptanceRemediationRecheckUpdate: recheckUpdate,
      archiveAcceptanceFinalRegistration: finalRegistration,
    });
    const archivePath = join(workDir, "final-registration-chain.zip");
    writeFileSync(archivePath, Buffer.from(finalArchive.base64, "base64"));

    const run = spawnSync(
      process.execPath,
      [VERIFIER_SCRIPT, archivePath, "--json", "--require-clean"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        maxBuffer: 5_000_000,
      },
    );

    expect(run.status, `${run.stderr}\n${run.stdout}`).toBe(0);

    const report = JSON.parse(run.stdout);
    expect(report.success).toBe(true);
    expect(report.summary.archiveAcceptanceRemediationRecheckUpdatePresent).toBe(true);
    expect(report.summary.archiveAcceptanceFinalRegistrationPresent).toBe(true);
    expect(report.archiveAcceptanceRemediationRecheckUpdate.schema).toBe(
      "railwise.engineeringArchive.acceptanceRemediationRecheckUpdate.v1",
    );
    expect(report.archiveAcceptanceRemediationRecheckUpdate.recheckReadyForArchive).toBe(true);
    expect(report.archiveAcceptanceFinalRegistration.schema).toBe(
      "railwise.engineeringArchive.acceptanceFinalRegistration.v1",
    );
    expect(report.archiveAcceptanceFinalRegistration.registrationStatus).toBe("registered");
    expect(report.archiveAcceptanceFinalRegistration.sourceRecheckUpdateFingerprint).toBe(
      report.archiveAcceptanceRemediationRecheckUpdate.updateFingerprint,
    );
    expect(report.archiveAcceptanceFinalRegistration.sourceAcceptanceFingerprint).toBe(
      report.archiveAcceptanceRemediationRecheckUpdate.recheckedAcceptanceFingerprint,
    );
    expect(report.archiveAcceptanceFinalRegistration.signedReceipt.signatureStatus).toBe("signed");
    expect(report.archiveAcceptanceFinalRegistration.finalIndexRows).toContainEqual(
      expect.objectContaining({
        artifactKey: "archive_acceptance_remediation_recheck_update",
        artifactPath: "batch/archive-acceptance-remediation-recheck-update.json",
        acceptanceStatus: "registered",
      }),
    );
    expect(report.externalUploadManifest.files.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining([
        "batch/archive-acceptance-remediation-recheck-update.json",
        "batch/archive-acceptance-final-registration.json",
      ]),
    );
    expect(report.externalSystemUploadAdapters.rows).toContainEqual(
      expect.objectContaining({
        recordType: "file",
        filePath: "batch/archive-acceptance-final-registration.json",
        sourceFieldKey: "documentType",
        value: "归档最终接收登记",
      }),
    );

    const humanRun = spawnSync(
      process.execPath,
      [VERIFIER_SCRIPT, archivePath, "--require-clean"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        maxBuffer: 5_000_000,
      },
    );
    expect(humanRun.status, `${humanRun.stderr}\n${humanRun.stdout}`).toBe(0);
    expect(humanRun.stdout).toContain("Final registration: registered");
    expect(humanRun.stdout).toContain("Receipt: signed");
  });

  it("fails cleanly when archive bytes no longer match the checksum catalog", () => {
    const archivePath = writeArchive("tampered.zip", tamperArchiveBytes);
    const run = spawnSync(
      process.execPath,
      [VERIFIER_SCRIPT, archivePath, "--json", "--require-clean"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        maxBuffer: 5_000_000,
      },
    );

    expect(run.status).not.toBe(0);

    const report = JSON.parse(run.stdout);
    expect(report.success).toBe(false);
    expect(report.summary.errors).toBeGreaterThan(0);
    expect(report.errors.join("\n")).toContain("CRC32 mismatch");
    expect(report.acceptanceReview.handoverDecision).toBe("reject");
    expect(report.acceptanceReview.blockingIssueCount).toBeGreaterThan(0);
    expect(report.acceptanceReview.nextActions).toContain(
      "归档包存在校验错误，需由提交方重新生成 ZIP 后再验收。",
    );
    expect(report.acceptanceReview.rows).toContainEqual(
      expect.objectContaining({
        gateId: "verifier_error_001",
        evidenceStatus: "invalid",
        remediationPath: "重新生成完整归档 ZIP",
      }),
    );
  });

  function writeArchive(
    fileName: string,
    transform?: (bytes: Buffer) => Buffer,
    archiveOptions: EngineeringBatchArchiveZipExportContext = {},
    includeReleaseMonitoring = false,
  ): string {
    const input = loadEngineeringSampleInput("distance_azimuth");
    const result = runEngineeringCalculation("distance_azimuth", input);
    const deliverables = buildEngineeringDeliverables(result, {
      inputFormat: "json",
      inputText: JSON.stringify(input, null, 2),
      sourceName: "distance-azimuth-sample.json",
      exportedAt: "2026-06-03T06:00:00.000Z",
    });
    const archiveItems: EngineeringBatchPackageItem[] = [{ id: "distance-run", deliverables }];
    const archiveContext: EngineeringBatchArchiveZipExportContext = {
      batchName: "验收批次",
      exportedAt: "2026-06-03T06:30:00.000Z",
      preparedBy: "王工",
      reviewSignoff: {
        reviewer: "李工",
        conclusion: "approved",
        remarks: "归档验收样例。",
        signedAt: "2026-06-03T06:30:00.000Z",
      },
      ...archiveOptions,
    };
    if (includeReleaseMonitoring) {
      const releaseRecord = buildEngineeringBatchArchiveReleaseRecordExport(
        archiveItems,
        archiveContext,
      );
      const portfolioDashboard = buildEngineeringBatchArchiveReleasePortfolioDashboard({
        releases: [releaseRecord],
        generatedAt: "2026-06-03T06:40:00.000Z",
      });
      archiveContext.archiveReleasePortfolioDashboard = portfolioDashboard;
      archiveContext.archiveReleaseCrossProjectBaselineComparison =
        buildEngineeringBatchArchiveReleaseCrossProjectBaselineComparison([portfolioDashboard], {
          generatedAt: "2026-06-03T06:45:00.000Z",
          projectNames: ["验收批次"],
        });
      archiveContext.archiveReleaseCrossProjectAutoReview =
        buildEngineeringBatchArchiveReleaseCrossProjectAutoReview(
          archiveContext.archiveReleaseCrossProjectBaselineComparison,
          {
            generatedAt: "2026-06-03T06:46:00.000Z",
            reviewer: "验收负责人",
            dueAt: "2026-06-04",
          },
        );
      archiveContext.archiveTransferWorkflowTemplate =
        buildEngineeringBatchArchiveTransferWorkflowTemplateExport(archiveItems, archiveContext, {
          generatedAt: "2026-06-03T06:47:00.000Z",
          dueAt: "2026-06-05",
        });
      const archiveTransferSignatureReceiptUpdate =
        buildEngineeringBatchArchiveTransferSignatureReceiptUpdate(
          archiveContext.archiveTransferWorkflowTemplate,
          {
            text: [
              "receiver_id,receiver_name,file_path,document_type,signer_role,signoff_status,signed_at,external_record_id,receipt_status,remarks",
              [
                archiveContext.archiveTransferWorkflowTemplate.signatureRows[0]?.receiverId,
                archiveContext.archiveTransferWorkflowTemplate.signatureRows[0]?.receiverName,
                archiveContext.archiveTransferWorkflowTemplate.signatureRows[0]?.filePath,
                archiveContext.archiveTransferWorkflowTemplate.signatureRows[0]?.documentType,
                archiveContext.archiveTransferWorkflowTemplate.signatureRows[0]?.signerRole,
                "signed",
                "2026-06-03T06:48:00.000Z",
                "VERIFY-TRANSFER-SIGN-001",
                "accepted",
                "verifier 资料移交签收样例",
              ].join(","),
            ].join("\n"),
            format: "csv",
            sourceName: "verifier-archive-transfer-signature-receipt.csv",
            importedAt: "2026-06-03T06:48:00.000Z",
          },
        );
      archiveContext.archiveTransferWorkflowTemplate =
        archiveTransferSignatureReceiptUpdate.updatedTemplate;
      archiveContext.archiveTransferSignatureReceiptUpdate = archiveTransferSignatureReceiptUpdate;
      const archiveTransferRectificationLedger =
        buildEngineeringBatchArchiveTransferRectificationLedger(
          archiveTransferSignatureReceiptUpdate,
          { generatedAt: "2026-06-03T06:49:00.000Z" },
        );
      const archiveTransferRectificationClosureUpdate =
        buildEngineeringBatchArchiveTransferRectificationClosureUpdate(
          archiveTransferRectificationLedger,
          {
            text: [
              "issue_id,closure_status,closed_at,closed_by,closure_note,external_record_id",
              [
                archiveTransferRectificationLedger.rows[0]?.issueId,
                "closed",
                "2026-06-04",
                "资料员A",
                "verifier 资料移交整改已闭环",
                "VERIFY-TRANSFER-RECTIFY-CLOSED-001",
              ].join(","),
            ].join("\n"),
            format: "csv",
            sourceName: "verifier-archive-transfer-rectification-closure.csv",
            importedAt: "2026-06-04T08:30:00.000Z",
          },
        );
      archiveContext.archiveTransferRectificationLedger =
        archiveTransferRectificationClosureUpdate.updatedLedger;
      archiveContext.archiveTransferRectificationClosureUpdate =
        archiveTransferRectificationClosureUpdate;
      const archiveTransferRectificationReissueHistory =
        buildEngineeringBatchArchiveTransferRectificationReissueHistory({
          generatedAt: "2026-06-04T08:35:00.000Z",
          batchName: "验收批次",
          initialLedger: archiveTransferRectificationLedger,
          rounds: [
            {
              roundNo: 1,
              roundStartedAt: "2026-06-04T08:00:00.000Z",
              roundCompletedAt: archiveTransferRectificationClosureUpdate.importedAt,
              sourceLedger: archiveTransferRectificationLedger,
              closureUpdate: archiveTransferRectificationClosureUpdate,
            },
          ],
        });
      archiveContext.archiveTransferRectificationReissueHistory =
        archiveTransferRectificationReissueHistory;
      const archiveTransferFinalSignoff = buildEngineeringBatchArchiveTransferFinalSignoff(
        archiveTransferRectificationClosureUpdate.updatedLedger,
        archiveTransferRectificationReissueHistory,
        {
          generatedAt: "2026-06-04T08:40:00.000Z",
          signoff: {
            reviewer: "资料员A",
            conclusion: "approved",
            signedAt: "2026-06-04T08:40:00.000Z",
            remarks: "verifier 资料移交终态签发",
          },
        },
      );
      archiveContext.archiveTransferFinalSignoff = archiveTransferFinalSignoff;
      const archiveTransferFinalSignoffExternalSyncReceipt =
        buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncReceipt(
          archiveTransferFinalSignoff,
          {
            text: [
              "signoff_file_path,external_record_id,receipt_status,receipt_message,received_at,synced_release_version",
              "batch/archive-transfer-final-signoff.md,VERIFY-TRANSFER-SIGNOFF-MD-001,accepted,MD 已回传,2026-06-04T09:00:00.000Z,AR-VERIFY-TRANSFER",
              "batch/archive-transfer-final-signoff.csv,VERIFY-TRANSFER-SIGNOFF-CSV-001,pending,CSV 平台处理中,2026-06-04T09:05:00.000Z,AR-VERIFY-TRANSFER",
            ].join("\n"),
            format: "csv",
            sourceName: "verifier-archive-transfer-final-signoff-sync-receipt.csv",
            importedAt: "2026-06-04T09:10:00.000Z",
          },
        );
      archiveContext.archiveTransferFinalSignoffExternalSyncReceipt =
        archiveTransferFinalSignoffExternalSyncReceipt;
      const archiveTransferFinalSignoffExternalSyncRectificationLedger =
        buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationLedger(
          archiveTransferFinalSignoffExternalSyncReceipt,
          { generatedAt: "2026-06-04T09:15:00.000Z" },
        );
      const archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate =
        buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationClosureUpdate(
          archiveTransferFinalSignoffExternalSyncRectificationLedger,
          {
            text: [
              "issue_id,file_path,closure_status,closed_at,closed_by,closure_note,external_record_id",
              ...archiveTransferFinalSignoffExternalSyncRectificationLedger.rows.map((row, index) =>
                [
                  row.issueId,
                  row.filePath,
                  "closed",
                  "2026-06-04",
                  "资料员A",
                  "verifier 终态签发回传整改闭环",
                  `VERIFY-TRANSFER-SIGNOFF-SYNC-CLOSED-${index + 1}`,
                ].join(","),
              ),
            ].join("\n"),
            format: "csv",
            sourceName: "verifier-archive-transfer-final-signoff-sync-rectification-closure.csv",
            importedAt: "2026-06-04T09:25:00.000Z",
          },
        );
      const archiveTransferFinalSignoffExternalSyncRectificationReissueHistory =
        buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationReissueHistory({
          generatedAt: "2026-06-04T09:30:00.000Z",
          batchName: "验收批次",
          initialLedger: archiveTransferFinalSignoffExternalSyncRectificationLedger,
          rounds: [
            {
              roundNo: 1,
              roundStartedAt:
                archiveTransferFinalSignoffExternalSyncRectificationLedger.generatedAt,
              roundCompletedAt:
                archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate.importedAt,
              sourceLedger: archiveTransferFinalSignoffExternalSyncRectificationLedger,
              closureUpdate: archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate,
            },
          ],
        });
      const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation =
        buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation(
          archiveTransferFinalSignoffExternalSyncRectificationReissueHistory,
          {
            text: [
              "file_path,final_status,confirmed_at,confirmed_by,confirmation_note,external_record_id,platform_checksum",
              ...archiveTransferFinalSignoffExternalSyncRectificationReissueHistory.fileSummaries.map(
                (row, index) =>
                  [
                    row.filePath,
                    "accepted",
                    "2026-06-04T09:35:00.000Z",
                    "资料员A",
                    "verifier 终态签发回传整改最终确认",
                    `VERIFY-TRANSFER-SIGNOFF-SYNC-FINAL-${index + 1}`,
                    `sha256-final-${index + 1}`,
                  ].join(","),
              ),
            ].join("\n"),
            format: "csv",
            sourceName:
              "verifier-archive-transfer-final-signoff-sync-rectification-final-confirmation.csv",
            importedAt: "2026-06-04T09:35:00.000Z",
          },
        );
      const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff =
        buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff(
          archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation,
          {
            generatedAt: "2026-06-04T09:40:00.000Z",
            signoff: {
              reviewer: "验收负责人",
              conclusion: "approved",
              remarks: "verifier 资料移交终态签发回传整改最终确认批量签发",
              signedAt: "2026-06-04T09:38:00.000Z",
            },
          },
        );
      const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt =
        buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt(
          archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff,
          {
            text: [
              "file_path,external_record_id,receipt_status,receipt_message,received_at,synced_release_version",
              ...archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff.rows.map(
                (row, index) =>
                  [
                    row.filePath,
                    `VERIFY-TRANSFER-FINAL-SIGNOFF-SYNC-${index + 1}`,
                    "accepted",
                    "资料移交最终签发已回传",
                    "2026-06-04T09:45:00.000Z",
                    "AR-VERIFY-TRANSFER",
                  ].join(","),
              ),
            ].join("\n"),
            format: "csv",
            sourceName:
              "verifier-archive-transfer-final-signoff-sync-rectification-final-confirmation-batch-signoff-external-sync-receipt.csv",
            importedAt: "2026-06-04T09:45:00.000Z",
          },
        );
      const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger =
        buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger(
          archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt,
          {
            generatedAt: "2026-06-04T09:50:00.000Z",
          },
        );
      const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate =
        buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate(
          archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger,
          {
            text: "issue_id,file_path,closure_status,closed_at,closed_by,closure_note,external_record_id\n",
            format: "csv",
            sourceName:
              "verifier-archive-transfer-final-signoff-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-closure.csv",
            importedAt: "2026-06-04T09:55:00.000Z",
          },
        );
      const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory =
        buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory(
          {
            generatedAt: "2026-06-04T09:56:00.000Z",
            batchName: "验收批次",
            initialLedger:
              archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger,
            rounds: [
              {
                roundNo: 1,
                roundStartedAt:
                  archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger.generatedAt,
                roundCompletedAt:
                  archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate.importedAt,
                sourceLedger:
                  archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger,
                closureUpdate:
                  archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate,
              },
            ],
          },
        );
      const archiveTransferFinalAcceptanceRegistration =
        buildEngineeringBatchArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationFinalAcceptanceRegistration(
          archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory,
          {
            generatedAt: "2026-06-04T10:00:00.000Z",
            acceptedBy: "档案管理员A",
            receiverName: "业主档案室",
            registrationNote: "verifier 资料移交最终接收登记",
          },
        );
      const archiveTransferFinalAcceptanceRegistrationReceiptReview =
        buildEngineeringBatchArchiveTransferFinalAcceptanceRegistrationReceiptReview(
          archiveTransferFinalAcceptanceRegistration,
          {
            text: [
              "registration_id,receipt_id,receiver_name,receipt_status,reviewed_at,reviewed_by,receipt_message,external_record_id,platform_checksum",
              [
                archiveTransferFinalAcceptanceRegistration.registrationId,
                archiveTransferFinalAcceptanceRegistration.signedReceipt.receiptId,
                archiveTransferFinalAcceptanceRegistration.receiverName,
                "accepted",
                "2026-06-04T10:05:00.000Z",
                "业主档案员",
                "verifier 资料移交最终接收登记已入库",
                "VERIFY-TRANSFER-FINAL-ACCEPT-001",
                "sha256-transfer-final-accept",
              ].join(","),
            ].join("\n"),
            format: "csv",
            sourceName: "verifier-archive-transfer-final-acceptance-registration-receipt.csv",
            importedAt: "2026-06-04T10:05:00.000Z",
          },
        );
      const archiveTransferFinalAcceptanceRegistrationSupervisionReceiptReview =
        buildEngineeringBatchArchiveTransferFinalAcceptanceRegistrationReceiptReview(
          archiveTransferFinalAcceptanceRegistration,
          {
            text: [
              "registration_id,receipt_id,receiver_name,receipt_status,reviewed_at,reviewed_by,receipt_message,external_record_id,platform_checksum",
              [
                archiveTransferFinalAcceptanceRegistration.registrationId,
                archiveTransferFinalAcceptanceRegistration.signedReceipt.receiptId,
                archiveTransferFinalAcceptanceRegistration.receiverName,
                "accepted",
                "2026-06-04T10:08:00.000Z",
                "监理资料员",
                "verifier 监理平台资料移交最终接收登记已入库",
                "VERIFY-TRANSFER-FINAL-ACCEPT-SUP-001",
                "sha256-transfer-final-accept",
              ].join(","),
            ].join("\n"),
            format: "csv",
            sourceName: "verifier-supervision-transfer-final-acceptance-registration-receipt.csv",
            importedAt: "2026-06-04T10:08:00.000Z",
          },
        );
      const archiveTransferFinalAcceptanceRegistrationCrossPlatformReview =
        buildEngineeringBatchArchiveTransferFinalAcceptanceRegistrationCrossPlatformReview(
          archiveTransferFinalAcceptanceRegistration,
          [
            archiveTransferFinalAcceptanceRegistrationReceiptReview,
            archiveTransferFinalAcceptanceRegistrationSupervisionReceiptReview,
          ],
          {
            generatedAt: "2026-06-04T10:10:00.000Z",
            batchName: "verifier 资料移交最终接收跨平台复核",
          },
        );
      const archiveTransferFinalAcceptanceArchiveDashboard =
        buildEngineeringBatchArchiveTransferFinalAcceptanceArchiveDashboard(
          archiveTransferFinalAcceptanceRegistration,
          archiveTransferFinalAcceptanceRegistrationReceiptReview,
          archiveTransferFinalAcceptanceRegistrationCrossPlatformReview,
          {
            generatedAt: "2026-06-04T10:12:00.000Z",
            batchName: "verifier 资料移交最终接收归档看板",
          },
        );
      const archiveTransferFinalAcceptanceCrossProjectBaseline =
        buildEngineeringBatchArchiveTransferFinalAcceptanceCrossProjectBaseline(
          [archiveTransferFinalAcceptanceArchiveDashboard],
          {
            generatedAt: "2026-06-04T10:14:00.000Z",
            projectNames: ["verifier 一标段"],
          },
        );
      const archiveTransferFinalAcceptanceTrendReport =
        buildEngineeringBatchArchiveTransferFinalAcceptanceTrendReport(
          [archiveTransferFinalAcceptanceCrossProjectBaseline],
          {
            generatedAt: "2026-06-04T10:16:00.000Z",
          },
        );
      const archiveTransferFinalAcceptanceRectificationAggregation =
        buildEngineeringBatchArchiveTransferFinalAcceptanceRectificationAggregation(
          archiveTransferFinalAcceptanceTrendReport,
          {
            generatedAt: "2026-06-04T10:18:00.000Z",
            owner: "资料负责人",
          },
        );
      const archiveTransferFinalAcceptanceRectificationClosureUpdate =
        buildEngineeringBatchArchiveTransferFinalAcceptanceRectificationClosureUpdate(
          archiveTransferFinalAcceptanceRectificationAggregation,
          {
            text: "issue_id,closure_status,closed_at,closed_by,closure_note,external_record_id\n",
            format: "csv",
            sourceName: "verifier-final-acceptance-rectification-closure.csv",
            importedAt: "2026-06-04T10:20:00.000Z",
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskLedger =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskLedger(
          archiveTransferFinalAcceptanceRectificationClosureUpdate,
          {
            generatedAt: "2026-06-04T10:22:00.000Z",
            owner: "入库负责人",
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskClosureUpdate =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskClosureUpdate(
          archiveTransferFinalAcceptanceIngestRiskLedger,
          {
            text: "risk_id,closure_status,closed_at,closed_by,closure_note,external_record_id\n",
            format: "csv",
            sourceName: "verifier-final-acceptance-ingest-risk-closure.csv",
            importedAt: "2026-06-04T10:24:00.000Z",
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskReissueHistory =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskReissueHistory({
          generatedAt: "2026-06-04T10:26:00.000Z",
          initialLedger: archiveTransferFinalAcceptanceIngestRiskLedger,
          rounds: [
            {
              roundNo: 1,
              roundStartedAt: archiveTransferFinalAcceptanceIngestRiskLedger.generatedAt,
              roundCompletedAt: archiveTransferFinalAcceptanceIngestRiskClosureUpdate.importedAt,
              sourceLedger: archiveTransferFinalAcceptanceIngestRiskLedger,
              closureUpdate: archiveTransferFinalAcceptanceIngestRiskClosureUpdate,
            },
          ],
        });
      const archiveTransferFinalAcceptanceIngestRiskFinalSignoff =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalSignoff(
          archiveTransferFinalAcceptanceIngestRiskReissueHistory,
          {
            generatedAt: "2026-06-04T10:28:00.000Z",
            signedBy: "入库负责人",
            receiverName: "业主档案系统",
            signoffNote: "入库风险历史链无未闭环风险，准予终态签发。",
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalOwnerReceiptText = [
        "signoff_id,receipt_id,receiver_name,receipt_status,received_at,received_by,receipt_message,external_record_id,platform_checksum",
        `${archiveTransferFinalAcceptanceIngestRiskFinalSignoff.signoffId},${archiveTransferFinalAcceptanceIngestRiskFinalSignoff.signedReceipt.receiptId},业主档案系统,accepted,2026-06-04T10:30:00.000Z,业主档案员,入库风险终态签发已入库,OWNER-INGEST-VERIFY-001,sha256-ingest-verify-001`,
      ].join("\n");
      const archiveTransferFinalAcceptanceIngestRiskFinalDmsReceiptText = [
        "signoff_id,receipt_id,receiver_name,receipt_status,received_at,received_by,receipt_message,external_record_id,platform_checksum",
        `${archiveTransferFinalAcceptanceIngestRiskFinalSignoff.signoffId},${archiveTransferFinalAcceptanceIngestRiskFinalSignoff.signedReceipt.receiptId},业主档案系统,accepted,2026-06-04T10:34:00.000Z,DMS接口,入库风险终态签发已同步入库,OWNER-INGEST-VERIFY-001,sha256-ingest-verify-001`,
      ].join("\n");
      const archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalReceiptReview(
          archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
          {
            text: archiveTransferFinalAcceptanceIngestRiskFinalOwnerReceiptText,
            format: "csv",
            sourceName: "verifier-ingest-risk-final-receipt.csv",
            importedAt: "2026-06-04T10:32:00.000Z",
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalDmsReceiptReview =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalReceiptReview(
          archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
          {
            text: archiveTransferFinalAcceptanceIngestRiskFinalDmsReceiptText,
            format: "csv",
            sourceName: "verifier-ingest-risk-final-dms-receipt.csv",
            importedAt: "2026-06-04T10:36:00.000Z",
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview(
          archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
          [
            archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview,
            archiveTransferFinalAcceptanceIngestRiskFinalDmsReceiptReview,
          ],
          {
            generatedAt: "2026-06-04T10:38:00.000Z",
            batchName: "verifier 入库风险终态多平台复核",
            requiredPlatformNames: [
              "verifier-ingest-risk-final-receipt.csv",
              "verifier-ingest-risk-final-dms-receipt.csv",
            ],
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate(
          archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
          archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview,
          {
            generatedAt: "2026-06-04T10:40:00.000Z",
            requiredPlatformCount: 2,
            gateOwner: "入库负责人",
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage(
          archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
          archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview,
          [
            {
              receiptReview: archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview,
              sourceText: archiveTransferFinalAcceptanceIngestRiskFinalOwnerReceiptText,
              sourceName: "verifier-ingest-risk-final-receipt.csv",
              format: "csv",
              platformName: "业主档案系统",
            },
            {
              receiptReview: archiveTransferFinalAcceptanceIngestRiskFinalDmsReceiptReview,
              sourceText: archiveTransferFinalAcceptanceIngestRiskFinalDmsReceiptText,
              sourceName: "verifier-ingest-risk-final-dms-receipt.csv",
              format: "csv",
              platformName: "通用DMS",
            },
          ],
          {
            generatedAt: "2026-06-04T10:42:00.000Z",
            batchName: "verifier 入库风险终态原始回执证据包",
            packageOwner: "入库负责人",
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalProofPackage =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackage(
          archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
          archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview,
          archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate,
          archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage,
          {
            generatedAt: "2026-06-04T10:44:00.000Z",
            batchName: "verifier 入库风险终态最终可归档证明",
            proofOwner: "入库负责人",
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution(
          archiveTransferFinalAcceptanceIngestRiskFinalProofPackage,
          [
            {
              recipientId: "verifier_owner_archive_center",
              recipientName: "业主档案中心",
              targetSystem: "业主档案门户",
              channel: "offline_csv",
              sentAt: "2026-06-04T10:46:00.000Z",
              dueAt: "2026-06-05",
              externalRecordId: "VERIFY-PROOF-DIST-001",
            },
          ],
          {
            generatedAt: "2026-06-04T10:45:00.000Z",
            batchName: "verifier 入库风险终态最终证明分发记录",
            distributionOwner: "入库负责人",
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt(
          archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
          {
            text: [
              "distribution_id,recipient_id,file_path,receipt_status,receipt_message,received_at,external_record_id,platform_checksum",
              ...archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution.rows.map(
                (row, index) =>
                  `${row.distributionId},${row.recipientId},${row.filePath},accepted,证明文件已签收,2026-06-04T10:${50 + index}:00.000Z,VERIFY-PROOF-RECEIPT-${String(index + 1).padStart(3, "0")},sha256-proof-${index + 1}`,
              ),
            ].join("\n"),
            format: "csv",
            sourceName: "verifier-proof-distribution-receipt.csv",
            importedAt: "2026-06-04T10:55:00.000Z",
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionSupervisionReceipt =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt(
          archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
          {
            text: [
              "distribution_id,recipient_id,file_path,receipt_status,receipt_message,received_at,external_record_id,platform_checksum",
              ...archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution.rows.map(
                (row, index) =>
                  `${row.distributionId},${row.recipientId},${row.filePath},${index === 1 ? "rejected" : "accepted"},${index === 1 ? "监理资料平台拒绝 CSV 证明校验" : "监理资料平台证明文件已签收"},2026-06-04T10:${58 + index}:00.000Z,VERIFY-PROOF-SUP-RECEIPT-${String(index + 1).padStart(3, "0")},${index === 1 ? "sha256-proof-supervision-2" : `sha256-proof-${index + 1}`}`,
              ),
            ].join("\n"),
            format: "csv",
            sourceName: "verifier-proof-supervision-receipt.csv",
            importedAt: "2026-06-04T10:59:00.000Z",
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview(
          archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
          [
            archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt,
            archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionSupervisionReceipt,
          ],
          {
            generatedAt: "2026-06-04T11:00:00.000Z",
            batchName: "verifier 入库风险终态证明分发回执多平台复核",
            requiredPlatformNames: [
              "verifier-proof-distribution-receipt.csv",
              "verifier-proof-supervision-receipt.csv",
              "业主档案门户",
            ],
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate(
          archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
          archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview,
          {
            generatedAt: "2026-06-04T11:01:00.000Z",
            batchName: "verifier 入库风险终态证明分发放行门禁",
            gateOwner: "入库负责人",
            requiredPlatformCount: 3,
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff(
          archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate,
          archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview,
          {
            generatedAt: "2026-06-04T11:02:00.000Z",
            batchName: "verifier 入库风险终态证明放行批量签发",
            signoff: {
              reviewer: "入库负责人",
              conclusion: "approved",
              signedAt: "2026-06-04T11:02:00.000Z",
              remarks: "按最终证明分发放行门禁执行批量签发",
            },
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt(
          archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff,
          {
            text: [
              "distribution_id,recipient_id,file_path,receipt_status,receipt_message,received_at,external_record_id,platform_checksum,synced_release_version",
              `${archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff.rows[0].distributionId},${archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff.rows[0].recipientId},${archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff.rows[0].filePath},accepted,verifier 放行签发 MD 已回写,2026-06-04T11:03:00.000Z,VERIFY-PROOF-SIGNOFF-SYNC-MD,sha256-verifier-signoff-md,AR-VERIFY-20260604`,
              `${archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff.rows[1].distributionId},${archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff.rows[1].recipientId},${archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff.rows[1].filePath},pending,verifier 放行签发 CSV 异步处理中,2026-06-04T11:04:00.000Z,VERIFY-PROOF-SIGNOFF-SYNC-CSV,sha256-verifier-signoff-csv,AR-VERIFY-20260604`,
              "VERIFY-PROOF-SIGNOFF-EXTRA,verifier_owner_archive_center,batch/not-in-verifier-proof-signoff.json,accepted,verifier 非本次放行签发文件,2026-06-04T11:05:00.000Z,VERIFY-PROOF-SIGNOFF-SYNC-EXTRA,sha256-verifier-extra,AR-VERIFY-20260604",
            ].join("\n"),
            format: "csv",
            sourceName: "verifier-proof-release-gate-signoff-sync.csv",
            importedAt: "2026-06-04T11:06:00.000Z",
          },
        );
      const previousArchiveTransferFinalAcceptanceIngestRiskFinalProofPackage = {
        ...archiveTransferFinalAcceptanceIngestRiskFinalProofPackage,
        generatedAt: "2026-06-04T10:20:00.000Z",
        sourceReceiptEvidencePackageFingerprint: "fnv1a32:verifier-previous-evidence-package",
        rows: archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.rows.map((row) =>
          row.artifactKey ===
          "archive_transfer_final_acceptance_ingest_risk_final_receipt_evidence_package"
            ? {
                ...row,
                sourceFingerprint: "fnv1a32:verifier-previous-evidence-package",
                handoverStatus: "needs_review" as const,
              }
            : row,
        ),
        proofFingerprint: "fnv1a32:verifier-previous-proof-package",
      };
      const previousArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution(
          previousArchiveTransferFinalAcceptanceIngestRiskFinalProofPackage,
          [
            {
              recipientId: "verifier_owner_archive_center",
              recipientName: "业主档案中心",
              targetSystem: "业主档案门户",
              channel: "offline_csv",
              sentAt: "2026-06-04T10:26:00.000Z",
              dueAt: "2026-06-05",
              externalRecordId: "VERIFY-PROOF-DIST-OLD",
            },
          ],
          {
            generatedAt: "2026-06-04T10:25:00.000Z",
            batchName: "verifier 入库风险终态旧版证明分发记录",
            distributionOwner: "入库负责人",
          },
        );
      const previousArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt(
          previousArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
          {
            text: [
              "distribution_id,recipient_id,file_path,receipt_status,receipt_message,received_at,external_record_id,platform_checksum",
              ...previousArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution.rows.map(
                (row, index) =>
                  `${row.distributionId},${row.recipientId},${row.filePath},accepted,旧版证明文件已签收,2026-06-04T10:${30 + index}:00.000Z,VERIFY-PROOF-OLD-RECEIPT-${String(index + 1).padStart(3, "0")},sha256-old-proof-${index + 1}`,
              ),
            ].join("\n"),
            format: "csv",
            sourceName: "verifier-previous-proof-distribution-receipt.csv",
            importedAt: "2026-06-04T10:35:00.000Z",
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison(
          previousArchiveTransferFinalAcceptanceIngestRiskFinalProofPackage,
          archiveTransferFinalAcceptanceIngestRiskFinalProofPackage,
          {
            generatedAt: "2026-06-04T10:58:00.000Z",
            batchName: "verifier 入库风险终态证明包换版对比",
            comparisonOwner: "入库负责人",
            previousDistribution:
              previousArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
            previousDistributionReceipt:
              previousArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt,
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger(
          previousArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
          {
            generatedAt: "2026-06-04T11:02:00.000Z",
            rectificationOwner: "入库负责人",
            distributionReceipt:
              previousArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt,
            versionComparison:
              archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison,
          },
        );
      const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate =
        buildEngineeringBatchArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate(
          archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger,
          {
            text: [
              "rectification_id,distribution_id,file_path,closure_status,closed_at,closed_by,closure_note,external_record_id",
              [
                archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger
                  .rows[0]?.rectificationId,
                archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger
                  .rows[0]?.distributionId,
                archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger
                  .rows[0]?.filePath,
                "closed",
                "2026-06-04",
                "入库负责人",
                "verifier 已重发最终证明并取得新版回执",
                "VERIFY-PROOF-RECTIFY-CLOSED-001",
              ].join(","),
            ].join("\n"),
            format: "csv",
            sourceName: "verifier-proof-distribution-rectification-closure.csv",
            importedAt: "2026-06-04T11:05:00.000Z",
          },
        );
      archiveContext.archiveTransferFinalSignoffExternalSyncRectificationLedger =
        archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate.updatedLedger;
      archiveContext.archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate =
        archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate;
      archiveContext.archiveTransferFinalSignoffExternalSyncRectificationReissueHistory =
        archiveTransferFinalSignoffExternalSyncRectificationReissueHistory;
      archiveContext.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation =
        archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation;
      archiveContext.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff =
        archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff;
      archiveContext.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt =
        archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt;
      archiveContext.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger =
        archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate.updatedLedger;
      archiveContext.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate =
        archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate;
      archiveContext.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory =
        archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory;
      archiveContext.archiveTransferFinalAcceptanceRegistration =
        archiveTransferFinalAcceptanceRegistration;
      archiveContext.archiveTransferFinalAcceptanceRegistrationReceiptReview =
        archiveTransferFinalAcceptanceRegistrationReceiptReview;
      archiveContext.archiveTransferFinalAcceptanceRegistrationCrossPlatformReview =
        archiveTransferFinalAcceptanceRegistrationCrossPlatformReview;
      archiveContext.archiveTransferFinalAcceptanceArchiveDashboard =
        archiveTransferFinalAcceptanceArchiveDashboard;
      archiveContext.archiveTransferFinalAcceptanceCrossProjectBaseline =
        archiveTransferFinalAcceptanceCrossProjectBaseline;
      archiveContext.archiveTransferFinalAcceptanceTrendReport =
        archiveTransferFinalAcceptanceTrendReport;
      archiveContext.archiveTransferFinalAcceptanceRectificationAggregation =
        archiveTransferFinalAcceptanceRectificationAggregation;
      archiveContext.archiveTransferFinalAcceptanceRectificationClosureUpdate =
        archiveTransferFinalAcceptanceRectificationClosureUpdate;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskLedger =
        archiveTransferFinalAcceptanceIngestRiskClosureUpdate.updatedRiskLedger;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskClosureUpdate =
        archiveTransferFinalAcceptanceIngestRiskClosureUpdate;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskReissueHistory =
        archiveTransferFinalAcceptanceIngestRiskReissueHistory;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalSignoff =
        archiveTransferFinalAcceptanceIngestRiskFinalSignoff;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview =
        archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview =
        archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate =
        archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage =
        archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage =
        archiveTransferFinalAcceptanceIngestRiskFinalProofPackage;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution =
        archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt =
        archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview =
        archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate =
        archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff =
        archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt =
        archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison =
        archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger =
        archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate.updatedLedger;
      archiveContext.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate =
        archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate;
      const slaReminderArchiveIngest = buildEngineeringBatchArchiveReleaseSlaReminderArchiveIngest({
        generatedAt: "2026-06-03T06:50:00.000Z",
        batchName: "验收批次",
        owner: "资料员A",
        schedule: {
          schema: "railwise.engineering.batch.archiveReleaseSlaReminderSchedule.v1",
          generatedAt: "2026-06-03T06:50:00.000Z",
          policyName: "验收 SLA 提醒",
          timezone: "Asia/Shanghai",
          startAt: "2026-06-04T09:00:00.000Z",
          horizonDays: 1,
          dailySendHour: 9,
          includeWeekends: false,
          maxOccurrencesPerReminder: 1,
          channels: ["企业微信"],
          sourceReminderFingerprint: "fnv1a32:verifier-reminder",
          sourceLedgerFingerprint: "fnv1a32:verifier-ledger",
          sourceClosureFingerprint: null,
          scheduleTemplateFingerprint: "fnv1a32:verifier-template",
          occurrenceCount: 1,
          criticalOccurrenceCount: 1,
          warningOccurrenceCount: 0,
          noticeOccurrenceCount: 0,
          rows: [
            {
              occurrenceId: "SLA-SCHEDULE-VERIFY-001-01",
              reminderId: "SLA-AUDIT-VERIFY-001",
              occurrenceAt: "2026-06-04T09:00:00.000Z",
              policyName: "验收 SLA 提醒",
              reminderSeverity: "critical",
              scheduleSeverity: "critical",
              repeatIntervalHours: 24,
              channels: ["企业微信"],
              sourceStatus: "rectification_overdue",
              issueId: "AR-SLA-VERIFY-001",
              releaseVersion: "AR-20260603-VERIFY",
              adapterId: "owner_archive_dms",
              targetSystem: "业主档案管理系统",
              escalationRole: "资料负责人",
              dueAt: "2026-06-04T18:00:00.000Z",
              overdueHoursAtOccurrence: 12,
              escalationWindow: "due_today",
              action: "验收归档后复核专项入库回执。",
            },
          ],
          scheduleFingerprint: "fnv1a32:verifier-schedule",
          markdown: "# 验收 SLA 提醒",
          csv: "occurrence_id\nSLA-SCHEDULE-VERIFY-001-01",
          json: '{"schema":"railwise.engineering.batch.archiveReleaseSlaReminderSchedule.v1"}',
        },
      });
      const slaReminderPlan =
        buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemImportPlan(archiveItems, {
          ...archiveContext,
          archiveReleaseSlaReminderArchiveIngest: slaReminderArchiveIngest,
          externalSystemImportMode: "http_json",
          externalSystemEndpointBaseUrl: "https://archive.example.test/api/v1",
        });
      const slaReminderAudit = buildEngineeringBatchExternalSystemHttpSubmissionAudit(
        slaReminderPlan,
        {
          submittedAt: "2026-06-03T06:55:00.000Z",
          completedAt: "2026-06-03T06:56:00.000Z",
          attempts: slaReminderPlan.requests.map((request, index) => {
            const pending = index === 0;
            return {
              requestId: request.requestId,
              submittedAt: "2026-06-03T06:55:00.000Z",
              completedAt: "2026-06-03T06:56:00.000Z",
              durationMs: 120,
              statusCode: pending ? 202 : 200,
              ok: true,
              responseText: JSON.stringify({
                receipt_status: pending ? "pending" : "accepted",
                external_record_id: `VERIFY-${request.adapterId}`,
                receipt_message: pending ? "异步处理中" : "已验收入库",
              }),
            };
          }),
        },
      );
      const slaReminderReplayQueue = buildEngineeringBatchExternalSystemHttpReplayQueue(
        slaReminderPlan,
        slaReminderAudit,
        { generatedAt: "2026-06-03T06:56:15.000Z" },
      );
      const slaReminderReceipt = buildEngineeringBatchExternalSystemImportReceiptReconciliation(
        slaReminderPlan,
        {
          text: slaReminderAudit.receiptCsv,
          format: "csv",
          sourceName: "验收 SLA 专项回执.csv",
          importedAt: "2026-06-03T06:56:30.000Z",
        },
      );
      const slaReminderReceiptUpdate =
        buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemImportReceiptUpdate(
          slaReminderArchiveIngest,
          slaReminderPlan,
          slaReminderReceipt,
          { generatedAt: "2026-06-03T06:57:00.000Z" },
        );
      const slaReminderReplayPlan = {
        ...slaReminderPlan,
        generatedAt: "2026-06-03T06:57:10.000Z",
        requestCount: slaReminderReplayQueue.requestCount,
        requests: slaReminderPlan.requests.filter((request) =>
          slaReminderReplayQueue.rows.some((row) => row.requestId === request.requestId),
        ),
      };
      const slaReminderReplayAudit = buildEngineeringBatchExternalSystemHttpSubmissionAudit(
        slaReminderReplayPlan,
        {
          submittedAt: "2026-06-03T06:57:20.000Z",
          completedAt: "2026-06-03T06:57:40.000Z",
          attempts: slaReminderReplayPlan.requests.map((request) => ({
            requestId: request.requestId,
            submittedAt: "2026-06-03T06:57:20.000Z",
            completedAt: "2026-06-03T06:57:40.000Z",
            durationMs: 100,
            statusCode: 200,
            ok: true,
            responseText: JSON.stringify({
              receipt_status: "pending",
              external_record_id: `VERIFY-REPLAY-${request.adapterId}`,
              receipt_message: "重放后仍处理中",
            }),
          })),
        },
      );
      const slaReminderReplayUpdate =
        buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemHttpReplayUpdate(
          slaReminderReceiptUpdate.updatedArchiveIngest,
          slaReminderPlan,
          slaReminderAudit,
          slaReminderReplayAudit,
          { generatedAt: "2026-06-03T06:57:50.000Z" },
        );
      const slaReminderReplayHistory =
        buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemHttpReplayHistory({
          generatedAt: "2026-06-03T06:57:55.000Z",
          batchName: "Verifier Archive",
          plan: slaReminderPlan,
          initialIngest: slaReminderArchiveIngest,
          initialAudit: slaReminderAudit,
          initialReceiptUpdate: slaReminderReceiptUpdate,
          rounds: [
            {
              roundNo: 1,
              replayStartedAt: "2026-06-03T06:57:20.000Z",
              replayCompletedAt: "2026-06-03T06:57:50.000Z",
              beforeQueue: slaReminderReplayQueue,
              replayAudit: slaReminderReplayAudit,
              update: slaReminderReplayUpdate,
            },
          ],
        });
      archiveContext.archiveReleaseSlaReminderArchiveIngest =
        slaReminderReplayUpdate.receiptUpdate.updatedArchiveIngest;
      archiveContext.archiveReleaseSlaReminderExternalSystemHttpReplayQueue =
        slaReminderReplayUpdate.replayQueue;
      archiveContext.archiveReleaseSlaReminderExternalSystemHttpReplayHistory =
        slaReminderReplayHistory;
      archiveContext.archiveReleaseSlaReminderExternalSystemImportReceiptUpdate =
        slaReminderReplayUpdate.receiptUpdate;
      const slaReminderFinalConfirmation =
        buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemFinalReceiptConfirmation(
          slaReminderReplayUpdate.receiptUpdate,
          slaReminderPlan,
          {
            text: [
              "request_id,adapter_id,file_path,final_status,confirmed_at,confirmed_by,confirmation_note,external_record_id,platform_checksum",
              ...slaReminderPlan.requests.map((request, index) =>
                [
                  request.requestId,
                  request.adapterId,
                  request.filePath,
                  "accepted",
                  "2026-06-04T09:00:00.000Z",
                  "资料员A",
                  "verifier SLA 提醒专项最终回执已确认",
                  `VERIFIER-SLA-FINAL-${index + 1}`,
                  `sha256-final-${index + 1}`,
                ].join(","),
              ),
            ].join("\n"),
            format: "csv",
            sourceName: "验收 SLA 专项最终回执.csv",
            importedAt: "2026-06-04T09:00:00.000Z",
          },
          { replayHistory: slaReminderReplayHistory },
        );
      archiveContext.archiveReleaseSlaReminderArchiveIngest =
        slaReminderFinalConfirmation.updatedArchiveIngest;
      archiveContext.archiveReleaseSlaReminderExternalSystemFinalReceiptConfirmation =
        slaReminderFinalConfirmation;
      const slaReminderCrossPlatformReview =
        buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemFinalReceiptCrossPlatformReview(
          slaReminderFinalConfirmation,
          { generatedAt: "2026-06-04T09:10:00.000Z" },
        );
      archiveContext.archiveReleaseSlaReminderExternalSystemFinalReceiptCrossPlatformReview =
        slaReminderCrossPlatformReview;
      const slaReminderFinalSignoff =
        buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemFinalReceiptBatchSignoff(
          slaReminderFinalConfirmation,
          slaReminderCrossPlatformReview,
          {
            generatedAt: "2026-06-04T09:15:00.000Z",
            batchName: "验收归档批次",
            signoff: {
              reviewer: "资料负责人A",
              conclusion:
                slaReminderCrossPlatformReview.blockingIssueCount > 0 ? "needs_rework" : "approved",
              remarks: "verifier SLA 提醒专项最终确认批量签发",
              signedAt: "2026-06-04T09:14:00.000Z",
            },
          },
        );
      archiveContext.archiveReleaseSlaReminderExternalSystemFinalReceiptBatchSignoff =
        slaReminderFinalSignoff;
      archiveContext.archiveReleaseSlaReminderExternalSystemFinalReceiptSignoffExternalSyncReceipt =
        buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemFinalReceiptSignoffExternalSyncReceipt(
          slaReminderFinalSignoff,
          {
            text: [
              "file_path,external_record_id,receipt_status,receipt_message,received_at,synced_release_version",
              "batch/archive-release-sla-reminder-ingest.md,VERIFY-SIGNOFF-SYNC-MD,accepted,最终签发已回传,2026-06-04T09:20:00.000Z,AR-VERIFY",
              "batch/archive-release-sla-reminder-ingest.csv,VERIFY-SIGNOFF-SYNC-CSV,pending,外部系统异步处理中,2026-06-04T09:21:00.000Z,AR-VERIFY",
              "batch/archive-release-sla-reminder-ingest.json,VERIFY-SIGNOFF-SYNC-JSON,accepted,JSON 签发已回传,2026-06-04T09:22:00.000Z,AR-VERIFY",
              "batch/archive-release-sla-reminder-extra.json,VERIFY-SIGNOFF-SYNC-EXTRA,accepted,非本批次签发文件,2026-06-04T09:23:00.000Z,AR-VERIFY",
            ].join("\n"),
            format: "csv",
            sourceName: "验收 SLA 专项最终签发回传.csv",
            importedAt: "2026-06-04T09:24:00.000Z",
          },
        );
      const slaReminderRectification =
        buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemImportRectificationLedger(
          slaReminderReplayUpdate.receiptUpdate,
          { generatedAt: "2026-06-03T06:58:00.000Z" },
        );
      const slaReminderClosureUpdate =
        buildEngineeringBatchArchiveReleaseSlaReminderExternalSystemImportRectificationClosureUpdate(
          slaReminderRectification,
          {
            text: [
              "issue_id,file_path,closure_status,closed_at,closed_by,closure_note,external_record_id",
              [
                slaReminderRectification.rows[0]?.issueId,
                slaReminderRectification.rows[0]?.filePath,
                "closed",
                "2026-06-04",
                "资料员A",
                "verifier 专项整改已销项",
                "VERIFIER-SLA-CLOSED-001",
              ].join(","),
            ].join("\n"),
            format: "csv",
            sourceName: "验收 SLA 专项整改销项.csv",
            importedAt: "2026-06-04T08:00:00.000Z",
          },
        );
      archiveContext.archiveReleaseSlaReminderExternalSystemImportRectificationLedger =
        slaReminderClosureUpdate.updatedLedger;
      archiveContext.archiveReleaseSlaReminderExternalSystemImportRectificationClosureUpdate =
        slaReminderClosureUpdate;
    }
    const archive = buildEngineeringBatchArchiveZipExport(archiveItems, archiveContext);
    const bytes = Buffer.from(archive.base64, "base64");
    const finalBytes = transform ? transform(bytes) : bytes;
    const archivePath = join(workDir, fileName);
    writeFileSync(archivePath, finalBytes);
    return archivePath;
  }
});

function tamperArchiveBytes(bytes: Buffer): Buffer {
  const copy = Buffer.from(bytes);
  const marker = Buffer.from("field_key,label,value,required,source", "utf8");
  const index = copy.indexOf(marker);
  expect(index).toBeGreaterThan(0);
  copy[index] = copy[index] === 0x66 ? 0x46 : 0x66;
  return copy;
}
