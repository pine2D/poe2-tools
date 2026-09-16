# 重生与结界提高符文机制核对

核对日期：2026-09-16。来源沿用 MIT PoB2 固定提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e`；当前目录的游戏版本未知，结论是快照估算，国服实际复制文本与游戏取整仍待真机验收。

## 效果与计算

[ModRunes.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModRunes.lua) 中四档 Rebirth 的普通 armour 分支分别每秒再生最大生命 0.35／0.4／0.45／0.5%，为非本地效果；Warding Rune of Reinforcement 普通防具分支提供本地结界提高 20%。只开放这五种身份，不挪用 Bonded 或其他特殊符文能力。

[ModScalability.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModScalability.lua#L12599) 将重生标为 `per_minute_to_per_second_2dp_if_required`。[ItemTools.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Modules/ItemTools.lua#L45) 45–56、246–249 行与 [Common.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Modules/Common.lua) 的取整规则交叉核对：显示值乘 60 恢复内部整数，增效后截断，再除 60 并按两位小数显示。每枚先缩放后合并，不能先求和再取整。

| 档位 | 内部整数 | 恐惧 60% 增效后的整数 | 显示百分比 |
|---|---:|---:|---:|
| 次级 | 21 | 33 | 0.55% |
| 普通 | 24 | 38 | 0.63% |
| 高级 | 27 | 43 | 0.72% |
| 完美 | 30 | 48 | 0.8% |

汇总使用百分之一显示单位的整数运算，避免浮点尾差；只展示本件百分比贡献，不估算角色最终每秒生命。增效缺少正确来源或格式声明时保留未知，不套用整数符文规则。

结界提高依据 [Item.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Classes/Item.lua#L2577) 与 ModParser 的本地 INC 规则，与已有本地提高相加，再独立乘品质。锻造信徒袖带基底134、完美结界平值30、提高20%、品质20%得到236；恐惧增效使平值48、提高32%，得到288。无结界基底及平值时，提高符文本身不生成结界。恐惧与结界合金均属工艺，不用两者共存作为合法操作示例。

## 来源审计

现有目录构建新增普通 augment 行的缩放声明匹配，原 2988 条保留，新增492条，共3480条；缺失由271增至288，新增17条未匹配项保持未知。其他目录字段不变，不引入新数据源。

| 文件 | SHA-256 |
|---|---|
| ModRunes.lua | `d3dac48143209d7d9a02a8c03bd86f21604a0961a8ced49290d6a1d243f8223a` |
| ModScalability.lua | `c0e4edaf1ea37c7bec331747f6a3bd91f21e32d302e4214a4512c790a58b1db9` |
| ItemTools.lua | `24e114bc64d8e213d4ed970c34fa013088e7b298050c65055c179a0b5f302973` |
| Common.lua | `c3ad9c12e43a59a36277bb192aa4050ec65e903d18d49f4e93bd3bf0558850cb` |

复用已有自有缩放函数，不复制第三方实现。v84 保存全部历史、孔位声明、未执行条件指引及真实材料报价；旧版本拒绝新能力。继承锻造签名要求，但纯符文项目不强制加载锻造关系表。交互继续沿用现有预览、取消、应用、撤销和逐步费用，CoE 仅作流程参考。
