import type { OrbitConfig } from "./configSchema";

interface SettingsPageProps {
  config: OrbitConfig;
  status: string;
}

export function SettingsPage({ config, status }: SettingsPageProps) {
  const mainMenu = config.menus[0];

  return (
    <section className="settings-panel" aria-labelledby="settings-title">
      <div className="section-heading">
        <span>设置</span>
        <h2 id="settings-title">运行状态</h2>
      </div>

      <dl className="status-grid">
        <div>
          <dt>功能状态</dt>
          <dd>{config.enabled ? "已启用" : "已停用"}</dd>
        </div>
        <div>
          <dt>触发方式</dt>
          <dd>中键长按 {config.trigger.holdMs}ms</dd>
        </div>
        <div>
          <dt>当前菜单</dt>
          <dd>{mainMenu.label}</dd>
        </div>
        <div>
          <dt>配置来源</dt>
          <dd>{status}</dd>
        </div>
      </dl>

      <div className="shortcut-list" aria-label="默认快捷动作">
        {mainMenu.sectors.map((sector) => (
          <article className="shortcut-item" key={sector.id}>
            <span className="shortcut-item__icon">{sector.icon.value}</span>
            <div>
              <h3>{sector.label}</h3>
              <p>{describeAction(sector.action)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function describeAction(action: OrbitConfig["menus"][number]["sectors"][number]["action"]): string {
  switch (action.type) {
    case "app":
      return `启动应用：${action.program}`;
    case "file":
      return `打开文件：${action.path}`;
    case "url":
      return `打开网址：${action.url}`;
    case "hotkey":
      return `模拟快捷键：${action.keys.join(" + ")}`;
    case "command":
      return `执行命令：${action.program}`;
  }
}
