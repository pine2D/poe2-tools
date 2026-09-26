# 法器独立护盾百分比英文基线（2026-09-26）

状态：原站英文基线已核对，扩展中文填入尚未放行。运行版本仍0.1.105。使用无扩展的独立Linux Chrome151会话，仅操作CoE Beta／PoE2／English公开导入、装备高级显示和原生Export。样本为本项目自造，不是用户装备或原站数据库。

## 等阶与范围差异

首个试探输入60(51-65)% increased Energy Shield、Tier 1，原站没有拒绝，而显示Fearless／Tier 4／60(56-67)%，导出为LocalIncreasedEnergyShieldPercent4=[60]。因此导入成功不能证明输入等阶和范围被保留。本次不推导全部档位，也不根据这次校正允许任意范围。

随后改用Tier 4和56–67范围重新导入，魔法一前缀与稀有三词缀两组公开高级显示及原生导出通过：

| 结构 | 身份及数值 | 公开属性 |
| --- | --- | --- |
| 魔法单前缀 | LocalIncreasedEnergyShieldPercent4=[60] | 护盾67 |
| 稀有两前缀一后缀 | LocalIncreasedEnergyShieldPercent4=[60]、LocalIncreasedEnergyShield5=[40]、LightningResist3=[18] | 护盾131 |

两组基底Metadata/Items/Armours/Focii/FourFocus9、物等86；稀有附加词缀高级显示为固定护盾40(36–41)／T6、闪电抗性18(16–20)／T6。英文稀有样本最初使用占位名称Shining，原站显示Radiating，入库名称同步为公开显示；身份与数值核对来自上述原生导出，不以名称猜身份。

## 交付与后续边界

fixtures/focus-percent-{magic,rare}-{en.txt,zh-CN.txt,native.json}保存两组输入及原生输出。中文样本为依据现有独立国服词典构造的待验收文本，不能当作已通过中文导入。原生JSON仅按Biome格式化，解析后与剪贴板导出相等。

后续实现需要仅对已确认的独立词缀等阶／范围放行，并区分既有护盾＋魔力复合词缀；测试错误等阶、范围、分组和重复身份。最终包必须走中文预览→回填→原生导入→导出，与本次英文基线比对。其他等阶、复合＋独立百分比并存和其他基底尚未验收。

本轮无运行代码修改，无新数据源；沿既有CoE公开UI人工观察与自造样本登记。执行样本结构比较、全仓Biome及diff检查，未重复代码测试或打包。
