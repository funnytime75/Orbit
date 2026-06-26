import { describe, expect, it } from "vitest";
import { defaultOrbitConfig } from "./configSchema";
import {
  WHEEL_SIZE_MAX,
  WHEEL_SIZE_MIN,
  clampWheelGeometry,
  getMaxOuterRadius,
  getMinOuterRadius,
  getMinWheelSize,
} from "./wheelLimits";

describe("wheelLimits", () => {
  it("限制轮盘尺寸范围", () => {
    const tooSmall = clampWheelGeometry({
      ...defaultOrbitConfig.wheel,
      sizePx: 120,
    });
    const tooLarge = clampWheelGeometry({
      ...defaultOrbitConfig.wheel,
      sizePx: 960,
    });

    expect(tooSmall.sizePx).toBe(WHEEL_SIZE_MIN);
    expect(tooLarge.sizePx).toBe(WHEEL_SIZE_MAX);
  });

  it("缩小轮盘时压缩过大的外半径", () => {
    const wheel = clampWheelGeometry({
      ...defaultOrbitConfig.wheel,
      sizePx: 240,
      outerRadiusPx: 180,
    });

    expect(wheel.outerRadiusPx).toBe(getMaxOuterRadius(240));
  });

  it("中心半径较大时限制最小轮盘尺寸，避免生成不可保存草稿", () => {
    const wheel = clampWheelGeometry({
      ...defaultOrbitConfig.wheel,
      sizePx: 240,
      innerRadiusPx: 100,
      outerRadiusPx: 156,
    });

    expect(wheel.sizePx).toBe(getMinWheelSize(100));
    expect(wheel.outerRadiusPx - wheel.innerRadiusPx).toBeGreaterThanOrEqual(48);
    expect(wheel.outerRadiusPx).toBeLessThanOrEqual(getMaxOuterRadius(wheel.sizePx));
  });

  it("保证扇区最小厚度", () => {
    const wheel = clampWheelGeometry({
      ...defaultOrbitConfig.wheel,
      outerRadiusPx: defaultOrbitConfig.wheel.innerRadiusPx + 12,
    });

    expect(wheel.outerRadiusPx).toBe(getMinOuterRadius(defaultOrbitConfig.wheel.innerRadiusPx));
  });
});
