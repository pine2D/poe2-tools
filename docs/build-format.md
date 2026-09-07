# `.build` 格式速查

权威来源：GGG 开发者文档「Build Planner (PoE2 only)」一节
（https://www.pathofexile.com/developer/docs/game#buildplanner ）。本文用自己的话归纳规范，
并补充从真实导出样本观察到的惯例。规范版本为 **1（Experimental）**，官方声明可能变动；
本仓库的解析器必须无损保留未知字段。

## 1. 文件与目录

- 纯 JSON（UTF-8），扩展名 `.build`，根是单个 Build 对象。
- 游戏的 File Watcher 监视 `Documents/My Games/Path of Exile 2/BuildPlanner/`
  （Windows 默认 `C:/Users/<用户名>/Documents/My Games/Path of Exile 2/BuildPlanner`）；
  文件放入即生效，无效 JSON 会被静默忽略。
- 也可在 pathofexile2.com 账号页上传（第三方转换器 README 提到，未实测）。
- 官方定位是"导入第三方 build 供游戏内参考"，游戏内不能编辑。Meta gem 目前不支持。

## 2. 对象定义

`?` 表示可选。

### Build（根）

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 必填。显示标题，游戏内约 40 字符后截断（社区观察，CJK 未验证） |
| `author` | ?string | 作者 |
| `link` | ?string | 来源链接（Mobalytics 导出带此字段） |
| `description` | ?string | 描述，支持标记语法 |
| `ascendancy` | ?string | 升华代号，如 `Mercenary3`、`Sorceress3`、`Warrior1`：职业名 + 升华序号 |
| `passives` | ?array | 元素为 string（节点 id）或 BuildPassive |
| `skills` | ?array | 元素为 string（宝石 id）或 BuildSkill |
| `inventory_slots` | ?array | 元素为 BuildInventorySlot |

### BuildPassive

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | PassiveSkills 表的字符串 id，如 `strength89`、`jewel_slot1975`、`AscendancyWarrior1Notable4`；可带尾下划线（`dexterity30_`） |
| `level_interval` | ?(array of uint 或 uint) | 等级区间 `[min, max]` |
| `weapon_set` | ?uint | 0–2，武器组 |
| `additional_text` | ?string | 悬停节点时显示 |

### BuildSkill / BuildSupport

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | BaseItemTypes 表 id。**两种前缀并存**：`Metadata/Items/Gems/...` 与 `Metadata/Items/Gem/...`，解析时都要认 |
| `level_interval` | ?(array of uint 或 uint) | 等级区间 |
| `additional_text` | ?string | 宝石面板里显示 |
| `support_skills` | ?array | 仅 BuildSkill 有；元素为 string 或 BuildSupport |

### BuildInventorySlot

| 字段 | 类型 | 说明 |
|---|---|---|
| `inventory_id` | string | Inventories 表 id。样本中出现：`Weapon1`、`Weapon2`、`Offhand1`、`Helm1`、`BodyArmour1`、`Gloves1`、`Boots1`、`Amulet1`、`Ring1`、`Ring2`、`Belt1`、`Flask1`、`Charm1` |
| `slot_x` / `slot_y` | ?uint | 网格坐标，默认 0；药剂与魔符用 `slot_x` 区分第几格（样本：Flask1 x=0/1，Charm1 x=0/1/2） |
| `level_interval` | ?(array of uint 或 uint) | 该装备建议的等级区间 |
| `unique_name` | ?string | Words 表里的传奇物品名（英文）。**是查找键，不可翻译** |
| `additional_text` | ?string | 悬停槽位时显示 |

## 3. 标记语法（`additional_text` 与 `description`）

形式为 `<关键字>{文本}`，可嵌套，如 `<m>{<red>{Strength +5 is recommended}}`。

| 类别 | 关键字 |
|---|---|
| 字形 | `r` 常规、`b` 粗体、`i` 斜体、`u` 下划线 |
| 字号 | `s` 小、`m` 中、`l` 大 |
| 命名颜色 | `red` `orange` `yellow` `green` `blue` `indigo` `violet` `black` `white` `grey` `bronze` `silver` `gold` `unique` |
| 自定义颜色 | `<rgb(255, 255, 255)>{...}` |

官方未说明转义规则与嵌套深度上限。本仓库策略：分词器按 `<tag>{` 与配对的 `}` 切分；配对失败时
整段按纯文本处理，不抛错。

## 4. 真实导出惯例（13 份 Mobalytics 样本，0.5.5）

- `additional_text` 只出现在 `inventory_slots`，宝石与天赋上没有；无任何标记语法；无 `description`。
- rare / magic / normal 装备：`additional_text` 首行是**基底名**（如 `Runeforged Cryptic Crown`），
  其后每行 `N. 词缀文本`，数值已是具体值（`+175 to maximum Life`、`Adds 2 to 4 Physical Damage to Attacks`、
  `+4.4% to Critical Hit Chance`）。样本共 284 行词缀，全部为编号行，去数字归一化后 52 个模板。
- 传奇装备：只有 `unique_name`，没有 `additional_text` 与 `level_interval`。
- 分阶段攻略拆成多个文件（`Act 1 & 2`、`lvl 15-32`…），每个文件是独立完整的 Build。
- `passives` 元素既有 string 也有 `{ "id": ... }` 对象，两种混用。
- `level_interval` 几乎都是 `[min, 100]`。

## 5. 本仓库的翻译字段清单

| 字段 | 处理 |
|---|---|
| `inventory_slots[].additional_text` | **翻译**：首行按基底名 / 传奇名词典精确匹配；编号行走词缀模板匹配并回填数值；其余行保留 |
| `description`、`skills[].additional_text`、`passives[].additional_text` | **翻译**其中能识别的术语行（同上规则），自由文本保留 |
| `inventory_slots[].unique_name` | 不改；可选在 `additional_text` 前置一行中文传奇名 |
| `name`、`author`、`link` | 不改 |
| 所有 `id`、`inventory_id`、`level_interval`、`slot_x`、`slot_y`、`weapon_set` | 不改 |
| 未知字段 | 原样保留，顺序不变 |

宝石名、天赋名、升华名、槽位名只用于**预览页**显示，不写回文件：中文客户端本身会以本地语言显示它们。

## 6. 待真机验证

- 国际服 / 国服客户端是否渲染 `additional_text` 里的 CJK 字符。
- `name` 的 40 字符截断对 CJK 如何计数。
- 国服客户端加载 `unique_name` 时按英文还是本地化名匹配。
- 官方文档未列出的 `inventory_id` 全集（`Weapon2`、`Offhand1`、`Flask1`、`Charm1` 来自样本，尚未与
  Inventories 表核对）。
