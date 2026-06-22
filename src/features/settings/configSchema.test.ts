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

  it("拒绝轮盘内半径大于外半径", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.wheel.innerRadiusPx = 200;
    config.wheel.outerRadiusPx = 100;

    expect(() => validateOrbitConfig(config)).toThrow("轮盘内半径必须小于外半径");
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
});
