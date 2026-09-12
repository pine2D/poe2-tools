// 未命中的「人话定位」与跳转。审计 P1-6：现状把 inventory_slots[4].additional_text
// 这种 JSON 路径直接甩给玩家，既不易读也不可点。

import type { TranslatedFile } from '../translate/runTranslation'
import type { FieldWithRows } from './fields'
import { slotLabel } from './fields'
import { spanText } from './markup'
import type { PairRow } from './rows'
import { isMissedRow } from './rows'

// 路径 → 合法 id。inventory_slots[3].additional_text → line-inventory-slots-3-additional-text
export function domIdFor(path: string): string {
  const slug = path.replace(/[^0-9a-zA-Z]+/g, '-').replace(/^-+|-+$/g, '')
  return `line-${slug}`
}

export function rowDomId(path: string, index: number): string {
  return `${domIdFor(path)}-${index}`
}

// 编号行按作者写的标号叫「第 3 行」，非编号行按字段内行号叫
export function rowLabel(row: PairRow): string {
  return `第 ${row.marker ?? row.index + 1} 行`
}

export type PreviewSection = 'gear' | 'skills' | 'passives'
export function sectionFor(path: string): PreviewSection {
  return path.startsWith('skills[') ? 'skills' : path.startsWith('passives[') ? 'passives' : 'gear'
}

export interface MissEntry {
  kind: 'mod' | 'base' | 'unique'
  section: PreviewSection
  path: string
  index: number
  domId: string
  /** 「戒指 2 · 第 3 行」 */
  where: string
  /** 未命中的原文正文 */
  text: string
}

export function collectMisses(
  fields: readonly FieldWithRows[],
  preview?: TranslatedFile['preview'],
): MissEntry[] {
  const misses: MissEntry[] = []
  for (const { entry, rows } of fields) {
    for (const row of rows) {
      if (!isMissedRow(row, entry.baseName)) continue
      misses.push({
        kind: row.status === 'untranslated' ? 'mod' : 'base',
        section: sectionFor(entry.path),
        path: entry.path,
        index: row.index,
        domId: rowDomId(entry.path, row.index),
        where: `${entry.label} · ${rowLabel(row)}`,
        text: spanText(row.en),
      })
    }
  }
  for (const slot of preview?.slots ?? []) {
    if (slot.uniqueName === null || slot.uniqueText !== null) continue
    const path = `inventory_slots[${slot.rawIndex}].unique_name`
    misses.push({
      kind: 'unique',
      section: 'gear',
      path,
      index: -1,
      domId: domIdFor(path),
      where: `${slotLabel(slot)} · 传奇名`,
      text: slot.uniqueName,
    })
  }
  return misses
}

// 跳转：滚到视口中间并把焦点移过去，键盘用户跳过去之后 Tab 能从那一行继续。
// 目标行带 tabIndex={-1}，所以 focus() 可用但不进 Tab 序列。
export function jumpTo(domId: string): void {
  const node = document.getElementById(domId)
  if (node === null) return
  node.scrollIntoView({ block: 'center' })
  node.focus()
}
