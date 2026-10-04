---
version: 1
slug: "apps-site-src-features-build-l10n"
primary_target: "apps/site/src/features/build-l10n"
related_targets: []
---

# 构筑汉化工作台（已导入状态）

范围：`/build/` 导入一个或多个 `.build` 之后的工作台；空态与导入入口沿用现状，另行处理。模式：Operate（兼 Read）。

用户与任务：国服、台服玩家导入一套英文攻略，用本服中文读懂作者思路和各阶段配装，核对待核对项后下载中文 `.build` 放进游戏。一次导入通常 1–4 个文件。

约束：只改写 `additional_text`、`description`；未命中保留原文并标出；不展示第三方真实攻略作为公开示例；视觉语言沿用 DESIGN.md（暗金、L3/L0 分层），但金属装饰每屏只留一处。

## Direction contract

THESIS：攻略是按阶段推进的，工作台就按阶段并排成列；同一栏位在各列同一行对齐，横向一扫就知道每个阶段换了什么。拒绝的默认做法：按文件字段分“装备／技能／天赋”页签，逐件堆叠大名牌卡。

OWN-WORLD：暖炭底 `page/bg`，L0 平涂数据格，旧铜 `metal-*` 只用于列头所在的一条阶段带；词缀蓝 `mod`、传奇橙、技能青保持游戏语义；中文名衬线只留在列头阶段名，装备行用系统无衬线加 `tabular-nums`。

STORY：玩家先看到这套攻略分几个阶段、每阶段作者说了什么，再沿行比较各栏位的换装，点格子看中英词缀，确认待核对项，最后下载。

FIRST VIEWPORT：顶部一行构筑标题、阶段数、待核对计数与唯一的金属主按钮“下载中文 .build”；其下是一条横跨全宽的旧铜阶段带，每列列头写阶段名、等级段与作者备注摘要（可展开全文）；列头下是栏位行（武器、副手、头盔……），左侧固定栏位名，各列格子写中文装备名与英文名，相对上一阶段有变化的格子标“换”，格内词缀默认收起成一行摘要；技能与天赋摘要在装备行下方，天赋按名称合并计数（如“属性 ×62”）。签名动作：悬停或聚焦某栏位行时，整行跨阶段高亮，换装处的铜色刻痕连成一条线。

FORM：阶段并排对照（候选第 7 位，由抽签选出，用户锁定），seed key 0f332bf8。

FINISH：unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## 待决

- 单个文件时如何分列：按装备等级段自动切分，还是退化为单列阅读视图。
- 阶段多于 3 个与手机宽度下的横向滑动方式（列头吸顶、阶段切换条）。
- 与左侧“文件”栏的关系：多文件即多阶段时，文件栏是否并入阶段带。
