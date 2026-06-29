import { describe, expect, it } from "vitest";
import { defaultOrbitConfig, validateOrbitConfig } from "./configSchema";

describe("validateOrbitConfig", () => {
  it("接受默认配置", () => {
    expect(validateOrbitConfig(defaultOrbitConfig)).toEqual(defaultOrbitConfig);
  });

  it("默认配置包含启动和界面状态", () => {
    expect(defaultOrbitConfig.startup).toEqual({
      launchAtLogin: false,
      silentStart: false,
    });
    expect(defaultOrbitConfig.trigger.shortcut).toBe("Alt+Space");
    expect(defaultOrbitConfig.trigger.directionalQuickLaunch).toBe(false);
    expect(defaultOrbitConfig.uiState.lastAppPickerDir).toBe("C:\\Program Files");
    expect(defaultOrbitConfig.wheel.appearance.material).toBe("acrylic");
    expect(defaultOrbitConfig.wheel.appearance.opacity).toBe(0.9);
    expect(defaultOrbitConfig.wheel.appearance.blurPx).toBe(18);
    expect(defaultOrbitConfig.wheel.appearance.backgroundColor).toBe("#101827");
    expect(defaultOrbitConfig.wheel.appearance.borderColor).toBe("#2b3d58");
    expect(defaultOrbitConfig.wheel.appearance.activeColor).toBe("#2f6df6");
    expect(defaultOrbitConfig.wheel.appearance.background.type).toBe("none");
  });

  it("拒绝无效扇区 ID", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.menus[0].sectors[0].id = "Chrome App";

    expect(() => validateOrbitConfig(config)).toThrow("ID 只能包含小写字母");
  });

  it("拒绝非 exe 应用动作", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.menus[0].sectors[0].action = {
      type: "app",
      program: "C:\\Tools\\demo.cmd",
      args: [],
    };

    expect(() => validateOrbitConfig(config)).toThrow("首版只支持 Windows .exe 应用");
  });

  it("拒绝当前未支持的动作类型", () => {
    const config = structuredClone(defaultOrbitConfig);
    type SectorAction = (typeof config.menus)[number]["sectors"][number]["action"];
    config.menus[0].sectors[0].action = {
      type: "url",
      url: "https://example.com",
    } as unknown as SectorAction;

    expect(() => validateOrbitConfig(config)).toThrow("当前只支持应用动作");
  });

  it("接受 PNG data URL 应用图标", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.menus[0].sectors[0].icon = {
      type: "image",
      source: "data:image/png;base64,aGVsbG8=",
      fallback: "C",
    };

    expect(validateOrbitConfig(config).menus[0].sectors[0].icon).toEqual({
      type: "image",
      source: "data:image/png;base64,aGVsbG8=",
      fallback: "C",
    });
  });

  it("拒绝非 PNG data URL 应用图标", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.menus[0].sectors[0].icon = {
      type: "image",
      source: "data:image/jpeg;base64,aGVsbG8=",
      fallback: "C",
    };

    expect(() => validateOrbitConfig(config)).toThrow("应用图标必须是 PNG data URL");
  });

  it("拒绝轮盘内半径大于外半径", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.wheel.innerRadiusPx = 200;
    config.wheel.outerRadiusPx = 100;

    expect(() => validateOrbitConfig(config)).toThrow("轮盘内半径必须小于外半径");
  });

  it("拒绝扇区宽度过窄", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.wheel.outerRadiusPx = config.wheel.innerRadiusPx + 20;

    expect(() => validateOrbitConfig(config)).toThrow("扇区宽度不能小于 48px");
  });

  it("拒绝外半径超过轮盘尺寸允许范围", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.wheel.sizePx = 240;
    config.wheel.outerRadiusPx = 156;

    expect(() => validateOrbitConfig(config)).toThrow("轮盘外半径不能超过轮盘尺寸允许范围");
  });

  it("拒绝不可读的轮盘外观透明度", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.wheel.appearance.opacity = 0.2;

    expect(() => validateOrbitConfig(config)).toThrow("不透明度不能小于 0.35");
  });

  it("拒绝无路径的图片背景", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.wheel.appearance.background.type = "image";
    config.wheel.appearance.background.imagePath = null;

    expect(() => validateOrbitConfig(config)).toThrow("图片背景路径不能为空");
  });

  it("拒绝不支持格式的图片背景", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.wheel.appearance.background.type = "image";
    config.wheel.appearance.background.imagePath = "C:\\Wallpapers\\orbit.gif";

    expect(() => validateOrbitConfig(config)).toThrow("图片背景只支持 png、jpg、jpeg、webp 或 bmp");
  });

  it("接受支持格式的图片背景", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.wheel.appearance.background.type = "image";
    config.wheel.appearance.background.imagePath = "C:\\Wallpapers\\orbit.webp";

    expect(validateOrbitConfig(config).wheel.appearance.background.imagePath).toBe("C:\\Wallpapers\\orbit.webp");
  });

  it("接受键盘组合键触发配置", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.trigger.shortcut = "Ctrl+Shift+K";

    expect(validateOrbitConfig(config).trigger.shortcut).toBe("Ctrl+Shift+K");
  });

  it("拒绝单键触发配置", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.trigger.shortcut = "Space";

    expect(() => validateOrbitConfig(config)).toThrow("请使用 Ctrl、Alt、Shift 或 Win 与另一个按键组合");
  });
});
