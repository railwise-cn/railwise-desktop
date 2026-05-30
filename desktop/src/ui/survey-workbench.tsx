// 测绘工作台 —— 睿威智测 RAILWISE 专用全屏面板。
// 自包含：监测数据录入/导入 → 变形分析（超限判断）→ echarts 趋势图 → 报告预览。
// 不依赖后端 agent；与 survey MCP 工具互补，供人工快速核算与可视化。
import * as echarts from "echarts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I } from "../icons";

const SAMPLE_CSV = `点号,周期1,周期2,周期3,周期4,周期5
JC1,12.345,12.347,12.351,12.358,12.366
JC2,10.210,10.213,10.219,10.230,10.246
JC3,8.880,8.881,8.883,8.884,8.886
JC4,15.020,15.018,15.012,15.001,14.985`;

interface ParsedData {
  periods: string[];
  points: { name: string; values: (number | null)[] }[];
  errors: string[];
}

interface PointAnalysis {
  name: string;
  first: number | null;
  last: number | null;
  prev: number | null;
  cumulative: number | null; // 累计变形 (mm)
  current: number | null; // 本期变形 (mm)
  rate: number | null; // 变形速率 (mm/天)
  cumExceed: boolean;
  rateExceed: boolean;
}

/** 把单元格解析为数字，单位默认按米输入、毫米输出（×1000 在分析阶段做差值后转换）。 */
function toNum(cell: string): number | null {
  const t = cell.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 解析 CSV/TSV：首行表头（首列点号，其余为周期），每行一个监测点。 */
function parseTable(raw: string): ParsedData {
  const errors: string[] = [];
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) {
    return { periods: [], points: [], errors: ["至少需要表头 + 一行数据"] };
  }
  const splitLine = (l: string) => l.split(/[,\t;]+/).map((c) => c.trim());
  const header = splitLine(lines[0]!);
  const periods = header.slice(1);
  if (periods.length < 1) {
    return { periods: [], points: [], errors: ["表头缺少周期列"] };
  }
  const points: ParsedData["points"] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]!);
    const name = cells[0] ?? `行${i}`;
    const values: (number | null)[] = [];
    for (let c = 0; c < periods.length; c++) {
      const cell = cells[c + 1];
      if (cell === undefined || cell === "") {
        values.push(null);
        continue;
      }
      const n = toNum(cell);
      if (n === null) errors.push(`点 ${name} 周期 ${periods[c]} 的值无法解析：“${cell}”`);
      values.push(n);
    }
    points.push({ name, values });
  }
  return { periods, points, errors };
}

/** 变形分析：累计/本期变形（mm）与速率（mm/天），并按限值判断超限。 */
function analyze(
  data: ParsedData,
  cumLimitMm: number,
  rateLimitMmPerDay: number,
  intervalDays: number,
): PointAnalysis[] {
  return data.points.map((p) => {
    const nums = p.values;
    const firstIdx = nums.findIndex((v) => v !== null);
    const validIdx = nums.map((v, i) => (v !== null ? i : -1)).filter((i) => i >= 0);
    const lastIdx = validIdx.length > 0 ? validIdx[validIdx.length - 1]! : -1;
    const prevIdx = validIdx.length > 1 ? validIdx[validIdx.length - 2]! : -1;
    const first = firstIdx >= 0 ? nums[firstIdx]! : null;
    const last = lastIdx >= 0 ? nums[lastIdx]! : null;
    const prev = prevIdx >= 0 ? nums[prevIdx]! : null;
    // 输入按米/毫米均可，差值统一 ×1000 视作毫米（若输入已是毫米，限值同样按毫米填）。
    const cumulative = first !== null && last !== null ? (last - first) * 1000 : null;
    const current = prev !== null && last !== null ? (last - prev) * 1000 : null;
    const rate = current !== null && intervalDays > 0 ? current / intervalDays : null;
    return {
      name: p.name,
      first,
      last,
      prev,
      cumulative,
      current,
      rate,
      cumExceed: cumulative !== null && Math.abs(cumulative) > cumLimitMm,
      rateExceed: rate !== null && Math.abs(rate) > rateLimitMmPerDay,
    };
  });
}

function fmt(n: number | null, digits = 3): string {
  return n === null ? "—" : n.toFixed(digits);
}

type WbTab = "data" | "analysis" | "chart" | "report";

export function SurveyWorkbench({ onClose }: { onClose: () => void }) {
  const [raw, setRaw] = useState("");
  const [tab, setTab] = useState<WbTab>("data");
  const [cumLimit, setCumLimit] = useState(30); // 累计变形限值 mm
  const [rateLimit, setRateLimit] = useState(2); // 速率限值 mm/天
  const [intervalDays, setIntervalDays] = useState(7); // 周期间隔天数
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const parsed = useMemo(() => parseTable(raw), [raw]);
  const analysis = useMemo(
    () => analyze(parsed, cumLimit, rateLimit, intervalDays),
    [parsed, cumLimit, rateLimit, intervalDays],
  );
  const hasData = parsed.points.length > 0 && parsed.periods.length > 0;

  const report = useMemo(() => {
    if (!hasData) return "";
    const exceededCum = analysis.filter((a) => a.cumExceed);
    const exceededRate = analysis.filter((a) => a.rateExceed);
    const lines: string[] = [];
    lines.push("# 监测变形分析报告");
    lines.push("");
    lines.push(`- 监测点数：${parsed.points.length}`);
    lines.push(`- 观测周期：${parsed.periods.length}（${parsed.periods.join(" / ")}）`);
    lines.push(`- 累计变形限值：±${cumLimit} mm，速率限值：±${rateLimit} mm/天，周期间隔：${intervalDays} 天`);
    lines.push("");
    lines.push("## 变形汇总");
    lines.push("");
    lines.push("| 点号 | 累计变形(mm) | 本期变形(mm) | 速率(mm/天) | 状态 |");
    lines.push("| --- | ---: | ---: | ---: | --- |");
    for (const a of analysis) {
      const status = a.cumExceed || a.rateExceed ? "⚠ 超限" : "正常";
      lines.push(
        `| ${a.name} | ${fmt(a.cumulative, 2)} | ${fmt(a.current, 2)} | ${fmt(a.rate, 3)} | ${status} |`,
      );
    }
    lines.push("");
    lines.push("## 结论");
    lines.push("");
    if (exceededCum.length === 0 && exceededRate.length === 0) {
      lines.push("本期所有监测点累计变形与变形速率均在限值范围内，结构处于稳定状态。");
    } else {
      if (exceededCum.length > 0) {
        lines.push(`- 累计变形超限点：${exceededCum.map((a) => a.name).join("、")}，应加密观测并核查。`);
      }
      if (exceededRate.length > 0) {
        lines.push(`- 变形速率超限点：${exceededRate.map((a) => a.name).join("、")}，建议立即复测并预警。`);
      }
    }
    return lines.join("\n");
  }, [analysis, parsed, cumLimit, rateLimit, intervalDays, hasData]);

  // echarts 趋势图：每个点一条折线，x 轴为周期。
  useEffect(() => {
    if (tab !== "chart" || !chartRef.current || !hasData) return;
    if (!chartInst.current) chartInst.current = echarts.init(chartRef.current, undefined, { renderer: "svg" });
    const inst = chartInst.current;
    inst.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      legend: { type: "scroll", textStyle: { color: "#9aa0a6" }, top: 0 },
      grid: { left: 48, right: 24, top: 36, bottom: 32 },
      xAxis: {
        type: "category",
        data: parsed.periods,
        axisLine: { lineStyle: { color: "#555" } },
        axisLabel: { color: "#9aa0a6" },
      },
      yAxis: {
        type: "value",
        scale: true,
        name: "观测值",
        axisLabel: { color: "#9aa0a6" },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } },
      },
      series: parsed.points.map((p) => ({
        name: p.name,
        type: "line",
        smooth: true,
        connectNulls: true,
        showSymbol: true,
        data: p.values,
      })),
    });
    inst.resize();
  }, [tab, parsed, hasData]);

  useEffect(() => {
    const onResize = () => chartInst.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(
    () => () => {
      chartInst.current?.dispose();
      chartInst.current = null;
    },
    [],
  );

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result ?? ""));
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const copyReport = useCallback(() => {
    void navigator.clipboard.writeText(report).catch(() => undefined);
  }, [report]);

  const downloadReport = useCallback(() => {
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "监测变形分析报告.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  return (
    <div className="swb-mask" onClick={onClose}>
      <div className="swb-modal" onClick={(e) => e.stopPropagation()}>
        <header className="swb-head">
          <div className="swb-title">
            <I.chart size={16} />
            <span>测绘工作台</span>
          </div>
          <nav className="swb-tabs">
            <button type="button" data-active={tab === "data"} onClick={() => setTab("data")}>
              数据录入
            </button>
            <button type="button" data-active={tab === "analysis"} onClick={() => setTab("analysis")}>
              变形分析
            </button>
            <button type="button" data-active={tab === "chart"} onClick={() => setTab("chart")}>
              趋势图
            </button>
            <button type="button" data-active={tab === "report"} onClick={() => setTab("report")}>
              报告预览
            </button>
          </nav>
          <button type="button" className="swb-close" onClick={onClose} aria-label="关闭">
            <I.x size={14} />
          </button>
        </header>

        <div className="swb-body">
          {tab === "data" ? (
            <div className="swb-data">
              <div className="swb-toolbar">
                <label className="swb-btn">
                  <I.upload size={13} />
                  <span>导入 CSV</span>
                  <input type="file" accept=".csv,.txt,.tsv" onChange={onFile} hidden />
                </label>
                <button type="button" className="swb-btn" onClick={() => setRaw(SAMPLE_CSV)}>
                  <I.list size={13} />
                  <span>示例数据</span>
                </button>
                <button type="button" className="swb-btn" onClick={() => setRaw("")}>
                  <I.x size={13} />
                  <span>清空</span>
                </button>
              </div>
              <textarea
                className="swb-input"
                value={raw}
                spellCheck={false}
                placeholder={"粘贴监测数据（CSV/TSV）。首行：点号,周期1,周期2,…\n例如：\n" + SAMPLE_CSV}
                onChange={(e) => setRaw(e.target.value)}
              />
              <div className="swb-limits">
                <label>
                  累计限值(mm)
                  <input
                    type="number"
                    value={cumLimit}
                    onChange={(e) => setCumLimit(Number(e.target.value) || 0)}
                  />
                </label>
                <label>
                  速率限值(mm/天)
                  <input
                    type="number"
                    step="0.1"
                    value={rateLimit}
                    onChange={(e) => setRateLimit(Number(e.target.value) || 0)}
                  />
                </label>
                <label>
                  周期间隔(天)
                  <input
                    type="number"
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(Number(e.target.value) || 1)}
                  />
                </label>
              </div>
              {parsed.errors.length > 0 ? (
                <div className="swb-errors">
                  {parsed.errors.slice(0, 6).map((er, i) => (
                    <div key={i}>⚠ {er}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "analysis" ? (
            !hasData ? (
              <Empty />
            ) : (
              <div className="swb-table-wrap">
                <table className="swb-table">
                  <thead>
                    <tr>
                      <th>点号</th>
                      <th>首期</th>
                      <th>上期</th>
                      <th>本期</th>
                      <th>累计变形(mm)</th>
                      <th>本期变形(mm)</th>
                      <th>速率(mm/天)</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.map((a) => (
                      <tr key={a.name} data-exceed={a.cumExceed || a.rateExceed}>
                        <td>{a.name}</td>
                        <td>{fmt(a.first)}</td>
                        <td>{fmt(a.prev)}</td>
                        <td>{fmt(a.last)}</td>
                        <td data-warn={a.cumExceed}>{fmt(a.cumulative, 2)}</td>
                        <td>{fmt(a.current, 2)}</td>
                        <td data-warn={a.rateExceed}>{fmt(a.rate, 3)}</td>
                        <td>{a.cumExceed || a.rateExceed ? "⚠ 超限" : "正常"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}

          {tab === "chart" ? (
            !hasData ? (
              <Empty />
            ) : (
              <div className="swb-chart" ref={chartRef} />
            )
          ) : null}

          {tab === "report" ? (
            !hasData ? (
              <Empty />
            ) : (
              <div className="swb-report">
                <div className="swb-toolbar">
                  <button type="button" className="swb-btn" onClick={copyReport}>
                    <I.copy size={13} />
                    <span>复制</span>
                  </button>
                  <button type="button" className="swb-btn" onClick={downloadReport}>
                    <I.download size={13} />
                    <span>导出 .md</span>
                  </button>
                </div>
                <pre className="swb-report-pre">{report}</pre>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Empty() {
  return <div className="swb-empty">请先在“数据录入”粘贴或导入监测数据。</div>;
}
