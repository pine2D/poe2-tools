// 阶段看板的共享类型与纯函数（无 JSX），供 StageBoard 及其子件共用
import type { PreviewName } from '@poe2-tools/build-core'
import { cx } from '../../../../shared/components/Motif'
import type { FieldWithRows } from '../../preview/fields'
import type { Change } from '../stages'

/** 当前展开的格子：装备格按槽位原始序号定位，技能格按技能序号定位 */
export type Focus =
  | { id: string; rowKey: string; fileId: string; title: string; kind: 'slot'; rawIndex: number }
  | { id: string; rowKey: string; fileId: string; title: string; kind: 'skill'; index: number }

/** fileId → (字段路径 → 字段) */
export type FieldMaps = ReadonlyMap<string, ReadonlyMap<string, FieldWithRows>>

// “新”“换”有标记字与刻痕；“改”（同一件改了词缀或辅助）不加标记字，只在 aria 与铜色词缀数上体现
const MARK: Record<'added' | 'changed', { text: string; label: string }> = {
  added: { text: '新', label: '本阶段新增' },
  changed: { text: '换', label: '换了另一件' },
}
export const PASSIVE_TOP = 8

export function markOf(change: Change | null) {
  return change === 'added' || change === 'changed' ? MARK[change] : null
}

export function suffixOf(change: Change | null, modded: string): string {
  const mark = markOf(change)
  if (mark !== null) return `（${mark.label}）`
  return change === 'modded' ? modded : ''
}

export function modCount(entry: FieldWithRows | undefined): number {
  return entry?.rows.filter((row) => row.kind === 'mod').length ?? 0
}

export function slotPath(rawIndex: number): string {
  return `inventory_slots[${rawIndex}].additional_text`
}

// 天赋点数相对前一阶段的增减：非负写“+d”，负数写数学负号“−”加绝对值
export function passiveDelta(delta: number): string {
  return delta >= 0 ? `（+${delta}）` : `（−${-delta}）`
}

/** 格子按钮类名：装备格与技能格共用 */
export function cellClass(change: Change | null, missed: boolean): string {
  return cx(
    'stageboard__cell',
    change !== null && change !== 'same' && `stageboard__cell--${change}`,
    missed && 'stageboard__cell--miss',
  )
}

/** 装备格词缀数：“改”写前后词缀数（铜色），其余有词缀时写词缀数；都不是返回 null */
export function modsNote(
  change: Change | null,
  prevMods: number,
  mods: number,
): { className: 'stageboard__delta' | 'stageboard__count'; text: string } | null {
  if (change === 'modded') {
    return {
      className: 'stageboard__delta',
      text:
        prevMods === mods
          ? mods === 0
            ? '已改'
            : `词缀 ${mods}（已改）`
          : `词缀 ${prevMods}→${mods}`,
    }
  }
  if (mods > 0) return { className: 'stageboard__count', text: `词缀 ${mods}` }
  return null
}

/** 名称显示文本：优先译名，其次英文，最后内部 ID */
export function displayName(name: Pick<PreviewName, 'text' | 'en' | 'id'>): string {
  return name.text ?? name.en ?? name.id
}
