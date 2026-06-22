# Orbit 项目初始化规格

## 1. 结论

Orbit 是一个系统级鼠标轮盘启动器。本文是项目初始化和后续验收的基准文档，用于约束技术选型、目录结构、配置协议、事件协议、安全规则和测试方式。

当前初始化已覆盖 M0 到部分 M6 能力：

- Tauri + React + TypeScript 项目结构。
- 基础脚本。
- README。
- 默认配置模型。
- 前后端配置校验。
- 基础测试框架。
- 主轮盘应用增删改排。
- 配置显式保存到 Tauri app config 目录。
- Windows `.exe` 应用执行器。
- 开机自启、静默启动和托盘入口。

暂未实现 Windows 全局鼠标 hook、轮盘真实触发和非应用动作执行。

## 2. 项目定位

Orbit 通过鼠标中键长按在光标位置打开轮盘菜单，并通过拖动方向快速执行应用、文件、网址、快捷键或命令动作。

### 2.1 核心目标

- 鼠标中键长按触发轮盘。
- 轮盘在当前鼠标位置附近弹出。
- 鼠标移动方向决定当前选中扇区。
- 松开中键后执行选中动作。
- 支持用户自定义菜单项、图标、动作和触发阈值。
- 默认优先支持 Windows，架构保留 macOS 和 Linux 扩展点。

### 2.2 非目标

- MVP 不做云同步。
- MVP 不做插件市场。
- MVP 不实现复杂脚本运行时。
- MVP 不做多级嵌套菜单。
- MVP 不做系统应用索引全量扫描。

## 3. 调研结论

实现前参考同类项目：

| 项目 | 关键信息 | 对 Orbit 的影响 |
| --- | --- | --- |
| Kando | 跨平台桌面饼图菜单，可启动应用、模拟快捷键、打开文件 | 动作系统应抽象成统一模型 |
| Fly-Pie | GNOME Shell 标记菜单，支持点击、手势和快速模式 | 角度选择、距离阈值和取消逻辑要可测试 |
| Gnome-Pie | Linux 圆形应用启动器，由 pie 和 slice 组成 | 配置模型采用菜单和扇区两级结构 |

技术框架采用 Tauri v2：

- Rust 后端适合处理系统 hook、窗口控制和动作执行。
- Tauri 提供桌面壳、IPC、窗口配置和打包能力。
- React 只负责配置界面和状态展示。
- 轮盘高频渲染使用 Canvas。

## 4. 技术选型

| 层级 | 技术 | 职责 |
| --- | --- | --- |
| 桌面壳 | Tauri v2 | 窗口管理、IPC、权限能力、打包 |
| 系统层 | Rust | 全局鼠标监听、动作执行、配置读写、状态管理 |
| 前端 | React + TypeScript + Vite | 配置界面、轮盘窗口挂载、IPC 调用 |
| 轮盘渲染 | Canvas 2D + requestAnimationFrame | 高频绘制、扇区高亮、动画 |
| 配置 | JSON | MVP 持久化，后续可迁移 SQLite |
| 测试 | Vitest + Rust 单元测试 | 角度映射、配置校验、命令契约 |

## 5. 初始化命令

```powershell
pnpm create tauri-app . --template react-ts --manager pnpm --tauri-version 2 --identifier com.orbit.app --yes --force
pnpm install
pnpm typecheck
pnpm test
pnpm tauri:dev
```

Rust 验证：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

## 6. 推荐仓库结构

```text
Orbit/
  Orbit.md
  README.md
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    app/
      App.tsx
    features/
      wheel/
        WheelCanvas.tsx
        wheelRenderer.ts
        wheelGeometry.ts
        wheelTypes.ts
        wheelGeometry.test.ts
      settings/
        SettingsPage.tsx
        ConfigPreview.tsx
        configSchema.ts
        configSchema.test.ts
    shared/
      ipc/
        commands.ts
        events.ts
      styles/
        globals.css
  src-tauri/
    tauri.conf.json
    Cargo.toml
    src/
      main.rs
      lib.rs
      state.rs
      error.rs
      config/
        mod.rs
        model.rs
        repository.rs
        validation.rs
```

## 7. 窗口设计

Orbit 至少包含两个窗口。

### 7.1 设置窗口

- label：`main`
- title：`Orbit 设置`
- 普通可调整大小窗口。
- 用于展示和编辑配置。

### 7.2 轮盘窗口

建议配置：

```json
{
  "label": "wheel",
  "title": "Orbit Wheel",
  "width": 360,
  "height": 360,
  "decorations": false,
  "transparent": true,
  "alwaysOnTop": true,
  "skipTaskbar": true,
  "visible": false,
  "resizable": false
}
```

要求：

- 默认隐藏。
- 触发时居中显示在鼠标位置。
- 靠近屏幕边缘时根据当前显示器工作区自动夹紧。
- 支持高 DPI，Canvas 按 `devicePixelRatio` 缩放。

## 8. 事件协议

Rust 后端向前端轮盘窗口发送事件。事件名称统一使用 `orbit:` 前缀。

### 8.1 `orbit:wheel:start`

```json
{
  "sessionId": "018f4c7d-0000-7000-9000-000000000001",
  "origin": { "x": 1200, "y": 640 },
  "windowPosition": { "x": 1020, "y": 460 },
  "timestampMs": 1800000000000
}
```

### 8.2 `orbit:wheel:move`

```json
{
  "sessionId": "018f4c7d-0000-7000-9000-000000000001",
  "cursor": { "x": 1280, "y": 620 },
  "vector": { "x": 80, "y": -20 },
  "distance": 82.46,
  "angleDeg": 345.96,
  "activeSectorId": "chrome"
}
```

### 8.3 `orbit:wheel:end`

```json
{
  "sessionId": "018f4c7d-0000-7000-9000-000000000001",
  "cursor": { "x": 1280, "y": 620 },
  "selectedSectorId": "chrome",
  "cancelled": false,
  "reason": "selected"
}
```

`reason` 可选值：

- `selected`
- `dead_zone`
- `cancelled`
- `timeout`
- `disabled`

## 9. Tauri Command 设计

| Command | 职责 | 当前状态 |
| --- | --- | --- |
| `load_config` | 读取当前配置 | 已实现 |
| `validate_config` | 校验配置 | 已实现 |
| `get_runtime_status` | 返回运行状态 | 已实现 |
| `save_config` | 校验并保存配置 | 已实现 |
| `execute_action` | 执行动作 | 已实现 app 动作 |
| `set_orbit_enabled` | 启用或停用全局监听 | 后续实现 |
| 托盘打开设置 | 打开设置窗口 | 已实现托盘菜单 |

错误提示必须使用简体中文。

## 10. 配置 schema

MVP 配置版本为 `1`。

```json
{
  "version": 1,
  "enabled": true,
  "startup": {
    "launchAtLogin": false,
    "silentStart": false
  },
  "trigger": {
    "button": "middle",
    "holdMs": 220,
    "moveThresholdPx": 18,
    "cancelDistancePx": 14
  },
  "wheel": {
    "sizePx": 360,
    "innerRadiusPx": 42,
    "outerRadiusPx": 156,
    "startAngleDeg": -90,
    "animationMs": 90,
    "theme": "system",
    "appearance": {
      "material": "acrylic",
      "opacity": 0.82,
      "blurPx": 16,
      "backgroundColor": "#f8fafc",
      "borderColor": "#ffffff",
      "activeColor": "#2563eb",
      "background": {
        "type": "none",
        "imagePath": null,
        "fit": "cover",
        "opacity": 0.35
      }
    }
  },
  "menus": [
    {
      "id": "main",
      "label": "主菜单",
      "sectors": [
        {
          "id": "chrome",
          "label": "Chrome",
          "icon": { "type": "text", "value": "C" },
          "action": { "type": "app", "program": "chrome.exe", "args": [] }
        },
        {
          "id": "vscode",
          "label": "VS Code",
          "icon": { "type": "text", "value": "V" },
          "action": { "type": "app", "program": "Code.exe", "args": [] }
        },
        {
          "id": "notepad",
          "label": "记事本",
          "icon": { "type": "text", "value": "记" },
          "action": { "type": "app", "program": "notepad.exe", "args": [] }
        }
      ]
    }
  ],
  "uiState": {
    "lastAppPickerDir": "C:\\Program Files"
  }
}
```

字段约束：

- `version` 必须存在。
- `menus` 至少一个菜单。
- `sectors` 每个菜单支持 2 到 12 个扇区。
- `id` 只允许小写字母、数字、短横线和下划线。
- `label` 不能为空，最大 32 个字符。
- `holdMs` 范围 120 到 600。
- `moveThresholdPx` 范围 8 到 60。
- `innerRadiusPx` 必须小于 `outerRadiusPx`。
- `wheel.appearance.material` 支持 `transparent`、`acrylic`、`frosted`、`solid`。
- `wheel.appearance.opacity` 范围 0.35 到 1。
- `wheel.appearance.blurPx` 范围 0 到 32。
- `wheel.appearance.background.opacity` 范围 0 到 0.6。
- `wheel.appearance.*Color` 使用 `#RRGGBB` 格式。
- `wheel.appearance.background.type` 为 `image` 时必须提供 `imagePath`。
- app 动作首版只支持 Windows `.exe`。
- URL 只允许 `http` 和 `https`。

动作类型：

```ts
type OrbitAction =
  | { type: "app"; program: string; args: string[] }
  | { type: "file"; path: string }
  | { type: "url"; url: string }
  | { type: "hotkey"; keys: string[] }
  | { type: "command"; program: string; args: string[]; confirm: true };
```

## 11. 轮盘几何规则

角度计算：

```ts
function getAngleDeg(cx: number, cy: number, mx: number, my: number): number {
  const angle = Math.atan2(my - cy, mx - cx) * 180 / Math.PI;
  return (angle + 360) % 360;
}
```

扇区映射：

```ts
function getSectorIndex(angleDeg: number, sectorCount: number, startAngleDeg: number): number {
  const normalized = (angleDeg - startAngleDeg + 360) % 360;
  const sectorSize = 360 / sectorCount;
  return Math.floor(normalized / sectorSize);
}
```

规则：

- 鼠标距离小于 `innerRadiusPx` 时不选中扇区。
- 鼠标距离大于 `outerRadiusPx` 时仍按角度选中。
- 起始角度默认 `-90`，第一个扇区从正上方开始。

## 12. 中键触发策略

状态机：

```text
Idle
  -> MiddleDown
  -> WaitingHold
  -> WheelVisible
  -> Executing 或 Cancelled
  -> Idle
```

要求：

- `MiddleDown` 后记录起点和时间。
- 持续按下超过 `holdMs` 才显示轮盘。
- 短按中键不触发 Orbit。
- 松开时仍在中心死区则取消。

## 13. 动作执行策略

Windows MVP 使用结构化参数执行：

```rust
Command::new(program)
    .args(args)
    .spawn()
```

禁止拼接 shell 字符串：

```rust
Command::new("cmd")
    .args(["/C", &format!("start {}", user_input)])
    .spawn()
```

## 14. 安全原则

- 只开放实际需要的 command。
- 前端不能直接执行任意系统命令。
- 所有动作在 Rust 层再次校验。
- 配置导入后先校验再保存。
- 日志和错误提示使用简体中文。
- hook 回调中禁止执行耗时逻辑。

## 15. 测试策略

前端必须覆盖：

- `getAngleDeg`。
- `getSectorIndex`。
- 死区判断。
- 配置 schema 校验。

Rust 必须覆盖：

- 默认配置校验。
- 配置字段校验。
- 动作参数校验。
- 配置保存覆盖已有文件。

手动验证：

1. 启动开发模式。
2. 设置窗口可打开。
3. 轮盘预览可显示。
4. 鼠标移动可高亮不同扇区。
5. 类型检查和单元测试可运行。
6. 添加 `.exe` 应用、保存配置、运行应用可用。
7. 关闭设置窗口后可从托盘重新打开。

## 16. 里程碑

### M0 仓库初始化

交付：

- Tauri + React + TypeScript 项目结构。
- 基础脚本。
- README。
- 默认配置文件生成或默认配置模型。
- 基础测试框架。

验收：

- `pnpm typecheck` 可运行。
- 前端单元测试可运行。
- Rust 单元测试可运行。
- 设置窗口可打开。

状态：已完成。

### M1 轮盘 UI 原型

- Canvas 轮盘。
- 角度和扇区映射。
- 鼠标模拟输入。
- 基础动画。

状态：已完成原型预览，尚未接入真实全局触发。

### M2 Rust 配置和 IPC

- `load_config`。
- `save_config`。
- `validate_config`。
- 默认配置和配置校验。

状态：已完成。

### M3 Windows 全局鼠标 hook

- 中键长按监听。
- 轮盘窗口显示和隐藏。
- 鼠标移动事件推送。

状态：未实现。

### M4 动作执行

- app 动作。
- file 动作。
- url 动作。
- 执行错误处理。

状态：已实现 app 动作和错误记录；file、url、hotkey、command 暂未执行。

### M5 设置页面完善

- 菜单项编辑。
- 动作参数编辑。
- 导入导出。
- 恢复默认配置。

状态：已完成主轮盘应用增删改排和恢复默认；暂不支持导入导出，不支持非 app 动作参数编辑。

### M6 发布准备

- 单实例。
- 开机启动。
- 打包配置。
- 更新策略预留。

状态：已完成开机自启、静默启动和托盘入口；单实例和更新策略未实现。

## 17. 开发规范

- 回复、文档、代码注释、提交信息、日志和错误提示使用简体中文。
- 代码标识符按项目既有英文命名规范。
- 研究优先于编码。
- 复用优先于新建。
- 简单优先于复杂。
- 可读性优先于技巧。
- 不提交占位实现。
- 不把配置校验、动作执行和 UI 渲染混在同一个模块。
- 不在 hook 回调中执行耗时逻辑。
- 不用 React state 承载高频鼠标移动。

## 18. 参考资料

- Kando：`https://github.com/kando-menu/kando`
- Fly-Pie：`https://github.com/Schneegans/Fly-Pie`
- Gnome-Pie：`https://github.com/Schneegans/Gnome-Pie`
- Tauri v2 配置参考：`https://v2.tauri.app/reference/config/`
- Tauri v2 窗口自定义：`https://v2.tauri.app/learn/window-customization`
