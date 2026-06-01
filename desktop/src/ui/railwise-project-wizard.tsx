import { useEffect, useState } from "react";
import { t, useLang } from "../i18n";
import { I } from "../icons";

export function RailwiseProjectWizard({
  defaultParent,
  busy,
  error,
  onClose,
  onPickParent,
  onCreate,
}: {
  defaultParent?: string;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onPickParent: () => Promise<string | null>;
  onCreate: (payload: { parentDir: string; projectName: string }) => void;
}) {
  useLang();
  const [parentDir, setParentDir] = useState(defaultParent ?? "");
  const [projectName, setProjectName] = useState("metro-protection-project");

  useEffect(() => {
    if (defaultParent) setParentDir(defaultParent);
  }, [defaultParent]);

  const canCreate = parentDir.trim().length > 0 && projectName.trim().length > 0 && !busy;
  return (
    <div className="settings-mask" onClick={onClose}>
      <div className="settings railwise-wizard" onClick={(e) => e.stopPropagation()}>
        <div className="settings-main">
          <div className="settings-head">
            <div>
              <h2>{t("railwiseWizard.title")}</h2>
              <div className="desc">{t("railwiseWizard.desc")}</div>
            </div>
            <span className="grow" />
            <button type="button" className="close-btn" onClick={onClose}>
              <I.x size={14} />
            </button>
          </div>
          <div className="settings-body">
            <div className="setting-row">
              <div className="l">
                <div className="n">{t("railwiseWizard.parent")}</div>
                <div className="h">{parentDir || t("railwiseWizard.parentHint")}</div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => void onPickParent().then((picked) => picked && setParentDir(picked))}
              >
                {t("railwiseWizard.choose")}
              </button>
            </div>
            <div className="setting-row">
              <div className="l">
                <div className="n">{t("railwiseWizard.name")}</div>
                <div className="h">{t("railwiseWizard.nameHint")}</div>
              </div>
              <input
                className="field mono"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
            </div>
            <div className="ctx-block">
              <div className="h">
                <span>{t("railwiseWizard.includes")}</span>
              </div>
              <div className="ctx-empty" style={{ textAlign: "left" }}>
                {t("railwiseWizard.includesDetail")}
              </div>
            </div>
            {error ? <div className="warn-card">{error}</div> : null}
            <div className="settings-actions">
              <button type="button" className="btn" onClick={onClose}>
                {t("railwiseWizard.cancel")}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!canCreate}
                onClick={() =>
                  onCreate({ parentDir: parentDir.trim(), projectName: projectName.trim() })
                }
              >
                {busy ? t("railwiseWizard.creating") : t("railwiseWizard.create")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
