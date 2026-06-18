import { describe, expect, it } from "vitest";
import { getActiveSectorIndex, getAngleDeg, getDistance, getSectorIndex } from "./wheelGeometry";

describe("wheelGeometry", () => {
  it("计算标准方向角度", () => {
    const center = { x: 0, y: 0 };

    expect(getAngleDeg(center, { x: 1, y: 0 })).toBe(0);
    expect(getAngleDeg(center, { x: 0, y: 1 })).toBe(90);
    expect(getAngleDeg(center, { x: -1, y: 0 })).toBe(180);
    expect(getAngleDeg(center, { x: 0, y: -1 })).toBe(270);
  });

  it("计算两点距离", () => {
    expect(getDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("按起始角度映射扇区", () => {
    expect(getSectorIndex(270, 4, -90)).toBe(0);
    expect(getSectorIndex(0, 4, -90)).toBe(1);
    expect(getSectorIndex(90, 4, -90)).toBe(2);
    expect(getSectorIndex(180, 4, -90)).toBe(3);
  });

  it("中心死区不选中扇区", () => {
    expect(getActiveSectorIndex({ x: 0, y: 0 }, { x: 4, y: 0 }, 4, -90, 10)).toBeNull();
  });
});
