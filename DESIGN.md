---
name: PoE2 Tools
description: 炭灰石板与旧铜构成的中文玩家工具工作台
colors:
  surface-0: "#17191c"
  surface-0-light: "#ffffff"
  surface-1: "#131518"
  surface-1-light: "#f4f5f7"
  surface-2: "#17191c"
  surface-2-light: "#ffffff"
  surface-3: "#1d2024"
  surface-3-light: "#f9fafb"
  surface-hover: "#272c33"
  surface-hover-light: "#e9edf2"
  line: "#333942"
  line-light: "#dce1e7"
  control-edge: "#8390a1"
  control-edge-light: "#768292"
  text: "#f0f2f5"
  text-light: "#1d2632"
  text-muted: "#a1aab7"
  text-muted-light: "#566273"
  accent: "#b4c9ee"
  accent-light: "#245cc0"
  accent-bg: "#26364e"
  accent-bg-light: "#e9f0fc"
  action-bg: "#b4c9ee"
  action-bg-light: "#245cc0"
  action-text: "#17263e"
  action-text-light: "#ffffff"
  success: "#8ec9aa"
  success-light: "#256b49"
  warn: "#edbb76"
  warn-light: "#85510e"
  warn-bg: "#30271d"
  warn-bg-light: "#fff4e4"
  danger: "#f28e87"
  danger-light: "#b12c28"
  rarity-unique: "#dfa270"
  rarity-unique-light: "#8f4a12"
  rarity-gem: "#74cfc6"
  rarity-gem-light: "#0d6560"
  brand: "#d6b887"
  brand-light: "#75501f"
  brand-ink: "#241e15"
  brand-ink-light: "#ffffff"
  portal-panel: "#1d2024"
  portal-panel-light: "#f4f5f7"
typography:
  display:
    fontFamily: 'system-ui, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif'
    fontSize: "clamp(32px, 3.7vw, 52px)"
    fontWeight: 550
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  title:
    fontSize: "27px"
    fontWeight: 550
  body:
    fontFamily: 'system-ui, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif'
    fontSize: "14px"
    lineHeight: 1.65
  label:
    fontSize: "12px"
  code:
    fontFamily: 'ui-monospace, Cascadia Mono, Consolas, monospace'
    fontSize: "13px"
    lineHeight: 1.6
rounded:
  portal-control: "4px"
  tool-control: "8px"
  tool-card: "10px"
spacing:
  small: "8px"
  medium: "16px"
  section-inset: "24px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.portal-control}"
    padding: "11px 20px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.brand}"
    rounded: "{rounded.portal-control}"
    padding: "11px 20px"
  tool-action:
    backgroundColor: "{colors.action-bg}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.tool-control}"
    padding: "6px 12px"
  text-input:
    backgroundColor: "{colors.surface-0}"
    textColor: "{colors.text}"
    rounded: "{rounded.tool-control}"
    padding: "10px 12px"
  tool-card:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.tool-card}"
---

# Design System: PoE2 Tools

## Overview

**Creative North Star: "藏身处工作台"**

以已批准的“炭灰石板、旧铜金属”方向为依据，网站用干净深色表面、温暖的品牌强调与冷蓝工具操作形成克制的游戏工作台。正文不叠纹理，不使用位图素材；内容对照本身承担视觉主体。

保留系统、浅色、深色主题与本机中文字体。首页帮助玩家选择工具，构筑页集中导入、核对、下载，扩展页清楚说明环境、安装与开发预览状态。视觉资料记录本地实现，不代表网站已上线。

本文件合并保留原界面约定；网站取值源为 `apps/site/src/shared/styles/tokens.css`、`site.css` 及相邻基础/控件样式。上方原始色名对应 CSS 变量，`-light` 是同一变量的浅色覆写快照；运行时仍由 CSS 与主题设置决定。侧车的色阶仅用于设计面板展示，不是新增产品 token。

扩展源码位于独立分支，0.1.111 开发预览尚未合入主树。网站说明页不构成扩展发行；扩展弹窗和原站注入面板仍按各自约定维护，注入样式限定在 `data-poe2-l10n` 下，不能污染原站控件。

**Key Characteristics:**

- 旧铜品牌色与冷蓝操作色分工明确。
- 细分隔与留白建立层级，避免每段文字都套卡片。
- 桌面并排比较，手机自然纵向阅读。
- 中文正文完整可读，未知内容与游戏标记保持原有语义。

## Colors

### Primary

旧铜 `brand` 用于站点识别、门户主按钮、链接与重点标题；`brand-ink` 保证填色按钮上的文字可读。浅色主题对应较深铜色，不直接照搬暗色前景。

### Secondary

克制冷蓝 `accent` 用于英文词缀与焦点，`action-bg` / `action-text` 用于构筑工作台主操作。门户与工作台的操作色分工来自当前实现，不应全部统一成铜色。

### Neutral

炭灰石板 `surface-*` 承载页面、凹入示例与容器；`portal-panel` 区分门户入口。近象牙白 `text` 和冷灰 `text-muted` 提供正文层级；`line` 分隔信息，`control-edge` 保持输入边界。浅色主题以白与灰白表面承载相同层级。

成功、警告、危险与物品稀有度采用各自语义色；`--mk-*` 游戏标记色继续以 `tokens.css` 为准，不从品牌色推导。

## Typography

显示与正文共用本机简体中文字体栈，具体顺序见 frontmatter。繁体内容通过 `:lang(zh-TW)` 使用 `system-ui, "Segoe UI", "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif`。代码、路径与粘贴区使用本机等宽字体，无额外字体请求。

门户显示标题使用 display；双工具标题桌面采用 title，850px 以下降至 24px，620px 以下为 22px。正文使用 body，门户主说明为 16px，手机首页说明为 14px；标签与辅助信息使用 label。首页说明手机限制 26ch，工具描述限制 42ch。标题平衡换行、说明自然换行，不截断关键术语；数字对照采用 `tabular-nums`。

## Layout

门户主容器与页脚最大外宽 1248px，桌面左右内距 24px，净内容最大 1200px。导航默认最小高 88px；工具入口两等列，共用上下边线与中间分隔，不是漂浮的独立卡片。入口内距为 30px 36px 34px，翻译示例为 18px 24px，正文与底部行动之间可伸展，按钮对齐。

扩展页顶部为 1.5:1 双列、间隔 64px；能力区三等列；安装区 1:1.3 双列、间隔 72px；兼容与隐私说明双列。850px 以下导航换行、隐藏顶部 GitHub 入口（页脚仍有链接），入口内距缩至 24px，扩展顶部调整为 1.2:1。620px 以下各主要内容网格转单列，容器左右 20px，导航独占一行，手机双工具上下排列。

宽度至少 900px 且高度不超过 800px 时启用紧凑首屏：导航最小高 72px、标题 40px、入口内距 22px 28px 24px，示例最小高 172px；目的为桌面首屏保留双入口行动。手机仍自然向下阅读，不强制全屏容纳。

构筑工作台沿用独立密度与响应式：1099px 以下侧栏折叠，600px 以下控件最小触控高度 44px。门户断点与工具断点不可混为一套。

## Elevation & Depth

门户默认没有投影。深浅表面、细边线和旧铜顶部强调线区分层级，正文表面干净。既有工作台弹层仍保留局部投影：设置弹层 `0 12px 36px #0003`，下载帮助 `0 8px 28px #0003`；不要把弹层阴影铺到门户每块内容上。

## Shapes

门户按钮与主题选择器使用小圆角，工具按钮与输入采用略软的圆角，工具卡片为更大的容器圆角，数值见 frontmatter。门户双入口、示例与版本说明主要使用直角和 1px 分隔；品牌表达来自色彩与排版，不依赖装饰轮廓。

## Components

### Buttons

门户主入口旧铜实底、辅助入口透明铜色边框，最小高 48px。悬停变正文色底与页面背景色文字；按下缩放至 0.96，颜色短过渡 140ms。构筑工具按钮默认最小高 40px，主操作使用冷蓝；小屏提升至 44px。高频操作即时响应，不添加入场动画。

### Inputs / Fields

粘贴区沿用工具输入样式：最小高 90px、完整宽度、垂直可调整尺寸、清楚的控件边界。可点击设置让标签整体可点。交互元素使用 2px 冷蓝焦点线、外偏移 3px；焦点顺序与阅读顺序一致。

### Navigation

导航入口最小高 44px，当前页以铜色与下划线同时区分。主题选择支持系统、浅色、深色。跳到主要内容链接仅在焦点进入时显现，手机导航换行而非压缩文字。

### Chips / Containers

门户类型标记为直角细框，铜色 12px 文本，内距 4px 8px；用于网页工具、Chrome 扩展与预览状态，不伪装为可点击筛选。工作台 chip 使用 4px 圆角与 2px 6px 内距，稀有度继续使用游戏语义色。工具卡片使用细框、标题浅层表面与成组内容。

### Translation preview

词缀示例使用冷蓝英文、正文色中文、等宽数字和细分隔箭头；搜索流程示意用静态文本与内联 SVG。两者明确标为示例或示意，不冒充截图，也不增加虚假交互。

减少动态效果时禁用相关过渡和按压缩放；强制色彩模式保留按钮、标签、说明容器边界。每次视觉修改优先检查阻断问题，再检查层级布局和细节。相关技能是开发工具，不进入网站或扩展产物；固定版本见 `docs/design-skills.md`。

## Do's and Don'ts

### Do:

- Do 使用现有 CSS 语义变量，并同时核对深浅主题。
- Do 保留装备稀有度和游戏标记色的独立语义；动态数字使用等宽数字。
- Do 让同组操作靠近，提供明确的禁用、加载、失败文字和可见焦点。
- Do 在桌面、小屏、键盘、减少动态效果与高对比环境核对真实任务路径。
- Do 使用已有依赖，记录实际验证证据，分别报告本地实现与线上发布。

### Don't:

- Don't 引入远程中文字体、正文纹理或无关装饰位图。
- Don't 缩小中文导航以强塞单行，或截断对照装备原文。
- Don't 将首页示意图称作真实扩展截图，或将源码预览写成公开发行。
- Don't 因视觉任务重启已搁置的制作引擎，或未经授权推送、部署。
