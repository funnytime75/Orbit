import { useEffect, useState } from "react";
import { ConfigPreview } from "../features/settings/ConfigPreview";
import { SettingsPage } from "../features/settings/SettingsPage";
import { defaultOrbitConfig, type OrbitConfig } from "../features/settings/configSchema";
import { WheelCanvas } from "../features/wheel/WheelCanvas";
import { getRuntimeStatus, loadConfig, type RuntimeStatus } from "../shared/ipc/commands";

function App() {
  const [config, setConfig] = useState<OrbitConfig>(defaultOrbitConfig);
  const [statusText, setStatusText] = useState("默认配置");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);

  useEffect(() => {
    let disposed = false;

    async function bootstrap() {
      try {
        const [loadedConfig, status] = await Promise.all([loadConfig(), getRuntimeStatus()]);
        if (!disposed) {
          setConfig(loadedConfig);
          setRuntimeStatus(status);
          setStatusText(status.configLoaded ? "后端默认配置" : "前端默认配置");
        }
      } catch (error) {
        if (!disposed) {
          setStatusText(error instanceof Error ? error.message : "配置加载失败");
        }
      }
    }

    void bootstrap();
    return () => {
      disposed = true;
    };
  }, []);

  const mainMenu = config.menus[0];

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Orbit</p>
          <h1>鼠标轮盘启动器</h1>
        </div>
        <div className="runtime-pill">{runtimeStatus?.enabled ? "配置已启用" : "初始化完成"}</div>
      </header>

      <section className="workspace">
        <div className="wheel-preview" style={{ ["--wheel-size" as string]: `${config.wheel.sizePx}px` }}>
          <WheelCanvas menu={mainMenu} wheel={config.wheel} />
        </div>

        <div className="workspace__side">
          <SettingsPage config={config} status={statusText} />
          <ConfigPreview config={config} />
        </div>
      </section>
    </main>
  );
}

export default App;
