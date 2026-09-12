import type { CatalogBase } from './catalog'
import { matchesGrantedSkillImplicitLines } from './grantedSkills'
import type { CraftResult, CraftState } from './rehearsal'

type Maximum = 1 | 2 | 3
interface ImplicitPatterns {
  patterns: string[]
  charm: null | {
    lineIndex: number
    value: number
    range: null | { min: 1; max: Maximum }
    fixed: boolean
  }
}
const ERROR = '腰带咒符栏或完整固有属性无效；请核对完整高级装备文本。'
export const UNKNOWN_CHARM_RANGE =
  '原文未提供咒符栏位范围，不能使用神圣石；请提供完整高级装备文本。'

/** 只在腰带局部兼容英文复数，不修改通用属性匹配。 */
export function canonicalBeltSlot(line: string): string {
  return line.trim().replace(/ Charm Slots$/, ' Charm Slot')
}

export function isBeltCapacityBase(base: CatalogBase): boolean {
  return base.type === 'Belt' && base.charmLimit !== undefined
}

export function beltBaseError(base: CatalogBase): string | null {
  if (!isBeltCapacityBase(base)) return null
  if (
    base.hidden ||
    base.runeforged ||
    base.variantList !== undefined ||
    base.flask !== undefined ||
    base.charm !== undefined ||
    base.grantedSkillsHaveNoReservation !== undefined
  )
    return '该腰带含隐藏、变体或特殊容量规则，暂不支持制作演练。'
  if (/as though (?:it (?:was|were) )?/i.test(base.implicit ?? ''))
    return '该腰带具有跨部位镶嵌效果规则，暂不支持制作演练。'
  const slots = base.implicit?.split('\n').filter((line) => /Charm Slots?/.test(line)) ?? []
  return base.charmLimit === 0 &&
    slots.length === 1 &&
    /^(?:Has \(1-3\)|Has 1) Charm Slot$/.test(canonicalBeltSlot(slots[0] ?? ''))
    ? null
    : ERROR
}

function maximum(itemLevel: number): Maximum {
  return itemLevel < 30 ? 1 : itemLevel < 60 ? 2 : 3
}
function validLevel(itemLevel: number): boolean {
  return Number.isInteger(itemLevel) && itemLevel >= 1 && itemLevel <= 100
}

export function buildInitialBeltImplicitLines(
  base: CatalogBase,
  itemLevel: number,
  slots: number,
): CraftResult<string[]> {
  if (!isBeltCapacityBase(base) || beltBaseError(base) || !validLevel(itemLevel))
    return { ok: false, error: ERROR }
  const lines = base.implicit?.split('\n') ?? []
  const fixed = lines.some((line) => canonicalBeltSlot(line) === 'Has 1 Charm Slot')
  const max = fixed ? 1 : maximum(itemLevel)
  if (!Number.isInteger(slots) || slots < 1 || slots > max) return { ok: false, error: ERROR }
  return {
    ok: true,
    value: lines.map((line) =>
      /Charm Slots?/.test(line)
        ? fixed
          ? 'Has 1 Charm Slot'
          : `Has ${slots}(1-${max}) Charm Slot`
        : line,
    ),
  }
}

export function resolveCraftImplicitPatterns(
  base: CatalogBase,
  state: Pick<CraftState, 'itemLevel' | 'implicitLines' | 'sourceText'>,
): CraftResult<ImplicitPatterns> {
  const original = base.implicit?.split('\n') ?? []
  if (!isBeltCapacityBase(base)) return { ok: true, value: { patterns: original, charm: null } }
  const fail = (): CraftResult<ImplicitPatterns> => ({ ok: false, error: ERROR })
  if (
    beltBaseError(base) ||
    !validLevel(state.itemLevel) ||
    !Array.isArray(state.implicitLines) ||
    !state.implicitLines.every((line) => typeof line === 'string') ||
    state.implicitLines.length !== original.length
  )
    return fail()
  const fixed = original.some((line) => canonicalBeltSlot(line) === 'Has 1 Charm Slot')
  const slotIndexes = state.implicitLines.flatMap((line, index) =>
    /Charm Slots?/.test(line) ? [index] : [],
  )
  if (slotIndexes.length !== 1) return fail()
  const lineIndex = slotIndexes[0]
  if (lineIndex === undefined) return fail()
  const match = /^Has ([1-3])(?:\(1-([1-3])\))? Charm Slot$/.exec(
    canonicalBeltSlot(state.implicitLines[lineIndex] ?? ''),
  )
  if (!match) return fail()
  const value = Number(match[1])
  const max = match[2] === undefined ? null : (Number(match[2]) as Maximum)
  if (
    fixed
      ? value !== 1 || max !== null
      : value > maximum(state.itemLevel) ||
        (max !== null && (max > maximum(state.itemLevel) || value > max)) ||
        (state.sourceText === null && max !== maximum(state.itemLevel))
  )
    return fail()
  const remaining = original.filter((line) => !/Charm Slots?/.test(line))
  const patterns: string[] = []
  for (const [index, line] of state.implicitLines.entries()) {
    if (index === lineIndex) {
      patterns.push(max === null ? `Has ${value} Charm Slot` : `Has (1-${max}) Charm Slot`)
    } else {
      const found = remaining.findIndex((pattern) =>
        matchesGrantedSkillImplicitLines([pattern], [line]),
      )
      if (found < 0) return fail()
      const pattern = remaining.splice(found, 1)[0]
      if (pattern === undefined) return fail()
      patterns.push(pattern)
    }
  }
  return {
    ok: true,
    value: {
      patterns,
      charm: { lineIndex, value, range: max === null ? null : { min: 1, max }, fixed },
    },
  }
}
