---
version: 1
slug: "apps-site-src-pages-home"
primary_target: "apps/site/src/pages/home"
related_targets: []
---

# 首页

范围：`/` 首页。模式：Persuade（两件工具的分流入口）。

用户与任务：国服、台服玩家第一次来，要在一屏内弄明白这两件工具分别解决什么，并按自己手头的情况进入其中之一：拿到英文 `.build` → 构筑汉化空态；在 Craft of Exile 做装 → 扩展介绍页。

约束：两个入口等重（同款 pt-btn，尺寸与位置镜像）；首屏证明用真实界面片段＋自造示例数据并标“示例”，不称截图、不放第三方攻略内容；不像营销落地页（无光晕、无空洞卖点）；1440×900 首屏内可完成选择，平板与手机上两个入口在首屏内；与构筑工作台同一视觉语言；扩展能力描述不得超过 compatibility.md 已验收范围（“部分装备……支持范围见介绍页”）；删除“本次站点更新”。

## Direction contract

THESIS：首页本身就是一次中英对照：同一水平线上，左边英文词缀被译成本服中文，右边中文搜出英文名，两件工具在中缝的符文菱结处汇合。拒绝的默认做法：居中标题下一排同等卡片、或左文右图的分栏 hero。

OWN-WORLD：暖炭底，唯一的金属重点是包住对照带的一扇 pt-frame 与中缝放大的菱结；带内是 L0 的阶段看板片段（新／换标记）与扩展 L1 候选浮层的真实样式；放大行用 `--fs-title`，英文词缀蓝、中文 ink；衬线只用于 hero 与两个场景句（经 ui-theme 组件类）。

STORY：访客先读一句“少查译名，多研究构筑。”，横向扫过对照带就明白两件工具各做什么，再按自己的情况点左端“打开构筑汉化”或右端“安装中文助手”。

FIRST VIEWPORT：页头下一扇金属框；框内顶部居中 hero 一句与一行说明；其下两个场景句分立左右两端（各带两行说明）；中部是一条通栏 inset 对照带：左半为阶段看板片段（31–60 级／终局，戒指2 红玉戒指 → 换 蓝玉戒指，展开两行中英词缀，“+60 to maximum Life → +60 生命上限”放大），右半为扩展候选浮层（“水晶”→“水晶法器 → Crystal Focus”放大选中），两条放大行基线对齐，中缝竖铜线与 72×28 菱结；带下左右两端各一个同款 pt-btn 与两三条事实。≤1099px 时先放两组“场景句＋按钮”，示例带移后。签名动作：两条放大行在同一水平线上互为镜像，菱结居中把它们连起来。

FORM：对照长带（用户在三版样稿中锁定 B；抽签种子 b55149f0，B 为替补进入的第 2 位候选），样稿 2026-10-03-home-b.html，本地留存。

FINISH：unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## 已决（二期 0.8.0 落地）

- DESIGN.md 已登记：首页金属主按钮为“无”，注意力落点为对照带，pt-frame 包住对照带（1 扇 4 角饰）。
- 场景句与看板片段阶段名的衬线文案已进 `shard0-text.txt`，首页单分片预算 122,880 字节由测试守住。
- 场景句放大改由 ui-theme 组件类 `.pt-subhead--lg` 提供。
- 候选浮层示意在 `src/shared/styles/l1-demo.css` 复现，只用令牌取值。
