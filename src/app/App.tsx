import { useCallback, useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ConfigPreview } from "../features/settings/ConfigPreview";
import { SettingsPage, type SettingsStatus } from "../features/settings/SettingsPage";
import { defaultOrbitConfig, type OrbitConfig } from "../features/settings/configSchema";
import { WheelCanvas } from "../features/wheel/WheelCanvas";
import { getSectorPlacement } from "../features/wheel/sectorPlacement";
import { executeAction, getRuntimeStatus, loadConfig, saveConfig, type RuntimeStatus } from "../shared/ipc/commands";
import { orbitEvents } from "../shared/ipc/events";
import { toUserFacingErrorMessage } from "../shared/errors/userFacingError";

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

  const isDirty = useMemo(() => JSON.stringify(savedConfig) !== JSON.stringify(draftConfig), [savedConfig, draftConfig]);
  const isConfigPreviewAvailable = useMemo(isDebugConfigPreviewAvailable, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    setWindowLabel(getCurrentWindow().label);
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

  useEffect(() => {
    let disposed = false;

    async function bootstrap() {
      try {
        const [loadedConfig, status] = await Promise.all([loadConfig(), getRuntimeStatus()]);
        if (!disposed) {
          setSavedConfig(loadedConfig);
          setDraftConfig(loadedConfig);
          setRuntimeStatus(status);
          setStatus({
            tone: "success",
            message: "配置已加载",
            detail: "当前轮盘设置已从本地配置同步。",
          });
        }
      } catch (error) {
        if (!disposed) {
          setStatus(toErrorStatus(error, "配置加载失败", "已保留默认草稿，请检查配置文件后重试。"));
        }
      }
    }

    void bootstrap();
    return () => {
      disposed = true;
    };
  }, []);

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
    setStatus({
      tone: "info",
      message: "已撤销未保存更改",
      detail: "草稿已恢复到上一次保存的配置。",
    });
  }

  function handleResetDefault() {
    const confirmed = window.confirm("恢复默认草稿？当前未保存更改会被覆盖。");
    if (!confirmed) {
      return;
    }
    setDraftConfig(defaultOrbitConfig);
    setLastFailedSectorId(null);
    setStatus({
      tone: "warning",
      message: "已恢复默认草稿",
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

  const mainMenu = draftConfig.menus[0];
  const runtimeLabel = getRuntimeLabel(runtimeStatus);
  const wheelDescriptionId = "wheel-preview-description";

  if (windowLabel === "wheel") {
    return <WheelWindow />;
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Orbit</p>
          <h1>鼠标轮盘启动器</h1>
          <p className="app-subtitle">管理主轮盘里的 Windows 应用，保存后用于快速启动。</p>
        </div>
        <div className="runtime-pill">{runtimeLabel}</div>
      </header>

      <section className="workspace">
        <aside className="wheel-column">
          <div className="wheel-preview" style={{ ["--wheel-size" as string]: `${draftConfig.wheel.sizePx}px` }}>
            <WheelCanvas
              describedBy={wheelDescriptionId}
              menu={mainMenu}
              previewSectorIndex={previewSectorIndex}
              wheel={draftConfig.wheel}
            />
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
            isDirty={isDirty}
            isSaving={isSaving}
            lastFailedSectorId={lastFailedSectorId}
            savedConfig={savedConfig}
            status={status}
            onDraftChange={setDraftConfig}
            onExecuteSector={handleExecuteSector}
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
    </main>
  );
}

function WheelWindow() {
  const [config, setConfig] = useState<OrbitConfig>(defaultOrbitConfig);
  const [runtimeCursor, setRuntimeCursor] = useState<{ x: number; y: number } | null>(null);

  async function loadWheelConfig() {
    try {
      const loadedConfig = await loadConfig();
      setConfig(loadedConfig);
    } catch {
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
          setConfig(loadedConfig);
        }
      } catch {
        if (!disposed) {
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isTauri()) {
        void getCurrentWindow().hide();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const unlisteners = [
      listen<WheelSessionPayload>(orbitEvents.wheelStart, (event) => {
        void loadWheelConfig();
        setRuntimeCursor(toWheelPoint(event.payload));
      }),
      listen<WheelSessionPayload>(orbitEvents.wheelMove, (event) => {
        setRuntimeCursor(toWheelPoint(event.payload));
      }),
      listen<WheelSessionPayload>(orbitEvents.wheelEnd, () => {
        setRuntimeCursor(null);
      }),
    ];

    return () => {
      void Promise.all(unlisteners).then((items) => items.forEach((unlisten) => unlisten()));
    };
  }, []);

  return (
    <main className="wheel-window-shell" aria-label="Orbit 轮盘">
      <WheelCanvas menu={config.menus[0]} runtimeCursor={runtimeCursor} wheel={config.wheel} />
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
              <strong>{sector.icon.value}</strong>
              <span>{sector.label}</span>
              <small>{placement.compactLabel}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function getRuntimeLabel(runtimeStatus: RuntimeStatus | null): string {
  if (!runtimeStatus) {
    return "正在读取状态";
  }

  return runtimeStatus.enabled ? "配置已启用" : "触发已停用";
}

function toErrorStatus(error: unknown, message: string, recovery: string): SettingsStatus {
  const detail = toUserFacingErrorMessage(error, recovery);
  return {
    tone: "error",
    message,
    detail: detail === message ? recovery : `${detail} ${recovery}`,
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
