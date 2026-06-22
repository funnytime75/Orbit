---
name: Orbit
description: 轻量、年轻、可靠的桌面鼠标轮盘启动器深色控制台视觉系统
colors:
  action-blue: "#2f6df6"
  action-blue-hover: "#4f8cff"
  focus-blue: "#8bb7ff"
  app-bg: "#070d19"
  app-ink: "#e8eefb"
  ink-strong: "#f8fbff"
  ink-control: "#dbe7ff"
  ink-muted: "#8ea0bd"
  ink-soft: "#a9b8d4"
  surface: "#101827"
  surface-soft: "#151f32"
  surface-hover: "#1c2940"
  surface-sunken: "#0c1423"
  border-strong: "#35517a"
  border: "#25364f"
  border-soft: "#1b2a40"
  border-muted: "#2b3d58"
  success: "#47d18c"
  success-bg: "#0d221a"
  success-border: "#1e5b42"
  warning-bg: "#241d0e"
  warning-border: "#f0b95d"
  danger: "#ff6b6b"
  danger-deep: "#ff8a8a"
  danger-border: "#7f2a37"
  danger-bg: "#27131a"
  code-bg: "#070d19"
  code-text: "#cfe0ff"
  setting-row-bg: "#1a1d25"
  setting-badge-bg: "#2a2d35"
  switch-off-bg: "#343741"
  switch-thumb-off: "#b8beca"
  switch-thumb-on: "#d9fff4"
  switch-on: "#10a884"
  switch-on-border: "#14b88f"
  icon-orange: "#f59e0b"
  icon-green: "#12c99b"
  icon-violet: "#a855f7"
  icon-cyan: "#06b6d4"
  icon-neutral: "#9aa8bf"
typography:
  headline:
    fontFamily: "Inter, Segoe UI, Microsoft YaHei, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  title:
    fontFamily: "Inter, Segoe UI, Microsoft YaHei, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  body:
    fontFamily: "Inter, Segoe UI, Microsoft YaHei, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, Segoe UI, Microsoft YaHei, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0"
  meta:
    fontFamily: "Inter, Segoe UI, Microsoft YaHei, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0"
rounded:
  control: "7px"
  panel: "8px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  shell: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.ink-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "7px 11px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-hover}"
    textColor: "{colors.ink-strong}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink-control}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "7px 11px"
    height: "40px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.app-ink}"
    rounded: "{rounded.panel}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink-strong}"
    rounded: "{rounded.control}"
    padding: "6px 8px"
    height: "40px"
  status-banner:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink-control}"
    rounded: "{rounded.panel}"
    padding: "10px 12px"
    liveRegion: "status / alert by tone"
  runtime-pill:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink-control}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
  setting-row:
    backgroundColor: "{colors.setting-row-bg}"
    textColor: "{colors.app-ink}"
    rounded: "{rounded.panel}"
    padding: "14px 16px"
  sector-row:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.app-ink}"
    rounded: "{rounded.panel}"
    padding: "10px"
  switch:
    offBackgroundColor: "{colors.switch-off-bg}"
    onBackgroundColor: "{colors.switch-on}"
    rounded: "{rounded.pill}"
---

# Design System: Orbit

## 1. Overview

**Creative North Star: "桌面捷径控制台"**

Orbit 的视觉系统服务一个轻量桌面工具：用户在设置窗口里调整轮盘，在 Canvas 预览里验证反馈，然后回到真实桌面工作流。当前系统采用深色控制台界面，让设置页更贴近长期驻留的桌面工具，同时保持快速、可靠和低摩擦。

深色不是为了炫技。它用于降低窗口存在感、强化蓝色动作状态、让轮盘预览更像实际桌面浮层。界面仍然使用 8px 面板、7px 控件、少量蓝色和 160ms 状态过渡，不使用花哨动效、玻璃装饰卡片或大面积霓虹。

**Key Characteristics:**
- 单一 sans 字体栈，优先保证中文和系统 UI 可读。
- 深色控制台背景，表面通过低对比边框和少量背景层次区分。
- 主色只用于保存、添加、当前 tab、当前扇区、hover/focus 预览和焦点相关反馈。
- 布局密度偏高，适合反复打开和快速配置。
- 动效只表达状态变化，不做页面入场表演。

## 2. Colors

这是一套冷调深色产品调色板。高亮蓝负责动作确认和当前选择，深色表面负责承载设置密度，绿色/黄色/红色只用于状态语义。

### Primary
- **可靠高亮蓝**：用于保存、添加应用、当前 tab、分段控件选中、轮盘激活扇区、hover/focus 预览和 range accent。
- **亮可靠蓝**：用于主按钮 hover 和强调反馈，面积必须小。
- **焦点浅蓝**：用于键盘焦点外轮廓，必须在深色背景上清楚可见。

### Neutral
- **控制台背景**：应用窗口底色，必须沉稳，不使用装饰纹理。
- **主面板表面**：设置面板和左侧信息面板。
- **柔和表面**：列表项、状态条、次级按钮、tabs 背景。
- **下沉表面**：输入框和代码块背景。
- **深色文本组**：正文使用高亮灰蓝，辅助文字使用静音灰蓝，不能低于可读对比。
- **边框灰蓝组**：用于面板、控件、分隔线和轻量结构。
- **设置行炭黑组**：用于参考设置列表的行背景、徽标、开关关闭态和开关拇指。
- **语义图标组**：橙、绿、紫、青和中性灰只用于设置列表左侧小图标，面积小且不承担主操作状态。蓝色不用于普通静态图标。

### Named Rules
**The Rare Blue Rule.** 高亮蓝只用于可执行动作、当前选择、hover/focus 预览和焦点相关反馈；如果一个区域里没有用户决策，就不要放蓝色。

**The Console Surface Rule.** 深色界面依靠表面层级、边框和状态点表达结构；不要用宽阴影、装饰模糊或大面积发光制造现代感。

## 3. Typography

**Display Font:** Inter, Segoe UI, Microsoft YaHei, system-ui
**Body Font:** Inter, Segoe UI, Microsoft YaHei, system-ui
**Label/Mono Font:** 当前没有独立等宽字体栈；JSON 预览使用继承字体的小字号样式。

**Character:** Orbit 使用单一产品 sans 字体栈。标题短而稳，标签偏粗，辅助文字更小但必须保持可读，不使用展示字体、花体或营销式大字。

### Hierarchy
- **Display**：当前系统不使用展示层级。不要为设置页新增 hero 级大标题。
- **Headline** (700, 26px, 1.2)：仅用于页面主标题。
- **Title** (700, 18px / 16px, 1.25)：用于面板和设置分区标题。
- **Body** (400, 16px, 1.5)：用于基础阅读和默认控件继承；长文限制在 65-75ch。
- **Label** (700, 13px / 12px, 0 letter-spacing)：用于按钮、状态、字段名和紧凑说明。

### Named Rules
**The One Product Voice Rule.** 产品 UI 使用一个 sans 字体系统完成全部层级；不要引入显示字体、营销标题或流体字号。

## 4. Elevation

Orbit 的设置界面以低阴影深色表面为主，通过背景层级、1px 边框和轻量状态色建立层级。轮盘 Canvas 可以保留材质阴影和径向高光，因为它模拟真实浮层；常规设置面板不使用宽模糊投影。

### Shadow Vocabulary
- **Wheel material shadow** (`shadowBlur: max(6, blurPx); shadowOffsetY: 8; rgba(15, 23, 42, 0.22)`): 仅用于 Canvas 轮盘材质预览和未来真实轮盘窗口。
- **Solid wheel shadow** (`shadowBlur: max(6, blurPx); shadowOffsetY: 3; rgba(15, 23, 42, 0.22)`): 仅用于不透明轮盘材质。

### Named Rules
**The Tool-Surface Rule.** 设置页表面默认不漂浮；只有轮盘这种临时浮层可以获得材质阴影。

## 5. Components

### Buttons
- **Shape:** 轻微圆角控件 (7px)，最小高度 40px。
- **Primary:** 高亮蓝背景、白色文字、13px 粗体标签，padding 为 7px 11px。
- **Hover / Focus:** hover 切换到亮可靠蓝；focus 使用 3px 焦点浅蓝 outline 和 2px offset。
- **Secondary:** 深色柔和表面，保留边框，hover 只改变背景，不添加阴影。

### Tabs
- **Shape:** 8px 外容器和 7px tab 项。
- **Active:** 高亮蓝背景，白色文字。
- **Keyboard:** 支持方向键、Home 和 End 切换，焦点样式必须可见。

### Cards / Containers
- **Corner Style:** 面板和列表项使用 8px 圆角。
- **Background:** 主面板使用主面板表面，列表项和状态使用柔和表面。
- **Shadow Strategy:** 不使用常规宽阴影。
- **Border:** 面板使用 1px 深灰蓝边框。
- **Internal Padding:** 面板 16px，列表项 10-11px，页面 shell 24px。

### Inputs / Fields
- **Style:** 下沉深色背景、1px 边框、7px 圆角、高度 40px，左右 padding 6-8px。
- **Focus:** 与按钮一致使用 3px 焦点浅蓝 outline。
- **Error / Disabled:** disabled 降低 opacity 到 0.56；错误状态使用深红背景、红色边框和亮红文字。

### Setting Rows

- **Shape:** 8px 圆角、单行卡片式列表，最小高度 68px。
- **Layout:** 左侧 34px 语义图标，中间标题和说明，右侧放开关、分段控件、滑杆或状态徽标。
- **Background:** 使用炭黑设置行背景，比主面板更接近参考图，但仍保留 1px 低对比边框。
- **Switch:** 关闭态为深灰轨道，开启态为绿色轨道，拇指只做 160ms 平移状态反馈。
- **Icon color:** 只用于识别设置类别，不用于大面积装饰。

### Sector Rows

- **Shape:** 8px 圆角的紧凑编辑行，用于主轮盘应用项。
- **Direction model:** 每行必须显示“钟点位 + 方向 + 序号”的轮盘位置，不能只用 8 向近似。9-12 扇区必须用钟点位区分，hover / focus 时联动左侧轮盘预览高亮。
- **Controls:** 常用运行和重选应用操作可见；排序和删除使用紧凑按钮，必须保留可访问名称。
- **Validation:** 名称和文本图标错误就近显示，错误输入使用红色边框和错误背景。
- **Runtime recovery:** 启动失败的扇区必须就近显示恢复提示，并提供重新运行或重选应用入口。

### Status Banners

- **Tone:** info、success、warning、error 四类状态必须有明确语义；错误使用 alert，其他状态使用 polite status。
- **Copy:** 状态包含一句结果和一句恢复或影响说明，避免只输出原始错误。
- **Actions:** 错误状态必须优先给出可执行恢复动作，例如重试运行、重选应用、撤销更改或刷新状态。
- **Dirty state:** 未保存状态可以叠加警示边框，但不能覆盖错误语义。

### First-run Help

- **Use:** 常驻设置页不展示折叠帮助。使用说明后续可通过首次启动提示承载，并用埋点记录是否已展示。
- **Motion:** 首次提示只使用轻量状态变化，不做装饰性入场动效。

### Wheel Preview

轮盘预览是 Orbit 的签名组件。它位于左侧固定预览区域，Canvas 内部使用用户配置的深色背景、边框色、激活色、材质透明度和模糊强度。预览容器保持 8px 圆角和 1px 边框，Canvas 自身可以表现亚克力、磨砂或不透明材质。

### Config Preview

JSON 预览是更深的代码块：控制台背景、浅蓝文字、12px 字号、8px 圆角和滚动区域。它是功能性验证工具，不要扩展成终端主题页面。

## 6. Do's and Don'ts

### Do:
- **Do** 使用可靠高亮蓝表达主操作、当前选中、hover/focus 预览、range accent 和轮盘激活扇区。
- **Do** 用 1px 边框、8px 容器圆角和深色表面维持轻量层级。
- **Do** 保持设置页密度，优先让保存、撤销、添加、重选和运行等动作易扫描。
- **Do** 让状态反馈直接出现在线内或状态条里，文本使用简体中文。
- **Do** 在应用项中显式呈现轮盘方向，避免用户把线性列表自行映射到圆盘。
- **Do** 给键盘焦点保留明显的 3px 浅蓝 outline。

### Don't:
- **Don't** 使用花哨动效；动效必须只表达状态变化。
- **Don't** 做游戏化霓虹、装饰性动画、过度拟物或沉重视觉噪音。
- **Don't** 把 Orbit 做成品牌官网或营销页；不要新增 hero、营销指标卡或展示型大标题。
- **Don't** 使用渐变文字、宽模糊卡片阴影、玻璃拟态装饰卡片或大面积发光背景。
- **Don't** 使用超过 16px 的卡片圆角；常规面板保持 8px，控件保持 7px。
- **Don't** 用大写眉题作为每个分区的装饰脚手架；标签必须服务扫描。
- **Don't** 在核心设置里展示未完成的“预留”功能。
