import { isSovereignAffix } from './alloyEffects'
import { inspectCraftAlloys } from './alloys'
import type { CraftCatalog } from './catalog'
import { matchesTargetInterval } from './effectiveTargetValues'
import { renderNumericLines } from './numeric'
import type { CraftState } from './rehearsal'
import type { CraftTargetValues } from './targets'

/** 只用于反解准备数值；实际制作仍必须完整移除、应用与回放。 */
export function sovereignTargetSupport(
  catalog: CraftCatalog,
  state: CraftState,
  values: readonly CraftTargetValues[],
  allowPartial = false,
) {
  if (
    !catalog.alloys ||
    !values.some(
      (goal) =>
        goal.basis === 'effective' &&
        catalog.modifiers.some((mod) => mod.id === goal.modId && mod.tags.includes('resistance')),
    )
  )
    return null
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  const entry =
    base &&
    inspectCraftAlloys(catalog, base).find(
      (item) => item.alloy.id === 'Metadata/Items/Currency/CurrencyVerisiumAlloy9',
    )
  const mod = entry?.mod
  if (!entry || !mod) return null
  const contexts: { state: CraftState; value: number }[] = []
  for (let value = 20; value <= 30; value++) {
    if (
      !allowPartial &&
      values
        .find((goal) => goal.modId === mod.id)
        ?.bounds.some((bound) => !matchesTargetInterval({ min: value, max: value }, bound))
    )
      continue
    const rendered = renderNumericLines(mod.lines, [value])
    if (!rendered.ok) return null
    const affix = { modId: mod.id, lines: rendered.value, crafted: true as const }
    if (!isSovereignAffix(catalog, state, affix, 'resistance')) return null
    contexts.push({
      value,
      state: { ...state, affixes: [...state.affixes.filter((affix) => !affix.crafted), affix] },
    })
  }
  return { alloyId: entry.alloy.id, mod, contexts }
}
