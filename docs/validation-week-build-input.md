# 英文 `.build` 装备备注的括号范围

2026-11-27。两服自动回归已通过。玩家实际使用情况记为**部分完成**。公开证据可追溯到导出器与软件自测，尚无可归属玩家的公开 `.build` 原件。既有 13 份私有样本只由宿主匿名验证，本记录不计入其结果。游戏内加载和显示待验收。

## 公开来源与本地复现

DotBuildExporter 的 MIT 实现在装备槽备注中写入基底名、独立标题 `Stat Priority`、连字符分隔线和 `N. 词缀`。同一提交的 CLI 自测明确断言过滤后的第一条词缀是 `Has (1-3) Charm Slots`。过滤器剔除装备元数据后保留这条正文。[导出格式](https://github.com/NickWeder99/DotBuildExporter/blob/4117e78e151616b65dfcf3c5b0a6b2925f2c0e54/src/PobToDotBuild/Converter/Converter.cs#L303-L325) · [CLI 自测](https://github.com/NickWeder99/DotBuildExporter/blob/4117e78e151616b65dfcf3c5b0a6b2925f2c0e54/src/PobToDotBuild/Cli.cs#L879-L894) · [词缀过滤器](https://github.com/NickWeder99/DotBuildExporter/blob/4117e78e151616b65dfcf3c5b0a6b2925f2c0e54/src/PobToDotBuild/Pob2/ItemsSection.cs#L62-L85)

按该排列自写一份三行装备备注。第一行采用公开自测记载的短语，后两行独立编写。用改动前的 `d590609` 和入库的 0.5.5 两服词典运行，两服均命中 0/3，标题和三条词缀均保留英文。旧解析将括号里的两个端点拆成两个占位符。修复后各命中 3/3，编号沿用输入。

| 编号行正文 | 国服 zh-CN | 台服 zh-TW |
| --- | --- | --- |
| `Has (1-3) Charm Slots` | `具有 (1-3) 个咒符栏` | `有(1-3)個護符欄位` |
| `(1-3) Charm Slots` | `咒符栏 (1-3)` | `(1-3)護符欄位` |
| `+(14-28) to maximum Life` | `+(14-28) 生命上限` | `+(14-28)最大生命` |

带 `Has` 的单数模板在国服对应 `implicit.stat_1416292992`，台服对应 `explicit.stat_1416292992`。无 `Has` 的模板在两服均对应 `explicit.stat_2582079000`。复数回退只使用各服核对过的对应词条。

## 生效条件与反例

- 编号后的完整英文词缀须唯一命中。括号内两个非负整数或小数由一个半角连字符直接相连，左端点须小于或等于右端点。回填使用原串，保留括号、小数位、前导零及外部正负号。多占位词条沿用各服声明的顺序。
- `(3-1) Charm Slots`、`+(14--28) to maximum Life`、`(1-3) Charm Slots while moving` 和两服都存在重名模板的 `(4-6)% increased Armour, Evasion and Energy Shield` 保留英文。整行或整段包在标记内可翻译。标记切开范围词缀时保留原文。
- 装备槽的 `Stat Priority` 须独占一行，下一行是至少三个半角连字符组成的分隔线，随后的连续编号行中至少有一条能命中词典。满足这些条件时标题译为“词缀优先级”或“詞綴優先順序”。孤立标题、普通描述及编号待办清单保留英文。双语导出在标题及命中词缀下保留原文，再次导入同一模式得到相同内容。

用 pnpm 11.21.0 运行 `pnpm test packages/build-core/src/publicBuildInput.test.ts`，14 项通过。用例从两服实际词典加载数据，经 `.build` 解析、翻译和序列化核对输出、未知字段、标记及词条 ID。连同构筑工作区与合成语料覆盖率回归，共 37 个文件、363 项通过。[自造正反例](../packages/build-core/src/publicBuildInput.test.ts) · [网站预览行对齐](../apps/site/src/features/build-l10n/preview/rows.test.ts)
