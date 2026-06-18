import { describe, expect, it } from "vitest";
import { defaultOrbitConfig, validateOrbitConfig } from "./configSchema";

describe("validateOrbitConfig", () => {
  it("接受默认配置", () => {
    expect(validateOrbitConfig(defaultOrbitConfig)).toEqual(defaultOrbitConfig);
  });

  it("拒绝无效扇区 ID", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.menus[0].sectors[0].id = "Chrome App";

    expect(() => validateOrbitConfig(config)).toThrow("ID 只能包含小写字母");
  });

  it("拒绝轮盘内半径大于外半径", () => {
    const config = structuredClone(defaultOrbitConfig);
    config.wheel.innerRadiusPx = 200;
    config.wheel.outerRadiusPx = 100;

    expect(() => validateOrbitConfig(config)).toThrow("轮盘内半径必须小于外半径");
  });
});
