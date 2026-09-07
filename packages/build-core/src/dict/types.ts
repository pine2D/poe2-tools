// 词典文件的结构。生成方：packages/dict-builder；消费方：本库。
// 每个表带 _meta 以追溯来源（docs/data-sources.md）。

export type Locale = 'zh-CN' | 'zh-TW'

export interface DictMeta {
  source: string
  tier: 'primary' | 'gray' | 'manual'
  gameVersion: string
  fetchedAt: string
  count: number
}

// en：英文模板（数字为 '#'）；text：目标语言模板（交易站消歧后缀已在生成期剥离）
// order：可选，声明占位符取值顺序——译文模板第 k 个 '#' 取源行第 order[k] 个数字（0 起）；
// 缺省按源行数字的出现顺序回填。
export interface StatEntry {
  id: string
  en: string
  text: string
  order?: readonly number[]
}

export interface StatsDict {
  _meta: DictMeta
  entries: StatEntry[]
}

// 键为英文规范名
export interface ItemsDict {
  _meta: DictMeta
  bases: Record<string, string>
  uniques: Record<string, string>
}

export interface NamedEntry {
  en: string
  text: string
}

// 宝石：键为 gameId 末段（SkillGemFlameblast）；天赋：键为 PassiveSkills id（strength16）
export interface NamedDict {
  _meta: DictMeta
  entries: Record<string, NamedEntry>
}

// 升华代号 → 显示名；inventory_id → 槽位名
export interface NamesTable {
  _meta: DictMeta
  entries: Record<string, string>
}

export interface DictBundle {
  locale: Locale
  stats?: StatsDict
  items?: ItemsDict
  gems?: NamedDict
  passives?: NamedDict
  ascendancies?: NamesTable
  inventories?: NamesTable
  // 职业代号（升华代号去掉尾部序号，如 Sorceress）→ 职业名
  classes?: NamesTable
}
