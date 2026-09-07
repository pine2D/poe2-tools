# 数据源登记表

新增任何数据源前先在此登记。等级定义：

- **primary**：官方接口、官方导出，或明确开源许可（MIT 等）的仓库数据。默认启用。
- **gray**：内容可公开访问但没有明确的再分发授权。适配器必须带总开关、限速、标识性 User-Agent，
  产物单独成文件（`*.gray.json`），能整体下线。
- **禁止**：专有许可、无 LICENSE 的第三方翻译产物、客户端解包产物。只允许学习结构，文件不进仓库。

## primary

| 来源 | 覆盖 | 语言 | 稳定 id | 获取 | 许可与限制 |
|---|---|---|---|---|---|
| `https://www.pathofexile.com/api/trade2/data/stats` `/items` `/static` | 词缀模板（8213 条 stat）、物品基底与传奇名、通货 | en | stat 有 `explicit.stat_<hash>`；items 无 id | 构建期 HTTP GET，无鉴权；需标识性 UA | GGG ToS 7f 禁数据采集工具，无第三方工具豁免；robots.txt disallow `/api/`；无 CORS。只在构建期低频抓取 |
| `https://poe.game.qq.com/api/trade2/data/*` | 同上 | zh-CN | 与国际服同一套 stat id（交集 90.8%，缺失集中在 fractured / crafted 分组） | 同上 | 腾讯《游戏许可及服务协议》第六章禁"制作发布传播"第三方软件；国服版本滞后国际服约一周 |
| `https://pathofexile.tw/api/trade2/data/*` | 同上 | zh-TW | 同一套 stat id（5841 条） | 同上 | 同 GGG ToS |
| `grindinggear/poe2-skilltree-export` | 天赋树节点（数字 id、英文名、位置） | en | 数字 nodeId | GitHub Release | GGG 官方唯一静态导出，无语言参数 |
| `PathOfBuildingCommunity/PathOfBuilding-PoE2` `src/Data/`、`src/TreeData/` | 宝石 `gameId` → 英文名、基底表、传奇表、天赋 id 对照 | en | 宝石 gameId、天赋 nodeId | git，跟 `dev` 分支（Release 落后） | MIT；MIT 不能处分 GGG 游戏内容的权利 |
| `repoe-fork/poe2` | PassiveSkills 字符串 id ↔ 数字 id、宝石元数据、基底 | en（多语言字段目前为空） | dat64 Id | git | 工具 MIT；数据版权归 GGG。用于把 `.build` 的字符串 id 对到名称 |

## gray

| 来源 | 覆盖 | 语言 | 获取 | 风险 | 开关 |
|---|---|---|---|---|---|
| `poe2db.tw/cn/`、`/tw/` | 天赋节点中文名与说明、宝石中文名与描述、词缀整句 | zh-CN、zh-TW（各自独立翻译） | HTML 抓取；天赋树有非文档化 JSON 端点 | robots.txt 允许，但无 LICENSE / ToS；wiki 文章 CC BY-NC-SA 3.0，数据库页未明确 | `DICT_ENABLE_POE2DB`，默认开，可关 |

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
| `data/dict/<locale>/ascendancies.json` | 升华代号（`Warrior1` 等）→ 职业与升华显示名 |
| `data/dict/<locale>/inventories.json` | `inventory_id` → 槽位显示名 |
| `data/dict/rules/trade-suffixes.json` | 交易站专有消歧后缀名单（zh-CN：区域 / 珠宝 / 全域 / 金币堆 / 咒符 / 药剂），匹配后剥离 |

## 更新节奏

- 国际服大版本前 PoB2 `dev` 分支通常已预适配；国服交易站滞后约一周。词典更新以国服 API 跟上为准。
- 每次更新记录 `meta.json`：游戏版本、抓取时间、各来源条目数与哈希、启用的适配器。
