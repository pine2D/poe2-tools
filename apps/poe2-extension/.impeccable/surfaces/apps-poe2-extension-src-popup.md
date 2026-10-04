---
version: 1
slug: "apps-poe2-extension-src-popup"
primary_target: "apps/poe2-extension/src/popup"
related_targets: []
---

# 扩展设置弹窗

范围：工具栏弹窗（宽 340px）。模式：Operate。

用户与任务：在 CoE 新版做装的玩家点开弹窗，想知道中文助手在当前页有没有生效、没生效该怎么改，偶尔切换“启用简体中文”“显示中英对照”。

约束：只申请 storage 权限，不新增权限；状态词与网站扩展介绍页同词（生效中／部分生效／未生效＋原因）；不编造扩展做不到的判断；非官方声明全文保留。

## Direction contract

THESIS：弹窗先回答“这一页生效了没有”，再给开关。拒绝的默认做法：只报告保存的开关状态，再用一句“已开启”重复开关。

OWN-WORLD：沿用现有弹窗：金属标题栏是唯一重点，状态区与开关区平涂；状态图标是内联 SVG（圈勾、半填圆、圈叉、横线圆、虚线圆），形状区分不只靠颜色；不用 ✓ 字形，不用左侧色条。

STORY：打开弹窗 → 读状态区一句结论和一句做法 → 需要时点唯一的安静按钮“刷新页面” → 调开关 → 页脚“版本 · 检查更新”。

FIRST VIEWPORT：标题栏；状态区（状态词 · 原因，下一行做法，至多一个 pt-btn 安静按钮，只在部分生效与初始化失败出现）；菱结分隔；两个开关（右侧保留“开启／关闭”）；页脚一行版本与检查更新，加非官方声明全文。“适用于 Craft of Exile 新版”副标题与“使用前”框取消，提示并入状态原因。

FORM：状态置顶（未抽签：用户在 A/B 两版样稿中直接选定 A，2026-10-04），样稿 popup.html 与 deck-popup-a.png，本地留存。

FINISH：unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## 已决（0.4.0 落地）

- 内容脚本只回事实快照（启动阶段、错误类别、页面是否 PoE2 + English、开关、已翻译处数、搜索框是否接上），不含网址、页面文字或原始报错；弹窗经 `tabs.query`、`tabs.sendMessage`、`tabs.reload` 取用，只有 storage 权限时这三个接口在无头 Chrome 里可用（见 compatibility.md），活动标签页的 `url` 与 `title` 取不到，弹窗不依赖它们。
- 无应答一律显示“未生效”并给“不是 beta 页或页面在安装、更新前已打开”两种可能的原因句，不给刷新按钮；“刷新页面”只在部分生效与初始化失败出现。
- “仍不行请反馈”未加链接，文案保留，初始化失败改为提示检查更新。
