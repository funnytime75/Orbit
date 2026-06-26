import { useEffect, useRef, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  addSector,
  createSectorFromApp,
  createTextIconConfig,
  getIconFallback,
  hasDuplicateApp,
  MAX_SECTOR_COUNT,
  MIN_SECTOR_COUNT,
  moveSector,
  moveSectorToIndex,
  replaceSectorWithApp,
  rememberAppPickerDir,
  removeSector,
  updateSector,
  type AppSelection,
} from "./configEditor";
import type { OrbitConfig } from "./configSchema";
import {
  WHEEL_SIZE_MAX,
  clampWheelGeometry,
  getMaxOuterRadius,
  getMinOuterRadius,
  getMinWheelSize,
} from "./wheelLimits";
import { formatShortcut, shortcutFromKeyboardEvent } from "./shortcutRecorder";
import { getSectorPlacement } from "../wheel/sectorPlacement";
import { toUserFacingErrorMessage } from "../../shared/errors/userFacingError";
import { loadAppIcon } from "../../shared/ipc/commands";

const materialOptions: Array<{
  label: string;
  value: OrbitConfig["wheel"]["appearance"]["material"];
}> = [
  { label: "透明", value: "transparent" },
  { label: "亚克力", value: "acrylic" },
  { label: "磨砂", value: "frosted" },
  { label: "不透明", value: "solid" },
];

const themeOptions: Array<{
  label: string;
  value: OrbitConfig["wheel"]["theme"];
}> = [
  { label: "跟随系统", value: "system" },
  { label: "日间", value: "light" },
  { label: "夜间", value: "dark" },
];

const triggerPresetOptions: Array<{
  label: string;
  value: Pick<OrbitConfig["trigger"], "holdMs" | "moveThresholdPx" | "cancelDistancePx">;
}> = [
  { label: "灵敏", value: { holdMs: 160, moveThresholdPx: 12, cancelDistancePx: 12 } },
  { label: "均衡", value: { holdMs: 220, moveThresholdPx: 18, cancelDistancePx: 14 } },
  { label: "稳妥", value: { holdMs: 320, moveThresholdPx: 26, cancelDistancePx: 18 } },
];
const backgroundImageExtensions = ["png", "jpg", "jpeg", "webp", "bmp"];

type SettingsTabId = "apps" | "trigger" | "appearance" | "advanced";
type SettingIconName = "power" | "silent" | "trigger" | "theme" | "material" | "opacity" | "blur" | "image";
type SettingIconTone = "orange" | "green" | "violet" | "cyan" | "neutral";
type StatusTone = "info" | "success" | "warning" | "error";
type StatusActionVariant = "primary" | "secondary";
type PendingDuplicateAppAction =
  | {
      path: string;
      type: "add";
    }
  | {
      path: string;
      sectorId: string;
      type: "replace";
    };

export interface SettingsStatusAction {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  variant?: StatusActionVariant;
}

export interface SettingsStatus {
  actions?: SettingsStatusAction[];
  detail?: string;
  message: string;
  secondaryLabel?: string | null;
  tone: StatusTone;
}

const settingsTabs: Array<{
  id: SettingsTabId;
  label: string;
  panelId: string;
  tabId: string;
}> = [
  { id: "apps", label: "轮盘", panelId: "settings-tabpanel-apps", tabId: "settings-tab-apps" },
  { id: "trigger", label: "触发", panelId: "settings-tabpanel-trigger", tabId: "settings-tab-trigger" },
  { id: "appearance", label: "外观", panelId: "settings-tabpanel-appearance", tabId: "settings-tab-appearance" },
  { id: "advanced", label: "高级设置", panelId: "settings-tabpanel-advanced", tabId: "settings-tab-advanced" },
];

interface SettingsPageProps {
  draftConfig: OrbitConfig;
  failedBackgroundImagePath: string | null;
  savedConfig: OrbitConfig;
  status: SettingsStatus;
  lastFailedSectorId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  onDraftChange: (config: OrbitConfig) => void;
  onFailedBackgroundImagePathChange: (imagePath: string | null) => void;
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
  failedBackgroundImagePath,
  savedConfig,
  status,
  lastFailedSectorId,
  isDirty,
  isSaving,
  onDraftChange,
  onFailedBackgroundImagePathChange,
  onPreviewSectorChange,
  onResolveRuntimeError,
  onStatusChange,
  onSave,
  onRevert,
  onResetDefault,
  onExecuteSector,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("apps");
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [confirmingResetDefault, setConfirmingResetDefault] = useState(false);
  const [confirmingDeleteSectorId, setConfirmingDeleteSectorId] = useState<string | null>(null);
  const [pendingDuplicateAppAction, setPendingDuplicateAppAction] = useState<PendingDuplicateAppAction | null>(null);
  const draftConfigRef = useRef(draftConfig);
  draftConfigRef.current = draftConfig;
  const mainMenu = draftConfig.menus[0];
  const savedSectorIds = new Set(savedConfig.menus[0].sectors.map((sector) => sector.id));
  const activeTabMeta = settingsTabs.find((tab) => tab.id === activeTab) ?? settingsTabs[0];
  const isBlurDisabled =
    draftConfig.wheel.appearance.material === "transparent" || draftConfig.wheel.appearance.material === "solid";
  const background = draftConfig.wheel.appearance.background;
  const isBackgroundImageSelected = background.type === "image";
  const minWheelSizePx = getMinWheelSize(draftConfig.wheel.innerRadiusPx);
  const minOuterRadiusPx = getMinOuterRadius(draftConfig.wheel.innerRadiusPx);
  const maxOuterRadiusPx = getMaxOuterRadius(draftConfig.wheel.sizePx);
  const sectorThicknessPx = draftConfig.wheel.outerRadiusPx - draftConfig.wheel.innerRadiusPx;
  const backgroundImageError =
    isBackgroundImageSelected && failedBackgroundImagePath === background.imagePath
      ? "图片无法读取，请重新选择或清除。"
      : null;
  const triggerStatus = describeTriggerStatus({
    isDirty,
    lastFailedSectorId,
    sectorCount: mainMenu.sectors.length,
    shortcut: draftConfig.trigger.shortcut,
  });
  const statusSecondaryLabel =
    status.secondaryLabel === undefined
      ? status.tone === "error"
        ? null
        : isDirty
          ? "有未保存更改"
          : "配置已同步"
      : status.secondaryLabel;

  async function handleAddApp() {
    if (!canOpenSystemFilePicker(onStatusChange, "请在桌面应用中添加应用", "当前浏览器预览不能打开系统文件选择器，请从 Orbit 桌面窗口选择 Windows .exe 应用。")) {
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
        setPendingDuplicateAppAction({ path: selected, type: "add" });
        setConfirmingDeleteSectorId(null);
        setConfirmingResetDefault(false);
        onStatusChange({
          tone: "warning",
          message: "应用已在轮盘中",
          detail: "如需重复使用，请在应用列表上方确认。",
        });
        return;
      }

      await applyAddApp(selected);
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
    if (!canOpenSystemFilePicker(onStatusChange, "请在桌面应用中重选应用", "当前浏览器预览不能打开系统文件选择器，请从 Orbit 桌面窗口重新选择 Windows .exe 应用。")) {
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
        setPendingDuplicateAppAction({ path: selected, sectorId, type: "replace" });
        setConfirmingDeleteSectorId(null);
        setConfirmingResetDefault(false);
        onStatusChange({
          tone: "warning",
          message: "应用已在其他扇区中",
          detail: "如需重复使用，请在应用列表上方确认。",
        });
        return;
      }

      await applyReplaceApp(sectorId, selected);
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

  async function applyAddApp(path: string) {
    const selection = await createAppSelection(path);
    const currentConfig = draftConfigRef.current;
    const existingIds = currentConfig.menus[0].sectors.map((sector) => sector.id);
    const nextConfig = rememberAppPickerDir(
      addSector(currentConfig, createSectorFromApp(selection, existingIds)),
      path,
    );
    commitDraftChange(nextConfig);
    onStatusChange({
      tone: "success",
      message: "已添加应用",
      detail: selection.icon?.type === "image" ? "已读取原生图标，保存后会出现在主轮盘中。" : "保存后会出现在主轮盘中。",
    });
  }

  async function applyReplaceApp(sectorId: string, path: string) {
    const selection = await createAppSelection(path);
    const nextConfig = rememberAppPickerDir(replaceSectorWithApp(draftConfigRef.current, sectorId, selection), path);
    commitDraftChange(nextConfig);
    onResolveRuntimeError();
    onStatusChange({
      tone: "success",
      message: "已重新选择应用",
      detail: selection.icon?.type === "image" ? "已读取原生图标，可先运行验证，保存后会写入主轮盘配置。" : "可先运行验证，保存后会写入主轮盘配置。",
    });
  }

  async function createAppSelection(path: string): Promise<AppSelection> {
    const fallback = createTextIconConfig(pathStem(path));
    if (!isTauri()) {
      return { path, icon: fallback };
    }

    try {
      const source = await loadAppIcon(path);
      if (!source) {
        return { path, icon: fallback };
      }

      return {
        path,
        icon: {
          type: "image",
          source,
          fallback: getIconFallback(fallback),
        },
      };
    } catch {
      return { path, icon: fallback };
    }
  }

  async function handleConfirmDuplicateApp() {
    if (!pendingDuplicateAppAction) {
      return;
    }

    try {
      if (pendingDuplicateAppAction.type === "add") {
        await applyAddApp(pendingDuplicateAppAction.path);
        return;
      }

      await applyReplaceApp(pendingDuplicateAppAction.sectorId, pendingDuplicateAppAction.path);
    } catch (error) {
      onStatusChange(toErrorStatus(error, "重复应用操作失败", "请重新选择 Windows .exe 应用。"));
    }
  }

  function handleCancelDuplicateApp() {
    setPendingDuplicateAppAction(null);
    onStatusChange({
      tone: "info",
      message: "已取消重复应用操作",
      detail: "当前轮盘草稿未发生变化。",
    });
  }

  function handleRemoveSector(sectorId: string) {
    if (savedSectorIds.has(sectorId) && confirmingDeleteSectorId !== sectorId) {
      const sector = mainMenu.sectors.find((item) => item.id === sectorId);
      setConfirmingDeleteSectorId(sectorId);
      setConfirmingResetDefault(false);
      setPendingDuplicateAppAction(null);
      onStatusChange({
        tone: "warning",
        message: "再次确认删除",
        detail: `${sector?.label ?? "这个轮盘项"} 保存后会从主轮盘中移除，可在保存前撤销更改。`,
      });
      return;
    }

    try {
      commitDraftChange(removeSector(draftConfig, sectorId));
      onStatusChange({
        tone: "warning",
        message: "已删除轮盘项",
        detail: "保存后它会从主轮盘中移除，可在保存前撤销更改。",
      });
    } catch (error) {
      onStatusChange(toErrorStatus(error, "删除轮盘项失败", "请确认主轮盘仍保留最少扇区数量。"));
    }
  }

  function handleRevertClick() {
    clearInlineConfirmations();
    onRevert();
  }

  function handleSaveClick() {
    clearInlineConfirmations();
    onSave();
  }

  function handleExecuteSectorClick(sectorId: string) {
    clearInlineConfirmations();
    onExecuteSector(sectorId);
  }

  function handleMoveSectorToIndex(sectorId: string, targetIndex: number) {
    commitDraftChange(moveSectorToIndex(draftConfig, sectorId, targetIndex));
  }

  function handleResetDefaultClick() {
    if (!confirmingResetDefault) {
      setConfirmingResetDefault(true);
      setConfirmingDeleteSectorId(null);
      setPendingDuplicateAppAction(null);
      onStatusChange({
        tone: "warning",
        message: "再次确认恢复默认草稿",
        detail: "当前未保存更改会被覆盖，保存后默认配置才会生效。",
      });
      return;
    }

    setConfirmingResetDefault(false);
    setConfirmingDeleteSectorId(null);
    setPendingDuplicateAppAction(null);
    onResetDefault();
  }

  function clearInlineConfirmations() {
    setConfirmingDeleteSectorId(null);
    setConfirmingResetDefault(false);
    setPendingDuplicateAppAction(null);
  }

  function handleMaintenanceToggle(event: React.ToggleEvent<HTMLDetailsElement>) {
    if (!event.currentTarget.open) {
      setConfirmingResetDefault(false);
    }
  }

  function commitDraftChange(nextConfig: OrbitConfig) {
    clearInlineConfirmations();
    onDraftChange(nextConfig);
  }

  function updateAppearance(patch: Partial<OrbitConfig["wheel"]["appearance"]>) {
    commitDraftChange({
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

  function updateWheelGeometry(patch: Partial<OrbitConfig["wheel"]>) {
    commitDraftChange({
      ...draftConfig,
      wheel: clampWheelGeometry({
        ...draftConfig.wheel,
        ...patch,
      }),
    });
  }

  function updateBackground(patch: Partial<OrbitConfig["wheel"]["appearance"]["background"]>) {
    onFailedBackgroundImagePathChange(null);
    updateAppearance({
      background: {
        ...draftConfig.wheel.appearance.background,
        ...patch,
      },
    });
  }

  async function handleSelectBackgroundImage() {
    if (!canOpenSystemFilePicker(onStatusChange, "请在桌面应用中选择背景", "当前浏览器预览不能打开系统文件选择器，请从 Orbit 桌面窗口选择图片。")) {
      return;
    }

    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "轮盘背景图片",
            extensions: backgroundImageExtensions,
          },
        ],
        title: "选择轮盘背景图片",
      });

      if (typeof selected !== "string") {
        return;
      }

      updateBackground({
        type: "image",
        imagePath: selected,
        fit: "cover",
      });
      onStatusChange({
        tone: "success",
        message: "已选择轮盘背景",
        detail: "保存后会用于主轮盘预览和运行时轮盘。",
      });
    } catch (error) {
      onStatusChange(toErrorStatus(error, "选择背景图片失败", "请重新选择 png、jpg、jpeg、webp 或 bmp 图片。"));
    }
  }

  function handleClearBackgroundImage() {
    updateBackground({
      type: "none",
      imagePath: null,
    });
    onStatusChange({
      tone: "info",
      message: "已清除轮盘背景",
      detail: "保存后主轮盘会恢复为纯色材质背景。",
    });
  }

  function updateTrigger(patch: Partial<OrbitConfig["trigger"]>) {
    commitDraftChange({
      ...draftConfig,
      trigger: {
        ...draftConfig.trigger,
        ...patch,
      },
    });
  }

  function isTriggerPresetActive(preset: (typeof triggerPresetOptions)[number]) {
    return (
      draftConfig.trigger.holdMs === preset.value.holdMs &&
      draftConfig.trigger.moveThresholdPx === preset.value.moveThresholdPx &&
      draftConfig.trigger.cancelDistancePx === preset.value.cancelDistancePx
    );
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
    clearInlineConfirmations();
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
                onClick={() => {
                  clearInlineConfirmations();
                  setActiveTab(tab.id);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="toolbar-actions">
            <button className="button button--secondary" type="button" onClick={handleRevertClick} disabled={!isDirty || isSaving}>
              撤销更改
            </button>
            <button className="button button--primary" type="button" onClick={handleSaveClick} disabled={!isDirty || isSaving}>
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
        {status.actions?.length ? (
          <div className="status-banner__actions" aria-label={`${status.message}恢复操作`}>
            {status.actions.map((action) => (
              <button
                className={`button button--${action.variant ?? "secondary"} button--compact`}
                disabled={action.disabled}
                key={action.label}
                type="button"
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : statusSecondaryLabel ? (
          <strong>{statusSecondaryLabel}</strong>
        ) : null}
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

            {pendingDuplicateAppAction ? (
              <div className="inline-decision inline-decision--warning" role="group" aria-label="重复应用确认">
                <div>
                  <strong>重复使用这个应用？</strong>
                  <small>同一个 .exe 已存在于主轮盘中，确认后会继续保留重复项。</small>
                </div>
                <div className="inline-decision__actions">
                  <button className="button button--secondary button--compact" type="button" onClick={handleConfirmDuplicateApp}>
                    确认重复
                  </button>
                  <button className="button button--secondary button--compact" type="button" onClick={handleCancelDuplicateApp}>
                    取消
                  </button>
                </div>
              </div>
            ) : null}

            <div className="sector-list" aria-label="轮盘应用列表">
              {mainMenu.sectors.map((sector, index) => {
                const placement = getSectorPlacement(index, mainMenu.sectors.length, draftConfig.wheel.startAngleDeg);
                const labelError = getSectorLabelError(sector.label);
                const actionType = describeActionType(sector.action);
                const labelInputId = `sector-${sector.id}-label`;
                const labelErrorId = `sector-${sector.id}-label-error`;
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
                      <SectorIconPreview icon={sector.icon} />
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
                          onChange={(event) =>
                            commitDraftChange(updateSector(draftConfig, sector.id, { label: event.currentTarget.value }))
                          }
                        />
                        {labelError ? (
                          <small className="field-error" id={labelErrorId}>
                            {labelError}
                          </small>
                        ) : null}
                      </label>

                      <div className="sector-editor__type" aria-label={`类型：${actionType.label}`}>
                        <span>类型</span>
                        <strong>{actionType.label}</strong>
                      </div>

                      <div className="sector-editor__path">
                        <span>{placement.accessibleLabel}</span>
                        <span>{describeAction(sector.action)}</span>
                        {hasRuntimeError ? <span className="sector-editor__recovery">上次启动失败，可重新运行或重选应用。</span> : null}
                      </div>
                    </div>

                    <div className="sector-editor__actions">
                      <div className="sector-editor__primary-actions" aria-label={`${sector.label} 常用操作`}>
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => handleExecuteSectorClick(sector.id)}
                          disabled={sector.action.type !== "app"}
                        >
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
                      </div>
                      <details className="sector-editor__adjust-menu">
                        <summary aria-label={`打开 ${sector.label} 更多操作`}>更多</summary>
                        <div className="sector-editor__adjust-panel" aria-label={`${sector.label} 调整操作`}>
                          <button
                            className="button button--secondary button--compact"
                            type="button"
                            onClick={() => handleMoveSectorToIndex(sector.id, 0)}
                            disabled={index === 0}
                          >
                            移到最前
                          </button>
                          <button
                            className="button button--secondary button--compact"
                            type="button"
                            onClick={() => commitDraftChange(moveSector(draftConfig, sector.id, "up"))}
                            disabled={index === 0}
                          >
                            上移
                          </button>
                          <button
                            className="button button--secondary button--compact"
                            type="button"
                            onClick={() => commitDraftChange(moveSector(draftConfig, sector.id, "down"))}
                            disabled={index === mainMenu.sectors.length - 1}
                          >
                            下移
                          </button>
                          <button
                            className="button button--secondary button--compact"
                            type="button"
                            onClick={() => handleMoveSectorToIndex(sector.id, mainMenu.sectors.length - 1)}
                            disabled={index === mainMenu.sectors.length - 1}
                          >
                            移到最后
                          </button>
                          <button
                            className={
                              confirmingDeleteSectorId === sector.id
                                ? "button button--warning button--compact"
                                : "button button--secondary button--compact button--danger"
                            }
                            type="button"
                            onClick={() => handleRemoveSector(sector.id)}
                            disabled={mainMenu.sectors.length <= MIN_SECTOR_COUNT}
                          >
                            {confirmingDeleteSectorId === sector.id ? "确认删除" : "删除"}
                          </button>
                        </div>
                      </details>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}

        {activeTab === "trigger" ? (
          <div className="settings-section settings-section--tab">
            <div className="section-heading section-heading--compact">
              <span>触发</span>
              <h3>轮盘呼出</h3>
            </div>

            <div className="settings-list" aria-label="轮盘触发设置">
              <SettingRow icon="trigger" tone="cyan" title="主触发方式" description="长按鼠标中键，拖向目标方向后松开执行">
                <span className="setting-row__badge">中键长按</span>
              </SettingRow>

              <SettingRow icon="trigger" tone={triggerStatus.tone} title="触发验证" description={triggerStatus.description}>
                <div className="trigger-readiness" role="status" aria-live="polite">
                  <strong>{triggerStatus.label}</strong>
                  <small>{triggerStatus.detail}</small>
                </div>
              </SettingRow>

              <SettingRow icon="trigger" tone="green" title="触发手感" description="选择呼出速度和移动容错的组合">
                <div className="segmented-control segmented-control--three" role="group" aria-label="触发手感">
                  {triggerPresetOptions.map((option) => (
                    <button
                      className={
                        isTriggerPresetActive(option)
                          ? "segmented-control__item segmented-control__item--active"
                          : "segmented-control__item"
                      }
                      key={option.label}
                      type="button"
                      onClick={() => updateTrigger(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </SettingRow>

              <SettingRow icon="trigger" tone="neutral" title="辅助快捷键" description="使用组合键打开轮盘，避免单键误触">
                <ShortcutRecorder
                  error={shortcutError}
                  isRecording={isRecordingShortcut}
                  shortcut={draftConfig.trigger.shortcut}
                  onChange={(shortcut) => {
                    setShortcutError(null);
                    commitDraftChange({
                      ...draftConfig,
                      trigger: {
                        ...draftConfig.trigger,
                        shortcut,
                      },
                    });
                  }}
                  onError={setShortcutError}
                  onRecordingChange={setIsRecordingShortcut}
                />
              </SettingRow>
            </div>
          </div>
        ) : null}

        {activeTab === "appearance" ? (
          <div className="settings-section settings-section--tab">
            <div className="section-heading section-heading--compact">
              <span>外观</span>
              <h3>轮盘质感</h3>
            </div>

            <div className="settings-list" aria-label="轮盘外观设置">
              <div className="settings-subsection settings-subsection--flush">
                <div className="section-heading section-heading--compact">
                  <span>界面</span>
                  <h3>主题</h3>
                </div>
                <SettingRow icon="theme" tone="cyan" title="界面主题" description="切换设置窗口的日间、夜间或系统外观">
                  <div className="segmented-control segmented-control--three" role="group" aria-label="界面主题">
                    {themeOptions.map((option) => (
                      <button
                        className={
                          draftConfig.wheel.theme === option.value
                            ? "segmented-control__item segmented-control__item--active"
                            : "segmented-control__item"
                        }
                        key={option.value}
                        type="button"
                        onClick={() =>
                          commitDraftChange({
                            ...draftConfig,
                            wheel: {
                              ...draftConfig.wheel,
                              theme: option.value,
                            },
                          })
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </SettingRow>
              </div>

              <div className="settings-subsection">
                <div className="section-heading section-heading--compact">
                  <span>基础</span>
                  <h3>材质</h3>
                </div>
                <SettingRow icon="material" tone="violet" title="轮盘材质" description="选择运行时浮层的透明和质感">
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
              </div>

              <div className="settings-subsection">
                <div className="section-heading section-heading--compact">
                  <span>背景</span>
                  <h3>图片</h3>
                </div>
                <SettingRow
                  error={backgroundImageError}
                  icon="image"
                  tone="cyan"
                  title="背景图片"
                  description={
                    isBackgroundImageSelected
                      ? describeBackgroundImagePath(background.imagePath)
                      : "可选择一张本地图片作为轮盘底纹"
                  }
                >
                  <div className="background-image-control">
                    <button className="button button--secondary button--compact" type="button" onClick={() => void handleSelectBackgroundImage()}>
                      {isBackgroundImageSelected ? "重选图片" : "选择图片"}
                    </button>
                    {isBackgroundImageSelected ? (
                      <button className="button button--secondary button--compact" type="button" onClick={handleClearBackgroundImage}>
                        清除
                      </button>
                    ) : null}
                  </div>
                </SettingRow>

                {isBackgroundImageSelected ? (
                  <>
                    <SettingRow icon="image" tone="neutral" title="图片填充" description="选择图片在轮盘内的裁切方式">
                      <div className="segmented-control segmented-control--two" role="group" aria-label="轮盘背景图片填充方式">
                        {[
                          { label: "裁切填充", value: "cover" },
                          { label: "完整适应", value: "contain" },
                        ].map((option) => (
                          <button
                            className={
                              background.fit === option.value
                                ? "segmented-control__item segmented-control__item--active"
                                : "segmented-control__item"
                            }
                            key={option.value}
                            type="button"
                            onClick={() =>
                              updateBackground({
                                fit: option.value as OrbitConfig["wheel"]["appearance"]["background"]["fit"],
                              })
                            }
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </SettingRow>

                    <SettingRow icon="image" tone="neutral" title="图片强度" description="调节图片在轮盘材质下的可见程度">
                      <div className="range-control">
                        <input
                          aria-label="轮盘背景图片强度"
                          max={0.6}
                          min={0}
                          step={0.01}
                          type="range"
                          value={background.opacity}
                          onChange={(event) => updateBackground({ opacity: Number(event.currentTarget.value) })}
                        />
                        <output>{Math.round(background.opacity * 100)}%</output>
                      </div>
                    </SettingRow>
                  </>
                ) : null}
              </div>

            </div>
          </div>
        ) : null}

        {activeTab === "advanced" ? (
          <div className="settings-section settings-section--tab">
            <div className="section-heading section-heading--compact">
              <span>高级设置</span>
              <h3>精细控制</h3>
            </div>

            <div className="settings-list" aria-label="高级设置">
              <div className="settings-subsection settings-subsection--flush">
                <div className="section-heading section-heading--compact">
                  <span>触发</span>
                  <h3>手感参数</h3>
                </div>
                <div className="settings-list">
                  <SettingRow icon="trigger" tone="neutral" title="长按时间" description="达到这个时间后才会呼出轮盘">
                    <div className="range-control">
                      <input
                        aria-label="长按时间"
                        max={600}
                        min={120}
                        step={10}
                        type="range"
                        value={draftConfig.trigger.holdMs}
                        onChange={(event) => updateTrigger({ holdMs: Number(event.currentTarget.value) })}
                      />
                      <output>{draftConfig.trigger.holdMs}ms</output>
                    </div>
                  </SettingRow>

                  <SettingRow icon="trigger" tone="neutral" title="方向阈值" description="手指移动超过这个距离后才开始选择方向">
                    <div className="range-control">
                      <input
                        aria-label="方向阈值"
                        max={60}
                        min={8}
                        step={1}
                        type="range"
                        value={draftConfig.trigger.moveThresholdPx}
                        onChange={(event) => updateTrigger({ moveThresholdPx: Number(event.currentTarget.value) })}
                      />
                      <output>{draftConfig.trigger.moveThresholdPx}px</output>
                    </div>
                  </SettingRow>

                  <SettingRow icon="trigger" tone="neutral" title="中心取消区" description="松开时仍在中心距离内会取消执行">
                    <div className="range-control">
                      <input
                        aria-label="中心取消区"
                        max={120}
                        min={0}
                        step={1}
                        type="range"
                        value={draftConfig.trigger.cancelDistancePx}
                        onChange={(event) => updateTrigger({ cancelDistancePx: Number(event.currentTarget.value) })}
                      />
                      <output>{draftConfig.trigger.cancelDistancePx}px</output>
                    </div>
                  </SettingRow>

                  <SettingRow icon="trigger" tone="neutral" title="方向快速启动" description="快捷键呼出时，鼠标移出中心后立即按方向执行">
                    <SwitchControl
                      checked={draftConfig.trigger.directionalQuickLaunch}
                      label="方向快速启动"
                      onChange={(checked) => updateTrigger({ directionalQuickLaunch: checked })}
                    />
                  </SettingRow>
                </div>
              </div>

              <div className="settings-subsection">
                <div className="section-heading section-heading--compact">
                  <span>材质</span>
                  <h3>高级参数</h3>
                </div>
                <div className="settings-list">
                  <SettingRow icon="material" tone="neutral" title="轮盘大小" description="控制呼出轮盘的整体直径">
                    <div className="range-control">
                      <input
                        aria-label="轮盘大小"
                        max={WHEEL_SIZE_MAX}
                        min={minWheelSizePx}
                        step={10}
                        type="range"
                        value={draftConfig.wheel.sizePx}
                        onChange={(event) => updateWheelGeometry({ sizePx: Number(event.currentTarget.value) })}
                      />
                      <output>{draftConfig.wheel.sizePx}px</output>
                    </div>
                  </SettingRow>

                  <SettingRow icon="material" tone="neutral" title="扇区宽度" description="控制方向扇区的可点击和可视范围">
                    <div className="range-control">
                      <input
                        aria-label="扇区宽度"
                        max={maxOuterRadiusPx}
                        min={minOuterRadiusPx}
                        step={2}
                        type="range"
                        value={draftConfig.wheel.outerRadiusPx}
                        onChange={(event) => updateWheelGeometry({ outerRadiusPx: Number(event.currentTarget.value) })}
                      />
                      <output>{sectorThicknessPx}px</output>
                    </div>
                  </SettingRow>

                  <SettingRow icon="opacity" tone="cyan" title="轮盘透明度" description="最低保留 35% 可读性">
                    <div className="range-control">
                      <input
                        aria-label="轮盘透明度"
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

              <div className="settings-subsection">
                <div className="section-heading section-heading--compact">
                  <span>启动</span>
                  <h3>系统启动</h3>
                </div>
                <div className="settings-list" aria-label="系统启动设置">
                  <SettingRow icon="power" tone="orange" title="开机自启" description="系统登录后自动启动 Orbit">
                    <SwitchControl
                      checked={draftConfig.startup.launchAtLogin}
                      label="开机自启"
                      onChange={(checked) =>
                        commitDraftChange({
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
                        commitDraftChange({
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

              <details className="advanced-settings advanced-settings--maintenance" onToggle={handleMaintenanceToggle}>
                <summary>维护操作</summary>
                <div className="maintenance-row">
                  <div>
                    <strong>恢复默认配置</strong>
                    <small>{confirmingResetDefault ? "再次点击确认。只会覆盖当前草稿，保存后才会生效。" : "用于重新开始配置，不影响已保存配置，直到你点击保存。"}</small>
                  </div>
                  <button
                    className={confirmingResetDefault ? "button button--warning" : "button button--secondary"}
                    type="button"
                    onClick={handleResetDefaultClick}
                    disabled={isSaving}
                  >
                    {confirmingResetDefault ? "确认恢复" : "恢复默认"}
                  </button>
                </div>
              </details>
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
  error?: string | null;
  icon: SettingIconName;
  title: string;
  tone: SettingIconTone;
}

function SettingRow({ children, description, disabled = false, error = null, icon, title, tone }: SettingRowProps) {
  return (
    <div className={`${disabled ? "setting-row setting-row--disabled" : "setting-row"}${error ? " setting-row--error" : ""}`} aria-disabled={disabled}>
      <SettingIcon name={icon} tone={tone} />
      <div className="setting-row__copy">
        <strong>{title}</strong>
        <small>{description}</small>
        {error ? <small className="field-error">{error}</small> : null}
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

interface ShortcutRecorderProps {
  error: string | null;
  isRecording: boolean;
  shortcut: string;
  onChange: (shortcut: string) => void;
  onError: (error: string | null) => void;
  onRecordingChange: (recording: boolean) => void;
}

function ShortcutRecorder({
  error,
  isRecording,
  shortcut,
  onChange,
  onError,
  onRecordingChange,
}: ShortcutRecorderProps) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!isRecording) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      onError(null);
      onRecordingChange(false);
      return;
    }

    const nextShortcut = shortcutFromKeyboardEvent(event.nativeEvent);
    if (!nextShortcut) {
      onError("请使用 Ctrl、Alt、Shift 或 Win 与另一个按键组合");
      return;
    }

    onChange(nextShortcut);
    onRecordingChange(false);
  }

  return (
    <div className="shortcut-recorder">
      <button
        aria-describedby={error ? "trigger-shortcut-error" : undefined}
        aria-invalid={error ? true : undefined}
        className={isRecording ? "shortcut-recorder__button shortcut-recorder__button--recording" : "shortcut-recorder__button"}
        type="button"
        onBlur={() => {
          if (isRecording) {
            onRecordingChange(false);
          }
        }}
        onClick={() => {
          onError(null);
          onRecordingChange(true);
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{isRecording ? "按下组合键" : formatShortcut(shortcut)}</span>
        <small>{isRecording ? "Esc 取消" : "点击录制"}</small>
      </button>
      {error ? (
        <small className="field-error shortcut-recorder__error" id="trigger-shortcut-error">
          {error}
        </small>
      ) : null}
    </div>
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
    case "trigger":
      return (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M5 8h14" />
          <path d="M7 8v8" />
          <path d="M17 8v8" />
          <path d="M9 16h6" />
          <path d="M12 12h.01" />
        </svg>
      );
    case "theme":
      return (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12 4a8 8 0 1 0 8 8" />
          <path d="M12 4v16" />
          <path d="M12 8h5" />
          <path d="M12 12h7" />
          <path d="M12 16h5" />
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

function SectorIconPreview({ icon }: { icon: OrbitConfig["menus"][number]["sectors"][number]["icon"] }) {
  const [imageFailed, setImageFailed] = useState(false);
  const fallback = getIconFallback(icon);

  useEffect(() => {
    setImageFailed(false);
  }, [icon]);

  return (
    <span className="sector-editor__icon">
      {icon.type === "image" && !imageFailed ? (
        <img className="sector-editor__icon-image" src={icon.source} alt="" onError={() => setImageFailed(true)} />
      ) : (
        fallback || "?"
      )}
    </span>
  );
}

function pathStem(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  const fileName = parts[parts.length - 1] ?? "应用";
  return fileName.replace(/\.[^.]+$/, "") || "应用";
}

function toErrorStatus(error: unknown, message: string, recovery: string): SettingsStatus {
  const detail = toUserFacingErrorMessage(error, recovery);
  return {
    tone: "error",
    message,
    detail: detail === message || detail === recovery ? recovery : `${detail} ${recovery}`,
  };
}

function describeBackgroundImagePath(imagePath: string | null): string {
  if (!imagePath?.trim()) {
    return "背景图片路径不可用，请重新选择";
  }

  const normalizedPath = imagePath.replace(/\\/g, "/");
  const parts = normalizedPath.split("/").filter(Boolean);
  const fileName = parts[parts.length - 1] ?? imagePath;
  return `当前图片：${fileName}`;
}

function describeTriggerStatus({
  isDirty,
  lastFailedSectorId,
  sectorCount,
  shortcut,
}: {
  isDirty: boolean;
  lastFailedSectorId: string | null;
  sectorCount: number;
  shortcut: string;
}): {
  description: string;
  detail: string;
  label: string;
  tone: SettingIconTone;
} {
  if (lastFailedSectorId) {
    return {
      description: "上次启动失败，先在应用页重试或重选应用",
      detail: "修复失败项后再试按中键长按。",
      label: "需要恢复",
      tone: "orange",
    };
  }

  if (isDirty) {
    return {
      description: "当前触发配置仍是草稿，保存后才会用于运行时轮盘",
      detail: `保存后可试按中键长按，辅助快捷键为 ${formatShortcut(shortcut)}。`,
      label: "待保存",
      tone: "orange",
    };
  }

  return {
    description: `已启用 ${sectorCount} 个方向，按住中键拖向方向后松开执行`,
    detail: `可直接试按中键长按，或用 ${formatShortcut(shortcut)} 打开轮盘。`,
    label: "可测试",
    tone: "green",
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

function describeActionType(action: OrbitConfig["menus"][number]["sectors"][number]["action"]): { label: string } {
  switch (action.type) {
    case "app":
      return { label: "应用" };
    case "file":
      return { label: isFolderPath(action.path) ? "文件夹" : "文档" };
    case "url":
      return { label: "网址" };
    case "hotkey":
      return { label: "快捷键" };
    case "command":
      return { label: "命令" };
  }
}

function isFolderPath(path: string): boolean {
  const trimmedPath = path.trim();
  if (!trimmedPath) {
    return false;
  }

  if (/[\\/]$/.test(trimmedPath)) {
    return true;
  }

  const fileName = trimmedPath.replace(/\\/g, "/").split("/").pop() ?? "";
  return !fileName.includes(".");
}

function canOpenSystemFilePicker(
  onStatusChange: (status: SettingsStatus) => void,
  message: string,
  detail: string,
): boolean {
  if (isTauri()) {
    return true;
  }

  onStatusChange({
    tone: "warning",
    message,
    detail,
  });
  return false;
}
