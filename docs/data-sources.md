# 数据源登记表

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
| `packages/item-core/src/export.ts` 中的类别标题对照和首批转接白名单 | 手工适配装备剪贴板标题；白名单来自公开 CoE 界面中的合成法器黑盒验收，仅作兼容范围标记，不含第三方 mod 数据或权重 |
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

`crafted`、`desecrated`、`fractured` 的逐行状态解析是自有实现；参考同一 MIT PoB 固定提交 `src/Classes/Item.lua` 的结构与独立标志定义，不复制实现。PoB 的物品级 `self.crafted` 属编辑模式，不能映射为游戏工艺槽。公开 [GGG 玩家高级文本示例](https://www.pathofexile.com/forum/view-thread/3843434)只用于核对 `(fractured)`、`(desecrated)` 及 `Fractured Item` 的输入结构，不复制整件装备进测试，不把玩家帖子当成官方机制定义。[GGG 0.2.0e](https://www.pathofexile.com/forum/view-thread/3754474)提供破裂数值不应被神圣改变的直接证据；本阶段只保留并展示来源，不因此开放特殊制作。中文实际尾注/标题写法未验证，不从译名或词缀名推断状态。

### 结晶预兆人工规则依据

v17 左旋/右旋结晶预兆参考 [PoE2DB Omen公开说明](https://poe2db.tw/us/Omen)及[左旋](https://poe2db.tw/us/Omen_of_Sinistral_Crystallisation)/[右旋](https://poe2db.tw/us/Omen_of_Dextral_Crystallisation)标识页，仅人工查阅，按gray处理，不下载其数据文件。说明明确Perfect或Corrupted Essence限制移除前缀/后缀；结合已登记GGG0.3/0.5精华与工艺规则实现合法移除池的侧别交集。空池拒绝和不消费是工具行为推导，游戏真机待验收。只支持单枚配对，不推断所有预兆的叠加关系；名称复用现有两服官方static。CoE更新日志2026-02-11的精华计算器/结晶预兆/预兆支出仅为流程参照，不用作游戏机制证据或复制实现。

[GGG论坛3858079](https://www.pathofexile.com/forum/view-thread/3858079)的2026-06-09满六词缀戒指配右旋结晶与完美心智精华失败报告，为容量与移除侧冲突提供玩家实测旁证，非staff裁定；同贴深渊精华不稳定施放属于bug反馈，不推广为正常规则。[3902657](https://www.pathofexile.com/forum/view-thread/3902657)的玩家技能族冲突报告支持预兆不绕过已有冲突，仍按人工有限证据记录。


### 武器普通符文规则引用（2026-09-13）

[GGG 0.2.0e](https://www.pathofexile.com/forum/view-thread/3754474)确认元素、钢铁等普通符文具有法杖／长杖独立效果；具体效果依然来自已登记 ModRunes.lua 固定快照。当前 [Artificer’s Orb 物品说明转录](https://poe2db.tw/us/Artificers_Orb)顶部列出攻击武器、法杖、长杖和防具，页面下方旧 Ref 不能代替当前物品措辞。物品转录及社区单手／双手 cap 映射按 gray 人工规则证据对待，不加入抓取适配器或复制其数据文件；一手一孔、双手二孔与 caster 类型对应仍是规则推断，真机待验收。GGG 0.3.0 的额外掉落孔说明沿用已有登记。四族四档名称与效果来自原 MIT／官方三服静态来源，没有新增数据包。

数值 cap 的二级依据：[Fextralife Weapons](https://pathofexile2.wiki.fextralife.com/Weapons)单双手通则；不把旧 Mobalytics 页面关于 caster 不可镶嵌的说法作为现行事实。[GGG 0.4.0](https://www.pathofexile.com/forum/view-thread/3883495)具名 Limit 调整与当前四族目录无 limit 的事实共同支持普通四族重复镶嵌，不泛化有数量限制的其他 Rune/Idol/Soul Core。上述均为自有规则的人工证据登记。

### 武器面板公式参考（2026-09-13）

沿用已登记 MIT PoB2 固定提交 `ce566eac45ea8a86477f513c7ee65a1ebe60014e`，人工查阅 `src/Classes/Item.lua` 的本地属性派生公式（2500–2540）与本地修正判定（2423–2450），用自有 TypeScript 数学实现估算武器伤害、攻速、暴击和弩装填时间。仅作 primary 开源模型参考，不新增抓取适配器、不将第三方实现文件入库。公式与舍入是快照模型，游戏当前版本及真机显示待验收；目录 sourceQuality 不代表用户装备品质。

武器属性标题的人工兼容核对另参考 PoE2DB `/us/Makeshift_Crossbow`、`/cn/Makeshift_Crossbow`、`/tw/Makeshift_Crossbow` 公开展示；按既有 gray 来源处理，只登记标题语法，不采纳页面数值、不新增适配器。完整游戏剪贴板真机覆盖仍待验收。

### 多目标路线的交互参考（2026-09-13）

人工查阅 [CoE PoE2 入口](https://beta.craftofexile.com/?game=poe2)、[路线图](https://beta.craftofexile.com/roadmap)和[工具使用说明](https://www.craftofexile.com/how-to-use)，仅参考目标分组、步骤衔接、条件检查与材料展示的交互需求。路线图含未完成条目，默认入口有PoE1上下文，不能把其列表当作PoE2机制证据。本站搜索使用自有算法与既有已登记制作引擎；没有复制CoE代码、数据、权重或新增适配器。此项不生成词典/目录文件，不属于新的游戏数据抓取源。


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
