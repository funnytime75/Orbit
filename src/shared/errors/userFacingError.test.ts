import { describe, expect, it } from "vitest";
import { toUserFacingErrorMessage } from "./userFacingError";

describe("userFacingError", () => {
  it("保留业务错误提示", () => {
    expect(toUserFacingErrorMessage(new Error("首版只支持 Windows .exe 应用"), "请重新选择应用。")).toBe(
      "首版只支持 Windows .exe 应用",
    );
  });

  it("隐藏 Tauri 内部 invoke 错误", () => {
    expect(
      toUserFacingErrorMessage(
        new TypeError("Cannot read properties of undefined (reading 'invoke')"),
        "请在 Orbit 桌面应用窗口中操作。",
      ),
    ).toBe("请在 Orbit 桌面应用窗口中操作。");
  });

  it("隐藏插件命令细节", () => {
    expect(toUserFacingErrorMessage("plugin:dialog|open 权限不可用", "文件选择器暂时不可用。")).toBe(
      "文件选择器暂时不可用。",
    );
  });
});
