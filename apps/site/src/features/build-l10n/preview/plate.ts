// 名称牌与译文提示框共用的纯函数（spec §6.4.3、§6.4.4）：变体判定、适用等级、命中状态。不碰 DOM。
import type { PreviewSlot } from '@poe2-tools/build-core'
import type { FieldWithRows } from './fields'
import { isMissedRow, type PairRow } from './rows'

/** base 名称元素的说明：“基底”类型标签已取消，说明改写在 title 上（B8） */
export const BASE_TITLE = '基底名：写入译文首行'
/** “传奇”类型标签的说明（沿用 mockup 文案） */
export const UNIQUE_TITLE = '传奇名：来自构筑的传奇字段，写入译文首行'
/** 适用等级的说明（B9；国服叫法待真机验收） */
export const LEVEL_TITLE = '构筑规划里该条目适用的角色等级区间'

export type SlotVariant = 'unique' | 'base' | 'collapsed'

/** 装备变体判定（spec §6.4.3，按顺序）：传奇 → 首个渲染行是基底名行 → 其余为折叠 */
export function slotVariant(slot: PreviewSlot, entry: FieldWithRows): SlotVariant {
  if (slot.uniqueName !== null) return 'unique'
  if (entry.rows[0]?.base === true) return 'base'
  return 'collapsed'
}

/** 条目有没有可渲染的备注：条目存在，且 rows 非空或有注入行（spec §6.4.2 引用的 hasText） */
export function hasText(entry: FieldWithRows | undefined): entry is FieldWithRows {
  return entry !== undefined && (entry.rows.length > 0 || entry.injected !== null)
}

/**
 * level_interval 的显示值（spec §6.4.3 第二行第 4 项）：数组为“a–b”，单个整数为“a”，缺失或畸形为 null。
 * parseBuildFile 是宽松的：数组元素可能是字符串或畸形值，只认对象里的数值。
 */
export function levelRange(list: unknown, i: number): string | null {
  if (!Array.isArray(list)) return null
  const entry: unknown = list[i]
  if (entry === null || typeof entry !== 'object') return null
  const interval = (entry as { level_interval?: unknown }).level_interval
  if (typeof interval === 'number') return Number.isInteger(interval) ? `${interval}` : null
  if (!Array.isArray(interval)) return null
  const [from, to] = interval
  if (typeof from !== 'number' || typeof to !== 'number') return null
  return `${from}–${to}`
}

export type ModStatus =
  | { kind: 'none' }
  | { kind: 'ok'; hit: number; total: number }
  | { kind: 'count'; hit: number; total: number }
  | { kind: 'warn'; hit: number; total: number; missed: number }

/**
 * 名称牌第二行的命中状态（spec §6.4.3 第二行第 5 项）：
 * - x/y 只统计该字段的编号词缀行，没有编号词缀时为 none（省略）；
 * - 有未命中时为 warn，missed 是该字段 isMissedRow 的行数；
 * - 全部命中但名称类待核对存在（基底名、传奇名未收录）时不显示 ✓，为 count（B1）；否则为 ok。
 */
export function modStatus(
  rows: readonly PairRow[],
  baseName: boolean,
  nameMissed: boolean,
): ModStatus {
  const mods = rows.filter((row) => row.kind === 'mod')
  if (mods.length === 0) return { kind: 'none' }
  const total = mods.length
  const hit = mods.filter((row) => row.status === 'translated').length
  if (hit < total) {
    return {
      kind: 'warn',
      hit,
      total,
      missed: rows.filter((row) => isMissedRow(row, baseName)).length,
    }
  }
  return nameMissed ? { kind: 'count', hit, total } : { kind: 'ok', hit, total }
}
