# Orbit

Orbit 是一个基于 Tauri、Rust、React 和 Canvas 的鼠标轮盘启动器。当前仓库包含主轮盘配置编辑、轮盘外观调节、配置落盘、Windows 应用执行器、托盘入口、开机自启配置和基础测试。

## 开发环境

- Node.js
- pnpm
- Rust
- Tauri 所需系统依赖

## 常用命令

```powershell
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm tauri:dev
```

Rust 侧验证：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

## 当前能力

- 设置窗口支持主轮盘应用增删改排。
- 设置窗口支持透明、亚克力、磨砂和不透明轮盘材质预览。
- 配置可显式保存到本地配置文件。
- Canvas 轮盘预览。
- 前端配置 schema 校验。
- Rust 默认配置、配置校验和 Windows `.exe` 应用执行器。
- 支持开机自启配置、静默启动和系统托盘入口。
- 托盘菜单支持打开设置和退出。

## 尚未实现

- Windows 全局鼠标 hook。
- 轮盘窗口真实触发、定位和隐藏。
- 导入和导出配置。
- 自定义背景图片导入和真实图片渲染。
- Windows 系统级 Acrylic/Mica 背景模糊。
- 文件、网址、快捷键和命令动作的真实执行。

详细初始化规格见 [Orbit.md](./Orbit.md)。
