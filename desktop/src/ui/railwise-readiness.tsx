import { t, useLang } from "../i18n";
import { I } from "../icons";
import type { RailwiseReadinessItem } from "../protocol";

function readinessCounts(
  checks: RailwiseReadinessItem[],
): Record<RailwiseReadinessItem["level"], number> {
  return checks.reduce(
    (acc, check) => {
      acc[check.level] += 1;
      return acc;
    },
    { ok: 0, warn: 0, fail: 0 },
  );
}

export function RailwiseReadinessPanel({
  checks,
  onRefresh,
  onInitProject,
}: {
  checks: RailwiseReadinessItem[];
  onRefresh?: () => void;
  onInitProject?: () => void;
}) {
  useLang();
  const counts = readinessCounts(checks);
  return (
    <div className="ctx-block railwise-readiness">
      <div className="h">
        <span>{t("contextPanel.railwiseReadinessTitle")}</span>
        <span className="right">
          {checks.length === 0
            ? "—"
            : t("contextPanel.railwiseReadinessSummary", {
                ok: counts.ok,
                warn: counts.warn,
                fail: counts.fail,
              })}
        </span>
      </div>
      <div className="mcp-health-strip">
        <span data-kind="ok">{counts.ok} ok</span>
        <span data-kind={counts.warn > 0 ? "failed" : "muted"}>{counts.warn} warn</span>
        <span data-kind={counts.fail > 0 ? "failed" : "muted"}>{counts.fail} fail</span>
      </div>
      <div className="mcp-filter-row">
        {onRefresh ? (
          <button type="button" className="mcp-mini-action" onClick={onRefresh}>
            <I.refresh size={12} />
            {t("contextPanel.railwiseRefresh")}
          </button>
        ) : null}
        {onInitProject ? (
          <button type="button" className="mcp-mini-action" onClick={onInitProject}>
            <I.plus size={12} />
            {t("contextPanel.railwiseNewProject")}
          </button>
        ) : null}
      </div>
      {checks.length === 0 ? (
        <div className="ctx-empty">{t("contextPanel.railwiseReadinessEmpty")}</div>
      ) : (
        <div className="doctor-card">
          {checks.map((check) => (
            <div className="doctor-row" key={check.id} data-s={check.level}>
              <span
                className="ic"
                data-mark={check.level === "ok" ? "✓" : check.level === "warn" ? "!" : "✕"}
              />
              <div className="body">
                <div className="nm">{check.label.trim()}</div>
                <div className="sub">{check.detail}</div>
              </div>
              <span className="v">{check.level}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
