// 未命中的「人话定位」与跳转。审计 P1-6：现状把 inventory_slots[4].additional_text
// 这种 JSON 路径直接甩给玩家，既不易读也不可点。
import type { FieldWithRows } from './fields'
import { spanText } from './markup'
import type { PairRow } from './rows'

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

export interface MissEntry {
  path: string
  index: number
  domId: string
  /** 「戒指 2 · 第 3 行」 */
  where: string
  /** 未命中的原文正文 */
  text: string
}

export function collectMisses(fields: readonly FieldWithRows[]): MissEntry[] {
  const misses: MissEntry[] = []
  for (const { entry, rows } of fields) {
    for (const row of rows) {
      if (row.status !== 'untranslated') continue
      misses.push({
        path: entry.path,
        index: row.index,
        domId: rowDomId(entry.path, row.index),
        where: `${entry.label} · ${rowLabel(row)}`,
        text: spanText(row.en),
      })
    }
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
