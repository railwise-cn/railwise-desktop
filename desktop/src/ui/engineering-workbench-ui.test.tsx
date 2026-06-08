import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { inflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EngineeringWorkbench,
  buildEngineeringBatchArchiveZipExport,
  buildEngineeringDeliverables,
  loadEngineeringSampleInput,
  runEngineeringCalculation,
} from "./engineering-workbench";

const ZIP_HISTORY_STORAGE_KEY = "railwise.engineeringArchive.importReviewHistory";

function installLocalStorageStub() {
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    },
  });
}

function seedArchiveZipImportReviewHistory() {
  window.localStorage.setItem(
    ZIP_HISTORY_STORAGE_KEY,
    JSON.stringify({
      schema: "railwise.engineeringArchive.importReviewHistory.v1",
      generatedAt: "2026-06-03T08:05:00.000Z",
      records: [
        {
          recordId: "zip-history-rejected-001",
          recordedAt: "2026-06-03T08:05:00.000Z",
          checkedAt: "2026-06-03T08:00:00.000Z",
          archiveName: "tampered-project.zip",
          operator: "李工",
          sourcePath: "/archives/tampered.zip",
          acceptanceDecision: "reject",
          acceptanceStatusLabel: "拒收",
          success: false,
          entryCount: 18,
          requiredEntriesMissing: 1,
          manifestMismatchCount: 2,
          checksumMismatchCount: 7,
          errorCount: 3,
          warningCount: 4,
          releaseVersion: "RW-2026.06-A",
          releaseFingerprint: "rel-fp-001",
          readinessFingerprint: "ready-fp-001",
          reportFingerprint: "report-fp-001",
          issueSummary: "Checksum 校验失败",
        },
      ],
    }),
  );
}

function archiveZipHistoryJson() {
  return JSON.stringify({
    schema: "railwise.engineeringArchive.importReviewHistory.v1",
    generatedAt: "2026-06-03T08:05:00.000Z",
    records: [
      {
        recordId: "zip-history-imported-rejected-001",
        recordedAt: "2026-06-03T08:05:00.000Z",
        checkedAt: "2026-06-03T08:00:00.000Z",
        archiveName: "external-rejected.zip",
        operator: "外部验收员B",
        sourcePath: "/external/rejected.zip",
        acceptanceDecision: "reject",
        acceptanceStatusLabel: "拒收",
        success: false,
        entryCount: 18,
        requiredEntriesMissing: 1,
        manifestMismatchCount: 2,
        checksumMismatchCount: 7,
        errorCount: 3,
        warningCount: 4,
        releaseVersion: "RW-2026.06-A",
        releaseFingerprint: "rel-fp-002",
        readinessFingerprint: "ready-fp-002",
        reportFingerprint: "report-fp-002",
        issueSummary: "外部 Checksum 校验失败",
      },
    ],
  });
}

function archiveZipHistoryWithDuplicateJson() {
  const parsed = JSON.parse(archiveZipHistoryJson()) as {
    records: Array<Record<string, unknown>>;
    schema: string;
    generatedAt: string;
  };
  parsed.records.push({
    recordId: "zip-history-imported-duplicate-001",
    recordedAt: "2026-06-03T08:04:00.000Z",
    checkedAt: "2026-06-03T08:00:00.000Z",
    archiveName: "tampered-project.zip",
    operator: "外部验收员A",
    sourcePath: "/external/tampered.zip",
    acceptanceDecision: "reject",
    acceptanceStatusLabel: "拒收",
    success: false,
    entryCount: 18,
    requiredEntriesMissing: 1,
    manifestMismatchCount: 2,
    checksumMismatchCount: 7,
    errorCount: 3,
    warningCount: 4,
    releaseVersion: "RW-2026.06-A",
    releaseFingerprint: "rel-fp-001",
    readinessFingerprint: "ready-fp-001",
    reportFingerprint: "report-fp-001",
    issueSummary: "外部重复记录待核对",
  });
  return JSON.stringify(parsed);
}

function editorElement(): HTMLTextAreaElement {
  const element = document.querySelector(".ewb-editor");
  if (!(element instanceof HTMLTextAreaElement)) throw new Error("未找到工程分析输入编辑器");
  return element;
}

function calculateJsonInput(input: unknown) {
  fireEvent.change(screen.getByTitle("选择输入解析格式"), { target: { value: "json" } });
  fireEvent.change(editorElement(), {
    target: { value: JSON.stringify(input, null, 2) },
  });
  fireEvent.click(screen.getByRole("button", { name: "计算" }));
}

function toolButtonByName(name: RegExp): HTMLButtonElement {
  const button = screen
    .getAllByRole("button", { name })
    .find((candidate) => candidate.classList.contains("ewb-tool-button"));
  if (!(button instanceof HTMLButtonElement)) throw new Error(`未找到工具按钮：${String(name)}`);
  return button;
}

function readZipEntriesFromBytes(bytes: number[]): Map<string, string> {
  const data = Buffer.from(bytes);
  const entries = new Map<string, string>();
  let offset = 0;

  while (offset + 30 <= data.length) {
    const signature = data.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const method = data.readUInt16LE(offset + 8);
    const compressedSize = data.readUInt32LE(offset + 18);
    const nameLength = data.readUInt16LE(offset + 26);
    const extraLength = data.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = data.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const compressed = data.subarray(dataStart, dataStart + compressedSize);
    const entry = method === 8 ? inflateRawSync(compressed) : compressed;
    entries.set(name, entry.toString("utf8"));
    offset = dataStart + compressedSize;
  }

  return entries;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("EngineeringWorkbench archive ZIP history UI", () => {
  it("keeps delivery workflows hidden in the default calculation workbench", () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    expect(screen.getByLabelText("轨道测量监测工具")).toBeTruthy();
    expect(screen.queryByLabelText("工程分析工具")).toBeNull();
    expect(screen.getByTitle("选择项目场景限差模板")).toBeTruthy();
    expect(screen.queryByTitle("选择项目场景限差和归档模板")).toBeNull();
    for (const label of ["记录限差审批", "批量导入", "导入批包", "验收 ZIP", "导入历史", "加入批次"]) {
      const buttons = screen.getAllByRole("button", { name: label });
      expect(buttons.some((button) => button.getAttribute("data-delivery-workflow") === "hidden")).toBe(true);
    }
    expect(document.querySelector(".ewb-batch-panel")?.getAttribute("data-delivery-workflow")).toBe("hidden");
  });

  it("loads professional CSV samples for the active engineering tool", async () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /轨道精调复核/ }));
    fireEvent.click(screen.getByRole("button", { name: /现场样表：轨道精调检查记录/ }));

    expect((screen.getByTitle("选择输入解析格式") as HTMLSelectElement).value).toBe("csv");
    expect(editorElement().value).toContain("线路,里程,设计轨距(mm)");
    expect(editorElement().value).toContain("三角坑(mm)");
    const importPreview = document.querySelector(".ewb-import-preview");
    expect(importPreview).not.toBeNull();
    expect(within(importPreview as HTMLElement).getByText("轨道精调检查记录")).toBeTruthy();
    expect(screen.getByText("预警")).toBeTruthy();
  });

  it("shows a unified Agent execution flow for the current calculation", () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const panel = screen.getByLabelText("Agent 执行流");
    expect(within(panel).getByText("工具调用")).toBeTruthy();
    expect(within(panel).getByText("人工确认")).toBeTruthy();
    expect(within(panel).getByText("结果卡片")).toBeTruthy();
    expect(within(panel).getAllByText("engineering.distance_azimuth.calculate").length).toBeGreaterThan(0);
    expect(within(panel).getByText("成果提交前复核")).toBeTruthy();
  });

  it("runs traverse and leveling indoor workflows from a dedicated adjustment panel", () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /导线内业/ }));

    expect((screen.getByTitle("选择输入解析格式") as HTMLSelectElement).value).toBe("csv");
    expect(editorElement().value).toContain("hzAngleDeg");
    expect(screen.getAllByText(/导线内业平差完成/).length).toBeGreaterThan(0);
    expect(document.querySelector(".ewb-visualization svg")?.getAttribute("aria-label")).toBe("导线误差椭圆");

    fireEvent.click(within(workflowPanel).getByRole("button", { name: /水准内业/ }));

    expect((screen.getByTitle("选择输入解析格式") as HTMLSelectElement).value).toBe("csv");
    expect(editorElement().value).toContain("dhM");
    expect(screen.getAllByText(/水准内业平差完成/).length).toBeGreaterThan(0);
    expect(document.querySelector(".ewb-visualization svg")?.getAttribute("aria-label")).toBe("水准网示意图");

    fireEvent.click(within(workflowPanel).getByRole("button", { name: /CP2\/CP3 水准复测/ }));

    expect((screen.getByTitle("选择输入解析格式") as HTMLSelectElement).value).toBe("csv");
    expect(editorElement().value).toContain("基准高差");
    expect(editorElement().value).toContain("复测高差");
    expect(within(screen.getByLabelText("平差成果复核")).getByText(/CP2\/CP3 水准复测/)).toBeTruthy();
    expect(within(screen.getByLabelText("平差成果复核")).getByText(/超限测段 CP2-01->CP3-02/)).toBeTruthy();
  });

  it("shows PRD spatial artifact status for indoor adjustment deliverables", () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(within(screen.getByLabelText("内业平差流程")).getByRole("button", { name: /导线内业/ }));

    const spatialStatus = screen.getByLabelText("空间成果状态");
    expect(within(spatialStatus).getByText("空间成果")).toBeTruthy();
    expect(within(spatialStatus).getByText(/GeoJSON\/DXF 已生成/)).toBeTruthy();
    expect(within(spatialStatus).getByText(/GeoJSON 要素 \d+/)).toBeTruthy();
    expect(within(spatialStatus).getByText(/DXF 实体 \d+/)).toBeTruthy();
    expect(within(spatialStatus).getByText(/fnv1a32:/)).toBeTruthy();
  });

  it("schedules hundreds-point indoor adjustment calculation with visible progress", async () => {
    vi.useFakeTimers();
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /导线内业/ }));
    fireEvent.change(screen.getByTitle("选择输入解析格式"), { target: { value: "json" } });
    const largeTraverseInput = {
      knownPoints: [
        { name: "P0", x: 0, y: 0, fixed: true },
        { name: "P240", x: 0, y: 0, fixed: true },
      ],
      observations: Array.from({ length: 240 }, (_, index) => ({
        from: `P${index}`,
        to: `P${index + 1}`,
        hzAngleDeg: 0,
        horizontalDistM: 10,
      })),
      params: {
        startAzimuthDeg: 0,
        endAzimuthDeg: 0,
        dirMseSec: 2,
        distFixedMm: 1,
        ppm: 1,
        model: "normal",
      },
    };

    fireEvent.change(editorElement(), {
      target: { value: JSON.stringify(largeTraverseInput, null, 2) },
    });
    fireEvent.click(screen.getByRole("button", { name: "计算" }));

    const progress = screen.getByLabelText("内业平差异步计算");
    expect(within(progress).getByText(/数百点内业平差计算中/)).toBeTruthy();
    expect(within(progress).getAllByText(/240 条样本/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/导线内业平差完成：240 站/)).toBeNull();

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(screen.getByText("数百点内业平差计算完成：240 条样本")).toBeTruthy();
    expect(screen.queryByLabelText("内业平差异步计算")).toBeNull();
    expect(screen.getByLabelText("成果表截断提示").textContent).toContain("已显示前 200 行");
    const deferredExchangeButton = screen.getByRole("button", { name: /生成交换成果/ });
    expect(deferredExchangeButton.getAttribute("title")).toContain("按需生成");
    expect(screen.queryByRole("button", { name: /科傻/ })).toBeNull();
  }, 40000);

  it("shows a PRD IO-03 parser JSON preflight card when importing field parser output", async () => {
    installLocalStorageStub();
    const parserContent = JSON.stringify({
      format: "survey-cloud-json",
      parser_summary: { quality_status: "parsed", source_device: "Survey Cloud App" },
      records: [
        { record_kind: "coordinate", point_id: "S", easting_m: 0, northing_m: 0, fixed: true },
        { record_kind: "coordinate", point_id: "E", easting_m: 100, northing_m: 0, fixed: true },
        { record_kind: "traverse_observation", from: "S", to: "P1", hz_angle_deg: 270, horiz_dist_m: 100 },
      ],
    });
    vi.mocked(open).mockResolvedValue("/field/parser-traverse.json");
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "read_engineering_import_file") {
        return Promise.resolve({
          path: "/field/parser-traverse.json",
          file_name: "parser-traverse.json",
          format: "json",
          content: parserContent,
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /水准内业/ }));
    fireEvent.click(screen.getByRole("button", { name: "导入文件" }));

    const preflight = await screen.findByLabelText("外业导入预检");
    expect(within(preflight).getByText("parser-traverse.json")).toBeTruthy();
    expect(within(preflight).getByText(/survey-cloud-json/)).toBeTruthy();
    expect(within(preflight).getByText(/quality_status: parsed/)).toBeTruthy();
    expect(within(preflight).getByText(/source_device: Survey Cloud App/)).toBeTruthy();
    expect(within(preflight).getByText("coordinate 2")).toBeTruthy();
    expect(within(preflight).getByText("traverse_observation 1")).toBeTruthy();
    expect(within(preflight).getByText("JSON 中间层 · 3 条记录")).toBeTruthy();
    expect(within(screen.getByLabelText("平差输入检查")).getByText("导线起算与观测")).toBeTruthy();
  });

  it("explains route candidates when directly importing mixed PRD Survey Cloud JSON", async () => {
    installLocalStorageStub();
    const mixedSurveyCloudContent = JSON.stringify({
      format: "survey-cloud-json",
      project: "CP3 field app mixed job",
      known_points: [
        { name: "S", x: 0, y: 0, h: 100, fixed: true },
        { name: "E", x: 100, y: 0, h: 101, fixed: true },
      ],
      observations: [{ station: "S", target: "P1", hz_angle_deg: 270, horiz_dist_m: 100 }],
      level_segments: [{ from: "S", to: "E", dh_m: 1, length_km: 1, n_stations: 8 }],
      params: { start_azimuth_deg: 0, end_azimuth_deg: 90, model: "normal" },
      weight_mode: "length",
    });
    vi.mocked(open).mockResolvedValue("/field/survey-cloud-mixed.json");
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "read_engineering_import_file") {
        return Promise.resolve({
          path: "/field/survey-cloud-mixed.json",
          file_name: "survey-cloud-mixed.json",
          format: "json",
          content: mixedSurveyCloudContent,
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "导入文件" }));

    await waitFor(() => expect(toolButtonByName(/导线内业/).getAttribute("data-active")).toBe("true"));
    expect(await within(await screen.findByLabelText("导入字段预检")).findByText("状态: 可计算")).toBeTruthy();
    expect(await screen.findByText(/候选流程：导线内业、水准内业/)).toBeTruthy();
    expect(screen.getByText(/已按导线内业导入/)).toBeTruthy();
    expect(screen.getAllByText(/导线内业平差完成/).length).toBeGreaterThan(0);
  });

  it("groups PRD indoor adjustment import preflight fields for field crews", async () => {
    installLocalStorageStub();
    const levelResurveyContent = JSON.stringify({
      format: "survey-cloud-json",
      parser_summary: { quality_status: "parsed", source_device: "Survey Cloud App" },
      knownBms: [
        { name: "BM1", h: 100, fixed: true },
        { name: "BM2", h: 102, fixed: true },
      ],
      segments: [
        { from: "BM1", to: "TP1", dhM: 1.01, lengthKm: 1, nStations: 8, baselineDhM: 1, resurveyDhM: 1.01 },
        { from: "TP1", to: "BM2", dhM: 0.99, lengthKm: 1, nStations: 8, baselineDhM: 1, resurveyDhM: 1.012 },
      ],
      weightMode: "length",
      order: "2nd",
      resurveyDiffToleranceMmPerSqrtKm: 6,
    });
    vi.mocked(open).mockResolvedValue("/field/cp2-cp3-level-resurvey.json");
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "read_engineering_import_file") {
        return Promise.resolve({
          path: "/field/cp2-cp3-level-resurvey.json",
          file_name: "cp2-cp3-level-resurvey.json",
          format: "json",
          content: levelResurveyContent,
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /水准内业/ }));
    fireEvent.click(screen.getByRole("button", { name: "导入文件" }));

    const groupedPreflight = await screen.findByLabelText("导入字段分组预检");
    expect(within(groupedPreflight).getByText("平差必需字段")).toBeTruthy();
    expect(within(groupedPreflight).getByText(/knownBms/)).toBeTruthy();
    expect(within(groupedPreflight).getByText(/segments/)).toBeTruthy();
    expect(within(groupedPreflight).getByText("复测字段")).toBeTruthy();
    expect(within(groupedPreflight).getByText(/baselineDhM/)).toBeTruthy();
    expect(within(groupedPreflight).getByText(/resurveyDhM/)).toBeTruthy();
    expect(within(groupedPreflight).getByText(/resurveyDiffToleranceMmPerSqrtKm/)).toBeTruthy();
    expect(within(groupedPreflight).getByText("交换归档字段")).toBeTruthy();
    expect(within(groupedPreflight).getAllByText("无缺失").length).toBeGreaterThan(0);
    expect(within(screen.getByLabelText("外业导入预检")).getByText("cp2-cp3-level-resurvey.json")).toBeTruthy();
  });

  it("marks PRD imported missing traverse fields in the observation editor for repair", async () => {
    installLocalStorageStub();
    const traverseMissingDistanceContent = JSON.stringify({
      format: "survey-cloud-json",
      parser_summary: { quality_status: "parsed", source_device: "Survey Cloud App" },
      records: [
        { record_kind: "coordinate", point_id: "S", easting_m: 0, northing_m: 0, fixed: true },
        { record_kind: "coordinate", point_id: "E", easting_m: 100, northing_m: 0, fixed: true },
        { record_kind: "traverse_observation", from: "S", to: "E", hz_angle_deg: 90 },
      ],
      params: { startAzimuthDeg: 0, endAzimuthDeg: 90, model: "normal" },
    });
    vi.mocked(open).mockResolvedValue("/field/parser-traverse-missing-distance.json");
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "read_engineering_import_file") {
        return Promise.resolve({
          path: "/field/parser-traverse-missing-distance.json",
          file_name: "parser-traverse-missing-distance.json",
          format: "json",
          content: traverseMissingDistanceContent,
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "导入文件" }));

    const repair = await screen.findByLabelText("导入缺字段修正");
    expect(within(repair).getByText("parser-traverse-missing-distance.json")).toBeTruthy();
    expect(within(repair).getByText("distance", { selector: "em" })).toBeTruthy();
    const editor = screen.getByLabelText("观测数据编辑");
    const distanceInput = within(editor).getByLabelText("导线观测 1 平距");
    expect(distanceInput.getAttribute("data-status")).toBe("missing");

    fireEvent.change(distanceInput, { target: { value: "100" } });
    fireEvent.click(within(editor).getByRole("button", { name: "应用观测并计算" }));

    expect(screen.queryByLabelText("导入缺字段修正")).toBeNull();
    expect(within(screen.getByLabelText("导入字段预检")).getByText("状态: 可计算")).toBeTruthy();
    expect(screen.getAllByText(/导线内业平差完成/).length).toBeGreaterThan(0);
  });

  it("repairs missing distance after directly importing a PRD CPIII TPT/SUC bundle", async () => {
    installLocalStorageStub();
    const cpiiiBundleMissingDistance = [
      "# CPIII_TPT",
      "point,easting,northing,elevation,fixed",
      "CP3-01,0,0,15.300,1",
      "CP3-02,100,0,15.420,1",
      "# CPIII_SUC",
      "type,from,to,hz_angle_deg,zenith_deg,horiz_dist_m",
      "OBS,CP3-01,CP3-03,270,89.8765,",
    ].join("\n");
    vi.mocked(open).mockResolvedValue("/field/cp3-field-bundle.txt");
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "read_engineering_import_file") {
        return Promise.resolve({
          path: "/field/cp3-field-bundle.txt",
          file_name: "cp3-field-bundle.txt",
          content: cpiiiBundleMissingDistance,
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "导入文件" }));

    await waitFor(() => expect(toolButtonByName(/导线内业/).getAttribute("data-active")).toBe("true"));
    expect((screen.getByTitle("选择输入解析格式") as HTMLSelectElement).value).toBe("cpiii-bundle");
    const repair = await screen.findByLabelText("导入缺字段修正");
    expect(within(repair).getByText("cp3-field-bundle.txt")).toBeTruthy();
    expect(within(repair).getByText("distance", { selector: "em" })).toBeTruthy();
    const editor = screen.getByLabelText("观测数据编辑");
    const distanceInput = within(editor).getByLabelText("导线观测 1 平距");
    expect(distanceInput.getAttribute("data-status")).toBe("missing");

    fireEvent.change(distanceInput, { target: { value: "100" } });
    fireEvent.click(within(editor).getByRole("button", { name: "应用观测并计算" }));

    expect(screen.queryByLabelText("导入缺字段修正")).toBeNull();
    expect((screen.getByTitle("选择输入解析格式") as HTMLSelectElement).value).toBe("json");
    expect(within(screen.getByLabelText("导入字段预检")).getByText("状态: 可计算")).toBeTruthy();
    expect(screen.getAllByText(/导线内业平差完成/).length).toBeGreaterThan(0);
  });

  it("routes PRD Trimble DiNi03 DAT field books to leveling adjustment on direct import", async () => {
    installLocalStorageStub();
    const diniDat = [
      "For M5|Adr 0001|PI1 BM1|Z 100.00000 m|",
      "For M5|Adr 0002|PI1 BM1|Rb 1.45678 m|HD 30.000 m|",
      "For M5|Adr 0003|PI1 TP1|Rf 0.22278 m|HD 30.000 m|",
      "For M5|Adr 0004|PI1 TP1|Rb 1.30000 m|HD 25.000 m|",
      "For M5|Adr 0005|PI1 BM2|Rf 0.06600 m|HD 25.000 m|",
    ].join("\n");
    vi.mocked(open).mockResolvedValue("/field/dini03-level.dat");
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "read_engineering_import_file") {
        return Promise.resolve({
          path: "/field/dini03-level.dat",
          file_name: "dini03-level.dat",
          content: diniDat,
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "导入文件" }));

    await waitFor(() => expect(toolButtonByName(/水准内业/).getAttribute("data-active")).toBe("true"));
    expect((screen.getByTitle("选择输入解析格式") as HTMLSelectElement).value).toBe("dat");
    const parserPreflight = screen.getByLabelText("外业导入预检");
    expect(within(parserPreflight).getByText("dini03-level.dat")).toBeTruthy();
    expect(within(parserPreflight).getByText(/format: dini-m5/)).toBeTruthy();
    expect(within(screen.getByLabelText("导入字段预检")).getByText("状态: 可计算")).toBeTruthy();
    expect(screen.getAllByText(/水准内业平差完成/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("BM2").length).toBeGreaterThan(0);
  });

  it("routes PRD Leica GSI traverse field books to traverse adjustment on direct import", async () => {
    installLocalStorageStub();
    const gsiText = [
      "*110001+0000S 810000+00000000 820000+00000000",
      "*110003+0000P1 210000+27000000 320000+00100000",
      "*110002+0000E 810000+00100000 820000+00000000",
    ].join("\n");
    vi.mocked(open).mockResolvedValue("/field/traverse-field.gsi");
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "read_engineering_import_file") {
        return Promise.resolve({
          path: "/field/traverse-field.gsi",
          file_name: "traverse-field.gsi",
          content: gsiText,
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "导入文件" }));

    await waitFor(() => expect(toolButtonByName(/导线内业/).getAttribute("data-active")).toBe("true"));
    expect((screen.getByTitle("选择输入解析格式") as HTMLSelectElement).value).toBe("gsi");
    const parserPreflight = screen.getByLabelText("外业导入预检");
    expect(within(parserPreflight).getByText("traverse-field.gsi")).toBeTruthy();
    expect(within(parserPreflight).getByText(/format: gsi/)).toBeTruthy();
    expect(within(parserPreflight).getByText("coordinate 2")).toBeTruthy();
    expect(within(parserPreflight).getByText("traverse_observation 1")).toBeTruthy();
    expect(within(screen.getByLabelText("导入字段预检")).getByText("状态: 可计算")).toBeTruthy();
    expect(screen.getAllByText(/导线内业平差完成/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("P1").length).toBeGreaterThan(0);
  });

  it("exports PRD traverse GSI import results into an indoor adjustment XLSX workbook", async () => {
    installLocalStorageStub();
    const gsiText = [
      "*110001+0000S 810000+00000000 820000+00000000",
      "*110003+0000P1 210000+27000000 320000+00100000",
      "*110002+0000E 810000+00100000 820000+00000000",
    ].join("\n");
    vi.mocked(open).mockResolvedValue("/field/traverse-field.gsi");
    vi.mocked(save).mockResolvedValue("/tmp/railwise-traverse-gsi-result.xlsx");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "read_engineering_import_file") {
        return Promise.resolve({
          path: "/field/traverse-field.gsi",
          file_name: "traverse-field.gsi",
          content: gsiText,
        });
      }
      if (command === "write_binary_file") return Promise.resolve(args);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "导入文件" }));
    await waitFor(() => expect(toolButtonByName(/导线内业/).getAttribute("data-active")).toBe("true"));
    expect(within(screen.getByLabelText("导入字段预检")).getByText("状态: 可计算")).toBeTruthy();
    expect(screen.getAllByText(/导线内业平差完成/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "XLSX" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "write_binary_file",
        expect.objectContaining({ path: "/tmp/railwise-traverse-gsi-result.xlsx" }),
      ),
    );
    const writeCall = vi
      .mocked(invoke)
      .mock.calls.find(([command]) => command === "write_binary_file");
    const bytes = (writeCall?.[1] as { bytes?: number[] } | undefined)?.bytes ?? [];
    const entries = readZipEntriesFromBytes(bytes);
    const workbookText = Array.from(entries.values()).join("\n");
    expect(workbookText).toContain("内业平差专项");
    expect(workbookText).toContain("导线平差坐标");
    expect(workbookText).toContain("traverse-field.gsi");
    expect(workbookText).toContain("P1");
    expect(save).toHaveBeenCalledWith({
      defaultPath: expect.stringContaining("内业平差成果表.xlsx"),
      filters: [{ name: "Railwise 内业平差成果表 XLSX", extensions: ["xlsx"] }],
    });
    expect(screen.getByText("内业平差成果表已导出")).toBeTruthy();
  });

  it("exports PRD leveling manual input results into an indoor adjustment XLSX workbook", async () => {
    installLocalStorageStub();
    vi.mocked(save).mockResolvedValue("/tmp/railwise-level-manual-result.xlsx");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "write_binary_file") return Promise.resolve(args);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /水准内业/ }));

    const editor = screen.getByLabelText("观测数据编辑");
    fireEvent.change(within(editor).getByLabelText("水准测段 1 高差"), { target: { value: "1.234" } });
    fireEvent.change(within(editor).getByLabelText("水准测段 2 高差"), { target: { value: "1.236" } });
    fireEvent.click(within(editor).getByRole("button", { name: "应用观测并计算" }));

    expect(screen.getAllByText(/水准内业平差完成/).length).toBeGreaterThan(0);
    expect(document.querySelector(".ewb-visualization svg")?.getAttribute("aria-label")).toBe("水准网示意图");
    expect(within(screen.getByLabelText("平差成果复核")).getByText("水准点高程成果表 2 点")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "XLSX" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "write_binary_file",
        expect.objectContaining({ path: "/tmp/railwise-level-manual-result.xlsx" }),
      ),
    );
    const writeCall = vi
      .mocked(invoke)
      .mock.calls.find(([command]) => command === "write_binary_file");
    const bytes = (writeCall?.[1] as { bytes?: number[] } | undefined)?.bytes ?? [];
    const entries = readZipEntriesFromBytes(bytes);
    const workbookText = Array.from(entries.values()).join("\n");
    expect(workbookText).toContain("内业平差专项");
    expect(workbookText).toContain("水准点高程成果表");
    expect(workbookText).toContain("水准网示意图");
    expect(workbookText).toContain("level_adjustment");
    expect(workbookText).toContain("TP1");
    expect(save).toHaveBeenCalledWith({
      defaultPath: expect.stringContaining("内业平差成果表.xlsx"),
      filters: [{ name: "Railwise 内业平差成果表 XLSX", extensions: ["xlsx"] }],
    });
    expect(screen.getByText("内业平差成果表已导出")).toBeTruthy();
  });

  it("marks PRD imported missing leveling fields in the segment editor for repair", async () => {
    installLocalStorageStub();
    const levelMissingDhContent = JSON.stringify({
      format: "survey-cloud-json",
      parser_summary: { quality_status: "parsed", source_device: "Survey Cloud App" },
      knownBms: [
        { name: "BM1", h: 100, fixed: true },
        { name: "BM2", h: 101.234, fixed: true },
      ],
      segments: [{ from: "BM1", to: "TP1", lengthKm: 1, nStations: 8 }],
      weightMode: "length",
      order: "2nd",
    });
    vi.mocked(open).mockResolvedValue("/field/level-missing-dh.json");
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "read_engineering_import_file") {
        return Promise.resolve({
          path: "/field/level-missing-dh.json",
          file_name: "level-missing-dh.json",
          format: "json",
          content: levelMissingDhContent,
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /水准内业/ }));
    fireEvent.click(screen.getByRole("button", { name: "导入文件" }));

    const repair = await screen.findByLabelText("导入缺字段修正");
    expect(within(repair).getByText("level-missing-dh.json")).toBeTruthy();
    expect(within(repair).getByText("dhM", { selector: "em" })).toBeTruthy();
    const editor = screen.getByLabelText("观测数据编辑");
    const dhInput = within(editor).getByLabelText("水准测段 1 高差");
    expect(dhInput.getAttribute("data-status")).toBe("missing");

    fireEvent.change(dhInput, { target: { value: "1.234" } });
    fireEvent.click(within(editor).getByRole("button", { name: "应用观测并计算" }));

    expect(screen.queryByLabelText("导入缺字段修正")).toBeNull();
    expect(within(screen.getByLabelText("导入字段预检")).getByText("状态: 可计算")).toBeTruthy();
    expect(screen.getAllByText(/水准内业平差完成/).length).toBeGreaterThan(0);
  });

  it("shows PRD IO-03 parser preflight evidence for every batch-imported adjustment file", async () => {
    installLocalStorageStub();
    const traverseParserContent = JSON.stringify({
      format: "survey-cloud-json",
      parser_summary: { quality_status: "parsed" },
      records: [
        { record_kind: "coordinate", point_id: "S", easting_m: 0, northing_m: 0, fixed: true },
        { record_kind: "coordinate", point_id: "E", easting_m: 100, northing_m: 0, fixed: true },
        { record_kind: "traverse_observation", from: "S", to: "P1", hz_angle_deg: 270, horiz_dist_m: 100 },
      ],
    });
    const levelParserContent = JSON.stringify({
      format: "cpiii-suc",
      parser_summary: { quality_status: "parsed" },
      records: [
        { record_kind: "coordinate", point_id: "BM1", elevation_m: 100, fixed: true },
        { record_kind: "level_segment", from: "BM1", to: "TP1", height_diff_m: 1.234, length_km: 1 },
      ],
    });
    vi.mocked(open).mockResolvedValue(["/field/parser-traverse.json", "/field/parser-level.json"]);
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "read_engineering_import_file") {
        const path = (args as { path?: string } | undefined)?.path ?? "";
        if (path.includes("parser-level")) {
          return Promise.resolve({
            path,
            file_name: "parser-level.json",
            format: "json",
            content: levelParserContent,
          });
        }
        return Promise.resolve({
          path,
          file_name: "parser-traverse.json",
          format: "json",
          content: traverseParserContent,
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "批量导入" }));

    await waitFor(() => expect(screen.getByText("2 个文件已加入批处理队列")).toBeTruthy());
    const batchPanel = screen.getByText("批处理成果").closest(".ewb-batch-panel");
    expect(batchPanel).not.toBeNull();
    const batchList = (batchPanel as HTMLElement).querySelector(".ewb-batch-list");
    expect(batchList).not.toBeNull();
    const traverseItem = within(batchList as HTMLElement).getByText(/parser-traverse\.json/).closest(".ewb-batch-item");
    const levelItem = within(batchList as HTMLElement).getByText(/parser-level\.json/).closest(".ewb-batch-item");
    expect(traverseItem).not.toBeNull();
    expect(levelItem).not.toBeNull();

    expect(within(traverseItem as HTMLElement).getByText(/traverse_adjustment · JSON · 3 条记录/)).toBeTruthy();
    expect(within(traverseItem as HTMLElement).getByText("coordinate 2")).toBeTruthy();
    expect(within(traverseItem as HTMLElement).getByText("traverse_observation 1")).toBeTruthy();

    expect(within(levelItem as HTMLElement).getByText(/level_adjustment · JSON · 2 条记录/)).toBeTruthy();
    expect(within(levelItem as HTMLElement).getByText("coordinate 1")).toBeTruthy();
    expect(within(levelItem as HTMLElement).getByText("level_segment 1")).toBeTruthy();
  });

  it("groups PRD batch-imported adjustment preflight fields per queue item", async () => {
    installLocalStorageStub();
    const levelResurveyContent = JSON.stringify({
      format: "survey-cloud-json",
      parser_summary: { quality_status: "parsed" },
      knownBms: [
        { name: "BM1", h: 100, fixed: true },
        { name: "BM2", h: 102, fixed: true },
      ],
      segments: [
        { from: "BM1", to: "TP1", dhM: 1.01, lengthKm: 1, nStations: 8, baselineDhM: 1, resurveyDhM: 1.01 },
        { from: "TP1", to: "BM2", dhM: 0.99, lengthKm: 1, nStations: 8, baselineDhM: 1, resurveyDhM: 1.012 },
      ],
      weightMode: "length",
      order: "2nd",
      resurveyDiffToleranceMmPerSqrtKm: 6,
    });
    vi.mocked(open).mockResolvedValue(["/field/cp2-cp3-level-resurvey.json"]);
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "read_engineering_import_file") {
        const path = (args as { path?: string } | undefined)?.path ?? "";
        return Promise.resolve({
          path,
          file_name: "cp2-cp3-level-resurvey.json",
          format: "json",
          content: levelResurveyContent,
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "批量导入" }));

    await waitFor(() => expect(screen.getByText("1 个文件已加入批处理队列")).toBeTruthy());
    const batchPanel = screen.getByText("批处理成果").closest(".ewb-batch-panel");
    expect(batchPanel).not.toBeNull();
    const batchList = (batchPanel as HTMLElement).querySelector(".ewb-batch-list");
    expect(batchList).not.toBeNull();
    const levelItem = within(batchList as HTMLElement).getByText(/cp2-cp3-level-resurvey\.json/).closest(".ewb-batch-item");
    expect(levelItem).not.toBeNull();
    expect(within(levelItem as HTMLElement).getByText(/level_adjustment · JSON/)).toBeTruthy();

    const groupedPreflight = within(levelItem as HTMLElement).getByLabelText(/导入字段分组预检/);
    expect(within(groupedPreflight).getByText("平差必需字段")).toBeTruthy();
    expect(within(groupedPreflight).getByText(/knownBms/)).toBeTruthy();
    expect(within(groupedPreflight).getByText(/segments/)).toBeTruthy();
    expect(within(groupedPreflight).getByText("复测字段")).toBeTruthy();
    expect(within(groupedPreflight).getByText(/baselineDhM/)).toBeTruthy();
    expect(within(groupedPreflight).getByText(/resurveyDhM/)).toBeTruthy();
    expect(within(groupedPreflight).getByText(/resurveyDiffToleranceMmPerSqrtKm/)).toBeTruthy();
    expect(within(groupedPreflight).getByText("交换归档字段")).toBeTruthy();
    expect(within(groupedPreflight).getAllByText("无缺失").length).toBeGreaterThan(0);
  });

  it("shows a PRD batch import preflight summary above the adjustment queue", async () => {
    installLocalStorageStub();
    const levelReadyContent = JSON.stringify({
      format: "survey-cloud-json",
      parser_summary: { quality_status: "parsed" },
      knownBms: [{ name: "BM1", h: 100, fixed: true }],
      segments: [{ from: "BM1", to: "TP1", dhM: 1.234, lengthKm: 1, nStations: 8 }],
      weightMode: "length",
    });
    const traverseMissingContent = JSON.stringify({
      format: "survey-cloud-json",
      parser_summary: { quality_status: "parsed" },
      knownPoints: [
        { name: "S", x: 0, y: 0, fixed: true },
        { name: "E", x: 100, y: 0, fixed: true },
      ],
      observations: [{ from: "S", to: "P1", hzAngleDeg: 270 }],
      params: { startAzimuthDeg: 0, endAzimuthDeg: 90, model: "normal" },
    });
    vi.mocked(open).mockResolvedValue(["/field/level-ready.json", "/field/traverse-missing-distance.json"]);
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "read_engineering_import_file") {
        const path = (args as { path?: string } | undefined)?.path ?? "";
        return Promise.resolve({
          path,
          file_name: path.includes("traverse") ? "traverse-missing-distance.json" : "level-ready.json",
          format: "json",
          content: path.includes("traverse") ? traverseMissingContent : levelReadyContent,
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "批量导入" }));

    await waitFor(() => expect(screen.getByText("2 个文件已加入批处理队列")).toBeTruthy());
    const batchPanel = screen.getByText("批处理成果").closest(".ewb-batch-panel");
    expect(batchPanel).not.toBeNull();
    const preflightSummary = within(batchPanel as HTMLElement).getByLabelText("批量导入预检总览");

    expect(within(preflightSummary).getByText("导入预检总览")).toBeTruthy();
    expect(within(preflightSummary).getByText("2 项")).toBeTruthy();
    expect(within(preflightSummary).getByText("可计算 1")).toBeTruthy();
    expect(within(preflightSummary).getByText("需补字段 1")).toBeTruthy();
    expect(within(preflightSummary).getByText("未记录 0")).toBeTruthy();
    expect(within(preflightSummary).getByText("traverse-missing-distance.json")).toBeTruthy();
    expect(within(preflightSummary).getByText(/distance 1/)).toBeTruthy();
  });

  it("exports PRD batch import preflight summary CSV and JSON from the workbench", async () => {
    installLocalStorageStub();
    vi.mocked(save)
      .mockResolvedValueOnce("/tmp/railwise-import-preflight-summary.csv")
      .mockResolvedValueOnce("/tmp/railwise-import-preflight-summary.json");
    const levelReadyContent = JSON.stringify({
      format: "survey-cloud-json",
      parser_summary: { quality_status: "parsed" },
      knownBms: [{ name: "BM1", h: 100, fixed: true }],
      segments: [{ from: "BM1", to: "TP1", dhM: 1.234, lengthKm: 1, nStations: 8 }],
      weightMode: "length",
    });
    const traverseMissingContent = JSON.stringify({
      format: "survey-cloud-json",
      parser_summary: { quality_status: "parsed" },
      knownPoints: [
        { name: "S", x: 0, y: 0, fixed: true },
        { name: "E", x: 100, y: 0, fixed: true },
      ],
      observations: [{ from: "S", to: "P1", hzAngleDeg: 270 }],
      params: { startAzimuthDeg: 0, endAzimuthDeg: 90, model: "normal" },
    });
    vi.mocked(open).mockResolvedValue(["/field/level-ready.json", "/field/traverse-missing-distance.json"]);
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "write_text_file") return Promise.resolve(args);
      if (command === "read_engineering_import_file") {
        const path = (args as { path?: string } | undefined)?.path ?? "";
        return Promise.resolve({
          path,
          file_name: path.includes("traverse") ? "traverse-missing-distance.json" : "level-ready.json",
          format: "json",
          content: path.includes("traverse") ? traverseMissingContent : levelReadyContent,
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "批量导入" }));

    await waitFor(() => expect(screen.getByText("2 个文件已加入批处理队列")).toBeTruthy());
    const batchPanel = screen.getByText("批处理成果").closest(".ewb-batch-panel");
    expect(batchPanel).not.toBeNull();
    const preflightSummary = within(batchPanel as HTMLElement).getByLabelText("批量导入预检总览");

    fireEvent.click(within(preflightSummary).getByRole("button", { name: "预检 CSV" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "write_text_file",
        expect.objectContaining({
          path: "/tmp/railwise-import-preflight-summary.csv",
          content: expect.stringContaining("traverse-missing-distance.json"),
        }),
      ),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining("observations|distance"),
      }),
    );
    expect(save).toHaveBeenCalledWith({
      defaultPath: expect.stringContaining("工程分析导入预检总表-"),
      filters: [{ name: "Railwise 导入预检总表 CSV", extensions: ["csv"] }],
    });

    fireEvent.click(within(preflightSummary).getByRole("button", { name: "预检 JSON" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "write_text_file",
        expect.objectContaining({
          path: "/tmp/railwise-import-preflight-summary.json",
          content: expect.stringContaining('"missingFieldRunCount": 1'),
        }),
      ),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining('"sourceName": "traverse-missing-distance.json"'),
      }),
    );
    expect(save).toHaveBeenCalledWith({
      defaultPath: expect.stringContaining("工程分析导入预检总表-"),
      filters: [{ name: "Railwise 导入预检总表 JSON", extensions: ["json"] }],
    });
  });

  it("edits PRD indoor adjustment parameters from a structured input check panel", () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /导线内业/ }));

    const traverseCheckPanel = screen.getByLabelText("平差输入检查");
    expect(within(traverseCheckPanel).getByText("已知点 2")).toBeTruthy();
    expect(within(traverseCheckPanel).getByText("观测 1")).toBeTruthy();
    expect(within(traverseCheckPanel).getByText(/角度闭合差.*合格/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("方向中误差"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "应用参数并计算" }));

    expect((screen.getByTitle("选择输入解析格式") as HTMLSelectElement).value).toBe("json");
    expect(editorElement().value).toContain('"dirMseSec": 5');

    fireEvent.click(within(workflowPanel).getByRole("button", { name: /水准内业/ }));

    const levelCheckPanel = screen.getByLabelText("平差输入检查");
    expect(within(levelCheckPanel).getByText("已知水准点 1")).toBeTruthy();
    expect(within(levelCheckPanel).getByText("测段 2")).toBeTruthy();
    expect(within(levelCheckPanel).getByText(/测段残差.*合格/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("定权方式"), { target: { value: "stations" } });
    fireEvent.click(screen.getByRole("button", { name: "应用参数并计算" }));

    expect((screen.getByTitle("选择输入解析格式") as HTMLSelectElement).value).toBe("json");
    expect(editorElement().value).toContain('"weightMode": "stations"');
  });

  it("edits PRD indoor observation rows before recalculating", () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /导线内业/ }));

    const traverseEditor = screen.getByLabelText("观测数据编辑");
    fireEvent.change(within(traverseEditor).getByLabelText("导线观测 1 终点"), { target: { value: "CP101" } });
    fireEvent.click(within(traverseEditor).getByRole("button", { name: "新增导线观测" }));
    expect((within(traverseEditor).getByLabelText("导线观测 2 起点") as HTMLInputElement).value).toBe("CP101");
    fireEvent.change(within(traverseEditor).getByLabelText("导线观测 2 终点"), { target: { value: "E" } });
    fireEvent.change(within(traverseEditor).getByLabelText("导线观测 2 水平角"), { target: { value: "90" } });
    fireEvent.change(within(traverseEditor).getByLabelText("导线观测 2 斜距"), { target: { value: "100" } });
    fireEvent.click(within(traverseEditor).getByRole("button", { name: "应用观测并计算" }));

    expect((screen.getByTitle("选择输入解析格式") as HTMLSelectElement).value).toBe("json");
    expect(editorElement().value).toContain('"to": "CP101"');
    expect(editorElement().value).toContain('"from": "CP101"');
    expect(within(screen.getByLabelText("平差输入检查")).getByText("观测 2")).toBeTruthy();

    fireEvent.click(within(workflowPanel).getByRole("button", { name: /水准内业/ }));

    const levelEditor = screen.getByLabelText("观测数据编辑");
    fireEvent.change(within(levelEditor).getByLabelText("水准测段 1 高差"), { target: { value: "1.235" } });
    fireEvent.click(within(levelEditor).getByRole("button", { name: "删除水准测段 2" }));
    fireEvent.click(within(levelEditor).getByRole("button", { name: "应用观测并计算" }));

    expect(editorElement().value).toContain('"dhM": 1.235');
    expect(editorElement().value).not.toContain('"dhM": 1.236');
    expect(within(screen.getByLabelText("平差输入检查")).getByText("测段 1")).toBeTruthy();
  });

  it("preserves PRD CP2 CP3 leveling resurvey fields when editing observations", () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(within(screen.getByLabelText("内业平差流程")).getByRole("button", { name: /水准内业/ }));
    calculateJsonInput({
      knownBms: [{ name: "BM1", h: 100, fixed: true }],
      segments: [
        {
          from: "BM1",
          to: "CP2-01",
          dhM: 1.01,
          lengthKm: 1,
          nStations: 8,
          baselineDhM: 1,
          resurveyDhM: 1.01,
        },
      ],
      weightMode: "length",
      order: "2nd",
      resurveyDiffToleranceMmPerSqrtKm: 6,
    });

    const levelEditor = screen.getByLabelText("观测数据编辑");
    expect(within(levelEditor).getByLabelText("水准测段 1 基准高差")).toBeTruthy();
    expect(within(levelEditor).getByLabelText("水准测段 1 复测高差")).toBeTruthy();
    fireEvent.change(within(levelEditor).getByLabelText("水准测段 1 长度"), { target: { value: "1.5" } });
    fireEvent.click(within(levelEditor).getByRole("button", { name: "应用观测并计算" }));

    expect(editorElement().value).toContain('"baselineDhM": 1');
    expect(editorElement().value).toContain('"resurveyDhM": 1.01');
    expect(editorElement().value).toContain('"lengthKm": 1.5');
    expect(within(screen.getByLabelText("平差成果复核")).getByText(/CP2\/CP3 水准复测/)).toBeTruthy();
  });

  it("reviews PRD indoor adjustment deliverables before export", () => {
    installLocalStorageStub();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /导线内业/ }));

    const traverseReview = screen.getByLabelText("平差成果复核");
    expect(within(traverseReview).getByText("导线平差坐标表 1 点")).toBeTruthy();
    expect(within(traverseReview).getByText(/点位中误差.*mm/)).toBeTruthy();
    expect(within(traverseReview).getByText("边长相对中误差 1/99504")).toBeTruthy();
    expect(within(traverseReview).getByText(/坐标闭合差.*mm/)).toBeTruthy();
    expect(within(traverseReview).getByText("误差椭圆 已生成")).toBeTruthy();
    expect(within(traverseReview).getByText("交换成果 6 种")).toBeTruthy();

    fireEvent.click(within(traverseReview).getByRole("button", { name: "复制成果复核" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("# 导线平差成果复核"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("科傻 / 平差易 / 清华山维 / HO 成果 / OU1 成果 / DXF"));

    fireEvent.click(within(workflowPanel).getByRole("button", { name: /水准内业/ }));

    const levelReview = screen.getByLabelText("平差成果复核");
    expect(within(levelReview).getByText("水准点高程成果表 2 点")).toBeTruthy();
    expect(within(levelReview).getByText(/最大测段残差.*mm/)).toBeTruthy();
    expect(within(levelReview).getByText("水准网图 已生成")).toBeTruthy();

    fireEvent.click(within(levelReview).getByRole("button", { name: "复制成果复核" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("# 水准平差成果复核"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("高程成果"));

    calculateJsonInput({
      knownBms: [{ name: "BM1", h: 100, fixed: true }],
      segments: [
        {
          from: "BM1",
          to: "CP2-01",
          dhM: 1.01,
          lengthKm: 1,
          nStations: 8,
          baselineDhM: 1,
          resurveyDhM: 1.01,
        },
        {
          from: "CP2-01",
          to: "CP3-02",
          dhM: 1.012,
          lengthKm: 1,
          nStations: 8,
          baselineDhM: 1,
          resurveyDhM: 1.012,
        },
      ],
      weightMode: "length",
      order: "2nd",
      resurveyDiffToleranceMmPerSqrtKm: 6,
    });

    expect(
      within(screen.getByLabelText("平差成果复核")).getByText(
        "CP2/CP3 水准复测：最大高差之差 12 mm，限差 6 mm，超限测段 CP2-01->CP3-02",
      ),
    ).toBeTruthy();
  });

  it("sends PRD indoor adjustment results into deformation analysis from the result panel", async () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(within(screen.getByLabelText("内业平差流程")).getByRole("button", { name: /水准内业/ }));
    calculateJsonInput({
      knownBms: [{ name: "BM1", h: 100, fixed: true }],
      segments: [
        { from: "BM1", to: "TP1", dhM: 1.234, lengthKm: 1, nStations: 8 },
        { from: "BM1", to: "TP1", dhM: 1.236, lengthKm: 1, nStations: 8 },
      ],
      weightMode: "length",
    });
    fireEvent.click(screen.getByRole("button", { name: "设为变形初始值" }));
    expect(screen.getByText("水准内业平差已设为变形分析初始值")).toBeTruthy();

    calculateJsonInput({
      knownBms: [{ name: "BM1", h: 100, fixed: true }],
      segments: [
        { from: "BM1", to: "TP1", dhM: 1.246, lengthKm: 1, nStations: 8 },
        { from: "BM1", to: "TP1", dhM: 1.248, lengthKm: 1, nStations: 8 },
      ],
      weightMode: "length",
    });
    fireEvent.click(screen.getByRole("button", { name: "转入变形分析" }));

    await waitFor(() => expect(screen.getByText("平差成果已转入变形分析")).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /变形趋势分析/ }).getAttribute("data-active")).toBe("true"),
    );
    expect((screen.getByTitle("选择输入解析格式") as HTMLSelectElement).value).toBe("json");
    expect(editorElement().value).toContain('"component": "竖向"');
    expect(editorElement().value).toContain('"stageChangeM": 0.012');
    expect(screen.getAllByText("TP1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
  });

  it("applies PRD leveling network node positions from the workbench diagram editor", () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /水准内业/ }));

    const positioning = screen.getByLabelText("水准网图节点定位");
    expect(within(positioning).getByText("TP1")).toBeTruthy();
    fireEvent.change(within(positioning).getByLabelText("TP1 图上X"), { target: { value: "220" } });
    fireEvent.change(within(positioning).getByLabelText("TP1 图上Y"), { target: { value: "90" } });
    fireEvent.click(within(positioning).getByRole("button", { name: "应用节点定位" }));

    expect(editorElement().value).toContain('"diagramPositions"');
    expect(editorElement().value).toContain('"pointName": "TP1"');
    expect(editorElement().value).toContain('"diagramX": 220');
    expect(editorElement().value).toContain('"diagramY": 90');
    const tp1Node = document.querySelector('circle[data-point-name="TP1"]');
    expect(tp1Node?.getAttribute("cx")).toBe("220");
    expect(tp1Node?.getAttribute("cy")).toBe("90");
  });

  it("drags PRD leveling network nodes into the diagram position editor", () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /水准内业/ }));

    const svg = document.querySelector(".ewb-visualization svg") as SVGSVGElement | null;
    const tp1Node = document.querySelector('circle[data-point-name="TP1"]') as SVGCircleElement | null;
    expect(svg).toBeTruthy();
    expect(tp1Node).toBeTruthy();
    Object.defineProperty(svg, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 320,
        height: 240,
        right: 320,
        bottom: 240,
        toJSON: () => ({}),
      }),
    });

    fireEvent.mouseDown(tp1Node as SVGCircleElement, { clientX: 220, clientY: 90, button: 0 });
    fireEvent.mouseMove(window, { clientX: 260, clientY: 120 });
    fireEvent.mouseUp(window);

    const positioning = screen.getByLabelText("水准网图节点定位");
    expect((within(positioning).getByLabelText("TP1 图上X") as HTMLInputElement).value).toBe("260");
    expect((within(positioning).getByLabelText("TP1 图上Y") as HTMLInputElement).value).toBe("120");

    fireEvent.click(within(positioning).getByRole("button", { name: "应用节点定位" }));
    expect(editorElement().value).toContain('"diagramX": 260');
    expect(editorElement().value).toContain('"diagramY": 120');
  });

  it("drafts PRD AI adjustment report prompts from indoor deliverables", () => {
    installLocalStorageStub();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("工程名称"), { target: { value: "沪杭铁路精测复核" } });
    fireEvent.change(screen.getByLabelText("标段"), { target: { value: "TJ-02" } });
    fireEvent.change(screen.getByLabelText("测站"), { target: { value: "DK10+100 控制网" } });

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /导线内业/ }));

    const traverseAiReport = screen.getByLabelText("AI平差报告");
    expect(within(traverseAiReport).getByText("DeepSeek 报告草稿")).toBeTruthy();
    expect(within(traverseAiReport).getAllByText(/闭合差/).length).toBeGreaterThan(0);
    expect(within(traverseAiReport).getAllByText(/中误差/).length).toBeGreaterThan(0);
    expect(within(traverseAiReport).getAllByText(/控制点兼容性/).length).toBeGreaterThan(0);

    fireEvent.click(within(traverseAiReport).getByRole("button", { name: "复制报告草稿" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("# 导线内业平差说明"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("沪杭铁路精测复核"));
    writeText.mockClear();

    fireEvent.click(within(traverseAiReport).getByRole("button", { name: "复制 DeepSeek 提示词" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("请以铁路工程内业平差报告口吻"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("控制点兼容性"));

    fireEvent.click(within(workflowPanel).getByRole("button", { name: /水准内业/ }));

    const levelAiReport = screen.getByLabelText("AI平差报告");
    expect(within(levelAiReport).getAllByText(/测段残差/).length).toBeGreaterThan(0);
    expect(within(levelAiReport).getAllByText(/高程中误差/).length).toBeGreaterThan(0);
    fireEvent.click(within(levelAiReport).getByRole("button", { name: "复制报告草稿" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("# 水准内业平差说明"));
  });

  it("exports the PRD AI adjustment report draft from the result panel", async () => {
    installLocalStorageStub();
    vi.mocked(save).mockResolvedValue("/tmp/railwise-indoor-ai-report.md");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "run_survey_adjustment") return Promise.reject(new Error("offline fallback"));
      if (command === "write_text_file") return Promise.resolve(args);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("工程名称"), { target: { value: "沪杭铁路精测复核" } });
    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /导线内业/ }));
    fireEvent.click(within(screen.getByLabelText("AI平差报告")).getByRole("button", { name: "导出 AI 报告" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "write_text_file",
        expect.objectContaining({
          path: "/tmp/railwise-indoor-ai-report.md",
          content: expect.stringContaining("# 导线内业平差说明"),
        }),
      ),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining("沪杭铁路精测复核"),
      }),
    );
    expect(save).toHaveBeenCalledWith({
      defaultPath: expect.stringContaining("-AI平差报告.md"),
      filters: [{ name: "Railwise AI 平差报告 Markdown", extensions: ["md"] }],
    });
    expect(screen.getByText("AI 平差报告已导出")).toBeTruthy();
  });

  it("exports a PRD indoor adjustment DOCX report from the result panel", async () => {
    installLocalStorageStub();
    vi.mocked(save).mockResolvedValue("/tmp/railwise-indoor-adjustment-report.docx");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "run_survey_adjustment") return Promise.reject(new Error("offline fallback"));
      if (command === "write_binary_file") return Promise.resolve(args);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("工程名称"), { target: { value: "沪杭铁路精测复核" } });
    fireEvent.click(within(screen.getByLabelText("内业平差流程")).getByRole("button", { name: /导线内业/ }));
    fireEvent.click(screen.getByRole("button", { name: "DOCX" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "write_binary_file",
        expect.objectContaining({
          path: "/tmp/railwise-indoor-adjustment-report.docx",
        }),
      ),
    );
    expect(save).toHaveBeenCalledWith({
      defaultPath: expect.stringContaining("-报告.docx"),
      filters: [{ name: "Railwise 内业平差报告 DOCX", extensions: ["docx"] }],
    });
    const writeCall = vi
      .mocked(invoke)
      .mock.calls.find(([command]) => command === "write_binary_file");
    const bytes = (writeCall?.[1] as { bytes?: number[] } | undefined)?.bytes ?? [];
    const entries = readZipEntriesFromBytes(bytes);
    expect(entries.get("word/document.xml")).toContain("内业平差工作台报告");
    expect(entries.get("word/document.xml")).toContain("沪杭铁路精测复核");
    expect(screen.getByText("内业平差报告 DOCX已导出")).toBeTruthy();
  });

  it("generates a PRD DeepSeek AI adjustment report from the result panel", async () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "run_survey_adjustment") return Promise.reject(new Error("offline fallback"));
      if (command === "generate_indoor_adjustment_ai_report") {
        expect(args).toMatchObject({
          request: {
            sourceToolId: "traverse_adjustment",
            projectContext: {
              projectName: "沪杭铁路精测复核",
              contractSection: "TJ-02",
              stationName: "DK10+100 控制网",
            },
          },
        });
        expect(JSON.stringify(args)).toContain("请以铁路工程内业平差报告口吻");
        return Promise.resolve({
          schema: "railwise.engineering.indoorAdjustment.aiReportGeneration.v1",
          generatedAt: "2026-06-07T10:00:00.000Z",
          provider: "deepseek_chat_completions",
          status: "generated",
          fallbackUsed: false,
          model: "deepseek-v4-flash",
          reportMarkdown: "# DeepSeek 生成的导线内业平差报告\n\n闭合差、中误差和控制点兼容性均满足报审要求。",
          reportFingerprint: "fnv1a32:deepseek-report",
          promptFingerprint: "fnv1a32:prompt",
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("工程名称"), { target: { value: "沪杭铁路精测复核" } });
    fireEvent.change(screen.getByLabelText("标段"), { target: { value: "TJ-02" } });
    fireEvent.change(screen.getByLabelText("测站"), { target: { value: "DK10+100 控制网" } });
    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /导线内业/ }));
    fireEvent.click(within(screen.getByLabelText("AI平差报告")).getByRole("button", { name: "生成 DeepSeek 报告" }));

    await waitFor(() => expect(screen.getByText("DeepSeek AI 平差报告已生成")).toBeTruthy());
    expect(screen.getByText("生成状态：DeepSeek 已生成")).toBeTruthy();
    expect(screen.getByText(/DeepSeek 生成的导线内业平差报告/)).toBeTruthy();
    expect(screen.getByText(/deepseek-v4-flash/)).toBeTruthy();
  });

  it("falls back to the local PRD AI adjustment report draft when DeepSeek generation fails", async () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "run_survey_adjustment") return Promise.reject(new Error("offline fallback"));
      if (command === "generate_indoor_adjustment_ai_report") {
        return Promise.reject(new Error("DeepSeek network unavailable"));
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /水准内业/ }));
    fireEvent.click(within(screen.getByLabelText("AI平差报告")).getByRole("button", { name: "生成 DeepSeek 报告" }));

    await waitFor(() => expect(screen.getByText("DeepSeek 报告生成失败，已保留本地草稿")).toBeTruthy());
    expect(screen.getByText("生成状态：本地草稿降级")).toBeTruthy();
    expect(screen.getByText(/DeepSeek network unavailable/)).toBeTruthy();
    expect(within(screen.getByLabelText("AI平差报告")).getByText(/水准内业平差说明/)).toBeTruthy();
  });

  it("exports the PRD indoor cloud sync package from the result panel", async () => {
    installLocalStorageStub();
    vi.mocked(save).mockResolvedValue("/tmp/railwise-indoor-cloud-sync.json");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "run_survey_adjustment") return Promise.reject(new Error("offline fallback"));
      if (command === "write_text_file") return Promise.resolve(args);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("工程名称"), { target: { value: "沪杭铁路精测复核" } });
    fireEvent.change(screen.getByLabelText("标段"), { target: { value: "TJ-02" } });
    fireEvent.change(screen.getByLabelText("测站"), { target: { value: "DK10+100 控制网" } });
    fireEvent.click(within(screen.getByLabelText("内业平差流程")).getByRole("button", { name: /导线内业/ }));
    fireEvent.click(screen.getByRole("button", { name: "云同步包" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "write_text_file",
        expect.objectContaining({
          path: "/tmp/railwise-indoor-cloud-sync.json",
          content: expect.stringContaining("railwise.engineering.indoorAdjustment.cloudSync.v1"),
        }),
      ),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining("reasonix_deepseek_engineering_cloud"),
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining("沪杭铁路精测复核"),
      }),
    );
    expect(save).toHaveBeenCalledWith({
      defaultPath: expect.stringContaining("-云同步包.json"),
      filters: [{ name: "Railwise 内业云同步包 JSON", extensions: ["json"] }],
    });
    expect(screen.getByText("云同步包已导出")).toBeTruthy();
  });

  it("persists the PRD project context and indoor adjustment draft locally", () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    const firstRender = render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("工程名称"), { target: { value: "沪杭铁路精测复核" } });
    fireEvent.change(screen.getByLabelText("标段"), { target: { value: "TJ-02" } });
    fireEvent.change(screen.getByLabelText("测站"), { target: { value: "DK10+100 控制网" } });
    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /导线内业/ }));

    expect(window.localStorage.getItem("railwise.engineeringWorkbench.localDraft.v1")).toContain(
      "沪杭铁路精测复核",
    );

    firstRender.unmount();
    render(<EngineeringWorkbench onClose={vi.fn()} />);

    expect(screen.getByDisplayValue("沪杭铁路精测复核")).toBeTruthy();
    expect(screen.getByDisplayValue("TJ-02")).toBeTruthy();
    expect(screen.getByDisplayValue("DK10+100 控制网")).toBeTruthy();
    expect(screen.getAllByText(/导线内业平差完成/).length).toBeGreaterThan(0);
    expect(editorElement().value).toContain("hzAngleDeg");
    expect((screen.getByTitle("选择输入解析格式") as HTMLSelectElement).value).toBe("csv");
  });

  it("persists and restores the PRD indoor draft through Tauri local storage", async () => {
    installLocalStorageStub();
    const tauriDraft = {
      schema: "railwise.engineeringWorkbench.localDraft.v1",
      projectContext: {
        projectName: "沪杭铁路精测复核",
        contractSection: "TJ-02",
        stationName: "DK10+100 控制网",
      },
      activeId: "traverse_adjustment",
      inputFormat: "json",
      inputText: JSON.stringify(
        {
          knownPoints: [
            { name: "S", x: 0, y: 0, fixed: true },
            { name: "E", x: 100, y: 0, fixed: true },
          ],
          observations: [{ from: "S", to: "P1", hzAngleDeg: 270, slopeDistM: 100 }],
          params: { startAzimuthDeg: 0, endAzimuthDeg: 90, model: "normal" },
        },
        null,
        2,
      ),
      savedAt: "2026-06-06T08:30:00.000Z",
    };
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "load_engineering_workbench_draft") return Promise.resolve(JSON.stringify(tauriDraft));
      if (command === "save_engineering_workbench_draft") return Promise.resolve(args);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByDisplayValue("沪杭铁路精测复核")).toBeTruthy());
    expect(screen.getByDisplayValue("TJ-02")).toBeTruthy();
    expect(screen.getByDisplayValue("DK10+100 控制网")).toBeTruthy();
    expect(screen.getAllByText(/导线内业平差完成/).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("测站"), { target: { value: "DK10+200 控制网" } });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "save_engineering_workbench_draft",
        expect.objectContaining({
          draft: expect.stringContaining("DK10+200 控制网"),
        }),
      ),
    );
    const saveCall = vi
      .mocked(invoke)
      .mock.calls.find(
        ([command, args]) =>
          command === "save_engineering_workbench_draft" &&
          typeof (args as { draft?: unknown } | undefined)?.draft === "string" &&
          ((args as { draft: string }).draft.includes("DK10+200 控制网")),
      );
    const savedCatalog = JSON.parse((saveCall?.[1] as { draft: string }).draft);
    expect(savedCatalog).toMatchObject({
      schema: "railwise.engineeringWorkbench.localDraftCatalog.v1",
    });
    const savedDraft = savedCatalog.drafts.find(
      (draft: { draftId?: string }) => draft.draftId === savedCatalog.activeDraftId,
    );
    expect(savedDraft).toMatchObject({
      schema: "railwise.engineeringWorkbench.localDraft.v1",
      activeId: "traverse_adjustment",
      inputFormat: "json",
      projectContext: { stationName: "DK10+200 控制网" },
    });
  });

  it("switches between PRD local project drafts from the Tauri draft catalog", async () => {
    installLocalStorageStub();
    const traverseDraft = {
      schema: "railwise.engineeringWorkbench.localDraft.v1",
      draftId: "traverse-huhang",
      title: "沪杭铁路精测复核 / DK10+100 控制网",
      projectContext: {
        projectName: "沪杭铁路精测复核",
        contractSection: "TJ-02",
        stationName: "DK10+100 控制网",
      },
      activeId: "traverse_adjustment",
      inputFormat: "json",
      inputText: JSON.stringify(
        {
          knownPoints: [
            { name: "S", x: 0, y: 0, fixed: true },
            { name: "E", x: 100, y: 0, fixed: true },
          ],
          observations: [{ from: "S", to: "P1", hzAngleDeg: 270, slopeDistM: 100 }],
          params: { startAzimuthDeg: 0, endAzimuthDeg: 90, model: "normal" },
        },
        null,
        2,
      ),
      savedAt: "2026-06-06T08:30:00.000Z",
    };
    const levelDraft = {
      schema: "railwise.engineeringWorkbench.localDraft.v1",
      draftId: "level-jinghu",
      title: "京沪高铁沉降复测 / BM 联测",
      projectContext: {
        projectName: "京沪高铁沉降复测",
        contractSection: "JH-05",
        stationName: "BM 联测",
      },
      activeId: "level_adjustment",
      inputFormat: "json",
      inputText: JSON.stringify(
        {
          knownBms: [{ name: "BM1", h: 100, fixed: true }],
          segments: [
            { from: "BM1", to: "TP1", dhM: 1.234, lengthKm: 1, nStations: 8 },
            { from: "BM1", to: "TP1", dhM: 1.236, lengthKm: 1, nStations: 8 },
          ],
          weightMode: "length",
        },
        null,
        2,
      ),
      savedAt: "2026-06-06T08:40:00.000Z",
    };
    const catalog = {
      schema: "railwise.engineeringWorkbench.localDraftCatalog.v1",
      activeDraftId: traverseDraft.draftId,
      drafts: [traverseDraft, levelDraft],
      updatedAt: "2026-06-06T08:40:00.000Z",
    };
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "load_engineering_workbench_draft") return Promise.resolve(JSON.stringify(catalog));
      if (command === "save_engineering_workbench_draft") return Promise.resolve(args);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByDisplayValue("沪杭铁路精测复核")).toBeTruthy());
    const draftSelect = screen.getByTitle("选择本地工程草稿") as HTMLSelectElement;
    expect(draftSelect.value).toBe("traverse-huhang");

    fireEvent.change(draftSelect, { target: { value: "level-jinghu" } });

    await waitFor(() => expect(screen.getByDisplayValue("京沪高铁沉降复测")).toBeTruthy());
    expect(screen.getByDisplayValue("JH-05")).toBeTruthy();
    expect(screen.getAllByText(/水准内业平差完成/).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("工程名称"), { target: { value: "京沪高铁沉降复测复核" } });
    fireEvent.click(screen.getByRole("button", { name: "保存工程草稿" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "save_engineering_workbench_draft",
        expect.objectContaining({
          draft: expect.stringContaining("railwise.engineeringWorkbench.localDraftCatalog.v1"),
        }),
      ),
    );
    expect(invoke).toHaveBeenCalledWith(
      "save_engineering_workbench_draft",
      expect.objectContaining({
        draft: expect.stringContaining("京沪高铁沉降复测复核"),
      }),
    );
    expect(screen.getByText("工程草稿已保存")).toBeTruthy();
  });

  it("uses desktop IPC survey adjustment for indoor traverse workflows when available", async () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "run_survey_adjustment") {
        return Promise.resolve({
          method: "traverse_bowditch_adjustment",
          observation_count: 1,
          total_distance_m: 100,
          closures: {
            angle_sec: 0,
            coord_mm: 0,
            fx_mm: 0,
            fy_mm: 0,
            relative_closure: "∞",
          },
          unit_weight_mse_mm: 0,
          export_rows: [
            {
              row_type: "traverse_adjustment_summary",
              observation_count: 1,
              total_distance_m: 100,
              coordinate_closure_mm: 0,
            },
            {
              row_type: "traverse_adjusted_coordinate",
              point_name: "P1",
              adjusted_x: 100,
              adjusted_y: 0,
              point_mse_mm: 0,
            },
            {
              row_type: "traverse_error_ellipse",
              point_name: "P1",
              center_x: 100,
              center_y: 0,
              semi_major_mm: 0,
              semi_minor_mm: 0,
              theta_deg: 90,
              point_mse_mm: 0,
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /导线内业/ }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "run_survey_adjustment",
        expect.objectContaining({
          request: expect.objectContaining({
            tool: "traverse_adjust",
            input: expect.objectContaining({
              known_points: expect.any(Array),
              observations: expect.any(Array),
            }),
          }),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByText("survey_mcp_ipc")).toBeTruthy());
  });

  it("keeps PRD indoor traverse and leveling usable when desktop survey IPC is offline", async () => {
    installLocalStorageStub();
    vi.mocked(save)
      .mockResolvedValueOnce("/tmp/railwise-offline-traverse.xlsx")
      .mockResolvedValueOnce("/tmp/railwise-offline-level.xlsx");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "run_survey_adjustment") return Promise.reject(new Error("survey-mcp unavailable"));
      if (command === "save_engineering_workbench_draft") return Promise.resolve(args);
      if (command === "write_binary_file") return Promise.resolve(args);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /导线内业/ }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("run_survey_adjustment", expect.any(Object)));
    expect(screen.getAllByText(/导线内业平差完成/).length).toBeGreaterThan(0);
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "run_survey_adjustment")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "保存工程草稿" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "save_engineering_workbench_draft",
        expect.objectContaining({ draft: expect.stringContaining("traverse_adjustment") }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "XLSX" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "write_binary_file",
        expect.objectContaining({ path: "/tmp/railwise-offline-traverse.xlsx" }),
      ),
    );
    expect(screen.getByText("内业平差成果表已导出")).toBeTruthy();

    fireEvent.click(within(workflowPanel).getByRole("button", { name: /水准内业/ }));

    await waitFor(() =>
      expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "run_survey_adjustment")).toHaveLength(2),
    );
    expect(screen.getAllByText(/水准内业平差完成/).length).toBeGreaterThan(0);
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "run_survey_adjustment")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "保存工程草稿" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "save_engineering_workbench_draft",
        expect.objectContaining({ draft: expect.stringContaining("level_adjustment") }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "XLSX" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "write_binary_file",
        expect.objectContaining({ path: "/tmp/railwise-offline-level.xlsx" }),
      ),
    );
    const levelWriteCall = vi
      .mocked(invoke)
      .mock.calls.find(
        ([command, args]) =>
          command === "write_binary_file" &&
          (args as { path?: string } | undefined)?.path === "/tmp/railwise-offline-level.xlsx",
      );
    const levelWorkbookText = Array.from(
      readZipEntriesFromBytes((levelWriteCall?.[1] as { bytes?: number[] } | undefined)?.bytes ?? []).values(),
    ).join("\n");
    expect(levelWorkbookText).toContain("水准点高程成果表");
    expect(levelWorkbookText).toContain("水准网示意图");
  }, 30000);

  it("loads and calculates the shield guidance field deviation sample", async () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /盾构姿态复核/ }));
    fireEvent.click(screen.getByRole("button", { name: /现场样表：盾构姿态复核表/ }));

    expect((screen.getByTitle("选择输入解析格式") as HTMLSelectElement).value).toBe("csv");
    expect(editorElement().value).toContain("盾构环号,推进日期,设计X(m)");
    expect(editorElement().value).toContain("水平偏差(mm),高程偏差(mm),方位角偏差(°)");
    const importPreview = document.querySelector(".ewb-import-preview");
    expect(importPreview).not.toBeNull();
    expect(within(importPreview as HTMLElement).getByText("盾构姿态复核表")).toBeTruthy();
    expect(screen.getAllByText("预警").length).toBeGreaterThan(0);
  });

  it("exports the professional CSV sample package for all engineering tools", async () => {
    installLocalStorageStub();
    vi.mocked(save).mockResolvedValue("/tmp/railwise-professional-csv-samples.zip");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "write_binary_file") return Promise.resolve(args);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "样表包" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "write_binary_file",
        expect.objectContaining({ path: "/tmp/railwise-professional-csv-samples.zip" }),
      ),
    );
    expect(save).toHaveBeenCalledWith({
      defaultPath: "railwise-professional-csv-samples.zip",
      filters: [{ name: "Railwise 专业 CSV 样表包", extensions: ["zip"] }],
    });
    const writeCall = vi
      .mocked(invoke)
      .mock.calls.find(([command]) => command === "write_binary_file");
    const bytes = (writeCall?.[1] as { bytes?: number[] } | undefined)?.bytes ?? [];
    const zipText = new TextDecoder().decode(Uint8Array.from(bytes));
    expect(zipText).toContain("manifest.json");
    expect(zipText).toContain("sample-index.csv");
    expect(zipText).toContain("samples/track_geometry_review/track-geometry-inspection-sample.csv");
    expect(zipText).toContain("samples/shield_guidance/shield-guidance-pose-sample.csv");
    expect(zipText).toContain("线路,里程,设计轨距(mm)");
    expect(zipText).toContain("盾构环号,推进日期,设计X(m)");
    expect(zipText).toContain("水平偏差(mm),高程偏差(mm),方位角偏差(°)");
    expect(screen.getByText("专业 CSV 样表包已导出")).toBeTruthy();
  });

  it("exports the current engineering result as an XLSX workbook from the result panel", async () => {
    installLocalStorageStub();
    vi.mocked(save).mockResolvedValue("/tmp/railwise-result-workbook.xlsx");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "write_binary_file") return Promise.resolve(args);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "XLSX" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "write_binary_file",
        expect.objectContaining({ path: "/tmp/railwise-result-workbook.xlsx" }),
      ),
    );
    expect(save).toHaveBeenCalledWith({
      defaultPath: expect.stringContaining("成果表.xlsx"),
      filters: [{ name: "Railwise 工程成果表 XLSX", extensions: ["xlsx"] }],
    });
    const writeCall = vi
      .mocked(invoke)
      .mock.calls.find(([command]) => command === "write_binary_file");
    const bytes = (writeCall?.[1] as { bytes?: number[] } | undefined)?.bytes ?? [];
    expect(Buffer.from(bytes).subarray(0, 2).toString("utf8")).toBe("PK");
    expect(screen.getByText("XLSX 成果表已导出")).toBeTruthy();
  });

  it("exports PRD adjustment exchange files from the result panel", async () => {
    installLocalStorageStub();
    vi.mocked(save).mockResolvedValue("/tmp/railwise-traverse.in2");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "run_survey_adjustment") return Promise.reject(new Error("offline fallback"));
      if (command === "write_text_file") return Promise.resolve(args);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /导线内业/ }));
    fireEvent.click(screen.getByRole("button", { name: /科傻.*回读\s*正常.*验收\s*通过/ }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "write_text_file",
        expect.objectContaining({
          path: "/tmp/railwise-traverse.in2",
          content: expect.stringContaining("[RAILWISE_TRAVERSE_ADJUSTMENT]"),
        }),
      ),
    );
    expect(save).toHaveBeenCalledWith({
      defaultPath: expect.stringContaining("科傻.in2"),
      filters: [{ name: "Railwise 科傻 平差交换成果", extensions: ["in2"] }],
    });
    const writeCall = vi
      .mocked(invoke)
      .mock.calls.find(([command]) => command === "write_text_file");
    const content = (writeCall?.[1] as { content?: string } | undefined)?.content ?? "";
    expect(content).toContain("P1,100.0000,0.0000,1.005,0.970,1.396");
    expect(screen.getByText("科傻已导出")).toBeTruthy();
  });

  it("exports every PRD adjustment exchange format from the result panel", async () => {
    installLocalStorageStub();
    const exchangeFormats = [
      {
        title: "科傻",
        extension: "in2",
        path: "/tmp/railwise-traverse.in2",
        marker: "[RAILWISE_TRAVERSE_ADJUSTMENT]",
        filter: "Railwise 科傻 平差交换成果",
      },
      {
        title: "平差易",
        extension: "pce",
        path: "/tmp/railwise-traverse.pce",
        marker: "PINGCHAYI_TEXT_EXCHANGE",
        filter: "Railwise 平差易 平差交换成果",
      },
      {
        title: "清华山维",
        extension: "svy",
        path: "/tmp/railwise-traverse.svy",
        marker: "TSINGHUA_SHANWEI_TEXT_EXCHANGE",
        filter: "Railwise 清华山维 平差交换成果",
      },
      {
        title: "HO 成果",
        extension: "ho",
        path: "/tmp/railwise-traverse.ho",
        marker: "[RAILWISE_HO_RESULTS]",
        filter: "Railwise HO 成果 平差交换成果",
      },
      {
        title: "OU1 成果",
        extension: "ou1",
        path: "/tmp/railwise-traverse.ou1",
        marker: "[RAILWISE_OU1_RESULTS]",
        filter: "Railwise OU1 成果 平差交换成果",
      },
      {
        title: "DXF",
        extension: "dxf",
        path: "/tmp/railwise-traverse.dxf",
        marker: "RAILWISE_DXF_TEXT_EXCHANGE",
        filter: "Railwise DXF 平差交换成果",
      },
    ];
    for (const item of exchangeFormats) {
      vi.mocked(save).mockResolvedValueOnce(item.path);
    }
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "run_survey_adjustment") return Promise.reject(new Error("offline fallback"));
      if (command === "write_text_file") return Promise.resolve(args);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /导线内业/ }));

    for (const item of exchangeFormats) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`${item.title}.*回读\\s*正常.*验收\\s*通过`) }));
      await waitFor(() =>
        expect(invoke).toHaveBeenCalledWith(
          "write_text_file",
          expect.objectContaining({
            path: item.path,
            content: expect.stringContaining(item.marker),
          }),
        ),
      );
      expect(screen.getByText(`${item.title}已导出`)).toBeTruthy();
    }

    for (const item of exchangeFormats) {
      expect(save).toHaveBeenCalledWith({
        defaultPath: expect.stringContaining(`${item.title}.${item.extension}`),
        filters: [{ name: item.filter, extensions: [item.extension] }],
      });
    }
    const writeCalls = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "write_text_file")
      .map(([, args]) => args as { path?: string; content?: string });
    expect(writeCalls).toHaveLength(exchangeFormats.length);
    for (const item of exchangeFormats) {
      const call = writeCalls.find((entry) => entry.path === item.path);
      expect(call?.content).toContain(item.marker);
    }
  }, 30000);

  it("exports every PRD leveling adjustment exchange format from the result panel", async () => {
    installLocalStorageStub();
    const exchangeFormats = [
      {
        title: "科傻",
        extension: "in2",
        path: "/tmp/railwise-level.in2",
        marker: "[RAILWISE_LEVEL_ADJUSTMENT]",
        filter: "Railwise 科傻 平差交换成果",
      },
      {
        title: "平差易",
        extension: "pce",
        path: "/tmp/railwise-level.pce",
        marker: "PINGCHAYI_TEXT_EXCHANGE",
        filter: "Railwise 平差易 平差交换成果",
      },
      {
        title: "清华山维",
        extension: "svy",
        path: "/tmp/railwise-level.svy",
        marker: "TSINGHUA_SHANWEI_TEXT_EXCHANGE",
        filter: "Railwise 清华山维 平差交换成果",
      },
      {
        title: "HO 成果",
        extension: "ho",
        path: "/tmp/railwise-level.ho",
        marker: "[RAILWISE_HO_RESULTS]",
        filter: "Railwise HO 成果 平差交换成果",
      },
      {
        title: "OU1 成果",
        extension: "ou1",
        path: "/tmp/railwise-level.ou1",
        marker: "[RAILWISE_OU1_RESULTS]",
        filter: "Railwise OU1 成果 平差交换成果",
      },
      {
        title: "DXF",
        extension: "dxf",
        path: "/tmp/railwise-level.dxf",
        marker: "LEVEL_HEIGHT",
        filter: "Railwise DXF 平差交换成果",
      },
    ];
    for (const item of exchangeFormats) {
      vi.mocked(save).mockResolvedValueOnce(item.path);
    }
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") return Promise.resolve([]);
      if (command === "run_survey_adjustment") return Promise.reject(new Error("offline fallback"));
      if (command === "write_text_file") return Promise.resolve(args);
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const workflowPanel = screen.getByLabelText("内业平差流程");
    fireEvent.click(within(workflowPanel).getByRole("button", { name: /水准内业/ }));

    for (const item of exchangeFormats) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`${item.title}.*回读\\s*正常.*验收\\s*通过`) }));
      await waitFor(() =>
        expect(invoke).toHaveBeenCalledWith(
          "write_text_file",
          expect.objectContaining({
            path: item.path,
            content: expect.stringContaining(item.marker),
          }),
        ),
      );
      expect(screen.getByText(`${item.title}已导出`)).toBeTruthy();
    }

    for (const item of exchangeFormats) {
      expect(save).toHaveBeenCalledWith({
        defaultPath: expect.stringContaining(`${item.title}.${item.extension}`),
        filters: [{ name: item.filter, extensions: [item.extension] }],
      });
    }
    const writeCalls = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "write_text_file")
      .map(([, args]) => args as { path?: string; content?: string });
    expect(writeCalls).toHaveLength(exchangeFormats.length);
    for (const item of exchangeFormats) {
      const call = writeCalls.find((entry) => entry.path === item.path);
      expect(call?.content).toContain(item.marker);
    }
  }, 30000);

  it("summarizes professional engine acceptance after refreshing sidecar status", async () => {
    installLocalStorageStub();
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "list_engineering_engines") {
        return Promise.resolve([
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
            binaries: [{ name: "pdal", available: true, path: "/opt/railwise/bin/pdal", version: "PDAL 2.6.3" }],
          },
        ]);
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const enginePanel = screen.getByText("专业引擎").closest(".ewb-engine-panel");
    expect(enginePanel).not.toBeNull();
    fireEvent.click(within(enginePanel as HTMLElement).getByRole("button", { name: /刷新/ }));

    await waitFor(() => expect(screen.getByText("专业引擎状态已刷新")).toBeTruthy());
    const acceptance = screen.getByText("引擎验收").closest(".ewb-engine-acceptance");
    expect(acceptance).not.toBeNull();
    expect(within(acceptance as HTMLElement).getByText("环境待处理")).toBeTruthy();
    expect(within(acceptance as HTMLElement).getByText("二进制 3/5")).toBeTruthy();
    expect(within(acceptance as HTMLElement).getByText("执行审查 0/9")).toBeTruthy();
    expect(within(acceptance as HTMLElement).getByText("缺失 2")).toBeTruthy();
    expect(within(acceptance as HTMLElement).getByText(/ogrinfo/)).toBeTruthy();
    expect(within(acceptance as HTMLElement).getByText(/ogr2ogr/)).toBeTruthy();
    expect(within(acceptance as HTMLElement).getByText(/专业引擎预检和审查结果/)).toBeTruthy();
  });

  it("exports professional engine acceptance evidence from refreshed sidecar status", async () => {
    installLocalStorageStub();
    vi.mocked(save).mockResolvedValue("/tmp/engine-acceptance.md");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "list_engineering_engines") {
        return Promise.resolve([
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
            binaries: [{ name: "pdal", available: true, path: "/opt/railwise/bin/pdal", version: "PDAL 2.6.3" }],
          },
        ]);
      }
      if (command === "write_text_file") {
        return Promise.resolve(args);
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    const enginePanel = screen.getByText("专业引擎").closest(".ewb-engine-panel");
    expect(enginePanel).not.toBeNull();
    fireEvent.click(within(enginePanel as HTMLElement).getByRole("button", { name: /刷新/ }));

    await waitFor(() => expect(screen.getByText("专业引擎状态已刷新")).toBeTruthy());
    fireEvent.click(within(enginePanel as HTMLElement).getByRole("button", { name: /验收 MD/ }));

    await waitFor(() => expect(vi.mocked(save)).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringContaining("engineering-engine-acceptance.md"),
        filters: [{ name: "Railwise 专业引擎验收 Markdown", extensions: ["md"] }],
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        path: "/tmp/engine-acceptance.md",
        content: expect.stringContaining("# Railwise 工程专业引擎工作台验收"),
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining("railwise.engineering.engineAcceptance.v1"),
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining("验收结论：blocked"),
      }),
    );
  });

  it("expands ZIP import history rows into traceable acceptance details", () => {
    installLocalStorageStub();
    seedArchiveZipImportReviewHistory();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /加入批次/ }));

    const archiveName = screen.getByText("tampered-project.zip");
    const row = archiveName.closest(".ewb-batch-comparison-row");
    expect(row).not.toBeNull();

    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "详情" }));

    expect(within(row as HTMLElement).getByText("验收人")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("李工")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("来源路径")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("/archives/tampered.zip")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("Checksum 异常")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("7")).toBeTruthy();

    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: /复制追踪/ }));

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("归档文件：tampered-project.zip"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("来源路径：/archives/tampered.zip"),
    );

    writeText.mockClear();
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: /重验计划/ }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("# ZIP 验收历史重验计划"));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        'npm run verify:engineering-archive -- "/archives/tampered.zip" --require-clean',
      ),
    );
  });

  it("copies a newly imported issue handover checklist from the import audit", async () => {
    installLocalStorageStub();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(open).mockResolvedValue("/external/history.json");
    vi.mocked(invoke).mockResolvedValue({
      file_name: "history.json",
      content: archiveZipHistoryJson(),
      format: "json",
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "导入历史" }));
    await waitFor(() => expect(screen.getByText(/ZIP 验收历史已合并/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /加入批次/ }));

    const auditHead = await screen.findByText("最近导入审计");
    const auditSection = auditHead.closest(".ewb-batch-comparison-section");
    expect(auditSection).not.toBeNull();

    fireEvent.click(
      within(auditSection as HTMLElement).getByRole("button", { name: /新增异常交接/ }),
    );

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("# ZIP 验收历史新增异常交接清单"),
    );
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("external-rejected.zip"));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        'npm run verify:engineering-archive -- "/external/rejected.zip" --require-clean',
      ),
    );
  });

  it("expands duplicate import audit differences and focuses the history ledger on imported issues", async () => {
    installLocalStorageStub();
    seedArchiveZipImportReviewHistory();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(open).mockResolvedValue("/external/history.json");
    vi.mocked(invoke).mockResolvedValue({
      file_name: "history.json",
      content: archiveZipHistoryWithDuplicateJson(),
      format: "json",
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "导入历史" }));
    await waitFor(() => expect(screen.getByText(/导入 2 条，新增 1 条，重复 1 条/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /加入批次/ }));

    const auditHead = await screen.findByText("最近导入审计");
    const auditSection = auditHead.closest(".ewb-batch-comparison-section");
    expect(auditSection).not.toBeNull();

    const duplicateAuditRow = within(auditSection as HTMLElement)
      .getByText("tampered-project.zip")
      .closest(".ewb-batch-comparison-row");
    expect(duplicateAuditRow).not.toBeNull();

    fireEvent.click(within(duplicateAuditRow as HTMLElement).getByRole("button", { name: "详情" }));

    expect(within(duplicateAuditRow as HTMLElement).getByText("重复记录差异")).toBeTruthy();
    expect(
      within(duplicateAuditRow as HTMLElement).getAllByText("验收人").length,
    ).toBeGreaterThanOrEqual(2);
    expect(within(duplicateAuditRow as HTMLElement).getByText("导入：外部验收员A")).toBeTruthy();
    expect(within(duplicateAuditRow as HTMLElement).getByText("本机：李工")).toBeTruthy();
    expect(
      within(duplicateAuditRow as HTMLElement).getAllByText("来源路径").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      within(duplicateAuditRow as HTMLElement).getByText("导入：/external/tampered.zip"),
    ).toBeTruthy();

    fireEvent.click(
      within(auditSection as HTMLElement).getByRole("button", { name: /筛选新增异常/ }),
    );

    expect(screen.getByText("联动筛选：本次新增异常 1 条")).toBeTruthy();
    expect(screen.getByText("筛选命中：1/2")).toBeTruthy();
    expect(
      (screen.getByPlaceholderText("搜索文件、验收人、问题、指纹") as HTMLInputElement).value,
    ).toBe("");
    expect((screen.getByRole("checkbox", { name: /仅异常/ }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("exports the imported issue ledger from the latest import audit", async () => {
    installLocalStorageStub();
    vi.mocked(open).mockResolvedValue("/external/history.json");
    vi.mocked(save).mockResolvedValue("/tmp/imported-issue-ledger.md");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "read_engineering_import_file") {
        return Promise.resolve({
          file_name: "history.json",
          content: archiveZipHistoryJson(),
          format: "json",
        });
      }
      if (command === "write_text_file") {
        return Promise.resolve(args);
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "导入历史" }));
    await waitFor(() => expect(screen.getByText(/ZIP 验收历史已合并/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /加入批次/ }));

    const auditHead = await screen.findByText("最近导入审计");
    const auditSection = auditHead.closest(".ewb-batch-comparison-section");
    expect(auditSection).not.toBeNull();

    fireEvent.click(
      within(auditSection as HTMLElement).getByRole("button", { name: /异常台账 MD/ }),
    );

    await waitFor(() => expect(vi.mocked(save)).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringContaining(
          "railwise-engineering-archive-import-history-issue-ledger",
        ),
        filters: [{ name: "Railwise ZIP 历史新增异常台账 Markdown", extensions: ["md"] }],
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        path: "/tmp/imported-issue-ledger.md",
        content: expect.stringContaining("# ZIP 验收历史新增异常联动台账"),
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining("external-rejected.zip"),
      }),
    );
  });

  it("exports an imported issue rectification dispatch from the latest import audit", async () => {
    installLocalStorageStub();
    vi.mocked(open).mockResolvedValue("/external/history.json");
    vi.mocked(save).mockResolvedValue("/tmp/imported-issue-rectification-dispatch.md");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "read_engineering_import_file") {
        return Promise.resolve({
          file_name: "history.json",
          content: archiveZipHistoryJson(),
          format: "json",
        });
      }
      if (command === "write_text_file") {
        return Promise.resolve(args);
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "导入历史" }));
    await waitFor(() => expect(screen.getByText(/ZIP 验收历史已合并/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /加入批次/ }));

    const auditHead = await screen.findByText("最近导入审计");
    const auditSection = auditHead.closest(".ewb-batch-comparison-section");
    expect(auditSection).not.toBeNull();

    fireEvent.click(
      within(auditSection as HTMLElement).getByRole("button", { name: /整改派单 MD/ }),
    );

    await waitFor(() => expect(vi.mocked(save)).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringContaining(
          "railwise-engineering-archive-import-history-issue-rectification-dispatch",
        ),
        filters: [{ name: "Railwise ZIP 历史新增异常整改派单 Markdown", extensions: ["md"] }],
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        path: "/tmp/imported-issue-rectification-dispatch.md",
        content: expect.stringContaining("# ZIP 验收历史新增异常整改派单"),
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining("external-rejected.zip"),
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining('npm run verify:engineering-archive -- "/external/rejected.zip" --require-clean'),
      }),
    );
  });

  it("imports and exports an imported issue rectification closure update from the latest import audit", async () => {
    installLocalStorageStub();
    vi.mocked(open)
      .mockResolvedValueOnce("/external/history.json")
      .mockResolvedValueOnce("/external/zip-issue-rectification-closure.csv");
    vi.mocked(save).mockResolvedValue("/tmp/imported-issue-rectification-closure.md");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "read_engineering_import_file") {
        const path = (args as { path?: string } | undefined)?.path ?? "";
        if (path.includes("zip-issue-rectification-closure")) {
          return Promise.resolve({
            file_name: "zip-issue-rectification-closure.csv",
            content: [
              "issue_id,closure_status,closed_at,closed_by,closure_note,external_record_id",
              [
                "zip-history-imported-rejected-001-RECTIFY-001",
                "closed",
                "2026-06-06",
                "资料员A",
                "已重新打包并通过 ZIP 复验。",
                "ZIP-RECTIFY-CLOSED-001",
              ].join(","),
            ].join("\n"),
            format: "csv",
          });
        }
        return Promise.resolve({
          file_name: "history.json",
          content: archiveZipHistoryJson(),
          format: "json",
        });
      }
      if (command === "write_text_file") {
        return Promise.resolve(args);
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "导入历史" }));
    await waitFor(() => expect(screen.getByText(/ZIP 验收历史已合并/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /加入批次/ }));

    const auditHead = await screen.findByText("最近导入审计");
    const auditSection = auditHead.closest(".ewb-batch-comparison-section");
    expect(auditSection).not.toBeNull();

    fireEvent.click(
      within(auditSection as HTMLElement).getByRole("button", { name: /导入销项/ }),
    );

    await waitFor(() => expect(screen.getByText(/新增异常整改销项已导入/)).toBeTruthy());
    expect(within(auditSection as HTMLElement).getByText("新增异常整改销项")).toBeTruthy();
    expect(within(auditSection as HTMLElement).getByText(/已闭环 1 · 待闭环 0/)).toBeTruthy();

    fireEvent.click(
      within(auditSection as HTMLElement).getByRole("button", { name: /销项 MD/ }),
    );

    await waitFor(() => expect(vi.mocked(save)).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringContaining(
          "railwise-engineering-archive-import-history-issue-rectification-closure",
        ),
        filters: [{ name: "Railwise ZIP 历史新增异常整改销项 Markdown", extensions: ["md"] }],
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        path: "/tmp/imported-issue-rectification-closure.md",
        content: expect.stringContaining("# ZIP 验收历史新增异常整改销项回执"),
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining("ZIP-RECTIFY-CLOSED-001"),
      }),
    );
  });

  it("includes imported issue rectification dispatch and closure update when exporting the archive ZIP from the UI", async () => {
    installLocalStorageStub();
    vi.mocked(open)
      .mockResolvedValueOnce("/external/history.json")
      .mockResolvedValueOnce("/external/zip-issue-rectification-closure.csv");
    vi.mocked(save).mockResolvedValue("/tmp/engineering-batch-archive.zip");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "read_engineering_import_file") {
        const path = (args as { path?: string } | undefined)?.path ?? "";
        if (path.includes("zip-issue-rectification-closure")) {
          return Promise.resolve({
            file_name: "zip-issue-rectification-closure.csv",
            content: [
              "issue_id,closure_status,closed_at,closed_by,closure_note,external_record_id",
              [
                "zip-history-imported-rejected-001-RECTIFY-001",
                "closed",
                "2026-06-06",
                "资料员A",
                "已重新打包并通过 ZIP 复验。",
                "ZIP-RECTIFY-CLOSED-001",
              ].join(","),
            ].join("\n"),
            format: "csv",
          });
        }
        return Promise.resolve({
          file_name: "history.json",
          content: archiveZipHistoryJson(),
          format: "json",
        });
      }
      if (command === "write_binary_file") {
        return Promise.resolve(args);
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "导入历史" }));
    await waitFor(() => expect(screen.getByText(/ZIP 验收历史已合并/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /加入批次/ }));

    const auditHead = await screen.findByText("最近导入审计");
    const auditSection = auditHead.closest(".ewb-batch-comparison-section");
    expect(auditSection).not.toBeNull();

    fireEvent.click(
      within(auditSection as HTMLElement).getByRole("button", { name: /导入销项/ }),
    );
    await waitFor(() => expect(screen.getByText(/新增异常整改销项已导入/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "归档 ZIP" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "write_binary_file",
        expect.objectContaining({ path: "/tmp/engineering-batch-archive.zip" }),
      ),
    );
    const writeCall = vi
      .mocked(invoke)
      .mock.calls.find(([command]) => command === "write_binary_file");
    expect(writeCall).toBeTruthy();
    const bytes = (writeCall?.[1] as { bytes?: number[] } | undefined)?.bytes ?? [];
    const zipText = new TextDecoder().decode(Uint8Array.from(bytes));
    expect(zipText).toContain("batch/archive-zip-import-history-issue-rectification-dispatch.md");
    expect(zipText).toContain("batch/archive-zip-import-history-issue-rectification-closure-update.json");
    expect(zipText).toContain("railwise.engineeringArchive.importReviewHistoryImportIssueRectificationDispatch.v1");
    expect(zipText).toContain("railwise.engineeringArchive.importReviewHistoryImportIssueRectificationClosureUpdate.v1");
    expect(zipText).toContain("ZIP-RECTIFY-CLOSED-001");
  });

  it("shows and exports the monitoring alert summary from the batch panel", async () => {
    installLocalStorageStub();
    vi.mocked(save).mockResolvedValue("/tmp/monitoring-alert-summary.md");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "write_text_file") {
        return Promise.resolve(args);
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /变形趋势分析/ }));
    calculateJsonInput({
      unit: "m",
      toleranceCumulativeMm: 30,
      alarmCumulativeMm: 45,
      toleranceRateMmPerDay: 5,
      alarmRateMmPerDay: 10,
      predictionHorizonDays: 14,
      points: [
        {
          id: "JC-01",
          observations: [
            { date: "2026-06-01", value: 0 },
            { date: "2026-06-04", value: 0.018 },
            { date: "2026-06-07", value: 0.036 },
          ],
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /加入批次/ }));

    fireEvent.click(screen.getByRole("button", { name: /轴力换算/ }));
    calculateJsonInput({
      baselinePeriodCount: 1,
      attentionForceKn: 15,
      toleranceForceKn: 25,
      alarmForceKn: 40,
      attentionRateKnPerDay: 3,
      toleranceRateKnPerDay: 5,
      alarmRateKnPerDay: 10,
      predictionHorizonDays: 14,
      sensors: [
        {
          id: "ZL-01",
          observations: [
            { date: "2026-06-01", forceKn: 0 },
            { date: "2026-06-04", forceKn: 16 },
            { date: "2026-06-07", forceKn: 32 },
          ],
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /加入批次/ }));

    const summaryHead = screen.getByText("监测预警汇总");
    const summaryPanel = summaryHead.closest(".ewb-monitoring-summary");
    expect(summaryPanel).not.toBeNull();
    expect(within(summaryPanel as HTMLElement).getByText(/预警对象 2/)).toBeTruthy();
    expect(within(summaryPanel as HTMLElement).getByText(/最早预测报警 2026-06-09/)).toBeTruthy();
    expect(within(summaryPanel as HTMLElement).getByText("JC-01")).toBeTruthy();
    expect(within(summaryPanel as HTMLElement).getByText("ZL-01")).toBeTruthy();
    expect(screen.getByRole("button", { name: /预警日报 MD/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /预警日报 CSV/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /预警日报 JSON/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /预警日报 MD/ }));

    await waitFor(() => expect(vi.mocked(save)).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringContaining("工程分析监测预警日报"),
        filters: [{ name: "Railwise 监测预警日报 Markdown", extensions: ["md"] }],
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        path: "/tmp/monitoring-alert-summary.md",
        content: expect.stringContaining("# 监测预警汇总"),
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining("JC-01"),
      }),
    );
  });

  it("exports an acceptance remediation recheck package after importing a ZIP that needs action", async () => {
    installLocalStorageStub();
    const input = loadEngineeringSampleInput("distance_azimuth");
    const result = runEngineeringCalculation("distance_azimuth", input);
    const deliverables = buildEngineeringDeliverables(result, {
      inputFormat: "json",
      inputText: JSON.stringify(input, null, 2),
      sourceName: "distance_azimuth.json",
    });
    const archive = buildEngineeringBatchArchiveZipExport([{ id: "distance-run", deliverables }], {
      batchName: "UI 补件重验批次",
      exportedAt: "2026-06-05T09:30:00.000Z",
    });
    vi.mocked(open).mockResolvedValue("/external/ui-remediation.zip");
    vi.mocked(save).mockResolvedValue("/tmp/archive-acceptance-remediation-recheck-package.md");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "read_binary_file") {
        return Promise.resolve(Array.from(Buffer.from(archive.base64, "base64")));
      }
      if (command === "write_text_file") {
        return Promise.resolve(args);
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /加入批次/ }));
    fireEvent.click(screen.getByRole("button", { name: "验收 ZIP" }));
    await waitFor(() => expect(screen.getByText(/归档 ZIP 验收/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /补件重验包 MD/ }));

    await waitFor(() => expect(vi.mocked(save)).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringContaining("archive-acceptance-remediation-recheck-package"),
        filters: [{ name: "Railwise 归档接收补件重验包 Markdown", extensions: ["md"] }],
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        path: "/tmp/archive-acceptance-remediation-recheck-package.md",
        content: expect.stringContaining("# 归档接收补件重验包"),
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining('npm run verify:engineering-archive -- "/external/ui-remediation.zip" --require-clean'),
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining("## 补件证据包"),
      }),
    );
  });

  it("imports a remediation recheck ZIP and exports the recheck closure update", async () => {
    installLocalStorageStub();
    const input = loadEngineeringSampleInput("distance_azimuth");
    const result = runEngineeringCalculation("distance_azimuth", input);
    const deliverables = buildEngineeringDeliverables(result, {
      inputFormat: "json",
      inputText: JSON.stringify(input, null, 2),
      sourceName: "distance_azimuth.json",
    });
    const originalArchive = buildEngineeringBatchArchiveZipExport([{ id: "distance-run", deliverables }], {
      batchName: "UI 补件重验回填批次",
      exportedAt: "2026-06-05T09:30:00.000Z",
    });
    const recheckedArchive = buildEngineeringBatchArchiveZipExport([{ id: "distance-run", deliverables }], {
      batchName: "UI 补件重验回填批次",
      exportedAt: "2026-06-05T11:30:00.000Z",
      archiveReleaseBy: "资料员A",
      archiveInspectionSignoff: {
        conclusion: "approved",
        reviewer: "资料员A",
        signedAt: "2026-06-05T11:00:00.000Z",
      },
    });
    vi.mocked(open)
      .mockResolvedValueOnce("/external/ui-remediation-original.zip")
      .mockResolvedValueOnce("/external/ui-remediation-rechecked.zip");
    vi.mocked(save).mockResolvedValue("/tmp/archive-acceptance-remediation-recheck-update.md");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "read_binary_file") {
        const path = (args as { path?: string } | undefined)?.path ?? "";
        const archive = path.includes("rechecked") ? recheckedArchive : originalArchive;
        return Promise.resolve(Array.from(Buffer.from(archive.base64, "base64")));
      }
      if (command === "write_text_file") {
        return Promise.resolve(args);
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /加入批次/ }));
    fireEvent.click(screen.getByRole("button", { name: "验收 ZIP" }));
    await waitFor(() => expect(screen.getByText(/归档 ZIP 验收/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /导入重验 ZIP/ }));
    await waitFor(() => expect(screen.getAllByText(/补件重验回填：已闭环/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/补件重验回填/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/可接收/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /重验 MD/ }));

    await waitFor(() => expect(vi.mocked(save)).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringContaining("archive-acceptance-remediation-recheck-update"),
        filters: [{ name: "Railwise 归档接收补件重验回填 Markdown", extensions: ["md"] }],
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        path: "/tmp/archive-acceptance-remediation-recheck-update.md",
        content: expect.stringContaining("# 归档接收补件重验回填"),
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining('npm run verify:engineering-archive -- "/external/ui-remediation-rechecked.zip" --require-clean'),
      }),
    );
  });

  it("exports a final acceptance registration after a clean remediation recheck", async () => {
    installLocalStorageStub();
    const input = loadEngineeringSampleInput("distance_azimuth");
    const result = runEngineeringCalculation("distance_azimuth", input);
    const deliverables = buildEngineeringDeliverables(result, {
      inputFormat: "json",
      inputText: JSON.stringify(input, null, 2),
      sourceName: "distance_azimuth.json",
    });
    const originalArchive = buildEngineeringBatchArchiveZipExport([{ id: "distance-run", deliverables }], {
      batchName: "UI 最终接收登记批次",
      exportedAt: "2026-06-05T09:30:00.000Z",
    });
    const recheckedArchive = buildEngineeringBatchArchiveZipExport([{ id: "distance-run", deliverables }], {
      batchName: "UI 最终接收登记批次",
      exportedAt: "2026-06-05T11:30:00.000Z",
      archiveReleaseBy: "资料员A",
      archiveInspectionSignoff: {
        conclusion: "approved",
        reviewer: "资料员A",
        signedAt: "2026-06-05T11:00:00.000Z",
      },
    });
    vi.mocked(open)
      .mockResolvedValueOnce("/external/ui-final-registration-original.zip")
      .mockResolvedValueOnce("/external/ui-final-registration-rechecked.zip");
    vi.mocked(save).mockResolvedValue("/tmp/archive-acceptance-final-registration.md");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "read_binary_file") {
        const path = (args as { path?: string } | undefined)?.path ?? "";
        const archive = path.includes("rechecked") ? recheckedArchive : originalArchive;
        return Promise.resolve(Array.from(Buffer.from(archive.base64, "base64")));
      }
      if (command === "write_text_file") {
        return Promise.resolve(args);
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /加入批次/ }));
    fireEvent.click(screen.getByRole("button", { name: "验收 ZIP" }));
    await waitFor(() => expect(screen.getByText(/归档 ZIP 验收/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /导入重验 ZIP/ }));
    await waitFor(() => expect(screen.getAllByText(/补件重验回填：已闭环/).length).toBeGreaterThan(0));

    await waitFor(() => expect(screen.getAllByText(/最终接收登记/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /接收登记 MD/ }));

    await waitFor(() => expect(vi.mocked(save)).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringContaining("archive-acceptance-final-registration"),
        filters: [{ name: "Railwise 归档最终接收登记 Markdown", extensions: ["md"] }],
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        path: "/tmp/archive-acceptance-final-registration.md",
        content: expect.stringContaining("# 归档最终接收登记"),
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        content: expect.stringContaining("接收结论：registered"),
      }),
    );
  });

  it("exports the transfer final acceptance receipt field template from the workbench", async () => {
    installLocalStorageStub();
    vi.mocked(save).mockResolvedValue("/tmp/final-acceptance-receipt-template.json");
    vi.mocked(invoke).mockImplementation((command: string, args?: unknown) => {
      if (command === "write_text_file") {
        return Promise.resolve(args);
      }
      return Promise.reject(new Error(`unexpected invoke: ${command}`));
    });

    render(<EngineeringWorkbench onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /导出回执字段/ }));

    await waitFor(() => expect(vi.mocked(save)).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringContaining("railwise-archive-transfer-final-acceptance-receipt-template.json"),
        filters: [{ name: "Railwise 资料移交最终接收回执字段模板", extensions: ["json"] }],
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({
        path: "/tmp/final-acceptance-receipt-template.json",
        content: expect.stringContaining(
          "railwise.engineering.batch.archiveTransferFinalAcceptanceRegistrationReceiptFieldTemplate.v1",
        ),
      }),
    );
  });
});
