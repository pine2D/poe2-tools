import type { DictIndex } from '../dict/index'
import type { BuildFile, BuildInventorySlot, BuildSkill } from '../format/types'

export interface PreviewName {
  id: string
  en: string | null
  text: string | null
}

export interface PreviewSkill extends PreviewName {
  supports: PreviewName[]
}

export interface PreviewSlot {
  inventoryId: string
  label: string | null
  slotX: number
  uniqueName: string | null
  uniqueText: string | null
  additionalText: string | null
}

export interface PreviewModel {
  ascendancy: {
    code: string
    text: string | null
    classCode: string
    classText: string | null
  } | null
  skills: PreviewSkill[]
  passives: PreviewName[]
  slots: PreviewSlot[]
}

// 宝石 id 的两种前缀（Gems/ 与 Gem/）都归一为末段
export function gemKey(id: string): string {
  const at = id.lastIndexOf('/')
  return at === -1 ? id : id.slice(at + 1)
}

// 升华代号 = 职业名 + 序号（+ 可选改版字母），如 Sorceress3、Witch3b；职业代号取字母前缀
export function classCodeOf(ascendancy: string): string {
  const match = /^([A-Za-z]+?)\d+[a-z]?$/.exec(ascendancy)
  return match?.[1] ?? ascendancy
}

// parseBuildFile 是宽松的，畸形字段会原样进来：只认数组，其他形态一律当空
function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function idOf(entry: unknown): string {
  if (typeof entry === 'string') return entry
  if (entry !== null && typeof entry === 'object') {
    const id = (entry as { id?: unknown }).id
    if (typeof id === 'string') return id
  }
  return ''
}

function gemName(id: string, index: DictIndex): PreviewName {
  const hit = index.gems.get(gemKey(id))
  return { id, en: hit?.en ?? null, text: hit?.text ?? null }
}

function passiveName(id: string, index: DictIndex): PreviewName {
  const hit = index.passives.get(id)
  return { id, en: hit?.en ?? null, text: hit?.text ?? null }
}

function describeSkill(entry: string | BuildSkill, index: DictIndex): PreviewSkill {
  const supports =
    entry !== null && typeof entry === 'object' ? toArray<unknown>(entry.support_skills) : []
  return {
    ...gemName(idOf(entry), index),
    supports: supports.map((s) => gemName(idOf(s), index)),
  }
}

function describeSlot(slot: BuildInventorySlot, index: DictIndex): PreviewSlot {
  const uniqueName = typeof slot.unique_name === 'string' ? slot.unique_name : null
  return {
    inventoryId: typeof slot.inventory_id === 'string' ? slot.inventory_id : '',
    label: index.inventories.get(slot.inventory_id) ?? null,
    slotX: typeof slot.slot_x === 'number' ? slot.slot_x : 0,
    uniqueName,
    uniqueText: uniqueName === null ? null : (index.uniques.get(uniqueName) ?? null),
    additionalText: typeof slot.additional_text === 'string' ? slot.additional_text : null,
  }
}

export function describeBuild(build: BuildFile, index: DictIndex): PreviewModel {
  const code = typeof build.ascendancy === 'string' ? build.ascendancy : null
  return {
    ascendancy:
      code === null
        ? null
        : {
            code,
            text: index.ascendancies.get(code) ?? null,
            classCode: classCodeOf(code),
            classText: index.classes.get(classCodeOf(code)) ?? null,
          },
    skills: toArray<string | BuildSkill>(build.skills).map((s) => describeSkill(s, index)),
    passives: toArray<unknown>(build.passives).map((p) => passiveName(idOf(p), index)),
    slots: toArray<unknown>(build.inventory_slots)
      .filter((s): s is BuildInventorySlot => s !== null && typeof s === 'object')
      .map((s) => describeSlot(s, index)),
  }
}
