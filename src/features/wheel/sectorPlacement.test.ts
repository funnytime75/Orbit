import { describe, expect, it } from "vitest";
import { getSectorPlacement } from "./sectorPlacement";

describe("sectorPlacement", () => {
  it("为默认三扇区返回钟点位和方向", () => {
    const placement = getSectorPlacement(0, 3, -90);

    expect(placement).toMatchObject({
      cardinalLabel: "右上",
      clockLabel: "2点位",
      compactLabel: "2点 · 右上",
      indexLabel: "第 1 扇区",
    });
    expect(placement.accessibleLabel).toBe("第 1 扇区，2点位，右上方向");
  });

  it("12 扇区使用不重复的钟点位", () => {
    const labels = Array.from({ length: 12 }, (_, index) => getSectorPlacement(index, 12, -90).clockLabel);

    expect(labels).toEqual([
      "1点位",
      "2点位",
      "3点位",
      "4点位",
      "5点位",
      "6点位",
      "7点位",
      "8点位",
      "9点位",
      "10点位",
      "11点位",
      "12点位",
    ]);
  });

  it("拒绝无效扇区数量和序号", () => {
    expect(() => getSectorPlacement(0, 0, -90)).toThrow("扇区数量必须是正整数");
    expect(() => getSectorPlacement(12, 12, -90)).toThrow("扇区序号超出范围");
  });
});
