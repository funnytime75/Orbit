import { describe, expect, it } from "vitest";
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
});
