# 2026-09-26 设计优化与验收

## 范围

使用 make-interfaces-feel-better 的 full 细节审查，以及 Impeccable polish / adapt 工作流。网站范围是构筑汉化的导入、设置、预览与下载路径，React + 普通 CSS。扩展范围是设置弹窗及注入 CoE 的装备转换面板，原生 DOM + 限定范围的 CSS。原装备工坊和原站其他界面不在本轮改版范围。

网站改动位于当前主工作区；扩展改动位于已有 `feat/coe-chrome-extension` 工作树（基线 `196ee50`，0.1.111）。未切换分支、未合并、未提交或发布。

## 审查与落地

| 类别 | 检查证据 | 结果 |
| --- | --- | --- |
| 排版 | 网站空态、320/375/768/1440px；弹窗 340px；转换面板 1440/768px | 标题平衡换行、说明自然换行；对照示例增加语言标签 |
| 表面与点击区域 | 网站导航、设置、按钮；扩展设置、预览、填入、文本框 | 明确主次层级；增加常用点击区域；沿用原配色 |
| 动效 | 已有 controls/a11y 样式、设置开合与 Escape | 只增加按钮背景色短过渡，减少动态效果规则继续覆盖；未做 10% 慢放检查 |
| 图标 | 现有 SVG 图标与 currentColor | 保留现有图标体系，未增加图标依赖 |
| 性能 | 新增 CSS、构建结果、限定选择器 | 无生产依赖、新网络资源、轮询或新动画；未做专项性能基准 |

| 严重度 | 位置 | 原状 | 改后 | 原因 |
| --- | --- | --- | --- | --- |
| MEDIUM | `apps/build-l10n/src/styles/responsive.css` | 小屏标题、链接、语言与设置挤在一行 | 品牌导航与设置分两行，弹层位置同步调整 | 中文可读性与触控空间 |
| MEDIUM | `apps/build-l10n/src/styles/layout.css`、`controls.css`、`sidebar.css` | 普通链接与按钮层级不一致，部分入口不足 40px | 工坊链接采用语义配色；常用按钮、语言选择、粘贴入口至少 40px | 点击区域与视觉一致性 |
| LOW | `apps/build-l10n/src/styles/base.css`、`controls.css` | 标题与说明默认换行，按钮背景直接切换 | 平衡/自然换行、主题光标色、明确属性的背景过渡 | 排版及可中断反馈 |
| LOW | `apps/build-l10n/src/components/EmptyState.tsx`、`styles/empty.css` | 重复眉题、示例外框及无标签文本 | 去除眉题，示例改分隔线与中英标签，空态留白适配高度 | 简化装饰，明确阅读顺序 |
| MEDIUM | `apps/poe2-extension/src/popup/popup.css` | 设置缺少整行焦点/悬停反馈，页脚文字较小 | 标签内边距和焦点背景、统一焦点色、12px 页脚、重试按钮尺寸 | 设置状态辨认与可访问性 |
| MEDIUM | `apps/poe2-extension/src/content/import-controller.ts` | 按钮与文本框依赖原站样式，预览和填入层级相似 | 面板内明确深色文本框、主操作、禁用与焦点样式、间距 | 防止宿主样式影响可读性，突出最终操作 |

## 未采用

- 不引入营销页展示字体：中文工具的本机字体可读性与零外部字体请求优先。
- 不增加逐项入场或弹跳动效：翻译、核对与搜索属于高频操作，额外动效增加干扰。
- 不改 CoE 原站整体主题：扩展只控制自身面板，避免破坏宿主布局和原有游戏色彩语义。

## 实际验证

- 网站类型检查通过；最终 `pnpm exec biome check .` 通过，无警告。
- 网站关联回归：`pnpm exec vitest run apps/build-l10n/src/components apps/build-l10n/src/App.test.tsx apps/build-l10n/src/theme apps/build-l10n/src/preview --config apps/build-l10n/vite.config.ts`：16 文件、126 测试通过。
- `pnpm build`、`pnpm dict:check`、`pnpm craft:check` 通过。数据检查保留既有审计/未解析计数，不代表所有数据已人工核实。
- 扩展 typecheck、改动文件 Biome 检查通过；`pnpm exec vitest run apps/poe2-extension/tests --config apps/poe2-extension/vitest.config.ts`：37 文件、284 测试通过；`pnpm extension:build` 通过。
- Impeccable detector 对本轮修改的 TSX/CSS/TS 扫描返回空数组。
- 网站真实浏览器：浅色空态及深色预览 WCAG 2 A/AA 自动检查均为 0 violations、0 incomplete；320、375、768px 无页面横向溢出；导入自造 rich.build，显示对照预览，点击下载出现实际文件名反馈；主题切换、设置开合和 Escape 正常；运行时 errors 为空。
- 在独立 Chromium 中加载真实扩展构建：弹窗设置加载、关闭保存、对照禁用、重新开启正常；自动检查 0 violations、0 incomplete。
- 真实 CoE PoE2 页面：打开装备导入、输入自造法器文本、预览两栏、填入英文并出现恢复原文入口；未点击原站继续提交。768px 窗口内对话框宽 744px。
- 注入面板自动检查 0 violations、1 incomplete（对比度）。人工读取实际计算颜色并用仓库 WCAG 公式复核：辅助按钮 9.36:1、说明和标签 15.40:1、文本框 14.71:1、主按钮 9.06:1。
- 两个工作树 `git diff --check` 通过。

## 验证限制

`pnpm verify` 的全仓测试阶段在沙箱与允许进程通信的重试中均持续没有输出，已中止；没有声称全仓测试通过。一次扩展测试命令未限定文件范围，误选到其他工作区测试并出现失败后中止，改用上述扩展文件范围命令通过。词典检查第一次被沙箱 IPC 权限阻止，授权环境重跑通过。

本轮未完整审查装备工坊、未验收所有 CoE 页面、未做屏幕阅读器人工检查、全游戏内加载验收或性能基准，也未部署线上。结论：本轮已修改路径的定向检查通过，发布前仍需解决全仓测试停滞并完成发布范围验收。
