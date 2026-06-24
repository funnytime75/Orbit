import type { OrbitAction, OrbitConfig } from "../features/settings/configSchema";

type WheelSector = OrbitConfig["menus"][number]["sectors"][number];

interface ShortcutSelectedActionOptions {
  executeAction: (action: OrbitAction) => Promise<void>;
  hideWheelWindow: () => Promise<void>;
  sector?: WheelSector;
}

export function runShortcutSelectedAction({ executeAction, hideWheelWindow, sector }: ShortcutSelectedActionOptions): void {
  void run();

  async function run() {
    try {
      await hideWheelWindow();
    } catch {
      // 轮盘关闭失败不应阻断已确认的启动动作。
    }

    if (!sector) {
      return;
    }

    try {
      await executeAction(sector.action);
    } catch {
      // Rust 侧会记录运行时错误，这里只避免前端未处理 Promise 影响轮盘关闭。
    }
  }
}
