import { useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  addSector,
  createSectorFromApp,
  hasDuplicateApp,
  MAX_SECTOR_COUNT,
  MIN_SECTOR_COUNT,
  moveSector,
  replaceSectorWithApp,
  rememberAppPickerDir,
  removeSector,
  updateSector,
} from "./configEditor";
import type { OrbitConfig } from "./configSchema";
import { getSectorPlacement } from "../wheel/sectorPlacement";
import { toUserFacingErrorMessage } from "../../shared/errors/userFacingError";

const materialOptions: Array<{
  label: string;
  value: OrbitConfig["wheel"]["appearance"]["material"];
}> = [
  { label: "透明", value: "transparent" },
  { label: "亚克力", value: "acrylic" },
  { label: "磨砂", value: "frosted" },
  { label: "不透明", value: "solid" },
];

type SettingsTabId = "apps" | "startup" | "appearance";
type SettingIconName = "power" | "silent" | "material" | "opacity" | "blur" | "image";
type SettingIconTone = "orange" | "green" | "violet" | "cyan" | "neutral";
type StatusTone = "info" | "success" | "warning" | "error";

export interface SettingsStatus {
  tone: StatusTone;
  message: string;
  detail?: string;
}

const settingsTabs: Array<{
  id: SettingsTabId;
  label: string;
  panelId: string;
  tabId: string;
}> = [
  { id: "apps", label: "应用", panelId: "settings-tabpanel-apps", tabId: "settings-tab-apps" },
  { id: "startup", label: "启动", panelId: "settings-tabpanel-startup", tabId: "settings-tab-startup" },
  { id: "appearance", label: "外观", panelId: "settings-tabpanel-appearance", tabId: "settings-tab-appearance" },
];

interface SettingsPageProps {
  draftConfig: OrbitConfig;
  savedConfig: OrbitConfig;
  status: SettingsStatus;
  lastFailedSectorId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  onDraftChange: (config: OrbitConfig) => void;
  onStatusChange: (status: SettingsStatus) => void;
  onPreviewSectorChange: (index: number | null) => void;
  onResolveRuntimeError: () => void;
  onSave: () => void;
  onRevert: () => void;
  onResetDefault: () => void;
  onExecuteSector: (sectorId: string) => void;
}

export function SettingsPage({
  draftConfig,
  savedConfig,
  status,
  lastFailedSectorId,
  isDirty,
  isSaving,
  onDraftChange,
  onPreviewSectorChange,
  onResolveRuntimeError,
  onStatusChange,
  onSave,
  onRevert,
  onResetDefault,
  onExecuteSector,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("apps");
  const mainMenu = draftConfig.menus[0];
  const savedSectorIds = new Set(savedConfig.menus[0].sectors.map((sector) => sector.id));
  const activeTabMeta = settingsTabs.find((tab) => tab.id === activeTab) ?? settingsTabs[0];
  const isBlurDisabled =
    draftConfig.wheel.appearance.material === "transparent" || draftConfig.wheel.appearance.material === "solid";

  async function handleAddApp() {
    if (!canOpenSystemAppPicker(onStatusChange)) {
      return;
    }

    try {
      const selected = await open({
        multiple: false,
        directory: false,
        defaultPath: draftConfig.uiState.lastAppPickerDir ?? undefined,
        filters: [
          {
            name: "Windows 应用",
            extensions: ["exe"],
          },
        ],
        title: "选择要添加到轮盘的应用",
      });

      if (typeof selected !== "string") {
        return;
      }

      if (hasDuplicateApp(draftConfig, selected)) {
        const confirmed = window.confirm("这个应用已经在轮盘里。仍然添加一个新的扇区？");
        if (!confirmed) {
          return;
        }
      }

      const existingIds = mainMenu.sectors.map((sector) => sector.id);
      const nextConfig = rememberAppPickerDir(
        addSector(draftConfig, createSectorFromApp({ path: selected }, existingIds)),
        selected,
      );
      onDraftChange(nextConfig);
      onStatusChange({
        tone: "success",
        message: "已添加应用",
        detail: "保存后会出现在主轮盘中。",
      });
    } catch (error) {
      onStatusChange(
        toErrorStatus(
          error,
          "添加应用失败",
          "请确认正在 Orbit 桌面窗口中操作，然后重新选择 Windows .exe 应用。",
        ),
      );
    }
  }

  async function handleReplaceApp(sectorId: string) {
    if (!canOpenSystemAppPicker(onStatusChange)) {
      return;
    }

    try {
      const selected = await open({
        multiple: false,
        directory: false,
        defaultPath: draftConfig.uiState.lastAppPickerDir ?? undefined,
        filters: [
          {
            name: "Windows 应用",
            extensions: ["exe"],
          },
        ],
        title: "重新选择轮盘应用",
      });

      if (typeof selected !== "string") {
        return;
      }

      if (hasDuplicateApp(draftConfig, selected, sectorId)) {
        const confirmed = window.confirm("这个应用已经在其他扇区里。仍然替换当前扇区？");
        if (!confirmed) {
          return;
        }
      }

      const nextConfig = rememberAppPickerDir(replaceSectorWithApp(draftConfig, sectorId, { path: selected }), selected);
      onDraftChange(nextConfig);
      onResolveRuntimeError();
      onStatusChange({
        tone: "success",
        message: "已重新选择应用",
        detail: "可先运行验证，保存后会写入主轮盘配置。",
      });
    } catch (error) {
      onStatusChange(
        toErrorStatus(
          error,
          "重新选择应用失败",
          "请确认正在 Orbit 桌面窗口中操作，然后重新选择 Windows .exe 应用。",
        ),
      );
    }
  }

  function handleRemoveSector(sectorId: string) {
    if (savedSectorIds.has(sectorId)) {
      const confirmed = window.confirm("删除这个已保存的轮盘项？保存后它会从主轮盘中移除。");
      if (!confirmed) {
        return;
      }
    }

    try {
      onDraftChange(removeSector(draftConfig, sectorId));
      onStatusChange({
        tone: "warning",
        message: "已删除轮盘项",
        detail: "保存后它会从主轮盘中移除，可在保存前撤销更改。",
      });
    } catch (error) {
      onStatusChange(toErrorStatus(error, "删除轮盘项失败", "请确认主轮盘仍保留最少扇区数量。"));
    }
  }

  function updateAppearance(patch: Partial<OrbitConfig["wheel"]["appearance"]>) {
    onDraftChange({
      ...draftConfig,
      wheel: {
        ...draftConfig.wheel,
        appearance: {
          ...draftConfig.wheel.appearance,
          ...patch,
        },
      },
    });
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = settingsTabs.findIndex((tab) => tab.id === activeTab);
    let nextIndex = currentIndex < 0 ? 0 : currentIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      nextIndex = (nextIndex + 1) % settingsTabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      nextIndex = (nextIndex - 1 + settingsTabs.length) % settingsTabs.length;
    } else if (event.key === "Home") {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      nextIndex = settingsTabs.length - 1;
    } else {
      return;
    }

    const nextTab = settingsTabs[nextIndex];
    setActiveTab(nextTab.id);
    document.getElementById(nextTab.tabId)?.focus();
  }

  return (
    <section className="settings-panel settings-panel--primary" aria-labelledby="settings-title">
      <div className="settings-toolbar">
        <div className="section-heading">
          <span>设置</span>
          <h2 id="settings-title">主轮盘</h2>
        </div>

        <div className="settings-toolbar__controls">
          <div className="settings-tabs" role="tablist" aria-label="主轮盘设置分区" onKeyDown={handleTabKeyDown}>
            {settingsTabs.map((tab) => (
              <button
                aria-controls={tab.panelId}
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? "settings-tab settings-tab--active" : "settings-tab"}
                id={tab.tabId}
                key={tab.id}
                role="tab"
                tabIndex={activeTab === tab.id ? 0 : -1}
                type="button"
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="toolbar-actions">
            <button className="button button--secondary" type="button" onClick={onRevert} disabled={!isDirty || isSaving}>
              撤销更改
            </button>
            <button className="button button--secondary" type="button" onClick={onResetDefault} disabled={isSaving}>
              恢复默认
            </button>
            <button className="button button--primary" type="button" onClick={onSave} disabled={!isDirty || isSaving}>
              {isSaving ? "保存中" : "保存"}
            </button>
          </div>
        </div>
      </div>

      <div
        className={`status-banner status-banner--${status.tone}${isDirty && status.tone !== "error" ? " status-banner--dirty" : ""}`}
        role={status.tone === "error" ? "alert" : "status"}
        aria-live={status.tone === "error" ? "assertive" : "polite"}
      >
        <span>
          <strong>{status.message}</strong>
          {status.detail ? <small>{status.detail}</small> : null}
        </span>
        {status.tone === "error" ? (
          <div className="status-banner__actions" aria-label="错误恢复操作">
            {lastFailedSectorId ? (
              <>
                <button className="button button--secondary button--compact" type="button" onClick={() => onExecuteSector(lastFailedSectorId)}>
                  重试运行
                </button>
                <button className="button button--secondary button--compact" type="button" onClick={() => void handleReplaceApp(lastFailedSectorId)}>
                  重选应用
                </button>
              </>
            ) : null}
            {isDirty ? (
              <button className="button button--secondary button--compact" type="button" onClick={onSave} disabled={isSaving}>
                重新保存
              </button>
            ) : null}
            {isDirty ? (
              <button className="button button--secondary button--compact" type="button" onClick={onRevert}>
                撤销更改
              </button>
            ) : (
              <button className="button button--secondary button--compact" type="button" onClick={onResetDefault}>
                恢复默认草稿
              </button>
            )}
          </div>
        ) : isDirty ? (
          <strong>有未保存更改</strong>
        ) : (
          <strong>配置已同步</strong>
        )}
      </div>

      <div
        className="settings-tabpanel"
        id={activeTabMeta.panelId}
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={activeTabMeta.tabId}
      >
        {activeTab === "apps" ? (
          <div className="settings-section settings-section--tab">
            <div className="settings-section__header">
              <div className="section-heading section-heading--compact">
                <span>应用</span>
                <h3>
                  扇区 {mainMenu.sectors.length}/{MAX_SECTOR_COUNT}
                </h3>
              </div>

              <button
                className="button button--primary"
                type="button"
                onClick={handleAddApp}
                title={mainMenu.sectors.length >= MAX_SECTOR_COUNT ? `主轮盘最多支持 ${MAX_SECTOR_COUNT} 个扇区` : undefined}
                disabled={mainMenu.sectors.length >= MAX_SECTOR_COUNT}
              >
                添加应用
              </button>
            </div>

            <div className="sector-list" aria-label="轮盘应用列表">
              {mainMenu.sectors.map((sector, index) => {
                const placement = getSectorPlacement(index, mainMenu.sectors.length, draftConfig.wheel.startAngleDeg);
                const labelError = getSectorLabelError(sector.label);
                const iconError = getSectorIconError(sector.icon.value);
                const labelInputId = `sector-${sector.id}-label`;
                const iconInputId = `sector-${sector.id}-icon`;
                const labelErrorId = `sector-${sector.id}-label-error`;
                const iconErrorId = `sector-${sector.id}-icon-error`;
                const hasRuntimeError = lastFailedSectorId === sector.id;

                return (
                <article
                  aria-label={`${placement.accessibleLabel}，${sector.label}`}
                  className={hasRuntimeError ? "sector-editor sector-editor--error" : "sector-editor"}
                  key={sector.id}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      onPreviewSectorChange(null);
                    }
                  }}
                  onFocus={() => onPreviewSectorChange(index)}
                  onMouseEnter={() => onPreviewSectorChange(index)}
                  onMouseLeave={() => onPreviewSectorChange(null)}
                >
                  <div className="sector-editor__marker" aria-hidden="true">
                    <span className="sector-editor__direction">{placement.compactLabel}</span>
                    <span className="sector-editor__icon">{sector.icon.value || "?"}</span>
                  </div>

                  <div className="sector-editor__fields">
                    <label htmlFor={labelInputId}>
                      <span>名称</span>
                      <input
                        aria-describedby={labelError ? labelErrorId : undefined}
                        aria-invalid={labelError ? true : undefined}
                        id={labelInputId}
                        maxLength={32}
                        value={sector.label}
                        onChange={(event) => onDraftChange(updateSector(draftConfig, sector.id, { label: event.currentTarget.value }))}
                      />
                      {labelError ? <small className="field-error" id={labelErrorId}>{labelError}</small> : null}
                    </label>

                    <label htmlFor={iconInputId}>
                      <span>图标</span>
                      <input
                        aria-describedby={iconError ? iconErrorId : undefined}
                        aria-invalid={iconError ? true : undefined}
                        id={iconInputId}
                        maxLength={4}
                        value={sector.icon.value}
                        onChange={(event) =>
                          onDraftChange(
                            updateSector(draftConfig, sector.id, {
                              icon: { type: "text", value: event.currentTarget.value },
                            }),
                          )
                        }
                      />
                      {iconError ? <small className="field-error" id={iconErrorId}>{iconError}</small> : null}
                    </label>

                    <div className="sector-editor__path">
                      <span>{placement.accessibleLabel}</span>
                      <span>{describeAction(sector.action)}</span>
                      {hasRuntimeError ? <span className="sector-editor__recovery">上次启动失败，可重新运行或重选应用。</span> : null}
                    </div>
                  </div>

                  <div className="sector-editor__actions">
                    <button
                      className="icon-button icon-button--compact"
                      type="button"
                      aria-label={`将 ${sector.label} 上移`}
                      title="上移"
                      onClick={() => onDraftChange(moveSector(draftConfig, sector.id, "up"))}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      className="icon-button icon-button--compact"
                      type="button"
                      aria-label={`将 ${sector.label} 下移`}
                      title="下移"
                      onClick={() => onDraftChange(moveSector(draftConfig, sector.id, "down"))}
                      disabled={index === mainMenu.sectors.length - 1}
                    >
                      ↓
                    </button>
                    <button className="icon-button" type="button" onClick={() => onExecuteSector(sector.id)} disabled={sector.action.type !== "app"}>
                      运行
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => void handleReplaceApp(sector.id)}
                      disabled={sector.action.type !== "app"}
                    >
                      重选
                    </button>
                    <button
                      className="icon-button icon-button--danger icon-button--compact"
                      type="button"
                      aria-label={`删除 ${sector.label}`}
                      title="删除"
                      onClick={() => handleRemoveSector(sector.id)}
                      disabled={mainMenu.sectors.length <= MIN_SECTOR_COUNT}
                    >
                      ×
                    </button>
                  </div>
                </article>
                );
              })}
            </div>
          </div>
        ) : null}

        {activeTab === "startup" ? (
          <div className="settings-section settings-section--tab">
            <div className="section-heading section-heading--compact">
              <span>启动</span>
              <h3>后台行为</h3>
            </div>

            <div className="settings-list" aria-label="后台行为设置">
              <SettingRow icon="power" tone="orange" title="开机自启" description="系统登录后自动启动 Orbit">
                <SwitchControl
                  checked={draftConfig.startup.launchAtLogin}
                  label="开机自启"
                  onChange={(checked) =>
                    onDraftChange({
                      ...draftConfig,
                      startup: {
                        ...draftConfig.startup,
                        launchAtLogin: checked,
                      },
                    })
                  }
                />
              </SettingRow>

              <SettingRow icon="silent" tone="green" title="静默启动" description="开机自启时不打开设置窗口">
                <SwitchControl
                  checked={draftConfig.startup.silentStart}
                  label="静默启动"
                  onChange={(checked) =>
                    onDraftChange({
                      ...draftConfig,
                      startup: {
                        ...draftConfig.startup,
                        silentStart: checked,
                      },
                    })
                  }
                />
              </SettingRow>
            </div>
          </div>
        ) : null}

        {activeTab === "appearance" ? (
          <div className="settings-section settings-section--tab">
            <div className="section-heading section-heading--compact">
              <span>外观</span>
              <h3>轮盘材质</h3>
            </div>

            <div className="settings-list" aria-label="轮盘外观设置">
              <SettingRow icon="material" tone="violet" title="材质" description="控制轮盘浮层的透明和质感">
                <div className="segmented-control" role="group" aria-label="轮盘材质">
                  {materialOptions.map((option) => (
                    <button
                      className={
                        draftConfig.wheel.appearance.material === option.value
                          ? "segmented-control__item segmented-control__item--active"
                          : "segmented-control__item"
                      }
                      key={option.value}
                      type="button"
                      onClick={() => updateAppearance({ material: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </SettingRow>

              <SettingRow icon="opacity" tone="cyan" title="不透明度" description="最低保留 35% 可读性">
                <div className="range-control">
                  <input
                    aria-label="轮盘不透明度"
                    max={1}
                    min={0.35}
                    step={0.01}
                    type="range"
                    value={draftConfig.wheel.appearance.opacity}
                    onChange={(event) => updateAppearance({ opacity: Number(event.currentTarget.value) })}
                  />
                  <output>{Math.round(draftConfig.wheel.appearance.opacity * 100)}%</output>
                </div>
              </SettingRow>

              <SettingRow
                disabled={isBlurDisabled}
                icon="blur"
                tone="neutral"
                title="模糊强度"
                description={isBlurDisabled ? "当前材质不使用背景模糊" : "调节轮盘浮层的柔和程度"}
              >
                <div className="range-control">
                  <input
                    aria-label="轮盘模糊强度"
                    disabled={isBlurDisabled}
                    max={32}
                    min={0}
                    step={1}
                    type="range"
                    value={draftConfig.wheel.appearance.blurPx}
                    onChange={(event) => updateAppearance({ blurPx: Number(event.currentTarget.value) })}
                  />
                  <output>{draftConfig.wheel.appearance.blurPx}px</output>
                </div>
              </SettingRow>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

interface SettingRowProps {
  children: ReactNode;
  description: string;
  disabled?: boolean;
  icon: SettingIconName;
  title: string;
  tone: SettingIconTone;
}

function SettingRow({ children, description, disabled = false, icon, title, tone }: SettingRowProps) {
  return (
    <div className={disabled ? "setting-row setting-row--disabled" : "setting-row"} aria-disabled={disabled}>
      <SettingIcon name={icon} tone={tone} />
      <div className="setting-row__copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

interface SwitchControlProps {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

function SwitchControl({ checked, label, onChange }: SwitchControlProps) {
  return (
    <label className="switch-control">
      <span className="sr-only">{label}</span>
      <input checked={checked} type="checkbox" onChange={(event) => onChange(event.currentTarget.checked)} />
      <span className="switch-control__track" aria-hidden="true">
        <span className="switch-control__thumb" />
      </span>
    </label>
  );
}

interface SettingIconProps {
  name: SettingIconName;
  tone: SettingIconTone;
}

function SettingIcon({ name, tone }: SettingIconProps) {
  return (
    <span className={`setting-row__icon setting-row__icon--${tone}`} aria-hidden="true">
      {renderSettingIcon(name)}
    </span>
  );
}

function renderSettingIcon(name: SettingIconName): ReactNode {
  switch (name) {
    case "power":
      return (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12 3v8" />
          <path d="M7.3 6.8a7 7 0 1 0 9.4 0" />
        </svg>
      );
    case "silent":
      return (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M5 9h3l4-4v14l-4-4H5z" />
          <path d="m4 4 16 16" />
        </svg>
      );
    case "material":
      return (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M5 8h14v10H5z" />
          <path d="M8 5h8" />
          <path d="M8 12h8" />
        </svg>
      );
    case "opacity":
      return (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12 3s5 5.4 5 9a5 5 0 0 1-10 0c0-3.6 5-9 5-9z" />
          <path d="M9 13a3 3 0 0 0 3 3" />
        </svg>
      );
    case "blur":
      return (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M8 8h.01" />
          <path d="M12 6h.01" />
          <path d="M16 8h.01" />
          <path d="M7 13h.01" />
          <path d="M12 13h.01" />
          <path d="M17 13h.01" />
          <path d="M9 18h.01" />
          <path d="M15 18h.01" />
        </svg>
      );
    case "image":
      return (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M5 6h14v12H5z" />
          <path d="m8 15 3-3 2 2 2-3 3 4" />
          <path d="M9 9h.01" />
        </svg>
      );
  }
}

function getSectorLabelError(label: string): string | null {
  return label.trim() ? null : "名称不能为空";
}

function getSectorIconError(icon: string): string | null {
  return icon.trim() ? null : "图标不能为空";
}

function toErrorStatus(error: unknown, message: string, recovery: string): SettingsStatus {
  const detail = toUserFacingErrorMessage(error, recovery);
  return {
    tone: "error",
    message,
    detail: detail === message ? recovery : `${detail} ${recovery}`,
  };
}

function describeAction(action: OrbitConfig["menus"][number]["sectors"][number]["action"]): string {
  switch (action.type) {
    case "app":
      return action.program;
    case "file":
      return `文件：${action.path}`;
    case "url":
      return `网址：${action.url}`;
    case "hotkey":
      return `快捷键：${action.keys.join(" + ")}`;
    case "command":
      return `命令：${action.program}`;
  }
}

function canOpenSystemAppPicker(onStatusChange: (status: SettingsStatus) => void): boolean {
  if (isTauri()) {
    return true;
  }

  onStatusChange({
    tone: "warning",
    message: "请在桌面应用中添加应用",
    detail: "当前浏览器预览不能打开系统文件选择器，请从 Orbit 桌面窗口选择 Windows .exe 应用。",
  });
  return false;
}
