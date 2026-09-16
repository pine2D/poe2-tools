# 结界符文机制核对

核对日期 2026-09-16。本阶段使用现有 MIT PoB2 固定提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e`，不引入同行代码或数据。游戏版本未知的目录快照不能等同当前游戏实测。

## 普通防具效果

| 家族 | 次级／普通／高级／完美 | 本地效果 |
|---|---|---|
| Ward Rune | 最大符文结界 +15／20／25／30 | 是 |
| Charging Rune | 结界再生率提高 8／12／16／20% | 否 |

八条均为 armour 分支，普通效果与 Bonded 分别声明。名称及两服文本沿用既有官方静态名称和独立翻译表。公开 [Ward Rune](https://poe2db.tw/us/Ward_Rune) 与 [Charging Rune](https://poe2db.tw/us/Charging_Rune) 页面只作 gray 人工核对，不采集新数据表。

## 计算依据

固定 [Item.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Classes/Item.lua) 2568、2577–2592 行以基底 Ward 缺失为零，加本地平值后，乘本地提高与独立品质，最终四舍五入。因此无原生结界防具也能因符文获得结界。钢铁符文只作用原三项防御，不能增加结界。

固定 [ModParser.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Modules/ModParser.lua) 186 行将再生提高映射 WardRegen，247–249 行另将最大值映射 Ward；不能混为一个属性。再生提高只展示本件镶嵌贡献，不推导角色每秒再生。

Item.lua 1527–1543 行先逐枚增效再合并。沿用已登记正整数向下取整模型，恐惧 60% 将 Ward 四档变为 24／32／40／48，Charging 变为 12／19／25／32%。两枚次级充能应为 12+12=24%，不能先合计再取整成25%。源文件哈希与既有符文锻造研究一致。

独立算例：普通信徒袖带镶完美 Ward、品质20，结界为36；锻造信徒袖带基底134、符文30、本地提高30%、品质20，结界256；改用恐惧工艺（不与结界合金工艺共存）后符文变48，结界218。只有充能符文不新增最大结界。

## 交互参考与边界

本次重新阅读 [CoE PoE2入口](https://beta.craftofexile.com/?game=poe2) 与[更新说明](https://beta.craftofexile.com/changelog)，参考当前装备连续制作、条件路线、撤销和逐件成本展示，不复制其代码、配方或权重。页面语言入口目前显示“简体中文”，但仅凭入口不能证明国服 Ctrl+Alt+C 高级文本兼容，仍以本工具实际导入回读验证为准。

国服实际复制格式、游戏取整、重复镶嵌与增效行为仍待真机验收；合成三语测试不能替代实机。特殊 Warding Rune、Bonded、角色依赖效果另行核对，完整目标保留其范围。
