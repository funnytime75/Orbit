# Orbit

Orbit 是一个 Windows 桌面鼠标轮盘启动器。它通过鼠标中键长按呼出轮盘，拖向目标扇区后松开执行，让常用应用启动和切换更短、更直接。

当前项目使用 Tauri 2、Rust、React、TypeScript 和 Canvas 构建。首版重点是稳定的 Windows 桌面体验：可配置主轮盘、应用项管理、轮盘外观调节、开机自启、静默启动和托盘入口。

## 平台支持

- Windows：当前主要支持平台。
- macOS / Linux：暂未作为首版目标验证。

## 核心功能

- 添加、重选、删除轮盘上的 Windows `.exe` 应用。
- 通过拖动手柄调整应用在轮盘中的顺序。
- 鼠标中键长按呼出轮盘，拖向扇区后松开执行。
- 支持键盘组合键作为辅助触发入口，默认 `Alt + Space`。
- 支持透明、亚克力、磨砂和不透明等轮盘材质设置。
- 支持轮盘尺寸、内外半径、背景透明度和模糊强度调节。
- 支持开机自启、静默启动和系统托盘菜单。
- 设置页包含配置校验、保存、撤销和 JSON 预览。

## 截图

![main](.\docs\screenshots\main.png)

## 安装方式

当前推荐从 GitHub Releases 下载 Windows 安装包。

发布包通常包含：

- `Orbit_<version>_x64-setup.exe`
- `Orbit_<version>_x64_en-US.msi`

如果还没有发布版本，可以在本地构建安装包：

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm tauri:build
```

构建完成后，安装包位于：

```text
src-tauri/target/release/bundle/
```

## 最小使用说明

1. 启动 Orbit。
2. 在设置页进入应用配置区域。
3. 点击添加应用，选择 Windows `.exe` 文件。
4. 使用左侧拖动手柄调整应用顺序。
5. 按需调整轮盘外观、触发手感、开机自启和静默启动。
6. 点击保存。
7. 长按鼠标中键呼出轮盘，拖向目标扇区后松开运行应用。

## 开发环境

需要安装：

- Node.js
- pnpm
- Rust
- Tauri Windows 构建依赖

推荐先启用 Corepack：

```powershell
corepack enable
```

安装依赖：

```powershell
pnpm install --frozen-lockfile
```

启动前端开发服务器：

```powershell
pnpm dev
```

启动 Tauri 桌面开发模式：

```powershell
pnpm tauri:dev
```

## 验证命令

类型检查：

```powershell
pnpm typecheck
```

单元测试：

```powershell
pnpm test
```

前端构建：

```powershell
pnpm build
```

Rust 侧测试：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

## 构建命令

构建前端产物：

```powershell
pnpm build
```

构建 Tauri 应用和 Windows 安装包：

```powershell
pnpm tauri:build
```

## 仓库说明

- `src/`：React 前端、设置页、轮盘 Canvas、配置编辑逻辑。
- `src-tauri/`：Tauri、Rust 后端、配置落盘、系统触发、托盘、应用执行。
- `PRODUCT.md`：产品定位。
- `DESIGN.md`：视觉系统。
- `Orbit.md`：初始化规格与项目背景。

## License

本项目使用 Apache License 2.0。详见 [LICENSE](./LICENSE)。
