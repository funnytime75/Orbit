import { describe, expect, it } from "vitest";
import { defaultOrbitConfig } from "./configSchema";
import {
  addSector,
  createSectorFromApp,
  hasDuplicateApp,
  moveSector,
  moveSectorToIndex,
  removeSector,
  replaceSectorWithApp,
  updateSector,
} from "./configEditor";

describe("configEditor", () => {
  it("从应用路径生成扇区", () => {
    const sector = createSectorFromApp({ path: "C:\\Program Files\\Code\\Code.exe" });

    expect(sector.label).toBe("Code");
    expect(sector.icon.value).toBe("C");
    expect(sector.action).toEqual({
      type: "app",
      program: "C:\\Program Files\\Code\\Code.exe",
      args: [],
    });
  });

  it("拒绝非 exe 应用路径", () => {
    expect(() => createSectorFromApp({ path: "C:\\Tools\\demo.bat" })).toThrow("首版只支持 Windows .exe 应用");
  });

  it("添加扇区并检测重复应用", () => {
    const sector = createSectorFromApp({ path: "C:\\Apps\\Orbit.exe" }, defaultOrbitConfig.menus[0].sectors.map((item) => item.id));
    const config = addSector(defaultOrbitConfig, sector);

    expect(config.menus[0].sectors).toHaveLength(defaultOrbitConfig.menus[0].sectors.length + 1);
    expect(hasDuplicateApp(config, "c:/apps/orbit.exe")).toBe(true);
  });

  it("删除扇区但保留最小数量限制", () => {
    const config = removeSector(defaultOrbitConfig, "notepad");

    expect(config.menus[0].sectors.map((sector) => sector.id)).toEqual(["chrome", "vscode"]);
    expect(() => removeSector(config, "chrome")).toThrow("至少需要 2 个扇区");
  });

  it("更新名称和文本图标", () => {
    const config = updateSector(defaultOrbitConfig, "chrome", {
      label: "浏览器",
      icon: { type: "text", value: "浏" },
    });

    expect(config.menus[0].sectors[0].label).toBe("浏览器");
    expect(config.menus[0].sectors[0].icon.value).toBe("浏");
  });

  it("重新选择应用时保留扇区位置和 ID", () => {
    const config = replaceSectorWithApp(defaultOrbitConfig, "chrome", {
      path: "C:\\Tools\\Figma.exe",
    });

    expect(config.menus[0].sectors[0]).toMatchObject({
      id: "chrome",
      label: "Figma",
      icon: { type: "text", value: "F" },
      action: {
        type: "app",
        program: "C:\\Tools\\Figma.exe",
        args: [],
      },
    });
    expect(config.menus[0].sectors.map((sector) => sector.id)).toEqual(["chrome", "vscode", "notepad"]);
  });

  it("支持上移和下移", () => {
    const movedUp = moveSector(defaultOrbitConfig, "vscode", "up");
    expect(movedUp.menus[0].sectors.map((sector) => sector.id)).toEqual(["vscode", "chrome", "notepad"]);

    const movedDown = moveSector(defaultOrbitConfig, "chrome", "down");
    expect(movedDown.menus[0].sectors.map((sector) => sector.id)).toEqual(["vscode", "chrome", "notepad"]);
  });

  it("支持直接移动到指定位置", () => {
    const movedToEnd = moveSectorToIndex(defaultOrbitConfig, "chrome", 2);
    expect(movedToEnd.menus[0].sectors.map((sector) => sector.id)).toEqual(["vscode", "notepad", "chrome"]);

    const movedToStart = moveSectorToIndex(defaultOrbitConfig, "notepad", 0);
    expect(movedToStart.menus[0].sectors.map((sector) => sector.id)).toEqual(["notepad", "chrome", "vscode"]);
  });

  it("达到最大扇区数量后拒绝继续添加", () => {
    let config = defaultOrbitConfig;
    for (let index = config.menus[0].sectors.length; index < 12; index += 1) {
      config = addSector(
        config,
        createSectorFromApp(
          { path: `C:\\Apps\\Tool${index}.exe` },
          config.menus[0].sectors.map((sector) => sector.id),
        ),
      );
    }

    expect(() =>
      addSector(
        config,
        createSectorFromApp(
          { path: "C:\\Apps\\Overflow.exe" },
          config.menus[0].sectors.map((sector) => sector.id),
        ),
      ),
    ).toThrow("最多支持 12 个扇区");
  });
});
