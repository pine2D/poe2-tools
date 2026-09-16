# 符文原孔升级核对

日期：2026-09-16。当前实现依据固定目录与公开使用记录，游戏实测待验收。

## 可确认的路径

固定 MIT PoB2 提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e` 的 [ModRunes.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModRunes.lua#L5804) 声明 Masterwork Rune 对 weapon、armour、caster 提供原孔符文升级效果。SHA-256 为 `d3dac48143209d7d9a02a8c03bd86f21604a0961a8ced49290d6a1d243f8223a`。普通元素等符文在目录中分别为 wand、staff 分支，升级材料对应 caster，不能要求完全相同类别字符串。

[PoE2DB 说明](https://poe2db.tw/us/Masterwork_Rune)指出材料施用于已经放入分档符文的孔。[2026-06-02 玩家使用记录](https://www.pathofexile.com/forum/view-thread/3944462)描述 Greater 升为 Perfect；[2026-06-30 特殊孔问题报告](https://www.pathofexile.com/forum/view-thread/3979498)另记录普通装备中升级 Greater Mind 后萃取，再放入角色孔的过程。后两项是第一手社区证据，不能标成 GGG 官方规则或本项目真机验收。

当前明确列出15家族：Desert、Glacial、Storm、Iron、Body、Mind、Rebirth、Inspiration、Stone、Vision、Robust、Adept、Resolve、Ward、Charging。只在两端均为本工具支持的同类别 Rune 时提供 Greater→Perfect，不将所有 Greater 名称机械改写。Greater Tempered 无对应完美档，拒绝升级。材料只计一枚 Masterwork，孔内结果身份为对应 Perfect；后续覆盖和萃取沿结果身份处理，不能再计一次完美符文购买成本。

## 边界

低档每次升级的档数、腐化／净化装备、角色特殊孔尚未充分核对；目录中的可镶嵌标志不等于升级动作能在这些位置执行。普通传奇仍按用户范围只作对比。空孔、未知孔、绑定／特殊符文、已完美与未揭示亵渎不执行升级。价格缺失保持未知。

完整目标仍包含上述未支持范围，v85不是全制作系统完成标志。升级前后身份保存在操作内，完整未来步骤也重放；旧v2–v84拒绝动作、未执行指引与仅材料报价，防止旧语义静默接受新能力。

## 交互参考

本次重读 [Craft of Exile 更新说明](https://beta.craftofexile.com/changelog)：近期增加从当前制作设置进入模拟、按条件停止、逐步统计；本项目继续复用预览→应用→费用→撤销及条件制作入口。不复制其代码、权重或配方。官网有简体语言入口，但不据此认定国服高级装备文本已兼容。
