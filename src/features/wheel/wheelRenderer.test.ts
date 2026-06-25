import { describe, expect, it } from "vitest";
import { defaultOrbitConfig } from "../settings/configSchema";
import { drawWheel } from "./wheelRenderer";
import { fitCanvasText } from "./wheelRenderer";

const measureByCharacter = (value: string) => Array.from(value).length * 10;

describe("fitCanvasText", () => {
  it("文本在宽度内时保留完整内容", () => {
    expect(fitCanvasText("Chrome", 80, measureByCharacter)).toBe("Chrome");
  });

  it("文本超出宽度时保留可读前缀并追加省略标记", () => {
    expect(fitCanvasText("Visual Studio Code", 90, measureByCharacter)).toBe("Visual...");
  });

  it("支持中文名称按字符截断", () => {
    expect(fitCanvasText("微信开发者工具", 60, measureByCharacter)).toBe("微信开...");
  });

  it("宽度不足时不返回溢出文本", () => {
    expect(fitCanvasText("Chrome", 20, measureByCharacter)).toBe("");
  });

  it("透明材质运行态不绘制非激活扇区底色和边框", () => {
    const calls: string[] = [];
    const context = createCanvasContextMock(calls);
    const canvas = {
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    const config = structuredClone(defaultOrbitConfig);
    config.wheel.appearance.material = "transparent";
    config.wheel.appearance.activeColor = "#2f6df6";

    const activeIndex = drawWheel({
      canvas,
      center: { x: 180, y: 180 },
      cursor: { x: 280, y: 240 },
      menu: config.menus[0],
      renderMode: "runtime",
      wheel: config.wheel,
    });

    expect(activeIndex).toBe(1);
    expect(calls.filter((call) => call === "fill")).toHaveLength(1);
    expect(calls).not.toContain("stroke");
    expect(calls).toContain("fillStyle:#2f6df6");
  });
});

function createCanvasContextMock(calls: string[]) {
  const context = {
    setTransform: () => calls.push("setTransform"),
    clearRect: () => calls.push("clearRect"),
    beginPath: () => calls.push("beginPath"),
    moveTo: () => calls.push("moveTo"),
    arc: () => calls.push("arc"),
    closePath: () => calls.push("closePath"),
    fill: () => calls.push("fill"),
    stroke: () => calls.push("stroke"),
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    fillText: () => calls.push("fillText"),
    measureText: (value: string) => ({ width: value.length * 10 }),
    createRadialGradient: () => ({
      addColorStop: () => undefined,
    }),
    createLinearGradient: () => ({
      addColorStop: () => undefined,
    }),
    set fillStyle(value: string) {
      calls.push(`fillStyle:${value}`);
    },
    set strokeStyle(value: string) {
      calls.push(`strokeStyle:${value}`);
    },
    set lineWidth(_value: number) {},
    set font(_value: string) {},
    set textAlign(_value: CanvasTextAlign) {},
    set textBaseline(_value: CanvasTextBaseline) {},
    set shadowColor(_value: string) {},
    set shadowBlur(_value: number) {},
    set shadowOffsetY(_value: number) {},
  };

  return context as unknown as CanvasRenderingContext2D;
}
