import { resolveCraftImplicitPatterns } from './beltImplicits'
import { clonePendingDesecration, type PendingDesecration } from './boneRules'
import type { CraftCatalog } from './catalog'
import { readCatalogLineValues } from './catalogMatch'
import { readNumericValues } from './numeric'
import { type CraftRarity, type CraftResult, type CraftState, createCraftState } from './rehearsal'

export interface CraftNumericChange {
  index: number
  before: number | null
  after: number | null
}

export interface CraftLineChange {
  beforeLines: string[]
  afterLines: string[]
  numeric: CraftNumericChange[]
}

export interface CraftAffixChange {
  modId: string
  kind: 'added' | 'removed' | 'changed'
  beforeLines: string[] | null
  afterLines: string[] | null
  numeric: CraftNumericChange[]
  crafted?: { before: boolean; after: boolean }
  desecrated?: { before: boolean; after: boolean }
}

export interface CraftComparison {
  pendingDesecration?: { before: PendingDesecration | null; after: PendingDesecration | null }
  rarity: { before: CraftRarity; after: CraftRarity } | null
  affixes: CraftAffixChange[]
  implicit: CraftLineChange | null
  socketCount?: { before: number; after: number }
  sockets?: {
    socketIndex: number
    beforeId: string | null
    afterId: string | null
    beforeLines: string[] | null
    afterLines: string[] | null
  }[]
}

function samePendingDesecration(
  before: PendingDesecration | undefined,
  after: PendingDesecration | undefined,
): boolean {
  if (before === after) return true
  if (
    !before ||
    !after ||
    before.boneId !== after.boneId ||
    before.kind !== after.kind ||
    before.directionOmen !== after.directionOmen ||
    before.lichOmen !== after.lichOmen
  )
    return false
  const previous = before.options
  const next = after.options
  return (
    previous === next ||
    (previous !== undefined &&
      next !== undefined &&
      previous.length === next.length &&
      previous.every((id, index) => id === next[index]))
  )
}

function comparableValues(patterns: readonly string[], lines: readonly string[]) {
  const result = readNumericValues(patterns, lines)
  // 生成门禁（如授予技能）不妨碍读取已识别原文；无法识别时不推断差值。
  return result.ok ? result.value : (readCatalogLineValues(patterns, lines)?.flat() ?? null)
}

function compareLines(
  patterns: readonly string[],
  beforeLines: readonly string[],
  afterLines: readonly string[],
): CraftLineChange | null {
  const before = comparableValues(patterns, beforeLines)
  const after = comparableValues(patterns, afterLines)
  if (before === null || after === null) return null
  const numeric: CraftNumericChange[] = before.flatMap((value, index) => {
    const next = after[index]
    return next === undefined || value === next ? [] : [{ index, before: value, after: next }]
  })
  return numeric.length === 0
    ? null
    : { beforeLines: [...beforeLines], afterLines: [...afterLines], numeric }
}

/** 比较可识别的属性语义，不合计面板，也不把数值增大解释为收益。 */
export function compareCraftStates(
  catalog: CraftCatalog,
  before: CraftState,
  after: CraftState,
): CraftResult<CraftComparison> {
  if (
    before.baseId !== after.baseId ||
    before.itemLevel !== after.itemLevel ||
    before.sourceText !== after.sourceText ||
    JSON.stringify(before.runeSourceLines) !== JSON.stringify(after.runeSourceLines)
  )
    return { ok: false, error: '只能对比相同基底、物等和来源起点的装备状态。' }
  const checkedBefore = createCraftState(catalog, before)
  if (!checkedBefore.ok) return checkedBefore
  const checkedAfter = createCraftState(catalog, after)
  if (!checkedAfter.ok) return checkedAfter

  const previous = new Map(before.affixes.map((affix) => [affix.modId, affix]))
  const next = new Map(after.affixes.map((affix) => [affix.modId, affix]))
  const modifiers = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  const affixes: CraftAffixChange[] = []
  for (const affix of before.affixes) {
    const current = next.get(affix.modId)
    if (current === undefined) {
      affixes.push({
        modId: affix.modId,
        kind: 'removed',
        beforeLines: [...affix.lines],
        afterLines: null,
        numeric: [],
      })
      continue
    }
    const change = compareLines(modifiers.get(affix.modId)?.lines ?? [], affix.lines, current.lines)
    const crafted =
      affix.crafted !== current.crafted
        ? { before: affix.crafted === true, after: current.crafted === true }
        : undefined
    const desecrated =
      affix.desecrated !== current.desecrated
        ? { before: affix.desecrated === true, after: current.desecrated === true }
        : undefined
    if (change !== null || crafted !== undefined || desecrated !== undefined)
      affixes.push({
        modId: affix.modId,
        kind: 'changed',
        beforeLines: [...affix.lines],
        afterLines: [...current.lines],
        numeric: change?.numeric ?? [],
        ...(crafted === undefined ? {} : { crafted }),
        ...(desecrated === undefined ? {} : { desecrated }),
      })
  }
  for (const affix of after.affixes) {
    if (!previous.has(affix.modId))
      affixes.push({
        modId: affix.modId,
        kind: 'added',
        beforeLines: null,
        afterLines: [...affix.lines],
        numeric: [],
      })
  }
  const base = catalog.bases.find((base) => base.id === before.baseId)
  if (!base) return { ok: false, error: '基底不存在。' }
  const implicit = resolveCraftImplicitPatterns(base, before)
  if (!implicit.ok) return implicit
  const patterns = implicit.value.patterns
  if ((before.sockets === undefined) !== (after.sockets === undefined))
    return { ok: false, error: '只能对比孔位来源一致的制作状态。' }
  const socketCount =
    before.sockets !== undefined &&
    after.sockets !== undefined &&
    before.sockets.length !== after.sockets.length
      ? { before: before.sockets.length, after: after.sockets.length }
      : undefined
  const augments = new Map(catalog.augments?.map((augment) => [augment.id, augment]))
  const sockets = (before.sockets ?? []).flatMap((beforeId, socketIndex) => {
    // 仅比较两侧真实存在的共同孔；新增或移除孔由 socketCount 表示。
    const afterId = after.sockets?.[socketIndex]
    if (afterId === undefined) return []
    return beforeId === afterId
      ? []
      : [
          {
            socketIndex,
            beforeId,
            afterId,
            beforeLines: beforeId === null ? null : [...(augments.get(beforeId)?.lines ?? [])],
            afterLines: afterId === null ? null : [...(augments.get(afterId)?.lines ?? [])],
          },
        ]
  })
  return {
    ok: true,
    value: {
      rarity:
        before.rarity === after.rarity ? null : { before: before.rarity, after: after.rarity },
      affixes,
      ...(samePendingDesecration(before.pendingDesecration, after.pendingDesecration)
        ? {}
        : {
            pendingDesecration: {
              before: before.pendingDesecration
                ? clonePendingDesecration(before.pendingDesecration)
                : null,
              after: after.pendingDesecration
                ? clonePendingDesecration(after.pendingDesecration)
                : null,
            },
          }),
      ...(socketCount === undefined ? {} : { socketCount }),
      ...(sockets.length > 0 ? { sockets } : {}),
      implicit: compareLines(
        patterns,
        before.implicitLines ?? patterns,
        after.implicitLines ?? patterns,
      ),
    },
  }
}
