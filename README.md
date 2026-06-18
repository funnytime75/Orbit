# Orbit

Orbit 是一个基于 Tauri、Rust、React 和 Canvas 的鼠标轮盘启动器。当前仓库已完成 M0 初始化：项目结构、默认配置、配置校验、基础轮盘预览、Tauri command 和单元测试骨架。

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

- 设置窗口展示默认 Orbit 配置。
- Canvas 轮盘预览。
- 前端配置 schema 校验。
- Rust 默认配置和配置校验。
- `load_config`、`validate_config`、`get_runtime_status` 三个 Tauri command。

## 尚未实现

- Windows 全局鼠标 hook。
- 轮盘窗口真实触发、定位和隐藏。
- 动作执行器。
- 配置落盘和设置表单编辑。

详细初始化规格见 [Orbit.md](./Orbit.md)。
