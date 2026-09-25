# 2026-09-18 副手雕像与格挡核对（实施前登记）

沿已登记 MIT PoB2 固定提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e` 的 ModRunes、ModItem、ModScalability、Bases，以及同提交 [Classes/Item.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Classes/Item.lua#L2597) 核对副手本件格挡。只阅读规则并独立实现，不引入源代码或新数据包；本件格挡使用本地加值与提高之和，最后向下取整，品质不参与。Ox 的 shield/buckler 本地标记与显式本地格挡一致；Silk shield 保留伙伴条件，不计入无条件本件格挡。固定源 Silk buckler 正常显示行缺失，继续不开放，不能用绑定文本替代。真机面板取整待验收。

再次只读 [Craft of Exile PoE2](https://beta.craftofexile.com/?game=poe2) 的演练、条件步骤、库存和自填价格设计说明；仅作功能参考，不获取同行代码、数据、权重或价格。

# 2026-09-17 胸甲雕像与绑定核对（实施前登记）

沿既有 MIT PoB2 固定提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e` 的 ModRunes、ModScalability 与同提交 [Classes/Item.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Classes/Item.lua) 核对本件 Idol 绑定激活、独立绑定显示及增效；新增提取已有源中的镶嵌绑定和完整换行缩放声明，不新增网络数据适配器。PoE2DB 的 [Fox Idol](https://poe2db.tw/us/Fox_Idol) 与 [Carved Cunning](https://poe2db.tw/us/Carved_Cunning) 仅人工交叉核对（gray），不复制同行实现或整表。国服原生绑定标题与客户端行为待真机验收。

# 2026-09-17 头盔与鞋部雕像核对（实施前登记）
沿用已登记固定 MIT PoB2 ModRunes／ModScalability 与普通、已核对锻造防具目录。16条独立分支为头盔10、鞋6；公开 [Carved Mischief](https://poe2db.tw/us/Carved_Mischief)、[Carved Tenacity](https://poe2db.tw/us/Carved_Tenacity)、[Carved Cunning](https://poe2db.tw/us/Carved_Cunning)、[Egrin](https://poe2db.tw/us/Idol_of_Egrin)、[Stag](https://poe2db.tw/us/Stag_Idol)、[Grold](https://poe2db.tw/us/Idol_of_Grold)、[Yeena](https://poe2db.tw/us/Idol_of_Yeena)、[Oak](https://poe2db.tw/us/Idol_of_Oak) 仅人工交叉核对，不引入其数据文件或价格。固定 ModScalability 的鞋部 Cunning 持续时间未声明毫秒格式，沿该快照整数缩放模型；不借手套 Majesty 的毫秒精度补值，游戏实际显示仍待验收。Grold通用使用提示与Boots效果标题不一致，按固定目录及效果标题核对部位，不据通用提示扩大权限。胸甲Bonded激活、断行缺元数据与副手空记录另行核对。

# 2026-09-17 手套雕像核对（实施前登记）
沿用已登记固定 MIT PoB2 `ModRunes.lua` / `ModScalability.lua` 及普通手套目录，不新增抓取适配器或第三方数据文件。人工核对 PoE2DB 的 [Carved Majesty](https://poe2db.tw/us/Carved_Majesty)、[Carved Mischief](https://poe2db.tw/us/Carved_Mischief)、[Carved Tenacity](https://poe2db.tw/us/Carved_Tenacity)、[Snake Idol](https://poe2db.tw/us/Snake_Idol)、[Sirrius](https://poe2db.tw/us/Idol_of_Sirrius)、[Kraityn](https://poe2db.tw/us/Idol_of_Kraityn) 公开说明，只作 gray 交叉证据；9个手套分支保持独立，三种 Carved 共用 AncientAugment 限量1。持续时间是否增效按既有逐占位来源，不以文本中出现数字推断。CoE 公开路线图用于流程参考，不使用其实现、数据或权重；国服原生文本和精度仍待游戏验收。

# 数据源登记表

## 专属攻击武器符文（2026-09-17，v108实施前登记）

沿用固定 MIT PoB2 ce566eac45ea8a86477f513c7ee65a1ebe60014e 的 ModRunes.lua、Item.lua、ItemsTab.lua 及数值缩放元数据；新增人工解析依据 [ModParser.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Modules/ModParser.lua)，SHA-256 c31136162c8987f0b77bc523d63818b5accf4d2ee849224e64b2c9ad82f65d26。仅临时读取代码并自写规则，不新增抓取适配器或来源数据文件。固定解析链将 Vital Flame 第一行映射为无条件 FireMin/Max，由 Item 本地武器计算消费；第二行为 HybridManaAndLifeCost_Life，保持技能费用效果。未运行 PoB 或真机，不把静态源码结论写成客户端实测。

PoE2DB 的 [Vital Flame](https://poe2db.tw/us/Rune_of_Vital_Flame)、[Animosity](https://poe2db.tw/us/Ancient_Rune_of_Animosity)、[Amor Mandragora](https://poe2db.tw/us/Legacy_of_Amor_Mandragora)、[Spiteful Floret](https://poe2db.tw/us/Legacy_of_Spiteful_Floret)按既有 gray 人工机制来源读取完整效果与限量说明。四个魔符分支、Vital Flame 两个锤分支及两个 Legacy 共享 Aldur 限量均来自既有固定声明；不采用页面配方、行情或权重。宽泛 canSocket 标志不扩展到角色孔、首饰、传奇或圣化。CoE 公开路线图的效果变化、费用、完整历史与导入导出用于交互参考，不取其代码或数据。


## 普通魔符（2026-09-17，v107实施前登记）

[GGG 0.4.0](https://www.pathofexile.com/forum/view-thread/3883495)确认 Talisman 是用于变形攻击的双手攻击武器，形态可切换；[GGG 0.4.0b](https://www.pathofexile.com/forum/view-thread/3890041)确认重组相关修复。普通基底及材料映射沿用已登记固定 MIT PoB2 提交 ce566eac45ea8a86477f513c7ee65a1ebe60014e；Bases/talisman.lua 的 SHA-256 为 4e721181ba512ab359a9b1b5e5afa4a8c6666332dbbad1d2f3432243fe8d8191。没有新数据包。

PoE2DB [英文魔符](https://poe2db.tw/us/Talismans)、[简中魔符](https://poe2db.tw/cn/Talismans)、[繁中魔符](https://poe2db.tw/tw/Talismans)、[首领魔符](https://poe2db.tw/cn/Alpha_Talisman)、[巧匠石](https://poe2db.tw/us/Artificers_Orb)及[远古颚骨](https://poe2db.tw/us/Ancient_Jawbone)仅作已登记 gray 人工机制参考。三服形态描述存在差异，不互相补齐，不从物品类别推定形态或技能。双手孔位上限沿现有通则映射，属于规则推断，国服真机待验收；不使用页面行情或权重。

CoE 公开 Two-Handed Weapon → Talismans 页面显示基底、物等、词缀查询及通货／精华／亵渎／镶嵌分组，仅参考交互。未读取同行执行代码、数据文件或概率。25 普通基底与六种隐藏／锻造身份分开；三档 Infinite 精华缺失结果声明，魔符专属符文、形态技能及符文锻造继续不推定。


魔符专属增幅的后续审计发现：固定提交 Item.lua:2178–2201、2762–2807 将各条符文文本解析并加入通用词缀列表，2514–2516 再按本地标志计算火焰平值；Item.lua 不读取 `localMod`。因此该字段不能证明 Rune of Vital Flame 的火点伤属于全局效果。当前尚未开放这四种专属增幅，执行范围不变；进一步的逐条语义确认留待下一节点。

## 药剂独立来源（2026-09-17，v106实施前登记）

药剂使用说明补充核对：PoE2DB [简中](https://poe2db.tw/cn/Ultimate_Life_Flask)、[繁中](https://poe2db.tw/tw/Ultimate_Life_Flask)、[英文](https://poe2db.tw/us/Ultimate_Life_Flask)页面的水井充能提示（gray，2026-09-17读取）。只将准确说明分类为描述，不从网页面板推算导入品质；客户端高级复制格式仍待真机验收。

沿用MIT PoB2固定提交ce566eac45ea8a86477f513c7ee65a1ebe60014e，新增[ModFlask.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModFlask.lua)，SHA-256 d50d074c1b7e0a57c164b7c49add1670d90ba806a25d946467e4ca7af9feb350。78条声明先验证，67条有生成资格，11条全零禁用保留排除审计；default=1仅在药剂来源域内解释为资格，不是概率。已有Bases/flask、Item.lua、ItemsTab.lua同提交用于基底、魔法1前1后/禁止rare以及本件恢复/充能估算，不采用sourceQuality默认值作为用户品质。

[Flask Wiki](https://www.poe2wiki.net/wiki/Flask)与[Dreamcore药剂指南](https://mobalytics.gg/poe-2/guides/flasks)（2025-09-25）经Exa读取，按gray人工机制参考交叉核对类别与条件效果，不复制全文或第三方装备。已登记PoE2DB的Perfect Transmutation、Greater Augmentation、Annulment、Divine、Glassblower物品说明再次读取；只用材料资格文字，不使用行情、概率或配方权重。CoE公开Life Flasks界面用于交互参考，未读取代码/数据；其中Vaal入口与PoB模型字段不能单独解决游戏腐化行为。逐颗品质、腐化、条件角色收益及国服原生格式仍待核实，无浏览器外站请求或客户端解包。


## 技能项链已有催化品质（2026-09-17，v105）

沿用已登记 [Vaal Catalysing Infuser](https://poe2db.tw/us/Vaal_Catalysing_Infuser) 的 gray 材料说明，以及下文两位原作者的项链流程。Exa 本轮提取仍明确戒指／项链可超过最大品质至多10；网页阅读正文只取得元数据，不能将其写成完整提示框已核验。原作者记录了裂隙品质前缀、40%催化、注能至50%后继续制作；不采用费用、概率或单颗增量。

三种严格技能项链的已有量上界由普通20、可信裂隙规则20和注能超出10共同限定；这是材料规则与直接案例的结合推导，不冒充三种基底全部真机实测。当前可提升上限仍按实际词缀单独判断。没有新增品质材料动作、来源抓取适配器、玩家样本或运行时外站请求。

## 技能项链等级制作（2026-09-17，v104）

沿用已登记 Perfect Flux 材料身份和说明。新增 gray 第一手人工规则参考：[Nabeezy 的失神项链流程](https://www.reddit.com/r/PathOfExile2/comments/1uhj7sf/only_one_thing_left_to_do/)（2026-06-28，步骤1/16）与 [aspirineilia 的 CoC 项链流程](https://www.reddit.com/r/PathOfExile2/comments/1uch6gj/finally_got_6_all_spell_coc_amulet/)（2026-06-22，步骤4及作者回复）。本轮直接读取原帖正文，作者分别记录完美溶剂升级20级和工匠石设五孔；未逐帧验证实际施用，不替代游戏真机验收。

只据此交叉核对单技能项链适用与等级/辅助孔独立；不采纳费用、概率、催化增量或其他制作步骤推断。不提交玩家装备、图片、评论全文或第三方数据；没有新抓取适配器或运行时外站请求。

## 技能项链辅助孔（2026-09-17，v103）

沿用下文 primary [GGG 0.5.0](https://www.pathofexile.com/forum/view-thread/3932540)（Item Changes，装备授予技能及全部技能作用范围）、[0.2.0](https://www.pathofexile.com/forum/view-thread/3740562/filter-account-type/staff)（直接设定孔数），以及固定 MIT 基底目录。三种项链的 variantList 是互斥候选，实际装备只选择一项；不将该列表视为同时授予多个技能。

重新读取 [CoE 公开更新日志](https://beta.craftofexile.com/changelog)，其中手动修改装备孔数的说明没有在所读文字中证明是技能辅助孔，故不用于本规则推导。仅作 gray 产品体验对照，不读取代码、目录或权重。检索命中的第三方攻略存在仍要求逐档升孔的旧说法，不采纳。无新增适配器、运行时外站请求或数据快照；只保留自写结论。
## 技能变体项链（2026-09-17，v102）

沿用固定 MIT PoB2 提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e` 的 `Bases/amulet.lua` 及已登记 [Item.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Classes/Item.lua#L1750)。前者提供三种基底的候选技能与容量修正，后者用于核对魔法和稀有品质的容量计算；临时文件 SHA-256 为 `0ca39961256eefc960da7b30b4e5cb6eb45d08037aa72bc751201cc0630af2a4`，不复制第三方实现入库。

[Craft of Exile beta](https://beta.craftofexile.com/) 按既有 gray 人工体验参考核对公开模拟交互：蜕变、增幅、富豪、点金与满容量崇高的结果组数及动作次数。只保留自行撰写的观察；不读取代码或数据文件，不采用随机词缀、权重、概率或价格。该交叉检查属于工具模型证据，非游戏真机验收。没有新增抓取适配器、生成数据或浏览器外站请求，来源边界见[技能变体项链核对](skill-variant-amulets-research.md)。

## 圣化与装备技能辅助孔（2026-09-17，实施前核对）

v99 实施补充：三档工匠石的直接设孔沿下列已登记官方规则；仅开放现有普通 Wand／Staff／Sceptre 单一带等级固有技能。玩家[普通魔杖尝试](https://www.reddit.com/r/PathOfExile2/comments/1vddoig/talisman_skills_jewellers_orb_not_working/)、[20级仍为四辅助孔](https://www.reddit.com/r/PathOfExile2/comments/1v1mdg1/5_linked_granted_skills_from_items/)与[购入腐化／圣化装备的补孔失败](https://www.reddit.com/r/PathOfExile2/comments/1uezfar/sockets_before_purchase_on_items_skills/)按 gray 原作者经历登记，非官方结论、非本项目真机验收；用于交叉核对孔数独立性及收尾限制，不复制装备、图片或评论全文。辅助孔起点由用户明确声明，缺省未知；不发明原生复制语法，不引入随机权重或浏览器外站请求。

[GGG 0.2.0](https://www.pathofexile.com/forum/view-thread/3740562/filter-account-type/staff)、[0.5.0](https://www.pathofexile.com/forum/view-thread/3932540)与已登记的[0.5.4](https://www.pathofexile.com/forum/view-thread/3975218/filter-account-type/staff)按 primary 公告核对直接设定辅助孔、装备多技能作用范围、按当前数值圣化及特殊镶嵌限制；仅自写摘要，不复制公告全文。

[Lesser](https://poe2db.tw/us/Lesser_Jewellers_Orb)、[Greater](https://poe2db.tw/us/Greater_Jewellers_Orb)经 Exa 核对物品说明，按 gray 人工机制参考，不建立数据适配器。[Perfect](https://poe2db.tw/us/Perfect_Jewellers_Orb)本轮仅取得元数据，五孔结果依据官方 0.2.0 示例。[PoE2 Wiki 预兆条目](https://www.poe2wiki.net/wiki/Omen_of_Sanctification)的倍率和取整仅列为检索线索，未用于数值实现。无明确再分发许可的页面只保留链接和自写观察，不复制数据或权重；详细边界见[制作收尾与辅助孔核对](finishing-and-skill-sockets-research.md)。首次研究时应用为 v98；后续 v99 实施范围见本节补充，没有新增运行时请求。

2026-09-17 v98 面板加权合计只组合既有 `readCraftProperty` 估算与用户自填系数，无新游戏数据源。CoE 公开路线图中的 weighted sum support 仅用于产品流程参照，不读取同行执行参数、权重或代码。缺失面板数据继续传播未知，系数不能用于出现概率或期望费用。

## 多结果精华（2026-09-16，实施前核对）

沿用 MIT PoB2 固定提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e` 的 `Essence.lua`、`ModItem.lua`。本轮另读同提交 [ItemsTab.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Classes/ItemsTab.lua) 的精华列表逻辑，临时文件 SHA-256 为 `3539d5c720b11d869b8e8755ad4e66771c9fae6a746d6a7adaab41d726b249c2`；只核对语义，不将第三方代码入库。该界面跳过没有实际描述的映射，不能作为完整游戏制作结果表。

PoE2DB 的三档 [Enhancement](https://poe2db.tw/us/Greater_Essence_of_Enhancement)、三档 [Infinite](https://poe2db.tw/us/Greater_Essence_of_the_Infinite) 及 [Perfect Infinite](https://poe2db.tw/us/Perfect_Essence_of_the_Infinite) 物品说明按既有 gray 人工机制参考使用；实际读取的七个地址见 [多结果精华核对](essence-outcomes-research.md)。未新增适配器、下载词缀权重或提交原始网页。公开页的需求等级不替换固定目录的生成等级。

[Carnarius 0.5 项链制作原视频](https://www.youtube.com/watch?v=QmyNWhUQ2Ko)（2026-06-07）按 gray 作者第一手讲解登记。本轮读取 Exa 提取的完整转录及章节信息，未逐帧验收；用于核对完美无限精华三种结果及结晶预兆的流程，不采用作者的等概率、价格、催化比例或平均成本估计。字幕、装备及视频不入库。CoE 公开 changelog 仅作为错误反馈、工艺标记与条件流程的参考，不读取实现或数据。

v88 实施补充（2026-09-16）：Serle 使用既有 MIT PoB2 固定目录与官方三服名称，无新增生产数据。可见 trade hash `718638445` 与空文本隐藏总量 hash `1950607759` 同时核对。官方0.5.4补丁继续限制腐化／净化新镶；仅调研重读 CoE changelog、[官方论坛预告讨论](https://www.pathofexile.com/forum/view-thread/3932540/page/116)、[魂核故障帖](https://www.pathofexile.com/forum/view-thread/3962264)及[Game8摘要](https://game8.co/games/Path-of-Exile-2/archives/603444)以排除冲突说法，后几项均不进入目录或操作权重。普通／魔法、全绑定萃取及容量下降保留未获可靠证据，明确保留未核实状态。

## 特殊容量符文（2026-09-16，实施前审计）

v87 实施补充：Astrid 三分支复用上述固定 MIT 目录及已登记三服官方名称，不新增抓取或生产数据。普通单枚双工艺先行接通；合金仍经可整体关闭的 gray 关系表核对。第二组不取消来源、部位、冲突与移除池检查；未确认的双工艺覆盖后保留明确不执行。萃取沿已登记独立摧毁／返还语义，不以存活装备的容量下降解释。没有使用作者概率、费用或同行实现。

沿用固定 MIT PoB2 镶嵌及缩放目录和现有 gray 合金关系表；[GGG 0.5.4](https://www.pathofexile.com/forum/view-thread/3975218/filter-account-type/staff)作为 primary 操作前置证据，禁止向腐化／净化装备新镶列举的特殊符文。[PaintMaster 作者攻略](https://mobalytics.gg/poe-2/profile/paintmaster/guides/recoup-chronomancer-gear-crafting-guide)、[Belton 原视频](https://www.youtube.com/watch?v=Tt7DBsX36dc)、[Fubgun 原视频](https://www.youtube.com/watch?v=xu5UpEE8UP8)按 gray 人工机制参考登记，没有再分发许可，不建立抓取适配器。仅登记链接与自行撰写的证据边界，字幕、视频、图片和装备只作临时核对，不入库。

Belton 的额外 2 后缀结果截图与容量下降讲解分别记录；没有连续移除实录，不能作为本项目真机验收。Fubgun 本轮仅读取自动字幕。官方论坛 [Astrid 提问](https://www.pathofexile.com/forum/view-thread/3952578)与[制作失败报告](https://www.pathofexile.com/forum/view-thread/3966330)也是 gray 玩家陈述，不能反推通用规则。CoE 更新说明仅参考公开流程，不取实现或权重。部位映射、更换后的已有属性、新增容量与绑定孔处理详见 [特殊容量符文核对](special-capacity-runes-research.md)。原审计阶段仅研究；后续实施范围以上述 v87 补充及演练规则为准。

## 防具荆棘与减益符文（2026-09-16，实施前登记）

沿用已登记 MIT PoB2 固定提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e` 的 [ModRunes.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModRunes.lua)。本轮重新核对缓存 SHA-256 `d3dac48143209d7d9a02a8c03bd86f21604a0961a8ced49290d6a1d243f8223a` 与目录来源一致：三档 Tempered Rune、Greater Rune of Tithing／Leadership／Alacrity／Nobility 的 armour 分支均为单行、非本地效果、无数量限制声明。采用既有目录普通效果，`bonded` 保留为来源信息，不施加其附加能力；穿戴需求不解释为物等门槛。

物理及闪电荆棘分别核对伤害两端，不能解释为可选词缀数值范围，也不计入武器 DPS。承伤转换作用于召唤生物，减益消退与感电效果降低各自保留语义；这里只比较装备贡献，不推算角色或召唤生物最终伤害与承伤。恐惧增效沿现有逐枚逐值整数取整模型，实际游戏显示待验收。三服名称及属性沿独立现有词典；不新增数据文件、依赖或浏览器外站请求。

本轮人工打开 PoE2DB 对应符文页，提取正文未包含完整效果段，未用其证明数值或数量限制。CoE 仅作已登记的制作与历史流程参考，不读取或复制执行代码及权重。新能力按 v80 项目保存，旧版起点、导入声明、未来操作及未命中指引都须拒绝夹带。

## 2026-09-16 品质逐颗实验与注能器统计

同日补充读取PoE2DB的四分类注能器物品页与[Quality关键词](https://poe2db.tw/us/Quality)，按既有gray人工机制参考使用；名称与本仓库官方静态词典核对。区分相对当前最大品质的门槛和固定20%说明，记录普通30%／催化60%存储边界的后续影响；未新增抓取适配器、原始数据或执行概率。PoE2 Wiki正文403，Reddit连接器无可用登录后端，未据摘要补齐缺失公式。

[Krydax 原始实验](https://www.reddit.com/r/PathOfExile2/comments/1r4snoi/i_applied_1734_vaal_infusers_to_314_items_so_you/)和 [SpecialistAd670 原始实验](https://www.reddit.com/r/PathOfExile2/comments/1s80jza/i_tracked_750_vaal_infuser_attempts_here_is_what/)按 gray 人工机制参考登记。作者公开的有限汇总用于自写统计核对；玩家实验不是 GGG 保证，也没有证明当前四种注能器共用概率。没有下载或入库原始表格、图片、装备样本、同行实现或权重；未取得完整数据再分发许可，不建立数据适配器。

[2026-08-10 催化种类误用报告](https://www.reddit.com/r/PathOfExile2/comments/1vk8bk4/misclicked_a_neural_catalyst_onto_my_40_caster/)仅作为 gray 第一手自述，记录已有高品质在换种类时被替换的案例。物等与完整逐次记录缺失，不能据单次 2% 结果建立通用材料增量。报告中的求助方案、评论概率与经济建议不作为执行规则。

[GGG 0.5.0 公告](https://www.pathofexile.com/forum/view-thread/3932540)沿用 primary 官方来源。本轮 Web 对带 staff 过滤地址的提取没有返回注能器段落；通过 Exa 读取不带过滤地址的官方正文，重新核对四类材料和至少 20% 品质的说明。完整证据边界、统计复算及接入顺序见 [品质与注能器实验审计](quality-infuser-research.md)。没有改变应用规则、目录版本或国服真机验收状态。

## 2026-09-16 腐烂预兆与多隐藏属性核对

[Vascor 0.5 原始实操](https://www.youtube.com/watch?v=TH17J_-8Ydw)（上传 2026-06-25）及 [PoE2DB 预兆文本](https://poe2db.tw/us/Omen_of_Putrefaction)作为 gray 人工机制参考，交叉核对既有 primary [GGG 0.5.0 公告](https://www.pathofexile.com/forum/view-thread/3932540)的常规一条亵渎上限。视频画面支持腐化稀有装备保留多个隐藏属性并逐次揭示；不据概述推定预兆被移除，也不据若干样本建立完整数量、侧别或候选算法。完整边界见 [多隐藏属性核对](putrefaction-research.md)。视频、帧图、字幕只留临时目录，不入库；不采集作者售价、利润、权重或装备数据，没有新增适配器或浏览器第三方请求。

腐烂预兆补充核对：取得 [PoE2 Wiki 机制正文](https://www.poe2wiki.net/wiki/Omen_of_Putrefaction)的最大可用容量、破裂保留及排除专属池说明，按 gray 人工规则参考；结合 Vascor 连续揭示画面及 [Mirror Tier 原始实操](https://www.youtube.com/watch?v=N1JwMhKnJxk)核对逐槽处理，不复制其装备、利润或权重。[历史原始异常报告](https://www.pathofexile.com/forum/view-thread/3834236)仅支持远古组合不能直接推定，不能视为当前版本算法。三语材料名已存在于官方 static 生成的 localizedNames，无新增适配器或数据包。

## 2026-09-16 制作步骤清单与权重来源复查

[CoE 路线图](https://beta.craftofexile.com/roadmap)中公开的操作历史、变化、费用明细及模拟导出仅作流程参考。新增清单由本项目已有回放、材料计费、已登记目录及独立简体中文译名生成，没有抓取或复制同行代码、权重或数据，没有新增构建适配器与浏览器外站请求。

本轮 Exa 搜索发现 [pyoe2-craftpath README](https://github.com/WladHD/pyoe2-craftpath)列出 MIT 代码许可，但作者明确说明其词缀权重来自获准使用的 CoE 数据，并标记针对 PoE2 0.4.0 测试。该许可不能直接证明上游权重对本项目的授权与当前版本覆盖；只读说明，没有获取代码或数据文件。RePoE-fork 的客户端导出也不符合本项目禁止入库客户端解包产物的约束，未作为新来源接入。真实权重与概率仍未获得完整可用证据。


### 已有高催化品质与裂隙精华（2026-09-16，实施前登记）

[PoE2 Wiki Quality](https://www.poe2wiki.net/wiki/Quality) 的检索全文（返回修订 oldid=129776）明确裂隙精华增加最大品质 20%，移除该词缀不改变已有品质；直连正文曾返回 403，按已取得的索引正文记录证据。[2026-07-16 制作者原始讨论](https://www.reddit.com/r/PathOfExile2/comments/1uxszex/hey_guys_what_do_i_do_from_here/)有两位参与者描述移除后保留品质，作为 gray 人工交叉参考，不是官方或国服真机保证。程序继续用已登记固定 MIT Essence.lua/ModItem.lua 的材料、类别与完整工艺声明授权；不复制玩家装备或新增第三方数据表。

由此区分已有品质与当前可施加上限，覆盖已支持普通戒指／项链最多 40%、精确裂隙戒指最多 60% 的已有状态及后续制作。未知特殊基底、注能器更高品质仍不推定。同期复查护甲片、磨刀石和催化剂说明仍缺可执行逐颗增量公式，检索存在 PoE1 规则与聚合攻略混杂，未采纳。CoE 公开路线图和更新记录仅作流程参考。

### 腐化收尾指引（2026-09-16，实施前核对）

[CoE 路线图](https://beta.craftofexile.com/roadmap)与[公开更新记录](https://beta.craftofexile.com/changelog)用于核对制作与条件模拟之间的操作衔接，未读取或复制其执行代码、权重或数据文件。本轮沿本表既有瓦尔石及建筑师宝珠规则，把已实现的手选结果接入指引；未腐化、仅一次腐化与二重腐化直接取自已验证状态，不引入概率或新数据源。

同期查阅 [GGG 0.3.0 公告](https://www.pathofexile.com/forum/view-thread/3826682)、[Lolcohol 亵渎指南](https://mobalytics.gg/poe-2/guides/abyss-crafting)及社区的腐化后揭示资料，确认需区分“施加亵渎”与“揭示已有亵渎”；这些概括性资料不足以独立证明当前单占位模型下的全部腐化交错、固定候选及回响交互，本轮保持既有操作范围，不把 CoE 的开放状态当作游戏规则证明。

### 萃取石与返还镶嵌物（2026-09-16，实施前登记）

[PoE2DB 萃取石](https://poe2db.tw/us/Orb_of_Extraction)与[绑定镶嵌物说明](https://poe2db.tw/us/Socket-bound_Augments)作为 gray 人工规则参考：材料摧毁装备并返还其中非 Socket-bound 镶嵌物；绑定镶嵌物不可取出或返还。[PoE2 Wiki 萃取石](https://www.poe2wiki.net/wiki/Orb_of_Extraction)的已索引机制说明另记可用于腐化装备；直连正文受站点验证限制，记录该证据边界，不将网页提取成功等同于取得正文。名称复用已登记三服官方 static 的 Orb of Extraction／萃取石，材料标识为 `Metadata/Items/Currency/CurrencyIncursionExtractAllSocketablesCurrency`。返还身份及绑定标志使用现有固定 PoB2 MIT 镶嵌目录，不新增抓取、第三方数据文件、价格或权重。

实施须从完整已核对孔位得出返还清单；未知孔内物不能当作空孔。装备摧毁、返还数量、消费与完整历史必须同步记录；返还不代表自动售出或抵扣历史支出。原模拟器尚未支持的特殊绑定镶嵌装备不能借萃取入口绕过状态校验。品质材料同期复核仍未取得可靠逐颗公式；旧单一 Vaal Infuser 的社区说明不足以覆盖 0.5 后分类材料，未启用猜测增量或概率。

### 完美溶剂与技能显示边界（2026-09-16，调研）

v97（2026-09-17）补充目标指导：复用下述既有材料资格、20级确定结果及装备／角色等级区分，不新增游戏规则或数据。目标显式标记为装备固有技能最高等级；只有原最高等级确知时自动生成完美溶剂步骤，未知值保留未知。再次核对 CoE 的制作配置与模拟衔接说明，仅参考产品流程；不读取其代码、权重或参数。

v76 执行范围补充：仅使用本节材料升级至 20 的确定性说明和固定 MIT 基底技能范围，支持单一普通施法武器固有技能。操作前最高级缺失时由用户主动声明并保存在步骤；这是演练前提，不是从角色显示推导出的游戏结论。独立保存装备升级结果，原观察不改写；无效果消费未确认，故已知满级拒绝重复操作。三服名称复用原目录；没有新增数据抓取、权重或运行时外站请求。游戏风格文本输出暂拒绝该结果，完整状态由项目保存。

[PoE2DB Perfect Flux](https://poe2db.tw/us/Perfect_Flux)及其[通货列表](https://poe2db.tw/us/Stackable_Currency)作为 gray 人工规则参考：公开材料标识为 `Metadata/Items/Currency/CurrencyUpgradeInherentTo20`，效果为将装备上的技能升至 20 级。不把它与四种抗性溶剂或升级 Kalguuran 技能宝石的 Thaumaturgic Flux 合并。名称沿已登记、已缓存的三服官方 static 同一 ID `perfect-flux`：英文 Perfect Flux、国服“完美溶剂”、台服“完美熔劑”；没有新增译名数据或抓取适配器。

[PoE2 Wiki Granted skills](https://www.poe2wiki.net/wiki/Granted_skills)作为 gray 人工机制线索，说明装备技能等级与角色实际可用等级可能不同。该页记载材料影响装备授予的全部技能，但多技能作用范围仍待独立核实；尚未取得可确认普通装备操作前后高级复制文本的第一手样本。[GGG 0.5.4 公告](https://www.pathofexile.com/forum/view-thread/3975218)的需求下调说明明确针对传奇装备，不能据此证明所有普通装备的显示变化。用户权杖原文的“等级 12（最高等级 13）”只证明导入时显示，不能推导使用材料后的显示等级、属性需求或技能加成结果。原文与新的装备技能结果需要分开建模；执行范围以上述 v76 说明为准，不能仅从材料描述扩大适用范围。未复制同行实现、整页内容、价格或权重。

催化剂同期复核：[Quality](https://www.poe2wiki.net/wiki/Quality)与[Catalyst](https://www.poe2wiki.net/wiki/Catalyst)仅作为 gray 人工线索。物品等级影响品质增量的概括不足以建立逐颗消耗算法，检索到的聚合攻略混有旧上限和 PoE1 规则，未据此更新执行模型。用户已明确没有催化戒指／项链样本，不再重复索取；国服品质头与数值范围格式继续标为待真机核对。

溶剂与破裂保护补充（2026-09-15）：新增 primary 人工规则依据 [GGG 0.5.1 Hotfix 8](https://www.pathofexile.com/forum/view-thread/3956720/filter-account-type/staff)，由 Alexander_GGG 于 2026-06-09 发布，明确禁止溶剂转换破裂词缀；同条也列出四种 Aldur 效果，不能据此推广到其他材料。早期玩家报告的破裂转换行为不能作为该修复后的执行规则。本文仅确认破裂词缀本身不可转换；混有普通抗性时是否允许操作、其他词缀的转换及无效果时的材料消耗仍需独立证据。工艺、亵渎等来源标记继续分别核对。不新增抓取适配器，不转载整页公告。

溶剂材料身份另核对 [Chilling Flux](https://poe2db.tw/us/Chilling_Flux)、[Crackling Flux](https://poe2db.tw/us/Crackling_Flux)、[Void Flux](https://poe2db.tw/us/Void_Flux) 的公开 metadata ID，均按 gray 人工机制参考。独立 `data/craft/fluxes.json` 的 15 行、60 个成员只保存既有词缀 ID、域和关系来源，绑定固定 `ModItem.lua`、`ModJewel.lua`、`ModVeiled.lua` 三份来源指纹；名称沿原 primary 表。普通生成资格不作为转换资格，原始装备文本也不能证明历史制作过程。

抗性溶剂调研与关系核对（2026-09-15）：新增人工 gray 关系来源 [PoE2DB Blazing Flux](https://poe2db.tw/us/Blazing_Flux) 的 Mod Equivalencies 表及表内公开词缀详情链接（`cdn.poe2db.tw/cache2/us/Poe_Data_Mods_hover/`）；用详情中的名称、冲突组、等级、生成侧别、域及完整范围唯一核对词缀 ID（一个单元格直接公开 ID），再按列关系连接已登记固定 MIT 属性目录，不采用经济数据或获取配方。若构建期读取，统一经 cache.ts 按日缓存、串行限速至少 1000ms，并使用标识性 User-Agent；独立表服从 DICT_ENABLE_POE2DB 总开关，可整体下线。完整网页、悬停响应与截图仅本地缓存，不随站发布。四种材料译名沿既有三服官方静态名称表，不做繁简转换。[玩家原帖](https://www.reddit.com/r/PathOfExile2/comments/1ufmd35/you_can_divine_single_resistance_on_items_using/)仅作人工机制参考：作者报告往返转换会重掷数值，多条抗性转换后仍占原有条数；不是 GGG 官方确认。破裂、工艺、亵渎身份及后续制作交互另行核实，不凭关系表授权执行。

未揭示液态交错补充（2026-09-15）：沿下述已登记 Hax 原视频03:00–03:13的实际补悲哀（Melancholy）流程，可见补工艺后仍保留未揭示占位与超大半径。仅用于确认保留占位的指定结果；不外推占位移除、已固定候选后的交互或概率。液态身份、保证属性与容量仍使用已登记固定来源，无新增第三方数据表。

珠宝亵渎扩展（2026-09-15）：沿已登记固定 MIT `ModVeiled.lua`（SHA-256 `95234097bcb70946ad451fbdb80b93cff3bd4a57abfdf29052305905fd32a632`），32 条普通珠宝和 12 条范围珠宝专属声明分别标记珠宝子域；范围的 nodeType=2 全文须与同条 tradeHashes 一致。既有 199 条装备三族独立保留，未声明类型的传奇记录继续排除，0/1 不作权重。人工流程参考新增 [Hax 原创视频](https://www.youtube.com/watch?v=qATcKacI83o)（元数据发布日期 2026-09-10）：02:45–03:08 可见 Preserved Cranium 的稀有珠宝说明，字幕描述定向亵渎及满前缀替换；03:41–05:18 描述回响揭示、光明预兆移除后重做。视频画面为 Forbidden Rites League，聚合页标注 Runes of Aldur 不作为版本证据。作者成本、概率、平均次数不采用；视频与字幕只在本地临时查看，不入库整段内容或装备。国服实际文本与各组合待真机验收；巫妖预兆不外推到珠宝。

珠宝腐化扩展（2026-09-15）：沿已登记 [sirgog 原创腐化说明](https://mobalytics.gg/poe-2/guides/vaal-corrupting)的珠宝专节，人工核对属性不变、一次至三次类似混沌替换、独立强化三类结果；不采用作者给出的概率，随机增减词缀与工艺增容交互仍需另行核对。沿已登记固定 MIT `ModCorrupted.lua` 的 11 条 jewel 资格强化，与 ModJewel 的精确普通／范围基底和已有容量规则接通；不引入新数据或同行代码。建筑师沿既有材料说明中 Equipment or Jewel 的适用范围和当前指定成功／摧毁模型；没有推定新的权重。CoE 公开更新日志的 2026-09-12 条目显示从当前制作结果继续模拟的交互，作为保留当前状态、费用与历史的流程参考；该日志不作为游戏规则证据。当前国服文本与逐组合游戏行为仍待真机验收。

定向消减组合（2026-09-14）：沿用已登记 PoE2DB 预兆说明和 Lolcohol / Mobalytics 预兆攻略，以“指定移除侧”与“最低目录等级”组合建立模型。新增人工 gray 第一手交互参考 [GGG 论坛玩家实测帖](https://www.pathofexile.com/forum/view-thread/3762077)（2025-04-17/19）：破裂装备的悬停提示可能错误，玩家报告实际移除符合预兆；这是玩家报告，不是 GGG 官方机制确认。先排除破裂、限定侧，再求最低等级；当前国服组合交互待真机核对。不新增抓取适配器或数据文件，不采用外站权重。

建筑师摧毁（2026-09-14）：新增人工 gray 规则参考 [Lolcohol / Mobalytics《Vaal Currency Items》](https://mobalytics.gg/poe-2/guides/vaal-currency)（页面更新 2026-07-21），结合已登记 PoE2DB 的 [Architect's Orb 说明](https://poe2db.tw/us/Architects_Orb)。v62 支持手选摧毁，v63 增加手选追加强化，未采用作者给出的概率。成功组合沿用已登记固定 MIT PoB2 ModCorrupted.lua 的组、附加标签及资格数据建立模型；组间交互、无原强化结果和二重后不可重复仍待真机确认，不宣称服务端规则已证实。已登记固定 MIT PoB2 的 Item.lua 用于核对英文 Twice Corrupted 标记，不猜国服或台服译文。无新增抓取适配器、转载表格或同行实现。 本轮 CoE 黑盒观察：自造英文 Antler Focus 在 language=cn 页面提示基底未找到，英文页面可导入；Temple → Architect's Orb 显示该方法没有处理器。仅记录当前页面行为，不据此推断游戏规则或其他入口能力。


瓦尔顺序重选（2026-09-14）：新增人工 gray 规则参考 [Mobalytics / sirgog 原创攻略](https://mobalytics.gg/poe-2/guides/vaal-corrupting)（页面标注 2025-01-16），与已登记 Maxroll 腐化说明交叉核对。使用一至三次类似混沌替换、可作用于魔法装备的文字描述；顺序重新生成候选、可再次命中新组是该描述的模型推导，未获服务端或真机验证。没有转载结果表、抓取适配器或同行实现，未采用旧 25% 概率／法系品质结论；特殊来源交互暂不开放。CoE 自造法器选择 Vaal Orb 后显示该方法没有处理器，仅登记为界面观察，不能证明游戏行为。

腐化属性目录（2026-09-14）：新增已登记 MIT 仓库固定提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e` 的 [src/Data/ModCorrupted.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModCorrupted.lua)，SHA-256 `50549cb0cbe722e28b337b30e4918e14ddf14bd4aa5da5d064984b1ba8f99351`。primary，保留 MIT 及 GGG 游戏内容版权说明；构建期仅经 cache.ts 抓取固定 raw 文件并解析声明。127 条放入独立腐化表，保留 Corrupted / SpecialCorrupted、组、数值范围、标签与有序资格，不将 0/1 当概率，不把空资格推断为全部可用。[同提交 Item.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Classes/Item.lua)及 [ItemTools.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Modules/ItemTools.lua)仅用于人工核对腐化属性层、催化增幅和取整规则，不执行 Lua 或复制制作器实现。

腐化首条路径（2026-09-14）：使用 [GGG 0.2.0g](https://www.pathofexile.com/forum/view-thread/3774660) 与已登记的 0.3.0 掉落孔规则作为 primary 规则证据；[Maxroll 制作概览](https://maxroll.gg/poe2/resources/path-of-exile-2-crafting-overview)、[腐化说明](https://maxroll.gg/poe2/resources/corruption-outcomes)及[PoE2DB 腐化关键词](https://poe2db.tw/us/Corrupted_Items)仅作人工阅读的 gray 规则参考。未新增抓取适配器或转载结果表；本期仅接属性不变／加一孔手选结果，不采纳各 25% 的旧推测，不接入 ModCorrupted 文件。逐类孔上限推导和未验证交互见 crafting-rules.md。

### 基础魂核镶嵌（2026-09-14）

沿已登记固定 MIT `ModRunes.lua` 的完整类别、单行效果及 localMod，接入 Tacati、Citaqualotl、Azcapa、Quipolatl、Atmohua、Cholotl、Zantipi 七种基础魂核的十四条分支；固定目录无 limit、limitId 或 Socket-bound，不把此事实扩展到其他魂核。[GGG 0.4.0](https://www.pathofexile.com/forum/view-thread/3883495)明确增设大量具名镶嵌限制并使不合法装备失效，故限制型及古代共享组需单独建模。覆盖沿已登记 GGG 0.1.1；恐惧增效及攻速/弩装填沿固定 PoB `Item.lua` 模型。

精确数值仍来自同一固定快照：抗性及本地攻速进入已有装备估算，毒素幅度、攻击元素提高、精魂、金币、减速削弱及需求转换只展示本件效果，不伪造角色结果或最终穿戴需求。参考 CoE 公开更新日志的装备面板和模拟条件联动，不获取其代码或数据。无新增数据抓取器；游戏取整、重复镶嵌和国服复制格式仍待真机验收。

### 普通武器符文扩展（2026-09-14）

沿用固定 MIT `ModRunes.lua` 完整类别、效果、本地标志、限制与需求，开放攻击武器 Body、Mind、Rebirth、Inspiration、Stone、Vision、Robust、Adept、Resolve 四档及 Tempered 三档，法杖／施法长杖开放 Body、Mind、Rebirth、Inspiration、Stone、Vision 四档。固定目录合计 weapon 55、wand 40、staff 40 条受支持分支，没有补造缺失的 Perfect Tempered 或三属性施法效果。[GGG 0.2.0e](https://www.pathofexile.com/forum/view-thread/3754474)的 Crafting Changes 明示十族符文在 Wands／Staves 使用独立效果及新增三属性符文；实际数值仍采用已登记快照，不当作当前所有服区真机验证。

物理附加伤害沿既有固定 MIT Item.lua 的本地武器计算，先与基底及本地平值相加，再乘物理提高和品质。吸取、击杀回复、命中、属性及施法附加效果各自记录，不冒充本地 DPS 或角色最终面板。无新增抓取适配器、数据包或同行代码；普通整数来源核对继续拒绝负数、小数、未知混合及特殊限制。

### 普通防具符文扩展（2026-09-14）

沿用已登记固定 MIT `ModRunes.lua` 的完整类别、限制字段、效果与等级需求，新增 Body、Mind、Inspiration、Stone、Vision、Robust、Adept、Resolve 八族四档的防具效果。数值采用固定目录快照，不把它推定为已完成所有服区的游戏验收。[GGG 0.2.0e](https://www.pathofexile.com/forum/view-thread/3754474)用于核对属性三族的新增及武器有独立效果的事实；[0.1.1](https://www.pathofexile.com/forum/view-thread/3696353)沿用既有覆盖规则。没有新数据下载适配器、没有复制同行制作器数据。

新增效果均为单行正整数；只核对完整声明，不按名称或首行泛化。沿已有恐惧工艺的逐枚增效与整数向下取整模型；不激活 Bonded、不把生命／属性等贡献视为角色最终面板。小数回复、荆棘、结界及特殊符文未据此放行。来源名称仍通过既有三服 static ID 独立本地化。

### 催化崇高预兆的品质消耗（2026-09-14）

组合扩展人工参照：[Lolcohol 预兆说明](https://mobalytics.gg/poe-2/guides/omen-crafting)明确可叠加预兆，包含完美崇高的强效加定向示例，并强调催化不保证标签；原文部分其他机制已过时，不据此更新圣化或腐化规则。CoE 公开界面以自造 Gold Ring 核对催化、强效、右旋三枚同时选中，只观察控件状态，不复制数据、实现或权重。沿现有各枚效果组合为指定结果模型，实际触发顺序及品质对第二组权重的影响未确证，不输出概率。[PoE2 Wiki 催化条目](https://www.poe2wiki.net/wiki/Omen_of_Catalysing_Exaltation)经检索显示双组都受影响的社区说法，仅列为待追溯线索，不作为数值公式依据。新增五种配置不新增数据抓取或运行时外站请求。

[PoE2DB 当前公开物品说明](https://poe2db.tw/us/Omen_of_Catalysing_Exaltation)经 Exa 全文核对，按 gray 人工机制参考：下一次崇高消耗全部催化品质，提高对应类型属性的机会；预兆触发时消费。[官方论坛作者实操](https://www.pathofexile.com/forum/view-thread/3849100)报告单枚搭配高级崇高，以及混用预兆的不确定结果；[作者品质消费报告](https://www.pathofexile.com/forum/view-thread/3842222)证实品质被清空但未保证标签，也包含未消费预兆的旧缺陷报告。论坛位置不使玩家报告成为 GGG 官方结论。

[Fubgun 当前 0.5.5 制作指南](https://mobalytics.gg/poe-2/profile/fubgun/builds/0-5-fubgun-ice-shot-deadeye)的作者步骤包含完美崇高与催化崇高；只用于三档崇高兼容的人工交叉核对，不复制装备、模板、代码或权重。材料三语名称沿既有三服官方 static ID，不建立新抓取适配器。首次仅支持已核对品质大于零的普通戒指／项链、单枚配置；珠宝、零品质及多预兆交互未据这些记录推定。消费与非保证标签按物品说明建立指定结果演练，实际游戏与国服格式待验收；没有将社区所称 5 倍权重当成已验证参数。

### 裂隙精华后的催化预览（2026-09-14）

沿用已登记的固定 MIT `Essence.lua` 与 `ModItem.lua`：`CurrencyCorruptedEssenceBreach` 仅映射戒指／项链的 `EssenceBreach`，前缀冲突组为 `LocalMaximumQuality`，固定效果为最大品质增加 20%。预览以已支持的基底上限加该固定效果，普通戒指／项链为 40%，裂隙戒指为 60%；这是目录属性相加所得的只读模型，未作游戏操作验收。仍检查精华来源指纹、精确材料映射、工艺身份与固定属性声明，不采集新数据文件。未将其推广到已有超上限品质导入、移除最大品质属性后品质保留或逐颗催化消耗。

本轮 Exa 与网页检索再次发现每颗催化剂增量存在相互矛盾的聚合攻略，部分仍沿用旧裂隙戒指 50% 上限，未作为执行规则。[GGG 0.5.0 公告](https://www.pathofexile.com/forum/view-thread/3932540/filter-account-type/staff)与既有注能器核查未提供可据此实现普通催化逐颗增量的公式。

### 液态制作路线交互参考（2026-09-14）

再次人工核对 [Craft of Exile 当前公开界面](https://beta.craftofexile.com/?game=poe2) 的手动演练、条件流程与自填报价入口，以及已登记 [b0b5 五词缀珠宝第一手实操](https://www.youtube.com/watch?v=xDDbg6FYMgI) 的临时增容、填满与最终增效顺序。仅帮助组织操作和风险说明，算法为本项目自有的有界目标搜索；没有复制其代码、物品数据、价格或概率。搜索命中的商业聚合攻略含“剥离不能移除三同侧词缀”等未成立概括，排除。每一步资格、数值、容量和来源继续使用已登记的固定 MIT 目录及本工具现有规则；范围、亵渎珠宝和国服未验证交互不随路线接入而扩大。

### 普通珠宝侧别增效依据（2026-09-14）

沿用已登记的 [固定 MIT Item.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Classes/Item.lua#L1648)，本轮重新下载核对 SHA-256 `0ca39961256eefc960da7b30b4e5cb6eb45d08037aa72bc751201cc0630af2a4`：1255 行识别前后缀增效，1648–1717 行按对应侧加入已有品质标量；不可缩放及授予技能跳过。与同提交 ModJewel、LiquidEmotions、ModScalability 三项声明交叉核对，以自有 TypeScript 实现相加与一次缩放，不复制实现或新增数据包。Ferocity 提示沿下方已登记 gray 页面人工核查。v53 仅开放四普通珠宝八映射。

高级文本基础值与百分比头沿固定实现模型，固定 `current(base)` 以严格目录和唯一有效值校验，不将任意显示值反推基础值。英文百分比头在中文出口中保留，不宣称是国服原生格式。用户没有催化剂样本，实际游戏版本与真机显示仍待核验；范围珠宝、角色条件与真实生成概率未据此推定。对 [Craft of Exile](https://beta.craftofexile.com/?game=poe2) 继续只作公开交互参考，不复制代码或数据；其当前菜单显示“简体中文”，不以早期语言列表概括当前支持程度。


### 当前制作机制补充核查（2026-09-14）

新增人工交互参考：[b0b5 的普通五词缀珠宝实操](https://www.youtube.com/watch?v=xDDbg6FYMgI)、[Vodnarg 的范围珠宝实操](https://www.youtube.com/watch?v=3tFs16SXkD8)。仅用于核对增容移除后仍可保留第三同侧词缀，以及后续混沌操作受空位限制；没有采集视频数据入目录，没有将作者口述概率当作真实权重。搜索索引日期不一致，未据其推定当前补丁。v52 依此将已有状态与生成容量分开，仅开放普通珠宝增容；增效、范围珠宝与当前国服实机仍待验证。

[GGG 0.4.0 官方补丁](https://www.pathofexile.com/forum/view-thread/3883495/filter-account-type/staff)确认同质崇高与同质加冕预兆停止掉落，已有物品仍可使用；[GGG 0.5.0 官方补丁](https://www.pathofexile.com/forum/view-thread/3932540/filter-account-type/staff)确认这两种预兆及腐化预兆只在标准服通货交易所显示，同时关闭重组器并删除已有重组预兆。旧网页条目不能据此作为当前赛季可获取证据。0.5.0 新增合金与液态情感制作珠宝，本轮核查对应可授权数据，不从旧制作指南推导新规则。

新增 primary 声明来源：[固定 MIT 快照的 LiquidEmotions.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/LiquidEmotions.lua)，SHA-256 `2f8783e2f3d26fabc2a58c9533ffe96461ae0343ab6b3a2037249c68d00da7a8`。沿用 PoB2 许可与游戏文字版权声明，经既有 cache.ts 与受限 Lua 解析接入材料声明，保留 26 种材料（13 种普通、13 种范围珠宝）及 96 个前后缀映射。每个引用用同一固定 ModJewel 原始声明核对存在性、前后缀与范围节点语义。空类别原样保留，tierLevel 不作为装备物等门槛；普通珠宝可生成词缀保持 160 个，工艺子域另接入 8 个专属声明，剩余 209 个排除记录。名称复用已登记三服 static，简繁独立精确对应，不另行抓取。浏览器不访问第三方。

规则人工参考另核对 [Ire](https://poe2db.tw/us/Diluted_Liquid_Ire)、[Isolation](https://poe2db.tw/us/Concentrated_Liquid_Isolation)、[Contempt](https://poe2db.tw/us/Potent_Liquid_Contempt)、[Ferocity](https://poe2db.tw/us/Potent_Liquid_Ferocity) 的公开物品说明，按 gray 处理，仅人工核查，不复制数据文件或建立适配器。GGG 0.5.0 的一组工艺上限作为 primary 规则依据。钻石空映射、移除额外词缀位后的超额状态与词缀增效交互仍需单独核实；玩家帖子 [3948475](https://www.pathofexile.com/forum/view-thread/3948475)、[3958506](https://www.pathofexile.com/forum/view-thread/3958506) 只作第一手问题线索，不据此推定现行算法或概率。数据接入不代表这些操作已经可用。

基础制作补充参考作者实操攻略 [3964088](https://www.pathofexile.com/forum/view-thread/3964088) 的蓝玉／Liquid Despair 替换示例，支持满后缀时移除候选受容量约束；作者估计的概率未转成权重，旧回盾词缀建议未被当作当前目录。该来源按 gray 人工规则参考，不下载攻略装备。当前执行范围采用固定 MIT 目录中 13 种材料的 50 个精确映射，包括三色基础与悲哀材料、钻石的孤独材料、四类普通珠宝的轻蔑与凶残双侧映射，具体门禁和未支持交互见 crafting-rules.md。

### 催化剂效果预览依据（2026-09-13）

逐颗施加补充核对（2026-09-15）：新增人工 gray 第一手视频参考 [Palsteron 的 0.5 珠宝制作实操](https://www.youtube.com/watch?v=kW9OVYQVHm4)（视频元信息发布日期 2026-06-21）。人工查看约 07:03–07:21 的游戏画面和相应字幕，确认作者向稀有蓝玉施加 Refined Carapace Catalyst，显示防御品质达到 20%，之后继续点击出现满品质拒绝提示。未获得适用于全部物等的单颗增量公式，也未见该段演示切换催化种类；不能由最终 20% 推定消耗 20 颗。视频仅作人工机制观察，无明确素材再分发授权；不入库视频、字幕、截图或完整装备文本，不新增抓取适配器或运行时外站请求。证据边界与后续实现条件见 [催化剂施加调研](catalyst-application-research.md)。

失落珠宝品质补充核对（2026-09-15）：[GGG 0.5.4b 官方补丁](https://www.pathofexile.com/forum/view-thread/3980516/filter-account-type/staff)明确修复品质未作用于部分珠宝词缀的问题；不能将六月的玩家故障报告当作当前禁止使用催化剂的依据。现有精炼材料类别与固定 Item.lua 标签规则用于四种精确 Time-Lost 基底的已有品质。ModScalability 中多数完整范围属性没有独立声明，不能去掉范围前缀后挪用普通属性的缩放能力；保留既有“显示估算／可信有效值”区别，不计算天赋覆盖或角色收益。没有新增数据抓取或浏览器外部请求。国服品质原生文本及每颗材料的增量仍待验收／核实。

缩放元数据补充来源：[同一固定 MIT 提交的 ModScalability.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModScalability.lua)。记录英文属性模板各数字的 `isScalable` 与 `formats`，用于区分可缩放数值、固定条件和内部精度。采用既有 cache.ts 构建期缓存、受限 Lua 声明解析，保留来源 SHA-256；仅选取能与当前制作目录属性对应的条目，不把其中其他游戏或历史条目扩展为 PoE2 制作资格。游戏文字版权归 GGG，MIT 只覆盖来源仓库自有部分，沿用 THIRD-PARTY-NOTICES 的 PoB 声明；用户浏览器不访问第三方。

催化剂名称沿用已登记三服官方 `/static` 的 26 项独立译名，不新增名称抓取。[固定 MIT 提交的 Item.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Classes/Item.lua#L14)提供 13 类品质与词缀标签的对应关系、命中任一标签乘以 `1 + 品质 / 100` 及不可缩放标记例外；[ItemTools.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Modules/ItemTools.lua#L45)区分内部精度与显示精度。当前预览优先使用缩放声明与内部网格；显示值能对应多个内部值时枚举其催化后结果，结果不唯一则提示范围，不猜中点。有资料却无法计算时不会退回粗网格；缺资料的行才沿用明确标注的目录显示精度估算。两种结果均不用于游戏文本、目标达成或材料费用，实际版本与真机显示待验收。

[GGG 0.2.0](https://www.pathofexile.com/forum/view-thread/3740562)确认裂隙戒指品质上限由 50% 改为 40%；当前目录的 `+20% to Maximum Quality` 只对精确对应基底识别为普通 20% 上限的增加。[GGG 0.5.0](https://www.pathofexile.com/forum/view-thread/3932540/filter-account-type/staff)确认催化剂获取改为 Genesis Tree，并增加珠宝催化剂。[Flesh Catalyst](https://poe2db.tw/us/Flesh_Catalyst)、[Refined Flesh Catalyst](https://poe2db.tw/us/Refined_Flesh_Catalyst) 与[催化剂列表](https://poe2db.tw/us/Catalysts)仅作人工机制参照，核对戒指／项链与珠宝的材料类别，不复制数据库或整页文章；网站无明确数据授权，属于 gray 参考，非新增运行时适配器。每颗增加品质、替换种类的完整消费规则、国服高级文本及特殊品质交互继续核实；不采用 PoE1 的物等公式或旧稀有度公式。

### 恐惧精华镶嵌增效计算依据（2026-09-13）

[GGG 0.4.0](https://www.pathofexile.com/forum/view-thread/3883495/filter-account-type/staff)确认恐惧精华在手套／鞋上提供 60% 镶嵌物增效，旧 100% 属于遗产数值。属性身份与精华部位映射继续使用已登记的固定 PoB MIT 目录，不新增数据包。[同一固定提交的 Item.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Classes/Item.lua#L1523)在游戏文本还原时逐枚缩放后分组；[ItemTools.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Modules/ItemTools.lua#L14)对本次支持的正整数效果向下取整。自有代码据此估算普通四族防具符文，不复制实现，不推广到绑定、其他增效或角色总面板。取整与国服实际导出仍待真机验收。

### 破裂制作人工机制依据（2026-09-13）

[GGG 0.2.0](https://www.pathofexile.com/forum/view-thread/3740562)支持稀有、至少四词缀及随机锁定；[GGG 0.2.0e](https://www.pathofexile.com/forum/view-thread/3754474)直接确认神圣不应改变破裂词缀。已有登记的 [PoE2DB Fracturing Orb](https://poe2db.tw/us/Fracturing_Orb)物品说明经 Exa 全文读取确认不能再次用于破裂物品，按 gray 人工转录参考；没有抓取适配器或复制数据文件。

[RubyRose亵渎指南](https://vulkk.com/2025/09/05/path-of-exile-2-desecration-crafting-guide/)支持未揭示占位计数但排除候选及后续移除流程，[Mobalytics SSF指南](https://mobalytics.gg/poe-2/guides/ssf-crafting)的亵渎不可破裂说明作为作者级证据，不采纳整页旧精华链条。[玩家帖子3966812](https://www.pathofexile.com/forum/view-thread/3966812)与[3967316](https://www.pathofexile.com/forum/view-thread/3967316)支持工艺与破裂独立保留，但属于珠宝报告，不冒充普通装备全部工艺真机验证。三者仅人工规则参考，不复制整件装备；具体可执行范围及未验证交互见 crafting-rules.md。

国服高级装备文本的人工兼容样本（2026-09-13）：用户本机提供的非传奇腰带文本确认 `implicit.stat_1416292992` 的游戏写法为“具有 # 个咒符位”，现有国服交易模板为“具有 # 个咒符栏”。仅在既有 ID、英文模板及国服原模板同时吻合时派生输入别名，属于 manual 格式依据；保留官方模板，不改生成词典，不外传或入库整件样本。繁体模板独立，未由此推导台服别名。两条已有召唤属性身份继续使用下述固定 MIT 目录；样本证明它们存在于装备上，不证明具体制作过程或普通生成资格。

新增任何数据源前先在此登记。等级定义：

- **primary**：官方接口、官方导出，或明确开源许可（MIT 等）的仓库数据。默认启用。
- **gray**：内容可公开访问但没有明确的再分发授权。适配器必须带总开关、限速、标识性 User-Agent，
  产物单独成表文件，`_meta.tier` 标 gray，可整体删除。
- **manual**：`data/dict/_overrides/` 手工三语表与取舍表，入库，`_meta.tier` 标 manual。
- **禁止**：专有许可、无 LICENSE 的第三方翻译产物、客户端解包产物。只允许学习结构，文件不进仓库。

## primary

| 来源 | 覆盖 | 语言 | 稳定 id | 获取 | 许可与限制 |
|---|---|---|---|---|---|
| `https://www.pathofexile.com/api/trade2/data/stats` `/items` `/static` | 词缀模板（8213 条 stat）、物品基底与传奇的英文规范名（/items，作为 items 词典的键与 poe2db 校验锚点）、通货 | en | stat 有 `explicit.stat_<hash>`；items 无 id | 构建期 HTTP GET，无鉴权；需标识性 UA | GGG ToS 7f 禁数据采集工具，无第三方工具豁免；robots.txt disallow `/api/`；无 CORS。只在构建期低频抓取；本项目只在构建期按日缓存、每端点每日至多 1 次，不在浏览器里请求；GitHub Actions 出口可达（2026-09-07 冒烟 HTTP 200） |
| `https://poe.game.qq.com/api/trade2/data/*` | 同上、联盟名（/leagues，仅用于 meta.leagueName） | zh-CN | 与国际服同一套 stat id（交集 90.8%，缺失集中在 fractured / crafted 分组） | 同上 | 腾讯《游戏许可及服务协议》第六章禁"制作发布传播"第三方软件；国服版本滞后国际服约一周；robots.txt disallow /api/——本项目只在构建期按日缓存、每端点每日至多 1 次，不在浏览器里请求 |
| `https://pathofexile.tw/api/trade2/data/*` | 同上、联盟名（/leagues，仅用于 meta.leagueName） | zh-TW | 同一套 stat id（5841 条） | 同上 | 同 GGG ToS；robots.txt disallow /api/——本项目只在构建期按日缓存、每端点每日至多 1 次，不在浏览器里请求 |
| `grindinggear/poe2-skilltree-export` | 天赋树节点（数字 id、英文名、位置） | en | 数字 nodeId | raw.githubusercontent.com 的 main 分支 data.json（Release 无附件；tag 落后 main） | GGG 官方唯一静态导出，无语言参数 |
| `PathOfBuildingCommunity/PathOfBuilding-PoE2` `src/Data/`、`src/TreeData/` | 宝石 `gameId` → 英文名、基底表、传奇表、天赋 id 对照 | en | 宝石 gameId、天赋 nodeId | git，跟 `dev` 分支（Release 落后） | MIT；MIT 不能处分 GGG 游戏内容的权利 |
| 同上 `src/Data/ModItem.lua`、`src/Data/Bases/*.lua`、`src/Data/ModRunes.lua`（制作目录） | 基底类别、标签、需求、属性；词缀 id、冲突组、等级、标签、范围与 tradeHashes；镶嵌物名称／类别效果、穿戴需求、绑定及数量限制；不含真实生成概率 | en | 基底英文名、生成 mod id、trade stat hash；镶嵌物使用项目自有名称＋类别复合身份 | 构建期经现有缓存模块获取固定 commit 的 raw 文件；只解析声明数据，不执行 Lua；首个调研快照 `ce566eac45ea8a86477f513c7ee65a1ebe60014e` | 仓库 MIT，保留 David Gowor 版权和许可文本；文件标注游戏数据归 GGG。`weightVal` 是适用性数据，不能视作实测权重；记录来源哈希与快照，游戏版本未验证时不得捏造。ModRunes 的 levelReq 是穿戴需求，不能当物等门槛；缺省布尔不推断允许，Bonded 不默认激活 |
| `repoe-fork/poe2` | passive_skill_trees/Default.json（PassiveSkills 字符串 id ↔ 数字 hash ↔ 英文名）、data/skill_gems.json（gameId ↔ 英文显示名，作为 gems 词典的键与 poe2db 校验锚点）、基底 | en（多语言字段目前为空） | dat64 Id | raw.githubusercontent.com/repoe-fork/poe2/master 下的 data/passive_skill_trees/Default.json 与 data/skill_gems.json，构建期 GET、按日缓存 | 工具 MIT；数据版权归 GGG。用于把 `.build` 的字符串 id 对到名称 |

制作目录的 `localizedNames` 使用上述三服 `/static` 的稳定条目 ID 精确连接英文与各服名称；与 `.build` 的灰区物品表独立。三份静态响应的 URL、SHA-256、抓取时间与语言单独记入 `_meta.nameSources`，游戏版本未知则 null，不冒充 PoB 固定提交。只作显示名称，不从名称推导效果或制作资格；缺项不猜译，重复英文名对应冲突译法时拒绝生成。生产读取仍使用 cache.ts，浏览器只读取随站目录。

## gray

| 来源 | 覆盖 | 语言 | 获取 | 风险 | 开关 |
|---|---|---|---|---|---|
| `poe2db.tw/us/`、`/cn/`、`/tw/`；`cdn.poe2db.tw`（天赋树 bundle） | 天赋节点中文名、宝石中文名、物品基底与传奇中文名；/us/ 页英文名仅作 join 校验锚点，不进词典 | en（us，仅校验）、zh-CN、zh-TW（各自独立翻译） | 天赋树 JSON：/data/passive-skill-tree/<模板版本>/data_{cn,tw}.json?5，模板版本从 /cn/passive-skill-tree 页面引用的 bundle 里解析（当前 4.5），解析失败回退写死值并告警；物品 / 宝石中文名：列表页 /{us,cn,tw}/Gem、/Unique_item 与 31 个装备分类页（Amulets … Wands，名单在 packages/dict-builder/src/config.ts，按 trade2 en /items 装备类分组反查得到的最小完备名单），按站内 slug 对齐，us 页英文名与 primary 源规范名逐字符相等才采纳；只抓列表页不抓详情页，所有 poe2db 请求串行、相邻请求 ≥ 1.5 s、按日缓存（列表页缓存约 80 MB / 天），全新构建 99 页（2026-09-07 压测 81 页无限流）（2026-09-08 构建：宝石 1072 / 基底 1543 / 传奇 445 条，各 locale 见 meta.json） | robots.txt 仅 Allow: /；无 LICENSE / ToS；wiki 文章 CC BY-NC-SA 3.0，数据库页未明确 | `DICT_ENABLE_POE2DB`，默认开，可关 |

## 禁止

| 来源 | 原因 |
|---|---|
| 「PoE2'说'中文」浏览器扩展（`data/Trade2/*-3lang.json`、`json/Simple`、`json/Modifiers`） | LICENSE 为 All Rights Reserved，禁止复制、修改、分发 |
| `Chuanhsing/PoeCharm2` `Data/Translate/*.csv` | 仓库无 LICENSE，授权不明 |
| `Hsiung-Shao/PobTools-zh` 数据包 | 来自本机客户端解包；许可状态不一致 |
| `addohm/poe2-en-cn-dict` | 双客户端 Oodle bundle diff 产物，涉及客户端解包与游戏文件再分发 |
| `gogit2194/poe2-lang-sc.json` | 血缘来自非官方镜像站，无法追溯 |
| 任何客户端解包（ggpk-explorer、PyPoE 等）产物 | 腾讯协议第六章禁反向工程；GGG ToS 7i |

## 自有数据（手工维护，入库）

| 文件 | 内容 |
|---|---|
| `data/dict/_overrides/ascendancies.json` | 23 个升华代号 → 三语名 + 所属职业 + Witch3/Witch3b 改版关系（白名单来自 PoB2 tree.json） |
| `data/dict/_overrides/classes.json` | 8 个职业代号 → 三语名 |
| `data/dict/_overrides/inventories.json` | 14 个 inventory_id → 三语槽位类别名（除"魔符"外为通用译法，待与官方 UI 核对） |
| `data/dict/_overrides/stat-order.json` | stat id → 译文占位符取值顺序（中文语序与英文不同时填写） |
| `data/dict/_overrides/versions.json` | 各服当前内容版本，写入 meta.json 的 gameVersion |
| `data/dict/_overrides/stat-winners.json` | 同一模板键多条译文时的取舍（模板键 → stat id，按 locale 分节） |
| `data/fixtures/synthetic/*.build` | 合成语料（覆盖率度量），只含公开的英文词缀模板与基底名 |
| `packages/dict-builder/fixtures/*` | 手写的迷你测试数据（非抓取产物）；只含极少量真实名称用于 join 用例，不作为词典来源 |
| `packages/item-core/src/*test.ts`、`apps/build-l10n/src/craft/*test.ts` | 自造装备文本测试，验证分组、范围、逆向模板和导出门禁；真实用户样本仅保存在 `data/fixtures/local/`，不入库 |
| `packages/item-core/src/export.ts` 中的类别标题对照和转接白名单 | 手工适配装备剪贴板标题；白名单来自公开 CoE 界面中的合成法器黑盒验收，2026-09-18 扩展至固定 MIT 目录的23种普通法器、魔法与稀有输入，仅作兼容范围标记，不含第三方 mod 数据或权重；见[转接核对](coe-focus-bridge-research.md) |
| `packages/dict-builder/src/craft-catalog.ts` 中的声明排除规则 | 固定 PoB2 提交内 Runeforged Sturdy Crossbow 的武器表重复定义两个不同 LightningMax；按名称和完整声明 SHA-256 隔离，不猜数值。重复名称声明按完整归一化内容生成自有变体 ID（不是游戏官方 ID），仅 hidden 差异可以合并，但保留全部声明位置及隐藏标记；不同固有属性、基础属性、需求与标签分别保留 |

## 更新节奏

### 通货规则的人工核对依据

`packages/item-core/src/rehearsal.ts` 的通货规则是自有实现，机制摘要与逐项出处见 `docs/crafting-rules.md`。数值范围沿用固定目录，显示精度独立等概率试掷是自有演练模型，不是来源提供的游戏概率。
GGG 官方 0.3.1 公告（`forum/view-thread/3860076`、`3862213`）作为点金行为的 primary 证据；PoE2DB
`/us/Currency` 与 `/us/Item_Rarity` 仅作为公开游戏措辞转录的人工核查参考，许可仍属 gray，未下载、复制或生成规则数据文件。
没有新增抓取适配器或浏览器第三方请求，也未复制其实现或数据表。
规则核查日期不替代游戏版本；客户端实际行为仍待验收。

`packages/item-core/src/sockets.ts` 的镶嵌白名单与已有孔范围也是自有规则：GGG 0.1.1（`3696353`）支持覆盖，0.3.0（`3826682`）支持额外掉落孔，0.5.0（`3932540`）支持抗性符文现行前三档值。普通胸甲二孔、头手鞋一孔的逐部位映射参考 Maxroll 制作概览与 Fextralife 护甲说明，属于人工核查的二级材料，许可未明确，按 gray 对待；没有下载其数据文件、加入适配器或声称 staff 已逐项确认。来源实际值仍从登记的 PoB MIT 声明生成。`S` 无法保证空孔的反例来自 GGG 论坛玩家原帖 `3849983`，仅作为输入格式反例，未复制整件装备或当作官方机制定义。具体链接与限制见 `docs/crafting-rules.md`。

高级与完美通货的人工规则核查另参考 GGG 0.3.0（`3826682`）与0.5.0（`3932540`）公告，以及PoE2DB `/us/Currency`、`/cn/Currency`、`/us/Minimum_Modifier_Level` 的物品/关键词转录。等级例外具体最高档解释以论坛玩家第一手记录（`3863869`、`3850325`、`3863566`）交叉核对，不冒充官方 staff 算法声明；结合固定目录 `(kind, group)` 结构审计实现，不复制外站词缀池、权重或代码。

### 词典更新

- 国际服大版本前 PoB2 `dev` 分支通常已预适配；国服交易站滞后约一周。词典更新以国服 API 跟上为准。
- 每次更新记录 `meta.json`：游戏版本、抓取时间、各来源条目数与哈希、启用的适配器。
- 三服内容版本可能不同（如国际服 0.5.5 时国服仍 0.5），构建前先更新 `_overrides/versions.json`；每次构建把审计计数（重复 id、占位符不一致、键冲突、residualSuffix）写入 meta.json，突变即人工复核；交易站消歧后缀名单在 packages/dict-builder/src/adapters/tradeSuffix.ts，residualSuffix 非空时更新它。

### 定向预兆人工规则依据

六枚 Sinistral/Dextral Exaltation、Annulment、Erasure 的侧别及触发消费依据 [PoE2DB Omen 列表](https://poe2db.tw/us/Omen)公开游戏说明转录，按 gray 人工参考，不复制其数据文件。[GGG 0.3.0](https://www.pathofexile.com/forum/view-thread/3826682)明确 Coronation 已不可获取；[GGG 0.5.1 热修6](https://www.pathofexile.com/forum/view-thread/3955250)列出四枚定向移除预兆掉落调整，均为 primary 版本证据。名称复用登记的三服官方static已有条目，未新抓数据。自有规则只实现基础对应通货与单枚定向；升级通货组合、多预兆叠加及真机失败消耗仍待验证，不能从交易条目存在推导机制兼容。

### 精华目录来源

制作目录扩展读取上述 MIT PoB2 固定提交的 `src/Data/Essence.lua`：保留材料 Metadata ID、英文名称、来源 type、tierLevel 与装备类别到 modifier ID 的映射。经 `cache.ts` 构建期缓存，不执行 Lua；SHA-256 为 `950219488fed20cc3ca1bad17953f577c4361c6b65e371ce9ae3f9cbbae95f74`。名称仍由三服官方 static 独立对齐，效果由同提交 ModItem 声明引用；未对应的 Display／特殊 ID 原样保留并提示，不能补成虚构的普通词缀。tierLevel 的游戏含义未核实，不作为物等、穿戴或材料使用门槛。

机制依据分别核查 [GGG 0.3.0](https://www.pathofexile.com/forum/view-thread/3826682)、[0.4.0](https://www.pathofexile.com/forum/view-thread/3883495)与 [0.5.0](https://www.pathofexile.com/forum/view-thread/3932540)；版本说明与固定快照分别标注，不因少量数值相符宣称全表版本一致。工艺行为的补充依据见下文；物等例外和占位效果仍未核实，目录查询不代表所有条目都可直接执行精华制作。

### 特殊词缀来源标记

完美/腐化精华 v16 补充人工规则依据：[GGG论坛3960848](https://www.pathofexile.com/forum/view-thread/3960848)的2026-06-12玩家实际报错支持已有工艺组时拒绝；[PaintMaster精华指南](https://mobalytics.gg/poe-2/guides/paintmasters-essence-farm)的侧别容量与既有技能等级冲突说明作为gray人工参考，其数值表有陈旧内容，不用来覆盖固定MIT数值。技能等级跨来源组冲突用自有精确family规则记录，不泛化全部宝石标签；参考[GGG论坛3894211](https://www.pathofexile.com/forum/view-thread/3894211)玩家讨论与指南，证据不是staff算法，真机待验收。未下载来源数据文件、添加适配器或复制同行代码。

精华操作 v15 补充人工依据：[PoE2DB Crafted Modifiers](https://poe2db.tw/Crafted_Modifiers) 的公开游戏关键词说明，明确最多一条工艺词缀且其他行为与普通词缀相同，按 gray 对待，仅人工查阅，不下载数据文件或新增适配器。结合上述 GGG 0.3.0 / 0.5.0，实现前三档精华与后续普通通货交互；真机及低物等例外交互仍待验收，不从 tierLevel 推断门槛。

`crafted`、`desecrated`、`fractured` 的逐行状态解析是自有实现；参考同一 MIT PoB 固定提交 `src/Classes/Item.lua` 的结构与独立标志定义，不复制实现。PoB 的物品级 `self.crafted` 属编辑模式，不能映射为游戏工艺槽。公开 [GGG 玩家高级文本示例](https://www.pathofexile.com/forum/view-thread/3843434)只用于核对 `(fractured)`、`(desecrated)` 及 `Fractured Item` 的输入结构，不复制整件装备进测试，不把玩家帖子当成官方机制定义。[GGG 0.2.0e](https://www.pathofexile.com/forum/view-thread/3754474)提供破裂数值不应被神圣改变的直接证据；该解析阶段只保留并展示来源；破裂后续制作已由本文顶部 v28 人工机制依据单独登记。中文实际尾注/标题写法未验证，不从译名或词缀名推断状态。

### 结晶预兆人工规则依据

v17 左旋/右旋结晶预兆参考 [PoE2DB Omen公开说明](https://poe2db.tw/us/Omen)及[左旋](https://poe2db.tw/us/Omen_of_Sinistral_Crystallisation)/[右旋](https://poe2db.tw/us/Omen_of_Dextral_Crystallisation)标识页，仅人工查阅，按gray处理，不下载其数据文件。说明明确Perfect或Corrupted Essence限制移除前缀/后缀；结合已登记GGG0.3/0.5精华与工艺规则实现合法移除池的侧别交集。空池拒绝和不消费是工具行为推导，游戏真机待验收。只支持单枚配对，不推断所有预兆的叠加关系；名称复用现有两服官方static。CoE更新日志2026-02-11的精华计算器/结晶预兆/预兆支出仅为流程参照，不用作游戏机制证据或复制实现。

[GGG论坛3858079](https://www.pathofexile.com/forum/view-thread/3858079)的2026-06-09满六词缀戒指配右旋结晶与完美心智精华失败报告，为容量与移除侧冲突提供玩家实测旁证，非staff裁定；同贴深渊精华不稳定施放属于bug反馈，不推广为正常规则。[3902657](https://www.pathofexile.com/forum/view-thread/3902657)的玩家技能族冲突报告支持预兆不绕过已有冲突，仍按人工有限证据记录。


### 武器普通符文规则引用（2026-09-13）

[GGG 0.2.0e](https://www.pathofexile.com/forum/view-thread/3754474)确认元素、钢铁等普通符文具有法杖／长杖独立效果；具体效果依然来自已登记 ModRunes.lua 固定快照。当前 [Artificer’s Orb 物品说明转录](https://poe2db.tw/us/Artificers_Orb)顶部列出攻击武器、法杖、长杖和防具，页面下方旧 Ref 不能代替当前物品措辞。物品转录及社区单手／双手 cap 映射按 gray 人工规则证据对待，不加入抓取适配器或复制其数据文件；一手一孔、双手二孔与 caster 类型对应仍是规则推断，真机待验收。GGG 0.3.0 的额外掉落孔说明沿用已有登记。四族四档名称与效果来自原 MIT／官方三服静态来源，没有新增数据包。

数值 cap 的二级依据：[Fextralife Weapons](https://pathofexile2.wiki.fextralife.com/Weapons)单双手通则；不把旧 Mobalytics 页面关于 caster 不可镶嵌的说法作为现行事实。[GGG 0.4.0](https://www.pathofexile.com/forum/view-thread/3883495)具名 Limit 调整与当前四族目录无 limit 的事实共同支持普通四族重复镶嵌，不泛化有数量限制的其他 Rune/Idol/Soul Core。上述均为自有规则的人工证据登记。

### 符文锻造模型依据（2026-09-16）

v81 实现补充：逐条创建审计确认 483 条可见防具中 478 条属于已支持普通规则，另 5 条 Grasping Mail 声明（含 4 个同名变体）具有跨戒指词缀池和催化规则；不能只按英文名称排除一条。固定 `ModParser.lua:257–258` 区分三项防御枚举与通用 Defences，已登记 ModRunes 的钢铁符文属于前者，不增加结界。本次复用已有全部数据快照，无新增抓取、数据包、依赖或第三方运行时请求；已有状态制作已接入，Verisium 转换仍未接入。

符文锻造补充核对（2026-09-16）：沿用相同 MIT 固定提交的 `Item.lua:2561–2595` 和 `ModParser.lua`，用于结界、品质与本地修正的模型设计，不新增抓取适配器或提交第三方实现。[GGG 0.5.1 Hotfix 2](https://www.pathofexile.com/forum/view-thread/3949984) 提供保留破裂身份的直接依据；[GGG 0.5.2](https://www.pathofexile.com/forum/view-thread/3960375) 提供锻造预览镶嵌效果修复，[GGG 0.5.3](https://www.pathofexile.com/forum/view-thread/3968601) 提供高级非传奇防御损失调整及孔内珠宝保留修复。只人工引用官方说明；逐件转换、消费与其他交互仍需核对。范围、目录审计和验收算例见 [符文锻造调研](runeforging-research.md)。初始研究阶段未启用锻造基底制作或转换；后续 v81 已有状态支持见上一段。

### 武器面板公式参考（2026-09-13）

沿用已登记 MIT PoB2 固定提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e`，人工查阅 `src/Classes/Item.lua` 的本地属性派生公式（2500–2540）与本地修正判定（2423–2450），用自有 TypeScript 数学实现估算武器伤害、攻速、暴击和弩装填时间。仅作 primary 开源模型参考，不新增抓取适配器、不将第三方实现文件入库。公式与舍入是快照模型，游戏当前版本及真机显示待验收；目录 sourceQuality 不代表用户装备品质。

武器属性标题的人工兼容核对另参考 PoE2DB `/us/Makeshift_Crossbow`、`/cn/Makeshift_Crossbow`、`/tw/Makeshift_Crossbow` 公开展示；按既有 gray 来源处理，只登记标题语法，不采纳页面数值、不新增适配器。完整游戏剪贴板真机覆盖仍待验收。

### 多目标路线的交互参考（2026-09-13）

人工查阅 [CoE PoE2 入口](https://beta.craftofexile.com/?game=poe2)、[路线图](https://beta.craftofexile.com/roadmap)和[工具使用说明](https://www.craftofexile.com/how-to-use)，仅参考目标分组、步骤衔接、条件检查与材料展示的交互需求。路线图含未完成条目，默认入口有PoE1上下文，不能把其列表当作PoE2机制证据。本站搜索使用自有算法与既有已登记制作引擎；没有复制CoE代码、数据、权重或新增适配器。此项不生成词典/目录文件，不属于新的游戏数据抓取源。

2026-09-15 再次核对该公开路线图，其中列有将需求标识改为永久标识、变更制作起点时校验合法性及补充停止原因的事项。仅作为稳定目标引用与恢复流程的需求参照，不据清单推断 CoE 已完成对应功能。独立目标编号、失联引用保留及项目迁移均为本项目自有实现。


### 演练结果三语文本（2026-09-13）

复用既有 zh-CN / zh-TW 的 stats 与 items 登记项，分别生成译文，不新增抓取源或繁简互转。物品基底名仍继承 items 的 gray 等级，缺表可回退英文；属性与技能依各自 stats 模板，只有唯一、可逆且无结构注入的译文用于分享文本。当前无词缀名、标签、完整类别的权威三语表，保留目录英文。

交互参考 [CoE PoE2 功能说明](https://beta.craftofexile.com/whats-new?game=poe2) 的装备输出与本地化；[开发者说明](https://beta.craftofexile.com/developpers) 的 URL 导入不是任意中文文本兼容保证。仅阅读公开说明，不复制实现或数据，不向第三方提交用户原始装备。

### 已知英文身份与混合文本回读（2026-09-13）

在浏览器和项目恢复时，可从已登记的primary PoB2制作目录name派生英文身份字典；这不是新增译名表，不写回生成词典。原items译名优先，缺gray表时仍保留已知英文名，同译名/英文碰撞继续作为候选。没有新增网络来源或第三方请求。

规范英文Grants Skill行使用既有英文语法与制作目录完整固有属性核对；中文行继续使用独立CN/TW skill.*模板，不借英文回退猜中文技能。交互参考[CoE PoE2公开功能说明](https://beta.craftofexile.com/whats-new?game=poe2)的本地导入导出，未复制同行代码或数据。


### 已揭示亵渎词缀（2026-09-13）

骨骼施加与揭示规则补充：人工核对 [Desecrated Modifiers](https://poe2db.tw/us/Desecrated_Modifiers) 中公开材料说明和 [Minimum Modifier Level](https://poe2db.tw/us/Minimum_Modifier_Level) 关键词，gray，仅作为适用类别、64/40 等级门槛、满词缀移除及最低等级例外的规则依据；不抓其词缀表、权重或专有数据。骨骼三服名称复用已登记官方静态 ID 对齐结果。GGG 0.3.0 的隐藏属性与三选一说明仍为 primary 流程依据，三候选权重和中间交错制作行为未取得完整证据。

新增制作数据登记：上述 MIT PoB2 固定提交 ce566eac45ea8a86477f513c7ee65a1ebe60014e 的 src/Data/ModVeiled.lua，primary，SHA-256 95234097bcb70946ad451fbdb80b93cff3bd4a57abfdf29052305905fd32a632。构建期经 cache.ts 获取并只解析声明。文件混合普通装备亵渎、传奇珠宝及其他特殊记录，仅有明确前后缀、unveiled_mod 与唯一三族标签的记录进入本轮专属目录，其他项保留排除审计；标记专属来源，不进入普通通货池。weightVal依旧仅资格，不是揭示概率；不把三族标签注入基底绕过类别拒绝。游戏版权归GGG，保留既有MIT NOTICE。

人工规则参考 [GGG 0.3.0](https://www.pathofexile.com/forum/view-thread/3826682/filter-account-type/staff) 的骨骼/三选一及常规属性，[GGG 0.5.0](https://www.pathofexile.com/forum/view-thread/3932540) 的独立工艺/亵渎上限。[PoB2 PR1773](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/pull/1773) 亦说明普通词缀亦可为亵渎来源。PoE2DB /us/Keywords、/us/Rise_of_the_Abyssal_items 仅作gray公开关键词/材料说明人工参考，不采纳其词缀数据或权重。[CoE更新说明](https://beta.craftofexile.com/changelog)与路线图只用于工作流参考，不复制实现或数据。

### 腰带咒符栏与制作（2026-09-13）

人工规则使用[GGG正式0.2.0f](https://www.pathofexile.com/forum/view-thread/3762929/filter-account-type/staff)的新腰带30/60栏位范围及停止生成旧explicit增栏；[更早GGG预告](https://www.pathofexile.com/forum/view-thread/3753015/filter-account-type/staff)仅用神圣可重掷栏位说明，其32/65阈值不采用。来源级别primary，不新增抓取适配器或数据文件。现有MIT PoB固定快照的Belt固有行及charmLimit元数据沿用，三语范围说明复用各自官方stats模板。旧装备范围保留，未知范围不猜。
[GGG0.5](https://www.pathofexile.com/forum/view-thread/3932540/filter-account-type/staff)提供Genesis新基底背景，跨部位镶嵌仍需独立建模。CoE工作台仅参考分类、物等、制作方法及需求区域关系，不复制权重、数据或实现。

同阶段核对固定MIT src/Classes/Item.lua的Charm Slots面板与base+modifier栏数派生，仅参考结构不复制实现。Genesis资格隔离为基于GGG0.5及已登记有序资格的自有规则，不移除或改写源tags/记录；仅当前普通/揭示流程不启用genesis_tree_caster和genesis_tree_minion上下文。

### 骨骼施加预兆（v25）

人工核对 [GGG员工说明](https://www.pathofexile.com/forum/view-thread/3834266/filter-account-type/staff)及[正式0.3.0c](https://www.pathofexile.com/forum/view-thread/3851277/filter-account-type/staff)：三枚指定巫妖预兆仅支持武器和首饰，属primary部位证据。两枚定向死灵及Liege/Sovereign/Blackblooded的触发、方向和保证属性措辞沿[已登记Omen页](https://poe2db.tw/us/Omen)公开游戏文本转录人工核对，gray，仅说明参考，不下载其词缀表、概率、代码或规则数据文件；名称复用原三服官方static，巫妖标签复用固定MIT ModVeiled。同巫妖候选另核对[作者Lolcohol实作](https://mobalytics.gg/poe-2/guides/blood-mage-amulet-craft)及其游戏揭示截图，截图仅临时查看、不入库，按gray人工规则参考；正文一处把Sovereign误写Liege，名称映射以物品原文为准。当前仅实现至少三项合法同家族时的三候选演练；0/1/2候选的补齐、减项或消费没有充分证据，明确工具未支持，不推断游戏禁止；全部交互仍待真机。GGG论坛3849983玩家复现仅用于识别冲突/无候选反例，不当staff规则声明。没有新增网络适配器或浏览器第三方请求。

### 深渊回响（v26）

[GGG0.3.0b](https://www.pathofexile.com/forum/view-thread/3840893)确认修复已显示候选后补用深渊回响的错误，primary时机证据。[作者Lolcohol指南](https://mobalytics.gg/poe-2/profile/lolcohol/guides/abyss-and-desecration-crafting-poe-2-0-3)更新2026-07-07说明重选后可选回第一组三项；[首次反馈](https://www.pathofexile.com/forum/view-thread/3858859)及[未重选仍消费报告](https://www.pathofexile.com/forum/view-thread/3868988)支持首次得到机会即消费，按gray人工规则参考，不视为官方完整算法。名称复用既有三服static，公开Omen页措辞仅人工核查。[旧低档争议](https://www.pathofexile.com/forum/view-thread/3860899)混合Preserved/Essence/Putrefaction，不能判断当前普通Ancient或巫妖限定在第二组是否保留；证据不足，工具明确未验证该组合。没有新数据适配器、权重或解包数据，网页不向第三方请求装备。


### 消减预兆（Whittling）机制依据（v30）

沿用已登记官方三服 static 名称（国服“消减预兆”、台服“削切之兆”）与固定 MIT PoB2 词缀 level 字段，不新增数据抓取或生成物。[公开物品文本转录](https://poe2db.tw/us/Omen_of_Whittling)仅人工核对下一枚混沌移除最低等级属性的措辞，按 gray 规则参考。[作者制作指南](https://mobalytics.gg/poe-2/guides/omen-crafting)以法杖不同等级的实物说明，比较的是出现所需等级而非阶级；[玩家原始并列讨论](https://www.pathofexile.com/forum/view-thread/3687553/page/2)用于核对同等级多个候选，不采用其中未经统计的50/50数字。

[GGG 0.2.0g](https://www.pathofexile.com/forum/view-thread/3774660/filter-account-type/staff)明确修复破裂装备搭配Whittling/Erasure时的错误高亮，primary，说明早期[破裂争议](https://www.pathofexile.com/forum/view-thread/3751070)不能直接作为现行不兼容结论。当前演练在既有未锁定合法池中求最低等级，未知实值仍可按已确认身份比较；逐组合真机仍待验收。

本次仅接入单枚消减配基础混沌。高级混沌旧[报告](https://www.pathofexile.com/forum/view-thread/3839647)未充分区分最低等级例外；方向配对的全局最低与侧内最低交互也缺少独立实例，继续保留未支持门禁，不推断游戏禁止。CoE公开路线图仅用于预兆、移除风险及历史衔接的体验参考，不读取或复制其他模拟器代码、规则文件或权重。

### 光明预兆（Light）机制依据（v31）

[公开物品文本转录](https://poe2db.tw/us/Omen_of_Light)限定下一枚剥离石只移除亵渎词缀；[Lolcohol 亵渎指南](https://mobalytics.gg/poe-2/guides/abyss-crafting)说明移除不满意的已揭示词缀后重新亵渎。两页仅作 gray 人工规则依据，不复制代码、词缀表或权重；指南的其他交互及旧版本内容不据此开放。名称复用既有官方三服 static（国服光明预兆、台服光明之兆），来源身份沿固定 MIT 目录和原文标记。当前只支持单枚配基础剥离及已揭示的一组亵渎，未揭示、多预兆和腐化多亵渎继续未支持，游戏操作待真机验收。无新适配器、生成物或浏览器第三方请求。

### 珠宝词缀来源登记

2026-09-15 远古液态情感扩展沿用固定 ModJewel / LiquidEmotions 双来源：将范围材料精确引用的全零资格声明纳入工艺子域，节点语义继续与本条 tradeHashes 全文核对；共享增容声明通过材料和基底映射分别授权，不混入普通生成池。人工流程依据 [GGG 0.5.0 Delirium](https://www.pathofexile.com/forum/view-thread/3932540/filter-account-type/staff) 的替换已有属性及 10+3 远古材料；[PoE2DB Liquid Emotions](https://poe2db.tw/us/Liquid_Emotions) 仅核对材料说明和工艺含义，按 gray 参考，不采集其词缀表或权重。Very Large 由已登记固定 ModParser.lua 的明确标签核对；范围内天赋的属性转换与抗性不作为装备自身或角色最终贡献。CoE changelog 2026-08-03/04 仅参考模拟、目标与错误提示覆盖，不复制实现。范围品质及未核实交互仍单独标注，来源更新不意味着真实概率已知。

2026-09-15 失落珠宝常规制作规则人工核对：沿用固定 MIT 快照的 Item.lua（珠宝魔法容量 1/1、稀有固有容量 2/2）、[Modules/Data.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Modules/Data.lua)（Small 半径 1000）与 [Modules/ModParser.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Modules/ModParser.lua)（范围升级语义）；只阅读，不执行或复制实现。默认小半径以已登记 PoE2DB 基底列表及 [Time-Lost Ruby 公开说明](https://poe2db.tw/us/Time-Lost_Ruby) 的基底半径 1000 交叉核对，属 gray 人工机制依据，不采集新增数据表或权重。半径从当前词缀派生，不另存可失配的状态；导入核对来源半径，出口明确为演练文本。中文范围标题是工具接受语法，国服实际高级复制格式仍待样本验收。

2026-09-15 范围子域沿用同一固定 ModJewel：160 条具有正向范围珠宝资格的声明，其中 nodeType 1/2 对应的“小型／核心天赋”语义在构建期补成完整属性行，并要求与该条 tradeHashes 原文一致；没有对应时拒绝生成。独立 `radiusJewelOnly` 标记隔离普通珠宝、装备及动态标签，不借数据入库直接开放制作。无正向资格的范围专属工艺仍等待精确映射授权。沿用原 MIT 许可、来源指纹、缓存和离线流程，无新抓取或运行时网络请求。

本次扩展后为 160 普通、160 可生成范围、16 工艺专属、41 排除；8 条新增专属工艺均来自范围材料的精确映射，所有旧条目保持不变。完整缩放模板由 2952 增至 2953，缺少对应由 253 增至 261，未修改旧模板或猜测范围属性的缩放。下文较早接入记录中的排除数为当时快照计数。

2026-09-14 工艺子域扩展沿用下述固定 ModJewel 与已登记 LiquidEmotions 双 SHA，不新增抓取来源。仅将非范围材料精确引用、无 nodeType、前后缀一致且全部生成资格为零的 8 条声明标记为 jewelOnly + craftedOnly；普通可生成词缀仍为 160 条，排除审计为 209 条。声明涵盖三个条件效果、钻石最大混沌抗性、两种增容与两种侧别增效；数据存在不代表执行已开放，具体范围见 crafting-rules.md。构建复用既有 cache.ts 与受限 Lua 解析，运行时校验双来源和映射，工艺声明不得进入普通生成池。无新增第三方数据、依赖或浏览器请求。

接入既有 MIT PoB2 固定提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e` 的 [ModJewel.lua](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModJewel.lua)，按 primary 登记，游戏物品文本版权仍归 GGG。SHA-256 为 `44285abc35fa4c32b2b0ba169570c99b01fd97136d1a801462b9b1398db82e80`，377 条源记录中 160 条具有普通珠宝正向资格，217 条范围珠宝或无正向资格记录保留排除原因。仅经既有构建期 cache.ts 抓取与受限 Lua 解析器处理；0/1 仍只表示生成资格，不能当概率。源末项 jewel=0 后追加 default=0 补全统一格式，顺序不变；独立 jewelOnly 标记隔离装备域。CoE 公开路线图只作类别与流程覆盖参考，不采用其规则或数据文件。

[ZiggyD 制作指南](https://maxroll.gg/poe2/resources/how-to-craft-in-path-of-exile-2)的珠宝章节说明两前两后、蜕变至崇高的连续制作及普通珠宝无多档词缀；[PoE2 Wiki Jewel](https://www.poe2wiki.net/wiki/Jewel)区分四种基本珠宝与范围珠宝，并说明宝钻可由重铸获得。两者按 gray 人工规则依据，不采纳未核实的特殊品质、增容和腐化交互。[国服红玉](https://poe2db.tw/cn/Ruby)、[台服红宝石](https://poe2db.tw/tw/Ruby)及英文游戏说明仅用于逐字识别固定使用说明，不抓取它们的词缀表或权重；中文名称沿既有独立词典。用户未提供珠宝真机样本，客户端剪贴板格式及各机制游戏操作仍待验收。

### 双词缀崇高预兆规则依据

[强效崇高公开条目](https://poe2db.tw/us/Omen_of_Greater_Exaltation)说明下一次崇高增加两条随机词缀；[Game8 作者预兆指南](https://game8.co/games/Path-of-Exile-2/archives/491748)明确强效与左旋崇高组合增加两条前缀，对称右旋按其后缀限制处理。[ItFightsBack 自述制作过程](https://www.youtube.com/watch?v=TC5kILGv23A)明确用强效预兆搭配完美崇高。均仅作 gray 人工机制依据，不抓取词缀或权重；三档崇高继续沿已登记通货基础类别和等级规则，不能把强效预兆与高级崇高视为同一材料。少于两个合法空位时的消费行为未核实，不推定只加一条或退还预兆。CoE 路线图仅供覆盖比较；其列出的旧点金、富豪与强效剥离预兆已有停掉落证据，不据此推荐当前可获得性。

### 用户自填制作报价

报价由使用者在浏览器本地填写，属于 manual 用户输入；不作为入库数据或官方市场价格。只参考 [CoE 路线图](https://beta.craftofexile.com/roadmap) 的自定义价格、起点成本与费用明细需求，自行实现材料计数和小数运算，不复制其价格、代码或数据。所有物品及材料身份沿已有固定目录与手工规则；未新增浏览器第三方请求或市场数据适配器。

高级固定值 `current(base)` 格式参考已登记 MIT PoB2 固定提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e` 的 `src/Classes/Item.lua` 高级复制解析注释与结构（约 1145 行）。以自有解析器分别保留当前值和基础值，不复制其替换实现；中文标题与真机行为仍待样本验收，不从此结构推断催化来源、品质增量或生成权重。

催化品质导入的数值口径另人工核对 [PoB2 #2216](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/issues/2216)、已关闭的 [#2375](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/pull/2375) 与 2026-08-29 实际合并的 [#2453](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/pull/2453)。维护者说明和自述样本用于区分新版高级文本的基础值、独立品质/增效与交易复制的已增效值；属于 MIT 项目的 primary 实现参考，不冒充游戏官方保证。无客户端解包或新网络适配器，不复制完整玩家装备入库。三种品质标题只作结构识别，中文具体类型译法需样本或用户核对，不据此猜测催化剂逐颗品质增量。

### 祝福预兆规则依据

[Omen of the Blessed 英文条目](https://poe2db.tw/us/Omen_of_the_Blessed)、[国服说明](https://poe2db.tw/cn/Omen_of_the_Blessed)与[台服说明](https://poe2db.tw/tw/Omen_of_the_Blessed)一致说明下一次神圣石仅重掷固有属性，触发时消耗预兆。作为 gray 人工机制依据，不抓取其词缀、权重或价格。两服名称沿现有官方静态制作词典；未增加浏览器第三方请求。仅处理已核对的固有数值范围，保留显式、破裂与工艺词缀；授予技能、未知咒符位范围、腐化与传奇等既有限制保持不变。前后缀神圣预兆的检索结果属于玩家概念提案，不作为现存材料或规则接入。
### 绑定符文扩展词缀池（2026-09-17 核对）

人工阅读 PoE2DB 的 [Uhtred](https://poe2db.tw/us/Uhtreds_Sidereus)、[Kolr](https://poe2db.tw/us/Kolrs_Hunt)、[Vorana](https://poe2db.tw/us/Voranas_Carnage)、[Thrud](https://poe2db.tw/us/Thruds_Might)、[Medved](https://poe2db.tw/us/Medveds_Tending)、[Katla](https://poe2db.tw/us/Katlas_Gloom) 六个公开说明，按 gray 登记；只核对部位、空孔、绑定和独立 Bonded 条件，不复制数据库、权重或价格，不新增抓取适配器及浏览器第三方请求。身份、数值、词缀组和有序资格沿已登记固定 MIT PoB2 快照，六个名称对应七条类别记录与128条词缀。

[GGG 0.5.1 Hotfix 6](https://www.pathofexile.com/forum/view-thread/3955250/filter-account-type/staff)为 primary 机制修正依据，确认 Chronomancy 复合词缀的减缓效力方向修复；不外推旧装备更新方式。不同绑定符文共存、特殊孔和增效交互未因本次登记取得执行支持。v93 沿固定 MIT 身份接入除 Thrud 外五类单枚来源，实际词缀继续使用有序资格；没有新增数据表或来源抓取。详见[绑定符文核对](influence-runes-research.md)。

2026-09-17 补查同一固定 MIT `src/Classes/Item.lua` 的 Destruction 标签交集、增效相加和不可缩放边界，继续作为计算模型参考。[玩家 Aldur 交互报告](https://www.pathofexile.com/forum/view-thread/3973611)按 gray 原始经验线索登记：虽发布于官方论坛，作者非官方，录像未核对；只引用链接和自写摘要，不导入玩家装备或授权新制作行为。

# 合金类别映射（2026-09-14）

人工阅读 PoE2DB 的 13 个公开材料说明：[Runic](https://poe2db.tw/us/Runic_Alloy)、[Adaptive](https://poe2db.tw/us/Adaptive_Alloy)、[Protective](https://poe2db.tw/us/Protective_Alloy)、[Expansive](https://poe2db.tw/us/Expansive_Alloy)、[Swift](https://poe2db.tw/us/Swift_Alloy)、[Cyclonic](https://poe2db.tw/us/Cyclonic_Alloy)、[Prismatic](https://poe2db.tw/us/Prismatic_Alloy)、[Mystic](https://poe2db.tw/us/Mystic_Alloy)、[Sovereign](https://poe2db.tw/us/Sovereign_Alloy)、[Celestial](https://poe2db.tw/us/Celestial_Alloy)、[Transcendent](https://poe2db.tw/us/Transcendent_Alloy)、[Runebinder](https://poe2db.tw/us/The_Runebinders_Alloy)、[Runefather](https://poe2db.tw/us/The_Runefathers_Alloy)。手工建立材料与装备类别到既有 MIT PoB2 词缀 ID 的关系，单独保存于 `data/craft/alloys.json`，标记 gray；没有下载同行数据文件、复制实现、权重、价格、配方或词缀数值。网页数据库未明确授权，不能将页面底部仅适用于 Wiki 内容的许可当作整站数据库许可。

此表可整体移除；`DICT_ENABLE_POE2DB=0` 时不发布，浏览器在制作主目录就绪后只从本站读取一次，供查询、项目恢复和制作共用；失败可重试。没有新增网络抓取适配器。词缀文本、数值、侧别与等级继续来自已登记固定 MIT `ModItem.lua`；材料中文名来自既有官方静态名称。适性合金的权杖效果未在当前授权快照中对应，保留缺失，不以名称猜测 ID。

2026-09-18复核该已登记材料页，权杖仍声明使用命令技能时获得 Puppet Master 层数的30–50%超额几率；固定 MIT 快照中的 AlloyPuppeteerStacks1 是增加最大层数的后缀，AlloyManaNearbyAllyAttackSpeedHybrid1 是魔力与在场友军攻速的复合前缀，两者均不等价。继续保留空映射，不从其他工具补词缀身份。

`Required Level` 是穿戴需求，不能当作制作最低物等；固定 MIT `Item.lua:2283` 的 `floor(mod.level * 0.8)` 与已查页面展示一致。

GGG 0.5.0 的“替换已有词缀并加入工艺词缀”仍为 primary 流程证据；本次目录查询不授权制作操作，低物等、已有工艺、破裂、增效等交互需分别落实。当前表绑定 PoB2 提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e` 及其 `ModItem.lua` 哈希；来源变更必须重新核对。


### 溶剂亵渎混合抗性操作画面（gray，2026-09-15 核对）

来源：Wilucco [PoE2 FINALLY has Resistance Swapping!!](https://www.youtube.com/watch?v=ryfFStZekzo&t=67s)，上传 2026-06-23（不等于已验证客户端构建日期）。约 1:07–1:21 同名胸甲在灵魂之井由未揭示转为冰霜/混沌抗性，再用雷霆溶剂转成闪电/混沌抗性；其余五项不变，转换前后可见绿色来源背景保持。用于该亵渎混合抗性来源保留的建模依据，不推广到工艺标记、破裂混合状态的资格或消费。国服高级文本与后续光明预兆交互仍待真机验收。

不复制视频、截图、字幕或作者配方入库；临时研究材料仅本机保留。没有新抓取适配器，关系与数值继续来自既有已登记目录；关闭 gray 溶剂表时，相应转换能力停止。此公开视频无明确数据再分发授权，按 gray 记录，MIT 仅覆盖本仓库自有实现。

# 普通防具锻造配方核对（2026-09-16）

[PoE2DB Verisium 公开页](https://poe2db.tw/us/Verisium)与[Runeforging 公开页](https://poe2db.tw/us/Runeforging)展示输入基底、输出基底和材料数量。本次按 gray 研究来源登记，只将公开 HTML 暂存于本地临时目录作关系审计，不复制同行数据文件、权重或实现，不引入浏览器第三方请求。数据库页没有明确授权，Wiki 文章许可不扩展到数据库。任何后续入库配方必须独立表、可关闭并登记版本和来源哈希；本次登记不代表已启用转换操作。

后续目录接入：`data/craft/runeforging.json` 为独立 gray 关系表，仅收录经当前目录唯一身份核对的普通防具候选关系、Verisium 数量和固有模板变化标志，不含外站属性数值、价格或概率。普通区409行逐行记账，未解析行保留序号和原因；固定来源页哈希、六类 MIT 基底来源及提交共同约束解释。游戏版本尚不能完整确认，明确记 null。可整体移除此表；`DICT_ENABLE_POE2DB=0` 时不发布且清除旧产物。表存在不直接授权转换；装备当前状态、固有掷值和特殊交互仍由后续动作核对。

2026-09-16 结界符文人工核对沿用固定 MIT ModRunes.lua（SHA-256 `d3dac48143209d7d9a02a8c03bd86f21604a0961a8ced49290d6a1d243f8223a`）、Item.lua 与 ModParser.lua；无新增抓取表。四档 Ward Rune 为本地平值，四档 Charging Rune 为全局再生提高；普通效果不包含 Bonded。[Ward Rune](https://poe2db.tw/us/Ward_Rune)、[Charging Rune](https://poe2db.tw/us/Charging_Rune) 仅 gray 公开说明人工参考，不采数据或权重。公式、取整与实机限制见 [结界符文核对](ward-runes-research.md)。

普通镶嵌物缩放补充（2026-09-16）：同一固定 MIT ModScalability 快照的匹配范围纳入 augments 普通效果行，不纳入 Bonded。新增 492 条声明，原 2988 条保持不变；17 条新增缺失保留未知。Rebirth 的 `per_minute_to_per_second_2dp_if_required` 使用已登记 ItemTools.lua 与 Common.lua 的内部 60 分母及显示两位小数规则；固定源哈希和四档声明进入目录校验。参见 [扩展防具符文核对](extended-armour-runes-research.md)，无新数据源或浏览器外部请求。

符文升级机制补充（2026-09-16）：沿用固定 MIT ModRunes 的 Masterwork 材料身份和高级／完美档效果；原孔升级关系参考 [PoE2DB 材料说明](https://poe2db.tw/us/Masterwork_Rune)（gray，仅人工核对，不复制表）及 [GGG 论坛玩家第一手使用记录](https://www.pathofexile.com/forum/view-thread/3944462)（community，不等同官方规则）。[角色特殊孔问题报告](https://www.pathofexile.com/forum/view-thread/3979498)与固定目录的 Chakra 标志存在适用差异，不能仅按目录标志开放角色孔。当前只建模15基础家族高级→完美的普通装备原孔操作，腐化、低档和特殊孔仍待核实；不新增抓取适配器或生产依赖。

2026-09-18补充：[EODGamerz 原作者符文升级演示](https://www.youtube.com/watch?v=km0LJlgPOvU)（2026-06-08）按gray人工机制参考登记。已看01:15–01:40的高级铁符文升级确认与结果，以及05:15–05:40的低阶顺序讲解；后者未展示低阶操作，须与实操证据分开。只保留自写观察，不入库视频、字幕、帧图或玩家装备，不采集价格／概率，不新增适配器。固定目录15个四档家族与Tempered三档的审计及实施边界见[符文逐级升级核对](masterwork-rune-research.md)。

限量镶嵌物补充（2026-09-16）：只读核对同一固定 MIT 提交的 `CalcSetup.lua`（SHA-256 `049cfc52435f20c607c4517533f33a4ac9bb8d0c26755790bd6be4c810bce396`），其角色孔／装备计数按 `limitId` 或名称跨部位累计并产生警告。[GGG 0.4.0 官方说明](https://www.pathofexile.com/forum/view-thread/3883495/filter-account-type/staff)证明非法孔可使已有装备无法使用；[跨武器套复现](https://www.pathofexile.com/forum/view-thread/3897395)和[同件重复旧装备案例](https://www.pathofexile.com/forum/view-thread/3899544)是 community 第一手记录，不能当作当前全部游戏规则。Protection／Nourishment 的效果与逐数值增效沿用已登记 ModRunes／ModScalability，无新表、无同行代码或浏览器请求。后续 v86 已接入两项普通防具分支及已有超限修复，其他限量族尚未开放；范围与验收见 [限量镶嵌物核对](limited-augments-research.md)。

### 属性精华与护甲片原始画面核对（2026-09-18）

属性精华与护甲片补充：[Diztoh 的头盔制作原视频](https://www.youtube.com/watch?v=yegMdBTuEtY)，上传于 2026-07-03，按 gray 第一手操作记录登记。人工检查约 00:47–00:54 的材料提示、魔法头盔和稀有结果，以及 03:50–04:12 片段内的护甲片库存与品质连续变化。仅提交自写观察及与固定 MIT 目录的身份对应，不入库片段、截图、字幕或作者装备。该记录不证明三属性在全部类别上均可生成，也不提供单颗品质的完整分布；不新增抓取适配器或浏览器外部请求。

### 防御精华原始画面核对（2026-09-18）

v115 接入采用的规则推导：以原作者单防御／双防御实际产物为锚点，按同一 MIT 快照的七种互斥原生防御标签与三档固定范围，解析 21 个材料类别映射。其余五种防御组合及低两档是按固定声明推导，未称为逐一真机观察。符文锻造基底保留原生标签，因此结果身份沿标签而非当前防御／结界面板派生；黄金基底等没有唯一标签时继续不解析。目录身份、范围、前缀冲突组、来源 URL／哈希完整校验；材料使用等级与具体词缀等级分离。低物等例外继续沿现有限制，不由视频擅自放行。

新增人工机制依据：[ronarray 防具制作原视频](https://www.youtube.com/watch?v=rQ0kydfdesI)，2026-06-07 发布。按 gray 作者第一手演示处理，不是 GGG 官方算法；通过字幕定位后检查 03:05–03:45 和 13:15–13:55 游戏画面，确认高级防御精华在纯护盾头盔及闪避／护盾胸甲上的实际工艺行。仅提交自写观察、时间点和与既有 MIT 目录的对应推断，片段、字幕、截图及真实装备数据不入库，不新增适配器或浏览器第三方请求。详见 [防御精华具体结果核对](defence-essence-research.md)。其余防御类别、其他档位、属性精华及权重不视为视频已证明。

### 防御精华后续核对（2026-09-16）

- GGG 0.3.0c 官方公告：https://www.pathofexile.com/forum/view-thread/3851277 ，primary 人工规则参考；确认法器／小圆盾的历史类别错误已修复，不导出游戏数据。
- 原始错误报告：https://www.pathofexile.com/forum/view-thread/3835288 ，玩家公开报告，仅用于比对修复时间，不能代表当前规则。
- SaVeQ 原视频：https://www.youtube.com/watch?v=ppH5TmZTsCQ ，作者公开操作讲解，人工辅助参考；仅保存自写判断和链接，不复制视频、字幕、权重或价格。尚未逐帧验收。
- PoE2DB 的 Body_Armours_str_dex／Helmets_dex 页面沿用现有 gray 人工参考登记，仅交叉核对公开展示；不新增抓取器或复制同行数据。审计矩阵完全来自仓库已有 MIT 目录。

### 未揭示亵渎期间追加崇高（2026-09-16）

[SaVeQ 制作视频](https://www.youtube.com/watch?v=mA6cjs1frao&t=590s)，上传 2026-06-19，按 gray 作者第一手操作记录登记。人工核对约 10:06–10:50 连续画面：远古肋骨与左旋亵渎预兆生成前缀占位，未揭示时追加两个抗性后缀，随后完成首次三选一。材料名称以可读提示框核对，修正自动字幕的 Ancient Orb；强效搭配完美崇高的层级另结合作者讲解与既有独立规则。没有观察到深渊回响第二组，不能推断其最低等级或巫妖限定。

仅入库自写证据边界与链接，视频、字幕、帧图留在本机临时目录，不复制作者配方、价格、权重或完整装备。无新增抓取适配器、客户端解包或浏览器第三方请求；本次登记不直接授权新操作。实现缺口和验收见 [未揭示亵渎核对](pending-desecration-research.md)。

## 2026-09-16 分类注能器原始画面核对

[Diztoh 0.5 铁匠注能器实操](https://www.youtube.com/watch?v=KRrvAvt7Azo)（2026-06-10）作为 gray 人工机制参考，核对材料身份、单颗消耗、品质变化与腐化同次发生。只记录机制观察，不入库作者装备、完整文本、视频、截图、字幕、价格或概率。另读 [旧 Vaal Infuser Wiki 正文](https://www.poe2wiki.net/wiki/Vaal_Infuser)及其引用，明确旧名称和统计推论不能直接授权当前四分类材料。与 [CoE 更新说明](https://beta.craftofexile.com/changelog)核对品质导入和条件衔接，只读公开文字。没有新增适配器、执行参数或浏览器外站请求；详细范围见 [品质实验审计](quality-infuser-research.md)。

[Jazzarus 2026-05-16 原始讲解与演示](https://www.youtube.com/watch?v=n2qmCCamtis)只用于旧通用注能器的画面／转录交叉核对。公开转录出现“21% 已腐化”字样，但逐帧画面显示无腐化标记，且继续用下一颗到 22%；不以该转录授权“腐化后仍能注能”。同属 gray 人工参考，临时片段不入库。

## 2026-09-17 注能器公开逐次工作表

[vaal infuser data](https://docs.google.com/spreadsheets/d/1kw0zuThQeKG6k2NfLbVf9JMcV6Rp6rbOLL_WB_K6FU4/edit)为已登记 Wiki 引用的作者公开实验工作表，属于 gray 人工研究资料。读取可公开访问的版本分页、字段和逐次记录，用于核对操作前后品质、物等、腐化及截断口径；不是 GGG 官方概率或四类材料共享规则。无明确再分发许可，原始表格只临时存于本机，不入库、不增加运行时请求或数据适配器；只提交自写审计及来源链接。分页名本身不足以确认客户端版本或材料类别，须与记录内容分开核对。


### 影响符文与骨骼交互的原始经验线索（2026-09-17）

人工阅读 [Chronomancy 亵渎回答](https://www.reddit.com/r/PathOfExile2/comments/1ua53i8/can_you_desecrate_a_destruction_modifier/)与[作者 Thrud 长杖制作记录](https://www.reddit.com/r/PoECrafting/comments/1ue6fxh/did_l_scam_these_buyers/)。归为 gray 玩家第一手经验，不是官方规则；仅保存链接与自写机制摘要，不复制装备、图片、价格、统计或词缀表。前者自述鞋子曾通过亵渎获得移速／减缓效力复合词缀；后者明确在已有 Thrud 后施加骨骼、追加前缀再揭示，但未列骨骼档位和揭示三候选。不能据此推定六族全覆盖、巫妖／回响／腐烂组合、完整池或概率；详见绑定符文核对文档。没有新增网络适配器。

[Kolr 手套制作者原帖](https://www.reddit.com/r/PathOfExile2/comments/1u6sljr/finished_my_glove_craft_for_my_bow_martial_artist/)同属 gray 人工机制参考。2026-09-17 从搜索索引取得作者正文，直连全文读取失败；作者描述镶入 Kolr 后亵渎取得地形连锁，不满意则使用光明预兆重试。只登记链接与自写摘要，不保存装备、成本或图片。此证据支持普通骨骼交互方向，不能证明当前版所有候选、材料档位或概率；模拟候选继续来自已登记 MIT 快照，并明确区分规则推导与实测。

2026-09-17 补充以下 gray 原始玩家记录，已读取公开正文，只保留链接及自写摘要，不复制装备、图片、价格、概率或候选数据：

- [Soul 胸甲制作记录](https://www.reddit.com/r/PathOfExile2/comments/1ubg1cp/non_eb_mana_stacker_chest_with_the_new_soul/)明确在 Medved 来源存在时，先用普通属性占位，再光明剥离并揭示能量护盾／魔力混合词缀。
- [Decay 手套制作记录](https://www.reddit.com/r/PathOfExile2/comments/1v7rnik/expected_a_warrior_buyer_but_a_monk_showed_up_for/)在最终后缀亵渎步骤列出生命偷取等 Decay 候选；[另一作者](https://www.reddit.com/r/PathOfExile2/comments/1uatel8/way_of_the_stonefist_glove_craft/)描述先镶 Decay 符文，再揭示普通奥术增强并剥离重试。
- [Vorana 制作者实验自述](https://www.reddit.com/r/pathofexile2builds/comments/1typtkt/very_nice_new_helmet_affix_for_rampage_bear_with/)报告腐烂尝试中出现怒火消耗效率；最终展示装备是购入，不冒称其制作成果。其次数不能作为权重。普通揭示候选属于既有普通池与来源标签的规则组合推导；[战吼头盔求助回复](https://www.reddit.com/r/PoECrafting/comments/1wfbr3z/warcry_gemling_helmet_craft_help/)只是拟议普通骨骼路线，不当作实测。

这些记录不足以证明全部预兆组合、材料档位、版本一致性或真实概率。候选仍来自固定 MIT ModItem/ModRunes，腐烂占位规则沿用已登记规则；没有新增抓取适配器或第三方数据包。
# 2026-09-17 权杖镶嵌核对（实施前登记）

沿用已登记 MIT PoB2 固定提交的 `Bases/sceptre.lua`、`ModRunes.lua` 与 `ModScalability.lua`，不新增数据包。[GGG 0.2.0f](https://www.pathofexile.com/forum/view-thread/3762929)直接确认权杖可有孔；[制作者原始流程](https://www.reddit.com/r/Poe2BudgetCraftGuide/comments/1qg0g6p/how_to_craft_multiple_over_300_div_sceptres_with/)第六步记载加孔，帖子明确属于0.4，仅作 gray 操作说明参考，不采纳其重组、概率或利润。[权杖](https://poe2db.tw/us/Sceptres)、[蛇神像](https://poe2db.tw/us/Snake_Idol)、[野猪神像](https://poe2db.tw/us/Boar_Idol)及[巧匠石](https://poe2db.tw/us/Artificers_Orb)按既有 gray 人工机制参考读取。巧匠石页面未直接列权杖；普通单手孔位规则与固定目录上限的映射须标为建模推断，真机待验收。效果区分玩家、友军、召唤生物和伙伴，绑定效果不默认激活；不抓取同行代码、数据或真实装备样本。


### 珠宝瓦尔增删词缀的原创说明（2026-09-18）

人工规则参考，gray：[sirgog 原创视频](https://www.youtube.com/watch?v=YVDDZ6xVpCI)，YouTube 元数据发布日为 2025-01-24。20:39–21:56 是珠宝章节；21:30–21:41 明确描述随机增加或移除一个词缀，以及新增可突破普通四词缀、两前两后的限制。它与上文已登记的同作者 Mobalytics 文章属于同源说明，不能算两份独立实验证据。仅人工记录结论，不转载字幕或视频、不导入权重；2025 年概率和其他类别结论不作为 0.5 规则。详细证据边界和实现影响见 [珠宝瓦尔增删核对](jewel-vaal-affix-research.md)。


## 谵妄精华天赋身份审计（2026-09-18）

沿既有三服官方 trade2/data/stats primary 快照、固定 MIT Essence.lua／ModItem.lua，以及既有 PoE2DB 天赋树 gray 快照，核对 `stat_2954116742|节点编号` 的分组与节点身份。未新增抓取适配器、未更新快照、未把交易条目或树节点当作生成权重／精华合法池。范围及可复核哈希见 [谵妄精华天赋核对](delirium-passive-research.md)。

新增 gray 人工机制参考：[KingKongor 的胸甲制作原录像](https://www.youtube.com/watch?v=guc11SXS77Y)，元数据上传日 2026-06-16，作者标题标注 0.5。检查约 01:36–02:53 的材料提示、实际扣减和连续产物；确认普通核心天赋及 Paragon 的生成实例，以及混沌石移除后重做。仅保存自写观察、时间点和与既有节点身份的对应，不入库视频、字幕、截图或完整玩家装备，不采用作者价格与命中率；没有新增适配器或浏览器外站请求。录像未显示该词缀的高级分组说明，不独立证明工艺冲突、完整池或当前国服行为。

同源补充检查 03:08–04:29：Ancient Rib 的最低词缀等级 40 提示、左旋亵渎施加、深渊回响实际重选及第二组。将可见生命值与固定 MIT 目录的出现等级交叉核对，不补造被摄像头遮挡的候选数字，不将一个合法样本证明为完整分布或巫妖继承。详见 [未揭示亵渎核对](pending-desecration-research.md)；材料、素材与再分发边界沿本条既有登记。

## 黑血预兆与回响的原始实操（2026-09-18）

新增 gray 人工机制参考：[SaVeQ 项链制作录像](https://www.youtube.com/watch?v=y33hrOrSilE)，元数据上传日 2026-07-22，标题标注 0.5。人工检查约 19:22–19:36 的保存完好的锁骨、回响提示、黑血预兆消费消息和连续两组三选一；与既有固定 MIT ModVeiled.lua 的五个 Kurgal 词缀身份核对。字幕下载受 429 限流，结论来自画面，不采用不完整自动转录。仅提交自写观察和来源链接，不入库视频、帧图、完整玩家装备、价格或权重；不新增适配器或浏览器第三方请求。详见 [巫妖回响核对](lich-echoes-research.md)。


### 2026-09-18 高品质首饰成品补证

[Belton 戒指原视频](https://www.youtube.com/watch?v=x_Wt8jOXVtY)按 gray 第一手作者展示登记，无再分发许可；用于人工核对物等80裂隙戒指显示70%魔力品质及精华移除后的成品状态。读取自动字幕与01:20–02:05画面，成品观察与作者流程陈述分开记录；不采用其价格、锁定材料机制或概率。视频、字幕、截图及完整装备不入库，不新增抓取适配器。既有 Carnarius 项链视频另核对06:25–07:15催化讲解片段，未取得逐颗配对实录；CoE只参考公开交互，不采用其增量、权重或实现。详见品质与催化剂研究文档。


### 2026-09-18 普通催化剂连续施加实例

[XTheFarmerX 戒指制作原视频](https://www.youtube.com/watch?v=_sSjC5LX_Ck)（元数据2026-06-05）按gray原作者游戏画面登记，无再分发许可。人工读取01:20–02:45，核对物等77稀有金戒指的Tul’s Catalyst、冰霜品质与同一叠库存连续扣减，支持该样本单颗+1和+2；不采用作者对催化崇高概率倍率的推测，不外推所有物等完整分布。只提交自写观察和引用，不新增适配器，不入库素材与完整装备。详见[催化剂逐颗施加调研](catalyst-application-research.md)。

### 2026-09-18：戒指两族回响书面流程与目录审计

[Lolcohol 戒指制作指南](https://mobalytics.gg/poe-2/profile/lolcohol/guides/crafting-guide-55-68-chaos-resistance-ring)作为gray人工机制参考，页面标注更新于2025-09-19。仅自写归纳保存完好锁骨、右旋死灵、黑血／巫妖和回响的组合说明；不复制正文、作者装备、价格或概率，不作为当前版真机证明。四条基底／巫妖组合的候选审计使用已登记MIT固定目录和自有核心，不新增数据适配器。来源强度、代码门禁与后续验收矩阵见[巫妖回响核对](lich-echoes-research.md)。

## 混沌石无新增候选边界线索（2026-09-18）

沿用已登记的 CoE 公开 changelog 作为 gray 人工参考，只核对2026-09-17的行为修复说明，不读取实现、候选表或权重。该日志不等于游戏规则实证，未因此新增适配器或开放动作；当前核心边界、搜索排除与所需证据见 [混沌石边界核对](chaos-empty-outcome-research.md)。

## 制作目录快照版本核对（2026-09-18）

沿已登记 MIT PoB2 来源核对上游提交 `49e93925dcb79024175c58d25befadab67b4dd44`，其提交说明明确为导出0.5.5数据；[与本仓库固定提交的比较](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/compare/49e93925dcb79024175c58d25befadab67b4dd44...ce566eac45ea8a86477f513c7ee65a1ebe60014e)显示固定提交在其后13次提交、无落后提交，目录实际引用的37个源文件均不在变化文件列表中。因此将制作目录 gameVersion 标为0.5.5，含义仅为上游数据快照版本，不声称当前客户端或国服同版本。官方三服名称来源仍各自保留未核对状态，权重仍为unknown；未新增抓取来源或解包产物。

## 原作者权重研究（2026-09-18）

Butsicles原始0.2.0研究、Krakenbul本人说明及其公开重组器表格按gray人工研究登记，具体链接与使用边界见 [权重来源](craft-weight-provenance.md)。只核对原作者链、方法和版本；未下载或入库权重表，未建立适配器，未取得本项目再分发许可，执行目录继续不含真实概率。

## 中文催化剂录像候选核对（2026-09-18）

B站原作者风残耶视频BV1NQeT6nEvw及流放老瓦匠视频BV1ByPceiE8j，按gray人工研究登记；链接、日期、实际查看范围与排除理由见 [催化剂逐颗施加调研](catalyst-application-research.md)。使用公开只读元数据核对日期，近期片段仅在公开播放器查看；未取得高清画面、原生复制文本或单颗品质配对，不新增执行规则、解析语法或数据适配器。截图和完整装备文本不入库。

## 法杖专属符文（2026-09-18）

沿用上述固定 MIT PoB2 ModRunes / ModScalability 来源，逐项核对11种法杖分支的身份、完整主效果、绑定元字段、等级与限量；本轮未更新上游快照。白名单与缩放声明保存于 wandRuneData.ts，运行时仍校验目录来源与各条元数据，未使用同行的执行代码或数值文件。

[CoE公开更新说明](https://beta.craftofexile.com/changelog)中的符文子类别与导入修正只作流程对照：同名材料的 wand / staff 分支不能混用，导入起点与后续模拟必须共同校验。搜索命中的其他工具物品页不作为实现数据源。绑定角色效果与 Legacy of Runeseeker's Call 的符文间增效未据此开放。

v126 同样沿用该固定 MIT 来源，接入8个 staff 特殊符文分支；staffRuneData.ts 的完整记录与现有目录逐项一致，绑定元数据参与身份核对而不声明角色收益。没有新增上游文件、网络适配器或运行时请求。逐数字缩放、资格隔离与验证边界见[长杖符文研究](staff-runes-research.md)；CoE 对照明确使用 `?game=poe2`，不将其更新说明当作机制实测。

## 装备类别跨服同形词（2026-09-18）

沿用用户国服高级文本的类别观察，以及已登记 poe2db 台服 [Wands](https://poe2db.tw/tw/Wands)、[Staves](https://poe2db.tw/tw/Staves)、[Foci](https://poe2db.tw/tw/Foci)、[Sceptres](https://poe2db.tw/tw/Sceptres)、[Belts](https://poe2db.tw/tw/Belts) 列表页。后者只核对既有缓存中的类别标题，按 gray 人工术语证据处理，不视作台服剪贴板实测；未新增网络适配器或复制页面。国服“法杖”与台服“法杖”含义不同；cn 列表标题不得覆盖用户国服原生观察。映射范围及未确认项见[文本格式](item-text-format.md)。

## 施法武器魂核（2026-09-24）

沿用已登记固定 MIT ModRunes、ModScalability 来源，核对10个 wand／staff 魂核身份与5条逐值缩放声明；不新增适配器或更新快照。用户指定的 [CoE 正式入口](https://www.craftofexile.com/?game=poe2)仅作为公开流程对照，其推荐新版和权重说明不作为实现或概率数据源。完整边界见[施法魂核研究](caster-soul-cores-research.md)。

## 深渊精华流程复核（2026-09-24）

沿用固定 MIT 精华与词缀目录及已登记的 GGG 论坛3858079。新增人工机制参考为[Bclever88胸甲原帖及作者回复](https://www.reddit.com/r/PathOfExile2/comments/1wn934z/spirit_body_armor_first_big_craft_of_the_league/)，只保存自写流程摘要与链接，不复制图片、装备文本或数据集；玩家自述不是当前版本全部规则的证明。CoE公开日志只提供复核线索。该节点不新增采集适配器、执行参数或材料授权，具体缺口见[深渊精华研究](abyss-essence-research.md)。

## Chrome 扩展适配参考（2026-09-24）

本轮新增的是规划与人工参考登记，不新增抓取适配器、词典或运行时请求。已有制作研究的登记保留，但原独立制作模拟器计划无限期搁置。

| 来源 | 用途与等级 | 使用范围与边界 |
| --- | --- | --- |
| [CoE 新版介绍](https://beta.craftofexile.com/whats-new)、[PoE2 入口](https://beta.craftofexile.com/?game=poe2)、[开发者说明](https://beta.craftofexile.com/developers) | gray，交互与公开集成文档参考 | 确认新版界面、功能区域及 eimport；仅人工查看公共页面和控件，不复制站点源码、语言包、目录或权重；尚未完成扩展兼容性验收 |
| [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) | primary，官方平台说明 | 用于内容脚本、执行隔离与设置存储设计，不作为游戏术语或制作规则来源 |
| 拟建 `data/l10n/coe-beta/ui.zh-CN.json` 与 `data/l10n/aliases.zh-CN.json` | manual，自写界面译文与经核对别名 | 按需创建；复用现有国服词典来源身份，未经确认不从繁体包补译；词典随扩展打包，保留原 gray 开关和来源元数据 |

以上页面只用于规划核对。此前浏览器基底检索存在异步更新，尚不能据此确定全部事件与 DOM 兼容性，后续记录于 `docs/chrome-extension/compatibility.md`（实施时创建）。


### 扩展标签 UI 人工译名（2026-09-25）

沿用 CoE Beta 公开界面人工适配来源，仅观察 `#filterSelector li.tag` 与 `.modTag` 的文字和身份；不复制规则、权重或实现。20 个英文标签及 Non- 变体在扩展 `regions.ts` 中维护人工简体译名，属于 manual。用户高级装备样本辅助核对常用标签；Caster“施法”是人工 UI 用语，尚无国服独立标签真机证据，不标为官方已核实译名。未知标签保留原文。


### 扩展新版介绍页术语核对（2026-09-25）

0.1.30 沿既有 `data/craft/catalog.json` 国服名称核对四种 Flux 与 Vaal Infuser 系列，沿 `data/dict/zh-CN/items.json` 核对 Gloam／Tenebrous／Dusk／Penumbra 首饰及 Distorted Amulet；只增加人工组合句，不复制外站规则文件。[PoE2DB 简中 Strongbox](https://poe2db.tw/cn/Strongbox) 按已登记 gray 来源人工核对“保险箱”，页面标签亦含“施法”，可作为 Caster 人工译名的社区交叉证据，仍不等于国服真机验证。Distilled_Emotions／Distilled_Ire 页面读取均为404，不作为译名证据；分类暂保留英文。


### 扩展分类名称人工译文（2026-09-25）

0.1.35 仅从新版 CoE 可见 `categoriesSelector`／`classSelector` 记录类别名及选择身份，不读取执行源码或规则库；89条分类／分型在既有 UI 表中人工维护。Quarterstaves、Bucklers、Flails 分别依据现有国服基底表核对为节杖、轻盾、连枷；其余类别沿既有文本类别／国服物品名称和人工界面说明。BASE译为基础类型，STR／DEX／INT展开为力量／敏捷／智慧，不改变ID。分类用语不等同于国服客户端类别行已全部真机核对。碑牌、地图石等未核实分类暂保留英文。


### 扩展 Data 类别与装备卡人工译文（2026-09-25）

0.1.37沿已登记CoE可见DOM观察，补齐Data中实际出现的26个类别单复数形式及1条空筛选提示；类别译名复用0.1.35对应表。装备卡属性分段“能量护盾／符文结界／智慧”沿既有国服词典与用户高级装备文本用语，仅限定`.item .property`上下文。无新增来源、同行代码或规则文件；只保存自造最小DOM回归，不归档原站全页。


### 扩展蓝玉戒指文本导入核对（2026-09-25）

0.1.39复用既有items国服Sapphire Ring→蓝玉戒指与stats的`explicit.stat_4220027924`冰霜抗性文本身份。该stat ID仅标识已登记翻译模板，不将交易词典的explicit前缀用作基底属性生成规则；来源分组由高级文本头和原站导出分离核对。只使用自造普通／魔法／稀有文本与公开导入导出界面，不复制CoE词缀池或制作源码，不新增数据来源。
