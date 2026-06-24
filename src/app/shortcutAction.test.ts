import { describe, expect, it, vi } from "vitest";
import type { OrbitConfig } from "../features/settings/configSchema";
import { runShortcutSelectedAction } from "./shortcutAction";

type WheelSector = OrbitConfig["menus"][number]["sectors"][number];

const appSector: WheelSector = {
  id: "notepad",
  label: "记事本",
  icon: { type: "text", value: "记" },
  action: {
    type: "app",
    program: "notepad.exe",
    args: [],
  },
};

describe("runShortcutSelectedAction", () => {
  it("选中扇区后先隐藏轮盘，再启动动作", () => {
    const calls: string[] = [];
    const hideWheelWindow = vi.fn(() => {
      calls.push("hide");
      return Promise.resolve();
    });
    const executeAction = vi.fn(async () => {
      calls.push("execute");
    });

    runShortcutSelectedAction({
      executeAction,
      hideWheelWindow,
      sector: appSector,
    });

    expect(calls).toEqual(["hide"]);
    expect(hideWheelWindow).toHaveBeenCalledTimes(1);
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("隐藏完成后才启动动作", async () => {
    const calls: string[] = [];
    let resolveHide: (() => void) | null = null;
    const hideWheelWindow = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          calls.push("hide");
          resolveHide = resolve;
        }),
    );
    const executeAction = vi.fn(async () => {
      calls.push("execute");
    });

    runShortcutSelectedAction({
      executeAction,
      hideWheelWindow,
      sector: appSector,
    });

    expect(calls).toEqual(["hide"]);
    expect(executeAction).not.toHaveBeenCalled();

    expect(resolveHide).not.toBeNull();
    resolveHide!();
    await Promise.resolve();

    expect(calls).toEqual(["hide", "execute"]);
    expect(executeAction).toHaveBeenCalledWith(appSector.action);
  });

  it("启动失败也不会阻断隐藏轮盘", async () => {
    const calls: string[] = [];
    const hideWheelWindow = vi.fn(() => {
      calls.push("hide");
      return Promise.resolve();
    });
    const executeAction = vi.fn(async () => {
      calls.push("execute");
      throw new Error("启动失败");
    });

    runShortcutSelectedAction({
      executeAction,
      hideWheelWindow,
      sector: appSector,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toEqual(["hide", "execute"]);
  });

  it("找不到扇区时只隐藏轮盘", () => {
    const hideWheelWindow = vi.fn(() => Promise.resolve());
    const executeAction = vi.fn(async () => undefined);

    runShortcutSelectedAction({
      executeAction,
      hideWheelWindow,
      sector: undefined,
    });

    expect(hideWheelWindow).toHaveBeenCalledTimes(1);
    expect(executeAction).not.toHaveBeenCalled();
  });
});
