# 技能变体项链核对

核对日期：2026-09-17。此节点改进目录展示，制作规则与项目格式仍为 v101；三种项链的特殊制作尚未开放。

## 已确认的目录含义

使用 `docs/data-sources.md` 已登记的 PoB2 MIT 来源，固定提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e`，文件 [src/Data/Bases/amulet.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/Bases/amulet.lua)。对应数据已在制作目录中，无新增抓取数据或生成物。

| 基底 | 共同固有属性 | 技能候选数 |
| --- | --- | --- |
| Lament Amulet | 前缀上限 -1 | 37 |
| Portent Amulet | 后缀上限 -1 | 7 |
| Absent Amulet | 前缀、后缀上限各 -1 | 7 |

来源的 `variantList` 与 `{variant:n}` 逐项对应。这些技能是互斥变体，不能把全部候选视为装备同时授予的技能。来源同时声明 `grantedSkillsHaveNoReservation=true`；不能由此反推其他技能材料的资格。

网页将共同固有行与技能候选分开，默认不选技能。用户可逐项查看已有译文和英文等级范围，完整来源仍可展开核对。编号重复、缺项、未知标记、技能名错配或范围异常时不生成候选展示，继续保留原文。查看候选不会创建装备、改写导入文本、声明最高等级或增加历史及费用。

## 参考范围与证据缺口

[Craft of Exile 公开更新日志](https://www.craftofexile.com/changelog)在 2026-06-11 列出这三种项链的支持，用于确认功能差距；未使用其实现、目录或概率数据。

本轮还核对了 [GGG 0.5.0 更新说明](https://www.pathofexile.com/forum/view-thread/3932540)的 Genesis 珠宝制作内容，并查看 [PoE2DB 的 Lament Amulet 页面](https://poe2db.tw/us/Lament_Amulet)作为线索。页面列出的可出现稀有度不能证明魔法装备如何计算负容量；无精确规则时不能直接采用 `1 - 1` 或假定只影响稀有装备。

继续实施前须确认：

- 普通、魔法、稀有品质的容量计算，以及升级品质时的转移规则。
- 起点如何选择、锁定并从中文技能区块唯一识别变体，保存恢复是否保留原始身份。
- 催化剂、精华、骨骼、合金、腐化与技能材料的具体适用范围；不能删除一个入口限制后全部默认开放。
- 技能变体生成或重选的途径与概率来源；目录顺序与候选数量不能用作概率。

展示层已确认的目录语义与待确认的制作行为分开推进。用户没有催化剂样本或相关实测经验，不依赖再次索要样本推进。
