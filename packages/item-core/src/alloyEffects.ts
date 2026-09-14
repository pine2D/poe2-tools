import { inspectCraftAlloys } from './alloys'
import type { CatalogMod, CraftCatalog } from './catalog'
import { readCatalogLineValues } from './catalogMatch'
import type { CraftAffix, CraftResult, CraftState } from './rehearsal'

const RULES = {
  resistance: {
    id: 'AlloyEffectOfResistanceMods1',
    kind: 'prefix',
    group: 'ArmourEnchantmentHeistResistanceModifierEffect',
    line: '(20-30)% increased Explicit Resistance Modifier magnitudes',
  },
  socket: {
    id: 'AlloyEffectOfSocketedAugments1',
    kind: 'suffix',
    group: 'LocalSocketItemsEffect',
    line: '(20-30)% increased effect of Socketed Augment Items',
  },
} as const
type Effect = keyof typeof RULES

/** 精确君王映射、属性结构与工艺身份共同授权；不按增效关键词放行。 */
export function isSovereignAffix(
  catalog: CraftCatalog,
  state: CraftState,
  affix: CraftAffix,
  effect: Effect,
): boolean {
  const rule = RULES[effect]
  if (affix.modId !== rule.id || affix.crafted !== true || affix.desecrated || affix.fractured)
    return false
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  const mod =
    base &&
    inspectCraftAlloys(catalog, base).find(
      (entry) => entry.alloy.id === 'Metadata/Items/Currency/CurrencyVerisiumAlloy9',
    )?.mod
  return (
    !!mod &&
    mod.id === rule.id &&
    mod.kind === rule.kind &&
    mod.group === rule.group &&
    mod.lines.length === 1 &&
    mod.lines[0] === rule.line &&
    readCatalogLineValues(mod.lines, affix.lines) !== null
  )
}

export function usesSovereignResistance(state: Pick<CraftState, 'affixes'>): boolean {
  return state.affixes.some((affix) => affix.modId === RULES.resistance.id)
}

/** 不调用 createCraftState，避免状态检查与派生计算相互递归。 */
export function sovereignEffect(
  catalog: CraftCatalog,
  state: CraftState,
  effect: Effect,
): CraftResult<number> {
  const affixes = state.affixes.filter((affix) => affix.modId === RULES[effect].id)
  if (affixes.length === 0) return { ok: true, value: 0 }
  const affix = affixes[0]
  if (
    affixes.length !== 1 ||
    !affix ||
    state.affixes.filter((entry) => entry.crafted).length !== 1 ||
    !isSovereignAffix(catalog, state, affix, effect)
  )
    return { ok: false, error: '君王合金增效身份或来源无效。' }
  const value = readCatalogLineValues([RULES[effect].line], affix.lines)?.flat()[0]
  if (value === undefined || value === null)
    return { ok: false, error: '君王合金增效实际掷值未知。' }
  return Number.isInteger(value) && value >= 20 && value <= 30
    ? { ok: true, value }
    : { ok: false, error: '君王合金增效必须是 20–30 的整数。' }
}

export function sovereignResistanceEffect(
  catalog: CraftCatalog,
  state: CraftState,
  mod: CatalogMod,
): CraftResult<number> {
  return mod.tags.includes('resistance')
    ? sovereignEffect(catalog, state, 'resistance')
    : { ok: true, value: 0 }
}
