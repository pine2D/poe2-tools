---
version: 1
slug: "apps-poe2-extension-src-content"
primary_target: "apps/poe2-extension/src/content"
related_targets: ["packages/ui-theme/src/l1.css"]
---

# CoE 注入界面（L1）：中文衬线与导入结果摘要

范围：内容脚本注入 beta.craftofexile.com 的界面译文与“装备文本转换”面板。模式：Operate。

用户与任务：玩家在 CoE 英文界面看国服术语、用中文搜基底，把游戏里复制的中文装备文本转成英文后填进原站导入框，再由原站确认导入。

约束：隐形融入原站；扩展从不自动提交，导入结果与装备规则由原站判断；不新增权限；字体只收 `data/l10n/coe-beta/ui.zh-CN.json` 全部译文与面板固定文案，粗体一档，设体积守卫。

## Direction contract

THESIS：中文要像原站自己的字：原站用游戏风衬线（Fontin）的地方，中文也用衬线；导入面板把“转完了没有、还剩什么、下一步谁做”摆在两栏对照之前。拒绝的默认做法：中文一律系统黑体；转换后只给一句笼统提示。

OWN-WORLD：衬线只落在原站 Fontin 的位置：主导航（背包页签名不改：用户自定义名收字不全会混排，用户 2026-10-04 确认）、button.game 与物品卡底部按钮、首页区块与功能标题；扩展面板标题与主次按钮同样用衬线（“第 N 行”定位按钮除外）。原站 Montserrat 的位置（选择物品分组等小标题、分组按钮、原站对话框标题）、物品卡与词缀、模拟数据、键帽标签、搜索候选保持无衬线。字体 Noto Serif SC 700 一档，拉丁字母仍回落原站字体。

STORY：粘贴中文 → 预览 → 读结论行（可以填入／需先改正 N 行，定位不到行时为需先核对 N 处）→ 按“已完成／待核对（每条带第 N 行定位）／下一步（你／原站）”核对 → 填入英文 → 点原站确认。

FIRST VIEWPORT（预览后）：面板标题行；预览按钮；结论行；三组清单（已完成：已识别 X/Y 行；待核对：问题与原站兼容性提示；下一步：标签“你”或“原站”加一句做法）；两栏对照；填入按钮；声明。

FORM：核对清单（未抽签：用户在 A/B 两版样稿中直接选定 B，2026-10-04）；衬线范围“跟原站一致”、字重“只做粗体一档”（用户确认，2026-10-04）。样稿 import.html、deck-import-b.png 与真站原型对照 serif/，本地留存。

FINISH：unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## 待决

- DESIGN.md 的 L1 白名单与 l1.css 头注释“禁止衬线”要先改。
- 衬线选择器需写文档级样式，与 l1.ts“不写文档级样式”的约定冲突，需在计划里裁定；字体用 web_accessible_resources + fetch + FontFace 加载，从隔离世界调用是否生效要实测。
- “已识别 X/Y 行”需 prepareImport 新增行数统计；出现无行号问题时不显示分数。
- 原文已改变状态下是否把“预览中文转换”设为主按钮；已填入状态是否写出原站按钮名“继续”。
