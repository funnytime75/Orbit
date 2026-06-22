import { describe, expect, it } from "vitest";
import { formatShortcut, isValidShortcut, normalizeShortcut, shortcutFromKeyboardEvent } from "./shortcutRecorder";

describe("shortcutRecorder", () => {
  it("规范化合法组合键", () => {
    expect(normalizeShortcut("alt + space")).toBe("Alt+Space");
    expect(normalizeShortcut("shift+ctrl+KeyK")).toBe("Ctrl+Shift+K");
    expect(normalizeShortcut("meta+Digit1")).toBe("Win+1");
  });

  it("拒绝单键和只有修饰键的输入", () => {
    expect(normalizeShortcut("Space")).toBeNull();
    expect(normalizeShortcut("Ctrl")).toBeNull();
    expect(isValidShortcut("A")).toBe(false);
  });

  it("从键盘事件生成稳定快捷键", () => {
    expect(
      shortcutFromKeyboardEvent({
        altKey: true,
        code: "Space",
        ctrlKey: true,
        key: " ",
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe("Ctrl+Alt+Space");
  });

  it("展示适合用户阅读的快捷键", () => {
    expect(formatShortcut("Ctrl+Alt+Space")).toBe("Ctrl + Alt + Space");
    expect(formatShortcut("Win+ArrowUp")).toBe("Win + ↑");
  });
});
