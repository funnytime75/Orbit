import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ConfigPreview } from "../features/settings/ConfigPreview";
import { SettingsPage, type SettingsStatus } from "../features/settings/SettingsPage";
import { defaultOrbitConfig, type OrbitConfig } from "../features/settings/configSchema";
import { getIconFallback } from "../features/settings/configEditor";
import { WheelCanvas } from "../features/wheel/WheelCanvas";
import { getSectorPlacement } from "../features/wheel/sectorPlacement";
import { executeAction, getRuntimeStatus, loadConfig, saveConfig, type RuntimeStatus } from "../shared/ipc/commands";
import { orbitEvents } from "../shared/ipc/events";
import { toUserFacingErrorMessage } from "../shared/errors/userFacingError";
import { runShortcutSelectedAction } from "./shortcutAction";
import { getShortcutReleaseAction } from "./shortcutRelease";

const CONFIG_PREVIEW_STORAGE_KEY = "orbit:show-config-preview";

function App() {
  const [windowLabel, setWindowLabel] = useState(getInitialWindowLabel);
  const [savedConfig, setSavedConfig] = useState<OrbitConfig>(defaultOrbitConfig);
  const [draftConfig, setDraftConfig] = useState<OrbitConfig>(defaultOrbitConfig);
  const [status, setStatus] = useState<SettingsStatus>({
    tone: "info",
    message: "正在加载配置",
    detail: "正在读取本地配置和运行状态。",
  });
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfigPreviewVisible, setIsConfigPreviewVisible] = useState(getInitialConfigPreviewVisibility);
  const [previewSectorIndex, setPreviewSectorIndex] = useState<number | null>(null);
  const [lastFailedSectorId, setLastFailedSectorId] = useState<string | null>(null);
  const [failedBackgroundImagePath, setFailedBackgroundImagePath] = useState<string | null>(null);
  const [isRecoveryDraftPending, setIsRecoveryDraftPending] = useState(false);
  const isMainWindowMountedRef = useRef(true);

  const isDirty = useMemo(
    () => isRecoveryDraftPending || JSON.stringify(savedConfig) !== JSON.stringify(draftConfig),
    [draftConfig, isRecoveryDraftPending, savedConfig],
  );
  const isConfigPreviewAvailable = useMemo(isDebugConfigPreviewAvailable, []);
  const draftBackgroundType = draftConfig.wheel.appearance.background.type;
  const draftBackgroundImagePath = draftConfig.wheel.appearance.background.imagePath;

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    setWindowLabel(getCurrentWindow().label);
  }, []);

  useEffect(() => {
    isMainWindowMountedRef.current = true;
    return () => {
      isMainWindowMountedRef.current = false;
    };
  }, []);

  const refreshRuntimeStatus = useCallback(async (options: { clearResolvedRuntimeError?: boolean } = {}) => {
    try {
      const nextRuntimeStatus = await getRuntimeStatus();
      setRuntimeStatus(nextRuntimeStatus);
      if (options.clearResolvedRuntimeError && !nextRuntimeStatus.lastActionError) {
        setLastFailedSectorId(null);
      }
    } catch (error) {
      setStatus(toErrorStatus(error, "读取运行状态失败", "请确认后台服务可用，然后重试保存或运行。"));
    }
  }, []);

  const handleUseDefaultDraft = useCallback(() => {
    setSavedConfig(defaultOrbitConfig);
    setDraftConfig(defaultOrbitConfig);
    setRuntimeStatus(null);
    setLastFailedSectorId(null);
    setFailedBackgroundImagePath(null);
    setIsRecoveryDraftPending(true);
    setStatus({
      tone: "warning",
      message: "已使用默认草稿",
      detail: "保存后才会覆盖本地配置。当前仍需确认原配置文件是否可读取。",
      secondaryLabel: "待保存",
    });
  }, []);

  const loadInitialState = useCallback(async () => {
    setStatus({
      tone: "info",
      message: "正在加载配置",
      detail: "正在读取本地配置和运行状态。",
      secondaryLabel: "读取中",
    });

    if (!isTauri()) {
      setSavedConfig(defaultOrbitConfig);
      setDraftConfig(defaultOrbitConfig);
      setRuntimeStatus(null);
      setLastFailedSectorId(null);
      setFailedBackgroundImagePath(null);
      setIsRecoveryDraftPending(false);
      setStatus({
        tone: "info",
        message: "浏览器预览",
        detail: "当前预览使用默认草稿。系统文件选择、运行应用和运行状态只在 Orbit 桌面窗口中可用。",
        secondaryLabel: "默认草稿",
      });
      return;
    }

    try {
      const [loadedConfig, status] = await Promise.all([loadConfig(), getRuntimeStatus()]);
      if (!isMainWindowMountedRef.current) {
        return;
      }

      setSavedConfig(loadedConfig);
      setDraftConfig(loadedConfig);
      setRuntimeStatus(status);
      setLastFailedSectorId(null);
      setFailedBackgroundImagePath(null);
      setIsRecoveryDraftPending(false);
      setStatus({
        tone: "success",
        message: "配置已加载",
        detail: "当前轮盘设置已从本地配置同步。",
      });
    } catch (error) {
      if (!isMainWindowMountedRef.current) {
        return;
      }

      setRuntimeStatus(null);
      setStatus({
        ...toErrorStatus(error, "配置加载失败", "已保留默认草稿。请重试读取，或先使用默认草稿继续配置。"),
        actions: [
          {
            label: "重试读取",
            onClick: () => {
              void loadInitialState();
            },
            variant: "primary",
          },
          {
            label: "使用默认草稿",
            onClick: handleUseDefaultDraft,
          },
        ],
        secondaryLabel: null,
      });
    }
  }, [handleUseDefaultDraft]);

  useEffect(() => {
    void loadInitialState();
  }, [loadInitialState]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  async function handleSave() {
    setIsSaving(true);
    try {
      const saved = await saveConfig(draftConfig);
      setSavedConfig(saved);
      setDraftConfig(saved);
      setIsRecoveryDraftPending(false);
      setStatus({
        tone: "success",
        message: "配置已保存",
        detail: "运行时会使用最新轮盘配置。",
      });
      await refreshRuntimeStatus({ clearResolvedRuntimeError: true });
    } catch (error) {
      setStatus(toErrorStatus(error, "保存配置失败", "请检查高亮的设置项后重新保存。"));
    } finally {
      setIsSaving(false);
    }
  }

  function handleRevert() {
    setDraftConfig(savedConfig);
    setLastFailedSectorId(null);
    setFailedBackgroundImagePath(null);
    setIsRecoveryDraftPending(false);
    setStatus({
      tone: "info",
      message: "已撤销未保存更改",
      detail: "草稿已恢复到上一次保存的配置。",
    });
  }

  function handleResetDefault() {
    setDraftConfig(defaultOrbitConfig);
    setLastFailedSectorId(null);
    setFailedBackgroundImagePath(null);
    setIsRecoveryDraftPending(false);
    setStatus({
      tone: "warning",
      message: "已恢复默认配置草稿",
      detail: "保存后默认配置才会生效。",
    });
  }

  function handleToggleConfigPreview() {
    setIsConfigPreviewVisible((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(CONFIG_PREVIEW_STORAGE_KEY, String(next));
      } catch {
        // 本地存储不可用时，只保留当前会话状态。
      }
      return next;
    });
  }

  const handleBackgroundImageStatusChange = useCallback(
    ({ imagePath, status }: { imagePath: string; status: "failed" | "loaded" }) => {
      if (draftBackgroundType !== "image" || draftBackgroundImagePath !== imagePath) {
        return;
      }

      if (status === "loaded") {
        setFailedBackgroundImagePath(null);
        return;
      }

      setFailedBackgroundImagePath(imagePath);
      setStatus({
        tone: "warning",
        message: "背景图片无法读取",
        detail: "请在外观设置中重新选择或清除这张图片。",
      });
    },
    [draftBackgroundImagePath, draftBackgroundType],
  );

  async function handleExecuteSector(sectorId: string) {
    const sector = draftConfig.menus[0].sectors.find((item) => item.id === sectorId);
    if (!sector) {
      return;
    }

    try {
      await executeAction(sector.action);
      setLastFailedSectorId(null);
      setStatus({
        tone: "success",
        message: `已启动：${sector.label}`,
        detail: "如果应用没有出现，请检查路径或系统权限。",
      });
      await refreshRuntimeStatus();
    } catch (error) {
      setLastFailedSectorId(sector.id);
      setStatus(toErrorStatus(error, "启动应用失败", "请确认应用路径仍然存在，或重新添加该应用。"));
      await refreshRuntimeStatus();
    }
  }

  function handleToggleTheme() {
    const nextTheme: OrbitConfig["wheel"]["theme"] = appTheme === "dark" ? "light" : "dark";
    setDraftConfig({
      ...draftConfig,
      wheel: {
        ...draftConfig.wheel,
        theme: nextTheme,
      },
    });
    setStatus({
      tone: "info",
      message: `已切换为${getThemeLabel(nextTheme)}模式`,
      detail: "保存后会作为设置窗口默认外观。",
    });
  }

  const mainMenu = draftConfig.menus[0];
  const runtimeLabel = getRuntimeLabel(runtimeStatus, status);
  const wheelDescriptionId = "wheel-preview-description";
  const appTheme = resolveAppTheme(draftConfig.wheel.theme);
  const themeToggleTarget = appTheme === "dark" ? "light" : "dark";
  const themeToggleLabel = getThemeLabel(themeToggleTarget);

  if (windowLabel === "wheel") {
    return <WheelWindow />;
  }

  return (
    <main className="app-shell" data-theme={appTheme}>
      <aside className="app-rail" aria-label="主导航">
        <div className="app-brand" aria-label="Orbit">
          <span>ORBIT</span>
        </div>
        <nav className="app-nav" aria-label="设置导航">
          <a className="app-nav__item app-nav__item--active" href="#settings-title" aria-current="page">
            <NavIcon name="home" />
            <span>首页</span>
          </a>
        </nav>
        <div className="app-rail__footer">
          <button
            className="app-nav__item app-nav__item--button"
            type="button"
            aria-label={`切换到${themeToggleLabel}模式`}
            title={`切换到${themeToggleLabel}模式`}
            onClick={handleToggleTheme}
          >
            <NavIcon name={themeToggleTarget === "light" ? "theme-light" : "theme-dark"} />
            <span>{themeToggleLabel}</span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div>
            <h1>鼠标轮盘启动器</h1>
            <p className="app-subtitle">管理鼠标轮盘的 Windows 应用、触发手感和外观配置。</p>
          </div>
          <div className="runtime-pill">{runtimeLabel}</div>
        </header>

        <section className="workspace">
          <aside className="wheel-column">
            <div className="wheel-preview-card">
              <div className="section-heading section-heading--compact">
                <span>预览</span>
                <h2>轮盘可视化</h2>
              </div>
              <div className="wheel-preview" style={{ ["--wheel-size" as string]: `${draftConfig.wheel.sizePx}px` }}>
                <WheelCanvas
                  describedBy={wheelDescriptionId}
                  menu={mainMenu}
                  onBackgroundImageStatusChange={handleBackgroundImageStatusChange}
                  previewSectorIndex={previewSectorIndex}
                  wheel={draftConfig.wheel}
                />
              </div>
            </div>
            <WheelSemanticSummary descriptionId={wheelDescriptionId} menu={mainMenu} startAngleDeg={draftConfig.wheel.startAngleDeg} />
            {runtimeStatus?.lastActionError ? (
              <div className="status-banner status-banner--error" role="alert" aria-live="assertive">
                <span>
                  <strong>运行时错误</strong>
                  <small>{runtimeStatus.lastActionError}</small>
                </span>
                <div className="status-banner__actions" aria-label="运行时错误恢复操作">
                  {lastFailedSectorId ? (
                    <button className="button button--secondary button--compact" type="button" onClick={() => void handleExecuteSector(lastFailedSectorId)}>
                      重试运行
                    </button>
                  ) : null}
                  <button
                    className="button button--secondary button--compact"
                    type="button"
                    onClick={() => void refreshRuntimeStatus({ clearResolvedRuntimeError: true })}
                  >
                    刷新状态
                  </button>
                </div>
              </div>
            ) : null}
          </aside>

          <div className="workspace__side">
            <SettingsPage
              draftConfig={draftConfig}
              failedBackgroundImagePath={failedBackgroundImagePath}
              isDirty={isDirty}
              isSaving={isSaving}
              lastFailedSectorId={lastFailedSectorId}
              savedConfig={savedConfig}
              status={status}
              onDraftChange={setDraftConfig}
              onExecuteSector={handleExecuteSector}
              onFailedBackgroundImagePathChange={setFailedBackgroundImagePath}
              onPreviewSectorChange={setPreviewSectorIndex}
              onResolveRuntimeError={() => setLastFailedSectorId(null)}
              onResetDefault={handleResetDefault}
              onRevert={handleRevert}
              onSave={handleSave}
              onStatusChange={setStatus}
            />
            {isConfigPreviewAvailable ? (
              <div className="debug-tools">
                <div className="debug-tools__toolbar">
                  <button className="button button--secondary" type="button" onClick={handleToggleConfigPreview}>
                    {isConfigPreviewVisible ? "隐藏调试信息" : "显示调试信息"}
                  </button>
                </div>
                {isConfigPreviewVisible ? <ConfigPreview config={draftConfig} /> : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function NavIcon({ name }: { name: "home" | "theme-dark" | "theme-light" }) {
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M4 11.5 12 4l8 7.5" />
          <path d="M6.5 10v9h11v-9" />
          <path d="M10 19v-5h4v5" />
        </svg>
      );
    case "theme-dark":
      return (
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M20.5 14.6A7.3 7.3 0 0 1 9.4 3.5a8 8 0 1 0 11.1 11.1z" />
        </svg>
      );
    case "theme-light":
      return (
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
          <path d="M4 12h2" />
          <path d="M18 12h2" />
          <path d="M12 4v2" />
          <path d="M12 18v2" />
          <path d="m6.6 6.6 1.4 1.4" />
          <path d="m16 16 1.4 1.4" />
          <path d="m17.4 6.6-1.4 1.4" />
          <path d="m8 16-1.4 1.4" />
        </svg>
      );
  }
}

function resolveAppTheme(theme: OrbitConfig["wheel"]["theme"]): "dark" | "light" {
  if (theme === "light" || theme === "dark") {
    return theme;
  }

  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) {
    return "light";
  }

  return "dark";
}

function getThemeLabel(theme: "dark" | "light"): string {
  return theme === "dark" ? "夜间" : "日间";
}
function WheelWindow() {
  const [config, setConfig] = useState<OrbitConfig>(defaultOrbitConfig);
  const [runtimeCursor, setRuntimeCursor] = useState<{ x: number; y: number } | null>(null);
  const [isMouseSessionActive, setIsMouseSessionActive] = useState(false);
  const [shortcutFocusToken, setShortcutFocusToken] = useState(0);
  const [shortcutSessionToken, setShortcutSessionToken] = useState(0);
  const isMouseSessionActiveRef = useRef(false);
  const isShortcutSessionActiveRef = useRef(false);
  const shortcutTriggeredRef = useRef(false);
  const activeShortcutSectorIdRef = useRef<string | null>(null);
  const configRef = useRef(defaultOrbitConfig);

  async function loadWheelConfig() {
    try {
      const loadedConfig = await loadConfig();
      configRef.current = loadedConfig;
      setConfig(loadedConfig);
    } catch {
      configRef.current = defaultOrbitConfig;
      setConfig(defaultOrbitConfig);
    }
  }

  useEffect(() => {
    document.documentElement.classList.add("orbit-wheel-root");
    document.body.classList.add("orbit-wheel-body");
    return () => {
      document.documentElement.classList.remove("orbit-wheel-root");
      document.body.classList.remove("orbit-wheel-body");
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function loadInitialWheelConfig() {
      try {
        const loadedConfig = await loadConfig();
        if (!disposed) {
          configRef.current = loadedConfig;
          setConfig(loadedConfig);
        }
      } catch {
        if (!disposed) {
          configRef.current = defaultOrbitConfig;
          setConfig(defaultOrbitConfig);
        }
      }
    }

    void loadInitialWheelConfig();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelShortcutSession();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const unlisteners = [
      listen(orbitEvents.wheelShortcutOpen, () => {
        void loadWheelConfig();
        isMouseSessionActiveRef.current = false;
        isShortcutSessionActiveRef.current = true;
        shortcutTriggeredRef.current = false;
        activeShortcutSectorIdRef.current = null;
        setIsMouseSessionActive(false);
        setRuntimeCursor(null);
        setShortcutFocusToken((current) => current + 1);
        setShortcutSessionToken((current) => current + 1);
      }),
      listen(orbitEvents.wheelShortcutRelease, () => {
        releaseShortcutSession();
      }),
      listen<WheelSessionPayload>(orbitEvents.wheelStart, (event) => {
        void loadWheelConfig();
        isMouseSessionActiveRef.current = true;
        shortcutTriggeredRef.current = false;
        activeShortcutSectorIdRef.current = null;
        setIsMouseSessionActive(true);
        setRuntimeCursor(toWheelPoint(event.payload));
      }),
      listen<WheelSessionPayload>(orbitEvents.wheelMove, (event) => {
        setRuntimeCursor(toWheelPoint(event.payload));
      }),
      listen<WheelSessionPayload>(orbitEvents.wheelEnd, () => {
        isMouseSessionActiveRef.current = false;
        setIsMouseSessionActive(false);
        setRuntimeCursor(null);
      }),
    ];

    return () => {
      void Promise.all(unlisteners).then((items) => items.forEach((unlisten) => unlisten()));
    };
  }, []);

  async function hideWheelWindow() {
    if (isTauri()) {
      await getCurrentWindow().hide();
    }
  }

  function releaseShortcutSession() {
    const action = getShortcutReleaseAction({
      directionalQuickLaunch: configRef.current.trigger.directionalQuickLaunch,
      hasTriggered: shortcutTriggeredRef.current,
      isMouseSessionActive: isMouseSessionActiveRef.current,
      isShortcutSessionActive: isShortcutSessionActiveRef.current,
    });

    if (action === "confirm-selection") {
      isShortcutSessionActiveRef.current = false;
      const activeSectorId = activeShortcutSectorIdRef.current;
      if (activeSectorId) {
        handleShortcutSectorSelect(activeSectorId);
        return;
      }

      cancelShortcutSession();
      return;
    }

    if (action === "cancel-session") {
      cancelShortcutSession();
    }
  }

  function cancelShortcutSession() {
    if (shortcutTriggeredRef.current) {
      return;
    }

    shortcutTriggeredRef.current = true;
    isShortcutSessionActiveRef.current = false;
    activeShortcutSectorIdRef.current = null;
    void hideWheelWindow();
  }

  function handleShortcutCancel() {
    if (isMouseSessionActiveRef.current || shortcutTriggeredRef.current) {
      return;
    }

    cancelShortcutSession();
  }

  function handleShortcutSectorSelect(sectorId: string) {
    if (isMouseSessionActiveRef.current || shortcutTriggeredRef.current) {
      return;
    }

    shortcutTriggeredRef.current = true;
    isShortcutSessionActiveRef.current = false;
    activeShortcutSectorIdRef.current = null;
    const sector = configRef.current.menus[0].sectors.find((item) => item.id === sectorId);
    runShortcutSelectedAction({
      executeAction,
      hideWheelWindow,
      sector,
    });
  }

  return (
    <main className="wheel-window-shell" aria-label="Orbit 轮盘">
      <WheelCanvas
        focusToken={shortcutFocusToken}
        directionalTrigger={{
          enabled: !isMouseSessionActive,
          quickLaunch: config.trigger.directionalQuickLaunch,
          moveThresholdPx: config.trigger.moveThresholdPx,
          token: shortcutSessionToken,
        }}
        menu={config.menus[0]}
        onActiveSectorChange={(sectorId) => {
          activeShortcutSectorIdRef.current = sectorId;
        }}
        onCancel={handleShortcutCancel}
        onSelectSector={handleShortcutSectorSelect}
        renderMode="runtime"
        runtimeCursor={isMouseSessionActive ? runtimeCursor : null}
        wheel={config.wheel}
      />
    </main>
  );
}

interface WheelSessionPayload {
  cursor: { x: number; y: number };
  origin: { x: number; y: number };
  windowPosition: { x: number; y: number };
}

function toWheelPoint(payload: WheelSessionPayload): { x: number; y: number } {
  return {
    x: payload.cursor.x - payload.windowPosition.x,
    y: payload.cursor.y - payload.windowPosition.y,
  };
}

function WheelSemanticSummary({
  descriptionId,
  menu,
  startAngleDeg,
}: {
  descriptionId: string;
  menu: OrbitConfig["menus"][number];
  startAngleDeg: number;
}) {
  return (
    <section className="wheel-summary" aria-labelledby="wheel-summary-title">
      <div className="section-heading section-heading--compact">
        <span>预览</span>
        <h2 id="wheel-summary-title">当前轮盘包含 {menu.sectors.length} 个扇区</h2>
      </div>

      <p className="wheel-summary__hint" id={descriptionId}>
        聚焦轮盘预览后，可以使用方向键切换高亮扇区。中心区域取消选择，当前主轮盘包含：
      </p>
      <ul className="wheel-summary__list" aria-label="当前轮盘扇区摘要">
        {menu.sectors.map((sector, index) => {
          const placement = getSectorPlacement(index, menu.sectors.length, startAngleDeg);

          return (
            <li className="wheel-summary__item" key={sector.id} aria-label={`${placement.accessibleLabel}，${sector.label}`}>
              <strong>{getIconFallback(sector.icon)}</strong>
              <span>{sector.label}</span>
              <small>{placement.compactLabel}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function getRuntimeLabel(runtimeStatus: RuntimeStatus | null, status: SettingsStatus): string {
  if (!runtimeStatus) {
    if (status.message === "浏览器预览") {
      return "浏览器预览";
    }

    if (status.tone === "error") {
      return "状态不可用";
    }

    return "正在读取状态";
  }

  return runtimeStatus.enabled ? "配置已启用" : "触发已停用";
}

function toErrorStatus(error: unknown, message: string, recovery: string): SettingsStatus {
  const detail = toUserFacingErrorMessage(error, recovery);
  return {
    tone: "error",
    message,
    detail: detail === message || detail === recovery ? recovery : `${detail} ${recovery}`,
  };
}

function getInitialConfigPreviewVisibility(): boolean {
  const debugParam = getDebugParam();
  if (debugParam === "1" || debugParam === "true") {
    return true;
  }

  if (debugParam === "0" || debugParam === "false") {
    return false;
  }

  try {
    return window.localStorage.getItem(CONFIG_PREVIEW_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function isDebugConfigPreviewAvailable(): boolean {
  const debugParam = getDebugParam();
  return import.meta.env.DEV || debugParam === "1" || debugParam === "true";
}

function getDebugParam(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("debug");
  } catch {
    return null;
  }
}

export default App;

function getInitialWindowLabel(): string {
  return isTauri() ? getCurrentWindow().label : "main";
}
