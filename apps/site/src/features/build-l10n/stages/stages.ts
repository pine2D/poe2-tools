// 阶段并排对照的纯模型（2026-10-03 方案 §3.2）：把一次导入的多份 .build 分成“构筑”，
// 每个构筑的文件按天赋点数排成阶段，再按栏位、宝石对齐成行并判定与上一阶段的变化。不碰 DOM。
import {
  gemKey,
  type PreviewName,
  type PreviewSkill,
  type PreviewSlot,
} from '@poe2-tools/build-core'
import { additionalTextAt, type FieldWithRows, slotLabel } from '../preview/fields'
import type { MissEntry } from '../preview/locate'
import { spanText } from '../preview/markup'
import { isMissedRow } from '../preview/rows'
import type { TranslatedFile } from '../translate/runTranslation'

export interface Stage {
  file: TranslatedFile
  /** 列头阶段名：构筑名里“ - ”之前的部分；没有分隔符时用整个名称，再退到文件名 */
  label: string
}

export interface Series {
  key: string
  title: string
  author: string | null
  stages: Stage[]
}

/** added 新出现；changed 基底／宝石不同；modded 同基底但词缀或辅助不同；same 完全相同 */
export type Change = 'added' | 'changed' | 'modded' | 'same'

export interface GearCell {
  slot: PreviewSlot
  /** 判定变化用：传奇名 + 原文备注全文（英文原文，不随界面语言变化） */
  identity: string
  /** 判定“换”用：传奇名 + 备注首行（基底名） */
  base: string
  /** 与上一阶段相比；首列为 null */
  change: Change | null
}

export interface GearRow {
  key: string
  label: string
  inventoryId: string
  slotX: number
  cells: (GearCell | null)[]
}

export interface SkillCell {
  skill: PreviewSkill
  /** 在该阶段 skills 数组里的下标，详情与字段路径用它 */
  index: number
  identity: string
  /** 判定“换”用：主技能宝石键 */
  base: string
  change: Change | null
}

export interface SkillRow {
  key: string
  name: PreviewName
  cells: (SkillCell | null)[]
}

export interface PassiveCount {
  name: PreviewName
  count: number
}

export interface CellName {
  zh: string
  en: string | null
  /** false：词典未收录，zh 位置显示的是英文原文 */
  translated: boolean
}

const SEP = ' - '

/** 游戏装备栏的阅读顺序；不在表里的栏位排在后面，按首次出现 */
export const SLOT_ORDER = [
  'Weapon1',
  'Weapon2',
  'Offhand1',
  'Offhand2',
  'Helm1',
  'BodyArmour1',
  'Gloves1',
  'Boots1',
  'Amulet1',
  'Ring1',
  'Ring2',
  'Belt1',
  'Flask1',
  'Charm1',
] as const

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

export function splitStageName(name: string): { stage: string; series: string | null } {
  const at = name.indexOf(SEP)
  if (at <= 0 || at + SEP.length >= name.length) return { stage: name, series: null }
  return { stage: name.slice(0, at).trim(), series: name.slice(at + SEP.length).trim() }
}

export function seriesKey(file: TranslatedFile): string {
  const link = text(file.input.link)
  if (link !== null) return `link:${link}`
  const author = text(file.input.author)
  const name = text(file.input.name)
  const series = name === null ? null : splitStageName(name).series
  if (author !== null && series !== null) {
    return `series:${author}|${text(file.input.ascendancy) ?? ''}|${series}`
  }
  return `file:${file.id}`
}

export function groupSeries(files: readonly TranslatedFile[]): Series[] {
  const groups = new Map<string, TranslatedFile[]>()
  for (const file of files) {
    const key = seriesKey(file)
    const list = groups.get(key)
    if (list === undefined) groups.set(key, [file])
    else list.push(file)
  }
  return [...groups.entries()].map(([key, list]) => {
    // 天赋点随等级单调增加，是阶段先后最稳的信号；sort 稳定，同数保持导入顺序
    const ordered = [...list].sort((a, b) => a.preview.passives.length - b.preview.passives.length)
    const stages = ordered.map((file) => {
      const name = text(file.input.name)
      return { file, label: name === null ? file.name : splitStageName(name).stage }
    })
    const first = ordered[0]
    const firstName = first === undefined ? null : text(first.input.name)
    const seriesName = firstName === null ? null : splitStageName(firstName).series
    const title = (stages.length > 1 ? seriesName : null) ?? firstName ?? first?.name ?? ''
    return { key, title, author: first === undefined ? null : text(first.input.author), stages }
  })
}

export function slotKey(slot: PreviewSlot): string {
  return `${slot.inventoryId}#${slot.slotX}`
}

function rank(inventoryId: string): number {
  const at = (SLOT_ORDER as readonly string[]).indexOf(inventoryId)
  return at === -1 ? SLOT_ORDER.length : at
}

function changeOf(
  previous: { identity: string; base: string } | null | undefined,
  cell: { identity: string; base: string },
  column: number,
): Change | null {
  if (column === 0) return null
  if (!previous) return 'added'
  if (previous.base !== cell.base) return 'changed'
  return previous.identity === cell.identity ? 'same' : 'modded'
}

function withChanges<C extends { identity: string; base: string; change: Change | null }>(
  cells: readonly (C | null)[],
): (C | null)[] {
  return cells.map((cell, column) =>
    cell === null ? null : { ...cell, change: changeOf(cells[column - 1], cell, column) },
  )
}

export function gearRows(stages: readonly Stage[]): GearRow[] {
  const rows = new Map<string, GearRow>()
  stages.forEach((stage, column) => {
    for (const slot of stage.file.preview.slots) {
      const key = slotKey(slot)
      let row = rows.get(key)
      if (row === undefined) {
        row = {
          key,
          label: slotLabel(slot),
          inventoryId: slot.inventoryId,
          slotX: slot.slotX,
          cells: stages.map(() => null),
        }
        rows.set(key, row)
      }
      // 同一文件里同一格重复出现时只取第一件
      if (row.cells[column] !== null && row.cells[column] !== undefined) continue
      const original = additionalTextAt(stage.file.input.inventory_slots, slot.rawIndex)
      row.cells[column] = {
        slot,
        identity: `${slot.uniqueName ?? ''}\u0000${original ?? ''}`,
        base: `${slot.uniqueName ?? ''}\u0000${(original ?? '').split('\n')[0]}`,
        change: null,
      }
    }
  })
  return [...rows.values()]
    .sort(
      (a, b) =>
        rank(a.inventoryId) - rank(b.inventoryId) ||
        (a.inventoryId === b.inventoryId ? a.slotX - b.slotX : 0),
    )
    .map((row) => ({ ...row, cells: withChanges(row.cells) }))
}

export function skillRows(stages: readonly Stage[]): SkillRow[] {
  const rows = new Map<string, SkillRow>()
  stages.forEach((stage, column) => {
    const seen = new Map<string, number>()
    stage.file.preview.skills.forEach((skill, index) => {
      const gem = gemKey(skill.id)
      const nth = seen.get(gem) ?? 0
      seen.set(gem, nth + 1)
      const key = `${gem}#${nth}`
      let row = rows.get(key)
      if (row === undefined) {
        row = { key, name: skill, cells: stages.map(() => null) }
        rows.set(key, row)
      }
      row.cells[column] = {
        skill,
        index,
        base: gem,
        identity: skill.supports.map((support) => gemKey(support.id)).join(','),
        change: null,
      }
    })
  })
  return [...rows.values()].map((row) => ({ ...row, cells: withChanges(row.cells) }))
}

export function passiveSummary(passives: readonly PreviewName[]): PassiveCount[] {
  const counts = new Map<string, PassiveCount>()
  for (const name of passives) {
    const key = name.text ?? name.en ?? name.id
    const hit = counts.get(key)
    if (hit === undefined) counts.set(key, { name, count: 1 })
    else hit.count += 1
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}

export function slotCellName(slot: PreviewSlot, entry: FieldWithRows | undefined): CellName {
  if (slot.uniqueName !== null) {
    return slot.uniqueText === null
      ? { zh: slot.uniqueName, en: null, translated: false }
      : { zh: slot.uniqueText, en: slot.uniqueName, translated: true }
  }
  const first = entry?.rows[0]
  if (first?.base === true) {
    const en = spanText(first.en)
    if (first.zh === null || isMissedRow(first, true))
      return { zh: en, en: null, translated: false }
    return { zh: spanText(first.zh), en, translated: true }
  }
  return { zh: slotLabel(slot), en: null, translated: slot.label !== null }
}

export function missPrefixes(misses: readonly MissEntry[]): Set<string> {
  const out = new Set<string>()
  for (const miss of misses) {
    const match = /^(inventory_slots|skills)\[(\d+)\]/.exec(miss.path)
    if (match !== null) out.add(`${match[1]}[${match[2]}]`)
  }
  return out
}
