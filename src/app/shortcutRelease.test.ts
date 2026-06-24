import { describe, expect, it } from "vitest";
import { getShortcutReleaseAction } from "./shortcutRelease";

describe("getShortcutReleaseAction", () => {
  it("默认快捷键释放时确认当前高亮扇区", () => {
    expect(
      getShortcutReleaseAction({
        directionalQuickLaunch: false,
        hasTriggered: false,
        isMouseSessionActive: false,
        isShortcutSessionActive: true,
      }),
    ).toBe("confirm-selection");
  });

  it("方向快速启动模式释放时只关闭未触发会话", () => {
    expect(
      getShortcutReleaseAction({
        directionalQuickLaunch: true,
        hasTriggered: false,
        isMouseSessionActive: false,
        isShortcutSessionActive: true,
      }),
    ).toBe("cancel-session");
  });

  it("鼠标会话或已完成快捷键会话不处理释放事件", () => {
    expect(
      getShortcutReleaseAction({
        directionalQuickLaunch: false,
        hasTriggered: false,
        isMouseSessionActive: true,
        isShortcutSessionActive: true,
      }),
    ).toBe("ignore");

    expect(
      getShortcutReleaseAction({
        directionalQuickLaunch: false,
        hasTriggered: true,
        isMouseSessionActive: false,
        isShortcutSessionActive: true,
      }),
    ).toBe("ignore");
  });
});
