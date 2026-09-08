# 数据源登记表

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
| `repoe-fork/poe2` | passive_skill_trees/Default.json（PassiveSkills 字符串 id ↔ 数字 hash ↔ 英文名）、data/skill_gems.json（gameId ↔ 英文显示名，作为 gems 词典的键与 poe2db 校验锚点）、基底 | en（多语言字段目前为空） | dat64 Id | raw.githubusercontent.com/repoe-fork/poe2/master 下的 data/passive_skill_trees/Default.json 与 data/skill_gems.json，构建期 GET、按日缓存 | 工具 MIT；数据版权归 GGG。用于把 `.build` 的字符串 id 对到名称 |

## gray

| 来源 | 覆盖 | 语言 | 获取 | 风险 | 开关 |
|---|---|---|---|---|---|
| `poe2db.tw/us/`、`/cn/`、`/tw/`；`cdn.poe2db.tw`（天赋树 bundle） | 天赋节点中文名、宝石中文名、物品基底与传奇中文名；/us/ 页英文名仅作 join 校验锚点，不进词典 | en（us，仅校验）、zh-CN、zh-TW（各自独立翻译） | 天赋树 JSON：/data/passive-skill-tree/<模板版本>/data_{cn,tw}.json?5，模板版本从 /cn/passive-skill-tree 页面引用的 bundle 里解析（当前 4.5），解析失败回退写死值并告警；物品 / 宝石中文名：列表页 /{us,cn,tw}/Gem、/Unique_item 与 31 个装备分类页（Amulets … Wands，名单在 packages/dict-builder/src/config.ts，按 trade2 en /items 装备类分组反查得到的最小完备名单），按站内 slug 对齐，us 页英文名与 primary 源规范名逐字符相等才采纳；只抓列表页不抓详情页，所有 poe2db 请求串行、相邻请求 ≥ 1.5 s、按日缓存（列表页缓存约 80 MB / 天），全新构建 99 页（2026-09-07 压测 81 页无限流） | robots.txt 仅 Allow: /；无 LICENSE / ToS；wiki 文章 CC BY-NC-SA 3.0，数据库页未明确 | `DICT_ENABLE_POE2DB`，默认开，可关 |

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

## 更新节奏

- 国际服大版本前 PoB2 `dev` 分支通常已预适配；国服交易站滞后约一周。词典更新以国服 API 跟上为准。
- 每次更新记录 `meta.json`：游戏版本、抓取时间、各来源条目数与哈希、启用的适配器。
- 三服内容版本可能不同（如国际服 0.5.5 时国服仍 0.5），构建前先更新 `_overrides/versions.json`；每次构建把审计计数（重复 id、占位符不一致、键冲突、residualSuffix）写入 meta.json，突变即人工复核；交易站消歧后缀名单在 packages/dict-builder/src/adapters/tradeSuffix.ts，residualSuffix 非空时更新它。
