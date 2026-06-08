#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

const REQUIRED_ENTRIES = [
  "manifest.json",
  "checksums.csv",
  "batch/batch-package.railwise-engineering-batch.json",
  "batch/external-upload-manifest.json",
  "batch/external-upload-manifest.csv",
  "batch/external-system-upload-adapters.json",
  "batch/external-system-upload-rows.csv",
  "batch/archive-release-record.json",
  "batch/archive-release-record.csv",
  "audit/audit-report.docx",
  "audit/audit-report.pdf",
  "audit/approval-cover.html",
  "audit/quality-dashboard.html",
  "audit/archive-inspection-report.html",
  "audit/archive-inspection-report.json",
  "audit/archive-inspection-signoff.html",
  "audit/archive-inspection-signoff.json",
  "audit/archive-inspection-signoff.csv",
];

const REQUIRED_UPLOAD_FIELDS = [
  "project_name",
  "batch_name",
  "discipline",
  "document_category",
  "approval_status",
  "quality_issue_count",
  "reviewer",
  "review_conclusion",
  "audit_fingerprint",
  "batch_fingerprint",
  "archive_folder_name",
  "archive_package_name",
  "checksum_catalog_path",
];

const REQUIRED_SIGNOFF_UPLOAD_PATHS = [
  "audit/archive-inspection-signoff.html",
  "audit/archive-inspection-signoff.json",
  "audit/archive-inspection-signoff.csv",
];

const USAGE = `Usage: node scripts/verify-engineering-archive.mjs <archive.zip> [--json] [--require-clean]

Verifies a Railwise engineering archive ZIP:
  - required archive entries
  - manifest.json schema and entry metadata
  - checksums.csv byte length, CRC32, and FNV fingerprints
  - external upload manifest fields and directory naming metadata
  - external archive-system adapter mappings and upload rows
  - archive inspection report and signoff record binding
  - archive release record and version fingerprint binding
  - optional release portfolio dashboard and cross-project baseline binding
`;

function parseArgs(argv) {
  const options = {
    archivePath: null,
    help: false,
    json: false,
    requireClean: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--require-clean") {
      options.requireClean = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`unknown argument: ${arg}\n${USAGE}`);
    }
    if (options.archivePath) {
      throw new Error(`multiple archive paths provided\n${USAGE}`);
    }
    options.archivePath = arg;
  }

  if (!options.help && !options.archivePath) {
    throw new Error(`missing archive path\n${USAGE}`);
  }

  return options;
}

function verifyArchive(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`archive file not found: ${absolutePath}`);
  }

  const bytes = readFileSync(absolutePath);
  const zip = parseZip(bytes);
  const errors = [];
  const warnings = [];
  const byPath = new Map(zip.entries.map((entry) => [entry.name, entry]));

  for (const requiredPath of REQUIRED_ENTRIES) {
    if (!byPath.has(requiredPath)) {
      errors.push(`missing required entry: ${requiredPath}`);
    }
  }

  for (const entry of zip.entries) {
    const computedCrc = crc32Hex(entry.data);
    if (computedCrc !== entry.crc32) {
      errors.push(
        `CRC32 mismatch in ZIP central directory: ${entry.name} expected ${entry.crc32}, got ${computedCrc}`,
      );
    }
  }

  const archiveManifest = readJsonEntry(byPath, "manifest.json", errors);
  const batchPackage = readJsonEntry(
    byPath,
    "batch/batch-package.railwise-engineering-batch.json",
    errors,
  );
  const engineReviewCatalog = readJsonEntry(
    byPath,
    "batch/engine-review-catalog.json",
    errors,
  );
  const enginePreflight = readJsonEntry(
    byPath,
    "batch/engine-preflight.json",
    errors,
  );
  const engineAcceptance = readJsonEntry(
    byPath,
    "batch/engine-acceptance.json",
    errors,
  );
  const checksumRows = readCsvEntry(byPath, "checksums.csv", errors);
  const externalUploadManifest = readJsonEntry(
    byPath,
    "batch/external-upload-manifest.json",
    errors,
  );
  const externalUploadRows = readCsvEntry(byPath, "batch/external-upload-manifest.csv", errors);
  const externalSystemUploadAdapters = readJsonEntry(
    byPath,
    "batch/external-system-upload-adapters.json",
    errors,
  );
  const externalSystemUploadRows = readCsvEntry(
    byPath,
    "batch/external-system-upload-rows.csv",
    errors,
  );
  const archiveReleaseRecord = readJsonEntry(byPath, "batch/archive-release-record.json", errors);
  const archiveReleaseRows = readCsvEntry(byPath, "batch/archive-release-record.csv", errors);
  const archiveReleaseDeliveryReadiness = readJsonEntry(
    byPath,
    "batch/archive-release-delivery-readiness.json",
    errors,
  );
  const archiveReleaseDeliveryReadinessRows = readCsvEntry(
    byPath,
    "batch/archive-release-delivery-readiness.csv",
    errors,
  );
  const archiveAcceptanceRemediationRecheckUpdate = readJsonEntry(
    byPath,
    "batch/archive-acceptance-remediation-recheck-update.json",
    errors,
  );
  const archiveAcceptanceRemediationRecheckUpdateRows = readCsvEntry(
    byPath,
    "batch/archive-acceptance-remediation-recheck-update.csv",
    errors,
  );
  const archiveAcceptanceFinalRegistration = readJsonEntry(
    byPath,
    "batch/archive-acceptance-final-registration.json",
    errors,
  );
  const archiveAcceptanceFinalRegistrationRows = readCsvEntry(
    byPath,
    "batch/archive-acceptance-final-registration.csv",
    errors,
  );
  const archiveReleasePortfolioDashboard = readJsonEntry(
    byPath,
    "batch/archive-release-portfolio-dashboard.json",
    errors,
  );
  const archiveReleasePortfolioTimelineRows = readCsvEntry(
    byPath,
    "batch/archive-release-portfolio-timeline.csv",
    errors,
  );
  const archiveReleasePortfolioAdapterRows = readCsvEntry(
    byPath,
    "batch/archive-release-portfolio-adapter-trend.csv",
    errors,
  );
  const archiveReleaseCrossProjectBaselineComparison = readJsonEntry(
    byPath,
    "batch/archive-release-cross-project-baseline.json",
    errors,
  );
  const archiveReleaseCrossProjectBaselineRows = readCsvEntry(
    byPath,
    "batch/archive-release-cross-project-baseline.csv",
    errors,
  );
  const archiveReleaseCrossProjectAutoReview = readJsonEntry(
    byPath,
    "batch/archive-release-cross-project-auto-review.json",
    errors,
  );
  const archiveReleaseCrossProjectAutoReviewRows = readCsvEntry(
    byPath,
    "batch/archive-release-cross-project-auto-review.csv",
    errors,
  );
  const archiveTransferWorkflowTemplate = readJsonEntry(
    byPath,
    "batch/archive-transfer-workflow-template.json",
    errors,
  );
  const archiveTransferWorkflowRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-workflow-template.csv",
    errors,
  );
  const archiveTransferSignatureRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-signature-template.csv",
    errors,
  );
  const archiveTransferSignatureReceiptUpdate = readJsonEntry(
    byPath,
    "batch/archive-transfer-signature-receipt-update.json",
    errors,
  );
  const archiveTransferSignatureReceiptUpdateRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-signature-receipt-update.csv",
    errors,
  );
  const archiveTransferRectificationLedger = readJsonEntry(
    byPath,
    "batch/archive-transfer-rectification-ledger.json",
    errors,
  );
  const archiveTransferRectificationLedgerRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-rectification-ledger.csv",
    errors,
  );
  const archiveTransferRectificationClosureUpdate = readJsonEntry(
    byPath,
    "batch/archive-transfer-rectification-closure-update.json",
    errors,
  );
  const archiveTransferRectificationClosureUpdateRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-rectification-closure-update.csv",
    errors,
  );
  const archiveTransferRectificationReissueHistory = readJsonEntry(
    byPath,
    "batch/archive-transfer-rectification-reissue-history.json",
    errors,
  );
  const archiveTransferRectificationReissueHistoryRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-rectification-reissue-history.csv",
    errors,
  );
  const archiveTransferFinalSignoff = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-signoff.json",
    errors,
  );
  const archiveTransferFinalSignoffRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-signoff.csv",
    errors,
  );
  const archiveTransferFinalSignoffExternalSyncReceipt = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-receipt.json",
    errors,
  );
  const archiveTransferFinalSignoffExternalSyncReceiptRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-receipt.csv",
    errors,
  );
  const archiveTransferFinalSignoffExternalSyncRectificationLedger = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-rectification-ledger.json",
    errors,
  );
  const archiveTransferFinalSignoffExternalSyncRectificationLedgerRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-rectification-ledger.csv",
    errors,
  );
  const archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-rectification-closure-update.json",
    errors,
  );
  const archiveTransferFinalSignoffExternalSyncRectificationClosureUpdateRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-rectification-closure-update.csv",
    errors,
  );
  const archiveTransferFinalSignoffExternalSyncRectificationReissueHistory = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-rectification-reissue-history.json",
    errors,
  );
  const archiveTransferFinalSignoffExternalSyncRectificationReissueHistoryRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-rectification-reissue-history.csv",
    errors,
  );
  const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation.json",
    errors,
  );
  const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation.csv",
    errors,
  );
  const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff =
    readJsonEntry(
      byPath,
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff.json",
      errors,
    );
  const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffRows =
    readCsvEntry(
      byPath,
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff.csv",
      errors,
    );
  const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt =
    readJsonEntry(
      byPath,
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-receipt.json",
      errors,
    );
  const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceiptRows =
    readCsvEntry(
      byPath,
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-receipt.csv",
      errors,
    );
  const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger =
    readJsonEntry(
      byPath,
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-ledger.json",
      errors,
    );
  const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedgerRows =
    readCsvEntry(
      byPath,
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-ledger.csv",
      errors,
    );
  const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate =
    readJsonEntry(
      byPath,
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-closure-update.json",
      errors,
    );
  const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdateRows =
    readCsvEntry(
      byPath,
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-closure-update.csv",
      errors,
    );
  const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory =
    readJsonEntry(
      byPath,
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-reissue-history.json",
      errors,
    );
  const archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistoryRows =
    readCsvEntry(
      byPath,
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-reissue-history.csv",
      errors,
    );
  const archiveTransferFinalAcceptanceRegistration = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration.json",
    errors,
  );
  const archiveTransferFinalAcceptanceRegistrationRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceRegistrationReceiptReview = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-receipt-review.json",
    errors,
  );
  const archiveTransferFinalAcceptanceRegistrationReceiptReviewRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-receipt-review.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceRegistrationCrossPlatformReview = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-cross-platform-review.json",
    errors,
  );
  const archiveTransferFinalAcceptanceRegistrationCrossPlatformReviewRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-cross-platform-review.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceArchiveDashboard = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-archive-dashboard.json",
    errors,
  );
  const archiveTransferFinalAcceptanceArchiveDashboardRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-archive-dashboard.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceCrossProjectBaseline = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-cross-project-baseline.json",
    errors,
  );
  const archiveTransferFinalAcceptanceCrossProjectBaselineRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-cross-project-baseline.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceTrendReport = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-trend-report.json",
    errors,
  );
  const archiveTransferFinalAcceptanceBaselineTrendRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-baseline-trend.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceProjectTrendRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-project-trend.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceRectificationAggregation = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-rectification-aggregation.json",
    errors,
  );
  const archiveTransferFinalAcceptanceRectificationAggregationRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-rectification-aggregation.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceRectificationClosureUpdate = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-rectification-closure-update.json",
    errors,
  );
  const archiveTransferFinalAcceptanceRectificationClosureUpdateRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-rectification-closure-update.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskLedger = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-ledger.json",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskLedgerRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-ledger.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskClosureUpdate = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-closure-update.json",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskClosureUpdateRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-closure-update.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskReissueHistory = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-reissue-history.json",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskReissueHistoryRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-reissue-history.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalSignoff = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-signoff.json",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalSignoffRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-signoff.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-review.json",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalReceiptReviewRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-review.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-cross-platform-review.json",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReviewRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-cross-platform-review.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-consistency-gate.json",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGateRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-consistency-gate.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-evidence-package.json",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackageRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-evidence-package.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackage = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package.json",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution.json",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-receipt.json",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceiptRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-receipt.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview =
    readJsonEntry(
      byPath,
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-cross-platform-review.json",
      errors,
    );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReviewRows =
    readCsvEntry(
      byPath,
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-cross-platform-review.csv",
      errors,
    );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate =
    readJsonEntry(
      byPath,
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate.json",
      errors,
    );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateRows =
    readCsvEntry(
      byPath,
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate.csv",
      errors,
    );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff =
    readJsonEntry(
      byPath,
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff.json",
      errors,
    );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffRows =
    readCsvEntry(
      byPath,
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff.csv",
      errors,
    );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt =
    readJsonEntry(
      byPath,
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff-external-sync-receipt.json",
      errors,
    );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceiptRows =
    readCsvEntry(
      byPath,
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff-external-sync-receipt.csv",
      errors,
    );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison = readJsonEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-version-comparison.json",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparisonRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-version-comparison.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparisonFileRows = readCsvEntry(
    byPath,
    "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-version-comparison-files.csv",
    errors,
  );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger =
    readJsonEntry(
      byPath,
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-ledger.json",
      errors,
    );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedgerRows =
    readCsvEntry(
      byPath,
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-ledger.csv",
      errors,
    );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate =
    readJsonEntry(
      byPath,
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-closure-update.json",
      errors,
    );
  const archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdateRows =
    readCsvEntry(
      byPath,
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-closure-update.csv",
      errors,
    );
  const archiveReleaseSlaReminderArchiveIngest = readJsonEntry(
    byPath,
    "batch/archive-release-sla-reminder-ingest.json",
    errors,
  );
  const archiveReleaseSlaReminderArchiveIngestRows = readCsvEntry(
    byPath,
    "batch/archive-release-sla-reminder-ingest.csv",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportHttpReplayQueue = readJsonEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-http-replay-queue.json",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportHttpReplayQueueRows = readCsvEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-http-replay-queue.csv",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportHttpReplayHistory = readJsonEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-http-replay-history.json",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportHttpReplayHistoryRows = readCsvEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-http-replay-history.csv",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportReceiptUpdate = readJsonEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-receipt-update.json",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportReceiptUpdateRows = readCsvEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-receipt-update.csv",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportFinalReceiptConfirmation = readJsonEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-final-receipt-confirmation.json",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportFinalReceiptConfirmationRows = readCsvEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-final-receipt-confirmation.csv",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportFinalReceiptCrossPlatformReview = readJsonEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-final-receipt-cross-platform-review.json",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportFinalReceiptCrossPlatformReviewRows = readCsvEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-final-receipt-cross-platform-review.csv",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportFinalReceiptBatchSignoff = readJsonEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-final-receipt-batch-signoff.json",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportFinalReceiptBatchSignoffRows = readCsvEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-final-receipt-batch-signoff.csv",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportFinalReceiptSignoffExternalSyncReceipt =
    readJsonEntry(
      byPath,
      "batch/archive-release-sla-reminder-external-import-final-receipt-signoff-external-sync-receipt.json",
      errors,
    );
  const archiveReleaseSlaReminderExternalImportFinalReceiptSignoffExternalSyncReceiptRows =
    readCsvEntry(
      byPath,
      "batch/archive-release-sla-reminder-external-import-final-receipt-signoff-external-sync-receipt.csv",
      errors,
    );
  const archiveReleaseSlaReminderExternalImportRectificationLedger = readJsonEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-rectification-ledger.json",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportRectificationLedgerRows = readCsvEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-rectification-ledger.csv",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportRectificationClosureUpdate = readJsonEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-rectification-closure-update.json",
    errors,
  );
  const archiveReleaseSlaReminderExternalImportRectificationClosureUpdateRows = readCsvEntry(
    byPath,
    "batch/archive-release-sla-reminder-external-import-rectification-closure-update.csv",
    errors,
  );
  const archiveInspectionReport = readJsonEntry(
    byPath,
    "audit/archive-inspection-report.json",
    errors,
  );
  const archiveInspectionSignoff = readJsonEntry(
    byPath,
    "audit/archive-inspection-signoff.json",
    errors,
  );
  const archiveInspectionSignoffRows = readCsvEntry(
    byPath,
    "audit/archive-inspection-signoff.csv",
    errors,
  );

  validateArchiveManifest(archiveManifest, byPath, errors);
  const checksumRowsChecked = validateChecksumCatalog(checksumRows, byPath, errors);
  validateExternalUploadManifest(externalUploadManifest, externalUploadRows, errors, warnings);
  validateExternalSystemUploadAdapters(
    externalSystemUploadAdapters,
    externalSystemUploadRows,
    errors,
  );
  const engineReviewCoverage = validateEngineReviewArtifacts(
    batchPackage,
    engineReviewCatalog,
    byPath,
    archiveManifest,
    externalUploadManifest,
    errors,
  );
  const enginePreflightCoverage = validateEnginePreflightArtifacts(
    batchPackage,
    enginePreflight,
    byPath,
    archiveManifest,
    externalUploadManifest,
    errors,
  );
  const engineAcceptanceCoverage = validateEngineAcceptanceArtifacts(
    batchPackage,
    engineAcceptance,
    enginePreflight,
    byPath,
    archiveManifest,
    externalUploadManifest,
    errors,
  );
  validateSignoffExternalUploadCoverage(externalUploadManifest, externalSystemUploadRows, errors);
  validateArchiveInspectionReport(archiveInspectionReport, errors);
  validateArchiveInspectionSignoff(
    archiveInspectionSignoff,
    archiveInspectionSignoffRows,
    archiveInspectionReport,
    errors,
  );
  validateArchiveReleasePortfolioDashboard(
    archiveReleasePortfolioDashboard,
    archiveReleasePortfolioTimelineRows,
    archiveReleasePortfolioAdapterRows,
    archiveManifest,
    externalUploadManifest,
    errors,
  );
  validateArchiveReleaseCrossProjectBaselineComparison(
    archiveReleaseCrossProjectBaselineComparison,
    archiveReleaseCrossProjectBaselineRows,
    archiveManifest,
    externalUploadManifest,
    errors,
  );
  validateArchiveReleaseCrossProjectAutoReview(
    archiveReleaseCrossProjectAutoReview,
    archiveReleaseCrossProjectAutoReviewRows,
    archiveReleaseCrossProjectBaselineComparison,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferWorkflowTemplate(
    archiveTransferWorkflowTemplate,
    archiveTransferWorkflowRows,
    archiveTransferSignatureRows,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferSignatureReceiptUpdate(
    archiveTransferSignatureReceiptUpdate,
    archiveTransferSignatureReceiptUpdateRows,
    archiveTransferWorkflowTemplate,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferRectificationLedger(
    archiveTransferRectificationLedger,
    archiveTransferRectificationLedgerRows,
    archiveTransferSignatureReceiptUpdate,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferRectificationClosureUpdate(
    archiveTransferRectificationClosureUpdate,
    archiveTransferRectificationClosureUpdateRows,
    archiveTransferRectificationLedger,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferRectificationReissueHistory(
    archiveTransferRectificationReissueHistory,
    archiveTransferRectificationReissueHistoryRows,
    archiveTransferRectificationLedger,
    archiveTransferRectificationClosureUpdate,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalSignoff(
    archiveTransferFinalSignoff,
    archiveTransferFinalSignoffRows,
    archiveTransferRectificationLedger,
    archiveTransferRectificationReissueHistory,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalSignoffExternalSyncReceipt(
    archiveTransferFinalSignoffExternalSyncReceipt,
    archiveTransferFinalSignoffExternalSyncReceiptRows,
    archiveTransferFinalSignoff,
    archiveTransferRectificationLedger,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalSignoffExternalSyncRectificationLedger(
    archiveTransferFinalSignoffExternalSyncRectificationLedger,
    archiveTransferFinalSignoffExternalSyncRectificationLedgerRows,
    archiveTransferFinalSignoffExternalSyncReceipt,
    archiveTransferFinalSignoff,
    archiveTransferRectificationLedger,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalSignoffExternalSyncRectificationClosureUpdate(
    archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate,
    archiveTransferFinalSignoffExternalSyncRectificationClosureUpdateRows,
    archiveTransferFinalSignoffExternalSyncRectificationLedger,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalSignoffExternalSyncRectificationReissueHistory(
    archiveTransferFinalSignoffExternalSyncRectificationReissueHistory,
    archiveTransferFinalSignoffExternalSyncRectificationReissueHistoryRows,
    archiveTransferFinalSignoffExternalSyncRectificationLedger,
    archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation(
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationRows,
    archiveTransferFinalSignoffExternalSyncRectificationReissueHistory,
    archiveTransferFinalSignoffExternalSyncRectificationLedger,
    archiveTransferFinalSignoffExternalSyncReceipt,
    archiveTransferFinalSignoff,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff(
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffRows,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    archiveReleaseRecord,
    errors,
  );
  validateArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt(
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceiptRows,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    archiveReleaseRecord,
    errors,
  );
  validateArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger(
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedgerRows,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    archiveReleaseRecord,
    errors,
  );
  validateArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate(
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdateRows,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    archiveReleaseRecord,
    errors,
  );
  validateArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory(
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistoryRows,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    archiveReleaseRecord,
    errors,
  );
  validateArchiveReleaseSlaReminderArchiveIngest(
    archiveReleaseSlaReminderArchiveIngest,
    archiveReleaseSlaReminderArchiveIngestRows,
    archiveManifest,
    externalUploadManifest,
    errors,
  );
  validateArchiveReleaseSlaReminderExternalImportHttpReplayQueue(
    archiveReleaseSlaReminderExternalImportHttpReplayQueue,
    archiveReleaseSlaReminderExternalImportHttpReplayQueueRows,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveReleaseSlaReminderExternalImportHttpReplayHistory(
    archiveReleaseSlaReminderExternalImportHttpReplayHistory,
    archiveReleaseSlaReminderExternalImportHttpReplayHistoryRows,
    archiveReleaseSlaReminderExternalImportHttpReplayQueue,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveReleaseSlaReminderExternalImportReceiptUpdate(
    archiveReleaseSlaReminderExternalImportReceiptUpdate,
    archiveReleaseSlaReminderExternalImportReceiptUpdateRows,
    archiveReleaseSlaReminderArchiveIngest,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveReleaseSlaReminderExternalImportFinalReceiptConfirmation(
    archiveReleaseSlaReminderExternalImportFinalReceiptConfirmation,
    archiveReleaseSlaReminderExternalImportFinalReceiptConfirmationRows,
    archiveReleaseSlaReminderExternalImportReceiptUpdate,
    archiveReleaseSlaReminderExternalImportHttpReplayHistory,
    archiveReleaseSlaReminderArchiveIngest,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveReleaseSlaReminderExternalImportFinalReceiptCrossPlatformReview(
    archiveReleaseSlaReminderExternalImportFinalReceiptCrossPlatformReview,
    archiveReleaseSlaReminderExternalImportFinalReceiptCrossPlatformReviewRows,
    archiveReleaseSlaReminderExternalImportFinalReceiptConfirmation,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveReleaseSlaReminderExternalImportFinalReceiptBatchSignoff(
    archiveReleaseSlaReminderExternalImportFinalReceiptBatchSignoff,
    archiveReleaseSlaReminderExternalImportFinalReceiptBatchSignoffRows,
    archiveReleaseSlaReminderExternalImportFinalReceiptConfirmation,
    archiveReleaseSlaReminderExternalImportFinalReceiptCrossPlatformReview,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveReleaseSlaReminderExternalImportFinalReceiptSignoffExternalSyncReceipt(
    archiveReleaseSlaReminderExternalImportFinalReceiptSignoffExternalSyncReceipt,
    archiveReleaseSlaReminderExternalImportFinalReceiptSignoffExternalSyncReceiptRows,
    archiveReleaseSlaReminderExternalImportFinalReceiptBatchSignoff,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveReleaseSlaReminderExternalImportRectificationLedger(
    archiveReleaseSlaReminderExternalImportRectificationLedger,
    archiveReleaseSlaReminderExternalImportRectificationLedgerRows,
    archiveReleaseSlaReminderExternalImportReceiptUpdate,
    archiveReleaseSlaReminderArchiveIngest,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveReleaseSlaReminderExternalImportRectificationClosureUpdate(
    archiveReleaseSlaReminderExternalImportRectificationClosureUpdate,
    archiveReleaseSlaReminderExternalImportRectificationClosureUpdateRows,
    archiveReleaseSlaReminderExternalImportRectificationLedger,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveAcceptanceRemediationRecheckUpdate(
    archiveAcceptanceRemediationRecheckUpdate,
    archiveAcceptanceRemediationRecheckUpdateRows,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveAcceptanceFinalRegistration(
    archiveAcceptanceFinalRegistration,
    archiveAcceptanceFinalRegistrationRows,
    archiveAcceptanceRemediationRecheckUpdate,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceRegistration(
    archiveTransferFinalAcceptanceRegistration,
    archiveTransferFinalAcceptanceRegistrationRows,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceRegistrationReceiptReview(
    archiveTransferFinalAcceptanceRegistrationReceiptReview,
    archiveTransferFinalAcceptanceRegistrationReceiptReviewRows,
    archiveTransferFinalAcceptanceRegistration,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceRegistrationCrossPlatformReview(
    archiveTransferFinalAcceptanceRegistrationCrossPlatformReview,
    archiveTransferFinalAcceptanceRegistrationCrossPlatformReviewRows,
    archiveTransferFinalAcceptanceRegistration,
    archiveTransferFinalAcceptanceRegistrationReceiptReview,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceArchiveDashboard(
    archiveTransferFinalAcceptanceArchiveDashboard,
    archiveTransferFinalAcceptanceArchiveDashboardRows,
    archiveTransferFinalAcceptanceRegistration,
    archiveTransferFinalAcceptanceRegistrationReceiptReview,
    archiveTransferFinalAcceptanceRegistrationCrossPlatformReview,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceCrossProjectBaseline(
    archiveTransferFinalAcceptanceCrossProjectBaseline,
    archiveTransferFinalAcceptanceCrossProjectBaselineRows,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceTrendReport(
    archiveTransferFinalAcceptanceTrendReport,
    archiveTransferFinalAcceptanceBaselineTrendRows,
    archiveTransferFinalAcceptanceProjectTrendRows,
    archiveTransferFinalAcceptanceCrossProjectBaseline,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceRectificationAggregation(
    archiveTransferFinalAcceptanceRectificationAggregation,
    archiveTransferFinalAcceptanceRectificationAggregationRows,
    archiveTransferFinalAcceptanceTrendReport,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceRectificationClosureUpdate(
    archiveTransferFinalAcceptanceRectificationClosureUpdate,
    archiveTransferFinalAcceptanceRectificationClosureUpdateRows,
    archiveTransferFinalAcceptanceRectificationAggregation,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskLedger(
    archiveTransferFinalAcceptanceIngestRiskLedger,
    archiveTransferFinalAcceptanceIngestRiskLedgerRows,
    archiveTransferFinalAcceptanceRectificationClosureUpdate,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskClosureUpdate(
    archiveTransferFinalAcceptanceIngestRiskClosureUpdate,
    archiveTransferFinalAcceptanceIngestRiskClosureUpdateRows,
    archiveTransferFinalAcceptanceIngestRiskLedger,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskReissueHistory(
    archiveTransferFinalAcceptanceIngestRiskReissueHistory,
    archiveTransferFinalAcceptanceIngestRiskReissueHistoryRows,
    archiveTransferFinalAcceptanceIngestRiskLedger,
    archiveTransferFinalAcceptanceIngestRiskClosureUpdate,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalSignoff(
    archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
    archiveTransferFinalAcceptanceIngestRiskFinalSignoffRows,
    archiveTransferFinalAcceptanceIngestRiskReissueHistory,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalReceiptReview(
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptReviewRows,
    archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview(
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReviewRows,
    archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
    [
      archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview,
    ].filter(Boolean),
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate(
    archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate,
    archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGateRows,
    archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage(
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackageRows,
    archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackage(
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackage,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageRows,
    archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview,
    archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution(
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRows,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackage,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt(
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceiptRows,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview(
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReviewRows,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
    [
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt,
    ].filter(Boolean),
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate(
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateRows,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff(
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffRows,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt(
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceiptRows,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison(
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparisonRows,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparisonFileRows,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackage,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger(
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedgerRows,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate(
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdateRows,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadRows,
    errors,
  );
  validateArchiveReleaseRecord(
    archiveReleaseRecord,
    archiveReleaseRows,
    archiveManifest,
    externalUploadManifest,
    archiveInspectionReport,
    archiveInspectionSignoff,
    archiveReleasePortfolioDashboard,
    archiveReleaseCrossProjectBaselineComparison,
    archiveReleaseCrossProjectAutoReview,
    archiveTransferWorkflowTemplate,
    archiveTransferSignatureReceiptUpdate,
    archiveTransferRectificationLedger,
    archiveTransferRectificationClosureUpdate,
    archiveTransferRectificationReissueHistory,
    archiveTransferFinalSignoff,
    archiveTransferFinalSignoffExternalSyncReceipt,
    archiveTransferFinalSignoffExternalSyncRectificationLedger,
    archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate,
    archiveTransferFinalSignoffExternalSyncRectificationReissueHistory,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory,
    archiveTransferFinalAcceptanceRegistration,
    archiveTransferFinalAcceptanceRegistrationReceiptReview,
    archiveTransferFinalAcceptanceRegistrationCrossPlatformReview,
    archiveTransferFinalAcceptanceArchiveDashboard,
    archiveTransferFinalAcceptanceCrossProjectBaseline,
    archiveTransferFinalAcceptanceTrendReport,
    archiveTransferFinalAcceptanceRectificationAggregation,
    archiveTransferFinalAcceptanceRectificationClosureUpdate,
    archiveTransferFinalAcceptanceIngestRiskLedger,
    archiveTransferFinalAcceptanceIngestRiskClosureUpdate,
    archiveTransferFinalAcceptanceIngestRiskReissueHistory,
    archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview,
    archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackage,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate,
    archiveReleaseSlaReminderArchiveIngest,
    archiveReleaseSlaReminderExternalImportHttpReplayQueue,
    archiveReleaseSlaReminderExternalImportHttpReplayHistory,
    archiveReleaseSlaReminderExternalImportReceiptUpdate,
    archiveReleaseSlaReminderExternalImportFinalReceiptConfirmation,
    archiveReleaseSlaReminderExternalImportFinalReceiptCrossPlatformReview,
    archiveReleaseSlaReminderExternalImportFinalReceiptBatchSignoff,
    archiveReleaseSlaReminderExternalImportFinalReceiptSignoffExternalSyncReceipt,
    archiveReleaseSlaReminderExternalImportRectificationLedger,
    archiveReleaseSlaReminderExternalImportRectificationClosureUpdate,
    archiveAcceptanceRemediationRecheckUpdate,
    archiveAcceptanceFinalRegistration,
    errors,
  );
  validateArchiveReleaseDeliveryReadiness(
    archiveReleaseDeliveryReadiness,
    archiveReleaseDeliveryReadinessRows,
    archiveReleaseRecord,
    externalUploadManifest,
    archiveInspectionReport,
    archiveInspectionSignoff,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate,
    archiveManifest,
    errors,
  );

  const checkedAt = new Date().toISOString();
  const uploadFields = externalUploadFieldKeys(externalUploadManifest, externalUploadRows);
  const acceptanceReview = buildArchiveAcceptanceReview({
    checkedAt,
    archivePath: absolutePath,
    archiveName: basename(absolutePath),
    errors,
    archiveReleaseRecord,
    archiveReleaseDeliveryReadiness,
  });
  const summary = {
    entryCount: zip.entries.length,
    requiredEntriesMissing: REQUIRED_ENTRIES.filter((entry) => !byPath.has(entry)).length,
    manifestEntriesChecked: archiveManifest?.entries?.length ?? 0,
    checksumRowsChecked,
    externalUploadFields: uploadFields.length,
    externalSystemAdapters: Array.isArray(externalSystemUploadAdapters?.adapterIds)
      ? externalSystemUploadAdapters.adapterIds.length
      : 0,
    externalSystemUploadRows: externalSystemUploadRows.length,
    engineReviewCatalogPresent: engineReviewCoverage.catalogPresent,
    engineReviewRowsChecked: engineReviewCoverage.rowsChecked,
    enginePreflightPresent: enginePreflightCoverage.present,
    enginePreflightRowsChecked: enginePreflightCoverage.rowsChecked,
    enginePreflightMissingBinaryCount: enginePreflightCoverage.missingBinaryCount,
    engineAcceptancePresent: engineAcceptanceCoverage.present,
    engineAcceptanceStatus: engineAcceptanceCoverage.acceptanceStatus,
    engineAcceptanceReviewCount: engineAcceptanceCoverage.reviewCount,
    archiveInspectionSignoffRows: archiveInspectionSignoffRows.length,
    archiveReleaseRows: archiveReleaseRows.length,
    archiveReleaseDeliveryReadinessPresent: Boolean(archiveReleaseDeliveryReadiness),
    releasePortfolioDashboardPresent: Boolean(archiveReleasePortfolioDashboard),
    releaseCrossProjectBaselinePresent: Boolean(archiveReleaseCrossProjectBaselineComparison),
    releaseCrossProjectAutoReviewPresent: Boolean(archiveReleaseCrossProjectAutoReview),
    archiveTransferWorkflowTemplatePresent: Boolean(archiveTransferWorkflowTemplate),
    archiveTransferSignatureReceiptUpdatePresent: Boolean(archiveTransferSignatureReceiptUpdate),
    archiveTransferRectificationLedgerPresent: Boolean(archiveTransferRectificationLedger),
    archiveTransferRectificationClosureUpdatePresent: Boolean(
      archiveTransferRectificationClosureUpdate,
    ),
    archiveTransferRectificationReissueHistoryPresent: Boolean(
      archiveTransferRectificationReissueHistory,
    ),
    archiveTransferFinalSignoffPresent: Boolean(archiveTransferFinalSignoff),
    archiveTransferFinalSignoffExternalSyncReceiptPresent: Boolean(
      archiveTransferFinalSignoffExternalSyncReceipt,
    ),
    archiveTransferFinalSignoffExternalSyncRectificationLedgerPresent: Boolean(
      archiveTransferFinalSignoffExternalSyncRectificationLedger,
    ),
    archiveTransferFinalSignoffExternalSyncRectificationClosureUpdatePresent: Boolean(
      archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate,
    ),
    archiveTransferFinalSignoffExternalSyncRectificationReissueHistoryPresent: Boolean(
      archiveTransferFinalSignoffExternalSyncRectificationReissueHistory,
    ),
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationPresent: Boolean(
      archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation,
    ),
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffPresent: Boolean(
      archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff,
    ),
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceiptPresent: Boolean(
      archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt,
    ),
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedgerPresent: Boolean(
      archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger,
    ),
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdatePresent: Boolean(
      archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate,
    ),
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistoryPresent: Boolean(
      archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory,
    ),
    archiveTransferFinalAcceptanceRegistrationPresent: Boolean(
      archiveTransferFinalAcceptanceRegistration,
    ),
    archiveTransferFinalAcceptanceRegistrationReceiptReviewPresent: Boolean(
      archiveTransferFinalAcceptanceRegistrationReceiptReview,
    ),
    archiveTransferFinalAcceptanceRegistrationCrossPlatformReviewPresent: Boolean(
      archiveTransferFinalAcceptanceRegistrationCrossPlatformReview,
    ),
    archiveTransferFinalAcceptanceArchiveDashboardPresent: Boolean(
      archiveTransferFinalAcceptanceArchiveDashboard,
    ),
    archiveTransferFinalAcceptanceCrossProjectBaselinePresent: Boolean(
      archiveTransferFinalAcceptanceCrossProjectBaseline,
    ),
    archiveTransferFinalAcceptanceTrendReportPresent: Boolean(
      archiveTransferFinalAcceptanceTrendReport,
    ),
    archiveTransferFinalAcceptanceRectificationAggregationPresent: Boolean(
      archiveTransferFinalAcceptanceRectificationAggregation,
    ),
    archiveTransferFinalAcceptanceRectificationClosureUpdatePresent: Boolean(
      archiveTransferFinalAcceptanceRectificationClosureUpdate,
    ),
    archiveTransferFinalAcceptanceIngestRiskLedgerPresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskLedger,
    ),
    archiveTransferFinalAcceptanceIngestRiskClosureUpdatePresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskClosureUpdate,
    ),
    archiveTransferFinalAcceptanceIngestRiskReissueHistoryPresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskReissueHistory,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalSignoffPresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptReviewPresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReviewPresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGatePresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackagePresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackagePresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackage,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionPresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceiptPresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReviewPresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGatePresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffPresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceiptPresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparisonPresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedgerPresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger,
    ),
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdatePresent: Boolean(
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate,
    ),
    releaseSlaReminderArchiveIngestPresent: Boolean(archiveReleaseSlaReminderArchiveIngest),
    releaseSlaReminderExternalImportHttpReplayQueuePresent: Boolean(
      archiveReleaseSlaReminderExternalImportHttpReplayQueue,
    ),
    releaseSlaReminderExternalImportHttpReplayHistoryPresent: Boolean(
      archiveReleaseSlaReminderExternalImportHttpReplayHistory,
    ),
    releaseSlaReminderExternalImportReceiptUpdatePresent: Boolean(
      archiveReleaseSlaReminderExternalImportReceiptUpdate,
    ),
    releaseSlaReminderExternalImportFinalReceiptConfirmationPresent: Boolean(
      archiveReleaseSlaReminderExternalImportFinalReceiptConfirmation,
    ),
    releaseSlaReminderExternalImportFinalReceiptCrossPlatformReviewPresent: Boolean(
      archiveReleaseSlaReminderExternalImportFinalReceiptCrossPlatformReview,
    ),
    releaseSlaReminderExternalImportFinalReceiptBatchSignoffPresent: Boolean(
      archiveReleaseSlaReminderExternalImportFinalReceiptBatchSignoff,
    ),
    releaseSlaReminderExternalImportFinalReceiptSignoffExternalSyncReceiptPresent: Boolean(
      archiveReleaseSlaReminderExternalImportFinalReceiptSignoffExternalSyncReceipt,
    ),
    releaseSlaReminderExternalImportRectificationLedgerPresent: Boolean(
      archiveReleaseSlaReminderExternalImportRectificationLedger,
    ),
    releaseSlaReminderExternalImportRectificationClosureUpdatePresent: Boolean(
      archiveReleaseSlaReminderExternalImportRectificationClosureUpdate,
    ),
    archiveAcceptanceRemediationRecheckUpdatePresent: Boolean(
      archiveAcceptanceRemediationRecheckUpdate,
    ),
    archiveAcceptanceFinalRegistrationPresent: Boolean(archiveAcceptanceFinalRegistration),
    acceptanceDecision: acceptanceReview.handoverDecision,
    errors: errors.length,
    warnings: warnings.length,
  };

  return {
    schema: "railwise.engineeringArchive.verify.v1",
    checkedAt,
    archivePath: absolutePath,
    archiveName: basename(absolutePath),
    success: errors.length === 0,
    summary,
    acceptanceReview,
    requiredEntries: REQUIRED_ENTRIES,
    externalUploadFields: uploadFields,
    archiveManifest,
    externalUploadManifest,
    externalSystemUploadAdapters,
    engineReviewCatalog,
    enginePreflight,
    engineAcceptance,
    archiveInspectionReport,
    archiveInspectionSignoff,
    archiveReleaseRecord,
    archiveReleaseDeliveryReadiness,
    archiveReleasePortfolioDashboard,
    archiveReleaseCrossProjectBaselineComparison,
    archiveReleaseCrossProjectAutoReview,
    archiveTransferWorkflowTemplate,
    archiveTransferSignatureReceiptUpdate,
    archiveTransferRectificationLedger,
    archiveTransferRectificationClosureUpdate,
    archiveTransferRectificationReissueHistory,
    archiveTransferFinalSignoff,
    archiveTransferFinalSignoffExternalSyncReceipt,
    archiveTransferFinalSignoffExternalSyncRectificationLedger,
    archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate,
    archiveTransferFinalSignoffExternalSyncRectificationReissueHistory,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory,
    archiveTransferFinalAcceptanceRegistration,
    archiveTransferFinalAcceptanceRegistrationReceiptReview,
    archiveTransferFinalAcceptanceRegistrationCrossPlatformReview,
    archiveTransferFinalAcceptanceArchiveDashboard,
    archiveTransferFinalAcceptanceCrossProjectBaseline,
    archiveTransferFinalAcceptanceTrendReport,
    archiveTransferFinalAcceptanceRectificationAggregation,
    archiveTransferFinalAcceptanceRectificationClosureUpdate,
    archiveTransferFinalAcceptanceIngestRiskLedger,
    archiveTransferFinalAcceptanceIngestRiskClosureUpdate,
    archiveTransferFinalAcceptanceIngestRiskReissueHistory,
    archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview,
    archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackage,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate,
    archiveReleaseSlaReminderArchiveIngest,
    archiveReleaseSlaReminderExternalImportHttpReplayQueue,
    archiveReleaseSlaReminderExternalImportHttpReplayHistory,
    archiveReleaseSlaReminderExternalImportReceiptUpdate,
    archiveReleaseSlaReminderExternalImportFinalReceiptConfirmation,
    archiveReleaseSlaReminderExternalImportFinalReceiptCrossPlatformReview,
    archiveReleaseSlaReminderExternalImportFinalReceiptBatchSignoff,
    archiveReleaseSlaReminderExternalImportFinalReceiptSignoffExternalSyncReceipt,
    archiveReleaseSlaReminderExternalImportRectificationLedger,
    archiveReleaseSlaReminderExternalImportRectificationClosureUpdate,
    archiveAcceptanceRemediationRecheckUpdate,
    archiveAcceptanceFinalRegistration,
    errors,
    warnings,
  };
}

function failedReport(path, message) {
  const checkedAt = new Date().toISOString();
  const archivePath = path ? resolve(path) : null;
  const archiveName = path ? basename(path) : null;
  const acceptanceReview = buildArchiveAcceptanceReview({
    checkedAt,
    archivePath,
    archiveName,
    errors: [message],
    archiveReleaseRecord: null,
    archiveReleaseDeliveryReadiness: null,
  });
  return {
    schema: "railwise.engineeringArchive.verify.v1",
    checkedAt,
    archivePath,
    archiveName,
    success: false,
    summary: {
      entryCount: 0,
      requiredEntriesMissing: REQUIRED_ENTRIES.length,
      manifestEntriesChecked: 0,
      checksumRowsChecked: 0,
      externalUploadFields: 0,
      externalSystemAdapters: 0,
      externalSystemUploadRows: 0,
      engineReviewCatalogPresent: false,
      engineReviewRowsChecked: 0,
      enginePreflightPresent: false,
      enginePreflightRowsChecked: 0,
      enginePreflightMissingBinaryCount: 0,
      engineAcceptancePresent: false,
      engineAcceptanceStatus: null,
      engineAcceptanceReviewCount: 0,
      archiveInspectionSignoffRows: 0,
      archiveReleaseRows: 0,
      archiveReleaseDeliveryReadinessPresent: false,
      releasePortfolioDashboardPresent: false,
      releaseCrossProjectBaselinePresent: false,
      releaseCrossProjectAutoReviewPresent: false,
      archiveTransferWorkflowTemplatePresent: false,
      archiveTransferSignatureReceiptUpdatePresent: false,
      archiveTransferRectificationLedgerPresent: false,
      archiveTransferRectificationClosureUpdatePresent: false,
      archiveTransferRectificationReissueHistoryPresent: false,
      archiveTransferFinalSignoffPresent: false,
      archiveTransferFinalSignoffExternalSyncReceiptPresent: false,
      archiveTransferFinalSignoffExternalSyncRectificationLedgerPresent: false,
      archiveTransferFinalSignoffExternalSyncRectificationClosureUpdatePresent: false,
      archiveTransferFinalSignoffExternalSyncRectificationReissueHistoryPresent: false,
      archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationPresent: false,
      archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffPresent: false,
      archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceiptPresent: false,
      archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedgerPresent: false,
      archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdatePresent: false,
      archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistoryPresent: false,
      archiveTransferFinalAcceptanceRegistrationPresent: false,
      archiveTransferFinalAcceptanceRegistrationReceiptReviewPresent: false,
      archiveTransferFinalAcceptanceRegistrationCrossPlatformReviewPresent: false,
      archiveTransferFinalAcceptanceArchiveDashboardPresent: false,
      archiveTransferFinalAcceptanceCrossProjectBaselinePresent: false,
      archiveTransferFinalAcceptanceTrendReportPresent: false,
      archiveTransferFinalAcceptanceRectificationAggregationPresent: false,
      archiveTransferFinalAcceptanceRectificationClosureUpdatePresent: false,
      archiveTransferFinalAcceptanceIngestRiskLedgerPresent: false,
      archiveTransferFinalAcceptanceIngestRiskClosureUpdatePresent: false,
      archiveTransferFinalAcceptanceIngestRiskReissueHistoryPresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalSignoffPresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalReceiptReviewPresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReviewPresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGatePresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackagePresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackagePresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionPresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceiptPresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReviewPresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGatePresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffPresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceiptPresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparisonPresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedgerPresent: false,
      archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdatePresent: false,
      archiveAcceptanceRemediationRecheckUpdatePresent: false,
      archiveAcceptanceFinalRegistrationPresent: false,
      releaseSlaReminderExternalImportFinalReceiptCrossPlatformReviewPresent: false,
      releaseSlaReminderExternalImportFinalReceiptBatchSignoffPresent: false,
      releaseSlaReminderExternalImportFinalReceiptSignoffExternalSyncReceiptPresent: false,
      acceptanceDecision: acceptanceReview.handoverDecision,
      errors: 1,
      warnings: 0,
    },
    acceptanceReview,
    requiredEntries: REQUIRED_ENTRIES,
    externalUploadFields: [],
    archiveManifest: null,
    externalUploadManifest: null,
    externalSystemUploadAdapters: null,
    engineReviewCatalog: null,
    enginePreflight: null,
    engineAcceptance: null,
    archiveInspectionReport: null,
    archiveInspectionSignoff: null,
    archiveReleaseRecord: null,
    archiveReleaseDeliveryReadiness: null,
    archiveReleasePortfolioDashboard: null,
    archiveReleaseCrossProjectBaselineComparison: null,
    archiveReleaseCrossProjectAutoReview: null,
    archiveTransferWorkflowTemplate: null,
    archiveTransferSignatureReceiptUpdate: null,
    archiveTransferRectificationLedger: null,
    archiveTransferRectificationClosureUpdate: null,
    archiveTransferRectificationReissueHistory: null,
    archiveTransferFinalSignoff: null,
    archiveTransferFinalSignoffExternalSyncReceipt: null,
    archiveTransferFinalSignoffExternalSyncRectificationLedger: null,
    archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate: null,
    archiveTransferFinalSignoffExternalSyncRectificationReissueHistory: null,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation: null,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff: null,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt: null,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger: null,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate: null,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory: null,
    archiveTransferFinalAcceptanceRegistration: null,
    archiveTransferFinalAcceptanceRegistrationReceiptReview: null,
    archiveTransferFinalAcceptanceRegistrationCrossPlatformReview: null,
    archiveTransferFinalAcceptanceArchiveDashboard: null,
    archiveTransferFinalAcceptanceCrossProjectBaseline: null,
    archiveTransferFinalAcceptanceTrendReport: null,
    archiveTransferFinalAcceptanceRectificationAggregation: null,
    archiveTransferFinalAcceptanceRectificationClosureUpdate: null,
    archiveTransferFinalAcceptanceIngestRiskLedger: null,
    archiveTransferFinalAcceptanceIngestRiskClosureUpdate: null,
    archiveTransferFinalAcceptanceIngestRiskReissueHistory: null,
    archiveTransferFinalAcceptanceIngestRiskFinalSignoff: null,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview: null,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview: null,
    archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate: null,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage: null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackage: null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution: null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt: null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview: null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison: null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger: null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate: null,
    archiveReleaseSlaReminderExternalImportFinalReceiptSignoffExternalSyncReceipt: null,
    archiveAcceptanceRemediationRecheckUpdate: null,
    archiveAcceptanceFinalRegistration: null,
    errors: [message],
    warnings: [],
  };
}

function parseZip(bytes) {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) {
    throw new Error("end of central directory not found; archive is not a readable ZIP");
  }

  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`invalid central directory header at offset ${offset}`);
    }
    const method = bytes.readUInt16LE(offset + 10);
    const crc32 = bytes
      .readUInt32LE(offset + 16)
      .toString(16)
      .padStart(8, "0");
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const data = readStoredEntryData(bytes, localHeaderOffset, compressedSize, method, name);
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      crc32,
      data,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return { entries };
}

function findEndOfCentralDirectory(bytes) {
  const minimumSize = 22;
  for (let offset = bytes.length - minimumSize; offset >= 0; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function readStoredEntryData(bytes, localHeaderOffset, compressedSize, method, name) {
  if (bytes.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error(`invalid local file header for ${name}`);
  }
  if (method !== 0) {
    throw new Error(
      `unsupported ZIP compression method ${method} for ${name}; Railwise archives use stored entries`,
    );
  }
  const nameLength = bytes.readUInt16LE(localHeaderOffset + 26);
  const extraLength = bytes.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + nameLength + extraLength;
  return bytes.subarray(dataStart, dataStart + compressedSize);
}

function readJsonEntry(byPath, path, errors) {
  const entry = byPath.get(path);
  if (!entry) return null;
  try {
    return JSON.parse(entry.data.toString("utf8"));
  } catch (error) {
    errors.push(
      `invalid JSON entry ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function readCsvEntry(byPath, path, errors) {
  const entry = byPath.get(path);
  if (!entry) return [];
  try {
    return parseCsv(entry.data.toString("utf8"));
  } catch (error) {
    errors.push(
      `invalid CSV entry ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

function validateArchiveManifest(manifest, byPath, errors) {
  if (!manifest) return;
  if (manifest.schema !== "railwise.engineering.batch.archiveManifest.v1") {
    errors.push(`manifest.json schema mismatch: ${manifest.schema}`);
  }
  if (!Array.isArray(manifest.entries)) {
    errors.push("manifest.json entries must be an array");
    return;
  }
  for (const row of manifest.entries) {
    const path = stringValue(row.path);
    if (!path) {
      errors.push("manifest.json contains an entry without path");
      continue;
    }
    const entry = byPath.get(path);
    if (!entry) {
      errors.push(`manifest entry missing in ZIP: ${path}`);
      continue;
    }
    if (path === "manifest.json") {
      continue;
    }
    const byteLength = numberValue(row.byteLength);
    if (byteLength !== null && byteLength !== entry.data.length) {
      errors.push(
        `manifest byte length mismatch: ${path} expected ${byteLength}, got ${entry.data.length}`,
      );
    }
    const rowCrc = stringValue(row.crc32);
    if (rowCrc && rowCrc !== crc32Hex(entry.data)) {
      errors.push(
        `manifest CRC32 mismatch: ${path} expected ${rowCrc}, got ${crc32Hex(entry.data)}`,
      );
    }
  }
}

function validateChecksumCatalog(rows, byPath, errors) {
  let checked = 0;
  for (const row of rows) {
    const path = stringValue(row.path);
    if (!path) continue;
    const entry = byPath.get(path);
    if (!entry) {
      errors.push(`checksum row missing in ZIP: ${path}`);
      continue;
    }
    checked += 1;
    const byteLength = String(entry.data.length);
    const actualCrc = crc32Hex(entry.data);
    const actualFnv = fnv1a32Fingerprint(`${path}\n${entry.data.toString("base64")}`);
    if (stringValue(row.byte_length) !== byteLength) {
      errors.push(
        `checksum byte length mismatch: ${path} expected ${stringValue(row.byte_length)}, got ${byteLength}`,
      );
    }
    if (stringValue(row.crc32) !== actualCrc) {
      errors.push(`CRC32 mismatch: ${path} expected ${stringValue(row.crc32)}, got ${actualCrc}`);
    }
    if (stringValue(row.fnv1a32) !== actualFnv) {
      errors.push(`FNV mismatch: ${path} expected ${stringValue(row.fnv1a32)}, got ${actualFnv}`);
    }
  }
  return checked;
}

function validateExternalUploadManifest(manifest, csvRows, errors, warnings) {
  if (!manifest) return;
  if (manifest.schema !== "railwise.engineering.batch.externalUploadManifest.v1") {
    errors.push(`external upload manifest schema mismatch: ${manifest.schema}`);
  }
  if (!stringValue(manifest.archiveFolderName)) {
    errors.push("external upload manifest missing archiveFolderName");
  }
  if (!stringValue(manifest.archivePackageName)) {
    errors.push("external upload manifest missing archivePackageName");
  }
  if (!Array.isArray(manifest.directoryRules) || manifest.directoryRules.length < 3) {
    errors.push("external upload manifest directoryRules must describe archive folders");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    errors.push("external upload manifest files must not be empty");
  }

  const uploadFieldKeys = externalUploadFieldKeys(manifest, csvRows);
  for (const field of REQUIRED_UPLOAD_FIELDS) {
    if (!uploadFieldKeys.includes(field)) {
      errors.push(`external upload field missing: ${field}`);
    }
  }
  if (!String(manifest.archiveFolderName ?? "").includes("工程复核归档")) {
    warnings.push("archiveFolderName does not include 工程复核归档");
  }
}

function validateExternalSystemUploadAdapters(manifest, csvRows, errors) {
  if (!manifest) return;
  if (manifest.schema !== "railwise.engineering.batch.externalSystemUploadAdapters.v1") {
    errors.push(`external system upload adapters schema mismatch: ${manifest.schema}`);
  }
  const adapterIds = Array.isArray(manifest.adapterIds)
    ? unique(manifest.adapterIds.map((adapterId) => stringValue(adapterId)).filter(Boolean))
    : [];
  if (!Array.isArray(manifest.adapterIds)) {
    errors.push("external system upload adapters missing adapterIds");
  } else if (adapterIds.length === 0) {
    errors.push("external system upload adapters must include at least one adapterId");
  }
  if (!Array.isArray(manifest.adapters) || manifest.adapters.length === 0) {
    errors.push("external system upload adapters must include adapter definitions");
  } else {
    const definitionIds = unique(
      manifest.adapters.map((adapter) => stringValue(adapter.adapterId)).filter(Boolean),
    );
    for (const adapterId of adapterIds) {
      if (!definitionIds.includes(adapterId)) {
        errors.push(`external system upload adapter definition missing: ${adapterId}`);
      }
    }
  }
  if (!Array.isArray(manifest.rows) || manifest.rows.length === 0) {
    errors.push("external system upload adapters must include upload rows");
  }
  if (csvRows.length === 0) {
    errors.push("external system upload rows CSV must not be empty");
  }
  const rowAdapterIds = unique(csvRows.map((row) => stringValue(row.adapter_id)).filter(Boolean));
  for (const adapterId of adapterIds) {
    if (!rowAdapterIds.includes(adapterId)) {
      errors.push(`external system upload rows missing adapter: ${adapterId}`);
    }
  }
}

function validateSignoffExternalUploadCoverage(manifest, externalSystemUploadRows, errors) {
  const manifestFilePaths = Array.isArray(manifest?.files)
    ? manifest.files.map((file) => stringValue(file.path)).filter(Boolean)
    : [];
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of REQUIRED_SIGNOFF_UPLOAD_PATHS) {
    if (!manifestFilePaths.includes(path)) {
      errors.push(`external upload manifest missing signoff file: ${path}`);
    }
    if (!externalRowPaths.includes(path)) {
      errors.push(`external system upload rows missing signoff file: ${path}`);
    }
  }
}

function validateArchiveInspectionReport(report, errors) {
  if (!report) return;
  if (report.schema !== "railwise.engineering.batch.archiveInspectionReport.v1") {
    errors.push(`archive inspection report schema mismatch: ${report.schema}`);
  }
  if (!Array.isArray(report.sections) || !report.sections.includes("必备文件检查")) {
    errors.push("archive inspection report missing 必备文件检查 section");
  }
  if (!Array.isArray(report.sections) || !report.sections.includes("文件校验摘要")) {
    errors.push("archive inspection report missing 文件校验摘要 section");
  }
  if (!Array.isArray(report.sections) || !report.sections.includes("外部系统适配")) {
    errors.push("archive inspection report missing 外部系统适配 section");
  }
  if (!report.summary || Number(report.summary.missingRequiredEntryCount) > 0) {
    errors.push("archive inspection report indicates missing required entries");
  }
  if (!stringValue(report.archiveInspectionFingerprint)) {
    errors.push("archive inspection report missing archiveInspectionFingerprint");
  }
}

function validateArchiveInspectionSignoff(signoff, csvRows, report, errors) {
  if (!signoff) return;
  if (signoff.schema !== "railwise.engineering.batch.archiveInspectionSignoff.v1") {
    errors.push(`archive inspection signoff schema mismatch: ${signoff.schema}`);
  }
  if (!stringValue(signoff.archiveInspectionFingerprint)) {
    errors.push("archive inspection signoff missing archiveInspectionFingerprint");
  }
  const reportFingerprint = stringValue(report?.archiveInspectionFingerprint);
  const signoffReportFingerprint = stringValue(signoff.archiveInspectionFingerprint);
  if (
    reportFingerprint &&
    signoffReportFingerprint &&
    reportFingerprint !== signoffReportFingerprint
  ) {
    errors.push(
      `archive inspection signoff fingerprint mismatch: expected ${reportFingerprint}, got ${signoffReportFingerprint}`,
    );
  }
  const validStatuses = new Set(["pending", "signed", "signed_with_actions", "blocked"]);
  const signatureStatus = stringValue(signoff.signatureStatus);
  if (!validStatuses.has(signatureStatus)) {
    errors.push(`archive inspection signoff invalid signatureStatus: ${signatureStatus}`);
  }
  if (!Array.isArray(signoff.rows) || signoff.rows.length === 0) {
    errors.push("archive inspection signoff rows must not be empty");
  }
  if (Number(signoff.annotationCount) !== (Array.isArray(signoff.rows) ? signoff.rows.length : 0)) {
    errors.push("archive inspection signoff annotationCount does not match rows");
  }
  if (csvRows.length === 0) {
    errors.push("archive inspection signoff CSV must not be empty");
  } else if (Array.isArray(signoff.rows) && csvRows.length !== signoff.rows.length) {
    errors.push(
      `archive inspection signoff CSV row count mismatch: expected ${signoff.rows.length}, got ${csvRows.length}`,
    );
  }
  const storedFingerprint = stringValue(signoff.signoffFingerprint);
  if (!storedFingerprint) {
    errors.push("archive inspection signoff missing signoffFingerprint");
  } else {
    const { signoffFingerprint, ...fingerprintBody } = signoff;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== signoffFingerprint) {
      errors.push(
        `archive inspection signoff fingerprint mismatch: expected ${signoffFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function manifestEntryPaths(manifest) {
  return Array.isArray(manifest?.entries)
    ? manifest.entries.map((entry) => stringValue(entry.path)).filter(Boolean)
    : [];
}

function externalUploadFilePaths(manifest) {
  return Array.isArray(manifest?.files)
    ? manifest.files.map((file) => stringValue(file.path)).filter(Boolean)
    : [];
}

function validateArchiveReleasePortfolioDashboard(
  dashboard,
  timelineRows,
  adapterRows,
  manifest,
  externalUploadManifest,
  errors,
) {
  if (!dashboard) return;
  if (dashboard.schema !== "railwise.engineering.batch.archiveReleasePortfolioDashboard.v1") {
    errors.push(`archive release portfolio dashboard schema mismatch: ${dashboard.schema}`);
  }
  if (!Array.isArray(dashboard.timelineRows)) {
    errors.push("archive release portfolio dashboard timelineRows must be an array");
  } else if (timelineRows.length !== dashboard.timelineRows.length) {
    errors.push(
      `archive release portfolio dashboard timeline CSV row count mismatch: expected ${dashboard.timelineRows.length}, got ${timelineRows.length}`,
    );
  }
  if (!Array.isArray(dashboard.adapterRows)) {
    errors.push("archive release portfolio dashboard adapterRows must be an array");
  } else if (adapterRows.length !== dashboard.adapterRows.length) {
    errors.push(
      `archive release portfolio dashboard adapter CSV row count mismatch: expected ${dashboard.adapterRows.length}, got ${adapterRows.length}`,
    );
  }
  const paths = [
    "batch/archive-release-portfolio-dashboard.json",
    "batch/archive-release-portfolio-timeline.csv",
    "batch/archive-release-portfolio-adapter-trend.csv",
  ];
  const manifestPaths = manifestEntryPaths(manifest);
  const uploadPaths = externalUploadFilePaths(externalUploadManifest);
  for (const path of paths) {
    if (!manifestPaths.includes(path)) {
      errors.push(`archive manifest missing release portfolio entry: ${path}`);
    }
    if (!uploadPaths.includes(path)) {
      errors.push(`external upload manifest missing release portfolio file: ${path}`);
    }
  }
  const storedFingerprint = stringValue(dashboard.dashboardFingerprint);
  if (!storedFingerprint) {
    errors.push("archive release portfolio dashboard missing dashboardFingerprint");
  } else {
    const { dashboardFingerprint, ...fingerprintBody } = dashboard;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== dashboardFingerprint) {
      errors.push(
        `archive release portfolio dashboard fingerprint mismatch: expected ${dashboardFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveReleaseCrossProjectBaselineComparison(
  comparison,
  csvRows,
  manifest,
  externalUploadManifest,
  errors,
) {
  if (!comparison) return;
  if (
    comparison.schema !==
    "railwise.engineering.batch.archiveReleaseCrossProjectBaselineComparison.v1"
  ) {
    errors.push(`archive release cross-project baseline schema mismatch: ${comparison.schema}`);
  }
  if (!Array.isArray(comparison.rows)) {
    errors.push("archive release cross-project baseline rows must be an array");
  } else if (csvRows.length !== comparison.rows.length) {
    errors.push(
      `archive release cross-project baseline CSV row count mismatch: expected ${comparison.rows.length}, got ${csvRows.length}`,
    );
  }
  const paths = [
    "batch/archive-release-cross-project-baseline.md",
    "batch/archive-release-cross-project-baseline.csv",
    "batch/archive-release-cross-project-baseline.json",
  ];
  const manifestPaths = manifestEntryPaths(manifest);
  const uploadPaths = externalUploadFilePaths(externalUploadManifest);
  for (const path of paths) {
    if (!manifestPaths.includes(path)) {
      errors.push(`archive manifest missing cross-project baseline entry: ${path}`);
    }
    if (!uploadPaths.includes(path)) {
      errors.push(`external upload manifest missing cross-project baseline file: ${path}`);
    }
  }
  const storedFingerprint = stringValue(comparison.comparisonFingerprint);
  if (!storedFingerprint) {
    errors.push("archive release cross-project baseline missing comparisonFingerprint");
  } else {
    const { comparisonFingerprint, ...fingerprintBody } = comparison;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== comparisonFingerprint) {
      errors.push(
        `archive release cross-project baseline fingerprint mismatch: expected ${comparisonFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveReleaseCrossProjectAutoReview(
  review,
  csvRows,
  comparison,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!review) return;
  if (review.schema !== "railwise.engineering.batch.archiveReleaseCrossProjectAutoReview.v1") {
    errors.push(`archive release cross-project auto review schema mismatch: ${review.schema}`);
  }
  const rows = Array.isArray(review.rows) ? review.rows : [];
  if (!Array.isArray(review.rows)) {
    errors.push("archive release cross-project auto review rows must be an array");
  } else if (csvRows.length !== review.rows.length) {
    errors.push(
      `archive release cross-project auto review CSV row count mismatch: expected ${review.rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    comparison &&
    stringValue(review.sourceComparisonFingerprint) !==
      stringValue(comparison.comparisonFingerprint)
  ) {
    errors.push(
      `archive release cross-project auto review source comparison mismatch: expected ${stringValue(comparison.comparisonFingerprint)}, got ${stringValue(review.sourceComparisonFingerprint)}`,
    );
  }
  if (comparison && Number(review.projectCount) !== Number(comparison.projectCount)) {
    errors.push(
      `archive release cross-project auto review projectCount mismatch: expected ${comparison.projectCount}, got ${review.projectCount}`,
    );
  }
  if (Number(review.reviewedProjectCount) !== rows.length) {
    errors.push(
      `archive release cross-project auto review reviewedProjectCount mismatch: expected ${rows.length}, got ${review.reviewedProjectCount}`,
    );
  }
  const acceptedProjectCount = rows.filter(
    (row) => stringValue(row.reviewConclusion) === "accepted",
  ).length;
  const actionProjectCount = rows.filter(
    (row) => stringValue(row.reviewConclusion) === "needs_follow_up",
  ).length;
  const blockedProjectCount = rows.filter(
    (row) => stringValue(row.reviewConclusion) === "blocked",
  ).length;
  const blockingIssueCount = rows.filter(
    (row) => stringValue(row.reviewSeverity) === "blocking",
  ).length;
  const warningIssueCount = rows.filter(
    (row) => stringValue(row.reviewSeverity) === "warning",
  ).length;
  const totalIssueCount = rows.reduce((sum, row) => sum + Number(row.issueCount || 0), 0);
  const totalRiskScore = rows.reduce((sum, row) => sum + Number(row.riskScore || 0), 0);
  const expectedReadiness =
    blockedProjectCount > 0 ? "blocked" : actionProjectCount > 0 ? "conditional" : "ready";
  if (Number(review.acceptedProjectCount) !== acceptedProjectCount) {
    errors.push(
      `archive release cross-project auto review acceptedProjectCount mismatch: expected ${acceptedProjectCount}, got ${review.acceptedProjectCount}`,
    );
  }
  if (Number(review.actionProjectCount) !== actionProjectCount) {
    errors.push(
      `archive release cross-project auto review actionProjectCount mismatch: expected ${actionProjectCount}, got ${review.actionProjectCount}`,
    );
  }
  if (Number(review.blockedProjectCount) !== blockedProjectCount) {
    errors.push(
      `archive release cross-project auto review blockedProjectCount mismatch: expected ${blockedProjectCount}, got ${review.blockedProjectCount}`,
    );
  }
  if (Number(review.blockingIssueCount) !== blockingIssueCount) {
    errors.push(
      `archive release cross-project auto review blockingIssueCount mismatch: expected ${blockingIssueCount}, got ${review.blockingIssueCount}`,
    );
  }
  if (Number(review.warningIssueCount) !== warningIssueCount) {
    errors.push(
      `archive release cross-project auto review warningIssueCount mismatch: expected ${warningIssueCount}, got ${review.warningIssueCount}`,
    );
  }
  if (Number(review.totalIssueCount) !== totalIssueCount) {
    errors.push(
      `archive release cross-project auto review totalIssueCount mismatch: expected ${totalIssueCount}, got ${review.totalIssueCount}`,
    );
  }
  if (Number(review.totalRiskScore) !== totalRiskScore) {
    errors.push(
      `archive release cross-project auto review totalRiskScore mismatch: expected ${totalRiskScore}, got ${review.totalRiskScore}`,
    );
  }
  if (stringValue(review.releaseReadiness) !== expectedReadiness) {
    errors.push(
      `archive release cross-project auto review releaseReadiness mismatch: expected ${expectedReadiness}, got ${stringValue(review.releaseReadiness)}`,
    );
  }
  const paths = [
    "batch/archive-release-cross-project-auto-review.md",
    "batch/archive-release-cross-project-auto-review.csv",
    "batch/archive-release-cross-project-auto-review.json",
  ];
  validateArchiveAndUploadPaths(
    "archive release cross-project auto review",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(`external system upload rows missing cross-project auto review file: ${path}`);
    }
  }
  const storedFingerprint = stringValue(review.reviewFingerprint);
  if (!storedFingerprint) {
    errors.push("archive release cross-project auto review missing reviewFingerprint");
  } else {
    const { markdown, csv, json, reviewFingerprint, ...fingerprintBody } = review;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== reviewFingerprint) {
      errors.push(
        `archive release cross-project auto review fingerprint mismatch: expected ${reviewFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferWorkflowTemplate(
  template,
  workflowCsvRows,
  signatureCsvRows,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!template) return;
  if (template.schema !== "railwise.engineering.batch.archiveTransferWorkflowTemplate.v1") {
    errors.push(`archive transfer workflow template schema mismatch: ${template.schema}`);
  }
  const receivers = Array.isArray(template.receivers) ? template.receivers : [];
  const rows = Array.isArray(template.rows) ? template.rows : [];
  const signatureRows = Array.isArray(template.signatureRows) ? template.signatureRows : [];
  if (!Array.isArray(template.receivers)) {
    errors.push("archive transfer workflow template receivers must be an array");
  }
  if (!Array.isArray(template.rows)) {
    errors.push("archive transfer workflow template rows must be an array");
  } else if (workflowCsvRows.length !== template.rows.length) {
    errors.push(
      `archive transfer workflow template CSV row count mismatch: expected ${template.rows.length}, got ${workflowCsvRows.length}`,
    );
  }
  if (!Array.isArray(template.signatureRows)) {
    errors.push("archive transfer workflow template signatureRows must be an array");
  } else if (signatureCsvRows.length !== template.signatureRows.length) {
    errors.push(
      `archive transfer signature template CSV row count mismatch: expected ${template.signatureRows.length}, got ${signatureCsvRows.length}`,
    );
  }
  if (Number(template.receiverCount) !== receivers.length) {
    errors.push(
      `archive transfer workflow template receiverCount mismatch: expected ${receivers.length}, got ${template.receiverCount}`,
    );
  }
  if (Number(template.workflowRowCount) !== rows.length) {
    errors.push(
      `archive transfer workflow template workflowRowCount mismatch: expected ${rows.length}, got ${template.workflowRowCount}`,
    );
  }
  if (Number(template.signatureTemplateRowCount) !== signatureRows.length) {
    errors.push(
      `archive transfer workflow template signatureTemplateRowCount mismatch: expected ${signatureRows.length}, got ${template.signatureTemplateRowCount}`,
    );
  }
  if (!stringValue(template.sourceExternalUploadManifestFingerprint)) {
    errors.push(
      "archive transfer workflow template missing sourceExternalUploadManifestFingerprint",
    );
  }
  if (!stringValue(template.sourceExternalSystemAdapterFingerprint)) {
    errors.push(
      "archive transfer workflow template missing sourceExternalSystemAdapterFingerprint",
    );
  }
  const requiredRoles = ["owner", "supervision", "contractor", "third_party_testing"];
  const receiverRoles = unique(
    receivers.map((receiver) => stringValue(receiver.receiverRole)).filter(Boolean),
  );
  for (const role of requiredRoles) {
    if (!receiverRoles.includes(role)) {
      errors.push(`archive transfer workflow template missing receiver role: ${role}`);
    }
  }
  const paths = [
    "batch/archive-transfer-workflow-template.md",
    "batch/archive-transfer-workflow-template.csv",
    "batch/archive-transfer-signature-template.csv",
    "batch/archive-transfer-workflow-template.json",
  ];
  validateArchiveAndUploadPaths(
    "archive transfer workflow template",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing archive transfer workflow template file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(template.templateFingerprint);
  if (!storedFingerprint) {
    errors.push("archive transfer workflow template missing templateFingerprint");
  } else {
    const { markdown, csv, signatureCsv, json, templateFingerprint, ...fingerprintBody } = template;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== templateFingerprint) {
      errors.push(
        `archive transfer workflow template fingerprint mismatch: expected ${templateFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferSignatureReceiptUpdate(
  update,
  csvRows,
  template,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!update) return;
  if (update.schema !== "railwise.engineering.batch.archiveTransferSignatureReceiptUpdate.v1") {
    errors.push(`archive transfer signature receipt update schema mismatch: ${update.schema}`);
  }
  const rows = Array.isArray(update.rows) ? update.rows : [];
  if (!Array.isArray(update.rows)) {
    errors.push("archive transfer signature receipt update rows must be an array");
  } else if (csvRows.length !== update.rows.length) {
    errors.push(
      `archive transfer signature receipt update CSV row count mismatch: expected ${update.rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    !update.updatedTemplate ||
    update.updatedTemplate.schema !==
      "railwise.engineering.batch.archiveTransferWorkflowTemplate.v1"
  ) {
    errors.push("archive transfer signature receipt update missing updatedTemplate");
  }
  if (
    template &&
    stringValue(update.updatedTemplateFingerprint) !== stringValue(template.templateFingerprint)
  ) {
    errors.push(
      `archive transfer signature receipt update archived template mismatch: expected ${stringValue(template.templateFingerprint)}, got ${stringValue(update.updatedTemplateFingerprint)}`,
    );
  }
  if (
    update.updatedTemplate &&
    stringValue(update.updatedTemplateFingerprint) !==
      stringValue(update.updatedTemplate.templateFingerprint)
  ) {
    errors.push(
      `archive transfer signature receipt update updated template mismatch: expected ${stringValue(update.updatedTemplate.templateFingerprint)}, got ${stringValue(update.updatedTemplateFingerprint)}`,
    );
  }
  const updatedCount = rows.filter((row) => stringValue(row.updateStatus) === "updated").length;
  const signedCount = rows.filter(
    (row) =>
      stringValue(row.updateStatus) === "updated" && stringValue(row.signoffStatus) === "signed",
  ).length;
  const rejectedCount = rows.filter(
    (row) =>
      stringValue(row.updateStatus) === "updated" && stringValue(row.signoffStatus) === "rejected",
  ).length;
  const pendingCount = rows.filter(
    (row) =>
      stringValue(row.updateStatus) === "updated" && stringValue(row.signoffStatus) === "pending",
  ).length;
  const missingReceiptCount = rows.filter(
    (row) => stringValue(row.updateStatus) === "missing_receipt",
  ).length;
  const unmatchedReceiptCount = rows.filter(
    (row) => stringValue(row.updateStatus) === "unmatched_receipt",
  ).length;
  if (Number(update.updatedCount) !== updatedCount) {
    errors.push(
      `archive transfer signature receipt update updatedCount mismatch: expected ${updatedCount}, got ${update.updatedCount}`,
    );
  }
  if (Number(update.signedCount) !== signedCount) {
    errors.push(
      `archive transfer signature receipt update signedCount mismatch: expected ${signedCount}, got ${update.signedCount}`,
    );
  }
  if (Number(update.rejectedCount) !== rejectedCount) {
    errors.push(
      `archive transfer signature receipt update rejectedCount mismatch: expected ${rejectedCount}, got ${update.rejectedCount}`,
    );
  }
  if (Number(update.pendingCount) !== pendingCount) {
    errors.push(
      `archive transfer signature receipt update pendingCount mismatch: expected ${pendingCount}, got ${update.pendingCount}`,
    );
  }
  if (Number(update.missingReceiptCount) !== missingReceiptCount) {
    errors.push(
      `archive transfer signature receipt update missingReceiptCount mismatch: expected ${missingReceiptCount}, got ${update.missingReceiptCount}`,
    );
  }
  if (Number(update.unmatchedReceiptCount) !== unmatchedReceiptCount) {
    errors.push(
      `archive transfer signature receipt update unmatchedReceiptCount mismatch: expected ${unmatchedReceiptCount}, got ${update.unmatchedReceiptCount}`,
    );
  }
  const paths = [
    "batch/archive-transfer-signature-receipt-update.md",
    "batch/archive-transfer-signature-receipt-update.csv",
    "batch/archive-transfer-signature-receipt-update.json",
  ];
  validateArchiveAndUploadPaths(
    "archive transfer signature receipt update",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing archive transfer signature receipt update file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(update.updateFingerprint);
  if (!storedFingerprint) {
    errors.push("archive transfer signature receipt update missing updateFingerprint");
  } else {
    const { markdown, csv, json, updateFingerprint, ...fingerprintBody } = update;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify({ ...fingerprintBody, csv }));
    if (computedFingerprint !== updateFingerprint) {
      errors.push(
        `archive transfer signature receipt update fingerprint mismatch: expected ${updateFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferRectificationLedger(
  ledger,
  csvRows,
  receiptUpdate,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!ledger) return;
  if (ledger.schema !== "railwise.engineering.batch.archiveTransferRectificationLedger.v1") {
    errors.push(`archive transfer rectification ledger schema mismatch: ${ledger.schema}`);
  }
  const rows = Array.isArray(ledger.rows) ? ledger.rows : [];
  if (!Array.isArray(ledger.rows)) {
    errors.push("archive transfer rectification ledger rows must be an array");
  } else if (csvRows.length !== ledger.rows.length) {
    errors.push(
      `archive transfer rectification ledger CSV row count mismatch: expected ${ledger.rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    receiptUpdate &&
    stringValue(ledger.sourceReceiptUpdateFingerprint) !==
      stringValue(receiptUpdate.updateFingerprint)
  ) {
    errors.push(
      `archive transfer rectification ledger source receipt mismatch: expected ${stringValue(receiptUpdate.updateFingerprint)}, got ${stringValue(ledger.sourceReceiptUpdateFingerprint)}`,
    );
  }
  const openCount = rows.filter((row) => stringValue(row.status) === "open").length;
  const closedCount = rows.filter((row) => stringValue(row.status) === "closed").length;
  const blockingCount = rows.filter(
    (row) => stringValue(row.status) === "open" && stringValue(row.priority) === "high",
  ).length;
  const followUpCount = rows.filter(
    (row) => stringValue(row.status) === "open" && stringValue(row.priority) !== "high",
  ).length;
  const rejectedCount = rows.filter(
    (row) => stringValue(row.rectificationType) === "rejected_signature",
  ).length;
  const pendingCount = rows.filter(
    (row) => stringValue(row.rectificationType) === "pending_signature",
  ).length;
  const missingReceiptCount = rows.filter(
    (row) => stringValue(row.rectificationType) === "missing_receipt",
  ).length;
  const unmatchedReceiptCount = rows.filter(
    (row) => stringValue(row.rectificationType) === "unmatched_receipt",
  ).length;
  const countSpecs = [
    ["issueCount", rows.length],
    ["openCount", openCount],
    ["closedCount", closedCount],
    ["blockingCount", blockingCount],
    ["followUpCount", followUpCount],
    ["rejectedCount", rejectedCount],
    ["pendingCount", pendingCount],
    ["missingReceiptCount", missingReceiptCount],
    ["unmatchedReceiptCount", unmatchedReceiptCount],
  ];
  for (const [key, expected] of countSpecs) {
    if (Number(ledger[key]) !== expected) {
      errors.push(
        `archive transfer rectification ledger ${key} mismatch: expected ${expected}, got ${ledger[key]}`,
      );
    }
  }
  if (!Array.isArray(ledger.receiverSummaries)) {
    errors.push("archive transfer rectification ledger receiverSummaries must be an array");
  }
  const paths = [
    "batch/archive-transfer-rectification-ledger.md",
    "batch/archive-transfer-rectification-ledger.csv",
    "batch/archive-transfer-rectification-ledger.json",
  ];
  validateArchiveAndUploadPaths(
    "archive transfer rectification ledger",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing archive transfer rectification ledger file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(ledger.ledgerFingerprint);
  if (!storedFingerprint) {
    errors.push("archive transfer rectification ledger missing ledgerFingerprint");
  } else {
    const { markdown, csv, json, closureTemplateCsv, ledgerFingerprint, ...fingerprintBody } =
      ledger;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== ledgerFingerprint) {
      errors.push(
        `archive transfer rectification ledger fingerprint mismatch: expected ${ledgerFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferRectificationClosureUpdate(
  update,
  csvRows,
  ledger,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!update) return;
  if (update.schema !== "railwise.engineering.batch.archiveTransferRectificationClosureUpdate.v1") {
    errors.push(`archive transfer rectification closure update schema mismatch: ${update.schema}`);
  }
  const rows = Array.isArray(update.rows) ? update.rows : [];
  if (!Array.isArray(update.rows)) {
    errors.push("archive transfer rectification closure update rows must be an array");
  } else if (csvRows.length !== update.rows.length) {
    errors.push(
      `archive transfer rectification closure update CSV row count mismatch: expected ${update.rows.length}, got ${csvRows.length}`,
    );
  }
  if (ledger) {
    const packagedLedgerFingerprint = stringValue(ledger.ledgerFingerprint);
    const sourceLedgerFingerprint = stringValue(update.sourceLedgerFingerprint);
    const updatedLedgerFingerprint = stringValue(update.updatedLedgerFingerprint);
    if (
      packagedLedgerFingerprint &&
      packagedLedgerFingerprint !== sourceLedgerFingerprint &&
      packagedLedgerFingerprint !== updatedLedgerFingerprint
    ) {
      errors.push(
        `archive transfer rectification closure update packaged ledger mismatch: expected ${packagedLedgerFingerprint} to match source ${sourceLedgerFingerprint} or updated ${updatedLedgerFingerprint}`,
      );
    }
  }
  if (
    update.updatedLedger &&
    stringValue(update.updatedLedgerFingerprint) !==
      stringValue(update.updatedLedger.ledgerFingerprint)
  ) {
    errors.push(
      `archive transfer rectification closure update embedded ledger mismatch: expected ${stringValue(update.updatedLedger.ledgerFingerprint)}, got ${stringValue(update.updatedLedgerFingerprint)}`,
    );
  }
  const closedCount = rows.filter((row) => stringValue(row.updateStatus) === "closed").length;
  const stillOpenCount = Number(update.updatedLedger?.openCount ?? 0);
  const missingUpdateCount = rows.filter(
    (row) => stringValue(row.updateStatus) === "missing_update",
  ).length;
  const unmatchedUpdateCount = rows.filter(
    (row) => stringValue(row.updateStatus) === "unmatched_update",
  ).length;
  const expectedClosedCount = Number(update.updatedLedger?.closedCount ?? closedCount);
  if (Number(update.closedCount) !== expectedClosedCount) {
    errors.push(
      `archive transfer rectification closure update closedCount mismatch: expected ${expectedClosedCount}, got ${update.closedCount}`,
    );
  }
  if (Number(update.stillOpenCount) !== stillOpenCount) {
    errors.push(
      `archive transfer rectification closure update stillOpenCount mismatch: expected ${stillOpenCount}, got ${update.stillOpenCount}`,
    );
  }
  if (Number(update.missingUpdateCount) !== missingUpdateCount) {
    errors.push(
      `archive transfer rectification closure update missingUpdateCount mismatch: expected ${missingUpdateCount}, got ${update.missingUpdateCount}`,
    );
  }
  if (Number(update.unmatchedUpdateCount) !== unmatchedUpdateCount) {
    errors.push(
      `archive transfer rectification closure update unmatchedUpdateCount mismatch: expected ${unmatchedUpdateCount}, got ${update.unmatchedUpdateCount}`,
    );
  }
  const paths = [
    "batch/archive-transfer-rectification-closure-update.md",
    "batch/archive-transfer-rectification-closure-update.csv",
    "batch/archive-transfer-rectification-closure-update.json",
  ];
  validateArchiveAndUploadPaths(
    "archive transfer rectification closure update",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing archive transfer rectification closure update file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(update.updateFingerprint);
  if (!storedFingerprint) {
    errors.push("archive transfer rectification closure update missing updateFingerprint");
  } else {
    const { markdown, csv, json, updateFingerprint, ...fingerprintBody } = update;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify({ ...fingerprintBody, csv }));
    if (computedFingerprint !== updateFingerprint) {
      errors.push(
        `archive transfer rectification closure update fingerprint mismatch: expected ${updateFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferRectificationReissueHistory(
  history,
  csvRows,
  ledger,
  closureUpdate,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!history) return;
  if (
    history.schema !== "railwise.engineering.batch.archiveTransferRectificationReissueHistory.v1"
  ) {
    errors.push(
      `archive transfer rectification reissue history schema mismatch: ${history.schema}`,
    );
  }
  const rows = Array.isArray(history.rows) ? history.rows : [];
  if (!Array.isArray(history.rows)) {
    errors.push("archive transfer rectification reissue history rows must be an array");
  } else if (csvRows.length !== history.rows.length) {
    errors.push(
      `archive transfer rectification reissue history CSV row count mismatch: expected ${history.rows.length}, got ${csvRows.length}`,
    );
  }
  if (Number(history.roundCount) !== rows.length) {
    errors.push(
      `archive transfer rectification reissue history roundCount mismatch: expected ${rows.length}, got ${history.roundCount}`,
    );
  }
  if (!stringValue(history.sourceReceiptUpdateFingerprint)) {
    errors.push(
      "archive transfer rectification reissue history missing sourceReceiptUpdateFingerprint",
    );
  }
  if (!stringValue(history.initialLedgerFingerprint)) {
    errors.push("archive transfer rectification reissue history missing initialLedgerFingerprint");
  }
  if (!stringValue(history.finalLedgerFingerprint)) {
    errors.push("archive transfer rectification reissue history missing finalLedgerFingerprint");
  }
  if (
    ledger &&
    stringValue(ledger.ledgerFingerprint) !== stringValue(history.finalLedgerFingerprint)
  ) {
    errors.push(
      `archive transfer rectification reissue history final ledger mismatch: expected ${stringValue(ledger.ledgerFingerprint)}, got ${stringValue(history.finalLedgerFingerprint)}`,
    );
  }
  if (
    closureUpdate &&
    stringValue(closureUpdate.updatedLedgerFingerprint) &&
    stringValue(closureUpdate.updatedLedgerFingerprint) !==
      stringValue(history.finalLedgerFingerprint)
  ) {
    errors.push(
      `archive transfer rectification reissue history closure final ledger mismatch: expected ${stringValue(closureUpdate.updatedLedgerFingerprint)}, got ${stringValue(history.finalLedgerFingerprint)}`,
    );
  }
  if (closureUpdate && rows.length > 0) {
    const lastRound = rows[rows.length - 1];
    if (
      stringValue(lastRound.closureUpdateFingerprint) !==
      stringValue(closureUpdate.updateFingerprint)
    ) {
      errors.push(
        `archive transfer rectification reissue history latest closure mismatch: expected ${stringValue(closureUpdate.updateFingerprint)}, got ${stringValue(lastRound.closureUpdateFingerprint)}`,
      );
    }
  }
  if (!Array.isArray(history.receiverSummaries)) {
    errors.push(
      "archive transfer rectification reissue history receiverSummaries must be an array",
    );
  }
  const finalOpenCount = Number(history.finalOpenCount);
  if (Number.isFinite(finalOpenCount) && finalOpenCount < 0) {
    errors.push(
      "archive transfer rectification reissue history finalOpenCount must not be negative",
    );
  }
  const paths = [
    "batch/archive-transfer-rectification-reissue-history.md",
    "batch/archive-transfer-rectification-reissue-history.csv",
    "batch/archive-transfer-rectification-reissue-history.json",
  ];
  validateArchiveAndUploadPaths(
    "archive transfer rectification reissue history",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing archive transfer rectification reissue history file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(history.historyFingerprint);
  if (!storedFingerprint) {
    errors.push("archive transfer rectification reissue history missing historyFingerprint");
  } else {
    const { markdown, csv, json, historyFingerprint, ...fingerprintBody } = history;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== historyFingerprint) {
      errors.push(
        `archive transfer rectification reissue history fingerprint mismatch: expected ${historyFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalSignoff(
  signoff,
  csvRows,
  ledger,
  reissueHistory,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!signoff) return;
  if (signoff.schema !== "railwise.engineering.batch.archiveTransferFinalSignoff.v1") {
    errors.push(`archive transfer final signoff schema mismatch: ${signoff.schema}`);
  }
  const rows = Array.isArray(signoff.rows) ? signoff.rows : [];
  if (!Array.isArray(signoff.rows)) {
    errors.push("archive transfer final signoff rows must be an array");
  } else if (csvRows.length !== signoff.rows.length) {
    errors.push(
      `archive transfer final signoff CSV row count mismatch: expected ${signoff.rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    ledger &&
    stringValue(signoff.sourceLedgerFingerprint) !== stringValue(ledger.ledgerFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff ledger mismatch: expected ${stringValue(ledger.ledgerFingerprint)}, got ${stringValue(signoff.sourceLedgerFingerprint)}`,
    );
  }
  if (
    reissueHistory &&
    stringValue(signoff.sourceReissueHistoryFingerprint) !==
      stringValue(reissueHistory.historyFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff reissue history mismatch: expected ${stringValue(reissueHistory.historyFingerprint)}, got ${stringValue(signoff.sourceReissueHistoryFingerprint)}`,
    );
  }
  const validStatuses = new Set(["pending", "signed", "signed_with_actions", "blocked"]);
  if (!validStatuses.has(stringValue(signoff.signatureStatus))) {
    errors.push(
      `archive transfer final signoff invalid signatureStatus: ${stringValue(signoff.signatureStatus)}`,
    );
  }
  const signedReceiverCount = rows.filter(
    (row) => stringValue(row.signatureStatus) === "signed",
  ).length;
  const actionReceiverCount = rows.filter(
    (row) => stringValue(row.signatureStatus) === "signed_with_actions",
  ).length;
  const blockingReceiverCount = rows.filter(
    (row) => stringValue(row.signatureStatus) === "blocked",
  ).length;
  const countSpecs = [
    ["receiverCount", rows.length],
    ["signedReceiverCount", signedReceiverCount],
    ["actionReceiverCount", actionReceiverCount],
    ["blockingReceiverCount", blockingReceiverCount],
  ];
  for (const [key, expected] of countSpecs) {
    if (Number(signoff[key]) !== expected) {
      errors.push(
        `archive transfer final signoff ${key} mismatch: expected ${expected}, got ${signoff[key]}`,
      );
    }
  }
  if (ledger) {
    if (Number(signoff.issueCount) !== Number(ledger.issueCount)) {
      errors.push(
        `archive transfer final signoff issueCount mismatch: expected ${ledger.issueCount}, got ${signoff.issueCount}`,
      );
    }
    if (Number(signoff.openIssueCount) !== Number(ledger.openCount)) {
      errors.push(
        `archive transfer final signoff openIssueCount mismatch: expected ${ledger.openCount}, got ${signoff.openIssueCount}`,
      );
    }
  }
  const paths = [
    "batch/archive-transfer-final-signoff.md",
    "batch/archive-transfer-final-signoff.csv",
    "batch/archive-transfer-final-signoff.json",
  ];
  validateArchiveAndUploadPaths(
    "archive transfer final signoff",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing archive transfer final signoff file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(signoff.signoffFingerprint);
  if (!storedFingerprint) {
    errors.push("archive transfer final signoff missing signoffFingerprint");
  } else {
    const { markdown, csv, json, signoffFingerprint, ...fingerprintBody } = signoff;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== signoffFingerprint) {
      errors.push(
        `archive transfer final signoff fingerprint mismatch: expected ${signoffFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalSignoffExternalSyncReceipt(
  receipt,
  csvRows,
  signoff,
  ledger,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!receipt) return;
  if (
    receipt.schema !==
    "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncReceipt.v1"
  ) {
    errors.push(
      `archive transfer final signoff external sync receipt schema mismatch: ${receipt.schema}`,
    );
  }
  const rows = Array.isArray(receipt.rows) ? receipt.rows : [];
  if (!Array.isArray(receipt.rows)) {
    errors.push("archive transfer final signoff external sync receipt rows must be an array");
  } else if (csvRows.length !== receipt.rows.length) {
    errors.push(
      `archive transfer final signoff external sync receipt CSV row count mismatch: expected ${receipt.rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    signoff &&
    stringValue(receipt.sourceSignoffFingerprint) !== stringValue(signoff.signoffFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync receipt source signoff mismatch: expected ${stringValue(signoff.signoffFingerprint)}, got ${stringValue(receipt.sourceSignoffFingerprint)}`,
    );
  }
  if (
    ledger &&
    stringValue(receipt.sourceLedgerFingerprint) !== stringValue(ledger.ledgerFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync receipt ledger mismatch: expected ${stringValue(ledger.ledgerFingerprint)}, got ${stringValue(receipt.sourceLedgerFingerprint)}`,
    );
  }
  if (Number(receipt.fileCount) !== 3) {
    errors.push(
      `archive transfer final signoff external sync receipt fileCount mismatch: expected 3, got ${receipt.fileCount}`,
    );
  }
  if (Number(receipt.rowCount) !== rows.length) {
    errors.push(
      `archive transfer final signoff external sync receipt rowCount mismatch: expected ${rows.length}, got ${receipt.rowCount}`,
    );
  }
  const acceptedCount = rows.filter(
    (row) => stringValue(row.reconciliationStatus) === "accepted",
  ).length;
  const rejectedCount = rows.filter(
    (row) => stringValue(row.reconciliationStatus) === "rejected",
  ).length;
  const pendingCount = rows.filter(
    (row) => stringValue(row.reconciliationStatus) === "pending",
  ).length;
  const skippedCount = rows.filter(
    (row) => stringValue(row.reconciliationStatus) === "skipped",
  ).length;
  const missingReceiptCount = rows.filter(
    (row) => stringValue(row.reconciliationStatus) === "missing_receipt",
  ).length;
  const unmatchedReceiptCount = rows.filter(
    (row) => stringValue(row.reconciliationStatus) === "unmatched_receipt",
  ).length;
  const countSpecs = [
    ["acceptedCount", acceptedCount],
    ["rejectedCount", rejectedCount],
    ["pendingCount", pendingCount],
    ["skippedCount", skippedCount],
    ["missingReceiptCount", missingReceiptCount],
    ["unmatchedReceiptCount", unmatchedReceiptCount],
    ["followUpCount", rejectedCount + pendingCount + missingReceiptCount + unmatchedReceiptCount],
  ];
  for (const [key, expected] of countSpecs) {
    if (Number(receipt[key]) !== expected) {
      errors.push(
        `archive transfer final signoff external sync receipt ${key} mismatch: expected ${expected}, got ${receipt[key]}`,
      );
    }
  }
  const paths = [
    "batch/archive-transfer-final-signoff-external-sync-receipt.md",
    "batch/archive-transfer-final-signoff-external-sync-receipt.csv",
    "batch/archive-transfer-final-signoff-external-sync-receipt.json",
  ];
  validateArchiveAndUploadPaths(
    "archive transfer final signoff external sync receipt",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing archive transfer final signoff external sync receipt file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(receipt.receiptFingerprint);
  if (!storedFingerprint) {
    errors.push("archive transfer final signoff external sync receipt missing receiptFingerprint");
  } else {
    const { markdown, csv, json, receiptFingerprint, ...fingerprintBody } = receipt;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== receiptFingerprint) {
      errors.push(
        `archive transfer final signoff external sync receipt fingerprint mismatch: expected ${receiptFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalSignoffExternalSyncRectificationLedger(
  ledger,
  csvRows,
  receipt,
  signoff,
  transferLedger,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!ledger) return;
  if (
    ledger.schema !==
    "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationLedger.v1"
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification ledger schema mismatch: ${ledger.schema}`,
    );
  }
  const rows = Array.isArray(ledger.rows) ? ledger.rows : [];
  if (!Array.isArray(ledger.rows)) {
    errors.push(
      "archive transfer final signoff external sync rectification ledger rows must be an array",
    );
  } else if (csvRows.length !== ledger.rows.length) {
    errors.push(
      `archive transfer final signoff external sync rectification ledger CSV row count mismatch: expected ${ledger.rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    receipt &&
    stringValue(ledger.sourceReceiptFingerprint) !== stringValue(receipt.receiptFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification ledger source receipt mismatch: expected ${stringValue(receipt.receiptFingerprint)}, got ${stringValue(ledger.sourceReceiptFingerprint)}`,
    );
  }
  if (
    signoff &&
    stringValue(ledger.sourceSignoffFingerprint) !== stringValue(signoff.signoffFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification ledger source signoff mismatch: expected ${stringValue(signoff.signoffFingerprint)}, got ${stringValue(ledger.sourceSignoffFingerprint)}`,
    );
  }
  if (
    transferLedger &&
    stringValue(ledger.sourceLedgerFingerprint) !== stringValue(transferLedger.ledgerFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification ledger source ledger mismatch: expected ${stringValue(transferLedger.ledgerFingerprint)}, got ${stringValue(ledger.sourceLedgerFingerprint)}`,
    );
  }
  const openCount = rows.filter((row) => stringValue(row.closureStatus) === "open").length;
  const closedCount = rows.filter((row) => stringValue(row.closureStatus) === "closed").length;
  const rejectedCount = rows.filter((row) => stringValue(row.issueType) === "rejected").length;
  const pendingCount = rows.filter((row) => stringValue(row.issueType) === "pending").length;
  const missingReceiptCount = rows.filter(
    (row) => stringValue(row.issueType) === "missing_receipt",
  ).length;
  const unmatchedReceiptCount = rows.filter(
    (row) => stringValue(row.issueType) === "unmatched_receipt",
  ).length;
  const countSpecs = [
    ["issueCount", rows.length],
    ["openCount", openCount],
    ["closedCount", closedCount],
    ["rejectedCount", rejectedCount],
    ["pendingCount", pendingCount],
    ["missingReceiptCount", missingReceiptCount],
    ["unmatchedReceiptCount", unmatchedReceiptCount],
    ["followUpCount", openCount],
  ];
  for (const [key, expected] of countSpecs) {
    if (Number(ledger[key]) !== expected) {
      errors.push(
        `archive transfer final signoff external sync rectification ledger ${key} mismatch: expected ${expected}, got ${ledger[key]}`,
      );
    }
  }
  const paths = [
    "batch/archive-transfer-final-signoff-external-sync-rectification-ledger.md",
    "batch/archive-transfer-final-signoff-external-sync-rectification-ledger.csv",
    "batch/archive-transfer-final-signoff-external-sync-rectification-ledger.json",
  ];
  validateArchiveAndUploadPaths(
    "archive transfer final signoff external sync rectification ledger",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing archive transfer final signoff external sync rectification ledger file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(ledger.rectificationFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive transfer final signoff external sync rectification ledger missing rectificationFingerprint",
    );
  } else {
    const { markdown, csv, json, rectificationFingerprint, ...fingerprintBody } = ledger;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== rectificationFingerprint) {
      errors.push(
        `archive transfer final signoff external sync rectification ledger fingerprint mismatch: expected ${rectificationFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalSignoffExternalSyncRectificationClosureUpdate(
  update,
  csvRows,
  rectificationLedger,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!update) return;
  if (
    update.schema !==
    "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate.v1"
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification closure update schema mismatch: ${update.schema}`,
    );
  }
  if (!Array.isArray(update.rows)) {
    errors.push(
      "archive transfer final signoff external sync rectification closure update rows must be an array",
    );
  } else if (csvRows.length !== update.rows.length) {
    errors.push(
      `archive transfer final signoff external sync rectification closure update CSV row count mismatch: expected ${update.rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    rectificationLedger &&
    stringValue(update.updatedLedgerFingerprint) !==
      stringValue(rectificationLedger.rectificationFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification closure update ledger mismatch: expected ${stringValue(rectificationLedger.rectificationFingerprint)}, got ${stringValue(update.updatedLedgerFingerprint)}`,
    );
  }
  if (
    update.updatedLedger &&
    stringValue(update.updatedLedgerFingerprint) !==
      stringValue(update.updatedLedger.rectificationFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification closure update embedded ledger mismatch: expected ${stringValue(update.updatedLedger.rectificationFingerprint)}, got ${stringValue(update.updatedLedgerFingerprint)}`,
    );
  }
  const rows = Array.isArray(update.rows) ? update.rows : [];
  const missingUpdateCount = rows.filter(
    (row) => stringValue(row.updateStatus) === "missing_update",
  ).length;
  const unmatchedUpdateCount = rows.filter(
    (row) => stringValue(row.updateStatus) === "unmatched_update",
  ).length;
  if (Number(update.missingUpdateCount) !== missingUpdateCount) {
    errors.push(
      `archive transfer final signoff external sync rectification closure update missingUpdateCount mismatch: expected ${missingUpdateCount}, got ${update.missingUpdateCount}`,
    );
  }
  if (Number(update.unmatchedUpdateCount) !== unmatchedUpdateCount) {
    errors.push(
      `archive transfer final signoff external sync rectification closure update unmatchedUpdateCount mismatch: expected ${unmatchedUpdateCount}, got ${update.unmatchedUpdateCount}`,
    );
  }
  const paths = [
    "batch/archive-transfer-final-signoff-external-sync-rectification-closure-update.md",
    "batch/archive-transfer-final-signoff-external-sync-rectification-closure-update.csv",
    "batch/archive-transfer-final-signoff-external-sync-rectification-closure-update.json",
  ];
  validateArchiveAndUploadPaths(
    "archive transfer final signoff external sync rectification closure update",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing archive transfer final signoff external sync rectification closure update file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(update.updateFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive transfer final signoff external sync rectification closure update missing updateFingerprint",
    );
  } else {
    const { markdown, csv, json, updateFingerprint, ...fingerprintBody } = update;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify({ ...fingerprintBody, csv }));
    if (computedFingerprint !== updateFingerprint) {
      errors.push(
        `archive transfer final signoff external sync rectification closure update fingerprint mismatch: expected ${updateFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalSignoffExternalSyncRectificationReissueHistory(
  history,
  csvRows,
  rectificationLedger,
  closureUpdate,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!history) return;
  if (
    history.schema !==
    "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationReissueHistory.v1"
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification reissue history schema mismatch: ${history.schema}`,
    );
  }
  const rows = Array.isArray(history.rows) ? history.rows : [];
  if (!Array.isArray(history.rows)) {
    errors.push(
      "archive transfer final signoff external sync rectification reissue history rows must be an array",
    );
  } else if (csvRows.length !== history.rows.length) {
    errors.push(
      `archive transfer final signoff external sync rectification reissue history CSV row count mismatch: expected ${history.rows.length}, got ${csvRows.length}`,
    );
  }
  if (Number(history.roundCount) !== rows.length) {
    errors.push(
      `archive transfer final signoff external sync rectification reissue history roundCount mismatch: expected ${rows.length}, got ${history.roundCount}`,
    );
  }
  if (!stringValue(history.sourceReceiptFingerprint)) {
    errors.push(
      "archive transfer final signoff external sync rectification reissue history missing sourceReceiptFingerprint",
    );
  }
  if (!stringValue(history.sourceSignoffFingerprint)) {
    errors.push(
      "archive transfer final signoff external sync rectification reissue history missing sourceSignoffFingerprint",
    );
  }
  if (!stringValue(history.initialLedgerFingerprint)) {
    errors.push(
      "archive transfer final signoff external sync rectification reissue history missing initialLedgerFingerprint",
    );
  }
  if (!stringValue(history.finalLedgerFingerprint)) {
    errors.push(
      "archive transfer final signoff external sync rectification reissue history missing finalLedgerFingerprint",
    );
  }
  if (
    rectificationLedger &&
    stringValue(rectificationLedger.rectificationFingerprint) !==
      stringValue(history.finalLedgerFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification reissue history final ledger mismatch: expected ${stringValue(rectificationLedger.rectificationFingerprint)}, got ${stringValue(history.finalLedgerFingerprint)}`,
    );
  }
  if (
    closureUpdate &&
    stringValue(closureUpdate.updatedLedgerFingerprint) &&
    stringValue(closureUpdate.updatedLedgerFingerprint) !==
      stringValue(history.finalLedgerFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification reissue history closure final ledger mismatch: expected ${stringValue(closureUpdate.updatedLedgerFingerprint)}, got ${stringValue(history.finalLedgerFingerprint)}`,
    );
  }
  if (closureUpdate && rows.length > 0) {
    const lastRound = rows[rows.length - 1];
    if (
      stringValue(lastRound.closureUpdateFingerprint) !==
      stringValue(closureUpdate.updateFingerprint)
    ) {
      errors.push(
        `archive transfer final signoff external sync rectification reissue history latest closure mismatch: expected ${stringValue(closureUpdate.updateFingerprint)}, got ${stringValue(lastRound.closureUpdateFingerprint)}`,
      );
    }
  }
  if (
    rectificationLedger &&
    Number(history.finalOpenCount) !== Number(rectificationLedger.openCount)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification reissue history finalOpenCount mismatch: expected ${rectificationLedger.openCount}, got ${history.finalOpenCount}`,
    );
  }
  if (
    rectificationLedger &&
    Number(history.totalClosedCount) !== Number(rectificationLedger.closedCount)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification reissue history totalClosedCount mismatch: expected ${rectificationLedger.closedCount}, got ${history.totalClosedCount}`,
    );
  }
  if (!Array.isArray(history.fileSummaries)) {
    errors.push(
      "archive transfer final signoff external sync rectification reissue history fileSummaries must be an array",
    );
  }
  const paths = [
    "batch/archive-transfer-final-signoff-external-sync-rectification-reissue-history.md",
    "batch/archive-transfer-final-signoff-external-sync-rectification-reissue-history.csv",
    "batch/archive-transfer-final-signoff-external-sync-rectification-reissue-history.json",
  ];
  validateArchiveAndUploadPaths(
    "archive transfer final signoff external sync rectification reissue history",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing archive transfer final signoff external sync rectification reissue history file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(history.historyFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive transfer final signoff external sync rectification reissue history missing historyFingerprint",
    );
  } else {
    const { markdown, csv, json, historyFingerprint, ...fingerprintBody } = history;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== historyFingerprint) {
      errors.push(
        `archive transfer final signoff external sync rectification reissue history fingerprint mismatch: expected ${historyFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation(
  confirmation,
  csvRows,
  history,
  rectificationLedger,
  receipt,
  signoff,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!confirmation) return;
  if (
    confirmation.schema !==
    "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation.v1"
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation schema mismatch: ${confirmation.schema}`,
    );
  }
  const rows = Array.isArray(confirmation.rows) ? confirmation.rows : [];
  if (!Array.isArray(confirmation.rows)) {
    errors.push(
      "archive transfer final signoff external sync rectification final confirmation rows must be an array",
    );
  } else if (csvRows.length !== confirmation.rows.length) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation CSV row count mismatch: expected ${confirmation.rows.length}, got ${csvRows.length}`,
    );
  }

  const sourceRows = rows.filter(
    (row) => stringValue(row.confirmationStatus) !== "unmatched_confirmation",
  );
  const statusCount = (status) =>
    rows.filter((row) => stringValue(row.confirmationStatus) === status).length;
  const confirmedCount = statusCount("confirmed");
  const rejectedCount = statusCount("rejected");
  const pendingCount = statusCount("kept_pending");
  const missingConfirmationCount = statusCount("missing_confirmation");
  const unmatchedConfirmationCount = statusCount("unmatched_confirmation");
  const countChecks = [
    ["fileCount", sourceRows.length],
    ["confirmedCount", confirmedCount],
    ["rejectedCount", rejectedCount],
    ["pendingCount", pendingCount],
    ["missingConfirmationCount", missingConfirmationCount],
    ["unmatchedConfirmationCount", unmatchedConfirmationCount],
  ];
  for (const [field, expected] of countChecks) {
    if (Number(confirmation[field]) !== expected) {
      errors.push(
        `archive transfer final signoff external sync rectification final confirmation ${field} mismatch: expected ${expected}, got ${confirmation[field]}`,
      );
    }
  }
  if (
    history &&
    Number(confirmation.fileCount) !==
      Number(history.fileCount ?? history.fileSummaries?.length ?? sourceRows.length)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation fileCount source mismatch: expected ${history.fileCount ?? history.fileSummaries?.length}, got ${confirmation.fileCount}`,
    );
  }
  if (
    history &&
    stringValue(confirmation.sourceHistoryFingerprint) !== stringValue(history.historyFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation source history mismatch: expected ${stringValue(history.historyFingerprint)}, got ${stringValue(confirmation.sourceHistoryFingerprint)}`,
    );
  }
  if (
    history &&
    stringValue(confirmation.finalLedgerFingerprint) !== stringValue(history.finalLedgerFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation final ledger mismatch: expected ${stringValue(history.finalLedgerFingerprint)}, got ${stringValue(confirmation.finalLedgerFingerprint)}`,
    );
  }
  if (
    rectificationLedger &&
    stringValue(rectificationLedger.rectificationFingerprint) !==
      stringValue(confirmation.finalLedgerFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation current ledger mismatch: expected ${stringValue(rectificationLedger.rectificationFingerprint)}, got ${stringValue(confirmation.finalLedgerFingerprint)}`,
    );
  }
  if (
    receipt &&
    stringValue(confirmation.sourceReceiptFingerprint) !== stringValue(receipt.receiptFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation source receipt mismatch: expected ${stringValue(receipt.receiptFingerprint)}, got ${stringValue(confirmation.sourceReceiptFingerprint)}`,
    );
  }
  if (
    signoff &&
    stringValue(confirmation.sourceSignoffFingerprint) !== stringValue(signoff.signoffFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation source signoff mismatch: expected ${stringValue(signoff.signoffFingerprint)}, got ${stringValue(confirmation.sourceSignoffFingerprint)}`,
    );
  }
  if (history && Number(confirmation.finalOpenCount) !== Number(history.finalOpenCount)) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation finalOpenCount mismatch: expected ${history.finalOpenCount}, got ${confirmation.finalOpenCount}`,
    );
  }
  const expectedReadiness =
    Number(confirmation.finalOpenCount) > 0 || rejectedCount > 0
      ? "blocked"
      : pendingCount > 0 || missingConfirmationCount > 0 || unmatchedConfirmationCount > 0
        ? "needs_follow_up"
        : "ready_for_archive";
  if (stringValue(confirmation.confirmationReadiness) !== expectedReadiness) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation readiness mismatch: expected ${expectedReadiness}, got ${stringValue(confirmation.confirmationReadiness)}`,
    );
  }

  const paths = [
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation.md",
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation.csv",
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation.json",
  ];
  validateArchiveAndUploadPaths(
    "archive transfer final signoff external sync rectification final confirmation",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing archive transfer final signoff external sync rectification final confirmation file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(confirmation.confirmationFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive transfer final signoff external sync rectification final confirmation missing confirmationFingerprint",
    );
  } else {
    const { markdown, csv, json, confirmationFingerprint, ...fingerprintBody } = confirmation;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== confirmationFingerprint) {
      errors.push(
        `archive transfer final signoff external sync rectification final confirmation fingerprint mismatch: expected ${confirmationFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff(
  signoff,
  csvRows,
  confirmation,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  releaseRecord,
  errors,
) {
  if (!signoff) return;
  if (
    signoff.schema !==
    "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff.v1"
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff schema mismatch: ${signoff.schema}`,
    );
  }
  const rows = Array.isArray(signoff.rows) ? signoff.rows : [];
  if (!Array.isArray(signoff.rows)) {
    errors.push(
      "archive transfer final signoff external sync rectification final confirmation batch signoff rows must be an array",
    );
  } else if (csvRows.length !== signoff.rows.length) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff CSV row count mismatch: expected ${signoff.rows.length}, got ${csvRows.length}`,
    );
  }

  if (
    confirmation &&
    stringValue(signoff.sourceConfirmationFingerprint) !==
      stringValue(confirmation.confirmationFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff source confirmation mismatch: expected ${stringValue(confirmation.confirmationFingerprint)}, got ${stringValue(signoff.sourceConfirmationFingerprint)}`,
    );
  }
  if (
    confirmation &&
    stringValue(signoff.sourceHistoryFingerprint) !==
      stringValue(confirmation.sourceHistoryFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff source history mismatch: expected ${stringValue(confirmation.sourceHistoryFingerprint)}, got ${stringValue(signoff.sourceHistoryFingerprint)}`,
    );
  }
  if (
    confirmation &&
    stringValue(signoff.finalLedgerFingerprint) !== stringValue(confirmation.finalLedgerFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff final ledger mismatch: expected ${stringValue(confirmation.finalLedgerFingerprint)}, got ${stringValue(signoff.finalLedgerFingerprint)}`,
    );
  }

  const signedFileCount = rows.filter((row) => stringValue(row.signatureStatus) === "signed")
    .length;
  const actionFileCount = rows.filter(
    (row) => stringValue(row.signatureStatus) === "signed_with_actions",
  ).length;
  const blockingFileCount = rows.filter((row) => stringValue(row.signatureStatus) === "blocked")
    .length;
  const countChecks = [
    ["fileCount", rows.length],
    ["signedFileCount", signedFileCount],
    ["actionFileCount", actionFileCount],
    ["blockingFileCount", blockingFileCount],
  ];
  for (const [field, expected] of countChecks) {
    if (Number(signoff[field]) !== expected) {
      errors.push(
        `archive transfer final signoff external sync rectification final confirmation batch signoff ${field} mismatch: expected ${expected}, got ${signoff[field]}`,
      );
    }
  }
  if (
    confirmation &&
    Number(signoff.fileCount) !==
      Number(confirmation.fileCount ?? (Array.isArray(confirmation.rows) ? confirmation.rows.length : 0))
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff fileCount source mismatch: expected ${confirmation.fileCount}, got ${signoff.fileCount}`,
    );
  }

  const conclusion = stringValue(signoff.signoff?.conclusion);
  const reviewer = stringValue(signoff.signoff?.reviewer);
  const expectedSignatureStatus =
    confirmation &&
    (stringValue(confirmation.confirmationReadiness) === "blocked" ||
      Number(confirmation.finalOpenCount) > 0 ||
      Number(confirmation.rejectedCount) > 0 ||
      conclusion === "needs_rework")
      ? "blocked"
      : conclusion === "pending_review" || !reviewer
        ? "pending"
        : confirmation &&
            (stringValue(confirmation.confirmationReadiness) === "needs_follow_up" ||
              Number(confirmation.pendingCount) > 0 ||
              Number(confirmation.missingConfirmationCount) > 0 ||
              Number(confirmation.unmatchedConfirmationCount) > 0 ||
              conclusion === "approved_with_comments")
          ? "signed_with_actions"
          : "signed";
  if (stringValue(signoff.signatureStatus) !== expectedSignatureStatus) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff signatureStatus mismatch: expected ${expectedSignatureStatus}, got ${stringValue(signoff.signatureStatus)}`,
    );
  }

  const paths = [
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff.md",
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff.csv",
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff.json",
  ];
  validateArtifactCoverage(
    paths,
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final signoff external sync rectification final confirmation batch signoff",
    errors,
  );

  const releaseRows = Array.isArray(releaseRecord?.rows) ? releaseRecord.rows : [];
  const releaseRow = releaseRows.find(
    (row) =>
      stringValue(row.artifactKey) ===
      "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff",
  );
  if (!releaseRow) {
    errors.push(
      "archive release record missing optional artifact row: archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff",
    );
  } else {
    if (
      stringValue(releaseRow.artifactPath) !==
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff.json"
    ) {
      errors.push(
        `archive release record optional artifact path mismatch for archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff: ${stringValue(releaseRow.artifactPath)}`,
      );
    }
    if (
      stringValue(signoff.signoffFingerprint) &&
      stringValue(releaseRow.fingerprint) !== stringValue(signoff.signoffFingerprint)
    ) {
      errors.push(
        `archive release record optional artifact fingerprint mismatch for archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff: expected ${stringValue(signoff.signoffFingerprint)}, got ${stringValue(releaseRow.fingerprint)}`,
      );
    }
  }

  const storedFingerprint = stringValue(signoff.signoffFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive transfer final signoff external sync rectification final confirmation batch signoff missing signoffFingerprint",
    );
  } else {
    const { markdown, csv, json, signoffFingerprint, ...fingerprintBody } = signoff;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== signoffFingerprint) {
      errors.push(
        `archive transfer final signoff external sync rectification final confirmation batch signoff fingerprint mismatch: expected ${signoffFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt(
  receipt,
  csvRows,
  signoff,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  releaseRecord,
  errors,
) {
  if (!receipt) return;
  if (
    receipt.schema !==
    "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt.v1"
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync receipt schema mismatch: ${receipt.schema}`,
    );
  }
  const rows = Array.isArray(receipt.rows) ? receipt.rows : [];
  if (!Array.isArray(receipt.rows)) {
    errors.push(
      "archive transfer final signoff external sync rectification final confirmation batch signoff external sync receipt rows must be an array",
    );
  } else if (csvRows.length !== receipt.rows.length) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync receipt CSV row count mismatch: expected ${receipt.rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    signoff &&
    stringValue(receipt.sourceSignoffFingerprint) !== stringValue(signoff.signoffFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync receipt source signoff mismatch: expected ${stringValue(signoff.signoffFingerprint)}, got ${stringValue(receipt.sourceSignoffFingerprint)}`,
    );
  }
  if (
    signoff &&
    stringValue(receipt.sourceConfirmationFingerprint) !==
      stringValue(signoff.sourceConfirmationFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync receipt source confirmation mismatch: expected ${stringValue(signoff.sourceConfirmationFingerprint)}, got ${stringValue(receipt.sourceConfirmationFingerprint)}`,
    );
  }
  if (signoff && Number(receipt.fileCount) !== Number(signoff.fileCount)) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync receipt fileCount mismatch: expected ${signoff.fileCount}, got ${receipt.fileCount}`,
    );
  }
  if (Number(receipt.rowCount) !== rows.length) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync receipt rowCount mismatch: expected ${rows.length}, got ${receipt.rowCount}`,
    );
  }
  const acceptedCount = rows.filter((row) => stringValue(row.reconciliationStatus) === "accepted").length;
  const rejectedCount = rows.filter((row) => stringValue(row.reconciliationStatus) === "rejected").length;
  const pendingCount = rows.filter((row) => stringValue(row.reconciliationStatus) === "pending").length;
  const skippedCount = rows.filter((row) => stringValue(row.reconciliationStatus) === "skipped").length;
  const missingReceiptCount = rows.filter((row) => stringValue(row.reconciliationStatus) === "missing_receipt").length;
  const unmatchedReceiptCount = rows.filter((row) => stringValue(row.reconciliationStatus) === "unmatched_receipt").length;
  const followUpCount = rejectedCount + pendingCount + missingReceiptCount + unmatchedReceiptCount;
  const countChecks = [
    ["acceptedCount", acceptedCount],
    ["rejectedCount", rejectedCount],
    ["pendingCount", pendingCount],
    ["skippedCount", skippedCount],
    ["missingReceiptCount", missingReceiptCount],
    ["unmatchedReceiptCount", unmatchedReceiptCount],
    ["followUpCount", followUpCount],
  ];
  for (const [field, expected] of countChecks) {
    if (Number(receipt[field]) !== expected) {
      errors.push(
        `archive transfer final signoff external sync rectification final confirmation batch signoff external sync receipt ${field} mismatch: expected ${expected}, got ${receipt[field]}`,
      );
    }
  }
  const paths = [
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-receipt.md",
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-receipt.csv",
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-receipt.json",
  ];
  validateArtifactCoverage(
    paths,
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final signoff external sync rectification final confirmation batch signoff external sync receipt",
    errors,
  );
  const releaseRows = Array.isArray(releaseRecord?.rows) ? releaseRecord.rows : [];
  const releaseRow = releaseRows.find(
    (row) =>
      stringValue(row.artifactKey) ===
      "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_receipt",
  );
  if (!releaseRow) {
    errors.push(
      "archive release record missing optional artifact row: archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_receipt",
    );
  } else {
    if (
      stringValue(releaseRow.artifactPath) !==
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-receipt.json"
    ) {
      errors.push(
        `archive release record optional artifact path mismatch for archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_receipt: ${stringValue(releaseRow.artifactPath)}`,
      );
    }
    if (
      stringValue(receipt.receiptFingerprint) &&
      stringValue(releaseRow.fingerprint) !== stringValue(receipt.receiptFingerprint)
    ) {
      errors.push(
        `archive release record optional artifact fingerprint mismatch for archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_receipt: expected ${stringValue(receipt.receiptFingerprint)}, got ${stringValue(releaseRow.fingerprint)}`,
      );
    }
  }
  const storedFingerprint = stringValue(receipt.receiptFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive transfer final signoff external sync rectification final confirmation batch signoff external sync receipt missing receiptFingerprint",
    );
  } else {
    const { markdown, csv, json, receiptFingerprint, ...fingerprintBody } = receipt;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== receiptFingerprint) {
      errors.push(
        `archive transfer final signoff external sync rectification final confirmation batch signoff external sync receipt fingerprint mismatch: expected ${receiptFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger(
  ledger,
  csvRows,
  receipt,
  signoff,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  releaseRecord,
  errors,
) {
  if (!ledger) {
    if (Number(receipt?.followUpCount ?? 0) > 0) {
      errors.push(
        "archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification ledger missing while receipt has follow-up items",
      );
    }
    return;
  }
  if (
    ledger.schema !==
    "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger.v1"
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification ledger schema mismatch: ${ledger.schema}`,
    );
  }
  const rows = Array.isArray(ledger.rows) ? ledger.rows : [];
  if (!Array.isArray(ledger.rows)) {
    errors.push(
      "archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification ledger rows must be an array",
    );
  } else if (csvRows.length !== ledger.rows.length) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification ledger CSV row count mismatch: expected ${ledger.rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    receipt &&
    stringValue(ledger.sourceReceiptFingerprint) !== stringValue(receipt.receiptFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification ledger source receipt mismatch: expected ${stringValue(receipt.receiptFingerprint)}, got ${stringValue(ledger.sourceReceiptFingerprint)}`,
    );
  }
  if (
    signoff &&
    stringValue(ledger.sourceSignoffFingerprint) !== stringValue(signoff.signoffFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification ledger source signoff mismatch: expected ${stringValue(signoff.signoffFingerprint)}, got ${stringValue(ledger.sourceSignoffFingerprint)}`,
    );
  }
  if (
    signoff &&
    stringValue(ledger.sourceConfirmationFingerprint) !==
      stringValue(signoff.sourceConfirmationFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification ledger source confirmation mismatch: expected ${stringValue(signoff.sourceConfirmationFingerprint)}, got ${stringValue(ledger.sourceConfirmationFingerprint)}`,
    );
  }
  if (
    signoff &&
    stringValue(ledger.finalLedgerFingerprint) !== stringValue(signoff.finalLedgerFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification ledger final ledger mismatch: expected ${stringValue(signoff.finalLedgerFingerprint)}, got ${stringValue(ledger.finalLedgerFingerprint)}`,
    );
  }
  const openCount = rows.filter((row) => stringValue(row.closureStatus) === "open").length;
  const closedCount = rows.filter((row) => stringValue(row.closureStatus) === "closed").length;
  const rejectedCount = rows.filter((row) => stringValue(row.issueType) === "rejected").length;
  const pendingCount = rows.filter((row) => stringValue(row.issueType) === "pending").length;
  const missingReceiptCount = rows.filter(
    (row) => stringValue(row.issueType) === "missing_receipt",
  ).length;
  const unmatchedReceiptCount = rows.filter(
    (row) => stringValue(row.issueType) === "unmatched_receipt",
  ).length;
  const highPriorityCount = rows.filter(
    (row) => stringValue(row.closureStatus) === "open" && stringValue(row.priority) === "high",
  ).length;
  const countChecks = [
    ["issueCount", rows.length],
    ["openCount", openCount],
    ["closedCount", closedCount],
    ["rejectedCount", rejectedCount],
    ["pendingCount", pendingCount],
    ["missingReceiptCount", missingReceiptCount],
    ["unmatchedReceiptCount", unmatchedReceiptCount],
    ["highPriorityCount", highPriorityCount],
    ["followUpCount", openCount],
  ];
  for (const [field, expected] of countChecks) {
    if (Number(ledger[field]) !== expected) {
      errors.push(
        `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification ledger ${field} mismatch: expected ${expected}, got ${ledger[field]}`,
      );
    }
  }
  const paths = [
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-ledger.md",
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-ledger.csv",
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-ledger.json",
  ];
  validateArtifactCoverage(
    paths,
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification ledger",
    errors,
  );
  const releaseRows = Array.isArray(releaseRecord?.rows) ? releaseRecord.rows : [];
  const releaseRow = releaseRows.find(
    (row) =>
      stringValue(row.artifactKey) ===
      "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_ledger",
  );
  if (!releaseRow) {
    errors.push(
      "archive release record missing optional artifact row: archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_ledger",
    );
  } else {
    if (
      stringValue(releaseRow.artifactPath) !==
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-ledger.json"
    ) {
      errors.push(
        `archive release record optional artifact path mismatch for archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_ledger: ${stringValue(releaseRow.artifactPath)}`,
      );
    }
    if (
      stringValue(ledger.rectificationFingerprint) &&
      stringValue(releaseRow.fingerprint) !== stringValue(ledger.rectificationFingerprint)
    ) {
      errors.push(
        `archive release record optional artifact fingerprint mismatch for archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_ledger: expected ${stringValue(ledger.rectificationFingerprint)}, got ${stringValue(releaseRow.fingerprint)}`,
      );
    }
  }
  const storedFingerprint = stringValue(ledger.rectificationFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification ledger missing rectificationFingerprint",
    );
  } else {
    const { markdown, csv, json, rectificationFingerprint, ...fingerprintBody } = ledger;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== rectificationFingerprint) {
      errors.push(
        `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification ledger fingerprint mismatch: expected ${rectificationFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate(
  update,
  csvRows,
  rectificationLedger,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  releaseRecord,
  errors,
) {
  if (!update) {
    if (Number(rectificationLedger?.openCount ?? 0) > 0) {
      errors.push(
        "archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification closure update missing while ledger has open items",
      );
    }
    return;
  }
  if (
    update.schema !==
    "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate.v1"
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification closure update schema mismatch: ${update.schema}`,
    );
  }
  const rows = Array.isArray(update.rows) ? update.rows : [];
  if (!Array.isArray(update.rows)) {
    errors.push(
      "archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification closure update rows must be an array",
    );
  } else if (csvRows.length !== update.rows.length) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification closure update CSV row count mismatch: expected ${update.rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    rectificationLedger &&
    stringValue(update.updatedLedgerFingerprint) !==
      stringValue(rectificationLedger.rectificationFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification closure update ledger mismatch: expected ${stringValue(rectificationLedger.rectificationFingerprint)}, got ${stringValue(update.updatedLedgerFingerprint)}`,
    );
  }
  if (
    update.updatedLedger &&
    stringValue(update.updatedLedgerFingerprint) !==
      stringValue(update.updatedLedger.rectificationFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification closure update embedded ledger mismatch: expected ${stringValue(update.updatedLedger.rectificationFingerprint)}, got ${stringValue(update.updatedLedgerFingerprint)}`,
    );
  }
  const missingUpdateCount = rows.filter(
    (row) => stringValue(row.updateStatus) === "missing_update",
  ).length;
  const unmatchedUpdateCount = rows.filter(
    (row) => stringValue(row.updateStatus) === "unmatched_update",
  ).length;
  if (Number(update.missingUpdateCount) !== missingUpdateCount) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification closure update missingUpdateCount mismatch: expected ${missingUpdateCount}, got ${update.missingUpdateCount}`,
    );
  }
  if (Number(update.unmatchedUpdateCount) !== unmatchedUpdateCount) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification closure update unmatchedUpdateCount mismatch: expected ${unmatchedUpdateCount}, got ${update.unmatchedUpdateCount}`,
    );
  }
  if (
    update.updatedLedger &&
    Number(update.closedCount) !== Number(update.updatedLedger.closedCount)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification closure update closedCount mismatch: expected ${update.updatedLedger.closedCount}, got ${update.closedCount}`,
    );
  }
  if (
    update.updatedLedger &&
    Number(update.stillOpenCount) !== Number(update.updatedLedger.openCount)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification closure update stillOpenCount mismatch: expected ${update.updatedLedger.openCount}, got ${update.stillOpenCount}`,
    );
  }
  const paths = [
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-closure-update.md",
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-closure-update.csv",
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-closure-update.json",
  ];
  validateArtifactCoverage(
    paths,
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification closure update",
    errors,
  );
  const releaseRows = Array.isArray(releaseRecord?.rows) ? releaseRecord.rows : [];
  const releaseRow = releaseRows.find(
    (row) =>
      stringValue(row.artifactKey) ===
      "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_closure_update",
  );
  if (!releaseRow) {
    errors.push(
      "archive release record missing optional artifact row: archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_closure_update",
    );
  } else {
    if (
      stringValue(releaseRow.artifactPath) !==
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-closure-update.json"
    ) {
      errors.push(
        `archive release record optional artifact path mismatch for archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_closure_update: ${stringValue(releaseRow.artifactPath)}`,
      );
    }
    if (
      stringValue(update.updateFingerprint) &&
      stringValue(releaseRow.fingerprint) !== stringValue(update.updateFingerprint)
    ) {
      errors.push(
        `archive release record optional artifact fingerprint mismatch for archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_closure_update: expected ${stringValue(update.updateFingerprint)}, got ${stringValue(releaseRow.fingerprint)}`,
      );
    }
  }
  const storedFingerprint = stringValue(update.updateFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification closure update missing updateFingerprint",
    );
  } else {
    const { markdown, csv, json, updateFingerprint, ...fingerprintBody } = update;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify({ ...fingerprintBody, csv }));
    if (computedFingerprint !== updateFingerprint) {
      errors.push(
        `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification closure update fingerprint mismatch: expected ${updateFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory(
  history,
  csvRows,
  rectificationLedger,
  closureUpdate,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  releaseRecord,
  errors,
) {
  if (!history) return;
  if (
    history.schema !==
    "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory.v1"
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification reissue history schema mismatch: ${history.schema}`,
    );
  }
  const rows = Array.isArray(history.rows) ? history.rows : [];
  if (!Array.isArray(history.rows)) {
    errors.push(
      "archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification reissue history rows must be an array",
    );
  } else if (csvRows.length !== history.rows.length) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification reissue history CSV row count mismatch: expected ${history.rows.length}, got ${csvRows.length}`,
    );
  }
  if (Number(history.roundCount) !== rows.length) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification reissue history roundCount mismatch: expected ${rows.length}, got ${history.roundCount}`,
    );
  }
  for (const field of [
    "sourceReceiptFingerprint",
    "sourceSignoffFingerprint",
    "sourceConfirmationFingerprint",
    "sourceHistoryFingerprint",
    "sourceFinalLedgerFingerprint",
    "initialLedgerFingerprint",
    "finalLedgerFingerprint",
  ]) {
    if (!stringValue(history[field])) {
      errors.push(
        `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification reissue history missing ${field}`,
      );
    }
  }
  if (
    rectificationLedger &&
    stringValue(rectificationLedger.rectificationFingerprint) !==
      stringValue(history.finalLedgerFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification reissue history final ledger mismatch: expected ${stringValue(rectificationLedger.rectificationFingerprint)}, got ${stringValue(history.finalLedgerFingerprint)}`,
    );
  }
  if (
    closureUpdate &&
    stringValue(closureUpdate.updatedLedgerFingerprint) &&
    stringValue(closureUpdate.updatedLedgerFingerprint) !== stringValue(history.finalLedgerFingerprint)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification reissue history closure final ledger mismatch: expected ${stringValue(closureUpdate.updatedLedgerFingerprint)}, got ${stringValue(history.finalLedgerFingerprint)}`,
    );
  }
  if (closureUpdate && rows.length > 0) {
    const lastRound = rows[rows.length - 1];
    if (
      stringValue(lastRound.closureUpdateFingerprint) !==
      stringValue(closureUpdate.updateFingerprint)
    ) {
      errors.push(
        `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification reissue history latest closure mismatch: expected ${stringValue(closureUpdate.updateFingerprint)}, got ${stringValue(lastRound.closureUpdateFingerprint)}`,
      );
    }
  }
  if (
    rectificationLedger &&
    Number(history.finalOpenCount) !== Number(rectificationLedger.openCount)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification reissue history finalOpenCount mismatch: expected ${rectificationLedger.openCount}, got ${history.finalOpenCount}`,
    );
  }
  if (
    rectificationLedger &&
    Number(history.totalClosedCount) !== Number(rectificationLedger.closedCount)
  ) {
    errors.push(
      `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification reissue history totalClosedCount mismatch: expected ${rectificationLedger.closedCount}, got ${history.totalClosedCount}`,
    );
  }
  if (!Array.isArray(history.fileSummaries)) {
    errors.push(
      "archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification reissue history fileSummaries must be an array",
    );
  }
  const paths = [
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-reissue-history.md",
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-reissue-history.csv",
    "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-reissue-history.json",
  ];
  validateArtifactCoverage(
    paths,
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification reissue history",
    errors,
  );
  const releaseRows = Array.isArray(releaseRecord?.rows) ? releaseRecord.rows : [];
  const releaseRow = releaseRows.find(
    (row) =>
      stringValue(row.artifactKey) ===
      "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_reissue_history",
  );
  if (!releaseRow) {
    errors.push(
      "archive release record missing optional artifact row: archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_reissue_history",
    );
  } else {
    if (
      stringValue(releaseRow.artifactPath) !==
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-reissue-history.json"
    ) {
      errors.push(
        `archive release record optional artifact path mismatch for archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_reissue_history: ${stringValue(releaseRow.artifactPath)}`,
      );
    }
    if (
      stringValue(history.historyFingerprint) &&
      stringValue(releaseRow.fingerprint) !== stringValue(history.historyFingerprint)
    ) {
      errors.push(
        `archive release record optional artifact fingerprint mismatch for archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_reissue_history: expected ${stringValue(history.historyFingerprint)}, got ${stringValue(releaseRow.fingerprint)}`,
      );
    }
  }
  const storedFingerprint = stringValue(history.historyFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification reissue history missing historyFingerprint",
    );
  } else {
    const { markdown, csv, json, historyFingerprint, ...fingerprintBody } = history;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== historyFingerprint) {
      errors.push(
        `archive transfer final signoff external sync rectification final confirmation batch signoff external sync rectification reissue history fingerprint mismatch: expected ${historyFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveReleaseSlaReminderArchiveIngest(
  ingest,
  csvRows,
  manifest,
  externalUploadManifest,
  errors,
) {
  if (!ingest) return;
  if (ingest.schema !== "railwise.engineering.batch.archiveReleaseSlaReminderArchiveIngest.v1") {
    errors.push(`archive release SLA reminder ingest schema mismatch: ${ingest.schema}`);
  }
  if (!Array.isArray(ingest.rows)) {
    errors.push("archive release SLA reminder ingest rows must be an array");
  } else if (csvRows.length !== ingest.rows.length) {
    errors.push(
      `archive release SLA reminder ingest CSV row count mismatch: expected ${ingest.rows.length}, got ${csvRows.length}`,
    );
  }
  const paths = [
    "batch/archive-release-sla-reminder-ingest.md",
    "batch/archive-release-sla-reminder-ingest.csv",
    "batch/archive-release-sla-reminder-ingest.json",
  ];
  validateArchiveAndUploadPaths(
    "archive release SLA reminder ingest",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const storedFingerprint = stringValue(ingest.ingestFingerprint);
  if (!storedFingerprint) {
    errors.push("archive release SLA reminder ingest missing ingestFingerprint");
  } else {
    const { markdown, csv, json, ingestFingerprint, ...fingerprintBody } = ingest;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== ingestFingerprint) {
      errors.push(
        `archive release SLA reminder ingest fingerprint mismatch: expected ${ingestFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveReleaseSlaReminderExternalImportHttpReplayQueue(
  queue,
  csvRows,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!queue) return;
  if (queue.schema !== "railwise.engineering.batch.externalSystemHttpReplayQueue.v1") {
    errors.push(
      `archive release SLA reminder external import HTTP replay queue schema mismatch: ${queue.schema}`,
    );
  }
  if (!Array.isArray(queue.rows)) {
    errors.push(
      "archive release SLA reminder external import HTTP replay queue rows must be an array",
    );
  } else if (csvRows.length !== queue.rows.length) {
    errors.push(
      `archive release SLA reminder external import HTTP replay queue CSV row count mismatch: expected ${queue.rows.length}, got ${csvRows.length}`,
    );
  }
  if (Number(queue.requestCount) !== (Array.isArray(queue.rows) ? queue.rows.length : 0)) {
    errors.push(
      `archive release SLA reminder external import HTTP replay queue requestCount mismatch: expected ${Array.isArray(queue.rows) ? queue.rows.length : 0}, got ${queue.requestCount}`,
    );
  }
  if (!stringValue(queue.planFingerprint)) {
    errors.push(
      "archive release SLA reminder external import HTTP replay queue missing planFingerprint",
    );
  }
  if (!stringValue(queue.sourceSubmissionFingerprint)) {
    errors.push(
      "archive release SLA reminder external import HTTP replay queue missing sourceSubmissionFingerprint",
    );
  }
  const paths = [
    "batch/archive-release-sla-reminder-external-import-http-replay-queue.md",
    "batch/archive-release-sla-reminder-external-import-http-replay-queue.csv",
    "batch/archive-release-sla-reminder-external-import-http-replay-queue.json",
  ];
  validateArchiveAndUploadPaths(
    "archive release SLA reminder external import HTTP replay queue",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing SLA reminder external import HTTP replay queue file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(queue.replayQueueFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive release SLA reminder external import HTTP replay queue missing replayQueueFingerprint",
    );
  } else {
    const { markdown, csv, json, replayQueueFingerprint, ...fingerprintBody } = queue;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== replayQueueFingerprint) {
      errors.push(
        `archive release SLA reminder external import HTTP replay queue fingerprint mismatch: expected ${replayQueueFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveReleaseSlaReminderExternalImportHttpReplayHistory(
  history,
  csvRows,
  queue,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!history) return;
  if (
    history.schema !==
    "railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemHttpReplayHistory.v1"
  ) {
    errors.push(
      `archive release SLA reminder external import HTTP replay history schema mismatch: ${history.schema}`,
    );
  }
  if (!Array.isArray(history.rows)) {
    errors.push(
      "archive release SLA reminder external import HTTP replay history rows must be an array",
    );
  } else if (csvRows.length !== history.rows.length) {
    errors.push(
      `archive release SLA reminder external import HTTP replay history CSV row count mismatch: expected ${history.rows.length}, got ${csvRows.length}`,
    );
  }
  if (Number(history.roundCount) !== (Array.isArray(history.rows) ? history.rows.length : 0)) {
    errors.push(
      `archive release SLA reminder external import HTTP replay history roundCount mismatch: expected ${Array.isArray(history.rows) ? history.rows.length : 0}, got ${history.roundCount}`,
    );
  }
  if (!stringValue(history.planFingerprint)) {
    errors.push(
      "archive release SLA reminder external import HTTP replay history missing planFingerprint",
    );
  }
  if (!stringValue(history.initialSubmissionFingerprint)) {
    errors.push(
      "archive release SLA reminder external import HTTP replay history missing initialSubmissionFingerprint",
    );
  }
  if (
    queue &&
    stringValue(queue.planFingerprint) &&
    stringValue(history.planFingerprint) !== stringValue(queue.planFingerprint)
  ) {
    errors.push(
      `archive release SLA reminder external import HTTP replay history plan fingerprint mismatch: expected ${queue.planFingerprint}, got ${history.planFingerprint}`,
    );
  }
  const finalReplayRequestCount = Number(history.finalReplayRequestCount);
  if (Number.isFinite(finalReplayRequestCount) && finalReplayRequestCount < 0) {
    errors.push(
      "archive release SLA reminder external import HTTP replay history finalReplayRequestCount must not be negative",
    );
  }
  const paths = [
    "batch/archive-release-sla-reminder-external-import-http-replay-history.md",
    "batch/archive-release-sla-reminder-external-import-http-replay-history.csv",
    "batch/archive-release-sla-reminder-external-import-http-replay-history.json",
  ];
  validateArchiveAndUploadPaths(
    "archive release SLA reminder external import HTTP replay history",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing SLA reminder external import HTTP replay history file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(history.historyFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive release SLA reminder external import HTTP replay history missing historyFingerprint",
    );
  } else {
    const { markdown, csv, json, historyFingerprint, ...fingerprintBody } = history;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== historyFingerprint) {
      errors.push(
        `archive release SLA reminder external import HTTP replay history fingerprint mismatch: expected ${historyFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveReleaseSlaReminderExternalImportReceiptUpdate(
  update,
  csvRows,
  ingest,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!update) return;
  if (
    update.schema !==
    "railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemImportReceiptUpdate.v1"
  ) {
    errors.push(
      `archive release SLA reminder external import receipt update schema mismatch: ${update.schema}`,
    );
  }
  if (!Array.isArray(update.rows)) {
    errors.push(
      "archive release SLA reminder external import receipt update rows must be an array",
    );
  } else if (csvRows.length !== update.rows.length) {
    errors.push(
      `archive release SLA reminder external import receipt update CSV row count mismatch: expected ${update.rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    !update.updatedArchiveIngest ||
    update.updatedArchiveIngest.schema !==
      "railwise.engineering.batch.archiveReleaseSlaReminderArchiveIngest.v1"
  ) {
    errors.push(
      "archive release SLA reminder external import receipt update missing updatedArchiveIngest",
    );
  }
  const sourceIngestFingerprint = stringValue(update.sourceIngestFingerprint);
  if (
    ingest &&
    sourceIngestFingerprint &&
    sourceIngestFingerprint === stringValue(ingest.ingestFingerprint)
  ) {
    errors.push(
      "archive release SLA reminder external import receipt update points to stale source ingest fingerprint",
    );
  }
  const ingestReconciliationFingerprint = stringValue(
    ingest?.externalImportReconciliationFingerprint,
  );
  const updateIsCurrentIngest =
    !ingestReconciliationFingerprint ||
    ingestReconciliationFingerprint === stringValue(update.updateFingerprint);
  if (
    ingest &&
    updateIsCurrentIngest &&
    stringValue(update.updatedArchiveIngest?.ingestFingerprint) !==
      stringValue(ingest.ingestFingerprint)
  ) {
    errors.push(
      `archive release SLA reminder external import receipt update updated ingest mismatch: expected ${stringValue(ingest.ingestFingerprint)}, got ${stringValue(update.updatedArchiveIngest?.ingestFingerprint)}`,
    );
  }
  const paths = [
    "batch/archive-release-sla-reminder-external-import-receipt-update.md",
    "batch/archive-release-sla-reminder-external-import-receipt-update.csv",
    "batch/archive-release-sla-reminder-external-import-receipt-update.json",
  ];
  validateArchiveAndUploadPaths(
    "archive release SLA reminder external import receipt update",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing SLA reminder external import receipt update file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(update.updateFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive release SLA reminder external import receipt update missing updateFingerprint",
    );
  } else {
    const { markdown, csv, json, updateFingerprint, ...fingerprintBody } = update;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== updateFingerprint) {
      errors.push(
        `archive release SLA reminder external import receipt update fingerprint mismatch: expected ${updateFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveReleaseSlaReminderExternalImportFinalReceiptConfirmation(
  confirmation,
  csvRows,
  receiptUpdate,
  replayHistory,
  ingest,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!confirmation) return;
  if (
    confirmation.schema !==
    "railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemFinalReceiptConfirmation.v1"
  ) {
    errors.push(
      `archive release SLA reminder external import final receipt confirmation schema mismatch: ${confirmation.schema}`,
    );
  }
  if (!Array.isArray(confirmation.rows)) {
    errors.push(
      "archive release SLA reminder external import final receipt confirmation rows must be an array",
    );
  } else if (csvRows.length !== confirmation.rows.length) {
    errors.push(
      `archive release SLA reminder external import final receipt confirmation CSV row count mismatch: expected ${confirmation.rows.length}, got ${csvRows.length}`,
    );
  }
  const rows = Array.isArray(confirmation.rows) ? confirmation.rows : [];
  const requestRows = rows.filter(
    (row) => stringValue(row.confirmationStatus) !== "unmatched_confirmation",
  );
  if (Number(confirmation.requestCount) !== requestRows.length) {
    errors.push(
      `archive release SLA reminder external import final receipt confirmation requestCount mismatch: expected ${requestRows.length}, got ${confirmation.requestCount}`,
    );
  }
  const confirmedCount = requestRows.filter(
    (row) => stringValue(row.confirmationStatus) === "confirmed",
  ).length;
  const rejectedCount = requestRows.filter(
    (row) => stringValue(row.confirmationStatus) === "rejected",
  ).length;
  const pendingCount = requestRows.filter(
    (row) => stringValue(row.confirmationStatus) === "kept_pending",
  ).length;
  const missingConfirmationCount = requestRows.filter(
    (row) => stringValue(row.confirmationStatus) === "missing_confirmation",
  ).length;
  const unmatchedConfirmationCount = rows.filter(
    (row) => stringValue(row.confirmationStatus) === "unmatched_confirmation",
  ).length;
  if (Number(confirmation.confirmedCount) !== confirmedCount) {
    errors.push(
      `archive release SLA reminder external import final receipt confirmation confirmedCount mismatch: expected ${confirmedCount}, got ${confirmation.confirmedCount}`,
    );
  }
  if (Number(confirmation.rejectedCount) !== rejectedCount) {
    errors.push(
      `archive release SLA reminder external import final receipt confirmation rejectedCount mismatch: expected ${rejectedCount}, got ${confirmation.rejectedCount}`,
    );
  }
  if (Number(confirmation.pendingCount) !== pendingCount) {
    errors.push(
      `archive release SLA reminder external import final receipt confirmation pendingCount mismatch: expected ${pendingCount}, got ${confirmation.pendingCount}`,
    );
  }
  if (Number(confirmation.missingConfirmationCount) !== missingConfirmationCount) {
    errors.push(
      `archive release SLA reminder external import final receipt confirmation missingConfirmationCount mismatch: expected ${missingConfirmationCount}, got ${confirmation.missingConfirmationCount}`,
    );
  }
  if (Number(confirmation.unmatchedConfirmationCount) !== unmatchedConfirmationCount) {
    errors.push(
      `archive release SLA reminder external import final receipt confirmation unmatchedConfirmationCount mismatch: expected ${unmatchedConfirmationCount}, got ${confirmation.unmatchedConfirmationCount}`,
    );
  }
  if (
    receiptUpdate &&
    stringValue(confirmation.sourceReceiptUpdateFingerprint) !==
      stringValue(receiptUpdate.updateFingerprint)
  ) {
    errors.push(
      `archive release SLA reminder external import final receipt confirmation source update mismatch: expected ${stringValue(receiptUpdate.updateFingerprint)}, got ${stringValue(confirmation.sourceReceiptUpdateFingerprint)}`,
    );
  }
  if (
    replayHistory &&
    stringValue(confirmation.sourceReplayHistoryFingerprint) !==
      stringValue(replayHistory.historyFingerprint)
  ) {
    errors.push(
      `archive release SLA reminder external import final receipt confirmation replay history mismatch: expected ${stringValue(replayHistory.historyFingerprint)}, got ${stringValue(confirmation.sourceReplayHistoryFingerprint)}`,
    );
  }
  if (
    !confirmation.updatedArchiveIngest ||
    confirmation.updatedArchiveIngest.schema !==
      "railwise.engineering.batch.archiveReleaseSlaReminderArchiveIngest.v1"
  ) {
    errors.push(
      "archive release SLA reminder external import final receipt confirmation missing updatedArchiveIngest",
    );
  }
  if (
    ingest &&
    stringValue(confirmation.updatedArchiveIngest?.ingestFingerprint) !==
      stringValue(ingest.ingestFingerprint)
  ) {
    errors.push(
      `archive release SLA reminder external import final receipt confirmation updated ingest mismatch: expected ${stringValue(ingest.ingestFingerprint)}, got ${stringValue(confirmation.updatedArchiveIngest?.ingestFingerprint)}`,
    );
  }
  if (
    stringValue(confirmation.updatedArchiveIngest?.externalImportReconciliationFingerprint) !==
    stringValue(confirmation.confirmationFingerprint)
  ) {
    errors.push(
      "archive release SLA reminder external import final receipt confirmation updated ingest reconciliation fingerprint mismatch",
    );
  }
  if (
    stringValue(confirmation.updatedArchiveIngest?.externalImportStatus) !==
    stringValue(confirmation.finalExternalImportStatus)
  ) {
    errors.push(
      "archive release SLA reminder external import final receipt confirmation updated ingest status mismatch",
    );
  }
  const paths = [
    "batch/archive-release-sla-reminder-external-import-final-receipt-confirmation.md",
    "batch/archive-release-sla-reminder-external-import-final-receipt-confirmation.csv",
    "batch/archive-release-sla-reminder-external-import-final-receipt-confirmation.json",
  ];
  validateArchiveAndUploadPaths(
    "archive release SLA reminder external import final receipt confirmation",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing SLA reminder external import final receipt confirmation file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(confirmation.confirmationFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive release SLA reminder external import final receipt confirmation missing confirmationFingerprint",
    );
  } else {
    const {
      markdown,
      csv,
      json,
      confirmationFingerprint,
      updatedArchiveIngest,
      ...fingerprintBody
    } = confirmation;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== confirmationFingerprint) {
      errors.push(
        `archive release SLA reminder external import final receipt confirmation fingerprint mismatch: expected ${confirmationFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveReleaseSlaReminderExternalImportFinalReceiptCrossPlatformReview(
  review,
  csvRows,
  confirmation,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!review) return;
  if (
    review.schema !==
    "railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemFinalReceiptCrossPlatformReview.v1"
  ) {
    errors.push(
      `archive release SLA reminder external import final receipt cross-platform review schema mismatch: ${review.schema}`,
    );
  }
  const rows = Array.isArray(review.rows) ? review.rows : [];
  if (!Array.isArray(review.rows)) {
    errors.push(
      "archive release SLA reminder external import final receipt cross-platform review rows must be an array",
    );
  } else if (csvRows.length !== review.rows.length) {
    errors.push(
      `archive release SLA reminder external import final receipt cross-platform review CSV row count mismatch: expected ${review.rows.length}, got ${csvRows.length}`,
    );
  }
  if (Number(review.fileCount) !== rows.length) {
    errors.push(
      `archive release SLA reminder external import final receipt cross-platform review fileCount mismatch: expected ${rows.length}, got ${review.fileCount}`,
    );
  }
  if (
    confirmation &&
    stringValue(review.sourceConfirmationFingerprint) !==
      stringValue(confirmation.confirmationFingerprint)
  ) {
    errors.push(
      `archive release SLA reminder external import final receipt cross-platform review source confirmation mismatch: expected ${stringValue(confirmation.confirmationFingerprint)}, got ${stringValue(review.sourceConfirmationFingerprint)}`,
    );
  }
  const issueFileCount = rows.filter(
    (row) => Array.isArray(row.issueTypes) && row.issueTypes.length > 0,
  ).length;
  const blockingIssueCount = rows.filter((row) => stringValue(row.severity) === "blocking").length;
  const warningIssueCount = rows.filter((row) => stringValue(row.severity) === "warning").length;
  const expectedStatus = issueFileCount > 0 ? "needs_review" : "passed";
  if (Number(review.issueFileCount) !== issueFileCount) {
    errors.push(
      `archive release SLA reminder external import final receipt cross-platform review issueFileCount mismatch: expected ${issueFileCount}, got ${review.issueFileCount}`,
    );
  }
  if (Number(review.blockingIssueCount) !== blockingIssueCount) {
    errors.push(
      `archive release SLA reminder external import final receipt cross-platform review blockingIssueCount mismatch: expected ${blockingIssueCount}, got ${review.blockingIssueCount}`,
    );
  }
  if (Number(review.warningIssueCount) !== warningIssueCount) {
    errors.push(
      `archive release SLA reminder external import final receipt cross-platform review warningIssueCount mismatch: expected ${warningIssueCount}, got ${review.warningIssueCount}`,
    );
  }
  if (stringValue(review.reviewStatus) !== expectedStatus) {
    errors.push(
      `archive release SLA reminder external import final receipt cross-platform review status mismatch: expected ${expectedStatus}, got ${stringValue(review.reviewStatus)}`,
    );
  }
  const paths = [
    "batch/archive-release-sla-reminder-external-import-final-receipt-cross-platform-review.md",
    "batch/archive-release-sla-reminder-external-import-final-receipt-cross-platform-review.csv",
    "batch/archive-release-sla-reminder-external-import-final-receipt-cross-platform-review.json",
  ];
  validateArchiveAndUploadPaths(
    "archive release SLA reminder external import final receipt cross-platform review",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing SLA reminder external import final receipt cross-platform review file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(review.reviewFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive release SLA reminder external import final receipt cross-platform review missing reviewFingerprint",
    );
  } else {
    const { markdown, csv, json, reviewFingerprint, ...fingerprintBody } = review;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== reviewFingerprint) {
      errors.push(
        `archive release SLA reminder external import final receipt cross-platform review fingerprint mismatch: expected ${reviewFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveReleaseSlaReminderExternalImportFinalReceiptBatchSignoff(
  signoff,
  csvRows,
  confirmation,
  review,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!signoff) return;
  if (
    signoff.schema !==
    "railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemFinalReceiptBatchSignoff.v1"
  ) {
    errors.push(
      `archive release SLA reminder external import final receipt batch signoff schema mismatch: ${signoff.schema}`,
    );
  }
  const rows = Array.isArray(signoff.rows) ? signoff.rows : [];
  if (!Array.isArray(signoff.rows)) {
    errors.push(
      "archive release SLA reminder external import final receipt batch signoff rows must be an array",
    );
  } else if (csvRows.length !== signoff.rows.length) {
    errors.push(
      `archive release SLA reminder external import final receipt batch signoff CSV row count mismatch: expected ${signoff.rows.length}, got ${csvRows.length}`,
    );
  }
  if (Number(signoff.fileCount) !== rows.length) {
    errors.push(
      `archive release SLA reminder external import final receipt batch signoff fileCount mismatch: expected ${rows.length}, got ${signoff.fileCount}`,
    );
  }
  if (
    confirmation &&
    stringValue(signoff.sourceConfirmationFingerprint) !==
      stringValue(confirmation.confirmationFingerprint)
  ) {
    errors.push(
      `archive release SLA reminder external import final receipt batch signoff source confirmation mismatch: expected ${stringValue(confirmation.confirmationFingerprint)}, got ${stringValue(signoff.sourceConfirmationFingerprint)}`,
    );
  }
  if (
    review &&
    stringValue(signoff.sourceCrossPlatformReviewFingerprint) !==
      stringValue(review.reviewFingerprint)
  ) {
    errors.push(
      `archive release SLA reminder external import final receipt batch signoff source review mismatch: expected ${stringValue(review.reviewFingerprint)}, got ${stringValue(signoff.sourceCrossPlatformReviewFingerprint)}`,
    );
  }
  const signedFileCount = rows.filter(
    (row) => stringValue(row.signatureStatus) === "signed",
  ).length;
  const actionFileCount = rows.filter(
    (row) => stringValue(row.signatureStatus) === "signed_with_actions",
  ).length;
  const blockingFileCount = rows.filter(
    (row) => stringValue(row.signatureStatus) === "blocked",
  ).length;
  if (Number(signoff.signedFileCount) !== signedFileCount) {
    errors.push(
      `archive release SLA reminder external import final receipt batch signoff signedFileCount mismatch: expected ${signedFileCount}, got ${signoff.signedFileCount}`,
    );
  }
  if (Number(signoff.actionFileCount) !== actionFileCount) {
    errors.push(
      `archive release SLA reminder external import final receipt batch signoff actionFileCount mismatch: expected ${actionFileCount}, got ${signoff.actionFileCount}`,
    );
  }
  if (Number(signoff.blockingFileCount) !== blockingFileCount) {
    errors.push(
      `archive release SLA reminder external import final receipt batch signoff blockingFileCount mismatch: expected ${blockingFileCount}, got ${signoff.blockingFileCount}`,
    );
  }
  const signoffConclusion = stringValue(signoff.signoff?.conclusion);
  const hasReviewer = Boolean(stringValue(signoff.signoff?.reviewer));
  const expectedStatus =
    blockingFileCount > 0 || signoffConclusion === "needs_rework"
      ? "blocked"
      : signoffConclusion === "pending_review" || !hasReviewer
        ? "pending"
        : actionFileCount > 0 || signoffConclusion === "approved_with_comments"
          ? "signed_with_actions"
          : "signed";
  if (stringValue(signoff.signatureStatus) !== expectedStatus) {
    errors.push(
      `archive release SLA reminder external import final receipt batch signoff status mismatch: expected ${expectedStatus}, got ${stringValue(signoff.signatureStatus)}`,
    );
  }
  const paths = [
    "batch/archive-release-sla-reminder-external-import-final-receipt-batch-signoff.md",
    "batch/archive-release-sla-reminder-external-import-final-receipt-batch-signoff.csv",
    "batch/archive-release-sla-reminder-external-import-final-receipt-batch-signoff.json",
  ];
  validateArchiveAndUploadPaths(
    "archive release SLA reminder external import final receipt batch signoff",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing SLA reminder external import final receipt batch signoff file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(signoff.signoffFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive release SLA reminder external import final receipt batch signoff missing signoffFingerprint",
    );
  } else {
    const { markdown, csv, json, signoffFingerprint, ...fingerprintBody } = signoff;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== signoffFingerprint) {
      errors.push(
        `archive release SLA reminder external import final receipt batch signoff fingerprint mismatch: expected ${signoffFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveReleaseSlaReminderExternalImportFinalReceiptSignoffExternalSyncReceipt(
  receipt,
  csvRows,
  signoff,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!receipt) return;
  if (
    receipt.schema !==
    "railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemFinalReceiptSignoffExternalSyncReceipt.v1"
  ) {
    errors.push(
      `archive release SLA reminder external import final receipt signoff external sync receipt schema mismatch: ${receipt.schema}`,
    );
  }
  const rows = Array.isArray(receipt.rows) ? receipt.rows : [];
  if (!Array.isArray(receipt.rows)) {
    errors.push(
      "archive release SLA reminder external import final receipt signoff external sync receipt rows must be an array",
    );
  } else if (csvRows.length !== receipt.rows.length) {
    errors.push(
      `archive release SLA reminder external import final receipt signoff external sync receipt CSV row count mismatch: expected ${receipt.rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    signoff &&
    stringValue(receipt.sourceSignoffFingerprint) !== stringValue(signoff.signoffFingerprint)
  ) {
    errors.push(
      `archive release SLA reminder external import final receipt signoff external sync receipt source signoff mismatch: expected ${stringValue(signoff.signoffFingerprint)}, got ${stringValue(receipt.sourceSignoffFingerprint)}`,
    );
  }
  if (signoff && Number(receipt.fileCount) !== Number(signoff.fileCount)) {
    errors.push(
      `archive release SLA reminder external import final receipt signoff external sync receipt fileCount mismatch: expected ${signoff.fileCount}, got ${receipt.fileCount}`,
    );
  }
  if (Number(receipt.rowCount) !== rows.length) {
    errors.push(
      `archive release SLA reminder external import final receipt signoff external sync receipt rowCount mismatch: expected ${rows.length}, got ${receipt.rowCount}`,
    );
  }
  const acceptedCount = rows.filter(
    (row) => stringValue(row.reconciliationStatus) === "accepted",
  ).length;
  const rejectedCount = rows.filter(
    (row) => stringValue(row.reconciliationStatus) === "rejected",
  ).length;
  const pendingCount = rows.filter(
    (row) => stringValue(row.reconciliationStatus) === "pending",
  ).length;
  const skippedCount = rows.filter(
    (row) => stringValue(row.reconciliationStatus) === "skipped",
  ).length;
  const missingReceiptCount = rows.filter(
    (row) => stringValue(row.reconciliationStatus) === "missing_receipt",
  ).length;
  const unmatchedReceiptCount = rows.filter(
    (row) => stringValue(row.reconciliationStatus) === "unmatched_receipt",
  ).length;
  const followUpCount = rejectedCount + pendingCount + missingReceiptCount + unmatchedReceiptCount;
  if (Number(receipt.acceptedCount) !== acceptedCount) {
    errors.push(
      `archive release SLA reminder external import final receipt signoff external sync receipt acceptedCount mismatch: expected ${acceptedCount}, got ${receipt.acceptedCount}`,
    );
  }
  if (Number(receipt.rejectedCount) !== rejectedCount) {
    errors.push(
      `archive release SLA reminder external import final receipt signoff external sync receipt rejectedCount mismatch: expected ${rejectedCount}, got ${receipt.rejectedCount}`,
    );
  }
  if (Number(receipt.pendingCount) !== pendingCount) {
    errors.push(
      `archive release SLA reminder external import final receipt signoff external sync receipt pendingCount mismatch: expected ${pendingCount}, got ${receipt.pendingCount}`,
    );
  }
  if (Number(receipt.skippedCount) !== skippedCount) {
    errors.push(
      `archive release SLA reminder external import final receipt signoff external sync receipt skippedCount mismatch: expected ${skippedCount}, got ${receipt.skippedCount}`,
    );
  }
  if (Number(receipt.missingReceiptCount) !== missingReceiptCount) {
    errors.push(
      `archive release SLA reminder external import final receipt signoff external sync receipt missingReceiptCount mismatch: expected ${missingReceiptCount}, got ${receipt.missingReceiptCount}`,
    );
  }
  if (Number(receipt.unmatchedReceiptCount) !== unmatchedReceiptCount) {
    errors.push(
      `archive release SLA reminder external import final receipt signoff external sync receipt unmatchedReceiptCount mismatch: expected ${unmatchedReceiptCount}, got ${receipt.unmatchedReceiptCount}`,
    );
  }
  if (Number(receipt.followUpCount) !== followUpCount) {
    errors.push(
      `archive release SLA reminder external import final receipt signoff external sync receipt followUpCount mismatch: expected ${followUpCount}, got ${receipt.followUpCount}`,
    );
  }
  const paths = [
    "batch/archive-release-sla-reminder-external-import-final-receipt-signoff-external-sync-receipt.md",
    "batch/archive-release-sla-reminder-external-import-final-receipt-signoff-external-sync-receipt.csv",
    "batch/archive-release-sla-reminder-external-import-final-receipt-signoff-external-sync-receipt.json",
  ];
  validateArchiveAndUploadPaths(
    "archive release SLA reminder external import final receipt signoff external sync receipt",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing SLA reminder external import final receipt signoff external sync receipt file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(receipt.receiptFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive release SLA reminder external import final receipt signoff external sync receipt missing receiptFingerprint",
    );
  } else {
    const { markdown, csv, json, receiptFingerprint, ...fingerprintBody } = receipt;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== receiptFingerprint) {
      errors.push(
        `archive release SLA reminder external import final receipt signoff external sync receipt fingerprint mismatch: expected ${receiptFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveReleaseSlaReminderExternalImportRectificationLedger(
  ledger,
  csvRows,
  receiptUpdate,
  ingest,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!ledger) return;
  if (
    ledger.schema !==
    "railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemImportRectificationLedger.v1"
  ) {
    errors.push(
      `archive release SLA reminder external import rectification ledger schema mismatch: ${ledger.schema}`,
    );
  }
  if (!Array.isArray(ledger.rows)) {
    errors.push(
      "archive release SLA reminder external import rectification ledger rows must be an array",
    );
  } else if (csvRows.length !== ledger.rows.length) {
    errors.push(
      `archive release SLA reminder external import rectification ledger CSV row count mismatch: expected ${ledger.rows.length}, got ${csvRows.length}`,
    );
  }
  if (Number(ledger.rowCount) !== (Array.isArray(ledger.rows) ? ledger.rows.length : 0)) {
    errors.push(
      `archive release SLA reminder external import rectification ledger rowCount mismatch: expected ${Array.isArray(ledger.rows) ? ledger.rows.length : 0}, got ${ledger.rowCount}`,
    );
  }
  if (
    receiptUpdate &&
    stringValue(ledger.sourceReceiptUpdateFingerprint) !==
      stringValue(receiptUpdate.updateFingerprint)
  ) {
    errors.push(
      `archive release SLA reminder external import rectification ledger source update mismatch: expected ${stringValue(receiptUpdate.updateFingerprint)}, got ${stringValue(ledger.sourceReceiptUpdateFingerprint)}`,
    );
  }
  const expectedLedgerIngestFingerprint =
    stringValue(receiptUpdate?.updatedArchiveIngest?.ingestFingerprint) ||
    stringValue(ingest?.ingestFingerprint);
  if (
    expectedLedgerIngestFingerprint &&
    stringValue(ledger.updatedIngestFingerprint) !== expectedLedgerIngestFingerprint
  ) {
    errors.push(
      `archive release SLA reminder external import rectification ledger updated ingest mismatch: expected ${expectedLedgerIngestFingerprint}, got ${stringValue(ledger.updatedIngestFingerprint)}`,
    );
  }
  const paths = [
    "batch/archive-release-sla-reminder-external-import-rectification-ledger.md",
    "batch/archive-release-sla-reminder-external-import-rectification-ledger.csv",
    "batch/archive-release-sla-reminder-external-import-rectification-ledger.json",
  ];
  validateArchiveAndUploadPaths(
    "archive release SLA reminder external import rectification ledger",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing SLA reminder external import rectification ledger file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(ledger.rectificationFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive release SLA reminder external import rectification ledger missing rectificationFingerprint",
    );
  } else {
    const { markdown, csv, json, rectificationFingerprint, ...fingerprintBody } = ledger;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== rectificationFingerprint) {
      errors.push(
        `archive release SLA reminder external import rectification ledger fingerprint mismatch: expected ${rectificationFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveReleaseSlaReminderExternalImportRectificationClosureUpdate(
  update,
  csvRows,
  rectificationLedger,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!update) return;
  if (
    update.schema !==
    "railwise.engineering.batch.archiveReleaseSlaReminderExternalSystemImportRectificationClosureUpdate.v1"
  ) {
    errors.push(
      `archive release SLA reminder external import rectification closure update schema mismatch: ${update.schema}`,
    );
  }
  if (!Array.isArray(update.rows)) {
    errors.push(
      "archive release SLA reminder external import rectification closure update rows must be an array",
    );
  } else if (csvRows.length !== update.rows.length) {
    errors.push(
      `archive release SLA reminder external import rectification closure update CSV row count mismatch: expected ${update.rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    rectificationLedger &&
    stringValue(update.updatedLedgerFingerprint) !==
      stringValue(rectificationLedger.rectificationFingerprint)
  ) {
    errors.push(
      `archive release SLA reminder external import rectification closure update ledger mismatch: expected ${stringValue(rectificationLedger.rectificationFingerprint)}, got ${stringValue(update.updatedLedgerFingerprint)}`,
    );
  }
  if (
    update.updatedLedger &&
    stringValue(update.updatedLedgerFingerprint) !==
      stringValue(update.updatedLedger.rectificationFingerprint)
  ) {
    errors.push(
      `archive release SLA reminder external import rectification closure update embedded ledger mismatch: expected ${stringValue(update.updatedLedger.rectificationFingerprint)}, got ${stringValue(update.updatedLedgerFingerprint)}`,
    );
  }
  const paths = [
    "batch/archive-release-sla-reminder-external-import-rectification-closure-update.md",
    "batch/archive-release-sla-reminder-external-import-rectification-closure-update.csv",
    "batch/archive-release-sla-reminder-external-import-rectification-closure-update.json",
  ];
  validateArchiveAndUploadPaths(
    "archive release SLA reminder external import rectification closure update",
    paths,
    manifest,
    externalUploadManifest,
    errors,
  );
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!externalRowPaths.includes(path)) {
      errors.push(
        `external system upload rows missing SLA reminder external import rectification closure update file: ${path}`,
      );
    }
  }
  const storedFingerprint = stringValue(update.closureFingerprint);
  if (!storedFingerprint) {
    errors.push(
      "archive release SLA reminder external import rectification closure update missing closureFingerprint",
    );
  } else {
    const { markdown, csv, json, closureFingerprint, ...fingerprintBody } = update;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify({ ...fingerprintBody, csv }));
    if (computedFingerprint !== closureFingerprint) {
      errors.push(
        `archive release SLA reminder external import rectification closure update fingerprint mismatch: expected ${closureFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveAndUploadPaths(label, paths, manifest, externalUploadManifest, errors) {
  const manifestPaths = manifestEntryPaths(manifest);
  const uploadPaths = externalUploadFilePaths(externalUploadManifest);
  for (const path of paths) {
    if (!manifestPaths.includes(path)) {
      errors.push(`archive manifest missing ${label} entry: ${path}`);
    }
    if (!uploadPaths.includes(path)) {
      errors.push(`external upload manifest missing ${label} file: ${path}`);
    }
  }
}

function archivePathSegment(value, fallback) {
  const text = stringValue(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return text || fallback;
}

function archiveRunFolders(batchPackage) {
  const used = new Set();
  const runs = Array.isArray(batchPackage?.runs) ? batchPackage.runs : [];
  return runs.map((run, index) => {
    const baseRunFolder = archivePathSegment(run?.id, `run-${index + 1}`);
    let runFolder = baseRunFolder;
    let suffix = 2;
    while (used.has(runFolder)) {
      runFolder = `${baseRunFolder}-${suffix}`;
      suffix += 1;
    }
    used.add(runFolder);
    return { run, runFolder };
  });
}

function validateEnginePreflightArtifacts(
  batchPackage,
  enginePreflight,
  byPath,
  manifest,
  externalUploadManifest,
  errors,
) {
  const declaredPreflight = batchPackage?.enginePreflight;
  if (!declaredPreflight) return { present: false, rowsChecked: 0, missingBinaryCount: 0 };

  if (!enginePreflight) {
    errors.push("batch package declares enginePreflight but batch/engine-preflight.json is missing");
  } else if (enginePreflight.schema !== "railwise.engineering.enginePreflight.v1") {
    errors.push(`engine preflight schema mismatch: ${enginePreflight.schema}`);
  }

  const requiredPaths = [
    "batch/engine-preflight.md",
    "batch/engine-preflight.csv",
    "batch/engine-preflight.json",
  ];
  validateArchiveAndUploadPaths("engine preflight", requiredPaths, manifest, externalUploadManifest, errors);
  for (const path of requiredPaths) {
    if (!byPath.has(path)) errors.push(`engine preflight artifact missing in ZIP: ${path}`);
  }

  const rows = Array.isArray(enginePreflight?.rows) ? enginePreflight.rows : [];
  if (enginePreflight && !Array.isArray(enginePreflight.rows)) {
    errors.push("engine preflight rows must be an array");
  }
  const binaryCount = numberValue(enginePreflight?.binaryCount) ?? 0;
  const missingBinaryCount = numberValue(enginePreflight?.missingBinaryCount) ?? 0;
  const availableBinaryCount = numberValue(enginePreflight?.availableBinaryCount) ?? 0;
  if (enginePreflight && binaryCount !== rows.length) {
    errors.push(`engine preflight binaryCount mismatch: expected ${rows.length}, got ${binaryCount}`);
  }
  const computedAvailableBinaryCount = rows.filter((row) => Boolean(row?.available)).length;
  const computedMissingBinaryCount = rows.length - computedAvailableBinaryCount;
  if (enginePreflight && availableBinaryCount !== computedAvailableBinaryCount) {
    errors.push(
      `engine preflight availableBinaryCount mismatch: expected ${computedAvailableBinaryCount}, got ${availableBinaryCount}`,
    );
  }
  if (enginePreflight && missingBinaryCount !== computedMissingBinaryCount) {
    errors.push(
      `engine preflight missingBinaryCount mismatch: expected ${computedMissingBinaryCount}, got ${missingBinaryCount}`,
    );
  }
  const storedFingerprint = stringValue(enginePreflight?.preflightFingerprint);
  if (enginePreflight && !storedFingerprint) {
    errors.push("engine preflight missing preflightFingerprint");
  } else if (enginePreflight) {
    const { markdown, csv, json, preflightFingerprint, ...fingerprintBody } = enginePreflight;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== preflightFingerprint) {
      errors.push(
        `engine preflight fingerprint mismatch: expected ${preflightFingerprint}, got ${computedFingerprint}`,
      );
    }
  }

  return {
    present: Boolean(enginePreflight),
    rowsChecked: rows.length,
    missingBinaryCount,
  };
}

function validateEngineAcceptanceArtifacts(
  batchPackage,
  engineAcceptance,
  enginePreflight,
  byPath,
  manifest,
  externalUploadManifest,
  errors,
) {
  const declaredAcceptance = batchPackage?.engineAcceptance;
  if (!declaredAcceptance) return { present: false, acceptanceStatus: null, reviewCount: 0 };

  if (!engineAcceptance) {
    errors.push("batch package declares engineAcceptance but batch/engine-acceptance.json is missing");
  } else if (engineAcceptance.schema !== "railwise.engineering.engineAcceptance.v1") {
    errors.push(`engine acceptance schema mismatch: ${engineAcceptance.schema}`);
  }

  const requiredPaths = [
    "batch/engine-acceptance.md",
    "batch/engine-acceptance.csv",
    "batch/engine-acceptance.json",
  ];
  validateArchiveAndUploadPaths("engine acceptance", requiredPaths, manifest, externalUploadManifest, errors);
  for (const path of requiredPaths) {
    if (!byPath.has(path)) errors.push(`engine acceptance artifact missing in ZIP: ${path}`);
  }

  const acceptanceStatus = stringValue(engineAcceptance?.acceptanceStatus) || null;
  if (
    engineAcceptance &&
    !["accepted", "blocked", "pending_review"].includes(acceptanceStatus)
  ) {
    errors.push(`engine acceptance status mismatch: ${acceptanceStatus}`);
  }

  const reviewFingerprints = Array.isArray(engineAcceptance?.reviewFingerprints)
    ? engineAcceptance.reviewFingerprints
    : [];
  const reviewCount = numberValue(engineAcceptance?.reviewCount) ?? 0;
  if (engineAcceptance && reviewCount !== reviewFingerprints.length) {
    errors.push(
      `engine acceptance reviewCount mismatch: expected ${reviewFingerprints.length}, got ${reviewCount}`,
    );
  }

  const binaryCount = numberValue(engineAcceptance?.binaryCount) ?? 0;
  const availableBinaryCount = numberValue(engineAcceptance?.availableBinaryCount) ?? 0;
  const missingBinaryCount = numberValue(engineAcceptance?.missingBinaryCount) ?? 0;
  if (engineAcceptance && binaryCount !== availableBinaryCount + missingBinaryCount) {
    errors.push(
      `engine acceptance binary counts mismatch: ${availableBinaryCount}+${missingBinaryCount} != ${binaryCount}`,
    );
  }
  const preflightFingerprint = stringValue(engineAcceptance?.preflightFingerprint);
  const expectedPreflightFingerprint = stringValue(enginePreflight?.preflightFingerprint);
  if (engineAcceptance && expectedPreflightFingerprint && preflightFingerprint !== expectedPreflightFingerprint) {
    errors.push(
      `engine acceptance preflight fingerprint mismatch: expected ${expectedPreflightFingerprint}, got ${preflightFingerprint}`,
    );
  }

  const declaredFingerprint = stringValue(declaredAcceptance?.packageFingerprint);
  const storedFingerprint = stringValue(engineAcceptance?.packageFingerprint);
  if (engineAcceptance && !storedFingerprint) {
    errors.push("engine acceptance missing packageFingerprint");
  } else if (engineAcceptance) {
    const { markdown, csv, json, packageFingerprint, ...fingerprintBody } = engineAcceptance;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== packageFingerprint) {
      errors.push(
        `engine acceptance fingerprint mismatch: expected ${packageFingerprint}, got ${computedFingerprint}`,
      );
    }
    if (declaredFingerprint && declaredFingerprint !== packageFingerprint) {
      errors.push(
        `batch package engineAcceptance fingerprint mismatch: expected ${declaredFingerprint}, got ${packageFingerprint}`,
      );
    }
  }

  return {
    present: Boolean(engineAcceptance),
    acceptanceStatus,
    reviewCount,
  };
}

function validateEngineReviewArtifacts(
  batchPackage,
  engineReviewCatalog,
  byPath,
  manifest,
  externalUploadManifest,
  errors,
) {
  const declaredCatalog = batchPackage?.engineReviewCatalog;
  if (!declaredCatalog) return { catalogPresent: false, rowsChecked: 0 };

  if (!engineReviewCatalog) {
    errors.push("batch package declares engineReviewCatalog but batch/engine-review-catalog.json is missing");
  } else if (engineReviewCatalog.schema !== "railwise.engineering.batch.engineReviewCatalog.v1") {
    errors.push(`engine review catalog schema mismatch: ${engineReviewCatalog.schema}`);
  }

  const requiredPaths = [
    "batch/engine-review-catalog.md",
    "batch/engine-review-catalog.csv",
    "batch/engine-review-catalog.json",
  ];
  for (const { run, runFolder } of archiveRunFolders(batchPackage)) {
    if (!run?.engineReviewCatalog) continue;
    requiredPaths.push(
      `runs/${runFolder}/engine-reviews.json`,
      `runs/${runFolder}/engine-review-catalog.md`,
      `runs/${runFolder}/engine-review-catalog.csv`,
      `runs/${runFolder}/engine-review-catalog.json`,
    );
  }

  validateArchiveAndUploadPaths("engine review", requiredPaths, manifest, externalUploadManifest, errors);
  for (const path of requiredPaths) {
    if (!byPath.has(path)) errors.push(`engine review artifact missing in ZIP: ${path}`);
  }

  const engineReviewRowsChecked = numberValue(engineReviewCatalog?.totalRowCount) ?? 0;
  const reviewCount = numberValue(engineReviewCatalog?.reviewCount) ?? 0;
  if (reviewCount <= 0) errors.push("engine review catalog must contain at least one review");
  if (engineReviewRowsChecked <= 0) errors.push("engine review catalog must contain at least one review row");

  return {
    catalogPresent: Boolean(engineReviewCatalog),
    rowsChecked: engineReviewRowsChecked,
  };
}

function validateArchiveReleaseRecord(
  record,
  csvRows,
  manifest,
  externalUploadManifest,
  report,
  signoff,
  portfolioDashboard,
  crossProjectBaseline,
  crossProjectAutoReview,
  archiveTransferWorkflowTemplate,
  archiveTransferSignatureReceiptUpdate,
  archiveTransferRectificationLedger,
  archiveTransferRectificationClosureUpdate,
  archiveTransferRectificationReissueHistory,
  archiveTransferFinalSignoff,
  archiveTransferFinalSignoffExternalSyncReceipt,
  archiveTransferFinalSignoffExternalSyncRectificationLedger,
  archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate,
  archiveTransferFinalSignoffExternalSyncRectificationReissueHistory,
  archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation,
  archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff,
  archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt,
  archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger,
  archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate,
  archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory,
  archiveTransferFinalAcceptanceRegistration,
  archiveTransferFinalAcceptanceRegistrationReceiptReview,
  archiveTransferFinalAcceptanceRegistrationCrossPlatformReview,
  archiveTransferFinalAcceptanceArchiveDashboard,
  archiveTransferFinalAcceptanceCrossProjectBaseline,
  archiveTransferFinalAcceptanceTrendReport,
  archiveTransferFinalAcceptanceRectificationAggregation,
  archiveTransferFinalAcceptanceRectificationClosureUpdate,
  archiveTransferFinalAcceptanceIngestRiskLedger,
  archiveTransferFinalAcceptanceIngestRiskClosureUpdate,
  archiveTransferFinalAcceptanceIngestRiskReissueHistory,
  archiveTransferFinalAcceptanceIngestRiskFinalSignoff,
  archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview,
  archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview,
  archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate,
  archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage,
  archiveTransferFinalAcceptanceIngestRiskFinalProofPackage,
  archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution,
  archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt,
  archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview,
  archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate,
  archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff,
  archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt,
  archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison,
  archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger,
  archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate,
  slaReminderArchiveIngest,
  slaReminderExternalImportHttpReplayQueue,
  slaReminderExternalImportHttpReplayHistory,
  slaReminderExternalImportReceiptUpdate,
  slaReminderExternalImportFinalReceiptConfirmation,
  slaReminderExternalImportFinalReceiptCrossPlatformReview,
  slaReminderExternalImportFinalReceiptBatchSignoff,
  slaReminderExternalImportFinalReceiptSignoffExternalSyncReceipt,
  slaReminderExternalImportRectificationLedger,
  slaReminderExternalImportRectificationClosureUpdate,
  archiveAcceptanceRemediationRecheckUpdate,
  archiveAcceptanceFinalRegistration,
  errors,
) {
  if (!record) return;
  if (record.schema !== "railwise.engineering.batch.archiveReleaseRecord.v1") {
    errors.push(`archive release record schema mismatch: ${record.schema}`);
  }
  const validStatuses = new Set(["draft", "released", "released_with_actions", "blocked"]);
  const releaseStatus = stringValue(record.releaseStatus);
  if (!validStatuses.has(releaseStatus)) {
    errors.push(`archive release record invalid releaseStatus: ${releaseStatus}`);
  }
  const releaseVersion = stringValue(record.releaseVersion);
  if (!releaseVersion) {
    errors.push("archive release record missing releaseVersion");
  }
  if (!Array.isArray(record.rows) || record.rows.length === 0) {
    errors.push("archive release record rows must not be empty");
  }
  if (csvRows.length === 0) {
    errors.push("archive release record CSV must not be empty");
  } else if (Array.isArray(record.rows) && csvRows.length !== record.rows.length) {
    errors.push(
      `archive release record CSV row count mismatch: expected ${record.rows.length}, got ${csvRows.length}`,
    );
  }

  const manifestPaths = manifestEntryPaths(manifest);
  for (const requiredPath of [
    "batch/archive-release-record.json",
    "batch/archive-release-record.csv",
  ]) {
    if (!manifestPaths.includes(requiredPath)) {
      errors.push(`archive manifest missing release record entry: ${requiredPath}`);
    }
  }

  const externalFingerprint = stringValue(externalUploadManifest?.manifestFingerprint);
  const recordExternalFingerprint = stringValue(record.externalUploadManifestFingerprint);
  if (
    externalFingerprint &&
    recordExternalFingerprint &&
    externalFingerprint !== recordExternalFingerprint
  ) {
    errors.push(
      `archive release record external manifest fingerprint mismatch: expected ${externalFingerprint}, got ${recordExternalFingerprint}`,
    );
  }
  const reportFingerprint = stringValue(report?.archiveInspectionFingerprint);
  const recordReportFingerprint = stringValue(record.archiveInspectionFingerprint);
  if (
    reportFingerprint &&
    recordReportFingerprint &&
    reportFingerprint !== recordReportFingerprint
  ) {
    errors.push(
      `archive release record inspection fingerprint mismatch: expected ${reportFingerprint}, got ${recordReportFingerprint}`,
    );
  }
  const signoffFingerprint = stringValue(signoff?.signoffFingerprint);
  const recordSignoffFingerprint = stringValue(record.archiveInspectionSignoffFingerprint);
  if (
    signoffFingerprint &&
    recordSignoffFingerprint &&
    signoffFingerprint !== recordSignoffFingerprint
  ) {
    errors.push(
      `archive release record signoff fingerprint mismatch: expected ${signoffFingerprint}, got ${recordSignoffFingerprint}`,
    );
  }

  const requiredArtifactKeys = [
    "batch_package",
    "audit_report",
    "external_upload_manifest",
    "archive_inspection_report",
    "archive_inspection_signoff",
  ];
  const rowKeys = Array.isArray(record.rows)
    ? record.rows.map((row) => stringValue(row.artifactKey)).filter(Boolean)
    : [];
  for (const key of requiredArtifactKeys) {
    if (!rowKeys.includes(key)) {
      errors.push(`archive release record missing artifact row: ${key}`);
    }
  }
  const optionalArtifactSpecs = [
    portfolioDashboard
      ? {
          key: "archive_release_portfolio_dashboard",
          path: "batch/archive-release-portfolio-dashboard.json",
          fingerprint: stringValue(portfolioDashboard.dashboardFingerprint),
        }
      : null,
    crossProjectBaseline
      ? {
          key: "archive_release_cross_project_baseline",
          path: "batch/archive-release-cross-project-baseline.json",
          fingerprint: stringValue(crossProjectBaseline.comparisonFingerprint),
        }
      : null,
    crossProjectAutoReview
      ? {
          key: "archive_release_cross_project_auto_review",
          path: "batch/archive-release-cross-project-auto-review.json",
          fingerprint: stringValue(crossProjectAutoReview.reviewFingerprint),
        }
      : null,
    archiveTransferWorkflowTemplate
      ? {
          key: "archive_transfer_workflow_template",
          path: "batch/archive-transfer-workflow-template.json",
          fingerprint: stringValue(archiveTransferWorkflowTemplate.templateFingerprint),
        }
      : null,
    archiveTransferSignatureReceiptUpdate
      ? {
          key: "archive_transfer_signature_receipt_update",
          path: "batch/archive-transfer-signature-receipt-update.json",
          fingerprint: stringValue(archiveTransferSignatureReceiptUpdate.updateFingerprint),
        }
      : null,
    archiveTransferRectificationLedger
      ? {
          key: "archive_transfer_rectification_ledger",
          path: "batch/archive-transfer-rectification-ledger.json",
          fingerprint: stringValue(archiveTransferRectificationLedger.ledgerFingerprint),
        }
      : null,
    archiveTransferRectificationClosureUpdate
      ? {
          key: "archive_transfer_rectification_closure_update",
          path: "batch/archive-transfer-rectification-closure-update.json",
          fingerprint: stringValue(archiveTransferRectificationClosureUpdate.updateFingerprint),
        }
      : null,
    archiveTransferRectificationReissueHistory
      ? {
          key: "archive_transfer_rectification_reissue_history",
          path: "batch/archive-transfer-rectification-reissue-history.json",
          fingerprint: stringValue(archiveTransferRectificationReissueHistory.historyFingerprint),
        }
      : null,
    archiveTransferFinalSignoff
      ? {
          key: "archive_transfer_final_signoff",
          path: "batch/archive-transfer-final-signoff.json",
          fingerprint: stringValue(archiveTransferFinalSignoff.signoffFingerprint),
        }
      : null,
    archiveTransferFinalSignoffExternalSyncReceipt
      ? {
          key: "archive_transfer_final_signoff_external_sync_receipt",
          path: "batch/archive-transfer-final-signoff-external-sync-receipt.json",
          fingerprint: stringValue(
            archiveTransferFinalSignoffExternalSyncReceipt.receiptFingerprint,
          ),
        }
      : null,
    archiveTransferFinalSignoffExternalSyncRectificationLedger
      ? {
          key: "archive_transfer_final_signoff_external_sync_rectification_ledger",
          path: "batch/archive-transfer-final-signoff-external-sync-rectification-ledger.json",
          fingerprint: stringValue(
            archiveTransferFinalSignoffExternalSyncRectificationLedger.rectificationFingerprint,
          ),
        }
      : null,
    archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate
      ? {
          key: "archive_transfer_final_signoff_external_sync_rectification_closure_update",
          path: "batch/archive-transfer-final-signoff-external-sync-rectification-closure-update.json",
          fingerprint: stringValue(
            archiveTransferFinalSignoffExternalSyncRectificationClosureUpdate.updateFingerprint,
          ),
        }
      : null,
    archiveTransferFinalSignoffExternalSyncRectificationReissueHistory
      ? {
          key: "archive_transfer_final_signoff_external_sync_rectification_reissue_history",
          path: "batch/archive-transfer-final-signoff-external-sync-rectification-reissue-history.json",
          fingerprint: stringValue(
            archiveTransferFinalSignoffExternalSyncRectificationReissueHistory.historyFingerprint,
          ),
        }
      : null,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation
      ? {
          key: "archive_transfer_final_signoff_external_sync_rectification_final_confirmation",
          path: "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation.json",
          fingerprint: stringValue(
            archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmation.confirmationFingerprint,
          ),
        }
      : null,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff
      ? {
          key: "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff",
          path: "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff.json",
          fingerprint: stringValue(
            archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoff.signoffFingerprint,
          ),
        }
      : null,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt
      ? {
          key: "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_receipt",
          path: "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-receipt.json",
          fingerprint: stringValue(
            archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncReceipt.receiptFingerprint,
          ),
        }
      : null,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger
      ? {
          key: "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_ledger",
          path: "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-ledger.json",
          fingerprint: stringValue(
            archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationLedger.rectificationFingerprint,
          ),
        }
      : null,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate
      ? {
          key: "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_closure_update",
          path: "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-closure-update.json",
          fingerprint: stringValue(
            archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate.updateFingerprint,
          ),
        }
      : null,
    archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory
      ? {
          key: "archive_transfer_final_signoff_external_sync_rectification_final_confirmation_batch_signoff_external_sync_rectification_reissue_history",
          path: "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-reissue-history.json",
          fingerprint: stringValue(
            archiveTransferFinalSignoffExternalSyncRectificationFinalConfirmationBatchSignoffExternalSyncRectificationReissueHistory.historyFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceRegistration
      ? {
          key: "archive_transfer_final_acceptance_registration",
          path: "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceRegistration.registrationFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceRegistrationReceiptReview
      ? {
          key: "archive_transfer_final_acceptance_registration_receipt_review",
          path: "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-receipt-review.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceRegistrationReceiptReview.reviewFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceRegistrationCrossPlatformReview
      ? {
          key: "archive_transfer_final_acceptance_registration_cross_platform_review",
          path: "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-cross-platform-review.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceRegistrationCrossPlatformReview.reviewFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceArchiveDashboard
      ? {
          key: "archive_transfer_final_acceptance_archive_dashboard",
          path: "batch/archive-transfer-final-acceptance-archive-dashboard.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceArchiveDashboard.dashboardFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceCrossProjectBaseline
      ? {
          key: "archive_transfer_final_acceptance_cross_project_baseline",
          path: "batch/archive-transfer-final-acceptance-cross-project-baseline.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceCrossProjectBaseline.baselineFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceTrendReport
      ? {
          key: "archive_transfer_final_acceptance_trend_report",
          path: "batch/archive-transfer-final-acceptance-trend-report.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceTrendReport.trendFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceRectificationAggregation
      ? {
          key: "archive_transfer_final_acceptance_rectification_aggregation",
          path: "batch/archive-transfer-final-acceptance-rectification-aggregation.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceRectificationAggregation.aggregationFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceRectificationClosureUpdate
      ? {
          key: "archive_transfer_final_acceptance_rectification_closure_update",
          path: "batch/archive-transfer-final-acceptance-rectification-closure-update.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceRectificationClosureUpdate.updateFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskLedger
      ? {
          key: "archive_transfer_final_acceptance_ingest_risk_ledger",
          path: "batch/archive-transfer-final-acceptance-ingest-risk-ledger.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskLedger.ledgerFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskClosureUpdate
      ? {
          key: "archive_transfer_final_acceptance_ingest_risk_closure_update",
          path: "batch/archive-transfer-final-acceptance-ingest-risk-closure-update.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskClosureUpdate.updateFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskReissueHistory
      ? {
          key: "archive_transfer_final_acceptance_ingest_risk_reissue_history",
          path: "batch/archive-transfer-final-acceptance-ingest-risk-reissue-history.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskReissueHistory.historyFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalSignoff
      ? {
          key: "archive_transfer_final_acceptance_ingest_risk_final_signoff",
          path: "batch/archive-transfer-final-acceptance-ingest-risk-final-signoff.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalSignoff.signoffFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview
      ? {
          key: "archive_transfer_final_acceptance_ingest_risk_final_receipt_review",
          path: "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-review.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview.reviewFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview
      ? {
          key:
            "archive_transfer_final_acceptance_ingest_risk_final_receipt_cross_platform_review",
          path:
            "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-cross-platform-review.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview.reviewFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate
      ? {
          key: "archive_transfer_final_acceptance_ingest_risk_final_consistency_gate",
          path:
            "batch/archive-transfer-final-acceptance-ingest-risk-final-consistency-gate.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate.gateFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage
      ? {
          key:
            "archive_transfer_final_acceptance_ingest_risk_final_receipt_evidence_package",
          path:
            "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-evidence-package.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage.packageFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackage
      ? {
          key: "archive_transfer_final_acceptance_ingest_risk_final_proof_package",
          path:
            "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.proofFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution
      ? {
          key:
            "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution",
          path:
            "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution.distributionFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt
      ? {
          key:
            "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution_receipt",
          path:
            "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-receipt.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt.receiptFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview
      ? {
          key:
            "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution_cross_platform_review",
          path:
            "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-cross-platform-review.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview.reviewFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate
      ? {
          key:
            "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution_release_gate",
          path:
            "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate.gateFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff
      ? {
          key:
            "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution_release_gate_batch_signoff",
          path:
            "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff.signoffFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt
      ? {
          key:
            "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution_release_gate_batch_signoff_external_sync_receipt",
          path:
            "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff-external-sync-receipt.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt.receiptFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison
      ? {
          key:
            "archive_transfer_final_acceptance_ingest_risk_final_proof_package_version_comparison",
          path:
            "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-version-comparison.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison.comparisonFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger
      ? {
          key:
            "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution_rectification_ledger",
          path:
            "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-ledger.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger.ledgerFingerprint,
          ),
        }
      : null,
    archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate
      ? {
          key:
            "archive_transfer_final_acceptance_ingest_risk_final_proof_package_distribution_rectification_closure_update",
          path:
            "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-closure-update.json",
          fingerprint: stringValue(
            archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate.updateFingerprint,
          ),
        }
      : null,
    slaReminderArchiveIngest
      ? {
          key: "archive_release_sla_reminder_ingest",
          path: "batch/archive-release-sla-reminder-ingest.json",
          fingerprint: stringValue(slaReminderArchiveIngest.ingestFingerprint),
        }
      : null,
    slaReminderExternalImportHttpReplayQueue
      ? {
          key: "archive_release_sla_reminder_external_import_http_replay_queue",
          path: "batch/archive-release-sla-reminder-external-import-http-replay-queue.json",
          fingerprint: stringValue(slaReminderExternalImportHttpReplayQueue.replayQueueFingerprint),
        }
      : null,
    slaReminderExternalImportHttpReplayHistory
      ? {
          key: "archive_release_sla_reminder_external_import_http_replay_history",
          path: "batch/archive-release-sla-reminder-external-import-http-replay-history.json",
          fingerprint: stringValue(slaReminderExternalImportHttpReplayHistory.historyFingerprint),
        }
      : null,
    slaReminderExternalImportReceiptUpdate
      ? {
          key: "archive_release_sla_reminder_external_import_receipt_update",
          path: "batch/archive-release-sla-reminder-external-import-receipt-update.json",
          fingerprint: stringValue(slaReminderExternalImportReceiptUpdate.updateFingerprint),
        }
      : null,
    slaReminderExternalImportFinalReceiptConfirmation
      ? {
          key: "archive_release_sla_reminder_external_import_final_receipt_confirmation",
          path: "batch/archive-release-sla-reminder-external-import-final-receipt-confirmation.json",
          fingerprint: stringValue(
            slaReminderExternalImportFinalReceiptConfirmation.confirmationFingerprint,
          ),
        }
      : null,
    slaReminderExternalImportFinalReceiptCrossPlatformReview
      ? {
          key: "archive_release_sla_reminder_external_import_final_receipt_cross_platform_review",
          path: "batch/archive-release-sla-reminder-external-import-final-receipt-cross-platform-review.json",
          fingerprint: stringValue(
            slaReminderExternalImportFinalReceiptCrossPlatformReview.reviewFingerprint,
          ),
        }
      : null,
    slaReminderExternalImportFinalReceiptBatchSignoff
      ? {
          key: "archive_release_sla_reminder_external_import_final_receipt_batch_signoff",
          path: "batch/archive-release-sla-reminder-external-import-final-receipt-batch-signoff.json",
          fingerprint: stringValue(
            slaReminderExternalImportFinalReceiptBatchSignoff.signoffFingerprint,
          ),
        }
      : null,
    slaReminderExternalImportFinalReceiptSignoffExternalSyncReceipt
      ? {
          key: "archive_release_sla_reminder_external_import_final_receipt_signoff_external_sync_receipt",
          path: "batch/archive-release-sla-reminder-external-import-final-receipt-signoff-external-sync-receipt.json",
          fingerprint: stringValue(
            slaReminderExternalImportFinalReceiptSignoffExternalSyncReceipt.receiptFingerprint,
          ),
        }
      : null,
    slaReminderExternalImportRectificationLedger
      ? {
          key: "archive_release_sla_reminder_external_import_rectification_ledger",
          path: "batch/archive-release-sla-reminder-external-import-rectification-ledger.json",
          fingerprint: stringValue(
            slaReminderExternalImportRectificationLedger.rectificationFingerprint,
          ),
        }
      : null,
    slaReminderExternalImportRectificationClosureUpdate
      ? {
          key: "archive_release_sla_reminder_external_import_rectification_closure_update",
          path: "batch/archive-release-sla-reminder-external-import-rectification-closure-update.json",
          fingerprint: stringValue(
            slaReminderExternalImportRectificationClosureUpdate.closureFingerprint,
          ),
        }
      : null,
    archiveAcceptanceRemediationRecheckUpdate
      ? {
          key: "archive_acceptance_remediation_recheck_update",
          path: "batch/archive-acceptance-remediation-recheck-update.json",
          fingerprint: stringValue(archiveAcceptanceRemediationRecheckUpdate.updateFingerprint),
        }
      : null,
    archiveAcceptanceFinalRegistration
      ? {
          key: "archive_acceptance_final_registration",
          path: "batch/archive-acceptance-final-registration.json",
          fingerprint: stringValue(archiveAcceptanceFinalRegistration.registrationFingerprint),
        }
      : null,
  ].filter(Boolean);
  const rows = Array.isArray(record.rows) ? record.rows : [];
  for (const spec of optionalArtifactSpecs) {
    const row = rows.find((item) => stringValue(item.artifactKey) === spec.key);
    if (!row) {
      errors.push(`archive release record missing optional artifact row: ${spec.key}`);
      continue;
    }
    if (stringValue(row.artifactPath) !== spec.path) {
      errors.push(
        `archive release record optional artifact path mismatch for ${spec.key}: ${stringValue(row.artifactPath)}`,
      );
    }
    if (spec.fingerprint && stringValue(row.fingerprint) !== spec.fingerprint) {
      errors.push(
        `archive release record optional artifact fingerprint mismatch for ${spec.key}: expected ${spec.fingerprint}, got ${stringValue(row.fingerprint)}`,
      );
    }
  }

  const storedFingerprint = stringValue(record.releaseFingerprint);
  if (!storedFingerprint) {
    errors.push("archive release record missing releaseFingerprint");
  } else {
    const { releaseFingerprint, ...fingerprintBody } = record;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== releaseFingerprint) {
      errors.push(
        `archive release record fingerprint mismatch: expected ${releaseFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveReleaseDeliveryReadiness(
  readiness,
  csvRows,
  releaseRecord,
  externalUploadManifest,
  archiveInspectionReport,
  archiveInspectionSignoff,
  finalConfirmation,
  finalConfirmationBatchSignoff,
  finalConfirmationBatchSignoffExternalSyncReceipt,
  finalConfirmationBatchSignoffExternalSyncRectificationLedger,
  finalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate,
  manifest,
  errors,
) {
  if (!readiness) return;
  if (readiness.schema !== "railwise.engineering.batch.archiveReleaseDeliveryReadiness.v1") {
    errors.push(`archive release delivery readiness schema mismatch: ${readiness.schema}`);
  }
  const rows = Array.isArray(readiness.rows) ? readiness.rows : [];
  if (!Array.isArray(readiness.rows)) {
    errors.push("archive release delivery readiness rows must be an array");
  } else if (csvRows.length !== readiness.rows.length) {
    errors.push(
      `archive release delivery readiness CSV row count mismatch: expected ${readiness.rows.length}, got ${csvRows.length}`,
    );
  }
  const readyCheckpointCount = rows.filter(
    (row) => stringValue(row.readinessStatus) === "ready",
  ).length;
  const actionRequiredCheckpointCount = rows.filter(
    (row) => stringValue(row.readinessStatus) === "action_required",
  ).length;
  const missingCheckpointCount = rows.filter(
    (row) => stringValue(row.readinessStatus) === "missing",
  ).length;
  const requiredCheckpointCount = rows.filter((row) => Boolean(row.required)).length;
  const countChecks = [
    ["readyCheckpointCount", readyCheckpointCount],
    ["actionRequiredCheckpointCount", actionRequiredCheckpointCount],
    ["missingCheckpointCount", missingCheckpointCount],
    ["requiredCheckpointCount", requiredCheckpointCount],
  ];
  for (const [field, expected] of countChecks) {
    if (Number(readiness[field]) !== expected) {
      errors.push(
        `archive release delivery readiness ${field} mismatch: expected ${expected}, got ${readiness[field]}`,
      );
    }
  }
  if (
    releaseRecord &&
    stringValue(readiness.releaseFingerprint) !== stringValue(releaseRecord.releaseFingerprint)
  ) {
    errors.push(
      `archive release delivery readiness release fingerprint mismatch: expected ${stringValue(releaseRecord.releaseFingerprint)}, got ${stringValue(readiness.releaseFingerprint)}`,
    );
  }
  if (
    externalUploadManifest &&
    stringValue(readiness.externalUploadManifestFingerprint) !==
      stringValue(externalUploadManifest.manifestFingerprint)
  ) {
    errors.push(
      `archive release delivery readiness external upload fingerprint mismatch: expected ${stringValue(externalUploadManifest.manifestFingerprint)}, got ${stringValue(readiness.externalUploadManifestFingerprint)}`,
    );
  }
  if (
    archiveInspectionReport &&
    stringValue(readiness.archiveInspectionFingerprint) !==
      stringValue(archiveInspectionReport.archiveInspectionFingerprint)
  ) {
    errors.push(
      `archive release delivery readiness inspection fingerprint mismatch: expected ${stringValue(archiveInspectionReport.archiveInspectionFingerprint)}, got ${stringValue(readiness.archiveInspectionFingerprint)}`,
    );
  }
  if (
    archiveInspectionSignoff &&
    stringValue(readiness.archiveInspectionSignoffFingerprint) !==
      stringValue(archiveInspectionSignoff.signoffFingerprint)
  ) {
    errors.push(
      `archive release delivery readiness signoff fingerprint mismatch: expected ${stringValue(archiveInspectionSignoff.signoffFingerprint)}, got ${stringValue(readiness.archiveInspectionSignoffFingerprint)}`,
    );
  }
  const rowByCheckpoint = new Map(rows.map((row) => [stringValue(row.checkpointId), row]));
  const expectedRows = [
    [
      "release_record",
      "batch/archive-release-record.json",
      stringValue(releaseRecord?.releaseFingerprint),
    ],
    [
      "external_upload_manifest",
      "batch/external-upload-manifest.json",
      stringValue(externalUploadManifest?.manifestFingerprint),
    ],
    [
      "archive_inspection_report",
      "audit/archive-inspection-report.json",
      stringValue(archiveInspectionReport?.archiveInspectionFingerprint),
    ],
    [
      "archive_inspection_signoff",
      "audit/archive-inspection-signoff.json",
      stringValue(archiveInspectionSignoff?.signoffFingerprint),
    ],
  ];
  if (finalConfirmation) {
    expectedRows.push([
      "archive_transfer_final_confirmation",
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation.json",
      stringValue(finalConfirmation.confirmationFingerprint),
    ]);
  }
  if (finalConfirmationBatchSignoff) {
    expectedRows.push([
      "archive_transfer_final_confirmation_batch_signoff",
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff.json",
      stringValue(finalConfirmationBatchSignoff.signoffFingerprint),
    ]);
  }
  if (finalConfirmationBatchSignoffExternalSyncReceipt) {
    expectedRows.push([
      "archive_transfer_final_confirmation_batch_signoff_external_sync_receipt",
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-receipt.json",
      stringValue(finalConfirmationBatchSignoffExternalSyncReceipt.receiptFingerprint),
    ]);
  }
  if (finalConfirmationBatchSignoffExternalSyncRectificationLedger) {
    expectedRows.push([
      "archive_transfer_final_confirmation_batch_signoff_external_sync_rectification_ledger",
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-ledger.json",
      stringValue(finalConfirmationBatchSignoffExternalSyncRectificationLedger.rectificationFingerprint),
    ]);
  }
  if (finalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate) {
    expectedRows.push([
      "archive_transfer_final_confirmation_batch_signoff_external_sync_rectification_closure_update",
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-confirmation-batch-signoff-external-sync-rectification-closure-update.json",
      stringValue(finalConfirmationBatchSignoffExternalSyncRectificationClosureUpdate.updateFingerprint),
    ]);
  }
  for (const [checkpointId, expectedPath, expectedFingerprint] of expectedRows) {
    const row = rowByCheckpoint.get(checkpointId);
    if (!row) {
      errors.push(`archive release delivery readiness missing checkpoint row: ${checkpointId}`);
      continue;
    }
    if (stringValue(row.artifactPath) !== expectedPath) {
      errors.push(
        `archive release delivery readiness checkpoint path mismatch for ${checkpointId}: expected ${expectedPath}, got ${stringValue(row.artifactPath)}`,
      );
    }
    if (expectedFingerprint && stringValue(row.sourceFingerprint) !== expectedFingerprint) {
      errors.push(
        `archive release delivery readiness checkpoint fingerprint mismatch for ${checkpointId}: expected ${expectedFingerprint}, got ${stringValue(row.sourceFingerprint)}`,
      );
    }
  }
  const expectedOverallStatus =
    stringValue(readiness.releaseStatus) === "blocked" ||
    stringValue(readiness.releaseStatus) === "draft" ||
    missingCheckpointCount > 0
      ? "blocked"
      : stringValue(readiness.releaseStatus) === "released_with_actions" ||
          actionRequiredCheckpointCount > 0
        ? "handover_with_actions"
        : "ready_for_handover";
  if (stringValue(readiness.overallStatus) !== expectedOverallStatus) {
    errors.push(
      `archive release delivery readiness overall status mismatch: expected ${expectedOverallStatus}, got ${stringValue(readiness.overallStatus)}`,
    );
  }
  const paths = [
    "batch/archive-release-delivery-readiness.md",
    "batch/archive-release-delivery-readiness.csv",
    "batch/archive-release-delivery-readiness.json",
  ];
  const manifestPaths = manifestEntryPaths(manifest);
  for (const path of paths) {
    if (!manifestPaths.includes(path)) {
      errors.push(`archive manifest missing archive release delivery readiness entry: ${path}`);
    }
  }
  const storedFingerprint = stringValue(readiness.readinessFingerprint);
  if (!storedFingerprint) {
    errors.push("archive release delivery readiness missing readinessFingerprint");
  } else {
    const { markdown, csv, json, readinessFingerprint, ...fingerprintBody } = readiness;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== readinessFingerprint) {
      errors.push(
        `archive release delivery readiness fingerprint mismatch: expected ${readinessFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveAcceptanceRemediationRecheckUpdate(
  update,
  csvRows,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!update) return;
  if (update.schema !== "railwise.engineeringArchive.acceptanceRemediationRecheckUpdate.v1") {
    errors.push(`archive acceptance remediation recheck update schema mismatch: ${update.schema}`);
  }
  const rows = Array.isArray(update.rows) ? update.rows : [];
  if (!Array.isArray(update.rows)) {
    errors.push("archive acceptance remediation recheck update rows must be an array");
  } else if (csvRows.length !== update.rows.length) {
    errors.push(
      `archive acceptance remediation recheck update CSV row count mismatch: expected ${update.rows.length}, got ${csvRows.length}`,
    );
  }
  const stillOpenCount = rows.filter((row) => stringValue(row.updateStatus) !== "closed").length;
  if (Number(update.stillOpenCount) !== stillOpenCount) {
    errors.push(
      `archive acceptance remediation recheck update stillOpenCount mismatch: expected ${stillOpenCount}, got ${update.stillOpenCount}`,
    );
  }
  const closedCount = rows.filter((row) => stringValue(row.updateStatus) === "closed").length;
  if (Number(update.closedCount) !== closedCount) {
    errors.push(
      `archive acceptance remediation recheck update closedCount mismatch: expected ${closedCount}, got ${update.closedCount}`,
    );
  }
  if (
    Boolean(update.recheckReadyForArchive) !==
    (stringValue(update.recheckDecision) === "accept" && stillOpenCount === 0)
  ) {
    errors.push(
      "archive acceptance remediation recheck update recheckReadyForArchive is inconsistent with decision and open rows",
    );
  }
  const paths = [
    "batch/archive-acceptance-remediation-recheck-update.md",
    "batch/archive-acceptance-remediation-recheck-update.csv",
    "batch/archive-acceptance-remediation-recheck-update.json",
  ];
  validateArtifactCoverage(
    paths,
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive acceptance remediation recheck update",
    errors,
  );
  const storedFingerprint = stringValue(update.updateFingerprint);
  if (!storedFingerprint) {
    errors.push("archive acceptance remediation recheck update missing updateFingerprint");
  } else {
    const { markdown, csv, json, updateFingerprint, ...fingerprintBody } = update;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== updateFingerprint) {
      errors.push(
        `archive acceptance remediation recheck update fingerprint mismatch: expected ${updateFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveAcceptanceFinalRegistration(
  registration,
  csvRows,
  recheckUpdate,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!registration) return;
  if (registration.schema !== "railwise.engineeringArchive.acceptanceFinalRegistration.v1") {
    errors.push(`archive acceptance final registration schema mismatch: ${registration.schema}`);
  }
  const status = stringValue(registration.registrationStatus);
  if (!["registered", "blocked"].includes(status)) {
    errors.push(`archive acceptance final registration invalid registrationStatus: ${status}`);
  }
  const rows = Array.isArray(registration.finalIndexRows) ? registration.finalIndexRows : [];
  if (!Array.isArray(registration.finalIndexRows)) {
    errors.push("archive acceptance final registration finalIndexRows must be an array");
  } else if (csvRows.length !== registration.finalIndexRows.length) {
    errors.push(
      `archive acceptance final registration CSV row count mismatch: expected ${registration.finalIndexRows.length}, got ${csvRows.length}`,
    );
  }
  const recheckFingerprint = stringValue(recheckUpdate?.updateFingerprint);
  if (
    recheckFingerprint &&
    stringValue(registration.sourceRecheckUpdateFingerprint) !== recheckFingerprint
  ) {
    errors.push(
      `archive acceptance final registration recheck fingerprint mismatch: expected ${recheckFingerprint}, got ${stringValue(registration.sourceRecheckUpdateFingerprint)}`,
    );
  }
  const recheckedAcceptanceFingerprint = stringValue(recheckUpdate?.recheckedAcceptanceFingerprint);
  if (
    recheckedAcceptanceFingerprint &&
    stringValue(registration.sourceAcceptanceFingerprint) !== recheckedAcceptanceFingerprint
  ) {
    errors.push(
      `archive acceptance final registration acceptance fingerprint mismatch: expected ${recheckedAcceptanceFingerprint}, got ${stringValue(registration.sourceAcceptanceFingerprint)}`,
    );
  }
  if (status === "registered") {
    if (stringValue(registration.signedReceipt?.signatureStatus) !== "signed") {
      errors.push(
        "archive acceptance final registration registered record must include a signed receipt",
      );
    }
    if (!stringValue(registration.signedReceipt?.signedAt)) {
      errors.push("archive acceptance final registration registered receipt missing signedAt");
    }
  }
  const rowByArtifactKey = new Map(rows.map((row) => [stringValue(row.artifactKey), row]));
  const expectedRows = [
    ["archive_release_record", "batch/archive-release-record.json"],
    ["archive_release_delivery_readiness", "batch/archive-release-delivery-readiness.json"],
    ["archive_acceptance_review", "batch/archive-acceptance-review.json"],
    [
      "archive_acceptance_remediation_recheck_update",
      "batch/archive-acceptance-remediation-recheck-update.json",
    ],
    ["archive_acceptance_final_registration", "batch/archive-acceptance-final-registration.json"],
  ];
  for (const [artifactKey, artifactPath] of expectedRows) {
    const row = rowByArtifactKey.get(artifactKey);
    if (!row) {
      errors.push(`archive acceptance final registration missing final index row: ${artifactKey}`);
      continue;
    }
    if (stringValue(row.artifactPath) !== artifactPath) {
      errors.push(
        `archive acceptance final registration final index path mismatch for ${artifactKey}: expected ${artifactPath}, got ${stringValue(row.artifactPath)}`,
      );
    }
    if (stringValue(row.acceptanceStatus) !== status) {
      errors.push(
        `archive acceptance final registration final index status mismatch for ${artifactKey}: expected ${status}, got ${stringValue(row.acceptanceStatus)}`,
      );
    }
  }
  const paths = [
    "batch/archive-acceptance-final-registration.md",
    "batch/archive-acceptance-final-registration.csv",
    "batch/archive-acceptance-final-registration.json",
  ];
  validateArtifactCoverage(
    paths,
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive acceptance final registration",
    errors,
  );
  const storedFingerprint = stringValue(registration.registrationFingerprint);
  if (!storedFingerprint) {
    errors.push("archive acceptance final registration missing registrationFingerprint");
  } else {
    const { markdown, csv, json, registrationFingerprint, ...fingerprintBody } = registration;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== registrationFingerprint) {
      errors.push(
        `archive acceptance final registration fingerprint mismatch: expected ${registrationFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceRegistration(
  registration,
  csvRows,
  sourceHistory,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!registration) return;
  if (
    registration.schema !==
    "railwise.engineering.batch.archiveTransferFinalSignoffExternalSyncRectificationFinalAcceptanceRegistration.v1"
  ) {
    errors.push(`archive transfer final acceptance registration schema mismatch: ${registration.schema}`);
  }
  const status = stringValue(registration.registrationStatus);
  if (!["registered", "blocked"].includes(status)) {
    errors.push(`archive transfer final acceptance registration invalid registrationStatus: ${status}`);
  }
  const rows = Array.isArray(registration.finalIndexRows) ? registration.finalIndexRows : [];
  if (!Array.isArray(registration.finalIndexRows)) {
    errors.push("archive transfer final acceptance registration finalIndexRows must be an array");
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance registration CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  const sourceHistoryFingerprint = stringValue(sourceHistory?.historyFingerprint);
  if (
    sourceHistoryFingerprint &&
    stringValue(registration.sourceHistoryFingerprint) !== sourceHistoryFingerprint
  ) {
    errors.push(
      `archive transfer final acceptance registration history fingerprint mismatch: expected ${sourceHistoryFingerprint}, got ${stringValue(registration.sourceHistoryFingerprint)}`,
    );
  }
  const finalLedgerFingerprint = stringValue(sourceHistory?.finalLedgerFingerprint);
  if (
    finalLedgerFingerprint &&
    stringValue(registration.finalLedgerFingerprint) !== finalLedgerFingerprint
  ) {
    errors.push(
      `archive transfer final acceptance registration final ledger fingerprint mismatch: expected ${finalLedgerFingerprint}, got ${stringValue(registration.finalLedgerFingerprint)}`,
    );
  }
  if (status === "registered") {
    if (numberValue(registration.finalOpenCount) !== 0) {
      errors.push(
        `archive transfer final acceptance registration is registered but finalOpenCount is ${numberValue(registration.finalOpenCount)}`,
      );
    }
    if (stringValue(registration.signedReceipt?.signatureStatus) !== "signed") {
      errors.push("archive transfer final acceptance registration registered without signed receipt");
    }
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration.md",
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration.csv",
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance registration",
    errors,
  );
  const registrationFingerprint = stringValue(registration.registrationFingerprint);
  if (!registrationFingerprint) {
    errors.push("archive transfer final acceptance registration missing registrationFingerprint");
  } else {
    const { markdown, csv, json, registrationFingerprint: _registrationFingerprint, ...fingerprintBody } =
      registration;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== registrationFingerprint) {
      errors.push(
        `archive transfer final acceptance registration fingerprint mismatch: expected ${registrationFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceRegistrationReceiptReview(
  review,
  csvRows,
  registration,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!review) return;
  if (
    review.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceRegistrationReceiptReview.v1"
  ) {
    errors.push(`archive transfer final acceptance receipt review schema mismatch: ${review.schema}`);
  }
  const validStatuses = ["accepted", "rejected", "pending", "missing_receipt", "unmatched_receipt"];
  const reviewStatus = stringValue(review.reviewStatus);
  if (!validStatuses.includes(reviewStatus)) {
    errors.push(`archive transfer final acceptance receipt review invalid reviewStatus: ${reviewStatus}`);
  }
  const rows = Array.isArray(review.rows) ? review.rows : [];
  if (!Array.isArray(review.rows)) {
    errors.push("archive transfer final acceptance receipt review rows must be an array");
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance receipt review CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  const registrationFingerprint = stringValue(registration?.registrationFingerprint);
  if (
    registrationFingerprint &&
    stringValue(review.sourceRegistrationFingerprint) !== registrationFingerprint
  ) {
    errors.push(
      `archive transfer final acceptance receipt review registration fingerprint mismatch: expected ${registrationFingerprint}, got ${stringValue(review.sourceRegistrationFingerprint)}`,
    );
  }
  if (registration?.registrationId && stringValue(review.registrationId) !== stringValue(registration.registrationId)) {
    errors.push(
      `archive transfer final acceptance receipt review registrationId mismatch: expected ${registration.registrationId}, got ${stringValue(review.registrationId)}`,
    );
  }
  const counted = {
    accepted: rows.filter((row) => stringValue(row.reconciliationStatus) === "accepted").length,
    rejected: rows.filter((row) => stringValue(row.reconciliationStatus) === "rejected").length,
    pending: rows.filter((row) => stringValue(row.reconciliationStatus) === "pending").length,
    missing: rows.filter((row) => stringValue(row.reconciliationStatus) === "missing_receipt").length,
    unmatched: rows.filter((row) => stringValue(row.reconciliationStatus) === "unmatched_receipt").length,
  };
  if (numberValue(review.acceptedCount) !== counted.accepted) {
    errors.push("archive transfer final acceptance receipt review acceptedCount mismatch");
  }
  if (numberValue(review.rejectedCount) !== counted.rejected) {
    errors.push("archive transfer final acceptance receipt review rejectedCount mismatch");
  }
  if (numberValue(review.pendingCount) !== counted.pending) {
    errors.push("archive transfer final acceptance receipt review pendingCount mismatch");
  }
  if (numberValue(review.missingReceiptCount) !== counted.missing) {
    errors.push("archive transfer final acceptance receipt review missingReceiptCount mismatch");
  }
  if (numberValue(review.unmatchedReceiptCount) !== counted.unmatched) {
    errors.push("archive transfer final acceptance receipt review unmatchedReceiptCount mismatch");
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-receipt-review.md",
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-receipt-review.csv",
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-receipt-review.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance receipt review",
    errors,
  );
  const reviewFingerprint = stringValue(review.reviewFingerprint);
  if (!reviewFingerprint) {
    errors.push("archive transfer final acceptance receipt review missing reviewFingerprint");
  } else {
    const { markdown, csv, json, reviewFingerprint: _reviewFingerprint, ...fingerprintBody } = review;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== reviewFingerprint) {
      errors.push(
        `archive transfer final acceptance receipt review fingerprint mismatch: expected ${reviewFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceRegistrationCrossPlatformReview(
  review,
  csvRows,
  registration,
  receiptReview,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!review) return;
  if (
    review.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceRegistrationCrossPlatformReview.v1"
  ) {
    errors.push(
      `archive transfer final acceptance cross-platform review schema mismatch: ${review.schema}`,
    );
  }
  const validStatuses = ["passed", "needs_review"];
  const reviewStatus = stringValue(review.reviewStatus);
  if (!validStatuses.includes(reviewStatus)) {
    errors.push(`archive transfer final acceptance cross-platform review invalid reviewStatus: ${reviewStatus}`);
  }
  const rows = Array.isArray(review.rows) ? review.rows : [];
  if (!Array.isArray(review.rows)) {
    errors.push("archive transfer final acceptance cross-platform review rows must be an array");
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance cross-platform review CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  const registrationFingerprint = stringValue(registration?.registrationFingerprint);
  if (
    registrationFingerprint &&
    stringValue(review.sourceRegistrationFingerprint) !== registrationFingerprint
  ) {
    errors.push(
      `archive transfer final acceptance cross-platform review registration fingerprint mismatch: expected ${registrationFingerprint}, got ${stringValue(review.sourceRegistrationFingerprint)}`,
    );
  }
  if (registration?.registrationId && stringValue(review.registrationId) !== stringValue(registration.registrationId)) {
    errors.push(
      `archive transfer final acceptance cross-platform review registrationId mismatch: expected ${registration.registrationId}, got ${stringValue(review.registrationId)}`,
    );
  }
  const sourceFingerprints = Array.isArray(review.sourceReceiptReviewFingerprints)
    ? review.sourceReceiptReviewFingerprints.map(stringValue).filter(Boolean)
    : [];
  const receiptReviewFingerprint = stringValue(receiptReview?.reviewFingerprint);
  if (receiptReviewFingerprint && !sourceFingerprints.includes(receiptReviewFingerprint)) {
    errors.push(
      `archive transfer final acceptance cross-platform review missing source receipt review fingerprint: ${receiptReviewFingerprint}`,
    );
  }
  if (numberValue(review.platformCount) !== sourceFingerprints.length) {
    errors.push(
      `archive transfer final acceptance cross-platform review platformCount mismatch: expected ${sourceFingerprints.length}, got ${review.platformCount}`,
    );
  }
  if (numberValue(review.registrationCount) !== rows.length) {
    errors.push(
      `archive transfer final acceptance cross-platform review registrationCount mismatch: expected ${rows.length}, got ${review.registrationCount}`,
    );
  }
  const issueCount = rows.filter((row) => Array.isArray(row.issueTypes) && row.issueTypes.length > 0).length;
  const blockingIssueCount = rows.filter((row) => stringValue(row.severity) === "blocking").length;
  const warningIssueCount = rows.filter((row) => stringValue(row.severity) === "warning").length;
  const expectedStatus = issueCount > 0 ? "needs_review" : "passed";
  if (numberValue(review.issueCount) !== issueCount) {
    errors.push(
      `archive transfer final acceptance cross-platform review issueCount mismatch: expected ${issueCount}, got ${review.issueCount}`,
    );
  }
  if (numberValue(review.blockingIssueCount) !== blockingIssueCount) {
    errors.push(
      `archive transfer final acceptance cross-platform review blockingIssueCount mismatch: expected ${blockingIssueCount}, got ${review.blockingIssueCount}`,
    );
  }
  if (numberValue(review.warningIssueCount) !== warningIssueCount) {
    errors.push(
      `archive transfer final acceptance cross-platform review warningIssueCount mismatch: expected ${warningIssueCount}, got ${review.warningIssueCount}`,
    );
  }
  if (reviewStatus !== expectedStatus) {
    errors.push(
      `archive transfer final acceptance cross-platform review status mismatch: expected ${expectedStatus}, got ${reviewStatus}`,
    );
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-cross-platform-review.md",
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-cross-platform-review.csv",
      "batch/archive-transfer-final-signoff-external-sync-rectification-final-acceptance-registration-cross-platform-review.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance cross-platform review",
    errors,
  );
  const reviewFingerprint = stringValue(review.reviewFingerprint);
  if (!reviewFingerprint) {
    errors.push("archive transfer final acceptance cross-platform review missing reviewFingerprint");
  } else {
    const { markdown, csv, json, reviewFingerprint: _reviewFingerprint, ...fingerprintBody } = review;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== reviewFingerprint) {
      errors.push(
        `archive transfer final acceptance cross-platform review fingerprint mismatch: expected ${reviewFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceArchiveDashboard(
  dashboard,
  csvRows,
  registration,
  receiptReview,
  crossPlatformReview,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!dashboard) return;
  if (
    dashboard.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceArchiveDashboard.v1"
  ) {
    errors.push(
      `archive transfer final acceptance archive dashboard schema mismatch: ${dashboard.schema}`,
    );
  }
  const validStatuses = ["ready_for_archive", "needs_review", "blocked"];
  const dashboardStatus = stringValue(dashboard.dashboardStatus);
  if (!validStatuses.includes(dashboardStatus)) {
    errors.push(`archive transfer final acceptance archive dashboard invalid status: ${dashboardStatus}`);
  }
  const rows = Array.isArray(dashboard.rows) ? dashboard.rows : [];
  if (!Array.isArray(dashboard.rows)) {
    errors.push("archive transfer final acceptance archive dashboard rows must be an array");
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance archive dashboard CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (stringValue(dashboard.registrationFingerprint) !== stringValue(registration?.registrationFingerprint)) {
    errors.push(
      `archive transfer final acceptance archive dashboard registration fingerprint mismatch: expected ${stringValue(registration?.registrationFingerprint)}, got ${stringValue(dashboard.registrationFingerprint)}`,
    );
  }
  if (
    receiptReview &&
    stringValue(dashboard.receiptReviewFingerprint) !== stringValue(receiptReview.reviewFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance archive dashboard receipt review fingerprint mismatch: expected ${stringValue(receiptReview.reviewFingerprint)}, got ${stringValue(dashboard.receiptReviewFingerprint)}`,
    );
  }
  if (
    crossPlatformReview &&
    stringValue(dashboard.crossPlatformReviewFingerprint) !== stringValue(crossPlatformReview.reviewFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance archive dashboard cross-platform fingerprint mismatch: expected ${stringValue(crossPlatformReview.reviewFingerprint)}, got ${stringValue(dashboard.crossPlatformReviewFingerprint)}`,
    );
  }
  const blockingIssueCount = rows.filter((row) =>
    ["blocked", "missing"].includes(stringValue(row.stageStatus)),
  ).length;
  const warningIssueCount = rows.filter((row) => stringValue(row.stageStatus) === "needs_review").length;
  const expectedStatus =
    blockingIssueCount > 0 ? "blocked" : warningIssueCount > 0 ? "needs_review" : "ready_for_archive";
  if (dashboardStatus !== expectedStatus) {
    errors.push(
      `archive transfer final acceptance archive dashboard status mismatch: expected ${expectedStatus}, got ${dashboardStatus}`,
    );
  }
  if (numberValue(dashboard.blockingIssueCount) !== blockingIssueCount) {
    errors.push(
      `archive transfer final acceptance archive dashboard blockingIssueCount mismatch: expected ${blockingIssueCount}, got ${dashboard.blockingIssueCount}`,
    );
  }
  if (numberValue(dashboard.warningIssueCount) !== warningIssueCount) {
    errors.push(
      `archive transfer final acceptance archive dashboard warningIssueCount mismatch: expected ${warningIssueCount}, got ${dashboard.warningIssueCount}`,
    );
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-archive-dashboard.md",
      "batch/archive-transfer-final-acceptance-archive-dashboard.csv",
      "batch/archive-transfer-final-acceptance-archive-dashboard.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance archive dashboard",
    errors,
  );
  const dashboardFingerprint = stringValue(dashboard.dashboardFingerprint);
  if (!dashboardFingerprint) {
    errors.push("archive transfer final acceptance archive dashboard missing dashboardFingerprint");
  } else {
    const { markdown, csv, json, dashboardFingerprint: _dashboardFingerprint, ...fingerprintBody } = dashboard;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== dashboardFingerprint) {
      errors.push(
        `archive transfer final acceptance archive dashboard fingerprint mismatch: expected ${dashboardFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceCrossProjectBaseline(
  baseline,
  csvRows,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!baseline) return;
  if (
    baseline.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceCrossProjectBaseline.v1"
  ) {
    errors.push(
      `archive transfer final acceptance cross-project baseline schema mismatch: ${baseline.schema}`,
    );
  }
  const rows = Array.isArray(baseline.rows) ? baseline.rows : [];
  if (!Array.isArray(baseline.rows)) {
    errors.push("archive transfer final acceptance cross-project baseline rows must be an array");
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance cross-project baseline CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  const validRisks = new Set(["critical", "warning", "stable"]);
  for (const row of rows) {
    const risk = stringValue(row.baselineRisk);
    if (!validRisks.has(risk)) {
      errors.push(`archive transfer final acceptance cross-project baseline invalid risk: ${risk}`);
    }
    if (!stringValue(row.sourceDashboardFingerprint)) {
      errors.push("archive transfer final acceptance cross-project baseline row missing source dashboard fingerprint");
    }
  }
  const expectedProjectCount = rows.length;
  const expectedReadyCount = rows.filter(
    (row) => stringValue(row.dashboardStatus) === "ready_for_archive",
  ).length;
  const expectedNeedsReviewCount = rows.filter(
    (row) => stringValue(row.dashboardStatus) === "needs_review",
  ).length;
  const expectedBlockedCount = rows.filter(
    (row) => stringValue(row.dashboardStatus) === "blocked",
  ).length;
  const expectedCriticalCount = rows.filter((row) => stringValue(row.baselineRisk) === "critical").length;
  const expectedWarningCount = rows.filter((row) => stringValue(row.baselineRisk) === "warning").length;
  const expectedStableCount = rows.filter((row) => stringValue(row.baselineRisk) === "stable").length;
  const totals = {
    totalPlatformCount: rows.reduce((sum, row) => sum + numberValue(row.platformCount), 0),
    totalEvidenceCount: rows.reduce((sum, row) => sum + numberValue(row.evidenceCount), 0),
    totalBlockingIssueCount: rows.reduce((sum, row) => sum + numberValue(row.blockingIssueCount), 0),
    totalWarningIssueCount: rows.reduce((sum, row) => sum + numberValue(row.warningIssueCount), 0),
    totalMissingStageCount: rows.reduce((sum, row) => sum + numberValue(row.missingStageCount), 0),
    totalBlockedStageCount: rows.reduce((sum, row) => sum + numberValue(row.blockedStageCount), 0),
    totalNeedsReviewStageCount: rows.reduce((sum, row) => sum + numberValue(row.needsReviewStageCount), 0),
  };
  const expectedCounts = [
    ["projectCount", expectedProjectCount],
    ["readyProjectCount", expectedReadyCount],
    ["needsReviewProjectCount", expectedNeedsReviewCount],
    ["blockedProjectCount", expectedBlockedCount],
    ["criticalProjectCount", expectedCriticalCount],
    ["warningProjectCount", expectedWarningCount],
    ["stableProjectCount", expectedStableCount],
    ...Object.entries(totals),
  ];
  for (const [field, expected] of expectedCounts) {
    if (numberValue(baseline[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance cross-project baseline ${field} mismatch: expected ${expected}, got ${baseline[field]}`,
      );
    }
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-cross-project-baseline.md",
      "batch/archive-transfer-final-acceptance-cross-project-baseline.csv",
      "batch/archive-transfer-final-acceptance-cross-project-baseline.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance cross-project baseline",
    errors,
  );
  const baselineFingerprint = stringValue(baseline.baselineFingerprint);
  if (!baselineFingerprint) {
    errors.push("archive transfer final acceptance cross-project baseline missing baselineFingerprint");
  } else {
    const { markdown, csv, json, baselineFingerprint: _baselineFingerprint, ...fingerprintBody } = baseline;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== baselineFingerprint) {
      errors.push(
        `archive transfer final acceptance cross-project baseline fingerprint mismatch: expected ${baselineFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceTrendReport(
  report,
  baselineTrendCsvRows,
  projectTrendCsvRows,
  latestBaseline,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!report) return;
  if (
    report.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceTrendReport.v1"
  ) {
    errors.push(
      `archive transfer final acceptance trend report schema mismatch: ${report.schema}`,
    );
  }
  const baselineRows = Array.isArray(report.baselineTrendRows) ? report.baselineTrendRows : [];
  const projectRows = Array.isArray(report.projectTrendRows) ? report.projectTrendRows : [];
  if (!Array.isArray(report.baselineTrendRows)) {
    errors.push("archive transfer final acceptance trend report baselineTrendRows must be an array");
  } else if (baselineTrendCsvRows.length !== baselineRows.length) {
    errors.push(
      `archive transfer final acceptance trend report baseline CSV row count mismatch: expected ${baselineRows.length}, got ${baselineTrendCsvRows.length}`,
    );
  }
  if (!Array.isArray(report.projectTrendRows)) {
    errors.push("archive transfer final acceptance trend report projectTrendRows must be an array");
  } else if (projectTrendCsvRows.length !== projectRows.length) {
    errors.push(
      `archive transfer final acceptance trend report project CSV row count mismatch: expected ${projectRows.length}, got ${projectTrendCsvRows.length}`,
    );
  }
  if (numberValue(report.baselineCount) !== baselineRows.length) {
    errors.push(
      `archive transfer final acceptance trend report baselineCount mismatch: expected ${baselineRows.length}, got ${report.baselineCount}`,
    );
  }
  const latestRow = baselineRows.at(-1) ?? null;
  if (latestBaseline && latestRow) {
    const latestFingerprint = stringValue(latestRow.baselineFingerprint);
    const expectedFingerprint = stringValue(latestBaseline.baselineFingerprint);
    if (latestFingerprint !== expectedFingerprint) {
      errors.push(
        `archive transfer final acceptance trend report latest baseline fingerprint mismatch: expected ${expectedFingerprint}, got ${latestFingerprint}`,
      );
    }
    const latestChecks = [
      ["latestProjectCount", latestBaseline.projectCount],
      ["latestReadyProjectCount", latestBaseline.readyProjectCount],
      ["latestNeedsReviewProjectCount", latestBaseline.needsReviewProjectCount],
      ["latestBlockedProjectCount", latestBaseline.blockedProjectCount],
      ["latestCriticalProjectCount", latestBaseline.criticalProjectCount],
      ["latestWarningProjectCount", latestBaseline.warningProjectCount],
      ["latestStableProjectCount", latestBaseline.stableProjectCount],
    ];
    for (const [field, expected] of latestChecks) {
      if (numberValue(report[field]) !== numberValue(expected)) {
        errors.push(
          `archive transfer final acceptance trend report ${field} mismatch: expected ${expected}, got ${report[field]}`,
        );
      }
    }
  }
  const firstRow = baselineRows[0] ?? null;
  if (firstRow && latestRow) {
    const expectedCriticalDelta =
      numberValue(latestRow.criticalProjectCount) - numberValue(firstRow.criticalProjectCount);
    const expectedBlockedDelta =
      numberValue(latestRow.blockedProjectCount) - numberValue(firstRow.blockedProjectCount);
    const expectedRiskDelta =
      numberValue(latestRow.totalRiskScore) - numberValue(firstRow.totalRiskScore);
    const expectedBlockingDelta =
      numberValue(latestRow.totalBlockingIssueCount) - numberValue(firstRow.totalBlockingIssueCount);
    const expectedWarningDelta =
      numberValue(latestRow.totalWarningIssueCount) - numberValue(firstRow.totalWarningIssueCount);
    const deltaChecks = [
      ["criticalProjectDelta", expectedCriticalDelta],
      ["blockedProjectDelta", expectedBlockedDelta],
      ["totalRiskScoreDelta", expectedRiskDelta],
      ["totalBlockingIssueDelta", expectedBlockingDelta],
      ["totalWarningIssueDelta", expectedWarningDelta],
    ];
    for (const [field, expected] of deltaChecks) {
      if (numberValue(report[field]) !== expected) {
        errors.push(
          `archive transfer final acceptance trend report ${field} mismatch: expected ${expected}, got ${report[field]}`,
        );
      }
    }
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-trend-report.md",
      "batch/archive-transfer-final-acceptance-baseline-trend.csv",
      "batch/archive-transfer-final-acceptance-project-trend.csv",
      "batch/archive-transfer-final-acceptance-trend-report.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance trend report",
    errors,
  );
  const trendFingerprint = stringValue(report.trendFingerprint);
  if (!trendFingerprint) {
    errors.push("archive transfer final acceptance trend report missing trendFingerprint");
  } else {
    const {
      markdown,
      baselineTrendCsv,
      projectTrendCsv,
      json,
      trendFingerprint: _trendFingerprint,
      ...fingerprintBody
    } = report;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== trendFingerprint) {
      errors.push(
        `archive transfer final acceptance trend report fingerprint mismatch: expected ${trendFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceRectificationAggregation(
  aggregation,
  csvRows,
  trendReport,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!aggregation) return;
  if (
    aggregation.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceRectificationAggregation.v1"
  ) {
    errors.push(
      `archive transfer final acceptance rectification aggregation schema mismatch: ${aggregation.schema}`,
    );
  }
  const rows = Array.isArray(aggregation.rows) ? aggregation.rows : [];
  if (!Array.isArray(aggregation.rows)) {
    errors.push("archive transfer final acceptance rectification aggregation rows must be an array");
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance rectification aggregation CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (numberValue(aggregation.issueCount) !== rows.length) {
    errors.push(
      `archive transfer final acceptance rectification aggregation issueCount mismatch: expected ${rows.length}, got ${aggregation.issueCount}`,
    );
  }
  const countChecks = [
    [
      "openIssueCount",
      rows.filter((row) => stringValue(row.closureStatus) !== "closed").length,
    ],
    [
      "closedIssueCount",
      rows.filter((row) => stringValue(row.closureStatus) === "closed").length,
    ],
    [
      "criticalIssueCount",
      rows.filter((row) => stringValue(row.issueType) === "critical_project").length,
    ],
    [
      "worseningIssueCount",
      rows.filter((row) => stringValue(row.riskTrend) === "worsening").length,
    ],
    [
      "missingIssueCount",
      rows.filter((row) => stringValue(row.issueType) === "missing_project").length,
    ],
    ["newIssueCount", rows.filter((row) => stringValue(row.riskTrend) === "new").length],
    [
      "warningIssueCount",
      rows.filter((row) => stringValue(row.latestBaselineRisk) === "warning").length,
    ],
    [
      "blockedIssueCount",
      rows.filter((row) => stringValue(row.latestDashboardStatus) === "blocked").length,
    ],
  ];
  for (const [field, expected] of countChecks) {
    if (numberValue(aggregation[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance rectification aggregation ${field} mismatch: expected ${expected}, got ${aggregation[field]}`,
      );
    }
  }
  if (trendReport) {
    const sourceTrendFingerprint = stringValue(aggregation.sourceTrendFingerprint);
    const expectedTrendFingerprint = stringValue(trendReport.trendFingerprint);
    if (sourceTrendFingerprint !== expectedTrendFingerprint) {
      errors.push(
        `archive transfer final acceptance rectification aggregation source trend fingerprint mismatch: expected ${expectedTrendFingerprint}, got ${sourceTrendFingerprint}`,
      );
    }
    const sourceBaselines = Array.isArray(aggregation.sourceBaselineFingerprints)
      ? aggregation.sourceBaselineFingerprints.map(stringValue)
      : [];
    const expectedBaselines = Array.isArray(trendReport.sourceBaselineFingerprints)
      ? trendReport.sourceBaselineFingerprints.map(stringValue)
      : [];
    if (JSON.stringify(sourceBaselines) !== JSON.stringify(expectedBaselines)) {
      errors.push("archive transfer final acceptance rectification aggregation source baseline fingerprints mismatch");
    }
  }
  const validStatuses = new Set(["ready", "action_required"]);
  if (!validStatuses.has(stringValue(aggregation.aggregationStatus))) {
    errors.push(
      `archive transfer final acceptance rectification aggregation invalid status: ${aggregation.aggregationStatus}`,
    );
  }
  const validPriorities = new Set(["P0", "P1", "P2"]);
  rows.forEach((row, index) => {
    if (!stringValue(row.issueId)) {
      errors.push(`archive transfer final acceptance rectification aggregation row ${index + 1} missing issueId`);
    }
    if (!validPriorities.has(stringValue(row.priority))) {
      errors.push(
        `archive transfer final acceptance rectification aggregation row ${index + 1} invalid priority: ${row.priority}`,
      );
    }
    if (stringValue(row.sourceTrendFingerprint) !== stringValue(aggregation.sourceTrendFingerprint)) {
      errors.push(
        `archive transfer final acceptance rectification aggregation row ${index + 1} sourceTrendFingerprint mismatch`,
      );
    }
  });
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-rectification-aggregation.md",
      "batch/archive-transfer-final-acceptance-rectification-aggregation.csv",
      "batch/archive-transfer-final-acceptance-rectification-aggregation.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance rectification aggregation",
    errors,
  );
  const aggregationFingerprint = stringValue(aggregation.aggregationFingerprint);
  if (!aggregationFingerprint) {
    errors.push(
      "archive transfer final acceptance rectification aggregation missing aggregationFingerprint",
    );
  } else {
    const {
      markdown,
      csv,
      json,
      aggregationFingerprint: _aggregationFingerprint,
      ...fingerprintBody
    } = aggregation;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== aggregationFingerprint) {
      errors.push(
        `archive transfer final acceptance rectification aggregation fingerprint mismatch: expected ${aggregationFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceRectificationClosureUpdate(
  update,
  csvRows,
  aggregation,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!update) return;
  if (
    update.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceRectificationClosureUpdate.v1"
  ) {
    errors.push(
      `archive transfer final acceptance rectification closure update schema mismatch: ${update.schema}`,
    );
  }
  const rows = Array.isArray(update.rows) ? update.rows : [];
  if (!Array.isArray(update.rows)) {
    errors.push("archive transfer final acceptance rectification closure update rows must be an array");
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance rectification closure update CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  const countChecks = [
    [
      "missingUpdateCount",
      rows.filter((row) => stringValue(row.updateStatus) === "missing_update").length,
    ],
    [
      "unmatchedUpdateCount",
      rows.filter((row) => stringValue(row.updateStatus) === "unmatched_update").length,
    ],
  ];
  for (const [field, expected] of countChecks) {
    if (numberValue(update[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance rectification closure update ${field} mismatch: expected ${expected}, got ${update[field]}`,
      );
    }
  }
  const updatedAggregation = objectValue(update.updatedAggregation);
  const updatedRows = Array.isArray(updatedAggregation.rows) ? updatedAggregation.rows : [];
  const expectedClosed = updatedRows.filter((row) => stringValue(row.closureStatus) === "closed").length;
  if (numberValue(update.closedCount) !== expectedClosed) {
    errors.push(
      `archive transfer final acceptance rectification closure update closedCount mismatch: expected ${expectedClosed}, got ${update.closedCount}`,
    );
  }
  const expectedStillOpen = updatedRows.filter((row) => stringValue(row.closureStatus) !== "closed").length;
  if (numberValue(update.stillOpenCount) !== expectedStillOpen) {
    errors.push(
      `archive transfer final acceptance rectification closure update stillOpenCount mismatch: expected ${expectedStillOpen}, got ${update.stillOpenCount}`,
    );
  }
  if (aggregation) {
    const sourceAggregationFingerprint = stringValue(update.sourceAggregationFingerprint);
    const expectedAggregationFingerprint = stringValue(aggregation.aggregationFingerprint);
    if (sourceAggregationFingerprint !== expectedAggregationFingerprint) {
      errors.push(
        `archive transfer final acceptance rectification closure update source aggregation fingerprint mismatch: expected ${expectedAggregationFingerprint}, got ${sourceAggregationFingerprint}`,
      );
    }
  }
  const updatedAggregationFingerprint = stringValue(updatedAggregation.aggregationFingerprint);
  if (stringValue(update.updatedAggregationFingerprint) !== updatedAggregationFingerprint) {
    errors.push(
      `archive transfer final acceptance rectification closure update updated aggregation fingerprint mismatch: expected ${updatedAggregationFingerprint}, got ${update.updatedAggregationFingerprint}`,
    );
  }
  const validUpdateStatuses = new Set(["closed", "kept_open", "missing_update", "unmatched_update"]);
  rows.forEach((row, index) => {
    if (!validUpdateStatuses.has(stringValue(row.updateStatus))) {
      errors.push(
        `archive transfer final acceptance rectification closure update row ${index + 1} invalid updateStatus: ${row.updateStatus}`,
      );
    }
  });
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-rectification-closure-update.md",
      "batch/archive-transfer-final-acceptance-rectification-closure-update.csv",
      "batch/archive-transfer-final-acceptance-rectification-closure-update.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance rectification closure update",
    errors,
  );
  const updateFingerprint = stringValue(update.updateFingerprint);
  if (!updateFingerprint) {
    errors.push("archive transfer final acceptance rectification closure update missing updateFingerprint");
  } else {
    const {
      markdown,
      csv,
      json,
      updateFingerprint: _updateFingerprint,
      ...fingerprintBody
    } = update;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify({ ...fingerprintBody, csv }));
    if (computedFingerprint !== updateFingerprint) {
      errors.push(
        `archive transfer final acceptance rectification closure update fingerprint mismatch: expected ${updateFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskLedger(
  ledger,
  csvRows,
  rectificationClosureUpdate,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!ledger) return;
  if (ledger.schema !== "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskLedger.v1") {
    errors.push(`archive transfer final acceptance ingest risk ledger schema mismatch: ${ledger.schema}`);
  }
  const rows = Array.isArray(ledger.rows) ? ledger.rows : [];
  if (!Array.isArray(ledger.rows)) {
    errors.push("archive transfer final acceptance ingest risk ledger rows must be an array");
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk ledger CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    rectificationClosureUpdate &&
    stringValue(ledger.sourceRectificationClosureUpdateFingerprint) !==
      stringValue(rectificationClosureUpdate.updateFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk ledger source closure fingerprint mismatch: expected ${stringValue(rectificationClosureUpdate.updateFingerprint)}, got ${stringValue(ledger.sourceRectificationClosureUpdateFingerprint)}`,
    );
  }
  if (
    rectificationClosureUpdate &&
    stringValue(ledger.sourceUpdatedAggregationFingerprint) !==
      stringValue(rectificationClosureUpdate.updatedAggregationFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk ledger updated aggregation fingerprint mismatch: expected ${stringValue(rectificationClosureUpdate.updatedAggregationFingerprint)}, got ${stringValue(ledger.sourceUpdatedAggregationFingerprint)}`,
    );
  }
  const countChecks = [
    ["riskCount", rows.length],
    ["openRiskCount", rows.filter((row) => stringValue(row.closureStatus) !== "closed").length],
    ["closedRiskCount", rows.filter((row) => stringValue(row.closureStatus) === "closed").length],
    ["criticalRiskCount", rows.filter((row) => stringValue(row.riskPriority) === "critical").length],
    [
      "missingReceiptRiskCount",
      rows.filter((row) => stringValue(row.riskType) === "missing_closure_receipt").length,
    ],
    [
      "unmatchedReceiptRiskCount",
      rows.filter((row) => stringValue(row.riskType) === "unmatched_closure_receipt").length,
    ],
  ];
  for (const [field, expected] of countChecks) {
    if (numberValue(ledger[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk ledger ${field} mismatch: expected ${expected}, got ${ledger[field]}`,
      );
    }
  }
  const validRiskTypes = new Set([
    "open_rectification",
    "missing_closure_receipt",
    "unmatched_closure_receipt",
  ]);
  rows.forEach((row, index) => {
    if (!validRiskTypes.has(stringValue(row.riskType))) {
      errors.push(
        `archive transfer final acceptance ingest risk ledger row ${index + 1} invalid riskType: ${row.riskType}`,
      );
    }
  });
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-ledger.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-ledger.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-ledger.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk ledger",
    errors,
  );
  const ledgerFingerprint = stringValue(ledger.ledgerFingerprint);
  if (!ledgerFingerprint) {
    errors.push("archive transfer final acceptance ingest risk ledger missing ledgerFingerprint");
  } else {
    const {
      markdown,
      csv,
      json,
      ledgerFingerprint: _ledgerFingerprint,
      ...fingerprintBody
    } = ledger;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== ledgerFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk ledger fingerprint mismatch: expected ${ledgerFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskClosureUpdate(
  update,
  csvRows,
  ledger,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!update) return;
  if (
    update.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskClosureUpdate.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk closure update schema mismatch: ${update.schema}`,
    );
  }
  const rows = Array.isArray(update.rows) ? update.rows : [];
  if (!Array.isArray(update.rows)) {
    errors.push("archive transfer final acceptance ingest risk closure update rows must be an array");
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk closure update CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  const updatedLedger = objectValue(update.updatedRiskLedger);
  const updatedRows = Array.isArray(updatedLedger.rows) ? updatedLedger.rows : [];
  if (ledger && stringValue(update.sourceRiskLedgerFingerprint) !== stringValue(ledger.ledgerFingerprint)) {
    errors.push(
      `archive transfer final acceptance ingest risk closure update source ledger fingerprint mismatch: expected ${stringValue(ledger.ledgerFingerprint)}, got ${stringValue(update.sourceRiskLedgerFingerprint)}`,
    );
  }
  const updatedLedgerFingerprint = stringValue(updatedLedger.ledgerFingerprint);
  if (stringValue(update.updatedRiskLedgerFingerprint) !== updatedLedgerFingerprint) {
    errors.push(
      `archive transfer final acceptance ingest risk closure update updated ledger fingerprint mismatch: expected ${updatedLedgerFingerprint}, got ${update.updatedRiskLedgerFingerprint}`,
    );
  }
  const expectedClosed = updatedRows.filter((row) => stringValue(row.closureStatus) === "closed").length;
  if (numberValue(update.closedCount) !== expectedClosed) {
    errors.push(
      `archive transfer final acceptance ingest risk closure update closedCount mismatch: expected ${expectedClosed}, got ${update.closedCount}`,
    );
  }
  const expectedStillOpen = updatedRows.filter((row) => stringValue(row.closureStatus) !== "closed").length;
  if (numberValue(update.stillOpenCount) !== expectedStillOpen) {
    errors.push(
      `archive transfer final acceptance ingest risk closure update stillOpenCount mismatch: expected ${expectedStillOpen}, got ${update.stillOpenCount}`,
    );
  }
  const countChecks = [
    [
      "missingUpdateCount",
      rows.filter((row) => stringValue(row.updateStatus) === "missing_update").length,
    ],
    [
      "unmatchedUpdateCount",
      rows.filter((row) => stringValue(row.updateStatus) === "unmatched_update").length,
    ],
  ];
  for (const [field, expected] of countChecks) {
    if (numberValue(update[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk closure update ${field} mismatch: expected ${expected}, got ${update[field]}`,
      );
    }
  }
  const validUpdateStatuses = new Set(["closed", "kept_open", "missing_update", "unmatched_update"]);
  rows.forEach((row, index) => {
    if (!validUpdateStatuses.has(stringValue(row.updateStatus))) {
      errors.push(
        `archive transfer final acceptance ingest risk closure update row ${index + 1} invalid updateStatus: ${row.updateStatus}`,
      );
    }
  });
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-closure-update.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-closure-update.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-closure-update.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk closure update",
    errors,
  );
  const updateFingerprint = stringValue(update.updateFingerprint);
  if (!updateFingerprint) {
    errors.push("archive transfer final acceptance ingest risk closure update missing updateFingerprint");
  } else {
    const {
      markdown,
      csv,
      json,
      updateFingerprint: _updateFingerprint,
      ...fingerprintBody
    } = update;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify({ ...fingerprintBody, csv }));
    if (computedFingerprint !== updateFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk closure update fingerprint mismatch: expected ${updateFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskReissueHistory(
  history,
  csvRows,
  ledger,
  closureUpdate,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!history) return;
  if (
    history.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskReissueHistory.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk reissue history schema mismatch: ${history.schema}`,
    );
  }
  const rows = Array.isArray(history.rows) ? history.rows : [];
  if (!Array.isArray(history.rows)) {
    errors.push("archive transfer final acceptance ingest risk reissue history rows must be an array");
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk reissue history CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (ledger && stringValue(history.initialRiskLedgerFingerprint) !== stringValue(ledger.ledgerFingerprint)) {
    errors.push(
      `archive transfer final acceptance ingest risk reissue history initial ledger fingerprint mismatch: expected ${stringValue(ledger.ledgerFingerprint)}, got ${stringValue(history.initialRiskLedgerFingerprint)}`,
    );
  }
  const expectedFinalLedgerFingerprint = stringValue(
    closureUpdate?.updatedRiskLedger?.ledgerFingerprint ?? ledger?.ledgerFingerprint,
  );
  if (
    expectedFinalLedgerFingerprint &&
    stringValue(history.finalRiskLedgerFingerprint) !== expectedFinalLedgerFingerprint
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk reissue history final ledger fingerprint mismatch: expected ${expectedFinalLedgerFingerprint}, got ${stringValue(history.finalRiskLedgerFingerprint)}`,
    );
  }
  const countChecks = [
    ["roundCount", rows.length],
    ["initialRiskCount", ledger ? numberValue(ledger.riskCount) : numberValue(history.initialRiskCount)],
    ["initialOpenCount", ledger ? numberValue(ledger.openRiskCount) : numberValue(history.initialOpenCount)],
    [
      "finalOpenCount",
      closureUpdate
        ? numberValue(closureUpdate.updatedRiskLedger?.openRiskCount)
        : numberValue(history.finalOpenCount),
    ],
    [
      "totalClosedCount",
      closureUpdate
        ? numberValue(closureUpdate.updatedRiskLedger?.closedRiskCount)
        : numberValue(history.totalClosedCount),
    ],
    ["totalReissuedCount", rows.reduce((sum, row) => sum + numberValue(row.reissuedRiskCount), 0)],
    ["totalMissingUpdateCount", rows.reduce((sum, row) => sum + numberValue(row.missingUpdateCount), 0)],
    ["totalUnmatchedUpdateCount", rows.reduce((sum, row) => sum + numberValue(row.unmatchedUpdateCount), 0)],
  ];
  for (const [field, expected] of countChecks) {
    if (numberValue(history[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk reissue history ${field} mismatch: expected ${expected}, got ${history[field]}`,
      );
    }
  }
  if (!Array.isArray(history.projectSummaries)) {
    errors.push("archive transfer final acceptance ingest risk reissue history projectSummaries must be an array");
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-reissue-history.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-reissue-history.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-reissue-history.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk reissue history",
    errors,
  );
  const historyFingerprint = stringValue(history.historyFingerprint);
  if (!historyFingerprint) {
    errors.push("archive transfer final acceptance ingest risk reissue history missing historyFingerprint");
  } else {
    const {
      markdown,
      csv,
      json,
      historyFingerprint: _historyFingerprint,
      ...fingerprintBody
    } = history;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== historyFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk reissue history fingerprint mismatch: expected ${historyFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalSignoff(
  signoff,
  csvRows,
  history,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!signoff) return;
  if (
    signoff.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalSignoff.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final signoff schema mismatch: ${signoff.schema}`,
    );
  }
  const indexRows = Array.isArray(signoff.finalIndexRows) ? signoff.finalIndexRows : [];
  if (!Array.isArray(signoff.finalIndexRows)) {
    errors.push("archive transfer final acceptance ingest risk final signoff finalIndexRows must be an array");
  } else if (csvRows.length !== indexRows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk final signoff CSV row count mismatch: expected ${indexRows.length}, got ${csvRows.length}`,
    );
  }
  if (history && stringValue(signoff.sourceHistoryFingerprint) !== stringValue(history.historyFingerprint)) {
    errors.push(
      `archive transfer final acceptance ingest risk final signoff history fingerprint mismatch: expected ${stringValue(history.historyFingerprint)}, got ${stringValue(signoff.sourceHistoryFingerprint)}`,
    );
  }
  if (history && stringValue(signoff.finalRiskLedgerFingerprint) !== stringValue(history.finalRiskLedgerFingerprint)) {
    errors.push(
      `archive transfer final acceptance ingest risk final signoff final risk ledger mismatch: expected ${stringValue(history.finalRiskLedgerFingerprint)}, got ${stringValue(signoff.finalRiskLedgerFingerprint)}`,
    );
  }
  const expectedStatus = numberValue(signoff.finalOpenCount) === 0 ? "signed" : "blocked";
  if (stringValue(signoff.signoffStatus) !== expectedStatus) {
    errors.push(
      `archive transfer final acceptance ingest risk final signoff status mismatch: expected ${expectedStatus}, got ${stringValue(signoff.signoffStatus)}`,
    );
  }
  if (signoff.signedReceipt?.signatureStatus !== signoff.signoffStatus) {
    errors.push("archive transfer final acceptance ingest risk final signoff signedReceipt status mismatch");
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-signoff.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-signoff.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-signoff.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final signoff",
    errors,
  );
  const signoffFingerprint = stringValue(signoff.signoffFingerprint);
  if (!signoffFingerprint) {
    errors.push("archive transfer final acceptance ingest risk final signoff missing signoffFingerprint");
  } else {
    const {
      markdown,
      csv,
      json,
      signoffFingerprint: _signoffFingerprint,
      ...fingerprintBody
    } = signoff;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== signoffFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final signoff fingerprint mismatch: expected ${signoffFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalReceiptReview(
  review,
  csvRows,
  signoff,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!review) return;
  if (
    review.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalReceiptReview.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final receipt review schema mismatch: ${review.schema}`,
    );
  }
  const rows = Array.isArray(review.rows) ? review.rows : [];
  if (!Array.isArray(review.rows)) {
    errors.push("archive transfer final acceptance ingest risk final receipt review rows must be an array");
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk final receipt review CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (signoff && stringValue(review.sourceSignoffFingerprint) !== stringValue(signoff.signoffFingerprint)) {
    errors.push(
      `archive transfer final acceptance ingest risk final receipt review signoff fingerprint mismatch: expected ${stringValue(signoff.signoffFingerprint)}, got ${stringValue(review.sourceSignoffFingerprint)}`,
    );
  }
  const countChecks = [
    ["acceptedCount", rows.filter((row) => stringValue(row.reconciliationStatus) === "accepted").length],
    ["rejectedCount", rows.filter((row) => stringValue(row.reconciliationStatus) === "rejected").length],
    ["pendingCount", rows.filter((row) => stringValue(row.reconciliationStatus) === "pending").length],
    [
      "missingReceiptCount",
      rows.filter((row) => stringValue(row.reconciliationStatus) === "missing_receipt").length,
    ],
    [
      "unmatchedReceiptCount",
      rows.filter((row) => stringValue(row.reconciliationStatus) === "unmatched_receipt").length,
    ],
  ];
  for (const [field, expected] of countChecks) {
    if (numberValue(review[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk final receipt review ${field} mismatch: expected ${expected}, got ${review[field]}`,
      );
    }
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-review.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-review.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-review.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final receipt review",
    errors,
  );
  const reviewFingerprint = stringValue(review.reviewFingerprint);
  if (!reviewFingerprint) {
    errors.push("archive transfer final acceptance ingest risk final receipt review missing reviewFingerprint");
  } else {
    const {
      markdown,
      csv,
      json,
      reviewFingerprint: _reviewFingerprint,
      ...fingerprintBody
    } = review;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify({ ...fingerprintBody, csv }));
    if (computedFingerprint !== reviewFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final receipt review fingerprint mismatch: expected ${reviewFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview(
  review,
  csvRows,
  signoff,
  receiptReviews,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!review) return;
  if (
    review.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final receipt cross-platform review schema mismatch: ${review.schema}`,
    );
  }
  const rows = Array.isArray(review.rows) ? review.rows : [];
  if (!Array.isArray(review.rows)) {
    errors.push("archive transfer final acceptance ingest risk final receipt cross-platform review rows must be an array");
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk final receipt cross-platform review CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (signoff && stringValue(review.sourceSignoffFingerprint) !== stringValue(signoff.signoffFingerprint)) {
    errors.push(
      `archive transfer final acceptance ingest risk final receipt cross-platform review signoff fingerprint mismatch: expected ${stringValue(signoff.signoffFingerprint)}, got ${stringValue(review.sourceSignoffFingerprint)}`,
    );
  }
  const sourceFingerprints = Array.isArray(review.sourceReceiptReviewFingerprints)
    ? review.sourceReceiptReviewFingerprints.map((value) => stringValue(value)).filter(Boolean)
    : [];
  for (const receiptReview of receiptReviews) {
    const fingerprint = stringValue(receiptReview.reviewFingerprint);
    if (fingerprint && !sourceFingerprints.includes(fingerprint)) {
      errors.push(
        `archive transfer final acceptance ingest risk final receipt cross-platform review missing source receipt fingerprint: ${fingerprint}`,
      );
    }
  }
  const issueCount = rows.filter((row) => Array.isArray(row.issueTypes) && row.issueTypes.length > 0).length;
  const blockingIssueCount = rows.filter((row) => stringValue(row.severity) === "blocking").length;
  const warningIssueCount = rows.filter((row) => stringValue(row.severity) === "warning").length;
  const countChecks = [
    ["issueCount", issueCount],
    ["blockingIssueCount", blockingIssueCount],
    ["warningIssueCount", warningIssueCount],
    ["signoffCount", rows.length],
  ];
  for (const [field, expected] of countChecks) {
    if (numberValue(review[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk final receipt cross-platform review ${field} mismatch: expected ${expected}, got ${review[field]}`,
      );
    }
  }
  const expectedStatus = issueCount > 0 ? "needs_review" : "passed";
  if (stringValue(review.reviewStatus) !== expectedStatus) {
    errors.push(
      `archive transfer final acceptance ingest risk final receipt cross-platform review status mismatch: expected ${expectedStatus}, got ${stringValue(review.reviewStatus)}`,
    );
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-cross-platform-review.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-cross-platform-review.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-cross-platform-review.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final receipt cross-platform review",
    errors,
  );
  const reviewFingerprint = stringValue(review.reviewFingerprint);
  if (!reviewFingerprint) {
    errors.push(
      "archive transfer final acceptance ingest risk final receipt cross-platform review missing reviewFingerprint",
    );
  } else {
    const {
      markdown,
      csv,
      json,
      reviewFingerprint: _reviewFingerprint,
      ...fingerprintBody
    } = review;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== reviewFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final receipt cross-platform review fingerprint mismatch: expected ${reviewFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate(
  gate,
  csvRows,
  signoff,
  crossPlatformReview,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!gate) return;
  if (
    gate.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final consistency gate schema mismatch: ${gate.schema}`,
    );
  }
  if (csvRows.length !== 1) {
    errors.push(
      `archive transfer final acceptance ingest risk final consistency gate CSV row count mismatch: expected 1, got ${csvRows.length}`,
    );
  }
  if (signoff && stringValue(gate.sourceSignoffFingerprint) !== stringValue(signoff.signoffFingerprint)) {
    errors.push(
      `archive transfer final acceptance ingest risk final consistency gate signoff fingerprint mismatch: expected ${stringValue(signoff.signoffFingerprint)}, got ${stringValue(gate.sourceSignoffFingerprint)}`,
    );
  }
  if (
    crossPlatformReview &&
    stringValue(gate.sourceCrossPlatformReviewFingerprint) !== stringValue(crossPlatformReview.reviewFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final consistency gate cross-platform fingerprint mismatch: expected ${stringValue(crossPlatformReview.reviewFingerprint)}, got ${stringValue(gate.sourceCrossPlatformReviewFingerprint)}`,
    );
  }
  if (crossPlatformReview) {
    const crossPlatformIssueCount = numberValue(crossPlatformReview.issueCount);
    const crossPlatformBlockingCount = numberValue(crossPlatformReview.blockingIssueCount);
    const crossPlatformWarningCount = numberValue(crossPlatformReview.warningIssueCount);
    for (const [field, expected] of [
      ["issueCount", crossPlatformIssueCount],
      ["blockingIssueCount", crossPlatformBlockingCount],
      ["warningIssueCount", crossPlatformWarningCount],
      ["platformCount", numberValue(crossPlatformReview.platformCount)],
    ]) {
      if (numberValue(gate[field]) !== expected) {
        errors.push(
          `archive transfer final acceptance ingest risk final consistency gate ${field} mismatch: expected ${expected}, got ${gate[field]}`,
        );
      }
    }
  }
  const failedCriteria = Array.isArray(gate.failedCriteria) ? gate.failedCriteria.map((value) => stringValue(value)) : [];
  const blockingFailed = failedCriteria.some((key) =>
    ["signoff_signed", "required_platform_receipts", "no_blocking_cross_platform_issues"].includes(key),
  );
  const expectedGateStatus = blockingFailed ? "blocked" : failedCriteria.length > 0 ? "watch" : "passed";
  if (stringValue(gate.gateStatus) !== expectedGateStatus) {
    errors.push(
      `archive transfer final acceptance ingest risk final consistency gate status mismatch: expected ${expectedGateStatus}, got ${stringValue(gate.gateStatus)}`,
    );
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-consistency-gate.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-consistency-gate.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-consistency-gate.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final consistency gate",
    errors,
  );
  const gateFingerprint = stringValue(gate.gateFingerprint);
  if (!gateFingerprint) {
    errors.push("archive transfer final acceptance ingest risk final consistency gate missing gateFingerprint");
  } else {
    const {
      markdown,
      csv,
      json,
      gateFingerprint: _gateFingerprint,
      ...fingerprintBody
    } = gate;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== gateFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final consistency gate fingerprint mismatch: expected ${gateFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage(
  evidencePackage,
  csvRows,
  signoff,
  crossPlatformReview,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!evidencePackage) return;
  if (
    evidencePackage.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final receipt evidence package schema mismatch: ${evidencePackage.schema}`,
    );
  }
  const rows = Array.isArray(evidencePackage.rows) ? evidencePackage.rows : [];
  if (!Array.isArray(evidencePackage.rows)) {
    errors.push("archive transfer final acceptance ingest risk final receipt evidence package rows must be an array");
  }
  if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk final receipt evidence package CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    signoff &&
    stringValue(evidencePackage.sourceSignoffFingerprint) !== stringValue(signoff.signoffFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final receipt evidence package signoff fingerprint mismatch: expected ${stringValue(signoff.signoffFingerprint)}, got ${stringValue(evidencePackage.sourceSignoffFingerprint)}`,
    );
  }
  if (
    crossPlatformReview &&
    stringValue(evidencePackage.sourceCrossPlatformReviewFingerprint) !==
      stringValue(crossPlatformReview.reviewFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final receipt evidence package cross-platform fingerprint mismatch: expected ${stringValue(crossPlatformReview.reviewFingerprint)}, got ${stringValue(evidencePackage.sourceCrossPlatformReviewFingerprint)}`,
    );
  }

  const rowReviewFingerprints = rows.map((row) => stringValue(row.reviewFingerprint)).filter(Boolean);
  const packageReviewFingerprints = Array.isArray(evidencePackage.sourceReceiptReviewFingerprints)
    ? evidencePackage.sourceReceiptReviewFingerprints.map((fingerprint) => stringValue(fingerprint)).filter(Boolean)
    : [];
  for (const fingerprint of rowReviewFingerprints) {
    if (!packageReviewFingerprints.includes(fingerprint)) {
      errors.push(
        `archive transfer final acceptance ingest risk final receipt evidence package missing row review fingerprint: ${fingerprint}`,
      );
    }
  }
  const crossPlatformFingerprints = Array.isArray(crossPlatformReview?.sourceReceiptReviewFingerprints)
    ? crossPlatformReview.sourceReceiptReviewFingerprints.map((fingerprint) => stringValue(fingerprint)).filter(Boolean)
    : [];
  for (const fingerprint of crossPlatformFingerprints) {
    if (!packageReviewFingerprints.includes(fingerprint)) {
      errors.push(
        `archive transfer final acceptance ingest risk final receipt evidence package missing cross-platform review fingerprint: ${fingerprint}`,
      );
    }
  }

  const expectedCounts = {
    evidenceCount: rows.length,
    rawSourceCount: rows.filter((row) => stringValue(row.sourceText).trim() !== "").length,
    acceptedCount: rows.reduce((sum, row) => sum + numberValue(row.acceptedCount), 0),
    rejectedCount: rows.reduce((sum, row) => sum + numberValue(row.rejectedCount), 0),
    pendingCount: rows.reduce((sum, row) => sum + numberValue(row.pendingCount), 0),
    missingReceiptCount: rows.reduce((sum, row) => sum + numberValue(row.missingReceiptCount), 0),
    unmatchedReceiptCount: rows.reduce((sum, row) => sum + numberValue(row.unmatchedReceiptCount), 0),
  };
  for (const [field, expected] of Object.entries(expectedCounts)) {
    if (numberValue(evidencePackage[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk final receipt evidence package ${field} mismatch: expected ${expected}, got ${evidencePackage[field]}`,
      );
    }
  }

  for (const row of rows) {
    const sourceName = stringValue(row.sourceName);
    const platformName = stringValue(row.platformName);
    const rawText = stringValue(row.sourceText);
    const computedRawFingerprint = fnv1a32Fingerprint(rawText);
    if (stringValue(row.rawTextFingerprint) !== computedRawFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final receipt evidence package raw text fingerprint mismatch for ${sourceName || platformName}: expected ${stringValue(row.rawTextFingerprint)}, got ${computedRawFingerprint}`,
      );
    }
    if (!stringValue(row.sourceFingerprint)) {
      errors.push(
        `archive transfer final acceptance ingest risk final receipt evidence package missing source fingerprint for ${sourceName || platformName}`,
      );
    }
    if (!stringValue(row.action)) {
      errors.push(
        `archive transfer final acceptance ingest risk final receipt evidence package missing action for ${sourceName || platformName}`,
      );
    }
    const csvRow = csvRows.find(
      (item) =>
        stringValue(item.source_name) === sourceName &&
        stringValue(item.platform_name) === platformName,
    );
    if (!csvRow) {
      errors.push(
        `archive transfer final acceptance ingest risk final receipt evidence package CSV missing row for ${sourceName || platformName}`,
      );
    } else if (stringValue(csvRow.raw_text_fingerprint) !== stringValue(row.rawTextFingerprint)) {
      errors.push(
        `archive transfer final acceptance ingest risk final receipt evidence package CSV raw text fingerprint mismatch for ${sourceName || platformName}`,
      );
    }
  }

  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-evidence-package.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-evidence-package.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-evidence-package.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final receipt evidence package",
    errors,
  );
  const packageFingerprint = stringValue(evidencePackage.packageFingerprint);
  if (!packageFingerprint) {
    errors.push(
      "archive transfer final acceptance ingest risk final receipt evidence package missing packageFingerprint",
    );
  } else {
    const {
      markdown,
      csv,
      json,
      packageFingerprint: _packageFingerprint,
      ...fingerprintBody
    } = evidencePackage;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== packageFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final receipt evidence package fingerprint mismatch: expected ${packageFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackage(
  proofPackage,
  csvRows,
  signoff,
  crossPlatformReview,
  gate,
  evidencePackage,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!proofPackage) return;
  if (
    proofPackage.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackage.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package schema mismatch: ${proofPackage.schema}`,
    );
  }
  const rows = Array.isArray(proofPackage.rows) ? proofPackage.rows : [];
  if (!Array.isArray(proofPackage.rows)) {
    errors.push("archive transfer final acceptance ingest risk final proof package rows must be an array");
  }
  if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    signoff &&
    stringValue(proofPackage.sourceSignoffFingerprint) !== stringValue(signoff.signoffFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package signoff fingerprint mismatch: expected ${stringValue(signoff.signoffFingerprint)}, got ${stringValue(proofPackage.sourceSignoffFingerprint)}`,
    );
  }
  if (
    crossPlatformReview &&
    stringValue(proofPackage.sourceCrossPlatformReviewFingerprint) !==
      stringValue(crossPlatformReview.reviewFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package cross-platform fingerprint mismatch: expected ${stringValue(crossPlatformReview.reviewFingerprint)}, got ${stringValue(proofPackage.sourceCrossPlatformReviewFingerprint)}`,
    );
  }
  if (gate && stringValue(proofPackage.sourceGateFingerprint) !== stringValue(gate.gateFingerprint)) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package gate fingerprint mismatch: expected ${stringValue(gate.gateFingerprint)}, got ${stringValue(proofPackage.sourceGateFingerprint)}`,
    );
  }
  if (
    evidencePackage &&
    stringValue(proofPackage.sourceReceiptEvidencePackageFingerprint) !==
      stringValue(evidencePackage.packageFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package evidence package fingerprint mismatch: expected ${stringValue(evidencePackage.packageFingerprint)}, got ${stringValue(proofPackage.sourceReceiptEvidencePackageFingerprint)}`,
    );
  }

  const expectedArtifacts = [
    {
      key: "archive_transfer_final_acceptance_ingest_risk_final_signoff",
      path: "batch/archive-transfer-final-acceptance-ingest-risk-final-signoff.json",
      schema: "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalSignoff.v1",
      fingerprint: stringValue(signoff?.signoffFingerprint),
    },
    {
      key:
        "archive_transfer_final_acceptance_ingest_risk_final_receipt_cross_platform_review",
      path:
        "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-cross-platform-review.json",
      schema:
        "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalReceiptCrossPlatformReview.v1",
      fingerprint: stringValue(crossPlatformReview?.reviewFingerprint),
    },
    {
      key: "archive_transfer_final_acceptance_ingest_risk_final_consistency_gate",
      path: "batch/archive-transfer-final-acceptance-ingest-risk-final-consistency-gate.json",
      schema:
        "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalConsistencyGate.v1",
      fingerprint: stringValue(gate?.gateFingerprint),
    },
    {
      key: "archive_transfer_final_acceptance_ingest_risk_final_receipt_evidence_package",
      path:
        "batch/archive-transfer-final-acceptance-ingest-risk-final-receipt-evidence-package.json",
      schema:
        "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalReceiptEvidencePackage.v1",
      fingerprint: stringValue(evidencePackage?.packageFingerprint),
    },
  ];
  for (const artifact of expectedArtifacts) {
    const row = rows.find((item) => stringValue(item.artifactKey) === artifact.key);
    if (!row) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package missing artifact row: ${artifact.key}`,
      );
      continue;
    }
    if (stringValue(row.filePath) !== artifact.path) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package file path mismatch for ${artifact.key}: expected ${artifact.path}, got ${stringValue(row.filePath)}`,
      );
    }
    if (stringValue(row.artifactRole) !== artifact.key) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package role mismatch for ${artifact.key}: expected ${artifact.key}, got ${stringValue(row.artifactRole)}`,
      );
    }
    if (stringValue(row.schema) !== artifact.schema) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package schema mismatch for ${artifact.key}: expected ${artifact.schema}, got ${stringValue(row.schema)}`,
      );
    }
    if (artifact.fingerprint && stringValue(row.sourceFingerprint) !== artifact.fingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package source fingerprint mismatch for ${artifact.key}: expected ${artifact.fingerprint}, got ${stringValue(row.sourceFingerprint)}`,
      );
    }
    if (row.required !== true && stringValue(row.required) !== "true") {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package required flag mismatch for ${artifact.key}`,
      );
    }
  }

  const requiredRows = rows.filter((row) => row.required === true || stringValue(row.required) === "true");
  const readyRows = rows.filter((row) => stringValue(row.handoverStatus) === "ready");
  const needsReviewRows = rows.filter((row) => stringValue(row.handoverStatus) === "needs_review");
  const blockedRows = rows.filter((row) => stringValue(row.handoverStatus) === "blocked");
  const countExpectations = [
    ["artifactCount", rows.length],
    ["requiredArtifactCount", requiredRows.length],
    ["readyArtifactCount", readyRows.length],
    ["needsReviewArtifactCount", needsReviewRows.length],
    ["blockedArtifactCount", blockedRows.length],
  ];
  if (gate) {
    countExpectations.push(
      ["platformCount", numberValue(gate.platformCount)],
      ["requiredPlatformCount", numberValue(gate.requiredPlatformCount)],
      ["issueCount", numberValue(gate.issueCount)],
      ["blockingIssueCount", numberValue(gate.blockingIssueCount)],
      ["warningIssueCount", numberValue(gate.warningIssueCount)],
    );
  }
  if (evidencePackage) {
    countExpectations.push(
      ["evidenceCount", numberValue(evidencePackage.evidenceCount)],
      ["acceptedCount", numberValue(evidencePackage.acceptedCount)],
      ["rejectedCount", numberValue(evidencePackage.rejectedCount)],
      ["pendingCount", numberValue(evidencePackage.pendingCount)],
      ["missingReceiptCount", numberValue(evidencePackage.missingReceiptCount)],
      ["unmatchedReceiptCount", numberValue(evidencePackage.unmatchedReceiptCount)],
    );
  }
  for (const [field, expected] of countExpectations) {
    if (expected !== null && numberValue(proofPackage[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package ${field} mismatch: expected ${expected}, got ${proofPackage[field]}`,
      );
    }
  }

  const expectedProofStatus =
    blockedRows.length > 0
      ? "blocked"
      : needsReviewRows.length > 0
        ? "needs_review"
        : "ready_for_handover";
  if (stringValue(proofPackage.proofStatus) !== expectedProofStatus) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package status mismatch: expected ${expectedProofStatus}, got ${stringValue(proofPackage.proofStatus)}`,
    );
  }
  const expectedHandoverDecision =
    expectedProofStatus === "ready_for_handover"
      ? "handover_ready"
      : expectedProofStatus === "needs_review"
        ? "handover_with_review"
        : "handover_blocked";
  if (stringValue(proofPackage.handoverDecision) !== expectedHandoverDecision) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package handover decision mismatch: expected ${expectedHandoverDecision}, got ${stringValue(proofPackage.handoverDecision)}`,
    );
  }

  for (const row of rows) {
    const artifactKey = stringValue(row.artifactKey);
    const csvRow = csvRows.find(
      (item) =>
        stringValue(item.artifact_key) === artifactKey &&
        stringValue(item.file_path) === stringValue(row.filePath),
    );
    if (!csvRow) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package CSV missing row for ${artifactKey}`,
      );
      continue;
    }
    if (stringValue(csvRow.source_fingerprint) !== stringValue(row.sourceFingerprint)) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package CSV source fingerprint mismatch for ${artifactKey}`,
      );
    }
    if (stringValue(csvRow.handover_status) !== stringValue(row.handoverStatus)) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package CSV handover status mismatch for ${artifactKey}`,
      );
    }
    const expectedRequired = row.required === true || stringValue(row.required) === "true" ? "yes" : "no";
    if (stringValue(csvRow.required) !== expectedRequired) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package CSV required flag mismatch for ${artifactKey}`,
      );
    }
  }

  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final proof package",
    errors,
  );
  const proofFingerprint = stringValue(proofPackage.proofFingerprint);
  if (!proofFingerprint) {
    errors.push("archive transfer final acceptance ingest risk final proof package missing proofFingerprint");
  } else {
    const {
      markdown,
      csv,
      json,
      proofFingerprint: _proofFingerprint,
      ...fingerprintBody
    } = proofPackage;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== proofFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package fingerprint mismatch: expected ${proofFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution(
  distribution,
  csvRows,
  proofPackage,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!distribution) return;
  if (
    distribution.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistribution.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution schema mismatch: ${distribution.schema}`,
    );
  }
  const rows = Array.isArray(distribution.rows) ? distribution.rows : [];
  if (!Array.isArray(distribution.rows)) {
    errors.push("archive transfer final acceptance ingest risk final proof package distribution rows must be an array");
  }
  if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    proofPackage &&
    stringValue(distribution.sourceProofFingerprint) !== stringValue(proofPackage.proofFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution proof fingerprint mismatch: expected ${stringValue(proofPackage.proofFingerprint)}, got ${stringValue(distribution.sourceProofFingerprint)}`,
    );
  }
  if (
    proofPackage &&
    stringValue(distribution.sourceGateFingerprint) !== stringValue(proofPackage.sourceGateFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution gate fingerprint mismatch: expected ${stringValue(proofPackage.sourceGateFingerprint)}, got ${stringValue(distribution.sourceGateFingerprint)}`,
    );
  }
  if (
    proofPackage &&
    stringValue(distribution.sourceReceiptEvidencePackageFingerprint) !==
      stringValue(proofPackage.sourceReceiptEvidencePackageFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution evidence package fingerprint mismatch: expected ${stringValue(proofPackage.sourceReceiptEvidencePackageFingerprint)}, got ${stringValue(distribution.sourceReceiptEvidencePackageFingerprint)}`,
    );
  }
  const expectedCounts = [
    ["rowCount", rows.length],
    ["recipientCount", unique(rows.map((row) => stringValue(row.recipientId)).filter(Boolean)).length],
    ["fileCount", unique(rows.map((row) => stringValue(row.filePath)).filter(Boolean)).length],
    ["requiredCount", rows.filter((row) => row.required === true || stringValue(row.required) === "true").length],
    ["sentCount", rows.filter((row) => stringValue(row.sendStatus) === "sent").length],
    ["readyToSendCount", rows.filter((row) => stringValue(row.sendStatus) === "ready_to_send").length],
    ["needsReviewCount", rows.filter((row) => stringValue(row.sendStatus) === "needs_review").length],
    ["blockedCount", rows.filter((row) => stringValue(row.sendStatus) === "blocked").length],
  ];
  for (const [field, expected] of expectedCounts) {
    if (numberValue(distribution[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution ${field} mismatch: expected ${expected}, got ${distribution[field]}`,
      );
    }
  }
  for (const row of rows) {
    const distributionId = stringValue(row.distributionId);
    if (!distributionId) {
      errors.push("archive transfer final acceptance ingest risk final proof package distribution row missing distributionId");
    }
    if (stringValue(row.sourceProofFingerprint) !== stringValue(distribution.sourceProofFingerprint)) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution row proof fingerprint mismatch for ${distributionId || stringValue(row.filePath)}`,
      );
    }
    const csvRow = csvRows.find((item) => stringValue(item.distribution_id) === distributionId);
    if (!csvRow) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution CSV missing row for ${distributionId}`,
      );
    } else {
      if (stringValue(csvRow.file_path) !== stringValue(row.filePath)) {
        errors.push(
          `archive transfer final acceptance ingest risk final proof package distribution CSV file path mismatch for ${distributionId}`,
        );
      }
      if (stringValue(csvRow.source_proof_fingerprint) !== stringValue(row.sourceProofFingerprint)) {
        errors.push(
          `archive transfer final acceptance ingest risk final proof package distribution CSV proof fingerprint mismatch for ${distributionId}`,
        );
      }
      if (stringValue(csvRow.send_status) !== stringValue(row.sendStatus)) {
        errors.push(
          `archive transfer final acceptance ingest risk final proof package distribution CSV send status mismatch for ${distributionId}`,
        );
      }
    }
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final proof package distribution",
    errors,
  );
  const distributionFingerprint = stringValue(distribution.distributionFingerprint);
  if (!distributionFingerprint) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution missing distributionFingerprint",
    );
  } else {
    const {
      markdown,
      csv,
      json,
      distributionFingerprint: _distributionFingerprint,
      ...fingerprintBody
    } = distribution;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== distributionFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution fingerprint mismatch: expected ${distributionFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt(
  receipt,
  csvRows,
  distribution,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!receipt) return;
  if (
    receipt.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReceipt.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution receipt schema mismatch: ${receipt.schema}`,
    );
  }
  const rows = Array.isArray(receipt.rows) ? receipt.rows : [];
  if (!Array.isArray(receipt.rows)) {
    errors.push("archive transfer final acceptance ingest risk final proof package distribution receipt rows must be an array");
  }
  if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution receipt CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    distribution &&
    stringValue(receipt.sourceDistributionFingerprint) !==
      stringValue(distribution.distributionFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution receipt distribution fingerprint mismatch: expected ${stringValue(distribution.distributionFingerprint)}, got ${stringValue(receipt.sourceDistributionFingerprint)}`,
    );
  }
  if (
    distribution &&
    stringValue(receipt.sourceProofFingerprint) !== stringValue(distribution.sourceProofFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution receipt proof fingerprint mismatch: expected ${stringValue(distribution.sourceProofFingerprint)}, got ${stringValue(receipt.sourceProofFingerprint)}`,
    );
  }
  const expectedCounts = [
    ["rowCount", rows.length],
    ["recipientCount", distribution ? numberValue(distribution.recipientCount) : null],
    ["fileCount", distribution ? numberValue(distribution.fileCount) : null],
    ["acceptedCount", rows.filter((row) => stringValue(row.reconciliationStatus) === "accepted").length],
    ["rejectedCount", rows.filter((row) => stringValue(row.reconciliationStatus) === "rejected").length],
    ["pendingCount", rows.filter((row) => stringValue(row.reconciliationStatus) === "pending").length],
    ["skippedCount", rows.filter((row) => stringValue(row.reconciliationStatus) === "skipped").length],
    ["missingReceiptCount", rows.filter((row) => stringValue(row.reconciliationStatus) === "missing_receipt").length],
    ["unmatchedReceiptCount", rows.filter((row) => stringValue(row.reconciliationStatus) === "unmatched_receipt").length],
    [
      "followUpCount",
      rows.filter((row) =>
        ["rejected", "pending", "missing_receipt", "unmatched_receipt"].includes(
          stringValue(row.reconciliationStatus),
        ),
      ).length,
    ],
  ];
  for (const [field, expected] of expectedCounts) {
    if (expected !== null && numberValue(receipt[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution receipt ${field} mismatch: expected ${expected}, got ${receipt[field]}`,
      );
    }
  }
  const distributionRowsById = new Map(
    Array.isArray(distribution?.rows)
      ? distribution.rows.map((row) => [stringValue(row.distributionId), row])
      : [],
  );
  for (const row of rows) {
    const distributionId = stringValue(row.distributionId);
    const sourceRow = distributionRowsById.get(distributionId);
    if (
      sourceRow &&
      (stringValue(row.filePath) !== stringValue(sourceRow.filePath) ||
        stringValue(row.recipientId) !== stringValue(sourceRow.recipientId))
    ) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution receipt source row mismatch for ${distributionId}`,
      );
    }
    const csvRow = csvRows.find(
      (item) =>
        stringValue(item.distribution_id) === distributionId &&
        stringValue(item.file_path) === stringValue(row.filePath),
    );
    if (!csvRow) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution receipt CSV missing row for ${distributionId || stringValue(row.filePath)}`,
      );
    } else if (stringValue(csvRow.reconciliation_status) !== stringValue(row.reconciliationStatus)) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution receipt CSV status mismatch for ${distributionId || stringValue(row.filePath)}`,
      );
    }
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-receipt.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-receipt.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-receipt.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final proof package distribution receipt",
    errors,
  );
  const receiptFingerprint = stringValue(receipt.receiptFingerprint);
  if (!receiptFingerprint) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution receipt missing receiptFingerprint",
    );
  } else {
    const {
      markdown,
      csv,
      json,
      receiptFingerprint: _receiptFingerprint,
      ...fingerprintBody
    } = receipt;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== receiptFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution receipt fingerprint mismatch: expected ${receiptFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview(
  review,
  csvRows,
  distribution,
  receiptReviews,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!review) return;
  if (
    review.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionCrossPlatformReview.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution cross-platform review schema mismatch: ${review.schema}`,
    );
  }
  const rows = Array.isArray(review.rows) ? review.rows : [];
  if (!Array.isArray(review.rows)) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution cross-platform review rows must be an array",
    );
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution cross-platform review CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    distribution &&
    stringValue(review.sourceDistributionFingerprint) !==
      stringValue(distribution.distributionFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution cross-platform review distribution fingerprint mismatch: expected ${stringValue(distribution.distributionFingerprint)}, got ${stringValue(review.sourceDistributionFingerprint)}`,
    );
  }
  if (
    distribution &&
    stringValue(review.sourceProofFingerprint) !== stringValue(distribution.sourceProofFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution cross-platform review proof fingerprint mismatch: expected ${stringValue(distribution.sourceProofFingerprint)}, got ${stringValue(review.sourceProofFingerprint)}`,
    );
  }
  const sourceFingerprints = Array.isArray(review.sourceReceiptFingerprints)
    ? review.sourceReceiptFingerprints.map((value) => stringValue(value)).filter(Boolean)
    : [];
  for (const receiptReview of receiptReviews) {
    const fingerprint = stringValue(receiptReview.receiptFingerprint);
    if (fingerprint && !sourceFingerprints.includes(fingerprint)) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution cross-platform review missing source receipt fingerprint: ${fingerprint}`,
      );
    }
  }
  const issueCount = rows.filter((row) => Array.isArray(row.issueTypes) && row.issueTypes.length > 0).length;
  const blockingIssueCount = rows.filter((row) => stringValue(row.severity) === "blocking").length;
  const warningIssueCount = rows.filter((row) => stringValue(row.severity) === "warning").length;
  const missingReceiptIssueCount = rows.filter(
    (row) => Array.isArray(row.issueTypes) && row.issueTypes.includes("missing_receipt"),
  ).length;
  const unmatchedReceiptIssueCount = rows.filter(
    (row) => Array.isArray(row.issueTypes) && row.issueTypes.includes("unmatched_receipt"),
  ).length;
  const statusMismatchCount = rows.filter(
    (row) => Array.isArray(row.issueTypes) && row.issueTypes.includes("status_mismatch"),
  ).length;
  const checksumMismatchCount = rows.filter(
    (row) => Array.isArray(row.issueTypes) && row.issueTypes.includes("checksum_mismatch"),
  ).length;
  const expectedCounts = [
    ["rowCount", rows.length],
    ["recipientCount", distribution ? numberValue(distribution.recipientCount) : null],
    ["fileCount", distribution ? numberValue(distribution.fileCount) : null],
    ["issueCount", issueCount],
    ["blockingIssueCount", blockingIssueCount],
    ["warningIssueCount", warningIssueCount],
    ["missingReceiptIssueCount", missingReceiptIssueCount],
    ["unmatchedReceiptIssueCount", unmatchedReceiptIssueCount],
    ["statusMismatchCount", statusMismatchCount],
    ["checksumMismatchCount", checksumMismatchCount],
  ];
  for (const [field, expected] of expectedCounts) {
    if (expected !== null && numberValue(review[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution cross-platform review ${field} mismatch: expected ${expected}, got ${review[field]}`,
      );
    }
  }
  const expectedStatus = issueCount > 0 ? "needs_review" : "passed";
  if (stringValue(review.reviewStatus) !== expectedStatus) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution cross-platform review status mismatch: expected ${expectedStatus}, got ${stringValue(review.reviewStatus)}`,
    );
  }
  for (const row of rows) {
    const csvRow = csvRows.find(
      (item) =>
        stringValue(item.distribution_id) === stringValue(row.distributionId) &&
        stringValue(item.file_path) === stringValue(row.filePath),
    );
    if (!csvRow) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution cross-platform review CSV missing row for ${stringValue(row.distributionId) || stringValue(row.filePath)}`,
      );
    } else if (stringValue(csvRow.review_status) !== stringValue(row.reviewStatus)) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution cross-platform review CSV status mismatch for ${stringValue(row.distributionId) || stringValue(row.filePath)}`,
      );
    }
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-cross-platform-review.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-cross-platform-review.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-cross-platform-review.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final proof package distribution cross-platform review",
    errors,
  );
  const reviewFingerprint = stringValue(review.reviewFingerprint);
  if (!reviewFingerprint) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution cross-platform review missing reviewFingerprint",
    );
  } else {
    const {
      markdown,
      csv,
      json,
      reviewFingerprint: _reviewFingerprint,
      ...fingerprintBody
    } = review;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== reviewFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution cross-platform review fingerprint mismatch: expected ${reviewFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate(
  gate,
  csvRows,
  distribution,
  crossPlatformReview,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!gate) return;
  if (
    gate.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGate.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate schema mismatch: ${gate.schema}`,
    );
  }
  if (csvRows.length !== 1) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate CSV row count mismatch: expected 1, got ${csvRows.length}`,
    );
  }
  if (
    distribution &&
    stringValue(gate.sourceDistributionFingerprint) !==
      stringValue(distribution.distributionFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate distribution fingerprint mismatch: expected ${stringValue(distribution.distributionFingerprint)}, got ${stringValue(gate.sourceDistributionFingerprint)}`,
    );
  }
  if (
    distribution &&
    stringValue(gate.sourceProofFingerprint) !== stringValue(distribution.sourceProofFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate proof fingerprint mismatch: expected ${stringValue(distribution.sourceProofFingerprint)}, got ${stringValue(gate.sourceProofFingerprint)}`,
    );
  }
  if (
    crossPlatformReview &&
    stringValue(gate.sourceCrossPlatformReviewFingerprint) !==
      stringValue(crossPlatformReview.reviewFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate cross-platform review fingerprint mismatch: expected ${stringValue(crossPlatformReview.reviewFingerprint)}, got ${stringValue(gate.sourceCrossPlatformReviewFingerprint)}`,
    );
  }
  const sourceReceiptFingerprints = Array.isArray(gate.sourceReceiptFingerprints)
    ? gate.sourceReceiptFingerprints.map((value) => stringValue(value)).filter(Boolean).sort()
    : [];
  const expectedReceiptFingerprints = Array.isArray(crossPlatformReview?.sourceReceiptFingerprints)
    ? crossPlatformReview.sourceReceiptFingerprints
        .map((value) => stringValue(value))
        .filter(Boolean)
        .sort()
    : [];
  if (sourceReceiptFingerprints.join("|") !== expectedReceiptFingerprints.join("|")) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution release gate receipt fingerprints mismatch",
    );
  }
  const requiredPlatformCount = numberValue(gate.requiredPlatformCount);
  const platformCount = crossPlatformReview
    ? numberValue(crossPlatformReview.platformCount)
    : numberValue(gate.platformCount);
  const issueCount = crossPlatformReview
    ? numberValue(crossPlatformReview.issueCount)
    : numberValue(gate.issueCount);
  const blockingIssueCount = crossPlatformReview
    ? numberValue(crossPlatformReview.blockingIssueCount)
    : numberValue(gate.blockingIssueCount);
  const warningIssueCount = crossPlatformReview
    ? numberValue(crossPlatformReview.warningIssueCount)
    : numberValue(gate.warningIssueCount);
  const distributionRequiredCount = distribution
    ? numberValue(distribution.requiredCount)
    : numberValue(gate.distributionRequiredCount);
  const distributionSentCount = distribution
    ? numberValue(distribution.sentCount)
    : numberValue(gate.distributionSentCount);
  const distributionBlockedCount = distribution ? numberValue(distribution.blockedCount) : 0;
  const expectedCounts = [
    ["platformCount", platformCount],
    ["issueCount", issueCount],
    ["blockingIssueCount", blockingIssueCount],
    ["warningIssueCount", warningIssueCount],
    ["distributionRequiredCount", distributionRequiredCount],
    ["distributionSentCount", distributionSentCount],
  ];
  for (const [field, expected] of expectedCounts) {
    if (expected !== null && numberValue(gate[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate ${field} mismatch: expected ${expected}, got ${gate[field]}`,
      );
    }
  }
  if (requiredPlatformCount === null || requiredPlatformCount < 1) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate invalid requiredPlatformCount: ${gate.requiredPlatformCount}`,
    );
  }
  const missingPlatformNames = Array.isArray(crossPlatformReview?.missingPlatformNames)
    ? crossPlatformReview.missingPlatformNames
    : [];
  const criteria = {
    proof_package_distributed:
      (distributionRequiredCount ?? 0) > 0 &&
      (distributionSentCount ?? 0) >= (distributionRequiredCount ?? 0) &&
      (distributionBlockedCount ?? 0) === 0,
    required_platform_receipts:
      (platformCount ?? 0) >= (requiredPlatformCount ?? 1) && missingPlatformNames.length === 0,
    no_blocking_cross_platform_issues: (blockingIssueCount ?? 0) === 0,
    no_warning_cross_platform_issues: (warningIssueCount ?? 0) === 0,
  };
  const expectedPassedCriteria = Object.entries(criteria)
    .filter(([, passed]) => passed)
    .map(([key]) => key)
    .sort();
  const expectedFailedCriteria = Object.entries(criteria)
    .filter(([, passed]) => !passed)
    .map(([key]) => key)
    .sort();
  const passedCriteria = Array.isArray(gate.passedCriteria)
    ? gate.passedCriteria.map((value) => stringValue(value)).filter(Boolean).sort()
    : [];
  const failedCriteria = Array.isArray(gate.failedCriteria)
    ? gate.failedCriteria.map((value) => stringValue(value)).filter(Boolean).sort()
    : [];
  if (passedCriteria.join("|") !== expectedPassedCriteria.join("|")) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate passedCriteria mismatch: expected ${expectedPassedCriteria.join(";")}, got ${passedCriteria.join(";")}`,
    );
  }
  if (failedCriteria.join("|") !== expectedFailedCriteria.join("|")) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate failedCriteria mismatch: expected ${expectedFailedCriteria.join(";")}, got ${failedCriteria.join(";")}`,
    );
  }
  const distributionBlocked = !criteria.proof_package_distributed;
  const receiptBlocked =
    !criteria.required_platform_receipts || !criteria.no_blocking_cross_platform_issues;
  const expectedGateStatus =
    distributionBlocked || receiptBlocked
      ? "blocked"
      : expectedFailedCriteria.length > 0
        ? "watch"
        : "passed";
  const expectedReleaseStatus = distributionBlocked
    ? "blocked_by_distribution"
    : receiptBlocked
      ? "blocked_by_proof_receipt"
      : expectedGateStatus === "watch"
        ? "watch_proof_receipt"
        : "ready_for_final_archive";
  if (stringValue(gate.gateStatus) !== expectedGateStatus) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate status mismatch: expected ${expectedGateStatus}, got ${stringValue(gate.gateStatus)}`,
    );
  }
  if (stringValue(gate.releaseStatus) !== expectedReleaseStatus) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate release status mismatch: expected ${expectedReleaseStatus}, got ${stringValue(gate.releaseStatus)}`,
    );
  }
  const csvRow = csvRows[0] ?? {};
  if (csvRows.length === 1) {
    const csvChecks = [
      ["gate_status", gate.gateStatus],
      ["release_status", gate.releaseStatus],
      ["required_platform_count", gate.requiredPlatformCount],
      ["platform_count", gate.platformCount],
      ["distribution_required_count", gate.distributionRequiredCount],
      ["distribution_sent_count", gate.distributionSentCount],
      ["issue_count", gate.issueCount],
      ["blocking_issue_count", gate.blockingIssueCount],
      ["warning_issue_count", gate.warningIssueCount],
    ];
    for (const [field, expected] of csvChecks) {
      if (stringValue(csvRow[field]) !== stringValue(expected)) {
        errors.push(
          `archive transfer final acceptance ingest risk final proof package distribution release gate CSV ${field} mismatch: expected ${stringValue(expected)}, got ${stringValue(csvRow[field])}`,
        );
      }
    }
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final proof package distribution release gate",
    errors,
  );
  const gateFingerprint = stringValue(gate.gateFingerprint);
  if (!gateFingerprint) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution release gate missing gateFingerprint",
    );
  } else {
    const {
      markdown,
      csv,
      json,
      gateFingerprint: _gateFingerprint,
      ...fingerprintBody
    } = gate;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== gateFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate fingerprint mismatch: expected ${gateFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function expectedArchiveTransferProofDistributionReleaseGateBatchSignoffStatus(gate, signoff) {
  const gateStatus = stringValue(gate?.gateStatus);
  const conclusion = stringValue(signoff?.conclusion);
  if (gateStatus === "blocked" || conclusion === "needs_rework") return "blocked";
  if (conclusion === "pending_review" || !stringValue(signoff?.reviewer)) return "pending";
  if (gateStatus === "watch" || conclusion === "approved_with_comments") {
    return "signed_with_actions";
  }
  return "signed";
}

function expectedArchiveTransferProofDistributionReleaseGateBatchSignoffRowStatus(
  gate,
  row,
  signoff,
) {
  const conclusion = stringValue(signoff?.conclusion);
  if (
    stringValue(gate?.gateStatus) === "blocked" ||
    stringValue(row.severity) === "blocking" ||
    conclusion === "needs_rework"
  ) {
    return "blocked";
  }
  if (conclusion === "pending_review" || !stringValue(signoff?.reviewer)) return "pending";
  if (
    stringValue(gate?.gateStatus) === "watch" ||
    stringValue(row.severity) === "warning" ||
    conclusion === "approved_with_comments"
  ) {
    return "signed_with_actions";
  }
  return "signed";
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff(
  signoff,
  csvRows,
  gate,
  crossPlatformReview,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!signoff) return;
  if (
    signoff.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoff.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff schema mismatch: ${signoff.schema}`,
    );
  }
  const rows = Array.isArray(signoff.rows) ? signoff.rows : [];
  if (!Array.isArray(signoff.rows)) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff rows must be an array",
    );
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (gate && stringValue(signoff.sourceReleaseGateFingerprint) !== stringValue(gate.gateFingerprint)) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff gate fingerprint mismatch: expected ${stringValue(gate.gateFingerprint)}, got ${stringValue(signoff.sourceReleaseGateFingerprint)}`,
    );
  }
  if (
    gate &&
    stringValue(signoff.sourceDistributionFingerprint) !==
      stringValue(gate.sourceDistributionFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff distribution fingerprint mismatch: expected ${stringValue(gate.sourceDistributionFingerprint)}, got ${stringValue(signoff.sourceDistributionFingerprint)}`,
    );
  }
  if (
    crossPlatformReview &&
    stringValue(signoff.sourceCrossPlatformReviewFingerprint) !==
      stringValue(crossPlatformReview.reviewFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff cross-platform review fingerprint mismatch: expected ${stringValue(crossPlatformReview.reviewFingerprint)}, got ${stringValue(signoff.sourceCrossPlatformReviewFingerprint)}`,
    );
  }
  if (gate && stringValue(signoff.gateStatus) !== stringValue(gate.gateStatus)) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff gateStatus mismatch: expected ${stringValue(gate.gateStatus)}, got ${stringValue(signoff.gateStatus)}`,
    );
  }
  if (gate && stringValue(signoff.releaseStatus) !== stringValue(gate.releaseStatus)) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff releaseStatus mismatch: expected ${stringValue(gate.releaseStatus)}, got ${stringValue(signoff.releaseStatus)}`,
    );
  }
  const sourceReceiptFingerprints = Array.isArray(signoff.sourceReceiptFingerprints)
    ? signoff.sourceReceiptFingerprints.map((value) => stringValue(value)).filter(Boolean).sort()
    : [];
  const expectedReceiptFingerprints = Array.isArray(crossPlatformReview?.sourceReceiptFingerprints)
    ? crossPlatformReview.sourceReceiptFingerprints
        .map((value) => stringValue(value))
        .filter(Boolean)
        .sort()
    : [];
  if (sourceReceiptFingerprints.join("|") !== expectedReceiptFingerprints.join("|")) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff receipt fingerprints mismatch",
    );
  }
  const signedFileCount = rows.filter((row) => stringValue(row.signatureStatus) === "signed").length;
  const actionFileCount = rows.filter(
    (row) => stringValue(row.signatureStatus) === "signed_with_actions",
  ).length;
  const blockingFileCount = rows.filter((row) => stringValue(row.signatureStatus) === "blocked").length;
  const countChecks = [
    ["fileCount", rows.length],
    ["signedFileCount", signedFileCount],
    ["actionFileCount", actionFileCount],
    ["blockingFileCount", blockingFileCount],
  ];
  for (const [field, expected] of countChecks) {
    if (numberValue(signoff[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff ${field} mismatch: expected ${expected}, got ${signoff[field]}`,
      );
    }
  }
  const expectedSignatureStatus =
    expectedArchiveTransferProofDistributionReleaseGateBatchSignoffStatus(gate, signoff.signoff);
  if (stringValue(signoff.signatureStatus) !== expectedSignatureStatus) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff signatureStatus mismatch: expected ${expectedSignatureStatus}, got ${stringValue(signoff.signatureStatus)}`,
    );
  }
  const reviewRows = Array.isArray(crossPlatformReview?.rows) ? crossPlatformReview.rows : [];
  for (const row of rows) {
    const reviewRow = reviewRows.find(
      (item) =>
        stringValue(item.distributionId) === stringValue(row.distributionId) &&
        stringValue(item.filePath) === stringValue(row.filePath),
    );
    if (!reviewRow) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff source review row missing for ${stringValue(row.distributionId) || stringValue(row.filePath)}`,
      );
      continue;
    }
    const expectedRowStatus =
      expectedArchiveTransferProofDistributionReleaseGateBatchSignoffRowStatus(
        gate,
        reviewRow,
        signoff.signoff,
      );
    if (stringValue(row.signatureStatus) !== expectedRowStatus) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff row status mismatch for ${stringValue(row.distributionId) || stringValue(row.filePath)}: expected ${expectedRowStatus}, got ${stringValue(row.signatureStatus)}`,
      );
    }
    if (stringValue(row.reviewStatus) !== stringValue(reviewRow.reviewStatus)) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff row review status mismatch for ${stringValue(row.distributionId) || stringValue(row.filePath)}`,
      );
    }
  }
  for (const row of rows) {
    const csvRow = csvRows.find(
      (item) =>
        stringValue(item.distribution_id) === stringValue(row.distributionId) &&
        stringValue(item.file_path) === stringValue(row.filePath),
    );
    if (!csvRow) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff CSV missing row for ${stringValue(row.distributionId) || stringValue(row.filePath)}`,
      );
    } else if (stringValue(csvRow.signature_status) !== stringValue(row.signatureStatus)) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff CSV signature status mismatch for ${stringValue(row.distributionId) || stringValue(row.filePath)}`,
      );
    }
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff",
    errors,
  );
  const signoffFingerprint = stringValue(signoff.signoffFingerprint);
  if (!signoffFingerprint) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff missing signoffFingerprint",
    );
  } else {
    const {
      markdown,
      csv,
      json,
      signoffFingerprint: _signoffFingerprint,
      ...fingerprintBody
    } = signoff;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== signoffFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff fingerprint mismatch: expected ${signoffFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt(
  receipt,
  csvRows,
  signoff,
  gate,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!receipt) return;
  if (
    receipt.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionReleaseGateBatchSignoffExternalSyncReceipt.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt schema mismatch: ${receipt.schema}`,
    );
  }
  const rows = Array.isArray(receipt.rows) ? receipt.rows : [];
  if (!Array.isArray(receipt.rows)) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt rows must be an array",
    );
  } else if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (signoff && stringValue(receipt.sourceSignoffFingerprint) !== stringValue(signoff.signoffFingerprint)) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt signoff fingerprint mismatch: expected ${stringValue(signoff.signoffFingerprint)}, got ${stringValue(receipt.sourceSignoffFingerprint)}`,
    );
  }
  if (
    signoff &&
    stringValue(receipt.sourceReleaseGateFingerprint) !==
      stringValue(signoff.sourceReleaseGateFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt source release gate mismatch: expected ${stringValue(signoff.sourceReleaseGateFingerprint)}, got ${stringValue(receipt.sourceReleaseGateFingerprint)}`,
    );
  }
  if (gate && stringValue(receipt.sourceReleaseGateFingerprint) !== stringValue(gate.gateFingerprint)) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt gate fingerprint mismatch: expected ${stringValue(gate.gateFingerprint)}, got ${stringValue(receipt.sourceReleaseGateFingerprint)}`,
    );
  }
  if (
    signoff &&
    stringValue(receipt.sourceCrossPlatformReviewFingerprint) !==
      stringValue(signoff.sourceCrossPlatformReviewFingerprint)
  ) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt cross-platform review fingerprint mismatch",
    );
  }
  const acceptedCount = rows.filter((row) => stringValue(row.reconciliationStatus) === "accepted").length;
  const rejectedCount = rows.filter((row) => stringValue(row.reconciliationStatus) === "rejected").length;
  const pendingCount = rows.filter((row) => stringValue(row.reconciliationStatus) === "pending").length;
  const skippedCount = rows.filter((row) => stringValue(row.reconciliationStatus) === "skipped").length;
  const missingReceiptCount = rows.filter(
    (row) => stringValue(row.reconciliationStatus) === "missing_receipt",
  ).length;
  const unmatchedReceiptCount = rows.filter(
    (row) => stringValue(row.reconciliationStatus) === "unmatched_receipt",
  ).length;
  const invalidAcceptedCount = rows.filter((row) => Boolean(row.invalidAccepted)).length;
  const countChecks = [
    ["rowCount", rows.length],
    ["acceptedCount", acceptedCount],
    ["rejectedCount", rejectedCount],
    ["pendingCount", pendingCount],
    ["skippedCount", skippedCount],
    ["missingReceiptCount", missingReceiptCount],
    ["unmatchedReceiptCount", unmatchedReceiptCount],
    ["invalidAcceptedCount", invalidAcceptedCount],
    [
      "followUpCount",
      rejectedCount + pendingCount + missingReceiptCount + unmatchedReceiptCount + invalidAcceptedCount,
    ],
  ];
  if (signoff && numberValue(receipt.fileCount) !== numberValue(signoff.fileCount)) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt fileCount mismatch: expected ${signoff.fileCount}, got ${receipt.fileCount}`,
    );
  }
  for (const [field, expected] of countChecks) {
    if (numberValue(receipt[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt ${field} mismatch: expected ${expected}, got ${receipt[field]}`,
      );
    }
  }
  const signoffRows = Array.isArray(signoff?.rows) ? signoff.rows : [];
  for (const signoffRow of signoffRows) {
    const row = rows.find(
      (item) =>
        stringValue(item.distributionId) === stringValue(signoffRow.distributionId) &&
        stringValue(item.filePath) === stringValue(signoffRow.filePath),
    );
    if (!row) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt missing row for ${stringValue(signoffRow.distributionId) || stringValue(signoffRow.filePath)}`,
      );
      continue;
    }
    if (stringValue(row.signatureStatus) !== stringValue(signoffRow.signatureStatus)) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt signature status mismatch for ${stringValue(signoffRow.distributionId) || stringValue(signoffRow.filePath)}`,
      );
    }
    const expectedInvalidAccepted =
      stringValue(row.reconciliationStatus) === "accepted" &&
      ["blocked", "pending"].includes(stringValue(signoffRow.signatureStatus));
    if (Boolean(row.invalidAccepted) !== expectedInvalidAccepted) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt invalidAccepted mismatch for ${stringValue(signoffRow.distributionId) || stringValue(signoffRow.filePath)}`,
      );
    }
  }
  for (const row of rows) {
    const csvRow = csvRows.find(
      (item) =>
        stringValue(item.distribution_id) === stringValue(row.distributionId) &&
        stringValue(item.file_path) === stringValue(row.filePath),
    );
    if (!csvRow) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt CSV missing row for ${stringValue(row.distributionId) || stringValue(row.filePath)}`,
      );
    } else {
      if (stringValue(csvRow.reconciliation_status) !== stringValue(row.reconciliationStatus)) {
        errors.push(
          `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt CSV reconciliation status mismatch for ${stringValue(row.distributionId) || stringValue(row.filePath)}`,
        );
      }
      const csvInvalidAccepted = ["yes", "true", "1"].includes(
        stringValue(csvRow.invalid_accepted).toLowerCase(),
      );
      if (csvInvalidAccepted !== Boolean(row.invalidAccepted)) {
        errors.push(
          `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt CSV invalid accepted mismatch for ${stringValue(row.distributionId) || stringValue(row.filePath)}`,
        );
      }
    }
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff-external-sync-receipt.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff-external-sync-receipt.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-release-gate-batch-signoff-external-sync-receipt.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt",
    errors,
  );
  const receiptFingerprint = stringValue(receipt.receiptFingerprint);
  if (!receiptFingerprint) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt missing receiptFingerprint",
    );
  } else {
    const {
      markdown,
      csv,
      json,
      receiptFingerprint: _receiptFingerprint,
      ...fingerprintBody
    } = receipt;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== receiptFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution release gate batch signoff external sync receipt fingerprint mismatch: expected ${receiptFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison(
  comparison,
  csvRows,
  fileCsvRows,
  currentProofPackage,
  distribution,
  distributionReceipt,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!comparison) return;
  if (
    comparison.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageVersionComparison.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package version comparison schema mismatch: ${comparison.schema}`,
    );
  }
  const rows = Array.isArray(comparison.rows) ? comparison.rows : [];
  const fileRows = Array.isArray(comparison.fileRows) ? comparison.fileRows : [];
  if (!Array.isArray(comparison.rows)) {
    errors.push("archive transfer final acceptance ingest risk final proof package version comparison rows must be an array");
  }
  if (!Array.isArray(comparison.fileRows)) {
    errors.push("archive transfer final acceptance ingest risk final proof package version comparison fileRows must be an array");
  }
  if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package version comparison CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (fileCsvRows.length !== fileRows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package version comparison file CSV row count mismatch: expected ${fileRows.length}, got ${fileCsvRows.length}`,
    );
  }
  if (
    currentProofPackage &&
    stringValue(comparison.sourceCurrentProofFingerprint) !==
      stringValue(currentProofPackage.proofFingerprint)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package version comparison current proof fingerprint mismatch: expected ${stringValue(currentProofPackage.proofFingerprint)}, got ${stringValue(comparison.sourceCurrentProofFingerprint)}`,
    );
  }
  if (
    currentProofPackage &&
    stringValue(comparison.currentProofStatus) !== stringValue(currentProofPackage.proofStatus)
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package version comparison current proof status mismatch: expected ${stringValue(currentProofPackage.proofStatus)}, got ${stringValue(comparison.currentProofStatus)}`,
    );
  }
  if (
    distribution &&
    stringValue(comparison.sourcePreviousDistributionFingerprint) ===
      stringValue(distribution.distributionFingerprint) &&
    stringValue(comparison.sourceCurrentProofFingerprint) !== stringValue(distribution.sourceProofFingerprint)
  ) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package version comparison distribution proof fingerprint mismatch",
    );
  }
  if (
    distributionReceipt &&
    stringValue(comparison.sourcePreviousDistributionReceiptFingerprint) ===
      stringValue(distributionReceipt.receiptFingerprint) &&
    stringValue(comparison.sourcePreviousDistributionFingerprint) &&
    stringValue(comparison.sourcePreviousDistributionFingerprint) !==
      stringValue(distributionReceipt.sourceDistributionFingerprint)
  ) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package version comparison distribution receipt source mismatch",
    );
  }
  const expectedCounts = [
    ["artifactCount", rows.length],
    ["changedArtifactCount", rows.filter((row) => stringValue(row.changeStatus) === "changed").length],
    ["unchangedArtifactCount", rows.filter((row) => stringValue(row.changeStatus) === "unchanged").length],
    ["addedArtifactCount", rows.filter((row) => stringValue(row.changeStatus) === "added").length],
    ["removedArtifactCount", rows.filter((row) => stringValue(row.changeStatus) === "removed").length],
    [
      "statusChangedCount",
      rows.filter(
        (row) =>
          stringValue(row.previousHandoverStatus) &&
          stringValue(row.currentHandoverStatus) &&
          stringValue(row.previousHandoverStatus) !== stringValue(row.currentHandoverStatus),
      ).length,
    ],
    [
      "redistributionFileCount",
      fileRows.filter((row) => stringValue(row.redistributionStatus) === "needs_redistribution").length,
    ],
    [
      "obsoleteReceiptCount",
      fileRows.filter(
        (row) =>
          stringValue(row.redistributionStatus) === "needs_redistribution" &&
          stringValue(row.previousReceiptStatus),
      ).length,
    ],
  ];
  for (const [field, expected] of expectedCounts) {
    if (numberValue(comparison[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package version comparison ${field} mismatch: expected ${expected}, got ${comparison[field]}`,
      );
    }
  }
  for (const row of rows) {
    const artifactKey = stringValue(row.artifactKey);
    if (!artifactKey) {
      errors.push("archive transfer final acceptance ingest risk final proof package version comparison row missing artifactKey");
    }
    const csvRow = csvRows.find((item) => stringValue(item.artifact_key) === artifactKey);
    if (!csvRow) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package version comparison CSV missing row for ${artifactKey}`,
      );
    } else {
      if (stringValue(csvRow.change_status) !== stringValue(row.changeStatus)) {
        errors.push(
          `archive transfer final acceptance ingest risk final proof package version comparison CSV change status mismatch for ${artifactKey}`,
        );
      }
      const rowRedistribution =
        row.redistributionRequired === true || stringValue(row.redistributionRequired) === "true";
      if (stringValue(csvRow.redistribution_required) !== (rowRedistribution ? "yes" : "no")) {
        errors.push(
          `archive transfer final acceptance ingest risk final proof package version comparison CSV redistribution flag mismatch for ${artifactKey}`,
        );
      }
    }
  }
  for (const row of fileRows) {
    const filePath = stringValue(row.filePath);
    const csvRow = fileCsvRows.find((item) => stringValue(item.file_path) === filePath);
    if (!csvRow) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package version comparison file CSV missing row for ${filePath}`,
      );
    } else if (stringValue(csvRow.redistribution_status) !== stringValue(row.redistributionStatus)) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package version comparison file CSV redistribution status mismatch for ${filePath}`,
      );
    }
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-version-comparison.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-version-comparison.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-version-comparison-files.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-version-comparison.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final proof package version comparison",
    errors,
  );
  const comparisonFingerprint = stringValue(comparison.comparisonFingerprint);
  if (!comparisonFingerprint) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package version comparison missing comparisonFingerprint",
    );
  } else {
    const {
      markdown,
      csv,
      fileCsv,
      json,
      comparisonFingerprint: _comparisonFingerprint,
      ...fingerprintBody
    } = comparison;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== comparisonFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package version comparison fingerprint mismatch: expected ${comparisonFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger(
  ledger,
  csvRows,
  distribution,
  distributionReceipt,
  versionComparison,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!ledger) return;
  if (
    ledger.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationLedger.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution rectification ledger schema mismatch: ${ledger.schema}`,
    );
  }
  const rows = Array.isArray(ledger.rows) ? ledger.rows : [];
  if (!Array.isArray(ledger.rows)) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution rectification ledger rows must be an array",
    );
  }
  if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution rectification ledger CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    versionComparison &&
    stringValue(ledger.sourceComparisonFingerprint) !== stringValue(versionComparison.comparisonFingerprint)
  ) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution rectification ledger comparison fingerprint mismatch",
    );
  }
  if (
    distributionReceipt &&
    stringValue(ledger.sourceReceiptFingerprint) === stringValue(distributionReceipt.receiptFingerprint) &&
    stringValue(ledger.sourceDistributionFingerprint) !== stringValue(distributionReceipt.sourceDistributionFingerprint)
  ) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution rectification ledger receipt source mismatch",
    );
  }
  if (
    distribution &&
    stringValue(ledger.sourceDistributionFingerprint) === stringValue(distribution.distributionFingerprint) &&
    stringValue(ledger.sourceProofFingerprint) !== stringValue(distribution.sourceProofFingerprint)
  ) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution rectification ledger proof fingerprint mismatch",
    );
  }
  const expectedCounts = [
    ["issueCount", rows.length],
    ["openIssueCount", rows.filter((row) => stringValue(row.closureStatus) === "open").length],
    ["closedIssueCount", rows.filter((row) => stringValue(row.closureStatus) === "closed").length],
    ["criticalIssueCount", rows.filter((row) => stringValue(row.severity) === "critical").length],
    ["warningIssueCount", rows.filter((row) => stringValue(row.severity) === "warning").length],
    ["noticeIssueCount", rows.filter((row) => stringValue(row.severity) === "notice").length],
    [
      "receiptIssueCount",
      rows.filter((row) =>
        ["rejected_receipt", "pending_receipt", "missing_receipt", "unmatched_receipt"].includes(
          stringValue(row.issueType),
        ),
      ).length,
    ],
    [
      "redistributionIssueCount",
      rows.filter((row) => stringValue(row.issueType) === "needs_redistribution").length,
    ],
    [
      "blockedDistributionIssueCount",
      rows.filter((row) =>
        ["blocked_distribution", "review_before_distribution"].includes(stringValue(row.issueType)),
      ).length,
    ],
  ];
  for (const [field, expected] of expectedCounts) {
    if (numberValue(ledger[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution rectification ledger ${field} mismatch: expected ${expected}, got ${ledger[field]}`,
      );
    }
  }
  for (const row of rows) {
    const rectificationId = stringValue(row.rectificationId);
    if (!rectificationId) {
      errors.push(
        "archive transfer final acceptance ingest risk final proof package distribution rectification ledger row missing rectificationId",
      );
      continue;
    }
    const csvRow = csvRows.find((item) => stringValue(item.rectification_id) === rectificationId);
    if (!csvRow) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution rectification ledger CSV missing row for ${rectificationId}`,
      );
    } else if (stringValue(csvRow.issue_type) !== stringValue(row.issueType)) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution rectification ledger CSV issue type mismatch for ${rectificationId}`,
      );
    }
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-ledger.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-ledger.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-ledger.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final proof package distribution rectification ledger",
    errors,
  );
  const ledgerFingerprint = stringValue(ledger.ledgerFingerprint);
  if (!ledgerFingerprint) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution rectification ledger missing ledgerFingerprint",
    );
  } else {
    const {
      markdown,
      csv,
      json,
      ledgerFingerprint: _ledgerFingerprint,
      ...fingerprintBody
    } = ledger;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify(fingerprintBody));
    if (computedFingerprint !== ledgerFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution rectification ledger fingerprint mismatch: expected ${ledgerFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArchiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate(
  update,
  csvRows,
  ledger,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  errors,
) {
  if (!update) return;
  if (
    update.schema !==
    "railwise.engineering.batch.archiveTransferFinalAcceptanceIngestRiskFinalProofPackageDistributionRectificationClosureUpdate.v1"
  ) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution rectification closure update schema mismatch: ${update.schema}`,
    );
  }
  const rows = Array.isArray(update.rows) ? update.rows : [];
  if (!Array.isArray(update.rows)) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution rectification closure update rows must be an array",
    );
  }
  if (csvRows.length !== rows.length) {
    errors.push(
      `archive transfer final acceptance ingest risk final proof package distribution rectification closure update CSV row count mismatch: expected ${rows.length}, got ${csvRows.length}`,
    );
  }
  if (
    ledger &&
    stringValue(update.sourceLedgerFingerprint) !== stringValue(ledger.ledgerFingerprint) &&
    stringValue(update.updatedLedgerFingerprint) !== stringValue(ledger.ledgerFingerprint)
  ) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution rectification closure update source ledger fingerprint mismatch",
    );
  }
  if (
    update.updatedLedger &&
    stringValue(update.updatedLedgerFingerprint) !== stringValue(update.updatedLedger.ledgerFingerprint)
  ) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution rectification closure update updated ledger fingerprint mismatch",
    );
  }
  const updatedRows = Array.isArray(update.updatedLedger?.rows) ? update.updatedLedger.rows : [];
  const expectedCounts = [
    ["closedCount", updatedRows.filter((row) => stringValue(row.closureStatus) === "closed").length],
    ["stillOpenCount", updatedRows.filter((row) => stringValue(row.closureStatus) === "open").length],
    ["missingUpdateCount", rows.filter((row) => stringValue(row.updateStatus) === "missing_update").length],
    ["unmatchedUpdateCount", rows.filter((row) => stringValue(row.updateStatus) === "unmatched_update").length],
  ];
  for (const [field, expected] of expectedCounts) {
    if (numberValue(update[field]) !== expected) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution rectification closure update ${field} mismatch: expected ${expected}, got ${update[field]}`,
      );
    }
  }
  for (const row of rows) {
    const rectificationId = stringValue(row.rectificationId);
    const csvRow = csvRows.find(
      (item) =>
        stringValue(item.rectification_id) === rectificationId &&
        stringValue(item.update_status) === stringValue(row.updateStatus),
    );
    if (!csvRow) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution rectification closure update CSV missing row for ${rectificationId || stringValue(row.filePath)}`,
      );
    }
  }
  validateArtifactCoverage(
    [
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-closure-update.md",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-closure-update.csv",
      "batch/archive-transfer-final-acceptance-ingest-risk-final-proof-package-distribution-rectification-closure-update.json",
    ],
    manifest,
    externalUploadManifest,
    externalSystemUploadRows,
    "archive transfer final acceptance ingest risk final proof package distribution rectification closure update",
    errors,
  );
  const updateFingerprint = stringValue(update.updateFingerprint);
  if (!updateFingerprint) {
    errors.push(
      "archive transfer final acceptance ingest risk final proof package distribution rectification closure update missing updateFingerprint",
    );
  } else {
    const {
      markdown,
      csv,
      json,
      updateFingerprint: _updateFingerprint,
      ...fingerprintBody
    } = update;
    const computedFingerprint = fnv1a32Fingerprint(JSON.stringify({ ...fingerprintBody, csv }));
    if (computedFingerprint !== updateFingerprint) {
      errors.push(
        `archive transfer final acceptance ingest risk final proof package distribution rectification closure update fingerprint mismatch: expected ${updateFingerprint}, got ${computedFingerprint}`,
      );
    }
  }
}

function validateArtifactCoverage(
  paths,
  manifest,
  externalUploadManifest,
  externalSystemUploadRows,
  label,
  errors,
) {
  const manifestPaths = manifestEntryPaths(manifest);
  const uploadPaths = externalUploadFilePaths(externalUploadManifest);
  const externalRowPaths = unique(
    externalSystemUploadRows.map((row) => stringValue(row.file_path)).filter(Boolean),
  );
  for (const path of paths) {
    if (!manifestPaths.includes(path)) {
      errors.push(`${label} manifest missing entry: ${path}`);
    }
    if (!uploadPaths.includes(path)) {
      errors.push(`${label} external upload manifest missing file: ${path}`);
    }
    if (!externalRowPaths.includes(path)) {
      errors.push(`${label} external system upload rows missing file: ${path}`);
    }
  }
}

function externalUploadFieldKeys(manifest, csvRows) {
  const jsonKeys = Array.isArray(manifest?.uploadFields)
    ? manifest.uploadFields.map((field) => stringValue(field.fieldKey)).filter(Boolean)
    : [];
  const csvKeys = csvRows.map((row) => stringValue(row.field_key)).filter(Boolean);
  return unique([...jsonKeys, ...csvKeys]);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows.filter((item) => item.some((value) => value !== ""));
  if (!headers) return [];
  return dataRows.map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    return record;
  });
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32Hex(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

function fnv1a32Fingerprint(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function buildArchiveAcceptanceReview({
  checkedAt,
  archivePath,
  archiveName,
  errors,
  archiveReleaseRecord,
  archiveReleaseDeliveryReadiness,
}) {
  const verifierErrorRows = errors.map((error, index) => ({
    gateId: `verifier_error_${String(index + 1).padStart(3, "0")}`,
    gateName: "归档包校验错误",
    evidencePath: archiveName || archivePath || "archive.zip",
    evidenceStatus: "invalid",
    required: true,
    sourceFingerprint: "",
    remediationPath: "重新生成完整归档 ZIP",
    action: `修复校验错误：${error}`,
  }));
  const readinessRows = Array.isArray(archiveReleaseDeliveryReadiness?.rows)
    ? archiveReleaseDeliveryReadiness.rows.map((row) => {
        const readinessStatus = stringValue(row.readinessStatus);
        const evidenceStatus =
          readinessStatus === "ready" ? "verified" : readinessStatus || "invalid";
        const evidencePath = stringValue(row.artifactPath);
        return {
          gateId: stringValue(row.checkpointId),
          gateName: stringValue(row.checkpointName),
          evidencePath,
          evidenceStatus,
          required: Boolean(row.required),
          sourceFingerprint: stringValue(row.sourceFingerprint),
          remediationPath: evidenceStatus === "verified" ? "" : evidencePath || "补齐对应归档成果",
          action: stringValue(row.action),
        };
      })
    : [
        {
          gateId: "archive_release_delivery_readiness",
          gateName: "归档发布交付就绪清单",
          evidencePath: "batch/archive-release-delivery-readiness.json",
          evidenceStatus: "missing",
          required: true,
          sourceFingerprint: "",
          remediationPath: "batch/archive-release-delivery-readiness.json",
          action: "缺少交付就绪清单，需由工程分析工作台重新生成归档包。",
        },
      ];
  const rows = [...verifierErrorRows, ...readinessRows];
  const invalidIssueCount = rows.filter((row) => row.evidenceStatus === "invalid").length;
  const missingIssueCount = rows.filter((row) => row.evidenceStatus === "missing").length;
  const actionIssueCount = rows.filter((row) => row.evidenceStatus === "action_required").length;
  const verifiedGateCount = rows.filter((row) => row.evidenceStatus === "verified").length;
  const readinessStatus = stringValue(archiveReleaseDeliveryReadiness?.overallStatus);
  const handoverDecision =
    invalidIssueCount > 0 || missingIssueCount > 0 || readinessStatus === "blocked"
      ? "reject"
      : readinessStatus === "handover_with_actions" || actionIssueCount > 0
        ? "conditional_acceptance"
        : "accept";
  const nextActions = [];
  if (invalidIssueCount > 0) {
    nextActions.push("归档包存在校验错误，需由提交方重新生成 ZIP 后再验收。");
  }
  if (missingIssueCount > 0) {
    nextActions.push("补齐所有 missing 关口成果，并重新生成归档 ZIP 与校验报告。");
  }
  if (handoverDecision === "conditional_acceptance") {
    nextActions.push("交接单需列明所有 action_required 关口、责任人和补充回执期限。");
    nextActions.push("接收后按补件路径反查原始成果，完成处置后重新运行归档校验。");
  }
  if (nextActions.length === 0) {
    nextActions.push("按发布版本、发布指纹和清单指纹完成归档接收登记。");
  }
  const body = {
    schema: "railwise.engineeringArchive.acceptanceReview.v1",
    checkedAt,
    archivePath,
    archiveName,
    handoverDecision,
    acceptanceStatusLabel:
      handoverDecision === "accept"
        ? "可接收"
        : handoverDecision === "conditional_acceptance"
          ? "带条件接收"
          : "拒收",
    releaseVersion: stringValue(
      archiveReleaseRecord?.releaseVersion || archiveReleaseDeliveryReadiness?.releaseVersion,
    ),
    releaseFingerprint: stringValue(
      archiveReleaseRecord?.releaseFingerprint ||
        archiveReleaseDeliveryReadiness?.releaseFingerprint,
    ),
    readinessFingerprint: stringValue(archiveReleaseDeliveryReadiness?.readinessFingerprint),
    readinessOverallStatus: readinessStatus,
    verifiedGateCount,
    actionIssueCount,
    missingIssueCount,
    invalidIssueCount,
    blockingIssueCount:
      invalidIssueCount + missingIssueCount + (readinessStatus === "blocked" ? 1 : 0),
    nextActions,
    rows,
  };
  return {
    ...body,
    acceptanceFingerprint: fnv1a32Fingerprint(JSON.stringify(body)),
  };
}

function printHumanReport(report) {
  const state = report.success ? "OK" : "FAIL";
  console.log(`Railwise engineering archive verification [${state}]`);
  console.log(`Archive: ${report.archivePath || "(not provided)"}`);
  console.log(`Checked: ${report.checkedAt}`);
  console.log(
    `Summary: ${report.summary.entryCount} entries, ${report.summary.checksumRowsChecked} checksum rows, ${report.summary.errors} errors, ${report.summary.warnings} warnings`,
  );
  if (report.archiveManifest?.batchName) {
    console.log(`Batch: ${report.archiveManifest.batchName}`);
  }
  if (report.externalUploadManifest?.archiveFolderName) {
    console.log(`Archive folder: ${report.externalUploadManifest.archiveFolderName}`);
  }
  if (report.acceptanceReview) {
    console.log(
      `Acceptance: ${report.acceptanceReview.acceptanceStatusLabel} (${report.acceptanceReview.handoverDecision})`,
    );
    for (const action of report.acceptanceReview.nextActions ?? []) {
      console.log(`Next action: ${action}`);
    }
  }
  if (report.archiveAcceptanceRemediationRecheckUpdate) {
    console.log(
      `Recheck: ${report.archiveAcceptanceRemediationRecheckUpdate.recheckStatusLabel} (${report.archiveAcceptanceRemediationRecheckUpdate.recheckDecision}), closed ${report.archiveAcceptanceRemediationRecheckUpdate.closedCount}, open ${report.archiveAcceptanceRemediationRecheckUpdate.stillOpenCount}`,
    );
  }
  if (report.archiveAcceptanceFinalRegistration) {
    console.log(
      `Final registration: ${report.archiveAcceptanceFinalRegistration.registrationStatus} (${report.archiveAcceptanceFinalRegistration.registrationId})`,
    );
    console.log(
      `Receipt: ${report.archiveAcceptanceFinalRegistration.signedReceipt?.signatureStatus ?? "missing"}`,
    );
  }
  for (const warning of report.warnings) {
    console.log(`[WARN] ${warning}`);
  }
  for (const error of report.errors) {
    console.log(`[ERR] ${error}`);
  }
}

function stringValue(value) {
  return typeof value === "string"
    ? value
    : value === null || value === undefined
      ? ""
      : String(value);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function unique(values) {
  return [...new Set(values)];
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(USAGE.trim());
    return;
  }

  let report;
  try {
    report = verifyArchive(parsed.archivePath);
  } catch (error) {
    report = failedReport(
      parsed.archivePath,
      error instanceof Error ? error.message : String(error),
    );
  }

  if (parsed.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  if (parsed.requireClean && !report.success) {
    process.exitCode = 1;
  }
}

main();
