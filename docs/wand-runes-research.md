# 法杖专属符文与符文间增效

核对日期：2026-09-18。v124 接入11种独立主效果；本页区分已有实现与下一阶段的增效、容量边界。国服真机复制文本仍待验收。

## v124 的依据与边界

沿用已登记固定 MIT PoB2 提交 ce566eac45ea8a86477f513c7ee65a1ebe60014e 的 ModRunes 与 ModScalability。主效果、逐数字增效、部位、名称限量和 Aldur's Legacy 共享组均来自该快照，具体记录见 wandRuneData.ts。绑定元字段参与身份核对，但不意味着角色已经解锁绑定效果。

11种分支包括 Assandra Wisdom、Saqawal Sky、Fenumus Agony、Thane Girt Wildness、Desperation、Obsession、Decay、Reach、Lifesprig、Adonia's Ego 与 Cursecarver。作用对象与条件完整保留；Thane Girt 的投射物数量2不可缩放，Reach 的负作用可以缩放，Obsession 无数字效果不能擅自改写。未知角色伤害、技能等级总和或结界恢复不被伪装为本件面板。

[固定 Item.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Classes/Item.lua)的1522–1596行按属性模板寻找孔内组合，再核对组合总值；这支持区分文本行与孔内身份。v124 对能同时出现的 Assandra / Lifesprig 同属性法术等级，以及无限量 Desperation 同条件穿透，允许拆行或合并显示；其他专属行保留逐行核对。零值和前导零不能借合计为零而被忽略。临时读取文件 SHA-256 为0ca39961256eefc960da7b30b4e5cb6eb45d08037aa72bc751201cc0630af2a4，与此前符文锻造调研读取一致；第三方源文件不入库。

## Runeseeker 下一阶段

固定记录 Legacy of Runeseeker's Call 是 wand 分支、localMod true、75%提高镶嵌符文效果，且与三种遗产共用限量1。该75%行的 scalability 明确为 false，不能将它作为普通可缩放数字继续放大，更不能凭“增效”两个字建立无限递归。

同一 Item.lua 的2213–2225、2819–2835行区分所有增幅物、符文和魂核三种增效来源：符文加上通用与符文专用两项，魂核不加符文专用项。下一阶段应把倍率绑定到实际孔内物类型，不能将 Rune 专用75%无条件传给所有增幅物或未来魂核。

结合已有君王20–30%与固定整数缩放，下一阶段的模型算例为：

| 君王效果 | 符文合计提高 | Serle 额外后缀 |
| --- | --- | --- |
| 无 | 75% | 1 |
| 20% | 95% | 1 |
| 25% | 100% | 2 |
| 30% | 105% | 2 |

这些是固定数据模型推导；[原作者 Belton 的讲解](https://www.youtube.com/watch?v=Tt7DBsX36dc)及其画面边界已记录于[特殊容量研究](special-capacity-runes-research.md)，不是本项目当前版本真机验收。

实现前仍须同时处理：现有缩放入口的100%上限、Serle 的第五后缀与八组总容量、神圣全组掷值、目标及条件数量限制、完整未来和旧版门禁、文本来源中的合并数值。不能只提高全局上限或解锁一项下拉选项。移除或减弱增效后已有超额词缀如何保留，继续与“当前新增容量”分开核实；不擅自删词缀。

[CoE公开更新说明](https://beta.craftofexile.com/changelog)只作符文子类别与导入后继续模拟的流程对照，未读取其实现、数据或权重。以上主效果模型均不提供游戏随机分布。
